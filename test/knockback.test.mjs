import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.mjs';
import { KNOCK_MAX } from '../src/core/constants.mjs';

const newGame = () => new Game({ seed: 7, teams: [{ name: 'A' }, { name: 'B' }], settings: { wormsPerTeam: 2 } });
const speed = (w) => Math.hypot(w.vx, w.vy);

test('a bazooka-sized blast next to a worm sends it flying, not just nudging it', () => {
  const g = newGame();
  const w = g.worms[0];
  g.explode(w.x + 10, w.y, { r: 30, dmg: 50, push: 420 });
  assert.equal(w.state, 'air');
  assert.ok(speed(w) > 450, `launch speed ${speed(w).toFixed(0)} px/s`);
  assert.ok(w.vx < 0, 'pushed away from the blast');
  assert.ok(w.vy < 0, 'and upwards');
});

test('the further from the blast, the weaker the push', () => {
  const g = newGame();
  const [a, b] = [g.worms[0], g.worms[2]];
  g.explode(a.x + 8, a.y, { r: 40, dmg: 50, push: 420 });
  g.explode(b.x + 30, b.y, { r: 40, dmg: 50, push: 420 });
  assert.ok(speed(a) > speed(b), `near ${speed(a).toFixed(0)} > far ${speed(b).toFixed(0)}`);
});

test('even the strongest blast is capped so worms stay on the map', () => {
  const g = newGame();
  const w = g.worms[0];
  g.explode(w.x + 1, w.y + 1, { r: 66, dmg: 100, push: 760 });
  assert.ok(speed(w) <= KNOCK_MAX + 0.001, `speed ${speed(w).toFixed(0)}`);
});
