import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {newBall,advance,STEP,layoutFor,BALLS,CONTACTS,kineticEnergy} from '../dist/physics.js';
import {reliefLevel,RELIEF} from '../dist/landscape.js';import {G} from '../dist/materials.js';
import {structural,pocketTrial} from '../scripts/validate-relief.mjs';
const free={terrain:false,patches:false,holes:[],goal:false,bounds:false,air:false};
test('Saddle and Basin meets slope, crest, pass and drainage geometry gates',()=>{const r=structural(reliefLevel());assert.ok(r.accepted,JSON.stringify(r));assert.equal(reliefLevel().holes.length,2);});
test('all physical ball sizes keep the summit e-folding time at 0.7 seconds',()=>{for(const material of Object.keys(BALLS)){const b=newBall(material),l=layoutFor(material),p=l.terrain.sample(l.goal.x,l.goal.y),rc=-1/p.dxx,tau=Math.sqrt((1+BALLS[material].inertiaRatio)*(rc+b.r)/G);assert.ok(Math.abs(tau-.7)<.003);assert.ok(Math.hypot(p.dx,p.dy)<1e-7);}});
test('jump table: three run-up speeds across 2r, 4r and 6r wall heights',()=>{
 for(const speed of [.3,.5,.8])for(const radii of [2,4,6]){const b=newBall(),x=.1,wallX=.12,t=(wallX-x)/speed,vz=.65,top=radii*b.r,predicted=vz*t-.5*G*t*t>top;
  b.x=x;b.y=.10;b.z=b.r+.000001;b.vx=speed;b.vz=vz;b.grounded=false;let contact=false;
  for(let i=0;i<Math.ceil((t+.025)/STEP);i++)advance(b,{x:0,y:0},STEP,{...free,walls:[{points:[[wallX,.05],[wallX,.15]],height:top}],onContact:e=>{if(e.kind==='wall'||e.kind==='rim')contact=true;}});
  assert.equal(!contact,predicted,`${speed} m/s, ${radii}r`);
 }
});
test('the pocket confines exit-directed 8 degree tilt for 30s and the reference pulse frees it',()=>{assert.ok(pocketTrial().accepted);});
test('resin holds both balls at 8 degrees; steel slides and rubber grips under the same pulse',()=>{
 const results={};for(const material of ['steel','rubber']){const b=newBall(material),l=layoutFor(material),p=l.patches.find(p=>p.kind==='resin');b.x=p.x;b.y=p.y;b.z=b.r;
  const options={...free,walls:[],patches:true};for(let i=0;i<240;i++)advance(b,{x:8,y:0},STEP,options);assert.ok(Math.abs(b.x-p.x)<1e-10);
  for(let i=0;i<24;i++)advance(b,{x:8,y:0},STEP,{...options,acceleration:{x:-5,y:0,z:0}});assert.ok(b.x>p.x+.003);results[material]=b.x-p.x;
 }assert.ok(results.steel>results.rubber);
});
test('drainage holes are minima and remain at least three radii from saddles',()=>{const l=reliefLevel();for(const h of l.holes){const p=l.field.sample(h.x,h.y);assert.ok(Math.hypot(p.dx,p.dy)<1e-7);assert.ok(p.dxx>0&&p.dxx*p.dyy>p.dxy*p.dxy);for(const q of l.drainage.critical.filter(q=>q.type==='saddle'))assert.ok(Math.hypot(h.x-q.x,h.y-q.y)>=3*RELIEF.radius);}});
test('published validation evidence records every trial and no fabricated phone result',()=>{const r=JSON.parse(readFileSync(new URL('../dist/relief-validation.json',import.meta.url)));assert.ok(r.accepted);for(const s of r.bots.scenarios)assert.equal(s.trials.length,10);assert.equal(r.bots.scenarios.find(s=>s.material==='steel').successes,10);assert.ok(r.bots.scenarios.every(s=>s.successes>=7));assert.ok(r.rejectedHandmade.rejected);assert.ok(r.phoneTests.every(p=>p.status==='pending'&&p.sampleRate===null));assert.equal(r.endorsement.endorser,null);});
