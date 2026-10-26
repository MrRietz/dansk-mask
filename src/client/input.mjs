// Keyboard and mouse -> game commands. Only the human team's turn is controllable.
import { WEAPONS, WEAPON_ORDER } from '../core/weapons.mjs';

const KEYMAP = {
  ArrowLeft: 'l', a: 'l', A: 'l',
  ArrowRight: 'r', d: 'r', D: 'r',
  ArrowUp: 'u', w: 'u', W: 'u',
  ArrowDown: 'd', s: 'd', S: 'd',
};

export class Input {
  constructor(canvas, app) {
    this.app = app; // { game, renderer, humanTeam, audio, togglePause, toggleWeapons, closeWeapons }
    this.keys = { l: 0, r: 0, u: 0, d: 0 };
    this.sent = '';
    this.lastTap = {}; // key -> time of previous press, for double-tap jumps
    this.mouse = { x: 0, y: 0, inside: false };
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    canvas.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inside = true;
    });
    canvas.addEventListener('mouseleave', () => (this.mouse.inside = false));
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.app.toggleWeapons();
    });
    canvas.addEventListener('mousedown', (e) => {
      this.app.audio.unlock();
      if (e.button === 0) this.onClick(e);
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.app.renderer.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });
  }

  get game() {
    return this.app.game;
  }

  myTurn() {
    const g = this.game;
    return g && g.phase === 'turn' && g.turn.team === this.app.humanTeam;
  }

  cmd(c) {
    this.game.command({ team: this.app.humanTeam, ...c });
  }

  onClick(e) {
    this.app.closeWeapons();
    if (!this.myTurn()) return;
    const wd = WEAPONS[this.game.turn.weapon];
    if (!wd.target) return;
    const p = this.app.renderer.toWorld(e.clientX, e.clientY);
    this.cmd({ type: 'useAt', x: p.x, y: p.y });
  }

  onKey(e, down) {
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const k = e.key;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Backspace', 'Tab'].includes(k) || (this.game && /^F([1-9]|1[0-2])$/.test(k))) e.preventDefault();
    this.app.audio.unlock();
    if (KEYMAP[k]) {
      this.keys[KEYMAP[k]] = down ? 1 : 0;
      return;
    }
    if (down && !e.repeat) {
      if (k === 'p' || k === 'P') return this.app.togglePause();
      if (k === 'm' || k === 'M') return this.app.audio.toggleMute();
      if (k === 'n' || k === 'N') return this.app.renderer.say(this.app.audio.toggleMusic() ? 'Music on' : 'Music off', '#ffffff', 1.2);
      if (k === 'e' || k === 'E') return this.app.toggleWeapons();
      if (k === 'Escape') return this.app.closeWeapons();
    }
    if (down && !e.repeat && k === 'Home') this.app.renderer.manualUntil = 0;
    if (!this.myTurn()) return;
    const wd = WEAPONS[this.game.turn.weapon];
    if (k === ' ') {
      if (wd.rotates) {
        if (down && !e.repeat) this.cmd({ type: 'girderRot', d: 1 });
      } else {
        this.cmd({ type: down ? 'fireDown' : 'fireUp' });
      }
    } else if (down && !e.repeat) {
      const now = performance.now();
      const double = now - (this.lastTap[k] || 0) < 300;
      this.lastTap[k] = now;
      // Worms Armageddon jumps: Enter / Enter-Enter = forward / backward, Backspace / twice = high jump / backflip.
      if (k === 'Enter') this.cmd({ type: double ? 'jumpBack' : 'jump' });
      else if (k === 'Backspace') this.cmd({ type: double ? 'backflip' : 'jumpHigh' });
      else if (k >= '1' && k <= '5') this.cmd({ type: 'fuse', n: Number(k) });
      else if (k === 'r' || k === 'R') this.cmd({ type: 'girderRot', d: e.shiftKey ? -1 : 1 });
      else if (k === 'b' || k === 'B') this.cmd({ type: 'bounce', n: ((this.game.turn.bounce + 1) % 3) });
      else if (k === 'Tab') this.cmd({ type: 'switchWorm' });
      else if (/^F([1-9]|1[0-2])$/.test(k)) this.selectGroup(Number(k.slice(1)) - 1);
      if (wd.strike && (k === 'ArrowLeft' || k === 'ArrowRight')) this.cmd({ type: 'strikeDir', d: k === 'ArrowRight' ? 1 : -1 });
    }
  }

  // F1-F12: pick the first usable weapon of that panel column, or cycle through it on repeat presses.
  selectGroup(col) {
    const g = this.game;
    const list = WEAPON_ORDER.filter((id) => WEAPONS[id].panel[0] === col && g.ammo(this.app.humanTeam, id) !== 0)
      .sort((a, b) => WEAPONS[a].panel[1] - WEAPONS[b].panel[1]);
    if (!list.length) return;
    const cur = list.indexOf(g.turn.weapon);
    this.selectWeapon(list[(cur + 1) % list.length]);
  }

  selectWeapon(id) {
    if (!this.myTurn()) return;
    if (id === 'surrender' && !confirm('Surrender the match?')) return;
    this.cmd({ type: 'weapon', id });
  }

  // Called once per simulation tick, before game.update().
  tick() {
    if (!this.myTurn()) {
      this.sent = '';
      return;
    }
    const { l, r, u, d } = this.keys;
    const key = `${l}${r}${u}${d}`;
    if (key !== this.sent) {
      this.sent = key;
      this.cmd({ type: 'input', l, r, u, d });
    }
  }
}
