import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.mjs';
import { WEAPONS, WEAPON_ORDER } from '../src/core/weapons.mjs';
import { spawnFire } from '../src/core/objects/fire.mjs';

const newGame = () => new Game({ seed: 7, teams: [{ name: 'A' }, { name: 'B' }], settings: { wormsPerTeam: 2 } });
const step = (g, n) => {
  for (let i = 0; i < n; i++) g.update();
  g.events.length = 0;
};

test('every registered weapon has the required fields', () => {
  assert.ok(WEAPON_ORDER.length >= 16);
  for (const id of WEAPON_ORDER) {
    const wd = WEAPONS[id];
    assert.ok(wd.name && wd.icon, `${id}: name/icon`);
    assert.ok(typeof wd.ammo === 'number', `${id}: ammo`);
    assert.ok(Array.isArray(wd.panel) && wd.panel[0] >= 0 && wd.panel[0] < 12 && wd.panel[1] >= 0 && wd.panel[1] < 6, `${id}: panel`);
    assert.ok(wd.fire || wd.useAt || wd.onSelect || wd.tick || wd.onFireDown, `${id}: has no behaviour`);
  }
  const slots = WEAPON_ORDER.map((id) => WEAPONS[id].panel.join(','));
  assert.equal(new Set(slots).size, slots.length, 'two weapons share a panel slot');
});

test('jump variants: forward, back, high and backflip', () => {
  for (const [type, check] of [
    ['jump', (w, d) => w.vx * d > 0 && w.vy < 0],
    ['jumpBack', (w, d) => w.vx * d < 0 && w.vy < 0],
    ['jumpHigh', (w) => Math.abs(w.vx) < 1 && w.vy < -250],
    ['backflip', (w, d) => w.vx * d < 0 && w.vy < -250],
  ]) {
    const g = newGame();
    const w = g.activeWorm();
    const d = w.dir;
    g.command({ team: g.turn.team, type });
    g.update();
    assert.equal(w.state, 'air', `${type}: should be airborne`);
    assert.ok(check(w, d), `${type}: wrong launch velocity ${w.vx},${w.vy}`);
  }
});

test('a quick second press upgrades a fresh jump (Backspace twice = backflip)', () => {
  const g = newGame();
  const w = g.activeWorm();
  const d = w.dir;
  g.command({ team: g.turn.team, type: 'jumpHigh' });
  step(g, 8);
  g.command({ team: g.turn.team, type: 'backflip' });
  g.update();
  assert.ok(w.vx * d < 0 && w.vy < -250, 'second press should relaunch as a backflip');
});

test('poison costs hp at the end of the turn but never kills', () => {
  const g = newGame();
  const victim = g.worms.find((w) => w.team !== g.turn.team);
  g.sicken(victim, 8);
  g.sicken(g.worms.find((w) => w.team === g.turn.team && w.id !== g.turn.worm), 500);
  g.command({ team: g.turn.team, type: 'weapon', id: 'skip' });
  const before = victim.hp;
  const team = g.turn.team;
  for (let i = 0; i < 60 * 30 && g.turn.team === team; i++) g.update();
  assert.equal(victim.hp, before - 8);
  assert.ok(g.worms.every((w) => !w.alive || w.hp >= 1));
});

test('frozen worms take no damage', () => {
  const g = newGame();
  const other = g.worms.find((w) => w.team !== g.turn.team);
  g.freezeTeam(other.team);
  g.hurt(other, 50);
  assert.equal(other.hp, 100);
});

test('fire burns worms and burns out', () => {
  const g = newGame();
  const victim = g.worms.find((w) => w.team !== g.turn.team);
  spawnFire(g, victim.x, victim.y, { count: 6, spread: 5, up: 5, life: [1, 1.5], dmg: 2 });
  step(g, 60 * 3);
  assert.ok(victim.hp < 100, 'fire should have hurt the worm');
  assert.equal(g.objects.filter((o) => o.kind === 'flame').length, 0, 'flames should be gone');
});

test('crate pool never hands out zero-weight weapons', () => {
  const g = newGame();
  for (let i = 0; i < 200; i++) {
    g.crates = [];
    g.dropCrate();
    const c = g.crates[0];
    if (c?.kind === 'weapon') assert.notEqual(WEAPONS[c.weapon].crate, 0, `${c.weapon} came from a crate`);
  }
});
