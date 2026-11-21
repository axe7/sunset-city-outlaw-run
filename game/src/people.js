// The people of Sunset City: pedestrians strolling the sidewalks and the
// boardwalk, and — when a mission calls for them — Neon Jackal rivals with
// guns. Pedestrians wander between sidewalk corners, flee from danger and
// dive out of the way of bad driving; rivals keep their distance and shoot.

import { PITCH, ROAD_HALF, CITY_W, BEACH_W, WORLD_W, WORLD_H, PLAYER_RADIUS } from './config.js';
import { clamp, turnToward } from './rng.js';
import { resolveCircle, surfaceAt } from './city.js';

const SKIN = ['#f2c894', '#c98a5e', '#8a5a3b', '#6e4530', '#ffd9b3'];
const SHIRTS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f4f1ea', '#ff8c42', '#9b5de5', '#00bbf9'];
const PANTS = ['#33415c', '#5c677d', '#7f5539', '#2a9d8f', '#e0e1dd'];

export function makePed(rng, x, y, opts = {}) {
  return {
    x, y,
    angle: rng.range(0, Math.PI * 2),
    speed: 0,
    walkSpeed: rng.range(38, 62),
    state: opts.state ?? 'walk', // walk | flee | rival | down
    health: opts.health ?? 30,
    isRival: opts.state === 'rival',
    shirt: opts.shirt ?? rng.pick(SHIRTS),
    pants: rng.pick(PANTS),
    skin: rng.pick(SKIN),
    target: null,
    thinkCd: rng.range(0, 1),
    fleeTime: 0,
    fireCd: rng.range(0.6, 1.6),
    downTime: 0,
    phase: rng.range(0, Math.PI * 2), // walk-cycle bob
  };
}

/** A stroll target: a sidewalk corner, a plaza edge or the boardwalk. */
function pickStrollTarget(city, rng, ped) {
  const roll = rng.next();
  if (roll < 0.18) {
    // The boardwalk and the sand.
    return { x: CITY_W + rng.range(46, BEACH_W - 16), y: rng.range(30, WORLD_H - 30) };
  }
  const i = clamp(Math.floor(ped.x / PITCH) + rng.int(-2, 2), 0, 9);
  const j = clamp(Math.floor(ped.y / PITCH) + rng.int(-2, 2), 0, 8);
  const bx = i * PITCH;
  const by = j * PITCH;
  const side = rng.int(0, 3);
  const along = rng.range(ROAD_HALF + 6, PITCH - ROAD_HALF - 6);
  if (side === 0) return { x: bx + along, y: by + ROAD_HALF - 12 };
  if (side === 1) return { x: bx + along, y: by + PITCH - ROAD_HALF + 12 };
  if (side === 2) return { x: bx + ROAD_HALF - 12, y: by + along };
  return { x: bx + PITCH - ROAD_HALF + 12, y: by + along };
}

export function spawnPeds(city, rng, count, awayFrom) {
  const peds = [];
  for (let k = 0; k < count; k += 1) {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 20; tries += 1) {
      const ped = { x: rng.range(40, CITY_W + BEACH_W - 20), y: rng.range(40, WORLD_H - 40) };
      const s = surfaceAt(city, ped.x, ped.y);
      if (s === 'building' || s === 'water') continue;
      x = ped.x;
      y = ped.y;
      if (!awayFrom || (x - awayFrom.x) ** 2 + (y - awayFrom.y) ** 2 > 200 * 200) break;
    }
    peds.push(makePed(rng, x, y));
  }
  return peds;
}

/** Rough line of sight: sample the segment for a building in the way. */
export function hasLineOfSight(city, ax, ay, bx, by) {
  const steps = 10;
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (surfaceAt(city, ax + (bx - ax) * t, ay + (by - ay) * t) === 'building') return false;
  }
  return true;
}

/**
 * Move one person for a step. `world` carries {player, threat}.
 * Returns {fired:true} when a rival shoots at the player this step.
 */
export function updatePed(city, ped, dt, world, rng) {
  const events = {};
  if (ped.state === 'down') {
    ped.downTime += dt;
    return events;
  }
  ped.thinkCd -= dt;
  const player = world.player;
  const dxp = player.x - ped.x;
  const dyp = player.y - ped.y;
  const distPlayer = Math.hypot(dxp, dyp);

  // Danger sense: gunfire, a crash or a fast car nearby sends people running.
  if (ped.state === 'walk' && world.threat && world.threat.ttl > 0) {
    const d2 = (ped.x - world.threat.x) ** 2 + (ped.y - world.threat.y) ** 2;
    if (d2 < 210 * 210) {
      ped.state = 'flee';
      ped.fleeTime = rng.range(1.6, 3.2);
    }
  }

  let desired = null;
  let speed = ped.walkSpeed;

  if (ped.state === 'flee') {
    ped.fleeTime -= dt;
    const from = world.threat ?? player;
    desired = Math.atan2(ped.y - from.y, ped.x - from.x);
    speed = 196;
    if (ped.fleeTime <= 0) {
      ped.state = 'walk';
      ped.target = null;
    }
  } else if (ped.state === 'rival') {
    // Keep a gunman's distance, strafe slowly, shoot on a cooldown.
    if (distPlayer > 170) desired = Math.atan2(dyp, dxp);
    else if (distPlayer < 95) desired = Math.atan2(-dyp, -dxp);
    else desired = Math.atan2(dyp, dxp) + Math.PI / 2; // circle the player
    speed = distPlayer > 170 || distPlayer < 95 ? 105 : 42;
    ped.fireCd -= dt;
    if (distPlayer < 300 && ped.fireCd <= 0 && hasLineOfSight(city, ped.x, ped.y, player.x, player.y)) {
      ped.fireCd = rng.range(0.85, 1.5);
      events.fired = true;
    }
    ped.angle = turnToward(ped.angle, Math.atan2(dyp, dxp), 6 * dt);
  } else {
    // A stroll: pick a corner, amble to it, pick another.
    if (!ped.target || (ped.x - ped.target.x) ** 2 + (ped.y - ped.target.y) ** 2 < 18 * 18) {
      if (ped.thinkCd <= 0) {
        ped.target = pickStrollTarget(city, rng, ped);
        ped.thinkCd = rng.range(0.5, 2);
      }
    }
    if (ped.target) desired = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
  }

  if (desired !== null) {
    ped.angle = turnToward(ped.angle, desired, 5.2 * dt);
    ped.speed = speed;
  } else {
    ped.speed = 0;
  }
  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  ped.phase += dt * (ped.speed > 10 ? 11 : 2);
  resolveCircle(city, ped, PLAYER_RADIUS);
  return events;
}
