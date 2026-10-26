// Client drawing for the projectiles pack. See docs/EXTENDING.md.
import { registerDrawer, registerHeld, registerFx } from './registry.mjs';

const rand = (a, b) => a + Math.random() * (b - a);

function fuseLabel(ctx, o, dy = -11) {
  const s = String(Math.max(0, Math.ceil(o.fuse)));
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000';
  ctx.strokeText(s, 0, dy);
  ctx.fillStyle = '#fff';
  ctx.fillText(s, 0, dy);
}

function banana(ctx, scale, fill) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = '#6b5a10';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 6 * scale, Math.PI * 0.15, Math.PI * 0.85);
  ctx.arc(0, -1.5 * scale, 6 * scale, Math.PI * 0.85, Math.PI * 0.15, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function vase(ctx, scale = 1) {
  ctx.fillStyle = '#e8f0f8';
  ctx.strokeStyle = '#2d5d9c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-2 * scale, -7 * scale);
  ctx.lineTo(2 * scale, -7 * scale);
  ctx.lineTo(2.5 * scale, -4 * scale);
  ctx.quadraticCurveTo(6 * scale, 0, 3 * scale, 5 * scale);
  ctx.lineTo(-3 * scale, 5 * scale);
  ctx.quadraticCurveTo(-6 * scale, 0, -2.5 * scale, -4 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#3f7bd1';
  ctx.beginPath();
  ctx.moveTo(-4 * scale, 0);
  ctx.lineTo(4 * scale, 0);
  ctx.stroke();
}

// ---------- missiles ----------
const MISSILE_STYLE = {
  homing: { body: '#8d949e', nose: '#2f6fd6', flame: '255,170,40' },
  magicbullet: { body: '#b36bff', nose: '#ffe27a', flame: '200,120,255' },
};

function drawMissile(ctx, o, r) {
  const ang = Math.atan2(o.vy, o.vx);
  const steering = o.target && o.age >= o.lock;
  if (o.variant === 'pigeon') {
    ctx.save();
    ctx.translate(o.x, o.y);
    const flip = Math.cos(ang) < 0 ? -1 : 1;
    ctx.scale(flip, 1);
    ctx.rotate(flip > 0 ? ang : Math.PI - ang);
    const flap = Math.sin(r.t * 28) * 5;
    ctx.fillStyle = '#c9ced6';
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath(); // wings
    ctx.moveTo(-1, -1);
    ctx.lineTo(-4, -8 - flap);
    ctx.lineTo(3, -2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-1, 1);
    ctx.lineTo(-4, 8 + flap);
    ctx.lineTo(3, 2);
    ctx.fill();
    ctx.fillStyle = '#e9a23b'; // beak
    ctx.beginPath();
    ctx.moveTo(7, -1);
    ctx.lineTo(11, 0.5);
    ctx.lineTo(7, 1.5);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillRect(4, -1.8, 1.3, 1.3);
    ctx.restore();
    if (Math.random() < 0.3) r.particles.push({ type: 'spark', x: o.x, y: o.y, vx: rand(-15, 15), vy: rand(-15, 15), life: 0.35, max: 0.35, color: 'rgba(230,230,240,0.8)' });
    return;
  }
  const st = MISSILE_STYLE[o.variant] || MISSILE_STYLE.homing;
  if (Math.random() < 0.8) r.particles.push({ type: 'smoke', x: o.x, y: o.y, vx: rand(-8, 8), vy: rand(-8, 8), life: 0.7, max: 0.7, size: o.variant === 'magicbullet' ? 2 : 3.5 });
  if (steering && Math.random() < 0.5) r.particles.push({ type: 'spark', x: o.x, y: o.y, vx: rand(-25, 25), vy: rand(-25, 25), life: 0.3, max: 0.3, color: `rgba(${st.flame},0.9)` });
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(ang);
  if (o.variant === 'magicbullet') {
    ctx.fillStyle = st.body;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = st.nose;
    ctx.beginPath();
    ctx.moveTo(6, -2);
    ctx.lineTo(10, 0);
    ctx.lineTo(6, 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${st.flame},0.8)`;
    ctx.beginPath();
    ctx.moveTo(-6, -1.5);
    ctx.lineTo(-6 - rand(8, 14), 0);
    ctx.lineTo(-6, 1.5);
    ctx.fill();
  } else {
    ctx.fillStyle = st.body;
    ctx.fillRect(-8, -2.5, 14, 5);
    ctx.fillStyle = st.nose;
    ctx.beginPath();
    ctx.moveTo(6, -2.5);
    ctx.lineTo(11, 0);
    ctx.lineTo(6, 2.5);
    ctx.fill();
    ctx.fillStyle = '#444'; // fins
    ctx.fillRect(-8, -4.5, 3, 2);
    ctx.fillRect(-8, 2.5, 3, 2);
    ctx.fillStyle = `rgba(${st.flame},0.9)`;
    ctx.beginPath();
    ctx.moveTo(-8, -2);
    ctx.lineTo(-8 - rand(5, 9), 0);
    ctx.lineTo(-8, 2);
    ctx.fill();
  }
  ctx.restore();
}
registerDrawer('pj_missile', drawMissile);

// ---------- contact shells ----------
registerDrawer('pj_shell', (ctx, o, r) => {
  const ang = Math.atan2(o.vy, o.vx);
  if (o.variant === 'shard') {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(r.t * 14 + o.id);
    ctx.fillStyle = '#e8f0f8';
    ctx.strokeStyle = '#2d5d9c';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-3, -2);
    ctx.lineTo(3, -1);
    ctx.lineTo(0, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (Math.random() < 0.5) r.particles.push({ type: 'smoke', x: o.x, y: o.y, vx: rand(-6, 6), vy: rand(-6, 6), life: 0.5, max: 0.5, size: o.variant === 'mortarbit' ? 1.8 : 2.5 });
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(ang);
  if (o.variant === 'petrol') {
    ctx.fillStyle = 'rgba(120,200,120,0.85)';
    ctx.strokeStyle = '#1d4d1d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e9d6a0'; // rag
    ctx.fillRect(4, -1, 3, 2);
    ctx.fillStyle = `rgba(255,${Math.floor(rand(120, 200))},30,0.9)`;
    ctx.beginPath();
    ctx.arc(8.5, 0, rand(1.5, 2.6), 0, Math.PI * 2);
    ctx.fill();
  } else if (o.variant === 'mortarbit') {
    ctx.fillStyle = '#5a6b3a';
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#4c5a34'; // mortar shell
    ctx.strokeStyle = '#1b2210';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-5, -2.4);
    ctx.lineTo(3, -2.4);
    ctx.lineTo(7, 0);
    ctx.lineTo(3, 2.4);
    ctx.lineTo(-5, 2.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
});

// ---------- fused bombs ----------
registerDrawer('pj_bomb', (ctx, o, r) => {
  ctx.save();
  ctx.translate(o.x, o.y);
  const spin = Math.atan2(o.vy, o.vx) + r.t * 6 * Math.sign(o.vx || 1);
  switch (o.variant) {
    case 'banana':
    case 'superbanana':
      ctx.rotate(spin);
      banana(ctx, o.variant === 'superbanana' ? 1.25 : 1, o.variant === 'superbanana' ? '#ffb82e' : '#ffe14a');
      ctx.rotate(-spin);
      fuseLabel(ctx, o, -12);
      break;
    case 'minibanana':
      ctx.rotate(spin);
      banana(ctx, 0.55, '#ffe14a');
      break;
    case 'mbbomb': {
      ctx.fillStyle = '#2b2f3a';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e04040';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MB', 0, 3);
      ctx.fillStyle = '#ffd23f'; // fuse
      ctx.fillRect(-1, -11, 2, 4);
      if (Math.random() < 0.5) r.particles.push({ type: 'spark', x: o.x, y: o.y - 11, vx: rand(-30, 30), vy: rand(-60, -10), life: 0.3, max: 0.3 });
      fuseLabel(ctx, o, -15);
      break;
    }
    case 'vase':
      ctx.rotate(0.2);
      vase(ctx);
      ctx.rotate(-0.2);
      fuseLabel(ctx, o, -11);
      break;
    default:
      ctx.fillStyle = '#444';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
  }
  ctx.restore();
});

// ---------- held weapons ----------
registerHeld('homing', (ctx) => {
  ctx.fillStyle = '#3d5a2a';
  ctx.fillRect(-2, -2.5, 17, 5);
  ctx.fillStyle = '#2f6fd6';
  ctx.fillRect(14, -3, 3, 6);
  ctx.fillStyle = '#d62828'; // targeting dish
  ctx.fillRect(3, -5, 4, 2.5);
});

registerHeld('mortar', (ctx) => {
  ctx.fillStyle = '#4c5a34';
  ctx.fillRect(0, -3, 13, 6);
  ctx.fillStyle = '#222';
  ctx.fillRect(12, -3.5, 3, 7);
  ctx.fillRect(-1, 3, 5, 2);
});

registerHeld('pigeon', (ctx) => {
  ctx.fillStyle = '#c9ced6';
  ctx.beginPath();
  ctx.ellipse(6, 0, 5, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e9a23b';
  ctx.beginPath();
  ctx.moveTo(10.5, -0.8);
  ctx.lineTo(13.5, 0.2);
  ctx.lineTo(10.5, 1);
  ctx.fill();
});

registerHeld('banana', (ctx) => {
  ctx.translate(6, 0);
  banana(ctx, 0.9, '#ffe14a');
});

registerHeld('superbanana', (ctx) => {
  ctx.translate(6, 0);
  banana(ctx, 1.15, '#ffb82e');
});

registerHeld('mbbomb', (ctx) => {
  ctx.fillStyle = '#2b2f3a';
  ctx.beginPath();
  ctx.arc(7, 0, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e04040';
  ctx.fillRect(5, -1, 4, 2);
});

registerHeld('petrol', (ctx) => {
  ctx.fillStyle = 'rgba(120,200,120,0.9)';
  ctx.fillRect(2, -3, 8, 6);
  ctx.fillRect(9, -1.5, 4, 3);
  ctx.fillStyle = '#e9d6a0';
  ctx.fillRect(13, -1, 3, 2);
});

registerHeld('vase', (ctx) => {
  ctx.translate(6, 0);
  ctx.rotate(Math.PI / 2);
  vase(ctx, 0.8);
});

registerHeld('magicbullet', (ctx) => {
  ctx.fillStyle = '#b36bff';
  ctx.fillRect(0, -2, 14, 4);
  ctx.fillStyle = '#ffe27a';
  ctx.fillRect(13, -2.5, 3, 5);
  ctx.fillStyle = '#fff';
  ctx.fillRect(3, -1, 2, 2);
});

// ---------- events ----------
// 'pj_burst' (core): a bomb split into bits / spilled fire at (x, y).
registerFx('pj_burst', (e, r) => {
  const n = e.variant === 'petrol' ? 14 : 10;
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(40, 180);
    if (e.variant === 'vase') {
      r.particles.push({ type: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.6, max: 0.6, color: '#bcd7f5' });
    } else if (e.variant === 'petrol') {
      r.particles.push({ type: 'fire', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: rand(0.4, 0.9), max: 0.9, size: rand(3, 6) });
    } else {
      r.particles.push({ type: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.4, max: 0.4 });
    }
  }
  r.audio.play(e.variant === 'vase' ? 'thud' : 'bounce');
});
