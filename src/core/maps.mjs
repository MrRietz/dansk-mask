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

// Floating islands with chasms, caves, craters and loose rocks. Deterministic per seed.
export function generateTerrain(seed, w, h, waterMargin = 64) {
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
export function findSpawns(terrain, rng, count, waterY) {
  const spawns = [];
  let minDist = (terrain.w * 0.85) / count;
  let tries = 0;
  while (spawns.length < count && tries < 4000) {
    tries++;
    if (tries % 400 === 0) minDist *= 0.7;
    const x = Math.floor(rng.range(50, terrain.w - 50));
    if (spawns.some((s) => Math.abs(s.x - x) < minDist)) continue;
    const y = terrain.surfaceY(x, 0);
    if (y < 0 || y > waterY - 50) continue;
    const yl = terrain.surfaceY(x - 8, y - 16);
    const yr = terrain.surfaceY(x + 8, y - 16);
    if (yl < 0 || yr < 0 || Math.abs(yl - y) > 12 || Math.abs(yr - y) > 12) continue;
    if (terrain.hitCircle(x, y - WORM_R - 1, WORM_R)) continue;
    spawns.push({ x, y: y - WORM_R - 1 });
  }
  return spawns;
}
