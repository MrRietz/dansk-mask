// Weapon pack: tools (blow torch, drill, girder pack, bungee, parachute, jet pack, scales, select worm,
// freeze, earthquake). See docs/EXTENDING.md. Registers weapons/objects on import.
//
// Most tools take over the active worm through `worm.custom = { tool, pre }` (cleared by the engine when
// the turn ends). Held tools (torch, drill, bungee) run as a "burst": that locks weapon switching,
// walking and jumping while they work and gives them a timer for free.
import { registerWeapons, registerObjectType } from '../registry.mjs';
import { snapDown, moveBody, unstick } from '../physics.mjs';
import { DT, GRAVITY } from '../constants.mjs';

const TORCH_TIME = 5; // s
const TORCH_STEP = 0.115; // s between carves (7 ticks)
const DRILL_TIME = 5;
const DRILL_STEP = 0.095; // 6 ticks
const JET_FUEL = 4; // s of thrust
const CHUTE_SPEED = 110; // px/s, before the engine adds one tick of gravity (~118)
const QUAKE_TIME = 5;
const BUNGEE_K = 16; // spring constant (1/s²)
const BUNGEE_DAMP = 1.6; // damping of the velocity along the rope (1/s)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Input of the active worm (everything else counts as "no keys pressed").
function inputOf(g, w) {
  const t = g.turn;
  if (g.phase === 'turn' && t && t.worm === w.id) return t.input;
  return { l: 0, r: 0, u: 0, d: 0 };
}

const carve = (g, x, y, r) => {
  g.terrain.carveCircle(x, y, r);
  g.emit('carve', { x, y, r });
};

// Ends a held tool: frees the worm and finishes the turn's attack.
function stopHeld(g, id, tool) {
  const w = g.worms[id];
  if (w.custom?.tool === tool) w.custom = null;
  g.finishShot();
}

// ---------- blow torch ----------
function torchStep(g, id) {
  const w = g.worms[id];
  if (!w.alive) return;
  const dx = w.dir * Math.cos(w.aim);
  const dy = -Math.sin(w.aim);
  const cx = w.x + dx * 4;
  const cy = w.y + dy * 4;
  carve(g, cx, cy, 8);
  g.emit('torch', { x: w.x + dx * 12, y: w.y + dy * 12 });
  const nx = w.x + dx * 3;
  const ny = w.y + dy * 3;
  if (!g.terrain.hitCircle(nx, ny, w.r)) {
    w.x = nx;
    w.y = ny;
    snapDown(g.terrain, w, 3);
  }
}

// ---------- drill ----------
function drillStep(g, id) {
  const w = g.worms[id];
  if (!w.alive) return;
  // Through the ground (or into the water): nothing left to dig.
  if (!g.terrain.hitCircle(w.x, w.y + 12, 4) || w.y + 24 > g.waterY) {
    g.turn.burst.left = 0;
    return;
  }
  carve(g, w.x, w.y + 3, 7);
  g.emit('drill', { x: w.x, y: w.y + 10 });
  w.y += 3;
}

// ---------- bungee ----------
function bungeePre(g, w) {
  if (w.state !== 'rope' || !w.rope) return false; // released: normal physics until the worm lands
  w.noFall = true;
  w.vy += GRAVITY * DT;
  const dx = w.x - w.rope.ax;
  const dy = w.y - w.rope.ay;
  const dist = Math.hypot(dx, dy) || 1;
  if (dist > w.rope.len) {
    const nx = dx / dist;
    const ny = dy / dist;
    const acc = BUNGEE_K * (dist - w.rope.len);
    const vr = w.vx * nx + w.vy * ny;
    w.vx += (-nx * acc - nx * vr * BUNGEE_DAMP) * DT;
    w.vy += (-ny * acc - ny * vr * BUNGEE_DAMP) * DT;
  }
  moveBody(g.terrain, w, DT, 0.2, 0.95);
  if (g.terrain.hitCircle(w.x, w.y, w.r)) unstick(g.terrain, w);
  return true;
}

function bungeeFire(g, w, wd) {
  const t = g.turn;
  if (t.bungee) return false;
  if (w.state === 'rope') g.releaseRope(w);
  const dx = w.dir * Math.cos(w.aim);
  const dy = -Math.sin(w.aim);
  const range = 460;
  let hit = g.terrain.raycast(w.x, w.y - 2, w.x + dx * range, w.y - 2 + dy * range);
  if (!hit) hit = g.terrain.raycast(w.x, w.y - 2, w.x, w.y - 2 - range); // nothing ahead: try the ceiling
  g.emit('ropeShot', {
    x1: w.x, y1: w.y, x2: hit ? hit.x : w.x + dx * range, y2: hit ? hit.y : w.y - 2 + dy * range, hit: !!hit,
  });
  if (!hit) return false;
  w.rope = { ax: hit.x, ay: hit.y, len: Math.max(20, Math.hypot(hit.x - w.x, hit.y - w.y)) };
  w.state = 'rope';
  w.noFall = true;
  w.custom = { tool: 'bungee', pre: bungeePre };
  t.bungee = true;
  g.spend(wd.id);
  const id = w.id;
  // Watches the worm: once it let go and is standing again, the attack is over.
  g.startBurst(100000, DT, () => {
    const me = g.worms[id];
    if (me.state === 'ground' && !me.rope) g.turn.burst.left = 0;
  }, () => stopHeld(g, id, 'bungee'));
  return 'partial';
}

// ---------- parachute ----------
function chutePre(g, w) {
  if (w.state !== 'air') {
    w.custom = null; // landed (or grabbed a rope): the canopy folds away
    return false;
  }
  const ax = inputOf(g, w).r - inputOf(g, w).l;
  w.vx += ax * 180 * DT;
  if (Math.abs(w.vx) > 70) w.vx *= 0.92;
  else if (!ax) w.vx *= 0.995;
  if (w.vy > CHUTE_SPEED) w.vy = CHUTE_SPEED;
  w.noFall = true;
  return false;
}

function openChute(g, w) {
  w.custom = { tool: 'parachute', pre: chutePre };
  g.turn.chuteUsed = true;
  g.spawn({ kind: 'tool_fx', tool: 'parachute', worm: w.id, x: w.x, y: w.y });
  g.emit('chute', { id: w.id });
}

// ---------- jet pack ----------
function jetPre(g, w) {
  const c = w.custom;
  if (w.state === 'ground' && c.flew) {
    w.custom = null; // landed after a flight: the pack is spent
    return false;
  }
  const inp = inputOf(g, w);
  const ax = inp.r - inp.l;
  const up = inp.u || c.launch > 0; // Space gives a short automatic burst so the worm takes off at once
  if (c.launch > 0) c.launch -= DT;
  c.thrust = c.fuel > 0 && !!(ax || up);
  if (c.thrust) {
    if (w.state === 'ground') { // the pack stays armed on the ground until the first thrust lifts off
      w.y -= 2;
      w.vx = w.vy = 0;
      w.state = 'air';
      w.airT = 0;
      w.jumped = false;
    }
    c.flew = true;
    c.fuel -= DT;
    if (up) w.vy = Math.max(-220, w.vy - 1000 * DT);
    if (ax) {
      w.vx = clamp(w.vx + ax * 600 * DT, -160, 160);
      w.dir = ax;
    }
  }
  if (w.state === 'air') w.noFall = true;
  if (c.fuel <= 0) {
    w.custom = null;
    w.noFall = false; // an empty pack means a normal (harmful) fall
  }
  return false;
}

// ---------- weapons ----------
registerWeapons([
  {
    id: 'blowtorch', panel: [6, 0], name: 'Blow Torch', icon: '🔥', ammo: 3, aim: true,
    onFireDown: (g) => g.turn.torch === true,
    fire(g, w, wd) {
      const t = g.turn;
      if (t.torch) return false;
      t.torch = true;
      g.spend(wd.id);
      w.custom = { tool: 'blowtorch', pre: () => true }; // the torch moves the worm, not gravity
      const id = w.id;
      g.startBurst(Math.ceil(TORCH_TIME / TORCH_STEP), TORCH_STEP, () => torchStep(g, id), () => stopHeld(g, id, 'blowtorch'));
      return 'partial';
    },
    onFireUp(g, w, t) {
      if (!t.torch || !t.burst) return;
      t.burst = null;
      stopHeld(g, w.id, 'blowtorch');
    },
  },
  {
    id: 'drill', panel: [6, 1], name: 'Pneumatic Drill', icon: '⛏️', ammo: 2,
    onFireDown(g, w, t) {
      if (!t.drill) return false;
      if (t.burst) {
        t.burst = null; // Space again stops the drill
        stopHeld(g, w.id, 'drill');
      }
      return true;
    },
    fire(g, w, wd) {
      const t = g.turn;
      if (t.drill) return false;
      t.drill = true;
      g.spend(wd.id);
      w.custom = { tool: 'drill', pre: () => true };
      const id = w.id;
      g.startBurst(Math.ceil(DRILL_TIME / DRILL_STEP), DRILL_STEP, () => drillStep(g, id), () => stopHeld(g, id, 'drill'));
      return 'partial';
    },
  },
  {
    id: 'girderpack', panel: [6, 4], rotates: true, name: 'Girder Starter Pack', icon: '🏗️', ammo: 2, target: true, noEnd: true,
    useAt: (g, w, wd, x, y) => g.placeGirder(w, x, y, 96),
  },
  {
    id: 'bungee', panel: [7, 1], name: 'Bungee', icon: '🧵', ammo: 2, aim: true,
    onFireDown(g, w, t) {
      if (w.custom?.tool === 'bungee' && w.state === 'rope') g.releaseRope(w); // Space lets go
      return t.bungee === true;
    },
    fire: bungeeFire,
  },
  {
    id: 'parachute', panel: [7, 2], name: 'Parachute', icon: '🪂', ammo: 2, noEnd: true,
    onFireDown: (g, w, t) => t.chuteUsed === true,
    fire(g, w) {
      if (w.state !== 'air' || w.custom || g.turn.chuteUsed) return false;
      openChute(g, w);
    },
    // Opens by itself once the worm has been falling for a moment.
    tick(g, w, t) {
      if (w.state !== 'air' || w.custom || t.chuteUsed || w.vy < 200 || g.ammo(t.team, 'parachute') <= 0) return;
      g.spend('parachute');
      openChute(g, w);
    },
  },
  {
    id: 'jetpack', panel: [7, 5], name: 'Jet Pack', icon: '🚀', ammo: 2, noEnd: true,
    onFireDown: (g, w, t) => t.jetUsed === true,
    fire(g, w) {
      const t = g.turn;
      if (t.jetUsed || w.custom) return false;
      t.jetUsed = true;
      if (w.state === 'rope') g.releaseRope(w);
      w.custom = { tool: 'jetpack', pre: jetPre, fuel: JET_FUEL, thrust: false, flew: false, launch: 0.6 };
      g.spawn({ kind: 'tool_fx', tool: 'jetpack', worm: w.id, x: w.x, y: w.y });
      g.emit('jetpack', { id: w.id });
    },
  },
  {
    id: 'scales', panel: [7, 4], name: 'Scales of Justice', icon: '⚖️', ammo: 0, crate: 0.05, instant: true,
    onSelect(g) {
      const live = g.worms.filter((o) => o.alive);
      if (!live.length) return;
      const hp = Math.max(1, Math.ceil(live.reduce((s, o) => s + o.hp, 0) / live.length));
      for (const o of live) o.hp = hp;
      g.emit('scales', { hp });
      g.spend('scales');
      g.finishShot();
    },
  },
  {
    id: 'selectworm', panel: [11, 2], name: 'Select Worm', icon: '🔀', ammo: 2, crate: 0.4, instant: true,
    onSelect(g, w, t) {
      if (!t.canSwitch) g.spend('selectworm'); // only the first pick of a turn costs ammo
      t.canSwitch = true; // Tab now cycles through the team's worms
      t.weapon = 'bazooka';
      t.fuse = 3;
    },
  },
  {
    id: 'freeze', panel: [11, 3], name: 'Freeze', icon: '❄️', ammo: 0, crate: 0.05, instant: true,
    onSelect(g, w, t) {
      g.freezeTeam(t.team);
      g.spend('freeze');
      g.finishShot();
    },
  },
  {
    id: 'earthquake', panel: [1, 4], name: 'Earthquake', icon: '🌋', ammo: 0, crate: 0.05, instant: true,
    onSelect(g, w) {
      g.spawn({ kind: 'quake', x: w.x, y: w.y, t: QUAKE_TIME, cd: 0, k: 0, owner: w.id });
      g.spend('earthquake');
      g.finishShot();
    },
  },
]);

// ---------- objects ----------
// Invisible object tied to a worm's tool; the client draws the canopy / jet pack through it.
registerObjectType('tool_fx', {
  update(g, o) {
    const w = g.worms[o.worm];
    if (!w || !w.alive || w.custom?.tool !== o.tool) {
      o.dead = true;
      return;
    }
    o.x = w.x;
    o.y = w.y;
  },
  passive: () => true,
  noBounds: true,
});

// The ground shakes for a few seconds and knocks grounded worms sideways.
registerObjectType('quake', {
  update(g, o) {
    o.t -= DT;
    o.k++;
    g.emit('quake', { k: o.k });
    o.cd -= DT;
    if (o.cd <= 0) {
      o.cd = 0.3;
      for (const w of g.worms) {
        if (!w.alive || w.state !== 'ground' || !g.rng.chance(0.6)) continue;
        w.vx = (g.rng.chance(0.5) ? 1 : -1) * g.rng.range(40, 90);
        w.vy = -g.rng.range(50, 110);
        g.knock(w);
      }
    }
    if (o.t <= 0) o.dead = true;
  },
  noBounds: true,
});
