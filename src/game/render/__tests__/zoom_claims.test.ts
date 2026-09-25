import { describe, it, expect } from "vitest";
import { ZOOM_VALUES, ZOOM_MIN_VALUE, ZOOM_MAX_VALUE } from "../../settings/ZoomSetting.ts";
import { MOUNTAIN_FULL_ZOOM, MOUNTAIN_FAR_ALPHA } from "../MountainRenderer.ts";
import { GULL_MIN_ZOOM, GULL_MAX_ZOOM } from "../SeagullRenderer.ts";

// ===========================================================================
// The layer that draws had its own idea of the zoom (v0.98.2.0)
// ===========================================================================

/**
 * `sweep-claims.mjs --all` reads `src/game` and says **0 quoted numbers out of
 * date** — and it was right, because its QUOTED grade needs a **named
 * constant** beside the number, and the drawing layer had none. Its thresholds
 * were bare literals, so every sentence about them was unreadable by the one
 * tool that grades sentences about numbers.
 *
 * Read by hand instead, seven sentences in five files were false:
 *
 * | said | was |
 * |---|---|
 * | `MountainRenderer` "full opacity at zoom >= 4" | full from **2**, and never faded *out* — 0.5 is the floor |
 * | `SeagullRenderer` "full size at z14 (20x)" | `z14` is **12×** |
 * | `SeagullRenderer` "invisible below 1.5x" | invisible below **3** |
 * | `CirrusRenderer` "only visible below zoom ~5" | gone from **2.5** |
 * | `CirrusRenderer` "full at zoom 1.5" | full below **2.0**; 1.5 is a step, not the threshold |
 * | `WaterRenderer` "visible at zoom 7-10 (normalized)" | a **scale the game no longer has** |
 * | `ShoreWaveRenderer` ">5 / 3-5 / <3" | 7 / 5-7 / below 5 — its own inner comment said so (the file, never built, was deleted in v0.99.0) |
 *
 * `MapEventMarkerRenderer`, `CloudRenderer` and `MainMapScene`'s three were
 * **correct**, so this is drift rather than a house style: the sentences that
 * went stale are the ones no tool could read.
 *
 * The cure is not a cleverer sweep — measured, the obvious mechanical
 * extension (a number in prose must appear in the code below it) flagged **69
 * of 110** comment lines, nearly all of them fine, because in this codebase a
 * comment's numbers are usually about the world or about history. The cure is
 * to **give the thresholds names**, which makes them visible to the grade that
 * already exists. `sweep-claims.mjs --all quoted` now machine-checks eight of
 * them.
 */

describe("every threshold sits inside the ladder it talks about", () => {
  it("has the chart's own ends to measure against", () => {
    expect(ZOOM_MIN_VALUE).toBe(1.5);
    expect(ZOOM_MAX_VALUE).toBe(12);
  });

  const inRange = (n: number) => n >= ZOOM_MIN_VALUE && n <= ZOOM_MAX_VALUE;

  it("keeps the peaks' threshold on a step the spyglass can reach", () => {
    expect(inRange(MOUNTAIN_FULL_ZOOM)).toBe(true);
    expect(Object.values(ZOOM_VALUES)).toContain(MOUNTAIN_FULL_ZOOM);
  });

  it("keeps the gulls between the ends of the ladder", () => {
    expect(inRange(GULL_MIN_ZOOM)).toBe(true);
    // Not a copy of 12: it reads the chart's own maximum, so the two cannot
    // drift apart. "full size at z14 (20x)" was what a copy looks like.
    expect(GULL_MAX_ZOOM).toBe(ZOOM_MAX_VALUE);
  });

});

describe("the peaks are dimmed, not hidden", () => {
  const alpha = (zoom: number) => zoom < MOUNTAIN_FULL_ZOOM ? MOUNTAIN_FAR_ALPHA : 1;

  it("never draws them at nothing", () => {
    for (const z of Object.values(ZOOM_VALUES)) expect(alpha(z)).toBeGreaterThan(0);
  });

  it("is at full from its own threshold in", () => {
    expect(alpha(MOUNTAIN_FULL_ZOOM)).toBe(1);
    expect(alpha(ZOOM_MAX_VALUE)).toBe(1);
    expect(alpha(ZOOM_MIN_VALUE)).toBe(MOUNTAIN_FAR_ALPHA);
  });

  it("was never what the header claimed", () => {
    // "full opacity at zoom >= 4" would have meant the two steps between 2 and
    // 4 were dimmed, and they never were.
    expect(alpha(2.5)).toBe(1);
    expect(alpha(3)).toBe(1);
  });
});

// ---------------------------------------------------------------------------

const RENDER = import.meta.glob("../*.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

const source = (base: string): string => {
  const hit = Object.entries(RENDER).find(([p]) => p.endsWith(`/${base}`));
  if (!hit) throw new Error(`no source read for ${base}`);
  return hit[1];
};

describe("a threshold the sweep can read", () => {
  const NAMED: Record<string, string[]> = {
    "MountainRenderer.ts": ["MOUNTAIN_FULL_ZOOM", "MOUNTAIN_FAR_ALPHA"],
    "CirrusRenderer.ts": ["CIRRUS_FADE_START", "CIRRUS_FADE_END"],
    "SeagullRenderer.ts": ["GULL_MIN_ZOOM", "GULL_MAX_ZOOM"],
    "WaterRenderer.ts": ["WAVE_START_ZOOM"],
  };

  for (const [file, names] of Object.entries(NAMED)) {
    it(`${file} names its thresholds and uses them`, () => {
      const src = source(file);
      for (const name of names) {
        expect(src, `${name} is not exported`).toContain(`export const ${name}`);
        // Declared once, then read: a name nothing reads is a second copy
        // waiting to happen.
        const uses = (src.match(new RegExp(`\\b${name}\\b`, "g")) || []).length;
        expect(uses, `${name} is declared and never read`).toBeGreaterThan(2);
      }
    });
  }

  it("states the number beside the name, so QUOTED grades it", () => {
    // `sweep-claims.mjs` reads `NAME (123)` out of prose and compares it with
    // the declaration. That is the whole reason the sentences above can go
    // stale no longer.
    expect(source("MountainRenderer.ts")).toMatch(/MOUNTAIN_FULL_ZOOM` \(2\)/);
    expect(source("CirrusRenderer.ts")).toMatch(/CIRRUS_FADE_END` \(2\.5\)/);
    expect(source("WaterRenderer.ts")).toMatch(/WAVE_START_ZOOM` \(8\.85\)/);
  });

  it("leaves no renderer quoting the chart's maximum by hand", () => {
    // Each of these carried its own `12`.
    const offenders = Object.entries(RENDER)
      .filter(([p]) => !p.includes("__tests__"))
      // A number after the minus too (v0.99.10): `(12 - 1.5)` in three places.
      .filter(([, s]) => /\(\s*12\s*-/.test(s) || /zoom - 1\.5\b/.test(s) || /\b1 \/ 12\b/.test(s))
      .map(([p]) => p);
    expect(offenders, "these subtract from a hand-written 12").toEqual([]);
  });
});
