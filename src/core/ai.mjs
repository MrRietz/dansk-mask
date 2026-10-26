// Computer opponent. It plays through the same command() interface as a human:
// it plans a shot by simulating projectiles with the game's own physics, then walks, aims and
// charges like a player would.
import { WEAPONS, blast } from './weapons.mjs';
import { stepRocket, moveBody, launchVector, groundStep, snapDown, unstick } from './physics.mjs';
import { DT, GRAVITY, CHARGE_TIME, AIM_MAX } from './constants.mjs';

const LEVELS = {
  easy: { aimErr: 0.1, powErr: 0.14, think: [1.4, 2.6], minScore: 14 },
  normal: { aimErr: 0.04, powErr: 0.06, think: [0.9, 1.7], minScore: 18 },
  hard: { aimErr: 0.012, powErr: 0.02, think: [0.6, 1.1], minScore: 22 },
};
const PROJECTILES = ['bazooka', 'grenade', 'cluster', 'hhg'];
// [weapon id, max range px, base score] for aimed hitscan-style weapons added by the weapon packs.
const EXTRA_DIRECT = [['handgun', 500, 16], ['minigun', 450, 30]];
const EXTRA_MELEE = [['axe', 30], ['bat', 26], ['dragonball', 28]];
// [weapon id, blast per drop, drops, spacing px, score weight]; the plain air strike keeps its classic numbers.
const STRIKES = [
  ['airstrike', { r: 28, dmg: 35, push: 340 }, 5, 44, 0.9],
  ['napalm', { r: 24, dmg: 20, push: 150 }, 6, 40, 0.8],
  ['mail', { r: 26, dmg: 28, push: 260 }, 6, 34, 0.8],
  ['carpet', { r: 30, dmg: 40, push: 340 }, 10, 30, 0.7],
  ['donkey', { r: 70, dmg: 100, push: 600 }, 1, 0, 0.9],
];

// Walkers that follow the ground (weapons/walkers.mjs; the plain sheep behaves like wk_sheep). [weapon id, behaviour]:
// r body radius, speed px/s, climb px per step, block = what a wall does ('explode' | 'turn' | [hop vx, hop vy]),
// touch = [distance, fuse left] when a worm other than the shooter is that close, launch = lobbed like a grenade.
const WALKERS = [
  ['sheep', { r: 5, speed: 80, climb: 3, block: [60, -170], touch: [12, 0.3] }],
  ['sheeplauncher', { r: 5, speed: 80, climb: 3, block: [60, -170], touch: [12, 0.3], launch: true }],
  ['madcow', { r: 5, speed: 120, climb: 4, block: 'explode', touch: [10, 0] }],
  ['oldwoman', { r: 5, speed: 22, climb: 3, block: 'turn' }],
  ['salvation', { r: 6, speed: 38, climb: 3, block: [40, -170] }],
  ['skunk', { r: 4, speed: 30, climb: 3, block: [50, -170] }],
];
// Arrow keys [dx, dy] (dy down) that steer a Super Sheep at (tx, ty); used by both the plan simulation and the live flight.
const steerKeys = (o, tx, ty) => [Math.abs(tx - o.x) > 6 ? Math.sign(tx - o.x) : 0, Math.abs(ty - o.y) > 6 ? Math.sign(ty - o.y) : 0];

const rnd = (a, b) => a + Math.random() * (b - a); // AI jitter does not need to be deterministic

export class AiBrain {
  constructor(team, level = 'normal') {
    this.team = team;
    this.lv = LEVELS[level] || LEVELS.normal;
    this.turnId = -1;
  }

  reset(game) {
    this.turnId = game.turnNumber;
    this.state = 'think';
    this.delay = rnd(...this.lv.think);
    this.attempts = 0;
    this.plan = null;
    this.walkLeft = 0;
    this.walkDir = 1;
    this.lastX = null;
    this.stuckT = 0;
    this.stuckCount = 0;
    this.input = { l: 0, r: 0, u: 0, d: 0 };
    this.sent = '';
    this.shotsFired = 0;
    this.holdUntil = 0;
  }

  send(game, c) {
    game.command({ team: this.team, ...c });
  }

  setInput(game, l, r, u, d) {
    const key = `${l}${r}${u}${d}`;
    if (key === this.sent) return;
    this.sent = key;
    this.send(game, { type: 'input', l, r, u, d });
  }

  update(game) {
    if (this.turnId !== game.turnNumber) this.reset(game);
    const t = game.turn;
    const w = game.worms[t.worm];
    switch (this.state) {
      case 'think':
        this.delay -= DT;
        if (this.delay > 0) return;
        this.plan = this.makePlan(game, w);
        if (this.plan.type === 'skip') {
          this.send(game, { type: 'weapon', id: 'skip' });
          this.state = 'done';
        } else if (this.plan.type === 'walk') {
          this.walkDir = this.plan.dir;
          this.walkLeft = rnd(1.2, 2.4);
          this.attempts++;
          this.state = 'walk';
        } else {
          this.state = 'face';
          this.setInput(game, 0, 0, 0, 0);
        }
        break;
      case 'walk':
        this.walk(game, w, this.walkDir);
        this.walkLeft -= DT;
        if (this.walkLeft <= 0) {
          this.setInput(game, 0, 0, 0, 0);
          this.state = 'think';
          this.delay = 0.3;
        }
        break;
      case 'face': {
        const p = this.plan;
        if (p.dir && w.dir !== p.dir) {
          this.setInput(game, p.dir < 0 ? 1 : 0, p.dir > 0 ? 1 : 0, 0, 0);
          return;
        }
        this.setInput(game, 0, 0, 0, 0);
        this.send(game, { type: 'weapon', id: p.weapon });
        if (p.fuse) this.send(game, { type: 'fuse', n: p.fuse });
        this.state = p.type === 'at' ? 'at' : 'aim';
        break;
      }
      case 'aim': {
        const diff = this.plan.aim - w.aim;
        if (Math.abs(diff) < 0.025) {
          this.setInput(game, 0, 0, 0, 0);
          this.state = 'fire';
        } else {
          this.setInput(game, 0, 0, diff > 0 ? 1 : 0, diff < 0 ? 1 : 0);
        }
        break;
      }
      case 'at':
        this.send(game, { type: 'useAt', x: this.plan.x, y: this.plan.y });
        this.state = 'done';
        break;
      case 'fire': {
        const wd = WEAPONS[this.plan.weapon];
        if (wd.charge) {
          if (!t.charging) {
            this.send(game, { type: 'fireDown' });
          } else if (t.power >= this.plan.power) {
            this.send(game, { type: 'fireUp' });
            this.state = 'done';
          }
        } else {
          this.send(game, { type: 'fireDown' });
          this.shotsFired++;
          this.holdUntil = game.time + 0.7;
          this.state = this.plan.weapon === 'shotgun' && this.shotsFired < 2 ? 'fire2' : 'done';
        }
        break;
      }
      case 'fire2':
        if (game.time >= this.holdUntil) {
          this.send(game, { type: 'fireDown' });
          this.state = 'done';
        }
        break;
      case 'done': {
        // Back away from the nearest enemy while the retreat clock runs.
        if (!t.fired) return;
        if (this.plan.weapon === 'supersheep') {
          this.steerSuperSheep(game, w);
          return;
        }
        const foe = this.nearestEnemy(game, w);
        if (foe) this.walk(game, w, foe.x > w.x ? -1 : 1);
        break;
      }
    }
  }

  nearestEnemy(game, w) {
    let best = null;
    for (const o of game.worms) {
      if (o.alive && o.team !== this.team && (!best || Math.abs(o.x - w.x) < Math.abs(best.x - w.x))) best = o;
    }
    return best;
  }

  // Holds the arrow keys that steer our Super Sheep at the planned target (steering ends with the turn, as in the plan).
  steerSuperSheep(game, w) {
    const sheep = game.objects.find((o) => o.kind === 'wk_supersheep' && o.owner === w.id && !o.dead);
    const foe = game.worms[this.plan.foe]?.alive ? game.worms[this.plan.foe] : this.nearestEnemy(game, w);
    if (!sheep || !foe) {
      this.setInput(game, 0, 0, 0, 0);
      return;
    }
    const [dx, dy] = steerKeys(sheep, foe.x, foe.y);
    this.setInput(game, dx < 0 ? 1 : 0, dx > 0 ? 1 : 0, dy < 0 ? 1 : 0, dy > 0 ? 1 : 0);
  }

  canStep(game, w, dir) {
    const x = w.x + dir * 10;
    const d = game.terrain.groundBelow(x, w.y - 10, 60);
    return d >= 0 && w.y - 10 + d < game.waterY - 14;
  }

  walk(game, w, dir) {
    if (w.state !== 'ground') {
      this.setInput(game, 0, 0, 0, 0);
      return;
    }
    if (!this.canStep(game, w, dir)) {
      this.setInput(game, 0, 0, 0, 0);
      return;
    }
    this.setInput(game, dir < 0 ? 1 : 0, dir > 0 ? 1 : 0, 0, 0);
    if (this.lastX !== null && Math.abs(w.x - this.lastX) < 0.3) this.stuckT += DT;
    else this.stuckT = 0;
    this.lastX = w.x;
    if (this.stuckT > 0.4) {
      this.stuckT = 0;
      this.stuckCount++;
      this.send(game, { type: this.stuckCount % 2 ? 'jump' : 'backflip' });
    }
  }

  // ---------- planning ----------
  scoreBlast(game, ex, x, y, selfId) {
    let s = 0;
    for (const o of game.worms) {
      if (!o.alive) continue;
      const b = blast(ex, Math.hypot(o.x - x, o.y - 2 - y), o.r);
      if (!b) continue;
      const eff = Math.min(b.dmg, o.hp);
      const kills = b.dmg >= o.hp;
      if (o.team !== this.team) s += eff + (kills ? 25 : 0);
      else if (o.id === selfId) s -= kills ? 250 : eff * 3;
      else s -= eff * 1.6 + (kills ? 30 : 0);
    }
    return s;
  }

  simulate(game, shooter, wid, dir, aim, power, fuse) {
    const wd = WEAPONS[wid];
    const l = launchVector(shooter, aim, power, wd.speed, dir);
    const o = {
      x: l.x, y: l.y, vx: l.vx, vy: l.vy, r: wid === 'bazooka' ? 2 : 3, wind: true, gmul: 0.85, age: 0,
      bounce: wd.bounce, friction: wd.friction, fuse,
    };
    const worms = game.worms;
    const hitTest = (x, y) => {
      for (const w of worms) {
        if (w.alive && (w.id !== shooter.id || o.age > 0.15) && (w.x - x) ** 2 + (w.y - y) ** 2 < (w.r + 2) ** 2) return true;
      }
      return false;
    };
    for (let i = 0; i < 60 * 7; i++) {
      if (wid === 'bazooka') {
        o.age += DT;
        if (stepRocket(game.terrain, o, DT, game.wind, hitTest)) return { x: o.x, y: o.y };
      } else {
        o.vy += GRAVITY * DT;
        moveBody(game.terrain, o, DT, o.bounce, o.friction);
        o.fuse -= DT;
        if (o.fuse <= 0) return { x: o.x, y: o.y };
      }
      if (o.y > game.waterY || o.x < -50 || o.x > game.terrain.w + 50) return null;
    }
    return null;
  }

  // Where a ground walker blows up: the weapons' own step logic (walkers.mjs) on a body started at `o`, or null if it is lost.
  simulateWalker(game, shooter, spec, fuse, dir, o) {
    const terrain = game.terrain;
    Object.assign(o, { r: spec.r, dir, state: 'air', walkAcc: 0 });
    if (!spec.launch) unstick(terrain, o);
    for (let i = 0; i < 60 * 10; i++) {
      fuse -= DT;
      if (fuse <= 0) return { x: o.x, y: o.y };
      let blocked = false;
      if (o.state === 'air') {
        o.vy += GRAVITY * DT;
        const hit = moveBody(terrain, o, DT, 0.2, 0.9);
        if (hit && hit.ny < -0.5) {
          o.state = 'ground';
          o.vx = o.vy = 0;
        }
      } else if (!terrain.hitCircle(o.x, o.y + 1, o.r) && !snapDown(terrain, o, 3)) {
        o.state = 'air';
        o.vx = o.dir * spec.speed * 0.5;
        o.vy = 0;
      } else {
        o.walkAcc += spec.speed * DT;
        while (o.walkAcc >= 1) {
          o.walkAcc -= 1;
          if (!groundStep(terrain, o, o.dir, spec.climb)) {
            blocked = true;
            break;
          }
        }
        snapDown(terrain, o, 3);
      }
      if (blocked) {
        if (spec.block === 'explode') return { x: o.x, y: o.y };
        if (spec.block === 'turn') o.dir = -o.dir;
        else {
          o.state = 'air';
          o.vx = o.dir * spec.block[0];
          o.vy = spec.block[1];
        }
      }
      if (spec.touch && o.state === 'ground'
        && game.worms.some((x) => x.alive && x.id !== shooter.id && Math.hypot(x.x - o.x, x.y - o.y) < spec.touch[0])) {
        if (spec.touch[1] <= 0) return { x: o.x, y: o.y };
        fuse = Math.min(fuse, spec.touch[1]);
      }
      if (o.y > game.waterY || o.x < -50 || o.x > terrain.w + 50) return null;
    }
    return null;
  }

  // Super Sheep flight (walkers.mjs wk_supersheep) steered at `foe` by steerKeys while the turn lasts.
  simulateSuperSheep(game, shooter, wd, dir, foe) {
    const o = { x: shooter.x + dir * 8, y: shooter.y, r: 4, ang: dir > 0 ? -0.35 : Math.PI + 0.35, vx: 0, vy: 0, age: 0, gmul: 0 };
    unstick(game.terrain, o);
    const hitTest = (x, y) => game.worms.some((m) => m.alive && (m.id !== shooter.id || o.age >= 0.4) && (m.x - x) ** 2 + (m.y - y) ** 2 < (m.r + 3) ** 2);
    for (let i = 0; i < 60 * wd.fuseTime; i++) {
      o.age += DT;
      const [dx, dy] = o.age < game.cfg.retreatTime ? steerKeys(o, foe.x, foe.y) : [0, 0];
      if (dx || dy) {
        const want = Math.atan2(dy, dx);
        const diff = Math.atan2(Math.sin(want - o.ang), Math.cos(want - o.ang));
        o.ang += Math.max(-wd.turn * DT, Math.min(wd.turn * DT, diff));
      }
      o.vx = Math.cos(o.ang) * wd.speed;
      o.vy = Math.sin(o.ang) * wd.speed;
      if (stepRocket(game.terrain, o, DT, 0, hitTest)) return { x: o.x, y: o.y };
      if (o.y > game.waterY || o.x < -50 || o.x > game.terrain.w + 50) return null;
    }
    return { x: o.x, y: o.y };
  }

  makePlan(game, w) {
    const enemies = game.worms.filter((o) => o.alive && o.team !== this.team);
    if (!enemies.length) return { type: 'skip' };
    const minScore = Math.max(1, this.lv.minScore - this.attempts * 8);
    let best = { score: -Infinity };
    const consider = (c) => {
      c.score += Math.random() * 2;
      if (c.score > best.score) best = c;
    };
    const dirs = [...new Set(enemies.map((e) => (e.x >= w.x ? 1 : -1)))];

    for (const wid of PROJECTILES) {
      if (game.ammo(this.team, wid) === 0) continue;
      const wd = WEAPONS[wid];
      const fuse = wd.fuse ? 3 : 0;
      for (const dir of dirs) {
        for (let aim = -1.0; aim <= AIM_MAX - 0.05; aim += 0.07) {
          for (let power = 0.2; power <= 1.001; power += 0.1) {
            const hit = this.simulate(game, w, wid, dir, aim, power, fuse);
            if (!hit) continue;
            if (!enemies.some((e) => Math.hypot(e.x - hit.x, e.y - hit.y) < wd.expl.r + 30)) continue;
            consider({
              type: 'shoot', weapon: wid, dir, aim, power, fuse,
              score: this.scoreBlast(game, wd.expl, hit.x, hit.y, w.id),
            });
          }
        }
      }
    }

    // Direct fire: shotgun and uzi when there is a clear line.
    for (const e of enemies) {
      const dx = e.x - w.x;
      const dy = e.y - w.y;
      const dist = Math.hypot(dx, dy);
      const clear = !game.terrain.raycast(w.x + Math.sign(dx) * 8, w.y - 1, e.x, e.y - 1)
        || game.terrain.raycast(w.x + Math.sign(dx) * 8, w.y - 1, e.x, e.y - 1).dist > dist - 6;
      if (!clear) continue;
      const dir = dx >= 0 ? 1 : -1;
      const aim = Math.atan2(-dy, Math.abs(dx));
      if (Math.abs(aim) > AIM_MAX) continue;
      if (game.ammo(this.team, 'shotgun') !== 0 && dist < 900) {
        consider({ type: 'shoot', weapon: 'shotgun', dir, aim, power: 0, fuse: 0, score: 22 + Math.min(e.hp, 25) * 0.6 + (dist < 300 ? 8 : 0) });
      }
      if (game.ammo(this.team, 'uzi') !== 0 && dist < 320) {
        consider({ type: 'shoot', weapon: 'uzi', dir, aim, power: 0, fuse: 0, score: 26 });
      }
      if (dist < 16 && Math.abs(dy) < 12) {
        consider({ type: 'shoot', weapon: 'punch', dir, aim: w.aim, power: 0, fuse: 0, score: 30 });
      }
      // Weapons added by the W:A packs: same direct-fire / melee handling, scored by rough damage.
      for (const [wid, maxDist, score] of EXTRA_DIRECT) {
        if (game.ammo(this.team, wid) !== 0 && WEAPONS[wid] && dist < maxDist) {
          consider({ type: 'shoot', weapon: wid, dir, aim, power: 0, fuse: 0, score: score + Math.min(e.hp, 30) * 0.2 });
        }
      }
      for (const [wid, score] of EXTRA_MELEE) {
        if (game.ammo(this.team, wid) !== 0 && WEAPONS[wid] && dist < 18 && Math.abs(dy) < 12) {
          consider({ type: 'shoot', weapon: wid, dir, aim: w.aim, power: 0, fuse: 0, score });
        }
      }
    }

    // Strikes (air strike and its W:A relatives) on the most exposed enemy: a row of blasts across the target.
    for (const [wid, ex, count, spacing, weight] of STRIKES) {
      if (!WEAPONS[wid] || game.ammo(this.team, wid) <= 0) continue;
      for (const e of enemies) {
        const dir = e.x >= w.x ? 1 : -1;
        let score = 0;
        const half = (count - 1) / 2;
        for (let k = 0; k < count; k++) {
          const bx = e.x + (k - half) * spacing;
          const gy = game.terrain.raycast(bx, 40, bx, game.waterY);
          score += this.scoreBlast(game, ex, bx, gy ? gy.y : game.waterY, w.id);
        }
        consider({ type: 'at', weapon: wid, dir, x: e.x, y: e.y, score: score * weight });
      }
    }

    // Walkers: only with an enemy at roughly our height inside the walker's reach, and only if the simulated walk
    // (ground path, hops, contact, fuse) actually ends in a blast that reaches an enemy.
    for (const [wid, spec] of WALKERS) {
      const wd = WEAPONS[wid];
      if (!wd || game.ammo(this.team, wid) === 0) continue;
      const reach = spec.speed * wd.fuseTime + (spec.launch ? 400 : 0);
      for (const dir of dirs) {
        if (!enemies.some((e) => (e.x - w.x) * dir > 0 && Math.abs(e.y - w.y) < 40 && Math.abs(e.x - w.x) < reach)) continue;
        const shots = [];
        if (spec.launch) {
          for (let aim = -0.5; aim <= AIM_MAX - 0.05; aim += 0.1) for (let power = 0.3; power <= 1.001; power += 0.1) shots.push([aim, power]);
        } else shots.push([w.aim, 0]);
        for (const [aim, power] of shots) {
          const start = spec.launch
            ? launchVector(w, aim, power, wd.speed, dir)
            : { x: w.x + dir * 8, y: w.y, vx: 0, vy: 0 };
          const hit = this.simulateWalker(game, w, spec, wd.fuseTime, dir, start);
          if (!hit || !enemies.some((e) => Math.hypot(e.x - hit.x, e.y - hit.y) < wd.expl.r + 10)) continue;
          consider({
            type: 'shoot', weapon: wid, dir, aim, power, fuse: 0, score: this.scoreBlast(game, wd.expl, hit.x, hit.y, w.id),
          });
        }
      }
    }
    // Super Sheep flies and is steered at its target after launch (see steerSuperSheep), so it needs no matching height.
    const ss = WEAPONS.supersheep;
    if (ss && game.ammo(this.team, 'supersheep') !== 0) {
      for (const e of enemies) {
        if (Math.abs(e.x - w.x) > ss.speed * ss.fuseTime) continue;
        const dir = e.x >= w.x ? 1 : -1;
        const hit = this.simulateSuperSheep(game, w, ss, dir, e);
        if (!hit || Math.hypot(e.x - hit.x, e.y - hit.y) > ss.expl.r + 10) continue;
        consider({
          type: 'shoot', weapon: 'supersheep', dir, aim: w.aim, power: 0, fuse: 0, foe: e.id, score: this.scoreBlast(game, ss.expl, hit.x, hit.y, w.id),
        });
      }
    }

    if (best.score >= minScore || this.attempts >= 3) {
      if (best.type && best.score > -40) return this.withError(best);
    }
    // No good shot: walk towards the nearest enemy (or away if the best option was too risky).
    const foe = this.nearestEnemy(game, w);
    return { type: 'walk', dir: foe && foe.x < w.x ? -1 : 1 };
  }

  withError(c) {
    if (c.type !== 'shoot') return c;
    const e = { ...c };
    e.aim = Math.max(-AIM_MAX, Math.min(AIM_MAX, c.aim + rnd(-this.lv.aimErr, this.lv.aimErr)));
    e.power = Math.max(0.1, Math.min(1, c.power * (1 + rnd(-this.lv.powErr, this.lv.powErr))));
    return e;
  }
}

export { CHARGE_TIME };
