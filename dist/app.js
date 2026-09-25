import { BALLS, SURFACES, WALL_MATERIALS, layoutFor, STEP, MAX_TILT, clamp, tiltVector, filtered, newBall, advance, FixedClock, kineticEnergy, granularState } from './physics.js';

import {Renderer} from './render.js';
import {watchViewport} from './viewport.js';
import {SoundEngine} from './sound.js';
import {MotionInput} from './motion.js';
const motion=new MotionInput();let motionMode='tilt',tiltBudget=8,motionOverlay=false;

const $ = id => document.getElementById(id);
const canvas = $('board'),renderer=new Renderer(canvas,$('boardWrap'));
const sound=new SoundEngine(text=>$('soundStatus').textContent=text);
watchViewport(document.documentElement,()=>renderer.resize());
const trace = $('trace'), tc = trace.getContext('2d');
let material = 'steel', surface = 'wood', wallMaterial = 'wood', openEdges=false, ball = newBall(), phase = 'ready', mode = 'touch';
const tau = 0.015, RESTART_MS = 800;
let elapsed = 0, falls = 0, neutral = null, latest = null, requested = false, permission = 'Not requested', motionPermission = 'Not requested';
let raw = { x: 0, y: 0 }, smooth = { x: 0, y: 0 }, touch = { x: 0, y: 0 };
let frameLast = null, eventLast = null, frameDt = 0, eventDt = 0, delivery = 0, lastUI = 0;
let orientation = screenAngle(), fallStarted = 0, fallHole = null, pointer = null, calibrationSamples = null;
let gyroFields = 'Not observed', recentDts = [], rows = [], graph = [], recordStart = performance.now();
const keys = new Set(), clock = new FixedClock();
const clockText = t => `${String(Math.floor(t / 60)).padStart(2,'0')}:${(t % 60).toFixed(1).padStart(4,'0')}`;
function screenAngle() { return Number(screen.orientation?.angle ?? window.orientation ?? 0); }
function record(type, now, eventTime = '') {
  rows.push([type, (now-recordStart).toFixed(3), eventTime === '' ? '' : (eventTime-recordStart).toFixed(3), raw.x.toFixed(4), raw.y.toFixed(4), smooth.x.toFixed(4), smooth.y.toFixed(4), phase, mode, orientation, material, surface, wallMaterial, ...[ball.x,ball.y,ball.z,ball.vx,ball.vy,ball.vz,ball.wx,ball.wy,ball.wz,kineticEnergy(ball),ball.slip,ball.groundHeight,ball.normalLoad,ball.dwell].map(n=>n.toPrecision(7)),ball.regime]);
  if (rows.length > 12000) rows.splice(0, 2000);
}
function message(title, subtitle) { $('boardTitle').textContent = title; $('boardSubtitle').textContent = subtitle; $('boardMessage').hidden = !title; }
function status(text) { $('inputStatus').textContent = text; }
function updateControls() {
  const playing=phase==='running'||phase==='falling';
  document.body.dataset.playing=String(playing);document.body.dataset.input=mode;
  for(const h of document.querySelectorAll('.hud')){h.inert=playing;h.setAttribute('aria-hidden',String(playing));}
  $('pauseButton').hidden=!playing;
  $('motionQuick').hidden=!playing;$('motionQuick').textContent=mode!=='tilt'?'Touch tilt':motionMode==='full'?'Full motion':'Tilt only';$('motionQuick').disabled=mode!=='tilt';$('motionQuick').setAttribute('aria-pressed',String(motionMode==='full'));
  $('motionMode').value=motionMode;$('motionReadout').hidden=!motionOverlay;ball.tiltBudget=tiltBudget;
  $('touchControls').inert=!(playing&&mode==='touch');
  $('touchControls').setAttribute('aria-hidden',String(!(playing&&mode==='touch')));
  $('touchButton').classList.toggle('selected', mode === 'touch'); $('touchButton').setAttribute('aria-pressed', mode === 'touch');
  $('tiltButton').classList.toggle('selected', mode === 'tilt'); $('tiltButton').setAttribute('aria-pressed', mode === 'tilt');
  $('tiltButton').textContent = mode === 'tilt' ? 'Tilt enabled' : 'Enable tilt';
  $('calibrate').disabled = mode !== 'tilt' || !latest || !!calibrationSamples;
  $('inputLabel').textContent = mode === 'tilt' ? 'PHONE TILT' : 'VIRTUAL TILT';
  $('inputHint').textContent = mode === 'tilt' ? neutral ? 'Counter-tilt to brake.' : 'Calibrate before play.' : 'Arrow keys also work.';
  $('play').textContent = phase === 'running' ? 'Pause' : phase === 'paused' ? 'Resume' : phase === 'won' ? 'Again' : 'Play';
  $('play').disabled = phase === 'falling' || (mode === 'tilt' && (!neutral || !latest || !!calibrationSamples));
  $('stateLabel').textContent = ({ ready:'READY', running:'IN PLAY', paused:'PAUSED', falling:'TRY AGAIN', won:'COMPLETE' })[phase];
  $('presetLabel').textContent = `${BALLS[material].short} / ${SURFACES[surface].name.toUpperCase()}`;
  if(document.body.dataset.surface!==surface)document.body.dataset.surface=surface;
  if(document.body.dataset.wall!==wallMaterial)document.body.dataset.wall=wallMaterial;
  const layout=layoutFor(material);
  $('sceneName').textContent='SADDLE AND BASIN · DRAFT';
  $('boardDimensions').textContent=`${(layout.width*100).toFixed(0)} × ${(layout.height*100).toFixed(0)} cm board`;
  $('wallDescription').textContent=WALL_MATERIALS[wallMaterial].description;
  $('presetDescription').textContent = `${BALLS[material].name} · ${SURFACES[surface].name} · ${WALL_MATERIALS[wallMaterial].name}`;
  $('materialDescription').textContent = `${BALLS[material].description}. Diameter ${(ball.r*2000).toFixed(2).replace(/\.?0+$/,'')} mm, mass ${(ball.m*1000).toFixed(1)} g.`;
  $('surfaceDescription').textContent = SURFACES[surface].description;
}
function stopInput() { motion.resetHold();keys.clear(); touch = { x:0, y:0 }; pointer = null; }
function pause(reason = 'Your move, when you’re ready.') {
  if (phase === 'running') { phase = 'paused'; message('Take a breath.', reason); }
  if (phase === 'falling') { ball = newBall(material,surface,wallMaterial,openEdges); phase = 'paused'; fallHole = null; message('Ready to try again?', reason); }
  stopInput(); sound.pause(); clock.reset(); updateControls();
}
function restart() {
  sound.pause();renderer.clearMarks();
  ball = newBall(material,surface,wallMaterial,openEdges); elapsed = 0; falls = 0; phase = 'ready'; fallHole = null; clock.reset();
  smooth = { x:0, y:0 }; stopInput(); message('Find your balance.', 'Climb, dip, then hold the green ring for 3 seconds.'); updateControls();
}
function togglePlay() {
  if (phase === 'running') return pause();
  if (phase === 'falling' || (mode === 'tilt' && !neutral)) return;
  if (phase === 'won') restart();
  phase = 'running'; message('', ''); clock.reset(); updateControls();$('pauseButton').focus({preventScroll:true});
}
function setTouch(text = 'Drag the pad to accelerate. Release to coast.') {
  pause('Control changed. Press Resume when ready.'); mode = 'touch'; raw = {x:0,y:0}; smooth = {x:0,y:0}; status(text); updateControls();
}
function onOrientation(event) {
  if (!requested || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
  const now = performance.now(),firstReading=!latest;
  let stamp = event.timeStamp > 1e12 ? event.timeStamp - performance.timeOrigin : event.timeStamp;
  if (!Number.isFinite(stamp) || stamp <= 0 || stamp > now + 1000) stamp = now;
  latest = { beta:event.beta, gamma:event.gamma, received:now, stamp };
  if (eventLast !== null) { eventDt = now-eventLast; recentDts.push(eventDt); if(recentDts.length>80) recentDts.shift(); }
  eventLast = now; delivery = Math.max(0,now-stamp);
  if (mode === 'tilt' && neutral) raw = tiltVector(latest.beta, latest.gamma, neutral, orientation);
  if (calibrationSamples) calibrationSamples.push({beta:event.beta,gamma:event.gamma});
  motion.orientation(event.beta,event.gamma,stamp);record('orientation',now,stamp);
  if(firstReading){
    if(mode==='tilt'&&!neutral&&!calibrationSamples)status('Hold a comfortable angle, then tap Calibrate.');
    updateControls();
  }
}
window.addEventListener('deviceorientation', onOrientation);
window.addEventListener('devicemotion', e => {
  if (!requested) return;
  const r = e.rotationRate;
  let stamp=e.timeStamp>1e12?e.timeStamp-performance.timeOrigin:e.timeStamp;if(!Number.isFinite(stamp)||stamp<=0)stamp=performance.now();
  motion.ingest(e.accelerationIncludingGravity,stamp,orientation);
  gyroFields = r && [r.alpha,r.beta,r.gamma].some(Number.isFinite) ? 'Rotation-rate values available' : 'No rotation-rate values';
});
async function enableTilt() {
  sound.unlock();
  if (mode === 'tilt') return;
  if (!window.isSecureContext) return setTouch('Tilt needs a secure page. Touch controls are ready.');
  if (!('DeviceOrientationEvent' in window) && !('ondeviceorientation' in window)) return setTouch('No motion support found. Touch controls are ready.');
  pause('Tilt selected. Calibrate before resuming.'); requested = true;
  // Both permission requests originate synchronously in this button’s tap handler.
  let required, optional;
  try {
    required = typeof window.DeviceOrientationEvent?.requestPermission === 'function' ? window.DeviceOrientationEvent.requestPermission() : Promise.resolve('granted');
    optional = typeof window.DeviceMotionEvent?.requestPermission === 'function' ? window.DeviceMotionEvent.requestPermission().catch(()=>'unavailable') : Promise.resolve('not requested');
    // Fullscreen is activation-consuming: invoke after audio/permission calls, before awaiting.
    if(/Android/i.test(navigator.userAgent)&&!isStandalone())requestFullScreen(false);
    const [result, motionResult] = await Promise.all([required, optional]);motionPermission=motionResult;
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
document.addEventListener('visibilitychange', () => { if (document.hidden) { calibrationSamples=null; pause('Press Resume when you return.');sound.hide(); } frameLast=null;clock.reset(); });
window.addEventListener('blur', () => pause('Press Resume when you’re ready.'));

const pad = $('pad');
function movePointer(e) {
  const rect=pad.getBoundingClientRect(), scale=rect.width*0.35;
  let x=(e.clientX-rect.left-rect.width/2)/scale, y=(e.clientY-rect.top-rect.height/2)/scale;
  const m=Math.hypot(x,y); if(m>1){x/=m;y/=m;}
  // Cubic radial response gives fine control near the centre and reaches the
  // full physical tilt range at the edge; touch still controls acceleration.
  const gain=tiltBudget*Math.min(1,m)**2;
  touch={x:x*gain,y:y*gain};
}
pad.addEventListener('pointerdown', e=>{if(mode!=='touch'||pointer!==null)return; e.preventDefault();pointer=e.pointerId;pad.setPointerCapture(e.pointerId);movePointer(e);});
pad.addEventListener('pointermove',e=>{if(e.pointerId===pointer)movePointer(e);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(name,e=>{if(e.pointerId===pointer){touch={x:0,y:0};pointer=null;}});
window.addEventListener('keydown',e=>{
  if($('settings').open||$('diagnostics').open||/INPUT|SELECT|TEXTAREA|SUMMARY/.test(e.target.tagName))return;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key)){e.preventDefault();if(mode==='touch')keys.add(e.key);}
  if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();if(!e.repeat){sound.unlock();togglePlay();}}
});
window.addEventListener('keyup',e=>keys.delete(e.key));
document.addEventListener('touchmove',e=>{if(!e.target.closest('dialog, .controls'))e.preventDefault();},{passive:false});
$('pauseButton').addEventListener('click',()=>{pause();$('play').focus({preventScroll:true});});
$('play').addEventListener('click',()=>{sound.unlock();togglePlay();});$('restart').addEventListener('click',restart);
$('touchButton').addEventListener('click',()=>setTouch());$('tiltButton').addEventListener('click',enableTilt);$('calibrate').addEventListener('click',calibrate);
for(const name of ['settings','diagnostics']) {
  $(name==='settings'?'settingsButton':'debugButton').addEventListener('click',()=>{pause();$(name).showModal();});
  document.querySelector(`[data-close="${name}"]`).addEventListener('click',()=>$(name).close());
  $(name).addEventListener('click',e=>{if(e.target===$(name)){const b=$(name).getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)$(name).close();}});
}
function setMotion(value){motionMode=value;motion.resetHold();updateControls();}
$('motionMode').addEventListener('change',e=>setMotion(e.target.value));
$('motionQuick').addEventListener('click',()=>setMotion(motionMode==='full'?'tilt':'full'));
$('tiltBudget').addEventListener('input',e=>{tiltBudget=Number(e.target.value);$('tiltBudgetValue').textContent=tiltBudget+'°';ball.tiltBudget=tiltBudget;});
$('motionOverlay').addEventListener('change',e=>{motionOverlay=e.target.checked;updateControls();});
$('exportMotion').addEventListener('click',()=>{const report={...motion.report(),recordedAt:new Date().toISOString(),browser:navigator.userAgent,scenario:$('motionScenario').value,orientation,neutral,tiltBudget,motionMode,inputMode:mode,frameTimeOrigin:recordStart,frameRecords:rows,phoneValidation:'pending user review; no hardware range inference'},url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='marble-relief-motion.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('clearMotion').addEventListener('click',()=>{motion.clearRecording();});
$('ballMaterial').addEventListener('change',e=>{material=e.target.value;restart();});
$('floorMaterial').addEventListener('change',e=>{surface=e.target.value;restart();});
$('wallMaterial').addEventListener('change',e=>{wallMaterial=e.target.value;restart();});
$('openEdges').addEventListener('change',e=>{openEdges=e.target.checked;restart();});
function isStandalone(){return window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}
function updateInstallHint(){
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  $('installHint').hidden=isStandalone();
  $('installHint').textContent=ios?'Largest view on iPhone: Safari → Share → Add to Home Screen.':'For edge-to-edge play, add to Home Screen or use Full screen.';
  $('installInstructions').textContent=ios?'In Safari, tap Share → Add to Home Screen. Keep “Open as Web App” enabled if offered, then launch the icon. Sign in again if asked.':'Use your browser’s Install / Add to Home Screen menu for standalone play, or choose Full screen. An internet connection and sign-in may still be needed.';
}
async function requestFullScreen(toggle=true){
  try{
    if(document.fullscreenElement){if(toggle)await document.exitFullscreen();return;}
    if(!document.documentElement.requestFullscreen)throw new Error('unavailable');
    await document.documentElement.requestFullscreen({navigationUI:'hide'});
    try{if(typeof screen.orientation?.lock!=='function')throw new Error('unavailable');await screen.orientation.lock('portrait');$('screenStatus').textContent='Portrait requested for full-screen play.';}
    catch{$('screenStatus').textContent='Orientation lock unavailable. Axes still remap after rotation.';}
  }catch{$('screenStatus').textContent='Full screen is unavailable here. On iPhone, use Add to Home Screen.';}
}
function fullscreen(){sound.unlock();requestFullScreen();}
$('fullscreen').addEventListener('click',fullscreen);$('settingsFullscreen').addEventListener('click',fullscreen);
$('soundEnabled').addEventListener('change',e=>{sound.setEnabled(e.target.checked);$('soundStatus').textContent=e.target.checked?'Sound enabled. Your device controls silent mode.':'Sound off.';});
$('hapticsEnabled').disabled=typeof navigator.vibrate!=='function';
$('hapticsStatus').textContent=typeof navigator.vibrate==='function'?'Optional short vibrations on wall hits. Your browser may suppress them.':'This browser does not expose vibration; wall haptics are unavailable.';
$('hapticsEnabled').addEventListener('change',e=>{sound.haptics=e.target.checked;if(!sound.haptics)navigator.vibrate?.(0);});
window.matchMedia('(display-mode: standalone)').addEventListener('change',updateInstallHint);updateInstallHint();
$('clearLog').addEventListener('click',()=>{rows=[];graph=[];recordStart=performance.now();});
$('exportLog').addEventListener('click',()=>{
  const meta=[`# Marble Lab; model=6; terrain=relief; motion=${motionMode}; tilt_budget=${tiltBudget}; open_edges=${openEdges}; tau_ms=${tau*1000}; fixed_step_s=${STEP}`,`# neutral_beta=${neutral?.beta??''}; neutral_gamma=${neutral?.gamma??''}; browser=${navigator.userAgent}`, '# JS timestamps are not end-to-end sensor latency; ball variables are simulated SI values.'];
  const csv=[...meta,'kind,received_or_frame_ms,event_timestamp_ms,raw_x_deg,raw_y_deg,filtered_x_deg,filtered_y_deg,state,input,screen_angle_deg,ball_material,surface,wall_material,x_m,y_m,z_m,vx_m_s,vy_m_s,vz_m_s,omega_x_rad_s,omega_y_rad_s,omega_z_rad_s,kinetic_energy_J,slip_m_s,terrain_height_m,normal_load_N,goal_dwell_s,contact_regime',...rows.map(r=>r.join(','))].join('\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'})),a=document.createElement('a');a.href=url;a.download='marble-lab-timing.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});

function updateRaw() {
  if(mode==='tilt') { if(latest&&neutral)raw=tiltVector(latest.beta,latest.gamma,neutral,orientation);else raw={x:0,y:0}; }
  else {
    const kx=(keys.has('ArrowRight')||keys.has('d')?1:0)-(keys.has('ArrowLeft')||keys.has('a')?1:0),ky=(keys.has('ArrowDown')||keys.has('s')?1:0)-(keys.has('ArrowUp')||keys.has('w')?1:0);
    const m=Math.hypot(kx,ky)||1;raw=kx||ky?{x:kx*tiltBudget/m,y:ky*tiltBudget/m}:{...touch};
  }
  raw.x=clamp(raw.x,-45,45);raw.y=clamp(raw.y,-45,45);
}
function filter(dt) {smooth.x=filtered(smooth.x,raw.x,dt,tau);smooth.y=filtered(smooth.y,raw.y,dt,tau);}
function diagnostics(now) {
  const width=trace.width,height=trace.height;tc.clearRect(0,0,width,height);tc.strokeStyle='#304438';tc.lineWidth=1;
  for(const y of [height*.15,height*.5,height*.85]){tc.beginPath();tc.moveTo(0,y);tc.lineTo(width,y);tc.stroke();}
  for(const [key,color,dash] of [['rx','#e5b76f',[]],['ry','#e5b76f',[5,5]],['fx','#a5e5d0',[]],['fy','#a5e5d0',[5,5]]]){
    tc.strokeStyle=color;tc.setLineDash(dash);tc.lineWidth=1.8;tc.beginPath();let first=true;
    for(const v of graph){const x=width*(1-(now-v.t)/5000);if(x<0)continue;const y=height/2-clamp(v[key],-35,35)*height/70;if(first){tc.moveTo(x,y);first=false;}else tc.lineTo(x,y);}tc.stroke();
  }tc.setLineDash([]);
  const avg=recentDts.length?recentDts.reduce((a,b)=>a+b,0)/recentDts.length:0;
  const a=motion.last;
  const values=[['Motion mode',motionMode],['Acceleration X / Y / up',`${a.x.toFixed(2)} / ${a.y.toFixed(2)} / ${a.z.toFixed(2)} m/s²`],['Delivered motion rate',motion.rate.toFixed(1)+' Hz'],['Observed axis peaks',motion.peak.map(v=>(v/9.81).toFixed(2)+'g').join(' / ')],['Hardware range','Not exposed; peaks are lower bounds'],['Clipping',motion.clipSuspected?'Suspected flat top':'Not observed'],['3g caps',String(motion.capCount)],['Pose age at sample',motion.poseAge.toFixed(1)+' ms'],['Input', mode],['Permission',permission],['Motion permission',motionPermission],['Neutral β / γ',neutral?`${neutral.beta.toFixed(1)}° / ${neutral.gamma.toFixed(1)}°`:'Not calibrated'],['Screen rotation',orientation+'°'],['Orientation event rate',avg?(1000/avg).toFixed(1)+' Hz*':'No readings'],['Latest event interval',eventDt?eventDt.toFixed(1)+' ms':'—'],['Event delivery delay',latest?delivery.toFixed(1)+' ms':'—'],['Latest event → frame',latest?Math.max(0,now-latest.stamp).toFixed(1)+' ms':'—'],['Frame interval',frameDt.toFixed(1)+' ms'],['Filter time constant',(tau*1000)+' ms'],['Physics step',(STEP*1000).toFixed(2)+' ms'],['Canvas pixels',`${canvas.width} × ${canvas.height}`],['Pixel ratio',String(renderer.dpr)],['Cached scene builds',String(renderer.rebuilds)],['Audio',sound.ctx?.state??'Awaiting tap'],['Rotation-rate data',gyroFields],['Raw X / Y',`${raw.x.toFixed(2)}° / ${raw.y.toFixed(2)}°`],['Filtered X / Y',`${smooth.x.toFixed(2)}° / ${smooth.y.toFixed(2)}°`],['Ball speed',Math.hypot(ball.vx,ball.vy).toFixed(3)+' m/s'],['Captured timing records',String(rows.length)]];
  values.push(['Ball / surface',`${BALLS[material].name} / ${SURFACES[surface].name}`],['Mass / diameter',`${(ball.m*1000).toFixed(2)} g / ${ball.r*2000} mm`],['Walls',WALL_MATERIALS[wallMaterial].name],['Board dimensions',`${layoutFor(material).width.toFixed(3)} × ${layoutFor(material).height.toFixed(3)} m`],['Inertia / mR²',BALLS[material].inertiaRatio.toFixed(4)],['Contact regime',ball.regime],['Slip speed',(ball.slip*1000).toFixed(1)+' mm/s'],['Spin magnitude',Math.hypot(ball.wx,ball.wy,ball.wz).toFixed(1)+' rad/s'],['Height above support',(Math.max(0,ball.supportGap)*1000).toFixed(2)+' mm'],['Terrain height',(ball.groundHeight*1000).toFixed(3)+' mm'],['Normal load / mg',(ball.normalLoad/(ball.m*9.81)).toFixed(3)],['Goal hold',ball.dwell.toFixed(2)+' / 3 s'],['Edges',openEdges?'Open':'Walled'],['Kinetic energy',(kineticEnergy(ball)*1000).toFixed(3)+' mJ']);
  if(surface==='sand')values.push(['Estimated sinkage',(granularState(ball,ball.normalLoad/(ball.m*9.81)).sinkage*1000).toFixed(2)+' mm']);
  $('metrics').replaceChildren(...values.flatMap(([label,value])=>{const a=document.createElement('dt'),b=document.createElement('dd');a.textContent=label;b.textContent=value;return[a,b];}));
}
function frame(now) {
  frameDt=frameLast===null?0:Math.max(0,now-frameLast);frameLast=now;updateRaw();
  if(phase!=='running')filter(Math.min(frameDt/1000,.05));
  const contacts=[],startSimulationTime=ball.time;
  clock.tick(now,phase==='running',(dt,end)=>{
    filter(dt);elapsed+=dt;let event=null;
    const segments=motionMode==='full'&&mode==='tilt'?motion.segments(end-dt*1000,end):[{dt,a:{x:0,y:0,z:0}}];
    for(const segment of segments){event=advance(ball,smooth,segment.dt,{maxTilt:tiltBudget,acceleration:segment.a,onContact:e=>{if(contacts.length<40)contacts.push(e);}});if(event)break;}
    if(event?.type==='fall'||event?.type==='escape'){phase='falling';sound.capture();falls++;fallHole=event.hole??null;fallStarted=now;message(event.type==='escape'?'Over the edge.':'One more try.', 'Back to the start. Keep a lighter touch.');updateControls();return false;}
    if(event?.type==='win'){phase='won';sound.pause();message('Beautifully balanced.', `${clockText(elapsed)} · ${falls} ${falls===1?'fall':'falls'}`);updateControls();return false;}
  });
  if(phase==='falling'&&now-fallStarted>=RESTART_MS){ball=newBall(material,surface,wallMaterial,openEdges);fallHole=null;phase='running';clock.reset();message('','');updateControls();}
  if(phase==='running'||phase==='falling')sound.impacts(contacts,startSimulationTime);sound.update(ball,phase==='running');
  renderer.draw(ball,smooth,{phase,now,fallStarted,fallHole,restartMs:RESTART_MS,running:phase==='running'});record('frame',now,latest?.stamp??'');graph.push({t:now,rx:raw.x,ry:raw.y,fx:smooth.x,fy:smooth.y});while(graph.length&&graph[0].t<now-5500)graph.shift();
  if(now-lastUI>80){lastUI=now;$('time').textContent=clockText(elapsed);$('falls').textContent=String(falls);$('tiltMagnitude').textContent=Math.min(tiltBudget,Math.hypot(smooth.x,smooth.y)).toFixed(1);
    const radius=pad.clientWidth*.32;$('padKnob').style.transform=`translate(calc(-50% + ${clamp(smooth.x/tiltBudget,-1,1)*radius}px),calc(-50% + ${clamp(smooth.y/tiltBudget,-1,1)*radius}px))`;
    if($('diagnostics').open)diagnostics(now);
    const motionFresh=motion.lastStamp!==null&&now-motion.lastStamp<500;
    $('motionStatus').textContent=mode!=='tilt'?'Enable phone tilt to use full motion.':motionFresh?'Phone acceleration is available.':motionPermission==='denied'?'Motion access was declined. Tilt is available; lift and shake need motion permission.':'No recent acceleration samples. Lift and shake are unavailable until readings resume.';
    if(phase==='running'&&mode==='tilt'&&motionMode==='full')$('motionQuick').textContent=motionFresh?'Full motion':'No motion · tilt only';
    if(motionOverlay){const a=motion.last;$('motionValues').textContent=`measured a ${a.x.toFixed(1)} / ${a.y.toFixed(1)} / ${a.z.toFixed(1)} m/s²\nN ${ball.normalLoad.toFixed(3)} N · ${ball.regime}\n${motion.rate.toFixed(0)} Hz · ${motion.clipSuspected?'CLIP?':'no clip seen'}${a.capped?' · 3g cap':''}`;const c=$('motionTrace').getContext('2d'),w=300,h=90;c.clearRect(0,0,w,h);for(const [key,col] of [['x','#e7b36d'],['y','#9de4c1'],['z','#90bfff']]){c.beginPath();c.strokeStyle=col;let first=true;for(const s of motion.rows){if(now-s.time>2500)continue;const x=w*(1-(now-s.time)/2500),y=h/2-s.a[key]/29.43*h*.45;if(first)c.moveTo(x,y);else c.lineTo(x,y);first=false;}c.stroke();}}
  }
  requestAnimationFrame(frame);
}
updateControls();requestAnimationFrame(frame);

// Optional page-scoped agent interface, using exactly the visible game actions.
if(document.modelContext?.registerTool) {
  const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  const state=()=>({phase,input:mode,motionMode,tiltBudget,material,surface,wallMaterial,openEdges,goalDwell:ball.dwell,board:{width:layoutFor(material).width,height:layoutFor(material).height},timeSeconds:Number(elapsed.toFixed(2)),falls,calibrated:!!neutral,ball:{x:ball.x,y:ball.y,z:ball.z,vx:ball.vx,vy:ball.vy,vz:ball.vz,wx:ball.wx,wy:ball.wy,wz:ball.wz,regime:ball.regime}});
  const tools=[
    {name:'read_marble_game',description:'Read the current maze state and selected controls.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){if(input&&Object.keys(input).length)throw new Error('No arguments expected.');return state();}},
    {name:'control_marble_game',description:'Start, pause, resume, or restart the marble maze using its visible controls. Does not request sensor permission or steer.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['start','pause','resume','restart']}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||Object.keys(input).some(k=>k!=='action')||!['start','pause','resume','restart'].includes(input.action))throw new Error('Use start, pause, resume, or restart.');if(input.action==='restart')restart();else if(input.action==='pause')pause();else{if(mode==='tilt'&&!neutral)throw new Error('Calibrate tilt using the on-screen button first.');if(phase==='falling')throw new Error('Wait for the restart.');if(phase!=='running')togglePlay();}return state();}}
  ];
  for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
}
