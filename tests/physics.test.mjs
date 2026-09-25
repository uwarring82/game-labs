import test from 'node:test';
import assert from 'node:assert/strict';
import { R, GOAL, STEP, MAX_SPEED, WALLS, HOLES, tiltVector, newBall, advance, FixedClock, filtered } from '../dist/physics.js';

test('pitched calibration and every screen rotation preserve steering amplitude',()=>{
  const neutral={beta:35,gamma:12};
  for(const [angle,x,y] of [[0,4,3],[90,3,-4],[180,-4,-3],[270,-3,4]]){
    const t=tiltVector(38,16,neutral,angle);assert.ok(Math.abs(t.x-x)<1e-12);assert.ok(Math.abs(t.y-y)<1e-12);
  }
  assert.deepEqual(tiltVector(35,12,neutral,0),{x:0,y:0});
  assert.equal(tiltVector(-179,0,{beta:179,gamma:0}).y,2);
});

test('a held tilt accelerates, release coasts, and counter-tilt brakes in both presets',()=>{
  for(const preset of ['classic','gentle']){
    const b=newBall(),opts={preset,walls:[],holes:[],goal:false};
    for(let i=0;i<24;i++)advance(b,{x:5,y:0},STEP,opts);
    const moving=b.vx;assert.ok(moving>.04);
    advance(b,{x:0,y:0},STEP,opts);assert.ok(b.vx>moving*.98,'release must not zero velocity');
    for(let i=0;i<18;i++)advance(b,{x:-5,y:0},STEP,opts);assert.ok(b.vx<moving*.5);
  }
});

test('maximum speed cannot tunnel through even a thin wall',()=>{
  const b={...newBall(),x:.05,y:.06,vx:MAX_SPEED,vy:0};
  const wall={x:.10,y:0,w:.001,h:.2};
  for(let i=0;i<60;i++)advance(b,{x:18,y:0},STEP,{walls:[wall],holes:[],goal:false});
  assert.ok(b.x<=wall.x-R+1e-8);
  const corner={...newBall(),x:.08,y:.08,vx:.6,vy:.6};
  for(let i=0;i<60;i++)advance(corner,{x:18,y:18},STEP,{walls:[wall,{x:0,y:.10,w:.2,h:.001}],holes:[],goal:false});
  assert.ok(corner.x<=.10-R+1e-8&&corner.y<=.10-R+1e-8);
});

test('the same hole captures slow crossings and permits fast crossings',()=>{
  const hole={x:.1,y:.1,r:.016};
  function cross(speed){const b={...newBall(),x:.075,y:.1,vx:speed,vy:0};let result=null;
    for(let i=0;i<1000&&b.x<.126;i++){result=advance(b,{x:0,y:0},STEP,{walls:[],holes:[hole],goal:false});if(result)break;}
    return {b,result};}
  assert.equal(cross(.15).result?.type,'fall');
  const fast=cross(.85);assert.equal(fast.result,null);assert.ok(fast.b.x>.12);assert.ok(fast.b.skipped>=1);
  const stopped={...newBall(),x:.1,y:.1};let result;
  for(let i=0;i<10;i++){result=advance(stopped,{x:0,y:0},STEP,{walls:[],holes:[hole],goal:false});if(result)break;}
  assert.equal(result?.type,'fall');
});

test('hole capture depends on impact parameter and forgiving preset adds margin',()=>{
  const hole={x:.1,y:.1,r:.016};
  function cross(preset){const b={...newBall(),x:.075,y:.107,vx:.15,vy:0};let result;
    for(let i=0;i<180;i++){result=advance(b,{x:2,y:0},STEP,{preset,walls:[],holes:[hole],goal:false});if(result)break;}return result;}
  assert.equal(cross('classic')?.type,'fall');assert.equal(cross('gentle'),null);
});

test('fixed stepping gives the same trajectory at 30, 60 and 120 Hz',()=>{
  function run(hz){const b=newBall(),clock=new FixedClock();for(let i=0;i<=hz*2;i++)clock.tick(i*1000/hz,true,dt=>{advance(b,{x:3,y:-2},dt,{walls:[],holes:[],goal:false});});return b;}
  const reference=run(60);
  for(const hz of [30,120]){const b=run(hz);assert.ok(Math.abs(b.x-reference.x)<MAX_SPEED*STEP*1.1);assert.ok(Math.abs(b.y-reference.y)<MAX_SPEED*STEP*1.1);}
});

test('a long frame is clamped and a visibility reset consumes no hidden time',()=>{
  const clock=new FixedClock();let steps=0;clock.tick(0,true,()=>steps++);clock.tick(100000,true,()=>steps++);assert.ok(steps<=12);
  clock.reset();const before=steps;clock.tick(200000,true,()=>steps++);assert.equal(steps,before);
  clock.tick(300000,false,()=>steps++);assert.equal(steps,before);
});

test('20 ms filter reaches one time constant independently of step partition',()=>{
  assert.ok(Math.abs(filtered(0,1,.02,.02)-(1-Math.exp(-1)))<1e-12);
  let v=0;for(let i=0;i<20;i++)v=filtered(v,1,.001,.02);assert.ok(Math.abs(v-filtered(0,1,.02,.02))<1e-12);
  assert.equal(filtered(0,1,.02,0),1);
});

test('the complete maze has a controllable, collision-free route to the goal',()=>{
  const b=newBall(),points=[[.041,.070],[.264,.070],[.264,.116],[.035,.116],[.035,.201],[.117,.201],[.117,.235],[.264,.235],[GOAL.x,GOAL.y]];
  let target=0,result=null;
  for(let i=0;i<240*100;i++){
    const [x,y]=points[target],ax=22*(x-b.x)-6*b.vx,ay=22*(y-b.y)-6*b.vy;
    const deg=a=>Math.asin(Math.max(-.2,Math.min(.2,a/(9.81*5/7))))*180/Math.PI;
    result=advance(b,{x:deg(ax),y:deg(ay)},STEP);
    assert.notEqual(result?.type,'fall',`route fell at waypoint ${target}`);
    if(result?.type==='win')break;
    if(Math.hypot(b.x-x,b.y-y)<.003&&Math.hypot(b.vx,b.vy)<.018&&target<points.length-1)target++;
  }
  assert.equal(result?.type,'win',`stopped at ${target}: ${b.x},${b.y}`);
});
