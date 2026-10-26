// Menu thumbnails: the real map generator (same seed, same layout) drawn small, in a theme's colours.
// What the preview shows is what you get when you start with that seed.
import { generateTerrain } from '../core/maps.mjs';
import { DEFAULT_SETTINGS } from '../core/constants.mjs';

export const PW = 150;
export const PH = 60;
const SAMPLES = 4; // per pixel and axis: thin platforms still show up

const cache = new Map(); // "layout:seed" -> { solid: Uint8Array(PW * PH), water: row where the water starts }

// Coverage of the terrain mask, downsampled to PW x PH (1 = land).
export function coverage(layoutId, seed) {
  const key = `${layoutId}:${seed}`;
  let c = cache.get(key);
  if (c) return c;
  const { worldW: w, worldH: h, waterMargin } = DEFAULT_SETTINGS;
  const { terrain, waterY } = generateTerrain(seed, w, h, waterMargin, layoutId);
  const solid = new Uint8Array(PW * PH);
  const cw = w / PW;
  const ch = h / PH;
  for (let py = 0; py < PH; py++) {
    for (let px = 0; px < PW; px++) {
      let n = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = Math.min(w - 1, Math.floor((px + (sx + 0.5) / SAMPLES) * cw));
          const y = Math.min(h - 1, Math.floor((py + (sy + 0.5) / SAMPLES) * ch));
          if (terrain.mask[y * w + x]) n++;
        }
      }
      solid[py * PW + px] = n >= SAMPLES * SAMPLES * 0.2 ? 1 : 0;
    }
  }
  c = { solid, water: Math.floor((waterY / h) * PH) };
  cache.set(key, c);
  return c;
}

const rgb = (c, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;

function paintSky(ctx, theme, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [o, col] of theme.sky.stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// Draws a layout preview into a canvas (PW x PH) with the given theme.
export function drawLayoutPreview(canvas, layoutId, seed, theme) {
  const ctx = canvas.getContext('2d');
  const { solid, water } = coverage(layoutId, seed);
  paintSky(ctx, theme, PW, PH);
  ctx.fillStyle = theme.water.fill;
  ctx.fillRect(0, water, PW, PH - water);
  const t = theme.terrain;
  for (let px = 0; px < PW; px++) {
    let depth = 0;
    for (let py = 0; py < PH; py++) {
      if (!solid[py * PW + px]) {
        depth = 0;
        continue;
      }
      ctx.fillStyle = depth === 0 ? rgb(t.top.c) : depth < 3 ? rgb(t.dirt.c) : rgb(t.rock.c, 0.9);
      ctx.fillRect(px, py, 1, 1);
      depth++;
    }
  }
}
