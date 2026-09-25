import {W,H,R,START,GOAL,WALLS,HOLES,clamp,layoutFor} from './physics.js';
import {fitBoard} from './viewport.js';
import {GOAL_DWELL} from './terrain.js';
export const SURFACE_PALETTES={wood:['#d6b07c','#b68a56'],sand:['#d9c191','#b9a072'],ice:['#82b6ca','#6096b0'],baize:['#176b58','#114d42']};
export const BALL_COLOURS={steel:[[0,'#ffffff'],[.22,'#e5ece8'],[.48,'#a0aaa7'],[.7,'#3f4c47'],[.86,'#bfccc5'],[1,'#344c45']],rubber:[[0,'#b2caff'],[.4,'#6593ee'],[1,'#264a94']],pingpong:[[0,'#ffffff'],[.6,'#f6f4e9'],[1,'#b5b3a8']],cork:[[0,'#e6c094'],[.4,'#bd8650'],[1,'#795430']],billiard:[[0,'#ffffff'],[.4,'#f1e6c9'],[1,'#9d926f']]};
export const BALL_OUTLINE='#172a23';
const makeCanvas=()=>document.createElement('canvas');
const circle=(c,x,y,r,fill)=>{c.beginPath();c.arc(x,y,Math.max(0,r),0,Math.PI*2);c.fillStyle=fill;c.fill();};
const rounded=(c,x,y,w,h,r,fill)=>{c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();};
const turn=(q,v)=>{const [a,b,c,d]=q,[x,y,z]=v,tx=2*(c*z-d*y),ty=2*(d*x-b*z),tz=2*(b*y-c*x);return[x+a*tx+c*tz-d*ty,y+a*ty+d*tx-b*tz,z+a*tz+b*ty-c*tx];};
const DOTS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const SPECKLES=Array.from({length:64},(_,i)=>{const z=1-2*(i+.5)/64,a=i*2.39996323,t=Math.sqrt(1-z*z);return[t*Math.cos(a),t*Math.sin(a),z];});
export class Renderer{
 constructor(canvas,wrap){this.canvas=canvas;this.wrap=wrap;this.ctx=canvas.getContext('2d',{alpha:false});this.base=makeCanvas();this.marks=makeCanvas();this.key='';this.previous=null;this.rebuilds=0;this.resize();}
 resize(){const rect=this.wrap.getBoundingClientRect(),f=fitBoard(rect.width,rect.height,W/H,window.devicePixelRatio);
  if(this.canvas.width===f.pixelWidth&&this.canvas.height===f.pixelHeight&&this.dpr===f.pixelRatio)return;
  const old=this.marks.width>1?makeCanvas():null;if(old){old.width=this.marks.width;old.height=this.marks.height;old.getContext('2d').drawImage(this.marks,0,0);}
  this.dpr=f.pixelRatio;this.canvas.style.width=`${f.pixelWidth/f.pixelRatio}px`;this.canvas.style.height=`${f.pixelHeight/f.pixelRatio}px`;
  for(const c of [this.canvas,this.base,this.marks]){c.width=f.pixelWidth;c.height=f.pixelHeight;}
  this.scale=Math.min(f.pixelWidth/W,f.pixelHeight/H);this.ox=(f.pixelWidth-W*this.scale)/2;this.oy=(f.pixelHeight-H*this.scale)/2;
  if(old)this.marks.getContext('2d').drawImage(old,0,0,this.marks.width,this.marks.height);
  this.key='';this.previous=null;
 }
 transform(c){c.setTransform(this.scale,0,0,this.scale,this.ox,this.oy);}
 clearMarks(){const c=this.marks.getContext('2d');c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,this.marks.width,this.marks.height);this.previous=null;}
 rebuild(surface,wallMaterial,material='steel',openEdges=false){const c=this.base.getContext('2d');c.setTransform(1,0,0,1,0,0);c.fillStyle='#101714';c.fillRect(0,0,this.base.width,this.base.height);this.transform(c);
  const palette=SURFACE_PALETTES[surface];
  const g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,palette[0]);g.addColorStop(1,palette[1]);c.fillStyle=g;c.fillRect(0,0,W,H);
  // Deterministic multiscale procedural texture. Built only after resize/material change.
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
  this.relief(c,material,surface);
  c.textAlign='center';c.fillStyle=surface==='baize'?'#c4d2b2':'#263e36aa';c.font='500 .0045px system-ui';
  c.strokeStyle=surface==='baize'?'#c4d2b266':'#263e3655';c.lineWidth=.0006;c.beginPath();c.arc(START.x,START.y,R+.003,0,Math.PI*2);c.stroke();
  for(const h of HOLES){circle(c,h.x,h.y,h.r+.0017,'#ede0b950');circle(c,h.x,h.y,h.r+.001,'#5b472b');const g=c.createRadialGradient(h.x-.003,h.y-.004,.001,h.x,h.y,h.r);g.addColorStop(0,'#030908');g.addColorStop(.65,'#0e1915');g.addColorStop(1,'#364234');circle(c,h.x,h.y,h.r,g);c.beginPath();c.arc(h.x,h.y,h.r,Math.PI*.08,Math.PI*.85);c.strokeStyle='#e7d7a36b';c.lineWidth=.0008;c.stroke();}
  circle(c,GOAL.x,GOAL.y,GOAL.r,surface==='baize'?'#b5914f55':'#416c5055');c.strokeStyle='#dcebc0';c.lineWidth=.0012;c.beginPath();c.arc(GOAL.x,GOAL.y,GOAL.r-.003,0,Math.PI*2);c.stroke();c.font='600 .005px system-ui';c.fillStyle='#f2f6dd';
  const base=layoutFor('steel');
  for(const patch of base.patches){c.save();c.beginPath();c.ellipse(patch.x,patch.y,patch.rx,patch.ry,-.15,0,Math.PI*2);c.clip();c.fillStyle=patch.kind==='sand'?'#d5b877bb':'#bd6d18aa';c.fillRect(patch.x-patch.rx,patch.y-patch.ry,patch.rx*2,patch.ry*2);c.strokeStyle=patch.kind==='sand'?'#f4db9b66':'#f5c75b88';c.lineWidth=.0008;c.stroke();c.restore();}
  for(const w of openEdges?WALLS.filter(w=>w.kind!=='border'):WALLS){
   const line=(dx,dy,width,col)=>{c.beginPath();w.points.forEach(([x,y],i)=>i?c.lineTo(x+dx,y+dy):c.moveTo(x+dx,y+dy));c.lineWidth=width;c.strokeStyle=col;c.lineCap='round';c.lineJoin='round';c.stroke();};
   line(w.height*.25,w.height*.4,w.kind==='low'?.0025:.005,'#10221b66');
   line(0,0,w.kind==='low'?.002:.004,wallMaterial==='rubber'?'#a54b3e':w.kind==='pocket'?'#503921':'#876439');
   line(-.00045,-.00055,.0008,wallMaterial==='rubber'?'#e68c73':'#f5d19a');
  }
  this.rebuilds++;this.key=`${surface}/${wallMaterial}/${material}/${openEdges}`;
 }
 relief(c,material,surface){
  const scale=layoutFor(material).scale,field=layoutFor(material).terrain,image=makeCanvas();image.width=180;image.height=380;
  const ctx=image.getContext('2d'),pixels=ctx.createImageData(image.width,image.height);
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
   const bx=(x+.5)*W/image.width,by=(y+.5)*H/image.height,p=field.sample(bx*scale,by*scale);
   if(Math.abs(p.dx)+Math.abs(p.dy)<1e-10)continue;
   const gain=20;
   const nx=-p.dx*gain,ny=-p.dy*gain,l=Math.hypot(nx,ny,1),light=(-.45*nx-.60*ny+.66)/l-.66;
   const i=(y*image.width+x)*4,col=light>0?[255,248,221]:[8,23,29];
   pixels.data[i]=col[0];pixels.data[i+1]=col[1];pixels.data[i+2]=col[2];pixels.data[i+3]=Math.round(Math.min(.30,Math.abs(light)*.55)*255);
  }
  ctx.putImageData(pixels,0,0);c.drawImage(image,0,0,W,H);
  // Fixed interval over the whole board, on the same potential as the solver.
  const step=.0025,heights=[];let lo=Infinity,hi=-Infinity;
  for(let j=0;j<=Math.ceil(H/step);j++){const row=[];for(let i=0;i<=Math.ceil(W/step);i++){const h=field.sample(Math.min(W,i*step)*scale,Math.min(H,j*step)*scale).h;row.push(h);lo=Math.min(lo,h);hi=Math.max(hi,h);}heights.push(row);}
  const interval=(hi-lo)/8;c.lineWidth=.00035;c.strokeStyle=surface==='baize'?'#e2f5d049':'#293e3b59';
  for(let level=Math.ceil(lo/interval)*interval;level<hi;level+=interval){c.beginPath();
   for(let j=0;j<heights.length-1;j++)for(let i=0;i<heights[j].length-1;i++){
    const x=i*step,y=j*step,points=[[x,y],[x+step,y],[x+step,y+step],[x,y+step]],hs=[heights[j][i],heights[j][i+1],heights[j+1][i+1],heights[j+1][i]],cross=[];
    for(let k=0;k<4;k++){const n=(k+1)%4;if((hs[k]<level)!==(hs[n]<level)){const t=(level-hs[k])/(hs[n]-hs[k]);cross.push([points[k][0]+t*(points[n][0]-points[k][0]),points[k][1]+t*(points[n][1]-points[k][1])]);}}
    for(let k=1;k<cross.length;k+=2){c.moveTo(...cross[k-1]);c.lineTo(...cross[k]);}
   }c.stroke();
  }
 }

 mark(b){const s=layoutFor(b.material).scale,p={x:b.x/s,y:b.y/s};
  if(!b.grounded||!['sand','ice'].includes(b.contactSurface??b.surface)||(b.surface==='ice'&&b.slip<.02)){this.previous=null;return;}
  const last=this.previous;this.previous=p;if(!last)return;const dist=Math.hypot(p.x-last.x,p.y-last.y);if(dist<.00002||dist>R*4)return;
  const c=this.marks.getContext('2d');this.transform(c);c.lineCap='round';
  if((b.contactSurface??b.surface)==='sand'){
   c.strokeStyle='#5f4a2833';c.lineWidth=R*.48;c.beginPath();c.moveTo(last.x,last.y);c.lineTo(p.x,p.y);c.stroke();
   c.strokeStyle='#fff0c333';c.lineWidth=R*.12;c.beginPath();c.moveTo(last.x-.001,last.y-.001);c.lineTo(p.x-.001,p.y-.001);c.stroke();
  }else{c.strokeStyle=`rgba(225,247,255,${Math.min(.28,.06+b.slip*.3)})`;c.lineWidth=R*.16;c.beginPath();c.moveTo(last.x,last.y);c.lineTo(p.x,p.y);c.stroke();}
 }
 draw(b,tilt,{phase,now,fallStarted,fallHole,restartMs,running}){
  const key=`${b.surface}/${b.wallMaterial}/${b.material}/${b.openEdges}`;if(key!==this.key)this.rebuild(b.surface,b.wallMaterial,b.material,b.openEdges);
  if(running)this.mark(b);else this.previous=null;
  const c=this.ctx;c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.drawImage(this.base,0,0);c.drawImage(this.marks,0,0);this.transform(c);
  // The light remains fixed. A small level gives an independent input cue.
  const lx=W/2,ly=.018,lr=.008;circle(c,lx,ly,lr,'#18392a77');c.strokeStyle='#eff5d388';c.lineWidth=.0004;c.beginPath();c.arc(lx,ly,lr,0,Math.PI*2);c.stroke();
  circle(c,lx+clamp(tilt.x/(b.tiltBudget??8),-1,1)*lr*.65,ly+clamp(tilt.y/(b.tiltBudget??8),-1,1)*lr*.65,.0022,'#eef5c8');
  if(b.openEdges){c.setLineDash([.003,.003]);c.strokeStyle='#233c3988';c.lineWidth=.0007;c.strokeRect(.0005,.0005,W-.001,H-.001);c.setLineDash([]);}
  if(b.dwell>0){c.strokeStyle='#f1ffc0';c.lineWidth=.002;c.beginPath();c.arc(GOAL.x,GOAL.y,GOAL.r-.001,-Math.PI/2,-Math.PI/2+2*Math.PI*Math.min(1,b.dwell/GOAL_DWELL));c.stroke();}
  const s=layoutFor(b.material).scale;let x=b.x/s,y=b.y/s,r=b.r/s,alpha=1;
  const lift=Math.max(0,b.z-b.r-b.groundHeight)/s,airGap=Math.max(0,b.supportGap??0)/s;
  if(phase==='falling'){const t=clamp((now-fallStarted)/restartMs,0,1);if(fallHole!==null){const h=HOLES[fallHole];x+=(h.x-x)*t;y+=(h.y-y)*t;}else{x+=b.vx/s*t*.12;y+=b.vy/s*t*.12;}r*=1-.85*t;alpha=1-t;}
  // Mild perspective growth plus physical shadow separation communicates hops.
  r*=1+Math.min(.14,lift/.12);
  c.globalAlpha=alpha*.48*Math.exp(-airGap/.05);circle(c,x+.0015,y+.002,r*1.04+lift*.1,'#0a1712');
  x-=lift*.28;y-=lift*.42;
  c.save();if(b.overHole!==null&&b.z<b.groundHeight){const h=HOLES[b.overHole];c.beginPath();c.arc(h.x,h.y,h.r,0,Math.PI*2);c.clip();}
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
 }
}
