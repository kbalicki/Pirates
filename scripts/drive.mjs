/**
 * drive.mjs — walk the running game with a keyboard and take pictures.
 *
 * `screenshot.mjs` can only reach the two or three states its hardcoded key
 * sequences know about. This drives an arbitrary one: it pumps Phaser's clock
 * by hand (a headless tab throttles requestAnimationFrame, so `delayedCall`
 * timers never fire and the game looks frozen), presses whatever keys you
 * name, and dumps the world state afterwards.
 *
 * Usage:
 *   node scripts/drive.mjs <url> <out.png> [keys] [--scene=Key:json] [--wait=ms]
 *
 *   keys      comma-separated Puppeteer key names, e.g. "Enter,2,s,s,Enter".
 *             One screenshot per key, named <out>_<n>_<key>.png.
 *   --scene   jump straight into a scene: --scene=PortScene:{"portId":"havana"}
 *             The current worldState is passed in as `worldState`.
 *   --wait    extra milliseconds before driving (default 3500).
 *
 * Examples:
 *   node scripts/drive.mjs "http://localhost:3000/?siege=cartagena" out.png "Space,Space,Space,l"
 *   node scripts/drive.mjs "http://localhost:3000/?skip" out.png "Enter,2" --scene=PortScene:{"portId":"port_royal"}
 */
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args.filter(a => a.startsWith('--')).map(a => {
    const i = a.indexOf('=');
    return i === -1 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)];
  }),
);
const [url, out = 'drive.png', keyList = ''] = args.filter(a => !a.startsWith('--'));
if (!url) {
  console.error('usage: node scripts/drive.mjs <url> [out.png] [keys] [--scene=Key:json] [--wait=ms]');
  process.exit(1);
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });

const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

// `networkidle0` is not reachable here: Vite's HMR socket and the game's own
// audio streaming keep a request open for as long as the page lives, so the
// navigation waits out its timeout and the run dies before it starts. Wait for
// the document and let `--wait` cover the boot.
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
await new Promise(r => setTimeout(r, parseInt(flags.wait ?? '3500', 10)));

/**
 * Advance Phaser's clock by hand.
 *
 * Keep the batches small (≤60 frames). A few hundred frames in one evaluate
 * hangs the renderer and the CDP call times out after 45 s.
 */
const pump = (frames) => page.evaluate((n) => {
  const g = window.__PHASER_GAME__;
  if (!g) return 0;
  let t = performance.now();
  for (let i = 0; i < n; i++) { t += 16.7; g.loop.step(t); }
  return g.loop.frame;
}, frames);

await pump(60);

if (flags.scene) {
  const split = String(flags.scene).indexOf(':');
  const sceneKey = split === -1 ? String(flags.scene) : String(flags.scene).slice(0, split);
  const data = split === -1 ? {} : JSON.parse(String(flags.scene).slice(split + 1));
  await page.evaluate(({ sceneKey, data }) => {
    const g = window.__PHASER_GAME__;
    const world = g.registry.get('worldState');
    for (const scene of g.scene.scenes) {
      if (scene.scene.isActive() && scene.scene.key !== 'BootScene') scene.scene.stop();
    }
    g.scene.start(sceneKey, { worldState: world, ...data });
  }, { sceneKey, data });
  await pump(30);
}

await page.screenshot({ path: out });

let i = 0;
for (const key of keyList.split(',').filter(Boolean)) {
  await page.keyboard.press(key);
  await pump(24);
  await page.screenshot({ path: out.replace(/\.png$/, `_${i++}_${key}.png`) });
}

// Let any delayedCall chains (assault waves, result banners) run out.
for (let n = 0; n < 10; n++) { await pump(40); await new Promise(r => setTimeout(r, 150)); }
await page.screenshot({ path: out.replace(/\.png$/, '_final.png') });

const state = await page.evaluate(() => {
  const g = window.__PHASER_GAME__;
  const w = g.registry.get('worldState');
  if (!w) return { scenes: g.scene.scenes.filter(s => s.scene.isActive()).map(s => s.scene.key) };
  return {
    scenes: g.scene.scenes.filter(s => s.scene.isActive()).map(s => s.scene.key),
    day: w.time.day,
    gold: w.player.gold,
    citiesCaptured: w.player.citiesCaptured,
    courtship: w.player.courtship,
    quests: w.player.questLog.map(q => ({ id: q.questId, stage: q.stage, done: q.completed })),
    flags: Object.keys(w.worldFlags).filter(k => w.worldFlags[k]),
    // Towns that are not where the 1680 map left them, plus any royal squadron
    // currently at sea for one of them.
    towns: Object.entries(w.ports)
      .filter(([, p]) => p.capturedDay !== undefined || (p.garrison ?? 0) > 0)
      .map(([k, p]) => `${k}=${p.factionId} garrison:${p.garrison ?? 0} defense:${p.defense}`),
    reliefs: w.worldEvents
      .filter(e => e.type === 'reconquest')
      .map(e => `${e.ports[0]} <- ${e.factions[0]}, ${e.endDay - w.time.day}d, ${e.vars.soldiers} men`),
    // Every landing at sea, whoever is sending it, and whether it currently has
    // hulls on the chart (v0.17.0). `afloat` on an event with no hulls listed
    // below it would mean the ledger and the world had come apart.
    expeditions: w.worldEvents
      .filter(e => e.type === 'reconquest' || e.type === 'campaign')
      .map(e => `${e.type} ${e.ports[0]} <- ${e.factions[0]}, ${e.endDay - w.time.day}d, ` +
                `${e.vars.soldiers} men / ${e.vars.guns} guns${e.vars.afloat ? ' AFLOAT' : ''}`),
    expeditionHulls: Object.entries(w.entities)
      .filter(([, e]) => e.ai && e.ai.expedition)
      .map(([id, e]) => `${id} ${e.ship.classId} men:${e.ai.expedition.soldiers} ` +
                        `guns:${e.ai.expedition.guns} hull:${Math.round(e.ship.hullHp)}`),
    consorts: (w.player.fleet || []).map(f => `${f.classId} hull:${Math.round(f.hullHp)} crew:${f.crew}`),
    log: w.eventLog.slice(-8).map(e => e.key),
    // Flags on the map are drawn once and repainted when a town changes hands.
    // Anything listed here is a town whose drawn colours no longer match who
    // actually holds it — the exact bug the repaint exists to prevent.
    staleFlags: (() => {
      const map = g.scene.scenes.find(s => s.scene.key === 'MainMapScene');
      const byPort = map && map.portMarkers && map.portMarkers.flagByPort;
      if (!byPort) return null;
      const bad = [];
      for (const [key, img] of byPort) {
        const want = `flag_${w.ports[key] ? w.ports[key].factionId : '?'}`;
        if (img.texture.key !== want) bad.push(`${key} drawn:${img.texture.key} owner:${want}`);
      }
      return bad;
    })(),
  };
});

console.log(JSON.stringify(state, null, 2));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
