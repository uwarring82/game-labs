import {W,H,R,clamp,layoutFor} from './physics.js';
import {reliefLevel} from './landscape.js';
import {fitBoard} from './viewport.js';
import {GOAL_DWELL} from './terrain.js';
export const SURFACE_PALETTES={wood:['#d6b07c','#b68a56'],sand:['#d9c191','#b9a072'],ice:['#82b6ca','#6096b0'],baize:['#176b58','#114d42']};
export const BALL_COLOURS={steel:[[0,'#ffffff'],[.22,'#e5ece8'],[.48,'#a0aaa7'],[.7,'#3f4c47'],[.86,'#bfccc5'],[1,'#344c45']],rubber:[[0,'#b2caff'],[.4,'#6593ee'],[1,'#264a94']],pingpong:[[0,'#ffffff'],[.6,'#f6f4e9'],[1,'#b5b3a8']],cork:[[0,'#e6c094'],[.4,'#bd8650'],[1,'#795430']],billiard:[[0,'#ffffff'],[.4,'#f1e6c9'],[1,'#9d926f']]};
export const BALL_OUTLINE='#172a23';
const makeCanvas=()=>document.createElement('canvas');
const CONTOUR_STEP=.0025;
const circle=(c,x,y,r,fill)=>{c.beginPath();c.arc(x,y,Math.max(0,r),0,Math.PI*2);c.fillStyle=fill;c.fill();};
const rounded=(c,x,y,w,h,r,fill)=>{c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();};
const turn=(q,v)=>{const [a,b,c,d]=q,[x,y,z]=v,tx=2*(c*z-d*y),ty=2*(d*x-b*z),tz=2*(b*y-c*x);return[x+a*tx+c*tz-d*ty,y+a*ty+d*tx-b*tz,z+a*tz+b*ty-c*tx];};
const DOTS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const SPECKLES=Array.from({length:64},(_,i)=>{const z=1-2*(i+.5)/64,a=i*2.39996323,t=Math.sqrt(1-z*z);return[t*Math.cos(a),t*Math.sin(a),z];});
export class Renderer{
 constructor(canvas,wrap){this.canvas=canvas;this.wrap=wrap;this.ctx=canvas.getContext('2d',{alpha:false});this.base=makeCanvas();this.texture=makeCanvas();this.marks=makeCanvas();this.shade=makeCanvas();this.shade.width=180;this.shade.height=380;this.intervals=new Map();this.level=reliefLevel();this.key='';this.textureKey='';this.previous=null;this.rebuilds=0;this.resize();}
 resize(){const rect=this.wrap.getBoundingClientRect(),f=fitBoard(rect.width,rect.height,W/H,window.devicePixelRatio);
  if(this.canvas.width===f.pixelWidth&&this.canvas.height===f.pixelHeight&&this.dpr===f.pixelRatio)return;
  const old=this.marks.width>1?makeCanvas():null;if(old){old.width=this.marks.width;old.height=this.marks.height;old.getContext('2d').drawImage(this.marks,0,0);}
  this.dpr=f.pixelRatio;this.canvas.style.width=`${f.pixelWidth/f.pixelRatio}px`;this.canvas.style.height=`${f.pixelHeight/f.pixelRatio}px`;
  for(const c of [this.canvas,this.base,this.texture,this.marks]){c.width=f.pixelWidth;c.height=f.pixelHeight;}
  this.scale=Math.min(f.pixelWidth/W,f.pixelHeight/H);this.ox=(f.pixelWidth-W*this.scale)/2;this.oy=(f.pixelHeight-H*this.scale)/2;
  if(old)this.marks.getContext('2d').drawImage(old,0,0,this.marks.width,this.marks.height);
  this.key='';this.textureKey='';this.previous=null;
 }
 transform(c){c.setTransform(this.scale,0,0,this.scale,this.ox,this.oy);}
 // Client (CSS) coordinates to base-board metres.
 toBoard(clientX,clientY){const r=this.canvas.getBoundingClientRect(),k=this.canvas.width/(r.width||1);return{x:((clientX-r.left)*k-this.ox)/this.scale,y:((clientY-r.top)*k-this.oy)/this.scale};}
 clearMarks(){const c=this.marks.getContext('2d');c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,this.marks.width,this.marks.height);this.previous=null;}
 // Layers: surface texture (per surface and size), relief (shading image and contour
 // heights, per material and terrain edit) and vector overlays, composited into base.
 // layout is the ball's (material and size); id names it for the relief caches.
 rebuild(surface,wallMaterial,layout,openEdges,id,key){
  this.view={surface,wallMaterial,layout,openEdges,id};
  if(this.textureKey!==`${surface}/${this.base.width}x${this.base.height}`)this.paintTexture(surface);
  this.relief(layout,id);this.composite();
  this.rebuilds++;this.key=key;
 }
 // Walls, holes, start and goal are drawn from the level in base coordinates. A moved
 // wall redraws only the given rectangle, or the whole board.
 setLevel(level,rect=null){if(level===this.level)return;this.level=level;if(this.view)this.composite(rect);}
 // Sculpt: redraw only the relief under an edit (base coordinates), or all of it.
 terrainChanged(rect=null){
  if(!this.view)return;const m=.004,r=rect&&{x0:rect.x0-m,y0:rect.y0-m,x1:rect.x1+m,y1:rect.y1+m};
  this.relief(this.view.layout,this.view.id,r);this.composite(r);
 }
 paintTexture(surface){const c=this.texture.getContext('2d');c.setTransform(1,0,0,1,0,0);c.fillStyle='#101714';c.fillRect(0,0,this.texture.width,this.texture.height);this.transform(c);
  const palette=SURFACE_PALETTES[surface];
  const g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,palette[0]);g.addColorStop(1,palette[1]);c.fillStyle=g;c.fillRect(0,0,W,H);
  // Deterministic multiscale procedural texture. Built only after resize/surface change.
  let seed=19473;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  if(surface==='wood'){
   for(const [step,alpha,amp] of [[.002,'13',.002],[.009,'17',.004],[.035,'10',.006]]){
    c.lineWidth=step*.12;c.strokeStyle='#684424'+alpha;
    for(let x=-.02;x<W+.02;x+=step){c.beginPath();c.moveTo(x,0);for(let y=0;y<=H;y+=.004)c.lineTo(x+amp*Math.sin(y*23+x*49)+amp*.15*Math.sin(y*97),y);c.stroke();}
   }
  }else if(surface==='sand'){
   for(let i=0;i<7500;i++){const a=rand(),x=rand()*W,y=rand()*H,size=.0002+rand()*.0005;c.fillStyle=a<.5?'#624b3230':'#fff4d530';c.fillRect(x,y,size,size);}
  }else if(surface==='ice'){
   c.lineWidth=.0004;c.strokeStyle='#e4f9ff25';for(let i=0;i<65;i++){const x=rand()*W,y=rand()*H;c.beginPath();c.moveTo(x,y);c.lineTo(x+.002,y+.01+rand()*.03);c.stroke();}
  }else{
   // Matte baize: restrained grain, without expensive per-frame weave drawing.
   for(let i=0;i<6000;i++){c.fillStyle=i%2?'#d0f1d80b':'#042e2512';c.fillRect(rand()*W,rand()*H,.00035,.0005);}
  }
  this.textureKey=`${surface}/${this.texture.width}x${this.texture.height}`;
 }
 composite(rect=null){const c=this.base.getContext('2d'),{surface,wallMaterial,openEdges}=this.view,{start,goal,holes,walls,patches}=this.level;
  c.save();c.setTransform(1,0,0,1,0,0);
  if(rect){const x0=Math.floor(this.ox+rect.x0*this.scale),y0=Math.floor(this.oy+rect.y0*this.scale),x1=Math.ceil(this.ox+rect.x1*this.scale),y1=Math.ceil(this.oy+rect.y1*this.scale);c.beginPath();c.rect(x0,y0,x1-x0,y1-y0);c.clip();}
  c.drawImage(this.texture,0,0);this.transform(c);c.drawImage(this.shade,0,0,W,H);this.contours(c,surface,rect);
  c.textAlign='center';c.fillStyle=surface==='baize'?'#c4d2b2':'#263e36aa';c.font='500 .0045px system-ui';
  c.strokeStyle=surface==='baize'?'#c4d2b266':'#263e3655';c.lineWidth=.0006;c.beginPath();c.arc(start.x,start.y,R+.003,0,Math.PI*2);c.stroke();
  for(const h of holes){circle(c,h.x,h.y,h.r+.0017,'#ede0b950');circle(c,h.x,h.y,h.r+.001,'#5b472b');const g=c.createRadialGradient(h.x-.003,h.y-.004,.001,h.x,h.y,h.r);g.addColorStop(0,'#030908');g.addColorStop(.65,'#0e1915');g.addColorStop(1,'#364234');circle(c,h.x,h.y,h.r,g);c.beginPath();c.arc(h.x,h.y,h.r,Math.PI*.08,Math.PI*.85);c.strokeStyle='#e7d7a36b';c.lineWidth=.0008;c.stroke();}
  circle(c,goal.x,goal.y,goal.r,surface==='baize'?'#b5914f55':'#416c5055');c.strokeStyle='#dcebc0';c.lineWidth=.0012;c.beginPath();c.arc(goal.x,goal.y,goal.r-.003,0,Math.PI*2);c.stroke();c.font='600 .005px system-ui';c.fillStyle='#f2f6dd';
  for(const patch of patches){c.save();c.beginPath();c.ellipse(patch.x,patch.y,patch.rx,patch.ry,-.15,0,Math.PI*2);c.clip();c.fillStyle=patch.kind==='sand'?'#d5b877bb':'#bd6d18aa';c.fillRect(patch.x-patch.rx,patch.y-patch.ry,patch.rx*2,patch.ry*2);c.strokeStyle=patch.kind==='sand'?'#f4db9b66':'#f5c75b88';c.lineWidth=.0008;c.stroke();c.restore();}
  for(const w of openEdges?walls.filter(w=>w.kind!=='border'):walls){
   const line=(dx,dy,width,col)=>{c.beginPath();w.points.forEach(([x,y],i)=>i?c.lineTo(x+dx,y+dy):c.moveTo(x+dx,y+dy));c.lineWidth=width;c.strokeStyle=col;c.lineCap='round';c.lineJoin='round';c.stroke();};
   line(w.height*.25,w.height*.4,w.kind==='low'?.0025:.005,'#10221b66');
   line(0,0,w.kind==='low'?.002:.004,wallMaterial==='rubber'?'#a54b3e':w.kind==='pocket'?'#503921':'#876439');
   line(-.00045,-.00055,.0008,wallMaterial==='rubber'?'#e68c73':'#f5d19a');
  }
  c.restore();
 }
 relief(layout,id,rect=null){
  const scale=layout.scale,field=layout.terrain,IW=this.shade.width,IH=this.shade.height,ctx=this.shade.getContext('2d');
  this.pixels??=ctx.createImageData(IW,IH);const data=this.pixels.data;
  const px0=rect?Math.max(0,Math.floor(rect.x0/W*IW)):0,px1=rect?Math.min(IW,Math.ceil(rect.x1/W*IW)):IW,py0=rect?Math.max(0,Math.floor(rect.y0/H*IH)):0,py1=rect?Math.min(IH,Math.ceil(rect.y1/H*IH)):IH;
  for(let y=py0;y<py1;y++)for(let x=px0;x<px1;x++){
   const bx=(x+.5)*W/IW,by=(y+.5)*H/IH,p=field.sample(bx*scale,by*scale),i=(y*IW+x)*4;
   if(Math.abs(p.dx)+Math.abs(p.dy)<1e-10){data[i+3]=0;continue;}
   const gain=20;
   const nx=-p.dx*gain,ny=-p.dy*gain,l=Math.hypot(nx,ny,1),light=(-.45*nx-.60*ny+.66)/l-.66;
   const col=light>0?[255,248,221]:[8,23,29];
   data[i]=col[0];data[i+1]=col[1];data[i+2]=col[2];data[i+3]=Math.round(Math.min(.30,Math.abs(light)*.55)*255);
  }
  if(px1>px0&&py1>py0)ctx.putImageData(this.pixels,0,0,px0,py0,px1-px0,py1-py0);
  // Contour heights on a 2.5 mm grid, on the same potential as the solver.
  const step=CONTOUR_STEP,ni=Math.ceil(W/step),nj=Math.ceil(H/step),at=(i,j)=>field.sample(Math.min(W,i*step)*scale,Math.min(H,j*step)*scale).h;
  if(!this.heights||this.heightsId!==id){this.heights=new Float64Array((ni+1)*(nj+1));this.heightsId=id;rect=null;}
  const i0=rect?Math.max(0,Math.floor(rect.x0/step)):0,i1=rect?Math.min(ni,Math.ceil(rect.x1/step)):ni,j0=rect?Math.max(0,Math.floor(rect.y0/step)):0,j1=rect?Math.min(nj,Math.ceil(rect.y1/step)):nj;
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)this.heights[j*(ni+1)+i]=at(i,j);
  // The interval is fixed per material from the unedited relief ((hi-lo)/8), so an
  // edit changes only its own contours.
  if(!this.intervals.has(id)){let lo=Infinity,hi=-Infinity;for(let j=0;j<=nj;j++)for(let i=0;i<=ni;i++){const h=layout.pristine.sample(Math.min(W,i*step)*scale,Math.min(H,j*step)*scale).h;lo=Math.min(lo,h);hi=Math.max(hi,h);}this.intervals.set(id,(hi-lo)/8);}
 }
 contours(c,surface,rect){
  const step=CONTOUR_STEP,ni=Math.ceil(W/step),nj=Math.ceil(H/step),hs=this.heights,interval=this.intervals.get(this.heightsId),node=(i,j)=>hs[j*(ni+1)+i];
  const i0=rect?Math.max(0,Math.floor(rect.x0/step)-1):0,i1=rect?Math.min(ni-1,Math.ceil(rect.x1/step)):ni-1,j0=rect?Math.max(0,Math.floor(rect.y0/step)-1):0,j1=rect?Math.min(nj-1,Math.ceil(rect.y1/step)):nj-1;
  let lo=Infinity,hi=-Infinity;for(let j=j0;j<=j1+1;j++)for(let i=i0;i<=i1+1;i++){lo=Math.min(lo,node(i,j));hi=Math.max(hi,node(i,j));}
  c.lineWidth=.00035;c.strokeStyle=surface==='baize'?'#e2f5d049':'#293e3b59';
  for(let m=Math.ceil(lo/interval);m*interval<hi;m++){const level=m*interval;c.beginPath();
   for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
    const x=i*step,y=j*step,x2=Math.min(W,x+step),y2=Math.min(H,y+step),points=[[x,y],[x2,y],[x2,y2],[x,y2]],h=[node(i,j),node(i+1,j),node(i+1,j+1),node(i,j+1)],cross=[];
    for(let k=0;k<4;k++){const n=(k+1)%4;if((h[k]<level)!==(h[n]<level)){const t=(level-h[k])/(h[n]-h[k]);cross.push([points[k][0]+t*(points[n][0]-points[k][0]),points[k][1]+t*(points[n][1]-points[k][1])]);}}
    for(let k=1;k<cross.length;k+=2){c.moveTo(...cross[k-1]);c.lineTo(...cross[k]);}
   }c.stroke();
  }
 }

 mark(b){const s=(b.layout??layoutFor(b.material)).scale,p={x:b.x/s,y:b.y/s},rr=b.r/s;
  if(!b.grounded||!['sand','ice'].includes(b.contactSurface??b.surface)||(b.surface==='ice'&&b.slip<.02)){this.previous=null;return;}
  const last=this.previous;this.previous=p;if(!last)return;const dist=Math.hypot(p.x-last.x,p.y-last.y);if(dist<.00002||dist>rr*4)return;
  const c=this.marks.getContext('2d');this.transform(c);c.lineCap='round';
  if((b.contactSurface??b.surface)==='sand'){
   c.strokeStyle='#5f4a2833';c.lineWidth=rr*.48;c.beginPath();c.moveTo(last.x,last.y);c.lineTo(p.x,p.y);c.stroke();
   c.strokeStyle='#fff0c333';c.lineWidth=rr*.12;c.beginPath();c.moveTo(last.x-.001,last.y-.001);c.lineTo(p.x-.001,p.y-.001);c.stroke();
  }else{c.strokeStyle=`rgba(225,247,255,${Math.min(.28,.06+b.slip*.3)})`;c.lineWidth=rr*.16;c.beginPath();c.moveTo(last.x,last.y);c.lineTo(p.x,p.y);c.stroke();}
 }
 draw(b,tilt,{phase,now,fallStarted,fallHole,restartMs,running,sculpt}){
  const layout=b.layout??layoutFor(b.material),id=`${b.material}/${b.r}`,key=`${b.surface}/${b.wallMaterial}/${id}/${b.openEdges}`;if(key!==this.key)this.rebuild(b.surface,b.wallMaterial,layout,b.openEdges,id,key);
  const {goal,holes}=this.level;
  if(running)this.mark(b);else this.previous=null;
  const c=this.ctx;c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.drawImage(this.base,0,0);c.drawImage(this.marks,0,0);this.transform(c);
  // The light remains fixed. A small level gives an independent input cue.
  const lx=W/2,ly=.018,lr=.008;circle(c,lx,ly,lr,'#18392a77');c.strokeStyle='#eff5d388';c.lineWidth=.0004;c.beginPath();c.arc(lx,ly,lr,0,Math.PI*2);c.stroke();
  circle(c,lx+clamp(tilt.x/(b.tiltBudget??8),-1,1)*lr*.65,ly+clamp(tilt.y/(b.tiltBudget??8),-1,1)*lr*.65,.0022,'#eef5c8');
  if(b.openEdges){c.setLineDash([.003,.003]);c.strokeStyle='#233c3988';c.lineWidth=.0007;c.strokeRect(.0005,.0005,W-.001,H-.001);c.setLineDash([]);}
  if(b.dwell>0){c.strokeStyle='#f1ffc0';c.lineWidth=.002;c.beginPath();c.arc(goal.x,goal.y,goal.r-.001,-Math.PI/2,-Math.PI/2+2*Math.PI*Math.min(1,b.dwell/GOAL_DWELL));c.stroke();}
  const s=layout.scale;let x=b.x/s,y=b.y/s,r=b.r/s,alpha=1;
  const lift=Math.max(0,b.z-b.r-b.groundHeight)/s,airGap=Math.max(0,b.supportGap??0)/s;
  if(phase==='falling'){const t=clamp((now-fallStarted)/restartMs,0,1);if(fallHole!==null){const h=holes[fallHole];x+=(h.x-x)*t;y+=(h.y-y)*t;}else{x+=b.vx/s*t*.12;y+=b.vy/s*t*.12;}r*=1-.85*t;alpha=1-t;}
  // Mild perspective growth plus physical shadow separation communicates hops.
  r*=1+Math.min(.14,lift/.12);
  c.globalAlpha=alpha*.48*Math.exp(-airGap/.05);circle(c,x+.0015,y+.002,r*1.04+lift*.1,'#0a1712');
  x-=lift*.28;y-=lift*.42;
  c.save();if(b.overHole!==null&&b.z<b.groundHeight){const h=holes[b.overHole];c.beginPath();c.arc(h.x,h.y,h.r,0,Math.PI*2);c.clip();}
  c.globalAlpha=alpha*(b.z<b.groundHeight?clamp(1+(b.z-b.groundHeight)/b.r,.05,1):1);
  const g=c.createRadialGradient(x-r*.36,y-r*.42,r*.06,x,y,r);
  for(const [stop,col]of BALL_COLOURS[b.material])g.addColorStop(stop,col);circle(c,x,y,r,g);
  // Contrast rim also makes steel on ice and white on pale wood legible.
  c.strokeStyle=BALL_OUTLINE;c.lineWidth=Math.max(.00065,this.dpr/this.scale);c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.stroke();
  const marker={steel:['#203e31bb',.10],rubber:['#eff6de',.16],pingpong:['#b75524',.12],cork:['#57311e99',.07],billiard:['#ac2028',.17]}[b.material];
  for(const v of b.material==='cork'?SPECKLES:DOTS){const [a,d,z]=turn(b.q,v);if(z>.05)circle(c,x+a*r*.91,y+d*r*.91,r*marker[1]*Math.sqrt(z),marker[0]);}
  if(b.material==='pingpong'){c.strokeStyle='#7b817573';c.lineWidth=r*.035;c.beginPath();let active=false;
   for(let i=0;i<=80;i++){const a=i*Math.PI/40,[px,py,pz]=turn(b.q,[Math.cos(a),Math.sin(a),0]);if(pz>=0){if(active)c.lineTo(x+px*r,y+py*r);else c.moveTo(x+px*r,y+py*r);active=true;}else active=false;}c.stroke();}
  c.restore();c.globalAlpha=1;
  if(sculpt)this.sculptOverlay(c,sculpt);
 }
 // Keep-out rings (no edits inside) and the brush: solid ring at the dip radius
 // R/sqrt(5), dashed ring at the berm's outer edge R. Amber once an increment is limited.
 sculptOverlay(c,{zones,brush,walls}){
  c.save();c.setLineDash([.002,.002]);c.lineWidth=.0006;c.strokeStyle='#f3e6c2aa';
  for(const z of zones){c.beginPath();c.arc(z.x,z.y,z.r0,0,Math.PI*2);c.stroke();}
  // Walls tool: a round handle on each movable wall, and the wall being moved highlighted.
  if(walls){c.setLineDash([]);
   if(walls.active){c.beginPath();walls.active.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.lineWidth=.0022;c.lineCap='round';c.lineJoin='round';c.strokeStyle=walls.invalid?'#f0a24a':'#fff6dc';c.stroke();}
   for(const [x,y] of walls.handles){c.beginPath();c.arc(x,y,.0055,0,Math.PI*2);c.fillStyle='#14221add';c.fill();c.lineWidth=.0012;c.strokeStyle='#fff6dc';c.stroke();}}
  if(brush){c.strokeStyle=brush.limited?'#f0a24a':brush.tool==='pile'?'#bfe3ff':'#fff6dc';c.lineWidth=.0008;c.setLineDash([.003,.003]);c.beginPath();c.arc(brush.x,brush.y,brush.R,0,Math.PI*2);c.stroke();
   c.setLineDash([]);c.lineWidth=.0014;c.beginPath();c.arc(brush.x,brush.y,brush.R/Math.sqrt(5),0,Math.PI*2);c.stroke();}
  c.restore();
 }
}
