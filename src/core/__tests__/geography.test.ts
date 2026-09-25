import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CITIES, isLandlocked } from "../data/cities.ts";
import { VILLAGES } from "../data/villages.ts";
import {
  LANDMASSES, setLandmasses, getFallbackLandmasses, landmassesFromRaw, type RawGeo,
} from "../data/geography.ts";
import { loadRealLandmasses } from "./realGeo.ts";
import { pointInLandmass } from "../services/Geometry.ts";
import { buildPortWaterCache, getPortWaterPos } from "../systems/PortWaterPositions.ts";
import { findSeaPath, resetSeaGrid } from "../services/Pathfinding.ts";
import { candidatePorts } from "../systems/FamilyQuestSystem.ts";
import { tradeRoutes, resetTradeRoutes } from "../systems/TradeRouteSystem.ts";
import type { WorldState, PortRuntimeState } from "../model/WorldState.ts";
import { economyDailyTick } from "../systems/EconomyTickSystem.ts";
import { initPortPrices, initPortInventory } from "../data/prices.ts";
import { getPortBaseline } from "../data/economyBaselines.ts";
import { portId, entityId } from "../model/ids.ts";

// ===========================================================================
// The coastline the tests never saw (v0.91.0)
// ===========================================================================

/**
 * `landmassesFromRaw` lived in `src/game/world/GeoLoader.ts` until this
 * release, with a hand-written second copy inside `SeaDepth.test.ts`. `core/`
 * cannot import from `src/game/`, so everything else asserting anything about
 * geography ran on `getFallbackLandmasses()` — **four islands, 66 vertices,
 * 1.38 % land** against the real **102, 2 485 and 24.59 %**.
 *
 * This file is what the real map says. Every number in it is measured, and the
 * first block is the comparison itself, pinned, so that "the stand-in and the
 * Caribbean disagree" stays a fact the suite states rather than one it forgets.
 */

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const onLand = (p: { x: number; y: number }) => LANDMASSES.some(lm => pointInLandmass(p, lm));

/** Share of a coarse grid over the whole chart that is land. */
function landShare(): number {
  let cells = 0, land = 0;
  for (let x = 0; x < 3200; x += 16) for (let y = 0; y < 2400; y += 16) { cells++; if (onLand({ x, y })) land++; }
  return land / cells;
}

describe("the shape on disk and the shape the rules use", () => {
  afterAll(() => { setLandmasses([]); resetSeaGrid(); });

  it("parses the file the build ships, not a copy of it", () => {
    const real = loadRealLandmasses();
    expect(real.length).toBe(102);
    expect(real.reduce((n, l) => n + l.polygon.length, 0)).toBeGreaterThan(2000);
    // Vertices are `{x, y}` and bboxes are named, whatever the JSON holds.
    for (const lm of real.slice(0, 5)) {
      expect(typeof lm.polygon[0].x).toBe("number");
      expect(typeof lm.bbox!.minX).toBe("number");
    }
  });

  /** The translation has one home now. Feed it the shape it documents. */
  it("turns a two-element vertex into a Vec2 and four numbers into a bbox", () => {
    const raw: RawGeo = { landmasses: [{ id: "x", polygon: [[1, 2], [3, 4]], bbox: [1, 2, 3, 4] }] };
    expect(landmassesFromRaw(raw)).toEqual([{
      id: "x",
      polygon: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
      bbox: { minX: 1, minY: 2, maxX: 3, maxY: 4 },
    }]);
  });

  /**
   * The measurement that made this release: the stand-in is not the Caribbean,
   * and seven of the berths it hands out are inland.
   */
  it("disagrees with the fallback about where ships lie, and about seven of them being afloat", () => {
    setLandmasses(getFallbackLandmasses());
    buildPortWaterCache();
    const fallbackShare = landShare();
    const fb = new Map(Object.keys(CITIES).map(k => [k, { ...getPortWaterPos(k) }]));

    setLandmasses(loadRealLandmasses());
    buildPortWaterCache();
    const realShare = landShare();
    const real = new Map(Object.keys(CITIES).map(k => [k, { ...getPortWaterPos(k) }]));

    expect(fallbackShare).toBeLessThan(0.03);
    expect(realShare).toBeGreaterThan(0.2);

    const moved = [...fb.keys()].filter(k => dist(fb.get(k)!, real.get(k)!) > 0.5);
    expect(moved.length).toBeGreaterThanOrEqual(12);

    // Measured against the real coastline: the fallback's berths are not all wet.
    const inland = [...fb.entries()].filter(([, p]) => onLand(p)).map(([k]) => k);
    expect(inland.length).toBeGreaterThanOrEqual(5);
    // And the real ones are.
    expect([...real.entries()].filter(([, p]) => onLand(p)).map(([k]) => k)).toEqual([]);
  });
});

describe("the real Caribbean", () => {
  beforeAll(() => { setLandmasses(loadRealLandmasses()); resetSeaGrid(); buildPortWaterCache(); });
  afterAll(() => { setLandmasses([]); resetSeaGrid(); });

  /**
   * The claim over `VillageDef.pos` — *"On land, within six units of open
   * water"* — which could not be checked until the real coastline could be
   * loaded. It is true, and exactly true: the furthest is six.
   */
  it("puts every village on land, within six units of open water", () => {
    const keys = Object.keys(VILLAGES);
    expect(keys.length).toBe(8);
    for (const k of keys) {
      const p = VILLAGES[k].pos;
      expect(onLand(p), `${k} is not on land`).toBe(true);
      let reach = Infinity;
      for (let r = 1; r <= 12 && reach === Infinity; r++)
        for (let a = 0; a < 64; a++)
          if (!onLand({ x: p.x + Math.cos((a / 64) * 2 * Math.PI) * r, y: p.y + Math.sin((a / 64) * 2 * Math.PI) * r })) { reach = r; break; }
      expect(reach, `${k} is ${reach} units from open water`).toBeLessThanOrEqual(6);
    }
  });

  it("gives every town a berth that is afloat", () => {
    for (const k of Object.keys(CITIES)) {
      expect(onLand(getPortWaterPos(k)), `${k}'s anchorage is on land`).toBe(false);
    }
  });

  /**
   * The flag in `cities.ts` is a claim about this map. This is the claim,
   * checked: exactly the towns marked `landlocked` are the towns no sea path
   * reaches, so moving a town on the chart without moving the flag goes red.
   */
  it("marks as landlocked exactly the towns no keel can reach", () => {
    const keys = Object.keys(CITIES);
    const unreachable = keys.filter(k =>
      keys.every(o => o === k || !findSeaPath(getPortWaterPos(k), getPortWaterPos(o))?.length),
    );
    expect(unreachable).toEqual(["panama"]);
    expect(keys.filter(isLandlocked)).toEqual(unreachable);
  });

  /**
   * v0.97.1: the lane builder chose the quickest supplier and only then asked
   * whether it was within reach, so a same-crown discount could pick a source
   * past `MAX_LANE_LENGTH` and leave a town with **no** lane while a nearer
   * foreign one stood by. Montserrat and Guadeloupe had no food lane; Panamá
   * has none because nothing sails to it.
   */
  it("feeds every town that eats food and has a keel to it", () => {
    resetTradeRoutes();
    const fed = new Set(tradeRoutes().filter(r => r.items.includes("food")).map(r => r.to));
    const hungry = Object.keys(CITIES).filter(k =>
      CITIES[k].demands.includes("food") && !CITIES[k].produces.includes("food") && !fed.has(k));
    expect(hungry).toEqual(["panama"]);
    resetTradeRoutes();
  });
});

/**
 * The other half of `landlocked` (v0.99.2): a town no keel reaches is reached
 * on foot. The owner kept Panamá as a town to sack overland, the way Morgan did
 * in 1671, and that is only a promise if the isthmus is one piece of land on
 * this chart. Measured: from Nombre de Dios a walker reaches Panamá's hail
 * circle in about forty 4 px steps - some three game hours at `LAND_WALK_SPEED`.
 */
describe("a town without a keel is reached on foot", () => {
  beforeAll(() => { setLandmasses(loadRealLandmasses()); resetSeaGrid(); });
  afterAll(() => { setLandmasses([]); resetSeaGrid(); });

  /** 4-connected flood fill over land, in 4 px steps, until `goal` is within `reach`. */
  function walkSteps(from: { x: number; y: number }, goal: { x: number; y: number }, reach: number): number {
    const STEP = 4, key = (x: number, y: number) => `${x},${y}`;
    let frontier = [{ x: Math.round(from.x), y: Math.round(from.y) }];
    const seen = new Set([key(frontier[0].x, frontier[0].y)]);
    for (let steps = 0; steps < 2000 && frontier.length; steps++) {
      const next: { x: number; y: number }[] = [];
      for (const p of frontier) {
        if (dist(p, goal) <= reach) return steps;
        for (const [dx, dy] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]]) {
          const q = { x: p.x + dx, y: p.y + dy };
          if (seen.has(key(q.x, q.y)) || !onLand(q)) continue;
          seen.add(key(q.x, q.y));
          next.push(q);
        }
      }
      frontier = next;
    }
    return -1;
  }

  it("starts the march on land, on the Caribbean side", () => {
    expect(onLand(CITIES.nombre_de_dios.pos)).toBe(true);
  });

  it("puts every landlocked town within a walk of a Caribbean port", () => {
    for (const key of Object.keys(CITIES).filter(isLandlocked)) {
      // 10 px is the on-foot hail radius (`MainMapScene.findNearPort`).
      const steps = walkSteps(CITIES.nombre_de_dios.pos, CITIES[key].pos, 10);
      expect(steps, key).toBeGreaterThan(0);
      expect(steps, key).toBeLessThan(100);
    }
  });
});

describe("nothing that needs a keel names a town without one", () => {
  const world = { ports: {}, worldFlags: {}, captain: { nationality: "england" } } as unknown as WorldState;

  it("keeps the family chain out of Panamá, where 17.6 % of captains used to be sent", () => {
    const pool = candidatePorts(world, "spain");
    expect(pool.length).toBeGreaterThan(10);
    expect(pool).not.toContain("panama");
    // And it is not filtering by accident: the other Spanish cities are there.
    expect(pool).toContain("cartagena");
    expect(pool).toContain("porto_bello");
  });

  /**
   * A source guard, because the list of systems that hand the player a course
   * is longer than the three this release walked. Anything new that picks a
   * destination out of `CITIES` should say why it may ignore the flag.
   */
  it("is read by the three systems that put a keel on a course", () => {
    const SRC = import.meta.glob("../systems/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    expect(Object.keys(SRC).length).toBeGreaterThan(30);
    const readers = Object.entries(SRC).filter(([, src]) => src.includes("isLandlocked(")).map(([p]) => p);
    for (const name of ["FamilyQuestSystem", "InformantSystem", "CrownCampaignSystem"]) {
      expect(readers.some(p => p.includes(name)), `${name} does not read isLandlocked`).toBe(true);
    }
  });
});

/**
 * Panamá has no food lane - nothing sails to it - and the question the owner
 * asked (v0.99.3) was whether it starves. Measured on the real coastline over
 * two settled years: no. A town whose lanes are missing still gets its imports
 * "by smugglers" (`EconomyTickSystem`, the unbooked trickle), so its food and
 * water stay at the shed's cap and its hunger at nought. Pinned, so a change
 * to the import fallback that would starve it is seen.
 */
describe("Panamá without a food lane", () => {
  beforeAll(() => { setLandmasses(loadRealLandmasses()); resetSeaGrid(); resetTradeRoutes(); });
  afterAll(() => { setLandmasses([]); resetSeaGrid(); resetTradeRoutes(); });

  it("is fed all the same", () => {
    const ports: Record<string, PortRuntimeState> = {};
    for (const key of Object.keys(CITIES)) {
      const b = getPortBaseline(key);
      ports[key] = {
        portId: portId(key), factionId: CITIES[key].factionId, prices: initPortPrices(key),
        inventory: initPortInventory(key), shipyardQueue: [], availableCrew: 10,
        population: b.population, wealth: b.wealth, defense: b.defense, bonusProduces: [],
      } as PortRuntimeState;
    }
    let w = {
      version: 12, time: { day: 100, hour: 12, minute: 0, tick: 0 }, rng: { seed: 1, state: 1 },
      player: { id: entityId("player"), shipId: entityId("player_ship"), gold: 0, notoriety: 0, reputation: {}, ranks: {},
        location: { type: "sea", pos: { x: 0, y: 0 } }, questLog: [], fleet: [], lastPlunderDay: 1, citiesCaptured: 0, courtship: {} },
      entities: {}, ports, weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
      worldFlags: {}, eventLog: [], worldEvents: [], knownEventIds: [],
    } as unknown as WorldState;
    let worst = 0;
    for (let d = 0; d < 365; d++) {
      w = economyDailyTick(w);
      w = { ...w, time: { ...w.time, day: w.time.day + 1 } };
      worst = Math.max(worst, w.ports.panama.hunger ?? 0);
    }
    expect(worst).toBe(0);
    expect(w.ports.panama.inventory.food ?? 0).toBeGreaterThan(0);
    expect(w.ports.panama.population).toBeCloseTo(getPortBaseline("panama").population, -2);
  });
});

/**
 * Leaving a town on foot put the walker at the town's own `pos` until v0.99.3,
 * and a coastal town's point is often water - Panamá's is 1.5 units into the
 * Pacific. The rescue that pulls a walker back ashore hid it. He is handed
 * back where he stood when he hailed the town, which is land because he
 * walked there.
 */
describe("leaving a town on foot", () => {
  beforeAll(() => { setLandmasses(loadRealLandmasses()); resetSeaGrid(); });
  afterAll(() => { setLandmasses([]); resetSeaGrid(); });

  it("has a town whose own point is water, which is why it matters", () => {
    expect(onLand(CITIES.panama.pos)).toBe(false);
  });

  it("puts him back where he stood, not on the town's point", () => {
    const SRC = import.meta.glob("../../game/scenes/PortScene.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const src = Object.values(SRC)[0] ?? "";
    expect(src).toContain("const portPos = entity?.pos ?? portDef?.pos");
  });

  it("does not have the town hail him again the moment he is out of the gate", () => {
    const SRC = import.meta.glob(["../../game/scenes/PortScene.ts", "../../game/scenes/MainMapScene.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const port = Object.entries(SRC).find(([k]) => k.endsWith("PortScene.ts"))![1];
    const map = Object.entries(SRC).find(([k]) => k.endsWith("MainMapScene.ts"))![1];
    expect(port).toContain('scene.start("MainMapScene", { worldState: this.worldState, leftPort: true })');
    expect(map).toContain("this.wasNearPort = this.leftPort;");
  });
});
