import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.mjs';
import { LAYOUTS, generateTerrain, findSpawns, resolveLayout } from '../src/core/maps.mjs';
import { Rng } from '../src/core/rng.mjs';
import { DEFAULT_SETTINGS, WORM_R } from '../src/core/constants.mjs';

const { worldW: W, worldH: H, waterMargin } = DEFAULT_SETTINGS;
const SEEDS = Array.from({ length: 15 }, (_, i) => 1 + i * 37);

test('LAYOUTS lists the six layouts in order', () => {
  assert.deepEqual(LAYOUTS.map((l) => l.id), ['islands', 'hills', 'caverns', 'canyon', 'bridges', 'arena']);
  for (const l of LAYOUTS) assert.ok(l.name && l.desc);
  assert.equal(DEFAULT_SETTINGS.layout, 'islands');
});

test('unknown layout id falls back to islands', () => {
  const a = generateTerrain(7, W, H, waterMargin, 'nonsense').terrain;
  const b = generateTerrain(7, W, H, waterMargin, 'islands').terrain;
  const c = generateTerrain(7, W, H, waterMargin).terrain;
  assert.deepEqual(a.mask, b.mask);
  assert.deepEqual(c.mask, b.mask);
});

for (const { id } of LAYOUTS) {
  test(`layout ${id}: solid ground, 24 safe spawns, deterministic, no NaN`, () => {
    for (const seed of SEEDS) {
      const { terrain, waterY } = generateTerrain(seed, W, H, waterMargin, id);
      assert.equal(waterY, H - waterMargin);
      let solid = 0;
      for (const v of terrain.mask) solid += v;
      assert.ok(solid > W * H * 0.015, `${id}/${seed}: too little ground (${solid})`);

      const spawns = findSpawns(terrain, new Rng(seed + 101), 24, waterY, id === 'islands' ? 0 : 8);
      assert.equal(spawns.length, 24, `${id}/${seed}: found ${spawns.length} spawns`);
      for (const s of spawns) {
        assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y), `${id}/${seed}: NaN spawn`);
        assert.ok(s.y < waterY - 40, `${id}/${seed}: spawn in/near water at y=${s.y}`);
        assert.ok(!terrain.hitCircle(s.x, s.y, WORM_R), `${id}/${seed}: spawn stuck in rock at ${s.x},${s.y}`);
        assert.ok(terrain.solid(s.x, s.y + WORM_R + 3), `${id}/${seed}: spawn has no ground below at ${s.x},${s.y}`);
      }

      const again = generateTerrain(seed, W, H, waterMargin, id).terrain;
      assert.deepEqual(again.mask, terrain.mask, `${id}/${seed}: not deterministic`);
    }
  });

  test(`layout ${id}: a short AI vs AI game finishes`, { timeout: 120000 }, () => {
    const g = new Game({
      seed: 21,
      teams: [{ name: 'A', ai: true, level: 'hard' }, { name: 'B', ai: true, level: 'normal' }],
      settings: { wormsPerTeam: 2, turnTime: 30, layout: id },
    });
    assert.equal(g.layout, id);
    let ticks = 0;
    while (g.phase !== 'over' && ticks < 60 * 60 * 40) {
      g.update();
      for (const w of g.worms) assert.ok(Number.isFinite(w.x) && Number.isFinite(w.y), `NaN position for ${w.name}`);
      g.events.length = 0;
      ticks++;
    }
    assert.equal(g.phase, 'over', `${id}: game did not finish (round ${g.round})`);
  });
}

test("'random' picks a valid layout deterministically without touching the main rng", () => {
  const seen = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const id = resolveLayout('random', seed);
    assert.ok(LAYOUTS.some((l) => l.id === id));
    assert.equal(resolveLayout('random', seed), id);
    seen.add(id);
  }
  assert.ok(seen.size >= 4, `random only produced ${[...seen].join(', ')}`);

  const g = new Game({ seed: 5, settings: { layout: 'random' } });
  assert.equal(g.layout, resolveLayout('random', 5));
  const same = new Game({ seed: 5, settings: { layout: g.layout } });
  assert.deepEqual(g.terrain.mask, same.terrain.mask);
  assert.equal(g.rng.s, same.rng.s);
  assert.equal(new Game({ seed: 5 }).layout, 'islands');
  assert.equal(new Game({ seed: 5, settings: { layout: 'bogus' } }).layout, 'islands');
});

test('a full 4x6 game fits on every layout', () => {
  for (const { id } of LAYOUTS) {
    const g = new Game({
      seed: 9,
      teams: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
      settings: { wormsPerTeam: 6, layout: id },
    });
    assert.equal(g.worms.length, 24);
    for (const w of g.worms) assert.ok(w.y > 60 && w.y < g.waterY - 40, `${id}: worm ${w.name} on fallback spawn y=${w.y}`);
  }
});
