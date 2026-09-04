import { describe, it, expect } from "vitest";
import { WorldEngine } from "../WorldEngine.ts";
import { rentStorehouse, leaseAt, storeAt, LEASE_DAYS } from "../../systems/StorehouseSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { ITEMS } from "../../data/items.ts";
import { initPortPrices } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId, factionId, shipClassId } from "../../model/ids.ts";
import type { WorldState, PortRuntimeState } from "../../model/WorldState.ts";

// ===========================================================================
// WorldEngine — the day rolling over
// ===========================================================================

/**
 * Everything hung off the change of day is wired in one place and nowhere
 * else, and a system that is written, tested and simply never called is a
 * whole category of bug this project has hit before (`tick` being fractional
 * killed NPC spawning outright for a release, with green unit tests). So this
 * file drives the real engine across midnight and checks that the daily work
 * actually ran.
 *
 * Terrain is all sea: this is about the clock, not the coastline.
 */

const PORT = "port_royal";
const GOOD = Object.keys(ITEMS)[0];

function makePort(key: string): PortRuntimeState {
  const baseline = getPortBaseline(key);
  const stocked: Record<string, number> = {};
  for (const item of Object.keys(ITEMS)) stocked[item] = 10;
  return {
    portId: portId(key),
    factionId: CITIES[key].factionId,
    prices: initPortPrices(key),
    inventory: stocked,
    shipyardQueue: [],
    availableCrew: 10,
    population: baseline.population,
    wealth: baseline.wealth,
    defense: baseline.defense,
    bonusProduces: [],
  };
}

function makeWorld(): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  for (const key of Object.keys(CITIES)) ports[key] = makePort(key);
  return {
    version: 13,
    // A minute before midnight, so a single modest step crosses the day.
    time: { day: 10, hour: 23, minute: 58, tick: 100 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: 100000,
      notoriety: 0,
      reputation: {},
      ranks: {},
      location: { type: "sea", pos: { x: 1000, y: 1000 } },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
    },
    entities: {
      player_ship: {
        id: entityId("player_ship"),
        kind: "ship",
        mode: "sailing",
        pos: { x: 1000, y: 1000 },
        vel: { x: 0, y: 0 },
        heading: 0,
        sailLevel: 0,
        depthOffset: 0,
        ship: {
          classId: shipClassId("merchantman"),
          factionId: factionId("england"),
          hullHp: 100, hullMax: 100,
          sailsHp: 100, sailsMax: 100,
          cannons: 10,
          cargo: { [GOOD]: 100 },
          cargoCap: 400,
          crew: { current: 40, max: 60, morale: 0.9 },
        },
      },
    },
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
  } as unknown as WorldState;
}

const engine = new WorldEngine(() => "sea");

/** Step the engine until the game day has advanced by `days`. */
function crossDays(world: WorldState, days: number): WorldState {
  const target = world.time.day + days;
  let w = world;
  let guard = 0;
  while (w.time.day < target && guard++ < 200000) {
    w = engine.apply(w, [], 4).state;
  }
  return w;
}

describe("the day rolling over", () => {
  it("runs the economy, so the trade ledger is settled and filed", () => {
    const after = crossDays(makeWorld(), 1);
    expect(after.time.day).toBe(11);
    // `tradeIncome` is written by `economyDailyTick` and by nothing else, so
    // its presence is proof the tick ran through the engine and not only in
    // its own unit test.
    expect(after.ports[PORT].tradeIncome).toBeDefined();
    expect(after.ports[PORT].tradeBalance).toBe(0);
  });

  it("auctions a lease whose rent has run out", () => {
    let w = rentStorehouse(makeWorld(), PORT).world;
    w = storeAt(w, PORT, GOOD, 60).world;
    expect(leaseAt(w, PORT)).toBeDefined();

    const goldBefore = w.player.gold;
    const after = crossDays(w, LEASE_DAYS + 1);

    expect(leaseAt(after, PORT)).toBeUndefined();
    expect(after.player.gold).toBeGreaterThan(goldBefore);
    expect(after.eventLog.some(e => e.key === "storehouse.log_auctioned")).toBe(true);
  });

  it("leaves a lease that is still paid up alone", () => {
    let w = rentStorehouse(makeWorld(), PORT).world;
    w = storeAt(w, PORT, GOOD, 60).world;
    const after = crossDays(w, 3);
    expect(leaseAt(after, PORT)?.goods[GOOD]).toBe(60);
  });
});
