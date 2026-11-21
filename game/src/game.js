// The game itself: state, the per-frame simulation, and every system that
// touches another — driving into things, being seen doing it, getting
// chased, getting caught, getting paid. Rendering and the HUD live in their
// own modules; this one is the rules of Sunset City.

import {
  PLAYER_RADIUS, PLAYER_WALK, PLAYER_SPRINT, PLAYER_MAX_HEALTH,
  HEAT_THEFT, HEAT_HIT_CAR, HEAT_HIT_PED, HEAT_SHOT, BUST_RANGE, BUST_TIME,
  PRICE_RESPRAY, PRICE_FOOD, REEL_VALUE, SAVE_KEY, WORLD_W, WORLD_H,
} from './config.js';
import { makeRng, clamp, angleDelta } from './rng.js';
import { buildCity, resolveCircle, surfaceAt } from './city.js';
import { stepCar, updateTrafficCar, spawnParkedCars, spawnTraffic, carRadius, makeCar } from './vehicles.js';
import { spawnPeds, updatePed, makePed } from './people.js';
import {
  createWanted, addHeat, updateWanted, desiredPolice, makePoliceCar,
  policeSpawnPoint, updatePoliceCar, policePressure,
} from './police.js';
import {
  createMissionState, tryStartMission, updateMission, missionMarker, noteStolenCar, MISSIONS,
} from './missions.js';
import { keys, pressed, moveVector, mouse } from './input.js';
import { sfx, setEngine, setSiren } from './audio.js';

export function createGame(seed = 20261119) {
  const rng = makeRng(seed);
  const city = buildCity(rng);
  const diner = city.landmarks.diner;
  const start = { x: diner.x + diner.w / 2, y: diner.y + diner.h + 26 };

  const game = {
    rng,
    city,
    screen: 'title', // title | play | paused | busted | down
    time: 0,
    money: 120,
    reelsFound: 0,
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    notices: [],
    player: {
      x: start.x, y: start.y, vx: 0, vy: 0,
      angle: -Math.PI / 2, aim: 0, speed: 0, phase: 0,
      health: PLAYER_MAX_HEALTH, car: null, armed: false,
      fireCd: 0, swingT: 0, hurtCd: 0,
      skin: '#c98a5e', shirt: '#0e7c86', pants: '#33415c',
    },
    playerCar: null,
    wanted: createWanted(),
    missions: createMissionState(),
    marker: null,
    objectiveText: '',
    dialogue: null,
    dialogueQueue: [],
    dialogueT: 0,
    threat: { x: 0, y: 0, ttl: 0 },
    nearCar: null,
    nearStand: null,
    nearGarage: false,
    garageCd: 0,
    policeSpawnCd: 0,
    skidCd: 0,
    camDrift: 0,

    // ---- presentation helpers used by missions and systems ----
    say(lines) {
      for (const [speaker, text] of lines) this.dialogueQueue.push({ speaker, text });
    },
    objective(text) {
      this.objectiveText = text;
    },
    notify(text) {
      this.notices.push({ text, ttl: 3.4 });
      if (this.notices.length > 3) this.notices.shift();
    },
    earn(amount) {
      this.money += amount;
      sfx.cash();
    },
    givePistol() {
      if (!this.player.armed) {
        this.player.armed = true;
        this.notify('You got the pistol from Rosa.');
      }
    },

    // ---- run lifecycle ----
    newGame(fromSave) {
      this.money = 120;
      this.reelsFound = 0;
      this.missions = createMissionState();
      this.wanted = createWanted();
      this.player.health = PLAYER_MAX_HEALTH;
      this.player.armed = false;
      this.player.car = null;
      this.player.x = start.x;
      this.player.y = start.y;
      for (const reel of this.city.reels) reel.taken = false;
      if (fromSave) {
        try {
          const raw = localStorage.getItem(SAVE_KEY);
          if (raw) {
            const save = JSON.parse(raw);
            this.money = save.money ?? this.money;
            this.reelsFound = save.reelsFound ?? 0;
            this.player.armed = !!save.pistol;
            for (const idx of save.reelsTaken ?? []) {
              if (this.city.reels[idx]) this.city.reels[idx].taken = true;
            }
            this.missions.completed = save.completed ?? [];
            this.missions.nextIndex = save.nextIndex ?? 0;
          }
        } catch { /* a broken save is just a fresh start */ }
      }
      this.screen = 'play';
      this.say([
        ['ROSA', 'Danny? That you darkening my door? Get over here, mi hijo.'],
        ['', 'Follow the gold marker. WASD to walk, F to take a car.'],
      ]);
    },
    saveGame() {
      try {
        const reelsTaken = [];
        this.city.reels.forEach((r, i) => { if (r.taken) reelsTaken.push(i); });
        localStorage.setItem(SAVE_KEY, JSON.stringify({
          money: this.money,
          reelsFound: this.reelsFound,
          reelsTaken,
          pistol: this.player.armed,
          completed: this.missions.completed,
          nextIndex: this.missions.nextIndex,
        }));
      } catch { /* private mode: play on without saving */ }
    },
    hasSave() {
      try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
    },

    // ---- cars ----
    exitCar(silent = false) {
      const car = this.player.car;
      if (!car) return;
      car.driver = null;
      this.player.car = null;
      // Step out on the left side, clear of the bodywork.
      const side = car.angle + Math.PI / 2;
      this.player.x = car.x + Math.cos(side) * (car.h / 2 + 15);
      this.player.y = car.y + Math.sin(side) * (car.h / 2 + 15);
      resolveCircle(this.city, this.player, PLAYER_RADIUS);
      if (!silent) sfx.door();
      setEngine(false, 0);
    },
    enterCar(car) {
      if (car.driver === 'traffic') {
        // The driver is pulled out and runs for it.
        const driver = makePed(this.rng, car.x, car.y, {});
        driver.state = 'flee';
        driver.fleeTime = 3;
        this.peds.push(driver);
        car.driver = null;
        this.reportCrime(car.x, car.y, HEAT_THEFT, true);
      }
      if (car.missionCar) noteStolenCar(this, car);
      car.driver = 'player';
      this.player.car = car;
      this.player.x = car.x;
      this.player.y = car.y;
      sfx.door();
    },

    /** A crime at (x, y): heat only lands when someone sees it. */
    reportCrime(x, y, heat, loud = false) {
      this.threat = { x, y, ttl: 2.6 };
      let witnessed = loud;
      if (!witnessed) {
        for (const ped of this.peds) {
          if (ped.state === 'down' || ped.isRival) continue;
          if ((ped.x - x) ** 2 + (ped.y - y) ** 2 < 175 * 175) { witnessed = true; break; }
        }
      }
      if (!witnessed) {
        for (const car of this.cars) {
          if (car.police && (car.x - x) ** 2 + (car.y - y) ** 2 < 330 * 330) { witnessed = true; break; }
        }
      }
      if (witnessed) addHeat(this.wanted, heat);
    },
  };

  game.cars = [...spawnParkedCars(city, rng), ...spawnTraffic(city, rng, 16, start)];
  game.peds = spawnPeds(city, rng, 30, start);
  return game;
}

// ---- Particles --------------------------------------------------------------

function burst(game, x, y, n, color, speed = 90, life = 0.5, size = 3) {
  for (let i = 0; i < n; i += 1) {
    const a = game.rng.range(0, Math.PI * 2);
    const v = game.rng.range(speed * 0.3, speed);
    game.particles.push({
      x, y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: game.rng.range(life * 0.5, life), maxLife: life,
      color, size: game.rng.range(size * 0.6, size * 1.3),
    });
  }
}

// ---- The frame --------------------------------------------------------------

export function updateGame(game, dt) {
  game.time += dt;
  const player = game.player;
  const city = game.city;

  // Dialogue advances on its own clock, whatever the screen.
  if (!game.dialogue && game.dialogueQueue.length) {
    game.dialogue = game.dialogueQueue.shift();
    game.dialogueT = Math.max(2.4, game.dialogue.text.length * 0.048);
  }
  if (game.dialogue) {
    game.dialogueT -= dt;
    if (game.dialogueT <= 0) game.dialogue = null;
  }
  for (const n of game.notices) n.ttl -= dt;
  game.notices = game.notices.filter((n) => n.ttl > 0);
  if (game.threat.ttl > 0) game.threat.ttl -= dt;

  // Title screen: the city lives on behind the menu — traffic and people
  // keep moving, the camera drifts over downtown.
  if (game.screen === 'title') {
    game.camDrift += dt;
    for (const car of game.cars) {
      if (car.driver === 'traffic') updateTrafficCar(city, car, dt, game, game.rng);
    }
    for (const ped of game.peds) updatePed(city, ped, dt, game, game.rng);
    updateParticles(game, dt);
    return;
  }
  if (game.screen !== 'play') return;

  // -- Missions and the marker.
  if (!game.missions.active) tryStartMission(game);
  game.marker = missionMarker(game);
  if (game.missions.active) {
    game.objectiveText = game.missions.active.step ? game.missions.active.step.text : '';
    updateMission(game, dt);
  } else if (game.missions.nextIndex < MISSIONS.length) {
    game.objectiveText = 'See Rosa at the diner';
  } else {
    game.objectiveText = 'Free roam — Sunset City is yours';
  }

  // -- The player, on foot or behind the wheel.
  if (player.car) updatePlayerDriving(game, dt);
  else updatePlayerOnFoot(game, dt);
  game.playerCar = player.car;

  // -- The rest of the city.
  for (const car of game.cars) {
    if (car.driver === 'traffic') {
      const { impact } = updateTrafficCar(city, car, dt, game, game.rng);
      if (impact > 120) {
        car.health -= impact * 0.12;
        sfx.crash(impact > 200);
        burst(game, car.x, car.y, 6, '#ffd23e', 80, 0.4, 2.6);
      }
    } else if (car.police) {
      const impact = updatePoliceCar(city, car, dt, game);
      if (impact > 130) {
        car.health -= impact * 0.1;
        sfx.crash(false);
      }
    }
  }
  collideCars(game, dt);
  updatePedsAndCombat(game, dt);
  updateBullets(game, dt);
  updateParticles(game, dt);

  // -- The law.
  const pressure = policePressure(city, game);
  updateWanted(game.wanted, dt, pressure.seers > 0);
  updatePoliceSpawning(game, dt);
  updateBust(game, dt, pressure);

  // -- Pickups, shops and the garage.
  updateInteractions(game, dt);

  // -- Sound of the street.
  if (player.car) {
    setEngine(true, Math.abs(player.car.speed) / player.car.model.top);
    if (keys.has('Space') && Math.abs(player.car.speed) > 70 && game.skidCd <= 0) {
      sfx.skid();
      game.skidCd = 0.22;
    }
  } else {
    setEngine(false, 0);
  }
  game.skidCd -= dt;
  setSiren(pressure.nearest < 430, clamp(1 - pressure.nearest / 430, 0, 1));

  // -- Recycle traffic that has wandered too far away.
  for (const car of game.cars) {
    if (car.driver !== 'traffic') continue;
    const d2 = (car.x - player.x) ** 2 + (car.y - player.y) ** 2;
    if (d2 > 1500 * 1500) {
      const fresh = spawnTraffic(city, game.rng, 1, player)[0];
      Object.assign(car, fresh, { id: car.id });
    }
  }
  // Retire the fallen after a while.
  game.peds = game.peds.filter((p) => p.state !== 'down' || p.downTime < 7);
}

function updatePlayerOnFoot(game, dt) {
  const player = game.player;
  const city = game.city;
  const mv = moveVector();
  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const speed = sprint ? PLAYER_SPRINT : PLAYER_WALK;
  player.vx = mv.x * speed;
  player.vy = mv.y * speed;
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  resolveCircle(city, player, PLAYER_RADIUS);
  player.speed = Math.hypot(player.vx, player.vy);
  player.phase += dt * (player.speed > 10 ? 11 : 2);
  if (mv.x !== 0 || mv.y !== 0) player.angle = Math.atan2(mv.y, mv.x);

  // Aim follows the mouse (in world space, set by main.js each frame).
  player.aim = Math.atan2(game.aimWorld.y - player.y, game.aimWorld.x - player.x);
  player.fireCd -= dt;
  player.swingT = Math.max(0, player.swingT - dt);
  player.hurtCd = Math.max(0, player.hurtCd - dt);

  if (game.mouseDown && player.armed && player.fireCd <= 0) {
    player.fireCd = 0.24;
    fireBullet(game, player, player.aim, 'player');
    game.reportCrime(player.x, player.y, HEAT_SHOT, false);
    sfx.shot();
  } else if (game.mouseClicked && !player.armed) {
    player.swingT = 0.22;
    sfx.punch();
    // A swing connects with a person or a car panel in front of the player.
    const hx = player.x + Math.cos(player.aim) * 24;
    const hy = player.y + Math.sin(player.aim) * 24;
    for (const ped of game.peds) {
      if (ped.state !== 'down' && (ped.x - hx) ** 2 + (ped.y - hy) ** 2 < 20 * 20) {
        hurtPed(game, ped, 16, player.aim);
        game.reportCrime(player.x, player.y, 40, false);
      }
    }
    for (const car of game.cars) {
      if ((car.x - hx) ** 2 + (car.y - hy) ** 2 < carRadius(car) ** 2) {
        car.health -= 4;
        burst(game, hx, hy, 3, '#ffd23e', 60, 0.3, 2);
      }
    }
  }
  player.angle = player.armed ? player.aim : player.angle;

  // Getting in a car.
  game.nearCar = null;
  let best = 42 * 42;
  for (const car of game.cars) {
    if (car.wrecked) continue;
    const d2 = (car.x - player.x) ** 2 + (car.y - player.y) ** 2;
    if (d2 < best) {
      best = d2;
      game.nearCar = car;
    }
  }
  if (game.nearCar && pressed('KeyF')) game.enterCar(game.nearCar);
}

function updatePlayerDriving(game, dt) {
  const player = game.player;
  const car = player.car;
  const input = {
    throttle: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + (keys.has('KeyS') || keys.has('ArrowDown') ? -1 : 0),
    steer: (keys.has('KeyA') || keys.has('ArrowLeft') ? -1 : 0) + (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0),
    handbrake: keys.has('Space'),
  };
  const impact = stepCar(game.city, car, dt, input);
  if (impact > 90) {
    car.health -= impact * 0.16;
    player.health -= impact > 220 ? 6 : 0;
    sfx.crash(impact > 200);
    burst(game, car.x, car.y, impact > 200 ? 14 : 7, '#ffb703', 120, 0.5, 3);
    if (impact > 130) game.reportCrime(car.x, car.y, HEAT_HIT_CAR * 0.6, false);
    if (car.health <= 0 && !car.wrecked) wreckCar(game, car);
  }
  player.x = car.x;
  player.y = car.y;
  player.vx = Math.cos(car.angle) * car.speed;
  player.vy = Math.sin(car.angle) * car.speed;
  player.angle = car.angle;
  if (pressed('KeyF')) game.exitCar();
}

function wreckCar(game, car) {
  car.wrecked = true;
  car.speed = 0;
  burst(game, car.x, car.y, 22, '#ff7b33', 140, 0.8, 4);
  sfx.crash(true);
  if (car.driver === 'player') {
    game.player.health -= 10;
    game.exitCar(true);
    game.notify('Your ride is wrecked.');
  } else if (car.driver === 'traffic') {
    const driver = makePed(game.rng, car.x, car.y, {});
    driver.state = 'flee';
    driver.fleeTime = 3;
    game.peds.push(driver);
    car.driver = null;
  } else if (car.police) {
    car.driver = null;
  }
}

/** Car-to-car bumps and car-vs-pedestrian consequences. */
function collideCars(game, dt) {
  const player = game.player;
  const cars = game.cars;
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = carRadius(a) * 0.82 + carRadius(b) * 0.82;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      // Everyone separates — including police and the player — so a contact
      // resolves in a frame or two instead of grinding both cars to scrap.
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      // Damage and momentum only count while the pair is actually closing.
      const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (!Number.isFinite(closing) || closing <= 30) continue;
      const involvesPlayer = a.driver === 'player' || b.driver === 'player';
      const cooled = (car) => game.time - (car.lastHitAt ?? -9) > 0.25;
      if (involvesPlayer && cooled(a) && cooled(b)) {
        const other = a.driver === 'player' ? b : a;
        const dmg = Math.min(16, (closing - 30) * 0.09);
        other.health -= dmg;
        a.health -= dmg * 0.6;
        b.health -= dmg * 0.6;
        a.lastHitAt = game.time;
        b.lastHitAt = game.time;
        sfx.crash(closing > 210);
        burst(game, (a.x + b.x) / 2, (a.y + b.y) / 2, 8, '#ffd23e', 100, 0.4, 3);
        game.reportCrime(player.x, player.y, HEAT_HIT_CAR, false);
        if (other.health <= 0 && !other.wrecked) wreckCar(game, other);
        // Momentum exchange, arcade style.
        const pa = a.speed;
        a.speed = b.speed * 0.55;
        b.speed = pa * 0.55;
      } else if (!involvesPlayer && closing > 160 && cooled(a) && cooled(b)) {
        a.health -= 6;
        b.health -= 6;
        a.lastHitAt = game.time;
        b.lastHitAt = game.time;
      }
    }
  }
  // Cars versus people: fast cars are tragedies, slow ones are shoves.
  for (const car of cars) {
    if (Math.abs(car.speed) < 12) continue;
    for (const ped of game.peds) {
      if (ped.state === 'down') continue;
      const d2 = (ped.x - car.x) ** 2 + (ped.y - car.y) ** 2;
      const rr = carRadius(car) + 7;
      if (d2 >= rr * rr) continue;
      if (Math.abs(car.speed) > 55) {
        hurtPed(game, ped, 100, car.angle, true);
        if (car.driver === 'player') {
          game.reportCrime(car.x, car.y, HEAT_HIT_PED, false);
          burst(game, ped.x, ped.y, 8, '#ef476f', 90, 0.5, 3);
          sfx.crash(false);
        }
      } else {
        ped.state = 'flee';
        ped.fleeTime = 1.6;
        game.threat = { x: car.x, y: car.y, ttl: 1.5 };
      }
    }
  }
  // The player's own body versus traffic while on foot.
  if (!player.car) {
    for (const car of cars) {
      if (car.driver === 'player' || Math.abs(car.speed) < 50) continue;
      const d2 = (player.x - car.x) ** 2 + (player.y - car.y) ** 2;
      const rr = carRadius(car) + PLAYER_RADIUS;
      if (d2 < rr * rr && player.hurtCd <= 0) {
        player.health -= 12;
        player.hurtCd = 0.8;
        player.x += Math.cos(car.angle) * 16;
        player.y += Math.sin(car.angle) * 16;
        sfx.hurt();
        if (player.health <= 0) downPlayer(game);
      }
    }
  }
}

export function hurtPed(game, ped, damage, angle, silent = false) {
  ped.health -= damage;
  if (ped.health <= 0 && ped.state !== 'down') {
    ped.state = 'down';
    ped.downTime = 0;
    ped.speed = 0;
    if (!silent) sfx.punch();
  } else if (!ped.isRival) {
    ped.state = 'flee';
    ped.fleeTime = 2.4;
    game.threat = { x: ped.x, y: ped.y, ttl: 2 };
  }
}

function fireBullet(game, from, angle, owner) {
  const spread = owner === 'player' ? 0.02 : 0.09;
  const a = angle + game.rng.range(-spread, spread);
  game.bullets.push({
    x: from.x + Math.cos(a) * 14,
    y: from.y + Math.sin(a) * 14,
    vx: Math.cos(a) * 640,
    vy: Math.sin(a) * 640,
    life: 0.55,
    owner,
  });
  burst(game, from.x + Math.cos(a) * 18, from.y + Math.sin(a) * 18, 2, '#ffd23e', 40, 0.12, 2.4);
}

function updatePedsAndCombat(game, dt) {
  const world = { player: game.player, threat: game.threat, cars: game.cars, peds: game.peds, playerCar: game.player.car };
  for (const ped of game.peds) {
    const ev = updatePed(game.city, ped, dt, world, game.rng);
    if (ev.fired) {
      const angle = Math.atan2(game.player.y - ped.y, game.player.x - ped.x);
      fireBullet(game, ped, angle, 'rival');
      sfx.shot();
      game.threat = { x: ped.x, y: ped.y, ttl: 2 };
    }
  }
}

function updateBullets(game, dt) {
  const player = game.player;
  for (const b of game.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (surfaceAt(game.city, b.x, b.y) === 'building') {
      b.life = 0;
      burst(game, b.x, b.y, 2, '#ffd23e', 50, 0.2, 2);
      continue;
    }
    if (b.owner === 'player') {
      for (const ped of game.peds) {
        if (ped.state === 'down') continue;
        if ((ped.x - b.x) ** 2 + (ped.y - b.y) ** 2 < 11 * 11) {
          hurtPed(game, ped, 26, Math.atan2(b.vy, b.vx));
          if (ped.state === 'down' && !ped.isRival) game.reportCrime(b.x, b.y, HEAT_HIT_PED, false);
          b.life = 0;
          break;
        }
      }
      if (b.life > 0) {
        for (const car of game.cars) {
          if ((car.x - b.x) ** 2 + (car.y - b.y) ** 2 < carRadius(car) ** 2) {
            car.health -= 9;
            burst(game, b.x, b.y, 3, '#ffd23e', 70, 0.3, 2.2);
            if (car.health <= 0 && !car.wrecked) wreckCar(game, car);
            b.life = 0;
            break;
          }
        }
      }
    } else if (!player.car) {
      if ((player.x - b.x) ** 2 + (player.y - b.y) ** 2 < 11 * 11) {
        player.health -= 7;
        b.life = 0;
        sfx.hurt();
        burst(game, player.x, player.y, 4, '#ef476f', 70, 0.3, 2.6);
        if (player.health <= 0) downPlayer(game);
      }
    } else if ((player.car.x - b.x) ** 2 + (player.car.y - b.y) ** 2 < carRadius(player.car) ** 2) {
      player.car.health -= 5;
      b.life = 0;
    }
  }
  game.bullets = game.bullets.filter((b) => b.life > 0);
}

function updateParticles(game, dt) {
  for (const p of game.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= dt;
  }
  game.particles = game.particles.filter((p) => p.life > 0);
}

function updatePoliceSpawning(game, dt) {
  game.policeSpawnCd -= dt;
  const want = desiredPolice(game.wanted.stars);
  const active = game.cars.filter((c) => c.police && !c.wrecked);
  if (active.length < want && game.policeSpawnCd <= 0) {
    const p = policeSpawnPoint(game.city, game.rng, game.player);
    const car = makePoliceCar(game.rng, p.x, p.y, game.rng.range(0, Math.PI * 2));
    game.cars.push(car);
    game.policeSpawnCd = 1.6;
  }
  // Officers who lost the trail entirely drift off the roster.
  if (game.wanted.stars === 0) {
    game.cars = game.cars.filter((c) => {
      if (!c.police) return true;
      const d2 = (c.x - game.player.x) ** 2 + (c.y - game.player.y) ** 2;
      return d2 < 620 * 620;
    });
  }
}

function updateBust(game, dt, pressure) {
  const player = game.player;
  const slow = player.car ? Math.abs(player.car.speed) < 34 : true;
  if (pressure.nearest < BUST_RANGE && slow && game.wanted.stars > 0) {
    game.wanted.bustMeter += dt / BUST_TIME;
  } else {
    game.wanted.bustMeter = Math.max(0, game.wanted.bustMeter - dt * 0.7);
  }
  if (game.wanted.bustMeter >= 1) {
    game.wanted.bustMeter = 0;
    game.screen = 'busted';
    sfx.busted();
    setEngine(false, 0);
    setSiren(false, 0);
  }
}

/** Resolve a busted or downed player: pay the city, wake up somewhere safe. */
export function resolveTrouble(game, kind) {
  const fine = Math.min(game.money, Math.max(25, Math.round(game.money * 0.15)));
  game.money -= fine;
  game.wanted.heat = 0;
  game.wanted.stars = 0;
  game.wanted.bustMeter = 0;
  game.cars = game.cars.filter((c) => !c.police);
  if (game.player.car) {
    game.player.car.driver = null;
    game.player.car = null;
  }
  const zone = kind === 'busted' ? game.city.landmarks.police : game.city.landmarks.hospital;
  game.player.x = zone.x + zone.w / 2;
  game.player.y = zone.y + zone.h + 24;
  game.player.health = PLAYER_MAX_HEALTH;
  game.screen = 'play';
  game.notify(kind === 'busted' ? `Busted. The city takes $${fine}.` : `You wake at the hospital. $${fine} for the stitches.`);
  game.saveGame();
}

function downPlayer(game) {
  if (game.screen !== 'play') return;
  game.screen = 'down';
  sfx.fail();
  setEngine(false, 0);
  setSiren(false, 0);
}

function updateInteractions(game, dt) {
  const player = game.player;
  const city = game.city;
  game.garageCd -= dt;

  // Golden reels.
  for (const reel of city.reels) {
    if (reel.taken) continue;
    const rr = player.car ? 34 : 24;
    if ((reel.x - player.x) ** 2 + (reel.y - player.y) ** 2 < rr * rr) {
      reel.taken = true;
      game.reelsFound += 1;
      game.earn(REEL_VALUE);
      game.notify(`Golden reel ${game.reelsFound} of ${city.reels.length} — +$${REEL_VALUE}`);
      sfx.pickup();
      burst(game, reel.x, reel.y, 10, '#ffc400', 80, 0.5, 3);
      game.saveGame();
    }
  }

  // Food stands.
  game.nearStand = null;
  if (!player.car) {
    for (const stand of city.stands) {
      if ((stand.x - player.x) ** 2 + (stand.y - player.y) ** 2 < 30 * 30) {
        game.nearStand = stand;
        break;
      }
    }
    if (game.nearStand && pressed('KeyE')) {
      if (game.money >= PRICE_FOOD && player.health < PLAYER_MAX_HEALTH) {
        game.money -= PRICE_FOOD;
        player.health = Math.min(PLAYER_MAX_HEALTH, player.health + 50);
        sfx.heal();
        game.notify('Tacos acquired. You feel human again.');
      } else if (game.money < PRICE_FOOD) {
        game.notify('Not enough cash for food.');
      }
    }
  }

  // Sunset Customs: repair and respray while wanted or damaged.
  const g = city.landmarks.garage;
  game.nearGarage = player.car
    && player.x > g.x - 10 && player.x < g.x + g.w + 10
    && player.y > g.y - 10 && player.y < g.y + g.h + 10;
  if (game.nearGarage && game.garageCd <= 0 && (game.wanted.stars > 0 || player.car.health < 100)) {
    if (game.money >= PRICE_RESPRAY) {
      game.money -= PRICE_RESPRAY;
      game.wanted.heat = 0;
      game.wanted.stars = 0;
      player.car.health = 100;
      game.garageCd = 4;
      sfx.cash();
      game.notify('Sunset Customs: fresh paint, clean plates. You are nobody again.');
      burst(game, player.car.x, player.car.y, 16, '#39c2d7', 90, 0.6, 3);
    } else {
      game.notify(`Sunset Customs needs $${PRICE_RESPRAY} to make you invisible.`);
      game.garageCd = 4;
    }
  }
}
