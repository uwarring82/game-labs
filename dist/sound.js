const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function rollingVoice(b){
 const speed=Math.hypot(b.vx,b.vy,b.vz),slip=b.slip;
 if(!b.grounded)return{gain:0,frequency:400,q:.7};
 const surface=b.contactSurface==='resin'?'wood':b.contactSurface??b.surface;
 const amount=surface==='ice'?Math.max(0,slip-.02):speed;
 const tones={wood:[330,1300,.9,.055],sand:[1300,1600,.4,.08],ice:[2200,2200,1.2,.06],baize:[240,550,.5,.025]}[surface];
 return{gain:clamp(Math.sqrt(amount)*tones[3],0,.12),frequency:clamp(tones[0]+amount*tones[1],100,6500),q:tones[2]};
}
export function impactVoice(e){
 if(e.impulse<Math.max(.000008,e.mass*.02))return null;
 const [frequency,duration,tone]=({steel:[2400,.065,.55],rubber:[170,.11,.25],pingpong:[680,.10,.55],cork:[240,.03,.05],billiard:[1200,.065,.4]})[e.material];
 const gain=clamp(Math.log1p(e.impulse/.0003)/Math.log1p(.08/.0003),0,1)*.35;
 const soften=e.surface==='sand'?.28:e.surface==='baize'?.45:1;
 return{gain:gain*soften,frequency:frequency*(e.kind==='rim'?1.4:e.surface==='rubber'?.75:1),duration,tone};
}
export class SoundEngine{
 constructor(onState=()=>{}){this.ctx=null;this.enabled=true;this.onState=onState;this.voices=new Set();this.nextHit=0;this.haptics=false;this.lastVibration=-Infinity;}
 unlock(){
  // Invoked synchronously from a tap. No playback-category or silent-switch hack.
  if(!this.enabled)return Promise.resolve(false);
  try{
   if(!this.ctx){
    const Context=window.AudioContext||window.webkitAudioContext;if(!Context){this.onState('Web Audio unavailable.');return Promise.resolve(false);}
    try{if(navigator.audioSession)navigator.audioSession.type='ambient';}catch{}
    const c=this.ctx=new Context({latencyHint:'interactive'});
    this.master=c.createGain();this.master.gain.value=.6;
    const limit=c.createDynamicsCompressor();limit.threshold.value=-9;limit.knee.value=10;limit.ratio.value=8;limit.attack.value=.002;limit.release.value=.08;
    this.master.connect(limit);limit.connect(c.destination);
    this.buffer=c.createBuffer(1,c.sampleRate*2,c.sampleRate);const data=this.buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    const source=c.createBufferSource();source.buffer=this.buffer;source.loop=true;this.rollFilter=c.createBiquadFilter();this.rollFilter.type='bandpass';this.rollGain=c.createGain();this.rollGain.gain.value=0;
    source.connect(this.rollFilter);this.rollFilter.connect(this.rollGain);this.rollGain.connect(this.master);source.start();
    c.onstatechange=()=>this.onState(!this.enabled?'Sound off.':c.state==='running'?'Sound ready. Silent-mode behaviour follows your device.':`Audio ${c.state}. Tap Play to resume.`);
   }
   return this.ctx.resume().then(()=>{this.nextHit=this.ctx.currentTime;return true;}).catch(()=>{this.onState('Sound is blocked. Tap Play or enable Sound again.');return false;});
  }catch{this.onState('Sound unavailable. The game can still run.');return Promise.resolve(false);}
 }
 setEnabled(value){this.enabled=value;if(!value){this.pause();this.ctx?.suspend().catch(()=>{});}else this.unlock();}
 update(b,running){if(!this.ctx||this.ctx.state!=='running')return;const c=this.ctx,t=c.currentTime,p=rollingVoice(b);
  this.rollGain.gain.setTargetAtTime(this.enabled&&running?p.gain:0,t,.015);
  this.rollFilter.frequency.setTargetAtTime(p.frequency,t,.025);this.rollFilter.Q.setTargetAtTime(p.q,t,.025);
 }
 pause(){
  if(!this.ctx)return;const t=this.ctx.currentTime;this.rollGain.gain.cancelScheduledValues(t);this.rollGain.gain.setTargetAtTime(0,t,.01);
  for(const voice of [...this.voices])voice.stop();this.nextHit=t;
  try{navigator.vibrate?.(0);}catch{}
 }
 hide(){this.pause();this.ctx?.suspend().catch(()=>{});}
 impacts(events,startSimulationTime){
  const c=this.ctx,base=c?.currentTime??0;
  for(const e of events){const p=impactVoice(e);if(!p)continue;
   if(this.haptics&&e.kind==='wall'&&typeof navigator.vibrate==='function'){
    const now=performance.now();if(now-this.lastVibration>100){try{navigator.vibrate(Math.round(8+12*Math.min(1,e.impulse/.02)));}catch{}this.lastVibration=now;}
   }
   if(!this.enabled||!c||c.state!=='running')continue;
   const when=base+.004+clamp(e.time-startSimulationTime,0,.05);
   if(when<this.nextHit||this.voices.size>=6)continue;this.nextHit=when+.055;
   this.burst(p,when);
  }
 }
 burst(p,when){const c=this.ctx,filter=c.createBiquadFilter(),envelope=c.createGain(),noise=c.createBufferSource(),tone=c.createOscillator(),toneGain=c.createGain();
  const detune=.97+Math.random()*.06;filter.type='bandpass';filter.frequency.value=p.frequency*detune;filter.Q.value=1.5;
  noise.buffer=this.buffer;noise.connect(filter);filter.connect(envelope);
  tone.type='sine';tone.frequency.setValueAtTime(p.frequency*detune,when);tone.frequency.exponentialRampToValueAtTime(p.frequency*.78*detune,when+p.duration);toneGain.gain.value=p.tone;tone.connect(toneGain);toneGain.connect(envelope);envelope.connect(this.master);
  envelope.gain.setValueAtTime(0,when);envelope.gain.linearRampToValueAtTime(p.gain,when+.002);envelope.gain.exponentialRampToValueAtTime(.00001,when+p.duration);
  let ended=false;const voice={stop:()=>{if(ended)return;ended=true;try{noise.stop();tone.stop();}catch{}noise.disconnect();tone.disconnect();filter.disconnect();toneGain.disconnect();envelope.disconnect();this.voices.delete(voice);}};
  this.voices.add(voice);tone.onended=voice.stop;noise.start(when,Math.random());tone.start(when);noise.stop(when+p.duration+.01);tone.stop(when+p.duration+.01);
 }
 capture(){if(!this.enabled||this.ctx?.state!=='running')return;const c=this.ctx,t=c.currentTime+.004,o=c.createOscillator(),g=c.createGain();
  o.type='sine';o.frequency.setValueAtTime(450,t);o.frequency.exponentialRampToValueAtTime(65,t+.34);g.gain.setValueAtTime(.00001,t);g.gain.exponentialRampToValueAtTime(.12,t+.012);g.gain.exponentialRampToValueAtTime(.00001,t+.4);o.connect(g);g.connect(this.master);
  let ended=false;const voice={stop:()=>{if(ended)return;ended=true;try{o.stop();}catch{}o.disconnect();g.disconnect();this.voices.delete(voice);}};this.voices.add(voice);o.onended=voice.stop;o.start(t);o.stop(t+.42);
 }
}
