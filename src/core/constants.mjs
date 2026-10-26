export const DT = 1 / 60; // fixed simulation step (s)
export const GRAVITY = 520; // px/s²
export const WORM_R = 6;
export const WIND_ACC = 70; // px/s² at full wind
export const AIM_RATE = 1.25; // rad/s
export const AIM_MAX = 1.5; // rad, max up/down aim
export const CHARGE_TIME = 1.5; // s from 0 to full power
export const WALK_SPEED = 52; // px/s
export const FALL_SAFE_SPEED = 340; // px/s impact speed below which a fall is harmless (~110 px drop)
export const KNOCKBACK = 2.1; // explosion push on worms is multiplied by this, so hits send them flying
export const KNOCK_LIFT = 0.45; // share of the push that is added upwards, for a nice arc
export const KNOCK_MAX = 760; // px/s cap, so even a Holy Hand Grenade does not throw a worm across the whole map

export const DEFAULT_SETTINGS = {
  worldW: 2400,
  worldH: 960,
  waterMargin: 64, // water surface is this far above the world bottom
  wormsPerTeam: 4,
  wormHp: 100,
  turnTime: 60,
  retreatTime: 3,
  suddenDeathRound: 12,
  crateChance: 0.5,
  layout: 'islands', // a LAYOUTS id from maps.mjs, or 'random' (picked from the seed)
};

export const TEAM_COLORS = ['#3d8bff', '#ff4d4d', '#3fcf5b', '#ffd23f'];

export const WORM_NAMES = [
  'Clagnut', 'Spadge', 'Boggy', 'Kenny', 'Sully', 'Wobble', 'Gus', 'Nelly', 'Dougal', 'Pip',
  'Moxie', 'Zed', 'Bertie', 'Flump', 'Squirt', 'Tubs', 'Nibbles', 'Mortimer', 'Gloop', 'Stan',
  'Fergus', 'Biscuit', 'Wiggs', 'Doris',
];
