// Sculpt: moving the level's authored walls. Every wall except the border can move.
// A pose turns the authored wall about the centre of its bounding box by a (radians),
// then shifts it by (dx, dy); all in base (steel-board) metres. Wall heights and kinds
// never change.
export const WALL_RULES=Object.freeze({
 edge:0,      // points stay on the board; the 3 mm strip outside the border lines lies behind the border curtain
 start:.025,  // clearance from the start point (the start shelf's keep-out)
 extra:.0125, // clearance beyond a hole's or the goal ring's radius: 2.5 reference radii
 grid:.0005,  // shifts are stored on a 0.5 mm grid
 turn:Math.PI/180, // turns are stored in whole degrees, wrapped into (-180°, 180°]
 ball:.008,   // the largest ball in base units: BALL_SIZES.max (1.6) times the 5 mm reference radius
 cell:.004    // grid step of the start-to-goal check
});
export const movableWalls=level=>level.walls.flatMap((w,i)=>w.kind==='border'?[]:[i]);
export function pivot(points){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];}
export function posedWall(w,pose){
 if(!pose)return w;const [cx,cy]=pivot(w.points),c=Math.cos(pose.a),s=Math.sin(pose.a);
 return{...w,points:w.points.map(([x,y])=>{const u=x-cx,v=y-cy;return[cx+c*u-s*v+pose.dx,cy+s*u+c*v+pose.dy];})};
}
// The turning handle sits 85% of the way along the wall, clear of the board edge and its
// system swipe gestures.
export function handleOf(w){
 const lengths=w.points.slice(1).map((p,k)=>Math.hypot(p[0]-w.points[k][0],p[1]-w.points[k][1])),total=lengths.reduce((a,b)=>a+b,0);
 let target=.85*total;for(let k=0;k<lengths.length;k++){if(target<=lengths[k]){const t=lengths[k]?target/lengths[k]:0,[ax,ay]=w.points[k],[bx,by]=w.points[k+1];return[ax+t*(bx-ax),ay+t*(by-ay)];}target-=lengths[k];}
 return w.points.at(-1);
}
export const wrapAngle=a=>a-2*Math.PI*Math.round(a/(2*Math.PI));
export function quantizePose({dx,dy,a}){const g=WALL_RULES.grid,t=WALL_RULES.turn;return{dx:Math.round(dx/g)*g,dy:Math.round(dy/g)*g,a:Math.round(wrapAngle(a)/t)*t};}
export const isIdentity=p=>!p||!p.dx&&!p.dy&&!p.a;
export function segmentDistance(px,py,[ax,ay],[bx,by]){const sx=bx-ax,sy=by-ay,l2=sx*sx+sy*sy,t=l2?Math.max(0,Math.min(1,((px-ax)*sx+(py-ay)*sy)/l2)):0;return Math.hypot(px-ax-t*sx,py-ay-t*sy);}
export function wallDistance(w,x,y){let d=Infinity;for(let k=1;k<w.points.length;k++)d=Math.min(d,segmentDistance(x,y,w.points[k-1],w.points[k]));return d;}
// Circles a movable wall must stay out of, for the overlay and the checks.
export function wallClearances(level){return[{x:level.start.x,y:level.start.y,r:WALL_RULES.start},...level.holes.map(h=>({x:h.x,y:h.y,r:h.r+WALL_RULES.extra})),{x:level.goal.x,y:level.goal.y,r:level.goal.r+WALL_RULES.extra}];}
// Whether the largest ball can still get from the start to the goal: a flood fill on a
// coarse grid, blocked within one ball radius of every wall except low walls, which a ball
// can hop in full motion (as the authored route does). Slopes and holes are ignored.
// The border never moves, so its free cells are computed once per level and radius.
const borderCells=new WeakMap();
export function hasWay(level,walls,radius=WALL_RULES.ball){
 const step=WALL_RULES.cell,nx=Math.ceil(level.width/step),ny=Math.ceil(level.height/step),at=(i,j)=>[(i+.5)*step,(j+.5)*step];
 const cell=(x,y)=>Math.min(ny-1,Math.floor(y/step))*nx+Math.min(nx-1,Math.floor(x/step));
 let cached=borderCells.get(level.walls);if(!cached||cached.radius!==radius){const border=walls.filter(w=>w.kind==='border'),mask=new Uint8Array(nx*ny);
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const [x,y]=at(i,j);mask[j*nx+i]=border.every(w=>wallDistance(w,x,y)>=radius)?1:0;}
  borderCells.set(level.walls,cached={radius,mask});}
 const free=cached.mask.slice();
 for(const w of walls)if(w.kind!=='border'&&w.kind!=='low'){const xs=w.points.map(p=>p[0]),ys=w.points.map(p=>p[1]);
  const i0=Math.max(0,Math.floor((Math.min(...xs)-radius)/step)),i1=Math.min(nx-1,Math.floor((Math.max(...xs)+radius)/step)),j0=Math.max(0,Math.floor((Math.min(...ys)-radius)/step)),j1=Math.min(ny-1,Math.floor((Math.max(...ys)+radius)/step));
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const [x,y]=at(i,j);if(wallDistance(w,x,y)<radius)free[j*nx+i]=0;}}
 const start=cell(level.start.x,level.start.y),goal=cell(level.goal.x,level.goal.y),seen=new Uint8Array(nx*ny),queue=[start];seen[start]=1;
 while(queue.length){const k=queue.pop();if(k===goal)return true;const i=k%nx,j=(k-i)/nx;
  for(const [a,b] of [[i+1,j],[i-1,j],[i,j+1],[i,j-1]])if(a>=0&&a<nx&&b>=0&&b<ny){const n=b*nx+a;if(free[n]&&!seen[n]){seen[n]=1;queue.push(n);}}}
 return false;
}
// null if the walls are acceptable, otherwise the reason. Walls may cross: the authored
// pocket wall passes through the low wall, and each segment collides on its own.
export function wallProblem(level,walls){
 const e=WALL_RULES.edge,zones=wallClearances(level);
 for(const i of movableWalls(level)){const w=walls[i];
  if(w.points.some(([x,y])=>!(x>=e-1e-9&&x<=level.width-e+1e-9&&y>=e-1e-9&&y<=level.height-e+1e-9)))return'Walls stay on the board.';
  if(zones.some(z=>wallDistance(w,z.x,z.y)<z.r))return'Walls stay clear of the start, the holes and the goal.';
 }
 if(!hasWay(level,walls))return'Walls must leave a way from the start to the goal for every ball size.';
 return null;
}
