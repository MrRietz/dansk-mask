// Weapon pack: projectiles. See docs/EXTENDING.md. Registers weapons/objects on import.
//   homing, pigeon, magicbullet  -> 'pj_missile' (steers towards turn.marker)
//   mortar, petrol               -> 'pj_shell'   (explodes on contact, optionally splits / spawns fire)
//   banana, superbanana, mbbomb, vase -> 'pj_bomb' (fused, bouncing; splits into bits when it goes off)
import { registerWeapons, registerObjectType } from '../registry.mjs';
import { stepRocket, moveBody, launchVector } from '../physics.mjs';
import { spawnFire } from '../objects/fire.mjs';
import { DT, GRAVITY, WIND_ACC } from '../constants.mjs';

const BOUNCE_SCALE = [0.2, 1, 1.45]; // turn.bounce 0 none / 1 normal / 2 high

// Contact detonation test shared by missiles and shells: worms count as solid, the owner only after 0.15 s.
const hitsWorm = (g, o) => (x, y) => g.wormAt(x, y, o.age < 0.15 ? o.owner : -1, 2) !== null;

// Explosion plus whatever the object carries along: `split` (a fan of bits) and `fire` (flames).
function detonate(g, o) {
  g.explode(o.x, o.y, o.expl, { owner: o.owner });
  if (o.split) spawnBits(g, o, o.split);
  if (o.fire) spawnFire(g, o.x, o.y - 2, { ...o.fire, owner: o.owner });
  if (o.split || o.fire) g.emit('pj_burst', { x: o.x, y: o.y, variant: o.variant });
  o.dead = true;
}

// split = { n, kind, variant, expl, speed:[min,max], cone (half-angle around straight up), fuse:[min,max], bounce, friction }
function spawnBits(g, o, s) {
  for (let i = 0; i < s.n; i++) {
    const a = -Math.PI / 2 + (s.n > 1 ? (i / (s.n - 1) - 0.5) * 2 * s.cone : 0) + g.rng.range(-0.12, 0.12);
    const sp = g.rng.range(s.speed[0], s.speed[1]);
    const bit = {
      kind: s.kind, variant: s.variant, x: o.x, y: o.y - 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: s.r ?? 2.5,
      expl: s.expl, owner: o.owner, age: 0.2,
    };
    if (s.kind === 'pj_bomb') {
      bit.fuse = g.rng.range(s.fuse[0], s.fuse[1]);
      bit.bounce = s.bounce ?? 0.5;
      bit.friction = s.friction ?? 0.9;
      bit.r = s.r ?? 3;
    } else {
      bit.gmul = 1;
      bit.wind = false;
      bit.life = 6;
    }
    g.spawn(bit);
  }
}

// ---------- objects ----------

// Homing missile / pigeon / magic bullet. Ballistic (bazooka-like) until `lock` seconds have passed, then
// - when a marker was set - steers towards it at `turn` rad/s with no gravity or wind. Without a marker
// the missile keeps flying the way it was fired (pigeons and magic bullets without gravity).
registerObjectType('pj_missile', {
  update(g, o) {
    o.age += DT;
    const t = o.target;
    if (t && o.age >= o.lock) {
      o.gmul = 0;
      o.wind = false;
      let sp = Math.hypot(o.vx, o.vy) || 1;
      let ang = Math.atan2(o.vy, o.vx);
      let diff = Math.atan2(t.y - o.y, t.x - o.x) - ang;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const maxTurn = o.turn * DT;
      ang += Math.max(-maxTurn, Math.min(maxTurn, diff));
      sp += Math.max(-o.accel * DT, Math.min(o.accel * DT, o.cruise - sp));
      o.vx = Math.cos(ang) * sp;
      o.vy = Math.sin(ang) * sp;
    }
    const res = stepRocket(g.terrain, o, DT, g.wind, hitsWorm(g, o));
    const arrived = t && o.age >= o.lock && Math.hypot(t.x - o.x, t.y - o.y) < o.reach;
    if (res || arrived || o.age > o.life) detonate(g, o);
  },
});

// Contact shell: mortar grenade, its clusters, vase shards, petrol bomb.
registerObjectType('pj_shell', {
  update(g, o) {
    o.age += DT;
    const res = stepRocket(g.terrain, o, DT, g.wind, hitsWorm(g, o));
    if (res || o.age > (o.life ?? 12)) detonate(g, o);
  },
});

// Fused bomb that bounces: banana, super banana, their bits, MB bomb, ming vase.
registerObjectType('pj_bomb', {
  update(g, o) {
    o.age += DT;
    if (o.wind && !g.terrain.hitCircle(o.x, o.y + 1, o.r)) o.vx += g.wind * WIND_ACC * DT;
    o.vy += GRAVITY * DT;
    const hit = moveBody(g.terrain, o, DT, o.bounce, o.friction);
    if (hit && hit.speed > 90) g.emit('bounce', { x: o.x, y: o.y });
    o.fuse -= DT;
    if (o.fuse <= 0) detonate(g, o);
  },
});

// ---------- weapon hooks ----------

const setMarker = (g, w, wd, x, y) => {
  g.turn.marker = { x, y };
  return false; // nothing spent: the shot itself is fired with Space
};

function fireMissile(g, w, wd, { power }) {
  const l = launchVector(w, w.aim, power, wd.speed);
  const m = g.turn.marker;
  g.spawn({
    kind: 'pj_missile', variant: wd.id, x: l.x, y: l.y, vx: l.vx, vy: l.vy, r: 2, owner: w.id, age: 0,
    wind: !wd.flies, gmul: wd.flies ? 0 : 0.85, expl: wd.expl, target: m ? { x: m.x, y: m.y } : null,
    lock: wd.lock, turn: wd.turn, cruise: wd.cruise, accel: wd.accel, reach: 8, life: wd.life,
  });
  g.emit('fire', { id: w.id, weapon: wd.id, power });
}

function fireShell(g, w, wd, { power }) {
  const l = launchVector(w, w.aim, power, wd.speed);
  g.spawn({
    kind: 'pj_shell', variant: wd.id, x: l.x, y: l.y, vx: l.vx, vy: l.vy, r: 3, owner: w.id, age: 0,
    wind: !!wd.wind, gmul: 1, expl: wd.expl, split: wd.split, fire: wd.flames, life: 12,
  });
  g.emit('fire', { id: w.id, weapon: wd.id, power });
}

function fireBomb(g, w, wd, { power }) {
  const l = launchVector(w, w.aim, power, wd.speed);
  const scale = wd.bounceable ? BOUNCE_SCALE[g.turn.bounce] ?? 1 : 1;
  g.spawn({
    kind: 'pj_bomb', variant: wd.id, x: l.x, y: l.y, vx: l.vx, vy: l.vy, r: wd.bombR ?? 4, owner: w.id, age: 0,
    fuse: g.turn.fuse, bounce: wd.bounce * scale, friction: wd.friction, wind: !!wd.wind, expl: wd.expl, split: wd.split,
  });
  g.emit('fire', { id: w.id, weapon: wd.id, power });
}

// Ming vase: put down next to the worm like dynamite.
function placeVase(g, w, wd) {
  g.spawn({
    kind: 'pj_bomb', variant: 'vase', x: w.x + w.dir * 8, y: w.y, vx: 0, vy: 0, r: 4, owner: w.id, age: 0,
    fuse: wd.fuseTime, bounce: 0.1, friction: 0.6, wind: false, expl: wd.expl, split: wd.split,
  });
  g.emit('place', { weapon: wd.id });
}

const missileBase = { charge: true, aim: true, target: true, useAt: setMarker, fire: fireMissile };

registerWeapons([
  {
    ...missileBase, id: 'homing', panel: [0, 1], name: 'Homing Missile', icon: '🎯', ammo: 2,
    speed: 700, cruise: 420, accel: 500, turn: 3.2, lock: 0.4, life: 12, expl: { r: 32, dmg: 50, push: 420 },
  },
  {
    id: 'mortar', panel: [0, 2], name: 'Mortar', icon: '🪖', ammo: 3, aim: true, charge: true, speed: 760, wind: true,
    expl: { r: 26, dmg: 30, push: 300 },
    split: {
      n: 4, kind: 'pj_shell', variant: 'mortarbit', expl: { r: 17, dmg: 15, push: 200 }, speed: [140, 240], cone: 0.9,
    },
    fire: fireShell,
  },
  {
    ...missileBase, id: 'pigeon', panel: [0, 3], name: 'Homing Pigeon', icon: '🕊️', ammo: 2, flies: true,
    speed: 360, cruise: 280, accel: 400, turn: 2.6, lock: 0.15, life: 9, expl: { r: 40, dmg: 75, push: 520 },
  },
  {
    id: 'banana', panel: [1, 2], name: 'Banana Bomb', icon: '🍌', ammo: 2, aim: true, charge: true, fuse: true, bounceable: true,
    defFuse: 3, speed: 600, bounce: 0.6, friction: 0.94, expl: { r: 40, dmg: 50, push: 480 },
    split: {
      n: 5, kind: 'pj_bomb', variant: 'minibanana', expl: { r: 28, dmg: 30, push: 320 }, speed: [120, 260], cone: 1.0,
      fuse: [0.9, 1.9], bounce: 0.5, friction: 0.9,
    },
    fire: fireBomb,
  },
  {
    id: 'superbanana', panel: [8, 0], name: 'Super Banana Bomb', icon: '🍌', ammo: 0, crate: 0.05, crateAmount: 1, aim: true,
    charge: true, fuse: true, bounceable: true, defFuse: 3, speed: 600, bounce: 0.55, friction: 0.94, bombR: 5,
    expl: { r: 58, dmg: 75, push: 720 },
    split: {
      n: 9, kind: 'pj_bomb', variant: 'minibanana', expl: { r: 38, dmg: 45, push: 460 }, speed: [140, 300], cone: 1.2,
      fuse: [0.8, 2.2], bounce: 0.5, friction: 0.9, r: 3.5,
    },
    fire: fireBomb,
  },
  {
    id: 'mbbomb', panel: [8, 4], name: 'MB Bomb', icon: '💥', ammo: 0, crate: 0.05, crateAmount: 1, aim: true, charge: true,
    fuse: true, defFuse: 3, speed: 520, bounce: 0, friction: 0.5, wind: true, bombR: 6, expl: { r: 110, dmg: 140, push: 920 },
    fire: fireBomb,
  },
  {
    id: 'petrol', panel: [9, 0], name: 'Petrol Bomb', icon: '🍾', ammo: 2, aim: true, charge: true, speed: 620,
    expl: { r: 18, dmg: 8, push: 160 },
    flames: { count: 26, spread: 130, up: 150, life: [4, 6], dmg: 1, r: 3 },
    fire: fireShell,
  },
  {
    id: 'vase', panel: [9, 2], name: 'Ming Vase', icon: '🏺', ammo: 1, crate: 0.3, placed: true, fuseTime: 5,
    expl: { r: 30, dmg: 30, push: 300 },
    split: {
      n: 10, kind: 'pj_shell', variant: 'shard', r: 2, expl: { r: 18, dmg: 15, push: 200 }, speed: [160, 320], cone: Math.PI * 0.95,
    },
    fire: placeVase,
  },
  {
    ...missileBase, id: 'magicbullet', panel: [11, 4], name: 'Magic Bullet', icon: '🪄', ammo: 0, crate: 0.05, crateAmount: 1,
    flies: true, speed: 900, cruise: 700, accel: 900, turn: 7, lock: 0.1, life: 8, expl: { r: 46, dmg: 95, push: 650 },
  },
]);
