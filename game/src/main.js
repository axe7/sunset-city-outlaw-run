// Boot and the frame loop. main.js owns the canvas, the camera, the DOM
// overlays (title, pause, busted, down-and-out) and the wiring between the
// input module, the simulation in game.js, the renderer and the HUD.
// With ?shot=<name> it stages a screenshot scene instead of the title.

import { attachInput, endFrameInput, mouse, pressed, keys } from './input.js';
import { createGame, updateGame, resolveTrouble } from './game.js';
import { createCamera, updateCamera, viewRect, drawWorld, drawSunsetGrade } from './render.js';
import { drawHud } from './hud.js';
import { initAudio, startMusic, toggleMute } from './audio.js';
import { stageShot } from './shots.js';
import { WORLD_W, WORLD_H } from './config.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 20261119) || 20261119;
const shotName = params.get('shot');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();
attachInput(canvas);

const game = createGame(seed);
const cam = createCamera();
cam.x = game.player.x;
cam.y = game.player.y;

// ---- Overlays ---------------------------------------------------------------

const overlays = {
  title: document.getElementById('overlay-title'),
  pause: document.getElementById('overlay-pause'),
  busted: document.getElementById('overlay-busted'),
  down: document.getElementById('overlay-down'),
};
function showOverlay(name) {
  for (const [key, el] of Object.entries(overlays)) {
    if (el) el.hidden = key !== name;
  }
}
const continueBtn = document.getElementById('btn-continue');
if (continueBtn) continueBtn.hidden = !game.hasSave();

let audioStarted = false;
function begin(fromSave) {
  initAudio();
  if (!audioStarted) {
    startMusic();
    audioStarted = true;
  }
  game.newGame(fromSave);
  showOverlay(null);
}
document.getElementById('btn-new')?.addEventListener('click', () => begin(false));
continueBtn?.addEventListener('click', () => begin(true));
document.getElementById('btn-resume')?.addEventListener('click', () => {
  game.screen = 'play';
  showOverlay(null);
});
document.getElementById('btn-busted')?.addEventListener('click', () => {
  resolveTrouble(game, 'busted');
  showOverlay(null);
});
document.getElementById('btn-down')?.addEventListener('click', () => {
  resolveTrouble(game, 'down');
  showOverlay(null);
});

// ---- Screenshot staging -------------------------------------------------------

let shotFrozen = false;
game.aimWorld = { x: game.player.x + 40, y: game.player.y };
game.mouseDown = false;
game.mouseClicked = false;
if (shotName && stageShot(game, shotName)) {
  document.body.classList.add('shotmode');
  showOverlay(null);
  // Run a fixed slice of simulation so the frame is alive, then freeze it:
  // the same seed and scene always produce the same screenshot.
  const steps = shotName === 'chase' ? 50 : shotName === 'drive' ? 55 : 80;
  // Driving scenes keep the throttle down so the frame has real speed in it.
  if (shotName !== 'foot') keys.add('KeyW');
  for (let i = 0; i < steps; i += 1) updateGame(game, 1 / 30);
  keys.delete('KeyW');
  cam.x = game.player.x;
  cam.y = game.player.y;
  // Settle the camera zoom to what gameplay would use for this scene.
  for (let i = 0; i < 10; i += 1) {
    updateCamera(cam, {
      x: game.player.x, y: game.player.y,
      vx: game.player.vx, vy: game.player.vy, inCar: !!game.player.car,
    }, 0.3);
  }
  cam.x = game.player.x;
  cam.y = game.player.y;
  shotFrozen = true;
  window.__shotReady = true;
} else {
  showOverlay('title');
}

// ---- The loop -----------------------------------------------------------------

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  if (dt <= 0) dt = 0.0001;

  // Screen-to-world mouse for aiming.
  game.aimWorld = {
    x: cam.x + (mouse.x - canvas.width / 2) / cam.zoom,
    y: cam.y + (mouse.y - canvas.height / 2) / cam.zoom,
  };
  game.mouseDown = mouse.down;
  game.mouseClicked = mouse.clicked;

  if (!shotFrozen) {
    if (game.screen === 'play' && (pressed('KeyP') || pressed('Escape'))) {
      game.screen = 'paused';
      showOverlay('pause');
    }
    if (pressed('KeyM')) toggleMute();
    const wasScreen = game.screen;
    updateGame(game, dt);
    if (game.screen === 'busted' && wasScreen === 'play') showOverlay('busted');
    if (game.screen === 'down' && wasScreen === 'play') showOverlay('down');
  }

  // Camera: follow the player, or drift over downtown behind the title.
  if (game.screen === 'title') {
    const t = game.camDrift * 0.07;
    updateCamera(cam, {
      x: WORLD_W / 2 + Math.cos(t) * 500,
      y: WORLD_H / 2 + Math.sin(t * 1.3) * 320,
      vx: 0, vy: 0, inCar: false,
    }, dt);
  } else {
    const p = game.player;
    updateCamera(cam, { x: p.x, y: p.y, vx: p.vx, vy: p.vy, inCar: !!p.car }, dt);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1d1420';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const view = viewRect(cam, canvas);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
  drawWorld(ctx, game, view, game.time);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawSunsetGrade(ctx, canvas);
  if (game.screen !== 'title') drawHud(ctx, game, canvas, game.time);

  endFrameInput();
}
requestAnimationFrame(frame);
