import {Heightfield,FLAT} from './terrain.js';
import {RELIEF_SEED} from './relief-config.js';
export const RELIEF={width:.3,height:19/30,radius:.005,tiltBudget:8,goalTime:.7,seed:RELIEF_SEED,grid:.0025};
export function random(seed){let a=seed>>>0;return()=>{a=(1664525*a+1013904223)>>>0;return a/4294967296;};}
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*t*(10+t*(-15+6*t));};
export function numericalField(fn){const e=.000025;return(x,y)=>{const h=fn(x,y),xp=fn(x+e,y),xm=fn(x-e,y),yp=fn(x,y+e),ym=fn(x,y-e);return{h,dx:(xp-xm)/(2*e),dy:(yp-ym)/(2*e),dxx:(xp-2*h+xm)/e**2,dyy:(yp-2*h+ym)/e**2,dxy:(fn(x+e,y+e)-fn(x+e,y-e)-fn(x-e,y+e)+fn(x-e,y-e))/(4*e*e)};};}
function gaussian(f,x,y){const c=Math.cos(f.angle),s=Math.sin(f.angle),dx=x-f.x,dy=y-f.y,u=(c*dx+s*dy)/f.a,v=(-s*dx+c*dy)/f.b;return f.height*Math.exp(-.5*(u*u+v*v));}
function compact(x,y,cx,cy,rx,ry){const q=1-((x-cx)/rx)**2-((y-cy)/ry)**2;return q>0?q**3:0;}
export function makeLandscape(seed=RELIEF.seed){
 const rng=random(seed),j=()=>rng()-.5;
 const gaussians=[
  {x:.102,y:.185,a:.068,b:.032,height:-.009,angle:.35},
  {x:.153,y:.263,a:.067,b:.031,height:-.008,angle:-.35},
  {x:.217,y:.158,a:.075,b:.031,height:.009,angle:1.0},
  {x:.131,y:.329,a:.080,b:.035,height:.007,angle:-.25},
  {x:.074,y:.445,a:.077,b:.033,height:.005,angle:.8},
  {x:.229,y:.565,a:.105,b:.070,height:.015,angle:0}
 ].map(f=>({...f,x:f.x+j()*.004,y:f.y+j()*.004,angle:f.angle+j()*.15}));
 const start={x:.041,y:2/30},goal={x:.235,y:.568,r:.015},pocket={x:.108,y:.401,rx:.050,ry:.032},pothole={x:.186,y:.505,rx:.045,ry:.030};
 const phase=rng()*Math.PI*2;
 const raw=(x,y)=>gaussians.reduce((h,f)=>h+gaussian(f,x,y),0)+.00016*Math.sin(22*x+.25*Math.sin(18*y)+phase)*Math.cos(18*y+.3*Math.sin(15*x));
 const ground=(x,y)=>raw(x,y)-gaussian({x:pothole.x,y:pothole.y,a:.050,b:.033,height:.011,angle:-.12},x,y)+.0040*compact(x,y,.242,.352,.042,.024);
 const centre=ground(goal.x,goal.y),rc=9.81*RELIEF.goalTime**2/1.4-RELIEF.radius;
 function height(x,y){
  const d=Math.hypot(x-goal.x,y-goal.y),blend=1-smooth((d-.018)/.065);
  let h=ground(x,y)*(1-blend)+(centre-d*d/(2*rc))*blend;
  const shelf=1-smooth((Math.hypot(x-start.x,y-start.y)-.018)/.045);return h*(1-shelf);
 }
 let gain=1,field;
 // Construction projects amplitude into geometric bounds; validation still rejects
 // candidates that fail route/trap/drainage tests. No runtime force is retuned.
 for(let pass=0;pass<4;pass++){
  const adjusted=(x,y)=>{const d=Math.hypot(x-goal.x,y-goal.y),blend=1-smooth((d-.018)/.065);return gain*height(x,y)-(1-gain)*d*d/(2*rc)*blend-gaussian({x:pocket.x,y:pocket.y,a:.060,b:.040,height:.014,angle:Math.PI/2+.08},x,y)*(1-blend);};
  field=new Heightfield(numericalField(adjusted),RELIEF.width,RELIEF.height,RELIEF.grid);
  let maxSlope=0,maxCrest=0;
  for(let x=.005;x<.296;x+=.004)for(let y=.005;y<RELIEF.height-.005;y+=.004){const p=field.sample(x,y);maxSlope=Math.max(maxSlope,Math.hypot(p.dx,p.dy));if(Math.hypot((x-.242)/.042,(y-.352)/.024)>1.05)maxCrest=Math.max(maxCrest,-(p.dxx+p.dyy)/2+Math.hypot((p.dxx-p.dyy)/2,p.dxy));}
  const f=Math.min(1,Math.tan(14.6*Math.PI/180)/maxSlope,9.65/maxCrest);if(f>=.999)break;gain*=f;
 }
 return{seed,field,gaussians,start,goal,pocket,pothole,lip:{x:.242,y:.352,rx:.042,ry:.024},goalRadius:rc,heightGain:gain};
}
function refineCritical(field,x,y){
 for(let k=0;k<40;k++){const p=field.sample(x,y),det=p.dxx*p.dyy-p.dxy*p.dxy;if(Math.abs(det)<1e-8)return null;let dx=(p.dyy*p.dx-p.dxy*p.dy)/det,dy=(p.dxx*p.dy-p.dxy*p.dx)/det;const m=Math.hypot(dx,dy),f=m>.008?.008/m:1;x-=dx*f;y-=dy*f;if(x<.017||x>.283||y<.025||y>RELIEF.height-.025)return null;if(Math.hypot(dx,dy)<1e-8){const p=field.sample(x,y);return{x,y,h:p.h,type:p.dxx*p.dyy-p.dxy*p.dxy<0?'saddle':p.dxx>0?'minimum':'maximum',gradient:Math.hypot(p.dx,p.dy)};}}
 return null;
}
export function criticalPoints(field){const result=[];for(let x=.025;x<.29;x+=.015)for(let y=.04;y<.61;y+=.018){const p=refineCritical(field,x,y);if(p&&Math.max(Math.abs(field.sample(p.x,p.y).dxx),Math.abs(field.sample(p.x,p.y).dyy))>.015&&!result.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<.008))result.push(p);}return result.sort((a,b)=>a.y-b.y);}
export function traceDrainage(field,x,y){
 for(let i=0;i<2000;i++){const p=field.sample(x,y),m=Math.hypot(p.dx,p.dy);if(m<1e-6)break;const step=Math.min(.002,m*.015);x-=p.dx/m*step;y-=p.dy/m*step;if(x<.008||x>.292||y<.008||y>RELIEF.height-.008)return{boundary:true,x,y};}
 return{x,y,h:field.sample(x,y).h,boundary:false};
}
export function drainageMap(land){
 const {field,pocket,pothole}=land,excluded=p=>Math.hypot(p.x-land.start.x,p.y-land.start.y)<.066||[pocket,pothole].some(q=>Math.hypot((p.x-q.x)/q.rx,(p.y-q.y)/q.ry)<1);
 const points=criticalPoints(field),basins=points.filter(p=>p.type==='minimum'&&!excluded(p));
 const releases=[];for(let x=.02;x<.29;x+=.02)for(let y=.04;y<.60;y+=.025){const p=traceDrainage(field,x,y);let basin=-1,best=.014;basins.forEach((q,i)=>{const d=Math.hypot(p.x-q.x,p.y-q.y);if(d<best){basin=i;best=d;}});releases.push({start:{x,y},end:p,basin});}
 return{basins,critical:points,releases,method:'gradient-flow topology; rigid-body releases are checked separately',exceptions:['undrained pocket','undrained sandy pothole']};
}
function poly(points,height,kind='wall'){return{points,height,kind};}
export function levelFromLandscape(land,withDrainage=true){
 const drainage=withDrainage?drainageMap(land):{basins:[],critical:[],releases:[]};
 const {width:w,height:h,radius:r}=RELIEF;
 const walls=[poly([[.003,.003],[w-.003,.003]],6*r,'border'),poly([[w-.003,.003],[w-.003,h-.003]],6*r,'border'),poly([[w-.003,h-.003],[.003,h-.003]],6*r,'border'),poly([[.003,h-.003],[.003,.003]],6*r,'border'),
  poly([[.003,.363],[.070,.366],[.130,.363],[.174,.365],[.198,.370],[.223,.372],[.249,.370],[.277,.363],[.297,.359]],2*r,'low'),
  poly([[.127,.361],[.105,.359],[.087,.369],[.078,.396],[.087,.425],[.106,.443],[.124,.436]],6*r,'pocket')];
 const patches=[{kind:'sand',x:land.pothole.x,y:land.pothole.y,rx:land.pothole.rx*.76,ry:land.pothole.ry*.76},{kind:'resin',x:.085,y:.465,rx:.024,ry:.018}];
 const holes=drainage.basins.map(p=>({x:p.x,y:p.y,r:1.65*r,z:land.field.sample(p.x,p.y).h}));
 const route=[{x:.274,y:.055},{x:.213,y:.095},{x:.266,y:.209},{x:.262,y:.288},{x:.217,y:.334},{x:.242,y:.345,jump:true,speed:.55},{x:.277,y:.406,speed:.40},{x:.258,y:.456},{x:.234+.012*(land.seed%7)/6,y:.528,speed:.40},{x:land.goal.x,y:land.goal.y}];
 return{...land,width:w,height:h,scale:1,terrain:land.field,walls,patches,holes,route,jumpSpots:[{x:.244,y:.358,rx:.041,ry:.020}],drainage,name:'Saddle and Basin',status:'DRAFT — phone acceptance pending'};
}
let selected;
export function reliefLevel(){return selected??=(levelFromLandscape(makeLandscape()));}
const adjustedFields=new WeakMap();
export function scaledLevel(base,scale,k=.4,r=RELIEF.radius*scale){
 const targetRc=9.81*RELIEF.goalTime**2/(1+k)-r,delta=scale/targetRc-1/base.goalRadius;
 const correction=numericalField((x,y)=>{const d=Math.hypot(x-base.goal.x,y-base.goal.y);return-.5*delta*d*d*(1-smooth((d-.018)/.065));});
 let cache=adjustedFields.get(base);if(!cache){cache=new Map();adjustedFields.set(base,cache);}const key=scale+'/'+k;
 let adjusted=cache.get(key);if(!adjusted)adjusted=Math.abs(delta)<1e-12?base.field:new Heightfield((x,y)=>{const p=base.field.sample(x,y),q=correction(x,y);return{h:p.h+q.h,dx:p.dx+q.dx,dy:p.dy+q.dy,dxy:p.dxy+q.dxy};},base.width,base.height,RELIEF.grid);
 cache.set(key,adjusted);
 const field={sample(x,y){const p=adjusted.sample(x/scale,y/scale);return{h:p.h*scale,dx:p.dx,dy:p.dy,dxx:p.dxx/scale,dxy:p.dxy/scale,dyy:p.dyy/scale};}};
 const obj=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,typeof v==='number'?v*scale:v]));
 return{...base,scale,width:base.width*scale,height:base.height*scale,start:obj(base.start),goal:obj(base.goal),terrain:field,walls:base.walls.map(w=>({...w,height:w.height*scale,points:w.points.map(p=>p.map(v=>v*scale))})),holes:base.holes.map(obj),jumpSpots:base.jumpSpots.map(obj),patches:base.patches.map(obj),route:base.route.map(p=>({...p,x:p.x*scale,y:p.y*scale,speed:p.speed? p.speed*Math.sqrt(scale):undefined}))};
}
