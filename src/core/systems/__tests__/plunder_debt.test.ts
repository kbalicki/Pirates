import { describe, it, expect } from "vitest";
import { WorldEngine } from "../../engine/WorldEngine.ts";
import {
  moraleCeiling, raiseMorale, dividePlunder,
  PLUNDER_INTERVAL_DAYS, PLUNDER_OVERDUE_MORALE_PER_DAY, PLUNDER_OVERDUE_MORALE_FLOOR,
} from "../PlunderSystem.ts";
import { buyRoundOfDrinks } from "../PortInteractionSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { initPortPrices, initPortInventory } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { portId, entityId, factionId } from "../../model/ids.ts";
import type { WorldState, PortRuntimeState } from "../../model/WorldState.ts";

// ===========================================================================
// The crew's share was a debt anybody could eat their way out of (v0.71.0)
// ===========================================================================

/**
 * `PlunderSystem` calls itself "the first mechanic that takes something away on
 * a clock" and says "you cannot hoard forever". For thirty releases it took
 * away nothing at all.
 *
 * The debt bled **0.004 morale a day**. `CrewConsumptionSystem` hands a fed
 * crew **0.005 an hour** — thirty times as much — so a larder that held for
 * **forty-eight minutes of each day** cancelled the whole mechanic. Measured on
 * the engine: a crew five hundred and forty-seven days past its division, fed,
 * sits at morale **1.000**, having climbed there from the floor in a week. And
 * a ten-gold round of drinks bought thirty-seven days of debt back, which
 * priced the entire system at a quarter of a gold a day against the thirteen
 * thousand gold and seventy-eight of a hundred and twenty hands a real
 * division costs.
 *
 * The cure is the one v0.67.0 found for the price ceiling: the thing was a
 * **condition** and had been written as an **event**.
 */

function makePort(key: string): PortRuntimeState {
  const b = getPortBaseline(key);
  return {
    portId: portId(key), factionId: CITIES[key].factionId,
    prices: initPortPrices(key), inventory: initPortInventory(key),
    shipyardQueue: [], availableCrew: 10,
    population: b.population, wealth: b.wealth, defense: b.defense,
    bonusProduces: [],
  } as unknown as PortRuntimeState;
}

type Over = {
  day?: number; lastPlunderDay?: number; morale?: number; gold?: number;
  cargo?: Record<string, number>; fleet?: unknown[]; atSea?: boolean;
};

function makeWorld(over: Over = {}): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  for (const key of Object.keys(CITIES)) ports[key] = makePort(key);
  const cls = SHIP_CLASSES["frigate"];
  return {
    version: 12,
    time: { day: over.day ?? 400, hour: 0, minute: 0, tick: 0 },
    rng: { seed: 7, state: 7 },
    player: {
      id: entityId("player"), shipId: entityId("player_ship"),
      gold: over.gold ?? 20000, notoriety: 0, reputation: {}, ranks: {},
      location: over.atSea === false
        ? { type: "port", portId: portId("havana"), pos: { x: 0, y: 0 } }
        : { type: "sea", pos: { x: 1400, y: 1000 } },
      questLog: [], fleet: over.fleet ?? [],
      lastPlunderDay: over.lastPlunderDay ?? 1, citiesCaptured: 0, courtship: {},
    },
    entities: {
      player: {
        id: entityId("player"), kind: "player", pos: { x: 1400, y: 1000 },
        heading: 0, vel: { x: 0, y: 0 }, sailLevel: 0, mode: "sailing",
      },
      player_ship: {
        id: entityId("player_ship"), kind: "ship", pos: { x: 1400, y: 1000 },
        heading: 0, vel: { x: 0, y: 0 }, sailLevel: 0.5, mode: "sailing",
        ship: {
          classId: "frigate", factionId: factionId("england"),
          hullHp: cls.hullMax, hullMax: cls.hullMax,
          sailsHp: cls.sailsMax, sailsMax: cls.sailsMax,
          cannons: cls.cannons, cargo: { ...(over.cargo ?? {}) }, cargoCap: cls.cargoCap,
          crew: { current: 30, max: cls.crewMax, morale: over.morale ?? 1 },
        },
      },
    },
    ports,
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: {}, eventLog: [], worldEvents: [], knownEventIds: [],
    playerName: "C", eraId: "pirates_sunset", startYear: 1690, gameSpeed: 1.2,
    captain: {
      nationality: "england",
      skills: { fencing: 5, gunnery: 5, navigation: 5, medicine: 5, charm: 5 },
      startAge: 20, training: 0.3,
    },
  } as unknown as WorldState;
}

const moraleOf = (w: WorldState) => w.entities["player_ship"].ship!.crew.morale;

// ---------------------------------------------------------------------------

describe("what an unpaid crew will tolerate", () => {
  it("is nothing at all while they are still patient", () => {
    expect(moraleCeiling(makeWorld({ day: 30 }))).toBe(1);
    expect(moraleCeiling(makeWorld({ day: 1 + PLUNDER_INTERVAL_DAYS + 1 }))).toBeCloseTo(0.996, 10);
  });

  it("walks the same curve the daily bleed used to walk", () => {
    const sixty = makeWorld({ day: 1 + PLUNDER_INTERVAL_DAYS + 60 });
    expect(moraleCeiling(sixty)).toBeCloseTo(1 - 60 * PLUNDER_OVERDUE_MORALE_PER_DAY, 10);
  });

  it("stops at the floor", () => {
    expect(moraleCeiling(makeWorld({ day: 100000 }))).toBe(PLUNDER_OVERDUE_MORALE_FLOOR);
  });

  it("never lets a hand that lifts morale climb over it", () => {
    const w = makeWorld({ day: 1 + PLUNDER_INTERVAL_DAYS + 100 });   // ceiling 0.6
    expect(raiseMorale(w, 0.5, 0.15)).toBeCloseTo(0.6, 10);
    expect(raiseMorale(w, 0.55, 0.02)).toBeCloseTo(0.57, 10);
    // And never lowers: walking the crew down is the day boundary's job.
    expect(raiseMorale(w, 0.9, 0.15)).toBeCloseTo(0.9, 10);
  });

  it("is lifted entirely by paying them", () => {
    const paid = dividePlunder(makeWorld({ day: 900, atSea: false })).world;
    expect(moraleCeiling(paid)).toBe(1);
    expect(moraleOf(paid)).toBe(1);
  });
});

// ---------------------------------------------------------------------------

/**
 * The measurement that started the release, as a regression. This is the one
 * that has to stay red if the ceiling is ever taken out again.
 */
describe("a full larder is not a substitute for paying the men", () => {
  it("cannot lift a crew that has gone a year and a half without a division", () => {
    const engine = new WorldEngine(() => "sea" as never);
    let w = makeWorld({ day: 400, lastPlunderDay: 1, morale: PLUNDER_OVERDUE_MORALE_FLOOR,
      cargo: { food: 40, water: 40 } });
    let best = 0;
    for (let i = 0; i < 40000; i++) {
      w = engine.apply(w, [], 1).state as WorldState;
      // Kept stocked, the way a captain who calls at a port keeps it: this
      // chart's median cell is a day from the nearest quay (v0.58.0).
      const e = w.entities["player_ship"];
      w = { ...w, entities: { ...w.entities, player_ship: {
        ...e, ship: { ...e.ship!, cargo: { food: 40, water: 40 } } } } } as WorldState;
      best = Math.max(best, moraleOf(w));
    }
    // Before v0.71.0 this reached 1.000 inside a week and stayed there.
    expect(best).toBeLessThanOrEqual(moraleCeiling(w) + 1e-9);
    expect(best).toBeLessThan(0.5);
  }, 120000);

  it("still feeds a paid crew back to full, exactly as fast as it always did", () => {
    const engine = new WorldEngine(() => "sea" as never);
    let w = makeWorld({ day: 400, lastPlunderDay: 399, morale: 0.2,
      cargo: { food: 40, water: 40 } });
    for (let i = 0; i < 24000; i++) {
      w = engine.apply(w, [], 1).state as WorldState;
      const e = w.entities["player_ship"];
      w = { ...w, entities: { ...w.entities, player_ship: {
        ...e, ship: { ...e.ship!, cargo: { food: 40, water: 40 } } } } } as WorldState;
    }
    expect(moraleOf(w)).toBe(1);
  }, 120000);
});

// ---------------------------------------------------------------------------

describe("the round of drinks", () => {
  it("lifts a crew that is paid up", () => {
    const w = makeWorld({ day: 400, lastPlunderDay: 399, morale: 0.5, atSea: false });
    const out = buyRoundOfDrinks(w);
    expect(out.boosted).toBe(true);
    expect(moraleOf(out.world)).toBeCloseTo(0.65, 10);
    expect(out.world.player.gold).toBe(w.player.gold - 10);
  });

  it("will not lift one that is owed a share, and charges nothing for trying", () => {
    // Ten gold used to buy thirty-seven days of the debt back.
    const w = makeWorld({ day: 900, lastPlunderDay: 1, morale: PLUNDER_OVERDUE_MORALE_FLOOR });
    const out = buyRoundOfDrinks(w);
    expect(out.boosted).toBe(false);
    expect(out.error).toBe("owed_a_share");
    expect(out.world.player.gold).toBe(w.player.gold);
    expect(moraleOf(out.world)).toBe(PLUNDER_OVERDUE_MORALE_FLOOR);
  });

  it("buys the consorts a drink as well", () => {
    // They grumble on the same clock (v0.19.0) and only the flagship ever
    // cheered up, which made a fleet's morale a property of one deck.
    const w = makeWorld({
      day: 400, lastPlunderDay: 399, morale: 0.5, atSea: false,
      fleet: [{ classId: "sloop", morale: 0.4, crew: 20 }],
    });
    const out = buyRoundOfDrinks(w);
    expect(out.boosted).toBe(true);
    expect(out.world.player.fleet[0].morale).toBeCloseTo(0.55, 10);
  });
});

// ---------------------------------------------------------------------------

/**
 * And the rule that keeps it true, read off the source: every hand that lifts
 * morale goes through `raiseMorale`. The `.priceMul` shape of v0.64.0 — the
 * only kind of check that can see a line no path under test runs.
 */
describe("every hand that lifts morale asks the crew's ledger first", () => {
  const SOURCES = import.meta.glob("../../**/*.ts", {
    query: "?raw", import: "default", eager: true,
  }) as Record<string, string>;

  /**
   * Everything under `core`, less the tests and the module that owns the
   * ceiling. `PlunderSystem` itself sets `morale: 1` when the men are actually
   * paid, which is the one lift that is allowed to ignore the ceiling because
   * it is what clears it.
   */
  const FILES = Object.entries(SOURCES).filter(([path]) =>
    !path.includes("__tests__") && !path.endsWith("PlunderSystem.ts"));

  it("reads the files that could break it", () => {
    expect(FILES.length).toBeGreaterThan(60);
    const names = FILES.map(([p]) => p);
    expect(names.some(p => p.endsWith("CrewConsumptionSystem.ts"))).toBe(true);
    expect(names.some(p => p.endsWith("PortInteractionSystem.ts"))).toBe(true);
  });

  it("finds nothing adding to morale on its own account", () => {
    // `morale + SOMETHING` is a lift. Subtraction is a blow and is everywhere
    // it should be; clamps that only ever narrow a value are not lifts.
    const LIFT = /morale\s*\+\s*[A-Za-z_(]/;
    const offenders = FILES
      .filter(([, src]) => LIFT.test(src))
      .map(([path]) => path);
    expect(offenders, "these lift morale without asking the ceiling").toEqual([]);
  });
});
