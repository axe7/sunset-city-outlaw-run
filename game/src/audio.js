// All sound in Sunset City is synthesised with WebAudio — no audio files.
// A tiny synth kit (oscillator blips, filtered noise) plays effects, an
// engine hum follows the player's car, police sirens wail when they are
// close, and a four-chord synthwave loop (A minor, F, C, G) drifts under
// everything like radio from a beach bar.

let ctx = null;
let master = null;
let engineNodes = null;
let sirenNodes = null;
let musicTimer = null;
let musicStep = 0;
export let muted = false;

/** Create the context. Must be called from a user gesture (start button). */
export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

function env(gain, t0, peak, decay) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
}

function tone({ type = 'sine', from = 440, to = null, dur = 0.15, vol = 0.2, when = 0 }) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);
  env(gain, t0, vol, dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise({ dur = 0.2, vol = 0.25, freq = 1200, q = 0.8, type = 'bandpass', when = 0 }) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + when;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  env(gain, t0, vol, dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t0);
}

// ---- One-shot effects -----------------------------------------------------

export const sfx = {
  shot() {
    noise({ dur: 0.13, vol: 0.5, freq: 2600, q: 0.4 });
    tone({ type: 'square', from: 220, to: 60, dur: 0.1, vol: 0.22 });
  },
  punch() {
    noise({ dur: 0.08, vol: 0.3, freq: 500, q: 0.6 });
    tone({ type: 'sine', from: 140, to: 70, dur: 0.09, vol: 0.25 });
  },
  hurt() {
    tone({ type: 'sawtooth', from: 300, to: 140, dur: 0.16, vol: 0.2 });
  },
  crash(big = false) {
    noise({ dur: big ? 0.4 : 0.2, vol: big ? 0.55 : 0.32, freq: 300, q: 0.3, type: 'lowpass' });
    tone({ type: 'sine', from: 120, to: 45, dur: big ? 0.35 : 0.18, vol: 0.3 });
  },
  skid() {
    noise({ dur: 0.16, vol: 0.1, freq: 2800, q: 2.5 });
  },
  door() {
    tone({ type: 'square', from: 180, to: 90, dur: 0.07, vol: 0.14 });
    noise({ dur: 0.05, vol: 0.12, freq: 900 });
  },
  pickup() {
    tone({ type: 'sine', from: 660, dur: 0.09, vol: 0.2 });
    tone({ type: 'sine', from: 990, dur: 0.14, vol: 0.2, when: 0.07 });
  },
  cash() {
    tone({ type: 'triangle', from: 880, dur: 0.07, vol: 0.22 });
    tone({ type: 'triangle', from: 1174, dur: 0.07, vol: 0.22, when: 0.06 });
    tone({ type: 'triangle', from: 1568, dur: 0.16, vol: 0.22, when: 0.12 });
  },
  mission() {
    [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.22, vol: 0.22, when: i * 0.09 }));
  },
  fail() {
    [392, 330, 262].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.24, vol: 0.2, when: i * 0.12 }));
  },
  busted() {
    tone({ type: 'square', from: 620, dur: 0.16, vol: 0.18 });
    tone({ type: 'square', from: 465, dur: 0.3, vol: 0.18, when: 0.16 });
  },
  heal() {
    tone({ type: 'sine', from: 520, to: 780, dur: 0.18, vol: 0.18 });
  },
};

// ---- Engine and siren loops ----------------------------------------------

export function setEngine(on, speedRatio) {
  if (!ctx) return;
  if (on && !engineNodes) {
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    sub.type = 'square';
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    gain.gain.value = 0.0;
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain).connect(master);
    osc.start();
    sub.start();
    engineNodes = { osc, sub, filter, gain };
  }
  if (!on && engineNodes) {
    const nodes = engineNodes;
    engineNodes = null;
    nodes.gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
    setTimeout(() => {
      try { nodes.osc.stop(); nodes.sub.stop(); } catch { /* already stopped */ }
    }, 250);
    return;
  }
  if (engineNodes) {
    const t = ctx.currentTime;
    const base = 55 + speedRatio * 165;
    engineNodes.osc.frequency.setTargetAtTime(base, t, 0.06);
    engineNodes.sub.frequency.setTargetAtTime(base / 2, t, 0.06);
    engineNodes.filter.frequency.setTargetAtTime(400 + speedRatio * 1400, t, 0.08);
    engineNodes.gain.gain.setTargetAtTime(muted ? 0 : 0.05 + speedRatio * 0.05, t, 0.1);
  }
}

export function setSiren(on, closeness) {
  if (!ctx) return;
  if (on && !sirenNodes) {
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 800;
    lfo.type = 'sine';
    lfo.frequency.value = 0.65;
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(osc.frequency);
    gain.gain.value = 0;
    osc.connect(gain).connect(master);
    osc.start();
    lfo.start();
    sirenNodes = { osc, lfo, gain };
  }
  if (!on && sirenNodes) {
    const nodes = sirenNodes;
    sirenNodes = null;
    nodes.gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    setTimeout(() => {
      try { nodes.osc.stop(); nodes.lfo.stop(); } catch { /* already stopped */ }
    }, 300);
    return;
  }
  if (sirenNodes) {
    sirenNodes.gain.gain.setTargetAtTime(muted ? 0 : 0.012 + closeness * 0.05, ctx.currentTime, 0.15);
  }
}

// ---- The music loop --------------------------------------------------------
// Chords Am – F – C – G, one bar each: a soft detuned pad, a pulsing bass on
// the eighths and a brushed hat. Scheduled a bar ahead on a timer.

const CHORDS = [
  [110.0, 220.0, 261.63, 329.63],   // A minor
  [87.31, 174.61, 220.0, 261.63],   // F
  [130.81, 196.0, 261.63, 329.63],  // C
  [98.0, 196.0, 246.94, 293.66],    // G
];
const BAR_SECONDS = 2.4;

function playBar(step) {
  if (!ctx || muted) return;
  const chord = CHORDS[step % CHORDS.length];
  const [root, ...pad] = chord;
  for (const freq of pad) {
    tone({ type: 'triangle', from: freq, dur: BAR_SECONDS * 0.95, vol: 0.035 });
    tone({ type: 'sine', from: freq * 1.005, dur: BAR_SECONDS * 0.95, vol: 0.02 });
  }
  for (let i = 0; i < 8; i += 1) {
    tone({ type: 'sine', from: root, dur: 0.16, vol: i % 2 ? 0.05 : 0.085, when: i * (BAR_SECONDS / 8) });
    if (i % 2 === 0) noise({ dur: 0.03, vol: 0.012, freq: 7000, type: 'highpass', when: i * (BAR_SECONDS / 8) });
  }
}

export function startMusic() {
  if (!ctx || musicTimer !== null) return;
  playBar(musicStep);
  musicStep += 1;
  musicTimer = setInterval(() => {
    playBar(musicStep);
    musicStep += 1;
  }, BAR_SECONDS * 1000);
}

export function stopMusic() {
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}
