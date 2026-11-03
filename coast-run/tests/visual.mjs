import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
for (const [name, vp, mobile] of [['desktop',{width:1440,height:900},false],['mobile',{width:390,height:844},true]]) {
  const context = await browser.newContext({viewport:vp,deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
  const page = await context.newPage();
  page.on('pageerror',e=>console.error('PAGE ERROR',e));
  await page.goto('http://127.0.0.1:3000');
  await page.waitForTimeout(1200);
  await page.screenshot({path:`tests/${name}-menu.png`});
  await page.click('#startBtn');
  await page.waitForTimeout(1800);
  await page.screenshot({path:`tests/${name}-race.png`});
  await page.keyboard.press('KeyP');
  await page.screenshot({path:`tests/${name}-pause.png`});
  console.log(name, await page.evaluate(()=>({state:document.body.dataset.state,score:document.getElementById('score').textContent,speed:document.getElementById('speed').textContent,overflow:document.documentElement.scrollWidth>innerWidth})));
  await context.close();
}
await browser.close();
