import { Game } from '../core/game.mjs';
import { DT, TEAM_COLORS } from '../core/constants.mjs';
import { WEAPONS, WEAPON_ORDER } from '../core/weapons.mjs';
import { Renderer } from './renderer.mjs';
import { Input } from './input.mjs';
import { Audio } from './audio.mjs';
import { LAYOUTS } from '../core/maps.mjs';
import { THEMES, themeById } from './themes.mjs';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', isTouch);
const canvas = $('game');
const audio = new Audio();
const renderer = new Renderer(canvas, audio);

const app = {
  game: null,
  renderer,
  audio,
  humanTeam: 0,
  paused: false,
  togglePause() {
    if (!this.game || this.game.phase === 'over') return;
    this.paused = !this.paused;
    audio.pause(this.paused);
    $('pause').classList.toggle('hidden', !this.paused);
  },
  toggleWeapons() {
    const p = $('weapons');
    if (!p.classList.contains('hidden')) return this.closeWeapons();
    if (!input.myTurn()) {
      renderer.say('Wait for your turn', '#ffffff', 1.4);
      return;
    }
    buildWeaponMenu();
    p.classList.remove('hidden');
  },
  closeWeapons() {
    $('weapons').classList.add('hidden');
  },
};
const input = new Input(canvas, app);

function buildWeaponMenu() {
  const g = app.game;
  const panel = $('weapons');
  panel.innerHTML = '';
  // Worms Armageddon style: 12 columns (F1-F12), up to 6 rows.
  for (let c = 0; c < 12; c++) {
    const h = document.createElement('div');
    h.className = 'hd';
    h.textContent = `F${c + 1}`;
    h.style.gridArea = `1 / ${c + 1}`;
    panel.appendChild(h);
  }
  const info = document.createElement('div');
  info.className = 'info';
  info.textContent = 'Right-click or E to close';
  info.style.gridArea = '8 / 1 / 9 / 13';
  panel.appendChild(info);
  for (const id of WEAPON_ORDER) {
    const wd = WEAPONS[id];
    const ammo = g.ammo(app.humanTeam, id);
    const b = document.createElement('button');
    b.className = id === g.turn.weapon ? 'sel' : '';
    b.disabled = ammo === 0;
    b.title = wd.name;
    b.style.gridArea = `${wd.panel[1] + 2} / ${wd.panel[0] + 1}`;
    b.innerHTML = `<span class="ic">${wd.icon}</span><span class="n">${ammo < 0 ? '∞' : ammo}</span>`;
    b.addEventListener('mouseenter', () => {
      info.textContent = wd.name + (ammo === 0 ? ' (none left)' : '');
    });
    b.addEventListener('click', () => {
      input.selectWeapon(id);
      app.closeWeapons();
    });
    panel.appendChild(b);
  }
}

function startGame(form) {
  const f = new FormData(form);
  const opponents = Number(f.get('opponents'));
  const seed = Number(f.get('seed')) || Math.floor(Math.random() * 999999) + 1;
  const names = ['Cobras', 'Vipers', 'Pythons'];
  const teams = [{ name: String(f.get('name')).trim() || 'Player', color: TEAM_COLORS[0] }];
  for (let i = 0; i < opponents; i++) teams.push({ name: names[i], ai: true, level: f.get('level'), color: TEAM_COLORS[i + 1] });
  app.game = new Game({
    seed,
    teams,
    settings: { wormsPerTeam: Number(f.get('worms')), turnTime: Number(f.get('turn')), layout: String(f.get('layout')) },
  });
  app.humanTeam = 0;
  app.paused = false;
  const themeId = String(f.get('theme'));
  const theme = themeById(themeId === 'random' ? THEMES[Math.floor(Math.random() * THEMES.length)].id : themeId);
  renderer.setGame(app.game, theme);
  if (isTouch) {
    $('touch').classList.remove('hidden');
    // The game HUD is identical on every device; the d-pad just sits above the team health bars.
    document.documentElement.style.setProperty('--bars', `${teams.length * 26 + 18}px`);
  }
  document.activeElement?.blur(); // a focused menu control would otherwise swallow game keys
  $('weaponBtn').classList.remove('hidden');
  $('menu').classList.add('hidden');
  $('over').classList.add('hidden');
  audio.pause(false);
  audio.wantMusic = true;
  audio.unlock();
  audio.startMusic();
}

$('setup').addEventListener('submit', (e) => {
  e.preventDefault();
  startGame(e.target);
});
$('setup').elements.seed.value = Math.floor(Math.random() * 999999) + 1;
for (const [name, list] of [['layout', LAYOUTS], ['theme', THEMES]]) {
  for (const o of list) $('setup').elements[name].add(new Option(o.name, o.id));
}
$('pause').addEventListener('click', () => app.togglePause()); // the overlay covers the touch buttons
$('weaponBtn').addEventListener('click', (e) => {
  e.currentTarget.blur();
  app.toggleWeapons();
});
$('again').addEventListener('click', () => {
  app.game = null;
  $('weaponBtn').classList.add('hidden');
  $('help').classList.add('hidden');
  $('touch').classList.add('hidden');
  $('over').classList.add('hidden');
  $('menu').classList.remove('hidden');
  $('setup').elements.seed.value = Math.floor(Math.random() * 999999) + 1;
});

// Context buttons (fuse, rotate, bounce, switch worm) only show when the selected weapon uses them.
const ctxButtons = [...document.querySelectorAll('#touch [data-ctx]')];
function updateTouch(g) {
  const mine = input.myTurn() && !g.turn.fired;
  const wd = WEAPONS[g.turn.weapon];
  for (const b of ctxButtons) {
    const on = mine && (b.dataset.ctx === 'fuse' ? wd.fuse : b.dataset.ctx === 'canSwitch' ? g.turn.canSwitch : wd[b.dataset.ctx]);
    b.classList.toggle('hidden', !on);
  }
  $('fuseN').textContent = g.turn.fuse;
}

let last = performance.now();
let acc = 0;
let overShown = false;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const g = app.game;
  if (g) {
    if (!app.paused) {
      acc += dt;
      let n = 0;
      while (acc >= DT && n < 6) {
        input.tick();
        g.update();
        acc -= DT;
        n++;
      }
      if (n === 6) acc = 0;
      renderer.consume(g.events);
      g.events.length = 0;
      if (g.phase === 'turn' && !g.turn.fired && g.turn.time <= 5 && g.turn.time > 0 && Math.ceil(g.turn.time) !== app._lastTick) {
        app._lastTick = Math.ceil(g.turn.time);
        audio.play('tick');
      }
    }
    $('help').classList.toggle('hidden', !(input.myTurn() && !g.turn.fired));
    if (isTouch) updateTouch(g);
    renderer.draw(app.paused ? 0 : dt, input);
    if (g.phase === 'over' && !overShown) {
      overShown = true;
      audio.stopMusic();
      audio.play(g.winner === app.humanTeam ? 'win' : 'death');
      setTimeout(() => {
        if (app.game !== g) return;
        $('overTitle').textContent = g.winner >= 0 ? `${g.teams[g.winner].name} wins!` : 'Draw!';
        $('over').classList.remove('hidden');
      }, 1800);
    }
    if (g.phase !== 'over') overShown = false;
  } else {
    renderer.ctx.setTransform(1, 0, 0, 1, 0, 0);
    renderer.ctx.fillStyle = '#0b1c2e';
    renderer.ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for debugging and automated tests.
window.__wormfare = { app };
