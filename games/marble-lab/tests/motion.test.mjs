import test from 'node:test';import assert from 'node:assert/strict';
import {MotionInput,restingSpecificForce,boardAcceleration,capAcceleration,flickAcceleration,physicalGravity,gravityConvention} from '../dist/motion.js';
import {IPHONE_FACE_UP} from './fixtures/iphone-face-up.mjs';
import {newBall,advance,STEP,CONTACTS} from '../dist/physics.js';import {G} from '../dist/materials.js';
const free={terrain:false,patches:false,walls:[],holes:[],goal:false,bounds:false,air:false};
test('gravity subtraction is correct at pitched neutral and four screen rotations',()=>{for(const beta of [0,35,-30])for(const gamma of [0,18,-12]){const raw=restingSpecificForce(beta,gamma);assert.ok(Math.abs(Math.hypot(raw.x,raw.y,raw.z)-G)<1e-12);for(const angle of [0,90,180,270]){const a=boardAcceleration(raw,beta,gamma,angle);assert.ok(Math.hypot(a.x,a.y,a.z)<1e-12);}}});
test('30 degrees in 0.3 seconds with interleaved 60 Hz streams stays below 0.3 m/s² synthetic leakage',()=>{const input=new MotionInput();let worst=0;for(let i=0;i<=18;i++){const t=i*1000/60,beta=35+i*30/18;input.orientation(beta,10,t);const motionTime=t+1000/120,b=35+Math.min(30,(motionTime/300)*30);const a=input.ingest(restingSpecificForce(b,10),motionTime,0);if(a)worst=Math.max(worst,Math.hypot(a.x,a.y));}assert.ok(worst<.3,'synthetic leakage '+worst);});
test('sample-and-hold preserves impulses across frames; stale and resumed samples do not persist',()=>{const m=new MotionInput();m.orientation(0,0,0);m.ingest({x:2,y:0,z:G},10);m.ingest({x:4,y:0,z:G},30);const impulse=m.segments(10,50).reduce((s,p)=>s+p.dt*p.a.x,0);assert.ok(Math.abs(impulse-.12)<1e-12);assert.equal(m.at(131).x,0);m.resetHold();assert.equal(m.at(40).x,0);});
test('3g cap preserves direction and clipping report makes no hardware range claim',()=>{const a=capAcceleration({x:50,y:-25,z:0});assert.ok(a.capped);assert.ok(Math.abs(Math.hypot(a.x,a.y,a.z)-3*G)<1e-12);assert.equal(a.x/a.y,-2);const m=new MotionInput();m.orientation(0,0,0);for(let i=0;i<8;i++)m.ingest({x:2*G,y:0,z:G},i*16);assert.ok(m.clipSuspected);assert.match(m.report().hardwareRange,/not exposed/);const raw=Object.create({get x(){return 2*G;},get y(){return 0;},get z(){return G;}});m.ingest(raw,150);assert.deepEqual(m.report().samples.at(-1).raw,{x:2*G,y:0,z:G});});
test('finite 0.4 m/s flick and 30 ms stop separates and reproduces the 2.15 mm analytic hop',()=>{const b=newBall(),lift=.15,stop=.03,speed=.4;let first=null,peak=0;const dt=.001;for(let i=0;i<1000;i++){const a=flickAcceleration(i*dt,speed,lift,stop);advance(b,{x:0,y:0},dt,{...free,acceleration:a,floorProfile:{...CONTACTS.steel.wood,eRef:0}});if(!b.grounded&&first===null)first=b.time-dt;peak=Math.max(peak,b.z-b.r);}const exact=speed*speed/(2*G)-speed*stop/2;assert.ok(Math.abs(first-lift)<STEP*1.1);assert.ok(Math.abs(peak-exact)/exact<.05,`${peak} vs ${exact}`);});
test('weight reduction changes the grip threshold without a gesture or jump command',()=>{const a=newBall('steel','ice'),b=newBall('steel','ice');for(let i=0;i<80;i++){advance(a,{x:5,y:0},STEP,free);advance(b,{x:5,y:0},STEP,{...free,acceleration:{x:0,y:0,z:-.5*G}});}assert.ok(a.slip<1e-8);assert.ok(b.slip>.02);});

test('pitched calibration preserves free-fall equivalence in the virtual board frame',()=>{for(const beta of [0,35,60])for(const angle of [0,90,180,270]){const b=newBall(),a=boardAcceleration({x:0,y:0,z:0},beta,12,angle);a.sourceGravity=physicalGravity(beta,12,angle);advance(b,{x:4,y:-3},STEP,{...free,acceleration:a});assert.ok(Math.hypot(b.vx,b.vy,b.vz)<1e-10);assert.ok(b.normalLoad<1e-10);assert.equal(b.grounded,false);}});

// Calibration's hold-still window: 27 samples at 60 Hz, motion 5 ms after each orientation event.
function calibrateStill(m,beta,gamma,reading){m.beginGravityCheck();for(let i=0;i<27;i++){const t=i*1000/60;m.orientation(beta,gamma,t);m.ingest(reading,t+5);}return m.endGravityCheck();}
const negate=v=>({x:-v.x,y:-v.y,z:-v.z});
test('gravity sign check accepts spec and reversed readings and rejects anything else',()=>{
 for(const [beta,gamma] of [[0,0],[2,1],[30,0],[35,-12]]){const p=restingSpecificForce(beta,gamma);assert.equal(gravityConvention(p,p,27).verdict,'spec');const r=gravityConvention(negate(p),p,27);assert.equal(r.verdict,'reversed');assert.equal(r.sign,-1);assert.ok(r.residual<1e-12);}
 const p=restingSpecificForce(30,0);
 assert.equal(gravityConvention({...p,z:-p.z},p,27).verdict,'inconsistent','only z reversed');
 assert.equal(gravityConvention({x:p.x/G,y:p.y/G,z:p.z/G},p,27).verdict,'inconsistent','reported in g');
 assert.equal(gravityConvention({x:p.x+1.2,y:p.y,z:p.z},p,27).sign,1,'unusable readings keep the spec sign');
 assert.equal(gravityConvention(p,p,4).verdict,'no-data');
});
test('spec and iPhone conventions both rest at zero after calibration, at every screen rotation',()=>{
 for(const [beta,gamma] of [[0,0],[2,1],[30,0]])for(const [convention,reading] of [['spec',x=>x],['reversed',negate]]){
  const p=reading(restingSpecificForce(beta,gamma)),m=new MotionInput();assert.equal(m.verified,false);
  m.useConvention(calibrateStill(m,beta,gamma,p));assert.equal(m.convention.verdict,convention);assert.ok(m.verified);
  for(const angle of [0,90,180,270]){const a=m.ingest(p,1000+angle,angle);assert.ok(Math.hypot(a.x,a.y,a.z)<1e-9,`${convention} ${beta}/${gamma} at ${angle}°`);}
 }
});
test('recorded iPhone export: reversed sign detected, rest residual below 0.1 m/s²',()=>{
 const m=new MotionInput(),feed=offset=>{let worst=0;for(const [t,x,y,z,beta,gamma] of IPHONE_FACE_UP){m.orientation(beta,gamma,t+offset);const a=m.ingest({x,y,z},t+offset);worst=Math.max(worst,Math.hypot(a.x,a.y,a.z));}return worst;};
 m.beginGravityCheck();feed(0);assert.ok(Math.abs(m.last.z+2*G)<.1,'unchecked, the export read −2g up');
 const r=m.endGravityCheck();assert.equal(r.verdict,'reversed');assert.ok(r.residual<.1,'rest residual '+r.residual);
 m.useConvention(r);const worst=feed(1000);assert.ok(worst<.1,'worst corrected sample '+worst);
});
