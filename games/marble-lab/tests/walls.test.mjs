import test from 'node:test';import assert from 'node:assert/strict';
import {reliefLevel,scaledLevel,RELIEF} from '../dist/landscape.js';
import {Sculptor} from '../dist/sculpt.js';
import {movableWalls,posedWall,pivot,handleOf,wallProblem,wallDistance,quantizePose,hasWay,WALL_RULES} from '../dist/walls.js';
import {newBall,advance,STEP,layoutFor,BALLS,BALL_SIZES} from '../dist/physics.js';
import {G} from '../dist/materials.js';
const level=reliefLevel(),[LOW,POCKET]=movableWalls(level),flat={terrain:false,holes:[],goal:false,bounds:false,air:false,patches:false};
const saved=s=>JSON.parse(JSON.stringify({...s.save(),walls:s.saveWalls().walls}));

test('the authored walls pass the wall rules; only the low and pocket walls move',()=>{
 assert.deepEqual(level.walls.map(w=>w.kind),['border','border','border','border','low','pocket']);
 assert.equal(wallProblem(level,level.walls),null);
 const s=new Sculptor(level);assert.equal(s.tryWall(0,{dx:0,dy:.01,a:0}).ok,false);assert.equal(s.moveWall(0,{dx:0,dy:.01,a:0}),false);
 assert.equal(WALL_RULES.ball,BALL_SIZES.max*RELIEF.radius);
});
test('a pose turns a wall rigidly about its box centre, then shifts it; handles sit on the wall',()=>{
 for(const i of [LOW,POCKET]){const w=level.walls[i],[cx,cy]=pivot(w.points),a=Math.PI/3,c=Math.cos(a),s=Math.sin(a);
  const q=posedWall(w,{dx:0,dy:0,a});q.points.forEach(([x,y],k)=>{const u=w.points[k][0]-cx,v=w.points[k][1]-cy;assert.ok(Math.abs(x-(cx+c*u-s*v))<1e-15&&Math.abs(y-(cy+s*u+c*v))<1e-15);});
  const p=posedWall(w,{dx:.01,dy:-.02,a});p.points.forEach(([x,y],k)=>assert.ok(Math.abs(x-q.points[k][0]-.01)<1e-15&&Math.abs(y-q.points[k][1]+.02)<1e-15));
  const [hx,hy]=handleOf(w);assert.ok(wallDistance(w,hx,hy)<1e-12);assert.ok(hx>.006&&hx<level.width-.006);}
 assert.deepEqual(quantizePose({dx:.01234,dy:-.00026,a:.0101}),{dx:.0125,dy:-.0005,a:Math.PI/180});
 // Angles wrap into (-180°, 180°], however far a wall was wound.
 for(const a of [7.8,-9.3,2*Math.PI+.5])assert.ok(Math.abs(quantizePose({dx:0,dy:0,a}).a)<=Math.PI+1e-12);
});
test('a segment over the start, a hole or the goal is refused; just outside it passes',()=>{
 const s=new Sculptor(level),[a,b]=level.walls[POCKET].points,mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=[-(b[1]-a[1])/len,(b[0]-a[0])/len];
 assert.ok(s.tryWall(LOW,{dx:0,dy:-.04,a:0}).ok);assert.ok(s.tryWall(LOW,{dx:0,dy:0,a:.05}).ok);
 assert.match(s.tryWall(LOW,{dx:.02,dy:0,a:0}).reason,/on the board/);
 // Put the middle of the pocket wall's first segment (not a vertex) at distance d from a protected point.
 const at=(q,d)=>s.tryWall(POCKET,{dx:q.x+n[0]*d-mid[0],dy:q.y+n[1]*d-mid[1],a:0});
 for(const [q,r] of [[level.start,WALL_RULES.start],...level.holes.map(h=>[h,h.r+WALL_RULES.extra]),[level.goal,level.goal.r+WALL_RULES.extra]]){
  assert.match(at(q,r-.001).reason,/clear of/);assert.ok(at(q,r+.002).ok,`just outside ${r}`);}
});
test('a pose that shuts the largest ball in at the start is refused',()=>{
 const s=new Sculptor(level),w=level.walls[POCKET],[px,py]=pivot(w.points),trap={dx:.044-px,dy:.060-py,a:Math.PI};
 const walls=level.walls.map((v,i)=>i===POCKET?posedWall(v,trap):v);
 assert.equal(hasWay(level,walls,.005),true);assert.equal(hasWay(level,walls),false);
 assert.match(s.tryWall(POCKET,trap).reason,/way from the start to the goal/);
});
test('a moved wall is where the ball collides, and the unedited level is untouched',()=>{
 const s=new Sculptor(level);assert.equal(s.currentLevel(),level);
 assert.ok(s.moveWall(LOW,{dx:0,dy:-.04,a:0}));const moved=s.currentLevel();assert.notEqual(moved,level);assert.equal(s.currentLevel(),moved);
 assert.deepEqual(layoutFor('steel',moved).walls[LOW].points,moved.walls[LOW].points);assert.deepEqual(layoutFor('steel').walls[LOW].points,level.walls[LOW].points);
 // Roll straight at the wall's old and new positions (flat floor): the moved wall turns the ball back 4 cm earlier.
 const turn=l=>{const b=newBall('steel','wood','wood',false,{level:l});b.x=.2;b.y=.25;b.vy=.3;b.wx=-b.vy/b.r;let far=b.y;for(let i=0;i<.8/STEP;i++){advance(b,{x:0,y:0},STEP,flat);far=Math.max(far,b.y);}return far;};
 const before=turn(level),after=turn(moved);assert.ok(before>.35&&after<.33&&before-after>.035,`${before} ${after}`);
 s.reset();assert.equal(s.currentLevel(),level);
});
test('a no-op or authored pose is no move; returning to the authored place restores the relief',()=>{
 const s=new Sculptor(level);assert.equal(s.moveWall(LOW,{dx:0,dy:0,a:0}),false);assert.ok(!s.edited&&!s.canUndo);
 assert.ok(s.moveWall(LOW,{dx:0,dy:-.02,a:0}));assert.equal(s.moveWall(LOW,{dx:0,dy:-.02,a:0}),false);assert.ok(s.canUndo);
 assert.ok(s.moveWall(LOW,{dx:0,dy:-0,a:0}));assert.equal(s.poses.size,0);assert.equal(s.currentLevel(),level);assert.ok(!s.edited);
 assert.ok(s.undo());assert.deepEqual(s.poses.get(LOW),{dx:0,dy:-.02,a:0});s.reset();
});
test('undo, reset and reload restore wall poses and the level exactly',()=>{
 const s=new Sculptor(level),pose=(i,p)=>posedWall(level.walls[i],p).points;
 s.moveWall(LOW,{dx:0,dy:-.03,a:0});s.begin('dig','S',.2,.13);s.tick();s.tick();s.end();s.moveWall(LOW,{dx:0,dy:-.05,a:.1});s.moveWall(POCKET,{dx:.02,dy:.03,a:-.2});
 const data=saved(s),walls=s.currentLevel().walls;
 assert.ok(s.undo());assert.equal(s.poses.has(POCKET),false);assert.deepEqual(s.currentLevel().walls[LOW].points,pose(LOW,{dx:0,dy:-.05,a:.1}));assert.deepEqual(s.currentLevel().walls[POCKET].points,level.walls[POCKET].points);
 assert.ok(s.undo());assert.deepEqual(s.currentLevel().walls[LOW].points,pose(LOW,{dx:0,dy:-.03,a:0}));
 assert.ok(s.undo());assert.equal(s.strokes.length,0);assert.ok(s.undo());assert.equal(s.currentLevel(),level);assert.equal(s.undo(),false);
 const t=new Sculptor(level);assert.ok(t.load(data));assert.deepEqual(t.currentLevel().walls,walls);assert.equal(t.strokes.length,1);
 // After a reload, undo takes back wall moves (to the authored wall) before strokes.
 assert.ok(t.undo());assert.ok(t.undo());assert.equal(t.poses.size,0);assert.equal(t.strokes.length,1);assert.ok(t.undo());assert.equal(t.strokes.length,0);
 assert.ok(t.load(data));assert.ok(t.reset());assert.equal(t.currentLevel(),level);assert.ok(!t.edited);assert.ok(t.undo());assert.deepEqual(t.currentLevel().walls,walls);
 t.reset();s.reset();
});
test('strokes and wall poses save separately; a bad saved pose drops only that wall',()=>{
 const s=new Sculptor(level);s.begin('dig','S',.2,.13);s.tick();s.tick();s.end();s.moveWall(LOW,{dx:0,dy:-.04,a:0});
 assert.equal(s.save().walls,undefined);assert.deepEqual(s.saveWalls().walls,{[LOW]:[0,-.04,0]});
 const good=saved(s);s.reset();const h=level.holes[0],[px,py]=level.walls[POCKET].points[0];
 for(const bad of [[0,[0,.01,0]],[POCKET,[h.x-px,h.y-py,0]],[POCKET,[0,'x',0]],[POCKET,[0,0]]]){
  assert.ok(s.load({...good,walls:{...good.walls,[bad[0]]:bad[1]}}));assert.deepEqual([...s.poses.keys()],[LOW]);assert.equal(s.strokes.length,1);s.reset();}
 // A wound-up angle loads, wrapped.
 assert.ok(s.load({...good,walls:{[POCKET]:[.01,0,2*Math.PI+.3]}}));assert.ok(Math.abs(s.poses.get(POCKET).a-.3)<1e-12);s.reset();
 // A stage-07 save (strokes only) still loads.
 assert.ok(s.load({v:good.v,seed:good.seed,strokes:good.strokes}));assert.equal(s.poses.size,0);assert.equal(s.strokes.length,1);s.reset();
});
test('ball size scales the ball, not the board; solid balls keep density, the shell keeps its wall',()=>{
 for(const material of Object.keys(BALLS))for(const size of [BALL_SIZES.min,1.3,BALL_SIZES.max]){
  const a=newBall(material),b=newBall(material,'wood','wood',false,{size});
  assert.ok(Math.abs(b.r-a.r*size)<1e-15);assert.ok(Math.abs(b.m/a.m-size**(BALLS[material].shell?2:3))<1e-12);assert.ok(Math.abs(b.I-BALLS[material].inertiaRatio*b.m*b.r*b.r)<1e-18);
  assert.equal(b.layout.width,a.layout.width);assert.deepEqual(b.layout.holes.map(h=>h.r),a.layout.holes.map(h=>h.r));assert.equal(b.layout.goal.r,a.layout.goal.r);
  // Every size stays narrower than the holes and fits the goal's dwell circle.
  assert.ok(b.layout.holes.every(h=>h.r>b.r));assert.ok(b.layout.goal.r-b.r>.005*b.layout.scale);
 }
 assert.throws(()=>newBall('steel','wood','wood',false,{size:1.7}));assert.throws(()=>newBall('steel','wood','wood',false,{size:.4}));
});
test('every ball size keeps the summit e-folding time at 0.7 seconds',()=>{
 for(const material of Object.keys(BALLS))for(const size of [BALL_SIZES.min,1.3,BALL_SIZES.max]){const b=newBall(material,'wood','wood',false,{size}),l=b.layout,p=l.terrain.sample(l.goal.x,l.goal.y),tau=Math.sqrt((1+BALLS[material].inertiaRatio)*(-1/p.dxx+b.r)/G);
  assert.ok(Math.abs(tau-.7)<.003,`${material} ×${size}: ${tau}`);assert.ok(Math.hypot(p.dx,p.dy)<1e-7);}
});
test('a resized field equals a full rebuild near the goal, shares the relief elsewhere, and few are kept',()=>{
 for(const material of ['pingpong','billiard'])for(const size of [BALL_SIZES.min,BALL_SIZES.max]){
  const p=BALLS[material],scale=p.radius/RELIEF.radius,r=p.radius*size,shared=scaledLevel(level,scale,p.inertiaRatio,r,true),full=scaledLevel(level,scale,p.inertiaRatio,r,false);
  for(let k=0;k<60;k++){const d=.05+.04*k/59,t=k*2.4,x=(level.goal.x+d*Math.cos(t))*scale,y=(level.goal.y+d*Math.sin(t))*scale;if(x<0||y<0||x>shared.width||y>shared.height)continue;
   const a=shared.terrain.sample(x,y),b=full.terrain.sample(x,y);for(const key of ['h','dx','dy','dxx','dxy','dyy'])assert.ok(Math.abs(a[key]-b[key])<=1e-12*(1+Math.abs(b[key])),`${material} ×${size} ${key} at ${d}`);}
 }
 const size=s=>newBall('steel','wood','wood',false,{size:s}).layout,first=size(.6);
 assert.equal(size(.6),first);for(const s of [.7,.8,.9,1.1])size(s);assert.notEqual(size(.6),first);
 const nominal=layoutFor('steel');assert.ok(first.resized&&!nominal.resized);assert.deepEqual(first.terrain.sample(.02,.12),nominal.terrain.sample(.02,.12));
});
// Capture at a single speed is not monotonic in size (rim bounces), so scan speeds: smaller
// balls are captured more often and up to higher speeds. The largest ball never seats.
test('holes capture small balls more often and faster; the largest ball released over a hole falls',()=>{
 const hole={x:.1,y:.1,r:.00825},walls={...flat,bounds:true,walls:[],holes:[hole]},falls=(size,v,off)=>{const b=newBall('steel','wood','wood',false,{size});b.x=.07;b.y=.1+off;b.z=b.r;b.vx=v;b.wy=b.vx/b.r;let e=null;for(let i=0;i<1.5/STEP&&!e;i++)e=advance(b,{x:0,y:0},STEP,walls);return e?.type==='fall';};
 const scan=size=>{let count=0,fastest=0;for(let v=.1;v<=1.5;v+=.05)for(const off of [0,.003])if(falls(size,v,off)){count++;fastest=Math.max(fastest,v);}return{count,fastest};};
 const [small,nominal,large]=[BALL_SIZES.min,1,BALL_SIZES.max].map(scan);
 assert.ok(small.count>nominal.count&&nominal.count>large.count,JSON.stringify({small,nominal,large}));assert.ok(small.fastest>nominal.fastest&&nominal.fastest>large.fastest);
 for(const off of [.001,.004,.008]){const b=newBall('steel','wood','wood',false,{size:BALL_SIZES.max});b.x=hole.x+off;b.y=hole.y;b.z=b.r;let e=null;for(let i=0;i<1/STEP&&!e;i++)e=advance(b,{x:0,y:0},STEP,walls);assert.equal(e?.type,'fall',`offset ${off}`);}
});
