import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.mjs';
import { WEAPONS } from '../src/core/weapons.mjs';
import { DT } from '../src/core/constants.mjs';

const STRIKE_KINDS = ['strikeplane', 'strikebomb', 'strikesheep', 'strikemole', 'strikedonkey', 'meteor', 'armageddon', 'nukewater', 'flame'];
const newGame = () => new Game({ seed: 7, teams: [{ name: 'A' }, { name: 'B' }], settings: { wormsPerTeam: 2 } });
const solidCount = (g) => g.terrain.mask.reduce((s, v) => s + v, 0);
const hpOf = (g, team) => g.worms.filter((w) => w.team === team).reduce((s, w) => s + w.hp, 0);

// Runs the game for `secs` of game time, draining events so they do not pile up.
function run(g, secs, until) {
  const n = Math.round(secs / DT);
  for (let i = 0; i < n; i++) {
    g.update();
    g.events.length = 0;
    if (until?.()) return i * DT;
  }
  return secs;
}

// Plays on until the next turn starts (or the game ends). g.forced tells whether the engine had to force-settle.
function finishTurn(g, maxSecs = 60) {
  const t = run(g, maxSecs, () => g.turnNumber > 1 || g.phase === 'over');
  return { forced: g.forced, secs: t, finished: g.turnNumber > 1 || g.phase === 'over' };
}

function watchForce(g) {
  g.forced = false;
  const orig = g.forceSettle.bind(g);
  g.forceSettle = () => {
    g.forced = true;
    orig();
  };
}

function setup(id) {
  const g = newGame();
  watchForce(g);
  const team = g.turn.team;
  g.teams[team].ammo[id] = 3;
  const enemy = g.worms.find((w) => w.team !== team);
  g.command({ team, type: 'weapon', id });
  g.update();
  assert.equal(g.turn.weapon, id, `${id} should be selectable`);
  return { g, team, me: g.activeWorm(), enemy, enemyTeam: enemy.team };
}

const useAt = (g, team, x, dir = 0) => {
  if (dir) g.command({ team, type: 'strikeDir', d: dir });
  g.command({ team, type: 'useAt', x, y: 100 });
  g.update();
};

const noStrikeObjects = (g, allow = []) => g.objects.filter((o) => STRIKE_KINDS.includes(o.kind) && !allow.includes(o.kind));

function assertCleanFinish(g, id, allow = []) {
  const res = finishTurn(g);
  assert.ok(res.finished, `${id}: the turn never ended`);
  assert.ok(!res.forced, `${id}: the game had to force-settle (an object lived too long)`);
  assert.deepEqual(noStrikeObjects(g, allow).map((o) => o.kind), [], `${id}: objects left behind`);
}

test('panel slots, ammo and crate weights', () => {
  const slots = {
    napalm: [5, 1], mail: [5, 2], minestrike: [5, 3], molesquadron: [5, 4], molebomb: [4, 4],
    sheepstrike: [9, 3], carpet: [9, 4], donkey: [10, 2], nuke: [10, 3], armageddon: [10, 4],
  };
  for (const [id, panel] of Object.entries(slots)) assert.deepEqual(WEAPONS[id].panel, panel, id);
  for (const id of ['sheepstrike', 'carpet', 'donkey', 'nuke', 'armageddon']) {
    assert.equal(WEAPONS[id].ammo, 0, `${id} is a super weapon`);
    assert.ok(WEAPONS[id].crate > 0 && WEAPONS[id].crate <= 0.05, `${id} crate weight`);
  }
  for (const id of ['napalm', 'mail', 'minestrike', 'molesquadron', 'molebomb']) assert.equal(WEAPONS[id].ammo, 1, id);
  for (const id of ['napalm', 'mail', 'minestrike', 'molesquadron', 'sheepstrike', 'carpet']) {
    assert.ok(WEAPONS[id].target && WEAPONS[id].strike, `${id}: target + strike`);
  }
  assert.ok(WEAPONS.nuke.instant && WEAPONS.armageddon.instant);
  assert.ok(WEAPONS.molebomb.fuse && WEAPONS.molebomb.charge);
});

test('napalm: the plane drops canisters that splash fire and hurt', () => {
  const { g, team, enemy, enemyTeam } = setup('napalm');
  const before = hpOf(g, enemyTeam);
  const solid = solidCount(g);
  useAt(g, team, enemy.x, enemy.x >= g.activeWorm().x ? 1 : -1);
  assert.equal(g.ammo(team, 'napalm'), 2);
  assert.ok(g.turn.fired);
  assert.ok(g.objects.some((o) => o.kind === 'strikeplane'));
  let flames = 0;
  run(g, 20, () => {
    flames = Math.max(flames, g.objects.filter((o) => o.kind === 'flame').length);
    return false;
  });
  assert.ok(flames >= 20, `expected lots of flames, saw ${flames}`);
  assert.ok(solidCount(g) < solid, 'bombs should dig');
  assert.ok(hpOf(g, enemyTeam) < before, 'the enemy should be burnt');
  assertCleanFinish(g, 'napalm');
});

test('mail strike: letters flutter down and explode on contact', () => {
  const { g, team, enemy, enemyTeam } = setup('mail');
  const before = hpOf(g, enemyTeam);
  const solid = solidCount(g);
  useAt(g, team, enemy.x, 1);
  let bombs = 0;
  let explosions = 0;
  for (let i = 0; i < 40 / DT; i++) {
    g.update();
    bombs = Math.max(bombs, g.objects.filter((o) => o.kind === 'strikebomb').length);
    explosions += g.events.filter((e) => e.type === 'explosion').length;
    g.events.length = 0;
  }
  assert.ok(bombs >= 4, `several letters expected, saw ${bombs}`);
  assert.ok(explosions >= 5, `explosions: ${explosions}`);
  assert.ok(solidCount(g) < solid, 'terrain should be cratered');
  assert.ok(hpOf(g, enemyTeam) <= before);
  assertCleanFinish(g, 'mail');
});

test('mail strike hurts a worm that is hit', () => {
  const { g, team, enemy, enemyTeam } = setup('mail');
  g.wind = 0;
  const before = hpOf(g, enemyTeam);
  // an enemy standing under every drop position gets hit by at least one letter
  useAt(g, team, enemy.x, 1);
  const plane = g.objects.find((o) => o.kind === 'strikeplane');
  assert.equal(plane.drops.length, 6);
  run(g, 25);
  assert.ok(hpOf(g, enemyTeam) < before || g.worms.filter((w) => w.team === enemyTeam).some((w) => !w.alive), 'no damage dealt');
});

test('mine strike: the plane leaves armed mines behind', () => {
  const { g, team, enemy } = setup('minestrike');
  useAt(g, team, enemy.x, -1);
  run(g, 12, () => g.objects.filter((o) => o.kind === 'mine').length >= 5);
  const mines = g.objects.filter((o) => o.kind === 'mine');
  assert.ok(mines.length >= 5, `mines: ${mines.length}`);
  for (const m of mines) {
    assert.equal(m.r, 4);
    assert.equal(m.trig, false);
    assert.deepEqual(m.expl, WEAPONS.minestrike.expl);
  }
  run(g, 6);
  // an enemy next to a (still live) mine sets it off
  const m = g.objects.find((o) => o.kind === 'mine' && !o.trig);
  assert.ok(m, 'at least one mine should still lie around');
  const victim = g.worms.find((w) => w.team !== team && w.alive);
  const before = victim.hp;
  victim.x = m.x;
  victim.y = m.y - 8;
  victim.state = 'air';
  run(g, 8);
  assert.ok(victim.hp < before || !victim.alive, 'a worm next to a mine should be hurt');
  assertCleanFinish(g, 'minestrike', ['mine']);
});

test('mole squadron: moles land, tunnel and explode', () => {
  const { g, team, enemy, enemyTeam } = setup('molesquadron');
  const before = hpOf(g, enemyTeam);
  const solid = solidCount(g);
  useAt(g, team, enemy.x, enemy.x >= g.activeWorm().x ? 1 : -1);
  let moles = 0;
  let digging = 0;
  let explosions = 0;
  for (let i = 0; i < 40 / DT; i++) {
    g.update();
    const m = g.objects.filter((o) => o.kind === 'strikemole');
    moles = Math.max(moles, m.length);
    digging = Math.max(digging, m.filter((o) => o.state === 'dig').length);
    explosions += g.events.filter((e) => e.type === 'explosion').length;
    g.events.length = 0;
  }
  assert.equal(moles, 5);
  assert.ok(digging >= 3, `moles that burrowed: ${digging}`);
  assert.equal(explosions >= 5, true, `explosions: ${explosions}`);
  assert.ok(solidCount(g) < solid - 500, 'tunnels and craters expected');
  assert.ok(hpOf(g, enemyTeam) <= before);
  assertCleanFinish(g, 'molesquadron');
});

test('mole squadron: a mole digs about 3 s towards the enemy', () => {
  const { g, team, enemy } = setup('molesquadron');
  useAt(g, team, enemy.x, enemy.x >= g.activeWorm().x ? 1 : -1);
  let mole;
  run(g, 10, () => (mole = g.objects.find((o) => o.kind === 'strikemole' && o.state === 'dig')) !== undefined);
  assert.ok(mole, 'a mole should burrow');
  const startX = mole.x;
  const t0 = g.time;
  const toward = Math.sign(enemy.x - mole.x) || 1;
  run(g, 5, () => mole.dead || mole.fuse <= 0.05);
  assert.ok(g.time - t0 > 1.5, 'mole dug for a while');
  assert.ok((mole.x - startX) * toward > 10 || mole.dead, 'mole should head for the enemy');
});

test('mole bomb: lands, tunnels and detonates after its fuse', () => {
  const { g, team, me } = setup('molebomb');
  g.command({ team, type: 'fuse', n: 2 });
  g.update();
  assert.equal(g.turn.fuse, 2);
  me.aim = -0.2;
  const solid = solidCount(g);
  g.command({ team, type: 'fireDown' });
  run(g, 0.2);
  g.command({ team, type: 'fireUp' });
  g.update();
  assert.equal(g.ammo(team, 'molebomb'), 2);
  const mole = g.objects.find((o) => o.kind === 'strikemole');
  assert.ok(mole, 'the mole bomb should exist');
  let carves = 0;
  let boomAt = -1;
  const t0 = g.time;
  for (let i = 0; i < 10 / DT && boomAt < 0; i++) {
    g.update();
    carves += g.events.filter((e) => e.type === 'carve').length;
    if (g.events.some((e) => e.type === 'explosion')) boomAt = g.time - t0;
    g.events.length = 0;
  }
  assert.ok(carves > 10, `tunnel carves: ${carves}`);
  assert.ok(boomAt > 1.5 && boomAt < 2.6, `detonated after ${boomAt}s, fuse was 2s`);
  assert.ok(solidCount(g) < solid, 'terrain should be dug out');
  assertCleanFinish(g, 'molebomb');
});

test('sheep strike: burning sheep bounce around and explode', () => {
  const { g, team, enemy, enemyTeam } = setup('sheepstrike');
  const before = hpOf(g, enemyTeam);
  const solid = solidCount(g);
  useAt(g, team, enemy.x, 1);
  let sheep = 0;
  let flames = 0;
  let explosions = 0;
  let bounced = false;
  for (let i = 0; i < 40 / DT; i++) {
    g.update();
    sheep = Math.max(sheep, g.objects.filter((o) => o.kind === 'strikesheep').length);
    flames = Math.max(flames, g.objects.filter((o) => o.kind === 'flame').length);
    explosions += g.events.filter((e) => e.type === 'explosion').length;
    if (g.events.some((e) => e.type === 'sheepHop')) bounced = true;
    g.events.length = 0;
  }
  assert.equal(sheep, 5);
  assert.ok(bounced, 'sheep should bounce');
  assert.ok(flames >= 20, `flames: ${flames}`);
  assert.ok(explosions >= 5, `explosions: ${explosions}`);
  assert.ok(solidCount(g) < solid);
  assert.ok(hpOf(g, enemyTeam) <= before);
  assertCleanFinish(g, 'sheepstrike');
});

test('carpet bomb: a dense row of 12 bounce before they explode', () => {
  const { g, team, enemy, enemyTeam } = setup('carpet');
  // stand the target on the surface right under the carpet's centre
  enemy.y = g.terrain.surfaceY(enemy.x, 0) - enemy.r;
  enemy.state = 'ground';
  const before = hpOf(g, enemyTeam);
  const solid = solidCount(g);
  useAt(g, team, enemy.x, 1);
  const plane = g.objects.find((o) => o.kind === 'strikeplane');
  assert.equal(plane.drops.length, 12);
  assert.ok(Math.abs(plane.drops[1] - plane.drops[0]) <= 20, 'bombs are tightly spaced');
  let bombs = 0;
  let bounces = 0;
  let explosions = 0;
  for (let i = 0; i < 40 / DT; i++) {
    g.update();
    bombs = Math.max(bombs, g.objects.filter((o) => o.kind === 'strikebomb').length);
    bounces += g.events.filter((e) => e.type === 'bounce').length;
    explosions += g.events.filter((e) => e.type === 'explosion').length;
    g.events.length = 0;
  }
  assert.equal(bombs, 12);
  assert.ok(bounces >= 6, `bounces: ${bounces}`);
  assert.ok(explosions >= 12, `explosions: ${explosions}`);
  assert.ok(solidCount(g) < solid);
  assert.ok(hpOf(g, enemyTeam) < before || !enemy.alive, 'the target should be hit');
  assertCleanFinish(g, 'carpet');
});

test('concrete donkey: huge crater, heavy damage, bounces a couple of times', () => {
  const { g, team, enemy, enemyTeam } = setup('donkey');
  const before = hpOf(g, enemyTeam);
  const solid = solidCount(g);
  useAt(g, team, enemy.x);
  assert.ok(g.objects.some((o) => o.kind === 'strikedonkey'));
  let maxR = 0;
  let explosions = 0;
  for (let i = 0; i < 40 / DT; i++) {
    g.update();
    for (const e of g.events) {
      if (e.type === 'explosion') {
        explosions++;
        maxR = Math.max(maxR, e.r);
      }
    }
    g.events.length = 0;
  }
  assert.equal(maxR, 70);
  assert.ok(explosions >= 2 && explosions <= 4, `explosions: ${explosions}`);
  assert.ok(solid - solidCount(g) > 3000, `crater too small: ${solid - solidCount(g)}`);
  const target = g.worms.find((w) => w.id === enemy.id);
  assert.ok(!target.alive || target.hp <= 20, `the donkey should (nearly) kill the target, hp ${target.hp}`);
  assert.ok(hpOf(g, enemyTeam) < before);
  assertCleanFinish(g, 'donkey');
});

test('nuclear test: flash, every worm sick, water rises gradually', () => {
  const g = newGame();
  watchForce(g);
  const team = g.turn.team;
  g.teams[team].ammo.nuke = 3;
  const water = g.waterY;
  g.command({ team, type: 'weapon', id: 'nuke' });
  g.update();
  assert.ok(g.events.some((e) => e.type === 'flash'), 'flash event');
  assert.equal(g.ammo(team, 'nuke'), 2);
  assert.ok(g.turn.fired, 'turn ends');
  for (const w of g.worms) assert.ok(w.poison >= 10, `${w.name} should be sick`);
  g.events.length = 0;
  run(g, 1);
  assert.ok(g.waterY < water && g.waterY > water - 60, `gradual rise, waterY ${g.waterY}`);
  const hp = g.worms.map((w) => w.hp);
  const res = finishTurn(g);
  assert.ok(res.finished && !res.forced);
  assert.ok(Math.abs(g.waterY - (water - 60)) < 0.01, `water rose by ${water - g.waterY}`);
  g.worms.forEach((w, i) => {
    if (w.alive) assert.ok(w.hp < hp[i], `${w.name} should have lost hp from the poison`);
  });
  assert.deepEqual(noStrikeObjects(g).map((o) => o.kind), []);
});

test('armageddon: about 60 meteors rain down for ~12 s', () => {
  const { g, team, enemyTeam } = setup('armageddon');
  assert.ok(g.turn.fired);
  assert.equal(g.ammo(team, 'armageddon'), 2);
  const before = hpOf(g, enemyTeam) + hpOf(g, team);
  const solid = solidCount(g);
  let meteors = 0;
  let lastSpawn = 0;
  const seen = new Set();
  let explosions = 0;

  for (let i = 0; i < 40 / DT; i++) {
    g.update();
    for (const o of g.objects) {
      if (o.kind === 'meteor' && !seen.has(o.id)) {
        seen.add(o.id);
        meteors++;
        lastSpawn = g.time;
      }
    }
    explosions += g.events.filter((e) => e.type === 'explosion').length;
    g.events.length = 0;
    if (g.turnNumber > 1) break;
  }
  assert.equal(meteors, 60);
  assert.ok(lastSpawn > 10 && lastSpawn < 14, `last meteor spawned at ${lastSpawn}`);
  assert.ok(explosions >= 30, `explosions: ${explosions}`);
  assert.ok(solidCount(g) < solid - 2000, 'the landscape should be ruined');
  assert.ok(hpOf(g, enemyTeam) + hpOf(g, team) < before, 'worms should be hurt');
  assert.ok(g.turnNumber > 1, 'the turn never ended');
  assert.ok(!g.forced, 'the game had to force-settle');
  assert.deepEqual(noStrikeObjects(g).map((o) => o.kind), []);
});

test('strike planes are not pushed around by explosions and leave the map', () => {
  const { g, team, enemy } = setup('mail');
  useAt(g, team, enemy.x, 1);
  const plane = g.objects.find((o) => o.kind === 'strikeplane');
  assert.ok(!('vx' in plane), 'explosions would push anything with vx');
  assert.equal(plane.dir, 1);
  const x0 = plane.x;
  run(g, 0.5);
  assert.ok(Math.abs(plane.x - (x0 + 0.5 * plane.speed)) < 10);
  run(g, 20, () => plane.dead);
  assert.ok(plane.dead);
});

test('strike direction: default is the worm facing, Left/Right override it', () => {
  const a = setup('napalm');
  a.me.dir = -1;
  useAt(a.g, a.team, 1200);
  assert.equal(a.g.objects.find((o) => o.kind === 'strikeplane').dir, -1);
  const b = setup('napalm');
  b.me.dir = -1;
  useAt(b.g, b.team, 1200, 1);
  const p = b.g.objects.find((o) => o.kind === 'strikeplane');
  assert.equal(p.dir, 1);
  assert.ok(p.drops[0] < p.drops[5], 'drops are ordered along the flight direction');
});
