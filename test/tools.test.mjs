import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.mjs';
import { WEAPONS } from '../src/core/weapons.mjs';
import { DT } from '../src/core/constants.mjs';

const IDS = ['blowtorch', 'drill', 'girderpack', 'bungee', 'parachute', 'jetpack', 'scales', 'selectworm', 'freeze', 'earthquake'];
const PANEL = {
  blowtorch: [6, 0], drill: [6, 1], girderpack: [6, 4], bungee: [7, 1], parachute: [7, 2], jetpack: [7, 5], scales: [7, 4],
  selectworm: [11, 2], freeze: [11, 3], earthquake: [1, 4],
};
const OBJ = new Set(['tool_fx', 'quake']);

const newGame = () => new Game({ seed: 7, teams: [{ name: 'A' }, { name: 'B' }], settings: { wormsPerTeam: 2 } });
const run = (g, seconds) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) g.update();
};
const mine = (g) => g.objects.filter((o) => OBJ.has(o.kind));
const hpOf = (g) => g.worms.map((w) => w.hp);

const solidCount = (g) => {
  let n = 0;
  const m = g.terrain.mask;
  for (let i = 0; i < m.length; i++) if (m[i]) n++;
  return n;
};

function select(g, id, stays = true) {
  const team = g.turn.team;
  g.teams[team].ammo[id] = 3;
  g.command({ team, type: 'weapon', id });
  g.update();
  if (stays) assert.equal(g.turn.weapon, id, `${id} should be selectable`);
  return { team, w: g.activeWorm() };
}

// Carves a free column of air above (x, y) so that falling / flying tests do not depend on the map.
function clearAbove(g, x, y, height) {
  for (let yy = y; yy > y - height; yy -= 8) g.terrain.carveCircle(x, yy, 16);
}

// Makes sure the turn is over (finishing it if the tool does not end it itself) and that the game moves on.
function finishAndSettle(g, id) {
  const n0 = g.turnNumber;
  if (g.phase === 'turn' && !g.turn.fired) g.finishShot();
  for (let i = 0; i < Math.round(40 / DT) && g.phase !== 'over' && g.turnNumber === n0; i++) g.update();
  assert.ok(g.phase === 'over' || (g.turnNumber > n0 && g.phase === 'turn'), `${id}: game moved on within 40 s (phase ${g.phase})`);
  assert.equal(mine(g).length, 0, `${id}: no tool objects remain`);
  for (const w of g.worms) assert.equal(w.custom, null, `${id}: worm ${w.id} released`);
}

// After letting go of the bungee: runs until the worm stands again and checks the attack was ended by that.
function landAndFinish(g, w) {
  const n0 = g.turnNumber;
  for (let i = 0; i < Math.round(8 / DT) && !g.turn.fired; i++) g.update();
  assert.equal(g.turnNumber, n0);
  assert.equal(w.state, 'ground', 'landed');
  assert.equal(g.turn.fired, true, 'landing ends the attack');
}

test('weapon definitions use the assigned panel slots', () => {
  for (const id of IDS) {
    const wd = WEAPONS[id];
    assert.ok(wd, `${id} registered`);
    assert.deepEqual(wd.panel, PANEL[id], `${id} panel`);
  }
  for (const id of ['scales', 'freeze', 'earthquake']) {
    assert.equal(WEAPONS[id].ammo, 0, `${id} is a super weapon`);
    assert.equal(WEAPONS[id].crate, 0.05);
    assert.ok(WEAPONS[id].instant);
  }
  for (const id of ['parachute', 'jetpack', 'girderpack']) assert.ok(WEAPONS[id].noEnd, `${id} noEnd`);
  assert.ok(WEAPONS.girderpack.rotates && WEAPONS.girderpack.target);
  assert.equal(WEAPONS.selectworm.crate, 0.4);
});

test('blowtorch: holding Space tunnels forward and ends the turn after ~5 s', () => {
  const g = newGame();
  const { team, w } = select(g, 'blowtorch');
  w.aim = -0.5; // dig forward and down so there is always rock to burn
  const solid0 = solidCount(g);
  const x0 = w.x;
  const y0 = w.y;
  g.command({ team, type: 'fireDown' });
  run(g, 1);
  assert.equal(g.teams[team].ammo.blowtorch, 2, 'one ammo spent');
  assert.equal(g.turn.fired, false, 'still burning');
  const solid1 = solidCount(g);
  assert.ok(solid1 < solid0 - 100, 'terrain is being carved');
  g.command({ team, type: 'weapon', id: 'bazooka' });
  g.update();
  assert.equal(g.turn.weapon, 'blowtorch', 'no weapon switch while burning');
  run(g, 5);
  assert.equal(g.turn.fired, true, 'the torch burns out by itself');
  assert.ok(solidCount(g) < solid1 - 100, 'it kept carving');
  assert.ok(Math.hypot(w.x - x0, w.y - y0) > 20, 'the worm followed the tunnel');
  finishAndSettle(g, 'blowtorch');
});

test('blowtorch: releasing Space stops it early', () => {
  const g = newGame();
  const { team, w } = select(g, 'blowtorch');
  w.aim = -0.5;
  g.command({ team, type: 'fireDown' });
  run(g, 0.8);
  g.command({ team, type: 'fireUp' });
  g.update();
  assert.equal(g.turn.fired, true);
  assert.equal(w.custom, null);
  const solid = solidCount(g);
  run(g, 2);
  assert.equal(solidCount(g), solid, 'no more carving after release');
  finishAndSettle(g, 'blowtorch');
});

test('drill: sinks the worm straight down, Space again stops it', () => {
  const g = newGame();
  const { team, w } = select(g, 'drill');
  const solid0 = solidCount(g);
  const x0 = w.x;
  const y0 = w.y;
  g.command({ team, type: 'fireDown' });
  run(g, 1.5);
  assert.equal(g.teams[team].ammo.drill, 2);
  assert.equal(g.turn.fired, false);
  assert.ok(w.y > y0 + 15, 'worm sank');
  assert.ok(Math.abs(w.x - x0) < 1e-9, 'straight down');
  assert.ok(solidCount(g) < solid0 - 100, 'hole drilled');
  g.command({ team, type: 'fireDown' });
  g.update();
  assert.equal(g.turn.fired, true, 'second press stops and ends the turn');
  const y1 = w.y;
  run(g, 0.5);
  assert.ok(w.y >= y1, 'released worm does not keep drilling');
  finishAndSettle(g, 'drill');
});

test('drill: stops by itself after ~5 s', () => {
  const g = newGame();
  const { team } = select(g, 'drill');
  g.command({ team, type: 'fireDown' });
  run(g, 5.4);
  assert.equal(g.turn.fired, true);
  finishAndSettle(g, 'drill');
});

test('girderpack: places a longer girder than the normal one and keeps the turn going', () => {
  const place = (id) => {
    const g = newGame();
    const { team, w } = select(g, id);
    const x = w.x;
    const y = w.y - 80;
    for (let dx = -70; dx <= 70; dx += 8) g.terrain.carveCircle(x + dx, y, 14);
    g.turn.girder = 0; // horizontal
    g.command({ team, type: 'useAt', x, y });
    g.update();
    return { g, team, x, y };
  };
  const pack = place('girderpack');
  const normal = place('girder');
  assert.ok(pack.g.terrain.solid(pack.x, pack.y), 'girder placed');
  assert.ok(pack.g.terrain.solid(pack.x + 44, pack.y) && pack.g.terrain.solid(pack.x - 44, pack.y), 'long beam');
  assert.ok(!normal.g.terrain.solid(normal.x + 44, normal.y), 'normal girder is shorter');
  assert.equal(pack.g.teams[pack.team].ammo.girderpack, 2, 'one ammo spent');
  assert.equal(pack.g.turn.fired, false, 'noEnd');
  finishAndSettle(pack.g, 'girderpack');
});

test('bungee: hangs elastically, no fall damage, release + landing ends the turn', () => {
  const g = newGame();
  const { team, w } = select(g, 'bungee');
  const hp0 = hpOf(g);
  // Free the column above the worm, then lift it into the air under a ceiling.
  clearAbove(g, w.x, w.y, 200);
  w.y -= 140;
  w.state = 'air';
  w.vx = w.vy = 0;
  g.terrain.fillLine(w.x - 30, w.y - 60, w.x + 30, w.y - 60, 8);
  w.aim = 1.5;
  g.command({ team, type: 'fireDown' });
  g.update();
  assert.equal(w.state, 'rope');
  assert.equal(w.noFall, true);
  assert.equal(g.teams[team].ammo.bungee, 2);
  const len0 = w.rope.len;
  let maxDist = 0;
  for (let i = 0; i < 180; i++) {
    g.update();
    maxDist = Math.max(maxDist, Math.hypot(w.x - w.rope.ax, w.y - w.rope.ay));
  }
  assert.equal(w.state, 'rope', 'still hanging');
  assert.ok(maxDist > len0 + 5, 'the rope stretched');
  assert.ok(maxDist < len0 + 120, 'but it is an elastic rope, not a free fall');
  assert.equal(g.turn.fired, false, 'turn goes on while hanging');
  assert.deepEqual(hpOf(g), hp0, 'no damage');
  g.command({ team, type: 'jump' });
  g.update();
  assert.notEqual(w.state, 'rope', 'Enter lets go');
  landAndFinish(g, w);
  assert.deepEqual(hpOf(g), hp0, 'no fall damage after letting go either');
  finishAndSettle(g, 'bungee');
});

test('bungee: Space also lets go', () => {
  const g = newGame();
  const { team, w } = select(g, 'bungee');
  clearAbove(g, w.x, w.y, 200);
  w.y -= 100;
  w.state = 'air';
  w.vx = w.vy = 0;
  g.terrain.fillLine(w.x - 30, w.y - 50, w.x + 30, w.y - 50, 8);
  w.aim = 1.5;
  g.command({ team, type: 'fireDown' });
  run(g, 1);
  assert.equal(w.state, 'rope');
  g.command({ team, type: 'fireDown' });
  g.update();
  assert.notEqual(w.state, 'rope');
  assert.equal(g.teams[team].ammo.bungee, 2, 'letting go does not cost more');
  landAndFinish(g, w);
  finishAndSettle(g, 'bungee');
});

test('parachute: falls slowly, unhurt, can be steered, folds on landing', () => {
  const fall = (id) => {
    const g = newGame();
    const { team, w } = select(g, id);
    clearAbove(g, w.x, w.y, 420);
    w.y -= 360;
    w.state = 'air';
    w.vx = w.vy = 0;
    w.noFall = false;
    const hp0 = w.hp;
    const x0 = w.x;
    let maxVy = 0;
    let fx = 0;
    let top = 0;
    for (let i = 0; i < Math.round(15 / DT) && w.state === 'air'; i++) {
      top = Math.max(top, w.vy);
      g.command({ team, type: 'input', l: 0, r: id === 'parachute' ? 1 : 0, u: 0, d: 0 });
      g.update();
      if (w.custom) maxVy = Math.max(maxVy, w.vy);
      if (mine(g).length) fx++;
    }
    return { g, w, hp0, maxVy, top, fx, dx: w.x - x0 };
  };
  const chute = fall('parachute');
  assert.ok(chute.maxVy > 60 && chute.maxVy <= 125, `fall speed clamped (${chute.maxVy})`);
  assert.ok(chute.top < 215, `opened early enough (${chute.top})`);
  assert.equal(chute.w.hp, chute.hp0, 'no damage');
  assert.ok(chute.fx > 10, 'canopy object exists while open');
  assert.ok(chute.dx > 15, 'steered to the right');
  assert.equal(chute.g.teams[chute.g.turn.team].ammo.parachute, 2, 'one ammo spent, once');
  assert.equal(chute.w.state, 'ground');
  chute.g.update();
  assert.equal(chute.w.custom, null, 'folded on landing');
  assert.equal(chute.g.turn.fired, false, 'noEnd');
  finishAndSettle(chute.g, 'parachute');
  // Control: without a parachute the same fall is fast and hurts.
  const plain = fall('bazooka');
  assert.ok(plain.top > 340);
  assert.ok(plain.w.hp < plain.hp0);
});

test('parachute: Space opens it right away in the air, not on the ground', () => {
  const g = newGame();
  const { team, w } = select(g, 'parachute');
  g.command({ team, type: 'fireDown' });
  g.update();
  assert.equal(w.custom, null, 'nothing opens on the ground');
  assert.equal(g.teams[team].ammo.parachute, 3, 'no ammo spent');
  clearAbove(g, w.x, w.y, 200);
  w.y -= 100;
  w.state = 'air';
  w.vx = w.vy = 0;
  g.command({ team, type: 'fireDown' });
  g.update();
  assert.equal(w.custom?.tool, 'parachute');
  assert.equal(g.teams[team].ammo.parachute, 2);
  finishAndSettle(g, 'parachute');
});

test('jetpack: lifts and steers the worm, burns ~4 s of fuel, then lets it fall', () => {
  const g = newGame();
  const { team, w } = select(g, 'jetpack');
  clearAbove(g, w.x, w.y, 300);
  const y0 = w.y;
  const hp0 = w.hp;
  g.command({ team, type: 'fireDown' });
  g.update();
  assert.equal(g.teams[team].ammo.jetpack, 2);
  assert.equal(w.custom?.tool, 'jetpack');
  g.command({ team, type: 'input', l: 0, r: 0, u: 1, d: 0 });
  run(g, 1.5);
  assert.ok(w.y < y0 - 80, `lifted (${y0} -> ${w.y})`);
  assert.ok(mine(g).length > 0, 'pack object exists');
  const x1 = w.x;
  g.command({ team, type: 'input', l: 0, r: 1, u: 1, d: 0 });
  run(g, 1);
  assert.ok(w.x > x1 + 40, 'sideways thrust');
  assert.equal(g.turn.fired, false, 'noEnd');
  // Keep thrusting until the fuel is gone; the pack then drops off.
  run(g, 3);
  assert.equal(w.custom, null, 'out of fuel');
  g.command({ team, type: 'input', l: 0, r: 0, u: 0, d: 0 });
  run(g, 10);
  assert.equal(w.state, 'ground', 'landed');
  assert.ok(w.hp <= hp0);
  // Only once per turn.
  g.command({ team, type: 'fireDown' });
  g.update();
  assert.equal(w.custom, null);
  assert.equal(g.teams[team].ammo.jetpack, 2);
  finishAndSettle(g, 'jetpack');
});

test('jetpack: ends when the worm lands before the fuel is gone', () => {
  const g = newGame();
  const { team, w } = select(g, 'jetpack');
  clearAbove(g, w.x, w.y, 200);
  g.command({ team, type: 'fireDown' });
  g.command({ team, type: 'input', l: 0, r: 0, u: 1, d: 0 });
  run(g, 0.6);
  g.command({ team, type: 'input', l: 0, r: 0, u: 0, d: 0 });
  run(g, 8);
  assert.equal(w.state, 'ground');
  assert.equal(w.custom, null, 'pack gone after landing');
  finishAndSettle(g, 'jetpack');
});

test('jetpack: Space alone launches the worm, and a key pressed afterwards keeps it flying', () => {
  const g = newGame();
  const { team, w } = select(g, 'jetpack');
  clearAbove(g, w.x, w.y, 300);
  const y0 = w.y;
  g.command({ team, type: 'fireDown' });
  run(g, 0.5); // no key held: a human needs a moment to press Up
  assert.equal(w.custom?.tool, 'jetpack', 'pack still armed');
  assert.equal(w.state, 'air', 'launched by Space alone');
  assert.ok(w.y < y0 - 30, `lifted (${y0} -> ${w.y})`);
  assert.equal(g.teams[team].ammo.jetpack, 2, 'one pack spent');
  const y1 = w.y;
  g.command({ team, type: 'input', l: 0, r: 0, u: 1, d: 0 });
  run(g, 1);
  assert.ok(w.y < y1 - 60, `keeps climbing (${y1} -> ${w.y})`);
  finishAndSettle(g, 'jetpack');
});

test('scales: every living worm ends up with the average hp (rounded up)', () => {
  const g = newGame();
  g.worms[0].hp = 100;
  g.worms[1].hp = 40;
  g.worms[2].hp = 20;
  g.worms[3].hp = 61;
  const { team } = select(g, 'scales');
  assert.deepEqual(hpOf(g), [56, 56, 56, 56], 'ceil((100+40+20+61)/4) = 56');
  assert.equal(g.teams[team].ammo.scales, 2);
  assert.ok(g.events.some((e) => e.type === 'scales'));
  assert.equal(g.turn.fired, true, 'ends the turn');
  finishAndSettle(g, 'scales');
});

test('scales: dead worms are ignored and hp never drops below 1', () => {
  const g = newGame();
  g.worms[1].alive = false;
  g.worms[1].hp = 0;
  g.worms[0].hp = 1;
  g.worms[2].hp = 1;
  g.worms[3].hp = 1;
  select(g, 'scales');
  assert.deepEqual(hpOf(g), [1, 0, 1, 1]);
});

test('selectworm: Tab switches worm without ending the turn, bazooka is re-selected', () => {
  const g = newGame();
  const w0 = g.activeWorm();
  const { team } = select(g, 'selectworm', false);
  assert.equal(g.turn.canSwitch, true);
  assert.equal(g.turn.weapon, 'bazooka');
  assert.equal(g.teams[team].ammo.selectworm, 2);
  assert.equal(g.turn.fired, false);
  const t0 = g.turn.time;
  g.command({ team, type: 'switchWorm' });
  g.update();
  const w1 = g.activeWorm();
  assert.notEqual(w1.id, w0.id);
  assert.equal(w1.team, team);
  assert.ok(g.turn.time <= t0 && g.turn.time > t0 - 1, 'clock untouched');
  g.command({ team, type: 'weapon', id: 'selectworm' });
  g.update();
  assert.equal(g.teams[team].ammo.selectworm, 2, 'second pick the same turn is free');
  finishAndSettle(g, 'selectworm');
});

test('freeze: own team takes no damage, turn ends', () => {
  const g = newGame();
  const { team } = select(g, 'freeze');
  assert.equal(g.teams[team].ammo.freeze, 2);
  assert.equal(g.turn.fired, true);
  const mineW = g.worms.filter((w) => w.team === team);
  assert.ok(mineW.every((w) => w.frozen));
  assert.ok(g.worms.filter((w) => w.team !== team).every((w) => !w.frozen));
  g.hurt(mineW[0], 30);
  assert.equal(mineW[0].hp, 100, 'frozen worms are immune');
  const n0 = g.turnNumber;
  finishAndSettle(g, 'freeze');
  assert.ok(g.turnNumber > n0);
});

test('earthquake: ~5 s of shaking pushes grounded worms around, then ends the turn', () => {
  const g = newGame();
  const before = g.worms.map((w) => w.x);
  const { team } = select(g, 'earthquake');
  assert.equal(g.teams[team].ammo.earthquake, 2);
  assert.equal(g.turn.fired, true);
  assert.equal(mine(g).length, 1, 'quake object');
  g.events.length = 0;
  run(g, 5.2);
  const quakes = g.events.filter((e) => e.type === 'quake').length;
  assert.ok(quakes > 240 && quakes <= 312, `quake events every tick (${quakes})`);
  assert.equal(mine(g).length, 0, 'quake is over');
  const moved = g.worms.filter((w, i) => w.alive && Math.abs(w.x - before[i]) > 5).length + g.worms.filter((w) => !w.alive).length;
  assert.ok(moved >= 2, `worms were knocked about (${moved})`);
  finishAndSettle(g, 'earthquake');
});

test('earthquake: deterministic for a given seed', () => {
  const go = () => {
    const g = newGame();
    select(g, 'earthquake');
    run(g, 6);
    return g.worms.map((w) => [Math.round(w.x), Math.round(w.y), w.alive]);
  };
  assert.deepEqual(go(), go());
});
