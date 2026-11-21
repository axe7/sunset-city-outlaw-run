// The law: the wanted system (heat, stars, going unseen) and the police
// drivers who answer it. Heat rises with witnessed crime and drains while
// no officer can see the player; the star count follows the heat. Police
// cars hunt the player's position directly — they are not lane-bound like
// traffic — and lean on the car or the man until the bust meter fills.

import { HEAT_PER_STAR, MAX_STARS, HEAT_DECAY_HIDDEN, HEAT_DECAY_SEEN } from './config.js';
import { clamp, angleDelta } from './rng.js';
import { makeCar, stepCar } from './vehicles.js';
import { circleHitsBuilding, randomRoadPoint } from './city.js';

export function createWanted() {
  return {
    heat: 0,
    stars: 0,
    seenNow: false,     // a cop has eyes on the player this frame
    timeSinceCrime: 99, // seconds since the last witnessed crime
    bustMeter: 0,       // 0..1, fills under police pressure at low speed
  };
}

export function addHeat(wanted, amount) {
  wanted.heat = clamp(wanted.heat + amount, 0, HEAT_PER_STAR * MAX_STARS);
  wanted.timeSinceCrime = 0;
}

/** Advance heat and stars. `seen` = any officer currently sees the player. */
export function updateWanted(wanted, dt, seen) {
  wanted.seenNow = seen;
  wanted.timeSinceCrime += dt;
  if (wanted.heat > 0) {
    const decay = seen ? HEAT_DECAY_SEEN : HEAT_DECAY_HIDDEN;
    // Heat only starts draining a few seconds after the last crime.
    if (wanted.timeSinceCrime > 3) wanted.heat = Math.max(0, wanted.heat - decay * dt);
  }
  wanted.stars = wanted.heat <= 0 ? 0 : Math.min(MAX_STARS, Math.ceil(wanted.heat / HEAT_PER_STAR));
}

/** How many police cars a star level sends after the player. */
export function desiredPolice(stars) {
  return [0, 2, 3, 4, 5, 6][clamp(stars, 0, MAX_STARS)];
}

export function makePoliceCar(rng, x, y, angle) {
  const car = makeCar(rng, x, y, angle, { driver: 'police', model: 1, color: '#eef0f2' });
  car.police = true;
  car.cruise = 268;
  return car;
}

/** A spawn point on a road, a few blocks from the player but out of sight. */
export function policeSpawnPoint(city, rng, player) {
  for (let tries = 0; tries < 16; tries += 1) {
    const p = randomRoadPoint(rng, player, 430);
    const d2 = (p.x - player.x) ** 2 + (p.y - player.y) ** 2;
    if (d2 > 430 * 430 && d2 < 900 * 900) return p;
  }
  return randomRoadPoint(rng, player, 430);
}

/**
 * Drive one police car for a step: straight at the player's predicted
 * position, deflecting around buildings, easing off only when alongside.
 * Returns the impact speed from stepCar (for crash sounds and damage).
 */
export function updatePoliceCar(city, car, dt, world) {
  const target = world.playerVehicle ?? world.player;
  const lead = 0.35;
  const tx = target.x + (target.vx ?? 0) * lead;
  const ty = target.y + (target.vy ?? 0) * lead;
  let desired = Math.atan2(ty - car.y, tx - car.x);

  // Building ahead? Swing the aim point around the corner.
  const probeX = car.x + Math.cos(car.angle) * 58;
  const probeY = car.y + Math.sin(car.angle) * 58;
  if (circleHitsBuilding(city, probeX, probeY, 20)) {
    const left = desired + 0.95;
    const right = desired - 0.95;
    const lx = car.x + Math.cos(left) * 70;
    const ly = car.y + Math.sin(left) * 70;
    desired = circleHitsBuilding(city, lx, ly, 20) ? right : left;
  }

  const steer = clamp(angleDelta(car.angle, desired) * 1.9, -1, 1);
  const dist = Math.hypot(tx - car.x, ty - car.y);
  let throttle = 1;
  if (dist < 42 && Math.abs(car.speed) > 60) throttle = -0.6; // don't overshoot a stopped player
  const impact = stepCar(city, car, dt, { throttle, steer, handbrake: dist < 90 && Math.abs(angleDelta(car.angle, desired)) > 1.1 });
  car.sirenPhase += dt * 9;
  return impact;
}

/** Distance to the nearest police car, and how many can see the player. */
export function policePressure(city, world) {
  let nearest = Infinity;
  let seers = 0;
  for (const car of world.cars) {
    if (!car.police || car.wrecked) continue;
    const d = Math.hypot(car.x - world.player.x, car.y - world.player.y);
    if (d < nearest) nearest = d;
    if (d < 330) {
      // Cheap sight check: in range and no building squarely between.
      const steps = 6;
      let blocked = false;
      for (let i = 1; i < steps; i += 1) {
        const t = i / steps;
        if (circleHitsBuilding(city, world.player.x + (car.x - world.player.x) * t, world.player.y + (car.y - world.player.y) * t, 6)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) seers += 1;
    }
  }
  return { nearest, seers };
}
