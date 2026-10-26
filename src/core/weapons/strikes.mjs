// Weapon pack: strikes (air strikes, moles and super weapons). See docs/EXTENDING.md.
//
// Shared object types:
//   strikeplane   flies over the map and calls a payload function for every drop position
//   strikebomb    napalm canister / mail letter / carpet bomb dropped by a plane
//   strikesheep   burning, bouncing sheep (Cattle Attack)
//   strikemole    mole (Mole Squadron) or Mole Bomb: lands, tunnels through the ground and explodes
//   strikedonkey  Concrete Donkey
//   meteor        Armageddon rain
//   armageddon    controller that spawns the meteors over time
//   nukewater     Nuclear Test: screen flash and gradually rising water
import { registerWeapons, registerObjectType, WEAPONS } from '../registry.mjs';
import { moveBody, stepRocket, launchVector } from '../physics.mjs';
import { spawnFire } from '../objects/fire.mjs';
import { DT, GRAVITY, WIND_ACC } from '../constants.mjs';

const PLANE_Y = 40;
const PLANE_SPEED = 420;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- helpers ----------

// Starts a plane that flies over x in the chosen direction and drops one `payload` per offset.
function launchPlane(g, w, wd, x, offsets) {
  const dir = g.turn.strikeDir || w.dir;
  const drops = offsets.map((k) => x + k).sort((a, b) => (a - b) * dir);
  g.spawn({
    kind: 'strikeplane', payload: wd.id, x: x - dir * 700, y: PLANE_Y, dir, speed: PLANE_SPEED,
    drops, next: 0, owner: w.id, age: 0,
  });
  g.emit('strike', { weapon: wd.id, name: wd.name, x, dir });
  return true;
}

// n evenly spaced offsets centred on 0, with optional random jitter (px).
function spread(g, n, gap, jitter = 0) {
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * gap + (jitter ? g.rng.range(-jitter, jitter) : 0));
}

// Fire burst whose flames drift with the wind.
function burstFire(g, x, y, owner, opts) {
  const before = g.objects.length;
  spawnFire(g, x, y, { ...opts, owner });
  for (let i = before; i < g.objects.length; i++) g.objects[i].vx += g.wind * 40;
}

function nearestEnemy(g, o) {
  let best = null;
  let bd = Infinity;
  for (const w of g.worms) {
    if (!w.alive || w.team === o.team) continue;
    const d = Math.hypot(w.x - o.x, w.y - o.y);
    if (d < bd) {
      bd = d;
      best = w;
    }
  }
  return best;
}

// ---------- plane ----------
const PAYLOADS = {
  napalm(g, p, x) {
    g.spawn({
      kind: 'strikebomb', variant: 'napalm', x, y: p.y + 8, vx: p.dir * 40, vy: 40, r: 3, owner: p.owner, age: 0,
      gmul: 1, windMul: 1, expl: WEAPONS.napalm.expl, flames: WEAPONS.napalm.flames,
    });
  },
  mail(g, p, x) {
    g.spawn({
      kind: 'strikebomb', variant: g.rng.chance(0.5) ? 'letter' : 'parcel', x, y: p.y + 8, vx: g.rng.range(-20, 20), vy: 30,
      r: 3, owner: p.owner, age: 0, gmul: 0.35, windMul: 1.6, tv: 150, flutter: 110, phase: g.rng.range(0, 6.28),
      expl: WEAPONS.mail.expl,
    });
  },
  minestrike(g, p, x) {
    g.spawn({
      kind: 'mine', x, y: p.y + 8, vx: g.rng.range(-35, 35), vy: 40, owner: p.owner, expl: WEAPONS.minestrike.expl,
      r: 4, arm: 2.5, trig: false, fuse: 0,
    });
  },
  molesquadron(g, p, x) {
    g.spawn({
      kind: 'strikemole', variant: 'squad', x, y: p.y + 8, vx: p.dir * 50, vy: 30, r: 4, carve: 6, state: 'fall', fuse: null,
      dig: WEAPONS.molesquadron.digTime, age: 0, seek: true, speed: 46, owner: p.owner, team: g.worms[p.owner].team, dir: p.dir,
      ang: 0, acc: 0, expl: WEAPONS.molesquadron.expl,
    });
  },
  sheepstrike(g, p, x) {
    g.spawn({
      kind: 'strikesheep', x, y: p.y + 8, vx: p.dir * g.rng.range(20, 80), vy: 30, r: 5, dir: p.dir, owner: p.owner, age: 0,
      fuse: g.rng.range(3.5, 4.5), flameCd: 0, expl: WEAPONS.sheepstrike.expl, flames: WEAPONS.sheepstrike.flames,
    });
  },
  carpet(g, p, x) {
    g.spawn({
      kind: 'strikebomb', variant: 'carpet', x, y: p.y + 8, vx: p.dir * 12, vy: 40, r: 3, owner: p.owner, age: 0, bounce: 0.4,
      fuse: null, windMul: 0.3, expl: WEAPONS.carpet.expl,
    });
  },
};

registerObjectType('strikeplane', {
  noBounds: true,
  update(g, o) {
    o.age += DT;
    o.x += o.dir * o.speed * DT;
    while (o.next < o.drops.length && (o.x - o.drops[o.next]) * o.dir >= 0) {
      PAYLOADS[o.payload]?.(g, o, o.drops[o.next], o.next);
      o.next++;
    }
    if ((o.dir > 0 && o.x > g.terrain.w + 250) || (o.dir < 0 && o.x < -250) || o.age > 15) o.dead = true;
  },
});

// ---------- bombs (napalm, mail, carpet) ----------
function detonateBomb(g, o) {
  g.explode(o.x, o.y, o.expl, { owner: o.owner });
  if (o.flames) burstFire(g, o.x, o.y - 2, o.owner, o.flames);
  o.dead = true;
}

registerObjectType('strikebomb', {
  update(g, o) {
    o.age += DT;
    o.vx += g.wind * WIND_ACC * (o.windMul ?? 1) * DT;
    if (o.flutter) o.vx += Math.sin(o.age * 9 + o.phase) * o.flutter * DT;
    if (o.bounce === undefined) {
      // contact bomb: explodes on the first solid pixel or worm
      const res = stepRocket(g.terrain, o, DT, 0, (x, y) => g.wormAt(x, y, -1, 2) !== null);
      if (o.tv && o.vy > o.tv) o.vy = o.tv;
      if (res) detonateBomb(g, o);
      return;
    }
    // carpet bomb: bounces, the fuse starts at the first impact
    o.vy += GRAVITY * DT;
    const hit = moveBody(g.terrain, o, DT, o.bounce, 0.55);
    if (hit) {
      if (hit.speed > 90) g.emit('bounce', { x: o.x, y: o.y });
      if (o.fuse === null) o.fuse = g.rng.range(0.35, 0.9);
    }
    if (o.fuse !== null) o.fuse -= DT;
    if ((o.fuse !== null && o.fuse <= 0) || o.age > 9) detonateBomb(g, o);
  },
});

// ---------- burning sheep ----------
registerObjectType('strikesheep', {
  update(g, o) {
    o.age += DT;
    o.fuse -= DT;
    o.vy += GRAVITY * DT;
    const hit = moveBody(g.terrain, o, DT, 0.55, 0.92);
    if (hit && hit.speed > 90) g.emit('sheepHop', { x: o.x, y: o.y });
    if (Math.abs(o.vx) > 10) o.dir = o.vx > 0 ? 1 : -1;
    o.flameCd -= DT;
    if (o.flameCd <= 0) {
      o.flameCd = 0.12;
      spawnFire(g, o.x, o.y - 2, { count: 1, spread: 30, up: 30, life: [1.5, 2.5], dmg: 1, owner: o.owner });
    }
    if (o.fuse <= 0) {
      g.explode(o.x, o.y, o.expl, { owner: o.owner });
      burstFire(g, o.x, o.y - 2, o.owner, o.flames);
      o.dead = true;
    }
  },
});

// ---------- moles ----------
function detonateMole(g, o) {
  g.explode(o.x, o.y, o.expl, { owner: o.owner });
  o.dead = true;
}

function carveAt(g, o) {
  g.terrain.carveCircle(o.x, o.y, o.carve);
  g.emit('carve', { x: o.x, y: o.y, r: o.carve });
}

registerObjectType('strikemole', {
  update(g, o) {
    o.age += DT;
    if (o.fuse !== null) {
      o.fuse -= DT;
      if (o.fuse <= 0) return detonateMole(g, o);
    }
    if (o.age > 14) return detonateMole(g, o);
    if (o.state === 'fall') {
      o.vy += GRAVITY * DT;
      const hit = moveBody(g.terrain, o, DT, 0.2, 0.8);
      if (hit) {
        // landed: burrow in. Squad moles dig for a fixed time, the Mole Bomb runs on its throw fuse.
        o.state = 'dig';
        o.vx = o.vy = 0;
        if (o.fuse === null) o.fuse = o.dig;
        carveAt(g, o);
      }
      return;
    }
    // dig: heading towards the nearest enemy (squad) or a wandering downward path (bomb)
    if (o.seek) {
      const e = nearestEnemy(g, o);
      const dxE = e ? e.x - o.x : o.dir;
      const dyE = e ? e.y - o.y : 0;
      const sx = dxE >= 0 ? 1 : -1;
      const slope = clamp(dyE / Math.max(Math.abs(dxE), 20), -0.4, 0.5) + (e && Math.hypot(dxE, dyE) < 60 ? 0 : 0.12);
      o.ang = Math.atan2(slope, sx);
      if (e && g.wormAt(o.x, o.y, o.owner, 12)) o.fuse = Math.min(o.fuse, 0.25);
    } else {
      o.ang = clamp(o.ang + g.rng.range(-4, 4) * DT, 0.3, Math.PI - 0.3);
    }
    const step = o.speed * DT;
    o.x += Math.cos(o.ang) * step;
    o.y += Math.sin(o.ang) * step;
    o.acc += step;
    if (o.acc >= 2) {
      o.acc = 0;
      carveAt(g, o);
    }
    // broke out into open air: fall again and re-burrow on the next landing
    if (!g.terrain.hitCircle(o.x, o.y, o.carve + 1.5)) {
      o.state = 'fall';
      o.vx = Math.cos(o.ang) * o.speed;
      o.vy = Math.sin(o.ang) * o.speed;
    }
  },
});

// ---------- Concrete Donkey ----------
const DONKEY_HITS = [
  { r: 70, dmg: 100, push: 720 },
  { r: 52, dmg: 60, push: 520 },
  { r: 38, dmg: 40, push: 400 },
];

registerObjectType('strikedonkey', {
  update(g, o) {
    o.age += DT;
    o.cool = Math.max(0, o.cool - DT);
    o.vy += GRAVITY * DT;
    const hit = moveBody(g.terrain, o, DT, 0.35, 0.9);
    const onWorm = !hit && g.wormAt(o.x, o.y, -1, o.r) !== null;
    if ((hit || onWorm) && o.cool <= 0) {
      g.explode(o.x, o.y, DONKEY_HITS[o.hits], { owner: o.owner });
      o.hits++;
      if (o.hits >= DONKEY_HITS.length) {
        o.dead = true;
        return;
      }
      o.vx = g.rng.range(-50, 50);
      o.vy = -260;
      o.cool = 0.3;
    }
    if (o.age > 14) o.dead = true;
  },
});

// ---------- Armageddon ----------
const METEOR_EXPL = { r: 30, dmg: 30, push: 300 };

registerObjectType('meteor', {
  update(g, o) {
    o.age += DT;
    const res = stepRocket(g.terrain, o, DT, 0, (x, y) => g.wormAt(x, y, -1, 2) !== null);
    if (res) {
      g.explode(o.x, o.y, METEOR_EXPL, { owner: o.owner });
      burstFire(g, o.x, o.y - 2, o.owner, { count: 4, spread: 80, up: 120, life: [1.5, 3], dmg: 1 });
      o.dead = true;
    }
  },
});

registerObjectType('armageddon', {
  noBounds: true,
  update(g, o) {
    o.t += DT;
    const want = o.t >= o.dur ? o.total : Math.floor((o.t / o.dur) * o.total);
    while (o.spawned < want) {
      o.spawned++;
      const w = g.terrain.w;
      g.spawn({
        kind: 'meteor', x: o.dx > 0 ? g.rng.range(-250, w) : g.rng.range(0, w + 250), y: -60,
        vx: o.dx * g.rng.range(110, 180), vy: g.rng.range(300, 380), r: 3, gmul: 0.1, owner: o.owner, age: 0,
        size: g.rng.range(0.8, 1.3),
      });
    }
    if (o.t >= o.dur) o.dead = true;
  },
});

// ---------- Nuclear Test ----------
registerObjectType('nukewater', {
  noBounds: true,
  update(g, o) {
    o.t += DT;
    const target = o.rise * Math.min(1, o.t / o.dur);
    g.waterY = Math.max(150, g.waterY - (target - o.done));
    o.done = target;
    if (o.t >= o.dur) o.dead = true;
  },
});

// ---------- weapons ----------
function superWeapon(g, wd, spawn) {
  g.spend(wd.id);
  g.finishShot();
  spawn();
}

registerWeapons([
  {
    id: 'napalm', panel: [5, 1], strike: true, crateAmount: 1, name: 'Napalm Strike', icon: '🔥', ammo: 1, target: true,
    expl: { r: 14, dmg: 10, push: 200 },
    flames: { count: 12, spread: 110, up: 150, life: [3, 5], dmg: 1 },
    useAt: (g, w, wd, x) => launchPlane(g, w, wd, x, spread(g, 6, 34)),
  },
  {
    id: 'mail', panel: [5, 2], strike: true, crateAmount: 1, name: 'Mail Strike', icon: '✉️', ammo: 1, target: true,
    expl: { r: 26, dmg: 30, push: 320 },
    useAt: (g, w, wd, x) => launchPlane(g, w, wd, x, spread(g, 6, 40, 8)),
  },
  {
    id: 'minestrike', panel: [5, 3], strike: true, crateAmount: 1, name: 'Mine Strike', icon: '💥', ammo: 1, target: true,
    expl: { r: 30, dmg: 50, push: 360 },
    useAt: (g, w, wd, x) => launchPlane(g, w, wd, x, spread(g, 6, 40, 10)),
  },
  {
    id: 'molesquadron', panel: [5, 4], strike: true, crateAmount: 1, name: 'Mole Squadron', icon: '🐀', ammo: 1, target: true,
    digTime: 3, expl: { r: 28, dmg: 30, push: 320 },
    useAt: (g, w, wd, x) => launchPlane(g, w, wd, x, spread(g, 5, 40, 6)),
  },
  {
    id: 'molebomb', panel: [4, 4], crateAmount: 1, name: 'Mole Bomb', icon: '🐭', ammo: 1, aim: true, charge: true, fuse: true,
    defFuse: 3, speed: 600, expl: { r: 40, dmg: 50, push: 420 },
    fire(g, w, wd, { power }) {
      const l = launchVector(w, w.aim, power, wd.speed);
      g.spawn({
        kind: 'strikemole', variant: 'bomb', x: l.x, y: l.y, vx: l.vx, vy: l.vy, r: 4, carve: 7, state: 'fall',
        fuse: g.turn.fuse, age: 0, seek: false, speed: 60, owner: w.id, team: w.team, dir: w.dir,
        ang: Math.PI / 2 - w.dir * 0.5, acc: 0, expl: wd.expl,
      });
      g.emit('fire', { id: w.id, weapon: wd.id, power });
    },
  },
  {
    id: 'sheepstrike', panel: [9, 3], strike: true, crate: 0.05, name: 'Sheep Strike', icon: '🐑', ammo: 0, target: true,
    expl: { r: 30, dmg: 35, push: 340 },
    flames: { count: 10, spread: 140, up: 160, life: [2.5, 4.5], dmg: 1 },
    useAt: (g, w, wd, x) => launchPlane(g, w, wd, x, spread(g, 5, 50, 8)),
  },
  {
    id: 'carpet', panel: [9, 4], strike: true, crate: 0.05, name: 'Carpet Bomb', icon: '🛩️', ammo: 0, target: true,
    expl: { r: 30, dmg: 25, push: 280 },
    useAt: (g, w, wd, x) => launchPlane(g, w, wd, x, spread(g, 12, 16)),
  },
  {
    id: 'donkey', panel: [10, 2], crate: 0.03, name: 'Concrete Donkey', icon: '🫏', ammo: 0, target: true,
    expl: DONKEY_HITS[0],
    useAt(g, w, wd, x) {
      g.spawn({
        kind: 'strikedonkey', x: clamp(x, 20, g.terrain.w - 20), y: -80, vx: 0, vy: 200, r: 12, hits: 0, cool: 0, age: 0, owner: w.id,
      });
      g.emit('strike', { weapon: wd.id, name: wd.name, x, dir: 0 });
      return true;
    },
  },
  {
    id: 'nuke', panel: [10, 3], crate: 0.03, name: 'Nuclear Test', icon: '☢️', ammo: 0, instant: true,
    sick: 10, rise: 60, riseTime: 4,
    onSelect(g, w, turn) {
      const wd = WEAPONS.nuke;
      superWeapon(g, wd, () => {
        g.emit('flash', { weapon: wd.id });
        for (const o of g.worms) if (o.alive) g.sicken(o, wd.sick);
        g.spawn({ kind: 'nukewater', t: 0, dur: wd.riseTime, rise: wd.rise, done: 0, owner: w.id });
      });
    },
  },
  {
    id: 'armageddon', panel: [10, 4], crate: 0.03, name: 'Armageddon', icon: '☄️', ammo: 0, instant: true,
    duration: 12, meteors: 60,
    onSelect(g, w) {
      const wd = WEAPONS.armageddon;
      superWeapon(g, wd, () => {
        g.spawn({
          kind: 'armageddon', t: 0, dur: wd.duration, total: wd.meteors, spawned: 0, dx: g.rng.chance(0.5) ? 1 : -1, owner: w.id,
        });
        g.emit('armageddon', {});
      });
    },
  },
]);
