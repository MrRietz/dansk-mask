// Authoritative, deterministic-ish game simulation. No DOM, no timers: call update() at a fixed DT.
// Input arrives only through command(); output is state plus the `events` list the client drains.
// The same class is meant to run in a Node WebSocket server later.
import { Rng } from './rng.mjs';
import { generateTerrain, findSpawns, resolveLayout } from './maps.mjs';
import { moveBody, stepRocket, groundStep, snapDown, unstick, launchVector } from './physics.mjs';
import { WEAPONS, WEAPON_ORDER, startingAmmo, blast } from './weapons.mjs';
import { OBJECT_TYPES, TURN_HOOKS } from './registry.mjs';
import './status.mjs';
import { AiBrain } from './ai.mjs';
import {
  DT, GRAVITY, WORM_R, AIM_RATE, AIM_MAX, CHARGE_TIME, WALK_SPEED, FALL_SAFE_SPEED, KNOCKBACK, KNOCK_LIFT, KNOCK_MAX,
  DEFAULT_SETTINGS, TEAM_COLORS, WORM_NAMES,
} from './constants.mjs';

const SPRING_JUMP_WINDOW = 0.35; // s after take-off in which a second key press upgrades the jump

export class Game {
  constructor(config = {}) {
    this.cfg = { ...DEFAULT_SETTINGS, ...(config.settings || {}) };
    this.seed = config.seed ?? 1;
    this.rng = new Rng((this.seed + 7919) >>> 0);
    this.layout = resolveLayout(this.cfg.layout, this.seed);
    const { terrain, waterY } = generateTerrain(this.seed, this.cfg.worldW, this.cfg.worldH, this.cfg.waterMargin, this.layout);
    this.terrain = terrain;
    this.waterY = waterY;
    this.events = [];
    this.queue = [];
    this.tick = 0;
    this.time = 0;
    this.nextId = 1;
    this.worms = [];
    this.objects = [];
    this.crates = [];
    this.teams = [];
    this.ai = {};
    this.wind = 0;
    this.round = 1;
    this.sudden = false;
    this.turnNumber = 0;
    this.winner = null;
    this.phase = 'turn';
    this.phaseTime = 0;

    const defs = config.teams?.length ? config.teams : [{ name: 'Player' }, { name: 'Bot', ai: true }];
    const spawns = findSpawns(terrain, new Rng((this.seed + 101) >>> 0), defs.length * this.cfg.wormsPerTeam, waterY, this.layout === 'islands' ? 0 : 8);
    this.rng.shuffle(spawns);
    const names = this.rng.shuffle([...WORM_NAMES]);
    defs.forEach((d, id) => {
      this.teams.push({
        id, name: d.name, color: d.color || TEAM_COLORS[id % TEAM_COLORS.length], ai: !!d.ai,
        ammo: startingAmmo(), lastWorm: -1,
      });
      if (d.ai) this.ai[id] = new AiBrain(id, d.level || 'normal');
    });
    for (let i = 0; i < this.cfg.wormsPerTeam; i++) {
      for (const team of this.teams) {
        const s = spawns.pop() || { x: 100 + this.worms.length * 60, y: 50 };
        this.worms.push({
          id: this.worms.length, team: team.id, name: names.pop() || 'Worm', x: s.x, y: s.y, vx: 0, vy: 0,
          r: WORM_R, hp: this.cfg.wormHp, state: 'ground', alive: true, dir: s.x < terrain.w / 2 ? 1 : -1,
          aim: 0.2, walkAcc: 0, turnCd: 0, walking: false, rope: null, noFall: false,
          airT: 0, jumped: false, custom: null, poison: 0, frozen: false,
        });
      }
    }
    this.order = this.teams.map((t) => t.id);
    this.curIdx = -1;
    this.turn = null;
    this.startTurn(this.nextTeamIdx());
  }

  // ---------- helpers ----------
  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }
  command(c) {
    this.queue.push(c);
  }
  activeWorm() {
    return this.turn ? this.worms[this.turn.worm] : null;
  }
  ammo(team, id) {
    return this.teams[team].ammo[id] ?? 0;
  }
  teamAlive(t) {
    return this.worms.some((w) => w.alive && w.team === t);
  }
  wormAt(x, y, excludeId = -1, pad = 0) {
    for (const w of this.worms) {
      if (w.alive && w.id !== excludeId && (w.x - x) ** 2 + (w.y - y) ** 2 < (w.r + pad) ** 2) return w;
    }
    return null;
  }
  setPhase(p) {
    this.phase = p;
    this.phaseTime = 0;
  }
  // Adds an object (projectile, walker, strike ...) to the world and returns it.
  spawn(o) {
    o.id = this.nextId++;
    this.objects.push(o);
    return o;
  }
  runHooks(name) {
    for (const h of TURN_HOOKS) h[name]?.(this);
  }

  // ---------- turn flow ----------
  nextTeamIdx() {
    for (let i = 1; i <= this.order.length; i++) {
      const idx = (this.curIdx + i) % this.order.length;
      if (this.teamAlive(this.order[idx])) {
        if (idx <= this.curIdx) this.round++;
        return idx;
      }
    }
    return this.curIdx;
  }

  startTurn(idx) {
    this.curIdx = idx;
    const team = this.teams[this.order[idx]];
    const alive = this.worms.filter((w) => w.alive && w.team === team.id);
    const next = alive.find((w) => w.id > team.lastWorm) || alive[0];
    team.lastWorm = next.id;
    this.turnNumber++;
    this.wind = this.rng.range(-1, 1);
    if (this.round > this.cfg.suddenDeathRound) {
      if (!this.sudden) {
        this.sudden = true;
        for (const w of this.worms) if (w.alive) w.hp = 1;
        this.emit('suddenDeath');
      }
      this.waterY = Math.max(200, this.waterY - 24);
      this.emit('waterRise');
    }
    this.turn = {
      team: team.id, worm: next.id, time: this.cfg.turnTime, weapon: this.turn?.team === team.id ? this.turn.weapon : 'bazooka',
      fuse: 3, power: 0, charging: false, fired: false, hurt: false, cool: 0, shots: 0, burst: null,
      girder: 2, crateDone: false, input: { l: 0, r: 0, u: 0, d: 0 },
      marker: null, canSwitch: false, strikeDir: 0, bounce: 1,
    };
    this.setPhase('turn');
    this.runHooks('onTurnStart');
    this.emit('turnStart', { team: team.id, worm: next.id });
  }

  beginResolve() {
    if (this.phase !== 'turn') return;
    const w = this.activeWorm();
    if (w?.state === 'rope') this.releaseRope(w);
    this.turn.charging = false;
    this.turn.burst = null;
    this.turn.input = { l: 0, r: 0, u: 0, d: 0 };
    if (w) {
      w.walking = false;
      if (w.custom) w.custom = null;
    }
    this.setPhase('resolve');
    this.runHooks('onTurnEnd');
  }

  isSettled() {
    for (const w of this.worms) if (w.alive && w.state !== 'ground') return false;
    for (const o of this.objects) {
      if (o.kind === 'mine' && !o.trig) continue;
      if (o.kind === 'grave' && o.rest) continue;
      if (OBJECT_TYPES[o.kind]?.passive?.(o)) continue;
      return false;
    }
    for (const c of this.crates) if (c.para || c.vy !== 0) return false;
    return true;
  }

  // Safety net: something kept moving for too long, so freeze it and move on.
  forceSettle() {
    for (const w of this.worms) {
      if (w.alive && w.state !== 'ground') {
        w.state = 'ground';
        w.vx = w.vy = 0;
      }
    }
    this.objects = this.objects.filter((o) => o.kind === 'mine' || o.kind === 'grave');
    for (const o of this.objects) o.rest = true;
    for (const c of this.crates) {
      c.para = false;
      c.vx = c.vy = 0;
    }
  }

  updatePhase() {
    if (this.phase === 'resolve') {
      if (this.phaseTime > 0.6 && this.isSettled()) {
        if (!this.turn.settledRun) {
          this.turn.settledRun = true; // once per turn, e.g. poison damage; may spawn more action
          this.runHooks('onSettled');
          this.setPhase('resolve');
          return;
        }
        this.setPhase('deaths');
      } else if (this.phaseTime > 45) this.forceSettle(); // Armageddon alone runs ~25 s
    } else if (this.phase === 'deaths') {
      if (this.phaseTime < 0.4) return;
      const dying = this.worms.find((w) => w.alive && w.hp <= 0);
      if (dying) {
        this.killWorm(dying);
        this.setPhase('resolve');
        return;
      }
      const aliveTeams = this.teams.filter((t) => this.teamAlive(t.id));
      if (aliveTeams.length <= 1) {
        this.winner = aliveTeams.length ? aliveTeams[0].id : -1;
        this.setPhase('over');
        this.emit('gameOver', { winner: this.winner });
        return;
      }
      if (!this.turn.crateDone) {
        this.turn.crateDone = true;
        if (this.rng.chance(this.cfg.crateChance)) this.dropCrate();
        this.setPhase('resolve');
        return;
      }
      this.startTurn(this.nextTeamIdx());
    }
  }

  killWorm(w) {
    w.alive = false;
    w.hp = 0;
    this.emit('death', { id: w.id, x: w.x, y: w.y });
    this.objects.push({ id: this.nextId++, kind: 'grave', x: w.x, y: w.y, vx: 0, vy: 0, r: 5, team: w.team });
    this.explode(w.x, w.y, { r: 22, dmg: 15, push: 200 }, { owner: w.id });
  }

  drown(w) {
    w.alive = false;
    w.hp = 0;
    this.emit('splash', { x: w.x, y: this.waterY, size: 1 });
    this.emit('drown', { id: w.id, x: w.x });
  }

  // ---------- commands ----------
  applyCommand(c) {
    if (this.phase !== 'turn' || !this.turn || c.team !== this.turn.team) return;
    const t = this.turn;
    const w = this.activeWorm();
    if (!w || !w.alive) return;
    const wd = WEAPONS[t.weapon];
    switch (c.type) {
      case 'input':
        t.input = { l: c.l ? 1 : 0, r: c.r ? 1 : 0, u: c.u ? 1 : 0, d: c.d ? 1 : 0 };
        break;
      // Jumps follow Worms Armageddon: Enter = forward, Enter twice = backward jump,
      // Backspace = high straight-up jump, Backspace twice = backflip. A repeat press within
      // SPRING_JUMP_WINDOW of take-off upgrades the jump that has just begun.
      case 'jump': // forward
      case 'jumpBack':
      case 'jumpHigh':
      case 'backflip': {
        if (w.state === 'rope') {
          if (c.type === 'jump') this.releaseRope(w);
          break;
        }
        if (wd.onJump?.(this, w, t, c.type) === true) break;
        if (t.charging || t.burst) break;
        const fresh = w.state === 'ground' || (w.state === 'air' && w.airT < SPRING_JUMP_WINDOW && w.jumped);
        if (!fresh) break;
        const d = w.dir;
        const v = {
          jump: [d * 85, -190], jumpBack: [-d * 85, -190], jumpHigh: [0, -265], backflip: [-d * 45, -290],
        }[c.type];
        [w.vx, w.vy] = v;
        w.state = 'air';
        w.noFall = false;
        w.jumped = true;
        w.airT = 0;
        this.emit('jump', { id: w.id });
        break;
      }
      case 'weapon': {
        if (t.charging || t.burst || t.fired) break;
        const nd = WEAPONS[c.id];
        if (!nd || this.ammo(t.team, c.id) === 0) break;
        wd.onDeselect?.(this, w, t);
        t.weapon = c.id;
        t.fuse = nd.defFuse || 3;
        t.shots = 0;
        t.marker = null;
        nd.onSelect?.(this, w, t);
        break;
      }
      case 'fuse':
        if (wd.fuse && !t.charging) t.fuse = Math.max(1, Math.min(5, c.n | 0));
        break;
      case 'bounce':
        if (wd.bounceable && !t.charging) t.bounce = c.n | 0; // 0 none, 1 normal, 2 high
        break;
      case 'girderRot':
        t.girder = (t.girder + (c.d >= 0 ? 1 : 7)) % 8;
        break;
      case 'strikeDir':
        t.strikeDir = c.d >= 0 ? 1 : -1;
        break;
      case 'switchWorm': {
        if (!t.canSwitch || t.fired || t.charging) break;
        const mine = this.worms.filter((o) => o.alive && o.team === t.team);
        if (mine.length < 2) break;
        const next = mine[(mine.findIndex((o) => o.id === w.id) + 1) % mine.length];
        t.worm = next.id;
        this.teams[t.team].lastWorm = next.id;
        this.emit('switchWorm', { id: next.id });
        break;
      }
      case 'fireDown':
        this.fireDown(w, wd);
        break;
      case 'fireUp':
        if (t.charging) this.fireCharged(w, wd);
        else wd.onFireUp?.(this, w, t);
        break;
      case 'useAt':
        this.useAt(w, wd, c.x, c.y);
        break;
    }
  }

  surrender(team) {
    for (const w of this.worms) {
      if (w.alive && w.team === team) {
        w.alive = false;
        w.hp = 0;
        this.emit('death', { id: w.id, x: w.x, y: w.y });
        this.objects.push({ id: this.nextId++, kind: 'grave', x: w.x, y: w.y, vx: 0, vy: 0, r: 5, team });
      }
    }
    this.emit('surrender', { team });
  }

  spend(id) {
    const team = this.teams[this.turn.team];
    if (team.ammo[id] > 0) team.ammo[id]--;
  }

  // Marks the turn's attack as done: the clock drops to the retreat time.
  finishShot() {
    const t = this.turn;
    t.fired = true;
    t.time = Math.min(t.time, this.cfg.retreatTime);
  }

  fireDown(w, wd) {
    const t = this.turn;
    if (wd.onFireDown?.(this, w, t) === true) return;
    if (t.fired || t.cool > 0 || t.burst || t.charging || this.ammo(t.team, wd.id) === 0) return;
    if (wd.charge) {
      t.charging = true;
      t.power = 0;
    } else if (wd.fire) {
      this.afterFire(wd, wd.fire(this, w, wd, { power: 0 }));
    }
  }

  fireCharged(w, wd) {
    const t = this.turn;
    t.charging = false;
    const power = t.power;
    t.power = 0;
    this.afterFire(wd, wd.fire(this, w, wd, { power }));
  }

  // false = cancelled, 'partial' = used but the attack is not finished (e.g. first shotgun shell).
  afterFire(wd, result) {
    if (result === false || result === 'partial') return;
    this.spend(wd.id);
    if (!wd.noEnd) this.finishShot();
  }

  // Throws or fires a charged projectile (rocket or fused grenade) from the active worm.
  launchProjectile(w, wd, power) {
    const t = this.turn;
    const l = launchVector(w, w.aim, power, wd.speed);
    const base = { x: l.x, y: l.y, vx: l.vx, vy: l.vy, owner: w.id, age: 0 };
    if (wd.id === 'bazooka') {
      this.spawn({ ...base, kind: 'rocket', variant: 'rocket', r: 2, wind: true, gmul: 0.85, expl: wd.expl });
    } else {
      this.spawn({
        ...base, kind: 'grenade', variant: wd.id, r: 3, fuse: t.fuse, bounce: wd.bounce,
        friction: wd.friction, expl: wd.expl, weapon: wd.id,
      });
    }
    this.emit('fire', { id: w.id, weapon: wd.id, power });
  }

  // Calls fn every `interval` seconds, `count` times (e.g. an Uzi burst), then finishes the shot.
  startBurst(count, interval, fn, onEnd) {
    this.turn.burst = { left: count, cd: 0, interval, fn, onEnd };
  }

  place(w, wd) {
    const x = w.x + w.dir * 8;
    const y = w.y;
    const base = { id: this.nextId++, x, y, vx: 0, vy: 0, owner: w.id, expl: wd.expl };
    if (wd.id === 'dynamite') {
      this.objects.push({ ...base, kind: 'grenade', variant: 'dynamite', r: 4, fuse: wd.fuseTime, bounce: 0.1, friction: 0.6 });
    } else if (wd.id === 'mine') {
      this.objects.push({ ...base, kind: 'mine', r: 4, arm: 2.5, trig: false, fuse: 0 });
    } else if (wd.id === 'sheep') {
      this.objects.push({ ...base, kind: 'sheep', r: 5, dir: w.dir, fuse: wd.fuseTime, walkAcc: 0, state: 'air', hop: 0 });
    }
    this.emit('place', { weapon: wd.id });
  }

  shootRay(w, wd) {
    const ang = w.aim + (this.rng.next() - 0.5) * 2 * wd.spread;
    const dx = w.dir * Math.cos(ang);
    const dy = -Math.sin(ang);
    const sx = w.x + dx * (w.r + 3);
    const sy = w.y - 1 + dy * (w.r + 3);
    let ex = sx;
    let ey = sy;
    for (let d = 0; d < 1600; d++) {
      const x = sx + dx * d;
      const y = sy + dy * d;
      ex = x;
      ey = y;
      if (x < -60 || x > this.terrain.w + 60 || y > this.waterY || y < -600) break;
      const hit = this.wormAt(x, y, w.id, 1);
      if (hit) {
        this.hurt(hit, wd.dmg, w.id);
        hit.vx += dx * wd.push;
        hit.vy += dy * wd.push - 60;
        this.knock(hit);
        this.emit('hit', { x, y });
        break;
      }
      if (this.terrain.solid(x, y)) {
        const r = wd.burst ? 3 : 6;
        this.terrain.carveCircle(x, y, r);
        this.emit('carve', { x, y, r });
        this.emit('hit', { x, y });
        break;
      }
    }
    this.emit('shot', { x1: sx, y1: sy, x2: ex, y2: ey, weapon: wd.id });
  }

  punch(w, wd) {
    for (const o of this.worms) {
      if (!o.alive || o.id === w.id) continue;
      const dx = (o.x - w.x) * w.dir;
      if (dx > -2 && dx < 18 && Math.abs(o.y - w.y) < 14) {
        this.hurt(o, wd.dmg, w.id);
        o.vx += w.dir * 230;
        o.vy -= 300;
        this.knock(o);
      }
    }
    this.emit('punch', { x: w.x + w.dir * 10, y: w.y });
  }

  shootRope(w) {
    if (w.state === 'rope') this.releaseRope(w);
    const dx = w.dir * Math.cos(w.aim);
    const dy = -Math.sin(w.aim);
    const hit = this.terrain.raycast(w.x, w.y - 2, w.x + dx * 440, w.y - 2 + dy * 440);
    this.emit('ropeShot', { x1: w.x, y1: w.y, x2: hit ? hit.x : w.x + dx * 440, y2: hit ? hit.y : w.y - 2 + dy * 440, hit: !!hit });
    if (!hit) return;
    w.rope = { ax: hit.x, ay: hit.y, len: Math.max(20, Math.hypot(hit.x - w.x, hit.y - w.y)) };
    w.state = 'rope';
    w.noFall = true;
  }

  releaseRope(w) {
    w.rope = null;
    if (w.state === 'rope') w.state = 'air';
  }

  // Left-click on a target weapon. The weapon's useAt returns true when it was used.
  useAt(w, wd, x, y) {
    const t = this.turn;
    if (!wd.target || t.fired || this.ammo(t.team, wd.id) === 0) return;
    if (wd.useAt?.(this, w, wd, x, y) === true) {
      this.spend(wd.id);
      if (!wd.noEnd) this.finishShot();
    }
  }

  teleport(w, x, y) {
    if (x < 8 || x > this.terrain.w - 8 || y < 8 || y > this.waterY - 10) return false;
    if (this.terrain.hitCircle(x, y, w.r)) return false;
    this.emit('teleport', { x1: w.x, y1: w.y, x2: x, y2: y });
    if (w.state === 'rope') this.releaseRope(w);
    w.x = x;
    w.y = y;
    w.vx = w.vy = 0;
    w.state = 'air';
    return true;
  }

  // Girder of `length` px at the cursor, angle from turn.girder (8 steps of 22.5 degrees).
  placeGirder(w, x, y, length = 64) {
    if (Math.hypot(x - w.x, y - w.y) > 380) return false;
    const a = (this.turn.girder * Math.PI) / 8;
    const hl = length / 2;
    const x1 = x - Math.cos(a) * hl;
    const y1 = y - Math.sin(a) * hl;
    const x2 = x + Math.cos(a) * hl;
    const y2 = y + Math.sin(a) * hl;
    for (const o of this.worms) if (o.alive && distToSegment(o.x, o.y, x1, y1, x2, y2) < o.r + 6) return false;
    this.terrain.fillLine(x1, y1, x2, y2, 8);
    this.emit('fill', { x1, y1, x2, y2, th: 8 });
    return true;
  }

  // Standard five-bomb air strike centred on x, flying in the chosen direction.
  airStrike(w, x) {
    const dir = this.turn.strikeDir || w.dir;
    const drops = [-2, -1, 0, 1, 2].map((k) => x + k * 44).sort((a, b) => (a - b) * dir);
    this.spawn({ kind: 'plane', x: x - dir * 700, y: 40, vx: dir * 420, dir, drops, next: 0, owner: w.id });
    this.emit('airstrike', { x, dir });
    return true;
  }

  // ---------- damage ----------
  hurt(w, dmg, owner = -1) {
    if (dmg <= 0 || !w.alive || w.frozen) return;
    w.hp = Math.max(0, w.hp - dmg);
    this.emit('damage', { id: w.id, x: w.x, y: w.y, amount: dmg, team: w.team });
    if (this.phase === 'turn' && w.id === this.turn.worm) this.turn.hurt = true;
  }

  sicken(w, amount) {
    if (w.alive) w.poison += amount;
    this.emit('sick', { id: w.id });
  }

  freezeTeam(team) {
    for (const w of this.worms) if (w.team === team) w.frozen = true;
    this.emit('freeze', { team });
  }

  knock(w) {
    if (w.state === 'rope') this.releaseRope(w);
    w.state = 'air';
    w.noFall = true;
  }

  explode(x, y, ex, opts = {}) {
    const r = ex.r;
    this.terrain.carveCircle(x, y, r * 0.95);
    this.emit('carve', { x, y, r: r * 0.95 });
    this.emit('explosion', { x, y, r });
    for (const w of this.worms) {
      if (!w.alive) continue;
      const dx = w.x - x;
      const dy = w.y - 2 - y;
      const d = Math.hypot(dx, dy);
      const b = blast(ex, d, w.r);
      if (!b) continue;
      const nx = d > 0.001 ? dx / d : 0;
      const ny = d > 0.001 ? dy / d : -1;
      w.vx += nx * b.push * KNOCKBACK;
      w.vy += ny * b.push * KNOCKBACK - b.push * KNOCK_LIFT;
      const sp = Math.hypot(w.vx, w.vy);
      if (sp > KNOCK_MAX) {
        w.vx *= KNOCK_MAX / sp;
        w.vy *= KNOCK_MAX / sp;
      }
      this.knock(w);
      this.hurt(w, b.dmg, opts.owner);
    }
    for (const o of this.objects) {
      if (o.dead || !('vx' in o) || o.kind === 'rocket' || o.kind === 'plane') continue;
      const dx = o.x - x;
      const dy = o.y - y;
      const d = Math.hypot(dx, dy);
      const b = blast(ex, d, o.r);
      if (!b) continue;
      o.vx += (dx / (d || 1)) * b.push * 0.6;
      o.vy += (dy / (d || 1)) * b.push * 0.6 - b.push * 0.2;
      o.rest = false;
    }
    for (const c of this.crates) {
      const d = Math.hypot(c.x - x, c.y - y);
      const b = blast(ex, d, c.r);
      if (!b) continue;
      c.para = false;
      c.vx += ((c.x - x) / (d || 1)) * b.push * 0.5;
      c.vy += ((c.y - y) / (d || 1)) * b.push * 0.5 - b.push * 0.2;
    }
  }

  // ---------- crates ----------
  dropCrate() {
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(this.rng.range(80, this.terrain.w - 80));
      const y = this.terrain.surfaceY(x, 0);
      if (y < 0 || y > this.waterY - 40) continue;
      const r = this.rng.next();
      let crate;
      if (r < 0.4) crate = { kind: 'health', amount: 25 };
      else {
        // Weighted pick: wd.crate = weight (default 1, 0 = never; super weapons use a small weight).
        const pool = WEAPON_ORDER.map((id) => [id, WEAPONS[id].crate ?? 1]).filter(([, wgt]) => wgt > 0);
        let roll = this.rng.next() * pool.reduce((s, [, wgt]) => s + wgt, 0);
        let weapon = pool[0][0];
        for (const [id, wgt] of pool) {
          roll -= wgt;
          if (roll <= 0) {
            weapon = id;
            break;
          }
        }
        crate = { kind: 'weapon', weapon, amount: WEAPONS[weapon].crateAmount ?? this.rng.int(1, 2) };
      }
      this.crates.push({ id: this.nextId++, x, y: -20, vx: 0, vy: 0, r: 7, para: true, ...crate });
      this.emit('crateDrop', { x });
      return;
    }
  }

  collectCrate(c, w) {
    const team = this.teams[w.team];
    let text;
    if (c.kind === 'health') {
      w.hp += c.amount;
      text = `+${c.amount} HP`;
    } else {
      team.ammo[c.weapon] = (team.ammo[c.weapon] < 0 ? -1 : team.ammo[c.weapon] + c.amount);
      text = `${WEAPONS[c.weapon].name} +${c.amount}`;
    }
    c.dead = true;
    this.emit('pickup', { x: c.x, y: c.y, text, team: w.team });
  }

  updateCrates() {
    for (const c of this.crates) {
      if (c.para) {
        c.vy = 70;
        c.x += (Math.sin(this.time * 2 + c.id) * 8 + this.wind * 10) * DT;
        c.y += c.vy * DT;
        if (this.terrain.hitCircle(c.x, c.y + 1, c.r)) {
          c.para = false;
          c.vy = 0;
        }
      } else if (!this.terrain.hitCircle(c.x, c.y + 1, c.r) || c.vx || c.vy) {
        c.vy += GRAVITY * DT;
        const hit = moveBody(this.terrain, c, DT, 0.2, 0.7);
        if (hit && hit.ny < -0.5 && Math.hypot(c.vx, c.vy) < 30) c.vx = c.vy = 0;
      }
      if (c.y > this.waterY) {
        c.dead = true;
        this.emit('splash', { x: c.x, y: this.waterY, size: 0.7 });
        continue;
      }
      for (const w of this.worms) {
        if (w.alive && (w.x - c.x) ** 2 + (w.y - c.y) ** 2 < (w.r + c.r + 2) ** 2) {
          this.collectCrate(c, w);
          break;
        }
      }
    }
    this.crates = this.crates.filter((c) => !c.dead);
  }

  // ---------- objects ----------
  detonateGrenade(o) {
    this.explode(o.x, o.y, o.expl, { owner: o.owner });
    if (o.variant === 'cluster') {
      const wd = WEAPONS.cluster;
      for (let i = 0; i < wd.bomblets; i++) {
        const a = -Math.PI / 2 + (i - (wd.bomblets - 1) / 2) * 0.45 + this.rng.range(-0.1, 0.1);
        const sp = this.rng.range(160, 260);
        this.objects.push({
          id: this.nextId++, kind: 'rocket', variant: 'bomblet', x: o.x, y: o.y - 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          r: 2, wind: false, gmul: 1, expl: wd.bomblet, owner: o.owner, age: 0,
        });
      }
    }
    if (o.variant === 'hhg') this.emit('hhg', {});
    o.dead = true;
  }

  updateObjects() {
    for (let i = 0; i < this.objects.length; i++) {
      const o = this.objects[i];
      if (o.dead) continue;
      const custom = OBJECT_TYPES[o.kind];
      if (custom) custom.update(this, o);
      else switch (o.kind) {
        case 'rocket': {
          o.age += DT;
          const res = stepRocket(this.terrain, o, DT, this.wind,
            (x, y) => this.wormAt(x, y, o.age < 0.15 ? o.owner : -1, 2) !== null);
          if (res) {
            this.explode(o.x, o.y, o.expl, { owner: o.owner });
            o.dead = true;
          }
          break;
        }
        case 'grenade': {
          o.vy += GRAVITY * DT;
          const hit = moveBody(this.terrain, o, DT, o.bounce, o.friction);
          if (hit && hit.speed > 90) this.emit('bounce', { x: o.x, y: o.y });
          o.fuse -= DT;
          if (o.fuse <= 0) this.detonateGrenade(o);
          break;
        }
        case 'mine': {
          if (!this.terrain.hitCircle(o.x, o.y + 1, o.r) || o.vx || o.vy) {
            o.vy += GRAVITY * DT;
            const hit = moveBody(this.terrain, o, DT, 0.2, 0.7);
            if (hit && hit.ny < -0.5 && Math.hypot(o.vx, o.vy) < 30) o.vx = o.vy = 0;
          }
          o.arm -= DT;
          if (o.arm <= 0 && !o.trig && this.worms.some((w) => w.alive && Math.hypot(w.x - o.x, w.y - o.y) < 34)) {
            o.trig = true;
            o.fuse = this.rng.range(0.4, 1.4);
            this.emit('mineTrigger', { x: o.x, y: o.y });
          }
          if (o.trig) {
            o.fuse -= DT;
            if (o.fuse <= 0) {
              this.explode(o.x, o.y, o.expl, { owner: o.owner });
              o.dead = true;
            }
          }
          break;
        }
        case 'sheep':
          this.updateSheep(o);
          break;
        case 'plane': {
          o.x += o.vx * DT;
          while (o.next < o.drops.length && (o.x - o.drops[o.next]) * o.dir >= 0) {
            this.objects.push({
              id: this.nextId++, kind: 'rocket', variant: 'bomb', x: o.drops[o.next], y: o.y + 8, vx: 0, vy: 40,
              r: 2, wind: false, gmul: 1, expl: WEAPONS.airstrike.expl, owner: o.owner, age: 0.2,
            });
            o.next++;
          }
          if ((o.dir > 0 && o.x > this.terrain.w + 250) || (o.dir < 0 && o.x < -250)) o.dead = true;
          break;
        }
        case 'grave': {
          if (!o.rest || o.vx || o.vy) {
            o.vy += GRAVITY * DT;
            const hit = moveBody(this.terrain, o, DT, 0.2, 0.6);
            if (hit && hit.ny < -0.5 && Math.hypot(o.vx, o.vy) < 30) {
              o.vx = o.vy = 0;
              o.rest = true;
            }
          }
          break;
        }
      }
      if (!o.dead && o.kind !== 'plane' && !custom?.noBounds && (o.y > this.waterY || o.x < -300 || o.x > this.terrain.w + 300)) {
        if (o.y > this.waterY && o.x > -50 && o.x < this.terrain.w + 50) this.emit('splash', { x: o.x, y: this.waterY, size: 0.6 });
        o.dead = true;
      }
    }
    this.objects = this.objects.filter((o) => !o.dead);
  }

  updateSheep(o) {
    o.fuse -= DT;
    if (o.fuse <= 0) {
      this.explode(o.x, o.y, o.expl, { owner: o.owner });
      o.dead = true;
      return;
    }
    if (o.state === 'ground') {
      if (!this.terrain.hitCircle(o.x, o.y + 1, o.r) && !snapDown(this.terrain, o, 3)) {
        o.state = 'air';
        o.vx = o.dir * 60;
        o.vy = 0;
        return;
      }
      o.walkAcc += 80 * DT;
      while (o.walkAcc >= 1) {
        o.walkAcc -= 1;
        if (!groundStep(this.terrain, o, o.dir, 3)) {
          o.state = 'air';
          o.vx = o.dir * 60;
          o.vy = -170;
          this.emit('sheepHop', { x: o.x, y: o.y });
          break;
        }
      }
      snapDown(this.terrain, o, 3);
    } else {
      o.vy += GRAVITY * DT;
      const hit = moveBody(this.terrain, o, DT, 0.2, 0.9);
      if (hit && hit.ny < -0.5) {
        o.state = 'ground';
        o.vx = o.vy = 0;
      }
    }
    if (this.worms.some((w) => w.alive && w.id !== o.owner && Math.hypot(w.x - o.x, w.y - o.y) < 12)) o.fuse = Math.min(o.fuse, 0.3);
  }

  // ---------- worms ----------
  updateTurn() {
    const t = this.turn;
    const w = this.activeWorm();
    if (!w.alive || t.hurt) {
      this.beginResolve();
      return;
    }
    const brain = this.ai[t.team];
    if (brain) brain.update(this);
    t.time -= DT;
    if (t.time <= 0) {
      this.beginResolve();
      return;
    }
    const inp = t.input;
    w.turnCd = Math.max(0, w.turnCd - DT);
    t.cool = Math.max(0, t.cool - DT);
    w.walking = false;
    if (w.state === 'ground' && !t.charging && !t.burst) {
      const dir = inp.r - inp.l;
      if (dir) {
        if (w.dir !== dir) {
          w.dir = dir;
          w.turnCd = 0.12;
        } else if (w.turnCd <= 0) {
          w.walking = true;
          w.walkAcc += WALK_SPEED * DT;
          while (w.walkAcc >= 1) {
            w.walkAcc -= 1;
            if (!groundStep(this.terrain, w, dir, 2)) break;
          }
          if (!snapDown(this.terrain, w, 3)) {
            w.state = 'air';
            w.vx = dir * 20;
            w.vy = 0;
          }
        }
      }
    }
    if (w.state === 'rope' && w.rope) {
      const swing = inp.r - inp.l;
      w.vx += swing * 240 * DT;
      if (inp.u) w.rope.len = Math.max(20, w.rope.len - 90 * DT);
      if (inp.d) w.rope.len = Math.min(500, w.rope.len + 90 * DT);
      if (swing) w.dir = swing;
    } else if (!t.burst) {
      if (inp.u) w.aim = Math.min(AIM_MAX, w.aim + AIM_RATE * DT);
      if (inp.d) w.aim = Math.max(-AIM_MAX, w.aim - AIM_RATE * DT);
    }
    if (t.charging) {
      t.power = Math.min(1, t.power + DT / CHARGE_TIME);
      if (t.power >= 1) this.fireCharged(w, WEAPONS[t.weapon]);
    }
    if (t.burst) {
      t.burst.cd -= DT;
      if (t.burst.cd <= 0) {
        t.burst.fn(this, w);
        t.burst.left--;
        t.burst.cd = t.burst.interval;
        if (t.burst.left <= 0) {
          const end = t.burst.onEnd;
          t.burst = null;
          if (end) end(this, w);
          else this.finishShot();
        }
      }
    }
    WEAPONS[t.weapon].tick?.(this, w, t);
  }

  updateWorm(w) {
    if (!w.alive) return;
    if (w.custom?.pre?.(this, w) === true) {
      if (w.y > this.waterY || w.x < -60 || w.x > this.terrain.w + 60) this.drown(w);
      return; // a tool (jet pack ...) handled this worm's movement
    }
    if (w.state === 'air') w.airT += DT;
    if (w.state === 'ground') {
      if (this.terrain.hitCircle(w.x, w.y, w.r)) unstick(this.terrain, w);
      if (!this.terrain.hitCircle(w.x, w.y + 1, w.r) && !snapDown(this.terrain, w, 3)) {
        w.state = 'air';
        w.vx = w.vy = 0;
      }
    } else if (w.state === 'air') {
      w.vy += GRAVITY * DT;
      const hit = moveBody(this.terrain, w, DT, 0.3, 0.6);
      if (hit) {
        if (!w.noFall && hit.speed > FALL_SAFE_SPEED) {
          const dmg = Math.floor((hit.speed - FALL_SAFE_SPEED) / 12);
          if (dmg > 0) this.hurt(w, dmg);
        }
        if (hit.speed > 150) this.emit('thud', { x: w.x, y: w.y });
        // Flat enough: land at once. On steep surfaces, a worm that has barely moved for a while
        // also settles (otherwise it could creep down a slope forever and stall the turn).
        w.restT = Math.hypot(w.vx, w.vy) < 40 ? (w.restT || 0) + DT : 0;
        if ((hit.ny < -0.5 && Math.hypot(w.vx, w.vy) < 70) || w.restT > 0.5) {
          w.state = 'ground';
          w.vx = w.vy = 0;
          w.noFall = false;
          w.restT = 0;
          w.jumped = false;
          w.airT = 0;
        }
      } else {
        w.restT = 0;
      }
    } else if (w.state === 'rope' && w.rope) {
      w.vy += GRAVITY * DT;
      moveBody(this.terrain, w, DT, 0.2, 0.95);
      const dx = w.x - w.rope.ax;
      const dy = w.y - w.rope.ay;
      const dist = Math.hypot(dx, dy);
      if (dist > w.rope.len) {
        const nx = dx / dist;
        const ny = dy / dist;
        w.x = w.rope.ax + nx * w.rope.len;
        w.y = w.rope.ay + ny * w.rope.len;
        const vr = w.vx * nx + w.vy * ny;
        if (vr > 0) {
          w.vx -= vr * nx;
          w.vy -= vr * ny;
        }
      }
      if (this.terrain.hitCircle(w.x, w.y, w.r)) unstick(this.terrain, w);
    }
    if (w.y > this.waterY || w.x < -60 || w.x > this.terrain.w + 60) this.drown(w);
  }

  update() {
    this.tick++;
    this.time += DT;
    this.phaseTime += DT;
    const q = this.queue;
    this.queue = [];
    for (const c of q) this.applyCommand(c);
    if (this.phase === 'turn') this.updateTurn();
    else if (this.phase !== 'over') this.updatePhase();
    for (const w of this.worms) this.updateWorm(w);
    this.updateObjects();
    this.updateCrates();
  }
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
