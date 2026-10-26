// Canvas 2D renderer: world, effects and HUD. Reads game state, never mutates it.
import { buildTerrainCanvas, carve, drawGirder } from './terrainview.mjs';
import { WEAPONS } from '../core/weapons.mjs';
import { CHARGE_TIME } from '../core/constants.mjs';
import { DRAWERS, HELD, FX } from './draw/registry.mjs';
import './draw/packs.mjs';
import { themeById } from './themes.mjs';

const AMBIENT_MAX = 110;
const SPRINKLES = ['#ff5fa2', '#ffd23f', '#5fe3c0', '#6fa8ff', '#ffffff', '#b78cff'];

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Renderer {
  constructor(canvas, audio) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = audio;
    this.game = null;
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.particles = [];
    this.msg = null;
    this.shake = 0;
    this.focus = null; // { x, y, until }
    this.manualUntil = 0;
    this.shown = new Map(); // worm id -> displayed hp
    this.clouds = Array.from({ length: 12 }, () => ({ x: rand(0, 3000), y: rand(20, 260), s: rand(0.6, 1.6), v: rand(4, 12) }));
    this.t = 0;
    this.theme = themeById('meadow');
    this.stars = [];
    this.ambient = []; // theme ambient particles (snow, embers, ...), kept apart from this.particles
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.canvas.width = Math.floor(this.vw * this.dpr);
    this.canvas.height = Math.floor(this.vh * this.dpr);
    this.sky = null;
    if (this.game) this.cam.zoom = clamp(this.cam.zoom, this.minZoom(), 2);
  }

  minZoom() {
    const g = this.game;
    return g ? Math.max(this.vw / (g.terrain.w + 300), this.vh / (g.terrain.h + 200)) : 0.3;
  }

  setGame(game, theme) {
    this.game = game;
    this.theme = theme || themeById('meadow');
    this.sky = null; // gradient is cached per theme
    this.stars = this.theme.sky.stars ? Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), s: rand(0.6, 1.8), ph: rand(0, 6.3), sp: rand(1.5, 4) })) : [];
    this.ambient = [];
    this.ambientSeeded = false;
    this.terrainCanvas = buildTerrainCanvas(game.terrain, this.theme);
    this.particles = [];
    this.shown.clear();
    for (const w of game.worms) this.shown.set(w.id, w.hp);
    this.cam.zoom = clamp(Math.min(this.vh / 700, 1.2), this.minZoom(), 2);
    const w = game.activeWorm();
    this.cam.x = w.x;
    this.cam.y = w.y - 60;
    this.manualUntil = 0;
  }

  toWorld(sx, sy) {
    const z = this.cam.zoom;
    return { x: (sx - this.vw / 2) / z + this.cam.x, y: (sy - this.vh / 2) / z + this.cam.y };
  }

  zoomBy(f) {
    this.cam.zoom = clamp(this.cam.zoom * f, this.minZoom(), 2);
    this.manualUntil = this.t + 2;
  }

  say(text, color = '#fff', dur = 2.6) {
    this.msg = { text, color, until: this.t + dur };
  }

  // ---------- events -> effects ----------
  consume(events) {
    const g = this.game;
    for (const e of events) {
      switch (e.type) {
        case 'carve': carve(this.terrainCanvas, e.x, e.y, e.r, this.theme); break;
        case 'fill': drawGirder(this.terrainCanvas, e.x1, e.y1, e.x2, e.y2, e.th); break;
        case 'explosion': this.explosionFx(e); break;
        case 'splash': this.splashFx(e.x, e.y, e.size); this.audio.play('splash'); break;
        case 'damage': {
          const team = g.teams[e.team];
          this.particles.push({ type: 'text', x: e.x, y: e.y - 18, vx: 0, vy: -28, life: 1.4, max: 1.4, text: String(e.amount), color: team.color });
          this.audio.play('hurt');
          break;
        }
        case 'death': {
          const w = g.worms[e.id];
          this.say(`${w.name} has died`, g.teams[w.team].color);
          this.audio.play('death');
          break;
        }
        case 'drown': {
          const w = g.worms[e.id];
          this.say(`${w.name} drowned`, g.teams[w.team].color);
          this.audio.play('death');
          break;
        }
        case 'turnStart': {
          const team = g.teams[e.team];
          this.say(`${team.name}'s turn  ·  ${g.worms[e.worm].name}`, team.color);
          this.manualUntil = 0;
          this.focus = null;
          this.audio.play('turn');
          break;
        }
        case 'shot':
          this.particles.push({ type: 'tracer', x: e.x1, y: e.y1, x2: e.x2, y2: e.y2, life: 0.08, max: 0.08 });
          this.audio.play(e.weapon === 'uzi' ? 'uzi' : 'shot');
          break;
        case 'hit':
          for (let i = 0; i < 4; i++) this.particles.push({ type: 'spark', x: e.x, y: e.y, vx: rand(-80, 80), vy: rand(-120, 0), life: 0.3, max: 0.3 });
          break;
        case 'fire': this.audio.play('fire'); break;
        case 'jump': this.audio.play('jump'); break;
        case 'bounce': this.audio.play('bounce'); break;
        case 'thud': this.audio.play('thud'); break;
        case 'hhg': this.audio.play('hhg'); break;
        case 'punch': this.explosionFx({ x: e.x, y: e.y, r: 10 }, true); break;
        case 'sheepHop': this.audio.play('baa'); break;
        case 'pickup':
          this.particles.push({ type: 'text', x: e.x, y: e.y - 12, vx: 0, vy: -24, life: 1.8, max: 1.8, text: e.text, color: g.teams[e.team].color });
          this.audio.play('pickup');
          break;
        case 'crateDrop': this.say('Crate incoming!', '#ffd23f', 1.8); break;
        case 'teleport':
          for (const [x, y] of [[e.x1, e.y1], [e.x2, e.y2]]) {
            for (let i = 0; i < 16; i++) this.particles.push({ type: 'spark', x, y, vx: rand(-90, 90), vy: rand(-90, 90), life: 0.5, max: 0.5, color: '#7fd6ff' });
          }
          this.audio.play('teleport');
          break;
        case 'ropeShot':
          this.particles.push({ type: 'tracer', x: e.x1, y: e.y1, x2: e.x2, y2: e.y2, life: 0.12, max: 0.12, color: '#d9c79a' });
          break;
        case 'mineTrigger': this.audio.play('tick'); break;
        case 'airstrike': this.say('Air strike inbound!', '#ff8b3d', 1.8); this.focusStrike(e.x); break;
        case 'suddenDeath': this.say('SUDDEN DEATH — water is rising', '#ff4d4d', 4); break;
        default: FX[e.type]?.(e, this); break;
        case 'surrender': this.say(`${g.teams[e.team].name} surrendered`, g.teams[e.team].color); break;
      }
    }
  }

  explosionFx(e, small = false) {
    const r = e.r;
    this.focus = { x: e.x, y: e.y, until: this.t + 1.2 };
    this.particles.push({ type: 'blast', x: e.x, y: e.y, r, life: 0.4, max: 0.4 });
    for (let i = 0; i < r * 0.9; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(30, 110 + r * 2);
      this.particles.push({ type: 'fire', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: rand(0.3, 0.7), max: 0.7, size: rand(3, 6 + r * 0.12) });
    }
    for (let i = 0; i < r * 0.35; i++) {
      this.particles.push({ type: 'smoke', x: e.x + rand(-r / 2, r / 2), y: e.y + rand(-r / 2, r / 2), vx: rand(-20, 20), vy: rand(-50, -10), life: rand(0.8, 1.6), max: 1.6, size: rand(5, 10 + r * 0.15) });
    }
    for (let i = 0; i < r * 0.5; i++) {
      const a = rand(Math.PI, Math.PI * 2);
      this.particles.push({ type: 'debris', x: e.x, y: e.y, vx: Math.cos(a) * rand(40, 220), vy: Math.sin(a) * rand(60, 260), life: rand(0.8, 1.4), max: 1.4 });
    }
    if (!small) {
      this.shake = Math.max(this.shake, Math.min(10, r * 0.18));
      this.audio.play('explosion', Math.min(1.5, r / 40));
    }
  }

  splashFx(x, y, size = 1) {
    for (let i = 0; i < 14 * size; i++) {
      this.particles.push({ type: 'drop', x: x + rand(-8, 8), y, vx: rand(-50, 50), vy: rand(-260, -80) * size, life: 1.2, max: 1.2, color: this.theme.water.drop });
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      if (p.vx !== undefined) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.type === 'debris' || p.type === 'drop' || p.type === 'spark') p.vy += 520 * dt;
        if (p.type === 'smoke') p.vy -= 10 * dt;
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 1500) this.particles.splice(0, this.particles.length - 1500);
  }

  // ---------- camera ----------
  // Air strikes, napalm and the like: look at the spot that was aimed at while the planes come in.
  focusStrike(x) {
    const g = this.game;
    const s = g.terrain.surfaceY(Math.round(x), 0);
    this.manualUntil = 0; // a manual scroll must not keep the camera away from the target
    this.focus = { x, y: (s > 0 ? s : g.activeWorm().y) - 80, until: this.t + 4.5 };
  }

  // Dragging the map (touch): dx/dy are screen pixels. The camera stays where it was put for a few seconds.
  panBy(dx, dy) {
    this.cam.x -= dx / this.cam.zoom;
    this.cam.y -= dy / this.cam.zoom;
    this.manualUntil = this.t + 4;
  }

  updateCamera(dt, mouse) {
    const g = this.game;
    const cam = this.cam;
    const z = cam.zoom;
    if (mouse?.inside && this.t > 0.5) {
      const m = 26;
      const sp = (620 / z) * dt;
      let dx = 0;
      let dy = 0;
      if (mouse.x < m) dx = -sp;
      else if (mouse.x > this.vw - m) dx = sp;
      if (mouse.y < m) dy = -sp;
      else if (mouse.y > this.vh - m) dy = sp;
      if (dx || dy) {
        cam.x += dx;
        cam.y += dy;
        this.manualUntil = this.t + 2.5;
      }
    }
    if (this.t > this.manualUntil) {
      let target = null;
      for (let i = g.objects.length - 1; i >= 0; i--) {
        const o = g.objects[i];
        if (o.kind === 'rocket' || o.kind === 'grenade' || o.kind === 'sheep' || (o.kind === 'mine' && o.trig)) {
          target = o;
          break;
        }
      }
      if (!target && this.focus && this.focus.until > this.t) target = this.focus;
      if (!target) {
        const dying = g.worms.find((w) => w.alive && w.state === 'air' && g.phase !== 'turn');
        target = dying || g.activeWorm();
      }
      if (target) {
        const k = Math.min(1, dt * 4);
        cam.x += (target.x - cam.x) * k;
        cam.y += (target.y - 30 - cam.y) * k;
      }
    }
    const hw = this.vw / (2 * z);
    const hh = this.vh / (2 * z);
    const W = g.terrain.w;
    const H = g.terrain.h;
    cam.x = clamp(cam.x, Math.min(W / 2, hw - 150), Math.max(W / 2, W - hw + 150));
    cam.y = clamp(cam.y, Math.min(H / 2, hh - 150), Math.max(H / 2, H - hh + 80));
  }

  // ---------- drawing ----------
  draw(dt, input) {
    const g = this.game;
    if (!g) return;
    this.t += dt;
    for (const w of g.worms) {
      const cur = this.shown.get(w.id) ?? w.hp;
      this.shown.set(w.id, cur > w.hp ? Math.max(w.hp, cur - 40 * dt) : Math.min(w.hp, cur + 40 * dt));
    }
    this.updateParticles(dt);
    this.updateCamera(dt, input?.mouse);
    this.shake = Math.max(0, this.shake - dt * 18);

    const ctx = this.ctx;
    const { dpr, cam } = this;
    const z = cam.zoom * dpr;
    const sx = this.shake ? rand(-this.shake, this.shake) : 0;
    const sy = this.shake ? rand(-this.shake, this.shake) : 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawSky(ctx);

    ctx.setTransform(z, 0, 0, z, (this.vw / 2 - cam.x * cam.zoom + sx) * dpr, (this.vh / 2 - cam.y * cam.zoom + sy) * dpr);
    const left = cam.x - this.vw / (2 * cam.zoom);
    const right = cam.x + this.vw / (2 * cam.zoom);
    const top = cam.y - this.vh / (2 * cam.zoom);
    const bottom = cam.y + this.vh / (2 * cam.zoom);

    // water behind the land
    ctx.fillStyle = this.theme.water.fill;
    ctx.fillRect(left, g.waterY - 4, right - left, bottom - g.waterY + 40);

    const tw = g.terrain.w;
    const th = g.terrain.h;
    const x0 = clamp(Math.floor(left) - 1, 0, tw);
    const y0 = clamp(Math.floor(top) - 1, 0, th);
    const x1 = clamp(Math.ceil(right) + 1, 0, tw);
    const y1 = clamp(Math.ceil(bottom) + 1, 0, th);
    ctx.imageSmoothingEnabled = cam.zoom < 1;
    if (x1 > x0 && y1 > y0) ctx.drawImage(this.terrainCanvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);

    for (const c of g.crates) this.drawCrate(ctx, c);
    for (const o of g.objects) this.drawObject(ctx, o);
    for (const w of g.worms) if (w.alive) this.drawWorm(ctx, w);
    this.drawAim(ctx, input);
    this.drawParticles(ctx);
    this.updateAmbient(dt, left, right, top, bottom);
    this.drawAmbient(ctx);
    this.drawWater(ctx, left, right, bottom);
    this.drawLabels(ctx);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawHud(ctx);
  }

  drawSky(ctx) {
    const { vw, vh } = this;
    const sky = this.theme.sky;
    if (!this.sky) {
      this.sky = ctx.createLinearGradient(0, 0, 0, vh);
      for (const [o, c] of sky.stops) this.sky.addColorStop(o, c);
    }
    ctx.fillStyle = this.sky;
    ctx.fillRect(0, 0, vw, vh);
    const camX = this.cam.x * this.cam.zoom;
    const camY = this.cam.y * this.cam.zoom;
    if (this.stars.length) this.drawStars(ctx, camX, camY);
    if (sky.planet) this.drawPlanet(ctx, sky.planet, camX, camY);
    if (sky.clouds) {
      ctx.fillStyle = sky.clouds;
      for (const c of this.clouds) {
        const x = ((c.x + this.t * c.v - camX * 0.15) % (vw + 400)) - 200;
        const y = c.y - camY * 0.05;
        for (const [dx, dy, rx, ry] of [[0, 0, 50, 16], [30, -8, 34, 14], [-28, -4, 30, 12]]) {
          ctx.beginPath();
          ctx.ellipse(x + dx * c.s, y + dy * c.s, rx * c.s, ry * c.s, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    for (const { f, color, base, amp } of sky.mountains) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, vh);
      for (let x = 0; x <= vw; x += 12) {
        const wx = x + camX * f;
        const y = vh * base - camY * f * 0.3 + Math.sin(wx * 0.004) * amp + Math.sin(wx * 0.011) * amp * 0.4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(vw, vh);
      ctx.fill();
    }
  }

  drawStars(ctx, camX, camY) {
    const { vw, vh } = this;
    ctx.fillStyle = '#fff';
    for (const s of this.stars) {
      const x = (((s.x * vw - camX * 0.02) % vw) + vw) % vw;
      const y = s.y * vh * 0.85 - camY * 0.01;
      ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.t * s.sp + s.ph));
      ctx.fillRect(x, y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
  }

  // A big planet (Earth) in the background; position and radius are viewport fractions.
  drawPlanet(ctx, p, camX, camY) {
    const { vw, vh } = this;
    const R = p.r * Math.min(vw, vh);
    const cx = p.x * vw - camX * 0.02;
    const cy = p.y * vh - camY * 0.01;
    const glow = ctx.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.3);
    glow.addColorStop(0, p.glow);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = p.ocean;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.fillStyle = p.land;
    for (const [dx, dy, rx, ry, rot] of [[-0.35, -0.25, 0.4, 0.22, 0.5], [0.3, 0.1, 0.3, 0.45, -0.3], [-0.15, 0.55, 0.3, 0.14, 0.2], [0.55, -0.45, 0.18, 0.1, 0]]) {
      ctx.beginPath();
      ctx.ellipse(cx + dx * R, cy + dy * R, rx * R, ry * R, rot, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = p.cloud;
    ctx.lineWidth = Math.max(2, R * 0.05);
    ctx.lineCap = 'round';
    for (const [dx, dy, len] of [[-0.5, 0.05, 0.5], [0.0, -0.45, 0.6], [0.1, 0.35, 0.45]]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * R, cy + dy * R);
      ctx.lineTo(cx + (dx + len) * R, cy + (dy - 0.06) * R);
      ctx.stroke();
    }
    const shade = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.25, cx, cy, R * 1.1);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, p.shade);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = shade;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.restore();
  }

  // ---------- theme ambient particles (max AMBIENT_MAX, world coordinates) ----------
  updateAmbient(dt, left, right, top, bottom) {
    const kind = this.theme.ambient;
    if (!kind || kind === 'none') return;
    for (const p of this.ambient) {
      p.x += (p.vx + (kind === 'snow' ? Math.sin(this.t * 1.4 + p.ph) * 10 : 0)) * dt;
      p.y += p.vy * dt;
      if (p.max) p.life -= dt;
      if (p.rot !== undefined) p.rot += p.vr * dt;
    }
    this.ambient = this.ambient.filter((p) => (!p.max || p.life > 0) && p.x > left - 80 && p.x < right + 80 && p.y < bottom + 20 && p.y > top - 40);
    const fresh = !this.ambientSeeded; // first frame: scatter over the whole view instead of a strip at the top
    this.ambientSeeded = true;
    const n = fresh ? AMBIENT_MAX : 3;
    for (let i = 0; i < n && this.ambient.length < AMBIENT_MAX; i++) this.ambient.push(this.spawnAmbient(kind, fresh, left, right, top, bottom));
  }

  spawnAmbient(kind, scatter, left, right, top, bottom) {
    const x = rand(left - 40, right + 40);
    const ph = rand(0, 6.3);
    const y0 = scatter ? rand(top, bottom) : null;
    switch (kind) {
      case 'snow':
        return { x, y: y0 ?? top - 6, vx: rand(-8, 8), vy: rand(25, 60), s: rand(1, 2.4), ph };
      case 'embers': { // rise from the lava surface
        const life = rand(2, 4.5);
        const base = clamp(this.game.waterY, top, bottom);
        return { x: clamp(x, left, right), y: y0 ?? base - rand(0, 15), vx: rand(-10, 10), vy: -rand(25, 70), s: rand(1, 2.2), ph, life, max: life };
      }
      case 'sprinkles':
        return { x, y: y0 ?? top - 6, vx: rand(-10, 10), vy: rand(30, 70), s: rand(3, 5), ph, rot: rand(0, 6.3), vr: rand(-3, 3), color: SPRINKLES[Math.floor(Math.random() * SPRINKLES.length)] };
      default: { // glitter
        const life = rand(1, 2.6);
        return { x: clamp(x, left, right), y: y0 ?? rand(top, bottom), vx: 0, vy: 0, s: rand(1.5, 3), ph, life: scatter ? rand(0.1, life) : life, max: life };
      }
    }
  }

  drawAmbient(ctx) {
    const kind = this.theme.ambient;
    if (!this.ambient.length) return;
    if (kind === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const p of this.ambient) ctx.fillRect(p.x, p.y, p.s, p.s);
    } else if (kind === 'embers') {
      for (const p of this.ambient) {
        const a = clamp(p.life / p.max, 0, 1);
        ctx.fillStyle = `rgba(255,${Math.floor(90 + a * 120)},30,${a})`;
        ctx.fillRect(p.x, p.y, p.s, p.s);
      }
    } else if (kind === 'sprinkles') {
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.6;
      for (const p of this.ambient) {
        ctx.strokeStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(p.rot) * p.s, p.y + Math.sin(p.rot) * p.s);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#fff';
      for (const p of this.ambient) {
        ctx.globalAlpha = Math.sin(Math.PI * clamp(p.life / p.max, 0, 1));
        ctx.fillRect(p.x - p.s, p.y - 0.5, p.s * 2, 1);
        ctx.fillRect(p.x - 0.5, p.y - p.s, 1, p.s * 2);
      }
      ctx.globalAlpha = 1;
    }
  }

  drawWater(ctx, left, right, bottom) {
    const y = this.game.waterY;
    const wt = this.theme.water;
    if (wt.gradient) {
      const gr = ctx.createLinearGradient(0, y - 5, 0, y + 160);
      wt.gradient.forEach((c, i) => gr.addColorStop(i / (wt.gradient.length - 1), c));
      ctx.fillStyle = gr;
    } else {
      ctx.fillStyle = wt.surface;
    }
    ctx.beginPath();
    ctx.moveTo(left, bottom + 50);
    for (let x = Math.floor(left / 10) * 10; x <= right + 10; x += 10) {
      ctx.lineTo(x, y + Math.sin(x * 0.03 + this.t * 2) * 3 + Math.sin(x * 0.013 - this.t * 1.3) * 2);
    }
    ctx.lineTo(right + 10, bottom + 50);
    ctx.fill();
    ctx.strokeStyle = wt.foam;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = Math.floor(left / 10) * 10; x <= right + 10; x += 10) {
      const yy = y + Math.sin(x * 0.03 + this.t * 2) * 3 + Math.sin(x * 0.013 - this.t * 1.3) * 2;
      if (x === Math.floor(left / 10) * 10) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      switch (p.type) {
        case 'blast': {
          const k = 1 - a;
          const rr = p.r * (0.5 + k * 1.0);
          const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
          gr.addColorStop(0, `rgba(255,255,220,${a})`);
          gr.addColorStop(0.5, `rgba(255,170,40,${a * 0.8})`);
          gr.addColorStop(1, 'rgba(255,80,0,0)');
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'fire':
          ctx.fillStyle = `rgba(255,${Math.floor(80 + a * 150)},20,${a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'smoke':
          ctx.fillStyle = `rgba(70,70,75,${a * 0.5})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'debris':
          ctx.fillStyle = `rgba(80,50,25,${Math.min(1, a * 2)})`;
          ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
          break;
        case 'drop':
          if (p.color) {
            ctx.globalAlpha = Math.min(1, a * 2);
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
            ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = `rgba(190,230,255,${Math.min(1, a * 2)})`;
            ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
          }
          break;
        case 'spark':
          ctx.fillStyle = p.color || `rgba(255,220,100,${a})`;
          ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
          break;
        case 'tracer':
          ctx.strokeStyle = p.color || `rgba(255,240,170,${a})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x2, p.y2);
          ctx.stroke();
          break;
        case 'text':
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = 3;
          ctx.strokeStyle = `rgba(0,0,0,${a})`;
          ctx.strokeText(p.text, p.x, p.y);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = a;
          ctx.fillText(p.text, p.x, p.y);
          ctx.globalAlpha = 1;
          break;
      }
    }
  }

  drawWorm(ctx, w) {
    const g = this.game;
    const team = g.teams[w.team];
    const t = this.t;
    const active = g.phase === 'turn' && g.turn.worm === w.id;
    const walk = w.walking ? Math.sin(t * 20) : 0;
    const idle = Math.sin(t * 2.4 + w.id) * 0.5;
    ctx.save();
    ctx.translate(w.x, w.y);
    if (w.state === 'air' && (Math.abs(w.vx) > 60 || Math.abs(w.vy) > 60)) ctx.rotate(Math.atan2(w.vy, w.vx * (w.dir || 1)) * 0.15 * w.dir);
    // body
    const bodyH = 7.5 + (w.walking ? walk * 0.6 : idle * 0.4);
    const gr = ctx.createLinearGradient(0, -9, 0, 7);
    gr.addColorStop(0, '#ffc6bd');
    gr.addColorStop(1, '#e8877f');
    ctx.fillStyle = gr;
    ctx.strokeStyle = '#7a3b36';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, -1.5 + (7.5 - bodyH) * 0.5, 5.8, bodyH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (w.frozen) {
      ctx.fillStyle = 'rgba(150,220,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(0, -1, 7.5, 9.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (w.poison > 0 && Math.random() < 0.08) {
      this.particles.push({ type: 'smoke', x: w.x + rand(-4, 4), y: w.y - 8, vx: 0, vy: -20, life: 0.8, max: 0.8, size: 2.5 });
    }
    // team stripe
    ctx.fillStyle = team.color;
    ctx.fillRect(-5, 2.5, 10, 2);
    // eyes
    const d = w.dir;
    for (const ex of [1.2, 4.2]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(d * ex, -5, 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(d * (ex + 0.7), -4.8, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#7a3b36';
    ctx.beginPath();
    ctx.moveTo(d * 1, -0.5);
    ctx.lineTo(d * 4.5, -0.8);
    ctx.stroke();
    // held weapon
    if (active && !g.turn.fired && w.state !== 'rope') this.drawHeld(ctx, w, g.turn.weapon);
    ctx.restore();

    if (w.state === 'rope' && w.rope) {
      ctx.strokeStyle = '#d9c79a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(w.x, w.y - 2);
      ctx.lineTo(w.rope.ax, w.rope.ay);
      ctx.stroke();
      ctx.fillStyle = '#888';
      ctx.beginPath();
      ctx.arc(w.rope.ax, w.rope.ay, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawHeld(ctx, w, id) {
    ctx.save();
    ctx.translate(w.dir * 2, -1);
    ctx.scale(w.dir, 1);
    ctx.rotate(-w.aim);
    if (HELD[id]) {
      HELD[id](ctx, w, this);
      ctx.restore();
      return;
    }
    switch (id) {
      case 'bazooka':
        ctx.fillStyle = '#3d5a2a';
        ctx.fillRect(-2, -2.5, 17, 5);
        ctx.fillStyle = '#222';
        ctx.fillRect(14, -3, 2.5, 6);
        break;
      case 'shotgun':
        ctx.fillStyle = '#6b4423';
        ctx.fillRect(0, -1.5, 5, 3);
        ctx.fillStyle = '#444';
        ctx.fillRect(4, -1, 12, 2);
        break;
      case 'uzi':
        ctx.fillStyle = '#222';
        ctx.fillRect(0, -2, 10, 4);
        ctx.fillRect(2, 1, 3, 5);
        break;
      case 'grenade': case 'cluster': case 'hhg': {
        ctx.fillStyle = id === 'hhg' ? '#e6b800' : id === 'cluster' ? '#2f5d2a' : '#3f8f35';
        ctx.beginPath();
        ctx.arc(6, 0, 3.4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'dynamite':
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(2, -2, 9, 4);
        break;
      case 'mine':
        ctx.fillStyle = '#666';
        ctx.beginPath();
        ctx.arc(6, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'sheep':
        ctx.fillStyle = '#f4f4f4';
        ctx.beginPath();
        ctx.arc(6, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'punch':
        ctx.fillStyle = '#ff9d6b';
        ctx.beginPath();
        ctx.arc(8, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'rope':
        ctx.strokeStyle = '#d9c79a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(7, 0, 3, 0, Math.PI * 1.5);
        ctx.stroke();
        break;
      default:
        break;
    }
    ctx.restore();
  }

  drawAim(ctx, input) {
    const g = this.game;
    if (g.phase !== 'turn') return;
    const t = g.turn;
    const w = g.activeWorm();
    const wd = WEAPONS[t.weapon];
    if (!w || !w.alive) return;
    if (wd.aim && !t.fired) {
      const dx = w.dir * Math.cos(w.aim);
      const dy = -Math.sin(w.aim);
      const d = 62;
      const cx = w.x + dx * d;
      const cy = w.y - 1 + dy * d;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.moveTo(cx - 8, cy);
      ctx.lineTo(cx + 8, cy);
      ctx.moveTo(cx, cy - 8);
      ctx.lineTo(cx, cy + 8);
      ctx.stroke();
      if (t.charging) {
        const n = Math.floor(t.power * 14);
        for (let i = 0; i < n; i++) {
          const k = (i + 1) / 14;
          ctx.fillStyle = `hsl(${120 - k * 120},90%,50%)`;
          ctx.beginPath();
          ctx.arc(w.x + dx * (12 + i * 3.6), w.y - 1 + dy * (12 + i * 3.6), 1.6 + k * 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    if (wd.target && input?.mouse.inside && g.turn.team === input.app.humanTeam && !t.fired) {
      const p = this.toWorld(input.mouse.x, input.mouse.y);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      if (wd.id === 'girder') {
        const a = (t.girder * Math.PI) / 8;
        ctx.strokeStyle = Math.hypot(p.x - w.x, p.y - w.y) > 380 ? 'rgba(255,80,80,0.9)' : 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(p.x - Math.cos(a) * 32, p.y - Math.sin(a) * 32);
        ctx.lineTo(p.x + Math.cos(a) * 32, p.y + Math.sin(a) * 32);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, wd.id === 'teleport' ? w.r : 10, 0, Math.PI * 2);
        ctx.moveTo(p.x - 14, p.y);
        ctx.lineTo(p.x + 14, p.y);
        ctx.moveTo(p.x, p.y - 14);
        ctx.lineTo(p.x, p.y + 14);
        ctx.stroke();
      }
    }
    if (t.marker) {
      ctx.strokeStyle = '#ff3030';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(t.marker.x - 8, t.marker.y - 8);
      ctx.lineTo(t.marker.x + 8, t.marker.y + 8);
      ctx.moveTo(t.marker.x + 8, t.marker.y - 8);
      ctx.lineTo(t.marker.x - 8, t.marker.y + 8);
      ctx.stroke();
    }
    // active worm marker
    if (!t.fired || t.time > 0) {
      const bob = Math.sin(this.t * 6) * 3;
      ctx.fillStyle = g.teams[t.team].color;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w.x, w.y - 40 + bob);
      ctx.lineTo(w.x - 6, w.y - 50 + bob);
      ctx.lineTo(w.x + 6, w.y - 50 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  drawLabels(ctx) {
    const g = this.game;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    for (const w of g.worms) {
      if (!w.alive) continue;
      const team = g.teams[w.team];
      const hp = Math.ceil(this.shown.get(w.id) ?? w.hp);
      const nw = ctx.measureText(w.name).width + 8;
      const x = w.x;
      const y = w.y - 26;
      ctx.fillStyle = team.color;
      ctx.fillRect(x - nw / 2, y - 10, nw, 12);
      ctx.fillStyle = '#0b1220';
      ctx.fillText(w.name, x, y - 1);
      ctx.fillStyle = 'rgba(10,15,25,0.85)';
      ctx.fillRect(x - 11, y + 3, 22, 11);
      ctx.fillStyle = '#fff';
      ctx.fillText(String(hp), x, y + 12);
    }
  }

  drawCrate(ctx, c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    if (c.para) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeStyle = '#999';
      ctx.beginPath();
      ctx.arc(0, -22, 18, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-18, -22);
      ctx.lineTo(-6, -6);
      ctx.moveTo(18, -22);
      ctx.lineTo(6, -6);
      ctx.stroke();
    }
    ctx.fillStyle = c.kind === 'health' ? '#f4f4f0' : '#b98a4e';
    ctx.strokeStyle = '#4a3216';
    ctx.lineWidth = 1.2;
    ctx.fillRect(-7, -7, 14, 14);
    ctx.strokeRect(-7, -7, 14, 14);
    if (c.kind === 'health') {
      ctx.fillStyle = '#d62828';
      ctx.fillRect(-1.5, -5, 3, 10);
      ctx.fillRect(-5, -1.5, 10, 3);
    } else {
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000';
      ctx.fillText(WEAPONS[c.weapon].icon, 0, 3.5);
    }
    ctx.restore();
  }

  drawObject(ctx, o) {
    const custom = DRAWERS[o.kind];
    if (custom) return custom(ctx, o, this);
    switch (o.kind) {
      case 'rocket': {
        if (Math.random() < 0.7) this.particles.push({ type: 'smoke', x: o.x, y: o.y, vx: rand(-8, 8), vy: rand(-8, 8), life: 0.7, max: 0.7, size: o.variant === 'rocket' ? 4 : 2.5 });
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.rotate(Math.atan2(o.vy, o.vx));
        if (o.variant === 'bomb') {
          ctx.fillStyle = '#222';
          ctx.beginPath();
          ctx.ellipse(0, 0, 7, 3.5, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (o.variant === 'bomblet') {
          ctx.fillStyle = '#c0392b';
          ctx.beginPath();
          ctx.arc(0, 0, 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#8d949e';
          ctx.fillRect(-8, -2.5, 14, 5);
          ctx.fillStyle = '#d62828';
          ctx.beginPath();
          ctx.moveTo(6, -2.5);
          ctx.lineTo(11, 0);
          ctx.lineTo(6, 2.5);
          ctx.fill();
          ctx.fillStyle = `rgba(255,${Math.floor(rand(120, 200))},30,0.9)`;
          ctx.beginPath();
          ctx.moveTo(-8, -2);
          ctx.lineTo(-8 - rand(5, 9), 0);
          ctx.lineTo(-8, 2);
          ctx.fill();
        }
        ctx.restore();
        break;
      }
      case 'grenade': {
        ctx.save();
        ctx.translate(o.x, o.y);
        if (o.variant === 'dynamite') {
          ctx.rotate(0.3);
          ctx.fillStyle = '#c0392b';
          ctx.fillRect(-2, -6, 4, 12);
          ctx.fillStyle = '#ffd23f';
          ctx.fillRect(-2, -2, 4, 2);
          if (Math.random() < 0.5) this.particles.push({ type: 'spark', x: o.x, y: o.y - 7, vx: rand(-30, 30), vy: rand(-60, -10), life: 0.3, max: 0.3 });
        } else {
          ctx.fillStyle = o.variant === 'hhg' ? '#e6b800' : o.variant === 'cluster' ? '#2f5d2a' : '#3f8f35';
          ctx.strokeStyle = '#111';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          if (o.variant === 'hhg') {
            ctx.fillStyle = '#fff';
            ctx.fillRect(-0.8, -3, 1.6, 6);
            ctx.fillRect(-3, -1, 6, 1.6);
          }
        }
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000';
        ctx.strokeText(String(Math.max(0, Math.ceil(o.fuse))), 0, -10);
        ctx.fillStyle = '#fff';
        ctx.fillText(String(Math.max(0, Math.ceil(o.fuse))), 0, -10);
        ctx.restore();
        break;
      }
      case 'mine': {
        ctx.fillStyle = '#555';
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(o.x, o.y, 5, Math.PI, 0);
        ctx.lineTo(o.x + 5, o.y + 3);
        ctx.lineTo(o.x - 5, o.y + 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        const on = o.trig || (o.arm <= 0 && Math.floor(this.t * 2) % 2 === 0);
        ctx.fillStyle = on ? '#ff3030' : '#601010';
        ctx.beginPath();
        ctx.arc(o.x, o.y - 2, 1.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'sheep': {
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.scale(o.dir, 1);
        const hop = o.state === 'ground' ? Math.abs(Math.sin(this.t * 14)) * 1.5 : 0;
        ctx.fillStyle = '#fafafa';
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        for (const [px, py, r] of [[-3, -2 - hop, 5], [1, -4 - hop, 5], [3, -1 - hop, 4.5], [-1, 0 - hop, 5]]) {
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.ellipse(6, -1 - hop, 2.6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(6, -3 - hop, 1.5, 1.5);
        ctx.fillStyle = '#333';
        ctx.fillRect(-3, 4 - hop, 1.5, 3 + hop);
        ctx.fillRect(2, 4 - hop, 1.5, 3 + hop);
        ctx.restore();
        break;
      }
      case 'plane': {
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.scale(o.dir, 1);
        ctx.fillStyle = '#4b5563';
        ctx.beginPath();
        ctx.ellipse(0, 0, 28, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6b7280';
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(-14, -14);
        ctx.lineTo(-8, -14);
        ctx.lineTo(8, 0);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-24, 0);
        ctx.lineTo(-30, -9);
        ctx.lineTo(-24, -9);
        ctx.lineTo(-18, 0);
        ctx.fill();
        ctx.fillStyle = '#9ad1ff';
        ctx.beginPath();
        ctx.ellipse(14, -2, 6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'grave': {
        const team = this.game.teams[o.team];
        ctx.fillStyle = '#b8bcc4';
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(o.x - 4, o.y + 5);
        ctx.lineTo(o.x - 4, o.y - 3);
        ctx.arc(o.x, o.y - 3, 4, Math.PI, 0);
        ctx.lineTo(o.x + 4, o.y + 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = team.color;
        ctx.fillRect(o.x - 4, o.y + 2, 8, 2);
        ctx.fillStyle = '#444';
        ctx.fillRect(o.x - 0.7, o.y - 6, 1.4, 6);
        ctx.fillRect(o.x - 2.5, o.y - 4.5, 5, 1.4);
        break;
      }
    }
  }

  // ---------- HUD ----------
  drawHud(ctx) {
    const g = this.game;
    const { vw, vh } = this;
    const t = g.turn;
    ctx.textAlign = 'center';

    // turn clock
    if (g.phase === 'turn' || g.phase === 'resolve' || g.phase === 'deaths') {
      const team = g.teams[t.team];
      const secs = g.phase === 'turn' ? Math.max(0, Math.ceil(t.time)) : 0;
      ctx.fillStyle = 'rgba(10,18,32,0.8)';
      ctx.beginPath();
      ctx.arc(46, 46, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = team.color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(46, 46, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (g.phase === 'turn' ? t.time / g.cfg.turnTime : 0));
      ctx.stroke();
      ctx.fillStyle = secs <= 5 && g.phase === 'turn' ? '#ff5a5a' : '#fff';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText(String(secs), 46, 55);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#b6c6dc';
      ctx.fillText(`Round ${g.round}${g.sudden ? ' · SUDDEN DEATH' : ''}`, 46, 92);
    }

    // message banner
    if (this.msg && this.msg.until > this.t) {
      const a = clamp((this.msg.until - this.t) / 0.5, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = 'bold 22px sans-serif';
      const tw = ctx.measureText(this.msg.text).width + 36;
      ctx.fillStyle = 'rgba(10,18,32,0.78)';
      ctx.fillRect(vw / 2 - tw / 2, 20, tw, 40);
      ctx.fillStyle = this.msg.color;
      ctx.fillText(this.msg.text, vw / 2, 49);
      ctx.globalAlpha = 1;
    }

    // team health bars
    const maxHp = g.cfg.wormsPerTeam * g.cfg.wormHp;
    let y = vh - 20;
    for (const team of [...g.teams].reverse()) {
      const hp = g.worms.filter((w) => w.team === team.id && w.alive).reduce((s, w) => s + w.hp, 0);
      ctx.fillStyle = 'rgba(10,18,32,0.8)';
      ctx.fillRect(14, y - 16, 230, 20);
      ctx.fillStyle = team.color;
      ctx.fillRect(16, y - 14, Math.max(0, 226 * Math.min(1, hp / maxHp)), 16);
      ctx.textAlign = 'left';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#0b1220';
      ctx.fillText(`${team.name}${team.ai ? ' (AI)' : ''}`, 22, y - 1);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff';
      ctx.fillText(String(hp), 240, y - 1);
      y -= 26;
    }

    // wind
    const wx = vw - 120;
    const wy = 36;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(10,18,32,0.8)';
    ctx.fillRect(wx - 90, wy - 14, 180, 28);
    ctx.fillStyle = '#b6c6dc';
    ctx.font = '10px sans-serif';
    ctx.fillText('WIND', wx, wy - 3);
    ctx.fillStyle = '#334a6e';
    ctx.fillRect(wx - 80, wy + 2, 160, 6);
    ctx.fillStyle = '#7fd6ff';
    const wl = Math.abs(g.wind) * 80;
    ctx.fillRect(g.wind < 0 ? wx - wl : wx, wy + 2, wl, 6);
    ctx.fillStyle = '#fff';
    ctx.fillRect(wx - 1, wy, 2, 10);

    // selected weapon
    if (g.phase === 'turn') {
      const wd = WEAPONS[t.weapon];
      const ammo = g.ammo(t.team, wd.id);
      const text = `${wd.icon} ${wd.name} ${ammo < 0 ? '' : `×${ammo}`}${wd.fuse ? `   fuse ${t.fuse}s` : ''}`;
      ctx.font = 'bold 14px sans-serif';
      const tw = ctx.measureText(text).width + 24;
      ctx.fillStyle = 'rgba(10,18,32,0.8)';
      ctx.fillRect(vw / 2 - tw / 2, vh - 48, tw, 30);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, vw / 2, vh - 28);
      if (g.teams[t.team].ai === false && !t.fired) {
        ctx.font = '11px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        const fire = this.touch ? 'FIRE' : 'SPACE';
        const hint = wd.target ? (this.touch ? 'Tap the map to use' : 'Click to use') : wd.charge ? `Hold ${fire} to charge, release to fire` : wd.rope ? `${fire} to shoot rope` : wd.placed || wd.hitscan || wd.melee ? `${fire} to use` : '';
        ctx.fillText(hint, vw / 2, vh - 56);
      }
    }
  }
}

export { CHARGE_TIME };
