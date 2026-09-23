#!/usr/bin/env node
/**
 * probe-keys.mjs — press every key a scene answers to, and write down what it changed.
 *
 * `audit-layout.mjs` already answers two of the three questions a keyboard
 * raises: which keys the screen **promises** and does not bind
 * (`OBIECANE-NIEZWIAZANE`), and which it binds without saying so
 * (`ZWIAZANE-NIEZAPOWIEDZIANE`). The third has never been asked here:
 *
 *   **which keys are bound, announced — and change nothing at all?**
 *
 * v0.85.0 found `ESC` in `SeaBattleScene` bound, named in the hint line, and
 * with no `case` in the engine: the command was built, handed to
 * `CombatEngine.apply`, and fell through to a state byte-identical to a tick
 * with no command in it. Two source sweeps had walked past it — v0.81.0's,
 * which asks whether a promised key has a handler, and v0.84.0's, which asks
 * whether a bound key is named. A handler that does nothing passes both.
 *
 * Only pressing the key sees it.
 *
 * Usage:
 *   node scripts/probe-keys.mjs                 # every scene
 *   node scripts/probe-keys.mjs --only=PortScene
 *   node scripts/probe-keys.mjs --json          # machine-readable
 *
 * ── How a change is detected ───────────────────────────────────────────────
 *
 * Four channels, because a key may move any of them and nothing else:
 *
 *   scenes  — the set of active scene keys (a key that opens or closes a screen)
 *   texts   — every `Text` in the scene, with position, colour, weight and
 *             alpha (a cursor, a tab, a redrawn number, a flashed banner)
 *   world   — a digest of `worldState` (gold, day, heading, sail, cargo, flags)
 *   camera  — scroll and zoom
 *
 * ── The control run ────────────────────────────────────────────────────────
 *
 * Half these scenes are alive: waves roll, gulls circle, the clock runs, a
 * banner fades. So **every scene is measured twice with no key pressed at
 * all**, and whatever moved on its own is subtracted from every key's result.
 * Without that the report would say that every key in `MainMapScene` changes
 * the world, because the world changes whether or not anybody touches it.
 *
 * ── Resetting ──────────────────────────────────────────────────────────────
 *
 * The scene is rebuilt before every key. A key that opens a screen would
 * otherwise send the next key somewhere else entirely, and a key that spends
 * gold would leave less of it for the one after.
 */
import puppeteer from 'puppeteer';
import { RECIPES, labelOf } from './scene-recipes.mjs';

const BASE = 'http://localhost:3000/';
const NL = String.fromCharCode(10);


const args = process.argv.slice(2);
const flag = (name) => {
  const hit = args.find(a => a.startsWith(`--${name}`));
  if (!hit) return undefined;
  const i = hit.indexOf('=');
  return i === -1 ? true : hit.slice(i + 1);
};
const only = flag('only');
const asJson = flag('json');

/** Puppeteer's name for a key this report calls `SPACE`, `1`, `LEFT`. */
const PRESSABLE = {
  SPACE: 'Space', ENTER: 'Enter', ESC: 'Escape', TAB: 'Tab',
  LEFT: 'ArrowLeft', RIGHT: 'ArrowRight', UP: 'ArrowUp', DOWN: 'ArrowDown',
  SHIFT: 'Shift', CTRL: 'Control', PAGE_UP: 'PageUp', PAGE_DOWN: 'PageDown',
};
const pressName = (k) => PRESSABLE[k] ?? (k.length === 1 ? k : null);

/**
 * Everything a key could plausibly move, read out of the live game.
 *
 * Runs inside the page.
 */
const SNAP = function (sceneKey) {
  const g = window.__PHASER_GAME__;
  const scene = g.scene.scenes.find(s => s.scene.key === sceneKey);
  const scenes = g.scene.scenes.filter(s => s.scene.isActive()).map(s => s.scene.key).sort();
  if (!scene || !scene.scene.isActive()) return { missing: true, scenes };

  const texts = [];
  const walk = (list, ox, oy) => {
    for (const obj of list) {
      if (!obj) continue;
      if (obj.type === 'Text') {
        const st = obj.style || {};
        texts.push([
          Math.round((obj.x ?? 0) + ox), Math.round((obj.y ?? 0) + oy),
          String(obj.text ?? '').slice(0, 60),
          st.color ?? '', st.fontStyle ?? '', st.fontSize ?? '',
          obj.visible === false ? 'hidden' : '',
          Math.round((obj.alpha ?? 1) * 10),
        ].join('|'));
      }
      if (obj.type === 'Container' && obj.list) walk(obj.list, ox + (obj.x ?? 0), oy + (obj.y ?? 0));
    }
  };
  walk(scene.children ? scene.children.list : [], 0, 0);

  const cam = scene.cameras && scene.cameras.main;
  const w = g.registry.get('worldState');
  const ship = w && w.entities[w.player.shipId];
  const world = w ? {
    day: w.time.day,
    gold: w.player.gold,
    notoriety: w.player.notoriety,
    location: w.player.location.type + ':' + (w.player.location.portId ?? ''),
    heading: ship ? Math.round(ship.heading * 100) : null,
    sail: ship ? Math.round((ship.sailLevel ?? 0) * 100) : null,
    mode: ship ? ship.mode : null,
    cargo: ship && ship.ship ? JSON.stringify(ship.ship.cargo) : null,
    fleet: (w.player.fleet || []).map(f => f.classId).join(','),
    flags: Object.keys(w.worldFlags).filter(k => w.worldFlags[k]).sort().join(','),
    logLen: w.eventLog.length,
    lastLog: w.eventLog.length ? w.eventLog[w.eventLog.length - 1].key : '',
    quests: w.player.questLog.map(q => q.questId + ':' + q.stage).join(','),
    ammo: ship && ship.ship ? (ship.ship.ammoType ?? '') : null,
  } : {};

  return {
    scenes,
    texts,
    world,
    camera: cam ? [Math.round(cam.scrollX), Math.round(cam.scrollY), Math.round(cam.zoom * 100)] : null,
  };
};

/** What differs between two snapshots, as a set of tags. */
function channels(a, b) {
  const out = { scenes: [], texts: [], world: [], camera: [] };
  if (a.missing || b.missing) {
    if (a.missing !== b.missing) out.scenes.push('scene gone');
    return out;
  }
  if (a.scenes.join(',') !== b.scenes.join(',')) {
    for (const s of b.scenes) if (!a.scenes.includes(s)) out.scenes.push('+' + s);
    for (const s of a.scenes) if (!b.scenes.includes(s)) out.scenes.push('-' + s);
  }
  const setA = new Set(a.texts), setB = new Set(b.texts);
  for (const t of setB) if (!setA.has(t)) out.texts.push('+' + t);
  for (const t of setA) if (!setB.has(t)) out.texts.push('-' + t);
  for (const k of Object.keys(b.world)) {
    if (JSON.stringify(a.world[k]) !== JSON.stringify(b.world[k])) {
      out.world.push(`${k}: ${JSON.stringify(a.world[k])} -> ${JSON.stringify(b.world[k])}`);
    }
  }
  if (JSON.stringify(a.camera) !== JSON.stringify(b.camera)) {
    out.camera.push(`${JSON.stringify(a.camera)} -> ${JSON.stringify(b.camera)}`);
  }
  return out;
}

/** Drop whatever the scene does to itself while nobody is touching it. */
function minusNoise(d, noise) {
  const dropTextNoise = (arr) => {
    // A text entry carries its position, so a banner that fades or a clock
    // that ticks produces a different string every frame. Match the noise on
    // the part that identifies the object rather than the whole entry.
    const noisy = new Set(noise.texts.map(t => t.slice(1).split('|').slice(2).join('|')));
    return arr.filter(t => !noisy.has(t.slice(1).split('|').slice(2).join('|')));
  };
  return {
    scenes: d.scenes.filter(x => !noise.scenes.includes(x)),
    texts: dropTextNoise(d.texts),
    world: d.world.filter(x => !noise.world.some(n => n.split(':')[0] === x.split(':')[0])),
    camera: noise.camera.length ? [] : d.camera,
  };
}

const empty = (d) => !d.scenes.length && !d.texts.length && !d.world.length && !d.camera.length;

// ── Drive ──────────────────────────────────────────────────────────────────

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

async function build(recipe) {
  await page.goto(BASE + recipe.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(r => setTimeout(r, recipe.wait ?? 3800));
  await pump(60);
  if (recipe.start) {
    // Paused, not stopped — which is how the game itself opens these screens,
    // and the reason this probe can pump frames afterwards while
    // `audit-layout.mjs` cannot. A stopped `MainMapScene` leaves its renderers
    // holding a destroyed camera, and the next `g.loop.step` dies reading
    // `cam.zoom`. The audit never notices because it measures one still frame.
    await page.evaluate(({ key, data }) => {
      const g = window.__PHASER_GAME__;
      const world = g.registry.get('worldState');
      const target = g.scene.getScene(key);
      for (const s of g.scene.scenes) {
        if (s.scene.isActive() && s.scene.key !== 'BootScene' && s.scene.key !== key) s.scene.pause();
      }
      // See `audit-layout.mjs`: a scene that is already up is restarted, never
      // stopped and started, because the two are processed stop-last.
      if (target && target.scene.isActive()) target.scene.restart({ worldState: world, ...data });
      else g.scene.start(key, { worldState: world, ...data });
    }, { key: recipe.start, data: recipe.data ?? {} });
    await pump(40);
  }
  // A screen with phases needs walking into. `settle` covers the delayedCall
  // chains an assault runs between them.
  for (const k of String(recipe.keys ?? '').split(',').filter(Boolean)) {
    await page.keyboard.press(k);
    await pump(24);
  }
  if (recipe.settle) {
    for (let n = 0; n < Math.ceil(recipe.settle / 40); n++) {
      await pump(40);
      await new Promise(r => setTimeout(r, 60));
    }
  }
  // Keys pressed after the screen has settled, for a phase that is reached
  // from a settled one. `keys` and `then` cannot be one list: the assault's
  // spoils are three bombardments and a landing away, and the key that takes
  // the spoils has to arrive **after** the wave loop has finished, not while
  // it is still running.
  for (const k of String(recipe.then ?? '').split(',').filter(Boolean)) {
    await page.keyboard.press(k);
    await pump(12);
  }
  // Exact, for a screen that is on a clock. `settle` pumps whole batches and
  // overshoots: a phase drawn for 1600 ms is 96 frames, and the smallest
  // `settle` there is walks 80 of them at a time.
  if (recipe.frames) await pump(recipe.frames);

  // Real time, not pumped frames. Pumping Phaser's loop moves the game's
  // clock and nothing else, and the save tab draws its slots — and binds the
  // eight keys its hint line names — from an **IndexedDB read**, which
  // resolves on the browser's own queue. Measured without this, the audit
  // reported `DELETE DOWN ENTER L UP X` as promised and unbound on a screen
  // where all six are bound 300 ms later. A tool that measures a screen
  // before it exists is worse than no tool (v0.94.0).
  await new Promise(r => setTimeout(r, 350));
  await pump(20);
}

/**
 * Did the walk-in land where the recipe says it must?
 *
 * `require` is a piece of text the screen shows in that state, in the language
 * the recipes run in. A key, not being on the screen, would never match.
 */
async function reached(recipe) {
  if (!recipe.require) return true;
  const snap = await page.evaluate(SNAP, recipe.key);
  if (snap.missing) return false;
  const want = Array.isArray(recipe.require) ? recipe.require : [recipe.require];
  return want.every(needle => snap.texts.some(t => t.includes(needle)));
}

/** Build until the precondition holds, or give up and say so. */
async function buildUntil(recipe) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await build(recipe);
    if (await reached(recipe)) return true;
  }
  return false;
}

/** Bound keys, read the way `audit-layout.mjs` reads them. */
const BOUND = function (sceneKey) {
  const g = window.__PHASER_GAME__;
  const scene = g.scene.scenes.find(s => s.scene.key === sceneKey);
  if (!scene || !scene.scene.isActive()) return null;
  const CODE = {
    9: 'TAB', 13: 'ENTER', 16: 'SHIFT', 17: 'CTRL', 27: 'ESC', 32: 'SPACE',
    37: 'LEFT', 38: 'UP', 39: 'RIGHT', 40: 'DOWN',
  };
  const WORD = {
    ZERO: '0', ONE: '1', TWO: '2', THREE: '3', FOUR: '4',
    FIVE: '5', SIX: '6', SEVEN: '7', EIGHT: '8', NINE: '9', ESCAPE: 'ESC',
  };
  const bound = {};
  let wildcard = false;
  const kb = scene.input && scene.input.keyboard;
  if (kb) {
    for (const name of kb.eventNames()) {
      // A scene may listen to `keydown` wholesale and switch on `event.key`
      // itself. `CharacterCreationScene` does, because it takes a typed name.
      // Both key tools read `keydown-X` and `addKey`, so such a screen answers
      // to arrows, Enter, Backspace and every letter while reporting ZERO
      // bound keys. It is not a finding about the screen; it is a blind spot
      // in the reading, and it is named rather than left as a zero.
      if (name === 'keydown') { wildcard = true; continue; }
      if (typeof name !== 'string' || name.indexOf('keydown-') !== 0) continue;
      const key = name.slice(8).toUpperCase();
      bound[WORD[key] || key] = true;
    }
    for (const codeStr of Object.keys(kb.keys || {})) {
      const code = Number(codeStr);
      if (!kb.keys[code]) continue;
      if (CODE[code]) bound[CODE[code]] = true;
      else if (code >= 48 && code <= 57) bound[String(code - 48)] = true;
      else if (code >= 65 && code <= 90) bound[String.fromCharCode(code)] = true;
    }
  }
  return { keys: Object.keys(bound).sort(), wildcard };
};

/** What to press at a screen that reads `event.key` itself. */
const WILDCARD_KEYS = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'ENTER', 'ESC', 'TAB', 'SPACE', 'A', '1'];

const report = [];

for (const recipe of RECIPES) {
  if (only && recipe.key !== only && labelOf(recipe) !== only) continue;
  try {
    if (!await buildUntil(recipe)) {
      report.push({ scene: labelOf(recipe), error: `nie dało się dojść do tego stanu w 5 próbach (szukano: "${recipe.require}")` });
      continue;
    }
    const read = await page.evaluate(BOUND, recipe.key);
    if (read === null) { report.push({ scene: labelOf(recipe), error: 'scene not active' }); continue; }
    const bound = read.wildcard
      ? [...new Set([...read.keys, ...WILDCARD_KEYS])].sort()
      : read.keys;

    // Control: the same two measurements with nobody at the keyboard.
    const c0 = await page.evaluate(SNAP, recipe.key);
    await pump(24);
    const c1 = await page.evaluate(SNAP, recipe.key);
    const noise = channels(c0, c1);

    // ── First pass: every key, from the screen as it opens ────────────────
    const rows = [];
    for (const key of bound) {
      const name = pressName(key);
      if (!name) { rows.push({ key, skipped: 'brak nazwy w puppeteerze' }); continue; }
      if (!await buildUntil(recipe)) { rows.push({ key, skipped: 'stan nieosiągalny' }); continue; }
      const before = await page.evaluate(SNAP, recipe.key);
      await page.keyboard.press(name);
      await pump(24);
      const after = await page.evaluate(SNAP, recipe.key);
      rows.push({ key, diff: minusNoise(channels(before, after), noise) });
    }

    // ── Second pass: the ones that did nothing, tried from somewhere else ──
    //
    // `1` on a manual already showing its first tab changes nothing, and so
    // does `LEFT` on the leftmost row. Neither is a dead key: it is a key with
    // nowhere to go. Telling the two apart needs a different starting state,
    // so each suspect is pressed again after one of the keys that DID move
    // something. A key that changes nothing from any of them changes nothing.
    // Biggest mover first. Alphabetical order tried `1`, `A` and `DOWN` at the
    // character sheet and never `ENTER`, which is the one key that reaches the
    // second page — where `LEFT` and `RIGHT` live. A setup key is only useful
    // if it moves the screen somewhere else.
    const movers = rows
      .filter(r => r.diff && !empty(r.diff))
      .sort((a, b) =>
        (b.diff.scenes.length * 1000 + b.diff.texts.length) -
        (a.diff.scenes.length * 1000 + a.diff.texts.length))
      .map(r => r.key);
    for (const r of rows) {
      if (r.skipped || !empty(r.diff)) continue;
      r.retried = [];
      for (const setup of movers.filter(m => m !== r.key).slice(0, 3)) {
        if (!await buildUntil(recipe)) break;
        await page.keyboard.press(pressName(setup));
        await pump(24);
        const before = await page.evaluate(SNAP, recipe.key);
        if (before.missing) continue;   // the setup key left the screen
        await page.keyboard.press(pressName(r.key));
        await pump(24);
        const after = await page.evaluate(SNAP, recipe.key);
        const d = minusNoise(channels(before, after), noise);
        r.retried.push(setup);
        if (!empty(d)) { r.diff = d; r.after = setup; break; }
      }
    }
    report.push({ scene: labelOf(recipe), bound, wildcard: read.wildcard, noise, rows });
  } catch (err) {
    report.push({ scene: labelOf(recipe), error: String(err?.message ?? err).split(NL)[0] });
  }
}

await browser.close();

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  let deadTotal = 0, pressedTotal = 0;
  for (const row of report) {
    if (row.error) { console.log(`${NL}${row.scene}  — BŁĄD: ${row.error}`); continue; }
    const dead = [];
    const lines = [];
    for (const r of row.rows) {
      if (r.skipped) { lines.push(`  ${r.key.padEnd(6)} — pominięty (${r.skipped})`); continue; }
      pressedTotal++;
      if (empty(r.diff)) { dead.push(r.key + (r.retried && r.retried.length ? '' : '?')); continue; }
      const what = [];
      if (r.diff.scenes.length) what.push(`sceny ${r.diff.scenes.join(' ')}`);
      if (r.diff.world.length) what.push(`świat: ${r.diff.world.slice(0, 2).join('; ')}`);
      if (r.diff.camera.length) what.push(`kamera ${r.diff.camera[0]}`);
      if (r.diff.texts.length) what.push(`${r.diff.texts.length} napisów`);
      lines.push(`  ${r.key.padEnd(6)} — ${what.join(' · ')}` +
        (r.after ? `  (dopiero po ${r.after} — z ekranu otwarcia nie robi nic)` : ''));
    }
    deadTotal += dead.length;
    console.log(`${NL}${row.scene}  (${row.bound.length} związanych${row.wildcard ? ', w tym nasłuch ogólny — zestaw próbny' : ''})`);
    for (const l of lines) console.log(l);
    if (dead.length) console.log(`  NIC-NIE-ZMIENIA: ${dead.join(' ')}`);
  }
  console.log(`${NL}RAZEM: ${deadTotal} klawiszy nie zmienia niczego, z ${pressedTotal} naciśniętych.`);
}
