/**
 * Read the text a Phaser scene is actually drawing, for verifying a screen.
 *
 * Every release that changes a sentence has to be looked at, and twice now a
 * naive `scene.children.each` has come back empty: the objects that matter are
 * nested inside containers, so this walks `list` / `children.list` recursively
 * over every active scene. Keyboard steps are given as a comma-separated list
 * of key names, which is how you get from the port menu to the tavern board.
 *
 *   npm run build && npx vite preview --port 3000
 *   node scripts/board.mjs "http://localhost:3000/?event=campaign&port=havana&ashore=1&days=18&aged=0&lang=pl" "ArrowDown,Enter,ArrowDown,Enter"
 */
import puppeteer from 'puppeteer';

const url = process.argv[2];
const steps = (process.argv[3] || '').split(',').filter(Boolean);
const settleMs = parseInt(process.argv[4] || '4500', 10);

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, settleMs));

for (const step of steps) {
  // "shift+Enter" / "ctrl+Enter" — the counter reads the modifiers (v0.76.0).
  const [mod, key] = step.includes("+") ? step.split("+") : [null, step];
  if (mod) await page.keyboard.down(mod === "ctrl" ? "Control" : "Shift");
  await page.keyboard.press(key);
  if (mod) await page.keyboard.up(mod === "ctrl" ? "Control" : "Shift");
  await new Promise(r => setTimeout(r, 900));
}

const texts = await page.evaluate(() => {
  const out = [];
  const walk = (o) => {
    if (!o) return;
    if (o.type === 'Text' && o.text && o.text.trim()) out.push(o.text.trim());
    const kids = o.list || (o.children && o.children.list);
    if (kids) kids.forEach(walk);
  };
  window.__PHASER_GAME__.scene.scenes
    .filter(s => s.sys.settings.active)
    .forEach(s => walk(s.sys.displayList));
  return out;
});

console.log(JSON.stringify(texts, null, 1));
await browser.close();
