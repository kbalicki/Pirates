/**
 * measure-battle.mjs — how far is the enemy, and is he in the picture?
 *
 * The arena is three screens wide and the camera follows the player, so the
 * enemy can leave the view entirely. Nothing in the game says which way he
 * went. This counts the frames in which he is off the screen, against the two
 * numbers that decide a battle: the cannon range and the disengage timer.
 *
 * Usage: node scripts/measure-battle.mjs [runs] [--policy=run|hold|chase]
 */
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => {
  const i = a.indexOf('='); return i === -1 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)];
}));
const runs = parseInt(args.find(a => !a.startsWith('--')) ?? '1', 10);
const policy = String(flags.policy ?? 'run');
const kinds = (flags.kinds ?? 'navy,pirate,trader,hunter').split(',');

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });

const pump = (frames) => page.evaluate((n) => {
  const g = window.__PHASER_GAME__;
  if (!g) return 0;
  let t = performance.now();
  for (let i = 0; i < n; i++) { t += 16.7; g.loop.step(t); }
  return g.loop.frame;
}, frames);

/** One sample of the fight, read from the live scene. */
const probe = () => page.evaluate(() => {
  const g = window.__PHASER_GAME__;
  const s = g.scene.scenes.find(x => x.scene.key === 'SeaBattleScene' && x.scene.isActive());
  if (!s || !s.combatState) return null;
  const cs = s.combatState;
  const p = cs.entities[cs.playerShipId];
  const e = cs.entities[cs.enemyShipId];
  if (!p || !e) return null;
  const cam = s.cameras.main;
  const v = cam.worldView;
  const dx = e.pos.x - p.pos.x, dy = e.pos.y - p.pos.y;
  return {
    tick: cs.time.tick,
    dist: Math.hypot(dx, dy),
    cannonRange: cs.cannonRange,
    arena: cs.arena,
    view: { w: v.width, h: v.height },
    enemyOnScreen: v.contains(e.pos.x, e.pos.y),
    playerOnScreen: v.contains(p.pos.x, p.pos.y),
    farMs: s.farDistanceMs,
    countMs: s.countdownMs,
    countdownShown: s.timeoutText ? s.timeoutText.visible : null,
    over: s.battleOver === true,
    enemyHull: e.ship ? e.ship.hullHp : null,
    playerHull: p.ship ? p.ship.hullHp : null,
  };
});

const rows = [];
for (let r = 0; r < runs; r++) {
  const kind = kinds[r % kinds.length];
  await page.goto(`http://localhost:3000/?battle=${kind}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(res => setTimeout(res, 3500));
  await pump(2);                     // the very first frames, before anything moves
  const first = await probe();
  if (!first) { console.log(`run ${r} (${kind}): no battle scene`); continue; }

  // Policy: what the captain does. `run` = helm hard over, full sails, away.
  if (policy === 'run') {
    await page.keyboard.press('w');   // sails: Battle -> Full
    for (let i = 0; i < 40; i++) { await page.keyboard.press('a'); }  // come about
  } else if (policy === 'hold') {
    /* nothing: he sits where he spawned */
  }

  const samples = [];
  let offFrames = 0, total = 0, firstOffTick = null, endedAt = null;
  // 120 s of battle at 60 fps = 7200 frames; batches of 60, probe each batch.
  for (let b = 0; b < 130; b++) {
    await pump(60);
    const s = await probe();
    if (!s) { endedAt = 'scene gone'; break; }
    total++;
    if (!s.enemyOnScreen) { offFrames++; if (firstOffTick === null) firstOffTick = s.tick; }
    samples.push(s);
    if (s.over) { endedAt = 'battleOver'; break; }
  }
  const last = samples[samples.length - 1] ?? first;
  rows.push({
    kind, policy,
    firstFrameEnemyOnScreen: first.enemyOnScreen,
    firstFrameDist: Math.round(first.dist),
    cannonRange: Math.round(first.cannonRange),
    viewW: first.view.w, arenaW: first.arena.width,
    offScreenShare: total ? (offFrames / total) : 0,
    firstOffAtSec: firstOffTick === null ? null : Math.round(firstOffTick / 60),
    lastDist: Math.round(last.dist),
    farMs: Math.round(last.farMs ?? 0),
    countMs: Math.round(last.countMs ?? 0),
    countdownShown: last.countdownShown,
    endedAt: endedAt ?? 'ran out of samples',
    hulls: `${Math.round(last.playerHull ?? 0)}/${Math.round(last.enemyHull ?? 0)}`,
  });
  console.log(JSON.stringify(rows[rows.length - 1]));
}

console.log('\n=== summary ===');
console.log(JSON.stringify(rows, null, 1));
await browser.close();
