// The story of Danny Solano, told in three jobs for Rosa Delgado of Rosa's
// Diner: fetch a borrowed sports car, run a hot package off the pier, and
// settle things with the Neon Jackals on the boardwalk. Missions are data —
// a list of steps (go somewhere, steal this car, deliver it, fight, escape)
// — and this module walks the player through them, spawning what each step
// needs and paying out at the end. Between jobs the city is a free roam.

import { PITCH, CITY_W } from './config.js';
import { makeCar } from './vehicles.js';
import { makePed } from './people.js';
import { addHeat } from './police.js';

export function createMissionState() {
  return {
    nextIndex: 0,      // which mission starts next at the diner
    active: null,      // {def, stepIndex, step, timer}
    completed: [],     // mission ids, for the save file
    carryingPackage: false,
  };
}

function dinerPoint(city) {
  const z = city.landmarks.diner;
  return { x: z.x + z.w / 2, y: z.y + z.h / 2 };
}
function garagePoint(city) {
  const z = city.landmarks.garage;
  return { x: z.x + z.w / 2, y: z.y + z.h / 2 };
}

export const MISSIONS = [
  {
    id: 'welcome-home',
    title: 'Welcome Home',
    reward: 300,
    steps: [
      {
        kind: 'goto', text: 'Talk to Rosa at the diner', r: 60,
        at: (city) => dinerPoint(city),
        say: [
          ['ROSA', 'Danny Solano. Six years away and you walk in like the tide brought you.'],
          ['DANNY', 'The tide did, Mama Rosa. I need work, not questions.'],
          ['ROSA', 'Then work. A gold Vireo GT sits by the marina, keys in it, owner... forgetful. Bring it to Sunset Customs. And Danny — the pistol under the counter is yours. Family rate.'],
        ],
      },
      {
        kind: 'steal', text: 'Take the gold Vireo GT by the marina', r: 46,
        at: (city) => ({ x: CITY_W, y: 3 * PITCH + 30 }),
        setup(game, step) {
          const car = makeCar(game.rng, step.x, step.y, Math.PI / 2, { model: 0, color: '#f2a007' });
          car.missionCar = true;
          game.cars.push(car);
          step.carId = car.id;
        },
        say: [['DANNY', 'Gold, loud and borrowed. Just how Rosa likes it.']],
      },
      {
        kind: 'deliverCar', text: 'Deliver the Vireo to Sunset Customs', r: 74,
        at: (city) => garagePoint(city),
        say: [['ROSA (PHONE)', 'Customs will wipe it clean. You drive like your father, Solano — that is not a compliment.']],
      },
    ],
  },
  {
    id: 'pier-pressure',
    title: 'Pier Pressure',
    reward: 600,
    steps: [
      {
        kind: 'goto', text: 'Meet the courier at the end of the pier', r: 44,
        at: (city) => ({ x: city.pier.x + city.pier.w - 36, y: city.pier.y + city.pier.h / 2 }),
        say: [
          ['COURIER', 'You Rosa\'s driver? No names. The bag is hot, the whole bay knows it.'],
          ['DANNY', 'Then stop talking and hand it over.'],
          ['COURIER', 'Alley behind Club Neon, north-west side. Clock is running, driver.'],
        ],
      },
      {
        kind: 'timedDeliver', text: 'Drop the package behind Club Neon', r: 62, time: 150,
        at: () => ({ x: 2 * PITCH, y: 1 * PITCH }),
        heatFloor: 200,
        say: [['DANNY', 'Two stars and a bag of trouble. Just like old times.']],
      },
    ],
  },
  {
    id: 'jackals-at-dusk',
    title: 'Jackals at Dusk',
    reward: 1000,
    steps: [
      {
        kind: 'goto', text: 'Confront the Neon Jackals on the boardwalk', r: 90,
        at: () => ({ x: CITY_W + 130, y: 5 * PITCH + 40 }),
        say: [
          ['VEX MARLOWE', 'Solano. Rosa\'s errand boy, come to bark for her boardwalk.'],
          ['DANNY', 'The boardwalk pays Rosa for protection. Tonight you learn why.'],
        ],
      },
      {
        kind: 'fight', text: 'Put the Neon Jackals down', r: 0,
        setup(game, step) {
          step.rivalIds = [];
          const spots = [[-70, -40], [60, -70], [90, 50], [-50, 80]];
          for (const [dx, dy] of spots) {
            const rival = makePed(game.rng, step.x + dx, step.y + dy, { state: 'rival', health: 45, shirt: '#39ff88' });
            game.peds.push(rival);
            step.rivalIds.push(rival);
          }
        },
      },
      {
        kind: 'escape', text: 'Lose the heat', r: 0,
        say: [['ROSA (PHONE)', 'Sirens, Danny. Disappear, then come home. Dinner is on the house.']],
      },
    ],
  },
];

/** Start the next mission if the player is standing at the diner. */
export function tryStartMission(game) {
  const state = game.missions;
  if (state.active || state.nextIndex >= MISSIONS.length) return false;
  const p = dinerPoint(game.city);
  const d2 = (game.player.x - p.x) ** 2 + (game.player.y - p.y) ** 2;
  if (d2 > 70 * 70) return false;
  const def = MISSIONS[state.nextIndex];
  state.active = { def, stepIndex: 0, step: null, timer: 0 };
  game.say([['', `${def.title} — job ${state.nextIndex + 1} of ${MISSIONS.length}`]]);
  beginStep(game);
  return true;
}

function beginStep(game) {
  const state = game.missions;
  const active = state.active;
  const def = active.def;
  if (active.stepIndex >= def.steps.length) {
    finishMission(game);
    return;
  }
  const step = { ...def.steps[active.stepIndex] };
  const at = step.at ? step.at(game.city) : { x: game.player.x, y: game.player.y };
  step.x = at.x;
  step.y = at.y;
  active.step = step;
  active.timer = step.time ?? 0;
  if (step.setup) step.setup(game, step);
  if (step.say) game.say(step.say);
  game.objective(step.text);
}

function finishMission(game) {
  const state = game.missions;
  const def = state.active.def;
  state.completed.push(def.id);
  state.nextIndex += 1;
  state.active = null;
  state.carryingPackage = false;
  game.earn(def.reward);
  game.notify(`Job done — ${def.title}: +$${def.reward}`);
  if (def.id === 'welcome-home') game.givePistol();
  if (state.nextIndex >= MISSIONS.length) {
    game.say([
      ['ROSA', 'The Jackals are done, the city breathes again. You are family now, Danny.'],
      ['', 'Story complete — Sunset City is yours to roam.'],
    ]);
  }
  game.saveGame();
}

/** The world position the HUD should point at, or null. */
export function missionMarker(game) {
  const state = game.missions;
  if (state.active && state.active.step) {
    const s = state.active.step;
    if (s.kind === 'fight' || s.kind === 'escape') return null;
    return { x: s.x, y: s.y };
  }
  if (state.nextIndex < MISSIONS.length) {
    const p = dinerPoint(game.city);
    return { x: p.x, y: p.y, diner: true };
  }
  return null;
}

function stepComplete(game, step) {
  const p = game.player;
  if (step.r <= 0) return false;
  return (p.x - step.x) ** 2 + (p.y - step.y) ** 2 <= step.r * step.r;
}

/** Advance the active mission by one frame. Called every tick. */
export function updateMission(game, dt) {
  const state = game.missions;
  const active = state.active;
  if (!active) return;
  const step = active.step;
  if (!step) return;

  if (step.heatFloor) {
    if (game.wanted.heat < step.heatFloor) game.wanted.heat = step.heatFloor;
  }

  switch (step.kind) {
    case 'goto':
      if (stepComplete(game, step)) advance(game);
      break;
    case 'steal': {
      const car = game.cars.find((c) => c.id === step.carId);
      if (car && game.player.car === car) {
        addHeat(game.wanted, 105); // hotwiring in broad sunset light
        advance(game);
      } else if (car && car.wrecked) {
        car.health = 100;
        car.wrecked = false;
        car.x = step.x;
        car.y = step.y;
        car.speed = 0;
        game.notify('The Vireo was wrecked — a fresh one waits by the marina.');
      }
      break;
    }
    case 'deliverCar': {
      const car = game.cars.find((c) => c.id === stepCarIdOf(active));
      const target = game.missions.active.step;
      const inCar = game.player.car && game.player.car.missionCar;
      if (inCar && stepComplete(game, target)) {
        // The garage takes the car; Danny steps out a richer man.
        const delivered = game.player.car;
        game.exitCar(true);
        game.cars.splice(game.cars.indexOf(delivered), 1);
        advance(game);
      }
      break;
    }
    case 'timedDeliver': {
      state.carryingPackage = true;
      active.timer -= dt;
      if (stepComplete(game, step)) {
        state.carryingPackage = false;
        advance(game);
      } else if (active.timer <= 0) {
        state.carryingPackage = false;
        game.notify('Too slow — the buyer vanished. The courier has another bag.');
        game.say([['COURIER', 'Again? Fine. Same pier, same bag. Faster this time.']]);
        active.stepIndex = 0;
        beginStep(game);
      }
      break;
    }
    case 'fight': {
      const alive = step.rivalIds.filter((r) => r.state !== 'down');
      game.objective(`Put the Neon Jackals down — ${alive.length} standing`);
      if (alive.length === 0) advance(game);
      break;
    }
    case 'escape':
      if (game.wanted.stars === 0) advance(game);
      break;
    default:
      break;
  }
}

// deliverCar needs the car from the earlier steal step; the mission state
// remembers it here rather than in the step data.
function stepCarIdOf(active) {
  return active.stealCarId ?? -1;
}

function advance(game) {
  const active = game.missions.active;
  active.stepIndex += 1;
  beginStep(game);
}

/** Remember the stolen mission car so the delivery step can find it. */
export function noteStolenCar(game, car) {
  const active = game.missions.active;
  if (active && car.missionCar) active.stealCarId = car.id;
}
