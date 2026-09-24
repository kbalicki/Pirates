import { describe, it, expect } from "vitest";

// ===========================================================================
// Built and never asked (v0.98.0)
// ===========================================================================

/**
 * v0.97.0.0 found `CameraController.setZoom` with **no caller at all**, and it
 * was the fourth way to move the chart's zoom — the reason a setting could be
 * taken back. So the question was asked of the whole of `src/game/`: what else
 * is written, compiled, shipped and never spoken to?
 *
 * Seven public methods and four whole classes. Most of it was harmless, but
 * one was a feature the player never got: `UIOverlayScene.updateGridLabels`,
 * fifty complete lines that put the chart's degree labels at the margin of the
 * screen, never called, while thirteen world-space labels sat in a cross in
 * the middle of the sea (see `cartographicGrid.test.ts`).
 *
 * This guard is that sweep, kept. It is deliberately a **source** sweep: a
 * caller is a mention, and the point is that nothing mentions these.
 */

const SOURCES = import.meta.glob("../../**/*.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

const APP = import.meta.glob("../../GameApp.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

const prod = Object.entries(SOURCES).filter(([p]) => !p.includes("__tests__"));
const prodText = prod.map(([, s]) => s).join("\n");
const appText = Object.values(APP)[0] ?? "";

/** Phaser calls these itself; a scene never names them. */
const LIFECYCLE = new Set([
  "constructor", "init", "preload", "create", "update", "shutdown", "destroy",
  "render", "pause", "resume", "sleep", "wake",
]);

const KEYWORD = /^(if|for|while|switch|catch|return|function|do|with)$/;

/**
 * A method DECLARATION: two-space indent, a name, a parameter list, and a body
 * that opens rather than a statement that ends in `;`. Telling those apart is
 * the whole difficulty — the first draft reported sixteen calls to
 * `isoBuilding()` as dead methods.
 */
const DECL = /^ {2}(?!\/[/*])(?:(public|private|protected)\s+)?(?:static\s+)?(?:async\s+)?(?:(?:get|set)\s+)?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\([^;]*$/gm;

function deadMethods(): string[] {
  const out: string[] = [];
  for (const [path, src] of prod) {
    if (!/\bclass\s+\w/.test(src)) continue;
    for (const m of src.matchAll(DECL)) {
      const [whole, vis, name] = m;
      if (vis === "private" || vis === "protected") continue;
      if (LIFECYCLE.has(name) || KEYWORD.test(name)) continue;
      const rest = src.slice(m.index! + whole.length, m.index! + whole.length + 400);
      if (!/^[^;]*?\)\s*(:[^{;]*)?\{/s.test(whole.slice(whole.indexOf("(")) + rest)) continue;
      // `?.` between the dot and the parens is still a call.
      const calls = new RegExp(`\\.${name}\\s*[?]?[.]?\\s*\\(`, "g");
      if ((prodText.match(calls) || []).length > 0) continue;
      // A name used as a string reaches its object some other way.
      if (prodText.includes(`"${name}"`) || prodText.includes(`'${name}'`)) continue;
      const line = src.slice(0, m.index!).split("\n").length;
      out.push(`${path.replace("../../", "game/")}:${line} ${name}()`);
    }
  }
  return out.sort();
}

/**
 * A class nothing builds.
 *
 * Phaser scenes are the exception by design: they are handed to the game as
 * class references in `GameApp`'s `scene: [...]` list and Phaser constructs
 * them, so a scene named there is built even though nothing writes `new`.
 */
const PARKED: Record<string, string> = {
  MinimapRenderer:
    "the minimap was removed in v0.9.2; the renderer is kept as the drawing, "
    + "not as a live feature, and nothing on any screen refers to it",
  ShoreWaveRenderer:
    "the documented six-failed-approaches experiment (shore waves), parked on "
    + "purpose rather than abandoned; deleting it would throw away the work",
  DOMCloudOverlay:
    "an early DOM-layer cloud attempt, superseded by CloudRenderer, kept for "
    + "the comparison it records",
  WindCompassRenderer:
    "superseded by WindCompassWidget, which draws the compass procedurally on "
    + "a canvas; this one predates it",
};

/**
 * Methods kept although nothing calls them, and why. Empty since v0.98.3.
 *
 * It held `FxManager.spawnSplash` and `spawnSmoke`, kept on the reading that
 * `CombatEngine` emits nothing for a miss. It does: `CannonFired` goes out
 * with `hit: false` before the miss branch returns, and `SeaBattleScene`
 * draws it with its own smoke, flash, ball and splash. The two were copies of
 * effects the battle already had, and went. The engine's real silence was a
 * broadside ordered out of arc - `FireRejected` now.
 */
const KEPT: Record<string, string> = {};

function unbuiltClasses(): string[] {
  const out: string[] = [];
  for (const [path, src] of prod) {
    for (const m of src.matchAll(/^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/gm)) {
      const name = m[1];
      if (new RegExp(`new\\s+${name}\\s*\\(`).test(prodText)) continue;
      if (new RegExp(`extends\\s+${name}\\b`).test(prodText)) continue;
      // A scene in the game's own scene list is built by Phaser.
      if (new RegExp(`\\b${name}\\b`).test(appText)) continue;
      if (name in PARKED) continue;
      out.push(`${path.replace("../../", "game/")} ${name}`);
    }
  }
  return out.sort();
}

// ---------------------------------------------------------------------------

describe("nothing in src/game is written and never spoken to", () => {
  it("reads the whole of src/game", () => {
    // Without this the two sweeps below could pass by globbing nothing.
    expect(prod.length).toBeGreaterThan(40);
    expect(prod.some(([p]) => p.endsWith("/MainMapScene.ts"))).toBe(true);
    expect(appText).toContain("scene:");
  });

  it("has no public method nothing calls", () => {
    // Seven before v0.98.0: UIOverlayScene.updateGridLabels (the one that
    // mattered), InputMapper.setSailLevel (an empty deprecated body),
    // MusicManager.getCurrent, CommandQueue.get length, and two on FxManager
    // reached only after `new FxManager(this)` stopped being thrown away.
    const unexplained = deadMethods()
      .filter(row => !Object.keys(KEPT).some(k => row.endsWith(k)));
    expect(unexplained).toEqual([]);
  });

  it("builds every class it ships, or says why not", () => {
    expect(unbuiltClasses()).toEqual([]);
  });

  it("keeps every allowance about something that still exists", () => {
    const stale = Object.keys(PARKED).filter(
      name => !prod.some(([, s]) => new RegExp(`class\\s+${name}\\b`).test(s)));
    expect(stale, "an allowance for a class that is gone").toEqual([]);
    // And an allowance for a method somebody has since wired up is a lie about
    // the code, so that goes red too.
    const dead = deadMethods();
    const staleMethod = Object.keys(KEPT).filter(k => !dead.some(row => row.endsWith(k)));
    expect(staleMethod, "this method has a caller now; drop the allowance").toEqual([]);
  });

  it("constructs what it constructs for a reason", () => {
    // `MainMapScene` did `new FxManager(this);` and threw the result away, so
    // the chart had splashes and smoke it could never spawn while
    // `SeaBattleScene` kept the same object in a field and used it.
    const chart = prod.find(([p]) => p.endsWith("/MainMapScene.ts"))![1];
    expect(chart).not.toMatch(/^\s*new\s+\w+\([^)]*\);\s*$/m);
  });
});
