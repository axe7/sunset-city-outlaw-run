// Keyboard and mouse state for the game. The game reads `keys` for held
// controls (driving, walking) and queues one-shot presses (enter car, pause)
// so a tap between frames is never lost.

export const keys = new Set();
const pressedQueue = new Set();
export const mouse = { x: 0, y: 0, down: false, clicked: false };

let attached = false;

/** Wire the listeners onto the canvas. Safe to call once. */
export function attachInput(canvas) {
  if (attached) return;
  attached = true;
  window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (!keys.has(e.code)) pressedQueue.add(e.code);
    keys.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.down = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    mouse.y = ((e.clientY - rect.top) / rect.height) * canvas.height;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** True once for each physical press of the given code, then consumed. */
export function pressed(code) {
  if (pressedQueue.has(code)) {
    pressedQueue.delete(code);
    return true;
  }
  return false;
}

/** Call at the end of a frame: drops unconsumed one-shot events. */
export function endFrameInput() {
  pressedQueue.clear();
  mouse.clicked = false;
}

/** Held movement as a unit-ish vector from WASD or the arrow keys. */
export function moveVector() {
  let x = 0;
  let y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  if (x !== 0 && y !== 0) {
    const inv = Math.SQRT1_2;
    x *= inv;
    y *= inv;
  }
  return { x, y };
}
