import { chromium } from 'playwright';
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto('http://127.0.0.1:3000/tests/Q_combined.html?test=1');
await p.waitForFunction(()=>window.__coastTest);
await p.click('#startBtn');
await p.waitForTimeout(2200);
const data=await p.evaluate(()=>{
  const src=document.getElementById('scene');
  const c=document.createElement('canvas');c.width=src.width;c.height=src.height;
  const g=c.getContext('2d');g.drawImage(src,0,0);
  const d=g.getImageData(0,0,c.width,c.height).data;
  const row=y=>{const out=[];for(let x=0;x<c.width;x+=8){const i=(y*c.width+x)*4;out.push([x,d[i],d[i+1],d[i+2]]);}return out;};
  return {a:row(652),b:row(653),c:row(654)};
});
function show(name,row){const bright=row.filter(v=>Math.abs(v[1]-52)>18);console.log(name,'bright count',bright.length, JSON.stringify(bright.slice(0,6)),'...',JSON.stringify(bright.slice(-4)));}
show('652',data.a);show('653',data.b);show('654',data.c);
await b.close();
