import { chromium } from 'playwright';
const file = process.argv[2];
const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto(`http://127.0.0.1:3000/${file}?test=1`);
await p.waitForFunction(() => window.__coastTest);
await p.click('#startBtn');
await p.waitForTimeout(2200);
await p.evaluate(() => window.__coastTest.pause());
await p.waitForTimeout(150);
const rows = await p.evaluate(() => {
  const src = document.getElementById('scene');
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const out = [];
  for (let y = 0; y < c.height; y++) {
    // average a band that avoids lane markings (centre half only, x 560..640)
    let r = 0, gg = 0, bb = 0, n = 0;
    for (let x = 560; x < 640; x += 4) { const i = (y * c.width + x) * 4; r += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
    out.push([r / n, gg / n, bb / n]);
  }
  return out;
});
let seam = 0, list = [];
for (let y = 540; y < rows.length - 1; y++) {
  const a = rows[y - 1], c = rows[y], e = rows[y + 1];
  const dev = Math.abs(c[0] - (a[0] + e[0]) / 2) + Math.abs(c[1] - (a[1] + e[1]) / 2) + Math.abs(c[2] - (a[2] + e[2]) / 2);
  if (dev > 6) { seam++; list.push([y, Math.round(dev)]); }
}
console.log(file,'deviation rows:',seam);for(const [y] of list.slice(0,12))console.log(y, rows[y-1].map(v=>Math.round(v)), rows[y].map(v=>Math.round(v)), rows[y+1].map(v=>Math.round(v)));
await b.close();
