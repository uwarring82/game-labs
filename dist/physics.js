import { G, AIR, BALLS, CONTACTS, WALL_CONTACTS, granularState, restitution } from './materials.js';
export { BALLS, CONTACTS, WALL_CONTACTS, WALL_MATERIALS, SURFACES, granularState } from './materials.js';
import {BOARD,MAZE,toMetres} from './maze.js';
export const W=BOARD.width*BOARD.metresPerUnit,H=BOARD.height*BOARD.metresPerUnit,R=.0075,STEP=1/240,MAX_TILT=28;
export const START=toMetres(MAZE.start),GOAL=toMetres(MAZE.goal),WALLS=MAZE.walls.map(toMetres),HOLES=MAZE.holes.map(toMetres);
export const ROUTE=MAZE.route.map(p=>p.map(v=>v*BOARD.metresPerUnit));
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function angleDifference(a,b){return ((a-b+540)%360)-180;}
export function tiltVector(beta,gamma,neutral,screenAngle=0){
  const x=angleDifference(gamma,neutral.gamma),y=angleDifference(beta,neutral.beta),t=screenAngle*Math.PI/180;
  return {x:x*Math.cos(t)+y*Math.sin(t),y:-x*Math.sin(t)+y*Math.cos(t)};
}
export function filtered(current,target,dt,tau){return current+(target-current)*(tau>0?-Math.expm1(-dt/tau):1);}
export function gravity(tilt){
  // Radial virtual-board inclination keeps |g|=G even for diagonal input.
  const length=Math.hypot(tilt.x,tilt.y),theta=Math.min(MAX_TILT,length)*Math.PI/180;
  const scale=length?G*Math.sin(theta)/length:0;
  return {x:scale*tilt.x,y:scale*tilt.y,z:-G*Math.cos(theta)};
}
const layouts=new Map();
export function layoutFor(material='steel'){
  if(layouts.has(material))return layouts.get(material);
  const scale=BALLS[material].radius/R;
  const scaleObject=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,v*scale]));
  const layout={scale,width:W*scale,height:H*scale,start:scaleObject(START),goal:scaleObject(GOAL),walls:WALLS.map(w=>({...scaleObject(w),bottom:-.025*scale})),holes:HOLES.map(scaleObject)};
  layouts.set(material,layout);return layout;
}
export function newBall(material='steel',surface='wood',wallMaterial='wood'){
  const p=BALLS[material];if(!p||!CONTACTS[material][surface]||!WALL_CONTACTS[material][wallMaterial])throw new Error('Unknown material or surface');
  const r=p.radius,m=p.mass??4/3*Math.PI*r**3*p.density;
  return {...layoutFor(material).start,z:r,vx:0,vy:0,vz:0,wx:0,wy:0,wz:0,q:[1,0,0,0],time:0,r,m,I:p.inertiaRatio*m*r*r,density:m/(4/3*Math.PI*r**3),material,surface,wallMaterial,grounded:true,slip:0,regime:'rest',impacts:0,skipped:0,overHole:null};
}
export function kineticEnergy(b){return .5*b.m*(b.vx*b.vx+b.vy*b.vy+b.vz*b.vz)+.5*b.I*(b.wx*b.wx+b.wy*b.wy+b.wz*b.wz);}
export function contactVelocity(b,n){
  const rx=-b.r*n.x,ry=-b.r*n.y,rz=-b.r*n.z;
  return {x:b.vx+b.wy*rz-b.wz*ry,y:b.vy+b.wz*rx-b.wx*rz,z:b.vz+b.wx*ry-b.wy*rx};
}
function applyImpulse(b,n,jx,jy,jz){
  b.vx+=jx/b.m;b.vy+=jy/b.m;b.vz+=jz/b.m;
  const rx=-b.r*n.x,ry=-b.r*n.y,rz=-b.r*n.z;
  b.wx+=(ry*jz-rz*jy)/b.I;b.wy+=(rz*jx-rx*jz)/b.I;b.wz+=(rx*jy-ry*jx)/b.I;
}
export function contactImpulse(b,n,p,{bounce=true,onContact,kind='wall'}={}){
  const u=contactVelocity(b,n),vn=u.x*n.x+u.y*n.y+u.z*n.z;
  if(vn>=0)return 0;
  // Suppress support-contact restitution chatter below 0.08 m/s.
  const impact=bounce&&-vn>.08,e=impact?restitution(p,-vn):0,jn=-(1+e)*vn*b.m;
  const tx=u.x-vn*n.x,ty=u.y-vn*n.y,tz=u.z-vn*n.z,ut=Math.hypot(tx,ty,tz);
  let jt=0;
  if(ut>1e-14){
    const effectiveMass=1/(1/b.m+b.r*b.r/b.I);
    const desired=(1+(impact?p.eTangent:0))*ut*effectiveMass;
    if(impact)jt=Math.min(desired,p.muImpact*jn);
    else jt=desired<=p.muStatic*jn?desired:Math.min(desired,p.muKinetic*jn);
  }
  const tScale=ut?jt/ut:0;
  applyImpulse(b,n,jn*n.x-tScale*tx,jn*n.y-tScale*ty,jn*n.z-tScale*tz);
  if(impact){b.impacts++;onContact?.({kind,impulse:jn,normalSpeed:-vn,time:b.time,x:b.x,y:b.y,z:b.z,material:b.material,surface:kind==='floor'?b.surface:kind==='rim'?'wood':b.wallMaterial,mass:b.m});}
  return jn;
}
export function resolveWall(b,w,p=WALL_CONTACTS[b.material][b.wallMaterial],onContact){
  const top=w.height??.018,bottom=w.bottom??-.025;
  const closest={x:clamp(b.x,w.x,w.x+w.w),y:clamp(b.y,w.y,w.y+w.h),z:clamp(b.z,bottom,top)};
  let dx=b.x-closest.x,dy=b.y-closest.y,dz=b.z-closest.z,d=Math.hypot(dx,dy,dz),depth;
  if(d>=b.r)return false;
  if(d>1e-12){dx/=d;dy/=d;dz/=d;depth=b.r-d;}
  else {
    const sides=[{d:b.x-w.x,n:[-1,0,0]},{d:w.x+w.w-b.x,n:[1,0,0]},{d:b.y-w.y,n:[0,-1,0]},{d:w.y+w.h-b.y,n:[0,1,0]},{d:top-b.z,n:[0,0,1]},{d:b.z-bottom,n:[0,0,-1]}];
    const side=sides.reduce((a,c)=>a.d<c.d?a:c);[dx,dy,dz]=side.n;depth=b.r+side.d;
  }
  b.x+=dx*(depth+1e-9);b.y+=dy*(depth+1e-9);b.z+=dz*(depth+1e-9);
  contactImpulse(b,{x:dx,y:dy,z:dz},p,{onContact,kind:'wall'});
  return true;
}
function openingAt(x,y,holes){return holes.findIndex(h=>Math.hypot(x-h.x,y-h.y)<h.r);}
function floorContact(b,holes,p,rimProfile,onContact){
  const opening=openingAt(b.x,b.y,holes);
  if(opening<0){
    if(b.z<=b.r+1e-9){b.z=Math.max(b.r,b.z);contactImpulse(b,{x:0,y:0,z:1},p,{onContact,kind:'floor'});return b.vz<.02;}
    return false;
  }
  // Nearest point on an ideal rigid circular aperture. Above z=0: rim;
  // below z=0: inner cylindrical wall. Gravity and contact decide capture.
  const hole=holes[opening],dx=b.x-hole.x,dy=b.y-hole.y,d=Math.hypot(dx,dy);
  if(d<1e-12)return false;
  const gap=hole.r-d,dz=Math.max(b.z,0),dist=Math.hypot(gap,dz);
  if(dist<b.r){
    const n={x:-gap*dx/d/dist,y:-gap*dy/d/dist,z:dz/dist},pen=b.r-dist;
    b.x+=n.x*(pen+1e-9);b.y+=n.y*(pen+1e-9);b.z+=n.z*(pen+1e-9);
    contactImpulse(b,n,rimProfile,{onContact,kind:'rim'});
  }
  return false;
}
function rollingLoss(b,normal,dt,p,granular){
  const omega=Math.hypot(b.wx,b.wy),speed=omega*b.r;
  const arm=p.b0+p.b1*speed+(granular?.rollingArm??0);
  if(omega>0){const decrement=Math.min(omega,normal*arm*dt/b.I);b.wx*=1-decrement/omega;b.wy*=1-decrement/omega;}
  const contactRadius=granular?.footprint??Math.cbrt(3*normal*b.r/(4*p.effectiveModulus));
  const spinDrop=Math.min(Math.abs(b.wz),(3*Math.PI/16)*p.muKinetic*normal*contactRadius*dt/b.I);
  b.wz-=Math.sign(b.wz)*spinDrop;
  if(granular){
    const v=Math.hypot(b.vx,b.vy);
    if(v){const force=granular.ploughCoefficient*normal+granular.inertialDrag*v*v;
      const dv=Math.min(v,force*dt/b.m);b.vx*=1-dv/v;b.vy*=1-dv/v;}
  }
}
function rotate(b,dt){
  const w=Math.hypot(b.wx,b.wy,b.wz);if(!w)return;
  const angle=w*dt*.5,c=Math.cos(angle),s=Math.sin(angle)/w,x=b.wx*s,y=b.wy*s,z=b.wz*s,[a,u,v,t]=b.q;
  const next=[c*a-x*u-y*v-z*t,c*u+x*a+y*t-z*v,c*v-x*t+y*a+z*u,c*t+x*v-y*u+z*a];
  const norm=Math.hypot(...next);b.q=next.map(n=>n/norm);
}
export function airDrag(b,dt){
  // Exact velocity decay for F=-c|v|v during the drag substep. Passive, no cap.
  const speed=Math.hypot(b.vx,b.vy,b.vz),c=.5*AIR.density*AIR.dragCoefficient*Math.PI*b.r*b.r;
  const factor=1/(1+c*speed*dt/b.m);b.vx*=factor;b.vy*=factor;b.vz*=factor;
}
export function advance(b,tilt,dt,options={}){
  const layout=layoutFor(b.material),goal=layout.goal;
  const walls=options.walls??layout.walls,holes=options.holes??layout.holes;
  const p=options.floorProfile??CONTACTS[b.material][b.surface],wallProfile=options.wallProfile??WALL_CONTACTS[b.material][b.wallMaterial];
  const rimProfile=options.rimProfile??CONTACTS[b.material].wood;
  const granular=options.granular===false?null:b.surface==='sand'?granularState(b):null;
  const g=gravity(tilt),normal=-g.z*b.m;
  let remaining=dt;
  while(remaining>1e-12){
    // Adaptive displacement bound, with no artificial speed limit.
    const speed=Math.hypot(b.vx,b.vy,b.vz);
    const h=Math.min(remaining,1/960,b.r*.2/(speed+G*remaining+1e-9));remaining-=h;b.time+=h;
    const onFloor=b.z<=b.r+2e-6&&Math.abs(b.vz)<.02&&openingAt(b.x,b.y,holes)<0;
    const resistanceRatio=(p.b0+(granular?.rollingArm??0))/b.r+(granular?.ploughCoefficient??0);
    const nearRest=Math.hypot(b.vx,b.vy)<2e-5&&Math.hypot(b.wx,b.wy)*b.r<2e-5;
    const held=onFloor&&nearRest&&Math.hypot(g.x,g.y)<=(-g.z)*resistanceRatio;
    if(held){b.vx=0;b.vy=0;b.wx=0;b.wy=0;}
    else {b.vx+=g.x*h;b.vy+=g.y*h;}
    b.vz+=g.z*h;
    if(options.air!==false)airDrag(b,h);
    if(onFloor)rollingLoss(b,normal,h,p,granular);
    b.x+=b.vx*h;b.y+=b.vy*h;b.z+=b.vz*h;
    for(let i=0;i<3;i++){
      for(const wall of walls)resolveWall(b,wall,wallProfile,options.onContact);
      const supported=floorContact(b,holes,p,rimProfile,options.onContact);
      if(i===2)b.grounded=supported;
    }
    rotate(b,h);
    const opening=openingAt(b.x,b.y,holes);
    if(opening>=0){b.overHole=opening;if(b.z<-b.r)return{type:'fall',hole:opening};}
    else if(b.overHole!==null){b.skipped++;b.overHole=null;}
    const u=contactVelocity(b,{x:0,y:0,z:1});b.slip=Math.hypot(u.x,u.y);
    b.regime=b.grounded?(Math.hypot(b.vx,b.vy)<2e-5&&Math.hypot(b.wx,b.wy)*b.r<2e-5?'rest':b.slip>.002?'sliding':'rolling'):'airborne';
    if(options.goal!==false&&b.grounded&&Math.hypot(b.x-goal.x,b.y-goal.y)<goal.r-b.r&&Math.hypot(b.vx,b.vy)<.08)return{type:'win'};
    if(b.x<-b.r||b.x>layout.width+b.r||b.y<-b.r||b.y>layout.height+b.r){if(options.bounds!==false)return{type:'escape'};}
  }
  return null;
}
export class FixedClock {
  constructor(){this.last=null;this.accumulator=0;}
  reset(){this.last=null;this.accumulator=0;}
  tick(now,running,step){
    if(this.last===null){this.last=now;return 0;}
    const elapsed=Math.min(.05,Math.max(0,(now-this.last)/1000));this.last=now;
    if(!running){this.accumulator=0;return 0;}
    this.accumulator+=elapsed;let count=0;
    while(this.accumulator+1e-12>=STEP&&count<12){this.accumulator=Math.max(0,this.accumulator-STEP);count++;if(step(STEP)===false){this.accumulator=0;break;}}
    return count;
  }
}
