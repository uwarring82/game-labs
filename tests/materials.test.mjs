import {legacyLayoutFor,LEGACY_ROUTE} from './fixtures/legacy-level.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {newBall,advance,STEP,MAX_TILT,ROUTE,BALLS,SURFACES,CONTACTS,WALL_CONTACTS,WALL_MATERIALS,layoutFor,airDrag,kineticEnergy,contactImpulse,granularState} from '../dist/physics.js';
import {G,AIR} from '../dist/materials.js';
const free={terrain:false,walls:[],holes:[],goal:false,bounds:false,air:false};
function run(b,seconds,tilt,options={}){for(let i=0;i<Math.round(seconds/STEP);i++)advance(b,tilt,STEP,{...free,...options});return b;}
function rolling(b,v){b.vx=v;b.wy=v/b.r;return b;}
test('shell mass, inertia and enlarged geometry retain SI dimensions and hole clearance',()=>{
 const b=newBall('pingpong');assert.equal(b.m,.0027);assert.equal(b.r,.02);assert.equal(b.I,(2/3)*b.m*b.r*b.r);
 assert.equal(layoutFor('pingpong').width,1.2);assert.ok(Math.abs(layoutFor('billiard').width-1.7145)<1e-12);
 for(const id of Object.keys(BALLS)){const b=newBall(id),l=layoutFor(id);assert.ok(l.holes.every(h=>h.r>b.r));assert.equal(b.x,l.start.x);}
 const ideal={...CONTACTS.pingpong.wood,b0:0,b1:0,eRef:0};run(b,1,{x:10,y:0},{floorProfile:ideal});
 assert.ok(Math.abs(b.vx-(3/5)*G*Math.sin(Math.PI/18))<1e-8);
});
test('steel on ice crosses the analytic rolling threshold near 6 degrees',()=>{
 const threshold=Math.atan(.03*7/2)*180/Math.PI;assert.ok(threshold>5.9&&threshold<6.1);
 const low=run(newBall('steel','ice'),.4,{x:5,y:0});assert.ok(low.slip<1e-8);
 const high=run(newBall('steel','ice'),.4,{x:12,y:0});
 const a=G*(Math.sin(Math.PI/15)-CONTACTS.steel.ice.muKinetic*Math.cos(Math.PI/15));
 assert.ok(high.slip>.1);assert.ok(Math.abs(high.vx/.4-a)<1e-8);
 // Reversing beyond the grip threshold also breaks an initially rolling state.
 const reverse=rolling(newBall('steel','ice'),.3);run(reverse,.05,{x:-18,y:0});assert.ok(reverse.slip>.01);
});
test('quadratic air drag is passive and matches its analytic free decay',()=>{
 for(const id of Object.keys(BALLS)){
  const b=newBall(id);b.vx=2;b.vy=1;b.vz=-.5;b.wy=3;const speed=Math.hypot(b.vx,b.vy,b.vz),before=kineticEnergy(b);
  const c=.5*AIR.density*AIR.dragCoefficient*Math.PI*b.r*b.r,expected=speed/(1+c*speed*.5/b.m);
  airDrag(b,.5);assert.ok(Math.abs(Math.hypot(b.vx,b.vy,b.vz)-expected)<1e-12);assert.ok(kineticEnergy(b)<before);assert.equal(b.wy,3);
 }
 const shell=newBall('pingpong'),steel=newBall();shell.vx=steel.vx=1;airDrag(shell,1);airDrag(steel,1);assert.ok(shell.vx<steel.vx-.08);
});
test('billiard baize moment convention recovers the reference rolling deceleration',()=>{
 const b=rolling(newBall('billiard','baize'),.4);run(b,1,{x:0,y:0});assert.ok(Math.abs(b.vx-(.4-.01*G))<1e-8);
});
test('all documented floor and wall pairs remain passive for oblique spinning impacts',()=>{
 for(const id of Object.keys(BALLS))for(const p of [...Object.values(CONTACTS[id]),...Object.values(WALL_CONTACTS[id])])for(let i=1;i<40;i++){
  const b=newBall(id);b.vx=-.1-i*.03;b.vy=Math.sin(i);b.vz=Math.cos(i);b.wx=80*Math.sin(i);b.wy=100*Math.cos(i);b.wz=60;
  const before=kineticEnergy(b);contactImpulse(b,{x:1,y:0,z:0},p);assert.ok(kineticEnergy(b)<=before+1e-12,id);
 }
});
test('walls are independent of the floor, while rims stay hardwood',()=>{
 const wood=newBall('steel','ice','wood'),bumper=newBall('steel','ice','rubber');wood.vx=bumper.vx=.5;
 contactImpulse(wood,{x:-1,y:0,z:0},WALL_CONTACTS.steel.wood);contactImpulse(bumper,{x:-1,y:0,z:0},WALL_CONTACTS.steel.rubber);
 assert.ok(-bumper.vx>-wood.vx*1.3);
 const hole={x:.1,y:.1,r:.016};
 for(const b of [wood,bumper]){b.x=.07;b.y=.1;b.z=b.r;b.vx=1.5;b.vy=b.vz=b.wx=b.wz=0;b.wy=b.vx/b.r;run(b,.08,{x:0,y:0},{holes:[hole]});}
 for(const key of ['x','y','z','vx','vy','vz','wx','wy','wz'])assert.equal(wood[key],bumper[key]);
});
// A conservative controller verifies geometric traversability. It is never part
// of the game, and does not claim equivalent human difficulty or phone testing.
const route=LEGACY_ROUTE;
for(const material of Object.keys(BALLS))for(const surface of Object.keys(SURFACES))for(const wallMaterial of Object.keys(WALL_MATERIALS)){
 test(`legacy route regression: ${material} / ${surface} / ${wallMaterial}`,()=>{
  const b=newBall(material,surface,wallMaterial),l=legacyLayoutFor(material),p=CONTACTS[material][surface],k=BALLS[material].inertiaRatio;
  const s=surface==='sand'?granularState(b):null,points=route.map(([x,y])=>[x*l.scale,y*l.scale]);let target=0,result=null;b.x=l.start.x;b.y=l.start.y;
  for(let i=0;i<240*130;i++){
   const [x,y]=points[target],dx=x-b.x,dy=y-b.y,d=Math.hypot(dx,dy),ux=d?dx/d:0,uy=d?dy/d:0,v=Math.hypot(b.vx,b.vy);
   const wanted=Math.min(.08*Math.sqrt(l.scale),d*4);
   const resistance=G*((p.b0+p.b1*v+(s?.rollingArm??0))/b.r+(s?.ploughCoefficient??0))+(s?.inertialDrag??0)*v*v/b.m;
   const slope=l.terrain.sample(b.x,b.y);
   const ax=(1+k)*8*(wanted*ux-b.vx)+resistance*ux+G*slope.dx,ay=(1+k)*8*(wanted*uy-b.vy)+resistance*uy+G*slope.dy,m=Math.hypot(ax,ay);
   const theta=Math.asin(Math.min(.46,m/G))*180/Math.PI;
   assert.ok(theta<=MAX_TILT);result=advance(b,{x:m?theta*ax/m:0,y:m?theta*ay/m:0},STEP,{layout:l});
   assert.ok(!result||result.type==='win',`unexpected ${result?.type}, point ${target}, ${b.x},${b.y}`);
   if(result?.type==='win')break;
   if(d<.005*l.scale&&v<.03*Math.sqrt(l.scale)&&target<points.length-1)target++;
  }
  assert.equal(result?.type,'win',`stopped at ${target}: ${b.x},${b.y}`);
 });
}
