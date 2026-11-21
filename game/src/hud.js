// The HUD: money, health and weapon at the top left; wanted stars at the top
// right; the current objective under a distance readout at the top centre;
// dialogue and notices along the bottom; and the minimap — a little painted
// Sunset City with the player, the police and the job marked on it.

import { WORLD_W, WORLD_H, CITY_W, BEACH_W, HEAT_PER_STAR, MAX_STARS, REEL_COUNT } from './config.js';
import { clamp } from './rng.js';

let minimapBase = null;

function buildMinimapBase(city) {
  const c = document.createElement('canvas');
  c.width = 228;
  c.height = 164;
  const g = c.getContext('2d');
  const sx = c.width / WORLD_W;
  const sy = c.height / WORLD_H;
  g.fillStyle = '#256b8f';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#c9b18c';
  g.fillRect(0, 0, (CITY_W + BEACH_W) * sx, c.height);
  g.fillStyle = '#f0d089';
  g.fillRect(CITY_W * sx, 0, BEACH_W * sx, c.height);
  g.strokeStyle = 'rgba(40, 34, 40, 0.85)';
  g.lineWidth = 1.6;
  for (let k = 0; k <= 10; k += 1) {
    g.beginPath();
    g.moveTo(k * 256 * sx, 0);
    g.lineTo(k * 256 * sx, c.height);
    g.stroke();
  }
  for (let k = 0; k <= 9; k += 1) {
    g.beginPath();
    g.moveTo(0, k * 256 * sy);
    g.lineTo(CITY_W * sx, k * 256 * sy);
    g.stroke();
  }
  g.fillStyle = 'rgba(70, 50, 60, 0.8)';
  for (const b of city.buildings) {
    g.fillRect(b.x * sx, b.y * sy, Math.max(1.6, b.w * sx), Math.max(1.6, b.h * sy));
  }
  // Landmark dots: diner gold, garage cyan, police blue, hospital white.
  const dots = { diner: '#ffc400', garage: '#39c2d7', police: '#7fb2ff', hospital: '#ffffff' };
  for (const [kind, z] of Object.entries(city.landmarks)) {
    g.fillStyle = dots[kind] ?? '#fff';
    g.beginPath();
    g.arc((z.x + z.w / 2) * sx, (z.y + z.h / 2) * sy, 2.6, 0, Math.PI * 2);
    g.fill();
  }
  minimapBase = c;
  return c;
}

function star(ctx, cx, cy, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(ang) * rr;
    const y = cy + Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function pill(ctx, x, y, w, h, alpha = 0.55) {
  ctx.fillStyle = `rgba(16, 10, 22, ${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
}

export function drawHud(ctx, game, canvas, time) {
  const W = canvas.width;
  const H = canvas.height;
  const player = game.player;
  ctx.save();
  ctx.textBaseline = 'middle';

  // ---- Top left: money, health, weapon, reels.
  pill(ctx, 14, 14, 208, 86);
  ctx.fillStyle = '#7dff9a';
  ctx.font = 'bold 25px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`$${game.money.toLocaleString('en-US')}`, 26, 40);
  // Health bar.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(26, 58, 150, 11);
  ctx.fillStyle = player.health > 30 ? '#ff5964' : (Math.sin(time * 8) > 0 ? '#ff5964' : '#ffffff');
  ctx.fillRect(26, 58, 150 * clamp(player.health / 100, 0, 1), 11);
  ctx.fillStyle = '#f4f1ea';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText(player.car ? player.car.model.name.toUpperCase() : (player.armed ? 'PISTOL' : 'FISTS'), 26, 86);
  ctx.fillStyle = '#ffc400';
  ctx.textAlign = 'right';
  ctx.fillText(`REELS ${game.reelsFound}/${REEL_COUNT}`, 210, 86);

  // ---- Top right: wanted stars. They blink while the heat is cooling unseen.
  const stars = game.wanted.stars;
  if (stars > 0 || game.wanted.heat > 4) {
    pill(ctx, W - 196, 14, 182, 44);
    const cooling = !game.wanted.seenNow && game.wanted.timeSinceCrime > 3;
    for (let i = 0; i < MAX_STARS; i += 1) {
      const cx = W - 168 + i * 33;
      let fill = 'rgba(255,255,255,0.22)';
      if (i < stars) {
        fill = '#ffc400';
        if (cooling && Math.sin(time * 6) > 0.2) fill = 'rgba(255,196,0,0.35)';
      }
      star(ctx, cx, 36, 13, fill);
    }
    // Heat progress toward the next star.
    const frac = (game.wanted.heat % HEAT_PER_STAR) / HEAT_PER_STAR;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(W - 182, 52, 154, 3);
    ctx.fillStyle = '#ffc400';
    ctx.fillRect(W - 182, 52, 154 * frac, 3);
  }

  // ---- Top centre: the objective, with distance and any timer.
  if (game.objectiveText) {
    ctx.font = 'bold 16px system-ui, sans-serif';
    const dist = game.marker
      ? ` · ${Math.round(Math.hypot(game.marker.x - player.x, game.marker.y - player.y) / 4)}m`
      : '';
    const text = game.objectiveText + dist;
    const w = ctx.measureText(text).width + 30;
    pill(ctx, (W - w) / 2, 14, w, 36, 0.62);
    ctx.fillStyle = '#ffe9a8';
    ctx.textAlign = 'center';
    ctx.fillText(text, W / 2, 33);
    if (game.missions.active && game.missions.active.timer > 0) {
      const t = Math.max(0, game.missions.active.timer);
      const label = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillStyle = t < 25 && Math.sin(time * 9) > 0 ? '#ffffff' : '#ff5964';
      ctx.fillText(label, W / 2, 66);
    }
  }

  // ---- Bust meter: a red bar that fills while the law has hands on you.
  if (game.wanted.bustMeter > 0.02) {
    const w = 260;
    pill(ctx, (W - w) / 2, H - 148, w, 30, 0.7);
    ctx.fillStyle = '#ff2d55';
    ctx.fillRect((W - w) / 2 + 8, H - 140, (w - 16) * game.wanted.bustMeter, 14);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(game.player.car ? 'THEY ARE STOPPING YOU' : 'BUSTED?', W / 2, H - 140 + 7);
  }

  // ---- Dialogue box.
  if (game.dialogue) {
    const w = Math.min(680, W - 80);
    const x = (W - w) / 2;
    const y = H - 118;
    pill(ctx, x, y, w, 64, 0.78);
    ctx.textAlign = 'left';
    if (game.dialogue.speaker) {
      ctx.fillStyle = '#ffc400';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(game.dialogue.speaker, x + 16, y + 17);
    }
    ctx.fillStyle = '#f8f4ec';
    ctx.font = '15px system-ui, sans-serif';
    wrapText(ctx, game.dialogue.text, x + 16, y + 40, w - 32, 18);
  }

  // ---- Notices (stacked, fading).
  ctx.textAlign = 'center';
  game.notices.forEach((n, i) => {
    const a = clamp(n.ttl / 0.6, 0, 1);
    ctx.globalAlpha = a;
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(n.text, W / 2, 96 + i * 24);
    ctx.globalAlpha = 1;
  });

  // ---- Bottom left: contextual controls.
  ctx.textAlign = 'left';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  const hints = [];
  if (game.nearCar && !player.car) hints.push('F — get in the car');
  if (game.nearStand && player.health < 100) hints.push('E — grab food ($25)');
  if (player.car) hints.push('W A S D — drive · SPACE — handbrake · F — get out');
  else hints.push('W A S D — walk · SHIFT — run · mouse — aim · click — fight/shoot');
  hints.push('P — pause · M — mute');
  hints.forEach((h, i) => ctx.fillText(h, 16, H - 52 + i * 17));

  // ---- Bottom right: the minimap.
  const base = minimapBase ?? buildMinimapBase(game.city);
  const mw = base.width;
  const mh = base.height;
  const mx = W - mw - 14;
  const my = H - mh - 14;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(mx, my, mw, mh, 10);
  ctx.clip();
  ctx.drawImage(base, mx, my);
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  // Police blips flash red/blue.
  for (const car of game.cars) {
    if (!car.police || car.wrecked) continue;
    ctx.fillStyle = Math.floor(time * 5) % 2 ? '#ff2d55' : '#2f7bff';
    ctx.beginPath();
    ctx.arc(mx + car.x * sx, my + car.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // The job marker.
  if (game.marker) {
    ctx.fillStyle = '#ffc400';
    ctx.beginPath();
    ctx.arc(mx + game.marker.x * sx, my + game.marker.y * sy, 4 + Math.sin(time * 5) * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // The player: a white arrow that turns with him (or his car).
  const facing = player.car ? player.car.angle : player.angle;
  ctx.translate(mx + player.x * sx, my + player.y * sy);
  ctx.rotate(facing);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(mx, my, mw, mh, 10);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SUNSET CITY', mx + 8, my + 12);
  // Speed, when driving.
  if (player.car) {
    ctx.font = 'bold 19px system-ui, sans-serif';
    ctx.fillStyle = '#f4f1ea';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(Math.abs(player.car.speed) / 3.1)} MPH`, mx + mw, my - 12);
  }

  // ---- Low health: a closing red edge.
  if (player.health < 30 && game.screen === 'play') {
    const a = 0.16 + 0.1 * Math.sin(time * 6);
    const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.72);
    grad.addColorStop(0, 'rgba(200, 0, 30, 0)');
    grad.addColorStop(1, `rgba(200, 0, 30, ${a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}
