// Dice Box — headless engine checks.  Run:  node test/engine.test.js
// No framework: each check prints PASS/FAIL and the process exits non-zero on any failure.
'use strict';
const P = require('../src/phys.js');
const { DT, G0, World, makeShake, mulberry32 } = P;

let failures = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); if (!ok) failures++; }
const axes = q => { const [x, y, z, w] = q; const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [[1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy)], [2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx)], [2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy)]]; };
const setQ = (d, q) => { d.q = q; d.A = axes(q); };
const tiltDeg = d => Math.acos(Math.max(-1, Math.min(1, d.A[2][2]))) * 180 / Math.PI;
const run = (w, seconds, fn) => { let t = 0; while (t < seconds) { if (fn) fn(t); w.step(); t += DT; } };
const randQ = r => { const u1 = r(), u2 = r(), u3 = r(), a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return [a * Math.sin(2 * Math.PI * u2), a * Math.cos(2 * Math.PI * u2), b * Math.sin(2 * Math.PI * u3), b * Math.cos(2 * Math.PI * u3)]; };
const chi2 = counts => { const n = counts.reduce((a, b) => a + b, 0), E = n / 6; return counts.reduce((s, c) => s + (c - E) * (c - E) / E, 0); };

// 1. Rest: dice placed on the felt sleep within a second, do not drift, read 1.
{ const w = new World(); w.setCount(5); run(w, 1);
  const z = w.dice.map(d => d.p[2] * 1000), faces = w.readFaces();
  check('rest: all asleep', w.allAsleep());
  check('rest: no sinking or hovering', z.every(v => Math.abs(v + 10) < 0.2), 'z = ' + z.map(v => v.toFixed(2)).join(' ') + ' mm');
  check('rest: all read 1, flat', faces.every(f => f.value === 1 && f.d > 0.999)); }

// 2. Stack: a die dropped on another rests on top (face-face manifold is stable).
{ const w = new World(); w.setCount(2); const [a, b] = w.dice; a.p = [0, 0, -0.018 + 0.008]; b.p = [0, 0, -0.018 + 0.008 + 0.016 + 0.004];
  run(w, 2); const top = Math.max(a.p[2], b.p[2]) * 1000, dx = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) * 1000;
  check('stack: both asleep', w.allAsleep());
  check('stack: top die rests at +6 mm', Math.abs(top - 6) < 0.3, 'top z = ' + top.toFixed(2) + ' mm, lateral offset ' + dx.toFixed(2) + ' mm'); }

// 3. Toss: an upward pulse of the box lifts the dice; they hit the lid and settle again.
{ const w = new World(); w.setCount(5); run(w, 0.5); let lidHits = 0, zmax = -1; w.onImpact = (J, k) => { if (k === 'glass') lidHits++; };
  w.G = [0, 0, -G0 + 24]; run(w, 0.045); w.G = [0, 0, -G0]; run(w, 1.5, () => { for (const d of w.dice) zmax = Math.max(zmax, d.p[2]); });
  check('toss: dice reach the lid', zmax * 1000 > 5 && lidHits > 0, 'z_max = ' + (zmax * 1000).toFixed(1) + ' mm, lid hits ' + lidHits);
  check('toss: settle afterwards', w.allAsleep()); }

// 4. Tilt: at 30° the felt (μ = 0.5 < tan 30°) lets the dice slide to the wall.
{ const w = new World(); w.setCount(5); run(w, 0.5); w.wakeAll(); w.G = [G0 * Math.sin(Math.PI / 6), 0, -G0 * Math.cos(Math.PI / 6)]; run(w, 2);
  const x = w.dice.map(d => d.p[0] * 1000);
  check('tilt 30°: dice slide to +x wall (25 mm)', x.every(v => Math.abs(v - 25) < 0.5) && w.allAsleep(), 'x = ' + x.map(v => v.toFixed(1)).join(' ') + ' mm'); }

// 5. Small tilt: at 20° (tan 20° = 0.36 < μ) the dice stay put.
{ const w = new World(); w.setCount(5); run(w, 0.5); w.wakeAll(); w.G = [G0 * Math.sin(20 * Math.PI / 180), 0, -G0 * Math.cos(20 * Math.PI / 180)]; run(w, 2);
  const x = w.dice.map(d => Math.abs(d.p[0]) * 1000);
  check('tilt 20°: friction holds the dice', x.every(v => v < 12.5) && w.allAsleep(), 'max |x| = ' + Math.max(...x).toFixed(1) + ' mm'); }

// 6. Rotation transport: while the box turns under a free-floating die, the die keeps its
//    absolute orientation, i.e. rotates by minus the box angle in the box frame.
{ const w = new World(); w.setCount(1); const d = w.dice[0]; d.p = [0, 0, 0]; w.G = [0, 0, 0];
  const A = 50, ramp = 0.1, hold = 0.4; // α = 50 rad/s² for 0.1 s, then ω = 5 rad/s for 0.4 s: box angle 2.25 rad
  run(w, ramp, t => { w.al = [A, 0, 0]; w.om = [A * t, 0, 0]; }); run(w, hold, () => { w.al = [0, 0, 0]; w.om = [A * ramp, 0, 0]; });
  const expect = (0.5 * A * ramp * ramp + A * ramp * hold) * 180 / Math.PI;
  check('rotation transport: airborne die keeps absolute orientation', Math.abs(tiltDeg(d) - expect) < 1.5, 'tilt ' + tiltDeg(d).toFixed(1) + '°, expected ' + expect.toFixed(1) + '°'); }

// 7. Containment: a die fired at the velocity cap never leaves the box.
{ const w = new World(); w.setCount(1); const d = w.dice[0]; d.p = [0, 0, 0]; d.v = [3, 2.5, 1.5]; d.w = [40, -60, 20]; let out = false;
  run(w, 2, () => { if (Math.abs(d.p[0]) > w.hx || Math.abs(d.p[1]) > w.hy || Math.abs(d.p[2]) > w.hz) out = true; });
  check('containment: no tunnelling at 4 m/s', !out && w.allAsleep()); }

// 8. Fairness, random orientations: five dice from uniformly random starts, gentle shake.
{ const rng = mulberry32(13), w = new World(), counts = [0, 0, 0, 0, 0, 0]; let cocked = 0; w.setCount(5);
  for (let k = 0; k < 40; k++) { w.reset(); for (const d of w.dice) { setQ(d, randQ(rng)); d.p[2] = -0.004; }
    const sh = makeShake(rng, 40, 1.2, [0, 0, -G0], 7); let om0 = [0, 0, 0], t = 0;
    while (t < 5) { const s = sh(t); w.G = s.G; w.al = s.om.map((v, i) => (v - om0[i]) / DT); w.om = s.om; om0 = s.om; w.step(); t += DT; if (t > 1.5 && w.allAsleep()) break; }
    for (const d of w.dice) { const f = d.face([0, 0, 1]); if (f.d < 0.94) cocked++; else counts[f.value - 1]++; } }
  const x2 = chi2(counts);
  check('fairness (random start, 200 faces): χ²(5) < 20.5', x2 < 20.5, 'counts ' + counts.join(' ') + ', cocked ' + cocked + ', χ² = ' + x2.toFixed(1)); }

// 9. Fairness, aligned start: five dice all showing 1, vigorous shake (the in-page test).
{ const rng = mulberry32(22), w = new World(), counts = [0, 0, 0, 0, 0, 0]; let cocked = 0; w.setCount(5);
  for (let k = 0; k < 40; k++) { w.reset(); const sh = makeShake(rng, 50, 2.0, [0, 0, -G0], 16); let om0 = [0, 0, 0], t = 0;
    while (t < 5) { const s = sh(t); w.G = s.G; w.al = s.om.map((v, i) => (v - om0[i]) / DT); w.om = s.om; om0 = s.om; w.step(); t += DT; if (t > 2.3 && w.allAsleep()) break; }
    for (const d of w.dice) { const f = d.face([0, 0, 1]); if (f.d < 0.94) cocked++; else counts[f.value - 1]++; } }
  const x2 = chi2(counts);
  check('fairness (aligned start, vigorous shake, 200 faces): χ²(5) < 20.5', x2 < 20.5, 'counts ' + counts.join(' ') + ', cocked ' + cocked + ', χ² = ' + x2.toFixed(1)); }

// 10. Determinism: the same seed gives the same result (the engine itself has no randomness).
{ const once = seed => { const rng = mulberry32(seed), w = new World(); w.setCount(5); w.reset(); const sh = makeShake(rng, 40, 1.0, [0, 0, -G0], 8); let om0 = [0, 0, 0], t = 0;
    while (t < 3) { const s = sh(t); w.G = s.G; w.al = s.om.map((v, i) => (v - om0[i]) / DT); w.om = s.om; om0 = s.om; w.step(); t += DT; } return w.readFaces().map(f => f.value).join(''); };
  check('determinism: identical seeds, identical faces', once(5) === once(5), once(5)); }

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
