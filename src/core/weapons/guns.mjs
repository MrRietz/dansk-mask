// Weapon pack: guns (firearms, melee, flame thrower). See docs/EXTENDING.md.
// Registers weapons/objects on import.
import { registerWeapons, registerObjectType } from '../registry.mjs';
import { spawnFire } from '../objects/fire.mjs';
import { GRAVITY, DT } from '../constants.mjs';

const aimVec = (w) => ({ dx: w.dir * Math.cos(w.aim), dy: -Math.sin(w.aim) });

// Hitscan burst (handgun, minigun): same contract as the uzi. Ammo is spent at once, the shot
// ends when the last bullet has left the barrel.
const burstFire = (g, w, wd) => {
  g.spend(wd.id);
  g.startBurst(wd.burst, wd.interval, () => g.shootRay(w, wd));
  return 'partial';
};

// Worms within reach of a close-combat attack, in front of the attacker.
function inReach(g, w, reach, height = 14) {
  return g.worms.filter((o) => {
    if (!o.alive || o.id === w.id) return false;
    const dx = (o.x - w.x) * w.dir;
    return dx > -2 && dx < reach && Math.abs(o.y - w.y) < height;
  });
}

// ---------------------------------------------------------------------------------------------
// Custom objects
// ---------------------------------------------------------------------------------------------

// Long bow arrow: flies with (reduced) gravity and sticks in terrain or in a worm for a moment.
registerObjectType('arrow', {
  update(g, o) {
    if (o.stuck) {
      o.life -= DT;
      const host = o.to >= 0 ? g.worms[o.to] : null;
      if (host) {
        if (!host.alive) o.dead = true;
        else {
          o.x = host.x + o.ox;
          o.y = host.y + o.oy;
        }
      }
      if (o.life <= 0) o.dead = true;
      return;
    }
    o.age += DT;
    o.vy += GRAVITY * DT * o.gmul;
    const steps = Math.max(1, Math.ceil((Math.hypot(o.vx, o.vy) * DT) / 2));
    for (let i = 0; i < steps; i++) {
      o.x += (o.vx * DT) / steps;
      o.y += (o.vy * DT) / steps;
      const hit = g.wormAt(o.x, o.y, o.age < 0.15 ? o.owner : -1, 1);
      if (hit) {
        g.hurt(hit, o.dmg, o.owner);
        const sp = Math.hypot(o.vx, o.vy) || 1;
        hit.vx += (o.vx / sp) * o.push;
        hit.vy += (o.vy / sp) * o.push - 60;
        g.knock(hit);
        Object.assign(o, { stuck: true, life: 1.2, to: hit.id, ox: o.x - hit.x, oy: o.y - hit.y });
        g.emit('gunsArrowHit', { x: o.x, y: o.y, worm: true });
        return;
      }
      if (g.terrain.solid(o.x, o.y)) {
        Object.assign(o, { stuck: true, life: 1.2, to: -1 });
        g.emit('gunsArrowHit', { x: o.x, y: o.y, worm: false });
        return;
      }
    }
  },
});

// Dragon ball: a short-lived fireball that launches every worm it touches.
registerObjectType('dragonball', {
  update(g, o) {
    const sp = Math.hypot(o.vx, o.vy);
    const steps = Math.max(1, Math.ceil((sp * DT) / 2));
    for (let i = 0; i < steps; i++) {
      o.x += (o.vx * DT) / steps;
      o.y += (o.vy * DT) / steps;
      o.dist += (sp * DT) / steps;
      for (const w of g.worms) {
        if (!w.alive || w.id === o.owner || o.hit.includes(w.id)) continue;
        if ((w.x - o.x) ** 2 + (w.y - o.y) ** 2 > (w.r + o.r) ** 2) continue;
        o.hit.push(w.id);
        g.hurt(w, o.dmg, o.owner);
        w.vx += (o.vx / sp) * o.push;
        w.vy += (o.vy / sp) * o.push * 0.4 - o.lift;
        g.knock(w);
        g.emit('gunsDragonHit', { x: w.x, y: w.y });
      }
      if (o.dist >= o.range || g.terrain.solid(o.x, o.y)) {
        g.emit('gunsDragonEnd', { x: o.x, y: o.y });
        o.dead = true;
        return;
      }
    }
  },
});

// Kamikaze: carries the worm along a straight line, digs through the first terrain it meets and
// then blows up (the worm does not survive it). Owns the worm's position while it lives.
registerObjectType('kamikaze', {
  update(g, o) {
    const w = g.worms[o.owner];
    if (!w.alive) {
      o.dead = true;
      return;
    }
    o.t += DT;
    if (o.digging) {
      o.digLeft -= DT;
      o.x += o.dx * o.digSpeed * DT;
      o.y += o.dy * o.digSpeed * DT;
      g.terrain.carveCircle(o.x, o.y, o.digR);
      g.emit('carve', { x: o.x, y: o.y, r: o.digR });
    } else {
      const steps = Math.ceil((o.speed * DT) / 2);
      for (let i = 0; i < steps && !o.digging; i++) {
        const nx = o.x + o.dx * 2;
        const ny = o.y + o.dy * 2;
        if (g.terrain.hitCircle(nx, ny, w.r)) o.digging = true;
        else {
          o.x = nx;
          o.y = ny;
        }
      }
    }
    w.x = o.x;
    w.y = o.y;
    w.vx = w.vy = 0;
    w.state = 'air';
    g.emit('gunsKamikazeTrail', { x: o.x, y: o.y });
    const victim = g.worms.find((v) => v.alive && v.id !== w.id && Math.hypot(v.x - o.x, v.y - o.y) < v.r + w.r + 3);
    if (victim || o.t >= o.maxT || (o.digging && o.digLeft <= 0)) {
      g.explode(o.x, o.y, o.expl, { owner: w.id });
      g.hurt(w, w.hp, w.id);
      w.custom = null;
      o.dead = true;
    }
  },
});

// Flame thrower jet: a fast tongue of fire. The shared 'flame' object only checks for worms every
// 0.25 s, which a fast flame would fly straight through, so the jet does its own contact damage
// and leaves an ordinary flame (spawnFire) behind where it ends.
registerObjectType('flamejet', {
  update(g, o) {
    o.life -= DT;
    o.vy += GRAVITY * DT * 0.5;
    const steps = Math.max(1, Math.ceil((Math.hypot(o.vx, o.vy) * DT) / 3));
    for (let i = 0; i < steps; i++) {
      o.x += (o.vx * DT) / steps;
      o.y += (o.vy * DT) / steps;
      const w = g.wormAt(o.x, o.y, o.owner, 3);
      if (w) {
        g.hurt(w, o.dmg, o.owner);
        o.dead = true;
        return;
      }
      if (g.terrain.solid(o.x, o.y)) {
        o.life = 0;
        break;
      }
    }
    if (o.life <= 0) {
      spawnFire(g, o.x, o.y - 2, { count: 1, spread: 15, up: 10, life: [0.8, 1.4], dmg: 1, owner: o.owner });
      o.dead = true;
    }
  },
});

// ---------------------------------------------------------------------------------------------
// Flame thrower helpers: turn.flame = { left, cd } while the stream is running.
// ---------------------------------------------------------------------------------------------

function stopFlame(g, t) {
  if (!t.flame) return;
  t.flame = null;
  g.emit('gunsFlameEnd');
  g.finishShot();
}

// ---------------------------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------------------------

registerWeapons([
  {
    id: 'handgun', panel: [2, 1], name: 'Handgun', icon: '🔫', ammo: 3, aim: true, hitscan: true,
    burst: 6, interval: 0.22, dmg: 3, spread: 0.03, push: 30, fire: burstFire,
  },
  {
    id: 'minigun', panel: [2, 3], name: 'Minigun', icon: '💥', ammo: 1, crate: 0.3, aim: true, hitscan: true,
    burst: 40, interval: 0.045, dmg: 4, spread: 0.09, push: 10, fire: burstFire,
  },
  {
    id: 'longbow', panel: [2, 4], name: 'Longbow', icon: '🏹', ammo: 2, aim: true, shots: 2,
    speed: 850, dmg: 15, push: 120, gmul: 0.4,
    fire(g, w, wd) {
      const t = g.turn;
      const { dx, dy } = aimVec(w);
      const off = w.r + 5;
      g.spawn({
        kind: 'arrow', x: w.x + dx * off, y: w.y - 1 + dy * off, vx: dx * wd.speed, vy: dy * wd.speed, r: 1,
        owner: w.id, age: 0, dmg: wd.dmg, push: wd.push, gmul: wd.gmul, stuck: false, life: 0, to: -1, ox: 0, oy: 0,
      });
      g.emit('gunsArrow', { id: w.id, x: w.x, y: w.y });
      t.shots++;
      t.cool = 0.6;
      return t.shots >= wd.shots ? undefined : 'partial';
    },
  },
  {
    id: 'dragonball', panel: [3, 1], name: 'Dragon Ball', icon: '🐉', ammo: 3, aim: true,
    speed: 420, range: 40, dmg: 30, push: 380, lift: 330,
    fire(g, w, wd) {
      const { dx, dy } = aimVec(w);
      const off = w.r + 2;
      g.spawn({
        kind: 'dragonball', x: w.x + dx * off, y: w.y - 1 + dy * off, vx: dx * wd.speed, vy: dy * wd.speed, r: 7,
        owner: w.id, dist: 0, range: wd.range, dmg: wd.dmg, push: wd.push, lift: wd.lift, hit: [],
      });
      g.emit('gunsDragon', { id: w.id, x: w.x, y: w.y });
    },
  },
  {
    id: 'kamikaze', panel: [3, 2], name: 'Kamikaze', icon: '🪂', ammo: 1, aim: true,
    speed: 260, expl: { r: 35, dmg: 35, push: 380 },
    fire(g, w, wd) {
      if (w.state === 'rope') g.releaseRope(w);
      const { dx, dy } = aimVec(w);
      w.custom = { pre: () => true }; // the kamikaze object moves the worm
      w.state = 'air';
      w.noFall = true;
      g.spawn({
        kind: 'kamikaze', x: w.x, y: w.y, dx, dy, owner: w.id, t: 0, maxT: 1.5, speed: wd.speed, digging: false,
        digLeft: 0.35, digSpeed: 160, digR: 9, expl: wd.expl,
      });
      g.emit('gunsKamikaze', { id: w.id, x: w.x, y: w.y });
    },
  },
  {
    id: 'suicide', panel: [3, 3], name: 'Suicide Bomber', icon: '☠️', ammo: 1, crate: 0.2,
    expl: { r: 60, dmg: 80, push: 560 }, poisonRange: 150, poison: 5,
    fire(g, w, wd) {
      for (const o of g.worms) {
        if (o.alive && o.id !== w.id && Math.hypot(o.x - w.x, o.y - w.y) <= wd.poisonRange) g.sicken(o, wd.poison);
      }
      g.emit('gunsPoison', { x: w.x, y: w.y, r: wd.poisonRange });
      g.explode(w.x, w.y, wd.expl, { owner: w.id });
      g.hurt(w, w.hp, w.id);
    },
  },
  {
    id: 'prod', panel: [3, 4], name: 'Prod', icon: '👉', ammo: -1, crate: 0, melee: true, push: 80,
    fire(g, w, wd) {
      for (const o of inReach(g, w, 16)) {
        o.vx += w.dir * wd.push;
        o.vy -= 50;
        g.knock(o);
      }
      g.emit('gunsMelee', { weapon: wd.id, x: w.x + w.dir * 10, y: w.y, dir: w.dir });
    },
  },
  {
    id: 'axe', panel: [1, 3], name: 'Battle Axe', icon: '🪓', ammo: 2, melee: true, dmg: 30, carve: 14,
    fire(g, w, wd) {
      const cx = w.x + w.dir * (w.r + 8);
      const cy = w.y + 2;
      for (const o of inReach(g, w, 20)) {
        g.hurt(o, wd.dmg, w.id);
        o.vx += w.dir * 200;
        o.vy -= 180;
        g.knock(o);
      }
      g.terrain.carveCircle(cx, cy, wd.carve);
      g.emit('carve', { x: cx, y: cy, r: wd.carve });
      g.emit('gunsMelee', { weapon: wd.id, x: cx, y: cy, dir: w.dir });
    },
  },
  {
    id: 'bat', panel: [6, 3], name: 'Baseball Bat', icon: '⚾', ammo: 2, aim: true, melee: true, dmg: 10, push: 600,
    fire(g, w, wd) {
      const { dx, dy } = aimVec(w);
      for (const o of inReach(g, w, 22)) {
        g.hurt(o, wd.dmg, w.id);
        o.vx += dx * wd.push;
        o.vy += dy * wd.push - 30;
        g.knock(o);
      }
      g.emit('gunsMelee', { weapon: wd.id, x: w.x + dx * 14, y: w.y + dy * 14, dir: w.dir });
    },
  },
  {
    id: 'flamethrower', panel: [8, 2], name: 'Flame Thrower', icon: '🔥', ammo: 2, aim: true,
    duration: 5, rate: 0.08, speed: 360, jetLife: 0.4, dmg: 1,
    // Hold Space: the stream runs until Space is released or the tank is empty.
    onFireDown(g, w, t) {
      const wd = this;
      if (t.flame || t.fired || t.burst || t.charging || g.ammo(t.team, wd.id) === 0) return true;
      g.spend(wd.id);
      t.flame = { left: wd.duration, cd: 0 };
      g.emit('gunsFlameStart', { id: w.id });
      return true;
    },
    onFireUp(g, w, t) {
      stopFlame(g, t);
    },
    onDeselect(g, w, t) {
      stopFlame(g, t);
    },
    tick(g, w, t) {
      const f = t.flame;
      if (!f) return;
      const wd = this;
      f.left -= DT;
      f.cd -= DT;
      while (f.cd <= 0) {
        f.cd += wd.rate;
        const { dx, dy } = aimVec(w);
        const off = w.r + 8;
        g.spawn({
          kind: 'flamejet', x: w.x + dx * off, y: w.y - 1 + dy * off, r: 3, owner: w.id, dmg: wd.dmg,
          vx: dx * wd.speed + g.rng.range(-20, 20), vy: dy * wd.speed + g.rng.range(-25, 25), life: wd.jetLife,
        });
      }
      if (f.left <= 0) stopFlame(g, t);
    },
  },
]);
