import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.mjs';
import { DT } from '../src/core/constants.mjs';

const newGame = () => new Game({ seed: 7, teams: [{ name: 'A' }, { name: 'B' }], settings: { wormsPerTeam: 2 } });

function fireSupersheep(g) {
  const team = g.turn.team;
  g.teams[team].ammo.supersheep = 3;
  g.command({ team, type: 'weapon', id: 'supersheep' });
  g.update();
  g.command({ team, type: 'fireDown' });
  for (let i = 0; i < 30; i++) g.update();
  g.command({ team, type: 'fireUp' });
  g.update();
  return team;
}

test('while a Super Sheep is being steered, the arrow keys do not walk or aim the worm', () => {
  const g = newGame();
  const team = fireSupersheep(g);
  const w = g.activeWorm();
  const sheep = g.objects.find((o) => o.kind === 'wk_supersheep');
  assert.ok(sheep, 'the sheep is flying');
  const x0 = w.x;
  const aim0 = w.aim;
  g.command({ team, type: 'input', l: 0, r: 1, u: 1, d: 0 });
  for (let i = 0; i < Math.round(0.4 / DT) && !sheep.dead; i++) g.update();
  assert.ok(!sheep.dead, 'the sheep is still in the air');
  assert.equal(w.x, x0, 'the worm stood still');
  assert.equal(w.aim, aim0, 'and did not change its aim');
});

test('after the Super Sheep is gone the worm can walk again during the retreat', () => {
  const g = newGame();
  const team = fireSupersheep(g);
  const w = g.activeWorm();
  for (const o of g.objects) if (o.kind === 'wk_supersheep') o.dead = true;
  g.update();
  const x0 = w.x;
  g.command({ team, type: 'input', l: 0, r: 1, u: 0, d: 0 });
  for (let i = 0; i < 30; i++) g.update();
  assert.notEqual(w.x, x0, 'walking works again');
});
