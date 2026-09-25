import { W, H, R, START, GOAL, WALLS, HOLES, PRESETS, STEP, clamp, tiltVector, filtered, newBall, advance, FixedClock } from './physics.js';

const $ = id => document.getElementById(id);
const canvas = $('board'), ctx = canvas.getContext('2d');
const trace = $('trace'), tc = trace.getContext('2d');
let ball = newBall(), phase = 'ready', mode = 'touch', preset = 'classic', sensitivity = 1, tau = 0.020;
let elapsed = 0, falls = 0, neutral = null, latest = null, requested = false, permission = 'Not requested';
let raw = { x: 0, y: 0 }, smooth = { x: 0, y: 0 }, touch = { x: 0, y: 0 };
let frameLast = null, eventLast = null, frameDt = 0, eventDt = 0, delivery = 0, lastUI = 0;
let orientation = screenAngle(), fallStarted = 0, fallHole = null, pointer = null, calibrationSamples = null;
let gyroFields = 'Not observed', recentDts = [], trail = [], rows = [], graph = [], recordStart = performance.now();
const keys = new Set(), clock = new FixedClock();
const clockText = t => `${String(Math.floor(t / 60)).padStart(2,'0')}:${(t % 60).toFixed(1).padStart(4,'0')}`;
function screenAngle() { return Number(screen.orientation?.angle ?? window.orientation ?? 0); }
function record(type, now, eventTime = '') {
  rows.push([type, (now-recordStart).toFixed(3), eventTime === '' ? '' : (eventTime-recordStart).toFixed(3), raw.x.toFixed(4), raw.y.toFixed(4), smooth.x.toFixed(4), smooth.y.toFixed(4), phase, mode, orientation]);
  if (rows.length > 12000) rows.splice(0, 2000);
}
function message(title, subtitle) { $('boardTitle').textContent = title; $('boardSubtitle').textContent = subtitle; $('boardMessage').hidden = !title; }
function status(text) { $('inputStatus').textContent = text; }
function updateControls() {
  $('touchButton').classList.toggle('selected', mode === 'touch'); $('touchButton').setAttribute('aria-pressed', mode === 'touch');
  $('tiltButton').classList.toggle('selected', mode === 'tilt'); $('tiltButton').setAttribute('aria-pressed', mode === 'tilt');
  $('tiltButton').textContent = mode === 'tilt' ? 'Tilt enabled' : 'Enable tilt';
  $('calibrate').disabled = mode !== 'tilt' || !latest || !!calibrationSamples;
  $('inputLabel').textContent = mode === 'tilt' ? 'PHONE TILT' : 'VIRTUAL TILT';
  $('inputHint').textContent = mode === 'tilt' ? neutral ? 'Counter-tilt to brake.' : 'Calibrate before play.' : 'Arrow keys also work.';
  $('play').textContent = phase === 'running' ? 'Pause' : phase === 'paused' ? 'Resume' : phase === 'won' ? 'Again' : 'Play';
  $('play').disabled = phase === 'falling' || (mode === 'tilt' && (!neutral || !latest || !!calibrationSamples));
  $('stateLabel').textContent = ({ ready:'READY', running:'IN PLAY', paused:'PAUSED', falling:'TRY AGAIN', won:'COMPLETE' })[phase];
  $('presetLabel').textContent = preset === 'classic' ? 'CLASSIC' : 'FORGIVING';
  $('presetDescription').textContent = `${preset === 'classic' ? 'Low' : 'Higher'} damping · acceleration control`;
}
function stopInput() { keys.clear(); touch = { x:0, y:0 }; pointer = null; }
function pause(reason = 'Your move, when you’re ready.') {
  if (phase === 'running') { phase = 'paused'; message('Take a breath.', reason); }
  if (phase === 'falling') { ball = newBall(); trail = []; phase = 'paused'; fallHole = null; message('Ready to try again?', reason); }
  stopInput(); clock.reset(); updateControls();
}
function restart() {
  ball = newBall(); elapsed = 0; falls = 0; trail = []; phase = 'ready'; fallHole = null; clock.reset();
  smooth = { x:0, y:0 }; stopInput(); message('Find your balance.', 'Reach the green ring. Counter-tilt to brake.'); updateControls();
}
function togglePlay() {
  if (phase === 'running') return pause();
  if (phase === 'falling' || (mode === 'tilt' && !neutral)) return;
  if (phase === 'won') restart();
  phase = 'running'; message('', ''); clock.reset(); updateControls();
}
function setTouch(text = 'Drag the pad to accelerate. Release to coast.') {
  pause('Control changed. Press Resume when ready.'); mode = 'touch'; raw = {x:0,y:0}; smooth = {x:0,y:0}; status(text); updateControls();
}
function onOrientation(event) {
  if (!requested || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
  const now = performance.now();
  let stamp = event.timeStamp > 1e12 ? event.timeStamp - performance.timeOrigin : event.timeStamp;
  if (!Number.isFinite(stamp) || stamp <= 0 || stamp > now + 1000) stamp = now;
  latest = { beta:event.beta, gamma:event.gamma, received:now, stamp };
  if (eventLast !== null) { eventDt = now-eventLast; recentDts.push(eventDt); if(recentDts.length>80) recentDts.shift(); }
  eventLast = now; delivery = Math.max(0,now-stamp);
  if (mode === 'tilt' && neutral) raw = tiltVector(latest.beta, latest.gamma, neutral, orientation);
  if (calibrationSamples) calibrationSamples.push({beta:event.beta,gamma:event.gamma});
  record('orientation',now,stamp);
  if (mode === 'tilt' && !neutral && !calibrationSamples) status('Hold a comfortable angle, then tap Calibrate.');
  updateControls();
}
window.addEventListener('deviceorientation', onOrientation);
window.addEventListener('devicemotion', e => {
  if (!requested) return;
  const r = e.rotationRate;
  gyroFields = r && [r.alpha,r.beta,r.gamma].some(Number.isFinite) ? 'Rotation-rate values available' : 'No rotation-rate values';
});
async function enableTilt() {
  if (mode === 'tilt') return;
  if (!window.isSecureContext) return setTouch('Tilt needs a secure page. Touch controls are ready.');
  if (!('DeviceOrientationEvent' in window) && !('ondeviceorientation' in window)) return setTouch('No motion support found. Touch controls are ready.');
  pause('Tilt selected. Calibrate before resuming.'); requested = true;
  // Both permission requests originate synchronously in this button’s tap handler.
  let required, optional;
  try {
    required = typeof window.DeviceOrientationEvent?.requestPermission === 'function' ? window.DeviceOrientationEvent.requestPermission() : Promise.resolve('granted');
    optional = typeof window.DeviceMotionEvent?.requestPermission === 'function' ? window.DeviceMotionEvent.requestPermission().catch(()=>'unavailable') : Promise.resolve('not requested');
    const [result] = await Promise.all([required, optional]);
    permission = result;
    if (result !== 'granted') return setTouch('Tilt access was declined. Use touch, or change motion access in your browser’s site settings.');
    mode = 'tilt'; neutral = null; smooth = {x:0,y:0}; raw = {x:0,y:0};
    status(latest ? 'Hold a comfortable angle, then tap Calibrate.' : 'Waiting for motion readings… gently tilt your phone.'); updateControls();
    setTimeout(() => { if (mode === 'tilt' && !latest) status('No readings received. Open directly in Safari or Chrome, check motion access, or select Touch.'); }, 2400);
  } catch (error) { permission = error.name || 'unavailable'; setTouch('Tilt is blocked here. Open this page directly in your browser, or use Touch.'); }
}
function calibrate() {
  if (!latest || mode !== 'tilt' || calibrationSamples) return;
  pause('Calibration complete. Press Resume when ready.');
  calibrationSamples = [{beta:latest.beta,gamma:latest.gamma}]; status('Hold still for a moment…'); updateControls();
  setTimeout(() => {
    const samples = calibrationSamples; calibrationSamples = null;
    if (!samples || mode !== 'tilt' || document.hidden) return updateControls();
    const base = samples[0];
    const diff = (a,b) => ((a-b+540)%360)-180;
    const beta = base.beta + samples.reduce((s,v)=>s+diff(v.beta,base.beta),0)/samples.length;
    const gamma = base.gamma + samples.reduce((s,v)=>s+diff(v.gamma,base.gamma),0)/samples.length;
    // Euler subtraction intentionally ignores yaw. Intended operating range is
    // a comfortable screen-up pose, away from beta=±90° and Euler branch changes.
    if (Math.abs(beta) > 70 || Math.abs(gamma) > 65) { neutral=null; status('Hold the phone more face-up, then calibrate again.'); updateControls(); return; }
    const spread = Math.max(...samples.map(v=>Math.hypot(diff(v.beta,beta),diff(v.gamma,gamma))));
    if (spread > 3) { status('The phone moved during calibration. Hold still and try again.'); updateControls(); return; }
    neutral = {beta,gamma}; smooth = {x:0,y:0}; raw = {x:0,y:0};
    status('Calibrated. Tilt to accelerate; counter-tilt to brake.'); updateControls();
  }, 450);
}
function orientationChanged() {
  const next = screenAngle(); if (orientation === next) return; orientation = next;
  pause('Screen rotated. Check your grip before resuming.');
  if (mode === 'tilt') { neutral = null; calibrationSamples=null; raw={x:0,y:0};smooth={x:0,y:0}; status('Screen rotated. Hold comfortably and calibrate again.'); }
  $('screenStatus').textContent = `Screen rotation: ${orientation}°. Axes remapped automatically.`; updateControls();
}
screen.orientation?.addEventListener('change', orientationChanged);
window.addEventListener('orientationchange', orientationChanged);
document.addEventListener('visibilitychange', () => { if (document.hidden) { calibrationSamples=null; pause('Press Resume when you return.'); } frameLast=null;clock.reset(); });
window.addEventListener('blur', () => pause('Press Resume when you’re ready.'));

const pad = $('pad');
function movePointer(e) {
  const rect=pad.getBoundingClientRect(), scale=rect.width*0.35;
  let x=(e.clientX-rect.left-rect.width/2)/scale, y=(e.clientY-rect.top-rect.height/2)/scale;
  const m=Math.hypot(x,y); if(m>1){x/=m;y/=m;}
  touch={x:x*18,y:y*18};
}
pad.addEventListener('pointerdown', e=>{if(mode!=='touch'||pointer!==null)return; e.preventDefault();pointer=e.pointerId;pad.setPointerCapture(e.pointerId);movePointer(e);});
pad.addEventListener('pointermove',e=>{if(e.pointerId===pointer)movePointer(e);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(name,e=>{if(e.pointerId===pointer){touch={x:0,y:0};pointer=null;}});
window.addEventListener('keydown',e=>{
  if($('settings').open||$('diagnostics').open||/INPUT|SELECT|TEXTAREA|SUMMARY/.test(e.target.tagName))return;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key)){e.preventDefault();if(mode==='touch')keys.add(e.key);}
  if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();if(!e.repeat)togglePlay();}
});
window.addEventListener('keyup',e=>keys.delete(e.key));
document.addEventListener('touchmove',e=>{if(!e.target.closest('dialog'))e.preventDefault();},{passive:false});
$('play').addEventListener('click',togglePlay);$('restart').addEventListener('click',restart);
$('touchButton').addEventListener('click',()=>setTouch());$('tiltButton').addEventListener('click',enableTilt);$('calibrate').addEventListener('click',calibrate);
for(const name of ['settings','diagnostics']) {
  $(name==='settings'?'settingsButton':'debugButton').addEventListener('click',()=>{pause();$(name).showModal();});
  document.querySelector(`[data-close="${name}"]`).addEventListener('click',()=>$(name).close());
  $(name).addEventListener('click',e=>{if(e.target===$(name)){const b=$(name).getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)$(name).close();}});
}
$('preset').addEventListener('change',e=>{preset=e.target.value;updateControls();});
$('sensitivity').addEventListener('input',e=>{sensitivity=Number(e.target.value);$('sensitivityValue').textContent=sensitivity.toFixed(1)+'×';});
$('smoothing').addEventListener('input',e=>{tau=Number(e.target.value)/1000;$('smoothingValue').textContent=e.target.value+' ms';});
async function fullscreen() {
  try {
    if(document.fullscreenElement){await document.exitFullscreen();return;}
    if(!document.documentElement.requestFullscreen)throw new Error('unavailable');
    await document.documentElement.requestFullscreen();
    try { await screen.orientation?.lock?.(Math.abs(screenAngle())%180===90?'landscape':'portrait');$('screenStatus').textContent='Screen orientation locked during full screen.'; }
    catch { $('screenStatus').textContent='Orientation lock unavailable. Axes remap when the screen rotates.'; }
  } catch { $('screenStatus').textContent='Full screen is unavailable here. Axes remap when the screen rotates.'; status('Full screen is unavailable in this browser. You can keep playing here.'); }
}
$('fullscreen').addEventListener('click',fullscreen);$('settingsFullscreen').addEventListener('click',fullscreen);
$('clearLog').addEventListener('click',()=>{rows=[];graph=[];recordStart=performance.now();});
$('exportLog').addEventListener('click',()=>{
  const meta=[`# Marble Lab; preset=${preset}; sensitivity=${sensitivity}; tau_ms=${tau*1000}; fixed_step_s=${STEP}`,`# neutral_beta=${neutral?.beta??''}; neutral_gamma=${neutral?.gamma??''}; browser=${navigator.userAgent}`, '# JS event/frame timestamps only; not end-to-end sensor latency.'];
  const csv=[...meta,'kind,received_or_frame_ms,event_timestamp_ms,raw_x_deg,raw_y_deg,filtered_x_deg,filtered_y_deg,state,input,screen_angle_deg',...rows.map(r=>r.join(','))].join('\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'})),a=document.createElement('a');a.href=url;a.download='marble-lab-timing.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});

// The canvas is the functional game geometry. All coordinates below are metres.
function rounded(x,y,w,h,r,fill,stroke) {ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.0007;ctx.stroke();}}
function circle(x,y,r,fill) {ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();}
function draw(now) {
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
  const cw=Math.max(1,Math.round(rect.width*dpr)),ch=Math.max(1,Math.round(rect.height*dpr));
  if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
  ctx.setTransform(cw/W,0,0,ch/H,0,0);ctx.clearRect(0,0,W,H);
  const board=ctx.createLinearGradient(0,0,W,H);board.addColorStop(0,'#d9bb85');board.addColorStop(.5,'#caa56d');board.addColorStop(1,'#b58b54');ctx.fillStyle=board;ctx.fillRect(0,0,W,H);
  // Fine ruler marks at the perimeter provide a quiet, instrument-like scale.
  ctx.strokeStyle='#6a4b2929';ctx.lineWidth=.0005;
  for(let x=.02;x<W-.01;x+=.01){ctx.beginPath();ctx.moveTo(x,.011);ctx.lineTo(x,.013);ctx.stroke();}
  ctx.setLineDash([.001,.003]);ctx.strokeStyle='#714e3525';ctx.lineWidth=.0007;
  for(const y of [.046,.137,.223,.312]){ctx.beginPath();ctx.moveTo(.022,y);ctx.lineTo(.28,y);ctx.stroke();}ctx.setLineDash([]);
  ctx.font='500 .0065px system-ui';ctx.fillStyle='#705334';ctx.textAlign='left';ctx.fillText('START',.023,.025);
  ctx.strokeStyle='#70533488';ctx.lineWidth=.0008;ctx.beginPath();ctx.arc(START.x,START.y,R+.004,0,Math.PI*2);ctx.stroke();
  for(const hole of HOLES){circle(hole.x,hole.y+.0008,hole.r+.002,'#ead0a066');circle(hole.x,hole.y,hole.r+.001,'#82572e');const grad=ctx.createRadialGradient(hole.x-.004,hole.y-.005,.002,hole.x,hole.y,hole.r);grad.addColorStop(0,'#080e0b');grad.addColorStop(.65,'#182019');grad.addColorStop(1,'#49351f');circle(hole.x,hole.y,hole.r,grad);}
  circle(GOAL.x,GOAL.y,GOAL.r,'#507159');ctx.lineWidth=.0015;ctx.strokeStyle='#c6e6b7';ctx.beginPath();ctx.arc(GOAL.x,GOAL.y,GOAL.r-.003,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#e0edd2';ctx.font='600 .0055px system-ui';ctx.textAlign='center';ctx.fillText('HOME',GOAL.x,GOAL.y+.002);
  for(const w of WALLS){rounded(w.x+.001,w.y+.0025,w.w,w.h,.0015,'#74502777');rounded(w.x,w.y,w.w,w.h,.0013,'#906d40','#b69560');ctx.fillStyle='#efd3a288';ctx.fillRect(w.x+.001,w.y,w.w-.002,.0008);}
  if(trail.length>1){ctx.beginPath();ctx.moveTo(trail[0].x,trail[0].y);for(const t of trail)ctx.lineTo(t.x,t.y);ctx.strokeStyle='#f8edca24';ctx.lineWidth=.0017;ctx.stroke();}
  let bx=ball.x,by=ball.y,r=R,opacity=1;
  if(phase==='falling'&&fallHole!==null){const t=clamp((now-fallStarted)/PRESETS[preset].restart,0,1),h=HOLES[fallHole];bx+=(h.x-bx)*t;by+=(h.y-by)*t;r*=1-.85*t;opacity=1-t;}
  ctx.globalAlpha=opacity;circle(bx+.0015,by+.0022,r*1.06,'#2d221b66');
  const steel=ctx.createRadialGradient(bx-r*.36,by-r*.42,r*.06,bx,by,r);steel.addColorStop(0,'#ffffff');steel.addColorStop(.22,'#e4eae7');steel.addColorStop(.48,'#9aa9a5');steel.addColorStop(.69,'#4d5e58');steel.addColorStop(.85,'#b8c4bf');steel.addColorStop(1,'#45584f');circle(bx,by,r,steel);ctx.globalAlpha=1;
}
function updateRaw() {
  if(mode==='tilt') { if(latest&&neutral)raw=tiltVector(latest.beta,latest.gamma,neutral,orientation);else raw={x:0,y:0}; }
  else {
    const kx=(keys.has('ArrowRight')||keys.has('d')?1:0)-(keys.has('ArrowLeft')||keys.has('a')?1:0),ky=(keys.has('ArrowDown')||keys.has('s')?1:0)-(keys.has('ArrowUp')||keys.has('w')?1:0);
    const m=Math.hypot(kx,ky)||1;raw=kx||ky?{x:kx*12/m,y:ky*12/m}:{...touch};
  }
  raw.x=clamp(raw.x,-45,45);raw.y=clamp(raw.y,-45,45);
}
function filter(dt) {smooth.x=filtered(smooth.x,raw.x,dt,tau);smooth.y=filtered(smooth.y,raw.y,dt,tau);}
function diagnostics(now) {
  const width=trace.width,height=trace.height;tc.clearRect(0,0,width,height);tc.strokeStyle='#304438';tc.lineWidth=1;
  for(const y of [height*.15,height*.5,height*.85]){tc.beginPath();tc.moveTo(0,y);tc.lineTo(width,y);tc.stroke();}
  for(const [key,color,dash] of [['rx','#e5b76f',[]],['ry','#e5b76f',[5,5]],['fx','#a5e5d0',[]],['fy','#a5e5d0',[5,5]]]){
    tc.strokeStyle=color;tc.setLineDash(dash);tc.lineWidth=1.8;tc.beginPath();let first=true;
    for(const v of graph){const x=width*(1-(now-v.t)/5000);if(x<0)continue;const y=height/2-clamp(v[key],-22,22)*height/45;if(first){tc.moveTo(x,y);first=false;}else tc.lineTo(x,y);}tc.stroke();
  }tc.setLineDash([]);
  const avg=recentDts.length?recentDts.reduce((a,b)=>a+b,0)/recentDts.length:0;
  const values=[['Input', mode],['Permission',permission],['Neutral β / γ',neutral?`${neutral.beta.toFixed(1)}° / ${neutral.gamma.toFixed(1)}°`:'Not calibrated'],['Screen rotation',orientation+'°'],['Orientation event rate',avg?(1000/avg).toFixed(1)+' Hz*':'No readings'],['Latest event interval',eventDt?eventDt.toFixed(1)+' ms':'—'],['Event delivery delay',latest?delivery.toFixed(1)+' ms':'—'],['Latest event → frame',latest?Math.max(0,now-latest.stamp).toFixed(1)+' ms':'—'],['Frame interval',frameDt.toFixed(1)+' ms'],['Filter time constant',(tau*1000)+' ms'],['Physics step',(STEP*1000).toFixed(2)+' ms'],['Rotation-rate data',gyroFields],['Raw X / Y',`${raw.x.toFixed(2)}° / ${raw.y.toFixed(2)}°`],['Filtered X / Y',`${smooth.x.toFixed(2)}° / ${smooth.y.toFixed(2)}°`],['Ball speed',Math.hypot(ball.vx,ball.vy).toFixed(3)+' m/s'],['Captured timing records',String(rows.length)]];
  $('metrics').replaceChildren(...values.flatMap(([label,value])=>{const a=document.createElement('dt'),b=document.createElement('dd');a.textContent=label;b.textContent=value;return[a,b];}));
}
function frame(now) {
  frameDt=frameLast===null?0:Math.max(0,now-frameLast);frameLast=now;updateRaw();
  if(phase!=='running')filter(Math.min(frameDt/1000,.05));
  clock.tick(now,phase==='running',dt=>{
    filter(dt);elapsed+=dt;const event=advance(ball,smooth,dt,{preset,sensitivity});
    if(event?.type==='fall'){phase='falling';falls++;fallHole=event.hole;fallStarted=now;message('One more try.', 'Back to the start. Keep a lighter touch.');updateControls();return false;}
    if(event?.type==='win'){phase='won';message('Beautifully balanced.', `${clockText(elapsed)} · ${falls} ${falls===1?'fall':'falls'}`);updateControls();return false;}
  });
  if(phase==='falling'&&now-fallStarted>=PRESETS[preset].restart){ball=newBall();trail=[];fallHole=null;phase='running';clock.reset();message('','');updateControls();}
  if(phase==='running'){trail.push({x:ball.x,y:ball.y});if(trail.length>28)trail.shift();}
  draw(now);record('frame',now,latest?.stamp??'');graph.push({t:now,rx:raw.x,ry:raw.y,fx:smooth.x,fy:smooth.y});while(graph.length&&graph[0].t<now-5500)graph.shift();
  if(now-lastUI>80){lastUI=now;$('time').textContent=clockText(elapsed);$('falls').textContent=String(falls);$('tiltMagnitude').textContent=Math.min(25.5,Math.hypot(smooth.x,smooth.y)).toFixed(1);
    const radius=pad.clientWidth*.32;$('padKnob').style.transform=`translate(calc(-50% + ${clamp(smooth.x/18,-1,1)*radius}px),calc(-50% + ${clamp(smooth.y/18,-1,1)*radius}px))`;
    if($('diagnostics').open)diagnostics(now);
  }
  requestAnimationFrame(frame);
}
updateControls();requestAnimationFrame(frame);

// Optional page-scoped agent interface, using exactly the visible game actions.
if(document.modelContext?.registerTool) {
  const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  const state=()=>({phase,input:mode,preset,timeSeconds:Number(elapsed.toFixed(2)),falls,calibrated:!!neutral,ball:{x:ball.x,y:ball.y,vx:ball.vx,vy:ball.vy}});
  const tools=[
    {name:'read_marble_game',description:'Read the current maze state and selected controls.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){if(input&&Object.keys(input).length)throw new Error('No arguments expected.');return state();}},
    {name:'control_marble_game',description:'Start, pause, resume, or restart the marble maze using its visible controls. Does not request sensor permission or steer.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['start','pause','resume','restart']}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||Object.keys(input).some(k=>k!=='action')||!['start','pause','resume','restart'].includes(input.action))throw new Error('Use start, pause, resume, or restart.');if(input.action==='restart')restart();else if(input.action==='pause')pause();else{if(mode==='tilt'&&!neutral)throw new Error('Calibrate tilt using the on-screen button first.');if(phase==='falling')throw new Error('Wait for the restart.');if(phase!=='running')togglePlay();}return state();}}
  ];
  for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
}
