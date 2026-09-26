import test from 'node:test';import assert from 'node:assert/strict';
import {reliefLevel,flatLevel,RELIEF} from '../dist/landscape.js';
import {Sculptor} from '../dist/sculpt.js';
import {OBJECT_RULES,NEW_OBJECTS,LISTS,objectsOf,levelWith,objectProblem,hasWay,pickObject,dragged,withObject,handleOf,transformWall,pivot,wallLength,snap} from '../dist/objects.js';
import {newBall,advance,STEP,layoutFor,BALLS,BALL_SIZES,patchAt} from '../dist/physics.js';
import {G} from '../dist/materials.js';
const flat=flatLevel(),relief=reliefLevel(),still={x:0,y:0};
const add=(objects,kind,x,y)=>{const n=NEW_OBJECTS[kind];return withObject(objects,n.type,objects[LISTS[n.type]].length,n.make(x,y));};
const run=(b,seconds,options={})=>{let e=null;for(let i=0;i<seconds/STEP&&!e;i++)e=advance(b,still,STEP,options);return e;};

test('the open board is flat and empty: border, start and goal only',()=>{
 for(let k=0;k<200;k++){const x=(k*.618%1)*flat.width,y=(k*.382%1)*flat.height;assert.deepEqual(flat.field.sample(x,y),{h:0,dx:0,dy:0,dxx:0,dxy:0,dyy:0});}
 assert.deepEqual(flat.walls.map(w=>w.kind),['border','border','border','border']);assert.deepEqual([flat.holes.length,flat.patches.length],[0,0]);
 assert.equal(objectProblem(flat,objectsOf(flat)),null);assert.equal(objectProblem(relief,objectsOf(relief)),null);
 for(const material of Object.keys(BALLS)){const b=newBall(material,'wood','wood',false,{level:flat}),l=b.layout;assert.equal(b.z,b.r);assert.equal(run(b,1),null);assert.ok(Math.hypot(b.x-l.start.x,b.y-l.start.y)<1e-12);
  const p=l.terrain.sample(l.goal.x,l.goal.y);assert.ok(!p.h&&!p.dxx);}
});
test('added objects pass the rules and the physics finds each one where it is drawn',()=>{
 let o=objectsOf(flat);o=add(o,'tallWall',.15,.30);o=add(o,'hole',.15,.20);o=add(o,'sand',.08,.45);o=add(o,'resin',.22,.45);o=add(o,'lowWall',.15,.40);
 assert.equal(objectProblem(flat,o),null);const level=levelWith(flat,o),l=layoutFor('steel',level);
 assert.deepEqual([l.walls.length,l.holes.length,l.patches.length],[6,1,2]);
 const fall=newBall('steel','wood','wood',false,{level});Object.assign(fall,{x:.15,y:.20});assert.equal(run(fall,1)?.type,'fall');
 const sand=newBall('steel','wood','wood',false,{level});Object.assign(sand,{x:.08,y:.45});assert.equal(patchAt(sand,l),'sand');Object.assign(sand,{x:.22,y:.45});assert.equal(patchAt(sand,l),'resin');
 // Where patches overlap, the one drawn on top (added later) applies.
 const both=levelWith(flat,add(add(objectsOf(flat),'sand',.15,.45),'resin',.15,.45)),top=newBall('steel','wood','wood',false,{level:both});Object.assign(top,{x:.15,y:.45});assert.equal(patchAt(top,layoutFor('steel',both)),'resin');
 const hit=newBall('steel','wood','wood',false,{level});Object.assign(hit,{x:.15,y:.25,vy:.3});hit.wx=-hit.vy/hit.r;let far=0;for(let i=0;i<.5/STEP;i++){advance(hit,still,STEP,{air:false});far=Math.max(far,hit.y);}assert.ok(far<.30-hit.r+.0005&&far>.29,'tall wall at 0.30 m: '+far);
});
test('dragging moves any object, turns and stretches walls, and resizes holes, patches and the goal',()=>{
 let o=objectsOf(flat);o=add(o,'tallWall',.15,.30);o=add(o,'hole',.15,.20);o=add(o,'sand',.08,.45);
 // Displacements snap to the 0.5 mm grid: 11.2 mm to 11.0, -26.3 mm to -26.5. Dragging back changes nothing.
 const w=o.walls[4],moved=dragged('wall',w,'move',{x:.15,y:.30},{x:.1612,y:.2737});
 moved.points.forEach(([x,y],k)=>assert.ok(Math.abs(x-(w.points[k][0]+.011))<1e-12&&Math.abs(y-(w.points[k][1]-.0265))<1e-12));
 for(const [type,obj] of [['wall',w],['hole',o.holes[0]],['patch',o.patches[0]],['goal',o.goal],['start',o.start]])for(const mode of ['move','handle'])assert.equal(dragged(type,obj,mode,{x:.1,y:.2},{x:.1001,y:.2002}),obj,`${type} ${mode}`);
 const [hx,hy]=handleOf('wall',w),[cx,cy]=pivot(w.points),turned=dragged('wall',w,'handle',{x:hx,y:hy},{x:cx,y:cy+2*(hx-cx)});
 assert.ok(Math.abs(wallLength(turned)-2*wallLength(w))<1e-12);assert.ok(Math.abs(turned.points[0][0]-cx)<1e-12,'turned a quarter');
 // Round objects grow by how far the handle is dragged away from the centre.
 const h=o.holes[0],[gx]=handleOf('hole',h),bigger=dragged('hole',h,'handle',{x:gx,y:h.y},{x:gx+.005,y:h.y});assert.equal(bigger.r,h.r+.005);
 const p=o.patches[0],[px]=handleOf('patch',p),wider=dragged('patch',p,'handle',{x:px,y:p.y},{x:px+.01,y:p.y});assert.equal(wider.rx,p.rx+.01);assert.equal(wider.ry,p.ry*wider.rx/p.rx);
 const g=o.goal,[qx]=handleOf('goal',g);assert.ok(dragged('goal',g,'handle',{x:qx,y:g.y},{x:qx+.01,y:g.y}).r>g.r);
 assert.deepEqual(dragged('start',o.start,'move',{x:0,y:0},{x:.01,y:.02}),{x:o.start.x+.01,y:o.start.y+.02});
 // Handles near the right edge move to the left of the rim, onto the board.
 assert.ok(handleOf('hole',{x:.285,y:.3,r:.009})[0]<.285);assert.ok(handleOf('patch',{x:.27,y:.3,rx:.02,ry:.02})[0]<.27);
});
test('a press takes the selected handle only when nearer to it than to the centre; bodies otherwise',()=>{
 let o=objectsOf(flat);o=add(o,'hole',.15,.2);o=add(o,'resin',.15,.45);o=add(o,'lowWall',.15,.45);
 const h=o.holes[0],[gx,gy]=handleOf('hole',h),reach=.018,sel={type:'hole',index:0};
 assert.equal(pickObject(o,{x:gx,y:gy},{reach}),null,'an unselected handle is not drawn and grabs nothing');
 assert.equal(pickObject(o,{x:gx,y:gy},{selected:sel,reach}).mode,'handle');assert.equal(pickObject(o,{x:h.x,y:h.y},{selected:sel,reach}).mode,'move');
 // A short selected wall: its middle moves it, its handle end turns it.
 const short={kind:'tall',height:.03,points:[[.14,.3],[.16,.3]]};o=withObject(o,'wall',o.walls.length,short);const wi=o.walls.length-1,ws={type:'wall',index:wi};
 assert.equal(pickObject(o,{x:.15,y:.301},{selected:ws,reach}).mode,'move');assert.equal(pickObject(o,{x:.157,y:.3},{selected:ws,reach}).mode,'handle');
 // A patch under a wall can still be grabbed away from the wall's line.
 assert.equal(pickObject(o,{x:.15,y:.46},{reach}).type,'patch');assert.equal(pickObject(o,{x:.15,y:.451},{reach}).type,'wall');
 assert.equal(pickObject(o,{x:o.start.x+.005,y:o.start.y},{reach}).type,'start');
});
test('the rules keep holes wider than every ball, clear of start and goal, and a way to the goal',()=>{
 const o=objectsOf(flat),e=OBJECT_RULES,s=o.start,g=o.goal;
 assert.equal(e.ball,BALL_SIZES.max*RELIEF.radius);assert.ok(e.hole.min>e.ball);assert.ok(e.goal.min>e.ball);
 const with1=(kind,obj)=>objectProblem(flat,withObject(o,kind,0,obj));
 assert.match(with1('hole',{x:.15,y:.3,r:e.hole.min-.0005}),/between/);assert.match(with1('hole',{x:.15,y:.3,r:e.hole.max+.0005}),/between/);
 assert.match(with1('hole',{x:s.x+.02,y:s.y,r:.01}),/clear of the start/);assert.match(with1('hole',{x:g.x-.03,y:g.y,r:.01}),/clear of the start and the goal/);
 assert.match(objectProblem(flat,{...o,goal:{...g,r:.008}}),/goal ring stays between/);assert.match(objectProblem(flat,{...o,goal:{x:s.x+.03,y:s.y,r:.015}}),/start stays clear/);
 assert.match(with1('patch',{kind:'sand',x:.15,y:.3,rx:.1,ry:.1}),/between/);assert.match(with1('wall',{kind:'tall',height:.03,points:[[.1,.3],[.105,.3]]})??objectProblem(flat,withObject(o,'wall',4,{kind:'tall',height:.03,points:[[.1,.3],[.105,.3]]})),/long/);
 // A tall wall across the board shuts the goal off; a low one is hoppable; a row of holes blocks too.
 const across=kind=>objectProblem(flat,withObject(o,'wall',4,{kind,height:kind==='low'?.01:.03,points:[[.004,.3],[.296,.3]]}));
 assert.match(across('tall'),/way from the start/);assert.equal(across('low'),null);
 let row=o;for(let k=0;k<11;k++)row=withObject(row,'hole',k,{x:.017+k*.0265,y:.3,r:.014});assert.equal(hasWay(flat,row),false);assert.match(objectProblem(flat,row),/way from the start/);
 let full=o;for(let k=0;k<=e.count.holes;k++)full=withObject(full,'hole',k,{x:.05+(k%6)*.04,y:.15+Math.floor(k/6)*.2,r:.009});assert.match(objectProblem(flat,full),/full/);
});
test('wall clearances hold just inside and pass just outside; every kind stays on the board',()=>{
 const o=objectsOf(flat),e=OBJECT_RULES,wall=(x,y)=>({kind:'tall',height:.03,points:[[x-.03,y],[x+.03,y]]}),at=w=>objectProblem(flat,withObject(o,'wall',4,w));
 const hole={x:.15,y:.25,r:.01},withHole=withObject(o,'hole',0,hole),atH=w=>objectProblem(flat,withObject(withHole,'wall',4,w));
 // Put the wall's middle (not a vertex) at distance d below each protected point.
 for(const [q,r,check] of [[o.start,e.startClear,at],[hole,hole.r+e.extra,atH],[o.goal,o.goal.r+e.extra,at]]){assert.match(check(wall(q.x,q.y-r+.001))??'',/clear of/);assert.equal(check(wall(q.x,q.y-r-.002)),null);}
 assert.match(at(wall(.02,.2)),/on the board/);assert.match(objectProblem(flat,withObject(o,'hole',0,{x:.005,y:.2,r:.009})),/on the board/);
 assert.match(objectProblem(flat,withObject(o,'patch',0,{kind:'sand',x:-.001,y:.2,rx:.02,ry:.02})),/on the board/);
 assert.match(objectProblem(flat,{...o,start:{x:.005,y:.2}}),/start stays on the board/);assert.match(objectProblem(flat,{...o,goal:{x:.29,y:.3,r:.015}}),/goal ring stays on the board/);
 // A patch over the start (resin holds a ball at rest against any tilt) is refused.
 assert.match(objectProblem(flat,withObject(o,'patch',0,{kind:'resin',x:o.start.x+.03,y:o.start.y,rx:.02,ry:.02})),/clear of the start/);
 assert.equal(objectProblem(flat,withObject(o,'patch',0,{kind:'resin',x:o.start.x+.05,y:o.start.y+.02,rx:.02,ry:.02})),null);
});
test('the way to the goal is checked for the largest ball, with a margin at wall tips',()=>{
 const o=objectsOf(flat),gap=g=>withObject(withObject(o,'wall',4,{kind:'tall',height:.03,points:[[.004,.3],[.15-g/2,.3]]}),'wall',5,{kind:'tall',height:.03,points:[[.15+g/2,.3],[.296,.3]]});
 assert.equal(hasWay(flat,gap(.013),.005),true);assert.equal(hasWay(flat,gap(.013)),false);assert.match(objectProblem(flat,gap(.013)),/every ball size/);
 assert.equal(hasWay(flat,gap(.0158)),false,'15.8 mm stops the 16 mm ball');assert.equal(objectProblem(flat,gap(.02)),null);
});
test('object edits undo, reset and reload exactly; returning to the layout restores the board itself',()=>{
 const s=new Sculptor(flat),a=add(s.objects,'hole',.15,.2);assert.ok(s.setObjects(a));assert.ok(s.edited);assert.notEqual(s.currentLevel(),flat);assert.equal(s.currentLevel(),s.currentLevel());
 const b=withObject(a,'hole',0,{...a.holes[0],x:.16});assert.ok(s.setObjects(b));assert.equal(s.setObjects(b),false);
 s.begin('dig','M',.1,.5);s.tick();s.tick();s.end();const saved=JSON.parse(JSON.stringify({...s.save(),objects:s.saveObjects().objects}));
 assert.ok(s.undo());assert.equal(s.strokes.length,0);assert.ok(s.undo());assert.deepEqual(s.objects,a);assert.ok(s.undo());assert.equal(s.currentLevel(),flat);assert.equal(s.undo(),false);
 const t=new Sculptor(flat);assert.ok(t.load(JSON.parse(JSON.stringify(saved))));assert.deepEqual(t.objects,b);assert.equal(t.strokes.length,1);
 assert.ok(t.reset());assert.equal(t.currentLevel(),flat);assert.ok(!t.edited);assert.ok(t.undo());assert.deepEqual(t.objects,b);
 // Removing the hole again is a change back to the board's own layout.
 assert.ok(t.setObjects(objectsOf(flat)));assert.equal(t.currentLevel(),flat);t.reset();
});
test('saved objects that break the rules or touch the border fall back; stage-08 wall saves migrate',()=>{
 const s=new Sculptor(flat),base=objectsOf(flat),v=s.save().v;
 const bad=[{...base,holes:[{x:base.start.x,y:base.start.y,r:.01}]},{...base,walls:base.walls.map((w,i)=>i?w:{...w,points:[[.01,.01],[.2,.01]]})},{...base,holes:[{x:.1,y:'x',r:.01}]},{...base,patches:[{kind:'lava',x:.1,y:.1,rx:.02,ry:.02}]}];
 for(const objects of bad){assert.ok(s.load({v,seed:'flat',strokes:[],objects}));assert.ok(!s.edited);}
 const r=new Sculptor(relief);assert.ok(r.load({v,seed:relief.seed,strokes:[],walls:{4:[0,-.04,0]}}));
 assert.deepEqual(r.objects.walls[4].points,transformWall(relief.walls[4],{dy:-.04}).points);assert.ok(r.undo());assert.ok(!r.edited);
});
test('on the relief, a moved goal ring leaves the summit and its per-ball tuning where they were built',()=>{
 const o=withObject(objectsOf(relief),'goal',0,{...relief.goal,x:relief.goal.x-.05,y:relief.goal.y-.02});assert.equal(objectProblem(relief,o),null);
 const moved=levelWith(relief,o);assert.deepEqual(moved.summit,relief.goal);assert.equal(moved.patches.length,2);
 // Resized balls rebuild their goal correction (not cached), so this exercises the centre.
 for(const material of ['steel','pingpong','billiard'])for(const size of [.6,1.4]){
  const a=newBall(material,'wood','wood',false,{size}).layout,b=newBall(material,'wood','wood',false,{level:moved,size}).layout,k=a.scale;
  for(const [dx,dy] of [[0,0],[.04,0],[-.03,.05],[0,-.07]])assert.deepEqual(b.terrain.sample((relief.goal.x+dx)*k,(relief.goal.y+dy)*k),a.terrain.sample((relief.goal.x+dx)*k,(relief.goal.y+dy)*k));
  assert.equal(b.goal.x,o.goal.x*k);}
});
test('dragging an object back to where it began leaves the board unedited',()=>{
 const s=new Sculptor(relief),o=s.objects;
 for(const [type,index] of [['goal',0],['start',0],['hole',0],['patch',1],['wall',5]]){const start=type==='goal'||type==='start'?o[type]:o[LISTS[type]][index];
  const back=dragged(type,start,'move',{x:.1,y:.2},{x:.1+.0001,y:.2-.0001});assert.equal(back,start);assert.equal(s.setObjects(withObject(o,type,index,back)),false);}
 assert.ok(!s.edited);assert.equal(s.currentLevel(),relief);
});
test('on the open board sculpting reaches everywhere, and a ball starts on sculpted ground',()=>{
 const s=new Sculptor(flat);assert.deepEqual(s.zones,[]);
 s.begin('pile','L',flat.start.x,flat.start.y);for(let k=0;k<30;k++)s.tick();s.end();
 const b=newBall('steel','wood','wood',false,{level:flat}),h=b.layout.terrain.sample(b.x,b.y).h;assert.ok(h>.002,'piled '+h);assert.ok(Math.abs(b.z-(b.r+h))<1e-15);
 s.reset();assert.equal(newBall('steel','wood','wood',false,{level:flat}).z,.005);
});
