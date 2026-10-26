// Music: one original 8-bar loop per map, as plain data (no audio code here, so it can be tested in Node).
// Notes are MIDI numbers, N = rest. Every bar has 8 eighth-note steps.
//
//   bpm        tempo
//   bass       { kind: 'tri' | 'saw' | 'pad', pat: 8 semitone offsets from the bar root (or N), vol }
//   chord      { kind: 'square' | 'power' | 'soft', pat: 8 x 0/1 }   (omit for none)
//   drums      { kick, snare, hat: 8 x 0/1 patterns, kickVol, snareKind: 'snare' | 'tak' | 'clap', hatKind: 'hat' | 'bells' }
//   lead       'square' | 'pungi' | 'bell' | 'music' | 'glass'
//   alt        every second pass the lead drops an octave and changes voice
//   fill       a drum fill in the last half bar of the loop
//   roots      bass root per bar, chords  the chord tones per bar, mel  the melody per bar
const N = null;

// An arpeggio over a chord: index i picks chord[i % 3] raised by an octave for every 3.
const arp = (chord, order, add = 0) => order.map((i) => (i === N ? N : chord[i % 3] + 12 * Math.floor(i / 3) + add));

const SPACE_CHORDS = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62], [57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]];
const A = [0, 1, 2, 3, 2, 1, 2, 1];
const B = [3, 2, 1, 0, 1, 2, 3, N];

// The track of a map is looked up by its layout id (see LAYOUTS in core/maps.mjs).
export const TRACKS = {
  // Floating Isles: the bouncy oom-pah march in C major.
  islands: {
    name: 'Meadow March',
    bpm: 132,
    lead: 'square',
    alt: true,
    fill: true,
    bass: { kind: 'tri', pat: [0, N, N, N, 7, N, N, N], vol: 0.4 },
    chord: { kind: 'square', pat: [0, 0, 1, 0, 0, 0, 1, 0] },
    drums: { kick: [1, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 1, 0, 0, 0, 1, 0], hat: [0, 1, 0, 1, 0, 1, 0, 1], kickVol: 0.35, snareKind: 'snare', hatKind: 'hat' },
    roots: [48, 45, 41, 43, 48, 45, 41, 43],
    chords: [[60, 64, 67], [57, 60, 64], [60, 65, 69], [59, 62, 67], [60, 64, 67], [57, 60, 64], [60, 65, 69], [59, 62, 67]],
    mel: [
      [76, N, 79, 76, 72, N, 74, 76],
      [81, N, 76, 72, 76, N, 74, 72],
      [77, N, 81, 77, 72, N, 74, 77],
      [79, N, 74, 71, 74, N, 79, N],
      [76, 76, 79, N, 84, N, 79, 76],
      [81, N, 79, 76, 72, N, 76, N],
      [77, N, 76, 74, 72, N, 74, N],
      [74, N, 71, 74, 79, N, N, N],
    ],
  },

  // Rolling Hills (desert): a slow snake-charmer tune in D phrygian dominant, nasal lead over a drone and hand drums.
  hills: {
    name: 'Caravan',
    bpm: 96,
    lead: 'pungi',
    alt: false,
    fill: false,
    bass: { kind: 'tri', pat: [0, N, N, 0, N, N, 0, N], vol: 0.38 },
    chord: { kind: 'soft', pat: [1, 0, 0, 0, 0, 0, 0, 0] },
    drums: { kick: [1, 0, 0, 1, 0, 0, 1, 0], snare: [0, 0, 1, 0, 0, 1, 0, 0], hat: [0, 1, 0, 1, 0, 1, 0, 1], kickVol: 0.3, snareKind: 'tak', hatKind: 'bells' },
    roots: [38, 39, 38, 36, 38, 39, 38, 33],
    chords: [[62, 65, 69], [63, 67, 70], [62, 65, 69], [60, 64, 67], [62, 65, 69], [63, 67, 70], [62, 65, 69], [57, 61, 64]],
    mel: [
      [74, 75, 74, N, 78, 79, 78, N],
      [79, N, 78, 75, 74, N, 75, N],
      [74, 75, 74, N, 78, 79, 81, N],
      [82, N, 81, 79, 78, N, 75, N],
      [74, 75, 74, N, 78, 79, 78, N],
      [79, N, 81, 82, 81, N, 79, N],
      [78, 79, 78, 75, 74, N, 75, 78],
      [81, N, 79, 78, 75, N, 74, N],
    ],
  },

  // Caverns (volcano): heavy, driving E minor with pumping saw bass and power chords.
  caverns: {
    name: 'Magma Chamber',
    bpm: 140,
    lead: 'square',
    alt: false,
    fill: true,
    bass: { kind: 'saw', pat: [0, 0, 0, 0, 0, 0, 0, 0], vol: 0.24 },
    chord: { kind: 'power', pat: [0, 0, 1, 0, 0, 0, 1, 1] },
    drums: { kick: [1, 0, 0, 0, 1, 0, 1, 0], snare: [0, 0, 1, 0, 0, 0, 1, 0], hat: [1, 1, 1, 1, 1, 1, 1, 1], kickVol: 0.45, snareKind: 'snare', hatKind: 'hat' },
    roots: [40, 36, 38, 40, 40, 36, 38, 35],
    chords: [[52, 59, 64], [48, 55, 60], [50, 57, 62], [52, 59, 64], [52, 59, 64], [48, 55, 60], [50, 57, 62], [47, 54, 59]],
    mel: [
      [76, N, N, 79, N, 76, N, 74],
      [72, N, N, 76, N, 72, N, 71],
      [74, N, N, 78, N, 74, N, 76],
      [76, N, N, 83, N, 79, N, 76],
      [76, N, N, 79, N, 76, N, 74],
      [72, N, N, 76, N, 72, N, 71],
      [74, N, 78, N, 81, N, 78, N],
      [71, N, 75, N, 78, N, 83, N],
    ],
  },

  // Canyon (space): slow, airy A minor arpeggios with a long pad underneath and almost no drums.
  canyon: {
    name: 'Moonwalk',
    bpm: 80,
    lead: 'glass',
    alt: false,
    fill: false,
    bass: { kind: 'pad', pat: [0, N, N, N, N, N, N, N], vol: 0.3 },
    chord: { kind: 'soft', pat: [1, 0, 0, 0, 1, 0, 0, 0] },
    drums: { kick: [1, 0, 0, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0], hat: [0, 0, 0, 0, 0, 0, 0, 0], kickVol: 0.16, snareKind: 'snare', hatKind: 'hat' },
    roots: [45, 41, 48, 43, 45, 41, 43, 40],
    chords: SPACE_CHORDS,
    mel: SPACE_CHORDS.map((c, i) => arp(c, i < 4 ? A : B, 12)),
  },

  // Bridges (candy): a quick music-box tune in C major pentatonic.
  bridges: {
    name: 'Sugar Rush',
    bpm: 152,
    lead: 'music',
    alt: false,
    fill: false,
    bass: { kind: 'tri', pat: [0, N, 7, N, 0, N, 7, N], vol: 0.32 },
    drums: { kick: [1, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 1, 0, 0, 0, 1, 0], hat: [1, 1, 1, 1, 1, 1, 1, 1], kickVol: 0.25, snareKind: 'clap', hatKind: 'hat' },
    roots: [48, 41, 43, 48, 45, 41, 43, 48],
    chords: [[60, 64, 67], [60, 65, 69], [59, 62, 67], [60, 64, 67], [57, 60, 64], [60, 65, 69], [59, 62, 67], [60, 64, 67]],
    mel: [
      [84, N, 86, 88, 91, N, 88, 86],
      [84, N, 81, 84, 89, N, 84, 81],
      [83, N, 86, 83, 91, N, 86, 83],
      [88, 86, 84, 86, 88, N, 84, N],
      [81, N, 84, 88, 93, N, 88, 84],
      [89, N, 84, 81, 84, N, 89, N],
      [91, N, 86, 83, 86, N, 91, N],
      [84, 88, 91, N, 96, N, N, N],
    ],
  },

  // Arena (arctic): gentle D minor with sleigh bells and bell-like melody.
  arena: {
    name: 'Frostbite',
    bpm: 100,
    lead: 'bell',
    alt: false,
    fill: false,
    bass: { kind: 'tri', pat: [0, N, N, N, N, N, 7, N], vol: 0.3 },
    chord: { kind: 'soft', pat: [1, 0, 0, 0, 0, 0, 0, 0] },
    drums: { kick: [1, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0], hat: [0, 1, 0, 1, 0, 1, 0, 1], kickVol: 0.16, snareKind: 'snare', hatKind: 'bells' },
    roots: [38, 34, 41, 36, 38, 34, 45, 38],
    chords: [[62, 65, 69], [58, 62, 65], [60, 65, 69], [60, 64, 67], [62, 65, 69], [58, 62, 65], [57, 61, 64], [62, 65, 69]],
    mel: [
      [74, N, 77, N, 81, N, 77, N],
      [74, N, 77, N, 82, N, 77, N],
      [77, N, 81, N, 84, N, 81, N],
      [76, N, 79, N, 84, N, 79, N],
      [74, N, 77, N, 81, N, 86, N],
      [82, N, 81, N, 77, N, 74, N],
      [81, N, 85, N, 88, N, 85, N],
      [86, N, 81, N, 77, N, 74, N],
    ],
  },
};

// Falls back to the first map's tune.
export function trackFor(layoutId) {
  return TRACKS[layoutId] || TRACKS.islands;
}
