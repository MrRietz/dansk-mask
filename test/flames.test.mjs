import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.mjs';
import { spawnFire } from '../src/core/objects/fire.mjs';
import { DT } from '../src/core/constants.mjs';

const newGame = () => new Game({ seed: 7, teams: [{ name: 'A' }, { name: 'B' }], settings: { wormsPerTeam: 2 } });

test('a worm touched by flames hops away from them and still takes the burn damage', () => {
  const g = newGame();
  const w = g.worms[2]; // not the active worm, so the turn does not end
  const x0 = w.x;
  const hp0 = w.hp;
  spawnFire(g, w.x - 4, w.y, { count: 1, spread: 0, up: 0, life: [2, 2], dmg: 3, r: 4 });
  let peakUp = 0;
  for (let i = 0; i < 40; i++) {
    g.update();
    peakUp = Math.max(peakUp, -w.vy);
  }
  assert.ok(w.hp < hp0, 'burned');
  assert.ok(peakUp > 100, `hopped (peak upward speed ${peakUp.toFixed(0)})`);
  assert.ok(w.x > x0, 'moved away from a flame on its left');
});

test('a pool of flames does not keep re-launching a worm that is already flying', () => {
  const g = newGame();
  const w = g.worms[2];
  spawnFire(g, w.x, w.y, { count: 12, spread: 0, up: 0, life: [3, 3], dmg: 1, r: 5 });
  let fastest = 0;
  for (let i = 0; i < Math.round(2 / DT); i++) {
    g.update();
    fastest = Math.max(fastest, Math.hypot(w.vx, w.vy));
  }
  assert.ok(fastest < 400, `max speed ${fastest.toFixed(0)} px/s`);
});

test('a frozen worm is not moved by flames', () => {
  const g = newGame();
  const w = g.worms[2];
  w.frozen = true;
  const x0 = w.x;
  spawnFire(g, w.x, w.y, { count: 3, spread: 0, up: 0, life: [1, 1], dmg: 2, r: 4 });
  for (let i = 0; i < 40; i++) g.update();
  assert.equal(w.x, x0);
});
