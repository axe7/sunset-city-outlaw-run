// Cars: the arcade driving model, the traffic that drives itself around
// the grid, and the parked cars waiting to be borrowed. One physics step
// serves the player, the traffic and the police; only the steering input
// differs.

import { CAR_MODELS, PITCH, CITY_W, WORLD_H } from './config.js';
import { clamp, turnToward, angleDelta } from './rng.js';
import { roadCenter, resolveCircle } from './city.js';

let nextCarId = 1;

export function makeCar(rng, x, y, angle, opts = {}) {
  const model = CAR_MODELS[opts.model ?? rng.int(0, CAR_MODELS.length - 1)];
  return {
    id: nextCarId++,
    x, y, angle,
    vx: 0, vy: 0,
    speed: 0,
    w: model.w,
    h: model.h,
    model,
    color: opts.color ?? rng.pick(model.colors),
    health: 100,
    driver: opts.driver ?? null, // null = parked & empty, 'traffic', 'police', 'player'
    cruise: rng.range(115, 165),
    dir: opts.dir ?? { x: 1, y: 0 },
    turnCd: 0,
    stuckTime: 0,
    honkCd: rng.range(2, 9),
    sirenPhase: rng.range(0, Math.PI * 2),
    wrecked: false,
  };
}

/** Rough bounding radius used for car-vs-world and car-vs-car bumps. */
export function carRadius(car) {
  return car.w * 0.58;
}

/**
 * The shared arcade step. input: {throttle -1..1, steer -1..1, handbrake}.
 * Returns the impact speed when the car struck the world this step, else 0.
 */
export function stepCar(city, car, dt, input) {
  const m = car.model;
  const topSpeed = m.top * (car.health < 25 ? 0.45 : car.health < 55 ? 0.75 : 1);
  if (input.throttle > 0) {
    car.speed += m.accel * input.throttle * dt * (car.speed < 0 ? 2.2 : 1);
  } else if (input.throttle < 0) {
    car.speed += m.accel * input.throttle * dt * (car.speed > 0 ? 2.4 : 0.55);
  }
  // Rolling drag and brakes.
  car.speed -= car.speed * (input.handbrake ? 1.9 : 0.55) * dt;
  if (Math.abs(car.speed) < 2 && input.throttle === 0) car.speed = 0;
  car.speed = clamp(car.speed, -topSpeed * 0.38, topSpeed);

  const speedRatio = clamp(Math.abs(car.speed) / m.top, 0, 1);
  const steerAuthority = (0.35 + 0.65 * Math.min(1, Math.abs(car.speed) / 90)) * (1 - speedRatio * 0.35);
  const turn = input.steer * m.grip * steerAuthority * dt * (car.speed < 0 ? -1 : 1);
  car.angle += turn * (input.handbrake ? 1.45 : 1);

  const before = { x: car.x, y: car.y };
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.vx = Math.cos(car.angle) * car.speed;
  car.vy = Math.sin(car.angle) * car.speed;
  const hit = resolveCircle(city, car, carRadius(car) * 0.8);
  if (hit) {
    // Measure how hard the world stopped us: the lost travel is the impact.
    const lost = Math.hypot(car.x - before.x, car.y - before.y);
    const intended = Math.abs(car.speed) * dt;
    if (intended > 0.5 && lost < intended * 0.4) {
      const impact = Math.abs(car.speed);
      car.speed *= -0.18;
      return impact;
    }
    car.speed *= 0.92;
  }
  return 0;
}

/** Where this car's lane centre is, for its current direction of travel. */
function laneTarget(car) {
  const LANE = 20;
  if (car.dir.x === 1) return { x: car.x + 90, y: roadCenter(car.y, WORLD_H) + LANE };
  if (car.dir.x === -1) return { x: car.x - 90, y: roadCenter(car.y, WORLD_H) - LANE };
  if (car.dir.y === 1) return { x: roadCenter(car.x, CITY_W) - LANE, y: car.y + 90 };
  return { x: roadCenter(car.x, CITY_W) + LANE, y: car.y - 90 };
}

const DIRS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

/** Drive one traffic car along the grid for a step. Returns events via out flags. */
export function updateTrafficCar(city, car, dt, world, rng) {
  car.turnCd -= dt;
  // Near an intersection centre? Consider turning.
  const cx = roadCenter(car.x, CITY_W);
  const cy = roadCenter(car.y, WORLD_H);
  const atCrossing = Math.abs(car.x - cx) < 10 && Math.abs(car.y - cy) < 10;
  if (atCrossing && car.turnCd <= 0) {
    const options = DIRS.filter((d) => !(d.x === -car.dir.x && d.y === -car.dir.y));
    const choice = rng.chance(0.55) ? car.dir : rng.pick(options);
    // Never turn off the east edge into the beach: the grid ends at CITY_W.
    if (!(choice.x === 1 && cx >= CITY_W - 1) && !(choice.y !== 0 && false)) {
      car.dir = choice;
    }
    car.turnCd = 1.2;
  }
  // Keep inside the grid: force a turn at the map edges.
  if ((car.x > CITY_W - 30 && car.dir.x === 1) || (car.x < 30 && car.dir.x === -1)) {
    car.dir = rng.pick(DIRS.filter((d) => d.x === 0));
    car.turnCd = 1.2;
  }
  if ((car.y > WORLD_H - 30 && car.dir.y === 1) || (car.y < 30 && car.dir.y === -1)) {
    car.dir = rng.pick(DIRS.filter((d) => d.y === 0));
    car.turnCd = 1.2;
  }

  const target = laneTarget(car);
  const desired = Math.atan2(target.y - car.y, target.x - car.x);
  const steer = clamp(angleDelta(car.angle, desired) * 1.6, -1, 1);

  // Something ahead? A car or a person in the lane means brake lights.
  const aheadX = car.x + Math.cos(car.angle) * 52;
  const aheadY = car.y + Math.sin(car.angle) * 52;
  let blocked = false;
  for (const other of world.cars) {
    if (other === car || other.wrecked) continue;
    const d2 = (other.x - aheadX) ** 2 + (other.y - aheadY) ** 2;
    if (d2 < 30 * 30) { blocked = true; break; }
  }
  if (!blocked) {
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      const d2 = (ped.x - aheadX) ** 2 + (ped.y - aheadY) ** 2;
      if (d2 < 24 * 24) { blocked = true; break; }
    }
  }
  if (!blocked && world.playerCar && world.playerCar !== car) {
    const d2 = (world.playerCar.x - aheadX) ** 2 + (world.playerCar.y - aheadY) ** 2;
    if (d2 < 30 * 30) blocked = true;
  }

  let throttle = 0;
  if (blocked) {
    throttle = car.speed > 8 ? -1 : 0;
    if (car.speed <= 8) car.speed = Math.max(0, car.speed - 90 * dt);
  } else if (car.speed < car.cruise) {
    throttle = 0.75;
  }
  const impact = stepCar(city, car, dt, { throttle, steer, handbrake: false });

  // Stuck against a wall or a jam for a while? Pick a new direction.
  if (Math.abs(car.speed) < 4 && !blocked) car.stuckTime += dt; else car.stuckTime = 0;
  if (car.stuckTime > 3.5) {
    car.dir = rng.pick(DIRS);
    car.angle = Math.atan2(car.dir.y, car.dir.x);
    car.stuckTime = 0;
    car.turnCd = 1.5;
  }
  car.honkCd -= dt;
  return { impact, blocked };
}

/** Fill the city's parking spots and street edges with empty cars. */
export function spawnParkedCars(city, rng) {
  const cars = [];
  for (const spot of city.parkingSpots) {
    if (rng.chance(0.55)) {
      cars.push(makeCar(rng, spot.x, spot.y, spot.angle, {}));
    }
  }
  // A few cars parked nose-in along the beach road and by the pier.
  for (let k = 0; k < 7; k += 1) {
    const y = rng.range(120, WORLD_H - 120);
    cars.push(makeCar(rng, CITY_W + 66, y, Math.PI / 2, {}));
  }
  return cars;
}

/** Spawn moving traffic on roads away from the given point. */
export function spawnTraffic(city, rng, count, awayFrom) {
  const cars = [];
  for (let k = 0; k < count; k += 1) {
    let x = 0;
    let y = 0;
    let dir = DIRS[0];
    for (let tries = 0; tries < 20; tries += 1) {
      const vertical = rng.chance(0.5);
      const line = rng.int(0, vertical ? CITY_W / PITCH : WORLD_H / PITCH) * PITCH;
      const along = rng.range(40, (vertical ? WORLD_H : CITY_W) - 40);
      x = vertical ? line : along;
      y = vertical ? along : line;
      dir = vertical ? { x: 0, y: rng.chance(0.5) ? 1 : -1 } : { x: rng.chance(0.5) ? 1 : -1, y: 0 };
      if (!awayFrom || (x - awayFrom.x) ** 2 + (y - awayFrom.y) ** 2 > 260 * 260) break;
    }
    const car = makeCar(rng, x, y, Math.atan2(dir.y, dir.x), { driver: 'traffic', dir });
    car.speed = car.cruise * 0.7;
    cars.push(car);
  }
  return cars;
}
