import { G, AIR, BALLS, CONTACTS, WALL_CONTACTS, granularState, restitution, patchProfile } from './materials.js';
export { BALLS, CONTACTS, WALL_CONTACTS, WALL_MATERIALS, SURFACES, granularState } from './materials.js';
import {BOARD,MAZE,toMetres} from './maze.js';
import {terrainFor,flatTerrain,supportAt,normalAcceleration,GOAL_DWELL} from './terrain.js';
import {capAcceleration,alignAcceleration} from './motion.js';
import {RELIEF,reliefLevel,scaledLevel} from './landscape.js';
export const W=BOARD.width*BOARD.metresPerUnit,H=BOARD.height*BOARD.metresPerUnit,R=.005,STEP=1/240,MAX_TILT=28;
const BASE_LEVEL=reliefLevel();
export const START=BASE_LEVEL.start,GOAL=BASE_LEVEL.goal,WALLS=BASE_LEVEL.walls,HOLES=BASE_LEVEL.holes;
export const ROUTE=BASE_LEVEL.route.map(p=>[p.x,p.y]);
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function angleDifference(a,b){return ((a-b+540)%360)-180;}
export function tiltVector(beta,gamma,neutral,screenAngle=0){
  const x=angleDifference(gamma,neutral.gamma),y=angleDifference(beta,neutral.beta),t=screenAngle*Math.PI/180;
  return {x:x*Math.cos(t)+y*Math.sin(t),y:-x*Math.sin(t)+y*Math.cos(t)};
}
export function filtered(current,target,dt,tau){return current+(target-current)*(tau>0?-Math.expm1(-dt/tau):1);}
export function gravity(tilt,maxTilt=MAX_TILT){
  // Radial virtual-board inclination keeps |g|=G even for diagonal input.
  const length=Math.hypot(tilt.x,tilt.y),theta=Math.min(maxTilt,length)*Math.PI/180;
  const scale=length?G*Math.sin(theta)/length:0;
  return {x:scale*tilt.x,y:scale*tilt.y,z:-G*Math.cos(theta)};
}
// The level is an input: the relief by default, or an edited copy from Sculpt. Layouts
// are cached per level object, material and ball radius. The board scale follows the
// material's nominal radius, so a resized ball changes size relative to the board.
const layouts=new WeakMap();
export function layoutFor(material='steel',level=BASE_LEVEL,radius=BALLS[material].radius){
  let cache=layouts.get(level);if(!cache)layouts.set(level,cache=new Map());
  const key=material+'/'+radius;if(cache.has(key))return cache.get(key);
  const nominal=radius===BALLS[material].radius,scale=BALLS[material].radius/R;
  const layout=scaledLevel(level,scale,BALLS[material].inertiaRatio,radius,!nominal);
  // Keep at most four resized layouts per level; nominal ones stay.
  if(!nominal){const resized=[...cache.keys()].filter(k=>cache.get(k).resized);if(resized.length>=4)cache.delete(resized[0]);layout.resized=true;}
  cache.set(key,layout);return layout;
}
// Up to 1.6x, every ball stays narrower than the holes (1.65 reference radii): a wider ball
// would seat in a hole's rim for good, and the game has no stuck detector.
export const BALL_SIZES=Object.freeze({min:.5,max:1.6});
// size multiplies the material's nominal diameter. Solid balls keep their density; the
// table-tennis shell keeps its wall, so its mass scales with area. The ball carries its
// layout (not enumerable), and advance() uses it unless told otherwise.
export function newBall(material='steel',surface='wood',wallMaterial='wood',openEdges=false,{level=BASE_LEVEL,size=1}={}){
  const p=BALLS[material];if(!p||!CONTACTS[material][surface]||!WALL_CONTACTS[material][wallMaterial])throw new Error('Unknown material or surface');
  if(!(size>=BALL_SIZES.min&&size<=BALL_SIZES.max))throw new Error('Ball size out of range');
  const r=p.radius*size,m=p.mass!==undefined?p.mass*size**(p.shell?2:3):4/3*Math.PI*r**3*p.density,layout=layoutFor(material,level,r);
  const b={...layout.start,z:r,vx:0,vy:0,vz:0,wx:0,wy:0,wz:0,q:[1,0,0,0],time:0,r,m,I:p.inertiaRatio*m*r*r,density:m/(4/3*Math.PI*r**3),material,surface,wallMaterial,openEdges,dwell:0,groundHeight:0,supportGap:0,normalLoad:m*G,contactSurface:surface,grounded:true,slip:0,regime:'rest',impacts:0,skipped:0,overHole:null};
  Object.defineProperty(b,'layout',{value:layout,writable:true,configurable:true,enumerable:false});return b;
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
  if(impact){b.impacts++;onContact?.({kind,impulse:jn,normalSpeed:-vn,time:b.time,x:b.x,y:b.y,z:b.z,material:b.material,surface:kind==='floor'?b.contactSurface??b.surface:kind==='rim'?'wood':b.wallMaterial,mass:b.m});}
  return jn;
}
export function resolveWall(b,w,p=WALL_CONTACTS[b.material][b.wallMaterial],onContact,field=flatTerrain){
  if(w.points)return resolvePolyline(b,w,p,onContact,field);
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
export function resolvePolyline(b,w,p,onContact,field=flatTerrain){
 let hit=false;
 for(let i=1;i<w.points.length;i++){
  const [ax,ay]=w.points[i-1],[cx,cy]=w.points[i],sx=cx-ax,sy=cy-ay,l2=sx*sx+sy*sy;
  const t=clamp(((b.x-ax)*sx+(b.y-ay)*sy)/l2,0,1),x=ax+t*sx,y=ay+t*sy,base=field.sample(x,y).h,top=base+w.height;
  if(b.z-b.r>top)continue;
  const z=clamp(b.z,base-.03,top);let dx=b.x-x,dy=b.y-y,dz=b.z-z,d=Math.hypot(dx,dy,dz);
  if(d>=b.r)continue;
  if(d<1e-12){const l=Math.sqrt(l2),sign=(b.vx*(-sy)+b.vy*sx)>0?-1:1;dx=-sy/l*sign;dy=sx/l*sign;dz=0;}else{dx/=d;dy/=d;dz/=d;}
  const pen=b.r-d+1e-9;b.x+=dx*pen;b.y+=dy*pen;b.z+=dz*pen;
  contactImpulse(b,{x:dx,y:dy,z:dz},p,{onContact,kind:dz>.05?'rim':'wall'});hit=true;
 }
 return hit;
}
export function patchAt(b,layout){return layout.patches?.find(p=>((b.x-p.x)/p.rx)**2+((b.y-p.y)/p.ry)**2<1)?.kind??null;}
function openingAt(x,y,holes){return holes.findIndex(h=>Math.hypot(x-h.x,y-h.y)<h.r);}
function floorContact(b,holes,p,rimProfile,onContact,field,layout,finiteFloor,g){
  if(finiteFloor&&(b.x<0||b.x>layout.width||b.y<0||b.y>layout.height)){
    // Rounded sphere contact with the sharp, flat outer edge. Never extend the floor.
    const x=clamp(b.x,0,layout.width),y=clamp(b.y,0,layout.height),dx=b.x-x,dy=b.y-y,dz=Math.max(0,b.z-field.sample(x,y).h),d=Math.hypot(dx,dy,dz);
    if(d<b.r&&d>1e-12){const n={x:dx/d,y:dy/d,z:dz/d},pen=b.r-d;b.x+=n.x*pen;b.y+=n.y*pen;b.z+=n.z*pen;contactImpulse(b,n,rimProfile,{onContact,kind:'rim'});}
    return false;
  }
  const opening=openingAt(b.x,b.y,holes);
  if(opening<0){
    const s=supportAt(b,field);b.groundHeight=s.h;
    if(s.gap<=1e-9){const pen=Math.max(0,-s.gap),vn=b.vx*s.n.x+b.vy*s.n.y+b.vz*s.n.z,gn=g.x*s.n.x+g.y*s.n.y+g.z*s.n.z;
      // Remove post-crossing gravitational work before restitution. Otherwise
      // repeated position projection can sustain a tiny high-e bounce forever.
      if(!b.grounded&&vn<-.08&&gn<0&&pen>0){const corrected=-Math.sqrt(Math.max(0,vn*vn+2*gn*pen)),dv=corrected-vn;b.vx+=dv*s.n.x;b.vy+=dv*s.n.y;b.vz+=dv*s.n.z;}
      b.x+=s.n.x*pen;b.y+=s.n.y*pen;b.z+=s.n.z*pen;contactImpulse(b,s.n,p,{onContact,kind:'floor'});return b.vx*s.n.x+b.vy*s.n.y+b.vz*s.n.z<.02;}
    return false;
  }
  // Nearest point on an ideal rigid circular aperture. Above z=0: rim;
  // below z=0: inner cylindrical wall. Gravity and contact decide capture.
  const hole=holes[opening],dx=b.x-hole.x,dy=b.y-hole.y,d=Math.hypot(dx,dy);
  if(d<1e-12)return false;
  const gap=hole.r-d,rimHeight=field.sample(hole.x+hole.r*dx/d,hole.y+hole.r*dy/d).h,dz=Math.max(b.z-rimHeight,0),dist=Math.hypot(gap,dz);
  if(dist<b.r){
    const n={x:-gap*dx/d/dist,y:-gap*dy/d/dist,z:dz/dist},pen=b.r-dist;
    b.x+=n.x*(pen+1e-9);b.y+=n.y*(pen+1e-9);b.z+=n.z*(pen+1e-9);
    contactImpulse(b,n,rimProfile,{onContact,kind:'rim'});
  }
  return false;
}
function rollingLoss(b,normal,dt,p,granular,n){
  const twist=b.wx*n.x+b.wy*n.y+b.wz*n.z,wx=b.wx-twist*n.x,wy=b.wy-twist*n.y,wz=b.wz-twist*n.z;
  const omega=Math.hypot(wx,wy,wz),arm=p.b0+p.b1*omega*b.r+(granular?.rollingArm??0);
  if(omega>0){const f=Math.min(1,normal*arm*dt/(b.I*omega));b.wx-=wx*f;b.wy-=wy*f;b.wz-=wz*f;}
  const contactRadius=granular?.footprint??Math.cbrt(3*normal*b.r/(4*p.effectiveModulus));
  const spinDrop=Math.sign(twist)*Math.min(Math.abs(twist),(3*Math.PI/16)*p.muKinetic*normal*contactRadius*dt/b.I);
  b.wx-=n.x*spinDrop;b.wy-=n.y*spinDrop;b.wz-=n.z*spinDrop;
  if(granular){
    const vn=b.vx*n.x+b.vy*n.y+b.vz*n.z,vx=b.vx-vn*n.x,vy=b.vy-vn*n.y,vz=b.vz-vn*n.z,v=Math.hypot(vx,vy,vz);
    if(v){const force=granular.ploughCoefficient*normal+granular.inertialDrag*v*v,f=Math.min(1,force*dt/(b.m*v));b.vx-=vx*f;b.vy-=vy*f;b.vz-=vz*f;}
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
  const layout=options.layout??b.layout??layoutFor(b.material),goal=layout.goal;
  const openEdges=options.openEdges??b.openEdges;
  const walls=options.walls??(openEdges?layout.walls.filter(w=>w.kind!=='border'):layout.walls),holes=options.holes??layout.holes;
  const field=options.terrain===false?flatTerrain:options.terrain??layout.terrain,finiteFloor=options.bounds!==false;
  const wallProfile=options.wallProfile??WALL_CONTACTS[b.material][b.wallMaterial];
  const rimProfile=options.rimProfile??CONTACTS[b.material].wood;
  const g=gravity(tilt,options.maxTilt??MAX_TILT),measured=capAcceleration(options.acceleration??{x:0,y:0,z:0}),inertia=options.acceleration?.sourceGravity?alignAcceleration(measured,options.acceleration.sourceGravity,g):measured;
  g.x-=inertia.x;g.y-=inertia.y;g.z-=inertia.z;
  let remaining=dt;
  while(remaining>1e-12){
    // Adaptive displacement bound, with no artificial speed limit.
    const speed=Math.hypot(b.vx,b.vy,b.vz);
    const h=Math.min(remaining,1/960,b.r*.2/(speed+Math.hypot(g.x,g.y,g.z)*remaining+1e-9));remaining-=h;b.time+=h;
    const patch=options.patches===false?null:patchAt(b,layout),p=options.floorProfile??patchProfile(b,patch);b.contactSurface=patch??b.surface;
    const support=supportAt(b,field),n=support.n,gn=g.x*n.x+g.y*n.y+g.z*n.z;
    const load=normalAcceleration(b,support,g),vn=b.vx*n.x+b.vy*n.y+b.vz*n.z;
    const inside=!finiteFloor||(b.x>=0&&b.x<=layout.width&&b.y>=0&&b.y<=layout.height);
    const onFloor=inside&&support.gap<=2e-6&&Math.abs(vn)<.02&&openingAt(b.x,b.y,holes)<0&&load>0;
    const normal=onFloor?load*b.m:0;b.normalLoad=normal;b.groundHeight=support.h;
    const granular=options.granular===false?null:b.contactSurface==='sand'?granularState(b,normal/(b.m*G)):null;
    const resistanceRatio=(p.b0+(granular?.rollingArm??0))/b.r+(granular?.ploughCoefficient??0);
    const nearRest=Math.hypot(b.vx,b.vy,b.vz)<2e-5&&Math.hypot(b.wx,b.wy,b.wz)*b.r<2e-5;
    const held=onFloor&&nearRest&&Math.hypot(g.x-gn*n.x,g.y-gn*n.y,g.z-gn*n.z)<=load*Math.min(resistanceRatio,p.muStatic);
    const oldV={x:b.vx,y:b.vy,z:b.vz};
    if(held){b.vx=gn*n.x*h;b.vy=gn*n.y*h;b.vz=gn*n.z*h;b.wx=b.wy=b.wz=0;}
    else {b.vx+=g.x*h;b.vy+=g.y*h;b.vz+=g.z*h;}
    if(options.air!==false)airDrag(b,h);
    if(onFloor)rollingLoss(b,normal,h,p,granular,n);
    b.x+=(onFloor?b.vx:(oldV.x+b.vx)/2)*h;b.y+=(onFloor?b.vy:(oldV.y+b.vy)/2)*h;b.z+=(onFloor?b.vz:(oldV.z+b.vz)/2)*h;
    for(let i=0;i<3;i++){
      for(const wall of walls)resolveWall(b,wall,wallProfile,options.onContact,field);
      const supported=floorContact(b,holes,p,rimProfile,options.onContact,field,layout,finiteFloor,g);
      if(i===2)b.grounded=supported;
    }
    rotate(b,h);
    const opening=openingAt(b.x,b.y,holes);
    if(opening>=0){b.overHole=opening;if(b.z<field.sample(holes[opening].x,holes[opening].y).h-b.r)return{type:'fall',hole:opening};}
    else if(b.overHole!==null){b.skipped++;b.overHole=null;}
    const finalSupport=supportAt(b,field);b.supportGap=finalSupport.gap;b.groundHeight=finalSupport.h;
    if(b.grounded&&normalAcceleration(b,finalSupport,g)<=1e-9)b.grounded=false;
    const sn=finalSupport.n,u=contactVelocity(b,sn),un=u.x*sn.x+u.y*sn.y+u.z*sn.z;b.slip=Math.hypot(u.x-un*sn.x,u.y-un*sn.y,u.z-un*sn.z);
    b.regime=b.grounded?(Math.hypot(b.vx,b.vy)<2e-5&&Math.hypot(b.wx,b.wy)*b.r<2e-5?'rest':b.slip>.002?'sliding':'rolling'):'airborne';
    const inGoal=options.goal!==false&&b.grounded&&Math.hypot(b.x-goal.x,b.y-goal.y)<goal.r-b.r&&Math.hypot(b.vx,b.vy,b.vz)<.08;
    b.dwell=inGoal?b.dwell+h:0;if(b.dwell+1e-10>=GOAL_DWELL)return{type:'win'};
    if(b.x<-b.r||b.x>layout.width+b.r||b.y<-b.r||b.y>layout.height+b.r||((b.x<0||b.x>layout.width||b.y<0||b.y>layout.height)&&b.z<field.sample(clamp(b.x,0,layout.width),clamp(b.y,0,layout.height)).h-b.r)){if(options.bounds!==false)return{type:'escape'};}
  }
  return null;
}
export class FixedClock {
  constructor(){this.last=null;this.accumulator=0;this.cursor=null;}
  reset(){this.last=null;this.accumulator=0;this.cursor=null;}
  tick(now,running,step){
    if(this.last===null){this.last=now;this.cursor=now;return 0;}
    const elapsed=Math.min(.05,Math.max(0,(now-this.last)/1000));this.last=now;
    if(!running){this.accumulator=0;return 0;}
    this.accumulator+=elapsed;this.cursor=now-this.accumulator*1000;let count=0;
    while(this.accumulator+1e-12>=STEP&&count<12){this.accumulator=Math.max(0,this.accumulator-STEP);count++;this.cursor+=STEP*1000;if(step(STEP,this.cursor)===false){this.accumulator=0;break;}}
    return count;
  }
}
