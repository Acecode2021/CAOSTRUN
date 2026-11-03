import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const errors = [];

async function newPage(opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base + '/?test=1');
  await page.waitForFunction(() => window.__coastTest);
  return { context, page };
}
const state = page => page.evaluate(() => window.__coastTest.state());

try {
  // Desktop: start, steering, boost, brake, near miss, pause, game over, restart, persistence.
  {
    const { context, page } = await newPage();
    assert.equal((await state(page)).state, 'menu');
    await page.fill('#driverName', 'ACE');
    await page.click('#startBtn');
    await page.waitForTimeout(300);
    let s = await state(page);
    assert.equal(s.state, 'running');
    assert.ok(s.score > 0);

    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(350);
    await page.keyboard.up('ArrowRight');
    s = await state(page);
    assert.ok(s.playerX > 0.3, 'steering moves the car');

    await page.keyboard.down('Space');
    await page.waitForTimeout(500);
    s = await state(page);
    assert.ok(s.boosting, 'nitro engages');
    assert.ok(s.nitro < 100, 'nitro drains');
    await page.keyboard.up('Space');

    const beforeBrake = (await state(page)).playerX;
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowDown');
    assert.ok((await state(page)).state === 'running');

    await page.evaluate(() => { window.__coastTest.setPlayerX(0); window.__coastTest.spawnNearMiss(); });
    await page.waitForTimeout(600);
    s = await state(page);
    assert.ok(s.nearMisses >= 1, 'near miss registers');
    assert.ok(s.combo >= 1, 'combo builds');

    await page.keyboard.press('KeyP');
    assert.equal((await state(page)).state, 'paused');
    const pausedScore = (await state(page)).score;
    await page.waitForTimeout(300);
    assert.equal((await state(page)).score, pausedScore, 'pause freezes score');
    await page.click('#resumeBtn');
    assert.equal((await state(page)).state, 'running');

    await page.evaluate(() => { window.__coastTest.crash(); window.__coastTest.crash(); window.__coastTest.crash(); });
    await page.waitForTimeout(800);
    assert.equal((await state(page)).state, 'over');
    assert.ok(await page.isVisible('#overOverlay'));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('coast-run.v1.scores')));
    assert.ok(saved.length >= 1 && saved[0].name === 'ACE');

    await page.keyboard.press('KeyR');
    await page.waitForTimeout(200);
    s = await state(page);
    assert.equal(s.state, 'running');
    assert.equal(s.health, 3);
    assert.ok(s.score < 100, 'instant restart resets score');

    await page.evaluate(() => window.__coastTest.menu());
    assert.ok(await page.isVisible('#menu'));
    assert.ok((await page.textContent('#menuScores')).includes('ACE'));
    await context.close();
  }

  // Mobile: touch pedals, drag steering, scores modal, no horizontal overflow.
  {
    const { context, page } = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    assert.ok(await page.isVisible('#mobileScoresBtn'));
    await page.click('#mobileScoresBtn');
    assert.ok(await page.isVisible('#scoresOverlay'));
    await page.click('#closeScoresBtn');
    assert.ok(!(await page.isVisible('#scoresOverlay')));

    await page.tap('#startBtn');
    await page.waitForTimeout(200);
    assert.ok(await page.isVisible('#touchControls'));

    const right = await page.locator('#rightBtn').boundingBox();
    await page.touchscreen.tap(right.x + right.width / 2, right.y + right.height / 2);
    // Hold via CDP for a real touch stream.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: right.x + 30, y: right.y + 30 }] });
    await page.waitForTimeout(350);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok((await state(page)).playerX > 0.2, 'touch steering works');

    const boost = await page.locator('#boostBtn').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: boost.x + 30, y: boost.y + 30 }] });
    await page.waitForTimeout(300);
    assert.ok((await state(page)).boosting, 'touch boost works');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    // Drag the road to steer left.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 500 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 90, y: 500 }] });
    await page.waitForTimeout(300);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok((await state(page)).playerX < 0.2, 'drag steering works');

    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.tap('#pauseBtn');
    assert.equal((await state(page)).state, 'paused');
    await context.close();
  }

  // Small landscape layout.
  {
    const { context, page } = await newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    await page.tap('#startBtn');
    await page.waitForTimeout(300);
    assert.ok(await page.isVisible('#touchControls'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: 'tests/landscape-race.png' });
    await context.close();
  }

  assert.deepEqual(errors, [], 'no page errors');
  console.log('SMOKE OK — desktop, mobile touch, landscape, pause/restart, near miss, boost, local scores.');
} finally {
  await browser.close();
}
