/**
 * How many times one physical key press reaches a Phaser handler.
 *
 * v0.76.0 measured this on the merchant's counter — one DOM `keydown` arriving
 * three times, one to two milliseconds apart, with exactly one listener
 * registered — and gated that one screen. This walks the others: the same
 * press, counted on whatever scene the URL lands on, against the number of
 * listeners actually registered for it.
 *
 *   npm run build && npx vite preview --port 3000
 *   node scripts/keycount.mjs "http://localhost:3000/?..." "ArrowDown,Enter" ENTER
 */
import puppeteer from 'puppeteer';

const url = process.argv[2];
const steps = (process.argv[3] || '').split(',').filter(Boolean);
const key = process.argv[4] || 'Enter';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 4500));

for (const step of steps) {
  await page.keyboard.press(step);
  await new Promise(r => setTimeout(r, 800));
}

const evName = 'keydown-' + key.toUpperCase();
await page.evaluate((evName) => {
  const g = window.__PHASER_GAME__;
  window.__counts = {};
  window.__listeners = {};
  window.__dom = 0;
  window.addEventListener('keydown', () => { window.__dom++; }, true);
  for (const s of g.scene.getScenes(true)) {
    if (!s.input || !s.input.keyboard) continue;
    const name = s.scene.key;
    window.__counts[name] = 0;
    window.__listeners[name] = s.input.keyboard.listenerCount(evName);
    s.input.keyboard.on(evName, () => { window.__counts[name]++; });
  }
}, evName);

const mod = process.argv[5];
if (mod) await page.keyboard.down(mod === 'ctrl' ? 'Control' : 'Shift');
await page.keyboard.press(key);
if (mod) await page.keyboard.up(mod === 'ctrl' ? 'Control' : 'Shift');
await new Promise(r => setTimeout(r, 900));

const out = await page.evaluate(() => ({
  counts: window.__counts, listeners: window.__listeners, dom: window.__dom,
}));
console.log(JSON.stringify(out));
await browser.close();
