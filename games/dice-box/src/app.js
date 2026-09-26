/* Dice Box — page logic: sensors, rendering (three.js), audio, controls. Requires src/phys.js and three.js loaded first. */
(() => {
  const { S, H, DT, DIMS, G0 } = PHYS;
  const $ = id => document.getElementById(id);
  const isTouch = matchMedia('(pointer: coarse)').matches;

  // ---------------- input: the phone is the box ----------------
  const sensor = { f: null, rr: [0, 0, 0], hasMotion: false, hasOri: false, beta: 0, gamma: 0, sign: 0, sum: 0, samples: 0, count: 0, rate: 0, lastCount: 0, lastT: 0, granted: null };
  const upFromOri = () => { const b = sensor.beta * Math.PI / 180, g = sensor.gamma * Math.PI / 180; return [-Math.sin(g) * Math.cos(b), Math.sin(b), Math.cos(b) * Math.cos(g)]; };
  function onMotion(e) { const f = e.accelerationIncludingGravity; if (!f || f.x == null) return;
    sensor.hasMotion = true; sensor.count++; sensor.f = [f.x, f.y, f.z];
    const rr = e.rotationRate; sensor.rr = (rr && rr.alpha != null) ? [rr.beta * Math.PI / 180, rr.gamma * Math.PI / 180, rr.alpha * Math.PI / 180] : [0, 0, 0];
    if (sensor.sign === 0) { const up = sensor.hasOri ? upFromOri() : [0, 0, 1]; sensor.sum += f.x * up[0] + f.y * up[1] + f.z * up[2]; sensor.samples++;
      if (sensor.samples >= 40) sensor.sign = sensor.sum >= 0 ? 1 : -1; } }
  function onOri(e) { if (e.beta == null) return; sensor.hasOri = true; sensor.beta = e.beta; sensor.gamma = e.gamma; }
  function attachSensors() { window.addEventListener('devicemotion', onMotion); window.addEventListener('deviceorientation', onOri); }

  // ---------------- world ----------------
  const world = new PHYS.World(DIMS);
  let count = 5; world.setCount(count);
  const gStatic = [0, 0, -G0];
  let synthetic = null; // {fn, t0}
  const pointer = { down: false, x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, t: 0 };
  let omPrev = [0, 0, 0], alSmooth = [0, 0, 0];

  // Each die has its own colour; index i is always the same die. Body and pip colours are sRGB.
  const DICE = [
    { name: 'ivory', body: 0xefe6d2, pip: 0x151515 }, { name: 'red', body: 0xb3261e, pip: 0xf5f0e8 },
    { name: 'blue', body: 0x1f4fa0, pip: 0xf5f0e8 }, { name: 'amber', body: 0xe3a82b, pip: 0x151515 },
    { name: 'black', body: 0x19191b, pip: 0xf5f0e8 }];
  const css = hex => '#' + hex.toString(16).padStart(6, '0');
  const tile = (i, text) => `<i class="die" style="background:${css(DICE[i].body)};color:${css(DICE[i].pip)}">${text}</i>`;

  // Loaded die (set in Setup): level 0–100 % of PHYS.LOAD_MAX plate mass; favoured face comes up more often.
  const load = { die: -1, favored: 6, level: 50 };
  const loadFraction = () => load.level / 100 * PHYS.LOAD_MAX;
  const loadConfig = () => load.die >= 0 && load.level > 0 ? { index: load.die, favored: load.favored, fraction: loadFraction() } : null;
  function applyLoad() { for (let i = 0; i < world.dice.length; i++) world.setLoad(i, load.favored, i === load.die ? loadFraction() : 0); }

  // ---------------- audio ----------------
  const Sfx = { ctx: null, noise: null, master: null, last: 0, on: true, lastHaptic: 0,
    init() { if (this.ctx) return; try { const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C(); const n = this.ctx.sampleRate * 0.12, buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.noise = buf; this.master = this.ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(this.ctx.destination); } catch (e) { this.ctx = null; } },
    resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); },
    impact(J, kind) { if (J > 2e-3 && navigator.vibrate && performance.now() - this.lastHaptic > 90) { this.lastHaptic = performance.now(); try { navigator.vibrate(8); } catch (e) {} }
      if (!this.on || !this.ctx || this.ctx.state !== 'running') return; const now = this.ctx.currentTime; if (now - this.last < 0.009) return;
      const g = Math.min(1, (J - 2e-4) / 3e-3); if (g <= 0) return; this.last = now;
      const src = this.ctx.createBufferSource(); src.buffer = this.noise; const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass';
      const f = kind === 'felt' ? 650 : kind === 'glass' ? 3300 : 2500; bp.frequency.value = f * (0.88 + Math.random() * 0.24); bp.Q.value = kind === 'felt' ? 1.8 : 7;
      const gain = this.ctx.createGain(); const dur = kind === 'felt' ? 0.07 : 0.032; gain.gain.setValueAtTime(g * (kind === 'felt' ? 0.55 : 0.32), now); gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);
      src.connect(bp); bp.connect(gain); gain.connect(this.master); src.start(now); src.stop(now + dur + 0.02);
      if (kind !== 'felt') { const o = this.ctx.createOscillator(), og = this.ctx.createGain(); o.type = 'sine'; o.frequency.value = (kind === 'glass' ? 6200 : 4100) * (0.95 + Math.random() * 0.1);
        og.gain.setValueAtTime(g * 0.06, now); og.gain.exponentialRampToValueAtTime(0.0005, now + 0.02); o.connect(og); og.connect(this.master); o.start(now); o.stop(now + 0.03); } },
    // breaking glass: a decaying high-passed crash followed by scattered tinkles of falling shards
    shatter() { try { navigator.vibrate && navigator.vibrate([40, 30, 90]); } catch (e) {}
      if (!this.on || !this.ctx || this.ctx.state !== 'running') return; const c = this.ctx, now = c.currentTime, n = Math.floor(c.sampleRate * 0.6);
      const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.12));
      const src = c.createBufferSource(); src.buffer = buf; const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800; const g = c.createGain(); g.gain.value = 0.9;
      src.connect(hp); hp.connect(g); g.connect(this.master); src.start(now);
      for (let k = 0; k < 28; k++) { const t = now + 0.03 + Math.random() ** 2 * 0.8, o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.value = 3000 + Math.random() * 6000;
        og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.04 + Math.random() * 0.08, t + 0.002); og.gain.exponentialRampToValueAtTime(0.0003, t + 0.03 + Math.random() * 0.08);
        o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.15); } } };
  world.onImpact = (J, kind) => Sfx.impact(J, kind);

  // ---------------- rendering ----------------
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 5); camera.up.set(0, 1, 0);
  const hx = DIMS.W / 2, hy = DIMS.L / 2, hz = DIMS.H / 2;
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

  // environment for reflections: a grey studio with a soft light panel in the lamp's direction (about 30° from
  // straight up, so top faces seen from above do not mirror it) and a dimmer one to the side
  (function makeEnv() { try { const es = new THREE.Scene(); const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64; const cx = cv.getContext('2d');
      const gr = cx.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#9a978f'); gr.addColorStop(0.5, '#5e5e5c'); gr.addColorStop(1, '#232323'); cx.fillStyle = gr; cx.fillRect(0, 0, 4, 64);
      const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
      const sph = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })); sph.rotation.x = Math.PI / 2; es.add(sph);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), new THREE.MeshBasicMaterial({ color: 0xfff4e2 })); panel.position.set(0.83, 1.38, 2.75); panel.lookAt(0, 0, 0); es.add(panel);
      const side = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshBasicMaterial({ color: 0x8fa4b4 })); side.position.set(-2.4, -1.2, 1.4); side.lookAt(0, 0, 0); es.add(side);
      const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(es, 0.05).texture; pm.dispose(); } catch (e) {} })();

  const hemi = new THREE.HemisphereLight(0xfff3e0, 0x1c3326, 0.55); scene.add(hemi);
  const lamp = new THREE.DirectionalLight(0xfff1d6, 1.35); lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.camera.left = -0.1; lamp.shadow.camera.right = 0.1; lamp.shadow.camera.top = 0.1; lamp.shadow.camera.bottom = -0.1; lamp.shadow.camera.near = 0.05; lamp.shadow.camera.far = 1.2;
  lamp.shadow.bias = -0.00004; lamp.shadow.normalBias = 0.0004; lamp.position.set(0.15, 0.25, 0.5); scene.add(lamp); scene.add(lamp.target);

  // felt floor
  (function makeFloor() { const cv = document.createElement('canvas'); cv.width = cv.height = 256; const cx = cv.getContext('2d'); cx.fillStyle = '#1d5236'; cx.fillRect(0, 0, 256, 256);
    const img = cx.getImageData(0, 0, 256, 256), d = img.data; for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 26; d[i] += n; d[i + 1] += n * 1.1; d[i + 2] += n * 0.8; } cx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 6);
    const bump = new THREE.CanvasTexture(cv); bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(3, 6);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(DIMS.W, DIMS.L), new THREE.MeshStandardMaterial({ map: tex, bumpMap: bump, bumpScale: 0.00025, roughness: 0.97, metalness: 0 }));
    floor.position.z = -hz; floor.receiveShadow = true; scene.add(floor);
    const plinth = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), new THREE.MeshStandardMaterial({ color: lin(0x1c1c1c), roughness: 1 })); plinth.position.z = -hz - 0.004; plinth.receiveShadow = true; scene.add(plinth); })();

  // glass walls: an inner and an outer shell give the edges thickness
  const glass = new THREE.Group(); scene.add(glass);
  // Glass has no diffuse colour: transmission makes each pixel only as opaque as its reflection (strong at grazing
  // angles, about 4 % straight on), so the dice keep their colours through the lid.
  const glassMat = new THREE.MeshPhysicalMaterial({ color: lin(0x0c0e0f), transmission: 1, transparent: true, opacity: 1, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.3, side: THREE.DoubleSide, depthWrite: false });
  (function makeGlass() { const t = 0.0025; const none = new THREE.MeshBasicMaterial({ visible: false }); const mats = [glassMat, glassMat, glassMat, glassMat, glassMat, none]; // no glass under the felt
    for (const [w, l, h] of [[DIMS.W, DIMS.L, DIMS.H], [DIMS.W + 2 * t, DIMS.L + 2 * t, DIMS.H + t]]) {
      const g = new THREE.BoxGeometry(w, l, h); const m = new THREE.Mesh(g, mats); m.position.z = (h - DIMS.H) / 2; m.renderOrder = 2; glass.add(m);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: lin(0xe6eef2), transparent: true, opacity: 0.35 })); edges.position.z = m.position.z; edges.renderOrder = 3; glass.add(edges); }
    // a soft window reflection lying across the lid
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 512; const cx = cv.getContext('2d'); const gr = cx.createLinearGradient(0, 0, 256, 512);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.38, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.52, 'rgba(255,255,255,0.05)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.14)'); gr.addColorStop(0.68, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 256, 512); const tex = new THREE.CanvasTexture(cv);
    const sheen = new THREE.Mesh(new THREE.PlaneGeometry(DIMS.W, DIMS.L), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })); sheen.position.z = hz + 0.0026; sheen.renderOrder = 4; glass.add(sheen); })();

  // ---------------- dice ----------------
  // Rendering only; the contacts use the sharp cube. Rounded edges (1.1 mm) are sampled evenly in angle.
  // Pips are drilled spherical dimples (1.44 mm radius, 0.45 mm deep) filled with paint: a normal map
  // shapes the dimple for both the plastic and its clear coat, and a surface map holds paint coverage (R),
  // roughness (G) and cavity darkening (B). Both maps are generated here and shared by all dice; a shader
  // hook mixes each die's body and pip colours by the paint coverage.
  const ATLAS = { C: 512, W: 2048, H: 1024 }; // 3 × 2 face cells of C px in a power-of-two atlas
  const PIP = { 1: [[0, 0]], 2: [[-1, 1], [1, -1]], 3: [[-1, 1], [0, 0], [1, -1]], 4: [[-1, -1], [-1, 1], [1, -1], [1, 1]], 5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]], 6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]] };
  const EDGE_R = S * 0.07, PIP_A = S * 0.27, PIP_R = S * 0.09, PIP_D = 0.00045, PIP_RS = (PIP_R * PIP_R + PIP_D * PIP_D) / (2 * PIP_D), RIM = 0.00012;
  const smooth01 = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  // Face m of a BoxGeometry: directions of increasing u and v, and the outward normal (u × v).
  const FACE_FRAMES = (() => { const g = new THREE.BoxGeometry(1, 1, 1), p = g.attributes.position, at = i => [p.getX(i), p.getY(i), p.getZ(i)], out = [];
    for (let m = 0; m < 6; m++) { const o = at(4 * m), a = at(4 * m + 1), b = at(4 * m + 2), eU = [a[0] - o[0], a[1] - o[1], a[2] - o[2]], eV = [o[0] - b[0], o[1] - b[1], o[2] - b[2]];
      out.push({ eU, eV, n: [eU[1] * eV[2] - eU[2] * eV[1], eU[2] * eV[0] - eU[0] * eV[2], eU[0] * eV[1] - eU[1] * eV[0]] }); }
    g.dispose(); return out; })();
  function diceGeometry(arcSeg) {
    const h = S / 2 - EDGE_R, arc = []; for (let k = 0; k <= arcSeg; k++) arc.push(h + EDGE_R * Math.tan(k * Math.PI / (4 * arcSeg)));
    const coords = arc.map(v => -v).reverse().concat(arc), seg = coords.length - 1, per = (seg + 1) * (seg + 1), grid = v => coords[Math.round((v / S + 0.5) * seg)];
    const g = new THREE.BoxGeometry(S, S, S, seg, seg, seg), pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const m = Math.floor(i / per), col = m % 3, row = Math.floor(m / 3), u = grid(S * (uv.getX(i) - 0.5)) / S + 0.5, v = grid(S * (uv.getY(i) - 0.5)) / S + 0.5;
      uv.setXY(i, (col + u) * ATLAS.C / ATLAS.W, 1 - (row + 1 - v) * ATLAS.C / ATLAS.H);
      const x = grid(pos.getX(i)), y = grid(pos.getY(i)), z = grid(pos.getZ(i)), cx = Math.max(-h, Math.min(h, x)), cy = Math.max(-h, Math.min(h, y)), cz = Math.max(-h, Math.min(h, z));
      let dx = x - cx, dy = y - cy, dz = z - cz; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      pos.setXYZ(i, cx + dx * EDGE_R, cy + dy * EDGE_R, cz + dz * EDGE_R); nrm.setXYZ(i, dx, dy, dz); }
    g.clearGroups(); g.computeBoundingSphere(); return g; }
  function diceTextures() {
    const { C, W, H: AH } = ATLAS, surf = new Uint8Array(W * AH * 4), nmap = new Uint8Array(W * AH * 4), k = C / S;
    for (let o = 0; o < surf.length; o += 4) { surf[o] = 0; surf[o + 1] = 51; surf[o + 2] = 255; surf[o + 3] = 255; nmap[o] = 128; nmap[o + 1] = 128; nmap[o + 2] = 255; nmap[o + 3] = 255; }
    FACE_FRAMES.forEach(({ eU, eV, n }, m) => {
      const ax = n.findIndex(c => c !== 0), val = PHYS.FACES.find(f => f[0] === ax && f[1] === n[ax])[2], t1 = (ax + 1) % 3, t2 = (ax + 2) % 3, col = m % 3, row = Math.floor(m / 3);
      for (const [pu, pv] of PIP[val]) { const off = [0, 0, 0]; off[t1] = pu * PIP_A; off[t2] = pv * PIP_A;
        const s = off[0] * eU[0] + off[1] * eU[1] + off[2] * eU[2], t = off[0] * eV[0] + off[1] * eV[1] + off[2] * eV[2];
        const pcx = (col + 0.5 + s / S) * C, pcy = (row + 0.5 - t / S) * C, R = (PIP_R + RIM) * k + 2;
        for (let y = Math.floor(pcy - R); y <= Math.ceil(pcy + R); y++) for (let x = Math.floor(pcx - R); x <= Math.ceil(pcx + R); x++) {
          const ds = (x + 0.5 - pcx) / k, dt = -(y + 0.5 - pcy) / k, r = Math.hypot(ds, dt); if (r > PIP_R + RIM) continue;
          const rr = Math.min(r, PIP_R), slope = rr / Math.sqrt(PIP_RS * PIP_RS - rr * rr) * smooth01((PIP_R + RIM - r) / (2 * RIM));
          const gx = r > 0 ? slope * ds / r : 0, gy = r > 0 ? slope * dt / r : 0, nl = Math.hypot(gx, gy, 1), o = ((AH - 1 - y) * W + x) * 4; // height rises outward: normal (−∇h, 1)
          nmap[o] = 255 * (0.5 - 0.5 * gx / nl); nmap[o + 1] = 255 * (0.5 - 0.5 * gy / nl); nmap[o + 2] = 255 * (0.5 + 0.5 / nl);
          const cov = smooth01((PIP_R * 0.97 - r) * k / 1.2 + 0.5), depth = r < PIP_R ? Math.sqrt(PIP_RS * PIP_RS - r * r) - (PIP_RS - PIP_D) : 0;
          surf[o] = 255 * cov; surf[o + 1] = 255 * (0.2 + 0.35 * cov); surf[o + 2] = 255 * (1 - 0.45 * depth / PIP_D); } } });
    const aniso = renderer.capabilities.getMaxAnisotropy();
    return [surf, nmap].map(data => { const t = new THREE.DataTexture(data, W, AH, THREE.RGBAFormat); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = aniso; t.needsUpdate = true; return t; }); }
  const dieGeo = diceGeometry(6), [surfTex, normalTex] = diceTextures();
  const dieMats = DICE.map(spec => { const pip = lin(spec.pip);
    const mat = new THREE.MeshPhysicalMaterial({ color: lin(spec.body), map: surfTex, roughnessMap: surfTex, roughness: 1, metalness: 0, normalMap: normalTex, clearcoat: 0.8, clearcoatRoughness: 0.05, clearcoatNormalMap: normalTex, envMapIntensity: 0.9 });
    mat.onBeforeCompile = shader => { shader.uniforms.pipColor = { value: pip };
      shader.fragmentShader = 'uniform vec3 pipColor;\n' + shader.fragmentShader.replace('#include <map_fragment>', 'vec4 surf = texture2D( map, vUv );\n\tdiffuseColor.rgb = mix( diffuseColor.rgb, pipColor, surf.r ) * surf.b;'); };
    return mat; });
  let dieMeshes = [];
  function syncMeshes() { for (let i = 0; i < dieMeshes.length; i++) { const d = world.dice[i], m = dieMeshes[i], c = d.center(); m.visible = !d.gone; m.position.set(c[0], c[1], c[2]); m.quaternion.set(d.q[0], d.q[1], d.q[2], d.q[3]); } }
  function syncDieCount() { for (const m of dieMeshes) scene.remove(m); dieMeshes = []; for (let i = 0; i < count; i++) { const m = new THREE.Mesh(dieGeo, dieMats[i]); m.castShadow = true; m.receiveShadow = true; scene.add(m); dieMeshes.push(m); } syncMeshes(); }
  syncDieCount();

  // ---------------- shattering ----------------
  // The glass breaks when the box's acceleration (the accelerometer magnitude, gravity included) stays above
  // the limit for 25 ms. Physics: world.shatter() removes lid and walls. Visual: each pane splits into jittered
  // triangles that fly off with a random break velocity and fall along the box-frame gravity G, like the dice.
  let glassLimit = 8, overLimit = 0, peakG = 0, shards = null; // glassLimit in g; Infinity = unbreakable
  const shardMat = new THREE.MeshPhysicalMaterial({ color: lin(0xd6e6ec), transparent: true, opacity: 0.4, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false });
  const shardEdgeMat = new THREE.LineBasicMaterial({ color: lin(0xf2f7fa), transparent: true, opacity: 0.7 });
  function breakGlass() {
    const panes = [[[0, 0, hz], [DIMS.W, 0, 0], [0, DIMS.L, 0]], [[hx, 0, 0], [0, DIMS.L, 0], [0, 0, DIMS.H]], [[-hx, 0, 0], [0, DIMS.L, 0], [0, 0, DIMS.H]], [[0, hy, 0], [DIMS.W, 0, 0], [0, 0, DIMS.H]], [[0, -hy, 0], [DIMS.W, 0, 0], [0, 0, DIMS.H]]];
    const list = [];
    for (const [c, a, b] of panes) { const n = new THREE.Vector3(...c).normalize(), na = Math.max(2, Math.round(Math.hypot(...a) / 0.018)), nb = Math.max(2, Math.round(Math.hypot(...b) / 0.018)), grid = [];
      for (let i = 0; i <= na; i++) { grid.push([]); for (let j = 0; j <= nb; j++) { const fi = (i + (i > 0 && i < na ? (Math.random() - 0.5) * 0.7 : 0)) / na - 0.5, fj = (j + (j > 0 && j < nb ? (Math.random() - 0.5) * 0.7 : 0)) / nb - 0.5;
        grid[i].push(new THREE.Vector3(c[0] + a[0] * fi + b[0] * fj, c[1] + a[1] * fi + b[1] * fj, c[2] + a[2] * fi + b[2] * fj)); } }
      for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) { const q = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
        for (const tri of Math.random() < 0.5 ? [[q[0], q[1], q[2]], [q[0], q[2], q[3]]] : [[q[0], q[1], q[3]], [q[1], q[2], q[3]]]) {
          const p = tri[0].clone().add(tri[1]).add(tri[2]).divideScalar(3), rand = () => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
          list.push({ p, local: tri.map(v => v.clone().sub(p)), q: new THREE.Quaternion(), v: n.clone().multiplyScalar(0.25 + 0.9 * Math.random()).add(rand().multiplyScalar(0.5)), w: rand().normalize().multiplyScalar(8 + 30 * Math.random()) }); } } }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(list.length * 9), 3)); geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(list.length * 9), 3));
    const lgeo = new THREE.BufferGeometry(); lgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(list.length * 18), 3));
    const mesh = new THREE.Mesh(geo, shardMat), lines = new THREE.LineSegments(lgeo, shardEdgeMat); mesh.frustumCulled = lines.frustumCulled = false; mesh.renderOrder = 5; lines.renderOrder = 6; scene.add(mesh); scene.add(lines);
    shards = { list, mesh, lines, t: 0 }; updateShards(0); }
  const tmpV = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], tmpN = new THREE.Vector3(), tmpE = new THREE.Vector3(), dq = new THREE.Quaternion();
  function updateShards(dt) { if (!shards) return; shards.t += dt;
    const G = new THREE.Vector3(...world.G), pos = shards.mesh.geometry.attributes.position.array, nor = shards.mesh.geometry.attributes.normal.array, lp = shards.lines.geometry.attributes.position.array;
    shards.list.forEach((s, k) => { s.v.addScaledVector(G, dt); s.p.addScaledVector(s.v, dt); const wl = s.w.length(); if (wl > 0) { dq.setFromAxisAngle(tmpE.copy(s.w).divideScalar(wl), wl * dt); s.q.premultiply(dq); }
      for (let j = 0; j < 3; j++) tmpV[j].copy(s.local[j]).applyQuaternion(s.q).add(s.p);
      tmpN.copy(tmpV[1]).sub(tmpV[0]).cross(tmpE.copy(tmpV[2]).sub(tmpV[0])).normalize();
      for (let j = 0; j < 3; j++) { tmpV[j].toArray(pos, k * 9 + j * 3); tmpN.toArray(nor, k * 9 + j * 3); tmpV[j].toArray(lp, k * 18 + j * 6); tmpV[(j + 1) % 3].toArray(lp, k * 18 + j * 6 + 3); } });
    shards.mesh.geometry.attributes.position.needsUpdate = true; shards.mesh.geometry.attributes.normal.needsUpdate = true; shards.lines.geometry.attributes.position.needsUpdate = true;
    const fade = Math.max(0, 1 - Math.max(0, shards.t - 1.8) / 0.7); shardMat.opacity = 0.4 * fade; shardEdgeMat.opacity = 0.7 * fade; if (shards.t > 2.5) clearShards(); }
  function clearShards() { if (!shards) return; for (const o of [shards.mesh, shards.lines]) { scene.remove(o); o.geometry.dispose(); } shards = null; }
  function shatterBox() { world.shatter(); glass.visible = false; overLimit = 0; breakGlass(); Sfx.shatter(); $('newBox').hidden = false; }
  function newBox() { world.restore(); glass.visible = true; clearShards(); $('newBox').hidden = true; shownFaces = ''; facesEl.textContent = '…'; }

  function fit() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; const tan = Math.tan(camera.fov * Math.PI / 360);
    const dH = DIMS.L * 1.12 / (2 * tan) + hz, dW = DIMS.W * 1.22 / (2 * tan * camera.aspect) + hz; camera.position.set(0, 0, Math.max(dH, dW)); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); renderer.render(scene, camera); }
  addEventListener('resize', fit); fit();

  // ---------------- game loop ----------------
  let last = performance.now(), acc = 0, running = false, settledFor = 0, shownFaces = '', lastPeakShown = 0;
  const facesEl = $('faces'), stateEl = $('state'), debugEl = $('debug');
  const upDev = () => sensor.hasOri ? upFromOri() : [0, 0, 1];
  // mag: |G| before the 60 m/s² cap, which is what the glass feels
  function currentInput(now) {
    let G, om = [0, 0, 0];
    if (sensor.hasMotion && sensor.f) { const s = sensor.sign || 1; G = [-s * sensor.f[0], -s * sensor.f[1], -s * sensor.f[2]]; om = sensor.rr; }
    else { G = gStatic.slice(); if (pointer.down) { G[0] -= pointer.ax; G[1] -= pointer.ay; } }
    // t ≥ 0: a frame can start before the tap that set t0
    if (synthetic) { const t = Math.max(0, (now - synthetic.t0) / 1000); const s = synthetic.fn(t); G = [G[0] + s.G[0] - gStatic[0], G[1] + s.G[1] - gStatic[1], G[2] + s.G[2] - gStatic[2]]; om = [om[0] + s.om[0], om[1] + s.om[1], om[2] + s.om[2]]; if (t > synthetic.dur) synthetic = null; }
    const l = Math.hypot(G[0], G[1], G[2]); if (l > 60) { G = [G[0] * 60 / l, G[1] * 60 / l, G[2] * 60 / l]; }
    return { G, om, mag: l }; }
  function frame(now) { requestAnimationFrame(frame); if (!running) return;
    let dt = (now - last) / 1000; last = now; if (dt > 0.05) dt = 0.05; acc += dt;
    // pointer-driven shake for machines without sensors
    if (pointer.down && dt > 0) { const nvx = (pointer.x - pointer.px) / dt, nvy = -(pointer.y - pointer.py) / dt; const mpp = DIMS.L / (innerHeight * 0.8);
      const ax = (nvx - pointer.vx) / dt * mpp * 1.6, ay = (nvy - pointer.vy) / dt * mpp * 1.6; pointer.ax += (ax - pointer.ax) * 0.5; pointer.ay += (ay - pointer.ay) * 0.5; pointer.vx = nvx; pointer.vy = nvy; pointer.px = pointer.x; pointer.py = pointer.y;
      const m = Math.hypot(pointer.ax, pointer.ay); if (m > 40) { pointer.ax *= 40 / m; pointer.ay *= 40 / m; } } else { pointer.ax *= 0.6; pointer.ay *= 0.6; }
    const inp = currentInput(now); world.G = inp.G; peakG = Math.max(peakG, inp.mag / G0);
    if (world.intact) { overLimit = inp.mag > glassLimit * G0 ? overLimit + dt : 0; if (overLimit >= 0.025) shatterBox(); }
    const om = inp.om; const al = [(om[0] - omPrev[0]) / Math.max(dt, 1e-3), (om[1] - omPrev[1]) / Math.max(dt, 1e-3), (om[2] - omPrev[2]) / Math.max(dt, 1e-3)]; omPrev = om;
    for (let k = 0; k < 3; k++) { alSmooth[k] += (Math.max(-400, Math.min(400, al[k])) - alSmooth[k]) * 0.35; } world.om = om; world.al = alSmooth;
    let steps = 0; while (acc >= DT && steps < 40) { world.step(); acc -= DT; steps++; } if (steps >= 40) acc = 0;
    syncMeshes(); updateShards(dt);
    // the lamp stays on the room's ceiling: follow the orientation estimate
    const up = upDev(); const L = [up[0] * 0.55 + 0.16, up[1] * 0.55 + 0.26, up[2] * 0.55 + 0.05]; const ll = Math.hypot(L[0], L[1], L[2]) || 1; lamp.position.set(L[0] / ll * 0.55, L[1] / ll * 0.55, Math.max(0.12, L[2] / ll * 0.55));
    renderer.render(scene, camera);
    // readout: one tile per die in its own colour
    const box = world.intact ? '' : 'shattered · ';
    if (world.allAsleep()) { settledFor += dt; if (settledFor > 0.35) { const fs = world.readFaces(); let sum = 0, flat = true, txt = '';
        fs.forEach((f, i) => { if (!f) return; if (f.d < 0.94) { flat = false; txt += tile(i, '?'); } else { sum += f.value; txt += tile(i, f.value); } });
        const withSum = !txt ? '<span class="q">no dice left</span>' : txt + (flat ? '<b>= ' + sum + '</b>' : '<span class="q">cocked</span>');
        if (withSum !== shownFaces) { shownFaces = withSum; facesEl.innerHTML = withSum; } stateEl.textContent = box + 'settled'; } }
    else { settledFor = 0; if (shownFaces !== '') { shownFaces = ''; facesEl.textContent = '…'; } stateEl.textContent = box + 'in motion'; }
    if (!$('setupPanel').hidden && now - lastPeakShown > 200) { lastPeakShown = now; $('peakText').textContent = `Strongest so far: ${peakG.toFixed(1)} g (at rest: 1.0 g).`; }
    if (!debugEl.hidden) { if (now - sensor.lastT > 500) { sensor.rate = (sensor.count - sensor.lastCount) * 1000 / (now - sensor.lastT); sensor.lastCount = sensor.count; sensor.lastT = now; }
      const G = world.G; debugEl.textContent = `G  ${G[0].toFixed(2)} ${G[1].toFixed(2)} ${G[2].toFixed(2)}  |G| ${Math.hypot(G[0], G[1], G[2]).toFixed(2)} m/s²\nω  ${world.om.map(x => x.toFixed(2)).join(' ')} rad/s\nsource ${sensor.hasMotion ? 'devicemotion ' + sensor.rate.toFixed(0) + ' Hz, sign ' + (sensor.sign || '?') : 'pointer / synthetic'}\norientation ${sensor.hasOri ? 'β ' + sensor.beta.toFixed(0) + '° γ ' + sensor.gamma.toFixed(0) + '°' : 'none'}\nglass ${world.intact ? 'intact, breaks at ' + glassText() : 'shattered'} · now ${(inp.mag / G0).toFixed(2)} g · peak ${peakG.toFixed(2)} g\nasleep ${world.dice.filter(d => d.sleeping).length}/${world.dice.length}  dt ${(DT * 1000).toFixed(2)} ms × ${steps}`; }
  }
  requestAnimationFrame(frame);

  // ---------------- controls ----------------
  function setCount(n) { count = Math.max(1, Math.min(5, n)); $('count').textContent = count; world.setCount(count); applyLoad(); syncDieCount(); shownFaces = ''; facesEl.textContent = '…'; updateLoadText(); }
  $('fewer').onclick = () => setCount(count - 1); $('more').onclick = () => setCount(count + 1);
  function shake() { const rng = PHYS.mulberry32((Math.random() * 1e9) | 0); synthetic = { fn: PHYS.makeShake(rng, 38, 0.9, gStatic, 11), t0: performance.now(), dur: 0.9 }; world.wakeAll(); }
  function toss() { const fn = t => ({ G: t < 0.045 ? [0, 0, -G0 - 24] : t < 0.09 ? [0, 0, -G0 + 24] : gStatic, om: [0, 0, 0] }); synthetic = { fn, t0: performance.now(), dur: 0.09 }; world.wakeAll(); }
  $('shake').onclick = shake; $('toss').onclick = toss; $('newBox').onclick = newBox;
  addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); toss(); } if (e.key === 's' || e.key === 'S') shake(); });
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pointer.down = true; pointer.x = pointer.px = e.clientX; pointer.y = pointer.py = e.clientY; pointer.vx = pointer.vy = pointer.ax = pointer.ay = 0; world.wakeAll(); });
  canvas.addEventListener('pointermove', e => { if (pointer.down) { pointer.x = e.clientX; pointer.y = e.clientY; } });
  const release = () => { pointer.down = false; }; canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
  $('sound').onclick = () => { Sfx.on = !Sfx.on; $('sound').classList.toggle('on', Sfx.on); $('sound').setAttribute('aria-pressed', Sfx.on); if (Sfx.on) { Sfx.init(); Sfx.resume(); } };
  $('info').onclick = () => { debugEl.hidden = !debugEl.hidden; $('info').classList.toggle('on', !debugEl.hidden); $('info').setAttribute('aria-pressed', !debugEl.hidden); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { acc = 0; } else { last = performance.now(); acc = 0; } });

  // start: permission requests must run inside the tap
  const startNote = $('startNote');
  $('go').onclick = () => {
    Sfx.init(); Sfx.resume();
    const DM = window.DeviceMotionEvent, DO = window.DeviceOrientationEvent;
    if (DM && typeof DM.requestPermission === 'function') {
      const p1 = DM.requestPermission(); const p2 = (DO && typeof DO.requestPermission === 'function') ? DO.requestPermission() : Promise.resolve('granted');
      Promise.all([p1, p2]).then(([a]) => { if (a === 'granted') { attachSensors(); begin('sensors'); } else begin('denied'); }).catch(() => begin('denied'));
    } else if (DM) { attachSensors(); begin('probe'); } else begin('none');
  };
  function begin(mode) { $('start').hidden = true; running = true; last = performance.now(); acc = 0;
    try { if (isTouch && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().then(() => { try { screen.orientation.lock('portrait').catch(() => {}); } catch (e) {} }).catch(() => {}); } catch (e) {}
    const fallback = why => { $('shake').hidden = false; $('toss').hidden = false; stateEl.textContent = why; };
    if (mode === 'denied') fallback('motion declined · drag to shake');
    else if (mode === 'none') fallback('no motion sensors · drag to shake');
    else if (mode === 'probe') setTimeout(() => { if (!sensor.hasMotion) fallback('no motion events · drag to shake'); }, 1500);
    if (isTouch && innerWidth > innerHeight) $('rotate').hidden = false; }
  $('rotateOk').onclick = () => { $('rotate').hidden = true; };
  addEventListener('resize', () => { if (running && isTouch) $('rotate').hidden = innerWidth <= innerHeight; });
  if (!('DeviceMotionEvent' in window)) startNote.textContent = 'No motion sensors here: drag the box to shake, Space to toss.';
  else if (!isTouch) startNote.textContent = 'On a computer: drag to shake, Space to toss.';

  // ---------------- setup panel: loaded die and glass ----------------
  const LOAD_CURVE = [[25, 22], [50, 29], [75, 36], [100, 40]]; // load level % → measured share of the favoured face, 400 throws each (docs/model-notes.md §4)
  $('loadDie').innerHTML = '<option value="-1">none, all fair</option>' + DICE.map((d, i) => `<option value="${i}">${d.name}</option>`).join('');
  function updateLoadText() { const el = $('loadText'); $('loadLevelValue').textContent = load.level + ' %';
    if (load.die < 0 || load.level === 0) { el.textContent = 'All dice are fair.'; return; }
    const f = loadFraction(), m = PHYS.loadModel(f), near = LOAD_CURVE.reduce((a, b) => Math.abs(b[0] - load.level) < Math.abs(a[0] - load.level) ? b : a);
    el.textContent = `The ${DICE[load.die].name} die carries a dense plate of ${(f * PHYS.MASS * 1000).toFixed(1)} g under the ${7 - load.favored}; its centre of mass sits ${(m.c * 1000).toFixed(1)} mm off-centre. ` +
      `Measured at ${near[0]} %: the ${load.favored} comes up about ${near[1]} % of the time (fair: 16.7 %).` + (load.die >= count ? ' Not in play: add dice.' : ''); }
  const glassText = () => glassLimit === Infinity ? 'never' : glassLimit.toFixed(1) + ' g';
  $('setup').onclick = () => { $('setupPanel').hidden = false; updateLoadText(); };
  $('closeSetup').onclick = () => { $('setupPanel').hidden = true; };
  $('loadDie').onchange = e => { load.die = +e.target.value; applyLoad(); updateLoadText(); };
  $('loadFace').onchange = e => { load.favored = +e.target.value; applyLoad(); updateLoadText(); };
  $('loadLevel').oninput = e => { load.level = +e.target.value; applyLoad(); updateLoadText(); };
  $('glassLimit').oninput = e => { const v = +e.target.value; glassLimit = v >= 13 ? Infinity : v; $('glassValue').textContent = glassText(); };
  $('glassValue').textContent = glassText(); updateLoadText();

  // ---------------- fairness panel ----------------
  let fairRunning = false;
  $('openFair').onclick = () => { $('setupPanel').hidden = true; $('fairPanel').hidden = false; };
  $('closeFair').onclick = () => { $('fairPanel').hidden = true; };
  const chip = i => `<i class="chip" style="background:${css(DICE[i].body)}" title="${DICE[i].name}"></i>`;
  $('fairHead').innerHTML = '<tr><th>Face</th>' + DICE.map((d, i) => `<th>${chip(i)}</th>`).join('') + '<th>Exp.</th></tr>';
  $('runFair').onclick = async () => { if (fairRunning) return; fairRunning = true; const N = +$('nThrows').value, seed = (Math.random() * 2 ** 31) | 0, cfg = loadConfig(); const bar = $('fairBar'); bar.style.width = '0%';
    $('fairStats').textContent = 'Running ' + N + ' throws, seed ' + seed + ' …';
    const r = await PHYS.fairness(N, seed, k => { bar.style.width = (100 * k / N).toFixed(0) + '%'; }, cfg);
    bar.style.width = '100%';
    $('fairBody').innerHTML = [0, 1, 2, 3, 4, 5].map(f => `<tr><td>${f + 1}</td>${r.perDie.map(c => `<td>${c[f]}</td>`).join('')}<td>${(N / 6).toFixed(0)}</td></tr>`).join('');
    const chi = c => { const n = c.reduce((a, b) => a + b, 0), E = n / 6; return c.reduce((s, x) => s + (x - E) * (x - E) / E, 0); };
    const fairIdx = [0, 1, 2, 3, 4].filter(i => !cfg || i !== cfg.index), pooled = fairIdx.map(i => r.perDie[i]).reduce((a, c) => a.map((v, k) => v + c[k]));
    let txt = `${r.n} faces from ${N} throws of 5 dice, seed ${seed}. ${cfg ? 'Fair dice pooled' : 'All dice pooled'}: χ²(5) = ${chi(pooled).toFixed(2)}, p = ${PHYS.chi2p5(chi(pooled)).toFixed(3)}.`;
    if (cfg) { const c = r.perDie[cfg.index], n = c.reduce((a, b) => a + b, 0); txt += ` Loaded ${DICE[cfg.index].name} die: ${cfg.favored} came up ${(100 * c[cfg.favored - 1] / n).toFixed(1)} % (fair: 16.7 %), χ²(5) = ${chi(c).toFixed(2)}, p = ${PHYS.chi2p5(chi(c)).toFixed(4)}.`; }
    $('fairStats').textContent = txt + ` Cocked (excluded): ${r.cocked}. Unsettled after 4 s: ${r.unsettled}. A fair die gives p spread uniformly over repeated runs; p < 0.01 on most runs indicates bias.`;
    fairRunning = false; };
})();
