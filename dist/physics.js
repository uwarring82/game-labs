// Metres, seconds. A deliberately planar model; spin and shaking are excluded.
export const W = 0.30, H = 0.36, R = 0.0075, STEP = 1 / 240;
export const MAX_SPEED = 0.85;
export const START = { x: 0.041, y: 0.043 };
export const GOAL = { x: 0.260, y: 0.319, r: 0.019 };
export const WALLS = [
  { x: 0, y: 0, w: W, h: 0.008 }, { x: 0, y: H - 0.008, w: W, h: 0.008 },
  { x: 0, y: 0, w: 0.008, h: H }, { x: W - 0.008, y: 0, w: 0.008, h: H },
  { x: 0.008, y: 0.088, w: 0.205, h: 0.009 },
  { x: 0.086, y: 0.174, w: 0.206, h: 0.009 },
  { x: 0.008, y: 0.260, w: 0.205, h: 0.009 },
  { x: 0.145, y: 0.183, w: 0.009, h: 0.025 }
];
export const HOLES = [
  { x: 0.164, y: 0.046, r: 0.016 },
  { x: 0.244, y: 0.142, r: 0.016 },
  { x: 0.060, y: 0.226, r: 0.016 },
  { x: 0.173, y: 0.306, r: 0.016 }
];
export const PRESETS = {
  classic: { damping: 0.12, resistance: 0.0015, restitution: 0.32, tangential: 0.035, holeInset: 0, restart: 800 },
  gentle: { damping: 1.5, resistance: 0.0015, restitution: 0.20, tangential: 0.055, holeInset: 0.003, restart: 420 }
};
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function angleDifference(a, b) { return ((a - b + 540) % 360) - 180; }
export function tiltVector(beta, gamma, neutral, screenAngle = 0) {
  const x = angleDifference(gamma, neutral.gamma), y = angleDifference(beta, neutral.beta);
  const t = screenAngle * Math.PI / 180;
  return { x: x * Math.cos(t) + y * Math.sin(t), y: -x * Math.sin(t) + y * Math.cos(t) };
}
export function filtered(current, target, dt, tau) {
  return current + (target - current) * (tau > 0 ? -Math.expm1(-dt / tau) : 1);
}
// Fraction of a straight segment within a circular, fully unsupported region.
export function circleInterval(x0, y0, x1, y1, hole, radius) {
  if (radius <= 0) return null;
  const dx = x1 - x0, dy = y1 - y0, ox = x0 - hole.x, oy = y0 - hole.y;
  const a = dx * dx + dy * dy, c = ox * ox + oy * oy - radius * radius;
  if (a < 1e-20) return c <= 0 ? [0, 1] : null;
  const b = 2 * (ox * dx + oy * dy), discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant), lo = Math.max(0, (-b - root) / (2 * a)), hi = Math.min(1, (-b + root) / (2 * a));
  return hi > lo ? [lo, hi] : null;
}
export function newBall() { return { ...START, vx: 0, vy: 0, holeTimes: HOLES.map(() => 0), skipped: 0 }; }
export function resolveWall(ball, wall, p) {
  const nx = clamp(ball.x, wall.x, wall.x + wall.w), ny = clamp(ball.y, wall.y, wall.y + wall.h);
  const dx = ball.x - nx, dy = ball.y - ny, d = Math.hypot(dx, dy);
  if (d >= R) return;
  let ux, uy, overlap;
  if (d > 1e-12) { ux = dx / d; uy = dy / d; overlap = R - d; }
  else {
    const edges = [ { d: ball.x - wall.x, x: -1, y: 0 }, { d: wall.x + wall.w - ball.x, x: 1, y: 0 }, { d: ball.y - wall.y, x: 0, y: -1 }, { d: wall.y + wall.h - ball.y, x: 0, y: 1 } ];
    const edge = edges.reduce((a, b) => a.d < b.d ? a : b); ux = edge.x; uy = edge.y; overlap = R + edge.d;
  }
  ball.x += ux * (overlap + 1e-9); ball.y += uy * (overlap + 1e-9);
  const normal = ball.vx * ux + ball.vy * uy;
  if (normal < 0) {
    const tx = ball.vx - normal * ux, ty = ball.vy - normal * uy;
    ball.vx = -p.restitution * normal * ux + tx * (1 - p.tangential);
    ball.vy = -p.restitution * normal * uy + ty * (1 - p.tangential);
  }
}
export function advance(ball, tilt, dt, options = {}) {
  const p = PRESETS[options.preset || 'classic'], sensitivity = options.sensitivity ?? 1;
  const walls = options.walls ?? WALLS, holes = options.holes ?? HOLES;
  // 4 mm effective lip-catching drop. Unsupported radius R_hole - R_ball.
  // This is a tunable rim model, not full 3D sphere/rim contact mechanics.
  const fallTime = Math.sqrt(2 * (options.catchDepth ?? 0.004) / 9.81);
  const count = Math.max(1, Math.ceil(MAX_SPEED * dt / (R * 0.25)));
  const h = dt / count;
  for (let n = 0; n < count; n++) {
    const rad = Math.PI / 180;
    ball.vx += 9.81 * (5 / 7) * Math.sin(clamp(tilt.x, -18, 18) * rad) * sensitivity * h;
    ball.vy += 9.81 * (5 / 7) * Math.sin(clamp(tilt.y, -18, 18) * rad) * sensitivity * h;
    let speed = Math.hypot(ball.vx, ball.vy);
    if (speed) {
      const next = Math.min(MAX_SPEED, Math.max(0, speed - p.resistance * 9.81 * h) * Math.exp(-p.damping * h));
      ball.vx *= next / speed; ball.vy *= next / speed;
    }
    const x0 = ball.x, y0 = ball.y;
    ball.x += ball.vx * h; ball.y += ball.vy * h;
    // Iteration resolves perpendicular contacts at internal corners.
    for (let k = 0; k < 3; k++) for (const wall of walls) resolveWall(ball, wall, p);
    for (let i = 0; i < holes.length; i++) {
      const hole = holes[i], radius = hole.r - R - p.holeInset;
      const interval = circleInterval(x0, y0, ball.x, ball.y, hole, radius);
      if (interval) {
        if (interval[0] > 1e-9) ball.holeTimes[i] = 0;
        ball.holeTimes[i] = (ball.holeTimes[i] || 0) + (interval[1] - interval[0]) * h;
        if (ball.holeTimes[i] >= fallTime) return { type: 'fall', hole: i };
        if (interval[1] < 1 - 1e-9) { ball.holeTimes[i] = 0; ball.skipped++; }
      } else ball.holeTimes[i] = 0;
    }
    if (options.goal !== false && Math.hypot(ball.x - GOAL.x, ball.y - GOAL.y) < GOAL.r - R && Math.hypot(ball.vx, ball.vy) < 0.12) return { type: 'win' };
  }
  return null;
}
export class FixedClock {
  constructor() { this.last = null; this.accumulator = 0; }
  reset() { this.last = null; this.accumulator = 0; }
  tick(now, running, step) {
    if (this.last === null) { this.last = now; return 0; }
    const elapsed = Math.min(0.05, Math.max(0, (now - this.last) / 1000)); this.last = now;
    if (!running) { this.accumulator = 0; return 0; }
    this.accumulator += elapsed;
    let count = 0;
    while (this.accumulator >= STEP && count < 12) {
      this.accumulator -= STEP; count++;
      if (step(STEP) === false) { this.accumulator = 0; break; }
    }
    return count;
  }
}
