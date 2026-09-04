import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  tradeRoutes,
  routesTo,
  routesFrom,
  routeSupplying,
  routesNear,
  alternateSuppliers,
  resetTradeRoutes,
  disruptions,
  disruptRoute,
  laneThroughput,
  tickRouteDisruption,
  laneSupplyShare,
  LANE_FULL,
  DISRUPTION_PER_PRIZE,
} from "../TradeRouteSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { initPortPrices, initPortInventory } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId } from "../../model/ids.ts";
import { setLandmasses, getFallbackLandmasses } from "../../data/geography.ts";
import { resetSeaGrid } from "../../services/Pathfinding.ts";
import type { WorldState, PortRuntimeState } from "../../model/WorldState.ts";

// ===========================================================================
// TradeRouteSystem — the lanes the Caribbean runs on
// ===========================================================================

/**
 * The lane network is a pure function of `CITIES` plus the coastline, so most
 * of what is worth asserting is structural: every good a town needs and cannot
 * grow has a named supplier, nobody supplies himself, and the two goods that
 * deliberately have no lane still have none.
 *
 * The disruption ledger is the stateful half, and the properties there are
 * accumulation to a ceiling, decay back to nothing, and — the one that matters
 * to the economy — that a lane out of a shut-in harbour delivers less.
 */

function makePort(key: string, over: Partial<PortRuntimeState> = {}): PortRuntimeState {
  const baseline = getPortBaseline(key);
  return {
    portId: portId(key),
    factionId: CITIES[key].factionId,
    prices: initPortPrices(key),
    inventory: initPortInventory(key),
    shipyardQueue: [],
    availableCrew: 10,
    population: baseline.population,
    wealth: baseline.wealth,
    defense: baseline.defense,
    bonusProduces: [],
    ...over,
  };
}

function makeWorld(over: Partial<WorldState> = {}): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  for (const key of Object.keys(CITIES)) ports[key] = makePort(key);
  return {
    version: 13,
    time: { day: 100, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: 500,
      notoriety: 0,
      reputation: {},
      ranks: {},
      location: { type: "sea", pos: { x: 0, y: 0 } },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
    },
    entities: {},
    ports,
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: {},
    eventLog: [],
    worldEvents: [],
    knownEventIds: [],
    playerName: "Captain",
    eraId: "pirates_sunset",
    startYear: 1690,
    gameSpeed: 1.2,
    captain: {
      nationality: "england",
      skills: { fencing: 5, gunnery: 5, navigation: 5, medicine: 5, charm: 5 },
      startAge: 20,
      training: 0.3,
    },
    ...over,
  };
}

/** Nothing is shut in unless a test says so. */
const openEverywhere = () => false;

describe("the lane network", () => {
  it("names a supplier for every good a town needs and cannot grow", () => {
    const unsupplied: string[] = [];
    for (const [key, def] of Object.entries(CITIES)) {
      for (const item of def.demands) {
        if (def.produces.includes(item)) continue;
        // Water has no producer anywhere: it comes out of a well, not a hold.
        if (item === "water") continue;
        if (!routeSupplying(key, item)) unsupplied.push(`${key}:${item}`);
      }
    }
    expect(unsupplied).toEqual([]);
  });

  it("gives water no lane at all — it cannot be blockaded away", () => {
    for (const key of Object.keys(CITIES)) {
      expect(routeSupplying(key, "water")).toBeUndefined();
    }
  });

  it("never has a port supplying itself", () => {
    expect(tradeRoutes().every(r => r.from !== r.to)).toBe(true);
  });

  it("only carries goods the destination actually demands", () => {
    for (const lane of tradeRoutes()) {
      for (const item of lane.items) {
        expect(CITIES[lane.to].demands).toContain(item);
        expect(CITIES[lane.to].produces).not.toContain(item);
        expect(CITIES[lane.from].produces).toContain(item);
      }
    }
  });

  it("gives every lane a course with at least two points and a real length", () => {
    for (const lane of tradeRoutes()) {
      expect(lane.path.length).toBeGreaterThanOrEqual(2);
      expect(lane.length).toBeGreaterThan(0);
    }
  });

  it("merges several goods on one run rather than duplicating the lane", () => {
    const ids = tradeRoutes().map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Sorted item lists keep the id and the cargo reproducible.
    for (const lane of tradeRoutes()) {
      expect([...lane.items].sort()).toEqual(lane.items);
    }
  });

  it("indexes the same lanes both ways round", () => {
    const lane = tradeRoutes()[0];
    expect(routesFrom(lane.from).map(r => r.id)).toContain(lane.id);
    expect(routesTo(lane.to).map(r => r.id)).toContain(lane.id);
  });

  it("is memoized — the same call answers the same objects", () => {
    expect(tradeRoutes()).toBe(tradeRoutes());
  });
});

describe("the network against a real coastline", () => {
  beforeEach(() => {
    setLandmasses(getFallbackLandmasses());
    resetSeaGrid();
    resetTradeRoutes();
  });
  afterEach(() => {
    setLandmasses([]);
    resetSeaGrid();
    resetTradeRoutes();
  });

  it("rebuilds when the coastline changes and bends courses round land", () => {
    const bent = tradeRoutes().filter(r => r.path.length > 2);
    expect(bent.length).toBeGreaterThan(0);
  });
});

describe("routesNear", () => {
  it("finds the lanes passing close to a point and misses the far ones", () => {
    const lane = tradeRoutes()[0];
    const on = lane.path[0];
    expect(routesNear(on, 40).map(r => r.id)).toContain(lane.id);
    // A point far outside the map touches nothing.
    expect(routesNear({ x: -5000, y: -5000 }, 50)).toEqual([]);
  });
});

describe("the disruption ledger", () => {
  it("reads empty on a world that has never had one", () => {
    const w = makeWorld();
    expect(disruptions(w)).toEqual({});
    expect(laneThroughput(w, "anything")).toBe(LANE_FULL);
  });

  it("records a prize taken and thins the lane", () => {
    const lane = tradeRoutes()[0];
    const w = disruptRoute(makeWorld(), lane.id);
    expect(laneThroughput(w, lane.id)).toBeCloseTo(1 - DISRUPTION_PER_PRIZE);
  });

  it("accumulates across several prizes but stops at a ceiling", () => {
    let w = makeWorld();
    const lane = tradeRoutes()[0];
    for (let i = 0; i < 10; i++) w = disruptRoute(w, lane.id);
    const share = laneThroughput(w, lane.id);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1 - DISRUPTION_PER_PRIZE);
  });

  it("leaves other lanes alone", () => {
    const [a, b] = tradeRoutes();
    const w = disruptRoute(makeWorld(), a.id);
    expect(laneThroughput(w, b.id)).toBe(LANE_FULL);
  });

  it("decays back to nothing over a fortnight of quiet", () => {
    const lane = tradeRoutes()[0];
    let w = disruptRoute(makeWorld(), lane.id);
    for (let d = 0; d < 30; d++) {
      w = tickRouteDisruption(w);
      w = { ...w, time: { ...w.time, day: w.time.day + 1 } };
    }
    expect(laneThroughput(w, lane.id)).toBe(LANE_FULL);
    expect(disruptions(w)).toEqual({});
  });

  it("recovers monotonically — never worse on a quiet day", () => {
    const lane = tradeRoutes()[0];
    let w = disruptRoute(disruptRoute(makeWorld(), lane.id), lane.id);
    let prev = laneThroughput(w, lane.id);
    for (let d = 0; d < 12; d++) {
      w = tickRouteDisruption(w);
      w = { ...w, time: { ...w.time, day: w.time.day + 1 } };
      const now = laneThroughput(w, lane.id);
      expect(now).toBeGreaterThanOrEqual(prev);
      prev = now;
    }
  });

  it("does nothing, and allocates nothing, on an empty ledger", () => {
    const w = makeWorld();
    expect(tickRouteDisruption(w)).toBe(w);
  });
});

describe("laneSupplyShare", () => {
  it("is full for a good with no lane — the well and the ocean packet", () => {
    const w = makeWorld();
    expect(laneSupplyShare(w, "havana", "water", openEverywhere)).toBe(LANE_FULL);
  });

  it("is full for an undisturbed lane", () => {
    const w = makeWorld();
    const lane = tradeRoutes()[0];
    expect(laneSupplyShare(w, lane.to, lane.items[0], openEverywhere)).toBe(LANE_FULL);
  });

  it("falls when the lane has been preyed upon", () => {
    const lane = tradeRoutes()[0];
    const w = disruptRoute(makeWorld(), lane.id);
    expect(laneSupplyShare(w, lane.to, lane.items[0], openEverywhere))
      .toBeLessThan(LANE_FULL);
  });

  it("falls when the supplier itself is shut in", () => {
    const lane = tradeRoutes()[0];
    const w = makeWorld();
    const shut = (port: string) => port === lane.from;
    const share = laneSupplyShare(w, lane.to, lane.items[0], shut);
    expect(share).toBeLessThan(LANE_FULL);
    expect(share).toBeGreaterThan(0);
  });

  it("compounds a shut supplier with a preyed-upon lane", () => {
    const lane = tradeRoutes()[0];
    const w = disruptRoute(makeWorld(), lane.id);
    const shut = (port: string) => port === lane.from;
    expect(laneSupplyShare(w, lane.to, lane.items[0], shut))
      .toBeLessThan(laneSupplyShare(w, lane.to, lane.items[0], openEverywhere));
  });

  it("is unaffected by a blockade somewhere else entirely", () => {
    const lane = tradeRoutes()[0];
    const w = makeWorld();
    const elsewhere = (port: string) => port === "nowhere_at_all";
    expect(laneSupplyShare(w, lane.to, lane.items[0], elsewhere)).toBe(LANE_FULL);
  });
});

describe("a second source (v0.23.0)", () => {
  it("names the other producers that could serve a town", () => {
    // Sugar and rum have many growers, so at least one lane must have a
    // fallback. If none did, blockading anybody would be equally devastating.
    const withAlternates = tradeRoutes().filter(
      lane => lane.items.some(item => alternateSuppliers(lane.to, item).length > 0),
    );
    expect(withAlternates.length).toBeGreaterThan(0);
  });

  it("never lists the chosen supplier as its own alternative", () => {
    for (const lane of tradeRoutes()) {
      for (const item of lane.items) {
        expect(alternateSuppliers(lane.to, item)).not.toContain(lane.from);
      }
    }
  });

  it("never lists the destination as a source of what it cannot grow", () => {
    for (const lane of tradeRoutes()) {
      for (const item of lane.items) {
        expect(alternateSuppliers(lane.to, item)).not.toContain(lane.to);
      }
    }
  });

  it("delivers more when the trade can go the long way round", () => {
    const lane = tradeRoutes().find(
      l => l.items.some(item => alternateSuppliers(l.to, item).length > 0),
    )!;
    const item = lane.items.find(i => alternateSuppliers(lane.to, i).length > 0)!;
    const w = makeWorld();

    const onlySupplierShut = (port: string) => port === lane.from;
    const everySourceShut = (port: string) =>
      port === lane.from || alternateSuppliers(lane.to, item).includes(port);

    const rerouted = laneSupplyShare(w, lane.to, item, onlySupplierShut);
    const strangled = laneSupplyShare(w, lane.to, item, everySourceShut);

    expect(rerouted).toBeGreaterThan(strangled);
    expect(rerouted).toBeLessThan(LANE_FULL);
  });

  it("has nothing to say about a good with no lane", () => {
    expect(alternateSuppliers("havana", "water")).toEqual([]);
  });
});
