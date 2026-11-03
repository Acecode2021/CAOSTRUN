import { chromium } from 'playwright';
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
await p.addInitScript(()=>{
  const P=CanvasRenderingContext2D.prototype;
  window.__calls=[];
  let pts=[];
  const mt=P.moveTo,lt=P.lineTo,f=P.fill,bf=P.beginPath,fr=P.fillRect;
  P.beginPath=function(){pts=[];return bf.call(this);};
  P.moveTo=function(x,y){pts.push([x,y]);return mt.call(this,x,y);};
  P.lineTo=function(x,y){pts.push([x,y]);return lt.call(this,x,y);};
  P.fill=function(...a){
    const st=String(this.fillStyle);
    if(window.__rec && /#|rgb/.test(st)){
      const ys=pts.map(q=>q[1]),xs=pts.map(q=>q[0]);
      if(ys.length&&Math.max(...ys)>500)window.__calls.push({t:'poly',st,xs:[Math.min(...xs),Math.max(...xs)],ys:[Math.min(...ys),Math.max(...ys)],n:pts.length});
    }
    return f.apply(this,a);
  };
  P.fillRect=function(x,y,w,h){ if(window.__rec) window.__calls.push({t:'rect',st:String(this.fillStyle),x,y,w,h}); return fr.call(this,x,y,w,h); };
});
await p.goto('http://127.0.0.1:3000/tests/debug.html?test=1');
await p.waitForFunction(()=>window.__coastTest);
await p.click('#startBtn');
await p.waitForTimeout(2200);
await p.evaluate(()=>window.__coastTest.pause());
await p.waitForTimeout(120);
await p.evaluate(()=>{window.__calls=[];window.__rec=true;});
await p.waitForTimeout(200);
const calls=await p.evaluate(()=>{window.__rec=false;return window.__calls.slice(0,4000);});
const lower=calls.filter(c=>c.ys?c.ys[0]>580:c.y>580);
console.log('calls in lower half:',lower.length);
for(const c of lower.slice(0,40))console.log(JSON.stringify(c));
await b.close();
