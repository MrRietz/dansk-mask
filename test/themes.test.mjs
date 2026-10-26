import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, themeById, themeForLayout, LAYOUT_THEME } from '../src/client/themes.mjs';
import { LAYOUTS } from '../src/core/maps.mjs';

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)|hsla?\([\d\s.,%]+\))$/i;
const isColor = (s) => typeof s === 'string' && COLOR.test(s);
const isRgb = (a) => Array.isArray(a) && a.length === 3 && a.every((v) => Number.isFinite(v));

test('theme list: required ids in order, unique, named', () => {
  assert.deepEqual(THEMES.map((t) => t.id), ['meadow', 'desert', 'arctic', 'volcano', 'space', 'candy']);
  assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length);
  for (const t of THEMES) assert.ok(typeof t.name === 'string' && t.name.length > 0, t.id);
});

test('every theme has all fields with valid colors', () => {
  for (const t of THEMES) {
    const where = (f) => `${t.id}.${f}`;
    assert.ok(t.sky.stops.length >= 2, where('sky.stops'));
    for (const [o, c] of t.sky.stops) {
      assert.ok(o >= 0 && o <= 1, where('sky.stops offset'));
      assert.ok(isColor(c), where(`sky.stops ${c}`));
    }
    assert.ok(t.sky.clouds === null || isColor(t.sky.clouds), where('sky.clouds'));
    assert.equal(typeof t.sky.stars, 'boolean', where('sky.stars'));
    if (t.sky.planet) {
      for (const k of ['ocean', 'shade', 'land', 'glow', 'cloud']) assert.ok(isColor(t.sky.planet[k]), where(`sky.planet.${k}`));
      for (const k of ['x', 'y', 'r']) assert.ok(Number.isFinite(t.sky.planet[k]), where(`sky.planet.${k}`));
    }
    assert.ok(t.sky.mountains.length >= 1, where('sky.mountains'));
    for (const m of t.sky.mountains) {
      assert.ok(isColor(m.color), where('mountain color'));
      for (const k of ['f', 'base', 'amp']) assert.ok(Number.isFinite(m[k]), where(`mountain.${k}`));
    }
    for (const layer of ['top', 'mid', 'dirt', 'rock']) {
      for (const k of ['c', 'n', 'b']) assert.ok(isRgb(t.terrain[layer][k]), where(`terrain.${layer}.${k}`));
    }
    assert.equal(t.terrain.depths.length, 3, where('terrain.depths'));
    assert.ok(t.terrain.depths[0] < t.terrain.depths[1] && t.terrain.depths[1] < t.terrain.depths[2], where('terrain.depths order'));
    assert.ok(isRgb(t.terrain.edgeTop), where('terrain.edgeTop'));
    assert.equal(t.terrain.edgeShade.length, 2, where('terrain.edgeShade'));
    assert.ok(isColor(t.scorch), where('scorch'));
    for (const k of ['fill', 'surface', 'foam', 'drop']) assert.ok(isColor(t.water[k]), where(`water.${k}`));
    if (t.water.gradient) {
      assert.ok(t.water.gradient.length >= 2, where('water.gradient'));
      for (const c of t.water.gradient) assert.ok(isColor(c), where('water.gradient color'));
    }
    assert.ok(['none', 'snow', 'embers', 'sprinkles', 'glitter'].includes(t.ambient), where('ambient'));
  }
});

test('themes carry their signature features', () => {
  assert.equal(themeById('space').sky.stars, true);
  assert.ok(themeById('space').sky.planet);
  assert.equal(themeById('arctic').ambient, 'snow');
  assert.equal(themeById('volcano').ambient, 'embers');
  assert.equal(themeById('candy').ambient, 'sprinkles');
  assert.equal(themeById('meadow').ambient, 'none');
});

test('themeById falls back to meadow', () => {
  assert.equal(themeById('desert').id, 'desert');
  assert.equal(themeById('nope').id, 'meadow');
  assert.equal(themeById(undefined).id, 'meadow');
});

test('every map has its own theme, and each theme belongs to exactly one map', () => {
  for (const l of LAYOUTS) {
    assert.ok(LAYOUT_THEME[l.id], `no theme for map ${l.id}`);
    assert.equal(themeForLayout(l.id).id, LAYOUT_THEME[l.id], l.id);
  }
  const used = LAYOUTS.map((l) => LAYOUT_THEME[l.id]);
  assert.equal(new Set(used).size, LAYOUTS.length, 'no two maps share a theme');
  for (const id of used) assert.ok(THEMES.some((t) => t.id === id), `unknown theme ${id}`);
});
