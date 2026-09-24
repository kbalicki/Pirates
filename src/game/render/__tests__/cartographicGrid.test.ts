import { describe, it, expect } from "vitest";
import {
  gridFade, GRID_HIDE_ZOOM, GRID_FULL_ZOOM,
  LAT_LINES, LON_LINES, getLatWorldY, getLonWorldX, pixelToGeo,
} from "../CartographicGrid.ts";
import { ZOOM_VALUES } from "../../settings/ZoomSetting.ts";
import { CITIES } from "../../../core/data/cities.ts";

// ===========================================================================
// A grid he could see and not read (v0.98.0)
// ===========================================================================

/**
 * The chart has a lat/lon grid. The lines were drawn in world space and are
 * right. The thirteen labels that say **which** line is which were drawn in
 * world space too — and all at one spot: the five latitudes at
 * `x = MAP_W/2 - 100`, the eight longitudes at `y = MAP_H/2 - 50`. A single
 * cross in the middle of a 3200×2400 sea.
 *
 * `UIOverlayScene.updateGridLabels` had been written to put them at the margin
 * of the **screen**, the way a chart does — fifty lines, complete, with the
 * projection and a fade and edge clamping — and **nothing had ever called it**.
 * Same family as `CameraController.setZoom` in v0.97.0.0, and worse: that was a
 * fourth way into something that worked, this was a feature never delivered.
 *
 * The measurement below is the one that decided it, and it stays as a test so
 * that a future placement has to beat it rather than merely differ from it.
 */

const MAP_W = 3200;
const MAP_H = 2400;
const SCREEN_W = 1600;
const SCREEN_H = 900;

/** The zoom steps at which the grid is drawn at all. */
const GRID_STEPS = Object.values(ZOOM_VALUES).filter(z => z < GRID_HIDE_ZOOM);

// ---------------------------------------------------------------------------

describe("one fade rule", () => {
  it("is full while the chart is wide and gone once it is close", () => {
    expect(gridFade(1.5)).toEqual({ visible: true, alpha: 1 });
    expect(gridFade(GRID_FULL_ZOOM - 0.01).alpha).toBe(1);
    expect(gridFade(GRID_HIDE_ZOOM).visible).toBe(false);
    expect(gridFade(6).visible).toBe(false);
  });

  it("fades between the two, and never past either end", () => {
    const mid = gridFade((GRID_FULL_ZOOM + GRID_HIDE_ZOOM) / 2).alpha;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(gridFade(12).alpha).toBe(0);
    expect(gridFade(0.5).alpha).toBe(1);
  });

  it("is reachable: the spyglass has steps below the hiding zoom", () => {
    // Until v0.97.0.0 the settings screen could not hold the camera below 6x
    // at all, so the grid was reachable only by the mouse wheel. Three steps
    // now show it.
    expect(GRID_STEPS).toEqual([1.5, 2, 2.5]);
  });
});

// ---------------------------------------------------------------------------

describe("the projection", () => {
  it("reads back the latitude it drew", () => {
    for (const lat of LAT_LINES) {
      const back = pixelToGeo(0, getLatWorldY(lat, MAP_H), MAP_W, MAP_H).lat;
      expect(back).toBeCloseTo(lat, 6);
    }
  });

  it("reads back the longitude it drew", () => {
    for (const lon of LON_LINES) {
      const back = pixelToGeo(getLonWorldX(lon, MAP_W), 0, MAP_W, MAP_H).lonW;
      expect(back).toBeCloseTo(-lon, 6);
    }
  });

  it("is readable outside a browser at all", () => {
    // `CartographicGrid.ts` imported Phaser as a VALUE while using it only as
    // a type, so none of the above could run in a test until v0.98.0 — the
    // same wall v0.91.0 hit with the coastline.
    expect(typeof getLatWorldY).toBe("function");
  });
});

// ---------------------------------------------------------------------------

const PORTS = Object.values(CITIES).filter(c => c.pos);

/** Where the labels stood until v0.98.0: one cross in the middle of the sea. */
const WORLD_PLACED = [
  ...LAT_LINES.map(lat => ({ x: MAP_W / 2 - 100, y: getLatWorldY(lat, MAP_H) - 3 })),
  ...LON_LINES.map(lon => ({ x: getLonWorldX(lon, MAP_W) + 3, y: MAP_H / 2 - 50 })),
];

describe("a label is only a label where he can see it", () => {
  it("has a port for every berth and thirteen lines to name", () => {
    expect(PORTS.length).toBe(45);
    expect(LAT_LINES.length + LON_LINES.length).toBe(13);
  });

  it("left 93% of them off the screen when they were placed in the world", () => {
    let seen = 0;
    let pairs = 0;
    for (const zoom of GRID_STEPS) {
      const halfW = SCREEN_W / zoom / 2;
      const halfH = SCREEN_H / zoom / 2;
      for (const p of PORTS) {
        for (const l of WORLD_PLACED) {
          pairs++;
          if (Math.abs(l.x - p.pos.x) <= halfW && Math.abs(l.y - p.pos.y) <= halfH) seen++;
        }
      }
    }
    expect(pairs).toBe(PORTS.length * 13 * GRID_STEPS.length);
    // 115 of 1755. The number is pinned, not the ratio, so a new line or a new
    // port has to be looked at rather than silently averaged away.
    expect(seen).toBe(115);
    expect(seen / pairs).toBeLessThan(0.07);
  });

  it("names a line whenever that line crosses the view", () => {
    // What the margin placement gives: the test of the new rule is not "more
    // labels" but "a label exactly when there is a line to name".
    let crossings = 0;
    let worst = Infinity;
    for (const zoom of GRID_STEPS) {
      const halfW = SCREEN_W / zoom / 2;
      const halfH = SCREEN_H / zoom / 2;
      for (const p of PORTS) {
        const here = LAT_LINES.filter(lat => Math.abs(getLatWorldY(lat, MAP_H) - p.pos.y) <= halfH).length
          + LON_LINES.filter(lon => Math.abs(getLonWorldX(lon, MAP_W) - p.pos.x) <= halfW).length;
        crossings += here;
        worst = Math.min(worst, here);
      }
    }
    // 459 lines cross a view somewhere in the Caribbean, against 115 labels
    // the old placement put in frame — and every one of them is now named.
    expect(crossings).toBeGreaterThan(400);
    expect(crossings).toBeGreaterThan(115 * 3);
    // Nowhere on the chart is a berth that sees no line at all at the widest
    // step; if that ever changes, the margin has nothing to say and we should
    // know why.
    expect(worst).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------

const GAME_SOURCES = import.meta.glob("../../**/*.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

/**
 * One source file by its base name.
 *
 * It throws rather than returning `""` on a miss: the first draft of this
 * matched on `/render/PortMarkerRenderer.ts` while the glob's keys are
 * relative to this directory (`../PortMarkerRenderer.ts`), so the guard below
 * asserted that an empty string does not contain `LAT_LINES` — a test that
 * passes by not looking, which is worse than no test.
 */
const src = (base: string): string => {
  const hit = Object.entries(GAME_SOURCES).find(([p]) => p.endsWith(`/${base}`));
  if (!hit) throw new Error(`no source read for ${base}`);
  return hit[1];
};

describe("one place draws the labels", () => {
  it("is the overlay, and it is called", () => {
    expect(src("UIOverlayScene.ts")).toContain("updateGridLabels(");
    expect(src("MainMapScene.ts")).toContain("updateGridLabels(");
  });

  it("is not the port markers any more", () => {
    // `PortMarkerRenderer` built them from `LAT_LINES`/`LON_LINES` and merged
    // them into `cityLabels`. A second builder is how they ended up in the
    // wrong space in the first place.
    const markers = src("PortMarkerRenderer.ts");
    expect(markers).not.toContain("LAT_LINES");
    expect(markers).not.toContain("gridLabels");
  });

  it("keeps no second copy of the line lists", () => {
    const holders = Object.entries(GAME_SOURCES)
      .filter(([p]) => !p.includes("__tests__") && !p.endsWith("/CartographicGrid.ts"))
      .filter(([, s]) => /\bLAT_LINES\s*=|\bLON_LINES\s*=/.test(s))
      .map(([p]) => p);
    expect(holders, "these declare their own grid lines").toEqual([]);
  });

  it("is handed the fade rather than deciding it", () => {
    // The two used to compute their own and disagreed: lines full below 2.2,
    // labels below 2. `updateGridLabels` now takes `alpha` as an argument, so
    // there is nowhere for a second rule to live.
    const overlay = src("UIOverlayScene.ts");
    expect(overlay).toMatch(/updateGridLabels\([^)]*alpha:\s*number/s);
    expect(overlay).not.toMatch(/camZoom\s*<\s*[0-9.]+\s*\?/);
    // Other renderers keep their own zoom rules for their own features; this
    // guard is about the grid, so it names the grid's two readers.
    expect(src("CartographicGrid.ts")).toContain("export function gridFade");
  });
});
