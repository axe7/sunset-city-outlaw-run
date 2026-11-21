// Sunset City itself: a procedural grid of sun-bleached blocks between the
// downtown grid and the beach. buildCity grows the whole map from a seed —
// buildings with sunset roofs, palm trees, parks, parking lots, food stands
// and the four landmarks the story runs through (Rosa's Diner, Sunset
// Customs garage, the police station and the hospital) — and answers the
// questions every other system asks: what surface is this, and what solid
// thing is in the way.

import {
  PITCH, ROAD_HALF, COLS, ROWS, CITY_W, BEACH_W, WORLD_W, WORLD_H,
  PALETTE, ROOF_SIGNS, REEL_COUNT,
} from './config.js';
import { clamp } from './rng.js';

export const BLOCK = PITCH - ROAD_HALF * 2;

// Fixed blocks for the landmarks, as [column, row] into the grid.
const LANDMARK_BLOCKS = {
  diner: [2, 4],
  garage: [5, 2],
  police: [7, 6],
  hospital: [3, 7],
};

export function blockRect(i, j) {
  return { x: i * PITCH + ROAD_HALF, y: j * PITCH + ROAD_HALF, w: BLOCK, h: BLOCK };
}

/** The point at the centre of block (i, j). */
export function blockCenter(i, j) {
  return { x: i * PITCH + PITCH / 2, y: j * PITCH + PITCH / 2 };
}

function addBuilding(city, rng, x, y, w, h, opts = {}) {
  const building = {
    x, y, w, h,
    height: opts.height ?? rng.range(14, 58),
    roof: opts.roof ?? rng.pick(PALETTE.roofs),
    side: opts.side ?? rng.pick(PALETTE.buildingSides),
    sign: opts.sign ?? null,
    landmark: opts.landmark ?? null,
  };
  city.buildings.push(building);
  return building;
}

function growBuildingBlock(city, rng, i, j) {
  const r = blockRect(i, j);
  const margin = 12;
  const layout = rng.int(0, 2);
  if (layout === 0) {
    // One tower on a plinth.
    addBuilding(city, rng, r.x + margin, r.y + margin, r.w - margin * 2, r.h - margin * 2, { height: rng.range(40, 74) });
  } else if (layout === 1) {
    // Two slabs side by side.
    const w = (r.w - margin * 3) / 2;
    addBuilding(city, rng, r.x + margin, r.y + margin, w, r.h - margin * 2);
    addBuilding(city, rng, r.x + margin * 2 + w, r.y + margin, w, r.h - margin * 2);
  } else {
    // Four low blocks around a courtyard.
    const w = (r.w - margin * 3) / 2;
    const h = (r.h - margin * 3) / 2;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      if (rng.chance(0.85)) {
        addBuilding(city, rng, r.x + margin + dx * (w + margin), r.y + margin + dy * (h + margin), w, h, { height: rng.range(12, 34) });
      }
    }
  }
  // A chance of a painted roof sign, the kind you read from a helicopter.
  if (rng.chance(0.16)) {
    const b = city.buildings[city.buildings.length - 1];
    if (b && !b.sign) b.sign = rng.pick(ROOF_SIGNS);
  }
}

function growParkBlock(city, rng, i, j) {
  const r = blockRect(i, j);
  city.parks.push({ ...r });
  for (let k = 0; k < 9; k += 1) {
    city.trees.push({ x: r.x + rng.range(14, r.w - 14), y: r.y + rng.range(14, r.h - 14), s: rng.range(0.8, 1.3) });
  }
}

function growParkingBlock(city, rng, i, j) {
  const r = blockRect(i, j);
  city.parkingLots.push({ ...r });
  // Two rows of parking bays along the lot; the game fills some with cars.
  for (const rowY of [r.y + 30, r.y + r.h - 30]) {
    for (let x = r.x + 26; x < r.x + r.w - 10; x += 34) {
      city.parkingSpots.push({ x, y: rowY, angle: rowY < r.y + r.h / 2 ? Math.PI / 2 : -Math.PI / 2 });
    }
  }
}

function growPlazaBlock(city, rng, i, j) {
  const r = blockRect(i, j);
  city.plazas.push({ ...r });
  const stands = rng.int(2, 3);
  for (let k = 0; k < stands; k += 1) {
    city.stands.push({
      x: r.x + 24 + k * ((r.w - 48) / Math.max(1, stands - 1)),
      y: r.y + r.h / 2 + rng.range(-26, 26),
      kind: rng.pick(['tacos', 'fruit', 'coffee']),
    });
  }
  for (let k = 0; k < 4; k += 1) {
    city.trees.push({ x: r.x + rng.range(12, r.w - 12), y: r.y + rng.range(12, r.h - 12), s: rng.range(0.8, 1.2) });
  }
}

function growLandmarkBlock(city, rng, kind, i, j) {
  const r = blockRect(i, j);
  // One wide landmark building across the back of the block, a forecourt in
  // front of it where the player walks and drives up.
  const signs = { diner: "ROSA'S DINER", garage: 'SUNSET CUSTOMS', police: 'POLICE', hospital: 'HOSPITAL' };
  const roofs = { diner: '#e2574c', garage: '#39c2d7', police: '#5a6b7a', hospital: '#f4f1ea' };
  const building = addBuilding(city, rng, r.x + 8, r.y + 8, r.w - 16, 62, {
    height: 22, roof: roofs[kind], sign: signs[kind], landmark: kind,
  });
  const zone = { x: r.x + 8, y: r.y + 86, w: r.w - 16, h: r.h - 94, kind, building };
  city.landmarks[kind] = zone;
  if (kind === 'diner' || kind === 'hospital') {
    for (let k = 0; k < 3; k += 1) {
      city.trees.push({ x: r.x + 18 + k * 60, y: r.y + r.h - 16, s: 1 });
    }
  }
}

/** Build the whole city from a seed. */
export function buildCity(rng) {
  const city = {
    buildings: [],
    trees: [],
    stands: [],
    parks: [],
    plazas: [],
    parkingLots: [],
    parkingSpots: [],
    landmarks: {},
    reels: [],
    pier: null,
  };

  const landmarkAt = new Map();
  for (const [kind, [i, j]] of Object.entries(LANDMARK_BLOCKS)) landmarkAt.set(`${i},${j}`, kind);

  for (let i = 0; i < COLS; i += 1) {
    for (let j = 0; j < ROWS; j += 1) {
      const kind = landmarkAt.get(`${i},${j}`);
      if (kind) {
        growLandmarkBlock(city, rng, kind, i, j);
        continue;
      }
      const roll = rng.next();
      if (roll < 0.58) growBuildingBlock(city, rng, i, j);
      else if (roll < 0.72) growParkBlock(city, rng, i, j);
      else if (roll < 0.86) growParkingBlock(city, rng, i, j);
      else growPlazaBlock(city, rng, i, j);
    }
  }

  // Palms along the boardwalk and scattered on the sand.
  for (let y = 60; y < WORLD_H - 40; y += rng.range(90, 150)) {
    city.trees.push({ x: CITY_W + ROAD_HALF + rng.range(8, 30), y, s: rng.range(0.9, 1.4) });
  }
  for (let k = 0; k < 12; k += 1) {
    city.trees.push({ x: CITY_W + rng.range(70, BEACH_W - 20), y: rng.range(40, WORLD_H - 40), s: rng.range(0.8, 1.3) });
  }

  // The pier: a wooden deck reaching into the ocean at the middle row.
  const pierY = 4 * PITCH + PITCH / 2;
  city.pier = { x: CITY_W + BEACH_W - 6, y: pierY - 34, w: 250, h: 68 };

  // Golden reels — film canisters lost by a movie crew, worth cash.
  const reelSpots = [];
  for (let k = 0; k < 40 && reelSpots.length < REEL_COUNT; k += 1) {
    const x = rng.range(60, CITY_W + BEACH_W - 30);
    const y = rng.range(60, WORLD_H - 60);
    if (surfaceAt(city, x, y) === 'building') continue;
    if (reelSpots.some((s) => (s.x - x) ** 2 + (s.y - y) ** 2 < 300 * 300)) continue;
    reelSpots.push({ x, y, taken: false });
  }
  city.reels = reelSpots;

  return city;
}

/** What is under a point: road, sidewalk/block ground, grass, sand, water, pier or building. */
export function surfaceAt(city, x, y) {
  if (x < 0 || y < 0 || x > WORLD_W || y > WORLD_H) return 'water';
  if (city.pier && x >= city.pier.x && x <= city.pier.x + city.pier.w && y >= city.pier.y && y <= city.pier.y + city.pier.h) return 'pier';
  if (x > CITY_W + BEACH_W) return 'water';
  if (x > CITY_W + ROAD_HALF) return 'sand';
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return 'building';
  }
  const lx = ((x % PITCH) + PITCH) % PITCH;
  const ly = ((y % PITCH) + PITCH) % PITCH;
  if (lx < ROAD_HALF || lx > PITCH - ROAD_HALF || ly < ROAD_HALF || ly > PITCH - ROAD_HALF) return 'road';
  for (const p of city.parks) {
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return 'grass';
  }
  return 'sidewalk';
}

/** True when the point sits on a road (either axis within the road band). */
export function isRoad(x, y) {
  if (x > CITY_W + ROAD_HALF) return false;
  const lx = ((x % PITCH) + PITCH) % PITCH;
  const ly = ((y % PITCH) + PITCH) % PITCH;
  return lx < ROAD_HALF || lx > PITCH - ROAD_HALF || ly < ROAD_HALF || ly > PITCH - ROAD_HALF;
}

/** The centre line coordinate of the road nearest to v along one axis. */
export function roadCenter(v, max) {
  return clamp(Math.round(v / PITCH) * PITCH, 0, max);
}

/**
 * Push a circle (obj with x, y) out of every building and back inside the
 * world. Returns true when it hit something. Cars and people both use this,
 * which keeps the physics in one place.
 */
export function resolveCircle(city, obj, radius) {
  let hit = false;
  // The ocean is solid unless the pier carries you over it.
  const waterX = CITY_W + BEACH_W;
  const onPier = city.pier
    && obj.x > city.pier.x - radius && obj.x < city.pier.x + city.pier.w + radius
    && obj.y > city.pier.y - radius && obj.y < city.pier.y + city.pier.h + radius;
  if (obj.x + radius > waterX && !onPier) {
    obj.x = waterX - radius;
    hit = true;
  }
  obj.x = clamp(obj.x, radius, WORLD_W - radius);
  obj.y = clamp(obj.y, radius, WORLD_H - radius);
  for (const b of city.buildings) {
    const nx = clamp(obj.x, b.x, b.x + b.w);
    const ny = clamp(obj.y, b.y, b.y + b.h);
    const dx = obj.x - nx;
    const dy = obj.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      obj.x = nx + (dx / d) * radius;
      obj.y = ny + (dy / d) * radius;
    } else {
      // Centre inside the box: push out along the smallest exit.
      const left = obj.x - b.x;
      const right = b.x + b.w - obj.x;
      const top = obj.y - b.y;
      const bottom = b.y + b.h - obj.y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) obj.x = b.x - radius;
      else if (min === right) obj.x = b.x + b.w + radius;
      else if (min === top) obj.y = b.y - radius;
      else obj.y = b.y + b.h + radius;
    }
  }
  return hit;
}

/** True when a circle at (x, y) would overlap any building. */
export function circleHitsBuilding(city, x, y, radius) {
  for (const b of city.buildings) {
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    const dx = x - nx;
    const dy = y - ny;
    if (dx * dx + dy * dy < radius * radius) return true;
  }
  return false;
}

/** A random point on a road, used to spawn traffic away from the player. */
export function randomRoadPoint(rng, awayFrom = null, minDist = 0) {
  for (let tries = 0; tries < 24; tries += 1) {
    const vertical = rng.chance(0.5);
    const line = rng.int(0, vertical ? COLS : ROWS) * PITCH;
    const along = rng.range(30, (vertical ? WORLD_H : CITY_W) - 30);
    const x = vertical ? line : along;
    const y = vertical ? along : line;
    if (awayFrom && (x - awayFrom.x) ** 2 + (y - awayFrom.y) ** 2 < minDist * minDist) continue;
    return { x, y, vertical };
  }
  return { x: PITCH, y: PITCH, vertical: true };
}
