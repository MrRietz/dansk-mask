// Client-side drawing hooks for custom object kinds.
//   registerDrawer(kind, (ctx, obj, r) => {...})   r = Renderer (r.t = time, r.particles, r.game ...)
//   registerHeld(weaponId, (ctx, worm, r) => {...}) sprite in the active worm's hands (origin = worm centre,
//                                                    already flipped for facing and rotated to the aim angle)
//   registerFx(eventType, (e, r) => {...})          react to a game event (particles, sound, messages)
export const DRAWERS = {};
export const HELD = {};
export const FX = {};
export const registerDrawer = (kind, fn) => (DRAWERS[kind] = fn);
export const registerHeld = (id, fn) => (HELD[id] = fn);
export const registerFx = (type, fn) => (FX[type] = fn);
