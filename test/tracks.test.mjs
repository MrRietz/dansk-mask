import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, trackFor } from '../src/client/tracks.mjs';
import { LAYOUTS } from '../src/core/maps.mjs';

const KINDS = {
  bass: ['tri', 'saw', 'pad'],
  chord: ['square', 'power', 'soft'],
  lead: ['square', 'pungi', 'bell', 'music', 'glass'],
  snare: ['snare', 'tak', 'clap'],
  hat: ['hat', 'bells'],
};
const isPattern = (a) => Array.isArray(a) && a.length === 8 && a.every((v) => v === 0 || v === 1);

test('every map has its own music, and no two maps share a tune', () => {
  for (const l of LAYOUTS) assert.ok(TRACKS[l.id], `no track for map ${l.id}`);
  assert.equal(new Set(LAYOUTS.map((l) => TRACKS[l.id].name)).size, LAYOUTS.length, 'unique names');
  assert.equal(new Set(LAYOUTS.map((l) => TRACKS[l.id].bpm)).size, LAYOUTS.length, 'unique tempos');
  assert.equal(trackFor('nope'), TRACKS.islands, 'unknown map falls back to the first tune');
});

test('tracks are well formed: 8 bars of 8 steps, valid notes, patterns and voices', () => {
  for (const [id, t] of Object.entries(TRACKS)) {
    const at = (what) => `${id}: ${what}`;
    assert.ok(t.bpm >= 60 && t.bpm <= 180, at('bpm'));
    assert.equal(t.mel.length, 8, at('8 bars'));
    assert.equal(t.roots.length, 8, at('8 roots'));
    assert.equal(t.chords.length, 8, at('8 chords'));
    for (const bar of t.mel) {
      assert.equal(bar.length, 8, at('8 steps per bar'));
      for (const n of bar) assert.ok(n === null || (Number.isInteger(n) && n >= 40 && n <= 108), at(`note ${n}`));
    }
    assert.ok(t.mel.flat().some((n) => n !== null), at('has a melody'));
    for (const r of t.roots) assert.ok(Number.isInteger(r) && r >= 24 && r <= 60, at(`root ${r}`));
    for (const c of t.chords) assert.ok(c.length === 3 && c.every(Number.isInteger), at('chord'));
    assert.ok(KINDS.bass.includes(t.bass.kind), at('bass kind'));
    assert.equal(t.bass.pat.length, 8, at('bass pattern'));
    assert.ok(t.bass.pat.some((v) => v !== null), at('bass plays'));
    if (t.chord) {
      assert.ok(KINDS.chord.includes(t.chord.kind), at('chord kind'));
      assert.ok(isPattern(t.chord.pat), at('chord pattern'));
    }
    assert.ok(KINDS.lead.includes(t.lead), at('lead voice'));
    for (const k of ['kick', 'snare', 'hat']) assert.ok(isPattern(t.drums[k]), at(`${k} pattern`));
    assert.ok(KINDS.snare.includes(t.drums.snareKind), at('snare kind'));
    assert.ok(KINDS.hat.includes(t.drums.hatKind), at('hat kind'));
    assert.ok(t.drums.kickVol > 0 && t.drums.kickVol <= 0.6, at('kick volume'));
  }
});
