import test from 'node:test';
import assert from 'node:assert/strict';
import {fitBoard} from '../dist/viewport.js';
import {Renderer,SURFACE_PALETTES,BALL_COLOURS,BALL_OUTLINE} from '../dist/render.js';
import {rollingVoice,impactVoice,SoundEngine} from '../dist/sound.js';
import {newBall,advance,STEP,BALLS,SURFACES,WALL_MATERIALS} from '../dist/physics.js';

test('portrait/landscape viewport fits preserve circles and cap backing resolution',()=>{
 for(const [w,h,dpr]of [[393,759,3],[360,640,2],[852,333,3],[1280,800,1],[320,480,1.25]]){
  const f=fitBoard(w,h,9/19,dpr);assert.ok(f.width<=w+1e-9&&f.height<=h+1e-9);assert.ok(Math.abs(f.width/f.height-9/19)<1e-12);assert.ok(f.pixelRatio<=2);assert.ok(f.pixelWidth<=w*2+1);assert.ok(f.pixelHeight<=h*2+1);
 }
});
test('audio maps rolling, airborne and ice slip states without a spurious ice rumble',()=>{
 const b=newBall('steel','ice');b.vx=.5;b.slip=0;assert.equal(rollingVoice(b).gain,0);b.slip=.4;assert.ok(rollingVoice(b).gain>0);b.grounded=false;assert.equal(rollingVoice(b).gain,0);
 b.grounded=true;for(const surface of Object.keys(SURFACES)){b.surface=surface;const p=rollingVoice(b);assert.ok(p.gain<=.12&&p.frequency>0);}
 for(const material of Object.keys(BALLS)){const e={impulse:.001,mass:.01,material,surface:'wood',kind:'wall'},p=impactVoice(e);assert.ok(p.gain>0&&p.duration>0);assert.ok(impactVoice({...e,impulse:.01}).gain>p.gain);assert.equal(impactVoice({...e,impulse:1e-7}),null);}
});
test('contact notifications report physical wall/rim impulses without changing trajectories',()=>{
 const a=newBall(),b=newBall(),events=[];for(const q of [a,b]){q.x=.265;q.y=.07;q.vx=.7;q.wy=q.vx/q.r;}
 for(let i=0;i<60;i++){advance(a,{x:0,y:0},STEP,{onContact:e=>events.push(e)});advance(b,{x:0,y:0},STEP);}
 assert.deepEqual(a,b);assert.ok(events.some(e=>e.kind==='wall'&&e.impulse>0&&e.time>0));assert.ok(events.every(e=>Number.isFinite(e.impulse)&&e.normalSpeed>.08));
 const quiet=newBall(),supports=[];for(let i=0;i<40;i++)advance(quiet,{x:0,y:0},STEP,{onContact:e=>supports.push(e)});assert.equal(supports.length,0);
 const rim=newBall(),rimHits=[];rim.x=.07;rim.y=.1;rim.vx=1.5;rim.wy=rim.vx/rim.r;
 for(let i=0;i<30;i++)advance(rim,{x:0,y:0},STEP,{walls:[],holes:[{x:.1,y:.1,r:.016}],goal:false,onContact:e=>rimHits.push(e)});
 assert.ok(rimHits.some(e=>e.kind==='rim'));
});
// Instrumented 2D context: verifies drawing execution/cache behaviour, not pixels.
function fakeCanvas(){const stats={draws:0,clears:0,strokes:0};const noop=(...args)=>{for(const v of args)if(typeof v==='number')assert.ok(Number.isFinite(v));};
 const ctx=new Proxy({stats,createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),drawImage(...a){stats.draws++;noop(...a);},clearRect(...a){stats.clears++;noop(...a);},stroke(){stats.strokes++;},createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop})},{get:(o,k)=>k in o?o[k]:noop});
 return{width:300,height:150,style:{},getContext:()=>ctx};
}
test('all material render paths run, surface textures cache, marks survive resizing',()=>{
 const oldDocument=globalThis.document,oldWindow=globalThis.window;
 globalThis.document={createElement:fakeCanvas};globalThis.window={devicePixelRatio:3};
 try{
  let rect={width:393,height:759};const r=new Renderer(fakeCanvas(),{getBoundingClientRect:()=>rect});const opts={phase:'running',now:10,fallStarted:0,fallHole:null,restartMs:800,running:true};
  for(const material of Object.keys(BALLS))for(const surface of Object.keys(SURFACES))for(const wall of Object.keys(WALL_MATERIALS)){
   const b=newBall(material,surface,wall);r.clearMarks();r.draw(b,{x:0,y:0},opts);const count=r.rebuilds;r.draw(b,{x:6,y:-3},opts);assert.equal(r.rebuilds,count);
   b.z+=b.r;r.draw(b,{x:6,y:-3},opts);r.draw(b,{x:6,y:-3},{...opts,phase:'falling',fallHole:0});
  }
  const b=newBall('steel','sand');r.clearMarks();r.draw(b,{x:0,y:0},opts);b.x+=.003;r.draw(b,{x:0,y:0},opts);assert.ok(r.marks.getContext('2d').stats.strokes>0);
  const copies=r.marks.getContext('2d').stats.draws;rect={width:393,height:680};r.resize();assert.ok(r.marks.getContext('2d').stats.draws>copies);assert.equal(r.dpr,2);
 }finally{globalThis.document=oldDocument;globalThis.window=oldWindow;}
});
test('a sculpt edit redraws its rectangle and keeps the cached texture; the brush overlay draws',async()=>{
 const {Sculptor,SCULPT}=await import('../dist/sculpt.js'),{reliefLevel}=await import('../dist/landscape.js');
 const oldDocument=globalThis.document,oldWindow=globalThis.window;
 globalThis.document={createElement:fakeCanvas};globalThis.window={devicePixelRatio:2};
 const sculptor=new Sculptor(reliefLevel());
 try{
  const r=new Renderer(fakeCanvas(),{getBoundingClientRect:()=>({width:393,height:759})}),opts={phase:'build',now:10,fallStarted:0,fallHole:null,restartMs:800,running:false};
  const b=newBall();r.draw(b,{x:0,y:0},opts);const builds=r.rebuilds,texture=r.texture.getContext('2d').stats.strokes,base=r.base.getContext('2d').stats.draws;
  sculptor.begin('dig','M',.2,.13);let rect=null;for(let k=0;k<5;k++)rect=sculptor.tick()??rect;sculptor.end();assert.ok(rect&&rect.x1>rect.x0);
  const puts=[],clips=[],arcs=[],W=.3,H=19/30;r.shade.getContext('2d').putImageData=(...a)=>puts.push(a);r.base.getContext('2d').rect=(...a)=>clips.push(a);r.canvas.getContext('2d').arc=(...a)=>arcs.push(a);
  // Partial redraw: a sub-rectangle of the shading image and a device-pixel clip, both covering the edit.
  r.terrainChanged(rect);const [,,,px,py,pw,ph]=puts.at(-1),[cx,cy,cw,ch]=clips.at(-1);
  assert.ok(pw<r.shade.width&&ph<r.shade.height&&px<=rect.x0/W*r.shade.width&&px+pw>=rect.x1/W*r.shade.width&&py<=rect.y0/H*r.shade.height&&py+ph>=rect.y1/H*r.shade.height);
  assert.ok(cw<r.base.width&&ch<r.base.height&&cx<=r.ox+rect.x0*r.scale&&cx+cw>=r.ox+rect.x1*r.scale&&cy<=r.oy+rect.y0*r.scale&&cy+ch>=r.oy+rect.y1*r.scale);
  // Full redraw after undo/reset: the whole image, no clip.
  r.terrainChanged();assert.deepEqual(puts.at(-1).slice(1),[0,0,0,0,r.shade.width,r.shade.height]);assert.equal(clips.length,1);
  assert.equal(r.rebuilds,builds);assert.equal(r.texture.getContext('2d').stats.strokes,texture);assert.equal(r.base.getContext('2d').stats.draws,base+4);
  r.draw(b,{x:0,y:0},{...opts,sculpt:{zones:sculptor.zones,brush:{x:.2,y:.13,R:SCULPT.sizes.M,tool:'dig',limited:true}}});
  const radii=arcs.map(a=>a[2]);assert.ok(radii.includes(SCULPT.sizes.M)&&radii.some(v=>Math.abs(v-SCULPT.sizes.M/Math.sqrt(5))<1e-12));for(const z of sculptor.zones)assert.ok(radii.includes(z.r0));
  r.canvas.getBoundingClientRect=()=>({left:0,top:0,width:r.canvas.width/r.dpr,height:r.canvas.height/r.dpr});
  const corner=r.toBoard(r.ox/r.dpr,r.oy/r.dpr),centre=r.toBoard(r.canvas.width/r.dpr/2,r.canvas.height/r.dpr/2);
  assert.ok(Math.abs(corner.x)<1e-9&&Math.abs(corner.y)<1e-9);assert.ok(Math.abs(centre.x-.15)<1e-9&&Math.abs(centre.y-19/60)<1e-9);
 }finally{sculptor.reset();globalThis.document=oldDocument;globalThis.window=oldWindow;}
});
test('a moved wall redraws only its rectangle; the Walls tool draws a handle per movable wall',async()=>{
 const {Sculptor}=await import('../dist/sculpt.js'),{reliefLevel}=await import('../dist/landscape.js'),{movableWalls,handleOf,wallClearances}=await import('../dist/walls.js');
 const oldDocument=globalThis.document,oldWindow=globalThis.window;globalThis.document={createElement:fakeCanvas};globalThis.window={devicePixelRatio:2};
 const sculptor=new Sculptor(reliefLevel());
 try{
  const r=new Renderer(fakeCanvas(),{getBoundingClientRect:()=>({width:393,height:759})}),opts={phase:'build',now:10,fallStarted:0,fallHole:null,restartMs:800,running:false},b=newBall();
  r.draw(b,{x:0,y:0},opts);const clips=[],arcs=[];r.base.getContext('2d').rect=(...a)=>clips.push(a);r.canvas.getContext('2d').arc=(...a)=>arcs.push(a);
  const draws=r.base.getContext('2d').stats.draws;r.setLevel(sculptor.currentLevel());assert.equal(r.base.getContext('2d').stats.draws,draws);
  const low=movableWalls(sculptor.level)[0],moved=sculptor.tryWall(low,{dx:0,dy:-.03,a:0});assert.ok(moved.ok);
  const lines=[],base=r.base.getContext('2d');base.lineTo=(x,y)=>lines.push([x,y]);
  r.setLevel(moved.level,{x0:0,y0:.3,x1:.3,y1:.4});assert.equal(r.level,moved.level);assert.equal(clips.length,1);assert.ok(clips[0][3]<r.base.height/4);
  // The moved wall is drawn where it now is, and the authored one is not.
  const has=p=>lines.some(([x,y])=>x===p[0]&&y===p[1]);assert.ok(moved.level.walls[low].points.slice(1).every(has));assert.ok(!sculptor.level.walls[low].points.slice(1).some(has));
  const level=r.level,handles=movableWalls(level).map(i=>handleOf(level.walls[i]));
  // A resized ball has its own relief (the goal correction depends on its radius).
  const builds=r.rebuilds;r.draw(newBall('steel','wood','wood',false,{size:1.3}),{x:0,y:0},opts);assert.equal(r.rebuilds,builds+1);
  r.draw(b,{x:0,y:0},{...opts,sculpt:{zones:wallClearances(level).map(z=>({x:z.x,y:z.y,r0:z.r})),brush:null,walls:{handles,active:level.walls[4].points,invalid:false}}});
  assert.equal(arcs.filter(a=>a[2]===.0055).length,handles.length);assert.ok(handles.every(([x,y])=>arcs.some(a=>a[0]===x&&a[1]===y)));
 }finally{globalThis.document=oldDocument;globalThis.window=oldWindow;}
});
class Param{constructor(){this.value=0;this.calls=[];}setValueAtTime(v,t){this.calls.push([v,t]);}linearRampToValueAtTime(v,t){this.calls.push([v,t]);}exponentialRampToValueAtTime(v,t){this.calls.push([v,t]);}setTargetAtTime(v,t){this.calls.push([v,t]);}cancelScheduledValues(){} }
class Node{constructor(){for(const k of ['gain','frequency','Q','threshold','knee','ratio','attack','release'])this[k]=new Param();this.starts=[];}connect(){}disconnect(){}start(t=0){this.starts.push(t);}stop(){} }
class Context{constructor(){this.currentTime=10;this.state='suspended';this.sampleRate=8000;this.destination={};this.nodes=[];}node(){const n=new Node();this.nodes.push(n);return n;}createGain(){return this.node();}createDynamicsCompressor(){return this.node();}createBufferSource(){return this.node();}createBiquadFilter(){return this.node();}createOscillator(){return this.node();}createBuffer(c,n){return{getChannelData:()=>new Float32Array(n)};}resume(){this.state='running';return Promise.resolve();}suspend(){this.state='suspended';return Promise.resolve();}}
test('audio uses context time, limits bursts, and stops effects on pause and hiding',async()=>{
 const oldWindow=globalThis.window;globalThis.window={AudioContext:Context};
 try{const sound=new SoundEngine();assert.equal(sound.ctx,null);await sound.unlock();assert.equal(sound.ctx.state,'running');
  const hit={kind:'wall',time:1.02,impulse:.01,normalSpeed:.5,mass:.014,material:'steel',surface:'wood'};
  sound.impacts([hit,{...hit,time:1.025}],1);assert.equal(sound.voices.size,1);const starts=sound.ctx.nodes.flatMap(n=>n.starts).filter(t=>t>0);assert.ok(starts.length===2&&starts.every(t=>t>=10.004&&t<10.06));
  sound.capture();assert.equal(sound.voices.size,2);sound.pause();assert.equal(sound.voices.size,0);sound.hide();assert.equal(sound.ctx.state,'suspended');sound.setEnabled(false);await sound.unlock();assert.equal(sound.ctx.state,'suspended');
 }finally{globalThis.window=oldWindow;}
});

test('every ball-floor palette has a 3:1 edge or highlight contrast cue',()=>{
 const luminance=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const contrast=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 for(const [ball,colours]of Object.entries(BALL_COLOURS))for(const [surface,floors]of Object.entries(SURFACE_PALETTES))for(const floor of floors){
  const l=luminance(floor),cue=Math.max(contrast(l,luminance(BALL_OUTLINE)),...colours.map(([,c])=>contrast(l,luminance(c))));assert.ok(cue>=3,ball+'/'+surface+': '+cue);
 }
});
