// Tiny WebAudio synth: sound effects and the music loop are generated, no asset files.
// tone() and noise() keep their positional signatures (the draw packs call them directly);
// the new trailing parameters (delay, filter type, destination) are optional.
import { trackFor } from './tracks.mjs';

const rnd = (a, b) => a + Math.random() * (b - a);
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const N = null;

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicOn = true;
    this.noiseBuf = null;
    this.wantMusic = false;
    this.timer = null;
    this.step = 0;
    this.loops = 0;
    this.nextT = 0;
    this.track = trackFor();
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      const comp = c.createDynamicsCompressor(); // many overlapping explosions stay clean
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain();
      this.sfx.connect(this.master);
      this.music = c.createGain();
      this.music.gain.value = 0.3;
      this.music.connect(this.master);
      const len = c.sampleRate * 2;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.wantMusic) this.startMusic();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.8;
    return this.muted;
  }

  // ---------- building blocks ----------
  tone(freq, dur, type = 'square', vol = 0.15, slide = 0, at = 0, dest = this.sfx) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, vol, from, to, at = 0, type = 'lowpass', dest = this.sfx) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, rnd(0, 1));
    s.stop(t + dur);
  }

  // A tone with vibrato (and an optional formant filter): bleats, wobbles, choirs.
  wobble(freq, dur, type, vol, rate, depth, at = 0, formant = 0, dest = this.sfx) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const lfo = c.createOscillator();
    const lg = c.createGain();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    lfo.frequency.value = rate;
    lg.gain.value = depth;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.03, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let out = o;
    if (formant) {
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = formant;
      f.Q.value = 3;
      o.connect(f);
      out = f;
    }
    out.connect(g).connect(dest);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.02);
    lfo.stop(t + dur + 0.02);
  }

  // ---------- sound effects ----------
  play(name, size = 1) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'explosion': // boom, crackle, rumble and a cartoon "pop" on top
        this.noise(0.5 + size * 0.6, 0.55 + size * 0.25, 2400, 60);
        this.tone(120, 0.5 + size * 0.2, 'sine', 0.5, -90);
        this.noise(0.35, 0.18, 7000, 600, 0.05, 'bandpass');
        this.noise(0.9 + size * 0.4, 0.14, 500, 40, 0.2);
        this.tone(rnd(900, 1300), 0.07, 'sine', 0.12, -700, 0.02);
        break;
      case 'fire': this.noise(0.24, 0.22, 500, 3500, 0, 'bandpass'); this.tone(rnd(160, 220), 0.15, 'square', 0.05, 200); break;
      case 'shot': this.noise(0.14, 0.4, 6000, 500); this.tone(rnd(200, 240), 0.1, 'square', 0.12, -170); break;
      case 'uzi': this.noise(0.05, 0.22, 6000, 900); this.tone(rnd(700, 950), 0.03, 'square', 0.05, -400); break;
      case 'jump': // boing!
        this.tone(rnd(230, 270), 0.2, 'sine', 0.16, 330);
        this.wobble(rnd(300, 340), 0.22, 'triangle', 0.07, 30, 40);
        break;
      case 'bounce': this.tone(rnd(380, 520), 0.11, 'triangle', 0.12, 280); this.tone(rnd(700, 800), 0.06, 'sine', 0.05, -300, 0.03); break;
      case 'thud': this.noise(0.12, 0.3, 500, 70); this.tone(75, 0.12, 'sine', 0.3, -35); break;
      case 'splash': // bloop and spray
        this.tone(rnd(380, 460), 0.14, 'sine', 0.22, 420);
        this.noise(0.5, 0.28, 3000, 300, 0.04);
        this.tone(rnd(250, 300), 0.1, 'sine', 0.14, 350, 0.14);
        break;
      case 'hurt': { // squeaky "ow!"
        const f = rnd(480, 760);
        this.tone(f, 0.08, 'sawtooth', 0.09, 260);
        this.tone(f + 260, 0.14, 'sawtooth', 0.08, -480, 0.07);
        break;
      }
      case 'death': // sad trombone: wah-wah-wah-waaah, then a pop
        [[233, 0.26, 0], [220, 0.26, 0.28], [208, 0.26, 0.56], [196, 0.8, 0.84]].forEach(([f, d, at], i) => {
          this.wobble(f, d, 'sawtooth', 0.1, i === 3 ? 6 : 0.1, i === 3 ? 5 : 0, at, 700);
        });
        this.tone(900, 0.07, 'sine', 0.14, -700, 1.7);
        break;
      case 'pickup': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.09, 'square', 0.07, 0, i * 0.065)); break;
      case 'turn': [523, 659, 784].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.16, 0, i * 0.1)); this.tone(1046, 0.3, 'triangle', 0.16, 0, 0.3); break;
      case 'win': // little fanfare
        [[523, 0], [523, 0.14], [523, 0.28], [698, 0.42], [659, 0.7], [784, 0.84], [1046, 1.0]].forEach(([f, at], i) => this.tone(f, i === 6 ? 0.7 : 0.16, 'square', 0.09, 0, at));
        break;
      case 'tick': this.tone(1000, 0.04, 'square', 0.06); break;
      case 'hhg': // hallelujah: a shimmering chord
        [523, 659, 784, 1046].forEach((f, i) => this.wobble(f, 1.6, 'sine', 0.1, 5, 4, i * 0.05));
        this.tone(2093, 1.2, 'triangle', 0.04, 0, 0.3);
        break;
      case 'teleport': this.wobble(500, 0.45, 'sine', 0.14, 32, 220); this.tone(300, 0.4, 'triangle', 0.08, 1000); break;
      case 'baa': this.wobble(rnd(300, 360), 0.5, 'sawtooth', 0.08, 22, 28, 0, 900); break;
    }
  }

  // ---------- music ----------
  startMusic() {
    this.wantMusic = true;
    if (!this.ctx || !this.musicOn || this.timer) return;
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 100);
  }

  stopMusic() {
    this.wantMusic = false;
    clearInterval(this.timer);
    this.timer = null;
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.musicOn) this.startMusic();
    else {
      clearInterval(this.timer);
      this.timer = null;
    }
    return this.musicOn;
  }

  // Silences just the music while the game is paused (suspending the context would be undone by the next key press).
  pause(on) {
    if (this.music) this.music.gain.value = on ? 0 : 0.3;
  }

  // Each map has its own tune (tracks.mjs). Switching restarts the loop from the top.
  setTrack(layoutId) {
    const t = trackFor(layoutId);
    if (t === this.track) return;
    this.track = t;
    this.step = 0;
    this.loops = 0;
    this.nextT = this.ctx ? this.ctx.currentTime + 0.1 : 0;
  }

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    if (this.nextT < c.currentTime) this.nextT = c.currentTime + 0.05; // fell behind (tab was hidden)
    while (this.nextT < c.currentTime + 0.4) {
      const t = this.track;
      this.playStep(t, this.step, this.nextT - c.currentTime);
      this.step = (this.step + 1) % (t.mel.length * 8);
      if (this.step === 0) this.loops++;
      this.nextT += 60 / t.bpm / 2;
    }
  }

  playStep(t, step, at) {
    const bar = step >> 3;
    const e = step & 7;
    const m = this.music;
    const E = 60 / t.bpm / 2; // one eighth note
    const root = t.roots[bar];

    // bass
    const off = t.bass.pat[e];
    if (off !== N) {
      const f = hz(root + off);
      if (t.bass.kind === 'tri') this.tone(f, E * 1.6, 'triangle', t.bass.vol, 0, at, m);
      else if (t.bass.kind === 'saw') {
        this.tone(f, E * 0.9, 'sawtooth', t.bass.vol, 0, at, m);
        this.tone(f / 2, E * 0.9, 'sine', t.bass.vol * 0.8, 0, at, m);
      } else this.tone(f, E * 7, 'sine', t.bass.vol, 0, at, m); // pad: rings for the whole bar
    }

    // chords
    if (t.chord && t.chord.pat[e]) {
      const ch = t.chords[bar];
      if (t.chord.kind === 'square') for (const n of ch) this.tone(hz(n), E * 0.8, 'square', 0.035, 0, at, m);
      else if (t.chord.kind === 'power') for (const n of ch) this.tone(hz(n), E * 0.85, 'square', 0.04, 0, at, m);
      else for (const n of ch) this.tone(hz(n), E * 7, 'triangle', 0.045, 0, at, m); // soft pad
    }

    // drums
    const d = t.drums;
    if (d.kick[e]) this.tone(110, 0.1, 'sine', d.kickVol, -80, at, m);
    if (d.snare[e]) {
      if (d.snareKind === 'tak') this.noise(0.05, 0.14, 3500, 2500, at, 'bandpass', m);
      else if (d.snareKind === 'clap') this.noise(0.09, 0.08, 2500, 1500, at, 'bandpass', m);
      else this.noise(0.08, 0.1, 4000, 2000, at, 'highpass', m);
    }
    if (d.hat[e]) {
      if (d.hatKind === 'bells') {
        this.noise(0.05, 0.05, 7000, 7000, at, 'highpass', m);
        this.tone(hz(96 + (e % 4)), 0.08, 'sine', 0.012, 0, at, m);
      } else this.noise(0.03, d.hat.every(Boolean) ? 0.045 : 0.06, 9000, 9000, at, 'highpass', m);
    }
    if (t.fill && bar === t.mel.length - 1 && e >= 4) this.noise(0.05, 0.1, 5000, 5000, at, 'highpass', m);

    // lead
    const note = t.mel[bar][e];
    if (note === N) return;
    const alt = t.alt && this.loops % 2 === 1; // every second pass the lead changes voice and drops an octave
    const f = hz(note);
    if (alt) this.wobble(hz(note - 12), E * 1.7, 'triangle', 0.22, 6, 3, at, 0, m);
    else if (t.lead === 'square') this.tone(f, E * 1.4, 'square', 0.08, 0, at, m);
    else if (t.lead === 'pungi') this.wobble(f, E * 1.8, 'sawtooth', 0.1, 5.5, f * 0.006, at, 1500, m);
    else if (t.lead === 'bell') {
      this.tone(f, E * 5, 'sine', 0.14, 0, at, m);
      this.tone(f * 2.76, E * 2.5, 'sine', 0.035, 0, at, m);
    } else if (t.lead === 'music') {
      this.tone(f, E * 0.9, 'triangle', 0.12, 0, at, m);
      this.tone(f * 2, E * 0.6, 'sine', 0.05, 0, at, m);
    } else {
      this.tone(f, E * 4, 'triangle', 0.1, 0, at, m); // glass
      this.tone(f * 2.005, E * 3, 'sine', 0.03, 0, at, m);
    }
  }
}
