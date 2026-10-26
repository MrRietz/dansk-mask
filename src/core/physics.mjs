// Pure physics helpers shared by the game and the AI's shot simulator (no events, no side effects
// besides mutating the body passed in).
import { GRAVITY, WIND_ACC } from './constants.mjs';

// Moves a circle body for dt, bouncing off terrain. Returns collision info or null.
export function moveBody(terrain, b, dt, bounce = 0.4, friction = 0.9) {
  const speed = Math.hypot(b.vx, b.vy);
  const steps = Math.max(1, Math.ceil((speed * dt) / 1.5));
  const sdt = dt / steps;
  for (let i = 0; i < steps; i++) {
    const nx = b.x + b.vx * sdt;
    const ny = b.y + b.vy * sdt;
    if (!terrain.hitCircle(nx, ny, b.r)) {
      b.x = nx;
      b.y = ny;
      continue;
    }
    const n = terrain.normalAt(nx, ny, b.r);
    const vn = b.vx * n.x + b.vy * n.y;
    if (vn >= 0) {
      b.x = nx;
      b.y = ny;
      continue;
    }
    const e = -vn < 40 ? 0 : bounce; // no micro-bounces while resting
    const tx = -n.y;
    const ty = n.x;
    const vt = (b.vx * tx + b.vy * ty) * friction;
    const vnNew = -vn * e;
    b.vx = n.x * vnNew + tx * vt;
    b.vy = n.y * vnNew + ty * vt;
    return { nx: n.x, ny: n.y, speed: -vn };
  }
  return null;
}

// Rocket-style projectile: explodes on the first solid pixel or when hitTest says so.
export function stepRocket(terrain, o, dt, wind, hitTest) {
  if (o.wind) o.vx += wind * WIND_ACC * dt;
  o.vy += GRAVITY * dt * (o.gmul ?? 1);
  const steps = Math.max(1, Math.ceil((Math.hypot(o.vx, o.vy) * dt) / 2));
  for (let i = 0; i < steps; i++) {
    o.x += (o.vx * dt) / steps;
    o.y += (o.vy * dt) / steps;
    if (terrain.solid(o.x, o.y)) return 'terrain';
    if (hitTest && hitTest(o.x, o.y, o)) return 'worm';
  }
  return null;
}

// One horizontal pixel step along the ground, climbing up to maxClimb pixels.
export function groundStep(terrain, b, dir, maxClimb = 2) {
  const nx = b.x + dir;
  for (let k = 0; k <= maxClimb; k++) {
    if (!terrain.hitCircle(nx, b.y - k, b.r)) {
      b.x = nx;
      b.y -= k;
      return true;
    }
  }
  return false;
}

// Follows ground downhill; returns true if the body ends up supported.
export function snapDown(terrain, b, maxDrop = 3) {
  for (let i = 0; i < maxDrop; i++) {
    if (terrain.hitCircle(b.x, b.y + 1, b.r)) return true;
    b.y += 1;
  }
  return terrain.hitCircle(b.x, b.y + 1, b.r);
}

// Pushes a body that ended up inside terrain (e.g. under a new girder) out of it.
export function unstick(terrain, b) {
  if (!terrain.hitCircle(b.x, b.y, b.r)) return true;
  for (let k = 1; k <= 60; k++) {
    for (const [dx, dy] of [[0, -k], [k, 0], [-k, 0], [k, -k], [-k, -k]]) {
      if (!terrain.hitCircle(b.x + dx, b.y + dy, b.r)) {
        b.x += dx;
        b.y += dy;
        return true;
      }
    }
  }
  return false;
}

export function launchVector(w, aim, power, speed, dir = w.dir) {
  const dx = dir * Math.cos(aim);
  const dy = -Math.sin(aim);
  const sp = speed * (0.08 + 0.92 * power);
  const off = w.r + 5;
  return { x: w.x + dx * off, y: w.y - 1 + dy * off, vx: dx * sp, vy: dy * sp };
}
