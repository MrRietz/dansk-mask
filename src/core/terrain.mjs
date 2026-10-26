// Destructible terrain as a 1-bit-per-pixel mask. No DOM: runs in Node (server) and browser alike.
const N = 16;
const UX = new Float32Array(N);
const UY = new Float32Array(N);
for (let i = 0; i < N; i++) {
  UX[i] = Math.cos((i / N) * Math.PI * 2);
  UY[i] = Math.sin((i / N) * Math.PI * 2);
}

export class Terrain {
  constructor(w, h, mask) {
    this.w = w;
    this.h = h;
    this.mask = mask ?? new Uint8Array(w * h);
  }

  // Outside the map is "air": things leaving the sides/bottom fall into the water.
  solid(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.mask[(y | 0) * this.w + (x | 0)] !== 0;
  }

  hitCircle(x, y, r) {
    if (this.solid(x, y)) return true;
    for (let i = 0; i < N; i++) if (this.solid(x + UX[i] * r, y + UY[i] * r)) return true;
    return false;
  }

  // Unit vector pointing away from the solid around (x, y).
  normalAt(x, y, r) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < N; i++) {
      if (this.solid(x + UX[i] * r, y + UY[i] * r)) {
        sx -= UX[i];
        sy -= UY[i];
      }
    }
    const l = Math.hypot(sx, sy);
    return l < 1e-6 ? { x: 0, y: -1 } : { x: sx / l, y: sy / l };
  }

  paintCircle(cx, cy, r, value) {
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      const q = r * r - dy * dy;
      if (q < 0) continue;
      const hw = Math.sqrt(q);
      const xa = Math.max(0, Math.ceil(cx - hw));
      const xb = Math.min(this.w - 1, Math.floor(cx + hw));
      if (xb >= xa) this.mask.fill(value, y * this.w + xa, y * this.w + xb + 1);
    }
  }

  carveCircle(cx, cy, r) {
    this.paintCircle(cx, cy, r, 0);
  }

  fillCircle(cx, cy, r) {
    this.paintCircle(cx, cy, r, 1);
  }

  fillLine(x1, y1, x2, y2, thickness) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.ceil(len));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.fillCircle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, thickness / 2);
    }
  }

  // First solid pixel on the segment, or null.
  raycast(x0, y0, x1, y1) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(len);
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (this.solid(x, y)) return { x, y, dist: len * t };
    }
    return null;
  }

  // Distance down from y to the first solid pixel in column x, or -1.
  groundBelow(x, y, maxDist) {
    for (let d = 0; d <= maxDist; d++) if (this.solid(x, y + d)) return d;
    return -1;
  }

  // y of the first surface pixel (solid with air above) scanning down from y0, or -1.
  surfaceY(x, y0 = 0) {
    for (let y = Math.max(1, Math.floor(y0)); y < this.h; y++) {
      if (this.solid(x, y) && !this.solid(x, y - 1)) return y;
    }
    return -1;
  }
}
