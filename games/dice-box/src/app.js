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
        og.gain.setValueAtTime(g * 0.06, now); og.gain.exponentialRampToValueAtTime(0.0005, now + 0.02); o.connect(og); og.connect(this.master); o.start(now); o.stop(now + 0.03); } } };
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

  // environment for reflections: a grey studio with one soft light panel overhead
  (function makeEnv() { try { const es = new THREE.Scene(); const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64; const cx = cv.getContext('2d');
      const gr = cx.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#d9d6cf'); gr.addColorStop(0.5, '#6a6a68'); gr.addColorStop(1, '#232323'); cx.fillStyle = gr; cx.fillRect(0, 0, 4, 64);
      const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
      const sph = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })); sph.rotation.x = Math.PI / 2; es.add(sph);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshBasicMaterial({ color: 0xfff4e2 })); panel.position.set(0.4, 0.9, 3); panel.lookAt(0, 0, 0); es.add(panel);
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
    // felt also climbs the inside of the walls a little? no: glass walls, but a dark plinth under the box
    const plinth = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), new THREE.MeshStandardMaterial({ color: new THREE.Color(0x1c1c1c).convertSRGBToLinear(), roughness: 1 })); plinth.position.z = -hz - 0.004; plinth.receiveShadow = true; scene.add(plinth); })();

  // glass walls: an inner and an outer shell give the edges thickness
  const glassMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0xd6e6ec).convertSRGBToLinear(), transparent: true, opacity: 0.13, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.1, side: THREE.DoubleSide, depthWrite: false });
  (function makeGlass() { const t = 0.0025; const none = new THREE.MeshBasicMaterial({ visible: false }); const mats = [glassMat, glassMat, glassMat, glassMat, glassMat, none]; // no glass under the felt
    for (const [w, l, h] of [[DIMS.W, DIMS.L, DIMS.H], [DIMS.W + 2 * t, DIMS.L + 2 * t, DIMS.H + t]]) {
      const g = new THREE.BoxGeometry(w, l, h); const m = new THREE.Mesh(g, mats); m.position.z = (h - DIMS.H) / 2; m.renderOrder = 2; scene.add(m);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: new THREE.Color(0xe6eef2).convertSRGBToLinear(), transparent: true, opacity: 0.35 })); edges.position.z = m.position.z; edges.renderOrder = 3; scene.add(edges); }
    // a soft window reflection lying across the lid
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 512; const cx = cv.getContext('2d'); const gr = cx.createLinearGradient(0, 0, 256, 512);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.38, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.52, 'rgba(255,255,255,0.05)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.14)'); gr.addColorStop(0.68, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 256, 512); const tex = new THREE.CanvasTexture(cv);
    const sheen = new THREE.Mesh(new THREE.PlaneGeometry(DIMS.W, DIMS.L), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })); sheen.position.z = hz + 0.0026; sheen.renderOrder = 4; scene.add(sheen); })();

  // dice
  function roundedBox(size, radius, seg) { const g = new THREE.BoxGeometry(size, size, size, seg, seg, seg); const pos = g.attributes.position, nrm = g.attributes.normal; const h = size / 2 - radius;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); const cx = Math.max(-h, Math.min(h, x)), cy = Math.max(-h, Math.min(h, y)), cz = Math.max(-h, Math.min(h, z));
      let dx = x - cx, dy = y - cy, dz = z - cz; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l; pos.setXYZ(i, cx + dx * radius, cy + dy * radius, cz + dz * radius); nrm.setXYZ(i, dx, dy, dz); }
    return g; }
  const dieGeo = roundedBox(S, S * 0.07, 10);
  const pipGeo = new THREE.CircleGeometry(S * 0.085, 24);
  const PIP = { 1: [[0, 0]], 2: [[-1, 1], [1, -1]], 3: [[-1, 1], [0, 0], [1, -1]], 4: [[-1, -1], [-1, 1], [1, -1], [1, 1]], 5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]], 6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]] };
  function makeDie(red) {
    const body = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(red ? 0xb8342a : 0xf1e8d2).convertSRGBToLinear(), roughness: red ? 0.28 : 0.34, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.22, envMapIntensity: 0.65 });
    const pipMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(red ? 0xf5f0e8 : 0x111111).convertSRGBToLinear(), roughness: 0.45, metalness: 0 });
    const grp = new THREE.Group(); const mesh = new THREE.Mesh(dieGeo, body); mesh.castShadow = true; mesh.receiveShadow = true; grp.add(mesh);
    const a = S * 0.27, lift = S / 2 + 0.00006;
    for (const [ax, sg, val] of PHYS.FACES) { const n = [0, 0, 0]; n[ax] = sg; const t1 = [0, 0, 0], t2 = [0, 0, 0]; t1[(ax + 1) % 3] = 1; t2[(ax + 2) % 3] = 1;
      for (const [u, v] of PIP[val]) { const pip = new THREE.Mesh(pipGeo, pipMat);
        pip.position.set(n[0] * lift + t1[0] * u * a + t2[0] * v * a, n[1] * lift + t1[1] * u * a + t2[1] * v * a, n[2] * lift + t1[2] * u * a + t2[2] * v * a);
        pip.lookAt(pip.position.x + n[0], pip.position.y + n[1], pip.position.z + n[2]); grp.add(pip); } }
    return grp; }
  let dieMeshes = [];
  function syncMeshes() { for (let i = 0; i < dieMeshes.length; i++) { const d = world.dice[i], m = dieMeshes[i]; m.position.set(d.p[0], d.p[1], d.p[2]); m.quaternion.set(d.q[0], d.q[1], d.q[2], d.q[3]); } }
  function syncDieCount() { for (const m of dieMeshes) scene.remove(m); dieMeshes = []; for (let i = 0; i < count; i++) { const g = makeDie(i === 4); scene.add(g); dieMeshes.push(g); } syncMeshes(); }
  syncDieCount();

  function fit() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; const tan = Math.tan(camera.fov * Math.PI / 360);
    const dH = DIMS.L * 1.12 / (2 * tan) + hz, dW = DIMS.W * 1.22 / (2 * tan * camera.aspect) + hz; camera.position.set(0, 0, Math.max(dH, dW)); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); renderer.render(scene, camera); }
  addEventListener('resize', fit); fit();

  // ---------------- game loop ----------------
  let last = performance.now(), acc = 0, running = false, settledFor = 0, shownFaces = '';
  const facesEl = $('faces'), stateEl = $('state'), debugEl = $('debug');
  const upDev = () => sensor.hasOri ? upFromOri() : [0, 0, 1];
  function currentInput(now) {
    let G, om = [0, 0, 0];
    if (sensor.hasMotion && sensor.f) { const s = sensor.sign || 1; G = [-s * sensor.f[0], -s * sensor.f[1], -s * sensor.f[2]]; om = sensor.rr; }
    else { G = gStatic.slice(); if (pointer.down) { G[0] -= pointer.ax; G[1] -= pointer.ay; } }
    if (synthetic) { const t = (now - synthetic.t0) / 1000; const s = synthetic.fn(t); G = [G[0] + s.G[0] - gStatic[0], G[1] + s.G[1] - gStatic[1], G[2] + s.G[2] - gStatic[2]]; om = [om[0] + s.om[0], om[1] + s.om[1], om[2] + s.om[2]]; if (t > synthetic.dur) synthetic = null; }
    const l = Math.hypot(G[0], G[1], G[2]); if (l > 60) { G = [G[0] * 60 / l, G[1] * 60 / l, G[2] * 60 / l]; }
    return { G, om }; }
  function frame(now) { requestAnimationFrame(frame); if (!running) return;
    let dt = (now - last) / 1000; last = now; if (dt > 0.05) dt = 0.05; acc += dt;
    // pointer-driven shake for machines without sensors
    if (pointer.down && dt > 0) { const nvx = (pointer.x - pointer.px) / dt, nvy = -(pointer.y - pointer.py) / dt; const mpp = DIMS.L / (innerHeight * 0.8);
      const ax = (nvx - pointer.vx) / dt * mpp * 1.6, ay = (nvy - pointer.vy) / dt * mpp * 1.6; pointer.ax += (ax - pointer.ax) * 0.5; pointer.ay += (ay - pointer.ay) * 0.5; pointer.vx = nvx; pointer.vy = nvy; pointer.px = pointer.x; pointer.py = pointer.y;
      const m = Math.hypot(pointer.ax, pointer.ay); if (m > 40) { pointer.ax *= 40 / m; pointer.ay *= 40 / m; } } else { pointer.ax *= 0.6; pointer.ay *= 0.6; }
    const inp = currentInput(now); world.G = inp.G;
    const om = inp.om; const al = [(om[0] - omPrev[0]) / Math.max(dt, 1e-3), (om[1] - omPrev[1]) / Math.max(dt, 1e-3), (om[2] - omPrev[2]) / Math.max(dt, 1e-3)]; omPrev = om;
    for (let k = 0; k < 3; k++) { alSmooth[k] += (Math.max(-400, Math.min(400, al[k])) - alSmooth[k]) * 0.35; } world.om = om; world.al = alSmooth;
    let steps = 0; while (acc >= DT && steps < 40) { world.step(); acc -= DT; steps++; } if (steps >= 40) acc = 0;
    syncMeshes();
    // the lamp stays on the room's ceiling: follow the orientation estimate
    const up = upDev(); const L = [up[0] * 0.55 + 0.16, up[1] * 0.55 + 0.26, up[2] * 0.55 + 0.05]; const ll = Math.hypot(L[0], L[1], L[2]) || 1; lamp.position.set(L[0] / ll * 0.55, L[1] / ll * 0.55, Math.max(0.12, L[2] / ll * 0.55));
    renderer.render(scene, camera);
    // readout
    if (world.allAsleep()) { settledFor += dt; if (settledFor > 0.35) { const fs = world.readFaces(); let sum = 0, txt = '';
        for (const f of fs) { if (f.d < 0.94) { txt += '<span class="q">?</span> '; } else { sum += f.value; txt += '<b>' + f.value + '</b> '; } }
        txt = txt.trim().replace(/ /g, ' · '); const withSum = fs.every(f => f.d >= 0.94) ? txt + '  = <b>' + sum + '</b>' : txt + '  (cocked)';
        if (withSum !== shownFaces) { shownFaces = withSum; facesEl.innerHTML = withSum; } stateEl.textContent = 'settled'; } }
    else { settledFor = 0; if (shownFaces !== '') { shownFaces = ''; facesEl.textContent = '…'; } stateEl.textContent = 'in motion'; }
    if (!debugEl.hidden) { if (now - sensor.lastT > 500) { sensor.rate = (sensor.count - sensor.lastCount) * 1000 / (now - sensor.lastT); sensor.lastCount = sensor.count; sensor.lastT = now; }
      const G = world.G; debugEl.textContent = `G  ${G[0].toFixed(2)} ${G[1].toFixed(2)} ${G[2].toFixed(2)}  |G| ${Math.hypot(G[0], G[1], G[2]).toFixed(2)} m/s²\nω  ${world.om.map(x => x.toFixed(2)).join(' ')} rad/s\nsource ${sensor.hasMotion ? 'devicemotion ' + sensor.rate.toFixed(0) + ' Hz, sign ' + (sensor.sign || '?') : 'pointer / synthetic'}\norientation ${sensor.hasOri ? 'β ' + sensor.beta.toFixed(0) + '° γ ' + sensor.gamma.toFixed(0) + '°' : 'none'}\nasleep ${world.dice.filter(d => d.sleeping).length}/${world.dice.length}  dt ${(DT * 1000).toFixed(2)} ms × ${steps}`; }
  }
  requestAnimationFrame(frame);

  // ---------------- controls ----------------
  function setCount(n) { count = Math.max(1, Math.min(5, n)); $('count').textContent = count; world.setCount(count); syncDieCount(); shownFaces = ''; facesEl.textContent = '…'; }
  $('fewer').onclick = () => setCount(count - 1); $('more').onclick = () => setCount(count + 1);
  function shake() { const rng = PHYS.mulberry32((Math.random() * 1e9) | 0); synthetic = { fn: PHYS.makeShake(rng, 38, 0.9, gStatic, 11), t0: performance.now(), dur: 0.9 }; world.wakeAll(); }
  function toss() { const fn = t => ({ G: t < 0.045 ? [0, 0, -G0 - 24] : t < 0.09 ? [0, 0, -G0 + 24] : gStatic, om: [0, 0, 0] }); synthetic = { fn, t0: performance.now(), dur: 0.09 }; world.wakeAll(); }
  $('shake').onclick = shake; $('toss').onclick = toss;
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

  // ---------------- fairness panel ----------------
  let fairRunning = false;
  $('fair').onclick = () => { $('fairPanel').hidden = false; };
  $('closeFair').onclick = () => { $('fairPanel').hidden = true; };
  $('runFair').onclick = async () => { if (fairRunning) return; fairRunning = true; const N = +$('nThrows').value, seed = (Math.random() * 2 ** 31) | 0; const bar = $('fairBar'); bar.style.width = '0%';
    $('fairStats').textContent = 'Running ' + N + ' throws, seed ' + seed + ' …';
    const r = await PHYS.fairness(N, seed, k => { bar.style.width = (100 * k / N).toFixed(0) + '%'; });
    bar.style.width = '100%'; const E = r.n / 6; $('fairBody').innerHTML = r.counts.map((c, i) => `<tr><td>${i + 1}</td><td>${c}</td><td>${E.toFixed(1)}</td><td>${(100 * c / r.n).toFixed(1)} %</td></tr>`).join('');
    $('fairStats').textContent = `${r.n} faces from ${N} throws of 5 dice, seed ${seed}. χ²(5) = ${r.chi.toFixed(2)}, p = ${r.p.toFixed(3)}. Cocked (excluded): ${r.cocked}. Unsettled after 4 s: ${r.unsettled}. A fair engine gives p spread uniformly over repeated runs; p < 0.01 on most runs would indicate bias.`;
    fairRunning = false; };
})();
