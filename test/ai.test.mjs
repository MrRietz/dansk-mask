import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.mjs';
import { WEAPON_ORDER } from '../src/core/weapons.mjs';
import { AiBrain } from '../src/core/ai.mjs';

// Both AI teams hold every weapon, so the AI's choice among the W:A weapons is exercised.
test('AI with a full arsenal finishes a game and uses more than the classic weapons', { timeout: 120000 }, () => {
  const g = new Game({
    seed: 21,
    teams: [{ name: 'A', ai: true, level: 'hard' }, { name: 'B', ai: true, level: 'normal' }],
    settings: { wormsPerTeam: 3, turnTime: 30 },
  });
  for (const t of g.teams) for (const id of WEAPON_ORDER) if (t.ammo[id] === 0) t.ammo[id] = 2;
  const used = new Set();
  let ticks = 0;
  while (g.phase !== 'over' && ticks < 60 * 60 * 60) {
    g.update();
    if (g.turn.fired) used.add(g.turn.weapon);
    for (const w of g.worms) assert.ok(Number.isFinite(w.x) && Number.isFinite(w.y), `NaN position for ${w.name}`);
    g.events.length = 0;
    ticks++;
  }
  assert.equal(g.phase, 'over', `game did not finish (round ${g.round})`);
  console.log(`AI arsenal game: ${(ticks / 3600).toFixed(1)} min, weapons used: ${[...used].join(', ')}`);
  assert.ok(used.size >= 2);
});

// Flat floor, our worm at x=800 and one enemy to its right on the same level; the team owns only the walker under test.
// The enemy is placed inside each walker's reach (px), so a clear, level path makes the walker the only sensible shot.
const WALKER_CASES = [
  ['sheep', 200], ['sheeplauncher', 250], ['supersheep', 300], ['madcow', 300], ['oldwoman', 100], ['salvation', 280], ['skunk', 145],
];
for (const [id, dist] of WALKER_CASES) {
  test(`AI plans a ${id} shot at a level enemy in reach`, () => {
    const g = new Game({
      seed: 5, teams: [{ name: 'A', ai: true }, { name: 'B' }], settings: { wormsPerTeam: 2 },
    });
    g.terrain.mask.fill(0);
    g.terrain.mask.fill(1, 500 * g.terrain.w); // flat ground from y=500 down
    const [me, mate, foe, far] = [...g.worms.filter((w) => w.team === 0), ...g.worms.filter((w) => w.team === 1)];
    const at = (w, x) => Object.assign(w, { x, y: 493, vx: 0, vy: 0, state: 'ground' });
    at(me, 800);
    at(foe, 800 + dist);
    at(mate, 100);
    at(far, 2300);
    const team = g.teams[0];
    for (const k of Object.keys(team.ammo)) team.ammo[k] = 0;
    team.ammo[id] = 1;
    const brain = new AiBrain(0, 'easy');
    brain.reset(g);
    const plan = brain.makePlan(g, me);
    assert.equal(plan.type, 'shoot');
    assert.equal(plan.weapon, id);
    assert.equal(plan.dir, 1);
  });
}
