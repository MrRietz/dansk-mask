// Client drawing for the tools pack. See docs/EXTENDING.md.
import { registerDrawer, registerHeld, registerFx } from './registry.mjs';

const rand = (a, b) => a + Math.random() * (b - a);

// ---------- held sprites (origin = worm centre, +x = aim direction) ----------
function flame(ctx, r, len = 6) {
  const f = len * (0.7 + 0.3 * Math.sin(r.t * 60));
  ctx.fillStyle = '#ff9b2e';
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(f, 0);
  ctx.lineTo(0, 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffe27a';
  ctx.beginPath();
  ctx.moveTo(0, -1);
  ctx.lineTo(f * 0.55, 0);
  ctx.lineTo(0, 1);
  ctx.closePath();
  ctx.fill();
}

registerHeld('blowtorch', (ctx, w, r) => {
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(0, -1.5, 9, 3);
  ctx.fillStyle = '#b8402a';
  ctx.fillRect(-3, -2.5, 4, 5);
  if (r.game.turn?.burst) {
    ctx.translate(9, 0);
    flame(ctx, r, 8);
  }
});

registerHeld('drill', (ctx, w, r) => {
  ctx.fillStyle = '#e0a52a';
  ctx.fillRect(-2, -2.5, 8, 5);
  ctx.fillStyle = '#777';
  ctx.beginPath();
  ctx.moveTo(6, -2.5);
  ctx.lineTo(15, 0);
  ctx.lineTo(6, 2.5);
  ctx.closePath();
  ctx.fill();
  if (r.game.turn?.burst) {
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.8;
    const k = Math.floor(r.t * 30) % 3;
    for (let i = 0; i < 3; i++) {
      const x = 7 + ((i + k) % 3) * 2.5;
      ctx.beginPath();
      ctx.moveTo(x, -2 + i);
      ctx.lineTo(x + 1.5, 2 - i * 0.3);
      ctx.stroke();
    }
  }
});

registerHeld('girderpack', (ctx) => {
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(1, -2, 13, 4);
  ctx.strokeStyle = '#6b5a10';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(1, -2, 13, 4);
  ctx.beginPath();
  ctx.moveTo(1, -2);
  ctx.lineTo(5, 2);
  ctx.lineTo(9, -2);
  ctx.lineTo(13, 2);
  ctx.stroke();
});

registerHeld('bungee', (ctx) => {
  ctx.fillStyle = '#d9c79a';
  ctx.beginPath();
  ctx.arc(4, 0, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8a5a2a';
  ctx.fillRect(5, -1.5, 8, 3);
});

registerHeld('parachute', (ctx) => {
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(-9, -7, 7, 8);
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(-9, -7, 7, 8);
});

registerHeld('jetpack', (ctx) => {
  ctx.fillStyle = '#7a7f88';
  ctx.fillRect(-9, -7, 6, 10);
  ctx.fillStyle = '#c0c5cf';
  ctx.fillRect(-8, -6, 2, 8);
});

registerHeld('scales', (ctx) => {
  ctx.strokeStyle = '#e6c15a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(6, -5);
  ctx.lineTo(6, 3);
  ctx.moveTo(1, -3);
  ctx.lineTo(11, -3);
  ctx.moveTo(1, -3);
  ctx.lineTo(1, 0);
  ctx.moveTo(11, -3);
  ctx.lineTo(11, 0);
  ctx.stroke();
  ctx.fillStyle = '#e6c15a';
  ctx.fillRect(-1, 0, 4, 1.5);
  ctx.fillRect(9, 0, 4, 1.5);
});

registerHeld('selectworm', (ctx) => {
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(3, -5);
  ctx.lineTo(9, -5);
  ctx.lineTo(6, -1);
  ctx.closePath();
  ctx.fill();
});

registerHeld('freeze', (ctx) => {
  ctx.strokeStyle = '#9fe3ff';
  ctx.lineWidth = 1;
  for (let a = 0; a < 3; a++) {
    const ang = (a * Math.PI) / 3;
    ctx.beginPath();
    ctx.moveTo(6 + Math.cos(ang) * 5, Math.sin(ang) * 5);
    ctx.lineTo(6 - Math.cos(ang) * 5, -Math.sin(ang) * 5);
    ctx.stroke();
  }
});

registerHeld('earthquake', (ctx) => {
  ctx.strokeStyle = '#8a6a3a';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(1, 2);
  ctx.lineTo(5, -2);
  ctx.lineTo(7, 1);
  ctx.lineTo(11, -3);
  ctx.stroke();
});

// ---------- linked tool objects (canopy, jet pack) ----------
registerDrawer('tool_fx', (ctx, o, r) => {
  const w = r.game.worms[o.worm];
  if (!w) return;
  ctx.save();
  ctx.translate(w.x, w.y);
  if (o.tool === 'parachute') {
    const sway = Math.sin(r.t * 3) * 1.5;
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.8;
    for (const dx of [-12, -4, 4, 12]) {
      ctx.beginPath();
      ctx.moveTo(dx + sway, -23);
      ctx.lineTo(0, -5);
      ctx.stroke();
    }
    ctx.fillStyle = '#ff5a4d';
    ctx.beginPath();
    ctx.ellipse(sway, -23, 14, 10, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sway - 5, -32);
    ctx.lineTo(sway - 4, -23);
    ctx.moveTo(sway + 5, -32);
    ctx.lineTo(sway + 4, -23);
    ctx.stroke();
  } else if (o.tool === 'jetpack') {
    ctx.scale(-w.dir, 1); // the pack sits on the worm's back
    ctx.fillStyle = '#7a7f88';
    ctx.fillRect(1, -7, 5, 10);
    ctx.fillStyle = '#c0c5cf';
    ctx.fillRect(2, -6, 1.5, 8);
    if (w.custom?.thrust) {
      ctx.translate(3.5, 3);
      ctx.rotate(Math.PI / 2);
      flame(ctx, r, 12);
      r.particles.push({ type: 'smoke', x: w.x, y: w.y + 6, vx: rand(-15, 15), vy: rand(20, 50), life: 0.5, max: 0.5, size: 2.5 });
    }
  }
  ctx.restore();
});

// The quake object itself is invisible; its events shake the camera.
registerDrawer('quake', () => {});

// ---------- events ----------
registerFx('quake', (e, r) => {
  r.shake = Math.max(r.shake, 4);
  if (e.k % 20 === 1) r.audio.play('thud');
});

registerFx('scales', (e, r) => {
  r.say(`Scales of Justice: everyone has ${e.hp} HP`, '#e6c15a');
  r.audio.play('pickup');
});

registerFx('freeze', (e, r) => {
  const team = r.game.teams[e.team];
  r.say(`${team.name} is frozen`, '#9fe3ff', 2);
  r.audio.play('teleport');
});

registerFx('torch', (e, r) => {
  r.particles.push({ type: 'smoke', x: e.x, y: e.y, vx: rand(-20, 20), vy: rand(-40, -10), life: 0.5, max: 0.5, size: 3 });
});

registerFx('drill', (e, r) => {
  r.particles.push({ type: 'smoke', x: e.x, y: e.y, vx: rand(-30, 30), vy: rand(-60, -20), life: 0.6, max: 0.6, size: 3 });
  r.audio.play('tick');
});

registerFx('chute', (e, r) => r.audio.play('bounce'));
registerFx('jetpack', (e, r) => {
  r.audio.play('fire');
  r.say('Jet Pack: hold ↑ / ← / → to fly', '#ffffff', 2.5);
});
