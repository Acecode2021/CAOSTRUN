import { chromium } from 'playwright';
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto('http://127.0.0.1:3000/tests/debug.html?test=1');
await p.waitForFunction(()=>window.__coastTest);
await p.click('#startBtn');
await p.waitForTimeout(2500);
const out=await p.evaluate(()=>{
  const src=document.querySelector('canvas');
  const c=document.createElement('canvas');c.width=src.width;c.height=src.height;
  const g=c.getContext('2d');g.drawImage(src,0,0);
  const dpr=window.devicePixelRatio||1;
  const d=g.getImageData(0,0,c.width,c.height).data;
  const rows=[];
  for(let y=0;y<c.height;y+=1){
    const px=(x)=>[d[(y*c.width+x*1)*4],d[(y*c.width+x*1)*4+1],d[(y*c.width+x*1)*4+2]];
    rows.push([Math.round(y/dpr),px(Math.round(700*dpr))]);
  }
  return {w:c.width,h:c.height,dpr,rows};
});
console.log(out.dpr,out.w,out.h);
for(const [y,px] of out.rows){ const [r,g,b]=px; if((r>140&&g<110&&b>110)||(g>140&&r<110)||(g>140&&b>140&&r<110)) console.log(y,px); }
await b.close();
