import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {newBall,advance,STEP,layoutFor,BALLS} from '../dist/physics.js';
import {RELIEF,reliefLevel,makeLandscape,levelFromLandscape,scaledLevel} from '../dist/landscape.js';
import {runRoute} from './relief-bot.mjs';
export function structural(level){
 let slope=0,crest=0,lo=Infinity,hi=-Infinity;const classes={free:0,committed:0,momentum:0};
 for(let x=.004;x<level.width-.004;x+=.003)for(let y=.004;y<level.height-.004;y+=.003){const p=level.terrain.sample(x,y),angle=Math.atan(Math.hypot(p.dx,p.dy))*180/Math.PI;slope=Math.max(slope,angle);lo=Math.min(lo,p.h);hi=Math.max(hi,p.h);classes[angle<4?'free':angle<=8?'committed':'momentum']++;
  if(Math.hypot((x-level.lip.x)/level.lip.rx,(y-level.lip.y)/level.lip.ry)>1.05)crest=Math.max(crest,-(p.dxx+p.dyy)/2+Math.hypot((p.dxx-p.dyy)/2,p.dxy));
 }
 const saddles=level.drainage.critical.filter(p=>p.type==='saddle'),distance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
 const route=[level.start,...level.route],passes=saddles.filter(p=>route.slice(1).some((v,i)=>distance(p,route[i],v)<3*RELIEF.radius));
 let routeSlope=0,uphill=0;for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);for(let k=0;k<=100;k++){const p=level.terrain.sample(a.x+dx*k/100,a.y+dy*k/100);routeSlope=Math.max(routeSlope,Math.atan(Math.hypot(p.dx,p.dy))*180/Math.PI);uphill=Math.max(uphill,Math.atan((p.dx*dx+p.dy*dy)/d)*180/Math.PI);}}
 const clearance=level.holes.every(h=>saddles.every(p=>Math.hypot(p.x-h.x,p.y-h.y)>=3*RELIEF.radius));
 const drainage=level.holes.length===level.drainage.basins.length&&level.holes.every(h=>level.drainage.basins.some(p=>Math.hypot(p.x-h.x,p.y-h.y)<.001));
 return{maxSlopeDegrees:slope,minNonLipCrestRadius:1/crest,heightRange:[lo,hi],maxRouteSlope:routeSlope,maxRouteUphill:uphill,slopeClasses:classes,passes,holesClearSaddles:clearance,basinsDrained:drainage,accepted:slope<=15&&crest<=10.1&&Object.values(classes).every(n=>n>0)&&passes.length>=3&&passes.length<=5&&uphill>8.05&&clearance&&drainage};
}
export function pocketTrial(level=layoutFor()){
 const b=newBall();b.x=level.pocket.x;b.y=level.pocket.y;b.z=level.terrain.sample(b.x,b.y).h+b.r;
 const options={layout:level,holes:[],goal:false,maxTilt:8};
 let earlyEscape=false;
 for(let i=0;i<30/STEP;i++){advance(b,{x:8,y:0},STEP,options);if(b.x>level.pocket.x+.05)earlyEscape=true;}
 const afterTilt={x:b.x,y:b.y};for(let i=0;i<3/STEP;i++)advance(b,{x:8,y:0},STEP,{...options,acceleration:{x:i<24?-5:0,y:0,z:0}});
 return{accepted:!earlyEscape&&b.x>level.pocket.x+.05,tiltSeconds:30,tiltBudget:8,afterTilt,afterPulse:{x:b.x,y:b.y},pulse:{boardX:-5,seconds:.1},qualification:'constant exit-directed tilt is tested; arbitrary resonant pumping is not proven impossible'};
}
export function physicalDrainage(level=layoutFor()){
 const releases=[];for(let x=.07;x<=.19;x+=.03)for(let y=.16;y<=.275;y+=.03){const b=newBall();b.x=x;b.y=y;b.z=level.terrain.sample(x,y).h+b.r;let quiet=0;
  for(let i=0;i<60/STEP;i++){advance(b,{x:0,y:0},STEP,{layout:level,holes:[],goal:false});quiet=Math.hypot(b.vx,b.vy,b.vz)<.00003?quiet+STEP:0;if(b.time>1&&quiet>.25)break;}
  const basin=level.drainage.basins.findIndex(p=>Math.hypot(p.x-b.x,p.y-b.y)<1.65*RELIEF.radius),pocket=Math.hypot((b.x-level.pocket.x)/.07,(b.y-level.pocket.y)/.06)<1;
  releases.push({start:{x,y},result:basin>=0?'basin rest':pocket?'undrained pocket':'unclassified rest',basin,time:b.time,speed:Math.hypot(b.vx,b.vy,b.vz),end:{x:b.x,y:b.y}});
 }return{method:'20 zero-tilt rigid-body releases, holes removed, up to 60 s or 0.25 s at rest',releases,basinsObserved:level.drainage.basins.map((p,i)=>releases.filter(r=>r.basin===i).length),matched:releases.filter(r=>r.basin>=0).length,total:releases.length,accepted:level.drainage.basins.every((p,i)=>releases.some(r=>r.basin===i))};
}
export function botSuite(base,perBall=10){
 const scenarios=[];for(const material of Object.keys(BALLS)){const layout=scaledLevel(base,BALLS[material].radius/RELIEF.radius,BALLS[material].inertiaRatio,BALLS[material].radius),trials=[];for(let seed=1;seed<=perBall;seed++)trials.push(runRoute({material,layout,seed,seconds:45}));scenarios.push({material,surface:'wood',successes:trials.filter(t=>t.success).length,trials});}
 const intended=scenarios.find(s=>s.material==='steel'),hardest=[...scenarios].sort((a,b)=>a.successes-b.successes||b.trials.reduce((s,t)=>s+t.time,0)-a.trials.reduce((s,t)=>s+t.time,0))[0];
 return{scope:'all five balls on the intended hardwood floor; whole-board floor swaps are exploratory',tiltBudget:8,controller:'PD with terrain feed-forward; seeded initial position; acceleration only in declared jump region',intended:intended.material,hardest:hardest.material,scenarios,accepted:intended.successes===perBall&&hardest.successes>=Math.ceil(.7*perBall)};
}
export function rejectedHandmade(base){
 const p=base.start,d=.024,box={kind:'tall',height:.03,points:[[p.x-d,p.y-d],[p.x+d,p.y-d],[p.x+d,p.y+d],[p.x-d,p.y+d],[p.x-d,p.y-d]]},bad={...base,walls:[...base.walls,box]};
 const trial=runRoute({layout:bad,seconds:30,seed:1});return{description:'Hand-made candidate closes the starting shelf with a tall wall and no jump spot',rejected:!trial.success,trial};
}
export function validate(base=reliefLevel(),full=true){const shape=structural(base),pocket=pocketTrial(base),bots=botSuite(base,full?10:1);return{seed:base.seed,shape,pocket,bots,accepted:shape.accepted&&pocket.accepted&&bots.accepted};}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
 const base=reliefLevel(),r=validate(base);r.rejectedHandmade=rejectedHandmade(base);r.physicalDrainage=physicalDrainage(base);r.accepted&&=r.physicalDrainage.accepted&&r.rejectedHandmade.rejected;r.phoneTests=[{device:'Phone 1',status:'pending',sampleRate:null,observedAxisPeaks:null,hardwareRange:'unknown'},{device:'Phone 2',status:'pending',sampleRate:null,observedAxisPeaks:null,hardwareRange:'unknown'}];r.endorsement={version:'Relief v0.1',status:'draft, unendorsed',endorser:null,required:'U. Warring after two-phone motion acceptance and bot rejection evidence'};
 writeFileSync(new URL('../dist/relief-validation.json',import.meta.url),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({accepted:r.accepted,shape:r.shape,pocket:r.pocket,bots:r.bots.scenarios.map(s=>[s.material,s.successes]),rejected:r.rejectedHandmade.rejected,drainage:[r.physicalDrainage.matched,r.physicalDrainage.total]},null,2));
 if(!r.accepted)process.exitCode=2;
}
