// Sculpt: the objects on a board, in base (steel-board) metres. Everything except the
// border moves. Walls, holes, patches and the goal ring also scale, and walls, holes and
// patches can be added and removed. Heights, kinds and materials never change.
export const OBJECT_RULES=Object.freeze({
 ball:.008,         // the largest ball in base units: BALL_SIZES.max (1.6) times the 5 mm reference radius
 startClear:.025,   // walls and holes keep this far from the start point
 extra:.0125,       // walls keep this far beyond a hole's or the goal ring's radius (2.5 reference radii)
 hole:Object.freeze({min:.00825,max:.025}),   // never narrower than 1.65 reference radii, so no ball can seat in a hole
 goal:Object.freeze({min:.012,max:.04}),      // wider than the largest ball, so a win stays possible
 patch:Object.freeze({min:.008,max:.08}),
 wall:Object.freeze({min:.02,max:.35}),       // length of a wall's polyline
 count:Object.freeze({walls:12,holes:12,patches:10}),
 cell:.004,         // grid step of the start-to-goal check
 grid:.0005,        // positions are stored on a 0.5 mm grid
 turn:Math.PI/180   // turns are stored in whole degrees
});
const R=.005,BOARD_WIDTH=.3; // every board is 0.3 m wide in base units
// What the Add menu places: a straight wall 60 mm long, a hole, or a round patch.
export const NEW_OBJECTS=Object.freeze({
 lowWall:{type:'wall',make:(x,y)=>({kind:'low',height:2*R,points:[[x-.03,y],[x+.03,y]]})},
 tallWall:{type:'wall',make:(x,y)=>({kind:'tall',height:6*R,points:[[x-.03,y],[x+.03,y]]})},
 hole:{type:'hole',make:(x,y)=>({x,y,r:1.65*R})},
 sand:{type:'patch',make:(x,y)=>({kind:'sand',x,y,rx:.025,ry:.025})},
 resin:{type:'patch',make:(x,y)=>({kind:'resin',x,y,rx:.02,ry:.02})}
});
const clone=o=>JSON.parse(JSON.stringify(o));
export function objectsOf(level){return clone({start:{x:level.start.x,y:level.start.y},goal:{x:level.goal.x,y:level.goal.y,r:level.goal.r},walls:level.walls.map(w=>({kind:w.kind,height:w.height,points:w.points})),holes:level.holes.map(h=>({x:h.x,y:h.y,r:h.r})),patches:level.patches.map(p=>({kind:p.kind,x:p.x,y:p.y,rx:p.rx,ry:p.ry}))});}
// A copy of the base level with these objects. The relief's goal summit stays where it
// was built (summit), whatever happens to the goal ring.
export function levelWith(base,objects){
 const level={...base,start:objects.start,goal:objects.goal,walls:objects.walls,holes:objects.holes,patches:objects.patches};
 if(base.goalRadius!==undefined)level.summit=base.summit??base.goal;
 return level;
}
export const sameObjects=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const movableWalls=objects=>objects.walls.flatMap((w,i)=>w.kind==='border'?[]:[i]);
export function pivot(points){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];}
// Turns by a and scales by s about the centre of the wall's bounding box, then shifts.
export function transformWall(w,{dx=0,dy=0,a=0,s=1}){
 const [cx,cy]=pivot(w.points),c=Math.cos(a)*s,n=Math.sin(a)*s;
 return{...w,points:w.points.map(([x,y])=>{const u=x-cx,v=y-cy;return[cx+c*u-n*v+dx,cy+n*u+c*v+dy];})};
}
export const wrapAngle=a=>a-2*Math.PI*Math.round(a/(2*Math.PI));
export const snap=v=>Math.round(v/OBJECT_RULES.grid)*OBJECT_RULES.grid;
export const snapAngle=a=>Math.round(wrapAngle(a)/OBJECT_RULES.turn)*OBJECT_RULES.turn;
export const wallLength=w=>w.points.slice(1).reduce((s,p,k)=>s+Math.hypot(p[0]-w.points[k][0],p[1]-w.points[k][1]),0);
export function segmentDistance(px,py,[ax,ay],[bx,by]){const sx=bx-ax,sy=by-ay,l2=sx*sx+sy*sy,t=l2?Math.max(0,Math.min(1,((px-ax)*sx+(py-ay)*sy)/l2)):0;return Math.hypot(px-ax-t*sx,py-ay-t*sy);}
export function wallDistance(w,x,y){let d=Infinity;for(let k=1;k<w.points.length;k++)d=Math.min(d,segmentDistance(x,y,w.points[k-1],w.points[k]));return d;}
// The point a fraction f of the way along a wall.
export function alongWall(w,f){
 const lengths=w.points.slice(1).map((p,k)=>Math.hypot(p[0]-w.points[k][0],p[1]-w.points[k][1])),total=lengths.reduce((a,b)=>a+b,0);
 let target=f*total;for(let k=0;k<lengths.length;k++){if(target<=lengths[k]){const t=lengths[k]?target/lengths[k]:0,[ax,ay]=w.points[k],[bx,by]=w.points[k+1];return[ax+t*(bx-ax),ay+t*(by-ay)];}target-=lengths[k];}return w.points.at(-1);
}
// The handle turns and stretches a wall (85% along it, clear of the board edge) or resizes
// a hole, patch or the goal ring (just outside its rim, on the side that stays on the board).
// The start has none.
const OUTSIDE=.006;
export function handleOf(type,o){
 if(type==='wall')return alongWall(o,.85);
 const r=type==='patch'?o.rx:o.r;if(r===undefined)return null;
 return o.x+r+OUTSIDE<=BOARD_WIDTH-OUTSIDE?[o.x+r+OUTSIDE,o.y]:[o.x-r-OUTSIDE,o.y];
}
const centreOf=(type,o)=>type==='wall'?alongWall(o,.5):[o.x,o.y];
export const NAMES={start:'the start',goal:'the goal ring',hole:'a hole',patch:'a patch',wall:'a wall'};
// Finds what a press at p grabs. The selected object's handle (the only one drawn) wins when
// the press is within reach and nearer to it than to the object's centre. Otherwise the
// body: the start, holes and the goal ring, walls near their line, patches, and finally
// walls within reach.
export function pickObject(objects,p,{selected=null,reach=.015}={}){
 const dist=q=>Math.hypot(p.x-q[0],p.y-q[1]);
 if(selected&&selected.type!=='start'){const o=objectAt(objects,selected.type,selected.index);if(o){const dh=dist(handleOf(selected.type,o));if(dh<reach&&dh<dist(centreOf(selected.type,o)))return{type:selected.type,index:selected.index,mode:'handle',d:dh};}}
 let best=null;const consider=(type,index,d)=>{if(!best||d<best.d)best={type,index,mode:'move',d};};
 const s=objects.start;if(Math.hypot(p.x-s.x,p.y-s.y)<Math.max(.012,reach*.8))return{type:'start',index:0,mode:'move',d:Math.hypot(p.x-s.x,p.y-s.y)};
 objects.holes.forEach((o,i)=>{const d=Math.hypot(p.x-o.x,p.y-o.y);if(d<o.r+.004)consider('hole',i,d);});if(best)return best;
 {const g=objects.goal,d=Math.hypot(p.x-g.x,p.y-g.y);if(d<g.r+.004)return{type:'goal',index:0,mode:'move',d};}
 const walls=movableWalls(objects);walls.forEach(i=>{const d=wallDistance(objects.walls[i],p.x,p.y);if(d<.008)consider('wall',i,d);});if(best)return best;
 objects.patches.forEach((o,i)=>{const q=((p.x-o.x)/o.rx)**2+((p.y-o.y)/o.ry)**2;if(q<1)consider('patch',i,q);});if(best)return best;
 walls.forEach(i=>{const d=wallDistance(objects.walls[i],p.x,p.y);if(d<reach)consider('wall',i,d);});
 return best;
}
// Applies one drag to one object: a shift in move mode, or a turn and scale (wall) or a
// radius change (hole, patch, goal) through the handle. start is the object before the drag.
export function dragged(type,start,mode,p0,p){
 // Displacements snap to the grid, so a drag that ends where it began changes nothing.
 const dx=snap(p.x-p0.x),dy=snap(p.y-p0.y);
 if(type==='wall'){
  if(mode==='move')return dx||dy?transformWall(start,{dx,dy}):start;
  const [cx,cy]=pivot(start.points),d0=Math.hypot(p0.x-cx,p0.y-cy),d1=Math.hypot(p.x-cx,p.y-cy),s=d0>1e-4?Math.round(d1/d0*100)/100:1,a=snapAngle(Math.atan2(p.y-cy,p.x-cx)-Math.atan2(p0.y-cy,p0.x-cx));
  return a||s!==1?transformWall(start,{a,s}):start;
 }
 if(mode==='move')return dx||dy?{...start,x:start.x+dx,y:start.y+dy}:start;
 // The handle changes the radius by how far it is dragged away from or towards the centre.
 const grow=snap(Math.hypot(p.x-start.x,p.y-start.y)-Math.hypot(p0.x-start.x,p0.y-start.y));if(!grow)return start;
 if(type==='patch'){const rx=start.rx+grow;return{...start,rx,ry:start.ry*rx/start.rx};}
 return{...start,r:start.r+grow};
}
export const LISTS=Object.freeze({wall:'walls',hole:'holes',patch:'patches'});
// A copy of objects with one object replaced (or appended at index = length); o=null removes it.
export function withObject(objects,type,index,o){
 const next={...objects,walls:[...objects.walls],holes:[...objects.holes],patches:[...objects.patches]};
 if(type==='start'||type==='goal')next[type]=o;else if(o)next[LISTS[type]][index]=o;else next[LISTS[type]].splice(index,1);return next;
}
export const objectAt=(objects,type,index)=>type==='start'||type==='goal'?objects[type]:objects[LISTS[type]][index];
// Circles walls keep out of, for the overlay: the start, holes and the goal ring.
export function clearances(objects){const e=OBJECT_RULES;return[{x:objects.start.x,y:objects.start.y,r:e.startClear},...objects.holes.map(h=>({x:h.x,y:h.y,r:h.r+e.extra})),{x:objects.goal.x,y:objects.goal.y,r:objects.goal.r+e.extra}];}
// Whether the largest ball can still get from the start to the goal: a flood fill on a
// 4 mm grid, blocked near the border and every wall except low walls (which a ball can hop
// in full motion, as the relief's route does), and over holes. Slopes are ignored.
export function hasWay(level,objects,radius=OBJECT_RULES.ball){
 const step=OBJECT_RULES.cell,nx=Math.ceil(level.width/step),ny=Math.ceil(level.height/step),edge=.003+radius,free=new Uint8Array(nx*ny);
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const x=(i+.5)*step,y=(j+.5)*step;free[j*nx+i]=x>=edge&&x<=level.width-edge&&y>=edge&&y<=level.height-edge?1:0;}
 const block=(x0,y0,x1,y1,test)=>{for(let j=Math.max(0,Math.floor(y0/step));j<=Math.min(ny-1,Math.floor(y1/step));j++)for(let i=Math.max(0,Math.floor(x0/step));i<=Math.min(nx-1,Math.floor(x1/step));i++)if(test((i+.5)*step,(j+.5)*step))free[j*nx+i]=0;};
 // Cells are blocked within a margin grown by half a cell, so the path between two free
 // cell centres never passes closer than the radius to a wall tip.
 const margin=r=>Math.hypot(r,step/2);
 for(const w of objects.walls)if(w.kind!=='border'&&w.kind!=='low'){const xs=w.points.map(p=>p[0]),ys=w.points.map(p=>p[1]),m=margin(radius);block(Math.min(...xs)-m,Math.min(...ys)-m,Math.max(...xs)+m,Math.max(...ys)+m,(x,y)=>wallDistance(w,x,y)<m);}
 for(const h of objects.holes){const m=margin(h.r);block(h.x-m,h.y-m,h.x+m,h.y+m,(x,y)=>Math.hypot(x-h.x,y-h.y)<m);}
 const cell=(x,y)=>Math.min(ny-1,Math.max(0,Math.floor(y/step)))*nx+Math.min(nx-1,Math.max(0,Math.floor(x/step)));
 const start=cell(objects.start.x,objects.start.y),goal=cell(objects.goal.x,objects.goal.y),seen=new Uint8Array(nx*ny),queue=[start];seen[start]=1;
 while(queue.length){const k=queue.pop();if(k===goal)return true;const i=k%nx,j=(k-i)/nx;
  for(const [a,b] of [[i+1,j],[i-1,j],[i,j+1],[i,j-1]])if(a>=0&&a<nx&&b>=0&&b<ny){const n=b*nx+a;if(free[n]&&!seen[n]){seen[n]=1;queue.push(n);}}}
 return false;
}
// null if the objects are acceptable on this board, otherwise the reason.
export function objectProblem(level,objects){
 const e=OBJECT_RULES,W=level.width,H=level.height,{start,goal,holes,patches,walls}=objects,movable=movableWalls(objects),on=(x,y,m=0)=>x>=m-1e-9&&x<=W-m+1e-9&&y>=m-1e-9&&y<=H-m+1e-9;
 if(movable.length>e.count.walls||holes.length>e.count.holes||patches.length>e.count.patches)return'The board is full: remove something first.';
 if(!on(start.x,start.y,.003+e.ball))return'The start stays on the board.';
 if(!(goal.r>=e.goal.min-1e-9&&goal.r<=e.goal.max+1e-9))return`The goal ring stays between ${e.goal.min*1000} and ${e.goal.max*1000} mm in radius.`;
 if(!on(goal.x,goal.y,goal.r+.003))return'The goal ring stays on the board.';
 if(Math.hypot(goal.x-start.x,goal.y-start.y)<goal.r+e.startClear)return'The start stays clear of the goal ring.';
 for(const h of holes){
  if(!(h.r>=e.hole.min-1e-9&&h.r<=e.hole.max+1e-9))return`Holes stay between ${e.hole.min*1000} and ${e.hole.max*1000} mm in radius.`;
  if(!on(h.x,h.y,h.r+.003))return'Holes stay on the board.';
  if(Math.hypot(h.x-start.x,h.y-start.y)<h.r+e.startClear||Math.hypot(h.x-goal.x,h.y-goal.y)<h.r+goal.r+.005)return'Holes stay clear of the start and the goal ring.';
 }
 for(const p of patches){if(!(Math.min(p.rx,p.ry)>=e.patch.min-1e-9&&Math.max(p.rx,p.ry)<=e.patch.max+1e-9))return`Patches stay between ${e.patch.min*1000} and ${e.patch.max*1000} mm in radius.`;if(!on(p.x,p.y))return'Patches stay on the board.';
  // Resin (and sand, for some balls) holds a ball at rest against any tilt, so none may cover the start.
  if(((start.x-p.x)/(p.rx+e.startClear))**2+((start.y-p.y)/(p.ry+e.startClear))**2<1)return'Patches stay clear of the start.';}
 for(const i of movable){const w=walls[i],length=wallLength(w);
  if(!(length>=e.wall.min-1e-9&&length<=e.wall.max+1e-9))return`Walls stay between ${e.wall.min*1000} and ${e.wall.max*1000} mm long.`;
  if(w.points.some(([x,y])=>!on(x,y)))return'Walls stay on the board.';
  if(wallDistance(w,start.x,start.y)<e.startClear||holes.some(h=>wallDistance(w,h.x,h.y)<h.r+e.extra)||wallDistance(w,goal.x,goal.y)<goal.r+e.extra)return'Walls stay clear of the start, the holes and the goal.';
 }
 if(!hasWay(level,objects))return'A way from the start to the goal must remain for every ball size.';
 return null;
}
