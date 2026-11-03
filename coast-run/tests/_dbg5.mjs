import { chromium } from 'playwright';
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
await p.addInitScript(()=>{
  const P=CanvasRenderingContext2D.prototype;
  window.__calls=[];window.__rec=false;
  let pts=[];
  const mt=P.moveTo,lt=P.lineTo,f=P.fill,bf=P.beginPath,fr=P.fillRect;
  P.beginPath=function(){pts=[];return bf.call(this);};
  P.moveTo=function(x,y){pts.push([x,y]);return mt.call(this,x,y);};
  P.lineTo=function(x,y){pts.push([x,y]);return lt.call(this,x,y);};
  P.fill=function(...a){
    if(window.__rec&&pts.length&&Math.max(...pts.map(q=>q[1]))>500)window.__calls.push({t:'poly',st:String(this.fillStyle),pts:pts.slice()});
    return f.apply(this,a);
  };
  P.fillRect=function(x,y,w,h){ if(window.__rec&&y+w>500&&y<900&&x<600&&x+w>400)window.__calls.push({t:'rect',st:String(this.fillStyle),pts:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]}); return fr.call(this,x,y,w,h); };
});
await p.goto('http://127.0.0.1:3000/tests/Q_combined.html?test=1');
await p.waitForFunction(()=>window.__coastTest);
await p.click('#startBtn');
await p.waitForTimeout(2200);
await p.evaluate(()=>{window.__calls=[];window.__rec=true;});
await p.waitForTimeout(120);
const calls=await p.evaluate(()=>{window.__rec=false;return window.__calls;});
// find rows at x=500 whose final painting is a strip (bright/pink) and report the chain
function inside(poly,x,y){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))c=!c;}return c;}
const rows={};
for(const y of [651,652,653,654,655,696,697,698,699,700]){
  const stack=[];
  for(const c of calls) if(inside(c.pts,500,y)) stack.push(c.st);
  rows[y]=stack.slice(-6);
}
console.log(JSON.stringify(rows,null,1));
console.log('calls',calls.length);
await b.close();
