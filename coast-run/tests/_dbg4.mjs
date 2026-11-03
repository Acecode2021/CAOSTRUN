import { chromium } from 'playwright';
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
for(const v of ['Z1_sidequad']){
  const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
  await p.goto(`http://127.0.0.1:3000/tests/${v}.html?test=1`);
  await p.waitForFunction(()=>window.__coastTest);
  await p.click('#startBtn');
  await p.waitForTimeout(2500);
  await p.screenshot({path:`/tmp/${v}.png`});
}
await b.close();
