/**
 * audit-layout.mjs — measure every scene against the rules this repo has
 * already named, and count how many obey them.
 *
 * Five releases in a row found a layout defect that no amount of code reading
 * would have found (a button seven pixels past the panel in v0.79.0, half the
 * battle manual below the border in v0.83.0). Each time the fix was applied to
 * the one screen it was found on. This walks all eighteen and asks the same
 * questions everywhere:
 *
 *   OUT_OF_VIEW   a Text whose box leaves the camera
 *   OVER_PANEL    a Text whose box leaves the panel drawn behind it
 *   COLLISION     two Texts whose boxes overlap, so one is drawn over the other
 *
 * Panels are found rather than declared: every `Rectangle`/`Graphics`-free
 * backing this game draws is either a `Phaser.GameObjects.Rectangle` or a
 * rounded rect inside a `Graphics` command buffer, and both are readable from
 * the live scene. A Text is judged against the smallest panel that contains its
 * centre; a Text with no panel under it is only judged against the camera.
 *
 * Usage:
 *   node scripts/audit-layout.mjs [--only=SceneKey] [--json=out.json]
 *
 * The recipes below are the other half of the answer to "why was this screen
 * never driven": four scenes had no way in at all until v0.84.0.
 */
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3000/';
const LANG = 'lang=pl';

/** How to reach each scene. `start` means: stop everything, then start this. */
const RECIPES = [
  { key: 'CharacterCreationScene', url: `?${LANG}` },
  { key: 'MainMapScene', url: `?skip&${LANG}` },
  { key: 'UIOverlayScene', url: `?skip&${LANG}` },
  { key: 'SeaBattleScene', url: `?battle=navy&${LANG}`, wait: 5000 },
  { key: 'CityAssaultScene', url: `?siege=cartagena&${LANG}` },
  { key: 'CityDefenseScene', url: `?defend=cartagena&${LANG}` },
  { key: 'VillageScene', url: `?village=darien&${LANG}`, start: 'VillageScene', data: { villageKey: 'darien' } },
  { key: 'PortScene', url: `?skip&${LANG}`, start: 'PortScene', data: { portId: 'havana' } },
  { key: 'PortApproachScene', url: `?skip&${LANG}`, start: 'PortApproachScene', data: { portId: 'havana' } },
  { key: 'CityInfoScene', url: `?skip&${LANG}`, start: 'CityInfoScene', data: { portKey: 'havana' } },
  { key: 'OptionsMenuScene', url: `?skip&${LANG}`, start: 'OptionsMenuScene', data: {} },
  { key: 'HelpScene', url: `?skip&${LANG}`, start: 'HelpScene', data: {} },
  { key: 'BattleHelpScene', url: `?battle=navy&${LANG}`, start: 'BattleHelpScene', data: {}, wait: 5000 },
  { key: 'DuelScene', url: `?skip&${LANG}`, start: 'DuelScene', data: { playerFencing: 6, enemyFencing: 5, seed: 3 } },
  {
    key: 'ShipEncounterScene', url: `?hail=havana&${LANG}`,
    start: 'ShipEncounterScene', data: { npcEntityId: 'hail_trader' },
  },
  {
    key: 'RetirementScene', url: `?skip&${LANG}`, start: 'RetirementScene',
    // Hand-built rather than computed: the only captain who reaches this screen
    // is one who has sailed for thirty years, and there is no flag for that.
    data: {
      captainName: 'Kapitan',
      score: {
        age: 52, yearsAtSea: 31, total: 8400, titleKey: 'retire.title_admiral',
        lines: [
          { key: 'retire.line_gold', amount: 124000, points: 12400 },
          { key: 'retire.line_fleet', amount: 46000, points: 2300 },
          { key: 'retire.line_ranks', amount: 7, points: 2100 },
          { key: 'retire.line_reputation', amount: 180, points: 720 },
          { key: 'retire.line_fame', amount: 74, points: 888 },
          { key: 'retire.line_years', amount: 31, points: 1100 },
          { key: 'retire.line_towns', amount: 3, points: 1200 },
          { key: 'retire.line_family', amount: 2, points: 1400 },
          { key: 'retire.line_marriage', amount: 1, points: 900 },
        ],
      },
    },
  },
];

const args = process.argv.slice(2);
const flag = (name) => {
  const hit = args.find(a => a.startsWith(`--${name}`));
  if (!hit) return undefined;
  const i = hit.indexOf('=');
  return i === -1 ? true : hit.slice(i + 1);
};
const only = flag('only');

/**
 * Read every Text and every panel out of the live scene.
 *
 * Runs inside the page. Graphics objects keep their draw calls in
 * `commandBuffer`, which is how a rounded panel drawn with `fillRoundedRect`
 * can be recovered at all — there is no other way to ask Phaser where a
 * Graphics put its ink.
 */
const PROBE = function (sceneKey) {
  const g = window.__PHASER_GAME__;
  const scene = g.scene.scenes.find(s => s.scene.key === sceneKey);
  if (!scene || !scene.scene.isActive()) return { missing: true };
  const cam = scene.cameras.main;

  const panels = [];
  const texts = [];
  const shapes = [];

  // Phaser's Commands, with the stride the canvas renderer walks them by.
  const ARC = 0, BEGIN_PATH = 1, CLOSE_PATH = 2, FILL_RECT = 3, LINE_TO = 4,
    MOVE_TO = 5, LINE_STYLE = 6, FILL_STYLE = 7, FILL_PATH = 8, STROKE_PATH = 9,
    FILL_TRIANGLE = 10, STROKE_TRIANGLE = 11, SAVE = 14, RESTORE = 15,
    TRANSLATE = 16, SCALE = 17, ROTATE = 18, GRADIENT_FILL = 21, GRADIENT_LINE = 22;

  /**
   * Every filled shape a Graphics puts down, as a box.
   *
   * `fillRoundedRect` is not one command — it is a path of moves, lines and
   * arcs — so a path's box is accumulated between BEGIN_PATH and FILL_PATH and
   * emitted when the fill happens. This is the only way to ask Phaser where a
   * Graphics actually put its ink.
   */
  const readGraphics = (obj) => {
    const cb = obj.commandBuffer || [];
    const ox = obj.x || 0;
    const oy = obj.y || 0;
    let path = null;
    const openPath = () => { path = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; };
    const point = (x, y) => {
      if (!path) openPath();
      path.x0 = Math.min(path.x0, x); path.y0 = Math.min(path.y0, y);
      path.x1 = Math.max(path.x1, x); path.y1 = Math.max(path.y1, y);
    };
    const emit = (x, y, w, h, from) => {
      if (!(w > 0 && h > 0)) return;
      shapes.push({ x: x + ox, y: y + oy, w, h, from });
    };
    for (let i = 0; i < cb.length; i++) {
      switch (cb[i]) {
        case ARC: point(cb[i + 1] - cb[i + 3], cb[i + 2] - cb[i + 3]);
          point(cb[i + 1] + cb[i + 3], cb[i + 2] + cb[i + 3]); i += 7; break;
        case LINE_STYLE: i += 3; break;
        case FILL_STYLE: i += 2; break;
        case BEGIN_PATH: openPath(); break;
        case CLOSE_PATH: break;
        case FILL_PATH:
          if (path && path.x1 > path.x0) emit(path.x0, path.y0, path.x1 - path.x0, path.y1 - path.y0, 'fillPath');
          break;
        case STROKE_PATH: break;
        case FILL_RECT: emit(cb[i + 1], cb[i + 2], cb[i + 3], cb[i + 4], 'fillRect'); i += 4; break;
        case FILL_TRIANGLE: {
          const xs = [cb[i + 1], cb[i + 3], cb[i + 5]];
          const ys = [cb[i + 2], cb[i + 4], cb[i + 6]];
          emit(Math.min(...xs), Math.min(...ys),
            Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 'fillTriangle');
          i += 6; break;
        }
        case STROKE_TRIANGLE: i += 6; break;
        case LINE_TO: point(cb[i + 1], cb[i + 2]); i += 2; break;
        case MOVE_TO: point(cb[i + 1], cb[i + 2]); i += 2; break;
        case SAVE: case RESTORE: break;
        case TRANSLATE: i += 2; break;
        case SCALE: i += 2; break;
        case ROTATE: i += 1; break;
        case GRADIENT_FILL: i += 5; break;
        case GRADIENT_LINE: i += 6; break;
        default: break;
      }
    }
  };

  /**
   * Only screen-fixed objects are judged.
   *
   * `MainMapScene` and `SeaBattleScene` draw a world that scrolls, so a port
   * label outside the camera is the camera doing its job — there, only the
   * `scrollFactor 0` overlay is judged. A dialog scene never scrolls its camera
   * and (by this repo's rule, see `UIOverlayScene`) never sets a scroll factor
   * either, so everything it draws is screen space and everything is judged.
   */
  const staticCam = cam.scrollX === 0 && cam.scrollY === 0 && cam.zoom === 1;
  const walk = (obj, fixed) => {
    if (obj.visible === false) return;
    const isFixed = fixed
      ?? (staticCam || (obj.scrollFactorX === 0 && obj.scrollFactorY === 0));
    if (obj.type === 'Container') { (obj.list || []).forEach(o => walk(o, isFixed)); return; }
    if (!isFixed) return;
    if (obj.type === 'Text') {
      const b = obj.getBounds();
      // The whole line is kept and only the label is shortened: the first
      // draft parsed the truncated copy, so `T - ognia do szalup    G - ognia
      // do eskorty    L - ludzi na mury    ESC - ciac liny` lost `L` and `ESC`
      // at 44 characters and the audit reported them as unannounced.
      const s = (obj.text || '').split(String.fromCharCode(10)).join(' / ');
      texts.push({ text: s.slice(0, 44), full: s, x: b.x, y: b.y, w: b.width, h: b.height });
      return;
    }
    if (obj.type === 'Rectangle' || obj.type === 'Image' || obj.type === 'Sprite') {
      // A rotated sprite's axis-aligned box is not where its ink is: the wind
      // needle is a narrow diamond inside a 100 px disc, and its box at 45
      // degrees is 141 px wide and hangs over the edge of the screen. The first
      // draft of this audit reported that as the compass falling off the map.
      if (obj.rotation) return;
      const b = obj.getBounds();
      shapes.push({ x: b.x, y: b.y, w: b.width, h: b.height, from: obj.type, kind: obj.type });
      return;
    }
    if (obj.type === 'Graphics') readGraphics(obj);
  };
  scene.children.list.forEach(o => walk(o));

  // A panel is any filled box big enough to back something and small enough
  // not to be the backdrop.
  const area = cam.width * cam.height;
  const BACKING = { Rectangle: 1, fillRect: 1, fillPath: 1 };
  for (const s of shapes) {
    if (!BACKING[s.from]) continue;                       // a picture is not a panel
    if (s.w >= 120 && s.h >= 40 && s.w * s.h <= area * 0.7) {
      panels.push({ x: s.x, y: s.y, w: s.w, h: s.h, from: s.from });
    }
  }

  // ── What the keyboard actually answers to ──────────────────────────────
  //
  // v0.81.0 asked this of the source: does the key a hint line names have a
  // handler. The live scene answers it better, because `on("keydown-X")` and
  // `addKey(X)` are two different registries and a source scan sees only the
  // first. Both are read here; the comparison with what the screen PROMISES is
  // made outside, where the text is.
  const CODE = {
    9: 'TAB', 13: 'ENTER', 16: 'SHIFT', 17: 'CTRL', 27: 'ESC', 32: 'SPACE',
    37: 'LEFT', 38: 'UP', 39: 'RIGHT', 40: 'DOWN',
  };
  // Phaser names the number row `keydown-ONE`, while `addKey(49)` comes back
  // as the keycode. Both are the same key on the same keyboard, and a report
  // that says `1 promised, ONE bound` is measuring its own spelling.
  const WORD = {
    ZERO: '0', ONE: '1', TWO: '2', THREE: '3', FOUR: '4',
    FIVE: '5', SIX: '6', SEVEN: '7', EIGHT: '8', NINE: '9', ESCAPE: 'ESC',
  };
  const bound = {};
  const kb = scene.input && scene.input.keyboard;
  if (kb) {
    for (const name of kb.eventNames()) {
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

  return { camera: { w: cam.width, h: cam.height }, panels, texts, shapes, bound: Object.keys(bound) };
};

const overlap = (a, b) => {
  const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return x > 0 && y > 0 ? { x, y } : null;
};

/** The smallest panel whose box contains this text's centre. */
const panelUnder = (panels, t) => {
  const cx = t.x + t.w / 2;
  const cy = t.y + t.h / 2;
  let best = null;
  for (const p of panels) {
    if (cx < p.x || cx > p.x + p.w || cy < p.y || cy > p.y + p.h) continue;
    if (!best || p.w * p.h < best.w * best.h) best = p;
  }
  return best;
};

/**
 * Which keys a line promises is answered by the game's own module.
 *
 * `core/services/legendKeys.ts` is what `scene_legend.test.ts` checks against,
 * and Vite serves it to the page, so this script reads the **same** parser
 * rather than a copy of it. A copy is exactly the defect this release is
 * about: the first draft carried one, and it fell behind the moment the module
 * learned about `PgUp`.
 */
const promisedIn = (page, lines) => page.evaluate(async (ls) => {
  const mod = await import("/src/core/services/legendKeys.ts");
  return mod.promisedAcross(ls);
}, lines);

const MARGIN = 2;            // a descender hanging a pixel over is not a finding
// Dancing Script's text box carries about six pixels of slack over its
// glyphs, so a title and the line under it overlap as boxes and not as ink.
// Checked on the screen before this number was raised.
const COLLIDE_MIN = 9;

const browser = await puppeteer.launch({
  headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });

const pump = (frames) => page.evaluate((n) => {
  const g = window.__PHASER_GAME__;
  if (!g) return 0;
  let t = performance.now();
  for (let i = 0; i < n; i++) { t += 16.7; g.loop.step(t); }
  return g.loop.frame;
}, frames);

const report = [];

for (const recipe of RECIPES) {
  if (only && recipe.key !== only) continue;
  await page.goto(BASE + recipe.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(r => setTimeout(r, recipe.wait ?? 3800));
  await pump(60);

  if (recipe.start) {
    await page.evaluate(({ key, data }) => {
      const g = window.__PHASER_GAME__;
      const world = g.registry.get('worldState');
      for (const scene of g.scene.scenes) {
        if (scene.scene.isActive() && scene.scene.key !== 'BootScene') scene.scene.stop();
      }
      g.scene.start(key, { worldState: world, ...data });
    }, { key: recipe.start, data: recipe.data ?? {} });
    await pump(40);
  }

  const probe = await page.evaluate(PROBE, recipe.key);
  if (probe.missing) {
    report.push({ scene: recipe.key, error: 'scene not active' });
    continue;
  }

  const findings = [];
  const { camera, panels, texts, shapes } = probe;

  const outOfView = (b) => Math.round(Math.max(
    -b.x, -b.y, b.x + b.w - camera.w, b.y + b.h - camera.h));

  for (const t of texts) {
    const off = outOfView(t);
    if (off > MARGIN) {
      findings.push({
        kind: 'OUT_OF_VIEW', text: t.text,
        box: [Math.round(t.x), Math.round(t.y), Math.round(t.w), Math.round(t.h)],
        over: off,
      });
      continue;
    }
    const p = panelUnder(panels, t);
    if (!p) continue;
    const out = Math.round(Math.max(
      p.x - t.x, p.y - t.y, t.x + t.w - (p.x + p.w), t.y + t.h - (p.y + p.h)));
    if (out > MARGIN) {
      findings.push({
        kind: 'OVER_PANEL', text: t.text,
        box: [Math.round(t.x), Math.round(t.y), Math.round(t.w), Math.round(t.h)],
        panel: [Math.round(p.x), Math.round(p.y), Math.round(p.w), Math.round(p.h)],
        over: out,
      });
    }
  }

  // The same two questions asked of the ink, not only of the words. Nothing in
  // this repo has ever measured a drawn shape against the panel behind it.
  for (const sh of shapes) {
    if (sh.w >= camera.w * 0.7 && sh.h >= camera.h * 0.7) continue;  // backdrop
    const off = outOfView(sh);
    if (off > MARGIN) {
      findings.push({
        kind: 'INK_OUT_OF_VIEW', text: sh.from,
        box: [Math.round(sh.x), Math.round(sh.y), Math.round(sh.w), Math.round(sh.h)],
        over: off,
      });
      continue;
    }
    const p = panelUnder(panels, sh);
    if (!p || (p.x === sh.x && p.y === sh.y && p.w === sh.w && p.h === sh.h)) continue;
    // Every dialog in this game draws its border as a slightly larger rectangle
    // behind the panel. A shape that contains the panel is that frame, not ink
    // spilling out of it.
    if (sh.x <= p.x && sh.y <= p.y
      && sh.x + sh.w >= p.x + p.w && sh.y + sh.h >= p.y + p.h) continue;
    const out = Math.round(Math.max(
      p.x - sh.x, p.y - sh.y, sh.x + sh.w - (p.x + p.w), sh.y + sh.h - (p.y + p.h)));
    if (out > MARGIN) {
      findings.push({
        kind: 'INK_OVER_PANEL', text: sh.from,
        box: [Math.round(sh.x), Math.round(sh.y), Math.round(sh.w), Math.round(sh.h)],
        panel: [Math.round(p.x), Math.round(p.y), Math.round(p.w), Math.round(p.h)],
        over: out,
      });
    }
  }

  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const hit = overlap(texts[i], texts[j]);
      if (!hit) continue;
      if (hit.x < COLLIDE_MIN || hit.y < COLLIDE_MIN) continue;
      findings.push({
        kind: 'COLLISION', text: texts[i].text, other: texts[j].text,
        over: Math.round(Math.min(hit.x, hit.y)),
      });
    }
  }

  const promised = {};
  for (const k of await promisedIn(page, texts.map(t => t.full ?? t.text))) promised[k] = true;
  const boundSet = new Set(probe.bound);
  const keys = {
    promised: Object.keys(promised).sort(),
    bound: [...boundSet].sort(),
    brokenPromise: Object.keys(promised).filter(k => !boundSet.has(k)).sort(),
    unannounced: [...boundSet].filter(k => !promised[k]).sort(),
  };

  report.push({
    scene: recipe.key,
    keys,
    texts: probe.texts.length,
    shapes: probe.shapes.length,
    panels: probe.panels.length,
    findings,
  });
}

await browser.close();

let total = 0;
for (const row of report) {
  if (row.error) { console.log(`${row.scene}: ${row.error}`); continue; }
  const n = row.findings.length;
  total += n;
  console.log(`\n${row.scene}  (${row.texts} napisów, ${row.panels} paneli)  — ${n}`);
  if (row.keys) {
    if (row.keys.brokenPromise.length) {
      console.log(`  OBIECANE-NIEZWIAZANE: ${row.keys.brokenPromise.join(' ')}`);
    }
    if (row.keys.unannounced.length) {
      console.log(`  ZWIAZANE-NIEZAPOWIEDZIANE: ${row.keys.unannounced.join(' ')}`);
    }
  }
  for (const f of row.findings) {
    const where = f.kind === 'COLLISION'
      ? `"${f.text}" × "${f.other}"`
      : `"${f.text}" ${JSON.stringify(f.box)}${f.panel ? ' w panelu ' + JSON.stringify(f.panel) : ''}`;
    console.log(`  ${f.kind} +${f.over}px  ${where}`);
  }
}
console.log(`\nRAZEM: ${total}`);

const jsonPath = flag('json');
if (typeof jsonPath === 'string') {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`zapisano ${jsonPath}`);
}
