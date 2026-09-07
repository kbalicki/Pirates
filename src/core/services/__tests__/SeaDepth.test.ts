import { describe, it, expect, afterEach } from "vitest";
// The coastline itself, as a string: `?raw` is declared by `vite/client`, so
// this typechecks in the app's own tsconfig where `node:fs` does not.
import geoRaw from "../../../../public/data/caribbean_geo.json?raw";
import {
  coastDistanceField,
  buildDepthField,
  depthFromCoastDistance,
  soundings,
  setDepthField,
  depthAt,
  hasDepthField,
  DEPTH_BANDS,
  DEPTH_CELL,
  OPEN_SEA_DEPTH,
  HARBOUR_RADIUS,
  SHOAL_CLEARANCE,
  AGROUND_SPEED_MUL,
  SHOAL_SPEED_MUL,
} from "../SeaDepth.ts";
import { setLandmasses, LANDMASSES, type LandmassDef } from "../../data/geography.ts";
import { pointInLandmass } from "../Geometry.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { PORTS } from "../../data/ports.ts";
import { getPortWaterPos, buildPortWaterCache } from "../../systems/PortWaterPositions.ts";

// ===========================================================================
// SeaDepth — the water has a bottom (v0.48.0)
// ===========================================================================

/**
 * `ShipClassDef.draft` was declared for all nine classes and read by nothing;
 * `TerrainType` had `"shallow"` and `"reef"` members no query ever returned.
 * The tests that matter here are the ones about *reachability*: a mechanic that
 * shuts a frigate out of every harbour in the Caribbean is not a mechanic.
 */

afterEach(() => setDepthField(null));

/** A 5x5 island grid: land in the middle, open water at the edges. */
function islandGrid(): boolean[][] {
  const g = Array.from({ length: 9 }, () => new Array(9).fill(false));
  g[4][4] = true;
  return g;
}

describe("coastDistanceField", () => {
  it("is zero on land and counts outward from it", () => {
    const d = coastDistanceField(islandGrid());
    expect(d[4][4]).toBe(0);
    expect(d[4][5]).toBe(1);
    expect(d[4][6]).toBe(2);
    expect(d[4][7]).toBe(3);
  });

  it("leaves everything past the shelf at infinity", () => {
    const d = coastDistanceField(islandGrid(), 2);
    expect(d[4][6]).toBe(2);
    expect(d[4][7]).toBe(Infinity);
  });

  it("measures round a corner, not along an axis", () => {
    // Manhattan distance out of the land, so a diagonal neighbour is 2.
    const d = coastDistanceField(islandGrid());
    expect(d[5][5]).toBe(2);
  });

  it("says nothing at all about a sea with no land in it", () => {
    const d = coastDistanceField(Array.from({ length: 4 }, () => new Array(4).fill(false)));
    for (const row of d) for (const v of row) expect(v).toBe(Infinity);
  });
});

describe("depthFromCoastDistance", () => {
  it("deepens with every band and then opens out", () => {
    for (let i = 1; i < DEPTH_BANDS.length; i++) {
      expect(depthFromCoastDistance(i)).toBeGreaterThan(depthFromCoastDistance(i - 1));
    }
    expect(depthFromCoastDistance(DEPTH_BANDS.length)).toBe(OPEN_SEA_DEPTH);
    expect(depthFromCoastDistance(Infinity)).toBe(OPEN_SEA_DEPTH);
  });

  it("gives the beach itself no water at all", () => {
    expect(depthFromCoastDistance(0)).toBe(0);
  });
});

describe("soundings", () => {
  const DRAFT = 4; // a frigate

  it("is nothing at all in open water", () => {
    const s = soundings(OPEN_SEA_DEPTH, DRAFT);
    expect(s.aground).toBe(false);
    expect(s.shoal).toBe(false);
    expect(s.speedMul).toBe(1);
  });

  it("warns before it hurts", () => {
    // The three states exist so there is a cue: a ship that only ever sailed
    // or stopped dead would tell the player nothing until it was too late.
    const warn = soundings(DRAFT + SHOAL_CLEARANCE / 2, DRAFT);
    expect(warn.shoal).toBe(true);
    expect(warn.aground).toBe(false);
    expect(warn.speedMul).toBe(SHOAL_SPEED_MUL);
  });

  it("takes the ground when the water runs out", () => {
    const hard = soundings(DRAFT - 1, DRAFT);
    expect(hard.aground).toBe(true);
    expect(hard.clearance).toBeLessThan(0);
    expect(hard.speedMul).toBe(AGROUND_SPEED_MUL);
  });

  it("puts the same water under two hulls and gets two answers", () => {
    const water = 3;
    expect(soundings(water, SHIP_CLASSES.sloop.draft).aground).toBe(false);
    expect(soundings(water, SHIP_CLASSES.galleon.draft).aground).toBe(true);
  });
});

describe("the live field", () => {
  it("answers open sea until a coastline is loaded", () => {
    expect(hasDepthField()).toBe(false);
    expect(depthAt(1000, 1000)).toBe(OPEN_SEA_DEPTH);
  });

  it("reads a cell by world position", () => {
    setDepthField([[1, 2], [3, 4]], 100);
    expect(depthAt(50, 50)).toBe(1);
    expect(depthAt(150, 50)).toBe(2);
    expect(depthAt(50, 150)).toBe(3);
    expect(depthAt(150, 150)).toBe(4);
  });

  it("treats anything off the chart as open sea rather than as rock", () => {
    setDepthField([[1]], 100);
    expect(depthAt(-50, 50)).toBe(OPEN_SEA_DEPTH);
    expect(depthAt(5000, 5000)).toBe(OPEN_SEA_DEPTH);
  });
});

describe("buildDepthField", () => {
  it("dredges the basin right up to the quay", () => {
    const coast = coastDistanceField(islandGrid());
    const harbour = { x: 4.5 * DEPTH_CELL + DEPTH_CELL, y: 4.5 * DEPTH_CELL };
    const field = buildDepthField(coast, [harbour], DEPTH_CELL);
    expect(field[4][5]).toBe(OPEN_SEA_DEPTH); // was band 1
    // The land cell itself is dredged too, and that is correct: land collision
    // is decided against the coastline, never against this field. Eight of the
    // 45 real approaches lie in a cell the subsampler calls land.
    expect(field[4][4]).toBe(OPEN_SEA_DEPTH);
  });

  it("leaves water beyond the harbour as shoal as it was", () => {
    const coast = coastDistanceField(islandGrid());
    const far = { x: 0, y: 0 };
    const field = buildDepthField(coast, [far], DEPTH_CELL);
    expect(field[4][5]).toBe(DEPTH_BANDS[1]);
  });
});

// ── The invariant the whole mechanic stands on ────────────

describe("the real Caribbean", () => {
  /**
   * Measured, not assumed: every one of the 45 port approaches lies at coast
   * distance 0-2 (median 1). Without dredged harbours a frigate could not enter
   * a single town on the map — so this test is the mechanic's licence to exist.
   */
  function realDepthField(): { field: number[][]; water: number; closed: Map<string, number> } {
    const raw = JSON.parse(geoRaw) as {
      landmasses: Array<{ id: string; polygon: number[][]; bbox: number[] }>;
    };
    setLandmasses(raw.landmasses.map((lm): LandmassDef => ({
      id: lm.id,
      polygon: lm.polygon.map(([x, y]) => ({ x, y })),
      bbox: { minX: lm.bbox[0], minY: lm.bbox[1], maxX: lm.bbox[2], maxY: lm.bbox[3] },
    })));
    buildPortWaterCache();

    const cols = Math.ceil(3200 / DEPTH_CELL), rows = Math.ceil(2400 / DEPTH_CELL);
    const SUB = 4, step = DEPTH_CELL / SUB;
    const land = Array.from({ length: rows }, () => new Array(cols).fill(false));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let found = false;
      for (let sy = 0; sy < SUB && !found; sy++) for (let sx = 0; sx < SUB && !found; sx++) {
        const pt = { x: c * DEPTH_CELL + step * (sx + 0.5), y: r * DEPTH_CELL + step * (sy + 0.5) };
        for (const lm of LANDMASSES) if (pointInLandmass(pt, lm)) { found = true; break; }
      }
      land[r][c] = found;
    }

    const coast = coastDistanceField(land);
    const harbours = Object.keys(PORTS).map(k => getPortWaterPos(k));
    const field = buildDepthField(coast, harbours, DEPTH_CELL);

    let water = 0;
    const closed = new Map<string, number>();
    for (const id of Object.keys(SHIP_CLASSES)) closed.set(id, 0);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (land[r][c]) continue;
      water++;
      for (const [id, cls] of Object.entries(SHIP_CLASSES)) {
        if (soundings(field[r][c], cls.draft).aground) closed.set(id, (closed.get(id) ?? 0) + 1);
      }
    }
    return { field, water, closed };
  }

  it("lets every class into every harbour in the Caribbean", () => {
    const { field } = realDepthField();
    const at = (x: number, y: number) => field[Math.floor(y / DEPTH_CELL)]?.[Math.floor(x / DEPTH_CELL)] ?? OPEN_SEA_DEPTH;
    const deepest = Math.max(...Object.values(SHIP_CLASSES).map(c => c.draft));
    const shut: string[] = [];
    for (const key of Object.keys(PORTS)) {
      const p = getPortWaterPos(key);
      if (soundings(at(p.x, p.y), deepest).aground) shut.push(key);
    }
    expect(shut).toEqual([]);
    setLandmasses([]);
  });

  it("shuts a deep hull out of a real slice of the sea, and a shallow one out of none", () => {
    const { water, closed } = realDepthField();
    const galleon = (closed.get("galleon") ?? 0) / water;
    // Measured at 6.2% with HARBOUR_RADIUS 90 — enough to matter in a chase,
    // small enough that the map is still open water.
    expect(galleon).toBeGreaterThan(0.03);
    expect(galleon).toBeLessThan(0.12);
    expect(closed.get("pinnace")).toBe(0);
    expect(closed.get("sloop")).toBe(0);
    setLandmasses([]);
  });

  it("keeps the harbour radius honest", () => {
    // If this ever shrinks below a ship's length off the quay, the dredging is
    // decoration and the reachability test above starts failing at random.
    expect(HARBOUR_RADIUS).toBeGreaterThanOrEqual(60);
  });
});
