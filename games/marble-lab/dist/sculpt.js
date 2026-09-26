import {Heightfield,FLAT} from './terrain.js';
import {RELIEF} from './landscape.js';
import {movableWalls,posedWall,wallProblem,wrapAngle,isIdentity} from './walls.js';
// Sculpt v0.1: player edits on top of the validated relief. Edits are node deltas
// on the level's own Hermite grid, so the edited board is still one C1 potential
// whose gradient and Hessian feed the unchanged contact model.
// Saved strokes replay without re-projection: bump the version whenever the brush,
// bounds, keep-outs or relief change, so older saves are not replayed onto them.
export const SCULPT_VERSION=1;
export const SCULPT=Object.freeze({
 slope:.2604804893164023, // tan 14.6°, Relief's generator slope bound (a literal: replay uses no engine-approximated Math)
 crest:20,    // 1/m; Relief uses 9.65. A level crest keeps a 5 mm ball in contact up to ~0.73 m/s.
 concave:50,  // 1/m; r*kappa <= 0.25 at nominal size, 0.4 at the largest (1.6x); supportAt was checked at 0.5 (one geometry)
 tick:.05,    // s of stroke time per brush application
 rate:.5,     // share of the flat-ground limit deposited per second of hold
 spacing:1/8, // stamp spacing along a drag, as a share of the brush radius
 grid:.0005,  // stroke points are stored on a 0.5 mm grid
 sizes:Object.freeze({S:.04,M:.06,L:.09}) // brush radius R in base (steel) coordinates
});
// Compact Mexican hat, C2 at its rim, zero net volume: h=-a(1-5s)(1-s)^3, s=rho^2/R^2.
// a>0 digs: a dip inside 0.447R and a berm peaking at 0.632R with 0.216a. a<0 piles.
export function clay(x,y,cx,cy,R,a){
 const ex=x-cx,ey=y-cy,R2=R*R,s=(ex*ex+ey*ey)/R2;if(s>=1)return FLAT;
 const t=1-s,f1=a*t*t*(8-20*s),f2=a*t*(60*s-36),sx=2*ex/R2,sy=2*ey/R2;
 return{h:-a*(1-5*s)*t*t*t,dx:f1*sx,dy:f1*sy,dxy:f2*sx*sy};
}
// Largest slope and curvatures of a unit-amplitude, unit-radius dig. Radial profile:
// Hessian eigenvalues are F''(rho) and F'(rho)/rho.
const UNIT=(()=>{let slope=0,convex=0,concave=0;
 for(let k=0;k<4000;k++){const r=k/4000,s=r*r,t=1-s,f1=t*t*(8-20*s),f2=t*(60*s-36),a=f2*4*s+2*f1,b=2*f1;
  slope=Math.max(slope,Math.abs(f1*2*r));convex=Math.max(convex,-a,-b);concave=Math.max(concave,a,b);}
 return{slope,convex,concave};})();
// Flat-ground depth limit of one press (dig) or pull (pile) of radius R.
export function flatLimit(R,tool){const [crest,hollow]=tool==='pile'?[UNIT.concave,UNIT.convex]:[UNIT.convex,UNIT.concave];
 return Math.min(SCULPT.slope*R/UNIT.slope,SCULPT.crest*R*R/crest,SCULPT.concave*R*R/hollow);}
// Edits fade to exactly zero, with zero slope and curvature, at the start shelf, the
// hole rims and the goal. The goal zone covers the whole 83 mm blend in which
// scaledLevel adds a per-ball curvature correction (landscape.js), plus one cell
// diagonal, so bounds checked on the steel field hold for every ball.
const GOAL_BLEND=.018+.065,CELL_DIAGONAL=.0036;
// Each fade is 30 mm wide: a steeper mask would itself use up the slope and curvature
// budget and block brushes well outside the ring.
const FADE=.03;
export function keepOuts(level){return[{x:level.start.x,y:level.start.y,r0:.025,r1:.025+FADE},{x:level.goal.x,y:level.goal.y,r0:GOAL_BLEND+CELL_DIAGONAL,r1:GOAL_BLEND+CELL_DIAGONAL+FADE},...level.holes.map(h=>({x:h.x,y:h.y,r0:h.r+.004,r1:h.r+.004+FADE}))];}
function zone(z,x,y){
 const ex=x-z.x,ey=y-z.y,d=Math.sqrt(ex*ex+ey*ey),w=z.r1-z.r0,t=(d-z.r0)/w;
 if(t<=0)return[0,0,0,0];if(t>=1)return null;
 const g1=30*t*t*(1-t)*(1-t)/w,g2=60*t*(1-t)*(1-2*t)/(w*w),nx=ex/d,ny=ey/d;
 return[t*t*t*(10+t*(-15+6*t)),g1*nx,g1*ny,(g2-g1/d)*nx*ny];
}
// A Heightfield whose nodes are kept, so cells can be recomputed locally.
export class EditField extends Heightfield{
 constructor(width,height,step){super(()=>FLAT,width,height,step);this.nodes=new Float64Array(4*(this.nx+1)*(this.ny+1));}
 add(delta,alpha=1,refresh=true){
  const {i0,j0,i1,j1,v}=delta,w=i1-i0+1,N=this.nodes,stride=this.nx+1;
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const a=4*((j-j0)*w+i-i0),b=4*(j*stride+i);for(let k=0;k<4;k++)N[b+k]+=alpha*v[a+k];}
  if(refresh)this.refresh(i0-1,j0-1,i1,j1);
 }
 // Same coefficients as hermiteCell (up to rounding), unrolled for the edit layer.
 refresh(i0,j0,i1,j1){
  i0=Math.max(0,i0);j0=Math.max(0,j0);i1=Math.min(this.nx-1,i1);j1=Math.min(this.ny-1,j1);
  const N=this.nodes,stride=4*(this.nx+1),sx=this.sx,sy=this.sy,sxy=sx*sy,F=new Float64Array(16),G=new Float64Array(16);
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
   const a=4*(j*(this.nx+1)+i),b=a+4,c=a+stride,d=c+4,key=j*this.nx+i;
   F[0]=N[a];F[1]=N[c];F[2]=N[a+2]*sy;F[3]=N[c+2]*sy;F[4]=N[b];F[5]=N[d];F[6]=N[b+2]*sy;F[7]=N[d+2]*sy;
   F[8]=N[a+1]*sx;F[9]=N[c+1]*sx;F[10]=N[a+3]*sxy;F[11]=N[c+3]*sxy;F[12]=N[b+1]*sx;F[13]=N[d+1]*sx;F[14]=N[b+3]*sxy;F[15]=N[d+3]*sxy;
   if(F.every(v=>v===0)){this.cells.delete(key);continue;}
   for(let l=0;l<4;l++){const f0=F[l],f1=F[4+l],f2=F[8+l],f3=F[12+l];G[l]=f0;G[4+l]=f2;G[8+l]=-3*f0+3*f1-2*f2-f3;G[12+l]=2*f0-2*f1+f2+f3;}
   const C=new Float64Array(16);
   for(let x=0;x<16;x+=4){const g0=G[x],g1=G[x+1],g2=G[x+2],g3=G[x+3];C[x]=g0;C[x+1]=g2;C[x+2]=-3*g0+3*g1-2*g2-g3;C[x+3]=2*g0-2*g1+g2+g3;}
   this.cells.set(key,C);
  }
 }
 clear(){this.nodes.fill(0);this.cells.clear();}
}
// Slope and Hessian of one cell polynomial (as Heightfield.sampleCell), written into out.
function derivatives(c,u,v,sx,sy,out,o){
 let h=0,dx=0,dy=0,dxx=0,dxy=0,dyy=0;
 for(let k=3;k>=0;k--){const a=c[k*4],b=c[k*4+1],d=c[k*4+2],e=c[k*4+3],p=((e*v+d)*v+b)*v+a,pv=(3*e*v+2*d)*v+b;
  dxx=dxx*u+2*dx;dx=dx*u+h;h=h*u+p;dxy=dxy*u+dy;dy=dy*u+pv;dyy=dyy*u+6*e*v+2*d;}
 out[o]=dx/sx;out[o+1]=dy/sy;out[o+2]=dxx/sx**2;out[o+3]=dxy/(sx*sy);out[o+4]=dyy/sy**2;
}
const psd=(a,b,c,e=1e-9)=>a>=-e&&c>=-e&&a*c-b*b>=-e*(Math.abs(a)+Math.abs(c)+e);
// Largest share alpha of an increment that keeps every sample within the bounds, or no
// worse than it already was where the relief itself exceeds them (the lip crest).
function feasible(P,o,alpha){
 const gx=P[o]+alpha*P[o+5],gy=P[o+1]+alpha*P[o+6],xx=P[o+2]+alpha*P[o+7],xy=P[o+3]+alpha*P[o+8],yy=P[o+4]+alpha*P[o+9];
 return gx*gx+gy*gy<=P[o+10]*(1+1e-12)&&psd(xx+P[o+11],xy,yy+P[o+11])&&psd(P[o+12]-xx,-xy,P[o+12]-yy);
}
export class Sculptor{
 // bounds override slope/crest/concave (tests use it to reach the hollow bound, which the
 // brush alone never reaches: its hollow-to-crest curvature ratio is at most 16/13.16).
 constructor(level,bounds={}){
  const f=level.field;this.level=level;this.bounds={slope:SCULPT.slope,crest:SCULPT.crest,concave:SCULPT.concave,...bounds};this.edits=new EditField(f.width,f.height,RELIEF.grid);this.scratch=new EditField(f.width,f.height,RELIEF.grid);
  if(this.edits.nx!==f.nx||this.edits.ny!==f.ny)throw Error('Edit grid must match the relief grid');
  this.zones=keepOuts(level);this.mask=new Float64Array(4*(f.nx+1)*(f.ny+1));
  for(let j=0;j<=f.ny;j++)for(let i=0;i<=f.nx;i++){let m=[1,0,0,0];
   for(const z of this.zones){const g=zone(z,i*f.sx,j*f.sy);if(g)m=[m[0]*g[0],m[1]*g[0]+m[0]*g[1],m[2]*g[0]+m[0]*g[2],m[3]*g[0]+m[1]*g[2]+m[2]*g[1]+m[0]*g[3]];}
   this.mask.set(m,4*(j*(f.nx+1)+i));}
  // history holds strokes and wall moves in the order made, for undo.
  this.strokes=[];this.poses=new Map();this.history=[];this.stash=null;this.stroke=null;this.version=0;this.wallVersion=0;this.lastAlpha=1;
  level.edits=this.edits;
 }
 get edited(){return this.strokes.length>0||this.poses.size>0;}
 get canUndo(){return this.history.length>0||!!this.stash;}
 // The level to play: the relief itself until a wall moves, then a copy with the moved
 // walls (a new object per wall change, so layout caches stay valid).
 currentLevel(){
  if(!this.poses.size)return this.level;
  if(this.levelVersion!==this.wallVersion){this.levelVersion=this.wallVersion;this.posedLevel=this.withWalls(this.poses);}
  return this.posedLevel;
 }
 withWalls(poses){return{...this.level,walls:this.level.walls.map((w,i)=>posedWall(w,poses.get(i)))};}
 // Checks a pose for one wall. Returns the level it would give, or the reason it is refused.
 tryWall(index,pose){
  if(!movableWalls(this.level).includes(index))return{ok:false,reason:'The border stays.'};
  const poses=new Map(this.poses);if(isIdentity(pose))poses.delete(index);else poses.set(index,pose);const level=this.withWalls(poses),reason=wallProblem(this.level,level.walls);
  return reason?{ok:false,reason}:{ok:true,level};
 }
 // A pose equal to the current one is no move; the authored pose removes the entry, so
 // the level is the relief itself again.
 moveWall(index,pose){
  const current=this.poses.get(index)??{dx:0,dy:0,a:0};
  if(pose.dx===current.dx&&pose.dy===current.dy&&pose.a===current.a||!this.tryWall(index,pose).ok)return false;
  this.history.push({wall:index,before:this.poses.get(index)??null});
  if(isIdentity(pose))this.poses.delete(index);else this.poses.set(index,pose);this.stash=null;this.wallVersion++;return true;
 }
 quantize(x,y){const f=this.level.field,g=SCULPT.grid;return[Math.round(Math.min(f.width,Math.max(0,x))/g),Math.round(Math.min(f.height,Math.max(0,y))/g)];}
 begin(tool,size,x,y){if(this.stroke)this.end();this.stroke={tool,size,ticks:[]};this.cursor=this.quantize(x,y);this.path=[];this.lastAlpha=1;}
 move(x,y){if(!this.stroke)return;const q=this.quantize(x,y),p=this.path.at(-1)??this.cursor,dx=q[0]-p[0],dy=q[1]-p[1];if(Math.sqrt(dx*dx+dy*dy)*SCULPT.grid>=.002)this.path.push(q);}
 // One brush application over the path since the last tick. Returns the dirty
 // rectangle in base coordinates, or null.
 tick(){
  const s=this.stroke;if(!s)return null;
  const record=[...this.cursor,...this.path.flat()];this.cursor=this.path.at(-1)??this.cursor;this.path=[];
  const delta=this.deltaFor(s,record);if(!delta)return null;
  const alpha=this.project(delta);this.lastAlpha=alpha;
  if(!(alpha>0))return null;
  this.edits.add(delta,alpha);s.ticks.push([alpha,...record]);this.version++;
  return this.rect(delta);
 }
 end(){const s=this.stroke;this.stroke=null;if(!s?.ticks.length)return false;this.strokes.push(s);this.history.push({stroke:true});this.stash=null;return true;}
 undo(){
  if(this.stroke)this.end();const h=this.history.pop();
  if(!h){if(!this.stash)return false;({strokes:this.strokes,poses:this.poses,history:this.history}=this.stash);this.stash=null;this.wallVersion++;this.replay();return true;}
  if(h.stroke){this.strokes.pop();this.replay();}else{if(h.before)this.poses.set(h.wall,h.before);else this.poses.delete(h.wall);this.wallVersion++;}
  return true;
 }
 reset(){if(this.stroke)this.end();if(!this.edited)return false;this.stash={strokes:this.strokes,poses:this.poses,history:this.history};this.strokes=[];this.poses=new Map();this.history=[];this.wallVersion++;this.replay();return true;}
 amount(s){return(s.tool==='pile'?-1:1)*SCULPT.rate*SCULPT.tick*flatLimit(SCULPT.sizes[s.size],s.tool);}
 // Stamps spaced at most R/8 along the recorded polyline share one tick's deposit,
 // so a slow drag ploughs deeper than a fast one.
 deltaFor(s,record){
  const R=SCULPT.sizes[s.size],g=SCULPT.grid,p=[];for(let k=0;k<record.length;k+=2)p.push([record[k]*g,record[k+1]*g]);
  const lengths=p.slice(1).map((q,k)=>{const dx=q[0]-p[k][0],dy=q[1]-p[k][1];return Math.sqrt(dx*dx+dy*dy);}),total=lengths.reduce((a,b)=>a+b,0),stamps=[];
  if(!(total>0))stamps.push(p[0]);
  else{const n=Math.ceil(total/(R*SCULPT.spacing));let k=0,done=0;
   for(let m=1;m<=n;m++){const target=total*m/n;while(k<lengths.length-1&&done+lengths[k]<target){done+=lengths[k];k++;}const t=lengths[k]?Math.min(1,(target-done)/lengths[k]):1;stamps.push([p[k][0]+t*(p[k+1][0]-p[k][0]),p[k][1]+t*(p[k+1][1]-p[k][1])]);}}
  return this.brush(stamps,R,this.amount(s)/stamps.length);
 }
 // Node deltas of clay stamps, mirrored across the board edges (zero net volume and
 // zero normal slope at an edge) and faded by the keep-out mask.
 brush(stamps,R,a){
  const f=this.level.field,W=f.width,H=f.height,images=[];
  for(const [x,y] of stamps)for(const ix of [x,...(x<R?[-x]:[]),...(W-x<R?[2*W-x]:[])])for(const iy of [y,...(y<R?[-y]:[]),...(H-y<R?[2*H-y]:[])])images.push([ix,iy]);
  let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;for(const [x,y] of stamps){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  const i0=Math.max(0,Math.floor((x0-R)/f.sx)),i1=Math.min(f.nx,Math.ceil((x1+R)/f.sx)),j0=Math.max(0,Math.floor((y0-R)/f.sy)),j1=Math.min(f.ny,Math.ceil((y1+R)/f.sy));
  const w=i1-i0+1,v=new Float64Array(4*w*(j1-j0+1)),M=this.mask,stride=f.nx+1;let any=false;
  // Each image visits only the nodes within R of it; every node still sums its images
  // in the same order, so live ticks and replays stay bit-identical.
  for(const [cx,cy] of images){
   const a0=Math.max(i0,Math.floor((cx-R)/f.sx)),a1=Math.min(i1,Math.ceil((cx+R)/f.sx)),b0=Math.max(j0,Math.floor((cy-R)/f.sy)),b1=Math.min(j1,Math.ceil((cy+R)/f.sy));
   for(let j=b0;j<=b1;j++)for(let i=a0;i<=a1;i++){const k=clay(i*f.sx,j*f.sy,cx,cy,R,a);if(k===FLAT)continue;const o=4*((j-j0)*w+i-i0);v[o]+=k.h;v[o+1]+=k.dx;v[o+2]+=k.dy;v[o+3]+=k.dxy;}
  }
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
   const o=4*((j-j0)*w+i-i0),h=v[o],dx=v[o+1],dy=v[o+2],dxy=v[o+3];if(!h&&!dx&&!dy&&!dxy)continue;
   const m=4*(j*stride+i);
   v[o]=M[m]*h;v[o+1]=M[m+1]*h+M[m]*dx;v[o+2]=M[m+2]*h+M[m]*dy;v[o+3]=M[m+3]*h+M[m+1]*dy+M[m+2]*dx+M[m]*dxy;
   if(v[o]||v[o+1]||v[o+2]||v[o+3])any=true;
  }
  return any?{i0,j0,i1,j1,v}:null;
 }
 // Samples every changed cell's own polynomial at 3x3 points, edges included; base
 // and edit coefficients are summed first (the interpolant is linear in them).
 project(delta){
  const sc=this.scratch,base=this.level.field,ed=this.edits,{slope,crest,concave}=this.bounds,S2=slope*slope,sx=sc.sx,sy=sc.sy;sc.clear();sc.add(delta);
  const P=new Float64Array(sc.cells.size*9*13),sum=new Float64Array(16);let n=0;
  for(const [key,dc] of sc.cells){const bc=base.cells.get(key),ec=ed.cells.get(key);for(let k=0;k<16;k++)sum[k]=(bc?bc[k]:0)+(ec?ec[k]:0);
   for(const u of [0,.5,1])for(const v of [0,.5,1]){
    derivatives(dc,u,v,sx,sy,P,n+5);if(!P[n+5]&&!P[n+6]&&!P[n+7]&&!P[n+8]&&!P[n+9])continue;
    derivatives(sum,u,v,sx,sy,P,n);const gx=P[n],gy=P[n+1],xx=P[n+2],xy=P[n+3],yy=P[n+4],mid=(xx+yy)/2,rad=Math.sqrt(((xx-yy)/2)**2+xy*xy);
    P[n+10]=Math.max(S2,gx*gx+gy*gy);P[n+11]=Math.max(crest,rad-mid);P[n+12]=Math.max(concave,mid+rad);n+=13;
   }}
  let alpha=1;
  for(let o=0;o<n;o+=13){if(feasible(P,o,alpha))continue;let lo=0,hi=alpha;for(let k=0;k<24;k++){const m=(lo+hi)/2;if(feasible(P,o,m))lo=m;else hi=m;}alpha=lo;if(alpha<1e-4)return 0;}
  return alpha;
 }
 rect(delta){const f=this.level.field;return{x0:delta.i0*f.sx,y0:delta.j0*f.sy,x1:delta.i1*f.sx,y1:delta.j1*f.sy};}
 // Rebuilds the edit layer from the stroke list, bit for bit as it was made.
 replay(){
  this.edits.clear();let i0=Infinity,j0=Infinity,i1=-1,j1=-1;
  for(const s of this.strokes)for(const t of s.ticks){const d=this.deltaFor(s,t.slice(1));if(!d)continue;this.edits.add(d,t[0],false);i0=Math.min(i0,d.i0);j0=Math.min(j0,d.j0);i1=Math.max(i1,d.i1);j1=Math.max(j1,d.j1);}
  if(i1>=0)this.edits.refresh(i0-1,j0-1,i1,j1);this.version++;
 }
 // Strokes and wall poses are saved separately: stage 07 shares the strokes key and knows
 // nothing of walls, so it must never see (or rewrite away) the poses.
 save(){return{v:SCULPT_VERSION,seed:this.level.seed,strokes:this.strokes};}
 saveWalls(){return{v:1,seed:this.level.seed,walls:Object.fromEntries([...this.poses].map(([i,p])=>[i,[p.dx,p.dy,p.a]]))};}
 load(data){
  const f=this.level.field,g=SCULPT.grid,maxX=Math.round(f.width/g),maxY=Math.round(f.height/g);
  const ok=data?.v===SCULPT_VERSION&&data.seed===this.level.seed&&Array.isArray(data.strokes)&&data.strokes.every(s=>['dig','pile'].includes(s?.tool)&&Object.hasOwn(SCULPT.sizes,s.size)&&Array.isArray(s.ticks)&&s.ticks.length>0&&
   s.ticks.every(t=>Array.isArray(t)&&t.length>=3&&t.length%2===1&&typeof t[0]==='number'&&t[0]>0&&t[0]<=1&&t.slice(1).every((n,k)=>Number.isInteger(n)&&n>=0&&n<=(k%2?maxY:maxX))));
  if(!ok)return false;
  // Wall poses are optional (stage 07 saved none). A malformed or rule-breaking pose drops
  // that wall back to its authored place; the rest still load.
  const poses=new Map(),movable=movableWalls(this.level);
  for(const [key,p] of Object.entries(data.walls??{})){const i=Number(key);if(!movable.includes(i)||!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)||Math.abs(p[0])>1||Math.abs(p[1])>1)continue;
   const pose={dx:p[0],dy:p[1],a:wrapAngle(p[2])};if(!isIdentity(pose)&&!wallProblem(this.level,this.withWalls(new Map([[i,pose]])).walls))poses.set(i,pose);}
  if(poses.size>1&&wallProblem(this.level,this.withWalls(poses).walls))poses.clear();
  this.strokes=data.strokes.map(s=>({tool:s.tool,size:s.size,ticks:s.ticks.map(t=>[...t])}));this.poses=poses;
  // The order of strokes and wall moves is not saved: after a reload, undo takes back
  // wall moves (to the authored wall) before strokes.
  this.history=[...this.strokes.map(()=>({stroke:true})),...[...poses.keys()].map(i=>({wall:i,before:null}))];
  this.stash=null;this.stroke=null;this.wallVersion++;this.replay();return true;
 }
}
