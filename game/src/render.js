// Rendering: the whole look of Sunset City. A top-down camera with a chase
// feel; buildings drawn as low extrusions (shadow, side walls, roof) so the
// sunset rakes across them; cars with glass, lights and damage smoke; people
// as little two-tone figures with a walk bob. Everything is drawn from the
// game state each frame — nothing is pre-rendered, no image files exist.

import {
  PITCH, ROAD_HALF, COLS, ROWS, CITY_W, BEACH_W, WORLD_W, WORLD_H, PALETTE,
} from './config.js';
import { clamp, lerp } from './rng.js';

export function createCamera() {
  return { x: 0, y: 0, zoom: 1 };
}

/** Ease the camera after its target, looking ahead of movement, zooming out with speed. */
export function updateCamera(cam, target, dt) {
  const lead = 0.32;
  const tx = target.x + (target.vx ?? 0) * lead;
  const ty = target.y + (target.vy ?? 0) * lead;
  const k = 1 - Math.pow(0.0001, dt); // fast but smooth catch-up
  cam.x = lerp(cam.x, tx, k * 0.6);
  cam.y = lerp(cam.y, ty, k * 0.6);
  const speed = Math.hypot(target.vx ?? 0, target.vy ?? 0);
  const wantZoom = target.inCar ? clamp(1.14 - speed / 1100, 0.88, 1.1) : 1.22;
  cam.zoom = lerp(cam.zoom, wantZoom, 1 - Math.pow(0.01, dt));
  cam.x = clamp(cam.x, 200, WORLD_W - 200);
  cam.y = clamp(cam.y, 200, WORLD_H - 200);
}

/** The world-space rectangle the camera can see. */
export function viewRect(cam, canvas) {
  const w = canvas.width / cam.zoom;
  const h = canvas.height / cam.zoom;
  return { x: cam.x - w / 2, y: cam.y - h / 2, w, h };
}

function inView(view, x, y, pad = 90) {
  return x > view.x - pad && x < view.x + view.w + pad && y > view.y - pad && y < view.y + view.h + pad;
}

// ---- Ground ---------------------------------------------------------------

function drawGround(ctx, city, view, time) {
  // Base: block ground (concrete/sand tone).
  ctx.fillStyle = PALETTE.blockGround;
  ctx.fillRect(view.x, view.y, view.w, view.h);

  // Parks are green, plazas pale stone, parking lots dark asphalt.
  for (const p of city.parks) {
    if (!inView(view, p.x + p.w / 2, p.y + p.h / 2, 200)) continue;
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fillRect(p.x, p.y + p.h / 2 - 5, p.w, 10);
    ctx.fillRect(p.x + p.w / 2 - 5, p.y, 10, p.h);
  }
  for (const p of city.plazas) {
    if (!inView(view, p.x + p.w / 2, p.y + p.h / 2, 200)) continue;
    ctx.fillStyle = '#d9c6a5';
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }
  for (const p of city.parkingLots) {
    if (!inView(view, p.x + p.w / 2, p.y + p.h / 2, 200)) continue;
    ctx.fillStyle = '#57505a';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (const s of city.parkingSpots) {
      if (s.x >= p.x && s.x <= p.x + p.w && s.y >= p.y && s.y <= p.y + p.h) {
        ctx.strokeRect(s.x - 13, s.y - 20, 26, 40);
      }
    }
  }

  // Roads: full-length strips along both grid axes, then centre dashes.
  ctx.fillStyle = PALETTE.asphalt;
  for (let k = 0; k <= COLS; k += 1) {
    const x = k * PITCH;
    if (x + ROAD_HALF < view.x || x - ROAD_HALF > view.x + view.w) continue;
    ctx.fillRect(x - ROAD_HALF, view.y, ROAD_HALF * 2, view.h);
  }
  for (let k = 0; k <= ROWS; k += 1) {
    const y = k * PITCH;
    if (y + ROAD_HALF < view.y || y - ROAD_HALF > view.y + view.h) continue;
    ctx.fillRect(view.x, y - ROAD_HALF, view.w, ROAD_HALF * 2);
  }
  ctx.fillStyle = 'rgba(255, 214, 120, 0.75)';
  const dashLen = 26;
  const gap = 30;
  for (let k = 0; k <= COLS; k += 1) {
    const x = k * PITCH;
    if (x < view.x - 10 || x > view.x + view.w + 10) continue;
    for (let y = Math.floor(view.y / (dashLen + gap)) * (dashLen + gap); y < view.y + view.h; y += dashLen + gap) {
      ctx.fillRect(x - 2, y, 4, dashLen);
    }
  }
  for (let k = 0; k <= ROWS; k += 1) {
    const y = k * PITCH;
    if (y < view.y - 10 || y > view.y + view.h + 10) continue;
    for (let x = Math.floor(view.x / (dashLen + gap)) * (dashLen + gap); x < view.x + view.w; x += dashLen + gap) {
      ctx.fillRect(x, y - 2, dashLen, 4);
    }
  }
  // Sidewalk rims where blocks meet roads.
  ctx.strokeStyle = 'rgba(70, 58, 50, 0.35)';
  ctx.lineWidth = 3;
  for (let i = 0; i < COLS; i += 1) {
    for (let j = 0; j < ROWS; j += 1) {
      const bx = i * PITCH + ROAD_HALF;
      const by = j * PITCH + ROAD_HALF;
      if (!inView(view, bx + 86, by + 86, 130)) continue;
      ctx.strokeRect(bx, by, PITCH - ROAD_HALF * 2, PITCH - ROAD_HALF * 2);
    }
  }

  // Beach and ocean.
  const sandX = CITY_W + ROAD_HALF;
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(sandX, view.y, CITY_W + BEACH_W - sandX, view.h);
  const waterX = CITY_W + BEACH_W;
  const grad = ctx.createLinearGradient(waterX, 0, WORLD_W, 0);
  grad.addColorStop(0, PALETTE.water);
  grad.addColorStop(1, PALETTE.waterDeep);
  ctx.fillStyle = grad;
  ctx.fillRect(waterX, view.y, WORLD_W - waterX, view.h);
  // Sun glitter on the water: short bright dashes drifting with time.
  ctx.strokeStyle = 'rgba(255, 220, 150, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 26; i += 1) {
    const gx = waterX + 16 + ((i * 173) % Math.max(40, WORLD_W - waterX - 30));
    const gy = ((i * 389 + Math.floor(time * 22)) % Math.floor(view.h + 60)) + view.y - 30;
    if (gy < view.y - 20 || gy > view.y + view.h + 20) continue;
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + 14 + (i % 4) * 5, gy);
  }
  ctx.stroke();
  // Foam line at the shore.
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let y = view.y; y < view.y + view.h; y += 22) {
    const wobble = Math.sin(y * 0.05 + time * 1.6) * 4;
    ctx.moveTo(waterX + wobble, y);
    ctx.lineTo(waterX + wobble, y + 12);
  }
  ctx.stroke();

  // The pier: planks over the water.
  if (city.pier) {
    const p = city.pier;
    ctx.fillStyle = '#9a7350';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = 'rgba(60, 38, 20, 0.5)';
    ctx.lineWidth = 2;
    for (let x = p.x + 12; x < p.x + p.w; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, p.y);
      ctx.lineTo(x, p.y + p.h);
      ctx.stroke();
    }
    ctx.fillStyle = '#7c5a3c';
    ctx.fillRect(p.x, p.y, p.w, 6);
    ctx.fillRect(p.x, p.y + p.h - 6, p.w, 6);
  }
}

// ---- Props ------------------------------------------------------------------

function drawTree(ctx, tree) {
  const s = tree.s;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(tree.x + 7 * s, tree.y + 9 * s, 13 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.palmTrunk;
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.moveTo(tree.x, tree.y + 6 * s);
  ctx.quadraticCurveTo(tree.x + 3 * s, tree.y, tree.x + 6 * s, tree.y - 6 * s);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.palmLeaf;
  ctx.lineWidth = 3.4 * s;
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2 + tree.x * 0.01;
    ctx.beginPath();
    ctx.moveTo(tree.x + 6 * s, tree.y - 6 * s);
    ctx.quadraticCurveTo(
      tree.x + 6 * s + Math.cos(a) * 13 * s, tree.y - 6 * s + Math.sin(a) * 9 * s - 4 * s,
      tree.x + 6 * s + Math.cos(a) * 19 * s, tree.y - 6 * s + Math.sin(a) * 14 * s + 3 * s,
    );
    ctx.stroke();
  }
}

function drawStand(ctx, stand) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(stand.x - 13, stand.y - 6, 30, 20);
  ctx.fillStyle = '#8a6844';
  ctx.fillRect(stand.x - 12, stand.y - 10, 24, 18);
  const canopy = { tacos: '#ef476f', fruit: '#06d6a0', coffee: '#118ab2' }[stand.kind] ?? '#ef476f';
  ctx.fillStyle = canopy;
  ctx.beginPath();
  ctx.moveTo(stand.x - 16, stand.y - 10);
  ctx.lineTo(stand.x, stand.y - 22);
  ctx.lineTo(stand.x + 16, stand.y - 10);
  ctx.closePath();
  ctx.fill();
}

function drawReel(ctx, reel, time) {
  const bob = Math.sin(time * 3 + reel.x) * 2.5;
  const pulse = 0.75 + Math.sin(time * 4 + reel.y) * 0.25;
  ctx.fillStyle = `rgba(255, 196, 0, ${0.22 * pulse})`;
  ctx.beginPath();
  ctx.arc(reel.x, reel.y + bob, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffc400';
  ctx.beginPath();
  ctx.arc(reel.x, reel.y + bob, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8a5a00';
  for (let k = 0; k < 3; k += 1) {
    const a = time * 1.5 + (k * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.arc(reel.x + Math.cos(a) * 4.4, reel.y + bob + Math.sin(a) * 4.4, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBuilding(ctx, b) {
  const lift = b.height * 0.55;
  // Ground shadow, thrown long by the low sun.
  ctx.fillStyle = 'rgba(40, 16, 30, 0.28)';
  ctx.fillRect(b.x + 10 + lift * 0.4, b.y + 12 + lift * 0.3, b.w, b.h);
  // Side walls (south and east faces of the extrusion).
  ctx.fillStyle = b.side;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y + b.h - lift);
  ctx.lineTo(b.x + b.w, b.y + b.h - lift);
  ctx.lineTo(b.x + b.w, b.y + b.h);
  ctx.lineTo(b.x, b.y + b.h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.moveTo(b.x + b.w, b.y - lift);
  ctx.lineTo(b.x + b.w, b.y + b.h - lift);
  ctx.lineTo(b.x + b.w, b.y + b.h);
  ctx.closePath();
  ctx.fill();
  // Roof.
  ctx.fillStyle = b.roof;
  ctx.fillRect(b.x, b.y - lift, b.w, b.h);
  ctx.strokeStyle = 'rgba(60, 30, 40, 0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x + 3, b.y - lift + 3, b.w - 6, b.h - 6);
  // Rooftop clutter: a water tank / AC box on bigger roofs.
  if (b.w > 90 && b.h > 90) {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(b.x + b.w * 0.6, b.y - lift + b.h * 0.18, 20, 15);
    ctx.fillRect(b.x + b.w * 0.2, b.y - lift + b.h * 0.62, 14, 11);
  }
  if (b.sign) {
    ctx.save();
    ctx.translate(b.x + b.w / 2, b.y - lift + b.h / 2);
    ctx.fillStyle = 'rgba(40, 10, 30, 0.72)';
    ctx.font = `bold ${Math.max(11, Math.min(17, b.w / 9))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.sign, 0, 0);
    ctx.restore();
  }
}

// ---- Vehicles and people ----------------------------------------------------

export function drawCar(ctx, car, time) {
  const { w, h } = car;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(30, 10, 25, 0.3)';
  roundRect(ctx, -w / 2 + 4, -h / 2 + 6, w, h, 6);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.wrecked ? '#3c3a3e' : car.color;
  roundRect(ctx, -w / 2, -h / 2, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  if (!car.wrecked) {
    // Cabin and glass.
    ctx.fillStyle = 'rgba(18, 24, 34, 0.9)';
    roundRect(ctx, -w * 0.16, -h * 0.4, w * 0.34, h * 0.8, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(140, 200, 235, 0.85)';
    roundRect(ctx, w * 0.14, -h * 0.38, w * 0.07, h * 0.76, 3);
    ctx.fill();
    roundRect(ctx, -w * 0.3, -h * 0.38, w * 0.08, h * 0.76, 3);
    ctx.fill();
    // Headlights and tail lights.
    ctx.fillStyle = '#fff6c9';
    ctx.fillRect(w / 2 - 3, -h / 2 + 2, 3, 4);
    ctx.fillRect(w / 2 - 3, h / 2 - 6, 3, 4);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-w / 2, -h / 2 + 2, 3, 4);
    ctx.fillRect(-w / 2, h / 2 - 6, 3, 4);
  }
  if (car.police) {
    // Light bar: alternating red/blue flash.
    const phase = Math.floor(time * 6 + car.sirenPhase) % 2;
    ctx.fillStyle = phase ? '#ff2d55' : '#5e2b97';
    ctx.fillRect(-6, -h / 2 + 1, 12, 5);
    ctx.fillStyle = phase ? '#2f7bff' : '#97182e';
    ctx.fillRect(-6, h / 2 - 6, 12, 5);
    ctx.fillStyle = 'rgba(20,20,26,0.85)';
    ctx.font = 'bold 7px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POLICE', 0, 2.5);
  }
  if (car.missionCar) {
    ctx.strokeStyle = '#ffc400';
    ctx.lineWidth = 2;
    roundRect(ctx, -w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 8);
    ctx.stroke();
  }
  ctx.restore();

  // Damage smoke, puffed in world space so it trails behind.
  if (!car.wrecked && car.health < 45) {
    const puff = (Math.sin(time * 7 + car.id * 3) + 1) / 2;
    ctx.fillStyle = `rgba(60, 58, 62, ${0.25 + puff * 0.2})`;
    ctx.beginPath();
    ctx.arc(car.x + Math.cos(car.angle) * w * 0.4, car.y - 8 - puff * 7, 5 + puff * 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawPerson(ctx, ped, time, isPlayer = false) {
  const bob = ped.state === 'down' ? 0 : Math.sin(ped.phase) * 1.1;
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(30, 10, 25, 0.28)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 8, 4.6, 0, 0, Math.PI * 2);
  ctx.fill();
  if (ped.state === 'down') {
    ctx.rotate(ped.angle);
    ctx.globalAlpha = clamp(1.6 - ped.downTime * 0.25, 0, 1);
    ctx.fillStyle = ped.shirt;
    roundRect(ctx, -10, -5, 20, 10, 5);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(12, 0, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(ped.angle);
  // Legs.
  ctx.strokeStyle = ped.pants;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(0, -2.5);
  ctx.lineTo(-3 + bob * 1.6, -4.5);
  ctx.moveTo(0, 2.5);
  ctx.lineTo(-3 - bob * 1.6, 4.5);
  ctx.stroke();
  // Torso.
  ctx.fillStyle = isPlayer ? '#0e7c86' : ped.shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  if (isPlayer) {
    ctx.fillStyle = '#ffd23e';
    ctx.fillRect(-2, -7.2, 4, 3);
  }
  // Head.
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(2.6, 0, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- The whole frame --------------------------------------------------------

export function drawWorld(ctx, game, view, time) {
  const city = game.city;
  drawGround(ctx, city, view, time);

  // Collectibles and props.
  for (const reel of city.reels) {
    if (!reel.taken && inView(view, reel.x, reel.y, 40)) drawReel(ctx, reel, time);
  }
  for (const stand of city.stands) {
    if (inView(view, stand.x, stand.y, 50)) drawStand(ctx, stand);
  }
  for (const tree of city.trees) {
    if (inView(view, tree.x, tree.y, 50)) drawTree(ctx, tree);
  }

  // Mission beacon: a pillar of light on the objective.
  const marker = game.marker;
  if (marker) {
    const pulse = 0.65 + Math.sin(time * 4) * 0.3;
    const grad = ctx.createLinearGradient(0, marker.y - 320, 0, marker.y);
    grad.addColorStop(0, 'rgba(255, 196, 0, 0)');
    grad.addColorStop(1, `rgba(255, 196, 0, ${0.4 * pulse})`);
    ctx.fillStyle = grad;
    ctx.fillRect(marker.x - 13, marker.y - 320, 26, 320);
    ctx.strokeStyle = `rgba(255, 196, 0, ${0.9 * pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 20 + Math.sin(time * 4) * 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Buildings, north to south so the extrusions overlap honestly.
  const visible = city.buildings.filter((b) => inView(view, b.x + b.w / 2, b.y + b.h / 2, 260));
  visible.sort((a, b) => a.y - b.y);
  for (const b of visible) drawBuilding(ctx, b);

  // Cars, then people, then the player on top.
  for (const car of game.cars) {
    if (inView(view, car.x, car.y, 80)) drawCar(ctx, car, time);
  }
  for (const ped of game.peds) {
    if (inView(view, ped.x, ped.y, 40)) drawPerson(ctx, ped, time);
  }
  if (!game.player.car) {
    drawPerson(ctx, game.player, time, true);
    // The player's aim: a short gun line toward the mouse when armed.
    if (game.player.armed && game.screen === 'play') {
      ctx.strokeStyle = 'rgba(20, 20, 26, 0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(game.player.x + Math.cos(game.player.aim) * 8, game.player.y + Math.sin(game.player.aim) * 8);
      ctx.lineTo(game.player.x + Math.cos(game.player.aim) * 17, game.player.y + Math.sin(game.player.aim) * 17);
      ctx.stroke();
    }
  }

  // Bullets and particles.
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (const b of game.bullets) {
    ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  for (const p of game.particles) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Warm sunset wash and a soft vignette, in screen space. */
export function drawSunsetGrade(ctx, canvas) {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, 'rgba(255, 120, 60, 0.10)');
  grad.addColorStop(0.55, 'rgba(255, 80, 120, 0.04)');
  grad.addColorStop(1, 'rgba(40, 16, 80, 0.14)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
