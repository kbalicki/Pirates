/**
 * SeaDepth — the water has a bottom, and every hull has always known how far
 * down hers reaches (v0.48.0).
 *
 * Three things sat in this project not knowing about each other:
 *
 *   1. **`ShipClassDef.draft`** — 1.0 m for a pinnace up to 5.5 m for a
 *      galleon, declared for all nine classes since v0.5.x and read by
 *      **nothing**. Not one line of code anywhere asked how deep a ship sat.
 *   2. **`TerrainType`'s `"shallow"` and `"reef"`** — members with real
 *      handling in `NavigationSystem` (0.6x speed, 0.3x plus hull damage) that
 *      **never ran once**, because `MainMapScene.createTerrainQuery` only ever
 *      returned `"land"` or `"sea"`.
 *   3. **`ShallowWaterRenderer`** — which has painted a turquoise shelf around
 *      every coast since v0.6.x, from a breadth-first distance out of the land
 *      grid. The picture has been telling the player about shoal water the
 *      whole time and the simulation has been sailing straight through it.
 *
 * So the depth field here is derived from **exactly the same** breadth-first
 * distance the renderer paints from — `coastDistanceField` is now shared, and
 * the pale water on the chart is the shallow water under the keel. Nothing is
 * stored: it is rebuilt from the coastline, like the trade lanes and the
 * currents.
 *
 * Two rules make it playable rather than merely true:
 *
 *   • **Harbours are dredged.** Every port's approach lies at coast distance
 *     0-2 (measured: all 45 of them, median 1), so without this a frigate
 *     could not reach a single town in the Caribbean. Water within
 *     `HARBOUR_RADIUS` of a port's water approach is open sea.
 *   • **Only the innermost band bites.** Measured against the real coastline:
 *     the four small classes go everywhere, and the five big ones are shut out
 *     of 6.2% of the sea — which is the whole point, because that 6.2% is
 *     exactly where a sloop goes when a galleon is chasing her.
 */

import type { Vec2 } from "../model/WorldState.ts";

/** World units per depth cell — the land grid's own resolution. */
export const DEPTH_CELL = 32;

/**
 * Depth in metres by distance from land, in cells.
 *
 * Index 0 is the shore itself. The four bands are the four the shallow-water
 * renderer paints, so the palest water is the shallowest water.
 */
export const DEPTH_BANDS = [0, 3.5, 6, 9, 12];

/** Anything further out than the painted shelf is as deep as it needs to be. */
export const OPEN_SEA_DEPTH = 99;

/** Water this close to a port's approach is dredged and always deep. */
export const HARBOUR_RADIUS = 90;

/** Below this much water under the keel she is feeling the bottom. */
export const SHOAL_CLEARANCE = 1.5;

/** What she makes while she is dragging her keel through sand. */
export const AGROUND_SPEED_MUL = 0.25;

/** What she makes with the bottom close but not touching. */
export const SHOAL_SPEED_MUL = 0.75;

/** Hull points ground away per tick while she is touching. */
export const AGROUND_HULL_PER_TICK = 0.12;

/** How deep the water is at a world position, in metres. */
export type DepthQuery = (x: number, y: number) => number;

/**
 * Breadth-first distance from land into the water, in grid cells.
 *
 * Land is 0, the cells touching it are 1, and so on out to `maxD`; everything
 * beyond stays at `Infinity`. This is the field `ShallowWaterRenderer` has
 * always painted from — it lived as a private method there until v0.48.0, when
 * the simulation needed the same answer the picture was giving.
 */
export function coastDistanceField(landGrid: boolean[][], maxD = 5): number[][] {
  const rows = landGrid.length;
  const cols = landGrid[0]?.length ?? 0;
  const dist: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(Infinity));
  const queue: [number, number][] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (landGrid[r][c]) {
        dist[r][c] = 0;
        queue.push([r, c]);
      }
    }
  }

  let head = 0;
  while (head < queue.length) {
    const [cr, cc] = queue[head++];
    const nd = dist[cr][cc] + 1;
    if (nd > maxD) continue;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nr = cr + dr, nc = cc + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (dist[nr][nc] <= nd) continue;
      dist[nr][nc] = nd;
      queue.push([nr, nc]);
    }
  }

  return dist;
}

/** Metres of water over a cell that far from the beach. */
export function depthFromCoastDistance(cells: number): number {
  if (!Number.isFinite(cells)) return OPEN_SEA_DEPTH;
  const d = Math.max(0, Math.floor(cells));
  return d < DEPTH_BANDS.length ? DEPTH_BANDS[d] : OPEN_SEA_DEPTH;
}

/**
 * Turn a coast-distance field into a depth field in metres, dredging the
 * harbours as it goes.
 *
 * `harbours` are water approaches, not town centres — a town's own pixel is
 * often inland, and the point that has to be deep is the one ships steer for.
 */
export function buildDepthField(
  coastDist: number[][],
  harbours: Vec2[],
  cell = DEPTH_CELL,
): number[][] {
  const rows = coastDist.length;
  const cols = coastDist[0]?.length ?? 0;
  const field: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(OPEN_SEA_DEPTH));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      field[r][c] = depthFromCoastDistance(coastDist[r][c]);
    }
  }

  const r2 = HARBOUR_RADIUS * HARBOUR_RADIUS;
  for (const h of harbours) {
    const span = Math.ceil(HARBOUR_RADIUS / cell);
    const hr = Math.floor(h.y / cell);
    const hc = Math.floor(h.x / cell);
    for (let r = hr - span; r <= hr + span; r++) {
      if (r < 0 || r >= rows) continue;
      for (let c = hc - span; c <= hc + span; c++) {
        if (c < 0 || c >= cols) continue;
        // Cells the land grid calls land are dredged too, and that is not a
        // bug: land collision is settled against the coastline polygons, never
        // against this field. Eight of the 45 approaches sit in a cell the 4x4
        // subsampler flags as land — the quay is in it — and skipping those
        // shut a galleon out of Port Royal, Santiago and Belize.
        const dx = (c + 0.5) * cell - h.x;
        const dy = (r + 0.5) * cell - h.y;
        if (dx * dx + dy * dy <= r2) field[r][c] = OPEN_SEA_DEPTH;
      }
    }
  }

  return field;
}

// ── The live field ────────────────────────────────────────

/**
 * Set once when the coastline is known, exactly like `LANDMASSES` and for the
 * same reason: everything downstream wants to ask a plain function rather than
 * carry a grid through seven call sites.
 *
 * An unset field answers `OPEN_SEA_DEPTH` everywhere — which is precisely how
 * the game behaved before v0.48.0, and is why every existing test still passes
 * without being handed a coastline.
 */
let depthField: number[][] | null = null;
let depthCell = DEPTH_CELL;

export function setDepthField(field: number[][] | null, cell = DEPTH_CELL): void {
  depthField = field;
  depthCell = cell;
}

/** Metres of water at a world position. Open sea when no field is loaded. */
export function depthAt(x: number, y: number): number {
  if (!depthField) return OPEN_SEA_DEPTH;
  const r = Math.floor(y / depthCell);
  const c = Math.floor(x / depthCell);
  const row = depthField[r];
  if (!row) return OPEN_SEA_DEPTH;
  const d = row[c];
  return d === undefined ? OPEN_SEA_DEPTH : d;
}

/** True once a coastline has been turned into soundings. */
export function hasDepthField(): boolean {
  return depthField !== null;
}

// ── What a keel makes of it ───────────────────────────────

export type Soundings = {
  /** Metres of water under the keel. Negative means she is in it. */
  clearance: number;
  /** She is dragging: speed cut hard and the hull grinding away. */
  aground: boolean;
  /** Bottom close enough to slow her, not close enough to hurt her. */
  shoal: boolean;
  /** Speed multiplier to apply this tick. */
  speedMul: number;
};

/**
 * What a hull of this draught makes of that much water.
 *
 * Deliberately three states rather than two: a ship that only ever either
 * sailed or stopped dead would give the player no warning at all, and the
 * warning is the mechanic. Feeling the bottom is the cue to come about.
 */
export function soundings(depth: number, draft: number): Soundings {
  const clearance = depth - draft;
  if (clearance <= 0) {
    return { clearance, aground: true, shoal: false, speedMul: AGROUND_SPEED_MUL };
  }
  if (clearance < SHOAL_CLEARANCE) {
    return { clearance, aground: false, shoal: true, speedMul: SHOAL_SPEED_MUL };
  }
  return { clearance, aground: false, shoal: false, speedMul: 1 };
}
