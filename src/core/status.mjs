// Shared worm status effects used by many weapons: poison (skunk, suicide bomber, nuclear test)
// and freeze. Registered as a turn hook; weapon packs only set the fields via Game helpers:
//   game.sicken(worm, amount)  -> worm.poison += amount (hp lost at the end of each turn, never lethal)
//   game.freezeTeam(teamId)    -> that team's worms take no damage until their next turn starts
import { registerTurnHook } from './registry.mjs';

registerTurnHook({
  // After everything has settled, sick worms lose hp (poison never kills: it stops at 1 hp).
  onSettled(game) {
    for (const w of game.worms) {
      if (!w.alive || w.poison <= 0) continue;
      const loss = Math.min(w.poison, Math.max(0, w.hp - 1));
      if (loss > 0) {
        w.hp -= loss;
        game.emit('damage', { id: w.id, x: w.x, y: w.y, amount: loss, team: w.team, poison: true });
      }
    }
  },
  // A team's freeze ends when its turn comes around again.
  onTurnStart(game) {
    for (const w of game.worms) if (w.team === game.turn.team) w.frozen = false;
  },
});
