import { registerDrawer } from './registry.mjs';

registerDrawer('flame', (ctx, o, r) => {
  const a = Math.min(1, o.life / 1.2);
  const s = o.r * (0.8 + Math.random() * 0.5);
  ctx.fillStyle = `rgba(255,${Math.floor(90 + Math.random() * 110)},20,${0.35 + a * 0.6})`;
  ctx.beginPath();
  ctx.arc(o.x, o.y - s * 0.4, s * 1.2, 0, Math.PI * 2);
  ctx.fill();
  if (Math.random() < 0.15) {
    r.particles.push({ type: 'smoke', x: o.x, y: o.y - 4, vx: 0, vy: -30, life: 0.6, max: 0.6, size: 3 });
  }
});
