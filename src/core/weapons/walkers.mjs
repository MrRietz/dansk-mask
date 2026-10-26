// Weapon pack: walkers. See docs/EXTENDING.md. Registers weapons/objects on import.
//   sheeplauncher -> 'wk_sheep'      (launched ballistically, lands and walks like a sheep, Space detonates)
//   supersheep    -> 'wk_supersheep' (flies, steered with the arrow keys, explodes on contact)
//   madcow        -> 'wk_cow'        (a herd of 1-5 cows that run off in the facing direction)
//   oldwoman      -> 'wk_oldwoman'   (walks slowly, cannot be detonated early)
//   salvation     -> 'wk_pastor'     (walks, throws tambourines 'wk_tamb', Space detonates)
//   skunk         -> 'wk_skunk'      (walks and hops, leaves a poison gas cloud)
// Every walker counts its `fuse` down and explodes when it reaches 0, so the turn always ends.
import { registerWeapons, registerObjectType } from '../registry.mjs';
import { moveBody, groundStep, snapDown, unstick, stepRocket, launchVector } from '../physics.mjs';
import { DT, GRAVITY } from '../constants.mjs';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function detonate(g, o) {
  g.explode(o.x, o.y, o.expl, { owner: o.owner });
  o.dead = true;
}

// Shared "walking figure" physics. Air: gravity + bounce until it lands on something flat. Ground: follows
// the terrain `speed` px/s, climbing up to `climb` px per step. Returns 'blocked' when a step could not be
// taken (the caller decides: hop, turn round or explode), 'landed' on the tick it touches down, else null.
function walk(g, o, { speed, climb = 3 }) {
  if (o.state === 'air') {
    o.vy += GRAVITY * DT;
    const hit = moveBody(g.terrain, o, DT, 0.2, 0.9);
    if (hit && hit.ny < -0.5) {
      o.state = 'ground';
      o.vx = o.vy = 0;
      return 'landed';
    }
    return null;
  }
  if (!g.terrain.hitCircle(o.x, o.y + 1, o.r) && !snapDown(g.terrain, o, 3)) {
    o.state = 'air';
    o.vx = o.dir * speed * 0.5;
    o.vy = 0;
    return null;
  }
  let res = null;
  o.walkAcc += speed * DT;
  while (o.walkAcc >= 1) {
    o.walkAcc -= 1;
    if (!groundStep(g.terrain, o, o.dir, climb)) {
      res = 'blocked';
      break;
    }
  }
  snapDown(g.terrain, o, 3);
  return res;
}

const hop = (o, vx, vy) => {
  o.state = 'air';
  o.vx = o.dir * vx;
  o.vy = vy;
};

// True when a worm other than the owner is within `d` px.
const touchesEnemy = (g, o, d) => g.worms.some((w) => w.alive && w.id !== o.owner && Math.hypot(w.x - o.x, w.y - o.y) < d);

// Adds a walker next to the active worm (like g.place) and pushes it out of any terrain.
function spawnWalker(g, w, wd, o) {
  const x = w.x + w.dir * 8;
  const obj = {
    x, y: w.y, vx: 0, vy: 0, owner: w.id, dir: w.dir, age: 0, state: 'air', walkAcc: 0, expl: wd.expl,
    fuse: wd.fuseTime, ...o,
  };
  unstick(g.terrain, obj);
  g.spawn(obj);
  return obj;
}

// Space pressed while one of our walkers of this kind is out: detonate it. Returns true when it was swallowed.
const detonateOwn = (kind) => (g, w) => {
  const o = g.objects.find((x) => x.kind === kind && x.owner === w.id && !x.dead);
  if (!o) return false;
  o.fuse = 0;
  return true;
};

// ---------- objects ----------

registerObjectType('wk_sheep', {
  update(g, o) {
    o.age += DT;
    o.fuse -= DT;
    if (o.fuse <= 0) return detonate(g, o);
    if (walk(g, o, { speed: 80, climb: 3 }) === 'blocked') {
      hop(o, 60, -170);
      g.emit('sheepHop', { x: o.x, y: o.y });
    }
    if (o.state === 'ground' && touchesEnemy(g, o, 12)) o.fuse = Math.min(o.fuse, 0.3);
    return undefined;
  },
});

// Flies at constant speed; the arrow keys of the owner's turn rotate the heading towards the pressed direction.
registerObjectType('wk_supersheep', {
  update(g, o) {
    o.age += DT;
    o.fuse -= DT;
    if (o.fuse <= 0) return detonate(g, o);
    const inp = g.turn?.input;
    if (inp && g.worms[o.owner].team === g.turn.team) {
      const dx = inp.r - inp.l;
      const dy = inp.d - inp.u;
      if (dx || dy) {
        const diff = Math.atan2(Math.sin(Math.atan2(dy, dx) - o.ang), Math.cos(Math.atan2(dy, dx) - o.ang));
        o.ang += clamp(diff, -o.turn * DT, o.turn * DT);
      }
    }
    o.vx = Math.cos(o.ang) * o.speed;
    o.vy = Math.sin(o.ang) * o.speed;
    o.dir = Math.cos(o.ang) >= 0 ? 1 : -1;
    const hit = stepRocket(g.terrain, o, DT, 0, (x, y) => g.wormAt(x, y, o.age < 0.4 ? o.owner : -1, 3) !== null);
    if (hit) detonate(g, o);
    return undefined;
  },
});

// A cow waits `wait` seconds (hidden inside the herd's start point), then runs until it meets a wall, a worm or its fuse.
registerObjectType('wk_cow', {
  update(g, o) {
    if (o.wait > 0) {
      o.wait -= DT;
      if (o.wait <= 0) g.emit('wkMoo', { x: o.x, y: o.y });
      return undefined;
    }
    o.age += DT;
    o.fuse -= DT;
    if (o.fuse <= 0) return detonate(g, o);
    const res = walk(g, o, { speed: o.speed, climb: 4 });
    if (res === 'blocked' || (o.state === 'ground' && touchesEnemy(g, o, 10))) detonate(g, o);
    return undefined;
  },
});

registerObjectType('wk_oldwoman', {
  update(g, o) {
    o.age += DT;
    o.fuse -= DT;
    if (o.fuse <= 0) {
      g.emit('wkWoman', { x: o.x, y: o.y });
      return detonate(g, o);
    }
    if (walk(g, o, { speed: 22, climb: 3 }) === 'blocked') o.dir = -o.dir;
    return undefined;
  },
});

registerObjectType('wk_pastor', {
  update(g, o) {
    o.age += DT;
    o.fuse -= DT;
    if (o.fuse <= 0) return detonate(g, o);
    if (walk(g, o, { speed: 38, climb: 3 }) === 'blocked') hop(o, 40, -170);
    o.throwT -= DT;
    if (o.throwT <= 0) {
      o.throwT = 0.9;
      g.spawn({
        kind: 'wk_tamb', x: o.x, y: o.y - 8, vx: g.rng.range(-180, 180), vy: -g.rng.range(120, 260), r: 2, owner: o.owner,
        age: 0, gmul: 1, life: 3, expl: { r: 16, dmg: 10, push: 160 },
      });
      g.emit('wkTamb', { x: o.x, y: o.y });
    }
    return undefined;
  },
});

// Tambourine: a small contact shell thrown by the pastor.
registerObjectType('wk_tamb', {
  update(g, o) {
    o.age += DT;
    const hit = stepRocket(g.terrain, o, DT, 0, (x, y) => g.wormAt(x, y, o.age < 0.3 ? o.owner : -1, 2) !== null);
    if (hit || o.age > o.life) detonate(g, o);
  },
});

// Skunk: wanders and hops, and every 0.5 s releases gas that makes every worm within 60 px sick.
registerObjectType('wk_skunk', {
  update(g, o) {
    o.age += DT;
    o.fuse -= DT;
    if (o.fuse <= 0) return detonate(g, o);
    const res = walk(g, o, { speed: 30, climb: 3 });
    if (res === 'blocked') {
      o.stuck++;
      if (o.stuck > 3) {
        o.dir = -o.dir;
        o.stuck = 0;
      }
      hop(o, 50, -170);
    } else if (o.state === 'ground') {
      o.hopT -= DT;
      if (o.hopT <= 0) {
        o.hopT = g.rng.range(1.2, 2.4);
        hop(o, 40, -150);
      }
    }
    o.gasT -= DT;
    if (o.gasT <= 0) {
      o.gasT = 0.5;
      for (const w of g.worms) {
        if (w.alive && Math.hypot(w.x - o.x, w.y - o.y) < 60) g.sicken(w, 6);
      }
      g.emit('wkGas', { x: o.x, y: o.y, r: 60 });
    }
    return undefined;
  },
});

// ---------- weapons ----------

registerWeapons([
  {
    id: 'sheeplauncher', panel: [0, 4], crate: 0.3, name: 'Sheep Launcher', icon: '🐑', ammo: 1, aim: true, charge: true,
    speed: 560, fuseTime: 6, expl: { r: 46, dmg: 75, push: 500 },
    fire(g, w, wd, { power }) {
      const l = launchVector(w, w.aim, power, wd.speed);
      g.spawn({
        kind: 'wk_sheep', x: l.x, y: l.y, vx: l.vx, vy: l.vy, r: 5, owner: w.id, dir: w.dir, age: 0, state: 'air', walkAcc: 0,
        fuse: wd.fuseTime, expl: wd.expl,
      });
      g.emit('fire', { id: w.id, weapon: wd.id, power });
    },
    onFireDown: detonateOwn('wk_sheep'),
  },
  {
    id: 'supersheep', panel: [4, 3], crate: 0.2, name: 'Super Sheep', icon: '🦸', ammo: 1, fuseTime: 6, speed: 230, turn: 3.2,
    expl: { r: 70, dmg: 80, push: 640 },
    fire(g, w, wd) {
      spawnWalker(g, w, wd, {
        kind: 'wk_supersheep', r: 4, ang: w.dir > 0 ? -0.35 : Math.PI + 0.35, speed: wd.speed, turn: wd.turn, gmul: 0,
      });
      g.emit('place', { weapon: wd.id });
    },
    onFireDown: detonateOwn('wk_supersheep'),
  },
  {
    id: 'madcow', panel: [10, 0], ammo: 0, crate: 0.05, crateAmount: 1, name: 'Mad Cow', icon: '🐄', fuse: true, defFuse: 3,
    fuseTime: 5, expl: { r: 32, dmg: 45, push: 380 },
    fire(g, w, wd) {
      const n = clamp(g.turn.fuse | 0, 1, 5);
      for (let i = 0; i < n; i++) {
        spawnWalker(g, w, wd, { kind: 'wk_cow', r: 5, speed: g.rng.range(105, 135), wait: i * 0.22 });
      }
      g.emit('place', { weapon: wd.id });
    },
  },
  {
    id: 'oldwoman', panel: [10, 1], ammo: 0, crate: 0.05, name: 'Old Woman', icon: '👵', fuseTime: 5,
    expl: { r: 55, dmg: 80, push: 560 },
    fire(g, w, wd) {
      spawnWalker(g, w, wd, { kind: 'wk_oldwoman', r: 5 });
      g.emit('place', { weapon: wd.id });
    },
  },
  {
    id: 'salvation', panel: [8, 3], ammo: 0, crate: 0.05, name: 'Salvation Army', icon: '🪘', fuseTime: 8,
    expl: { r: 60, dmg: 85, push: 600 },
    fire(g, w, wd) {
      spawnWalker(g, w, wd, { kind: 'wk_pastor', r: 6, throwT: 0.8 });
      g.emit('place', { weapon: wd.id });
    },
    onFireDown: detonateOwn('wk_pastor'),
  },
  {
    id: 'skunk', panel: [9, 1], crate: 0.3, name: 'Skunk', icon: '🦨', ammo: 1, fuseTime: 5, expl: { r: 26, dmg: 20, push: 240 },
    fire(g, w, wd) {
      spawnWalker(g, w, wd, { kind: 'wk_skunk', r: 4, stuck: 0, hopT: 1, gasT: 0.2 });
      g.emit('place', { weapon: wd.id });
    },
  },
]);
