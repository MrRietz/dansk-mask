// Visual themes: pure data, no game physics. See docs/EXTENDING.md ("Themes").
//
// sky.stops        [[offset 0..1, css color], ...] vertical gradient
// sky.clouds       css color of the drifting clouds, or null
// sky.stars        true = twinkling stars
// sky.planet       null or { x, y, r, ... } (x, y, r are fractions of the viewport) — a big planet in the background
// sky.mountains    [{ f (parallax), color, base (0..1 of viewport height), amp (px) }, ...] back to front
// terrain.top/mid/dirt/rock  { c: [r,g,b], n: [r,g,b] noise gain, b: [r,g,b] band gain }
// terrain.depths   [top, mid, dirt] depth limits in px below the surface (deeper = rock)
// terrain.edgeTop  [r,g,b] rim of the topmost layer on exposed upward edges
// terrain.edgeShade [down, side] edge darkening factors
// scorch           css color of the crater rim ('carve')
// water            { fill (behind the land), surface (front), foam (surface line), drop (splash), gradient? (surface stops) }
// ambient          'none' | 'snow' | 'embers' | 'sprinkles' | 'glitter'
export const THEMES = [
  {
    id: 'meadow',
    name: 'Meadow',
    sky: {
      stops: [[0, '#2a6db0'], [0.6, '#79b8e6'], [1, '#cfe9f7']],
      clouds: 'rgba(255,255,255,0.85)',
      stars: false,
      planet: null,
      mountains: [{ f: 0.25, color: '#5d8fb8', base: 0.62, amp: 70 }, { f: 0.4, color: '#4a7aa1', base: 0.72, amp: 55 }],
    },
    terrain: {
      top: { c: [70, 160, 55], n: [1, 1.2, 1], b: [0, 0, 0] },
      mid: { c: [90, 110, 50], n: [1, 1, 1], b: [0, 0, 0] },
      dirt: { c: [128, 88, 56], n: [1, 1, 1], b: [1, 0.7, 0] },
      rock: { c: [100, 80, 68], n: [1, 1, 1], b: [1, 0, 0] },
      depths: [4, 9, 120],
      edgeTop: [40, 100, 35],
      edgeShade: [0.45, 0.55],
    },
    scorch: 'rgba(30,18,8,0.9)',
    water: { fill: '#18527f', surface: 'rgba(30,110,170,0.62)', foam: 'rgba(220,245,255,0.7)', drop: 'rgb(190,230,255)' },
    ambient: 'none',
  },
  {
    id: 'desert',
    name: 'Desert',
    sky: {
      stops: [[0, '#c9531f'], [0.55, '#f0a04a'], [1, '#ffe2a3']],
      clouds: 'rgba(255,226,180,0.45)',
      stars: false,
      planet: null,
      mountains: [{ f: 0.25, color: '#c98a52', base: 0.62, amp: 60 }, { f: 0.4, color: '#a5653a', base: 0.72, amp: 50 }],
    },
    terrain: {
      top: { c: [226, 192, 122], n: [1, 1, 0.8], b: [0, 0, 0] },
      mid: { c: [208, 166, 98], n: [1, 1, 0.8], b: [0, 0, 0] },
      dirt: { c: [196, 134, 78], n: [1, 1, 1], b: [1, 0.8, 0.5] },
      rock: { c: [150, 84, 58], n: [1, 1, 1], b: [1, 0.5, 0.3] },
      depths: [4, 9, 70],
      edgeTop: [150, 108, 60],
      edgeShade: [0.55, 0.65],
    },
    scorch: 'rgba(50,26,12,0.9)',
    water: { fill: '#0d6f78', surface: 'rgba(28,176,170,0.62)', foam: 'rgba(230,255,245,0.7)', drop: 'rgb(190,245,235)' },
    ambient: 'none',
  },
  {
    id: 'arctic',
    name: 'Arctic',
    sky: {
      stops: [[0, '#3a5f8f'], [0.6, '#a2c4e4'], [1, '#eaf6ff']],
      clouds: 'rgba(238,246,255,0.8)',
      stars: false,
      planet: null,
      mountains: [{ f: 0.25, color: '#a9c0da', base: 0.62, amp: 80 }, { f: 0.4, color: '#869fc0', base: 0.72, amp: 60 }],
    },
    terrain: {
      top: { c: [240, 246, 252], n: [0.5, 0.5, 0.4], b: [0, 0, 0] },
      mid: { c: [205, 228, 242], n: [0.7, 0.7, 0.6], b: [0, 0, 0] },
      dirt: { c: [150, 196, 226], n: [0.8, 0.8, 0.7], b: [0.8, 0.8, 0.6] },
      rock: { c: [96, 122, 152], n: [1, 1, 1], b: [1, 0.8, 0.6] },
      depths: [5, 10, 110],
      edgeTop: [170, 200, 226],
      edgeShade: [0.7, 0.8],
    },
    scorch: 'rgba(20,26,42,0.85)',
    water: { fill: '#0e3a5c', surface: 'rgba(24,100,152,0.62)', foam: 'rgba(242,252,255,0.85)', drop: 'rgb(220,244,255)' },
    ambient: 'snow',
  },
  {
    id: 'volcano',
    name: 'Volcano',
    sky: {
      stops: [[0, '#1a0505'], [0.6, '#5a1410'], [1, '#aa3a14']],
      clouds: 'rgba(45,22,22,0.6)',
      stars: false,
      planet: null,
      mountains: [{ f: 0.25, color: '#3a1410', base: 0.62, amp: 80 }, { f: 0.4, color: '#240809', base: 0.72, amp: 60 }],
    },
    terrain: {
      top: { c: [46, 40, 42], n: [0.8, 0.8, 0.8], b: [0, 0, 0] },
      mid: { c: [118, 38, 24], n: [1, 0.8, 0.6], b: [0, 0, 0] },
      dirt: { c: [74, 54, 52], n: [1, 1, 1], b: [1, 0.7, 0.7] },
      rock: { c: [40, 32, 34], n: [0.8, 0.8, 0.8], b: [0.8, 0.5, 0.5] },
      depths: [4, 9, 100],
      edgeTop: [130, 34, 12],
      edgeShade: [0.5, 0.6],
    },
    scorch: 'rgba(8,4,4,0.92)',
    water: { fill: '#8a1a06', surface: 'rgba(255,96,24,0.8)', foam: 'rgba(255,222,100,0.85)', drop: 'rgb(255,170,50)' },
    ambient: 'embers',
  },
  {
    id: 'space',
    name: 'Space',
    sky: {
      stops: [[0, '#000005'], [0.6, '#04040f'], [1, '#0b0b26']],
      clouds: null,
      stars: true,
      planet: { x: 0.78, y: 0.27, r: 0.17, ocean: '#2a6fd0', shade: '#050c24', land: '#3f9b4a', glow: 'rgba(120,180,255,0.3)', cloud: 'rgba(255,255,255,0.55)' },
      mountains: [{ f: 0.25, color: '#1c1c26', base: 0.64, amp: 60 }, { f: 0.4, color: '#111118', base: 0.74, amp: 45 }],
    },
    terrain: {
      top: { c: [164, 164, 170], n: [1.2, 1.2, 1.2], b: [0, 0, 0] },
      mid: { c: [138, 138, 144], n: [1.1, 1.1, 1.1], b: [0, 0, 0] },
      dirt: { c: [112, 112, 120], n: [1, 1, 1], b: [0.9, 0.9, 0.9] },
      rock: { c: [78, 78, 88], n: [1, 1, 1], b: [0.8, 0.8, 0.8] },
      depths: [4, 9, 120],
      edgeTop: [92, 92, 100],
      edgeShade: [0.5, 0.6],
    },
    scorch: 'rgba(14,14,20,0.9)',
    water: { fill: '#341660', surface: 'rgba(150,70,222,0.6)', foam: 'rgba(240,190,255,0.7)', drop: 'rgb(222,172,255)' },
    ambient: 'glitter',
  },
  {
    id: 'candy',
    name: 'Candy',
    sky: {
      stops: [[0, '#ff9fd4'], [0.55, '#ffd6ec'], [1, '#d7fff0']],
      clouds: 'rgba(255,205,232,0.85)',
      stars: false,
      planet: null,
      mountains: [{ f: 0.25, color: '#e9a6d2', base: 0.62, amp: 65 }, { f: 0.4, color: '#c9a2ea', base: 0.72, amp: 50 }],
    },
    terrain: {
      top: { c: [255, 168, 210], n: [0.6, 0.6, 0.6], b: [0, 0, 0] },
      mid: { c: [252, 236, 246], n: [0.5, 0.5, 0.5], b: [0, 0, 0] },
      dirt: { c: [140, 216, 186], n: [0.8, 0.8, 0.8], b: [0.8, 0.8, 0.8] },
      rock: { c: [112, 66, 62], n: [0.9, 0.9, 0.9], b: [0.8, 0.6, 0.6] },
      depths: [4, 9, 90],
      edgeTop: [214, 98, 158],
      edgeShade: [0.65, 0.75],
    },
    scorch: 'rgba(92,30,62,0.8)',
    water: {
      fill: '#a8449a',
      surface: 'rgba(255,120,190,0.7)',
      foam: 'rgba(255,255,255,0.85)',
      drop: 'rgb(255,200,235)',
      gradient: ['rgba(255,110,170,0.72)', 'rgba(255,170,90,0.72)', 'rgba(255,235,110,0.72)', 'rgba(120,230,170,0.72)', 'rgba(110,170,255,0.72)'],
    },
    ambient: 'sprinkles',
  },
];

export function themeById(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

// Every map has its own theme: the look is part of the map, not a separate choice.
export const LAYOUT_THEME = {
  islands: 'meadow',
  hills: 'desert',
  caverns: 'volcano',
  canyon: 'space',
  bridges: 'candy',
  arena: 'arctic',
};

export function themeForLayout(layoutId) {
  return themeById(LAYOUT_THEME[layoutId]);
}
