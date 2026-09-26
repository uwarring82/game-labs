import {BOARD,MAZE} from './maze.js';
export const GOAL_DWELL=3;
export const TERRAIN_SPEC={gridStep:.0025,goalCurvatureRadius:3,goalDwell:GOAL_DWELL,maxAuthoredSlopeDegrees:15};
// Metres on the steel-sized board. Compact C2 caps leave holes and walls flat.
export const FEATURES=[
 {id:'hill',label:'RISE',x:.145,y:.127,rx:.045,ry:.026,height:.002},
 {id:'dip',label:'DIP',x:.147,y:.213,rx:.047,ry:.040,height:-.0036},
 {id:'lip',label:'LIP',x:.209,y:.424,rx:.025,ry:.025,height:.0021},
 {id:'goal',label:'HOLD 3s',x:MAZE.goal.x*BOARD.metresPerUnit,y:MAZE.goal.y*BOARD.metresPerUnit,rx:.030,ry:.030,height:.030**2/(6*TERRAIN_SPEC.goalCurvatureRadius)}
];
export const FLAT=Object.freeze({h:0,dx:0,dy:0,dxx:0,dxy:0,dyy:0});
export function cap(f,x,y){
 const u=(x-f.x)/f.rx,v=(y-f.y)/f.ry,q=1-u*u-v*v;if(q<=0)return FLAT;
 const a=f.height,qx=-2*u/f.rx,qy=-2*v/f.ry;
 return {h:a*q**3,dx:3*a*q*q*qx,dy:3*a*q*q*qy,dxx:6*a*q*qx*qx-6*a*q*q/f.rx**2,dxy:6*a*q*qx*qy,dyy:6*a*q*qy*qy-6*a*q*q/f.ry**2};
}
const M=[[1,0,0,0],[0,0,1,0],[-3,3,-2,-1],[2,-2,1,1]];
// Bicubic Hermite cells share height and both first derivatives at every edge.
// Gradient and Hessian are derivatives of the SAME interpolated potential.
export class Heightfield{
 constructor(fn,width=.3,height=19/30,step=TERRAIN_SPEC.gridStep){
  this.width=width;this.height=height;this.nx=Math.ceil(width/step);this.ny=Math.ceil(height/step);this.sx=width/this.nx;this.sy=height/this.ny;this.cells=new Map();
  const nodes=Array.from({length:this.ny+1},(_,j)=>Array.from({length:this.nx+1},(_,i)=>fn(i*this.sx,j*this.sy)));
  for(let j=0;j<this.ny;j++)for(let i=0;i<this.nx;i++){
   const a=nodes[j][i],b=nodes[j][i+1],c=nodes[j+1][i],d=nodes[j+1][i+1],sx=this.sx,sy=this.sy;
   const f=[[a.h,c.h,a.dy*sy,c.dy*sy],[b.h,d.h,b.dy*sy,d.dy*sy],[a.dx*sx,c.dx*sx,a.dxy*sx*sy,c.dxy*sx*sy],[b.dx*sx,d.dx*sx,b.dxy*sx*sy,d.dxy*sx*sy]];
   if(!f.some(row=>row.some(v=>v!==0)))continue;
   const coefficients=new Float64Array(16);
   for(let x=0;x<4;x++)for(let y=0;y<4;y++)for(let k=0;k<4;k++)for(let l=0;l<4;l++)coefficients[4*x+y]+=M[x][k]*f[k][l]*M[y][l];
   this.cells.set(j*this.nx+i,coefficients);
  }
 }
 sample(x,y){
  if(x<0||y<0||x>this.width||y>this.height)return FLAT;
  const i=Math.min(this.nx-1,Math.floor(x/this.sx)),j=Math.min(this.ny-1,Math.floor(y/this.sy)),c=this.cells.get(j*this.nx+i);if(!c)return FLAT;
  const u=x/this.sx-i,v=y/this.sy-j;
  let h=0,dx=0,dy=0,dxx=0,dxy=0,dyy=0;
  for(let k=3;k>=0;k--){const a=c[k*4],b=c[k*4+1],d=c[k*4+2],e=c[k*4+3],p=((e*v+d)*v+b)*v+a,pv=(3*e*v+2*d)*v+b;
   dxx=dxx*u+2*dx;dx=dx*u+h;h=h*u+p;dxy=dxy*u+dy;dy=dy*u+pv;dyy=dyy*u+6*e*v+2*d;
  }
  return {h,dx:dx/this.sx,dy:dy/this.sy,dxx:dxx/this.sx**2,dxy:dxy/(this.sx*this.sy),dyy:dyy/this.sy**2};
 }
}
let relief,goal;
export function terrainFor(scale=1){
 if(!relief){relief=new Heightfield((x,y)=>FEATURES.slice(0,3).reduce((s,f)=>{const p=cap(f,x,y);for(const k in s)s[k]+=p[k];return s;},{...FLAT}));goal=new Heightfield((x,y)=>cap(FEATURES[3],x,y));}
 return {sample(x,y){const a=relief.sample(x/scale,y/scale),b=goal.sample(x/scale,y/scale);
  // Geometric similarity for obstacles; fixed physical curvature for the goal.
  return {h:a.h*scale+b.h*scale**2,dx:a.dx+b.dx*scale,dy:a.dy+b.dy*scale,dxx:a.dxx/scale+b.dxx,dxy:a.dxy/scale+b.dxy,dyy:a.dyy/scale+b.dyy};
 }};
}
export const flatTerrain={sample:()=>FLAT};
export function surfaceNormal(p){const l=Math.hypot(p.dx,p.dy,1);return {x:-p.dx/l,y:-p.dy/l,z:1/l};}
// Closest point on a smooth heightfield, including the sphere's finite radius.
export function supportAt(b,field){
 let x=b.x,y=b.y,p=field.sample(x,y);
 for(let i=0;i<5;i++){
  const dz=p.h-b.z,fx=x-b.x+dz*p.dx,fy=y-b.y+dz*p.dy;
  if(Math.hypot(fx,fy)<1e-11)break;
  const a=1+p.dx*p.dx+dz*p.dxx,c=p.dx*p.dy+dz*p.dxy,d=1+p.dy*p.dy+dz*p.dyy,det=a*d-c*c;
  if(det<.05)break;
  x-=(d*fx-c*fy)/det;y-=(a*fy-c*fx)/det;p=field.sample(x,y);
 }
 const n=surfaceNormal(p),gap=(b.x-x)*n.x+(b.y-y)*n.y+(b.z-p.h)*n.z-b.r;
 return {x,y,...p,n,gap};
}
export function normalAcceleration(b,s,g){
 const {n,dx,dy,dxx,dxy,dyy}=s,l=Math.hypot(dx,dy,1),lx=(dx*dxx+dy*dxy)/l,ly=(dx*dxy+dy*dyy)/l;
 const nx={x:-dxx/l-n.x*lx/l,y:-dxy/l-n.y*lx/l,z:-n.z*lx/l};
 const ny={x:-dxy/l-n.x*ly/l,y:-dyy/l-n.y*ly/l,z:-n.z*ly/l};
 const a=1+b.r*nx.x,c=b.r*ny.x,d=b.r*nx.y,e=1+b.r*ny.y,det=a*e-c*d;
 const u=(e*b.vx-c*b.vy)/det,v=(a*b.vy-d*b.vx)/det;
 const curvature=-(b.vx*(nx.x*u+ny.x*v)+b.vy*(nx.y*u+ny.y*v)+b.vz*(nx.z*u+ny.z*v));
 return -(g.x*n.x+g.y*n.y+g.z*n.z)+curvature;
}
