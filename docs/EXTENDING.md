# Extending Dansk Mask: adding weapons

Target: all ~60 weapons of Worms Armageddon, in 12 panel groups (F1–F12, 5–6 weapons each).
A weapon is **data + hooks** registered in a pack file; custom world objects register an
update function (core) and a drawer (client). Nothing outside your own pack files needs editing.

## Files you own per pack (`<pack>` = projectiles | guns | walkers | strikes | tools)

| File | Purpose |
| --- | --- |
| `src/core/weapons/<pack>.mjs` | `registerWeapons([...])` and `registerObjectType(kind, {...})` |
| `src/client/draw/<pack>.mjs` | `registerDrawer(kind, fn)`, `registerHeld(weaponId, fn)`, `registerFx(eventType, fn)` |
| `test/<pack>.test.mjs` | node:test tests (run: `node --test test/<pack>.test.mjs`) |

Do **not** edit `game.mjs`, `registry.mjs`, `renderer.mjs`, `input.mjs`, `main.mjs`, `ai.mjs` or another
pack. If you really need an engine change, make the smallest possible addition, say so in your
final report and keep existing tests green.

## Weapon definition (see `registry.mjs` for the full hook list)

```js
{ id: 'homing', name: 'Homing Missile', icon: '🎯', ammo: 2, panel: [0, 1],  // [column F-key 0..11, row 0..5]
  charge: true, aim: true, target: true,        // flags
  speed: 700, expl: { r: 32, dmg: 40, push: 420 },
  useAt(g, w, wd, x, y) { g.turn.marker = { x, y }; return false; },   // false = nothing spent
  fire(g, w, wd, { power }) { ... g.spawn({ kind: 'homing', ... }); } }
```

Flags: `charge` (hold Space, fire on release), `target` (left-click gives x,y), `aim` (crosshair),
`fuse` (keys 1–5 set `turn.fuse`), `bounceable` (turn.bounce 0/1/2), `noEnd` (does not end the turn),
`instant` + `onSelect` (acts when picked), `crate` (crate weight; default 1, 0 = never, super weapons
0.05–0.1), `crateAmount`, `ammo` (-1 = unlimited; super weapons start at **0** and come from crates).
`rotates` (Space/R rotate a ghost, like girders: `turn.girder` 0..7 in 22.5° steps), `strike` (Left/Right
choose the strike direction → `turn.strikeDir` = ±1, 0 = unset: use the worm's facing).
Panel slots are fixed in the table in `docs/PANEL.md`; use exactly the slot given to you.
`fire` returning `false` cancels, `'partial'` = used but the attack goes on, otherwise ammo is spent and
the turn ends (unless `noEnd`).

## Engine API used by hooks (`g` = Game)

State: `g.turn` (`weapon, fuse, bounce, power, input{l,r,u,d}, marker, strikeDir, girder, fired, time`),
`g.worms`, `g.objects`, `g.terrain` (`solid, hitCircle, carveCircle, fillCircle, raycast, surfaceY`),
`g.wind` (-1..1), `g.waterY`, `g.rng` (seeded; use it for gameplay randomness), `g.time`.

Actions: `g.spawn(obj)` (adds, assigns id), `g.explode(x, y, {r, dmg, push}, {owner})`, `g.hurt(worm, dmg, ownerId)`,
`g.knock(worm)` (puts a worm in the air after you changed vx/vy), `g.emit(type, data)`, `g.spend(id)`,
`g.finishShot()`, `g.sicken(worm, n)` (poison), `g.freezeTeam(team)`, `g.launchProjectile`, `g.shootRay`,
`g.place`, `g.placeGirder`, `g.teleport`, `g.airStrike`, `g.startBurst(count, interval, fn, onEnd)`,
`g.wormAt(x, y, excludeId, pad)`. `blast(ex, dist, r)` from `registry.mjs` gives damage/knockback.
Physics (`physics.mjs`): `moveBody(terrain, body, dt, bounce, friction)` (apply gravity yourself:
`b.vy += GRAVITY * DT`), `stepRocket`, `groundStep`, `snapDown`, `unstick`, `launchVector`.
Shared: `objects/fire.mjs` → `spawnFire(g, x, y, opts)`.

Worm fields: `x,y,vx,vy,r,hp,dir,aim,state ('ground'|'air'|'rope'),alive,poison,frozen,custom`.
`worm.custom = { pre(g, w) { ...return true to skip normal physics } }` lets a tool (jet pack, drill)
take over a worm's movement; it is cleared when the turn ends.

## Custom objects

```js
registerObjectType('homing', {
  update(g, o) { /* per tick; o.dead = true removes it */ },
  passive: (o) => false,   // true = does not hold up the end of the turn
  noBounds: false,         // true = not removed when outside the map (planes, meteors)
});
```
Every non-passive object keeps the game in the "resolve" phase until it is gone, so make sure each
object eventually dies (fuse, lifetime, water, out of bounds).

## Client

`registerDrawer('homing', (ctx, o, r) => {...})` draws in world coordinates. `registerHeld(id, (ctx, w, r) => ...)`
draws the weapon in the worm's hands (+x = aim direction). `registerFx(type, (e, r) => ...)` reacts to
`g.emit(type, ...)` events (spawn particles with `r.particles.push`, use `r.audio.play(name)`, `r.say(text, color)`).

## Rules of thumb

* Keep everything deterministic given `g.rng` (no `Math.random` in `src/core`).
* Damage numbers: bazooka 50 max at the centre is the yardstick. Super weapons are rare crate-only items.
* Tune weapons by feel: a worm has 100 hp, a bazooka crater radius is 30 px.
* Every weapon needs a test that fires it in a real `Game` and checks the observable effect.
