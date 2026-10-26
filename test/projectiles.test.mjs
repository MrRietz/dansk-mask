import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.mjs';
import { WEAPONS } from '../src/core/weapons.mjs';
import { DT } from '../src/core/constants.mjs';

const IDS = ['homing', 'mortar', 'pigeon', 'banana', 'superbanana', 'mbbomb', 'petrol', 'vase', 'magicbullet'];
const KINDS = new Set(['pj_missile', 'pj_shell', 'pj_bomb', 'flame']);
const PANEL = {
  homing: [0, 1], mortar: [0, 2], pigeon: [0, 3], banana: [1, 2], superbanana: [8, 0], mbbomb: [8, 4], petrol: [9, 0],
  vase: [9, 2], magicbullet: [11, 4],
};

const newGame = () => new Game({ seed: 7, teams: [{ name: 'A' }, { name: 'B' }], settings: { wormsPerTeam: 2 } });
const run = (g, seconds) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) g.update();
};
const mine = (g) => g.objects.filter((o) => KINDS.has(o.kind));
const hpSum = (g) => g.worms.reduce((s, w) => s + w.hp, 0);

// Number of solid terrain pixels (the mask is 1 = solid).
const solidCount = (g) => {
  let n = 0;
  const m = g.terrain.mask;
  for (let i = 0; i < m.length; i++) if (m[i]) n++;
  return n;
};

// Selects the weapon, optionally marks a target, fires (charged or placed) and returns the pre-shot state.
function shoot(g, id, { marker = null, hold = 40 } = {}) {
  const team = g.turn.team;
  g.teams[team].ammo[id] = 3;
  g.command({ team, type: 'weapon', id });
  g.update();
  assert.equal(g.turn.weapon, id, `${id} should be selectable`);
  const w = g.activeWorm();
  if (marker) {
    g.command({ team, type: 'useAt', x: marker.x, y: marker.y });
    g.update();
    assert.deepEqual(g.turn.marker, marker, `${id}: marker set`);
    assert.equal(g.teams[team].ammo[id], 3, `${id}: setting the marker is free`);
    assert.equal(g.turn.fired, false, `${id}: setting the marker does not fire`);
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
  return { w, team, before };
}

test('weapon definitions use the assigned panel slots and flags', () => {
  for (const id of IDS) {
    const wd = WEAPONS[id];
    assert.ok(wd, `${id} registered`);
    assert.deepEqual(wd.panel, PANEL[id], `${id} panel`);
    assert.ok(wd.name && wd.icon && wd.expl && typeof wd.fire === 'function', `${id} fields`);
  }
  for (const id of ['superbanana', 'mbbomb', 'magicbullet']) {
    assert.equal(WEAPONS[id].ammo, 0, `${id} super weapon ammo`);
    assert.equal(WEAPONS[id].crate, 0.05, `${id} crate weight`);
  }
  assert.equal(WEAPONS.superbanana.crateAmount, 1);
  assert.equal(WEAPONS.vase.crate, 0.3);
  assert.equal(WEAPONS.vase.ammo, 1);
  for (const id of ['homing', 'pigeon', 'magicbullet']) assert.ok(WEAPONS[id].target && WEAPONS[id].charge && WEAPONS[id].aim);
  assert.ok(WEAPONS.mbbomb.expl.r > WEAPONS.hhg.expl.r && WEAPONS.mbbomb.expl.dmg > WEAPONS.hhg.expl.dmg);
  assert.ok(WEAPONS.superbanana.expl.dmg > WEAPONS.banana.expl.dmg);
  assert.ok(WEAPONS.superbanana.split.n > WEAPONS.banana.split.n);
});

// A target worm of the other team that the marker weapons home in on.
const markerAtEnemy = (g) => {
  const e = g.worms.find((w) => w.team !== g.turn.team);
  return { x: Math.round(e.x), y: Math.round(e.y) };
};

for (const id of IDS) {
  test(`${id}: fires, has an effect and leaves nothing behind`, () => {
    const g = newGame();
    const target = WEAPONS[id].target ? markerAtEnemy(g) : null;
    const turnNo = g.turnNumber;
    const { before } = shoot(g, id, { marker: target });
    assert.ok(mine(g).length > 0, `${id}: should have spawned an object`);
    let effect = false;
    const seen = new Set();
    for (let i = 0; i < Math.round(20 / DT); i++) {
      g.update();
      for (const o of g.objects) seen.add(o.kind);
      if (g.events.some((e) => e.type === 'explosion')) effect = true;
      g.events.length = 0;
    }
    assert.ok(effect, `${id}: nothing exploded`);
    assert.ok(solidCount(g) < before.solid || hpSum(g) < before.hp, `${id}: neither terrain nor worms were hit`);
    assert.equal(mine(g).length, 0, `${id}: objects left after 20 s: ${mine(g).map((o) => o.kind + ':' + o.variant)}`);
    // 20 s are gone; the turn must be handed over (or the game decided) well within 40 s of the shot.
    for (let i = 0; i < Math.round(20 / DT) && g.phase !== 'over' && g.turnNumber === turnNo; i++) g.update();
    assert.ok(g.phase === 'over' || g.turnNumber > turnNo, `${id}: still stuck in '${g.phase}' 40 s after the shot`);
  });
}

test('homing missile follows the marker: it turns towards a target that is not straight ahead', () => {
  const g = newGame();
  const w = g.activeWorm();
  w.aim = 1.0;
  const mk = { x: Math.round(w.x + w.dir * 250), y: Math.round(w.y - 260) }; // up-front, off the launch line
  shoot(g, 'homing', { marker: mk, hold: 60 });
  const m = g.objects.find((o) => o.kind === 'pj_missile');
  assert.ok(m, 'missile exists');
  const startAng = Math.atan2(m.vy, m.vx);
  let minDist = Infinity;
  for (let i = 0; i < 60 * 4 && !m.dead; i++) {
    g.update();
    minDist = Math.min(minDist, Math.hypot(m.x - mk.x, m.y - mk.y));
  }
  assert.ok(Math.abs(Math.atan2(m.vy, m.vx) - startAng) > 0.05 || m.dead, 'direction should have changed');
  assert.ok(minDist < 20, `should have reached the marker, closest ${minDist}`);
});

test('homing without a marker is an ordinary ballistic rocket (gravity bends it down)', () => {
  const g = newGame();
  g.activeWorm().aim = 0.4;
  shoot(g, 'homing', { hold: 60 });
  const m = g.objects.find((o) => o.kind === 'pj_missile');
  assert.equal(m.target, null);
  const vy0 = m.vy;
  run(g, 0.5);
  assert.ok(m.dead || m.vy > vy0, 'gravity should pull the rocket down');
});

test('pigeon and magic bullet fly without gravity', () => {
  for (const id of ['pigeon', 'magicbullet']) {
    const g = newGame();
    g.activeWorm().aim = 0.6;
    shoot(g, id, { marker: { x: g.activeWorm().x, y: -400 }, hold: 20 });
    const m = g.objects.find((o) => o.kind === 'pj_missile');
    assert.equal(m.gmul, 0, `${id}: no gravity`);
    assert.ok(Math.hypot(m.vx, m.vy) > 0);
  }
});

test('mortar splits into four cluster shells', () => {
  const g = newGame();
  shoot(g, 'mortar');
  let bits = 0;
  for (let i = 0; i < 60 * 15 && !bits; i++) {
    g.update();
    bits = g.objects.filter((o) => o.variant === 'mortarbit').length;
  }
  assert.equal(bits, 4);
});

test('banana and super banana split into mini bananas (super: more, stronger)', () => {
  const counts = {};
  for (const id of ['banana', 'superbanana']) {
    const g = newGame();
    shoot(g, id);
    let n = 0;
    for (let i = 0; i < 60 * 10 && !n; i++) {
      g.update();
      n = g.objects.filter((o) => o.variant === 'minibanana').length;
    }
    counts[id] = n;
  }
  assert.equal(counts.banana, 5);
  assert.ok(counts.superbanana > counts.banana);
});

test('vase is placed beside the worm, waits for its fuse and shatters into shards', () => {
  const g = newGame();
  const w = g.activeWorm();
  shoot(g, 'vase');
  const v = g.objects.find((o) => o.variant === 'vase');
  assert.ok(v && Math.abs(v.x - (w.x + w.dir * 8)) < 2, 'placed next to the worm');
  run(g, 3);
  assert.ok(!v.dead, 'still ticking after 3 s');
  let shards = 0;
  for (let i = 0; i < 60 * 3 && !shards; i++) {
    g.update();
    shards = g.objects.filter((o) => o.variant === 'shard').length;
  }
  assert.ok(shards >= 5, `expected shards, got ${shards}`); // some fired into the ground burst at once
  const dirs = new Set(g.objects.filter((o) => o.variant === 'shard').map((o) => Math.sign(o.vx) + ',' + Math.sign(o.vy)));
  assert.ok(dirs.size >= 3, 'shards fly in different directions');
});

test('petrol bomb sets the ground on fire and the flames burn out', () => {
  const g = newGame();
  shoot(g, 'petrol');
  let flames = 0;
  for (let i = 0; i < 60 * 10 && !flames; i++) {
    g.update();
    flames = g.objects.filter((o) => o.kind === 'flame').length;
  }
  assert.ok(flames >= 10, `expected flames, got ${flames}`);
  run(g, 10);
  assert.equal(g.objects.filter((o) => o.kind === 'flame').length, 0);
});

test('MB bomb has a bigger crater than the Holy Hand Grenade', () => {
  const carved = {};
  for (const id of ['hhg', 'mbbomb']) {
    const g = newGame();
    const { before } = shoot(g, id);
    run(g, 15);
    carved[id] = before.solid - solidCount(g);
  }
  assert.ok(carved.mbbomb > carved.hhg, `mbbomb ${carved.mbbomb} vs hhg ${carved.hhg}`);
});

test('the fuse setting (1-5) is honoured by fused projectiles', () => {
  const g = newGame();
  const team = g.turn.team;
  g.teams[team].ammo.banana = 3;
  g.command({ team, type: 'weapon', id: 'banana' });
  g.command({ team, type: 'fuse', n: 5 });
  g.command({ team, type: 'fireDown' });
  g.update();
  for (let i = 0; i < 30; i++) g.update();
  g.command({ team, type: 'fireUp' });
  g.update();
  const b = g.objects.find((o) => o.variant === 'banana');
  assert.ok(b && b.fuse > 4.5, `fuse should be ~5, got ${b?.fuse}`);
});
