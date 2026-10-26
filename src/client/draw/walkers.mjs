// Client drawing for the walkers pack. See docs/EXTENDING.md.
import { registerDrawer, registerHeld, registerFx } from './registry.mjs';

const rand = (a, b) => a + Math.random() * (b - a);
const tone = (r, ...args) => {
  if (r.audio.ctx && !r.audio.muted) r.audio.tone(...args);
};
const noise = (r, ...args) => {
  if (r.audio.ctx && !r.audio.muted) r.audio.noise(...args);
};

function fuseLabel(ctx, o, dy = -13) {
  const s = String(Math.max(0, Math.ceil(o.fuse)));
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000';
  ctx.strokeText(s, 0, dy);
  ctx.fillStyle = '#fff';
  ctx.fillText(s, 0, dy);
}

// Leg swing from the distance walked, so the legs stop when the figure does.
const stride = (o, k = 0.45) => (o.state === 'ground' ? Math.sin(o.x * k) : 0);

function fluff(ctx, hop = 0) {
  ctx.fillStyle = '#fafafa';
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1;
  for (const [px, py, r] of [[-3, -2 - hop, 5], [1, -4 - hop, 5], [3, -1 - hop, 4.5], [-1, 0 - hop, 5]]) {
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function sheepHead(ctx, hop = 0) {
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.ellipse(6, -1 - hop, 2.6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(6, -3 - hop, 1.5, 1.5);
}

// ---------- sheep launcher sheep ----------
registerDrawer('wk_sheep', (ctx, o, r) => {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(o.dir, 1);
  if (o.state === 'air') ctx.rotate(Math.atan2(o.vy, Math.abs(o.vx) + 1) * 0.5);
  const s = stride(o, 0.6);
  const hop = o.state === 'ground' ? Math.abs(s) * 1.5 : 0;
  fluff(ctx, hop);
  sheepHead(ctx, hop);
  ctx.fillStyle = '#333';
  ctx.fillRect(-3 + s, 4 - hop, 1.5, 3 + hop);
  ctx.fillRect(2 - s, 4 - hop, 1.5, 3 + hop);
  ctx.restore();
  if (o.fuse < 1.2 && Math.floor(r.t * 10) % 2 === 0) {
    ctx.fillStyle = 'rgba(255,60,40,0.8)';
    ctx.beginPath();
    ctx.arc(o.x, o.y - 8, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
});

// ---------- super sheep ----------
registerDrawer('wk_supersheep', (ctx, o, r) => {
  if (Math.random() < 0.8) r.particles.push({ type: 'smoke', x: o.x - Math.cos(o.ang) * 6, y: o.y - Math.sin(o.ang) * 6, vx: rand(-6, 6), vy: rand(-6, 6), life: 0.5, max: 0.5, size: 2.5 });
  ctx.save();
  ctx.translate(o.x, o.y);
  const flip = o.dir;
  ctx.scale(flip, 1);
  ctx.rotate(flip > 0 ? o.ang : Math.PI - o.ang);
  // cape streaming behind
  const flap = Math.sin(r.t * 30) * 1.5;
  ctx.fillStyle = '#d62828';
  ctx.beginPath();
  ctx.moveTo(-2, -4);
  ctx.lineTo(-15, -6 + flap);
  ctx.lineTo(-13, 0);
  ctx.lineTo(-15, 5 - flap);
  ctx.lineTo(-2, 4);
  ctx.closePath();
  ctx.fill();
  fluff(ctx, 0);
  sheepHead(ctx, 0);
  // little legs stretched out, flying pose
  ctx.fillStyle = '#333';
  ctx.fillRect(-6, 3, 4, 1.5);
  ctx.fillRect(3, 3, 4, 1.5);
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(-3, -1);
  ctx.lineTo(0, -4);
  ctx.lineTo(3, -1);
  ctx.lineTo(0, 1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
});

// ---------- mad cow ----------
registerDrawer('wk_cow', (ctx, o, r) => {
  if (o.wait > 0) return;
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(o.dir, 1);
  if (o.state === 'air') ctx.rotate(Math.atan2(o.vy, Math.abs(o.vx) + 1) * 0.4);
  const s = stride(o, 0.5);
  const bob = o.state === 'ground' ? Math.abs(s) * 1.2 : 0;
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1.4;
  for (const [lx, ph] of [[-5, s], [-2, -s], [3, -s], [6, s]]) { // four legs
    ctx.beginPath();
    ctx.moveTo(lx, 1 - bob);
    ctx.lineTo(lx + ph * 2.5, 6);
    ctx.stroke();
  }
  ctx.fillStyle = '#f5f5f0';
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, -1 - bob, 8, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#222'; // patches
  ctx.beginPath();
  ctx.ellipse(-3, -2.5 - bob, 2.6, 1.8, 0.3, 0, Math.PI * 2);
  ctx.ellipse(3, 0 - bob, 2, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f5f5f0'; // head
  ctx.beginPath();
  ctx.ellipse(8.5, -3 - bob, 3.4, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f0a8a8'; // snout
  ctx.fillRect(10, -2.4 - bob, 2.4, 2.4);
  ctx.fillStyle = '#d62828'; // mad eye
  ctx.fillRect(8, -4.6 - bob, 1.6, 1.6);
  ctx.strokeStyle = '#e8d9a0'; // horn
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(7.5, -5.5 - bob);
  ctx.lineTo(6.5, -8 - bob);
  ctx.stroke();
  ctx.strokeStyle = '#222'; // tail
  ctx.beginPath();
  ctx.moveTo(-8, -2 - bob);
  ctx.lineTo(-11, -4 - bob + s);
  ctx.stroke();
  ctx.restore();
  if (o.state === 'ground' && Math.random() < 0.25) {
    r.particles.push({ type: 'smoke', x: o.x - o.dir * 8, y: o.y + 5, vx: -o.dir * rand(5, 20), vy: rand(-12, -2), life: 0.4, max: 0.4, size: 2 });
  }
});

// ---------- old woman ----------
registerDrawer('wk_oldwoman', (ctx, o) => {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(o.dir, 1);
  const s = stride(o, 0.8);
  ctx.strokeStyle = '#444'; // legs
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-1, 1);
  ctx.lineTo(-1 + s * 1.5, 5.5);
  ctx.moveTo(1, 1);
  ctx.lineTo(1 - s * 1.5, 5.5);
  ctx.stroke();
  ctx.strokeStyle = '#7a5230'; // walking stick
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(6, 5.5);
  ctx.lineTo(6.5, -1);
  ctx.quadraticCurveTo(6.5, -3, 8.5, -2.5);
  ctx.stroke();
  ctx.fillStyle = '#7b4a9c'; // dress, bent forward
  ctx.beginPath();
  ctx.moveTo(-4, 3);
  ctx.lineTo(-3, -4);
  ctx.quadraticCurveTo(0, -7, 4, -4);
  ctx.lineTo(4, 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd9b0'; // face
  ctx.beginPath();
  ctx.arc(4.5, -6, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e6e6e6'; // grey bun and glasses
  ctx.beginPath();
  ctx.arc(2.8, -8.2, 2.2, 0, Math.PI * 2);
  ctx.arc(0.8, -8, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(5, -7, 1.8, 1.4);
  ctx.fillStyle = '#c0392b'; // handbag
  ctx.fillRect(-7, -1, 3.5, 3);
  ctx.restore();
  ctx.save();
  ctx.translate(o.x, o.y);
  fuseLabel(ctx, o, -16);
  ctx.restore();
});

// ---------- salvation army pastor ----------
registerDrawer('wk_pastor', (ctx, o, r) => {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(o.dir, 1);
  const s = stride(o, 0.6);
  const air = o.state === 'air';
  ctx.strokeStyle = '#111'; // legs
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-1.5, 1);
  ctx.lineTo(-1.5 + (air ? -2 : s * 2), 6);
  ctx.moveTo(1.5, 1);
  ctx.lineTo(1.5 + (air ? 2 : -s * 2), 6);
  ctx.stroke();
  ctx.fillStyle = '#1b1b1f'; // robe
  ctx.beginPath();
  ctx.moveTo(-4, 2);
  ctx.lineTo(-3, -6);
  ctx.lineTo(3, -6);
  ctx.lineTo(4, 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff'; // collar
  ctx.fillRect(-1.5, -6.5, 3, 1.6);
  ctx.fillStyle = '#c9915b'; // beaver face
  ctx.beginPath();
  ctx.arc(0, -9, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff'; // buck teeth
  ctx.fillRect(1.2, -8, 1.4, 2.2);
  ctx.fillStyle = '#c00'; // wild eyes
  ctx.fillRect(0.4, -10.4, 1.6, 1.6);
  ctx.strokeStyle = '#3b2a1a'; // frenzied hair tufts
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const k of [-2, 0, 2]) {
    ctx.moveTo(k, -12);
    ctx.lineTo(k * 1.8, -15 + Math.sin(r.t * 20 + k) * 0.8);
  }
  ctx.stroke();
  // raised arm with tambourine
  const shake = Math.sin(r.t * 24) * 1.2;
  ctx.strokeStyle = '#1b1b1f';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(2, -4);
  ctx.lineTo(6, -9 + shake);
  ctx.stroke();
  ctx.fillStyle = '#e6b800';
  ctx.strokeStyle = '#7a5a00';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(7, -11 + shake, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
});

registerDrawer('wk_tamb', (ctx, o, r) => {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(r.t * 14 + o.id);
  ctx.fillStyle = '#e6b800';
  ctx.strokeStyle = '#7a5a00';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff6b0';
  for (let i = 0; i < 4; i++) ctx.fillRect(Math.cos(i * Math.PI / 2) * 3.4 - 0.7, Math.sin(i * Math.PI / 2) * 3.4 - 0.7, 1.4, 1.4);
  ctx.restore();
});

// ---------- skunk ----------
registerDrawer('wk_skunk', (ctx, o, r) => {
  // gas cloud: a few slowly drifting green puffs within the 60 px poison radius
  ctx.save();
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4 + r.t * 0.7;
    const d = 16 + ((i * 17) % 38) + Math.sin(r.t * 1.5 + i) * 5;
    const px = o.x + Math.cos(a) * d;
    const py = o.y - 6 + Math.sin(a * 1.3) * d * 0.55;
    const rr = 14 + (i % 3) * 5;
    const gr = ctx.createRadialGradient(px, py, 0, px, py, rr);
    gr.addColorStop(0, 'rgba(150,220,60,0.28)');
    gr.addColorStop(1, 'rgba(150,220,60,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(px, py, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.translate(o.x, o.y);
  ctx.scale(o.dir, 1);
  const s = stride(o, 0.7);
  const air = o.state === 'air';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.4;
  ctx.beginPath(); // legs
  ctx.moveTo(-3, 1);
  ctx.lineTo(-3 + (air ? -2 : s * 2), 4.5);
  ctx.moveTo(3, 1);
  ctx.lineTo(3 + (air ? 2 : -s * 2), 4.5);
  ctx.stroke();
  ctx.fillStyle = '#1a1a1c'; // bushy tail with white stripe
  ctx.beginPath();
  ctx.ellipse(-7, -5, 3, 6.5, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2f2f2';
  ctx.beginPath();
  ctx.ellipse(-7, -5, 1, 5.8, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a1c'; // body and head
  ctx.beginPath();
  ctx.ellipse(0, -1, 6, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(6, -2.5, 3, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(-4, -4.5, 9, 1.2);
  ctx.fillRect(5, -3.5, 3.4, 0.9);
  ctx.fillStyle = '#ff5a5a';
  ctx.fillRect(8.2, -2.6, 1.4, 1.2);
  ctx.restore();
});

// ---------- held sprites (origin = worm centre, +x = aim direction) ----------
registerHeld('sheeplauncher', (ctx) => {
  ctx.fillStyle = '#3d5a2a';
  ctx.fillRect(-2, -3, 18, 6);
  ctx.fillStyle = '#222';
  ctx.fillRect(15, -3.6, 2.5, 7.2);
  ctx.fillStyle = '#fafafa';
  ctx.beginPath();
  ctx.arc(8, -4.4, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#333';
  ctx.fillRect(10, -5.2, 2, 2);
});

registerHeld('supersheep', (ctx) => {
  ctx.fillStyle = '#d62828';
  ctx.beginPath();
  ctx.moveTo(3, -2);
  ctx.lineTo(-3, -4);
  ctx.lineTo(-2, 1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fafafa';
  ctx.beginPath();
  ctx.arc(6, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(5, -1.5, 3, 3);
});

registerHeld('madcow', (ctx) => {
  ctx.fillStyle = '#f5f5f0';
  ctx.beginPath();
  ctx.ellipse(7, 0, 5, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.ellipse(6, -1, 2, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d62828';
  ctx.fillRect(10, -2, 1.5, 1.5);
});

registerHeld('oldwoman', (ctx) => {
  ctx.fillStyle = '#7b4a9c';
  ctx.fillRect(2, -3, 6, 6);
  ctx.fillStyle = '#ffd9b0';
  ctx.beginPath();
  ctx.arc(10, -1, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e6e6e6';
  ctx.beginPath();
  ctx.arc(9, -3.6, 1.8, 0, Math.PI * 2);
  ctx.fill();
});

registerHeld('salvation', (ctx, w, r) => {
  const shake = Math.sin(r.t * 14);
  ctx.fillStyle = '#e6b800';
  ctx.strokeStyle = '#7a5a00';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(8, shake * 0.8, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff6b0';
  for (let i = 0; i < 4; i++) ctx.fillRect(8 + Math.cos(i * Math.PI / 2) * 3.6 - 0.7, shake * 0.8 + Math.sin(i * Math.PI / 2) * 3.6 - 0.7, 1.4, 1.4);
});

registerHeld('skunk', (ctx) => {
  ctx.fillStyle = '#1a1a1c';
  ctx.beginPath();
  ctx.ellipse(7, 0, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(3, -2.6, 8, 1.1);
  ctx.fillStyle = '#1a1a1c';
  ctx.beginPath();
  ctx.ellipse(2, -3, 2, 4, -0.5, 0, Math.PI * 2);
  ctx.fill();
});

// ---------- events -> effects ----------
registerFx('wkGas', (e, r) => {
  for (let i = 0; i < 5; i++) {
    r.particles.push({
      type: 'smoke', x: e.x + rand(-e.r * 0.6, e.r * 0.6), y: e.y + rand(-e.r * 0.4, 0), vx: rand(-10, 10), vy: rand(-18, -4),
      life: rand(0.8, 1.4), max: 1.4, size: rand(6, 12),
    });
  }
  noise(r, 0.25, 0.08, 1200, 500);
});

registerFx('wkMoo', (e, r) => {
  tone(r, 150, 0.35, 'sawtooth', 0.1, -50);
});

registerFx('wkWoman', (e, r) => {
  r.say('Aaaaaah!', '#ffd9b0', 1.2);
  tone(r, 600, 0.5, 'sawtooth', 0.1, 400);
});

registerFx('wkTamb', (e, r) => {
  tone(r, 1400, 0.08, 'triangle', 0.07, -200);
});
