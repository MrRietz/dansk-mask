// Client drawing for the strikes pack. See docs/EXTENDING.md.
import { registerDrawer, registerHeld, registerFx } from "./registry.mjs";

const rand = (a, b) => a + Math.random() * (b - a);

// ---------- planes ----------
const PLANE_COLORS = {
  napalm: ['#8a2b12', '#c0392b'],
  mail: ['#2f5f9e', '#e8eef7'],
  minestrike: ['#3d4f2f', '#5f7a45'],
  molesquadron: ['#6b4a2b', '#9a6b3a'],
  sheepstrike: ['#b8b8b8', '#f2f2f2'],
  carpet: ['#222a33', '#47525e'],
};

registerDrawer('strikeplane', (ctx, o) => {
  const [body, wing] = PLANE_COLORS[o.payload] || ['#4b5563', '#6b7280'];
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(o.dir, 1);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, 30, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = wing;
  ctx.beginPath();
  ctx.moveTo(-4, 0);
  ctx.lineTo(-15, -15);
  ctx.lineTo(-8, -15);
  ctx.lineTo(9, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-26, 0);
  ctx.lineTo(-33, -10);
  ctx.lineTo(-26, -10);
  ctx.lineTo(-19, 0);
  ctx.fill();
  ctx.fillStyle = '#9ad1ff';
  ctx.beginPath();
  ctx.ellipse(15, -2, 6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(32, 0, 3, 8, 0, 0, Math.PI * 2); // propeller blur
  ctx.stroke();
  ctx.restore();
});

// ---------- napalm / mail / carpet bombs ----------
registerDrawer('strikebomb', (ctx, o, r) => {
  ctx.save();
  ctx.translate(o.x, o.y);
  if (o.variant === 'napalm') {
    ctx.rotate(Math.atan2(o.vy, o.vx));
    ctx.fillStyle = '#b5301a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-1, -3.8, 2.4, 7.6);
    ctx.fillStyle = `rgba(255,${Math.floor(rand(120, 200))},30,0.9)`;
    ctx.beginPath();
    ctx.moveTo(-8, -2);
    ctx.lineTo(-8 - rand(5, 10), 0);
    ctx.lineTo(-8, 2);
    ctx.fill();
  } else if (o.variant === 'letter' || o.variant === 'parcel') {
    ctx.rotate(Math.sin(o.age * 9 + o.phase) * 0.7 + o.vx * 0.004);
    if (o.variant === 'letter') {
      ctx.fillStyle = '#f4f1e6';
      ctx.strokeStyle = '#8a8570';
      ctx.lineWidth = 1;
      ctx.fillRect(-6, -4, 12, 8);
      ctx.strokeRect(-6, -4, 12, 8);
      ctx.beginPath();
      ctx.moveTo(-6, -4);
      ctx.lineTo(0, 1);
      ctx.lineTo(6, -4);
      ctx.stroke();
      ctx.fillStyle = '#d62828';
      ctx.fillRect(3, -3, 2.5, 2.5);
    } else {
      ctx.fillStyle = '#b98a58';
      ctx.strokeStyle = '#5b4126';
      ctx.lineWidth = 1;
      ctx.fillRect(-5, -5, 10, 10);
      ctx.strokeRect(-5, -5, 10, 10);
      ctx.fillStyle = '#e9d9b5';
      ctx.fillRect(-5, -1, 10, 2);
      ctx.fillRect(-1, -5, 2, 10);
    }
  } else {
    ctx.rotate(Math.atan2(o.vy, o.vx || 0.01));
    ctx.fillStyle = '#1d232b';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6.5, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(-8, -2.5, 3, 5);
    if (o.fuse !== null && Math.floor(o.fuse * 12) % 2 === 0) {
      ctx.fillStyle = '#ff5a3d';
      ctx.beginPath();
      ctx.arc(2, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  if (o.variant === 'napalm' && Math.random() < 0.6) {
    r.particles.push({ type: 'fire', x: o.x - o.vx * 0.02, y: o.y - o.vy * 0.02, vx: rand(-15, 15), vy: rand(-15, 5), life: 0.3, max: 0.3, size: 3 });
  }
});

// ---------- Cattle Attack: burning sheep ----------
registerDrawer('strikesheep', (ctx, o, r) => {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(o.dir, 1);
  ctx.rotate(Math.sin(o.age * 12) * 0.12);
  ctx.fillStyle = '#e8e2d8';
  ctx.strokeStyle = '#7a6f60';
  ctx.lineWidth = 1;
  for (const [px, py, rr] of [[-3, -2, 5], [1, -4, 5], [3, -1, 4.5], [-1, 0, 5]]) {
    ctx.beginPath();
    ctx.arc(px, py, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.ellipse(6, -1, 2.6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-3, 4, 1.5, 3);
  ctx.fillRect(2, 4, 1.5, 3);
  // flames licking the fleece
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = `rgba(255,${Math.floor(rand(80, 200))},20,${rand(0.55, 0.9)})`;
    ctx.beginPath();
    ctx.arc(rand(-6, 5), rand(-8, -3), rand(2, 4), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (Math.random() < 0.3) r.particles.push({ type: 'smoke', x: o.x, y: o.y - 8, vx: rand(-8, 8), vy: -24, life: 0.7, max: 0.7, size: 3 });
});

// ---------- moles (Mole Squadron and Mole Bomb) ----------
registerDrawer('strikemole', (ctx, o, r) => {
  const digging = o.state === 'dig';
  ctx.save();
  ctx.translate(o.x, o.y);
  if (digging) ctx.rotate(o.ang ?? 0);
  else ctx.rotate(Math.atan2(o.vy, o.vx) * 0.2);
  ctx.fillStyle = '#6e4a2c';
  ctx.strokeStyle = '#2f1e10';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e9a0a0'; // pink nose
  ctx.beginPath();
  ctx.arc(7, 0, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.fillRect(3.5, -2.5, 1.5, 1.5);
  ctx.strokeStyle = '#d9c9a8'; // digging claws
  ctx.lineWidth = 1.2;
  const flap = digging ? Math.sin(o.age * 30) * 2 : 0;
  ctx.beginPath();
  ctx.moveTo(5, 3);
  ctx.lineTo(9, 4 + flap);
  ctx.moveTo(5, -3);
  ctx.lineTo(9, -4 - flap);
  ctx.stroke();
  ctx.restore();
  if (digging && Math.random() < 0.7) {
    r.particles.push({ type: 'debris', x: o.x, y: o.y, vx: rand(-60, 60), vy: rand(-140, -40), life: 0.5, max: 0.5 });
  }
  if (o.fuse !== null && o.variant === 'bomb') {
    const n = String(Math.max(0, Math.ceil(o.fuse)));
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.strokeText(n, o.x, o.y - 12);
    ctx.fillStyle = '#fff';
    ctx.fillText(n, o.x, o.y - 12);
  }
});

registerHeld('molebomb', (ctx) => {
  ctx.fillStyle = '#6e4a2c';
  ctx.strokeStyle = '#2f1e10';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(9, 0, 5.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e9a0a0';
  ctx.beginPath();
  ctx.arc(14.5, 0, 1.6, 0, Math.PI * 2);
  ctx.fill();
});

// ---------- Concrete Donkey ----------
registerDrawer('strikedonkey', (ctx, o, r) => {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(Math.max(-0.5, Math.min(0.5, (o.vx || 0) * 0.004)));
  ctx.fillStyle = '#9a9a96';
  ctx.strokeStyle = '#4a4a48';
  ctx.lineWidth = 1.5;
  ctx.fillRect(-12, -7, 20, 12); // body
  ctx.strokeRect(-12, -7, 20, 12);
  ctx.fillRect(4, -13, 8, 9); // head
  ctx.strokeRect(4, -13, 8, 9);
  ctx.fillRect(5, -19, 2.5, 7); // ears
  ctx.fillRect(9, -19, 2.5, 7);
  ctx.fillRect(-11, 5, 4, 8); // legs
  ctx.fillRect(-4, 5, 4, 8);
  ctx.fillRect(2, 5, 4, 8);
  ctx.fillRect(7, 5, 4, 8);
  ctx.fillStyle = '#d8d8d4';
  ctx.fillRect(8, -9, 3, 2.5); // muzzle
  ctx.fillStyle = '#222';
  ctx.fillRect(9, -11, 1.6, 1.6); // eye
  ctx.restore();
  if (Math.random() < 0.3) r.particles.push({ type: 'smoke', x: o.x - 12, y: o.y - 6, vx: rand(-10, 10), vy: -14, life: 0.5, max: 0.5, size: 3 });
});

// ---------- Armageddon ----------
registerDrawer('meteor', (ctx, o, r) => {
  const s = (o.size || 1) * 5;
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(Math.atan2(o.vy, o.vx));
  const gr = ctx.createLinearGradient(-s * 5, 0, 0, 0);
  gr.addColorStop(0, 'rgba(255,90,20,0)');
  gr.addColorStop(1, 'rgba(255,190,60,0.85)');
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.9);
  ctx.lineTo(-s * 5, 0);
  ctx.lineTo(0, s * 0.9);
  ctx.fill();
  ctx.fillStyle = '#5a3a2a';
  ctx.strokeStyle = '#ff9a3a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, s, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  if (Math.random() < 0.6) r.particles.push({ type: 'fire', x: o.x - o.vx * 0.03, y: o.y - o.vy * 0.03, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.4, max: 0.4, size: s * 0.8 });
  if (Math.random() < 0.4) r.particles.push({ type: 'smoke', x: o.x - o.vx * 0.05, y: o.y - o.vy * 0.05, vx: 0, vy: -10, life: 0.8, max: 0.8, size: 4 });
});

// Faint red sky while the meteors fall (drawn in world coordinates, so cover generously).
registerDrawer('armageddon', (ctx, o) => {
  ctx.save();
  ctx.globalAlpha = 0.1 + 0.05 * Math.sin(o.t * 6);
  ctx.fillStyle = '#ff3b1a';
  ctx.fillRect(-4000, -4000, 11000, 9000);
  ctx.restore();
});

// ---------- Nuclear Test: the white-out is drawn by the water object, fading over its first 1.5 s ----------
registerDrawer('nukewater', (ctx, o) => {
  const a = 1 - o.t / 1.5;
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, a * 1.4);
  ctx.fillStyle = '#fff';
  ctx.fillRect(-4000, -4000, 11000, 9000);
  ctx.restore();
});

// ---------- events ----------
registerFx('strike', (e, r) => {
  r.say(`${e.name} inbound!`, '#ff8b3d', 1.8);
  r.audio.play('fire');
  if (Number.isFinite(e.x)) r.focusStrike(e.x);
});

registerFx('flash', (e, r) => {
  r.say('Nuclear Test!', '#fff', 3);
  r.shake = Math.max(r.shake, 14);
  r.audio.play('explosion', 1.5);
});

registerFx('armageddon', (e, r) => {
  r.say('Armageddon!', '#ff4d4d', 4);
  r.shake = Math.max(r.shake, 8);
  r.audio.play('hhg');
});
