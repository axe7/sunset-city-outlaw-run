// Sunset City: Outlaw Run — tuning constants, palette and world geometry.
// Everything the other modules need to agree on lives here: the size of the
// city grid, how fast heat builds into wanted stars, and the sunset colours
// the whole game is painted in.

// ---- World geometry -------------------------------------------------------
// The city is a grid of blocks. Roads run along the grid lines, blocks sit
// between them, and the east edge of the map is a beach and the ocean.
export const PITCH = 256;            // distance between neighbouring road centres
export const ROAD_HALF = 42;        // half the width of a road
export const COLS = 10;              // land blocks across (west to east)
export const ROWS = 9;               // blocks down (north to south)
export const CITY_W = COLS * PITCH;  // east edge of the street grid
export const BEACH_W = 250;          // sand between the last road and the water
export const WORLD_W = CITY_W + BEACH_W + 330; // + the ocean strip
export const WORLD_H = ROWS * PITCH;

// ---- Player ---------------------------------------------------------------
export const PLAYER_RADIUS = 9;
export const PLAYER_WALK = 118;      // px per second on foot
export const PLAYER_SPRINT = 178;
export const PLAYER_MAX_HEALTH = 100;

// ---- Wanted system --------------------------------------------------------
// Crimes add heat. Every HEAT_PER_STAR points is one star, up to five.
// Heat drains while nobody in uniform can see the player.
export const HEAT_PER_STAR = 100;
export const MAX_STARS = 5;
export const HEAT_DECAY_HIDDEN = 9;  // per second while out of sight
export const HEAT_DECAY_SEEN = 1.2;  // per second while a cop can see you
export const HEAT_THEFT = 110;
export const HEAT_HIT_CAR = 55;
export const HEAT_HIT_PED = 130;
export const HEAT_SHOT = 45;
export const HEAT_ROBBERY = 80;
export const BUST_RANGE = 46;        // a cop this close starts the bust meter
export const BUST_TIME = 2.6;        // seconds of pressure to get busted

// ---- Money ----------------------------------------------------------------
export const PRICE_RESPRAY = 200;    // Sunset Customs: repair + lose the heat
export const PRICE_FOOD = 25;
export const REEL_VALUE = 50;        // each golden reel collectible
export const REEL_COUNT = 12;

// ---- The sunset palette ---------------------------------------------------
export const PALETTE = {
  asphalt: '#4a4048',
  asphaltEdge: '#3b333b',
  sidewalk: '#cbb9a0',
  blockGround: '#b7a58c',
  grass: '#7fae5c',
  sand: '#f0d089',
  water: '#2e7ea6',
  waterDeep: '#256b8f',
  skyGlow: 'rgba(255, 138, 76, 0.10)',
  sunCore: '#ffd98a',
  buildingSides: ['#8a5a68', '#7c4f63', '#93596b', '#6f4a5e'],
  roofs: ['#e8b4a0', '#d98e73', '#f2c894', '#c97b84', '#e5a58f', '#b7d3c5', '#f0e0b6', '#dba08a'],
  palmTrunk: '#8a6844',
  palmLeaf: '#3e8e5a',
};

// Building names painted on a few roofs, all invented for Sunset City.
export const ROOF_SIGNS = [
  'HOTEL SOL', 'CAFE MAR', 'TACOS LUNA', 'DISCO FUEGO', 'BANCO SUR',
  'CINE ORO', 'GYM BRASA', 'PIZZA NONA', 'CLUB NEON', 'MERCADO',
];

// Car models: name, size, top speed, acceleration, handling, colours.
// Names are Sunset City's own brands — Vireo, Paloma, Burro, Cielo, Tortuga.
export const CAR_MODELS = [
  { name: 'Vireo GT', w: 34, h: 17, top: 305, accel: 240, grip: 3.4, colors: ['#e23b3b', '#f2a007', '#2070d8', '#22b573'] },
  { name: 'Paloma', w: 36, h: 18, top: 235, accel: 175, grip: 3.0, colors: ['#d8d8dc', '#5a6b7a', '#8a2f3a', '#2f5d50'] },
  { name: 'Burro Van', w: 40, h: 19, top: 195, accel: 140, grip: 2.6, colors: ['#e8e3d5', '#7a8a99', '#c96f2e', '#4a6741'] },
  { name: 'Cielo', w: 34, h: 17, top: 265, accel: 205, grip: 3.2, colors: ['#ff7bac', '#ffd23e', '#39c2d7', '#f4f1ea'] },
  { name: 'Tortuga', w: 30, h: 16, top: 205, accel: 155, grip: 3.0, colors: ['#9bc53d', '#fa7921', '#6c5b7b', '#a8dadc'] },
];

export const SAVE_KEY = 'sunset-city-outlaw-run-save-v1';
