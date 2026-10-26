// Builds and maintains the visible terrain bitmap from the core's mask.
// Later destruction arrives as 'carve' / 'fill' events and is applied to the canvas only.
import { themeById } from './themes.mjs';

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const pack = (r, g, b) => (255 << 24) | (Math.max(0, Math.min(255, b)) << 16) | (Math.max(0, Math.min(255, g)) << 8) | Math.max(0, Math.min(255, r));

export function buildTerrainCanvas(terrain, theme = themeById('meadow')) {
  const { w, h, mask } = terrain;
  const T = theme.terrain;
  const [dTop, dMid, dDirt] = T.depths;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const px = new Uint32Array(img.data.buffer);
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] !== 0;

  for (let x = 0; x < w; x++) {
    let depth = 0;
    for (let y = 0; y < h; y++) {
      if (!mask[y * w + x]) {
        depth = 0;
        continue;
      }
      const n = hash(x >> 1, y >> 1) * 22 - 11;
      const band = Math.sin(y * 0.09 + Math.sin(x * 0.013) * 3) * 6;
      // top layer -> top-to-dirt -> dirt -> rock, by depth below the surface (band gain is 0 for the thin top layers)
      const L = depth < dTop ? T.top : depth < dMid ? T.mid : depth < dDirt ? T.dirt : T.rock;
      let r = L.c[0] + n * L.n[0] + band * L.b[0];
      let g = L.c[1] + n * L.n[1] + band * L.b[1];
      let b = L.c[2] + n * L.n[2] + band * L.b[2];
      const edge = !solid(x, y - 1) || !solid(x, y + 1) || !solid(x - 1, y) || !solid(x + 1, y);
      if (edge) {
        const down = !solid(x, y + 1);
        const k = down ? T.edgeShade[0] : T.edgeShade[1];
        r *= k;
        g *= k;
        b *= k;
        if (!down && depth < dTop) {
          r = T.edgeTop[0]; g = T.edgeTop[1]; b = T.edgeTop[2];
        }
      }
      px[y * w + x] = pack(r, g, b);
      depth++;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Blast crater with a scorched rim.
export function carve(canvas, x, y, r, theme) {
  const ctx = canvas.getContext('2d');
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = theme ? theme.scorch : 'rgba(30,18,8,0.9)';
  ctx.beginPath();
  ctx.arc(x, y, r + 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

export function drawGirder(canvas, x1, y1, x2, y2, th) {
  const ctx = canvas.getContext('2d');
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2b2f38';
  ctx.lineWidth = th;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = '#9aa3b2';
  ctx.lineWidth = th - 3;
  ctx.stroke();
  ctx.strokeStyle = '#5b6372';
  ctx.setLineDash([2, 6]);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
}
