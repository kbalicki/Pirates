import { describe, it, expect } from "vitest";
import { CITIES } from "../data/cities.ts";
import { PORTS } from "../data/ports.ts";
import { VILLAGES } from "../data/villages.ts";
import { HURRICANE_RADIUS } from "../systems/WeatherFieldSystem.ts";
import { BLOCKADE_RADIUS } from "../systems/BlockadeSystem.ts";
import { PRESENCE_RANGE } from "../systems/ReconquestSystem.ts";
import { bestVisionRange } from "../systems/VisionSystem.ts";
import { VILLAGE_RANGE } from "../systems/VillageSystem.ts";
import { pickStormRoad, pickNeighbours } from "../systems/WorldEventSystem.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { windSpeedModifier } from "../systems/WeatherSystem.ts";
import type { RngState } from "../model/WorldState.ts";

// ===========================================================================
// A comment is a claim (v0.90.0)
// ===========================================================================

/**
 * `scripts/sweep-claims.mjs` lists every sentence in `core/` that says
 * something checkable about a number. This file is what the sweep found,
 * written down so it cannot come back — and, in the first block, the sweep's
 * own machine check moved out of a script nobody has to run and into the suite
 * that runs on every commit.
 *
 * The three releases before this one each ended in prose: a number described
 * in the layer that draws it (v0.87.0), a number typed into a sentence the
 * player reads (v0.88.0), a rule that enumerated its readers and left two out
 * (v0.89.0). The shape underneath all three is the same: **a sentence is a
 * claim, and nothing in a build reads a sentence.**
 */

const SRC = import.meta.glob("../../{core,game}/**/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
// Vite normalises these paths and strips the `core/` segment, so a filter on
// "/core/" matches nothing and every loop under it passes without reading a
// line. v0.87.0 hit that twice. Classify by exclusion and assert both halves
// are non-empty before trusting a single assertion below.
const isTest = (p: string) => p.includes("__tests__") || p.endsWith(".test.ts");
const GAME = Object.entries(SRC).filter(([p]) => p.includes("game/") && !isTest(p));
const CORE = Object.entries(SRC).filter(([p]) => !p.includes("game/") && !isTest(p));

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe("the sweep's own check, run on every commit", () => {
  it("reads both layers", () => {
    expect(GAME.length).toBeGreaterThan(30);
    expect(CORE.length).toBeGreaterThan(100);
  });

  /**
   * A comment that writes a constant's value beside its name — `FOO` (320) —
   * is a copy, and a copy goes stale without anything going red. This is the
   * QUOTED grade of the sweep, asserted.
   *
   * It deliberately reads **both** layers for the declaration and both layers
   * for the comment: a scene quoting a `core/` number is exactly the case
   * v0.87.0 was about.
   */
  it("every value quoted in a comment is the value the constant holds", () => {
    const declared = new Map<string, number>();
    for (const [, src] of [...CORE, ...GAME]) {
      for (const line of src.split("\n")) {
        const m = line.split("//")[0].match(/^\s*(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)(?:\s*:\s*[\w<>[\]|" ]+)?\s*=\s*(-?\d+(?:\.\d+)?)\s*(?:;|$)/);
        if (m) declared.set(m[1], Number(m[2]));
      }
    }
    expect(declared.size).toBeGreaterThan(200);

    const stale: string[] = [];
    for (const [path, src] of [...CORE, ...GAME]) {
      for (const m of src.matchAll(/`?\b([A-Z][A-Z0-9_]{3,})\b`?\s*(?:\(\s*(-?\d+(?:\.\d+)?)\s*\)|=\s*(-?\d+(?:\.\d+)?))/g)) {
        const name = m[1];
        if (!declared.has(name)) continue;
        // Only inside a comment: a real assignment is not a claim about itself.
        const before = src.slice(0, m.index ?? 0);
        const lineStart = before.lastIndexOf("\n") + 1;
        const line = src.slice(lineStart, (m.index ?? 0) + m[0].length);
        const inComment = /^\s*(\*|\/\/|\/\*)/.test(line);
        if (!inComment) continue;
        const said = Number(m[2] ?? m[3]);
        if (said !== declared.get(name)) stale.push(`${path}: ${name} quoted as ${said}, is ${declared.get(name)}`);
      }
    }
    expect(stale).toEqual([]);
  });
});

describe("the storm's three claims about itself", () => {
  const keys = Object.keys(CITIES);
  const nearest = keys.map(k => Math.min(...keys.filter(o => o !== k).map(o => dist(CITIES[k].pos, CITIES[o].pos))));

  /**
   * The sentence that stood over `HURRICANE_RADIUS` until v0.90.0 said the
   * circle sat *between* these two and was therefore bigger than anything the
   * player does to a harbour. It is smaller than both, and every number it
   * quoted was current — which is the whole reason QUOTED and COMPARED are
   * separate grades.
   */
  it("the weather is the smallest of the three world-scale ranges, not the biggest", () => {
    expect(HURRICANE_RADIUS).toBeLessThan(BLOCKADE_RADIUS);
    expect(HURRICANE_RADIUS).toBeLessThan(PRESENCE_RANGE);
  });

  it("is not smaller than the distance between two harbours — it covers several", () => {
    expect(median(nearest)).toBeLessThan(HURRICANE_RADIUS);
    const beyond = nearest.filter(d => d > HURRICANE_RADIUS).length;
    expect(beyond).toBeLessThanOrEqual(3);

    const swallowed = keys.map(k => keys.filter(o => o !== k && dist(CITIES[k].pos, CITIES[o].pos) <= HURRICANE_RADIUS).length);
    expect(median(swallowed)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...swallowed)).toBeGreaterThanOrEqual(7);
  });

  it("is far wider than the captain can see the edge of", () => {
    expect(HURRICANE_RADIUS * 2).toBeGreaterThan(bestVisionRange() * 7);
  });
});

describe("the road the eye walks (v0.90.0)", () => {
  const pool = Object.keys(PORTS);
  const seedAt = (n: number): RngState => ({ seed: n, state: (n * 2654435761) % 2147483647 });

  /** Every road the picker can build, at two stops, over many seeds. */
  function roads(pick: (p: string[], m: string, c: number, r: RngState) => { ports: string[] }) {
    const out: number[] = [];
    let seed = 1;
    for (const main of pool) {
      for (let k = 0; k < 12; k++) {
        const { ports } = pick(pool, main, 2, seedAt(seed++));
        const road = [main, ...ports].filter(p => CITIES[p]);
        if (road.length < 2) continue;
        let len = 0;
        for (let i = 1; i < road.length; i++) len += dist(CITIES[road[i - 1]].pos, CITIES[road[i]].pos);
        out.push(len);
      }
    }
    return out;
  }

  /**
   * The defect `STORM_MIN_LEG` exists for: a road shorter than the storm's own
   * radius means the eye never leaves the water it started over, which is the
   * three stationary circles v0.45.0 replaced, arrived at by geometry.
   */
  it("no storm stands still: every road is at least one radius long", () => {
    const lens = roads(pickStormRoad);
    expect(lens.length).toBeGreaterThan(300);
    expect(lens.filter(l => l < HURRICANE_RADIUS)).toEqual([]);
  });

  it("walks fast enough for the danger to be one that has to be outrun", () => {
    const lens = roads(pickStormRoad);
    // Its life is 3-7 days; take the slowest reading of it.
    const slowest = median(lens) / 7;
    const hull = Object.values(SHIP_CLASSES).map(c => {
      let sum = 0;
      for (let deg = 0; deg < 360; deg++) sum += windSpeedModifier((deg * Math.PI) / 180, 0, 0.543, c.minWindAngle);
      return (c.speedBase * 24 * 60 * sum) / 360;
    });
    // She is not slower than the slowest hull in the game averaged over every
    // heading that hull might be steering. Before v0.90.0 she was slower than
    // all nine.
    expect(slowest).toBeGreaterThan(Math.min(...hull));
  });

  /**
   * A harvest is a good year in one region and a fever spreads next door;
   * `pickNeighbours` is right for both and must stay exactly as it was.
   */
  it("leaves the neighbourhood picker alone, which every other event uses", () => {
    const lens = roads(pickNeighbours);
    expect(lens.filter(l => l < HURRICANE_RADIUS).length).toBeGreaterThan(50);
    expect(median(lens)).toBeLessThan(median(roads(pickStormRoad)));
  });
});

describe("the village's two hails", () => {
  const towns = Object.keys(CITIES);

  it("every town's dock radius is the same fifteen the comment now names", () => {
    const radii = new Set(towns.map(k => CITIES[k].dockRadius));
    expect([...radii]).toEqual([15]);
    expect(VILLAGE_RANGE / 15).toBeCloseTo(3.333, 2);
  });

  /**
   * The invariant the comment over `VILLAGE_RANGE` is actually about, and
   * which was carrying no guard: the closest pair on the chart clears it by
   * seven tenths of one unit.
   */
  it("no captain can be inside a village's hail and a town's dock at once", () => {
    const gaps = Object.keys(VILLAGES).map(v =>
      Math.min(...towns.map(t => dist(VILLAGES[v].pos, CITIES[t].pos))));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(VILLAGE_RANGE + 15);
    // And it is tight enough to be worth the test: nothing to spare but inches.
    expect(Math.min(...gaps)).toBeLessThan(VILLAGE_RANGE + 15 + 2);
  });
});
