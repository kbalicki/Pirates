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
 *   node scripts/probe-keys.mjs                      # every screen
 *   node scripts/probe-keys.mjs --only='PortScene[shipyard]'
 *   node scripts/probe-keys.mjs --json               # machine-readable
 *
 * Progress goes to **stderr**, so `> out.txt` keeps the report alone and a run
 * that takes minutes is not silent while it takes them. `--only` matches the
 * scene key or a recipe label, and a bare scene key takes every state of it.
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
import { RECIPES } from './scene-recipes.mjs';
import { openDriver, progress, labelOf } from './scene-driver.mjs';
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

const driver = await openDriver();
const { page, pump, buildUntil } = driver;

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

/**
 * The key that undoes this one, where there is one.
 *
 * A cursor on the top row answers `UP` with nothing, and the only honest way
 * to find out whether it answers at all is to move it down first.
 */
const OPPOSITE = {
  UP: 'DOWN', DOWN: 'UP', W: 'S', S: 'W',
  LEFT: 'RIGHT', RIGHT: 'LEFT', A: 'D', D: 'A',
  PAGE_UP: 'PAGE_DOWN', PAGE_DOWN: 'PAGE_UP',
};

const report = [];

const todo = RECIPES.filter(r => !only || r.key === only || labelOf(r) === only);
const bar = progress(todo.length);

let deadTotal = 0;
let pressedTotal = 0;
/** Keep the row for `--json`, and print it now for everybody else. */
const push = (row) => {
  report.push(row);
  if (asJson) return;
  const n = printRow(row);
  deadTotal += n.dead;
  pressedTotal += n.pressed;
};

for (const recipe of todo) {
  bar.tick(labelOf(recipe));
  // A screen that only exists for a second and a half cannot be walked into
  // once per key; the recipe says so and says why.
  if (recipe.probe === false) {
    push({ scene: labelOf(recipe), error: 'receptura oznaczona `probe: false` — tylko do audytu układu' });
    bar.step();
    continue;
  }
  try {
    if (!await buildUntil(recipe)) {
      push({ scene: labelOf(recipe), error: `nie dało się dojść do tego stanu w 5 próbach (szukano: "${recipe.require}")` });
      bar.step();
      continue;
    }
    const read = await page.evaluate(BOUND, recipe.key);
    if (read === null) { push({ scene: labelOf(recipe), error: 'scene not active' }); bar.step(); continue; }
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
      try {
        if (!await buildUntil(recipe)) { rows.push({ key, skipped: 'stan nieosiągalny' }); continue; }
        const before = await page.evaluate(SNAP, recipe.key);
        await page.keyboard.press(name);
        await pump(24);
        const after = await page.evaluate(SNAP, recipe.key);
        rows.push({ key, diff: minusNoise(channels(before, after), noise) });
      } catch (err) {
        // One key that breaks the page used to take the whole screen's report
        // with it — the same shape v0.85.0 fixed in the audit, one level in.
        // The page is reloaded for the next key and this one is named.
        rows.push({ key, skipped: `strona padła: ${String(err?.message ?? err).split(NL)[0].slice(0, 60)}` });
        driver.soil();
      }
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
    // Biggest mover first, but **a key that leaves the screen is the worst
    // setup there is**, not the best. The first version sorted scene changes
    // to the front, so on seven of the port's counters the three setups tried
    // were `ESC` (gone), `Enter` and `E` (both of which complete a
    // transaction and leave the view) — and `DOWN`, the one key that moves
    // the cursor and stays, was never reached. `UP` was reported dead on all
    // seven, and it is not dead: it is a cursor on the top row (v0.95.0).
    // **Smallest mover first, and a key that leaves the screen last.**
    //
    // The first version took the biggest mover, which on the quartermaster's
    // tab is a number key — it changes 61 to 113 texts because it opens
    // another tab — and on the port's counters is `Enter`, which completes a
    // transaction and leaves the view. Neither is a setup: a setup has to put
    // the screen somewhere else **and still be the screen**. A small change
    // on the same screen is a cursor move, and a cursor move is exactly what
    // a suspect cursor key needs (v0.95.0).
    const moved = rows.filter(r => r.diff && !empty(r.diff));
    const movers = [
      ...moved.filter(r => !r.diff.scenes.length)
        .sort((a, b) => a.diff.texts.length - b.diff.texts.length),
      ...moved.filter(r => r.diff.scenes.length),
    ].map(r => r.key);
    for (const r of rows) {
      if (r.skipped || !empty(r.diff)) continue;
      r.retried = [];
      // **The way to test whether Up works is to press Down first.** Sorting
      // by how much a key moved picks the number keys on the quartermaster's
      // tab (61 to 113 texts) and never `DOWN` (4), so `A`, `D`, `UP` and `W`
      // were all reported dead on a screen where each of them works one row
      // in. The same on seven of the port's counters. A cursor key's setup is
      // its opposite, and nothing else is as good (v0.95.0).
      // The opposite only leads if it moved something itself: `A` and `D` on
      // the settings tab are each other's opposite and **both** do nothing
      // until a volume row is focused, so leading with one of them spends the
      // only three tries this key gets.
      const opposite = OPPOSITE[r.key];
      const useOpposite = opposite && movers.includes(opposite);
      const order = [
        ...(useOpposite ? [opposite] : []),
        ...movers.filter(m => m !== r.key && m !== (useOpposite ? opposite : null)),
      ].slice(0, 3);
      // A cursor setup is pressed once **and** twice, because a list's cursor
      // may need more than one step to reach a row where the suspect can act:
      // the quartermaster's tab is speed, mute, and only then the three volume
      // rows, so `A` and `D` — which do nothing unless a volume row is focused
      // — were reported dead after a single press of `DOWN`.
      const setups = order.flatMap(k => (OPPOSITE[k] ? [[k, 1], [k, 2]] : [[k, 1]]));
      for (const [setup, times] of setups) {
        if (!await buildUntil(recipe)) break;
        for (let i = 0; i < times; i++) {
          await page.keyboard.press(pressName(setup));
          await pump(24);
        }
        const before = await page.evaluate(SNAP, recipe.key);
        if (before.missing) continue;   // the setup key left the screen
        await page.keyboard.press(pressName(r.key));
        await pump(24);
        const after = await page.evaluate(SNAP, recipe.key);
        const d = minusNoise(channels(before, after), noise);
        const name = times > 1 ? `${setup}×${times}` : setup;
        r.retried.push(name);
        if (!empty(d)) { r.diff = d; r.after = name; break; }
      }
    }
    push({ scene: labelOf(recipe), bound, wildcard: read.wildcard, noise, rows });
  } catch (err) {
    push({ scene: labelOf(recipe), error: String(err?.message ?? err).split(NL)[0] });
    // Whatever went wrong, the next screen starts from a fresh page: a
    // recipe that failed has usually left one that cannot be reused.
    driver.soil();
  }
  bar.step();
}
const cost = driver.cost;
bar.tick(`gotowe — ${cost.reloads} przeładowań strony`
  + (cost.reloadOnly.length ? `, przebudowa w stronie nie działa na: ${cost.reloadOnly.join(' ')}` : ''));

await driver.close();

/**
 * One screen's block, printed the moment it is measured.
 *
 * A run over the whole list is tens of minutes, and this used to accumulate
 * every row and print at the end — so a run that was killed, or that took
 * longer than anybody was willing to wait, produced **nothing at all**. The
 * `--json` mode still accumulates, because a half-written array is not JSON.
 */
function printRow(row) {
  if (row.error) {
    console.log(`${NL}${row.scene}  — BŁĄD: ${row.error}`);
    return { dead: 0, pressed: 0 };
  }
  const dead = [];
  const lines = [];
  let pressed = 0;
  for (const r of row.rows) {
    if (r.skipped) { lines.push(`  ${r.key.padEnd(6)} — pominięty (${r.skipped})`); continue; }
    pressed++;
    if (empty(r.diff)) { dead.push(r.key + (r.retried && r.retried.length ? '' : '?')); continue; }
    const what = [];
    if (r.diff.scenes.length) what.push(`sceny ${r.diff.scenes.join(' ')}`);
    if (r.diff.world.length) what.push(`świat: ${r.diff.world.slice(0, 2).join('; ')}`);
    if (r.diff.camera.length) what.push(`kamera ${r.diff.camera[0]}`);
    if (r.diff.texts.length) what.push(`${r.diff.texts.length} napisów`);
    lines.push(`  ${r.key.padEnd(6)} — ${what.join(' · ')}` +
      (r.after ? `  (dopiero po ${r.after} — z ekranu otwarcia nie robi nic)` : ''));
  }
  console.log(`${NL}${row.scene}  (${row.bound.length} związanych${row.wildcard ? ', w tym nasłuch ogólny — zestaw próbny' : ''})`);
  for (const l of lines) console.log(l);
  if (dead.length) console.log(`  NIC-NIE-ZMIENIA: ${dead.join(' ')}`);
  return { dead: dead.length, pressed };
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`${NL}RAZEM: ${deadTotal} klawiszy nie zmienia niczego, z ${pressedTotal} naciśniętych.`);
}
