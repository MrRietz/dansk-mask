import { Rng } from './rng.mjs';
import { Terrain } from './terrain.mjs';
import { WORM_R } from './constants.mjs';

function valueNoise(rng) {
  const lat = Array.from({ length: 512 }, () => rng.next());
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = lat[i & 511];
    const b = lat[(i + 1) & 511];
    const t = f * f * (3 - 2 * f);
    return a + (b - a) * t;
  };
}

const fbm = (n, x) => n(x) * 0.6 + n(x * 2.1 + 17) * 0.28 + n(x * 4.3 + 33) * 0.12;
const smooth = (t) => t * t * (3 - 2 * t);

// Available layouts, in menu order. The first is the original generator.
export const LAYOUTS = [
  { id: 'islands', name: 'Floating Isles', desc: 'Floating islands with chasms, caves and loose rocks.' },
  { id: 'hills', name: 'Rolling Hills', desc: 'Soft hills, few caves, a little floating rock.' },
  { id: 'caverns', name: 'Caverns', desc: 'Thick ground riddled with tunnels and chambers, roofs over parts.' },
  { id: 'canyon', name: 'Canyon', desc: 'Two tall cliff plateaus around a deep ravine with bridges and ledges.' },
  { id: 'bridges', name: 'Bridges', desc: 'Narrow floating platforms on several levels plus side platforms.' },
  { id: 'arena', name: 'Arena', desc: 'Almost flat and wide, with a few towers and small craters.' },
];

// Maps a setting ('random' | layout id | anything) to a concrete layout id. 'random' is deterministic per seed
// and uses its own Rng, so the game's main random stream is untouched.
export function resolveLayout(layout, seed) {
  if (layout === 'random') return new Rng(((seed >>> 0) ^ 0x51ed270b) >>> 0).pick(LAYOUTS).id;
  return LAYOUTS.some((l) => l.id === layout) ? layout : 'islands';
}

const lerp = (a, b, t) => a + (b - a) * t;

function fillRect(terrain, x0, y0, x1, y1, value = 1) {
  const xa = Math.max(0, Math.floor(x0));
  const xb = Math.min(terrain.w, Math.ceil(x1));
  const ya = Math.max(0, Math.floor(y0));
  const yb = Math.min(terrain.h, Math.ceil(y1));
  if (xb <= xa) return;
  for (let y = ya; y < yb; y++) terrain.mask.fill(value, y * terrain.w + xa, y * terrain.w + xb);
}

// A wandering tunnel of circles.
function tunnel(terrain, rng, x, y, ang, r, steps, turn = 0.5) {
  for (let k = steps; k > 0; k--) {
    terrain.carveCircle(x, y, r);
    ang += rng.range(-turn, turn);
    x += Math.cos(ang) * r * 0.8;
    y += Math.sin(ang) * r * 0.8;
  }
}

// Generates a map of the given layout. Deterministic per seed + layout; unknown layouts fall back to islands.
export function generateTerrain(seed, w, h, waterMargin = 64, layout = 'islands') {
  const id = LAYOUTS.some((l) => l.id === layout) ? layout : 'islands';
  if (id === 'islands') return generateIslands(seed, w, h, waterMargin);
  const rng = new Rng(((seed ^ 0x9e3779b9) + LAYOUTS.findIndex((l) => l.id === id) * 0x632be5ab) >>> 0);
  const terrain = new Terrain(w, h);
  const waterY = h - waterMargin;
  GENERATORS[id](terrain, rng, w, h, waterY);
  return { terrain, waterY };
}

function generateHills(terrain, rng, w, h, waterY) {
  const nTop = valueNoise(rng);
  const nRough = valueNoise(rng);
  const scale = rng.range(300, 420);
  const off = rng.range(0, 300);
  const base = h * rng.range(0.46, 0.54);
  for (let x = 0; x < w; x++) {
    const edge = smooth(Math.min(1, Math.min(x, w - 1 - x) / 260));
    let top = base + (fbm(nTop, x / scale + off) - 0.5) * 220 + (nRough(x / 12) - 0.5) * 3;
    top = lerp(waterY - 25, top, edge);
    fillRect(terrain, x, Math.min(top, waterY - 25), x + 1, h);
  }
  for (let i = rng.int(2, 3); i > 0; i--) {
    const x = rng.range(w * 0.15, w * 0.85);
    const s = terrain.surfaceY(x, 0);
    if (s > 0 && s < waterY - 150) tunnel(terrain, rng, x, s + rng.range(40, 100), rng.range(0, Math.PI * 2), rng.range(8, 13), rng.int(20, 45));
  }
  for (let i = 0; i < 8; i++) {
    const x = rng.range(w * 0.1, w * 0.9);
    const s = terrain.surfaceY(x, 0);
    if (s > 0) terrain.carveCircle(x, s + rng.range(-2, 8), rng.range(16, 34));
  }
  for (let i = rng.int(3, 4); i > 0; i--) {
    const cx = rng.range(w * 0.1, w * 0.9);
    const cy = rng.range(h * 0.12, h * 0.3);
    if (terrain.solid(cx, cy) || terrain.surfaceY(cx, 0) < cy + 140) continue;
    for (let k = rng.int(3, 5); k > 0; k--) terrain.fillCircle(cx + rng.range(-34, 34), cy + rng.range(-10, 10), rng.range(12, 24));
  }
}

function generateCaverns(terrain, rng, w, h, waterY) {
  const nTop = valueNoise(rng);
  const nRough = valueNoise(rng);
  const scale = rng.range(280, 380);
  const off = rng.range(0, 300);
  const base = h * rng.range(0.3, 0.36);
  for (let x = 0; x < w; x++) {
    const edge = smooth(Math.min(1, Math.min(x, w - 1 - x) / 220));
    let top = base + (fbm(nTop, x / scale + off) - 0.5) * 110 + (nRough(x / 12) - 0.5) * 3;
    top = lerp(waterY - 25, top, edge);
    fillRect(terrain, x, Math.min(top, waterY - 25), x + 1, h);
  }
  // Chambers spread along x, chained with tunnels; some get a shaft up to the open air.
  const n = rng.int(9, 12);
  const chambers = [];
  for (let i = 0; i < n; i++) {
    const x = w * (0.1 + (0.8 * (i + rng.range(0.1, 0.9))) / n);
    const s = terrain.surfaceY(x, 0);
    if (s < 0 || s > waterY - 300) continue;
    const y = rng.range(s + 110, waterY - 130);
    const r = rng.range(42, 80);
    terrain.carveCircle(x, y, r);
    terrain.carveCircle(x + r * 0.5, y + r * 0.1, r * 0.7);
    terrain.carveCircle(x - r * 0.5, y + r * 0.1, r * 0.7);
    chambers.push({ x, y, r });
  }
  for (let i = 0; i < chambers.length; i++) {
    const a = chambers[i];
    const b = chambers[i + 1];
    if (b) {
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8);
      const tr = rng.range(9, 14);
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        terrain.carveCircle(lerp(a.x, b.x, t) + rng.range(-5, 5), lerp(a.y, b.y, t) + Math.sin(t * Math.PI * 2) * 20, tr);
      }
    }
    if (rng.chance(0.55)) {
      const sy = terrain.surfaceY(a.x, 0);
      const sr = rng.range(13, 20);
      if (sy > 0) for (let y = sy - 4; y < a.y; y += 6) terrain.carveCircle(a.x + Math.sin(y / 40) * 10, y, sr);
    }
  }
  for (let i = rng.int(8, 12); i > 0; i--) {
    const x = rng.range(w * 0.08, w * 0.92);
    const s = terrain.surfaceY(x, 0);
    if (s > 0 && s < waterY - 250) tunnel(terrain, rng, x, s + rng.range(80, 300), rng.range(0, Math.PI * 2), rng.range(8, 14), rng.int(30, 70));
  }
  // Roofs: slabs over parts of the surface, held up by pillars.
  for (let i = rng.int(3, 4); i > 0; i--) {
    const cx = rng.range(w * 0.2, w * 0.8);
    const s = terrain.surfaceY(cx, 0);
    if (s < 0) continue;
    const y = s - rng.range(95, 140);
    const len = rng.range(160, 280);
    terrain.fillLine(cx - len / 2, y, cx + len / 2, y, rng.range(20, 28));
    for (let k = 0; k < 3; k++) {
      const px = cx - len / 2 + k * (len / 2.4);
      fillRect(terrain, px, y, px + 16, s + 2);
    }
  }
  for (let i = 0; i < 5; i++) {
    const x = rng.range(w * 0.1, w * 0.9);
    const s = terrain.surfaceY(x, 0);
    if (s > 0) terrain.carveCircle(x, s + rng.range(-2, 6), rng.range(14, 28));
  }
}

function generateCanyon(terrain, rng, w, h, waterY) {
  const nTop = valueNoise(rng);
  const nWall = valueNoise(rng);
  const nFloor = valueNoise(rng);
  const off = rng.range(0, 300);
  const top0 = h * rng.range(0.34, 0.4);
  const gapC = w / 2 + rng.range(-80, 80);
  const gapHalf = rng.range(170, 230);
  for (let x = 0; x < w; x++) {
    const edge = smooth(Math.min(1, Math.min(x, w - 1 - x) / 170));
    let top = top0 + (fbm(nTop, x / 320 + off) - 0.5) * 60 + (nTop(x / 11) - 0.5) * 3;
    top = lerp(waterY - 25, top, edge);
    fillRect(terrain, x, Math.min(top, waterY - 25), x + 1, h);
  }
  // The ravine: steep, wobbly walls down to a rough floor just above the water.
  const wall = (y, side) => gapHalf + (nWall(y / 55 + (side ? 40 : 0)) - 0.5) * 50;
  for (let y = 0; y < waterY - 30; y++) {
    fillRect(terrain, gapC - wall(y, 0), y, gapC + wall(y, 1), y + 1, 0);
  }
  for (let x = Math.floor(gapC - gapHalf - 40); x < gapC + gapHalf + 40; x++) {
    fillRect(terrain, x, waterY - 60 + (nFloor(x / 25) - 0.5) * 50, x + 1, h);
  }
  // Bridges across the gap and ledges jutting from the walls.
  const spans = [top0 + rng.range(50, 100), top0 + rng.range(210, 290)];
  for (const by of spans) {
    const x0 = gapC - gapHalf - 40;
    const x1 = gapC + gapHalf + 40;
    const sag = rng.range(0, 14);
    const steps = 12;
    for (let k = 0; k < steps; k++) {
      const ya = by + Math.sin((k / steps) * Math.PI) * sag;
      const yb = by + Math.sin(((k + 1) / steps) * Math.PI) * sag;
      terrain.fillLine(lerp(x0, x1, k / steps), ya, lerp(x0, x1, (k + 1) / steps), yb, 14);
    }
  }
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    const y = top0 + 120 + (i + rng.range(0, 0.8)) * 60;
    const len = rng.range(60, 100);
    const edgeX = gapC + side * wall(y, side > 0 ? 1 : 0);
    fillRect(terrain, Math.min(edgeX, edgeX - side * len), y, Math.max(edgeX, edgeX - side * len) + 1, y + rng.range(14, 20));
  }
  for (let i = 0; i < 6; i++) {
    const x = rng.range(w * 0.05, w * 0.95);
    if (Math.abs(x - gapC) < gapHalf + 60) continue;
    const s = terrain.surfaceY(x, 0);
    if (s > 0) terrain.carveCircle(x, s + rng.range(-2, 6), rng.range(14, 26));
  }
}

function generateBridges(terrain, rng, w, h) {
  const plat = (cx, y, len, th) => {
    terrain.fillLine(cx - len / 2, y, cx + len / 2, y, th);
    for (let k = rng.int(2, 4); k > 0; k--) terrain.fillCircle(cx + rng.range(-len * 0.4, len * 0.4), y + th / 2 + rng.range(0, 8), rng.range(9, 16));
  };
  plat(w * 0.3 + rng.range(-80, 80), h * 0.31 + rng.range(-25, 25), rng.range(440, 540), rng.range(16, 22));
  plat(w * 0.7 + rng.range(-80, 80), h * 0.33 + rng.range(-25, 25), rng.range(440, 540), rng.range(16, 22));
  plat(w * 0.5 + rng.range(-100, 100), h * 0.5 + rng.range(-20, 20), rng.range(620, 760), rng.range(18, 24));
  if (rng.chance(0.7)) plat(w * 0.5 + rng.range(-300, 300), h * 0.69 + rng.range(-15, 15), rng.range(480, 600), rng.range(18, 24));
  // Side platforms: chunky shelves hugging the map edges.
  for (const side of [0, 1]) {
    const y = h * 0.58 + rng.range(-40, 40);
    const len = rng.range(260, 330);
    const cx = side ? w - len / 2 - rng.range(0, 30) : len / 2 + rng.range(0, 30);
    plat(cx, y, len, rng.range(40, 60));
    for (let k = 0; k < 4; k++) terrain.fillCircle(cx + rng.range(-len * 0.35, len * 0.35), y + rng.range(25, 55), rng.range(20, 34));
  }
  for (let i = 0; i < 4; i++) {
    const x = rng.range(w * 0.1, w * 0.9);
    const s = terrain.surfaceY(x, 0);
    if (s > 0) terrain.carveCircle(x, s + rng.range(-1, 4), rng.range(8, 14));
  }
}

function generateArena(terrain, rng, w, h, waterY) {
  const nTop = valueNoise(rng);
  const off = rng.range(0, 300);
  const base = h * rng.range(0.55, 0.6);
  for (let x = 0; x < w; x++) {
    const edge = smooth(Math.min(1, Math.min(x, w - 1 - x) / 110));
    let top = base + (nTop(x / 220 + off) - 0.5) * 24 + (nTop(x / 9) - 0.5) * 3;
    top = lerp(waterY - 25, top, edge);
    fillRect(terrain, x, Math.min(top, waterY - 25), x + 1, h);
  }
  const towers = rng.int(5, 7);
  for (let i = 0; i < towers; i++) {
    const cx = w * (0.12 + (0.76 * (i + rng.range(0.2, 0.8))) / towers);
    const tw = rng.range(30, 52);
    const s = terrain.surfaceY(cx, 0);
    if (s < 0) continue;
    fillRect(terrain, cx - tw / 2, s - rng.range(80, 170), cx + tw / 2, s + 2);
  }
  for (let i = rng.int(9, 13); i > 0; i--) {
    const x = rng.range(w * 0.08, w * 0.92);
    const s = terrain.surfaceY(x, h * 0.4);
    if (s > 0) terrain.carveCircle(x, s + rng.range(-3, 6), rng.range(14, 26));
  }
}

const GENERATORS = {
  hills: generateHills, caverns: generateCaverns, canyon: generateCanyon, bridges: generateBridges, arena: generateArena,
};

// Floating islands with chasms, caves, craters and loose rocks. Deterministic per seed.
function generateIslands(seed, w, h, waterMargin) {
  const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
  const nTop = valueNoise(rng);
  const nBody = valueNoise(rng);
  const nRough = valueNoise(rng);
  const terrain = new Terrain(w, h);
  const waterY = h - waterMargin;
  const scale = rng.range(380, 520);
  const offA = rng.range(0, 300);
  const offB = rng.range(0, 300);

  for (let x = 0; x < w; x++) {
    const edge = smooth(Math.min(1, Math.min(x, w - 1 - x) / 320));
    let top = h * 0.33 + (fbm(nTop, x / scale + offA) - 0.5) * h * 0.62 + (nRough(x / 14) - 0.5) * 5;
    top = Math.min(Math.max(top, 110), waterY - 60);
    let thick = (fbm(nBody, x / (scale * 1.3) + offB) - 0.28) * 1400;
    thick = thick * (0.2 + 0.8 * edge) - (1 - edge) * 90;
    thick = Math.min(thick, h * 0.55);
    if (thick <= 6) continue;
    const y0 = Math.floor(top);
    const y1 = Math.min(h, Math.floor(top + thick));
    for (let y = y0; y < y1; y++) terrain.mask[y * w + x] = 1;
  }

  // Caves: wandering tunnels through the land.
  for (let i = rng.int(6, 10); i > 0; i--) {
    let x = rng.range(w * 0.1, w * 0.9);
    let y = -1;
    const s = terrain.surfaceY(x, 0);
    if (s < 0) continue;
    y = s + rng.range(30, 120);
    let ang = rng.range(0, Math.PI * 2);
    const r = rng.range(7, 15);
    for (let k = rng.int(25, 70); k > 0; k--) {
      terrain.carveCircle(x, y, r);
      ang += rng.range(-0.5, 0.5);
      x += Math.cos(ang) * r * 0.8;
      y += Math.sin(ang) * r * 0.8;
    }
  }

  // Craters on the surface for an uneven look.
  for (let i = 0; i < 12; i++) {
    const x = rng.range(w * 0.05, w * 0.95);
    const s = terrain.surfaceY(x, 0);
    if (s > 0) terrain.carveCircle(x, s + rng.range(-4, 8), rng.range(18, 42));
  }

  // Loose rocks floating in the sky.
  for (let i = rng.int(5, 8); i > 0; i--) {
    const cx = rng.range(w * 0.08, w * 0.92);
    const cy = rng.range(h * 0.12, h * 0.42);
    if (terrain.solid(cx, cy) || terrain.surfaceY(cx, cy - 80) > 0 && terrain.surfaceY(cx, cy - 80) < cy + 90) continue;
    for (let k = rng.int(3, 6); k > 0; k--) {
      terrain.fillCircle(cx + rng.range(-36, 36), cy + rng.range(-12, 12), rng.range(12, 26));
    }
  }

  return { terrain, waterY };
}

// Spawn points on solid, fairly flat ground well above the water.
// minGround > 0 also rejects spots whose ground is thinner than that many px (slivers a worm would fall through).
export function findSpawns(terrain, rng, count, waterY, minGround = 0) {
  const spawns = [];
  let minDist = (terrain.w * 0.85) / count;
  let tries = 0;
  while (spawns.length < count && tries < 6000) {
    tries++;
    if (tries % 400 === 0) minDist = Math.max(24, minDist * 0.7);
    const x = Math.floor(rng.range(50, terrain.w - 50));
    // After the first rounds fail, also consider lower surfaces (platforms under others, cave floors).
    const lower = tries > 1200;
    const startY = lower ? Math.floor(rng.range(0, waterY - 60)) : 0;
    const y = terrain.surfaceY(x, startY);
    if (spawns.some((s) => Math.abs(s.x - x) < minDist && (!lower || Math.abs(s.y - y) < 60))) continue;
    if (y < 0 || y > waterY - 50) continue;
    if (lower && terrain.raycast(x, y - 40, x, y - 2)) continue;
    const yl = terrain.surfaceY(x - 8, y - 16);
    const yr = terrain.surfaceY(x + 8, y - 16);
    if (yl < 0 || yr < 0 || Math.abs(yl - y) > 12 || Math.abs(yr - y) > 12) continue;
    if (terrain.hitCircle(x, y - WORM_R - 1, WORM_R)) continue;
    if (minGround > 0 && !(terrain.solid(x, y + minGround) && terrain.solid(x - 6, y + minGround) && terrain.solid(x + 6, y + minGround))) continue;
    spawns.push({ x, y: y - WORM_R - 1 });
  }
  return spawns;
}
