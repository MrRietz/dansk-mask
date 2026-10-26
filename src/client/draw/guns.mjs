// Client drawing for the guns pack. See docs/EXTENDING.md.
import { registerDrawer, registerHeld, registerFx } from './registry.mjs';

const rand = (a, b) => a + Math.random() * (b - a);
const tone = (r, ...args) => {
  if (r.audio.ctx && !r.audio.muted) r.audio.tone(...args);
};
const noise = (r, ...args) => {
  if (r.audio.ctx && !r.audio.muted) r.audio.noise(...args);
};

// ---------- objects ----------

registerDrawer('arrow', (ctx, o) => {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(Math.atan2(o.vy, o.vx));
  ctx.strokeStyle = '#8a6a3b';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-9, 0);
  ctx.lineTo(2, 0);
  ctx.stroke();
  ctx.fillStyle = '#c9ced6';
  ctx.beginPath();
  ctx.moveTo(2, -2);
  ctx.lineTo(6, 0);
  ctx.lineTo(2, 2);
  ctx.fill();
  ctx.strokeStyle = '#e8e8e8';
  ctx.beginPath();
  ctx.moveTo(-9, 0);
  ctx.lineTo(-11, -2);
  ctx.moveTo(-9, 0);
  ctx.lineTo(-11, 2);
  ctx.moveTo(-7, 0);
  ctx.lineTo(-9, -2);
  ctx.moveTo(-7, 0);
  ctx.lineTo(-9, 2);
  ctx.stroke();
  ctx.restore();
});

registerDrawer('dragonball', (ctx, o, r) => {
  const s = o.r * (0.9 + Math.random() * 0.3);
  const gr = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, s * 1.6);
  gr.addColorStop(0, 'rgba(255,255,200,1)');
  gr.addColorStop(0.45, 'rgba(255,160,30,0.95)');
  gr.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(o.x, o.y, s * 1.6, 0, Math.PI * 2);
  ctx.fill();
  r.particles.push({ type: 'fire', x: o.x, y: o.y, vx: rand(-30, 30), vy: rand(-40, 10), life: 0.3, max: 0.3, size: rand(2, 5) });
});

registerDrawer('flamejet', (ctx, o, r) => {
  const a = Math.max(0, o.life / 0.4);
  const s = o.r * (1.1 + (1 - a) * 1.2);
  ctx.fillStyle = `rgba(255,${Math.floor(90 + a * 130)},20,${0.35 + a * 0.5})`;
  ctx.beginPath();
  ctx.arc(o.x, o.y, s, 0, Math.PI * 2);
  ctx.fill();
  if (Math.random() < 0.2) r.particles.push({ type: 'smoke', x: o.x, y: o.y, vx: 0, vy: -25, life: 0.5, max: 0.5, size: 3 });
});

// ---------- held sprites (+x = aim direction) ----------

registerHeld('handgun', (ctx) => {
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(2, -1.8, 8, 3);
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(2, 0.5, 3, 4.5);
});

registerHeld('minigun', (ctx, w, r) => {
  ctx.fillStyle = '#3a3f46';
  ctx.fillRect(0, -2.5, 6, 5);
  const spin = Math.floor(r.t * 30) % 2;
  ctx.fillStyle = '#222';
  ctx.fillRect(6, -2 + spin, 11, 1.2);
  ctx.fillRect(6, 0.8 - spin, 11, 1.2);
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(1, 2, 3, 4);
});

registerHeld('longbow', (ctx) => {
  ctx.strokeStyle = '#8a5a2b';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(4, 0, 9, -Math.PI * 0.42, Math.PI * 0.42);
  ctx.stroke();
  ctx.strokeStyle = '#e8e4d0';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(4 + 9 * Math.cos(-Math.PI * 0.42), 9 * Math.sin(-Math.PI * 0.42));
  ctx.lineTo(1, 0);
  ctx.lineTo(4 + 9 * Math.cos(Math.PI * 0.42), 9 * Math.sin(Math.PI * 0.42));
  ctx.stroke();
});

registerHeld('dragonball', (ctx, w, r) => {
  const s = 3.2 + Math.sin(r.t * 18) * 0.5;
  const gr = ctx.createRadialGradient(8, 0, 0, 8, 0, s * 1.6);
  gr.addColorStop(0, '#fff6b0');
  gr.addColorStop(0.5, '#ff9a22');
  gr.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(8, 0, s * 1.6, 0, Math.PI * 2);
  ctx.fill();
});

registerHeld('kamikaze', (ctx) => {
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(-1, -3.5, 8, 1.6);
  ctx.fillStyle = '#d62828';
  ctx.beginPath();
  ctx.arc(3, -5, 1.8, 0, Math.PI * 2);
  ctx.fill();
});

registerHeld('suicide', (ctx) => {
  ctx.fillStyle = '#c0392b';
  for (let i = 0; i < 3; i++) ctx.fillRect(1 + i * 3, -4, 2, 8);
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(0, -1, 10, 1.2);
});

registerHeld('prod', (ctx) => {
  ctx.strokeStyle = '#a07a45';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(14, 0);
  ctx.stroke();
  ctx.fillStyle = '#ffc6bd';
  ctx.beginPath();
  ctx.arc(14.5, 0, 1.6, 0, Math.PI * 2);
  ctx.fill();
});

registerHeld('axe', (ctx) => {
  ctx.strokeStyle = '#7a5230';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(12, -2);
  ctx.stroke();
  ctx.fillStyle = '#b9c0c9';
  ctx.beginPath();
  ctx.moveTo(10, -3);
  ctx.lineTo(15, -7);
  ctx.lineTo(15, 2);
  ctx.lineTo(11, 0);
  ctx.closePath();
  ctx.fill();
});

registerHeld('bat', (ctx) => {
  ctx.fillStyle = '#c99a5b';
  ctx.beginPath();
  ctx.moveTo(0, -1);
  ctx.lineTo(10, -1.2);
  ctx.lineTo(17, -2.4);
  ctx.lineTo(17, 2.4);
  ctx.lineTo(10, 1.2);
  ctx.lineTo(0, 1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#7a5230';
  ctx.lineWidth = 0.6;
  ctx.stroke();
});

registerHeld('flamethrower', (ctx, w, r) => {
  ctx.fillStyle = '#7a2e1c';
  ctx.fillRect(-2, -2.5, 6, 5);
  ctx.fillStyle = '#444';
  ctx.fillRect(4, -1.5, 11, 3);
  const g = r.game;
  if (g.turn?.flame) {
    ctx.fillStyle = `rgba(255,${Math.floor(rand(120, 210))},30,0.9)`;
    ctx.beginPath();
    ctx.moveTo(15, -2);
    ctx.lineTo(15 + rand(6, 11), 0);
    ctx.lineTo(15, 2);
    ctx.fill();
  }
});

// ---------- effects ----------

registerFx('gunsArrow', (e, r) => {
  tone(r, 700, 0.12, 'triangle', 0.1, -450);
  noise(r, 0.08, 0.12, 4000, 900);
});

registerFx('gunsArrowHit', (e, r) => {
  for (let i = 0; i < 5; i++) {
    r.particles.push({ type: 'spark', x: e.x, y: e.y, vx: rand(-60, 60), vy: rand(-100, -10), life: 0.3, max: 0.3 });
  }
  tone(r, 220, 0.07, 'square', 0.1, -120);
});

registerFx('gunsDragon', (e, r) => {
  noise(r, 0.25, 0.3, 3500, 300);
  tone(r, 150, 0.3, 'sawtooth', 0.12, 250);
});

registerFx('gunsDragonHit', (e, r) => {
  r.explosionFx({ x: e.x, y: e.y, r: 14 }, true);
  r.shake = Math.max(r.shake, 2);
  tone(r, 300, 0.2, 'sawtooth', 0.12, -200);
});

registerFx('gunsDragonEnd', (e, r) => {
  for (let i = 0; i < 6; i++) {
    r.particles.push({ type: 'fire', x: e.x, y: e.y, vx: rand(-50, 50), vy: rand(-60, 0), life: 0.4, max: 0.4, size: rand(2, 5) });
  }
});

registerFx('gunsKamikaze', (e, r) => {
  r.say('Banzai!', '#ff6b3d', 1.4);
  tone(r, 500, 0.5, 'sawtooth', 0.12, 700);
});

registerFx('gunsKamikazeTrail', (e, r) => {
  r.particles.push({ type: 'fire', x: e.x, y: e.y, vx: rand(-25, 25), vy: rand(-25, 25), life: 0.35, max: 0.35, size: rand(2, 5) });
  if (Math.random() < 0.4) r.particles.push({ type: 'smoke', x: e.x, y: e.y, vx: rand(-10, 10), vy: -15, life: 0.8, max: 0.8, size: 4 });
});

registerFx('gunsPoison', (e, r) => {
  for (let i = 0; i < Math.min(60, e.r * 0.4); i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(30, e.r * 1.2);
    r.particles.push({ type: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: rand(0.8, 1.6), max: 1.6, color: 'rgba(120,220,70,0.8)' });
  }
  r.say('Poison!', '#7fe04a', 1.6);
});

registerFx('gunsMelee', (e, r) => {
  const bat = e.weapon === 'bat';
  const prod = e.weapon === 'prod';
  for (let i = 0; i < (prod ? 3 : 8); i++) {
    r.particles.push({ type: 'spark', x: e.x, y: e.y, vx: e.dir * rand(0, 140), vy: rand(-120, 10), life: 0.3, max: 0.3, color: bat ? '#ffe9b0' : undefined });
  }
  if (prod) tone(r, 250, 0.08, 'triangle', 0.1, -100);
  else if (bat) tone(r, 900, 0.1, 'square', 0.15, -500);
  else noise(r, 0.12, 0.3, 3000, 400);
});

registerFx('gunsFlameStart', (e, r) => {
  noise(r, 0.6, 0.25, 2500, 500);
});

registerFx('gunsFlameEnd', () => {});
