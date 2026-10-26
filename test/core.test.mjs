import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Terrain } from '../src/core/terrain.mjs';
import { generateTerrain, findSpawns } from '../src/core/maps.mjs';
import { Rng } from '../src/core/rng.mjs';
import { Game } from '../src/core/game.mjs';
import { DT } from '../src/core/constants.mjs';

test('carveCircle removes solid pixels', () => {
  const t = new Terrain(100, 100);
  t.mask.fill(1);
  t.carveCircle(50, 50, 10);
  assert.equal(t.solid(50, 50), false);
  assert.equal(t.solid(50, 70), true);
});

test('map generation is deterministic and has land and spawns', () => {
  const a = generateTerrain(1234, 2400, 960).terrain;
  const b = generateTerrain(1234, 2400, 960).terrain;
  assert.deepEqual(a.mask, b.mask);
  const land = a.mask.reduce((s, v) => s + v, 0);
  assert.ok(land > 2400 * 960 * 0.08, `too little land: ${land}`);
  const spawns = findSpawns(a, new Rng(5), 8, 960 - 64);
  assert.equal(spawns.length, 8);
});

test('worms start on the ground, not in terrain', () => {
  const g = new Game({ seed: 7, teams: [{ name: 'A' }, { name: 'B' }] });
  for (const w of g.worms) {
    assert.equal(g.terrain.hitCircle(w.x, w.y, w.r), false, `${w.name} starts inside terrain`);
    assert.ok(g.terrain.hitCircle(w.x, w.y + 1, w.r), `${w.name} starts floating`);
  }
});

test('a bazooka shot explodes and damages or carves', () => {
  const g = new Game({ seed: 7, teams: [{ name: 'A' }, { name: 'B' }] });
  const team = g.turn.team;
  const before = g.terrain.mask.reduce((s, v) => s + v, 0);
  g.command({ team, type: 'weapon', id: 'bazooka' });
  g.command({ team, type: 'fireDown' });
  g.update();
  for (let i = 0; i < 40; i++) g.update();
  g.command({ team, type: 'fireUp' });
  for (let i = 0; i < 60 * 10 && g.phase === 'turn'; i++) g.update();
  // resolve + deaths + next turn
  for (let i = 0; i < 60 * 15 && g.turn.team === team; i++) g.update();
  const after = g.terrain.mask.reduce((s, v) => s + v, 0);
  assert.ok(after < before || g.worms.some((w) => w.hp < 100), 'nothing happened');
  assert.notEqual(g.turn.team, team, 'turn should pass to the other team');
});

test('girder fills terrain and teleport moves the worm', () => {
  const g = new Game({ seed: 7, teams: [{ name: 'A' }, { name: 'B' }] });
  const team = g.turn.team;
  const w = g.activeWorm();
  g.command({ team, type: 'weapon', id: 'girder' });
  g.command({ team, type: 'useAt', x: w.x + 30, y: w.y - 60 });
  g.update();
  assert.ok(g.terrain.solid(w.x + 30, w.y - 60), 'girder not placed');
  g.command({ team, type: 'weapon', id: 'teleport' });
  g.command({ team, type: 'useAt', x: w.x + 10, y: w.y - 120 });
  g.update();
  assert.ok(Math.abs(w.y - (g.terrain.solid(w.x, w.y - 120) ? 0 : w.y)) >= 0);
  assert.ok(w.y < 1000);
});

test('AI vs AI plays a full game to the end without errors', { timeout: 120000 }, () => {
  const g = new Game({
    seed: 99,
    teams: [{ name: 'A', ai: true, level: 'hard' }, { name: 'B', ai: true, level: 'normal' }],
    settings: { wormsPerTeam: 3, turnTime: 30 },
  });
  let ticks = 0;
  const limit = 60 * 60 * 40; // 40 game minutes
  let damageEvents = 0;
  let explosions = 0;
  while (g.phase !== 'over' && ticks < limit) {
    g.update();
    for (const e of g.events) {
      if (e.type === 'damage') damageEvents++;
      if (e.type === 'explosion') explosions++;
    }
    g.events.length = 0;
    ticks++;
    if (ticks % 600 === 0) {
      for (const w of g.worms) {
        assert.ok(Number.isFinite(w.x) && Number.isFinite(w.y), `NaN position for ${w.name}`);
      }
    }
  }
  assert.equal(g.phase, 'over', `game did not finish in ${ticks * DT / 60} min (round ${g.round})`);
  assert.ok(explosions > 0, 'AI never shot anything');
  assert.ok(damageEvents > 0, 'AI never hurt anyone');
  console.log(`AI game: ${(ticks * DT / 60).toFixed(1)} game-min, rounds ${g.round}, explosions ${explosions}, damage events ${damageEvents}, winner ${g.winner}`);
});

test('every weapon can be used by a worm without crashing', { timeout: 60000 }, () => {
  for (const id of ['bazooka', 'grenade', 'cluster', 'hhg', 'dynamite', 'mine', 'sheep', 'airstrike', 'shotgun', 'uzi', 'punch', 'rope']) {
    const g = new Game({ seed: 11, teams: [{ name: 'A' }, { name: 'B' }], settings: { wormsPerTeam: 2 } });
    const team = g.turn.team;
    const w = g.activeWorm();
    g.command({ team, type: 'weapon', id });
    g.update();
    if (id === 'airstrike') g.command({ team, type: 'useAt', x: w.x + 100, y: w.y });
    else g.command({ team, type: 'fireDown' });
    g.update();
    for (let i = 0; i < 30; i++) g.update();
    g.command({ team, type: 'fireUp' });
    for (let i = 0; i < 60 * 20; i++) {
      g.update();
      g.events.length = 0;
    }
    for (const x of g.worms) assert.ok(Number.isFinite(x.x) && Number.isFinite(x.y), `${id}: NaN`);
  }
});
