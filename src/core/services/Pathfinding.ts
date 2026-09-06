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
 *
 * ## The shortest course is not the quickest one (v0.42.0)
 *
 * Since v0.41.0 the sea moves. A ship that sails west along the Spanish Main
 * has four knots of Caribbean Current under her and one that beats east against
 * the Straits of Florida is giving a third of her speed away, so "how far" and
 * "how long" stopped being the same question — and this module only ever
 * answered the first one.
 *
 * `findSeaPassage` answers both. Hand it a `setAt` and every step of the A* is
 * costed as *time* rather than distance: a cell entered with the current is
 * cheaper than one entered against it, the course bends to ride the water, and
 * the `cost` that comes back is a passage time in still-water cell-widths.
 *
 * Two consequences worth knowing before using it:
 *
 *   - **it is asymmetric.** The quick way from Havana to Cartagena is not the
 *     reverse of the quick way back, which is exactly the shape of these waters
 *     and the reason the Spanish sailed a circuit rather than a line;
 *   - **with no `setAt` it is bit-for-bit the old function.** Every existing
 *     caller and every settled number in the economy is untouched until it opts
 *     in.
 */

import type { Vec2 } from "../model/WorldState.ts";
import { LANDMASSES, landmassGeneration } from "../data/geography.ts";
import { pointInLandmass, vec2Dist, clamp } from "./Geometry.ts";

/**
 * What the water does at a point, in world units per tick. Passed in rather
 * than imported so that `services` keeps its back to `systems`, and so a test
 * can hand this a current of its own.
 */
export type SetQuery = (p: Vec2) => Vec2;

/**
 * The speed a passage is reckoned against — **a laden merchantman's six knots,
 * not a frigate's twelve.**
 *
 * This is the whole difference between a current that matters and one that does
 * not. Cargo is carried by fluyts and merchantmen, and a four-knot current is
 * two thirds of a fluyt's speed against a third of a frigate's. Reckoning a
 * trade route at a warship's pace understates the sea by half, and measured on
 * the real coastline it is the difference between ten lanes changing hands and
 * twelve — including every one that stops supplying the Lesser Antilles from
 * leeward, which is the historical shape of the thing.
 */
export const PASSAGE_SPEED = 0.125;

/**
 * The most a fair current may cut a step's cost, and the most a foul one may
 * add. Wide enough that nothing in the present table touches them, narrow
 * enough that a future current stronger than the ship can neither make a
 * passage free nor infinite.
 */
const FAIR_LIMIT = 1.7;
const FOUL_LIMIT = 0.35;

export type SeaPassage = {
  path: Vec2[];
  /** Course over the ground, in world units. */
  length: number;
  /** Passage time, in still-water cell widths. Equal to `length / SEA_CELL` with no current. */
  cost: number;
};

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
export function findSeaPath(from: Vec2, to: Vec2, setAt?: SetQuery): Vec2[] | null {
  return findSeaPassage(from, to, setAt)?.path ?? null;
}

/**
 * How much of a step's cost a current pays for, as a divisor.
 *
 * Above 1 the water is helping, below 1 it is not. Clamped at both ends so that
 * a current stronger than the ship — which cannot happen with the present table
 * but might with the next one — can neither make a step free nor infinite.
 */
function setFactor(set: Vec2, ux: number, uy: number, speed: number): number {
  const along = (set.x * ux + set.y * uy) / speed;
  return clamp(1 + along, FOUL_LIMIT, FAIR_LIMIT);
}

export function findSeaPassage(
  from: Vec2,
  to: Vec2,
  setAt?: SetQuery,
  speed = PASSAGE_SPEED,
): SeaPassage | null {
  const g = grid();
  if (g.empty || isSeaClear(from, to)) {
    const straight = [from, to];
    const len = vec2Dist(from, to);
    if (!setAt || len <= 0) return { path: straight, length: len, cost: len / SEA_CELL };
    // One sample at the midpoint. At this resolution a line short enough to be
    // clear water is short enough that the set does not turn along it.
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const f = setFactor(setAt(mid), (to.x - from.x) / len, (to.y - from.y) / len, speed);
    return { path: straight, length: len, cost: len / SEA_CELL / f };
  }

  const start = snapToWater(from, g);
  const goal = snapToWater(to, g);
  if (!start || !goal) return null;

  const startI = idx(start.cx, start.cy);
  const goalI = idx(goal.cx, goal.cy);
  if (startI === goalI) {
    const len = vec2Dist(from, to);
    return { path: [from, to], length: len, cost: len / SEA_CELL };
  }

  const n = COLS * ROWS;
  const gScore = new Float64Array(n).fill(Infinity);
  const fScore = new Float64Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);

  // With a current the cheapest a step can ever be is `1 / FAIR_LIMIT`, so the
  // octile estimate has to be scaled by that to stay admissible — an A* with an
  // optimistic heuristic is still correct, one with a greedy heuristic is not.
  const hScale = setAt ? 1 / FAIR_LIMIT : 1;
  const h = (i: number): number => {
    const ax = i % COLS, ay = (i / COLS) | 0;
    const dx = Math.abs(ax - goal.cx), dy = Math.abs(ay - goal.cy);
    // Octile distance — admissible for 8-way movement.
    return ((dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy)) * hScale;
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
        let fair = 1;
        if (setAt) {
          const inv = 1 / step;
          fair = setFactor(setAt(cellCentre(nx, ny)), dx * inv, dy * inv, speed);
        }
        const tentative = gScore[cur] + step * near / fair;
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
  const passageCost = gScore[goalI];

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
  return { path: pulled, length: pathLength(pulled), cost: passageCost };
}

/**
 * How long a **given** course takes, in still-water cell widths (v0.44.0).
 *
 * `findSeaPassage` already answers this for the course it finds, but only for
 * the direction it was asked about, and its `cost` is the A\* score over cell
 * centres rather than over the string-pulled line that is actually drawn. This
 * walks the drawn course instead, which buys two things:
 *
 * - **the way home costs what the way out cost, measured the same way.** Run it
 *   on a reversed path and every step's direction flips, so the difference
 *   between the two numbers is the lane's own asymmetry and nothing else — not
 *   a difference in how the two were computed;
 * - no second A\*. A lane's return passage is a walk down a line we have.
 *
 * The set is sampled at most a cell apart, because string-pulling leaves legs
 * hundreds of units long that can cross out of a current band halfway.
 *
 * Reckoning the return leg on the outbound track understates the asymmetry a
 * little — a ship beating home would pick a different line — and that is the
 * safe direction to be wrong in: the chart shows one lane, and the two times
 * belong to the lane the player was shown.
 */
export function passageCost(path: Vec2[], setAt?: SetQuery, speed = PASSAGE_SPEED): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = vec2Dist(a, b);
    if (len <= 0) continue;
    if (!setAt) { total += len / SEA_CELL; continue; }
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const steps = Math.max(1, Math.ceil(len / SEA_CELL));
    const seg = len / steps;
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) * seg;
      const f = setFactor(setAt({ x: a.x + ux * t, y: a.y + uy * t }), ux, uy, speed);
      total += seg / SEA_CELL / f;
    }
  }
  return total;
}

/**
 * The point a fraction of the way along a polyline, **by distance**.
 *
 * Measured by distance rather than by leg, so a course that doubles back round
 * a headland does not make whatever is walking it sprint down the short leg and
 * crawl along the long one.
 *
 * Lived in `ExpeditionFleetSystem` until v0.45.0, because a squadron was the
 * first thing that walked a course. It is now the third — a named ship walks
 * her lane and a hurricane walks its road — and a weather module reaching into
 * an expedition module for a line of geometry was the wrong shape. It belongs
 * next to `pathLength`, which it uses.
 */
export function pointAlong(path: Vec2[], fraction: number): Vec2 {
  if (path.length === 1) return path[0];
  const total = pathLength(path);
  if (total <= 0) return path[0];
  let want = clamp(fraction, 0, 1) * total;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const leg = Math.hypot(b.x - a.x, b.y - a.y);
    if (want <= leg || i === path.length - 1) {
      const t = leg > 0 ? want / leg : 0;
      return { x: a.x + (b.x - a.x) * Math.min(1, t), y: a.y + (b.y - a.y) * Math.min(1, t) };
    }
    want -= leg;
  }
  return path[path.length - 1];
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
