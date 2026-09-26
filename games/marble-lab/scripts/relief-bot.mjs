import {newBall,advance,STEP,layoutFor,CONTACTS,BALLS,granularState} from '../dist/physics.js';
import {G} from '../dist/materials.js';
import {random} from '../dist/landscape.js';
import {flickAcceleration} from '../dist/motion.js';
export function runRoute({material='steel',surface='wood',layout=layoutFor(material),seed=1,maxTilt=8,seconds=100,trace=false,toss=true}={}){
 const b=newBall(material,surface),rng=random(seed),s=layout.scale??1,k=BALLS[material].inertiaRatio,p=CONTACTS[material][surface],points=layout.route;
 b.x=layout.start.x+(rng()-.5)*b.r*.2;b.y=layout.start.y+(rng()-.5)*b.r*.2;b.z=layout.terrain.sample(b.x,b.y).h+b.r;
 let target=0,event=null,tossStart=null,tossDone=false,maxInput=0;const samples=[];
 for(let i=0;i<seconds/STEP;i++){
  const waypoint=points[target],dx=waypoint.x-b.x,dy=waypoint.y-b.y,d=Math.hypot(dx,dy),ux=d?dx/d:0,uy=d?dy/d:0,v=Math.hypot(b.vx,b.vy);
  const final=target===points.length-1,cruise=(waypoint.speed??.13*Math.sqrt(s)),wanted=Math.min(cruise,d*(final?6:5));
  const slope=layout.terrain.sample(b.x,b.y),sand=surface==='sand'?granularState(b):null;
  const loss=G*((p.b0+p.b1*v+(sand?.rollingArm??0))/b.r+(sand?.ploughCoefficient??0))+(sand?.inertialDrag??0)*v*v/b.m;
  let ax=(1+k)*9*(wanted*ux-b.vx)+G*slope.dx+loss*ux,ay=(1+k)*9*(wanted*uy-b.vy)+G*slope.dy+loss*uy;
  const mag=Math.hypot(ax,ay),angle=Math.min(maxTilt,Math.atan2(mag,G)*180/Math.PI),tilt={x:mag?angle*ax/mag:0,y:mag?angle*ay/mag:0};maxInput=Math.max(maxInput,angle);
  const jumpZone=layout.jumpSpots.some(p=>((b.x-p.x)/p.rx)**2+((b.y-p.y)/p.ry)**2<1);
  if(jumpZone&&toss&&(tossStart===null||b.time-tossStart>1*Math.sqrt(s))){tossStart=b.time;tossDone=true;}
  const acceleration=tossStart!==null?flickAcceleration(b.time-tossStart,.65*Math.sqrt(s),.15*Math.sqrt(s),.025*Math.sqrt(s)):{x:0,y:0,z:0};
  if(tossStart!==null&&b.time-tossStart>=.15*Math.sqrt(s)&&b.time-tossStart<.25*Math.sqrt(s)){acceleration.x=-3*ux;acceleration.y=-3*uy;}
  event=advance(b,tilt,STEP,{layout,maxTilt,acceleration});
  if(trace&&i%12===0)samples.push({time:b.time,x:b.x,y:b.y,z:b.z,target,tilt,acceleration,dwell:b.dwell});
  if(event)break;
  if(!final&&d<(waypoint.jump?.025:.008)*s){target++;}
 }
 return{material,surface,seed,success:event?.type==='win',event:event?.type??'timeout',target,time:b.time,maxInput,position:{x:b.x,y:b.y,z:b.z,dwell:b.dwell,grounded:b.grounded,gap:b.supportGap,vz:b.vz,normal:b.normalLoad,spin:Math.hypot(b.wx,b.wy,b.wz)},trace:samples};
}
