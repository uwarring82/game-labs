import test from 'node:test';import assert from 'node:assert/strict';
import {reliefLevel,scaledLevel,RELIEF} from '../dist/landscape.js';
import {newBall,advance,STEP,layoutFor,BALLS,BALL_SIZES} from '../dist/physics.js';
import {G} from '../dist/materials.js';
const level=reliefLevel(),flat={terrain:false,holes:[],goal:false,bounds:false,air:false,patches:false};

test('ball size scales the ball, not the board; solid balls keep density, the shell keeps its wall',()=>{
 for(const material of Object.keys(BALLS))for(const size of [BALL_SIZES.min,1.3,BALL_SIZES.max]){
  const a=newBall(material),b=newBall(material,'wood','wood',false,{size});
  assert.ok(Math.abs(b.r-a.r*size)<1e-15);assert.ok(Math.abs(b.m/a.m-size**(BALLS[material].shell?2:3))<1e-12);assert.ok(Math.abs(b.I-BALLS[material].inertiaRatio*b.m*b.r*b.r)<1e-18);
  assert.equal(b.layout.width,a.layout.width);assert.deepEqual(b.layout.holes.map(h=>h.r),a.layout.holes.map(h=>h.r));assert.equal(b.layout.goal.r,a.layout.goal.r);
  // Every size stays narrower than the holes and fits the goal's dwell circle.
  assert.ok(b.layout.holes.every(h=>h.r>b.r));assert.ok(b.layout.goal.r-b.r>.005*b.layout.scale);
 }
 assert.throws(()=>newBall('steel','wood','wood',false,{size:1.7}));assert.throws(()=>newBall('steel','wood','wood',false,{size:.4}));
});
test('every ball size keeps the summit e-folding time at 0.7 seconds',()=>{
 for(const material of Object.keys(BALLS))for(const size of [BALL_SIZES.min,1.3,BALL_SIZES.max]){const b=newBall(material,'wood','wood',false,{size}),l=b.layout,p=l.terrain.sample(l.goal.x,l.goal.y),tau=Math.sqrt((1+BALLS[material].inertiaRatio)*(-1/p.dxx+b.r)/G);
  assert.ok(Math.abs(tau-.7)<.003,`${material} ×${size}: ${tau}`);assert.ok(Math.hypot(p.dx,p.dy)<1e-7);}
});
test('a resized field equals a full rebuild near the goal, shares the relief elsewhere, and few are kept',()=>{
 for(const material of ['pingpong','billiard'])for(const size of [BALL_SIZES.min,BALL_SIZES.max]){
  const p=BALLS[material],scale=p.radius/RELIEF.radius,r=p.radius*size,shared=scaledLevel(level,scale,p.inertiaRatio,r,true),full=scaledLevel(level,scale,p.inertiaRatio,r,false);
  for(let k=0;k<60;k++){const d=.05+.04*k/59,t=k*2.4,x=(level.goal.x+d*Math.cos(t))*scale,y=(level.goal.y+d*Math.sin(t))*scale;if(x<0||y<0||x>shared.width||y>shared.height)continue;
   const a=shared.terrain.sample(x,y),b=full.terrain.sample(x,y);for(const key of ['h','dx','dy','dxx','dxy','dyy'])assert.ok(Math.abs(a[key]-b[key])<=1e-12*(1+Math.abs(b[key])),`${material} ×${size} ${key} at ${d}`);}
 }
 const size=s=>newBall('steel','wood','wood',false,{size:s}).layout,first=size(.6);
 assert.equal(size(.6),first);for(const s of [.7,.8,.9,1.1])size(s);assert.notEqual(size(.6),first);
 const nominal=layoutFor('steel');assert.ok(first.resized&&!nominal.resized);assert.deepEqual(first.terrain.sample(.02,.12),nominal.terrain.sample(.02,.12));
});
// Capture at a single speed is not monotonic in size (rim bounces), so scan speeds: smaller
// balls are captured more often and up to higher speeds. The largest ball never seats.
test('holes capture small balls more often and faster; the largest ball released over a hole falls',()=>{
 const hole={x:.1,y:.1,r:.00825},options={...flat,bounds:true,walls:[],holes:[hole]},falls=(size,v,off)=>{const b=newBall('steel','wood','wood',false,{size});b.x=.07;b.y=.1+off;b.z=b.r;b.vx=v;b.wy=b.vx/b.r;let e=null;for(let i=0;i<1.5/STEP&&!e;i++)e=advance(b,{x:0,y:0},STEP,options);return e?.type==='fall';};
 const scan=size=>{let count=0,fastest=0;for(let v=.1;v<=1.5;v+=.05)for(const off of [0,.003])if(falls(size,v,off)){count++;fastest=Math.max(fastest,v);}return{count,fastest};};
 const [small,nominal,large]=[BALL_SIZES.min,1,BALL_SIZES.max].map(scan);
 assert.ok(small.count>nominal.count&&nominal.count>large.count,JSON.stringify({small,nominal,large}));assert.ok(small.fastest>nominal.fastest&&nominal.fastest>large.fastest);
 for(const off of [.001,.004,.008]){const b=newBall('steel','wood','wood',false,{size:BALL_SIZES.max});b.x=hole.x+off;b.y=hole.y;b.z=b.r;let e=null;for(let i=0;i<1/STEP&&!e;i++)e=advance(b,{x:0,y:0},STEP,options);assert.equal(e?.type,'fall',`offset ${off}`);}
});
