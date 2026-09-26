import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Heightfield,hermiteCell} from '../dist/terrain.js';
import {reliefLevel} from '../dist/landscape.js';
import {Sculptor,SCULPT,clay,flatLimit} from '../dist/sculpt.js';
import {newBall,advance,STEP,layoutFor,BALLS} from '../dist/physics.js';
import {G} from '../dist/materials.js';
const level=reliefLevel();
function rng(seed){let a=seed>>>0;return()=>{a=(1664525*a+1013904223)>>>0;return a/4294967296;};}
// One stroke of n brush ticks; path is a list of [x,y] visited in order.
function stroke(s,tool,size,path,n=path.length){s.begin(tool,size,...path[0]);for(let k=0;k<n;k++){const p=path[Math.min(k,path.length-1)];s.move(...p);s.tick();}return s.end();}
function cellsOf(field){return new Map([...field.cells].map(([k,c])=>[k,Float64Array.from(c)]));}
function sameCells(a,b){if(a.size!==b.size)return false;for(const [k,c] of a){const d=b.get(k);if(!d||d.some((v,i)=>v!==c[i]))return false;}return true;}
function measures(p){const mid=(p.dxx+p.dyy)/2,rad=Math.hypot((p.dxx-p.dyy)/2,p.dxy);return{slope:Math.hypot(p.dx,p.dy),crest:rad-mid,hollow:mid+rad};}

test('scripts and a fresh page see the validated relief with no edit layer',()=>{assert.equal(level.edits,undefined);});
// Replay applies stored alphas to stamps computed only with + - * / and Math.sqrt (plus
// abs/min/max/floor/ceil/round), which IEEE 754 fixes exactly. The projection may use
// anything, because its result is stored.
test('the brush and replay path use no engine-approximated Math',()=>{
 const source=readFileSync(new URL('../dist/sculpt.js',import.meta.url),'utf8'),start=source.indexOf('// Slope and Hessian of one cell polynomial'),end=source.indexOf('const psd=');
 const projection=source.indexOf(' // Samples every changed cell'),afterProjection=source.indexOf(' rect(delta)');
 assert.ok(start>0&&end>start&&projection>0&&afterProjection>projection);
 const replayPath=source.slice(0,start)+source.slice(end,projection)+source.slice(afterProjection);
 const banned=replayPath.match(/Math\.(exp|expm1|log\w*|pow|sin\w*|cos\w*|tan\w*|atan\w*|asin\w*|acos\w*|hypot|cbrt|random)\b|\*\*/g);
 assert.equal(banned,null,String(banned));
});
test('clay kernel has zero net volume and consistent node derivatives',()=>{
 const R=.06,a=.004,step=.0004;let volume=0,magnitude=0;
 for(let x=-R;x<=R;x+=step)for(let y=-R;y<=R;y+=step){const h=clay(x,y,0,0,R,a).h;volume+=h*step*step;magnitude+=Math.abs(h)*step*step;}
 assert.ok(Math.abs(volume)<1e-6*magnitude,`net ${volume} of ${magnitude}`);
 assert.ok(Math.abs(clay(0,0,0,0,R,a).h+a)<1e-18);assert.ok(clay(0,0,0,0,R,-a).h>0);
 const e=1e-6,r=rng(3);for(let k=0;k<200;k++){const x=(r()-.5)*1.6*R,y=(r()-.5)*1.6*R,p=clay(x,y,0,0,R,a),h=(u,v)=>clay(u,v,0,0,R,a).h;
  assert.ok(Math.abs(p.dx-(h(x+e,y)-h(x-e,y))/(2*e))<1e-7);assert.ok(Math.abs(p.dy-(h(x,y+e)-h(x,y-e))/(2*e))<1e-7);
  assert.ok(Math.abs(p.dxy-(h(x+e,y+e)-h(x+e,y-e)-h(x-e,y+e)+h(x-e,y-e))/(4*e*e))<2e-4);}
});
test('flat-ground limits follow the slope and curvature bounds',()=>{
 for(const [size,R] of Object.entries(SCULPT.sizes))for(const tool of ['dig','pile']){
  const A=flatLimit(R,tool);let slope=0,crest=0,hollow=0;const sign=tool==='pile'?-1:1;
  for(let x=-R;x<=R;x+=R/200){const p=clay(x,0,0,0,R,sign*A),e=1e-6,h=u=>clay(u,0,0,0,R,sign*A).h,dxx=(h(x+e)-2*p.h+h(x-e))/(e*e),radial=x?p.dx/x:dxx;
   slope=Math.max(slope,Math.abs(p.dx));crest=Math.max(crest,-dxx,-radial);hollow=Math.max(hollow,dxx,radial);}
  assert.ok(slope<=SCULPT.slope*1.002&&crest<=SCULPT.crest*1.002&&hollow<=SCULPT.concave*1.002,`${size} ${tool}`);
  assert.ok(Math.max(slope/SCULPT.slope,crest/SCULPT.crest,hollow/SCULPT.concave)>.99,`${size} ${tool} is not at a bound`);
 }
});
test('edit cells equal the shared Hermite construction, and local updates equal a full rebuild',()=>{
 const s=new Sculptor(level);stroke(s,'dig','M',[[.12,.25],[.15,.28],[.19,.33]],12);stroke(s,'pile','S',[[.20,.30]],10);
 const f=s.edits,N=f.nodes,stride=f.nx+1,node=(i,j)=>{const b=4*(j*stride+i);return{h:N[b],dx:N[b+1],dy:N[b+2],dxy:N[b+3]};};
 for(const [key,c] of f.cells){const i=key%f.nx,j=(key-i)/f.nx,d=hermiteCell(node(i,j),node(i+1,j),node(i,j+1),node(i+1,j+1),f.sx,f.sy),scale=Math.max(...d.map(Math.abs));
  assert.ok(c.every((v,k)=>Math.abs(v-d[k])<=1e-12*scale));}
 const full=new Heightfield((x,y)=>node(Math.round(x/f.sx),Math.round(y/f.sy)),f.width,f.height,.0025),r=rng(5);
 for(let k=0;k<2000;k++){const x=.08+r()*.16,y=.20+r()*.18,a=f.sample(x,y),b=full.sample(x,y);assert.ok(Math.abs(a.h-b.h)<1e-15&&Math.abs(a.dx-b.dx)<1e-12&&Math.abs(a.dxx-b.dxx)<1e-9);}
 s.reset();
});
test('without edits every ball samples the validated relief bit for bit',()=>{
 const s=new Sculptor(level),r=rng(11);
 for(let k=0;k<300;k++){const x=r()*.3,y=r()*level.height;assert.deepEqual(layoutFor('steel').terrain.sample(x,y),level.field.sample(x,y));}
 for(const material of Object.keys(BALLS)){const l=layoutFor(material);for(let k=0;k<300;k++){const x=r()*l.width,y=r()*l.height;assert.deepEqual(l.terrain.sample(x,y),l.pristine.sample(x,y));}}
 stroke(s,'dig','M',[[.20,.13]],10);const l=layoutFor('billiard'),far=l.terrain.sample(.10*l.scale,.45*l.scale);assert.deepEqual(far,l.pristine.sample(.10*l.scale,.45*l.scale));
 const near=l.terrain.sample(.20*l.scale,.13*l.scale);assert.ok(near.h<l.pristine.sample(.20*l.scale,.13*l.scale).h);
 s.reset();
});
// The projection samples 3x3 points per cell; between them the crest curvature was
// measured up to 1.1% over its bound (slope 0.02%).
test('every ball sees the edits in its own units: heights times scale, curvature over scale',()=>{
 const s=new Sculptor(level);stroke(s,'dig','M',[[.17,.44],[.19,.46]],25);const r=rng(13);let checked=0;
 for(const material of Object.keys(BALLS)){const l=layoutFor(material),k=l.scale;
  for(let n=0;n<200;n++){const x=.13+r()*.1,y=.40+r()*.1,q=s.edits.sample(x,y);if(!q.h)continue;checked++;
   const t=l.terrain.sample(x*k,y*k),p=l.pristine.sample(x*k,y*k),e={h:q.h*k,dx:q.dx,dy:q.dy,dxx:q.dxx/k,dxy:q.dxy/k,dyy:q.dyy/k};
   for(const key in e)assert.ok(Math.abs(t[key]-p[key]-e[key])<=1e-10*(Math.abs(e[key])+Math.abs(p[key]))+1e-18,`${material} ${key}`);}}
 assert.ok(checked>500);s.reset();
});
test('a long hold reaches the slope bound and stops there, for every brush',()=>{
 for(const size of Object.keys(SCULPT.sizes))for(const tool of ['dig','pile']){const s=new Sculptor(level);stroke(s,tool,size,[[.15,.45]],80);
  let worst=0;const base=level.field,e=s.edits;
  for(const key of e.cells.keys()){const i=key%e.nx,j=(key-i)/e.nx;for(const u of [0,.5,1])for(const v of [0,.5,1]){const b=base.sampleCell(i,j,u,v),d=e.sampleCell(i,j,u,v);worst=Math.max(worst,Math.hypot(b.dx+d.dx,b.dy+d.dy)/Math.max(SCULPT.slope,Math.hypot(b.dx,b.dy)));}}
  assert.ok(worst>.99&&worst<1.002,`${size} ${tool}: ${worst}`);s.reset();}
});
// With the real bounds a press always meets the crest bound first, so this test lifts
// the crest bound on its own instance to exercise the hollow check.
test('the hollow bound limits a narrow press before the slope bound does',()=>{
 const s=new Sculptor(level,{crest:1000}),R=.02,delta=s.brush([[level.pocket.x,level.pocket.y]],R,.002),alpha=s.project(delta);s.edits.add(delta,alpha);
 const base=level.field,e=s.edits;let hollow=0,slope=0;
 for(const key of e.cells.keys()){const i=key%e.nx,j=(key-i)/e.nx;for(const u of [0,.5,1])for(const v of [0,.5,1]){const b=base.sampleCell(i,j,u,v),d=e.sampleCell(i,j,u,v),m=measures({dx:b.dx+d.dx,dy:b.dy+d.dy,dxx:b.dxx+d.dxx,dxy:b.dxy+d.dxy,dyy:b.dyy+d.dyy});hollow=Math.max(hollow,m.hollow/SCULPT.concave);slope=Math.max(slope,m.slope/SCULPT.slope);}}
 assert.ok(alpha>0&&alpha<1);assert.ok(hollow>.99&&hollow<1.002,'hollow '+hollow);assert.ok(slope<.99,'slope '+slope);s.edits.clear();
});
test('the keep-out fade carries consistent node derivatives',()=>{
 const s=new Sculptor(level),h=level.holes[0],z=s.zones[2],R=SCULPT.sizes.L,d=s.brush([[h.x+z.r0+.012,h.y]],R,.003),f=level.field,w=d.i1-d.i0+1,node=(i,j,k)=>d.v[4*((j-d.j0)*w+i-d.i0)+k];
 // Central differences of the masked heights (2.5 mm spacing) agree with the stored
 // derivatives to 2.5% (slopes) and 7% (cross term) of their largest values; a missing
 // product-rule term would be off by the order of the values themselves.
 const error=[0,0,0],largest=[0,0,0];let checked=0;
 for(let j=d.j0+1;j<d.j1;j++)for(let i=d.i0+1;i<d.i1;i++){const x=i*f.sx,y=j*f.sy,r=Math.hypot(x-z.x,y-z.y);if(r<=z.r0+.003||r>=z.r1-.003)continue;
  const fd=[(node(i+1,j,0)-node(i-1,j,0))/(2*f.sx),(node(i,j+1,0)-node(i,j-1,0))/(2*f.sy),(node(i+1,j+1,0)-node(i+1,j-1,0)-node(i-1,j+1,0)+node(i-1,j-1,0))/(4*f.sx*f.sy)];
  fd.forEach((v,k)=>{error[k]=Math.max(error[k],Math.abs(v-node(i,j,k+1)));largest[k]=Math.max(largest[k],Math.abs(node(i,j,k+1)));});checked++;}
 assert.ok(checked>50,'checked '+checked);assert.ok(error[0]<.05*largest[0]&&error[1]<.05*largest[1]&&error[2]<.15*largest[2],JSON.stringify({error,largest}));
});
test('projected edits stay within slope, crest and hollow bounds, or no worse than the relief',()=>{
 const s=new Sculptor(level),r=rng(7);
 for(let k=0;k<24;k++){const size='SML'[Math.floor(r()*3)],tool=r()<.6?'dig':'pile',x=.03+r()*.24,y=.03+r()*.57,path=[[x,y]];
  if(r()<.5)for(let m=1;m<8;m++)path.push([x+.004*m,y+(r()-.5)*.02]);stroke(s,tool,size,path,6+Math.floor(r()*20));}
 const base=level.field,e=s.edits;let worst=0;
 for(const key of e.cells.keys()){const i=key%e.nx,j=(key-i)/e.nx;for(const u of [0,.25,.5,.75,1])for(const v of [0,.25,.5,.75,1]){
  const b=base.sampleCell(i,j,u,v),d=e.sampleCell(i,j,u,v),B=measures(b),C=measures({dx:b.dx+d.dx,dy:b.dy+d.dy,dxx:b.dxx+d.dxx,dxy:b.dxy+d.dxy,dyy:b.dyy+d.dyy});
  worst=Math.max(worst,C.slope/Math.max(SCULPT.slope,B.slope),C.crest/Math.max(SCULPT.crest,B.crest),C.hollow/Math.max(SCULPT.concave,B.hollow));}}
 assert.ok(worst<1.02,'worst bound ratio '+worst);assert.ok(e.cells.size>1000);
 s.reset();
});
// Nodes inside r0 are exactly zero, so every Hermite cell lying wholly inside r0 is
// untouched: that covers radius r0 minus one cell diagonal (3.53 mm).
test('start shelf, goal summit and hole rims stay pristine; summit timing holds for every ball',()=>{
 const s=new Sculptor(level);
 for(const p of [level.start,level.goal,...level.holes])for(const tool of ['dig','pile'])stroke(s,tool,'L',[[p.x,p.y],[p.x+.02,p.y+.01]],30);
 assert.ok(s.edits.cells.size>0);
 // The goal zone spans the whole per-ball goal blend (83 mm), so every ball's field,
 // including its goal correction, is untouched there.
 const inner=z=>z.r0-Math.hypot(level.field.sx,level.field.sy);assert.ok(inner(s.zones[1])>=.083);
 for(const material of Object.keys(BALLS)){const l=layoutFor(material),k=l.scale;
  for(const z of s.zones)for(let a=0;a<6.28;a+=.4)for(const f of [0,.5,1]){const d=f*inner(z),x=(z.x+d*Math.cos(a))*k,y=(z.y+d*Math.sin(a))*k;assert.deepEqual(l.terrain.sample(x,y),l.pristine.sample(x,y));}}
 for(const material of Object.keys(BALLS)){const b=newBall(material),l=layoutFor(material),p=l.terrain.sample(l.goal.x,l.goal.y),tau=Math.sqrt((1+BALLS[material].inertiaRatio)*(-1/p.dxx+b.r)/G);assert.ok(Math.abs(tau-.7)<.003,material);assert.ok(Math.abs(l.terrain.sample(l.start.x,l.start.y).h)<1e-8);}
 s.reset();
});
test('an edge press is mirrored: zero net volume and a level edge',()=>{
 const s=new Sculptor(level);stroke(s,'dig','M',[[.012,.30]],8);
 const f=s.edits,step=.0005;let volume=0,magnitude=0;for(let x=step/2;x<.08;x+=step)for(let y=.23+step/2;y<.37;y+=step){const h=f.sample(x,y).h;volume+=h*step*step;magnitude+=Math.abs(h)*step*step;}
 assert.ok(magnitude>0&&Math.abs(volume)<1e-4*magnitude,`net ${volume} of ${magnitude}`);
 for(let y=.25;y<=.35;y+=.005)assert.ok(Math.abs(f.sample(0,y).dx)<1e-12);
 s.reset();
});
test('undo, reset and reload rebuild the edit layer bit for bit',()=>{
 const s=new Sculptor(level);stroke(s,'dig','M',[[.10,.20],[.13,.24]],15);const one=cellsOf(s.edits);
 stroke(s,'pile','L',[[.20,.45],[.18,.40],[.16,.36]],15);const two=cellsOf(s.edits),saved=JSON.parse(JSON.stringify(s.save()));
 assert.ok(s.undo());assert.ok(sameCells(one,cellsOf(s.edits)));
 assert.ok(s.undo());assert.equal(s.edits.cells.size,0);assert.equal(s.undo(),false);
 const t=new Sculptor(level);assert.ok(t.load(saved));assert.ok(sameCells(two,cellsOf(t.edits)));
 assert.ok(t.reset());assert.equal(t.edits.cells.size,0);assert.ok(!t.edited);assert.ok(t.undo());assert.ok(sameCells(two,cellsOf(t.edits)));
 t.reset();
});
test('stroke loading refuses another level, malformed strokes and out-of-range points',()=>{
 const s=new Sculptor(level);stroke(s,'dig','S',[[.1,.2]],4);const good=JSON.parse(JSON.stringify(s.save()));s.reset();
 const variants=[{...good,seed:good.seed+1},{...good,v:2},{...good,strokes:[{...good.strokes[0],tool:'blast'}]},{...good,strokes:[{...good.strokes[0],size:'XL'}]},
  {...good,strokes:[{...good.strokes[0],size:'constructor'}]},{...good,strokes:[{...good.strokes[0],ticks:[['0.5',200,400]]}]},
  {...good,strokes:[{...good.strokes[0],ticks:[[1.5,200,400]]}]},{...good,strokes:[{...good.strokes[0],ticks:[[.5,200.5,400]]}]},{...good,strokes:[{...good.strokes[0],ticks:[[.5,999,400]]}]},{...good,strokes:[{...good.strokes[0],ticks:[[.5,200]]}]},null,'x'];
 for(const v of variants){assert.equal(s.load(v),false,JSON.stringify(v));assert.equal(s.edits.cells.size,0);}
 assert.ok(s.load(good));s.reset();
});
test('a dug hollow holds a ball released inside its rim; the pristine slope lets it roll away',()=>{
 const s=new Sculptor(level),x=.07,y=.56,release=b=>{b.x=x+.035;b.y=y;b.z=layoutFor('steel').terrain.sample(b.x,b.y).h+b.r;return b;};
 const free=release(newBall());let away=0;for(let i=0;i<8/STEP;i++){advance(free,{x:0,y:0},STEP,{holes:[],goal:false,patches:false});away=Math.max(away,Math.hypot(free.x-x,free.y-y));}
 assert.ok(away>.06,'pristine travel '+away);
 stroke(s,'dig','L',[[x,y]],60);const l=layoutFor('steel'),dip=l.terrain.sample(x,y).h-l.pristine.sample(x,y).h;assert.ok(dip<-.005,'dip '+dip);
 const b=release(newBall());let far=0;for(let i=0;i<8/STEP;i++){advance(b,{x:0,y:0},STEP,{holes:[],goal:false,patches:false});far=Math.max(far,Math.hypot(b.x-x,b.y-y));}
 assert.ok(far<SCULPT.sizes.L*Math.sqrt(.4),'crossed the berm crest: '+far);
 s.reset();
});
