import {W,H,R,START,GOAL,WALLS,HOLES,clamp,layoutFor} from './physics.js';
import {fitBoard} from './viewport.js';
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
 rebuild(surface,wallMaterial){const c=this.base.getContext('2d');c.setTransform(1,0,0,1,0,0);c.fillStyle='#101714';c.fillRect(0,0,this.base.width,this.base.height);this.transform(c);
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
  c.textAlign='center';c.fillStyle=surface==='baize'?'#c4d2b2':'#263e36aa';c.font='500 .0045px system-ui';c.fillText('START',START.x,START.y-.015);
  c.strokeStyle=surface==='baize'?'#c4d2b266':'#263e3655';c.lineWidth=.0006;c.beginPath();c.arc(START.x,START.y,R+.003,0,Math.PI*2);c.stroke();
  for(const h of HOLES){circle(c,h.x,h.y,h.r+.0017,'#ede0b950');circle(c,h.x,h.y,h.r+.001,'#5b472b');const g=c.createRadialGradient(h.x-.003,h.y-.004,.001,h.x,h.y,h.r);g.addColorStop(0,'#030908');g.addColorStop(.65,'#0e1915');g.addColorStop(1,'#364234');circle(c,h.x,h.y,h.r,g);c.beginPath();c.arc(h.x,h.y,h.r,Math.PI*.08,Math.PI*.85);c.strokeStyle='#e7d7a36b';c.lineWidth=.0008;c.stroke();}
  circle(c,GOAL.x,GOAL.y,GOAL.r,surface==='baize'?'#b5914f':'#416c50');c.strokeStyle='#dcebc0';c.lineWidth=.0012;c.beginPath();c.arc(GOAL.x,GOAL.y,GOAL.r-.003,0,Math.PI*2);c.stroke();c.font='600 .005px system-ui';c.fillStyle='#f2f6dd';c.fillText('HOME',GOAL.x,GOAL.y+.0015);
  for(const w of WALLS){const rubber=wallMaterial==='rubber';
   // Fixed upper-left light; height-aware lower-right shadows and bevels.
   const dx=w.height*.08,dy=w.height*.12;rounded(c,w.x+dx,w.y+dy,w.w,w.h,.0015,'#101d1950');rounded(c,w.x,w.y,w.w,w.h,.0012,rubber?'#a54b3e':'#876439');
   c.fillStyle=rubber?'#e68c7366':'#f9dcb866';c.fillRect(w.x+.0008,w.y+.0005,w.w-.0016,.0011);c.fillRect(w.x+.0005,w.y+.0005,.0007,w.h-.001);
   c.fillStyle='#23180944';c.fillRect(w.x+.001,w.y+w.h-.0012,w.w-.002,.0008);c.fillRect(w.x+w.w-.0012,w.y+.001,.0008,w.h-.002);
  }
  this.rebuilds++;this.key=`${surface}/${wallMaterial}`;
 }
 mark(b){const s=layoutFor(b.material).scale,p={x:b.x/s,y:b.y/s};
  if(!b.grounded||!['sand','ice'].includes(b.surface)||(b.surface==='ice'&&b.slip<.02)){this.previous=null;return;}
  const last=this.previous;this.previous=p;if(!last)return;const dist=Math.hypot(p.x-last.x,p.y-last.y);if(dist<.00002||dist>R*4)return;
  const c=this.marks.getContext('2d');this.transform(c);c.lineCap='round';
  if(b.surface==='sand'){
   c.strokeStyle='#5f4a2833';c.lineWidth=R*.48;c.beginPath();c.moveTo(last.x,last.y);c.lineTo(p.x,p.y);c.stroke();
   c.strokeStyle='#fff0c333';c.lineWidth=R*.12;c.beginPath();c.moveTo(last.x-.001,last.y-.001);c.lineTo(p.x-.001,p.y-.001);c.stroke();
  }else{c.strokeStyle=`rgba(225,247,255,${Math.min(.28,.06+b.slip*.3)})`;c.lineWidth=R*.16;c.beginPath();c.moveTo(last.x,last.y);c.lineTo(p.x,p.y);c.stroke();}
 }
 draw(b,tilt,{phase,now,fallStarted,fallHole,restartMs,running}){
  const key=`${b.surface}/${b.wallMaterial}`;if(key!==this.key)this.rebuild(b.surface,b.wallMaterial);
  if(running)this.mark(b);else this.previous=null;
  const c=this.ctx;c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.drawImage(this.base,0,0);c.drawImage(this.marks,0,0);this.transform(c);
  // A low-contrast shading cue; the geometry and fixed cast light do not rotate.
  const tx=clamp(tilt.x/28,-1,1),ty=clamp(tilt.y/28,-1,1),strength=Math.min(.055,Math.hypot(tx,ty)*.055);
  if(strength>.001){const g=c.createLinearGradient(W/2-tx*W/2,H/2-ty*H/2,W/2+tx*W/2,H/2+ty*H/2);g.addColorStop(0,`rgba(255,251,228,${strength})`);g.addColorStop(1,`rgba(0,20,28,${strength})`);c.fillStyle=g;c.fillRect(0,0,W,H);}
  const s=layoutFor(b.material).scale;let x=b.x/s,y=b.y/s,r=b.r/s,alpha=1;
  const lift=Math.max(0,b.z-b.r)/s;
  if(phase==='falling'){const t=clamp((now-fallStarted)/restartMs,0,1);if(fallHole!==null){const h=HOLES[fallHole];x+=(h.x-x)*t;y+=(h.y-y)*t;}r*=1-.85*t;alpha=1-t;}
  // Mild perspective growth plus physical shadow separation communicates hops.
  r*=1+Math.min(.14,lift/.12);
  c.globalAlpha=alpha*.48*Math.exp(-lift/.05);circle(c,x+.0015+lift*.28,y+.002+lift*.42,r*1.04+lift*.1,'#0a1712');
  c.save();if(b.overHole!==null&&b.z<0){const h=HOLES[b.overHole];c.beginPath();c.arc(h.x,h.y,h.r,0,Math.PI*2);c.clip();}
  c.globalAlpha=alpha*(b.z<0?clamp(1+b.z/b.r,.05,1):1);
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
