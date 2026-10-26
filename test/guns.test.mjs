import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.mjs';
import { WEAPONS } from '../src/core/weapons.mjs';
import { OBJECT_TYPES } from '../src/core/registry.mjs';

const GUN_IDS = ['handgun', 'minigun', 'longbow', 'dragonball', 'kamikaze', 'suicide', 'prod', 'axe', 'bat', 'flamethrower'];
const MY_KINDS = ['arrow', 'dragonball', 'kamikaze', 'flamejet', 'flame'];
const FLOOR = 306; // top of the flat ground in the test arena

const run = (g, n) => {
  for (let i = 0; i < n; i++) g.update();
};

// Flat arena (air above y = FLOOR, solid below) with the active worm at x = 400 facing right, the
// enemy `dist` px in front of it and everybody else parked far to the right.
function arena(dist) {
  const g = new Game({ seed: 7, teams: [{ name: 'A' }, { name: 'B' }], settings: { wormsPerTeam: 2 } });
  const { terrain } = g;
  for (let y = 100; y < 400; y++) {
    terrain.mask.fill(y >= FLOOR ? 1 : 0, y * terrain.w + 200, y * terrain.w + 1000);
  }
  const team = g.turn.team;
  const me = g.activeWorm();
  const foes = g.worms.filter((w) => w.team !== team);
  const ally = g.worms.find((w) => w.team === team && w.id !== me.id);
  const place = (w, x) => Object.assign(w, { x, y: FLOOR - 7, vx: 0, vy: 0, state: 'ground', dir: 1, aim: 0 });
  place(me, 400);
  place(foes[0], 400 + dist);
  place(foes[1], 900);
  place(ally, 850);
  run(g, 30);
  g.events.length = 0;
  return { g, team, me, enemy: foes[0], far: foes[1] };
}

function select(g, team, id) {
  if (WEAPONS[id].ammo >= 0) g.teams[team].ammo[id] = 3;
  g.command({ team, type: 'weapon', id });
  g.update();
  assert.equal(g.turn.weapon, id);
}

const press = (g, team) => g.command({ team, type: 'fireDown' });
const release = (g, team) => g.command({ team, type: 'fireUp' });

// Runs until the next team's turn (or game over); returns the number of ticks it took.
function finishTurn(g, team, maxSeconds = 40) {
  let n = 0;
  while (g.turn.team === team && g.phase !== 'over' && n < maxSeconds * 60) {
    g.update();
    n++;
  }
  assert.ok(g.turn.team !== team || g.phase === 'over', `turn did not end within ${maxSeconds}s (phase ${g.phase})`);
  return n;
}

const leftovers = (g) => g.objects.filter((o) => MY_KINDS.includes(o.kind));
const solidCount = (g, x0, x1, y0, y1) => {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (g.terrain.solid(x, y)) n++;
  return n;
};

test('all guns are registered with a unique panel slot and valid data', () => {
  const slots = new Set();
  for (const id of GUN_IDS) {
    const wd = WEAPONS[id];
    assert.ok(wd, `${id} registered`);
    assert.ok(wd.name && wd.icon && typeof wd.ammo === 'number', `${id} basics`);
    assert.ok(wd.fire || wd.onFireDown, `${id} behaviour`);
    slots.add(wd.panel.join(','));
  }
  assert.equal(slots.size, GUN_IDS.length);
  for (const k of ['arrow', 'dragonball', 'kamikaze']) assert.ok(OBJECT_TYPES[k], `${k} object type`);
  assert.equal(WEAPONS.prod.ammo, -1);
  assert.equal(WEAPONS.minigun.crate, 0.3);
  assert.equal(WEAPONS.suicide.crate, 0.2);
  assert.equal(WEAPONS.prod.crate, 0);
});

test('handgun: six shots, 3 damage each', () => {
  const { g, team, me, enemy } = arena(50);
  select(g, team, 'handgun');
  press(g, team);
  run(g, 1);
  assert.ok(g.turn.burst, 'burst running');
  assert.equal(g.teams[team].ammo.handgun, 2);
  finishTurn(g, team);
  const lost = 100 - enemy.hp;
  assert.ok(lost >= 6 && lost <= 18 && lost % 3 === 0, `handgun damage ${lost}`);
  assert.ok(me.alive);
  assert.equal(leftovers(g).length, 0);
});

test('minigun: long burst, 4 damage per hit, ammo spent', () => {
  const { g, team, enemy } = arena(40);
  select(g, team, 'minigun');
  g.teams[team].ammo.minigun = 1;
  press(g, team);
  run(g, 1);
  assert.equal(g.turn.burst.left, 39);
  assert.equal(g.teams[team].ammo.minigun, 0);
  run(g, 60 * 4);
  assert.equal(g.events.filter((e) => e.type === 'shot').length, 40);
  assert.ok(enemy.hp < 100 && (100 - enemy.hp) % 4 === 0, `minigun hp ${enemy.hp}`);
  finishTurn(g, team);
  assert.equal(leftovers(g).length, 0);
});

test('longbow: two arrows one after another, 15 damage, arrow sticks in the worm', () => {
  const { g, team, enemy } = arena(150);
  select(g, team, 'longbow');
  press(g, team);
  run(g, 1);
  assert.equal(g.turn.fired, false, 'first arrow is partial');
  assert.equal(g.teams[team].ammo.longbow, 3);
  assert.equal(g.objects.filter((o) => o.kind === 'arrow').length, 1);
  press(g, team);
  run(g, 1);
  assert.equal(g.objects.filter((o) => o.kind === 'arrow').length, 1, 'cooldown blocks an instant second arrow');
  run(g, 40);
  assert.equal(enemy.hp, 85, 'first arrow hit');
  press(g, team);
  run(g, 2);
  assert.equal(g.turn.fired, true, 'second arrow ends the attack');
  assert.equal(g.teams[team].ammo.longbow, 2);
  const stuck = g.objects.find((o) => o.kind === 'arrow' && o.stuck);
  assert.ok(stuck || enemy.hp <= 70, 'arrows stick or have hit');
  finishTurn(g, team);
  assert.ok(enemy.hp <= 85 && enemy.hp >= 70, `longbow hp ${enemy.hp}`);
  assert.equal(leftovers(g).length, 0);
});

test('longbow: arrow sticks in terrain and disappears', () => {
  const { g, team } = arena(150);
  g.worms.find((w) => w.id !== g.turn.worm && w.team !== team).x = 800; // out of the way
  select(g, team, 'longbow');
  g.activeWorm().aim = -0.4; // into the ground
  press(g, team);
  run(g, 30);
  const a = g.objects.find((o) => o.kind === 'arrow');
  assert.ok(a?.stuck, 'arrow stuck in the ground');
  run(g, 120);
  assert.equal(g.objects.filter((o) => o.kind === 'arrow').length, 0);
});

test('dragonball: short range, 30 damage and a big launch', () => {
  const { g, team, enemy, far } = arena(30);
  select(g, team, 'dragonball');
  press(g, team);
  let peakVy = 0;
  let peakVx = 0;
  for (let i = 0; i < 30; i++) {
    g.update();
    peakVy = Math.min(peakVy, enemy.vy);
    peakVx = Math.max(peakVx, enemy.vx);
  }
  assert.equal(enemy.hp, 70);
  assert.ok(peakVy < -250, `lifted ${peakVy}`);
  assert.ok(peakVx > 250, `pushed ${peakVx}`);
  assert.equal(far.hp, 100);
  assert.equal(g.objects.filter((o) => o.kind === 'dragonball').length, 0, 'ball has burnt out');
  finishTurn(g, team);
  assert.equal(leftovers(g).length, 0);
});

test('dragonball: does not reach a worm 120 px away', () => {
  const { g, team, enemy } = arena(120);
  select(g, team, 'dragonball');
  press(g, team);
  run(g, 20);
  assert.equal(enemy.hp, 100);
  finishTurn(g, team);
});

test('kamikaze: flies along the aim, explodes on the enemy and the worm dies', () => {
  const { g, team, me, enemy } = arena(90);
  select(g, team, 'kamikaze');
  press(g, team);
  run(g, 5);
  assert.ok(me.x > 400 && g.objects.some((o) => o.kind === 'kamikaze'), 'worm is flying');
  assert.equal(g.turn.fired, true);
  finishTurn(g, team);
  assert.ok(enemy.hp <= 100 - 15, `kamikaze damage ${100 - enemy.hp}`);
  assert.equal(me.alive, false);
  assert.equal(leftovers(g).length, 0);
});

test('kamikaze: digs into terrain and explodes there', () => {
  const { g, team, me } = arena(300);
  me.aim = -0.5; // down into the ground
  select(g, team, 'kamikaze');
  const before = solidCount(g, 380, 520, FLOOR, FLOOR + 40);
  press(g, team);
  finishTurn(g, team);
  assert.ok(solidCount(g, 380, 520, FLOOR, FLOOR + 40) < before - 200, 'tunnel/crater dug');
  assert.equal(me.alive, false);
  assert.equal(leftovers(g).length, 0);
});

test('suicide bomber: big crater, damage, poison within 150 px, bomber dies', () => {
  const { g, team, me, enemy, far } = arena(55);
  select(g, team, 'suicide');
  const before = solidCount(g, 330, 470, FLOOR, FLOOR + 60);
  press(g, team);
  run(g, 1);
  assert.ok(enemy.poison >= 5, 'poisoned');
  assert.equal(far.poison, 0, 'far worm unaffected');
  assert.ok(solidCount(g, 330, 470, FLOOR, FLOOR + 60) < before - 1500, 'big crater');
  finishTurn(g, team);
  assert.ok(enemy.hp <= 100 - 20, `suicide damage ${100 - enemy.hp}`);
  assert.equal(me.alive, false);
  assert.equal(far.hp, 100);
  assert.equal(leftovers(g).length, 0);
});

test('prod: pushes without damage', () => {
  const { g, team, enemy } = arena(12);
  select(g, team, 'prod');
  assert.equal(g.teams[team].ammo.prod, -1);
  press(g, team);
  run(g, 1);
  assert.ok(enemy.vx > 60, `prod push ${enemy.vx}`);
  run(g, 40);
  assert.ok(enemy.x > 412 + 3, 'moved');
  assert.equal(enemy.hp, 100);
  assert.equal(g.teams[team].ammo.prod, -1);
  assert.equal(g.turn.fired, true);
  finishTurn(g, team);
});

test('axe: 30 damage, knockback and a hole dug in front of the worm', () => {
  const { g, team, enemy } = arena(40);
  select(g, team, 'axe');
  const before = solidCount(g, 400, 440, FLOOR, FLOOR + 20);
  enemy.x = 414;
  press(g, team);
  run(g, 1);
  assert.equal(enemy.hp, 70);
  assert.ok(enemy.vx > 100 && enemy.vy < -100, 'knocked back');
  assert.ok(solidCount(g, 400, 440, FLOOR, FLOOR + 20) < before - 60, 'hole carved');
  assert.equal(g.teams[team].ammo.axe, 2);
  finishTurn(g, team);
  assert.equal(leftovers(g).length, 0);
});

test('axe: swinging at nothing still digs', () => {
  const { g, team, enemy } = arena(100);
  select(g, team, 'axe');
  const before = solidCount(g, 400, 440, FLOOR, FLOOR + 20);
  press(g, team);
  run(g, 1);
  assert.ok(solidCount(g, 400, 440, FLOOR, FLOOR + 20) < before);
  assert.equal(enemy.hp, 100);
  finishTurn(g, team);
});

test('bat: 10 damage and a very hard hit along the aim', () => {
  const { g, team, me, enemy } = arena(14);
  me.aim = 0.5;
  select(g, team, 'bat');
  press(g, team);
  run(g, 1);
  assert.equal(enemy.hp, 90);
  assert.ok(enemy.vx > 450, `bat vx ${enemy.vx}`);
  assert.ok(enemy.vy < -150, `bat vy ${enemy.vy}`);
  const x0 = enemy.x;
  run(g, 30);
  assert.ok(enemy.x - x0 > 100, 'flew far');
  finishTurn(g, team);
  assert.equal(leftovers(g).length, 0);
});

test('flamethrower: hold Space, stream burns the enemy, release ends it', () => {
  const { g, team, me, enemy } = arena(50);
  select(g, team, 'flamethrower');
  press(g, team);
  run(g, 90);
  assert.ok(g.turn.flame, 'stream running');
  assert.ok(g.objects.some((o) => o.kind === 'flamejet' || o.kind === 'flame'), 'flames in the air');
  assert.equal(g.teams[team].ammo.flamethrower, 2);
  release(g, team);
  run(g, 1);
  assert.equal(g.turn.flame, null);
  assert.equal(g.turn.fired, true);
  const hpAtRelease = enemy.hp;
  assert.ok(hpAtRelease < 100, `burnt ${100 - hpAtRelease}`);
  const flames = g.objects.filter((o) => o.kind === 'flame' || o.kind === 'flamejet').length;
  run(g, 20);
  assert.ok(g.objects.filter((o) => o.kind === 'flame' || o.kind === 'flamejet').length <= flames, 'no new flames after release');
  assert.ok(me.alive);
  finishTurn(g, team);
  assert.equal(g.objects.filter((o) => o.kind === 'flame').length, 0);
});

test('flamethrower: stream stops by itself after 5 seconds', () => {
  const { g, team, enemy } = arena(50);
  select(g, team, 'flamethrower');
  press(g, team);
  run(g, 60 * 4);
  assert.ok(g.turn.flame && !g.turn.fired, 'still going after 4 s');
  run(g, 60 * 1 + 5);
  assert.equal(g.turn.flame, null);
  assert.equal(g.turn.fired, true);
  assert.ok(enemy.hp < 100);
  assert.ok(enemy.hp > 0 || !enemy.alive || enemy.hp === 0);
  press(g, team); // cannot be restarted this turn
  run(g, 5);
  assert.equal(g.turn.flame, null);
  finishTurn(g, team);
  assert.equal(g.objects.filter((o) => o.kind === 'flame').length, 0);
});

test('flamethrower: a very short tap uses one ammo and ends the shot', () => {
  const { g, team } = arena(200);
  select(g, team, 'flamethrower');
  press(g, team);
  run(g, 2);
  release(g, team);
  run(g, 2);
  assert.equal(g.turn.fired, true);
  assert.equal(g.teams[team].ammo.flamethrower, 2);
  finishTurn(g, team);
});
