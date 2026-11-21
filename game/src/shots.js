// Staged scenes for the entry screenshots, behind ?shot=<name>&seed=<n>.
// Each scene arranges the real game — the same city, cars, people, police
// and HUD the player gets — into one honest moment, runs a fixed number of
// simulation steps so the frame is alive, and then freezes the simulation
// (rendering continues) so the maker's screenshot is the same every time.
// Nothing here is drawn that the game itself cannot draw.

import { PITCH, CITY_W } from './config.js';
import { makeCar } from './vehicles.js';
import { makePoliceCar } from './police.js';
import { makePed } from './people.js';
import { MISSIONS } from './missions.js';

function placeInCar(game, car) {
  car.driver = 'player';
  game.player.car = car;
  game.player.x = car.x;
  game.player.y = car.y;
  game.cars.push(car);
}

function extraTraffic(game, spots) {
  for (const [x, y, angle, dir] of spots) {
    const car = makeCar(game.rng, x, y, angle, { driver: 'traffic', dir });
    car.speed = car.cruise * 0.8;
    game.cars.push(car);
  }
}

function extraPeds(game, spots) {
  for (const [x, y] of spots) game.peds.push(makePed(game.rng, x, y));
}

const SCENES = {
  // The cover: Danny at the wheel downtown, traffic around him, a job to do.
  drive(game) {
    const car = makeCar(game.rng, 4 * PITCH + 30, 4 * PITCH + 20, 0, { model: 0, color: '#e23b3b' });
    car.speed = 165;
    placeInCar(game, car);
    extraTraffic(game, [
      [4 * PITCH - 190, 4 * PITCH - 20, 0, { x: 1, y: 0 }],
      [4 * PITCH + 260, 4 * PITCH - 20, Math.PI, { x: -1, y: 0 }],
      [5 * PITCH + 20, 4 * PITCH - 240, Math.PI / 2, { x: 0, y: 1 }],
      [3 * PITCH - 20, 4 * PITCH + 200, -Math.PI / 2, { x: 0, y: -1 }],
    ]);
    extraPeds(game, [[4 * PITCH - 70, 4 * PITCH - 58], [4 * PITCH + 120, 4 * PITCH + 62], [4 * PITCH - 150, 4 * PITCH + 58]]);
    const g = game.city.landmarks.garage;
    const step = { ...MISSIONS[0].steps[2], x: g.x + g.w / 2, y: g.y + g.h / 2 };
    game.missions.active = { def: MISSIONS[0], stepIndex: 2, step, timer: 0 };
    game.money = 420;
  },

  // On foot outside the diner: pedestrians, traffic, the city breathing.
  foot(game) {
    const d = game.city.landmarks.diner;
    game.player.x = d.x + d.w / 2 + 30;
    game.player.y = d.y + d.h + 34;
    game.player.angle = 0.4;
    extraPeds(game, [
      [game.player.x - 60, game.player.y - 24], [game.player.x + 44, game.player.y + 30],
      [game.player.x - 120, game.player.y + 10], [game.player.x + 96, game.player.y - 40],
    ]);
    extraTraffic(game, [
      [2 * PITCH - 320, 5 * PITCH - 20, 0, { x: 1, y: 0 }],
      [3 * PITCH + 330, 5 * PITCH + 20, Math.PI, { x: -1, y: 0 }],
    ]);
    game.marker = { x: d.x + d.w / 2, y: d.y + d.h / 2, diner: true };
    game.objectiveText = 'See Rosa at the diner';
    game.money = 120;
  },

  // Four stars: the whole department pouring onto one red Vireo.
  chase(game) {
    // Clear the sprint lane: no ambient car parked in the opening run.
    game.cars = game.cars.filter((c) => Math.hypot(c.x - (5 * PITCH + 40), c.y - (5 * PITCH - 20)) > 320);
    const car = makeCar(game.rng, 5 * PITCH + 40, 5 * PITCH - 20, Math.PI, { model: 0, color: '#e23b3b' });
    car.speed = 228;
    placeInCar(game, car);
    const copSpots = [
      [5 * PITCH + 185, 5 * PITCH - 22], [5 * PITCH + 265, 5 * PITCH + 18],
      [5 * PITCH + 350, 5 * PITCH - 20], [5 * PITCH + 430, 5 * PITCH + 22],
    ];
    for (const [x, y] of copSpots) {
      const cop = makePoliceCar(game.rng, x, y, Math.PI);
      cop.speed = 214;
      game.cars.push(cop);
    }
    extraTraffic(game, [[4 * PITCH - 120, 5 * PITCH + 20, 0, { x: 1, y: 0 }]]);
    game.wanted.heat = 320;
    game.wanted.stars = 4;
    const step = { ...MISSIONS[2].steps[2], x: game.player.x, y: game.player.y };
    game.missions.active = { def: MISSIONS[2], stepIndex: 2, step, timer: 0 };
    game.money = 860;
  },

  // The pier job: package aboard, two stars, the clock running down.
  mission(game) {
    const car = makeCar(game.rng, CITY_W - 60, 4 * PITCH + 20, Math.PI, { model: 3, color: '#ffd23e' });
    car.speed = 140;
    placeInCar(game, car);
    const cop = makePoliceCar(game.rng, CITY_W + 240, 4 * PITCH - 30, Math.PI);
    cop.speed = 150;
    game.cars.push(cop);
    game.wanted.heat = 210;
    game.wanted.stars = 2;
    const step = { ...MISSIONS[1].steps[1], x: 2 * PITCH, y: 1 * PITCH };
    game.missions.active = { def: MISSIONS[1], stepIndex: 1, step, timer: 96 };
    game.missions.carryingPackage = true;
    game.marker = { x: step.x, y: step.y };
    game.objectiveText = step.text;
    game.money = 900;
    game.player.armed = true;
  },
};

/**
 * Stage a scene by name. Returns false for an unknown name (the game then
 * just runs normally). The caller runs the fixed simulation steps.
 */
export function stageShot(game, name) {
  const scene = SCENES[name];
  if (!scene) return false;
  game.screen = 'play';
  game.dialogueQueue = [];
  game.dialogue = null;
  game.notices = [];
  scene(game);
  return true;
}

export const SHOT_NAMES = Object.keys(SCENES);
