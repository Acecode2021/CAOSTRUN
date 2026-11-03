/* COAST RUN — original, dependency-free canvas arcade racer. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const canvas = $('scene'), ctx = canvas.getContext('2d', { alpha: false });
const ui = {};
['menu','hud','pauseOverlay','overOverlay','scoresOverlay','touchControls','pauseBtn','soundBtn','score','hudBest','distance','speed','boostLabel','combo','comboText','hearts','nitroFill','toast','countdown','menuScores','modalScores','driverName','finalScore','finalDistance','finalNear','finalSpeed','newBest','savedNote','rotateHint'].forEach(id => ui[id] = $(id));
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const lerp = (a,b,t) => a+(b-a)*t;
const ease = t => t*t*(3-2*t);
const rand = (a,b) => a+Math.random()*(b-a);
const pick = a => a[Math.floor(Math.random()*a.length)];
const fmt = n => Math.floor(n).toLocaleString('en-US');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const STORE = 'coast-run.v1.';
const storage = {
  get(k,f) { try { const v=localStorage.getItem(STORE+k); return v===null?f:JSON.parse(v); } catch(_) { return f; } },
  set(k,v) { try { localStorage.setItem(STORE+k,JSON.stringify(v)); return true; } catch(_) { return false; } }
};
let scores = storage.get('scores',[]);
if (!Array.isArray(scores)) scores=[];
scores=scores.filter(s => s && typeof s.name==='string' && Number.isFinite(s.score) && s.score>=0).sort((a,b)=>b.score-a.score).slice(0,5);
let best = scores.length ? scores[0].score : 0;
ui.driverName.value = String(storage.get('driver','YOU')).slice(0,10);
function renderScores() {
  for(const table of [ui.menuScores,ui.modalScores]){
    table.replaceChildren();
    for(let i=0;i<5;i++) {
      const tr=document.createElement('tr'), s=scores[i];
      if(!s) tr.className='empty-row';
      const values=[String(i+1).padStart(2,'0'),s?s.name:'YOUR NAME HERE',s?fmt(s.score):'—'];
      values.forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td);});
      table.appendChild(tr);
    }
  }
  ui.hudBest.textContent=fmt(best);
}
renderScores();

/* Tiny procedural audio rig. Nothing is downloaded or played before a gesture. */
const audio = {
  ctx:null, master:null, engine:null, engine2:null, engineGain:null, windGain:null, filter:null,
  muted:!!storage.get('muted',false),
  init() {
    if(this.ctx) { if(this.ctx.state==='suspended') this.ctx.resume().catch(()=>{}); return; }
    try {
      const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return;
      const a=this.ctx=new AC();
      this.master=a.createGain(); this.master.gain.value=this.muted?0:.65; this.master.connect(a.destination);
      this.engineGain=a.createGain(); this.engineGain.gain.value=0;
      this.filter=a.createBiquadFilter(); this.filter.type='lowpass'; this.filter.frequency.value=420;
      this.engine=a.createOscillator(); this.engine.type='sawtooth'; this.engine.frequency.value=45;
      this.engine2=a.createOscillator(); this.engine2.type='triangle'; this.engine2.frequency.value=23;
      this.engine.connect(this.filter); this.engine2.connect(this.filter); this.filter.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engine.start(); this.engine2.start();
      const buffer=a.createBuffer(1,a.sampleRate*2,a.sampleRate), data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++) data[i]=Math.random()*2-1;
      this.noiseBuffer=buffer;
      const wind=a.createBufferSource(); wind.buffer=buffer; wind.loop=true;
      const wf=a.createBiquadFilter(); wf.type='lowpass'; wf.frequency.value=900;
      this.windGain=a.createGain(); this.windGain.gain.value=0;
      wind.connect(wf); wf.connect(this.windGain); this.windGain.connect(this.master); wind.start();
      a.resume().catch(()=>{});
    } catch(_) { this.ctx=null; }
  },
  update(speed,boost,active) {
    if(!this.ctx) return;
    const t=this.ctx.currentTime, r=speed/14000;
    this.engine.frequency.setTargetAtTime(38+r*105+(boost?18:0),t,.08);
    this.engine2.frequency.setTargetAtTime(19+r*53,t,.08);
    this.filter.frequency.setTargetAtTime(220+r*850,t,.1);
    this.engineGain.gain.setTargetAtTime(active?.025+r*.025:0,t,.12);
    this.windGain.gain.setTargetAtTime(active?r*r*.075:0,t,.15);
  },
  tone(freq,dur,type='sine',vol=.12,slide=0,delay=0) {
    if(!this.ctx||this.muted) return;
    const a=this.ctx,t=a.currentTime+delay,o=a.createOscillator(),g=a.createGain();
    o.type=type;o.frequency.setValueAtTime(freq,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,freq+slide),t+dur);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.008);g.gain.exponentialRampToValueAtTime(.001,t+dur);
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+dur+.02);
  },
  sfx(kind) {
    if(kind==='near'){this.tone(660,.12,'sine',.12,220);this.tone(990,.18,'sine',.09,0,.07);}
    if(kind==='pickup'){this.tone(523,.12,'triangle',.15);this.tone(784,.16,'triangle',.13,0,.07);this.tone(1047,.24,'triangle',.1,0,.14);}
    if(kind==='start'){this.tone(110,.4,'sawtooth',.08,220);this.tone(440,.3,'sine',.1,0,.25);}
    if(kind==='go'){this.tone(880,.35,'triangle',.13);}
    if(kind==='click')this.tone(380,.06,'sine',.07,100);
    if(kind==='crash'&&this.ctx&&!this.muted){
      const a=this.ctx,t=a.currentTime,s=a.createBufferSource(),g=a.createGain(),f=a.createBiquadFilter();
      s.buffer=this.noiseBuffer;f.type='lowpass';f.frequency.setValueAtTime(2200,t);f.frequency.exponentialRampToValueAtTime(100,t+.45);
      g.gain.setValueAtTime(.45,t);g.gain.exponentialRampToValueAtTime(.001,t+.5);
      s.connect(f);f.connect(g);g.connect(this.master);s.start(t);s.stop(t+.52);this.tone(90,.4,'sine',.3,-60);
    }
  },
  toggle() { this.muted=!this.muted;storage.set('muted',this.muted);this.init();if(this.master)this.master.gain.setTargetAtTime(this.muted?0:.65,this.ctx.currentTime,.05);syncSound(); }
};
function syncSound(){ui.soundBtn.classList.toggle('muted',audio.muted);ui.soundBtn.setAttribute('aria-label',audio.muted?'Enable sound':'Mute sound');ui.soundBtn.setAttribute('aria-pressed',String(!audio.muted));}
syncSound();

/* Track: world-space curves and hills, projected into a small number of strips. */
const SEG=220, ROAD_WIDTH=2100, CAMERA_HEIGHT=1080, CAMERA_DEPTH=.84, PLAYER_Z=1180;
let drawDistance=145, segments=[], trackLength=0;
function addSection(enter,hold,leave,curve,hill) {
  const total=enter+hold+leave, startY=segments.length?segments[segments.length-1].p2.world.y:0, endY=startY+hill*SEG;
  for(let n=0;n<total;n++) {
    const t=n/total;
    const c=n<enter?ease(n/enter):n<enter+hold?1:1-ease((n-enter-hold)/leave);
    const i=segments.length;
    segments.push({index:i,curve:curve*c,p1:{world:{x:0,y:lerp(startY,endY,ease(t)),z:i*SEG},camera:{},screen:{}},p2:{world:{x:0,y:lerp(startY,endY,ease((n+1)/total)),z:(i+1)*SEG},camera:{},screen:{}},clip:0,scenery:[],cars:[]});
  }
}
function buildTrack(){
  segments=[];
  addSection(35,65,35,0,0);
  addSection(35,80,35,2.7,14);
  addSection(25,55,25,0,-10);
  addSection(35,85,35,-3.2,-4);
  addSection(25,60,25,0,18);
  addSection(35,90,35,3.6,-12);
  addSection(30,65,30,-2.2,0);
  addSection(30,70,30,0,-6);
  trackLength=segments.length*SEG;
  for(let i=0;i<segments.length;i++){
    const s=segments[i];
    if(i%11===0){s.scenery.push({type:'palm',offset:-1.45-rand(0,.45),size:rand(.85,1.3),flip:false});}
    if(i%13===0){s.scenery.push({type:'palm',offset:1.45+rand(0,.65),size:rand(.85,1.35),flip:true});}
    if(i%47===0)s.scenery.push({type:'sign',offset:1.35,size:1,flip:false});
    if(i%29===0)s.scenery.push({type:'post',offset:-1.13,size:1,flip:false});
    if(i%29===0)s.scenery.push({type:'post',offset:1.13,size:1,flip:false});
    if(Math.abs(s.curve)>2&&i%9===0)s.scenery.push({type:'chevron',offset:s.curve>0?-1.22:1.22,size:1,flip:s.curve<0});
  }
}
buildTrack();
const findSegment=z=>segments[Math.floor(((z%trackLength)+trackLength)%trackLength/SEG)%segments.length];

/* All artwork is baked once into reusable canvases. */
function makeCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function poly(c,points,fill){c.fillStyle=fill;c.beginPath();c.moveTo(points[0],points[1]);for(let i=2;i<points.length;i+=2)c.lineTo(points[i],points[i+1]);c.closePath();c.fill();}
function makeCar(body,light,player=false){
  const c=makeCanvas(320,184),g=c.getContext('2d');
  g.fillStyle='#09101d66';g.beginPath();g.ellipse(160,163,145,17,0,0,Math.PI*2);g.fill();
  g.fillStyle='#101522';g.fillRect(29,117,40,49);g.fillRect(251,117,40,49);
  g.fillStyle='#30364a';g.fillRect(32,126,9,32);g.fillRect(279,126,9,32);
  poly(g,[48,105,72,50,100,31,220,31,248,50,272,105],body);
  poly(g,[78,57,101,38,219,38,242,57,249,88,71,88],'#17273b');
  poly(g,[88,58,105,43,215,43,232,58,236,72,84,72],'#34516a');
  poly(g,[105,43,215,43,225,51,95,51],'#7796a3');
  g.strokeStyle='#b8d8da55';g.lineWidth=2;for(let y=62;y<86;y+=7){g.beginPath();g.moveTo(82,y);g.lineTo(238,y);g.stroke();}
  poly(g,[48,91,272,91,292,116,285,151,35,151,28,116],body);
  poly(g,[48,91,272,91,282,105,38,105],light);
  poly(g,[28,116,292,116,285,151,35,151],body);
  g.fillStyle='#111a2a';g.fillRect(43,115,234,23);
  g.fillStyle='#ff4f55';g.fillRect(49,119,76,13);g.fillRect(195,119,76,13);
  g.fillStyle='#ffb29b';g.fillRect(51,119,72,4);g.fillRect(197,119,72,4);
  g.fillStyle='#ffd2a9';g.fillRect(51,121,13,9);g.fillRect(256,121,13,9);
  g.strokeStyle='#7d2638';g.lineWidth=2;for(let x=69;x<124;x+=12){g.beginPath();g.moveTo(x,119);g.lineTo(x,132);g.stroke();}for(let x=207;x<266;x+=12){g.beginPath();g.moveTo(x,119);g.lineTo(x,132);g.stroke();}
  g.fillStyle='#e9dfc9';g.fillRect(140,120,40,15);g.fillStyle='#263247';g.font='bold 8px monospace';g.textAlign='center';g.fillText(player?'CA 86':'COAST',160,131);
  poly(g,[35,140,285,140,279,153,41,153],'#182235');
  g.fillStyle=light;g.fillRect(57,142,206,3);
  g.fillStyle='#0b1322';g.fillRect(62,153,29,10);g.fillRect(229,153,29,10);
  g.fillStyle='#8193a3';g.fillRect(66,154,21,4);g.fillRect(233,154,21,4);
  if(player){
    poly(g,[137,92,151,92,158,112,144,112],'#f7edda');poly(g,[162,92,176,92,183,112,169,112],'#f7edda');
    g.fillStyle='#172235';g.fillRect(57,84,9,13);g.fillRect(254,84,9,13);
    poly(g,[36,78,284,78,291,86,29,86],'#172235');g.fillStyle=light;g.fillRect(36,78,248,3);
    g.fillStyle='#ffd9b0';g.fillRect(146,146,28,4);
  }
  return c;
}
const playerSprite=makeCar('#f36f55','#ffab80',true);
const trafficSprites=[makeCar('#6fc9c2','#b0e5d6'),makeCar('#e7bd70','#ffe0a0'),makeCar('#8998c7','#c0c9eb'),makeCar('#d9d9ce','#f8eed8'),makeCar('#b57b9b','#e6b0c5')];
function makePalm(){
  const c=makeCanvas(300,440),g=c.getContext('2d');
  g.strokeStyle='#202b3c';g.lineCap='round';g.lineWidth=15;g.beginPath();g.moveTo(145,435);g.bezierCurveTo(158,300,139,185,161,92);g.stroke();
  g.strokeStyle='#5b4652';g.lineWidth=4;g.beginPath();g.moveTo(140,430);g.bezierCurveTo(153,300,134,185,156,96);g.stroke();
  const fronds=[[-140,20],[-125,-45],[-70,-80],[10,-92],[100,-65],[140,-5],[125,55],[55,75],[-65,65]];
  for(let i=0;i<fronds.length;i++){
    const [dx,dy]=fronds[i],x=160,y=94;
    g.strokeStyle='#202b3c';g.lineWidth=7;g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+dx*.6,y+dy-35,x+dx,y+dy+35);g.stroke();
    for(let j=1;j<9;j++){
      const t=j/9,px=x+dx*t,py=y+(dy-35)*2*t*(1-t)+(dy+35)*t*t;
      poly(g,[px,py,px+dx*.13,py+28*(1-t)+8,px-dx*.06,py+8],'#202b3c');
    }
  }
  return c;
}
const palmSprite=makePalm();
function makeSign(text,chevron=false){
  const c=makeCanvas(220,240),g=c.getContext('2d');g.fillStyle='#34384d';g.fillRect(46,115,9,125);g.fillRect(165,115,9,125);
  g.fillStyle=chevron?'#e9bd79':'#285c62';g.fillRect(8,8,204,125);g.strokeStyle='#f1e3c7';g.lineWidth=5;g.strokeRect(15,15,190,111);
  g.fillStyle='#f1e3c7';g.textAlign='center';
  if(chevron){for(let x=40;x<180;x+=65)poly(g,[x,35,x+28,35,x+58,70,x+28,105,x,105,x+30,70],'#263345');}
  else{g.font='bold 29px sans-serif';g.fillText(text,110,62);g.font='bold 22px sans-serif';g.fillText('86  ↑',110,101);}
  return c;
}
const signSprite=makeSign('COAST'),chevronSprite=makeSign('',true);
const postSprite=(()=>{const c=makeCanvas(30,130),g=c.getContext('2d');g.fillStyle='#e2d6be';g.fillRect(10,10,10,120);g.fillStyle='#ef795e';g.fillRect(10,14,10,22);return c;})();
const pickupSprite=(()=>{const c=makeCanvas(100,120),g=c.getContext('2d');const glow=g.createRadialGradient(50,55,5,50,55,50);glow.addColorStop(0,'#7ce4d580');glow.addColorStop(1,'#7ce4d500');g.fillStyle=glow;g.fillRect(0,0,100,120);poly(g,[50,10,85,50,50,90,15,50],'#173e4b');g.strokeStyle='#7ce4d5';g.lineWidth=4;g.stroke();poly(g,[54,27,34,54,48,54,43,74,67,45,53,45],'#a3ffdf');return c;})();

let W=0,H=0,DPR=1,background=null,horizon=0,quality=1,frameAvg=16,qualityCooldown=0;
function bakeBackground(){
  background=makeCanvas(Math.ceil(W*DPR),Math.ceil(H*DPR));const g=background.getContext('2d');g.scale(DPR,DPR);horizon=H*.43;
  const sky=g.createLinearGradient(0,0,0,horizon+30);sky.addColorStop(0,'#1c2945');sky.addColorStop(.43,'#655573');sky.addColorStop(.78,'#d78383');sky.addColorStop(1,'#ffc098');g.fillStyle=sky;g.fillRect(0,0,W,H);
  const sx=W*.72,sy=H*.315,sr=Math.min(W*.105,H*.16);
  const halo=g.createRadialGradient(sx,sy,sr*.3,sx,sy,sr*2.6);halo.addColorStop(0,'#ffb78a45');halo.addColorStop(1,'#ffb78a00');g.fillStyle=halo;g.fillRect(0,0,W,horizon+30);
  const sun=makeCanvas(Math.ceil(sr*2+4),Math.ceil(sr*2+4)),sg=sun.getContext('2d'),r=sr;
  const sgGr=sg.createLinearGradient(0,0,0,r*2);sgGr.addColorStop(0,'#ffe1a6');sgGr.addColorStop(.5,'#ffc18d');sgGr.addColorStop(1,'#ff8e7c');sg.fillStyle=sgGr;sg.beginPath();sg.arc(r+2,r+2,r,0,Math.PI*2);sg.fill();
  sg.globalCompositeOperation='destination-out';for(let y=r*1.02,i=0;y<r*2;y+=r*.145,i++){sg.fillRect(0,y,r*2+4,2+i*1.15);}
  g.drawImage(sun,sx-r-2,sy-r-2);
  g.fillStyle='#e5a0a02b';for(let i=0;i<9;i++){const y=H*(.11+i*.027),x=W*(.08+(i%3)*.27);g.fillRect(x,y,W*(.12+(i%4)*.035),2);}
  const mountain=(base,amp,color,phase)=>{g.fillStyle=color;g.beginPath();g.moveTo(0,horizon+40);for(let x=0;x<=W+12;x+=12){const y=base-Math.abs(Math.sin(x/W*8+phase)*amp+Math.sin(x/W*19+phase)*amp*.32);g.lineTo(x,y);}g.lineTo(W,horizon+60);g.closePath();g.fill();};
  mountain(horizon+8,H*.065,'#77647d',1.4);mountain(horizon+20,H*.048,'#53566f',3.1);
  const sea=g.createLinearGradient(0,horizon,0,H);sea.addColorStop(0,'#73858e');sea.addColorStop(.3,'#3c6675');sea.addColorStop(1,'#1c3b50');g.fillStyle=sea;g.fillRect(0,horizon+18,W,H);
  g.fillStyle='#ffc69b35';for(let i=0;i<32;i++){const y=horizon+22+i*i*.18,half=15+i*4;g.fillRect(sx-half+Math.sin(i*4)*20,y,half*2,1.5);}
  mountain(horizon+38,H*.034,'#35465c',5.2);
  // Thin distant headland on the right.
  poly(g,[W*.82,horizon+35,W*.89,horizon+3,W*.94,horizon-5,W,horizon+12,W,horizon+65],'#303e55');
}
function resize(){
  W=window.innerWidth;H=window.innerHeight;
  drawDistance=(isTouch?120:145);if(quality<1)drawDistance=100;
  DPR=Math.min(window.devicePixelRatio||1,isTouch?1.5:2)*quality;
  canvas.width=Math.round(W*DPR);canvas.height=Math.round(H*DPR);ctx.setTransform(DPR,0,0,DPR,0,0);
  bakeBackground();
}
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,100);});resize();

/* Game state and input. */
let state='menu',position=0,speed=0,playerX=0,steerVisual=0,health=3,nitro=100,score=0,distance=0,topSpeed=0,nearMisses=0,combo=0,comboTimer=0,elapsed=0,invuln=0,shake=0,flash=0,boosting=false,boostLocked=false,spawnTimer=0,pickupTimer=0,traffic=[],pickups=[],particles=[],floaters=[],toastTimer=0,goTimer=0,overTimer=0,offroadTimer=0,saveOK=true;
let carScreen={x:0,y:0,w:0,h:0},worldTime=0;
const keys=new Set(),touch={left:false,right:false,brake:false,boost:false};
let drag=null,scoresOpen=false;
const particlesMax=()=>reducedMotion?45:(quality<1?110:220);
function clearInput(){keys.clear();Object.keys(touch).forEach(k=>touch[k]=false);drag=null;document.querySelectorAll('.touch-btn').forEach(b=>b.classList.remove('pressed'));}
function show(el,yes){el.hidden=!yes;}
function setState(next){
  state=next;
  show(ui.menu,next==='menu');show(ui.hud,next==='running'||next==='paused');show(ui.pauseOverlay,next==='paused');show(ui.overOverlay,false);show(ui.pauseBtn,next==='running');show(ui.touchControls,isTouch&&next==='running');
  scoresOpen=false;show(ui.scoresOverlay,false);ui.menu.inert=false;
  if(next!=='running'){clearInput();boosting=false;show(ui.rotateHint,false);}
  document.body.dataset.state=next;
}
function openScores(){scoresOpen=true;renderScores();show(ui.scoresOverlay,true);ui.menu.inert=true;$('closeScoresBtn').focus({preventScroll:true});}
function closeScores(){scoresOpen=false;show(ui.scoresOverlay,false);ui.menu.inert=false;$('mobileScoresBtn').focus({preventScroll:true});}
function toast(title,sub='',duration=1.6,color=''){
  ui.toast.replaceChildren();const t=document.createTextNode(title);ui.toast.appendChild(t);
  if(sub){const s=document.createElement('small');s.textContent=sub;ui.toast.appendChild(s);}
  ui.toast.style.color=color||'var(--paper)';ui.toast.classList.add('show');toastTimer=duration;
}
function pulseCount(text){ui.countdown.textContent=text;ui.countdown.classList.remove('pulse');void ui.countdown.offsetWidth;ui.countdown.classList.add('pulse');goTimer=.7;}
function startRun(){
  audio.init();audio.sfx('start');
  position=0;speed=6200;playerX=0;steerVisual=0;health=3;nitro=100;score=0;distance=0;topSpeed=0;nearMisses=0;combo=0;comboTimer=0;elapsed=0;invuln=0;shake=0;flash=0;boosting=false;boostLocked=false;spawnTimer=1.7;pickupTimer=3.8;offroadTimer=0;overTimer=0;
  traffic=[];pickups=[];particles=[];floaters=[];clearInput();
  const name=ui.driverName.value.trim().toUpperCase().slice(0,10)||'YOU';ui.driverName.value=name;storage.set('driver',name);
  traffic.push({z:9400,x:0,speed:3900,sprite:0,passed:false,w:.27});
  traffic.push({z:14200,x:-.66,speed:4700,sprite:1,passed:false,w:.27});
  traffic.push({z:20500,x:.66,speed:4400,sprite:2,passed:false,w:.27});
  pickups.push({z:10000,x:.66,phase:0});
  setState('running');pulseCount('GO!');toast('CHASE THE LAST LIGHT','DODGE TRAFFIC · CLOSE PASSES BUILD YOUR CHAIN',2.5);
  ui.toast.style.top='27%';updateHUD();
  if(isTouch&&H>W){show(ui.rotateHint,true);setTimeout(()=>show(ui.rotateHint,false),4000);}
  if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
}
function pauseRun(){if(state!=='running')return;setState('paused');audio.update(0,false,false);$('resumeBtn').focus({preventScroll:true});}
function resumeRun(){if(state!=='paused')return;clearInput();setState('running');audio.init();audio.sfx('click');}
function goMenu(){setState('menu');traffic=[];pickups=[];particles=[];floaters=[];audio.update(0,false,false);ui.toast.classList.remove('show');toastTimer=0;renderScores();$('startBtn').focus({preventScroll:true});}
function endRun(){
  if(state!=='running')return;
  const final=Math.floor(score),isBest=final>best;
  const entry={name:ui.driverName.value||'YOU',score:final,distance:+distance.toFixed(2),date:Date.now()};
  scores.push(entry);scores.sort((a,b)=>b.score-a.score);scores=scores.slice(0,5);best=scores[0]?.score||0;saveOK=storage.set('scores',scores);renderScores();
  $('finalScore').textContent=fmt(final);$('finalDistance').textContent=distance.toFixed(2);$('finalNear').textContent=nearMisses;$('finalSpeed').textContent=Math.round(topSpeed);
  show(ui.newBest,isBest);ui.savedNote.textContent=saveOK?(scores.includes(entry)?'Your run is saved to the local high-score club.':'Run complete. Beat the top five to make the club.'):'Storage is unavailable. Records last for this session.';
  setState('over');overTimer=.6;ui.toast.classList.remove('show');toastTimer=0;
}
function spawnTraffic(){
  const difficulty=Math.min(elapsed/90,1);
  const lanes=[-.66,0,.66];
  // Every wave leaves a lane open; early traffic is deliberately readable.
  let lane=pick(lanes);
  const z=position+drawDistance*SEG*.82;
  if(traffic.some(c=>Math.abs(c.z-z)<2600&&Math.abs(c.x-lane)<.3))lane=pick(lanes.filter(l=>!traffic.some(c=>Math.abs(c.z-z)<2600&&Math.abs(c.x-l)<.3)))??lane;
  traffic.push({z,x:lane,speed:rand(4300,5900)+difficulty*700,sprite:Math.floor(rand(0,trafficSprites.length)),passed:false,w:.27});
  if(elapsed>18&&Math.random()<.28+difficulty*.2){
    const free=lanes.filter(l=>Math.abs(l-lane)>.3),x=pick(free);
    traffic.push({z:z+rand(100,500),x,speed:rand(4500,5600),sprite:Math.floor(rand(0,trafficSprites.length)),passed:false,w:.27});
  }
}
function spawnPickup(){
  const lane=pick([-.66,0,.66]),z=position+drawDistance*SEG*.74;
  if(!traffic.some(c=>Math.abs(c.z-z)<2400&&Math.abs(c.x-lane)<.3))pickups.push({z,x:lane,phase:rand(0,6)});
}
function burst(x,y,n,kind='spark'){
  const max=particlesMax();for(let i=0;i<n&&particles.length<max;i++){
    const a=rand(0,Math.PI*2),v=rand(60,kind==='crash'?460:260);
    particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-(kind==='crash'?100:0),life:rand(.25,.75),max:.75,size:rand(1.5,kind==='crash'?5:3.5),kind,color:kind==='crash'?pick(['#ffe4a3','#ff8b62','#fff1cb','#ff6658']):pick(['#a0ffe1','#7ce4d5','#fff0bc'])});
  }
}
function addFloater(text,x,y,color='#a0ffe1'){floaters.push({text,x,y,life:1.1,color});if(floaters.length>8)floaters.shift();}
function crash(car){
  health--;invuln=1.9;speed*=.48;combo=0;comboTimer=0;shake=reducedMotion?0:19;flash=.55;car.dead=true;
  burst(carScreen.x,carScreen.y-carScreen.h*.35,55,'crash');audio.sfx('crash');
  if(navigator.vibrate&&isTouch)try{navigator.vibrate([60,30,90]);}catch(_){}
  if(health<=0)endRun();else toast(health===1?'LAST CHANCE':'WATCH THE PAINT',`${health} BODYWORK ${health===1?'PANEL':'PANELS'} LEFT`,1.5,'#ffad8e');
}
function nearMiss(car){
  nearMisses++;combo=Math.min(combo+1,8);comboTimer=4.5;const points=250*combo;score+=points;nitro=Math.min(100,nitro+13);
  burst(carScreen.x+(car.x>playerX?1:-1)*carScreen.w*.55,carScreen.y-carScreen.h*.3,18);
  addFloater('+'+fmt(points),carScreen.x,carScreen.y-carScreen.h*.9);
  toast('NEAR MISS',`+${fmt(points)} POINTS · ×${combo} CHAIN`,1.15,'#a0ffe1');audio.sfx('near');
  if(navigator.vibrate&&isTouch)try{navigator.vibrate(12);}catch(_){}
}
function update(dt){
  if(state==='paused')return;
  worldTime+=dt;
  if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)ui.toast.classList.remove('show');}
  if(goTimer>0){goTimer-=dt;if(goTimer<=0)ui.countdown.classList.remove('pulse');}
  if(state==='over'&&overTimer>0){overTimer-=dt;if(overTimer<=0){show(ui.overOverlay,true);$('restartBtn').focus({preventScroll:true});}}
  shake=Math.max(0,shake-dt*38);flash=Math.max(0,flash-dt*1.7);
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;if(p.life<=0){particles[i]=particles[particles.length-1];particles.pop();continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=(p.kind==='crash'?480:90)*dt;p.vx*=Math.exp(-dt*1.5);}
  for(let i=floaters.length-1;i>=0;i--){const f=floaters[i];f.life-=dt;f.y-=dt*48;if(f.life<=0)floaters.splice(i,1);}
  if(state==='menu'){position=(position+dt*3400)%trackLength;playerX=Math.sin(worldTime*.22)*.12;speed=3400;return;}
  if(state!=='running')return;
  elapsed+=dt;invuln=Math.max(0,invuln-dt);comboTimer-=dt;if(comboTimer<=0)combo=0;
  const left=keys.has('ArrowLeft')||keys.has('KeyA')||touch.left;
  const right=keys.has('ArrowRight')||keys.has('KeyD')||touch.right;
  const brake=keys.has('ArrowDown')||keys.has('KeyS')||touch.brake;
  const wantBoost=(keys.has('Space')||keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.boost)&&!brake;
  if(!wantBoost)boostLocked=false;
  const wasBoost=boosting;boosting=wantBoost&&nitro>0&&!boostLocked;
  if(boosting){nitro=Math.max(0,nitro-dt*27);if(nitro<=0)boostLocked=true;if(!wasBoost){audio.tone(140,.35,'sawtooth',.055,300);if(!reducedMotion)shake=4;}}
  else nitro=Math.min(100,nitro+dt*6.5);
  const max=boosting?14200:10600+Math.min(elapsed*9,900);
  const target=brake?4200:max;
  speed+=clamp(target-speed,-dt*(brake?12500:6500),dt*(boosting?8800:3600));
  const seg=findSegment(position+PLAYER_Z),ratio=speed/14200;
  let steer=(right?1:0)-(left?1:0);
  if(drag){const delta=clamp(drag.target-playerX,-1,1);steer=clamp(delta*8,-1,1);}
  playerX+=steer*dt*(1.42+ratio*.95);
  playerX-=seg.curve*ratio*ratio*dt*.075;
  playerX=clamp(playerX,-1.65,1.65);
  steerVisual=lerp(steerVisual,steer,1-Math.exp(-dt*11));
  if(Math.abs(playerX)>1.03){
    speed=Math.max(3800,speed-dt*5200);offroadTimer+=dt;
    if(!reducedMotion)shake=Math.max(shake,2.5);
    if(Math.random()<dt*35)burst(carScreen.x+(playerX>0?1:-1)*carScreen.w*.4,carScreen.y,2,'crash');
    if(offroadTimer>1.4){toast('BACK ON THE ASPHALT','THE SHOULDER SLOWS YOU DOWN',1.2,'#ffcc9b');offroadTimer=0;}
  }else offroadTimer=0;
  const move=speed*dt;position+=move;distance+=speed*.025/3.6*dt/1000;topSpeed=Math.max(topSpeed,speed*.025);score+=move*.012*(boosting?1.35:1);
  spawnTimer-=dt;pickupTimer-=dt;
  if(spawnTimer<=0){spawnTraffic();spawnTimer=rand(1.2,1.75)-Math.min(elapsed/150,.55);}
  if(pickupTimer<=0){spawnPickup();pickupTimer=rand(3.5,5);}
  const pz=position+PLAYER_Z;
  for(let i=traffic.length-1;i>=0;i--){
    const c=traffic[i];c.z+=c.speed*dt;const dz=c.z-pz,dx=Math.abs(c.x-playerX);
    if(!c.dead&&invuln<=0&&Math.abs(dz)<430&&dx<.265){crash(c);if(state!=='running')break;}
    if(!c.passed&&dz<-430){c.passed=true;if(!c.dead){score+=100;if(dx>=.265&&dx<.49&&invuln<=0)nearMiss(c);else addFloater('+100',carScreen.x+(c.x>playerX?1:-1)*carScreen.w*.8,carScreen.y-carScreen.h*.65,'#f7f0df');}}
    if(c.dead||c.z<position-1500||c.z>position+45000){traffic.splice(i,1);}
  }
  if(state!=='running')return;
  for(let i=pickups.length-1;i>=0;i--){const p=pickups[i],dz=p.z-pz;if(Math.abs(dz)<480&&Math.abs(p.x-playerX)<.3){nitro=Math.min(100,nitro+38);score+=300;burst(carScreen.x,carScreen.y-carScreen.h*.4,25);addFloater('+38 NITRO',carScreen.x,carScreen.y-carScreen.h);audio.sfx('pickup');toast('A LITTLE EXTRA GO','+300 POINTS · NITRO REFILLED',1.1);pickups.splice(i,1);}else if(p.z<position-800)pickups.splice(i,1);}
  if(boosting&&!reducedMotion&&Math.random()<dt*45){particles.push({x:carScreen.x+pick([-1,1])*carScreen.w*.25,y:carScreen.y-carScreen.h*.08,vx:rand(-25,25),vy:rand(180,350),life:.3,max:.3,size:rand(2,4),kind:'spark',color:'#a0ffe1'});}
}

/* Projection and renderer. */
function project(p,cameraX,cameraY,cameraZ){
  p.camera.x=p.world.x-cameraX;p.camera.y=p.world.y-cameraY;p.camera.z=p.world.z-cameraZ;
  p.screen.scale=CAMERA_DEPTH/Math.max(.001,p.camera.z);
  p.screen.x=W*.5+p.screen.scale*p.camera.x*W*.5;
  p.screen.y=H*.43-p.screen.scale*p.camera.y*H*.5;
  p.screen.w=p.screen.scale*ROAD_WIDTH*W*.5;
}
const fogCache=new Map();
function fogColor(hex,fog){
  const bucket=Math.round(clamp(fog,0,1)*28);if(bucket===0)return hex;
  const key=hex+bucket;let out=fogCache.get(key);if(out)return out;
  const t=bucket/28,r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  out=`rgb(${Math.round(lerp(r,197,t))},${Math.round(lerp(g,149,t))},${Math.round(lerp(b,148,t))})`;
  fogCache.set(key,out);return out;
}
function strip(y1,y2,x1,x2,w1,w2,color){
  // Segment edges are snapped to whole pixels so neighbouring bands share an
  // exact boundary: fractional edges would double-blend and leave hairlines.
  poly(ctx,[x1-w1,y1,x1+w1,y1,x2+w2,y2,x2-w2,y2],color);
}
function renderGround(s,n){
  const a=s.p1.screen,b=s.p2.screen,fog=Math.pow(n/drawDistance,2.6)*.68;
  const alt=Math.floor(s.index/3)%2,ay=Math.round(a.y),by=Math.round(b.y);
  ctx.fillStyle=fogColor(alt?'#bb817d':'#b57b78',fog);ctx.fillRect(0,by,W,ay-by+1);
  poly(ctx,[0,ay,a.x-a.w*1.32,ay,b.x-b.w*1.32,by,0,by],fogColor(alt?'#426b78':'#406875',fog));
}
function renderRoad(s,n){
  const a=s.p1.screen,b=s.p2.screen,fog=Math.pow(n/drawDistance,2.6)*.68;
  const alt=Math.floor(s.index/3)%2,ay=Math.round(a.y),by=Math.round(b.y);
  // A narrow pale beach separates the ocean from the tarmac.
  strip(ay,by,a.x-a.w*.075,b.x-b.w*.075,a.w*1.16,b.w*1.16,fogColor(alt?'#e4b49a':'#dca991',fog));
  strip(ay,by,a.x,b.x,a.w*1.055,b.w*1.055,fogColor(alt?'#f1d8b8':'#e57f69',fog));
  strip(ay,by,a.x,b.x,a.w,b.w,fogColor(alt?'#35374d':'#323449',fog));
  // Continuous edge lines and two broken lane dividers.
  const edge=fogColor('#e9d4b5',fog);
  for(const side of [-1,1])strip(ay,by,a.x+side*a.w*.965,b.x+side*b.w*.965,a.w*.009,b.w*.009,edge);
  if(alt){const lane=fogColor('#dfcbb3',fog);for(const l of [-1/3,1/3])strip(ay,by,a.x+l*a.w,b.x+l*b.w,a.w*.012,b.w*.012,lane);}
}
function drawSprite(img,x,bottom,width,height,clip,flip=false){
  if(width<1||height<1||x+width*.5<0||x-width*.5>W)return;
  let sh=img.height,dh=height;
  if(bottom>clip){const visible=clip-(bottom-height);if(visible<=0)return;sh*=clamp(visible/height,0,1);dh=visible;}
  const left=x-width*.5,top=bottom-dh;
  if(top>H||left>W||left+width<0)return;
  if(flip){ctx.save();ctx.translate(x,0);ctx.scale(-1,1);ctx.drawImage(img,0,0,img.width,sh,-width*.5,top,width,dh);ctx.restore();}
  else ctx.drawImage(img,0,0,img.width,sh,left,top,width,dh);
}
function renderWorld(){
  ctx.setTransform(DPR,0,0,DPR,0,0);ctx.drawImage(background,0,0,W,H);
  ctx.save();
  if(shake>0&&!reducedMotion)ctx.translate(rand(-shake,shake),rand(-shake,shake)*.6);
  const camPos=((position%trackLength)+trackLength)%trackLength;
  const base=findSegment(camPos),basePct=(camPos%SEG)/SEG;
  const playerSeg=findSegment(camPos+PLAYER_Z),playerPct=((camPos+PLAYER_Z)%SEG)/SEG;
  const playerY=lerp(playerSeg.p1.world.y,playerSeg.p2.world.y,playerPct);
  const cameraX=playerX*ROAD_WIDTH*.76;
  let x=0,dx=-base.curve*basePct,maxY=H;
  const visible=[],road=[];
  for(let n=0;n<drawDistance;n++){
    const s=segments[(base.index+n)%segments.length],looped=s.index<base.index,camZ=camPos-(looped?trackLength:0);
    s.clip=maxY;s.cars.length=0;
    project(s.p1,cameraX-x,playerY+CAMERA_HEIGHT,camZ);
    project(s.p2,cameraX-x-dx,playerY+CAMERA_HEIGHT,camZ);
    x+=dx;dx+=s.curve;
    visible.push(s);
    if(s.p1.camera.z<=CAMERA_DEPTH||s.p2.screen.y>=s.p1.screen.y||s.p2.screen.y>=maxY)continue;
    renderGround(s,n);road.push([s,n]);maxY=s.p2.screen.y;
  }
  for(let i=road.length-1;i>=0;i--)renderRoad(road[i][0],road[i][1]);
  for(const c of traffic){const idx=Math.floor(((c.z%trackLength)+trackLength)%trackLength/SEG)%segments.length;segments[idx].cars.push(c);}
  for(const p of pickups){const idx=Math.floor(((p.z%trackLength)+trackLength)%trackLength/SEG)%segments.length;segments[idx].cars.push(p);}
  for(let n=visible.length-1;n>=0;n--){
    const s=visible[n],a=s.p1.screen;if(s.p1.camera.z<=CAMERA_DEPTH)continue;
    for(const obj of s.scenery){
      const ox=a.x+a.w*obj.offset;
      if(obj.type==='palm'){const h=a.w*.95*obj.size;drawSprite(palmSprite,ox,a.y,h*.68,h,s.clip,obj.flip);}
      else if(obj.type==='sign'){const h=a.w*.29;drawSprite(signSprite,ox,a.y,h*.92,h,s.clip);}
      else if(obj.type==='chevron'){const h=a.w*.2;drawSprite(chevronSprite,ox,a.y,h*.92,h,s.clip,obj.flip);}
      else{const h=a.w*.095;drawSprite(postSprite,ox,a.y,h*.23,h,s.clip);}
    }
    s.cars.sort((a,b)=>b.z-a.z);
    for(const c of s.cars){
      const pct=((c.z%SEG)+SEG)%SEG/SEG;
      const scale=lerp(s.p1.screen.scale,s.p2.screen.scale,pct),cx=lerp(s.p1.screen.x,s.p2.screen.x,pct)+scale*c.x*ROAD_WIDTH*W*.5,cy=lerp(s.p1.screen.y,s.p2.screen.y,pct),rw=scale*ROAD_WIDTH*W*.5;
      if(c.sprite!==undefined){const w=rw*.29;drawSprite(trafficSprites[c.sprite],cx,cy,w,w*.575,s.clip);}
      else{const w=rw*.15,bob=Math.sin(worldTime*4+c.phase)*w*.09;drawSprite(pickupSprite,cx,cy-w*.12+bob,w,w*1.2,s.clip);}
    }
  }
  // The camera follows most, but not all, of the car's lateral movement.
  const pScale=CAMERA_DEPTH/PLAYER_Z,roadHalf=pScale*ROAD_WIDTH*W*.5;
  const cw=Math.min(W*(isTouch?.19:.145),H*.205,205),ch=cw*.575;
  const cx=W*.5+playerX*roadHalf*.24;
  const bounce=reducedMotion?0:Math.sin(worldTime*(boosting?48:32))*(speed/14200)*(boosting?1.6:.7);
  const cy=H*(isTouch&&H>W?.79:.88)+bounce;
  carScreen={x:cx,y:cy,w:cw,h:ch};
  if(boosting){
    const glow=ctx.createRadialGradient(cx,cy-5,5,cx,cy-5,cw*.8);glow.addColorStop(0,'#7ce4d535');glow.addColorStop(1,'#7ce4d500');ctx.fillStyle=glow;ctx.fillRect(cx-cw,cy-cw,cw*2,cw*2);
    for(const side of [-1,1]){const ex=cx+side*cw*.255,len=ch*(.25+Math.random()*.25);poly(ctx,[ex-cw*.036,cy-ch*.04,ex+cw*.036,cy-ch*.04,ex+rand(-3,3),cy+len],'#7ce4d5');poly(ctx,[ex-cw*.02,cy-ch*.04,ex+cw*.02,cy-ch*.04,ex,cy+len*.65],'#f4ffe0');}
  }
  ctx.save();ctx.translate(cx,cy-ch*.48);ctx.rotate(steerVisual*.045);
  if(invuln>0&&Math.floor(invuln*12)%2===0)ctx.globalAlpha=.4;
  ctx.drawImage(playerSprite,-cw*.5,-ch*.52,cw,ch);ctx.restore();
  for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;if(p.kind==='crash'){ctx.fillRect(p.x,p.y,p.size,p.size);}else{ctx.fillRect(p.x,p.y,p.size,p.size*2.4);}}
  ctx.globalAlpha=1;
  if(boosting&&!reducedMotion){
    ctx.strokeStyle='#c0ffe13d';ctx.lineWidth=1.5;
    for(let i=0;i<20;i++){const a=i/20*Math.PI*2,t=(worldTime*1.7+i*.137)%1,r=lerp(Math.min(W,H)*.28,Math.max(W,H)*.8,t),x0=W*.5+Math.cos(a)*r,y0=H*.43+Math.sin(a)*r*.7;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(W*.5+Math.cos(a)*(r+70*t),H*.43+Math.sin(a)*(r+70*t)*.7);ctx.stroke();}
  }
  for(const f of floaters){ctx.globalAlpha=clamp(f.life*2,0,1);ctx.fillStyle=f.color;ctx.font=`italic 800 ${Math.max(22,W*.022)}px "Barlow Condensed"`;ctx.textAlign='center';ctx.fillText(f.text,f.x,f.y);}
  ctx.globalAlpha=1;ctx.restore();
  if(flash>0){ctx.fillStyle=`rgba(255,91,76,${flash*.32})`;ctx.fillRect(0,0,W,H);}
}
let hudTimer=0;
function updateHUD(){
  ui.score.textContent=String(Math.floor(score)).padStart(6,'0');ui.distance.textContent=distance.toFixed(2);ui.speed.textContent=Math.round(speed*.025);
  ui.boostLabel.textContent=boosting?'NITRO ENGAGED':nitro<15?'RECHARGING':'CRUISING';ui.boostLabel.classList.toggle('active',boosting);
  ui.nitroFill.style.transform=`scaleX(${nitro/100})`;ui.nitroFill.parentElement.parentElement.classList.toggle('boosting',boosting);
  [...ui.hearts.children].forEach((el,i)=>el.classList.toggle('lost',i>=health));ui.hearts.setAttribute('aria-label',`${health} of 3 bodywork panels remaining`);
  show(ui.combo,combo>=2);ui.comboText.textContent='×'+combo;
}
let last=performance.now(),acc=0;
function frame(now){
  const raw=Math.min((now-last)/1000,.1);last=now;frameAvg=lerp(frameAvg,raw*1000,.025);
  // Lower fill-rate on sustained slow devices; physics remains unchanged.
  qualityCooldown-=raw;if(qualityCooldown<=0&&frameAvg>24&&quality>.7){quality=.7;qualityCooldown=8;resize();}
  acc+=raw;const step=1/120;let steps=0;
  while(acc>=step&&steps<12){update(step);acc-=step;steps++;}
  if(steps===12)acc=0;
  renderWorld();hudTimer+=raw;if(hudTimer>.075){hudTimer=0;if(state==='running'||state==='paused')updateHUD();}
  audio.update(speed,boosting,state==='running');
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* Keyboard, multitouch pedals, and direct drag steering. */
const gameKeys=new Set(['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','KeyA','KeyD','KeyS','KeyW','Space','ShiftLeft','ShiftRight','KeyP','Escape','KeyR','Enter','KeyM']);
window.addEventListener('keydown',e=>{
  if(e.target instanceof HTMLInputElement){if(e.code==='Enter'){e.preventDefault();startRun();}return;}
  if(scoresOpen){if(e.code==='Escape'||e.code==='Enter'||e.code==='KeyP'){e.preventDefault();closeScores();}return;}
  // Let focused menu/modal buttons keep their native Enter/Space activation.
  if(e.target instanceof HTMLButtonElement&&(e.code==='Enter'||(e.code==='Space'&&state!=='running')))return;
  if(gameKeys.has(e.code))e.preventDefault();
  if(e.repeat){if(state==='running')keys.add(e.code);return;}
  if(e.code==='KeyM'){audio.toggle();return;}
  if(e.code==='KeyP'||e.code==='Escape'){if(state==='running')pauseRun();else if(state==='paused')resumeRun();return;}
  if(e.code==='KeyR'&&state!=='menu'){startRun();return;}
  if(e.code==='Enter'){if(state==='menu'||state==='over')startRun();else if(state==='paused')resumeRun();return;}
  if(state==='running')keys.add(e.code);
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{clearInput();if(state==='running')pauseRun();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='running')pauseRun();});
function bindHold(id,key){
  const b=$(id);let activePointer=null;
  b.addEventListener('pointerdown',e=>{if(state!=='running')return;e.preventDefault();activePointer=e.pointerId;try{b.setPointerCapture(e.pointerId);}catch(_){}touch[key]=true;b.classList.add('pressed');audio.init();});
  const release=e=>{if(activePointer!==null&&e.pointerId!==activePointer)return;activePointer=null;touch[key]=false;b.classList.remove('pressed');};
  b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);
  b.addEventListener('contextmenu',e=>e.preventDefault());
}
bindHold('leftBtn','left');bindHold('rightBtn','right');bindHold('brakeBtn','brake');bindHold('boostBtn','boost');
canvas.addEventListener('pointerdown',e=>{if(state!=='running'||drag)return;e.preventDefault();drag={id:e.pointerId,startX:e.clientX,startPlayer:playerX,target:playerX};try{canvas.setPointerCapture(e.pointerId);}catch(_){}});
canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;drag.target=clamp(drag.startPlayer+(e.clientX-drag.startX)/(W*.24),-1.1,1.1);});
const endDrag=e=>{if(drag&&drag.id===e.pointerId)drag=null;};canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);
$('startBtn').addEventListener('click',startRun);$('restartBtn').addEventListener('click',startRun);$('pauseRestartBtn').addEventListener('click',startRun);
$('resumeBtn').addEventListener('click',resumeRun);$('pauseMenuBtn').addEventListener('click',goMenu);$('overMenuBtn').addEventListener('click',goMenu);
ui.pauseBtn.addEventListener('click',pauseRun);ui.soundBtn.addEventListener('click',()=>audio.toggle());
$('mobileScoresBtn').addEventListener('click',openScores);$('closeScoresBtn').addEventListener('click',closeScores);
$('brand').addEventListener('click',e=>{e.preventDefault();if(scoresOpen){closeScores();return;}if(state==='running')pauseRun();else if(state==='over'||state==='paused')goMenu();});
// Keep the native button keyboard behavior without allowing Space to re-trigger a focused control mid-race.
document.addEventListener('keydown',e=>{if(e.code==='Space'&&state==='running'&&e.target instanceof HTMLButtonElement)e.preventDefault();});
// Lightweight, opt-in hooks for automated smoke tests only.
if(new URLSearchParams(location.search).has('test')){
  window.__coastTest={
    start:startRun,pause:pauseRun,resume:resumeRun,menu:goMenu,
    crash:()=>{if(state==='running')crash({});},
    state:()=>({state,score,health,nitro,playerX,position,distance,combo,nearMisses,traffic:traffic.length,boosting}),
    setPlayerX:x=>playerX=x,setNitro:n=>nitro=n,
    spawnNearMiss:()=>{traffic.push({z:position+PLAYER_Z+500,x:clamp(playerX+.36,-1,1),speed:Math.max(1000,speed-3000),sprite:0,passed:false,w:.27});}
  };
}
setState('menu');
})();
