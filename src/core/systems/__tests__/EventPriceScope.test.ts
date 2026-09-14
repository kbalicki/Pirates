import { describe, it, expect } from "vitest";
import { getAggregatedEffects, priceMulFor } from "../EventEffectsSystem.ts";
import { ITEMS } from "../../data/items.ts";
import { CITIES } from "../../data/cities.ts";
import { initPortPrices, initPortInventory } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId } from "../../model/ids.ts";
import type { WorldState, WorldEventState, PortRuntimeState } from "../../model/WorldState.ts";

// ===========================================================================
// What the price multiplier is ABOUT (v0.64.0)
// ===========================================================================

/**
 * `EventDailyEffects.priceMul` was a single blanket number and three events
 * that are about food used it. Measured over 6 seeds x 10 years of a real
 * event machine, a famine multiplied the price of **tobacco** by 2.32 and of
 * gold by 2.32 — the same 2.29–2.32 it moved the food it is about. A sugar
 * harvest took 30% off the price of gold.
 *
 * Nothing in the project could see it. Every existing assertion about
 * `priceMul` asks whether it is 1 or not-1, never what it applies to, so the
 * whole suite was green on both sides of the fix. The manual, for once, was
 * the accurate document: "food x2, water x2" is what `help.event_famine_fx`
 * has said since the row was written, and the code's own comment beside the
 * epidemic row said "food/water cost more during plague" three lines above a
 * number that moved everything on the counter.
 *
 * These are the assertions that could have caught it: not "does the price
 * move" but "which prices move".
 */

const PORT = "havana";

function makePort(key: string): PortRuntimeState {
  const b = getPortBaseline(key);
  return {
    portId: portId(key),
    factionId: CITIES[key].factionId,
    prices: initPortPrices(key),
    inventory: initPortInventory(key),
    shipyardQueue: [],
    availableCrew: 10,
    population: b.population,
    wealth: b.wealth,
    defense: b.defense,
    bonusProduces: [],
  } as PortRuntimeState;
}

function worldWith(events: Array<Partial<WorldEventState>>): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  for (const key of Object.keys(CITIES)) ports[key] = makePort(key);
  return {
    version: 12,
    time: { day: 10, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"), shipId: entityId("player_ship"), gold: 500,
      notoriety: 0, reputation: {}, ranks: {},
      location: { type: "sea", pos: { x: 0, y: 0 } },
      questLog: [], fleet: [], lastPlunderDay: 1, citiesCaptured: 0, courtship: {},
    },
    entities: {}, ports,
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: {}, eventLog: [], knownEventIds: [],
    worldEvents: events.map((e, i) => ({
      id: `ev_${i}`,
      type: "famine",
      startDay: 1,
      endDay: 100,
      ports: [PORT],
      factions: [CITIES[PORT].factionId as string],
      severity: 1,
      headline: "news.famine",
      vars: {},
      ...e,
    })) as WorldEventState[],
    playerName: "Captain", eraId: "pirates_sunset", startYear: 1690, gameSpeed: 1.2,
  } as unknown as WorldState;
}

/** Every good, with what the events on this port do to its price. */
function mulsAt(world: WorldState): Record<string, number> {
  const fx = getAggregatedEffects(world, PORT);
  return Object.fromEntries(Object.keys(ITEMS).map(i => [i, priceMulFor(fx, i)]));
}

describe("an event about food moves the price of food", () => {
  it("a famine doubles food and water and leaves the rest of the counter alone", () => {
    const m = mulsAt(worldWith([{ type: "famine" }]));
    expect(m.food).toBe(2);
    expect(m.water).toBe(2);
    for (const item of ["sugar_cane", "tobacco", "cocoa", "rum", "gold"]) {
      expect(m[item], `famine moved ${item}`).toBe(1);
    }
  });

  it("an epidemic lifts food and water by its severity, and nothing else at all", () => {
    for (const severity of [1, 2, 3] as const) {
      const m = mulsAt(worldWith([{ type: "epidemic", severity }]));
      expect(m.food).toBeCloseTo(1 + 0.15 * severity, 10);
      expect(m.water).toBeCloseTo(1 + 0.15 * severity, 10);
      expect(m.tobacco, `severity ${severity} moved tobacco`).toBe(1);
      expect(m.gold, `severity ${severity} moved gold`).toBe(1);
    }
  });

  it("a harvest of sugar and food does not make gold cheaper", () => {
    const m = mulsAt(worldWith([{ type: "harvest" }]));
    expect(m.food).toBe(0.6);
    expect(m.sugar_cane).toBe(0.6);
    expect(m.gold).toBe(1);
    expect(m.rum).toBe(1);
    // Water is not harvested. It was 0.6 until v0.64.0, along with everything.
    expect(m.water).toBe(1);
  });
});

describe("an event about the whole market still moves the whole market", () => {
  it("a royal decree's tariff is on every good", () => {
    const m = mulsAt(worldWith([{ type: "royal_decree" }]));
    for (const item of Object.keys(ITEMS)) expect(m[item], item).toBeCloseTo(1.2, 10);
  });

  it("a trade boom is on every good", () => {
    const m = mulsAt(worldWith([{ type: "trade_boom" }]));
    for (const item of Object.keys(ITEMS)) expect(m[item], item).toBeCloseTo(0.8, 10);
  });

  it("an outbreak of war is on every good", () => {
    const m = mulsAt(worldWith([{ type: "war_start", startDay: 10, ports: [] }]));
    // `warBite` fades it, so the assertion is the shape, not the number.
    const values = Object.keys(ITEMS).map(i => m[i]);
    expect(Math.min(...values)).toBeGreaterThan(1);
    expect(new Set(values.map(v => v.toFixed(6))).size, "war priced goods differently").toBe(1);
  });
});

describe("the two kinds compound", () => {
  it("a famine inside a decree lifts food twice and everything else once", () => {
    const m = mulsAt(worldWith([{ type: "famine" }, { type: "royal_decree", id: "ev_d" }]));
    expect(m.food).toBeCloseTo(2 * 1.2, 10);
    expect(m.tobacco).toBeCloseTo(1.2, 10);
  });

  it("two events about the same good multiply on it", () => {
    const m = mulsAt(worldWith([
      { type: "famine" },
      { type: "epidemic", id: "ev_e", severity: 2 },
    ]));
    expect(m.food).toBeCloseTo(2 * 1.3, 10);
    expect(m.water).toBeCloseTo(2 * 1.3, 10);
    expect(m.cocoa).toBe(1);
  });
});

describe("the scope names real goods", () => {
  /**
   * A key that names nothing is the `SailLevelDef.namePl` shape: it reads as a
   * rule and is silently never applied. `itemPriceMul` is keyed by item id, so
   * a typo there would be a famine that moves nothing and says it does.
   */
  it("every item a scoped event names is a good the game trades", () => {
    const types = ["famine", "epidemic", "harvest", "royal_decree", "trade_boom",
                   "war_start", "pirate_raid", "hurricane", "slave_revolt",
                   "gold_discovery", "native_raid", "treaty_signed", "new_governor",
                   "treasure_fleet", "reconquest", "campaign", "alliance", "war_end"];
    for (const type of types) {
      const fx = getAggregatedEffects(worldWith([{ type: type as WorldEventState["type"] }]), PORT);
      for (const item of Object.keys(fx.itemPriceMul)) {
        expect(ITEMS[item], `${type} prices "${item}", which is not an item`).toBeDefined();
      }
    }
  });
});

describe("every price in the game goes through priceMulFor", () => {
  /**
   * The fix is only worth anything while nobody reads `priceMul` on its own
   * again. `spotPrice` takes a plain number, so a new caller can pass the
   * blanket half and be wrong in exactly the old way with nothing to stop it —
   * and no unit test would see it, because the number it produces is a
   * perfectly ordinary price. So the check reads the source, like the one on
   * `dayToCalendar` next door.
   */
  const SOURCES = {
    ...import.meta.glob("../../**/*.ts", { query: "?raw", import: "default", eager: true }),
    ...import.meta.glob("../../../game/**/*.ts", { query: "?raw", import: "default", eager: true }),
  } as Record<string, string>;

  const production = Object.entries(SOURCES)
    .filter(([path]) => !path.endsWith(".test.ts") && !path.includes("EventEffectsSystem.ts"));

  it("is reading the files that could break it", () => {
    // Never conclude "no reader" from a search that did not run (v0.57.0). The
    // price readers are named here, so an empty offender list means something.
    const names = production.map(([p]) => p).join("|");
    expect(names).toContain("PricingSystem.ts");
    expect(names).toContain("EconomyTickSystem.ts");
    expect(production.length).toBeGreaterThan(50);
  });

  it("nothing outside EventEffectsSystem reads .priceMul directly", () => {
    const offenders: string[] = [];
    for (const [path, src] of production) {
      for (const m of src.matchAll(/\.priceMul\b/g)) {
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${path}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
