import test from 'node:test';
import assert from 'node:assert/strict';
import {newBall,advance,STEP,MAX_TILT,CONTACTS,GOAL,FixedClock,tiltVector,filtered,gravity,kineticEnergy,contactImpulse,granularState} from '../dist/physics.js';
import {restitution,G} from '../dist/materials.js';
const free={walls:[],holes:[],goal:false,bounds:false};
const ideal={...CONTACTS.steel.wood,b0:0,b1:0,eRef:0,muStatic:1,muKinetic:.5};
function run(b,seconds,tilt={x:0,y:0},opts={}){let event=null;for(let i=0;i<Math.round(seconds/STEP);i++){event=advance(b,tilt,STEP,{...free,...opts});if(event)break;}return event;}
function roll(b,vx,vy=0){b.vx=vx;b.vy=vy;b.wx=-vy/b.r;b.wy=vx/b.r;return b;}

test('pitched calibration, angle wrap and four screen rotations retain their meaning',()=>{
  const neutral={beta:35,gamma:12};
  for(const [angle,x,y] of [[0,4,3],[90,3,-4],[180,-4,-3],[270,-3,4]]){
    const t=tiltVector(38,16,neutral,angle);assert.ok(Math.abs(t.x-x)<1e-12);assert.ok(Math.abs(t.y-y)<1e-12);
  }
  assert.deepEqual(tiltVector(35,12,neutral),{x:0,y:0});
  assert.equal(tiltVector(-179,0,{beta:179,gamma:0}).y,2);
});
test('gravity keeps physical magnitude for diagonal and saturated input',()=>{
  for(const t of [{x:10,y:0},{x:20,y:20},{x:200,y:-150}])assert.ok(Math.abs(Math.hypot(...Object.values(gravity(t)))-G)<1e-12);
  const g=gravity({x:0,y:100});assert.ok(Math.abs(Math.atan2(g.y,-g.z)*180/Math.PI-MAX_TILT)<1e-12);
});
test('solid-sphere 5/7 acceleration emerges from contact and is mass-independent',()=>{
  const expected=(5/7)*G*Math.sin(10*Math.PI/180);
  for(const material of ['steel','rubber']){
    const b=newBall(material);run(b,1,{x:10,y:0},{floorProfile:ideal});
    assert.ok(Math.abs(b.vx-expected)<1e-8,material+': '+b.vx);
    assert.ok(Math.abs(b.vx-b.r*b.wy)<1e-10);
  }
});
test('Coulomb sliding converges to the analytic 5/7 rolling velocity',()=>{
  const b=newBall();b.vx=.35;
  run(b,.5,{x:0,y:0},{floorProfile:ideal});
  assert.ok(Math.abs(b.vx-.25)<1e-9);assert.ok(b.slip<1e-10);
});
test('contact impulses are passive for normal, oblique and spinning impacts',()=>{
  for(const material of ['steel','rubber'])for(const surface of ['wood','sand']){
    const p=CONTACTS[material][surface];
    for(let i=1;i<=120;i++){
      const b=newBall(material,surface);
      b.vx=-.02-i*.012;b.vy=Math.sin(i)*1.3;b.vz=Math.cos(i)*.8;
      b.wx=Math.sin(i*.7)*200;b.wy=Math.cos(i*.3)*150;b.wz=Math.sin(i*.2)*250;
      const before=kineticEnergy(b);contactImpulse(b,{x:1,y:0,z:0},p);
      assert.ok(kineticEnergy(b)<=before+1e-12,material+'/'+surface+' impact '+i+' created energy');
    }
  }
});
test('material restitution controls normal rebound and forward roll creates a hop',()=>{
  const rebounds={};
  for(const material of ['steel','rubber']){
    const b=newBall(material);b.vx=.5;const p=CONTACTS[material].wood;
    contactImpulse(b,{x:-1,y:0,z:0},p);
    assert.ok(Math.abs(b.vx+.5*restitution(p,.5))<1e-12);rebounds[material]=-b.vx;
    const spinning=roll(newBall(material),.5),before=kineticEnergy(spinning);
    contactImpulse(spinning,{x:-1,y:0,z:0},p);
    assert.ok(spinning.vz>0);assert.ok(spinning.wy!==0);assert.ok(kineticEnergy(spinning)<=before);
  }
  assert.ok(rebounds.rubber>rebounds.steel*1.3);
});
test('wood rolling loss dissipates energy monotonically without global damping',()=>{
  const result={};
  for(const material of ['steel','rubber']){
    const b=roll(newBall(material),.3);let previous=kineticEnergy(b);
    for(let i=0;i<480;i++){advance(b,{x:0,y:0},STEP,free);const e=kineticEnergy(b);assert.ok(e<=previous+1e-11);previous=e;}
    result[material]=b.vx;assert.ok(b.vx>0);
  }
  assert.ok(result.steel>result.rubber+.04);
});
test('sand has density-dependent sinkage, static resistance and much shorter runout',()=>{
  assert.ok(granularState(newBall('steel','sand')).sinkage>granularState(newBall('rubber','sand')).sinkage);
  for(const material of ['steel','rubber']){
    const sand=roll(newBall(material,'sand'),.3),wood=roll(newBall(material,'wood'),.3);
    run(sand,2);run(wood,2);
    assert.ok(sand.x-.041<(wood.x-.041)/8);assert.ok(Math.abs(sand.vx)<1e-5);
  }
  const steel=newBall('steel','sand'),rubber=newBall('rubber','sand');
  run(steel,1,{x:7,y:0});run(rubber,1,{x:7,y:0});
  assert.equal(steel.x,.041);assert.ok(rubber.x>.045);
});
test('high speed remains physical and cannot tunnel through a thin wall',()=>{
  const b=newBall();b.x=.02;b.y=.05;b.z=.05;b.vx=4;
  advance(b,{x:0,y:0},STEP,free);assert.ok(b.vx>3.9);
  const wall={x:.1,y:0,w:.001,h:.3,height:.2};
  for(let i=0;i<100;i++){advance(b,{x:0,y:0},STEP,{...free,walls:[wall]});assert.ok(b.x<=.1-b.r+1e-8);}
});
test('gravity and geometric rim contact capture slow crossings and skip fast ones',()=>{
  const hole={x:.1,y:.1,r:.016};
  function crossing(v){const b=roll(newBall(),v);b.x=.07;b.y=.1;let e=null;for(let i=0;i<400&&b.x<.14;i++){e=advance(b,{x:0,y:0},STEP,{...free,holes:[hole]});if(e)break;}return {b,e};}
  assert.equal(crossing(.15).e?.type,'fall');
  const fast=crossing(1.5);assert.equal(fast.e,null);assert.ok(fast.b.x>.14);assert.equal(fast.b.skipped,1);
  const centre=newBall();centre.x=.1;centre.y=.1;assert.equal(run(centre,.5,{x:0,y:0},{holes:[hole]})?.type,'fall');
});
test('a hole-rim encounter does not increase total mechanical energy',()=>{
  const b=roll(newBall('rubber'),1.5);b.x=.07;b.y=.1;
  const initial=kineticEnergy(b)+b.m*G*b.z;
  for(let i=0;i<60;i++){
    const e=advance(b,{x:0,y:0},STEP,{...free,holes:[{x:.1,y:.1,r:.016}]});
    assert.ok(kineticEnergy(b)+b.m*G*b.z<=initial*1.002);
    if(e)break;
  }
});
test('both ball materials traverse the actual wooden maze under acceleration control',()=>{
  const points=[[.041,.070],[.264,.070],[.264,.116],[.035,.116],[.035,.201],[.117,.201],[.117,.235],[.264,.235],[GOAL.x,GOAL.y]];
  for(const material of ['steel','rubber']){
    const b=newBall(material);let target=0,result=null;
    for(let i=0;i<240*100;i++){
      const [x,y]=points[target],ax=22*(x-b.x)-6*b.vx,ay=22*(y-b.y)-6*b.vy;
      const deg=a=>Math.asin(Math.max(-.2,Math.min(.2,a/(G*5/7))))*180/Math.PI;
      result=advance(b,{x:deg(ax),y:deg(ay)},STEP);
      assert.ok(!result||result.type==='win',material+': unexpected '+result?.type+' at waypoint '+target);
      if(result?.type==='win')break;
      if(Math.hypot(b.x-x,b.y-y)<.003&&Math.hypot(b.vx,b.vy)<.018&&target<points.length-1)target++;
    }
    assert.equal(result?.type,'win',material+' stopped at waypoint '+target+': '+b.x+','+b.y);
  }
});
test('both ball materials can traverse the sand maze within the player tilt limit',()=>{
  const points=[[.041,.070],[.264,.070],[.264,.116],[.035,.116],[.035,.201],[.117,.201],[.117,.235],[.264,.235],[GOAL.x,GOAL.y]];
  for(const material of ['steel','rubber']){
    const b=newBall(material,'sand'),p=CONTACTS[material].sand,s=granularState(b);let target=0,result=null;
    for(let i=0;i<240*100;i++){
      const [x,y]=points[target],dx=x-b.x,dy=y-b.y,d=Math.hypot(dx,dy),ux=dx/d,uy=dy/d,v=Math.hypot(b.vx,b.vy);
      const wanted=Math.min(.13,d*4);
      const resistance=G*((p.b0+p.b1*v+s.rollingArm)/b.r+s.ploughCoefficient)+s.inertialDrag*v*v/b.m;
      const ax=1.4*8*(wanted*ux-b.vx)+resistance*ux,ay=1.4*8*(wanted*uy-b.vy)+resistance*uy,m=Math.hypot(ax,ay);
      const theta=Math.asin(Math.min(.46,m/G))*180/Math.PI;
      assert.ok(theta<=MAX_TILT);
      result=advance(b,{x:theta*ax/m,y:theta*ay/m},STEP);
      assert.ok(!result||result.type==='win',material+': unexpected '+result?.type+' at waypoint '+target);
      if(result?.type==='win')break;
      if(d<.005&&v<.03&&target<points.length-1)target++;
    }
    assert.equal(result?.type,'win',material+' stopped at waypoint '+target);
  }
});
test('30, 60 and 120 Hz rendering yield identical fixed-step trajectories',()=>{
  function trajectory(hz){const b=newBall(),clock=new FixedClock();for(let i=0;i<=hz;i++)clock.tick(i*1000/hz,true,dt=>{advance(b,{x:3,y:-2},dt,free);});return b;}
  const reference=trajectory(60);
  for(const hz of [30,120]){const b=trajectory(hz);for(const key of ['x','y','vx','vy','wx','wy'])assert.ok(Math.abs(b[key]-reference[key])<1e-10);}
});
test('long frames are clamped, hidden time discarded and filter response is exact',()=>{
  const clock=new FixedClock();let steps=0;clock.tick(0,true,()=>steps++);clock.tick(100000,true,()=>steps++);assert.equal(steps,12);
  clock.reset();const before=steps;clock.tick(200000,true,()=>steps++);clock.tick(300000,false,()=>steps++);assert.equal(steps,before);
  let v=0;for(let i=0;i<15;i++)v=filtered(v,1,.001,.015);assert.ok(Math.abs(v-(1-Math.exp(-1)))<1e-12);
});
