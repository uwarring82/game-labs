/* ================= Dice Box physics — rigid cubes in the box frame =================
   Units: metres, seconds, kilograms. Frame: the box (= the phone). x right, y up-screen,
   z out of the screen. Floor at z = -H/2 (felt), lid at z = +H/2 (glass), four glass walls.
   Effective gravity G = -(measured specific force); rotation adds Euler, centrifugal and
   Coriolis terms. Cubes are sharp-edged, uniform density: inertia isotropic, I = m s²/6.  */
const PHYS = (() => {
  const S = 0.016, H = S / 2, MASS = 0.0045;
  const INV_M = 1 / MASS, INV_I = 6 / (MASS * S * S);
  const G0 = 9.81;
  const DT = 1 / 480, ITER = 10;
  const SLOP = 5e-5, BETA = 0.2, MAX_BIAS = 0.4, REST_V = 0.15;
  const MAT = { felt: { e: 0.25, mu: 0.5 }, glass: { e: 0.55, mu: 0.18 }, die: { e: 0.5, mu: 0.3 } };
  const VMAX = 4, WMAX = 250;
  const SLEEP_V = 0.015, SLEEP_W = 0.8, SLEEP_T = 0.25, WAKE_G = 0.6, WAKE_J = 3e-4;
  const DIMS = { W: 0.066, L: 0.140, H: 0.036 };
  // Loaded die: a thin dense square plate (side 0.75 s) 1.5 mm beneath one face; total mass unchanged.
  // Returns the centre-of-mass shift c towards that face and the principal moments about the new
  // centre of mass, axial (about the load axis) and transverse. fraction = plate mass / die mass.
  const LOAD_MAX = 0.8, LOAD_PLATE = S * 0.75, LOAD_DEPTH = H - 0.0015;
  function loadModel(fraction) { const ms = fraction * MASS, mb = MASS - ms, c = ms * LOAD_DEPTH / MASS, base = mb * S * S / 6;
    return { c, axial: base + ms * LOAD_PLATE * LOAD_PLATE / 6, transverse: base + mb * c * c + ms * ((LOAD_DEPTH - c) ** 2 + LOAD_PLATE * LOAD_PLATE / 12) }; }

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const qmul = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const qnorm = q => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };
  // body axes (columns of the rotation matrix) expressed in the box frame
  const qaxes = q => { const [x, y, z, w] = q; const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    return [[1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy)], [2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx)], [2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy)]]; };
  // Inertia products of a loaded die: principal moments d.I along its body axes d.A (uniform cubes use INV_I).
  const Imul = (d, x) => { let r = [0, 0, 0]; for (let k = 0; k < 3; k++) r = add(r, scl(d.A[k], dot(d.A[k], x) * d.I[k])); return r; };
  const invImul = (d, x) => { let r = [0, 0, 0]; for (let k = 0; k < 3; k++) r = add(r, scl(d.A[k], dot(d.A[k], x) / d.I[k])); return r; };
  const CORNERS = []; for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) CORNERS.push([sx * H, sy * H, sz * H]);
  // Western (right-handed) die: 1 on +z, 6 on -z, 2 on +x, 5 on -x, 3 on +y, 4 on -y.
  const FACES = [[2, 1, 1], [2, -1, 6], [0, 1, 2], [0, -1, 5], [1, 1, 3], [1, -1, 4]];

  function clip(poly, p0, u, h) { const out = []; const n = poly.length;
    for (let k = 0; k < n; k++) { const P = poly[k], Q = poly[(k + 1) % n]; const dP = dot(sub(P, p0), u) - h, dQ = dot(sub(Q, p0), u) - h;
      if (dP <= 0) out.push(P);
      if ((dP < 0 && dQ > 0) || (dP > 0 && dQ < 0)) { const t = dP / (dP - dQ); out.push(add(P, scl(sub(Q, P), t))); } }
    return out; }

  class Die {
    // p is the centre of mass. A loaded die has it shifted by com (body frame) from the geometric
    // centre and carries principal moments I; a uniform die has com = 0 and I = null.
    constructor(i) { this.i = i; this.p = [0, 0, 0]; this.q = [0, 0, 0, 1]; this.v = [0, 0, 0]; this.w = [0, 0, 0]; this.A = qaxes(this.q); this.sleeping = false; this.rest = 0; this.gs = null; this.jw = 0; this.air = 0;
      this.com = [0, 0, 0]; this.I = null; this.corners = CORNERS; }
    center() { return this.local([-this.com[0], -this.com[1], -this.com[2]]); }
    local(l) { const A = this.A; return [
      this.p[0] + A[0][0] * l[0] + A[1][0] * l[1] + A[2][0] * l[2],
      this.p[1] + A[0][1] * l[0] + A[1][1] * l[1] + A[2][1] * l[2],
      this.p[2] + A[0][2] * l[0] + A[1][2] * l[1] + A[2][2] * l[2]]; }
    face(up) { let best = null; for (const [ax, sg, val] of FACES) { const d = sg * dot(this.A[ax], up); if (!best || d > best.d) best = { value: val, d }; } return best; }
  }

  class World {
    constructor(dims = DIMS) {
      this.hx = dims.W / 2; this.hy = dims.L / 2; this.hz = dims.H / 2;
      this.dice = []; this.G = [0, 0, -G0]; this.om = [0, 0, 0]; this.al = [0, 0, 0]; this.t = 0; this.onImpact = null;
      this.restore();
    }
    // Intact: felt floor, glass lid and walls. Shattered: only the felt pad (W × L) remains; dice that
    // slide off it fall, and a die 15 cm below the felt is gone (asleep, never woken, not read).
    restore() { this.intact = true; this.walls = [
        { n: [0, 0, 1], o: -this.hz, m: 'felt' }, { n: [0, 0, -1], o: -this.hz, m: 'glass' },
        { n: [1, 0, 0], o: -this.hx, m: 'glass' }, { n: [-1, 0, 0], o: -this.hx, m: 'glass' },
        { n: [0, 1, 0], o: -this.hy, m: 'glass' }, { n: [0, -1, 0], o: -this.hy, m: 'glass' }];
      for (const d of this.dice) d.gone = false; this.reset(); }
    shatter() { if (!this.intact) return; this.intact = false; this.walls = this.walls.filter(w => w.m === 'felt'); this.wakeAll(); }
    onPad(x) { return this.intact || (Math.abs(x[0]) <= this.hx && Math.abs(x[1]) <= this.hy); }
    setCount(n) { this.dice = []; for (let i = 0; i < n; i++) this.dice.push(new Die(i)); this.reset(); }
    reset() { const n = this.dice.length;
      this.dice.forEach((d, k) => { d.p = [n > 2 ? ((k % 2) * 2 - 1) * S * 0.75 : 0, (k - (n - 1) / 2) * S * 1.6, -this.hz + H + 0.0005];
        d.q = [0, 0, 0, 1]; d.A = qaxes(d.q); d.v = [0, 0, 0]; d.w = [0, 0, 0]; d.sleeping = false; d.rest = 0; d.gs = null; d.jw = 0; if (d.I) d.p = add(d.p, d.com); }); }
    // Loads die i so that `favored` tends to come up: the plate sits under the opposite face.
    // The geometric centre stays in place; fraction 0 restores the uniform cube.
    setLoad(i, favored, fraction) { const d = this.dice[i]; if (!d) return; const g = d.center();
      d.com = [0, 0, 0]; d.I = null; d.corners = CORNERS;
      if (fraction > 0) { const [ax, sg] = FACES.find(f => f[2] === 7 - favored), m = loadModel(fraction);
        d.com[ax] = sg * m.c; d.I = [m.transverse, m.transverse, m.transverse]; d.I[ax] = m.axial; d.corners = CORNERS.map(c => sub(c, d.com)); }
      d.p = g; d.p = d.local(d.com); d.sleeping = true; this.wake(d); }
    wake(d) { if (!d.sleeping || d.gone) return; d.sleeping = false; d.rest = 0; d.gs = null;
      for (const o of this.dice) if (o.sleeping && len(sub(o.p, d.p)) < S * 1.8) this.wake(o); }
    wakeAll() { for (const d of this.dice) this.wake(d); }
    allAsleep() { return this.dice.length > 0 && this.dice.every(d => d.sleeping); }
    relVel(a, b, rA, rB) { const va = add(a.v, cross(a.w, rA)); if (!b) return va; return sub(va, add(b.v, cross(b.w, rB))); }
    step() {
      const dt = DT, G = this.G, om = this.om, al = this.al;
      for (const d of this.dice) if (d.sleeping && d.gs && len(sub(G, d.gs)) > WAKE_G) this.wake(d);
      for (const d of this.dice) { if (d.sleeping) continue;
        const r = d.p; // sensor assumed at the box centre
        const fic = sub(sub(scl(cross(al, r), -1), cross(om, cross(om, r))), scl(cross(om, d.v), 2));
        d.v = add(d.v, scl(add(G, fic), dt));
        const gyro = d.I ? this.gyro(d, om, dt) : null;
        d.w = add(d.w, scl(sub(scl(al, -1), cross(om, d.w)), dt));
        if (gyro) d.w = add(d.w, gyro);
        d.v = scl(d.v, 1 - 0.02 * dt); d.w = scl(d.w, 1 - 0.05 * dt);
        const vl = len(d.v); if (vl > VMAX) d.v = scl(d.v, VMAX / vl);
        const wl = len(d.w); if (wl > WMAX) d.w = scl(d.w, WMAX / wl); }
      const cs = this.collide(dt);
      this.solve(cs);
      for (const d of this.dice) { if (d.sleeping) continue;
        d.p = add(d.p, scl(d.v, dt));
        const dq = qmul([d.w[0], d.w[1], d.w[2], 0], d.q);
        d.q = qnorm([d.q[0] + 0.5 * dt * dq[0], d.q[1] + 0.5 * dt * dq[1], d.q[2] + 0.5 * dt * dq[2], d.q[3] + 0.5 * dt * dq[3]]);
        d.A = qaxes(d.q);
        if (!this.intact && d.p[2] < -this.hz - 0.15) { d.gone = true; d.sleeping = true; d.v = [0, 0, 0]; d.w = [0, 0, 0]; d.gs = null; continue; }
        if (this.onPad(d.p)) for (const wl of this.walls) { const pen = wl.o - dot(d.p, wl.n); if (pen > 0) { d.p = add(d.p, scl(wl.n, pen + 0.001)); const vn = dot(d.v, wl.n); if (vn < 0) d.v = sub(d.v, scl(wl.n, vn)); } }
        if (len(d.v) < SLEEP_V && len(d.w) < SLEEP_W) { d.rest += dt; if (d.rest > SLEEP_T) { d.sleeping = true; d.v = [0, 0, 0]; d.w = [0, 0, 0]; d.gs = G.slice(); } } else d.rest = 0; }
      for (const d of this.dice) { if (d.sleeping && d.jw > WAKE_J) this.wake(d); d.jw = 0; }
      this.t += dt;
    }
    // Torque-free precession of a loaded die in the box frame, dΩ/dt = I⁻¹(L × Ω) with Ω = ω + w and
    // L = IΩ (zero for a uniform cube). The step is rescaled to keep the rotational energy, which this term conserves.
    gyro(d, om, dt) { const W = add(om, d.w), L = Imul(d, W), E = dot(W, L);
      let N = add(W, scl(invImul(d, cross(L, W)), dt)); const EN = dot(N, Imul(d, N)); if (EN > 0) N = scl(N, Math.sqrt(E / EN));
      return sub(N, W); }
    collide(dt) { const cs = [], dice = this.dice;
      const reach = d => d.I ? len(d.w) * len(d.com) : 0; // corners of a loaded die sweep further from its centre of mass
      for (const d of dice) { if (d.sleeping) continue;
        const margin = (len(d.v) + len(d.w) * H * 1.8 + reach(d)) * dt * 1.1 + 2e-4;
        for (const c of d.corners) { const x = d.local(c);
          if (this.onPad(x)) for (const wl of this.walls) { const depth = wl.o - dot(x, wl.n); if (depth > -margin) cs.push(this.mkContact(d, null, x, wl.n, depth, MAT[wl.m], wl.m)); } } }
      for (let i = 0; i < dice.length; i++) for (let j = i + 1; j < dice.length; j++) { const a = dice[i], b = dice[j]; if (a.sleeping && b.sleeping) continue;
        const margin = (len(sub(a.v, b.v)) + (len(a.w) + len(b.w)) * H * 1.8 + reach(a) + reach(b)) * dt * 1.1 + 2e-4;
        const ca = a.I ? a.center() : a.p, cb = b.I ? b.center() : b.p;
        if (len(sub(ca, cb)) > S * 1.7321 + margin) continue;
        this.boxBox(a, b, margin, cs, ca, cb); }
      return cs; }
    mkContact(a, b, p, n, depth, mat, kind) {
      const rA = sub(p, a.p), rB = b ? sub(p, b.p) : [0, 0, 0];
      const imA = a.sleeping ? 0 : INV_M, iiA = a.sleeping ? 0 : INV_I, imB = (b && !b.sleeping) ? INV_M : 0, iiB = (b && !b.sleeping) ? INV_I : 0;
      const kA = r => iiA && a.I ? dot(r, invImul(a, r)) : iiA * dot(r, r), kB = r => iiB && b.I ? dot(r, invImul(b, r)) : iiB * dot(r, r);
      const rAn = cross(rA, n), rBn = cross(rB, n); const kn = imA + imB + kA(rAn) + kB(rBn);
      const t1 = norm(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0])), t2 = cross(n, t1);
      const rAt1 = cross(rA, t1), rBt1 = cross(rB, t1), rAt2 = cross(rA, t2), rBt2 = cross(rB, t2);
      const kt1 = imA + imB + kA(rAt1) + kB(rBt1), kt2 = imA + imB + kA(rAt2) + kB(rBt2);
      const vn0 = dot(this.relVel(a, b, rA, rB), n);
      let target; if (depth > SLOP) target = Math.min(BETA * (depth - SLOP) / DT, MAX_BIAS); else if (depth < 0) target = depth / DT; else target = 0;
      if (vn0 < -REST_V && (depth >= 0 || -vn0 * DT >= -depth)) target = Math.max(target, -mat.e * vn0);
      return { a, b, p, n, depth, mat, kind, rA, rB, imA, iiA, imB, iiB, kn, t1, t2, kt1, kt2, vn0, target, ln: 0, lt1: 0, lt2: 0 }; }
    // Geometry uses the geometric centres ca, cb; contact lever arms (mkContact) use the centres of mass.
    boxBox(a, b, margin, out, ca, cb) {
      const A = a.A, B = b.A, D = sub(cb, ca); let best = null;
      const test = (axis, kind, i, j) => { const l = len(axis); if (l < 1e-9) return true; const ax = scl(axis, 1 / l);
        const rA = H * (Math.abs(dot(ax, A[0])) + Math.abs(dot(ax, A[1])) + Math.abs(dot(ax, A[2])));
        const rB = H * (Math.abs(dot(ax, B[0])) + Math.abs(dot(ax, B[1])) + Math.abs(dot(ax, B[2])));
        const dd = dot(ax, D); const overlap = rA + rB - Math.abs(dd); if (overlap < -margin) return false;
        const score = overlap + (kind === 'edge' ? 2e-4 : 0);
        if (!best || score < best.score) best = { score, overlap, n: dd > 0 ? scl(ax, -1) : ax, kind, i, j }; // n points from b to a
        return true; };
      for (let i = 0; i < 3; i++) if (!test(A[i], 'A', i, -1)) return;
      for (let j = 0; j < 3; j++) if (!test(B[j], 'B', -1, j)) return;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (!test(cross(A[i], B[j]), 'edge', i, j)) return;
      if (!best) return;
      if (best.kind !== 'edge') {
        const refIsA = best.kind === 'A', R = refIsA ? a : b, I = refIsA ? b : a, RA = R.A, IA = I.A, Rc = refIsA ? ca : cb, Ic = refIsA ? cb : ca;
        const nref = refIsA ? scl(best.n, -1) : best.n; // outward from the reference box toward the incident box
        let jb = 0, sb = 1, dmin = Infinity;
        for (let j = 0; j < 3; j++) { const d1 = dot(nref, IA[j]); if (d1 < dmin) { dmin = d1; jb = j; sb = 1; } if (-d1 < dmin) { dmin = -d1; jb = j; sb = -1; } }
        const ninc = scl(IA[jb], sb), cinc = add(Ic, scl(ninc, H)), e1 = scl(IA[(jb + 1) % 3], H), e2 = scl(IA[(jb + 2) % 3], H);
        let poly = [add(add(cinc, e1), e2), sub(add(cinc, e1), e2), sub(sub(cinc, e1), e2), add(sub(cinc, e1), e2)];
        const ri = refIsA ? best.i : best.j;
        for (const u of [RA[(ri + 1) % 3], RA[(ri + 2) % 3]]) for (const sg of [1, -1]) { poly = clip(poly, Rc, scl(u, sg), H); if (poly.length === 0) return; }
        const pts = []; for (const pt of poly) { const sep = dot(sub(pt, Rc), nref) - H; if (sep <= margin) pts.push({ pt, depth: -sep }); }
        if (pts.length === 0) return; pts.sort((x, y) => y.depth - x.depth); if (pts.length > 4) pts.length = 4;
        for (const q of pts) out.push(this.mkContact(a, b, q.pt, best.n, q.depth, MAT.die, 'die'));
      } else {
        const i = best.i, j = best.j, n = best.n, u = A[i], w = B[j];
        let eA = ca.slice(); for (let k = 0; k < 3; k++) { if (k === i) continue; eA = add(eA, scl(A[k], H * (dot(n, A[k]) < 0 ? 1 : -1))); }
        let eB = cb.slice(); for (let k = 0; k < 3; k++) { if (k === j) continue; eB = add(eB, scl(B[k], H * (dot(n, B[k]) > 0 ? 1 : -1))); }
        const r = sub(eA, eB), bb = dot(u, w), d = dot(u, r), e = dot(w, r), den = 1 - bb * bb; let s = 0, t = 0;
        if (den > 1e-8) { s = (bb * e - d) / den; t = (e - bb * d) / den; }
        s = Math.max(-H, Math.min(H, s)); t = Math.max(-H, Math.min(H, t));
        const p = scl(add(add(eA, scl(u, s)), add(eB, scl(w, t))), 0.5);
        out.push(this.mkContact(a, b, p, n, best.overlap, MAT.die, 'die'));
      }
    }
    applyImpulse(c, J) { const a = c.a, b = c.b;
      if (c.imA) { a.v = add(a.v, scl(J, c.imA)); a.w = add(a.w, a.I ? invImul(a, cross(c.rA, J)) : scl(cross(c.rA, J), c.iiA)); }
      if (b && c.imB) { b.v = sub(b.v, scl(J, c.imB)); b.w = sub(b.w, b.I ? invImul(b, cross(c.rB, J)) : scl(cross(c.rB, J), c.iiB)); } }
    solve(cs) {
      for (let it = 0; it < ITER; it++) for (const c of cs) {
        let vn = dot(this.relVel(c.a, c.b, c.rA, c.rB), c.n);
        let lam = -(vn - c.target) / c.kn; const old = c.ln; c.ln = Math.max(old + lam, 0); lam = c.ln - old;
        if (lam !== 0) this.applyImpulse(c, scl(c.n, lam));
        const maxf = c.mat.mu * c.ln;
        let vt = dot(this.relVel(c.a, c.b, c.rA, c.rB), c.t1); let l1 = -vt / c.kt1; const o1 = c.lt1; c.lt1 = Math.max(-maxf, Math.min(maxf, o1 + l1)); l1 = c.lt1 - o1;
        if (l1 !== 0) this.applyImpulse(c, scl(c.t1, l1));
        vt = dot(this.relVel(c.a, c.b, c.rA, c.rB), c.t2); let l2 = -vt / c.kt2; const o2 = c.lt2; c.lt2 = Math.max(-maxf, Math.min(maxf, o2 + l2)); l2 = c.lt2 - o2;
        if (l2 !== 0) this.applyImpulse(c, scl(c.t2, l2)); }
      for (const c of cs) if (c.ln > 0) { if (c.a.sleeping) c.a.jw += c.ln; if (c.b && c.b.sleeping) c.b.jw += c.ln; if (this.onImpact && c.vn0 < -REST_V) this.onImpact(c.ln, c.kind, c.p); }
    }
    readFaces() { const up = norm(scl(this.G, -1)); return this.dice.map(d => d.gone ? null : d.face(up)); }
  }

  // ---- synthetic input (desktop fallback and fairness test) ----
  function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // A hand shake is translation plus rotation: band-limited random acceleration (amp, m/s²) and
  // angular velocity (wamp, rad/s), new targets every 40 ms, linearly interpolated.
  function makeShake(rng, amp, dur, g, wamp = 7) { const seg = 0.04, nseg = Math.ceil(dur / seg) + 1, T = [], R = [];
    for (let k = 0; k < nseg; k++) { T.push([(rng() * 2 - 1) * amp, (rng() * 2 - 1) * amp, (rng() * 2 - 1) * amp * 0.7]); R.push([(rng() * 2 - 1) * wamp, (rng() * 2 - 1) * wamp, (rng() * 2 - 1) * wamp * 0.6]); }
    const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    return t => { if (t >= dur) return { G: g, om: [0, 0, 0] }; const k = Math.floor(t / seg), f = t / seg - k, k2 = Math.min(k + 1, nseg - 1);
      const a = lerp(T[k], T[k2], f); return { G: [g[0] + a[0], g[1] + a[1], g[2] + a[2]], om: lerp(R[k], R[k2], f) }; }; }
  function erfc(x) { const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r; }
  const chi2p5 = x => erfc(Math.sqrt(x / 2)) + Math.sqrt(2 / Math.PI) * Math.exp(-x / 2) * (Math.sqrt(x) + Math.pow(x, 1.5) / 3);
  // load (optional): { index, favored, fraction } for one loaded die. counts pools all dice; perDie[i] is die i alone.
  async function fairness(N, seed, onProgress, load) {
    const rng = mulberry32(seed), w = new World(), counts = [0, 0, 0, 0, 0, 0], perDie = [0, 1, 2, 3, 4].map(() => [0, 0, 0, 0, 0, 0]); let cocked = 0, unsettled = 0;
    w.setCount(5); if (load) w.setLoad(load.index, load.favored, load.fraction);
    for (let k = 0; k < N; k++) { w.reset(); const shake = makeShake(rng, 50, 2.0, [0, 0, -G0], 16); let t = 0, omPrev = [0, 0, 0];
      while (t < 5) { const s = shake(t); w.G = s.G; w.al = scl(sub(s.om, omPrev), 1 / DT); w.om = s.om; omPrev = s.om; w.step(); t += DT; if (t > 2.3 && w.allAsleep()) break; }
      for (const d of w.dice) { if (!d.sleeping) { unsettled++; continue; } const f = d.face([0, 0, 1]); if (f.d < 0.94) cocked++; else { counts[f.value - 1]++; perDie[d.i][f.value - 1]++; } }
      if (onProgress && k % 4 === 3) { onProgress(k + 1); await new Promise(r => setTimeout(r, 0)); } }
    const n = counts.reduce((x, y) => x + y, 0), E = n / 6; let chi = 0; for (const c of counts) chi += (c - E) * (c - E) / E;
    return { counts, perDie, n, cocked, unsettled, chi, p: chi2p5(chi) }; }

  return { S, H, DT, DIMS, G0, World, Die, FACES, makeShake, mulberry32, fairness, chi2p5, loadModel, LOAD_MAX, MASS };
})();
if (typeof module !== 'undefined') module.exports = PHYS;
