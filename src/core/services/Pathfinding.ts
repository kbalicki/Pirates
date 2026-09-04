/**
 * Sea pathfinding — A* over a coarse grid of the Caribbean.
 *
 * This was an empty hook from the first commit to v0.21.0 ("NPCs steer
 * reactively"), and every feature that wanted a *route* rather than a bearing
 * ran into it: the expedition course is a straight line that sometimes crosses
 * a peninsula, and trade was an abstraction precisely because nothing could say
 * which water a cargo crosses.
 *
 * The grid is deliberately coarse. A ship is not a unit on a tile map; what the
 * game needs from a path is the handful of turns it takes to get round Cuba,
 * not a cell-by-cell walk. So the A* runs at `CELL` resolution and the result
 * is immediately string-pulled back down to the few corners that matter.
 *
 * Two properties the callers rely on:
 *
 * - **It is pure and memoized on the coastline.** `LANDMASSES` starts empty and
 *   is filled once, at boot, from GeoJSON; the grid is rebuilt when
 *   `landmassGeneration()` moves, and never otherwise.
 * - **With no land loaded it degrades to a straight line.** That is exactly
 *   what happens under vitest (see TODO: `LANDMASSES` is empty in tests), so a
 *   test asserting "there is a path" is asserting nothing about geography — and
 *   the callers stay correct either way, because a straight line over open
 *   water is a legitimate answer.
 */

import type { Vec2 } from "../model/WorldState.ts";
import { LANDMASSES, landmassGeneration } from "../data/geography.ts";
import { pointInLandmass, vec2Dist } from "./Geometry.ts";

/** World size, matching the map bounds used everywhere else. */
const MAP_W = 3200;
const MAP_H = 2400;

/** Grid resolution. 40 px ≈ two ship lengths — coarse on purpose (see above). */
export const SEA_CELL = 40;
const COLS = Math.ceil(MAP_W / SEA_CELL);
const ROWS = Math.ceil(MAP_H / SEA_CELL);

/**
 * Extra cost for sailing within this many cells of a shore.
 *
 * Without it A* hugs every coastline, because the shortest line between two
 * ports on the same island runs along its beach. Masters of sail gave headlands
 * a berth; so does this.
 */
const COAST_MARGIN = 2;
const COAST_PENALTY = 1.6;

type Grid = {
  /** true where a ship may float. */
  water: Uint8Array;
  /** Cells to the nearest land, capped at COAST_MARGIN + 1. */
  coast: Uint8Array;
  /** True when no land was loaded at all — every query is open water. */
  empty: boolean;
};

let cached: Grid | null = null;
let cachedGeneration = -1;

function idx(cx: number, cy: number): number {
  return cy * COLS + cx;
}

/** Build (or reuse) the sea grid for the coastline currently loaded. */
function grid(): Grid {
  const gen = landmassGeneration();
  if (cached && cachedGeneration === gen) return cached;

  const water = new Uint8Array(COLS * ROWS);
  const coast = new Uint8Array(COLS * ROWS);
  const empty = LANDMASSES.length === 0;

  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const p = { x: cx * SEA_CELL + SEA_CELL / 2, y: cy * SEA_CELL + SEA_CELL / 2 };
      let land = false;
      for (const lm of LANDMASSES) {
        if (pointInLandmass(p, lm)) { land = true; break; }
      }
      water[idx(cx, cy)] = land ? 0 : 1;
    }
  }

  // Distance to shore, in cells, by a bounded multi-source BFS from the land.
  const cap = COAST_MARGIN + 1;
  coast.fill(cap);
  const queue: number[] = [];
  for (let i = 0; i < water.length; i++) {
    if (water[i] === 0) { coast[i] = 0; queue.push(i); }
  }
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const d = coast[cur];
    if (d >= cap) continue;
    const cx = cur % COLS;
    const cy = (cur / COLS) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const n = idx(nx, ny);
        if (coast[n] > d + 1) { coast[n] = d + 1; queue.push(n); }
      }
    }
  }

  cached = { water, coast, empty };
  cachedGeneration = gen;
  return cached;
}

/** Drop the memoized grid. Only tests that swap coastlines need this. */
export function resetSeaGrid(): void {
  cached = null;
  cachedGeneration = -1;
}

/** Is this point clear water? Cheap: reads the grid, not the polygons. */
export function isSeaCell(p: Vec2): boolean {
  const g = grid();
  if (g.empty) return true;
  const cx = Math.floor(p.x / SEA_CELL);
  const cy = Math.floor(p.y / SEA_CELL);
  if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return false;
  return g.water[idx(cx, cy)] === 1;
}

/**
 * Can a ship sail straight from a to b without touching land?
 *
 * Sampled at half a cell, which is the resolution the grid knows anything at.
 */
export function isSeaClear(a: Vec2, b: Vec2): boolean {
  const g = grid();
  if (g.empty) return true;
  const dist = vec2Dist(a, b);
  const steps = Math.max(1, Math.ceil(dist / (SEA_CELL / 2)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!isSeaCell({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
  }
  return true;
}

/** Nearest water cell to a point, searched in rings. Ports sit on the shore. */
function snapToWater(p: Vec2, g: Grid): { cx: number; cy: number } | null {
  const cx0 = Math.max(0, Math.min(COLS - 1, Math.floor(p.x / SEA_CELL)));
  const cy0 = Math.max(0, Math.min(ROWS - 1, Math.floor(p.y / SEA_CELL)));
  if (g.water[idx(cx0, cy0)] === 1) return { cx: cx0, cy: cy0 };
  for (let r = 1; r <= 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = cx0 + dx, ny = cy0 + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        if (g.water[idx(nx, ny)] === 1) return { cx: nx, cy: ny };
      }
    }
  }
  return null;
}

function cellCentre(cx: number, cy: number): Vec2 {
  return { x: cx * SEA_CELL + SEA_CELL / 2, y: cy * SEA_CELL + SEA_CELL / 2 };
}

/**
 * A course from `from` to `to` that stays on water.
 *
 * Returns the endpoints plus the corners in between — typically two to six
 * points for a Caribbean crossing, one leg for open water. `null` when the two
 * points are not connected by sea at grid resolution (a landlocked query, or a
 * strait narrower than a cell).
 */
export function findSeaPath(from: Vec2, to: Vec2): Vec2[] | null {
  const g = grid();
  if (g.empty || isSeaClear(from, to)) return [from, to];

  const start = snapToWater(from, g);
  const goal = snapToWater(to, g);
  if (!start || !goal) return null;

  const startI = idx(start.cx, start.cy);
  const goalI = idx(goal.cx, goal.cy);
  if (startI === goalI) return [from, to];

  const n = COLS * ROWS;
  const gScore = new Float64Array(n).fill(Infinity);
  const fScore = new Float64Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);

  const h = (i: number): number => {
    const ax = i % COLS, ay = (i / COLS) | 0;
    const dx = Math.abs(ax - goal.cx), dy = Math.abs(ay - goal.cy);
    // Octile distance — admissible for 8-way movement.
    return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };

  gScore[startI] = 0;
  fScore[startI] = h(startI);

  // A binary heap keyed on fScore. The grid is 4 800 cells, so a plain heap of
  // indices is far simpler than anything fancier and never shows up in a frame.
  const heap: number[] = [startI];
  const push = (i: number) => {
    heap.push(i);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (fScore[heap[p]] <= fScore[heap[c]]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1, r = l + 1;
        let m = p;
        if (l < heap.length && fScore[heap[l]] < fScore[heap[m]]) m = l;
        if (r < heap.length && fScore[heap[r]] < fScore[heap[m]]) m = r;
        if (m === p) break;
        [heap[p], heap[m]] = [heap[m], heap[p]];
        p = m;
      }
    }
    return top;
  };

  while (heap.length > 0) {
    const cur = pop();
    if (cur === goalI) break;
    if (closed[cur]) continue;
    closed[cur] = 1;

    const cx = cur % COLS, cy = (cur / COLS) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const ni = idx(nx, ny);
        if (g.water[ni] === 0 || closed[ni]) continue;
        // No cutting a corner between two headlands.
        if (dx !== 0 && dy !== 0) {
          if (g.water[idx(cx + dx, cy)] === 0 || g.water[idx(cx, cy + dy)] === 0) continue;
        }
        const step = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
        const near = g.coast[ni] <= COAST_MARGIN ? COAST_PENALTY : 1;
        const tentative = gScore[cur] + step * near;
        if (tentative < gScore[ni]) {
          gScore[ni] = tentative;
          fScore[ni] = tentative + h(ni);
          cameFrom[ni] = cur;
          push(ni);
        }
      }
    }
  }

  if (cameFrom[goalI] === -1 && goalI !== startI) return null;

  // Walk the chain back, then string-pull: keep only the points where the
  // straight line to the next-but-one would run aground.
  const cells: Vec2[] = [];
  for (let i = goalI; i !== -1; i = cameFrom[i]) {
    cells.push(cellCentre(i % COLS, (i / COLS) | 0));
    if (i === startI) break;
  }
  cells.reverse();

  const raw = [from, ...cells, to];
  const pulled: Vec2[] = [raw[0]];
  let anchor = 0;
  for (let i = 1; i < raw.length; i++) {
    if (i === raw.length - 1) { pulled.push(raw[i]); break; }
    if (!isSeaClear(raw[anchor], raw[i + 1])) {
      pulled.push(raw[i]);
      anchor = i;
    }
  }
  return pulled;
}

/** Length of a course in world units. */
export function pathLength(path: Vec2[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += vec2Dist(path[i - 1], path[i]);
  return total;
}

/**
 * The closest a course comes to a point, and where along it.
 *
 * This is what makes a blockade or an ambush *geographic*: a lane either passes
 * within reach of the ship sitting on it or it does not.
 */
export function distanceToPath(path: Vec2[], p: Vec2): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const d = distanceToSegment(p, path[i - 1], path[i]);
    if (d < best) best = d;
  }
  return best === Infinity ? vec2Dist(path[0] ?? p, p) : best;
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return vec2Dist(p, a);
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return vec2Dist(p, { x: a.x + vx * t, y: a.y + vy * t });
}
