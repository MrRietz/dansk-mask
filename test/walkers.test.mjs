import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.mjs';
import { WEAPONS } from '../src/core/weapons.mjs';
import { DT } from '../src/core/constants.mjs';

const IDS = ['sheeplauncher', 'supersheep', 'madcow', 'oldwoman', 'salvation', 'skunk'];
const PANEL = {
  sheeplauncher: [0, 4], supersheep: [4, 3], madcow: [10, 0], oldwoman: [10, 1], salvation: [8, 3], skunk: [9, 1],
};
const KINDS = new Set(['wk_sheep', 'wk_supersheep', 'wk_cow', 'wk_oldwoman', 'wk_pastor', 'wk_tamb', 'wk_skunk']);

const newGame = () => new Game({ seed: 7, teams: [{ name: 'A' }, { name: 'B' }], settings: { wormsPerTeam: 2 } });
const run = (g, seconds, each) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    each?.(g);
    g.update();
  }
};
const mine = (g) => g.objects.filter((o) => KINDS.has(o.kind));
const hpSum = (g) => g.worms.reduce((s, w) => s + w.hp, 0);
const solidCount = (g) => {
  let n = 0;
  const m = g.terrain.mask;
  for (let i = 0; i < m.length; i++) if (m[i]) n++;
  return n;
};

// Selects and uses the weapon (charged weapons are held for `hold` ticks).
function use(g, id, { hold = 40, fuse } = {}) {
  const team = g.turn.team;
  g.teams[team].ammo[id] = 3;
  g.command({ team, type: 'weapon', id });
  g.update();
  assert.equal(g.turn.weapon, id, `${id} should be selectable`);
  if (fuse) {
    g.command({ team, type: 'fuse', n: fuse });
    g.update();
  }
  const before = { solid: solidCount(g), hp: hpSum(g), ammo: g.teams[team].ammo[id] };
  g.command({ team, type: 'fireDown' });
  if (WEAPONS[id].charge) {
    for (let i = 0; i < hold; i++) g.update();
    g.command({ team, type: 'fireUp' });
  }
  g.update();
  assert.equal(g.turn.fired, true, `${id}: should have been fired`);
  assert.equal(g.teams[team].ammo[id], before.ammo - 1, `${id}: one ammo spent`);
  return { team, before, w: g.activeWorm() };
}

// Runs until the objects are gone and the game has left the resolve phase (max 50 s); returns seconds taken.
function settle(g, each) {
  let t = 0;
  while (t < 50 && (mine(g).length || g.phase === 'resolve' || g.phase === 'turn')) {
    each?.(g);
    g.update();
    t += DT;
  }
  return t;
}

const finished = (g, id) => {
  assert.equal(mine(g).length, 0, `${id}: all walkers are gone`);
  assert.notEqual(g.phase, 'resolve', `${id}: the turn resolved`);
};

test('definitions use the assigned panel slots, ammo and crate weights', () => {
  for (const id of IDS) {
    const wd = WEAPONS[id];
    assert.ok(wd, `${id} registered`);
    assert.deepEqual(wd.panel, PANEL[id], `${id} panel`);
    assert.ok(wd.name && wd.icon && wd.expl && typeof wd.fire === 'function', `${id} fields`);
  }
  assert.ok(WEAPONS.sheeplauncher.charge && WEAPONS.sheeplauncher.aim);
  assert.ok(WEAPONS.madcow.fuse);
  for (const id of ['madcow', 'oldwoman', 'salvation']) {
    assert.equal(WEAPONS[id].ammo, 0, `${id} super weapon ammo`);
    assert.equal(WEAPONS[id].crate, 0.05, `${id} crate weight`);
  }
  assert.equal(WEAPONS.madcow.crateAmount, 1);
  assert.equal(WEAPONS.sheeplauncher.crate, 0.3);
  assert.equal(WEAPONS.supersheep.crate, 0.2);
  assert.equal(WEAPONS.skunk.crate, 0.3);
  for (const id of ['sheeplauncher', 'supersheep', 'skunk']) assert.equal(WEAPONS[id].ammo, 1);
  assert.equal(WEAPONS.oldwoman.expl.r, 55);
  assert.equal(WEAPONS.oldwoman.expl.dmg, 80);
});

test('sheeplauncher: flies, lands, walks and digs a crater', () => {
  const g = newGame();
  const { before } = use(g, 'sheeplauncher');
  const sheep = mine(g)[0];
  assert.equal(sheep.kind, 'wk_sheep');
  assert.equal(sheep.state, 'air');
  run(g, 1);
  assert.ok(Math.hypot(sheep.x - g.worms[0].x, sheep.y - g.worms[0].y) > 20, 'the sheep got away from the worm');
  settle(g);
  finished(g, 'sheeplauncher');
  assert.ok(solidCount(g) < before.solid, 'crater dug');
});

test('sheeplauncher: a second Space press detonates it early', () => {
  const g = newGame();
  use(g, 'sheeplauncher');
  run(g, 1.2);
  assert.equal(mine(g).length, 1);
  g.command({ team: g.turn.team, type: 'fireDown' });
  run(g, 0.1);
  assert.equal(mine(g).length, 0, 'detonated by Space');
  assert.ok(g.events.some((e) => e.type === 'explosion'));
});

test('supersheep: steered with the arrow keys, explodes on contact', () => {
  const g = newGame();
  const { before } = use(g, 'supersheep');
  const sheep = mine(g)[0];
  assert.equal(sheep.kind, 'wk_supersheep');
  // Steer down into the ground.
  const steer = (gg) => {
    gg.turn.input.d = 1;
  };
  run(g, 0.2, steer);
  assert.ok(!sheep.dead && sheep.vy > 0, 'steered downwards');
  settle(g, steer);
  finished(g, 'supersheep');
  assert.ok(solidCount(g) < before.solid, 'crater dug');
});

test('supersheep: steering up changes its path, Space detonates', () => {
  const g = newGame();
  use(g, 'supersheep');
  const sheep = mine(g)[0];
  run(g, 0.6, (gg) => {
    gg.turn.input.u = 1;
  });
  assert.ok(sheep.vy < 0, 'steered upwards');
  g.command({ team: g.turn.team, type: 'fireDown' });
  run(g, 0.1);
  assert.equal(mine(g).length, 0, 'detonated by Space');
});

test('supersheep: left/right steering turns it round', () => {
  const g = newGame();
  use(g, 'supersheep');
  const sheep = mine(g)[0];
  const d0 = sheep.dir;
  run(g, 1.2, (gg) => {
    gg.turn.input.l = d0 > 0 ? 1 : 0;
    gg.turn.input.r = d0 > 0 ? 0 : 1;
  });
  assert.ok(!sheep.dead, 'still flying');
  assert.equal(sheep.dir, -d0, 'flies the other way');
});

test('madcow: a herd of three by default runs off and explodes', () => {
  const g = newGame();
  const { before } = use(g, 'madcow');
  assert.equal(mine(g).length, 3, 'three cows by default');
  assert.ok(mine(g).every((o) => o.kind === 'wk_cow'));
  settle(g);
  finished(g, 'madcow');
  assert.ok(solidCount(g) < before.solid || hpSum(g) < before.hp, 'cows had an effect');
});

test('madcow: the fuse keys choose the herd size', () => {
  for (const n of [1, 5]) {
    const g = newGame();
    use(g, 'madcow', { fuse: n });
    assert.equal(mine(g).length, n, `${n} cows`);
    settle(g);
    finished(g, `madcow ${n}`);
  }
});

test('oldwoman: walks slowly, ignores Space and blows up after 5 s', () => {
  const g = newGame();
  const { before } = use(g, 'oldwoman');
  const o = mine(g)[0];
  assert.equal(o.kind, 'wk_oldwoman');
  run(g, 1);
  const x1 = o.x;
  g.command({ team: g.turn.team, type: 'fireDown' });
  run(g, 1);
  assert.ok(!o.dead, 'Space does not detonate her');
  assert.ok(Math.abs(o.x - x1) < 40, 'she is slow');
  const t = settle(g);
  assert.ok(t > 2.5, 'went off only after several seconds');
  finished(g, 'oldwoman');
  assert.ok(solidCount(g) < before.solid, 'crater dug');
});

test('salvation: throws tambourines, detonates on Space', () => {
  const g = newGame();
  const { before } = use(g, 'salvation');
  assert.equal(mine(g)[0].kind, 'wk_pastor');
  run(g, 2.5);
  assert.ok(g.events.some((e) => e.type === 'wkTamb'), 'tambourines thrown');
  g.command({ team: g.turn.team, type: 'fireDown' });
  settle(g);
  finished(g, 'salvation');
  assert.ok(solidCount(g) < before.solid, 'crater dug');
});

test('salvation: detonates on its own after ~8 s', () => {
  const g = newGame();
  use(g, 'salvation');
  const t = settle(g);
  assert.ok(t > 5, 'it lived a while');
  finished(g, 'salvation');
});

test('skunk: poisons worms nearby and goes off after ~5 s', () => {
  const g = newGame();
  use(g, 'skunk');
  const o = mine(g)[0];
  assert.equal(o.kind, 'wk_skunk');
  run(g, 1);
  assert.ok(g.worms.some((w) => w.poison > 0), 'a worm got sick');
  assert.ok(g.events.some((e) => e.type === 'wkGas'));
  settle(g);
  finished(g, 'skunk');
});
