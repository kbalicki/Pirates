/**
 * scene-driver.mjs — open a browser, walk a recipe into the screen it names.
 *
 * v0.94.0 gave the two screen tools one list of screens (`scene-recipes.mjs`)
 * and left them with two copies of the **walk**: the page load, the frame
 * pump, the phase keys, the `require` check. They diverged within the hour.
 * `probe-keys.mjs` checked `require` against a text truncated at sixty
 * characters — right for a diff channel, wrong for a precondition — so the
 * assault's settled screen, whose only tell is the last of six lines in one
 * `Text`, was reachable by `audit-layout.mjs` and *"unreachable in five
 * tries"* here. One walk now.
 *
 * ── Why a rebuild does not reload the page ─────────────────────────────────
 *
 * `probe-keys.mjs` rebuilds the screen before **every key**: a key that opens
 * a screen would otherwise send the next key somewhere else, and a key that
 * spends gold would leave less of it for the one after. That is right, and it
 * used to be done with a page load. Measured, one such rebuild:
 *
 *   goto                540 ms
 *   the 3 800 ms boot wait
 *   pump(60) after it  5 950 ms   (99 ms a frame while the first render warms)
 *   start + pump(40)   1 850 ms
 *   settle             1 225 ms
 *   ------------------------------
 *                     13 350 ms
 *
 * At 39 screens and about 25 rebuilds each that is **four hours**, and the
 * release checklist says to run it before every release. A tool nobody can
 * afford to run is a tool nobody runs — and v0.94.0 made it worse by taking
 * the list from 17 screens to 39.
 *
 * The page load is not where the time goes. **Pumping frames is**, because
 * every step renders. So:
 *
 *  - the page is loaded once per **url**, and 27 of the 39 recipes share one;
 *  - the `worldState` in the registry is restored from a snapshot taken when
 *    the page finished booting, which restores `world.rng` too — so a
 *    bombardment rolls the same way twice;
 *  - the `pc_*` toggles are restored, because they live in `localStorage` and
 *    survive everything;
 *  - the scene is **removed and added again**, not restarted, because a
 *    restart reuses the same Scene object and every field initialised where it
 *    is declared keeps what the last key left in it. Two presses of Down on
 *    the shipyard and the next rebuild opened with the cursor still on row 2,
 *    which is how the first draft of this reported `UP` as a key that moves a
 *    list already at its top row. A page load constructed a new instance, and
 *    that is the part of it that mattered;
 *  - a scene the **debug world** built is started again with
 *    `sys.settings.data`, which is the only copy of its payload there is.
 *    Verified: two broadsides at Cartagena take the fort from 26/26 guns to
 *    19/26, and a rebuild puts it back at 26/26.
 *
 * A rebuild is about 300 ms now. What cannot be undone inside the page — a
 * language switched from the settings tab, which lives in a module variable
 * as well as in `localStorage` — is detected and answered with a real reload.
 *
 * **What the snapshot does not cover.** `IndexedDB` survives everything: a key
 * that saves the game leaves that save behind for every key after it, and a
 * page load does not clear it either. The save tab is the one screen where
 * this shows — `Enter` writes a slot, so `L` and `X`, which do nothing without
 * one, are measured against a world where one exists. A reading of that screen
 * is true of the state it was taken in, and that state is not a new game.
 */
import puppeteer from 'puppeteer';
import { labelOf } from './scene-recipes.mjs';

const BASE = 'http://localhost:3000/';
const NL = String.fromCharCode(10);

/** Where the toggles the screens write live. */
const TOGGLE_PREFIX = 'pc_';

/**
 * Game time one settle step carries.
 *
 * A settle exists to let a `delayedCall` chain run out, and a timer does not
 * care how many frames its milliseconds arrived in. The assault's wave loop
 * needs some 8.7 s of game time: 520 renders at 16.7 ms, 87 at 100.
 */
const SETTLE_STEP_MS = 100;

/**
 * Every word on the screen, untruncated — what `require` is checked against.
 *
 * Runs in the page.
 */
const FULL_TEXT = function (sceneKey) {
  const g = window.__PHASER_GAME__;
  const scene = g.scene.scenes.find(s => s.scene.key === sceneKey);
  if (!scene || !scene.scene.isActive()) return null;
  const out = [];
  const walk = (list) => {
    for (const obj of list) {
      if (!obj) continue;
      if (obj.type === 'Text') out.push(String(obj.text ?? ''));
      if (obj.type === 'Container' && obj.list) walk(obj.list);
    }
  };
  walk(scene.children ? scene.children.list : []);
  return out;
};

export async function openDriver() {
  const browser = await puppeteer.launch({
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'],
    // A page that has been left in a bad state stops answering, and the
    // default 30 s then fails the recipe **and** everything after it. Long
    // enough that a real hang is still a hang, short enough to notice.
    protocolTimeout: 180000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  let loadedUrl = null;
  let worldJson = null;
  let togglesJson = null;
  /** Set when something happened that only a page load can undo. */
  let dirty = false;
  /** The last uncaught error the page threw, or null. */
  let pageError = null;
  page.on('pageerror', (err) => { pageError = String(err?.message ?? err).split(NL)[0]; });
  /**
   * Screens whose in-page rebuild throws, and which are reloaded instead.
   *
   * v0.95.0 wrote that `MainMapScene` was one — a `delayedCall` outliving the
   * removed scene, `this.callback is not a function`. v0.96.0 could not make
   * it happen: three rebuilds of the chart in one page, and a rebuild with
   * `H` pressed and its pause still pending, all threw nothing. The full run
   * lists the tabs of `OptionsMenuScene` and `PortApproachScene`. Whatever
   * the cause, a tool that answers a screen with an exception is worse than a
   * slow one — so it notices, falls back, and says how often.
   */
  const reloadOnly = new Set();
  let reloads = 0;

  /**
   * Step Phaser's loop by hand.
   *
   * `stepMs` is how much game time each step carries. Every step **renders**,
   * and that is where this tool's time goes: about 99 ms of real time a frame
   * while the first render warms and about 43 ms after.
   */
  const pump = (frames, stepMs = 16.7) => page.evaluate(({ n, ms }) => {
    const g = window.__PHASER_GAME__;
    if (!g) return 0;
    let t = performance.now();
    for (let i = 0; i < n; i++) { t += ms; g.loop.step(t); }
    return g.loop.frame;
  }, { n: frames, ms: stepMs });

  async function fullLoad(recipe) {
    await page.goto(BASE + recipe.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, recipe.wait ?? 3800));
    await pump(60);
    loadedUrl = recipe.url;
    dirty = false;
    const taken = await page.evaluate((prefix) => {
      const g = window.__PHASER_GAME__;
      const toggles = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(prefix) === 0) toggles[k] = localStorage.getItem(k);
      }
      const world = g.registry.get('worldState');
      return { world: world ? JSON.stringify(world) : null, toggles: JSON.stringify(toggles) };
    }, TOGGLE_PREFIX);
    worldJson = taken.world;
    togglesJson = taken.toggles;
  }

  /** Put the world, the toggles and the scene back. False when it cannot. */
  async function resetInPage(recipe) {
    const ok = await page.evaluate(({ prefix, world, toggles, key, start, data }) => {
      const g = window.__PHASER_GAME__;
      const want = JSON.parse(toggles);
      // A language switched from the settings tab is also a module variable,
      // and nothing in here can put that back.
      if (localStorage.getItem('pc_lang') !== (want.pc_lang ?? null)) return false;
      if (world) g.registry.set('worldState', JSON.parse(world));
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.indexOf(prefix) === 0 && !(k in want)) localStorage.removeItem(k);
      }
      for (const k of Object.keys(want)) localStorage.setItem(k, want[k]);

      const wanted = start || key;
      // Paused, not stopped. A stopped `MainMapScene` leaves its renderers
      // holding a destroyed camera and the next `g.loop.step` dies reading
      // `cam.zoom` — which the audit never noticed while it measured one
      // still frame per page, and would the moment it stopped reloading.
      for (const s of g.scene.scenes) {
        if (s.scene.isActive() && s.scene.key !== 'BootScene' && s.scene.key !== wanted) {
          s.scene.pause();
        }
      }
      const target = g.scene.getScene(wanted);
      if (!target) return false;
      const Ctor = target.constructor;
      const payload = start
        ? { worldState: g.registry.get('worldState'), ...data }
        : target.sys.settings.data;
      g.scene.remove(wanted);
      g.scene.add(wanted, Ctor, false);
      g.scene.start(wanted, payload);
      return true;
    }, {
      prefix: TOGGLE_PREFIX, world: worldJson, toggles: togglesJson,
      key: recipe.key, start: recipe.start, data: recipe.data ?? {},
    });
    if (!ok) return false;
    // Six frames, not forty. Measured on the port screen: one pumped frame
    // already gives the same fifteen texts as forty.
    await pump(6);
    return true;
  }

  /** Walk the recipe in: page or reset, then the scene, then the phase keys. */
  async function build(recipe) {
    const label = labelOf(recipe);
    // A page error since the last build — thrown while a key was being
    // measured rather than while the screen was being put up — means the page
    // is already broken, and nothing in it can be trusted until it is loaded
    // again. `PortApproachScene` does this: something it leaves behind is read
    // for its `zoom` by the next step of the loop.
    if (pageError) { reloadOnly.add(label); dirty = true; pageError = null; }
    let reloaded = dirty || loadedUrl !== recipe.url || worldJson === null
      || reloadOnly.has(label);
    if (!reloaded) {
      pageError = null;
      let ok = false;
      try {
        ok = await resetInPage(recipe);
      } catch {
        // The rebuild itself failed — a protocol timeout is a page that has
        // stopped answering. Only a load puts that right.
        ok = false;
        reloadOnly.add(label);
      }
      if (!ok) reloaded = true;
      else if (pageError) {
        // It went through and the page threw: `MainMapScene` leaves a
        // `delayedCall` holding a callback on a scene that no longer exists,
        // and a stopped scene's renderer leaves a destroyed camera behind for
        // the next `g.loop.step` to read `zoom` off. Whatever it left, only a
        // load puts it right, and trying again would throw again.
        reloadOnly.add(label);
        reloaded = true;
      }
    }
    if (reloaded) { reloads++; await fullLoad(recipe); }

    // Only a fresh page needs the scene put up; `resetInPage` has done it.
    if (reloaded && recipe.start) {
      await page.evaluate(({ key, data }) => {
        const g = window.__PHASER_GAME__;
        const world = g.registry.get('worldState');
        const target = g.scene.getScene(key);
        for (const s of g.scene.scenes) {
          if (s.scene.isActive() && s.scene.key !== 'BootScene' && s.scene.key !== key) {
            s.scene.pause();
          }
        }
        // A scene that is already up is restarted, never stopped and started:
        // Phaser processes the two in one frame **stop-last**, so the first
        // draft of this shut the screen it was asking about and every such
        // recipe reported "scene not active" (v0.94.0).
        if (target && target.scene.isActive()) target.scene.restart({ worldState: world, ...data });
        else g.scene.start(key, { worldState: world, ...data });
      }, { key: recipe.start, data: recipe.data ?? {} });
      await pump(40);
    }

    // A screen with phases needs walking into.
    for (const k of String(recipe.keys ?? '').split(',').filter(Boolean)) {
      await page.keyboard.press(k);
      await pump(24);
    }
    if (recipe.settle) {
      // `settle` has always meant "about this many frames at 16.7 ms". The
      // same game time is walked in a sixth of the renders; the real sleeps
      // stay, because they are what lets the browser's own queue run.
      const gameMs = Math.ceil(recipe.settle / 40) * 40 * 16.7;
      const steps = Math.ceil(gameMs / SETTLE_STEP_MS);
      for (let n = 0; n < steps; n += 20) {
        await pump(Math.min(20, steps - n), SETTLE_STEP_MS);
        await new Promise(r => setTimeout(r, 60));
      }
    }
    // Keys pressed after the screen has settled. `keys` and `then` cannot be
    // one list: the assault's spoils are three bombardments and a landing
    // away, and the key that takes them has to arrive **after** the wave loop
    // has finished, not while it is still running.
    for (const k of String(recipe.then ?? '').split(',').filter(Boolean)) {
      await page.keyboard.press(k);
      await pump(12);
    }
    // Exact, for a screen on a clock: a phase drawn for 1600 ms is 96 frames,
    // and the smallest `settle` there is walks 80 at a time.
    if (recipe.frames) await pump(recipe.frames);

    // Real time, not pumped frames. Pumping Phaser's loop moves the game's
    // clock and nothing else, and the save tab draws its slots — and binds
    // the eight keys its hint line names — from an **IndexedDB read**, which
    // resolves on the browser's own queue. Measured without this, the audit
    // reported `DELETE DOWN ENTER L UP X` as promised and unbound on a screen
    // where all six are bound 300 ms later (v0.94.0).
    await new Promise(r => setTimeout(r, 350));
    await pump(4);
  }

  /** Did the walk-in land where the recipe says it must? */
  async function reached(recipe) {
    if (!recipe.require) return true;
    const texts = await page.evaluate(FULL_TEXT, recipe.key);
    if (texts === null) return false;
    const want = Array.isArray(recipe.require) ? recipe.require : [recipe.require];
    return want.every(needle => texts.some(t => t.includes(needle)));
  }

  /**
   * Build until the precondition holds, or give up and say so.
   *
   * A failed attempt forces the next one to reload. An in-page reset that
   * lands somewhere unexpected has left something behind the reset does not
   * know how to undo, and trying again the same way would land in the same
   * place — which is how a walk-in that is merely unlucky and one that is
   * impossible come to look alike.
   */
  async function buildUntil(recipe) {
    const tries = recipe.require ? 5 : 1;
    for (let attempt = 0; attempt < tries; attempt++) {
      await build(recipe);
      if (await reached(recipe)) return true;
      dirty = true;
    }
    return false;
  }

  return {
    page,
    pump,
    build,
    reached,
    buildUntil,
    /** Force the next build to reload the page. */
    soil: () => { dirty = true; },
    /** Screens this run had to reload rather than rebuild, and how often. */
    get cost() { return { reloads, reloadOnly: [...reloadOnly].sort() }; },
    close: () => browser.close(),
  };
}

/**
 * A progress line on **stderr**, so `> out.txt` keeps the report alone and a
 * run that takes minutes is not silent while it takes them.
 */
export function progress(total) {
  const started = Date.now();
  let done = 0;
  return {
    tick(what) {
      const s = String(Math.round((Date.now() - started) / 1000)).padStart(4);
      process.stderr.write(`[${s}s ${String(done).padStart(2)}/${total}] ${what}\n`);
    },
    step() { done++; },
    get seconds() { return Math.round((Date.now() - started) / 1000); },
  };
}

export { labelOf, BASE, FULL_TEXT };
