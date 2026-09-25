import {G} from './materials.js';
export const MOTION_CAP=3*G;
const zero=()=>({x:0,y:0,z:0});
const wrap=x=>((x+540)%360)-180;
export function restingSpecificForce(beta,gamma){const b=beta*Math.PI/180,c=gamma*Math.PI/180;return{x:-G*Math.sin(c)*Math.cos(b),y:G*Math.sin(b),z:G*Math.cos(c)*Math.cos(b)};}
export function boardAcceleration(raw,beta,gamma,angle=0){
 const g=restingSpecificForce(beta,gamma),x=raw.x-g.x,y=-(raw.y-g.y),z=raw.z-g.z,t=angle*Math.PI/180;
 return{x:x*Math.cos(t)+y*Math.sin(t),y:-x*Math.sin(t)+y*Math.cos(t),z};
}
export function capAcceleration(a,cap=MOTION_CAP){const m=Math.hypot(a.x,a.y,a.z),s=m>cap?cap/m:1;return{x:a.x*s,y:a.y*s,z:a.z*s,capped:s<1};}
export class MotionInput{
 constructor(){this.poses=[];this.samples=[];this.rows=[];this.intervals=[];this.peak=[0,0,0];this.flat=[0,0,0];this.lastRaw=null;this.clipSuspected=false;this.lastStamp=null;this.last=zero();this.invalid=0;this.capCount=0;this.poseAge=0;}
 orientation(beta,gamma,time){if(![beta,gamma,time].every(Number.isFinite))return;this.poses.push({beta,gamma,time});if(this.poses.length>120)this.poses.shift();}
 poseAt(time){
  const p=this.poses;if(!p.length)return null;
  const right=p.findIndex(v=>v.time>=time);
  if(right>0){const a=p[right-1],b=p[right],f=(time-a.time)/(b.time-a.time||1);return{beta:a.beta+wrap(b.beta-a.beta)*f,gamma:a.gamma+wrap(b.gamma-a.gamma)*f,age:0};}
  const b=right===0?p[0]:p.at(-1),a=right===0?null:p.at(-2),age=Math.abs(time-b.time);

  const f=age<=40&&a&&b.time>a.time?Math.min(25,Math.max(0,time-b.time))/(b.time-a.time):0;
  return{beta:b.beta+(a?wrap(b.beta-a.beta)*f:0),gamma:b.gamma+(a?wrap(b.gamma-a.gamma)*f:0),age};
 }
 ingest(raw,time,angle=0){
  if(!raw||![raw.x,raw.y,raw.z,time].every(Number.isFinite)){this.invalid++;return null;}
  const pose=this.poseAt(time);if(!pose){this.invalid++;return null;}
  if(this.lastStamp!==null&&time<=this.lastStamp)return null;
  if(this.lastStamp!==null){this.intervals.push(time-this.lastStamp);if(this.intervals.length>180)this.intervals.shift();}
  const values=[raw.x,raw.y,raw.z];values.forEach((v,i)=>{this.peak[i]=Math.max(this.peak[i],Math.abs(v));this.flat[i]=this.lastRaw&&Math.abs(v)>1.5*G&&Math.abs(v-this.lastRaw[i])<.051?this.flat[i]+1:0;if(this.flat[i]>=3)this.clipSuspected=true;});
  this.lastRaw=values;this.lastStamp=time;this.poseAge=pose.age;
  const uncapped=boardAcceleration(raw,pose.beta,pose.gamma,angle),a=capAcceleration(uncapped);if(a.capped)this.capCount++;
  const sourceGravity=physicalGravity(pose.beta,pose.gamma,angle),s={time,...a,sourceGravity};this.last=s;this.samples.push(s);if(this.samples.length>1200)this.samples.shift();
  this.rows.push({time,raw:{x:raw.x,y:raw.y,z:raw.z},beta:pose.beta,gamma:pose.gamma,poseAge:pose.age,sourceGravity,uncapped,a:{x:a.x,y:a.y,z:a.z},capped:a.capped,clipSuspected:this.clipSuspected});if(this.rows.length>18000)this.rows.shift();return s;
 }
 at(time){const s=this.samples.findLast(s=>s.time<=time);return s&&time-s.time<=100?s:zero();}
 segments(start,end){const boundaries=[start,...this.samples.filter(s=>s.time>start&&s.time<end).map(s=>s.time),end],result=[];for(let i=1;i<boundaries.length;i++){const a=boundaries[i-1],b=boundaries[i],s=this.at(a);if(Number.isFinite(s.time)&&a<s.time+100&&b>s.time+100){result.push({dt:(s.time+100-a)/1000,a:s},{dt:(b-s.time-100)/1000,a:zero()});}else result.push({dt:(b-a)/1000,a:s});}return result;}
 clearRecording(){this.rows=[];this.intervals=[];this.peak=[0,0,0];this.flat=[0,0,0];this.lastRaw=null;this.lastStamp=null;this.clipSuspected=false;this.capCount=0;this.invalid=0;this.resetHold();}
 resetHold(){this.samples=[];this.last=zero();}
 get rate(){return this.intervals.length?1000/(this.intervals.reduce((a,b)=>a+b,0)/this.intervals.length):0;}
 report(){return{schema:'marble-relief-phone-test-v0.1',status:'unendorsed; device measurements only',sampleCount:this.rows.length,deliveredHz:this.rate,observedAbsoluteAxisPeaks:this.peak,hardwareRange:'not exposed by DeviceMotion; observed peaks are lower bounds',clipping:'suspected='+this.clipSuspected,cap: MOTION_CAP,capCount:this.capCount,invalid:this.invalid,samples:this.rows};}
}
// Deterministic acceleration fixture; not a gesture detector or player command.
export function flickAcceleration(t,speed=.4,liftTime=.15,stopTime=.03){
 if(t<0)return zero();if(t<liftTime)return{x:0,y:0,z:speed*Math.PI/(2*liftTime)*Math.sin(Math.PI*t/liftTime)};
 if(t<liftTime+stopTime)return{x:0,y:0,z:-speed/stopTime};return zero();
}
// Minimal yaw-free rotation between physical and calibrated virtual gravity.
// Applying the same orthogonal map to linear acceleration preserves free fall.
export function alignAcceleration(a,from,to){
 const fm=Math.hypot(from.x,from.y,from.z),tm=Math.hypot(to.x,to.y,to.z);if(!fm||!tm)return a;
 const u={x:from.x/fm,y:from.y/fm,z:from.z/fm},v={x:to.x/tm,y:to.y/tm,z:to.z/tm},c=u.x*v.x+u.y*v.y+u.z*v.z;
 const k={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x};
 const cross=(p,q)=>({x:p.y*q.z-p.z*q.y,y:p.z*q.x-p.x*q.z,z:p.x*q.y-p.y*q.x});
 if(c<-.999999){let axis=Math.abs(u.x)<.8?cross(u,{x:1,y:0,z:0}):cross(u,{x:0,y:1,z:0}),n=Math.hypot(axis.x,axis.y,axis.z);axis={x:axis.x/n,y:axis.y/n,z:axis.z/n};const d=axis.x*a.x+axis.y*a.y+axis.z*a.z;return{x:2*d*axis.x-a.x,y:2*d*axis.y-a.y,z:2*d*axis.z-a.z};}
 const ka=cross(k,a),kka=cross(k,ka),f=1/(1+c);return{x:a.x+ka.x+kka.x*f,y:a.y+ka.y+kka.y*f,z:a.z+ka.z+kka.z*f};
}
export function physicalGravity(beta,gamma,angle=0){const p=restingSpecificForce(beta,gamma),t=angle*Math.PI/180,x=-p.x,y=p.y;return{x:x*Math.cos(t)+y*Math.sin(t),y:-x*Math.sin(t)+y*Math.cos(t),z:-p.z};}
