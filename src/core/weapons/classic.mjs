// The first 16 weapons. Thin hooks over the engine helpers in game.mjs.
import { registerWeapons } from '../registry.mjs';

const projectile = (g, w, wd, { power }) => g.launchProjectile(w, wd, power);
const place = (g, w, wd) => g.place(w, wd);

registerWeapons([
  {
    id: 'bazooka', panel: [0,0], crate: 0, name: 'Bazooka', icon: '🚀', ammo: -1, aim: true, charge: true, speed: 780,
    expl: { r: 30, dmg: 50, push: 420 }, fire: projectile,
  },
  {
    id: 'grenade', panel: [1,0], crate: 0, name: 'Grenade', icon: '💣', ammo: -1, aim: true, charge: true, fuse: true,
    defFuse: 3, speed: 640, bounce: 0.55, friction: 0.94, expl: { r: 32, dmg: 50, push: 420 }, fire: projectile,
  },
  {
    id: 'cluster', panel: [1,1], name: 'Cluster Bomb', icon: '🎇', ammo: 3, aim: true, charge: true, fuse: true,
    defFuse: 3, speed: 600, bounce: 0.45, friction: 0.94, expl: { r: 24, dmg: 25, push: 300 },
    bomblets: 5, bomblet: { r: 18, dmg: 20, push: 220 }, fire: projectile,
  },
  {
    id: 'hhg', panel: [8,1], crateAmount: 1, name: 'Holy Hand Grenade', icon: '✝️', ammo: 1, aim: true, charge: true, fuse: true,
    defFuse: 3, speed: 520, bounce: 0.4, friction: 0.94, expl: { r: 66, dmg: 100, push: 760 }, fire: projectile,
  },
  {
    id: 'dynamite', panel: [4,0], name: 'Dynamite', icon: '🧨', ammo: 2, placed: true, fuseTime: 5,
    expl: { r: 50, dmg: 75, push: 560 }, fire: place,
  },
  {
    id: 'mine', panel: [4,1], name: 'Mine', icon: '⚙️', ammo: 2, placed: true,
    expl: { r: 30, dmg: 50, push: 360 }, fire: place,
  },
  {
    id: 'sheep', panel: [4,2], name: 'Sheep', icon: '🐑', ammo: 2, placed: true, fuseTime: 6,
    expl: { r: 46, dmg: 75, push: 500 }, fire: place,
    onFireDown(g, w) {
      const sheep = g.objects.find((o) => o.kind === 'sheep' && o.owner === w.id);
      if (!sheep) return false;
      sheep.fuse = 0; // second press detonates
      return true;
    },
  },
  {
    id: 'airstrike', panel: [5,0], strike: true, crateAmount: 1, name: 'Air Strike', icon: '✈️', ammo: 1, target: true,
    expl: { r: 28, dmg: 35, push: 340 },
    useAt: (g, w, wd, x) => g.airStrike(w, x),
  },
  {
    id: 'shotgun', panel: [2,0], crate: 0, name: 'Shotgun', icon: '🔫', ammo: -1, aim: true, hitscan: true, shots: 2,
    dmg: 25, spread: 0.012, push: 160,
    fire(g, w, wd) {
      const t = g.turn;
      g.shootRay(w, wd);
      t.shots++;
      t.cool = 0.55;
      return t.shots >= wd.shots ? undefined : 'partial';
    },
  },
  {
    id: 'uzi', panel: [2,2], name: 'Uzi', icon: '🔸', ammo: 3, aim: true, hitscan: true, burst: 16,
    dmg: 3, spread: 0.07, push: 40,
    fire(g, w, wd) {
      g.spend(wd.id);
      g.startBurst(wd.burst, 0.07, () => g.shootRay(w, wd));
      return 'partial';
    },
  },
  { id: 'punch', panel: [3,0], crate: 0, name: 'Fire Punch', icon: '👊', ammo: -1, melee: true, dmg: 30, fire: (g, w, wd) => g.punch(w, wd) },
  {
    id: 'girder', panel: [6,2], rotates: true, name: 'Girder', icon: '📏', ammo: 4, target: true, noEnd: true,
    useAt: (g, w, wd, x, y) => g.placeGirder(w, x, y),
  },
  {
    id: 'rope', panel: [7,0], crate: 0, name: 'Ninja Rope', icon: '🪝', ammo: -1, aim: true, rope: true, noEnd: true,
    fire: (g, w) => g.shootRope(w),
  },
  {
    id: 'teleport', panel: [7,3], name: 'Teleport', icon: '🌀', ammo: 2, target: true, noEnd: true,
    useAt: (g, w, wd, x, y) => g.teleport(w, x, y),
  },
  {
    id: 'skip', panel: [11,0], crate: 0, name: 'Skip Go', icon: '⏭️', ammo: -1, instant: true,
    onSelect(g) {
      g.turn.time = 0;
      g.turn.fired = true;
    },
  },
  {
    id: 'surrender', panel: [11,1], crate: 0, name: 'Surrender', icon: '🏳️', ammo: -1, instant: true,
    onSelect: (g) => g.surrender(g.turn.team),
  },
]);
