// Registries that let weapon packs plug into the game without touching game.mjs.
// See docs/EXTENDING.md for the hook contract.

export const WEAPONS = {};
export const WEAPON_ORDER = [];

// Weapon definition (data + optional hooks):
//   id, name, icon (emoji), ammo (-1 = unlimited), panel: [col, row] (W:A weapon panel position)
//   charge:true  hold Space to charge, fire on release      target:true  left-click picks a point
//   aim:true     show crosshair                             fuse:true    1-5 sets fuse (defFuse)
//   noEnd:true   using it does not end the turn             instant:true selecting it acts at once (onSelect)
//   fire(game, worm, wd, {power})        -> false = cancelled, 'partial' = used but turn goes on, else normal
//   useAt(game, worm, wd, x, y)          -> true when used (target weapons)
//   onSelect(game, worm, turn)           when picked from the panel
//   onFireDown(game, worm, turn)         return true to swallow the Space press (e.g. re-trigger a sheep)
//   onFireUp(game, worm, turn)           Space released (held weapons such as flamethrower)
//   tick(game, worm, turn)               every tick while this weapon is selected during the turn
//   drawHeld(ctx, worm)                  optional custom sprite in the worm's hands
export function registerWeapons(defs) {
  for (const d of defs) {
    if (!WEAPONS[d.id]) WEAPON_ORDER.push(d.id);
    WEAPONS[d.id] = d;
  }
}

// Custom object kinds (projectiles, walkers, strikes ...):
//   update(game, obj)     per tick; set obj.dead = true to remove
//   passive(obj) -> true  when the object does not hold up the end of the turn (idle mine, grave)
//   draw(ctx, obj, r)     client drawing (registered separately via registerDrawer in the client)
export const OBJECT_TYPES = {};
export function registerObjectType(kind, def) {
  OBJECT_TYPES[kind] = def;
}

// Turn hooks: { onTurnStart(game), onTurnEnd(game), onSettled(game) }
export const TURN_HOOKS = [];
export function registerTurnHook(h) {
  TURN_HOOKS.push(h);
}

export function startingAmmo() {
  const a = {};
  for (const id of WEAPON_ORDER) a[id] = WEAPONS[id].ammo;
  return a;
}

// Damage and knockback from an explosion at distance `dist` from a body of radius `r`.
export function blast(ex, dist, r) {
  const d = Math.max(0, dist - r);
  if (d >= ex.r) return null;
  const f = 1 - d / ex.r;
  return { dmg: Math.max(1, Math.round(ex.dmg * f)), push: ex.push * f, f };
}
