import {MAZE,toMetres} from '../dist/maze.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Heightfield,FEATURES,cap,terrainFor,supportAt,surfaceNormal,normalAcceleration,GOAL_DWELL} from '../dist/terrain.js';
import {newBall,advance,STEP,CONTACTS,BALLS,layoutFor,kineticEnergy,gravity,granularState} from '../dist/physics.js';
import {G} from '../dist/materials.js';
const free={walls:[],holes:[],goal:false,bounds:false,air:false,granular:false};
const ideal={...CONTACTS.steel.wood,b0:0,b1:0,eRef:0,muStatic:1,muKinetic:1,muImpact:1};
function place(b,field,x,y,speed=0){const p=field.sample(x,y),n=surfaceNormal(p);b.x=x+b.r*n.x;b.y=y+b.r*n.y;b.z=p.h+b.r*n.z;b.vx=speed/Math.hypot(1,p.dx);b.vy=0;b.vz=p.dx*b.vx;b.wx=(n.y*b.vz-n.z*b.vy)/b.r;b.wy=(n.z*b.vx-n.x*b.vz)/b.r;b.wz=(n.x*b.vy-n.y*b.vx)/b.r;return b;}
function simulate(b,seconds,field,options={},tilt={x:0,y:0}){let event;for(let i=0;i<Math.round(seconds/STEP);i++){event=advance(b,tilt,STEP,{...free,terrain:field,floorProfile:ideal,...options});if(event)break;}return event;}
function parabola(k,x=.15){return{sample:(u,v)=>({h:k*(u-x)**2/2,dx:k*(u-x),dy:0,dxx:k,dxy:0,dyy:0})};}
test('Hermite field reproduces a quadratic potential and its gradient/Hessian',()=>{
 const field=new Heightfield((x,y)=>({h:.02*x*x+.03*x*y-.01*y*y,dx:.04*x+.03*y,dy:.03*x-.02*y,dxy:.03}),.3,.6,.01);
 for(let i=1;i<50;i++){const x=.3*i/51,y=.6*(i*.618%1),p=field.sample(x,y);assert.ok(Math.abs(p.h-(.02*x*x+.03*x*y-.01*y*y))<1e-12);assert.ok(Math.abs(p.dx-(.04*x+.03*y))<1e-11);assert.ok(Math.abs(p.dxx-.04)<1e-9);assert.ok(Math.abs(p.dxy-.03)<1e-9);assert.ok(Math.abs(p.dyy+.02)<1e-9);}
});
test('legacy terrain fixture is C1 across grid seams, below 15 degrees, and flat at apertures',()=>{
 const f=terrainFor();let slope=0;
 for(let x=0;x<=.3;x+=.0015)for(let y=0;y<=19/30;y+=.0015){const p=f.sample(x,y);slope=Math.max(slope,Math.hypot(p.dx,p.dy));}
 assert.ok(Math.atan(slope)*180/Math.PI<15);
 for(let x=.05;x<.29;x+=.0025){const a=f.sample(x-1e-9,.213),b=f.sample(x+1e-9,.213);assert.ok(Math.abs(a.h-b.h)<1e-8);assert.ok(Math.hypot(a.dx-b.dx,a.dy-b.dy)<1e-6);}
 for(const h of MAZE.holes.map(toMetres))for(let a=0;a<6.29;a+=.1){const p=f.sample(h.x+h.r*Math.cos(a),h.y+h.r*Math.sin(a));assert.ok(Math.abs(p.h)+Math.abs(p.dx)+Math.abs(p.dy)<1e-12);}
});
test('inclined contact preserves solid/shell acceleration without a hardcoded 5/7',()=>{
 const slope=.12,f={sample:(x,y)=>({h:slope*x,dx:slope,dy:0,dxx:0,dxy:0,dyy:0})};
 for(const material of ['steel','pingpong']){const b=place(newBall(material),f,.1,.2);simulate(b,.125,f);const expected=G*Math.sin(Math.atan(slope))/(1+BALLS[material].inertiaRatio)*.125;assert.ok(Math.abs(Math.hypot(b.vx,b.vy,b.vz)-expected)<1e-8);assert.ok(b.slip<1e-9);}
 const b=place(newBall(),f,.1,.2);simulate(b,.5,f,{}, {x:Math.atan(slope)*180/Math.PI,y:0});assert.ok(Math.hypot(b.vx,b.vy,b.vz)<1e-10);
});
test('curvature load has the correct dip/crest sign and finite-radius correction',()=>{
 for(const k of [10,-10]){const f=parabola(k),b=place(newBall(),f,.15,.2,.4),n=normalAcceleration(b,supportAt(b,f),gravity({x:0,y:0}));assert.ok(Math.abs(n-(G+k*.4**2/(1-b.r*k)))<1e-10);}
});
test('an under-speed climb turns back, while energy above the barrier crosses',()=>{
 const feature={x:.15,y:.2,rx:.07,ry:.07,height:.002},f={sample:(x,y)=>cap(feature,x,y)},threshold=Math.sqrt(2*G*feature.height/1.4);
 for(const factor of [.65,1.35]){const b=place(newBall(),f,.075,.2,threshold*factor),initial=kineticEnergy(b)+b.m*G*b.z;let maxX=b.x,maxEnergy=initial;
  for(let i=0;i<240*2;i++){advance(b,{x:0,y:0},STEP,{...free,terrain:f,floorProfile:ideal});maxX=Math.max(maxX,b.x);maxEnergy=Math.max(maxEnergy,kineticEnergy(b)+b.m*G*b.z);}
  assert.ok(maxEnergy<=initial*1.003,'numerical energy increase '+maxEnergy/initial);if(factor<1)assert.ok(maxX<feature.x-.01);else assert.ok(maxX>feature.x+.07);
 }
});
test('a lossless dip oscillates at the finite-radius rolling frequency',()=>{
 const radius=.18,f=parabola(1/radius),b=place(newBall(),f,.152,.2),crossings=[];let last=b.x;
 const expected=2*Math.PI*Math.sqrt(1.4*(radius-b.r)/G);
 for(let i=0;i<240*4;i++){advance(b,{x:0,y:0},STEP,{...free,terrain:f,floorProfile:ideal});if(last>.15&&b.x<=.15)crossings.push(b.time);last=b.x;}
 assert.ok(crossings.length>=3);assert.ok(Math.abs((crossings[2]-crossings[0])/2-expected)<.006);
});
test('a fast ball leaves the authored crest, and lands through the local contact solver',()=>{
 const f=terrainFor(),lip=FEATURES[2];
 const slow=place(newBall(),f,lip.x,lip.y,.35);simulate(slow,.03,f);assert.ok(slow.grounded);
 const fast=place(newBall(),f,lip.x,lip.y,1.1),hits=[];let airborne=false,landed=false,maxGap=0;
 for(let i=0;i<90;i++){advance(fast,{x:0,y:0},STEP,{...free,terrain:f,onContact:e=>hits.push(e)});maxGap=Math.max(maxGap,supportAt(fast,f).gap);if(!fast.grounded)airborne=true;if(airborne&&fast.grounded)landed=true;}
 assert.ok(airborne&&landed);assert.ok(maxGap>.0002);assert.ok(hits.some(e=>e.kind==='floor'&&e.impulse>0));
});
test('sliding is decided by total local slope, including terrain with neutral input',()=>{
 const slope=.18,f={sample:x=>({h:slope*x,dx:slope,dy:0,dxx:0,dxy:0,dyy:0})};
 const ice=place(newBall('steel','ice'),f,.1,.2);simulate(ice,.15,f,{floorProfile:CONTACTS.steel.ice});assert.ok(ice.slip>.02);
 const wood=place(newBall(),f,.1,.2);simulate(wood,.15,f,{floorProfile:CONTACTS.steel.wood});assert.ok(wood.slip<1e-8);
});
test('sand load extension increases penetration with load and removes it without support',()=>{
 const b=newBall('pingpong','sand'),low=granularState(b,.5),normal=granularState(b,1),high=granularState(b,2);assert.ok(low.sinkage<normal.sinkage&&normal.sinkage<high.sinkage);assert.equal(granularState(b,0).sinkage,0);
});
test('goal curvature has a 0.5–1 s ideal e-folding time at every physical ball size',()=>{
 for(const material of Object.keys(BALLS)){const l=layoutFor(material),p=l.terrain.sample(l.goal.x,l.goal.y),radius=-1/p.dxx;assert.ok(radius>2.5&&radius<3.6);const tau=Math.sqrt((1+BALLS[material].inertiaRatio)*(radius+BALLS[material].radius)/G);assert.ok(tau>.5&&tau<1);}
});
test('goal requires three uninterrupted grounded seconds and resets outside the ring',()=>{
 const b=newBall(),l=layoutFor();place(b,l.terrain,l.goal.x,l.goal.y);
 assert.equal(simulate(b,2.5,l.terrain,{goal:true}),null);assert.ok(b.dwell>2.49);
 b.x+=l.goal.r;advance(b,{x:0,y:0},STEP);assert.equal(b.dwell,0);place(b,l.terrain,l.goal.x,l.goal.y);
 assert.equal(simulate(b,2.99,l.terrain,{goal:true}),null);assert.equal(simulate(b,.02,l.terrain,{goal:true})?.type,'win');
 const air=place(newBall(),l.terrain,l.goal.x,l.goal.y);air.dwell=2;air.z+=.02;advance(air,{x:0,y:0},STEP);assert.equal(air.dwell,0);
});
test('open edges fall on all four sides; default border walls retain the ball',()=>{
 const l=layoutFor();
 for(const [x,y,vx,vy] of [[.018,.08,-.2,0],[l.width-.018,.08,.2,0],[.10,.018,0,-.2],[.10,l.height-.018,0,.2]]){
  for(const open of [false,true]){const b=newBall('steel','wood','wood',open);Object.assign(b,{x,y,vx,vy,wy:vx/b.r,wx:-vy/b.r});let event;
   for(let i=0;i<120;i++){event=advance(b,{x:0,y:0},STEP,{goal:false});if(event)break;}
   if(open){assert.equal(event?.type,'escape');assert.ok(!b.grounded);}else assert.equal(event,null);
  }
 }
});
