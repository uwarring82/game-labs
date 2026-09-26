import { BALLS, BALL_SIZES, SURFACES, WALL_MATERIALS, layoutFor, STEP, MAX_TILT, clamp, tiltVector, filtered, newBall, advance, FixedClock, kineticEnergy, granularState } from './physics.js';

import {Renderer} from './render.js';
import {watchViewport} from './viewport.js';
import {SoundEngine} from './sound.js';
import {MotionInput} from './motion.js';
import {reliefLevel} from './landscape.js';
import {Sculptor,SCULPT,SCULPT_VERSION,flatLimit} from './sculpt.js';
import {movableWalls,pivot,handleOf,quantizePose,wrapAngle,wallDistance,wallClearances} from './walls.js';
const motion=new MotionInput();let motionMode='tilt',tiltBudget=8,motionOverlay=false;
// Sculpt: edits live in the level's edit layer; the stroke list is autosaved per device.
// Wall poses have their own key: stage 07 shares the strokes key and would drop them.
const sculptor=new Sculptor(reliefLevel()),SCULPT_KEY=`game-labs/marble-lab/sculpt/v${SCULPT_VERSION}/${reliefLevel().seed}`,WALLS_KEY=`game-labs/marble-lab/sculpt-walls/v1/${reliefLevel().seed}`,SIZE_NAMES={S:'small',M:'medium',L:'large'};
let sculptTool='dig',sculptSize='M',brushPointer=null,brushAt=null,strokeStart=0,strokeTicks=0,lastPointerType='touch',wallDrag=null,ballSize=1;
try{const strokes=JSON.parse(localStorage.getItem(SCULPT_KEY)??'null'),walls=JSON.parse(localStorage.getItem(WALLS_KEY)??'null');
  if(strokes||walls)sculptor.load({v:SCULPT_VERSION,seed:reliefLevel().seed,strokes:[],...strokes,walls:walls?.seed===reliefLevel().seed?walls.walls:undefined});}catch{}
function saveSculpt(){try{
  if(sculptor.strokes.length)localStorage.setItem(SCULPT_KEY,JSON.stringify(sculptor.save()));else localStorage.removeItem(SCULPT_KEY);
  if(sculptor.poses.size)localStorage.setItem(WALLS_KEY,JSON.stringify(sculptor.saveWalls()));else localStorage.removeItem(WALLS_KEY);}catch{}}
const mm=r=>(r*2000).toFixed(2).replace(/\.?0+$/,'');

const $ = id => document.getElementById(id);
const canvas = $('board'),renderer=new Renderer(canvas,$('boardWrap'));renderer.setLevel(sculptor.currentLevel());
const sound=new SoundEngine(text=>$('soundStatus').textContent=text);
watchViewport(document.documentElement,()=>renderer.resize());
const trace = $('trace'), tc = trace.getContext('2d');
let material = 'steel', surface = 'wood', wallMaterial = 'wood', openEdges=false, ball = freshBall(), phase = 'ready', mode = 'touch';
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
  rows.push([type, (now-recordStart).toFixed(3), eventTime === '' ? '' : (eventTime-recordStart).toFixed(3), raw.x.toFixed(4), raw.y.toFixed(4), smooth.x.toFixed(4), smooth.y.toFixed(4), phase, mode, orientation, material, surface, wallMaterial, ball.r, ...[ball.x,ball.y,ball.z,ball.vx,ball.vy,ball.vz,ball.wx,ball.wy,ball.wz,kineticEnergy(ball),ball.slip,ball.groundHeight,ball.normalLoad,ball.dwell].map(n=>n.toPrecision(7)),ball.regime]);
  if (rows.length > 12000) rows.splice(0, 2000);
}
function message(title, subtitle) { $('boardTitle').textContent = title; $('boardSubtitle').textContent = subtitle; $('boardMessage').hidden = !title; }
function status(text) { $('inputStatus').textContent = text; }
function updateControls() {
  const playing=phase==='running'||phase==='falling',building=phase==='build';
  document.body.dataset.playing=String(playing);document.body.dataset.build=String(building);document.body.dataset.input=mode;
  for(const h of document.querySelectorAll('.hud')){h.inert=playing||building;h.setAttribute('aria-hidden',String(playing||building));}
  $('sculptBar').hidden=!building;$('sculpt').disabled=playing||building||!!calibrationSamples;
  for(const [id,tool] of SCULPT_TOOLS){$(id).classList.toggle('selected',sculptTool===tool);$(id).setAttribute('aria-pressed',String(sculptTool===tool));}
  $('sculptSize').hidden=sculptTool==='walls';$('sculptSize').textContent=sculptSize;$('sculptSize').setAttribute('aria-label',`Brush size: ${SIZE_NAMES[sculptSize]}`);
  $('sculptUndo').disabled=!sculptor.canUndo;$('sculptReset').disabled=!sculptor.edited;if(building)sculptStatus();
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
  $('stateLabel').textContent = ({ ready:'READY', running:'IN PLAY', paused:'PAUSED', falling:'TRY AGAIN', won:'COMPLETE', build:'SCULPT' })[phase];
  $('presetLabel').textContent = `${BALLS[material].short}${ballSize===1?'':` ×${ballSize}`} / ${SURFACES[surface].name.toUpperCase()}`;
  $('ballSize').value=String(ballSize);$('ballSizeValue').textContent=`${mm(BALLS[material].radius*ballSize)} mm (×${ballSize})`;
  if(document.body.dataset.surface!==surface)document.body.dataset.surface=surface;
  if(document.body.dataset.wall!==wallMaterial)document.body.dataset.wall=wallMaterial;
  const layout=layoutFor(material);
  $('sceneName').textContent=`SADDLE AND BASIN · ${sculptor.edited?'EDITED':'DRAFT'}`;
  $('boardDimensions').textContent=`${(layout.width*100).toFixed(0)} × ${(layout.height*100).toFixed(0)} cm board`;
  $('wallDescription').textContent=WALL_MATERIALS[wallMaterial].description;
  $('presetDescription').textContent = `${BALLS[material].name} · ${SURFACES[surface].name} · ${WALL_MATERIALS[wallMaterial].name}`;
  $('materialDescription').textContent = `${BALLS[material].description}. Diameter ${mm(ball.r)} mm, mass ${(ball.m*1000).toFixed(1)} g.`;
  $('surfaceDescription').textContent = SURFACES[surface].description;
}
function stopInput() { motion.resetHold();keys.clear(); touch = { x:0, y:0 }; pointer = null; endStroke(); }
function pause(reason = 'Your move, when you’re ready.') {
  if (phase === 'running') { phase = 'paused'; message('Take a breath.', reason); }
  if (phase === 'falling') { ball = freshBall(); phase = 'paused'; fallHole = null; message('Ready to try again?', reason); }
  stopInput(); sound.pause(); clock.reset(); updateControls();
}
function restart() {
  sound.pause();renderer.clearMarks();endStroke();brushAt=null;
  ball = freshBall(); elapsed = 0; falls = 0; phase = 'ready'; fallHole = null; clock.reset();
  smooth = { x:0, y:0 }; stopInput(); message('Find your balance.', sculptor.edited?'Edited board: the route bot has not checked it.':'Climb, dip, then hold the green ring for 3 seconds.'); updateControls();
}
// Sculpt is a paused build phase: the physics does not run, and every entry and exit
// starts a new run from the start shelf, which edits never touch.
function enterSculpt() {
  if (phase === 'running' || phase === 'falling' || phase === 'build' || calibrationSamples) return;
  restart(); phase = 'build'; message('', ''); updateControls(); $('sculptDone').focus({preventScroll:true});
}
// Every new ball uses the current level (moved walls included) and the chosen size.
function freshBall() { return newBall(material,surface,wallMaterial,openEdges,{level:sculptor.currentLevel(),size:ballSize}); }
const SCULPT_TOOLS=[['toolDig','dig'],['toolPile','pile'],['toolWalls','walls']];
// Walls tool: press on a wall to move it, or on its round handle to turn
// it about the centre of its bounding box. Each pose is checked before it is shown.
function pickWall(p) {
  const level=sculptor.currentLevel(),movable=movableWalls(level);let best=null;
  for(const i of movable){const [hx,hy]=handleOf(level.walls[i]),d=Math.hypot(p.x-hx,p.y-hy);if(d<.015&&(!best||d<best.d))best={index:i,mode:'turn',d};}
  if(best)return best;
  for(const i of movable){const d=wallDistance(level.walls[i],p.x,p.y);if(d<.02&&(!best||d<best.d))best={index:i,mode:'move',d};}
  return best;
}
function wallBox(w){const xs=w.points.map(p=>p[0]),ys=w.points.map(p=>p[1]),pad=.02;return{x0:Math.min(...xs)-pad,y0:Math.min(...ys)-pad,x1:Math.max(...xs)+pad,y1:Math.max(...ys)+pad};}
function dragWall(p) {
  const d=wallDrag,s=d.start;let pose;
  // A wall moves only after a deliberate drag: 4 mm of board, or 2° of turn.
  if(!d.moving){const [cx,cy]=pivot(sculptor.level.walls[d.index].points),x0=cx+s.dx,y0=cy+s.dy,turn=Math.abs(wrapAngle(Math.atan2(p.y-y0,p.x-x0)-Math.atan2(d.p0.y-y0,d.p0.x-x0)));
   if(d.mode==='move'?Math.hypot(p.x-d.p0.x,p.y-d.p0.y)<.004:turn<2*Math.PI/180)return;d.moving=true;}
  if(d.mode==='move')pose={dx:s.dx+p.x-d.p0.x,dy:s.dy+p.y-d.p0.y,a:s.a};
  else{const [cx,cy]=pivot(sculptor.level.walls[d.index].points),x0=cx+s.dx,y0=cy+s.dy;pose={dx:s.dx,dy:s.dy,a:s.a+Math.atan2(p.y-y0,p.x-x0)-Math.atan2(d.p0.y-y0,d.p0.x-x0)};}
  const result=sculptor.tryWall(d.index,quantizePose(pose));
  if(!result.ok){d.invalid=true;$('sculptStatus').textContent=result.reason;return;}
  const a=wallBox(renderer.level.walls[d.index]),b=wallBox(result.level.walls[d.index]);
  d.pose=quantizePose(pose);d.invalid=false;renderer.setLevel(result.level,{x0:Math.min(a.x0,b.x0),y0:Math.min(a.y0,b.y0),x1:Math.max(a.x1,b.x1),y1:Math.max(a.y1,b.y1)});sculptStatus();
}
function endWallDrag() {
  const d=wallDrag;if(!d)return;wallDrag=null;
  if(d.pose&&sculptor.moveWall(d.index,d.pose))saveSculpt();
  renderer.setLevel(sculptor.currentLevel());if(phase==='build')updateControls();
}
function leaveSculpt() { if (phase !== 'build') return; endStroke(); saveSculpt(); restart(); $('play').focus({preventScroll:true}); }
function endStroke() {
  endWallDrag();
  if (brushPointer !== null && lastPointerType !== 'mouse') brushAt = null;
  brushPointer = null; if (!sculptor.stroke) return;
  sculptUpdate(performance.now(), Infinity);
  if (sculptor.end()) saveSculpt(); if (phase === 'build') updateControls();
}
// The active stroke keeps the tool and size it started with.
function brushChoice() { return sculptor.stroke ?? { tool: sculptTool, size: sculptSize }; }
function sculptStatus(limited = false) {
  if (sculptTool === 'walls' && !sculptor.stroke) { $('sculptStatus').textContent = 'Drag a wall to move it; drag its round handle to turn it. The border stays.'; return; }
  const {tool,size}=brushChoice(),depth=(flatLimit(SCULPT.sizes[size],tool)*layoutFor(material).scale*1000).toFixed(1);
  $('sculptStatus').textContent = limited ? 'At the limit: slopes stay below 14.6° and crests stay rounded.' : `${tool==='dig'?'Dig':'Pile'}, ${SIZE_NAMES[size]}: up to ${depth} mm on level ground. Hold deepens; drag ploughs.`;
}
function sculptUpdate(now, limit = 4) {
  // Brush ticks run on stroke time, so the number of ticks depends only on how long the
  // board was pressed. A slow device works off a backlog (at most four per frame) and
  // flushes it on release.
  const due=Math.floor((now-strokeStart)/(SCULPT.tick*1000))+1;let rect=null,count=0,limited=false;
  while(strokeTicks<due&&count<limit){const r=sculptor.tick();strokeTicks++;count++;if(sculptor.lastAlpha<1)limited=true;if(r)rect=rect?{x0:Math.min(rect.x0,r.x0),y0:Math.min(rect.y0,r.y0),x1:Math.max(rect.x1,r.x1),y1:Math.max(rect.y1,r.y1)}:r;}
  if(rect)renderer.terrainChanged(rect);if(count)sculptStatus(limited);
}
function togglePlay() {
  if (phase === 'build') return leaveSculpt();
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
  calibrationSamples = [{beta:latest.beta,gamma:latest.gamma}]; motion.beginGravityCheck(); status('Hold still for a moment…'); updateControls();
  setTimeout(() => {
    const samples = calibrationSamples, gravity = motion.endGravityCheck(); calibrationSamples = null;
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
    // The same hold-still window measures the phone's gravity sign; full motion needs a match.
    motion.useConvention(gravity);
    const fullOff = !motion.verified && motionMode === 'full'; if (fullOff) motionMode = 'tilt';
    status(fullOff ? `Calibrated for tilt. ${gravityProblem()} Full motion is off.` : 'Calibrated. Tilt to accelerate; counter-tilt to brake.'); updateControls();
  }, 450);
}
function gravityProblem() {
  const c = motion.convention;
  return c.verdict === 'no-data' ? 'No acceleration readings arrived during calibration.' : c.verdict === 'inconsistent' ? `At rest, acceleration was ${c.residual.toFixed(1)} m/s² away from what the phone’s angle predicts.` : '';
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
canvas.addEventListener('pointerdown',e=>{
  lastPointerType=e.pointerType;if(phase!=='build'||brushPointer!==null||e.button>0)return;e.preventDefault();
  const p=renderer.toBoard(e.clientX,e.clientY);
  if(sculptTool==='walls'){
    const pick=pickWall(p);if(!pick){$('sculptStatus').textContent='Press on the low wall or the pocket wall, or on a round handle.';return;}
    brushPointer=e.pointerId;canvas.setPointerCapture(e.pointerId);brushAt=null;
    wallDrag={index:pick.index,mode:pick.mode,p0:p,start:sculptor.poses.get(pick.index)??{dx:0,dy:0,a:0},pose:null,invalid:false};return;
  }
  brushPointer=e.pointerId;canvas.setPointerCapture(e.pointerId);brushAt=p;
  sculptor.begin(sculptTool,sculptSize,brushAt.x,brushAt.y);strokeStart=performance.now();strokeTicks=0;
});
canvas.addEventListener('pointermove',e=>{
  if(phase!=='build')return;lastPointerType=e.pointerType;const p=renderer.toBoard(e.clientX,e.clientY);
  // A wall can't be dragged under the toolbar, so the point held stays reachable.
  if(e.pointerId===brushPointer){if(wallDrag){const bar=$('sculptBar').getBoundingClientRect();if(!(e.clientX>=bar.left&&e.clientX<=bar.right&&e.clientY>=bar.top&&e.clientY<=bar.bottom))dragWall(p);}else{brushAt=p;sculptor.move(p.x,p.y);}}
  else if(brushPointer===null&&e.pointerType==='mouse'&&sculptTool!=='walls')brushAt=p;
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>{if(e.pointerId===brushPointer)endStroke();});
canvas.addEventListener('pointerleave',e=>{if(brushPointer===null&&e.pointerType==='mouse')brushAt=null;});
// Long presses must not select the canvas or open a callout while sculpting.
canvas.addEventListener('touchstart',e=>{if(phase==='build')e.preventDefault();},{passive:false});
for(const name of ['contextmenu','selectstart'])canvas.addEventListener(name,e=>{if(phase==='build')e.preventDefault();});
window.addEventListener('keydown',e=>{
  if($('settings').open||$('diagnostics').open||/INPUT|SELECT|TEXTAREA|SUMMARY/.test(e.target.tagName))return;
  if(phase==='build'){
    if(e.key==='Escape'||e.key==='Enter'&&e.target.tagName!=='BUTTON'){e.preventDefault();leaveSculpt();return;}
    if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'){e.preventDefault();$('sculptUndo').click();return;}
    if(['1','2','3'].includes(e.key)){sculptSize='SML'[e.key-1];updateControls();return;}
  }
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key)){e.preventDefault();if(mode==='touch')keys.add(e.key);}
  if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();if(!e.repeat){sound.unlock();togglePlay();}}
});
window.addEventListener('keyup',e=>keys.delete(e.key));
document.addEventListener('touchmove',e=>{if(!e.target.closest('dialog, .controls'))e.preventDefault();},{passive:false});
$('pauseButton').addEventListener('click',()=>{pause();$('play').focus({preventScroll:true});});
$('play').addEventListener('click',()=>{sound.unlock();togglePlay();});$('restart').addEventListener('click',restart);
$('sculpt').addEventListener('click',()=>{sound.unlock();enterSculpt();});$('sculptDone').addEventListener('click',leaveSculpt);
for(const [id,tool] of SCULPT_TOOLS)$(id).addEventListener('click',()=>{sculptTool=tool;if(tool==='walls')brushAt=null;updateControls();});
$('sculptSize').addEventListener('click',()=>{sculptSize={S:'M',M:'L',L:'S'}[sculptSize];updateControls();});
// Undo and Reset may change terrain, walls or both; redraw only what changed.
function afterHistory(change){const version=sculptor.version;if(!change())return;if(sculptor.version!==version)renderer.terrainChanged();renderer.setLevel(sculptor.currentLevel());saveSculpt();}
$('sculptUndo').addEventListener('click',()=>{endStroke();afterHistory(()=>sculptor.undo());updateControls();});
$('sculptReset').addEventListener('click',()=>{endStroke();afterHistory(()=>sculptor.reset());updateControls();});
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
$('exportMotion').addEventListener('click',()=>{const report={...motion.report(),recordedAt:new Date().toISOString(),browser:navigator.userAgent,scenario:$('motionScenario').value,orientation,neutral,tiltBudget,motionMode,inputMode:mode,ball:{material,size:ballSize,radius:ball.r,mass:ball.m},movedWalls:sculptor.saveWalls().walls,frameTimeOrigin:recordStart,frameRecords:rows,phoneValidation:'pending user review; no hardware range inference'},url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='marble-relief-motion.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('clearMotion').addEventListener('click',()=>{motion.clearRecording();});
$('ballMaterial').addEventListener('change',e=>{material=e.target.value;restart();});
$('ballSize').addEventListener('input',e=>{ballSize=Math.min(BALL_SIZES.max,Math.max(BALL_SIZES.min,Math.round(Number(e.target.value)*10)/10));restart();});
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
  const meta=[`# Marble Lab; model=6; terrain=relief; sculpt_strokes=${sculptor.strokes.length}; moved_walls=${JSON.stringify(sculptor.saveWalls().walls).replace(/,/g,' ')}; ball_size=${ballSize}; ball_radius_m=${ball.r}; ball_mass_kg=${ball.m}; motion=${motionMode}; tilt_budget=${tiltBudget}; open_edges=${openEdges}; tau_ms=${tau*1000}; fixed_step_s=${STEP}`,`# neutral_beta=${neutral?.beta??''}; neutral_gamma=${neutral?.gamma??''}; browser=${navigator.userAgent}`, '# JS timestamps are not end-to-end sensor latency; ball variables are simulated SI values.'];
  const csv=[...meta,'kind,received_or_frame_ms,event_timestamp_ms,raw_x_deg,raw_y_deg,filtered_x_deg,filtered_y_deg,state,input,screen_angle_deg,ball_material,surface,wall_material,ball_radius_m,x_m,y_m,z_m,vx_m_s,vy_m_s,vz_m_s,omega_x_rad_s,omega_y_rad_s,omega_z_rad_s,kinetic_energy_J,slip_m_s,terrain_height_m,normal_load_N,goal_dwell_s,contact_regime',...rows.map(r=>r.join(','))].join('\n');
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
const GRAVITY_SIGN={unchecked:'Not checked; calibrate',spec:'Spec: face-up reads +g',reversed:'Reversed: face-up reads −g, corrected','no-data':'No readings at calibration; full motion off',inconsistent:'Matches neither sign; full motion off'};
function diagnostics(now) {
  const width=trace.width,height=trace.height;tc.clearRect(0,0,width,height);tc.strokeStyle='#304438';tc.lineWidth=1;
  for(const y of [height*.15,height*.5,height*.85]){tc.beginPath();tc.moveTo(0,y);tc.lineTo(width,y);tc.stroke();}
  for(const [key,color,dash] of [['rx','#e5b76f',[]],['ry','#e5b76f',[5,5]],['fx','#a5e5d0',[]],['fy','#a5e5d0',[5,5]]]){
    tc.strokeStyle=color;tc.setLineDash(dash);tc.lineWidth=1.8;tc.beginPath();let first=true;
    for(const v of graph){const x=width*(1-(now-v.t)/5000);if(x<0)continue;const y=height/2-clamp(v[key],-35,35)*height/70;if(first){tc.moveTo(x,y);first=false;}else tc.lineTo(x,y);}tc.stroke();
  }tc.setLineDash([]);
  const avg=recentDts.length?recentDts.reduce((a,b)=>a+b,0)/recentDts.length:0;
  const a=motion.last,c=motion.convention;
  const values=[['Motion mode',motionMode],['Gravity sign',GRAVITY_SIGN[c.verdict]],['Rest residual',c.residual===null?'—':`${c.residual.toFixed(3)} m/s² (${c.count} samples)`],['Acceleration X / Y / up',`${a.x.toFixed(2)} / ${a.y.toFixed(2)} / ${a.z.toFixed(2)} m/s²`],['Delivered motion rate',motion.rate.toFixed(1)+' Hz'],['Observed axis peaks',motion.peak.map(v=>(v/9.81).toFixed(2)+'g').join(' / ')],['Hardware range','Not exposed; peaks are lower bounds'],['Clipping',motion.clipSuspected?'Suspected flat top':'Not observed'],['3g caps',String(motion.capCount)],['Pose age at sample',motion.poseAge.toFixed(1)+' ms'],['Input', mode],['Permission',permission],['Motion permission',motionPermission],['Neutral β / γ',neutral?`${neutral.beta.toFixed(1)}° / ${neutral.gamma.toFixed(1)}°`:'Not calibrated'],['Screen rotation',orientation+'°'],['Orientation event rate',avg?(1000/avg).toFixed(1)+' Hz*':'No readings'],['Latest event interval',eventDt?eventDt.toFixed(1)+' ms':'—'],['Event delivery delay',latest?delivery.toFixed(1)+' ms':'—'],['Latest event → frame',latest?Math.max(0,now-latest.stamp).toFixed(1)+' ms':'—'],['Frame interval',frameDt.toFixed(1)+' ms'],['Filter time constant',(tau*1000)+' ms'],['Physics step',(STEP*1000).toFixed(2)+' ms'],['Canvas pixels',`${canvas.width} × ${canvas.height}`],['Pixel ratio',String(renderer.dpr)],['Cached scene builds',String(renderer.rebuilds)],['Audio',sound.ctx?.state??'Awaiting tap'],['Rotation-rate data',gyroFields],['Raw X / Y',`${raw.x.toFixed(2)}° / ${raw.y.toFixed(2)}°`],['Filtered X / Y',`${smooth.x.toFixed(2)}° / ${smooth.y.toFixed(2)}°`],['Ball speed',Math.hypot(ball.vx,ball.vy).toFixed(3)+' m/s'],['Captured timing records',String(rows.length)]];
  values.push(['Sculpt strokes',String(sculptor.strokes.length)],['Moved walls',String(sculptor.poses.size)],['Ball size',`×${ballSize}`],['Edited terrain cells',String(sculptor.edits.cells.size)]);
  values.push(['Ball / surface',`${BALLS[material].name} / ${SURFACES[surface].name}`],['Mass / diameter',`${(ball.m*1000).toFixed(2)} g / ${mm(ball.r)} mm`],['Walls',WALL_MATERIALS[wallMaterial].name],['Board dimensions',`${layoutFor(material).width.toFixed(3)} × ${layoutFor(material).height.toFixed(3)} m`],['Inertia / mR²',BALLS[material].inertiaRatio.toFixed(4)],['Contact regime',ball.regime],['Slip speed',(ball.slip*1000).toFixed(1)+' mm/s'],['Spin magnitude',Math.hypot(ball.wx,ball.wy,ball.wz).toFixed(1)+' rad/s'],['Height above support',(Math.max(0,ball.supportGap)*1000).toFixed(2)+' mm'],['Terrain height',(ball.groundHeight*1000).toFixed(3)+' mm'],['Normal load / mg',(ball.normalLoad/(ball.m*9.81)).toFixed(3)],['Goal hold',ball.dwell.toFixed(2)+' / 3 s'],['Edges',openEdges?'Open':'Walled'],['Kinetic energy',(kineticEnergy(ball)*1000).toFixed(3)+' mJ']);
  if(surface==='sand')values.push(['Estimated sinkage',(granularState(ball,ball.normalLoad/(ball.m*9.81)).sinkage*1000).toFixed(2)+' mm']);
  $('metrics').replaceChildren(...values.flatMap(([label,value])=>{const a=document.createElement('dt'),b=document.createElement('dd');a.textContent=label;b.textContent=value;return[a,b];}));
}
function frame(now) {
  frameDt=frameLast===null?0:Math.max(0,now-frameLast);frameLast=now;updateRaw();
  if(phase!=='running')filter(Math.min(frameDt/1000,.05));
  const contacts=[],startSimulationTime=ball.time;
  clock.tick(now,phase==='running',(dt,end)=>{
    filter(dt);elapsed+=dt;let event=null;
    const segments=motionMode==='full'&&mode==='tilt'&&motion.verified?motion.segments(end-dt*1000,end):[{dt,a:{x:0,y:0,z:0}}];
    for(const segment of segments){event=advance(ball,smooth,segment.dt,{maxTilt:tiltBudget,acceleration:segment.a,onContact:e=>{if(contacts.length<40)contacts.push(e);}});if(event)break;}
    if(event?.type==='fall'||event?.type==='escape'){phase='falling';sound.capture();falls++;fallHole=event.hole??null;fallStarted=now;message(event.type==='escape'?'Over the edge.':'One more try.', 'Back to the start. Keep a lighter touch.');updateControls();return false;}
    if(event?.type==='win'){phase='won';sound.pause();message('Beautifully balanced.', `${clockText(elapsed)} · ${falls} ${falls===1?'fall':'falls'}${sculptor.edited?' · edited board':''}`);updateControls();return false;}
  });
  if(phase==='falling'&&now-fallStarted>=RESTART_MS){ball=freshBall();fallHole=null;phase='running';clock.reset();message('','');updateControls();}
  if(phase==='running'||phase==='falling')sound.impacts(contacts,startSimulationTime);sound.update(ball,phase==='running');
  if(phase==='build'&&sculptor.stroke)sculptUpdate(now);
  const choice=brushChoice(),walls=sculptTool==='walls'&&!sculptor.stroke,level=renderer.level;
  const sculpt=phase!=='build'?null:walls?{zones:wallClearances(level).map(z=>({x:z.x,y:z.y,r0:z.r})),brush:null,walls:{handles:movableWalls(level).map(i=>handleOf(level.walls[i])),active:wallDrag?level.walls[wallDrag.index].points:null,invalid:!!wallDrag?.invalid}}
    :{zones:sculptor.zones,brush:brushAt&&{...brushAt,R:SCULPT.sizes[choice.size],tool:choice.tool,limited:!!sculptor.stroke&&sculptor.lastAlpha<1}};
  renderer.draw(ball,smooth,{phase,now,fallStarted,fallHole,restartMs:RESTART_MS,running:phase==='running',sculpt});record('frame',now,latest?.stamp??'');graph.push({t:now,rx:raw.x,ry:raw.y,fx:smooth.x,fy:smooth.y});while(graph.length&&graph[0].t<now-5500)graph.shift();
  if(now-lastUI>80){lastUI=now;$('time').textContent=clockText(elapsed);$('falls').textContent=String(falls);$('tiltMagnitude').textContent=Math.min(tiltBudget,Math.hypot(smooth.x,smooth.y)).toFixed(1);
    const radius=pad.clientWidth*.32;$('padKnob').style.transform=`translate(calc(-50% + ${clamp(smooth.x/tiltBudget,-1,1)*radius}px),calc(-50% + ${clamp(smooth.y/tiltBudget,-1,1)*radius}px))`;
    if($('diagnostics').open)diagnostics(now);
    const motionFresh=motion.lastStamp!==null&&now-motion.lastStamp<500;
    $('motionStatus').textContent=mode!=='tilt'?'Enable phone tilt to use full motion.':!motionFresh?(motionPermission==='denied'?'Motion access was declined. Tilt is available; lift and shake need motion permission.':'No recent acceleration samples. Lift and shake are unavailable until readings resume.'):motion.verified?'Phone acceleration is available.':motion.convention.verdict==='unchecked'?'Phone acceleration is available. Calibrate to check its readings before full motion.':`Full motion is off. ${gravityProblem()} Tilt works; calibrate again to retry.`;
    if(phase==='running'&&mode==='tilt'&&motionMode==='full')$('motionQuick').textContent=motionFresh&&motion.verified?'Full motion':'No motion · tilt only';
    if(motionOverlay){const a=motion.last;$('motionValues').textContent=`measured a ${a.x.toFixed(1)} / ${a.y.toFixed(1)} / ${a.z.toFixed(1)} m/s²\nN ${ball.normalLoad.toFixed(3)} N · ${ball.regime}\n${motion.rate.toFixed(0)} Hz · ${motion.clipSuspected?'CLIP?':'no clip seen'}${a.capped?' · 3g cap':''}`;const c=$('motionTrace').getContext('2d'),w=300,h=90;c.clearRect(0,0,w,h);for(const [key,col] of [['x','#e7b36d'],['y','#9de4c1'],['z','#90bfff']]){c.beginPath();c.strokeStyle=col;let first=true;for(const s of motion.rows){if(now-s.time>2500)continue;const x=w*(1-(now-s.time)/2500),y=h/2-s.a[key]/29.43*h*.45;if(first)c.moveTo(x,y);else c.lineTo(x,y);first=false;}c.stroke();}}
  }
  requestAnimationFrame(frame);
}
if(sculptor.edited)message('Find your balance.','Edited board: the route bot has not checked it.');
updateControls();requestAnimationFrame(frame);

// Optional page-scoped agent interface, using exactly the visible game actions.
if(document.modelContext?.registerTool) {
  const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  const state=()=>({phase,ballSize,sculpt:{edited:sculptor.edited,strokes:sculptor.strokes.length,movedWalls:sculptor.poses.size},input:mode,motionMode,tiltBudget,material,surface,wallMaterial,openEdges,goalDwell:ball.dwell,board:{width:layoutFor(material).width,height:layoutFor(material).height},timeSeconds:Number(elapsed.toFixed(2)),falls,calibrated:!!neutral,ball:{x:ball.x,y:ball.y,z:ball.z,vx:ball.vx,vy:ball.vy,vz:ball.vz,wx:ball.wx,wy:ball.wy,wz:ball.wz,regime:ball.regime}});
  const tools=[
    {name:'read_marble_game',description:'Read the current maze state and selected controls.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){if(input&&Object.keys(input).length)throw new Error('No arguments expected.');return state();}},
    {name:'control_marble_game',description:'Start, pause, resume, or restart the marble maze using its visible controls. Does not request sensor permission or steer.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['start','pause','resume','restart']}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||Object.keys(input).some(k=>k!=='action')||!['start','pause','resume','restart'].includes(input.action))throw new Error('Use start, pause, resume, or restart.');if(input.action==='restart'){if(phase==='build')leaveSculpt();else restart();}else if(input.action==='pause')pause();else{if(phase==='build')throw new Error('Leave Sculpt with Done first.');if(mode==='tilt'&&!neutral)throw new Error('Calibrate tilt using the on-screen button first.');if(phase==='falling')throw new Error('Wait for the restart.');if(phase!=='running')togglePlay();}return state();}}
  ];
  for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
}
