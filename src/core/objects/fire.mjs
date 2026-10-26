// Shared fire: used by napalm, flame thrower, petrol bomb, cattle attack, ...
// Flames fall, stick to the ground, burn worms that touch them and burn out.
import { registerObjectType } from '../registry.mjs';
import { moveBody } from '../physics.mjs';
import { GRAVITY, DT } from '../constants.mjs';

const FLAME_PUSH = 75; // px/s sideways away from the flame
const FLAME_HOP = 170; // px/s upwards (a ~28 px hop)
const FLAME_CALM = 130; // px/s: a worm moving faster than this is not hopped again

registerObjectType('flame', {
  update(g, o) {
    o.life -= DT;
    if (o.life <= 0) {
      o.dead = true;
      return;
    }
    o.vy += GRAVITY * DT * 0.8;
    moveBody(g.terrain, o, DT, 0.1, 0.8);
    o.burn -= DT;
    if (o.burn <= 0) {
      o.burn = 0.25;
      for (const w of g.worms) {
        if (!w.alive || (w.x - o.x) ** 2 + (w.y - o.y) ** 2 >= (w.r + o.r + 2) ** 2) continue;
        // A burning worm hops away from the flame. Only when it is not already flying, so a pool of flames
        // does not keep re-launching it, and never a frozen one.
        if (!w.frozen && Math.hypot(w.vx, w.vy) < FLAME_CALM) {
          w.vx += (w.x >= o.x ? 1 : -1) * FLAME_PUSH;
          w.vy = Math.min(w.vy, -FLAME_HOP);
          g.knock(w);
        }
        g.hurt(w, o.dmg, o.owner);
      }
    }
  },
});

// Spawns `count` flames at (x, y) with random spread. Options: spread (px/s sideways), up (px/s upwards),
// life [min, max] seconds, dmg (hp per 0.25 s of contact), owner (worm id), r (flame radius).
export function spawnFire(g, x, y, { count = 1, spread = 60, up = 80, life = [3, 5], dmg = 1, owner = -1, r = 3 } = {}) {
  for (let i = 0; i < count; i++) {
    g.spawn({
      kind: 'flame', x: x + g.rng.range(-3, 3), y, vx: g.rng.range(-spread, spread), vy: -g.rng.range(0, up),
      r, life: g.rng.range(life[0], life[1]), burn: 0, dmg, owner,
    });
  }
}
