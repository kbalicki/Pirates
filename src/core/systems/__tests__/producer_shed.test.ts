import { describe, it, expect } from "vitest";
import { economyDailyTick, townHunger } from "../EconomyTickSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { initPortPrices, initPortInventory, getBasePrice } from "../../data/prices.ts";
import { spotPrice, PRODUCER_FULL_RATIO } from "../PricingSystem.ts";
import {
  getPortBaseline, baselineProductionRate, baselineConsumptionRate,
  inventoryCap, PRODUCER_COVER_DAYS, IMPORT_COVER_DAYS,
} from "../../data/economyBaselines.ts";
import { portId, entityId } from "../../model/ids.ts";
import type { WorldState, WorldEventState, PortRuntimeState } from "../../model/WorldState.ts";
import { PL } from "../../i18n/locales/pl.ts";
import { EN } from "../../i18n/locales/en.ts";

// ===========================================================================
// A producer's warehouse (v0.75.0)
// ===========================================================================

/**
 * `inventoryCap` has two branches. v0.67.0 rewrote the one for a good a town
 * buys — the flat thirty tons that pinned 23 of 130 import quotes at the
 * ceiling — and left the one for a good a town **grows** exactly as it was:
 * `marketLevel * 50`, which is 150 to 250 tons against a producer who makes
 * about six a day.
 *
 * What that cost, measured over a settled Caribbean:
 *
 * - the shed stood at the cap in **69 of 69** producing (port, good) pairs,
 *   and 440 tons a day were thrown away across the map;
 * - nothing leaves a producer but the lanes, and **44 of those 69 goods have
 *   no lane client at all**, so the stock was decided by the cap alone;
 * - **61 of 69** quotes therefore sat on `RATIO_MIN` permanently — the shed
 *   would have had to fall below a third of the cap before the price moved;
 * - so a slave revolt cutting output to 30% for sixty days changed the price
 *   of the town's own staple by **0.0%**, and so did a harvest, an epidemic, a
 *   trade boom and the pirate raid that already takes 30% of the warehouse.
 *   The manual states "output x0.3" and "output x1.5" as things a captain can
 *   see.
 *
 * Two changes, and both are needed: the shed is sized to what it is for, and
 * its working level falls with the output. Either one alone leaves the revolt
 * invisible — measured.
 */

function makePort(key: string): PortRuntimeState {
  const b = getPortBaseline(key);
  return {
    portId: portId(key), factionId: CITIES[key].factionId,
    prices: initPortPrices(key), inventory: initPortInventory(key),
    shipyardQueue: [], availableCrew: 10,
    population: b.population, wealth: b.wealth, defense: b.defense, bonusProduces: [],
  };
}

function makeWorld(events: WorldEventState[] = []): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  for (const key of Object.keys(CITIES)) ports[key] = makePort(key);
  return {
    version: 12,
    time: { day: 100, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"), shipId: entityId("player_ship"), gold: 500,
      notoriety: 0, reputation: {}, ranks: {},
      location: { type: "sea", pos: { x: 0, y: 0 } },
      questLog: [], fleet: [], lastPlunderDay: 1, citiesCaptured: 0, courtship: {},
    },
    entities: {}, ports,
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: {}, worldEvents: events, knownEventIds: [], eventLog: [],
  } as unknown as WorldState;
}

function runDays(world: WorldState, days: number): WorldState {
  let w = world;
  for (let i = 0; i < days; i++) {
    w = economyDailyTick(w);
    w = { ...w, time: { ...w.time, day: w.time.day + 1 } };
  }
  return w;
}

function event(type: string, port: string, startDay: number, span: number): WorldEventState {
  return {
    id: `${type}_${port}_${startDay}`, type, startDay, endDay: startDay + span,
    ports: [port], factions: [], severity: 2, headline: `news.${type}`, vars: {},
  } as unknown as WorldEventState;
}

const STAPLE = CITIES.havana.produces[0];

describe("the shed is sized to what it is for", () => {
  it("holds days of its own output, not a flat number off the market level", () => {
    for (const key of Object.keys(CITIES)) {
      for (const item of CITIES[key].produces) {
        const rate = baselineProductionRate(key, item, getPortBaseline(key).wealth);
        expect(inventoryCap(key, item), `${key}/${item}`)
          .toBeCloseTo(Math.max(20, rate * PRODUCER_COVER_DAYS), 6);
      }
    }
  });

  it("is a much shorter cover than an importer's, and deliberately", () => {
    // A town keeps twenty days of what it eats and eight of what it grows. The
    // asymmetry is the point: what it eats has to last until the next hull
    // arrives, what it grows is waiting for one.
    expect(PRODUCER_COVER_DAYS).toBeLessThan(IMPORT_COVER_DAYS);
  });

  it("still leaves the staple cheap at its source, or the trade is pointless", () => {
    // Half the base with the shed full (v0.99.4, `PRODUCER_FULL_RATIO`): Havana
    // sugar 4 of 8 on its own quay. It was 3 - the floor - until v0.99.4, and
    // the floor was the defect: the first twenty tons bought moved nothing.
    const w = runDays(makeWorld(), 400);
    expect(w.ports.havana.prices[STAPLE]).toBe(4);
  });

  it("still leaves enough on the quay to fill a hold", () => {
    // The largest hold in the game is 120 tons and the common one is 40.
    const w = runDays(makeWorld(), 400);
    expect(w.ports.havana.inventory[STAPLE]).toBeGreaterThan(60);
  });

  it("does not starve a single town on the map", () => {
    // A smaller exporter's shed is drawn on by the same lanes; if it could not
    // keep up, the clients would go short and that is the one outcome this
    // change is not allowed to have.
    const w = runDays(makeWorld(), 400);
    const hungry = Object.keys(CITIES).filter(k => townHunger(w, k) > 0.05);
    expect(hungry).toEqual([]);
  });
});

describe("an event that stops the plantations empties the warehouse", () => {
  it("draws the shed down and takes the quote off the floor", () => {
    const settled = runDays(makeWorld(), 400);
    const day = settled.time.day;
    const before = settled.ports.havana.prices[STAPLE];
    const stockBefore = settled.ports.havana.inventory[STAPLE];

    const hit = runDays(
      { ...settled, worldEvents: [event("slave_revolt", "havana", day, 60)] }, 60,
    );
    expect(hit.ports.havana.inventory[STAPLE]).toBeLessThan(stockBefore * 0.5);
    expect(hit.ports.havana.prices[STAPLE]).toBeGreaterThan(before * 2);
  });

  it("walks down over a week rather than falling off a cliff", () => {
    // The shed loses at most a day's own production a day, so the captain who
    // is in the harbour when the news breaks sees the price climb, not jump.
    const settled = runDays(makeWorld(), 400);
    const day = settled.time.day;
    const world = { ...settled, worldEvents: [event("slave_revolt", "havana", day, 60)] };
    const afterOne = runDays(world, 1).ports.havana.inventory[STAPLE];
    const afterTen = runDays(world, 10).ports.havana.inventory[STAPLE];
    const start = settled.ports.havana.inventory[STAPLE];
    expect(afterOne).toBeGreaterThan(start * 0.85);
    expect(afterTen).toBeLessThan(start * 0.5);
  });

  it("fills the shed again when the plantations go back to work", () => {
    const settled = runDays(makeWorld(), 400);
    const day = settled.time.day;
    const during = runDays(
      { ...settled, worldEvents: [event("slave_revolt", "havana", day, 30)] }, 30,
    );
    const after = runDays({ ...during, worldEvents: [] }, 30);
    expect(after.ports.havana.inventory[STAPLE])
      .toBeCloseTo(settled.ports.havana.inventory[STAPLE], 0);
    expect(after.ports.havana.prices[STAPLE]).toBe(settled.ports.havana.prices[STAPLE]);
  });

  it("does not make the warehouse bigger when output goes up", () => {
    // A bumper harvest cannot enlarge a building. `harvest` and `trade_boom`
    // carry a `priceMul` of their own and that is where they are felt.
    const settled = runDays(makeWorld(), 400);
    const day = settled.time.day;
    const boom = runDays(
      { ...settled, worldEvents: [event("trade_boom", "havana", day, 60)] }, 60,
    );
    expect(boom.ports.havana.inventory[STAPLE])
      .toBeLessThanOrEqual(inventoryCap("havana", STAPLE) + 1e-6);
  });

  it("leaves a town with no event on it exactly where it was", () => {
    // The working ceiling is the shed's own whenever `productionMul` is one,
    // so the settled world cannot drift on account of this at all.
    const settled = runDays(makeWorld(), 400);
    const later = runDays(settled, 60);
    expect(later.ports.havana.inventory[STAPLE])
      .toBeCloseTo(settled.ports.havana.inventory[STAPLE], 6);
    expect(later.ports.havana.prices[STAPLE]).toBe(settled.ports.havana.prices[STAPLE]);
  });

  it("is felt at a producer with no lane client at all, which two thirds are", () => {
    // The case the old model could never reach: nothing leaves this quay but
    // what a captain carries off it, so the cap was the only thing deciding
    // the stock and `productionMul` had no way in.
    const settled = runDays(makeWorld(), 400);
    const day = settled.time.day;
    const item = CITIES.gran_granada.produces[0];
    const before = settled.ports.gran_granada.inventory[item];
    const hit = runDays(
      { ...settled, worldEvents: [event("slave_revolt", "gran_granada", day, 60)] }, 60,
    );
    expect(hit.ports.gran_granada.inventory[item]).toBeLessThan(before * 0.5);
  });
});

describe("the price model can see the shed move now", () => {
  it("quotes a full producer at the floor and an emptied one well above it", () => {
    const settled = runDays(makeWorld(), 400);
    const day = settled.time.day;
    const pop = settled.ports.havana.population;
    // A produced good is priced against a stand-in demand, because the town
    // eats none of it — which is why the cap has to sit near the knee of the
    // curve rather than four times past it.
    expect(baselineConsumptionRate("havana", STAPLE, pop)).toBe(0);

    const hit = runDays(
      { ...settled, worldEvents: [event("slave_revolt", "havana", day, 60)] }, 60,
    );
    expect(hit.ports.havana.prices[STAPLE] / settled.ports.havana.prices[STAPLE])
      .toBeGreaterThan(2);
  });
});

describe("the manual's sentence about the shed", () => {
  /**
   * The in-game manual said "market level × 50 of what it grows" for ten
   * releases after v0.75.0 made the shed eight days of the town's own output
   * — 250 tons in Havana on the page, 96 on the quay (v0.98.1). The range the
   * page quotes is computed here from the rule it describes.
   */
  it("quotes the range the rule actually produces", () => {
    const caps: number[] = [];
    for (const key of Object.keys(CITIES)) {
      for (const item of CITIES[key].produces) caps.push(Math.round(inventoryCap(key, item)));
    }
    const lo = Math.min(...caps), hi = Math.max(...caps);
    expect(PL["help.econ_prices_b2"]).toContain(`od ${lo} do ${hi} ton`);
    expect(EN["help.econ_prices_b2"]).toContain(`${lo} to ${hi} tons`);
    expect(PL["help.econ_prices_b2"]).not.toContain("× 50");
  });
});

describe("the manual's sentence about a famine", () => {
  /**
   * "Famine: carry food in at two to four times the price" was the one line of
   * the economy page the second reading (v0.98.1) could not settle from the
   * code, because the event only doubles the price and the rest comes from
   * the store it drains. Measured over a settled Caribbean, all 45 towns:
   * food costs 1.75-2.17x on the first day and 1.75-3.83x by the ninetieth;
   * the low end is a town that grows its own food (St Augustine), the high end
   * a large one that imports it (Havana). So the sentence is true, and this
   * is what keeps it true: the three ends of that range, read off the tick.
   */
  it("prices food at two to four times the settled price, and never past it", () => {
    const settled = runDays(makeWorld(), 400);
    const day = settled.time.day;
    for (const key of ["havana", "port_royal", "st_augustine"]) {
      const before = settled.ports[key].prices.food;
      let w: WorldState = { ...settled, worldEvents: [event("famine", key, day, 90)] };
      w = runDays(w, 1);
      const first = w.ports[key].prices.food / before;
      w = runDays(w, 88);
      const last = w.ports[key].prices.food / before;
      expect(first, `${key} day 1`).toBeGreaterThanOrEqual(1.75);
      expect(first, `${key} day 1`).toBeLessThanOrEqual(2.25);
      expect(last, `${key} day 89`).toBeGreaterThanOrEqual(first);
      expect(last, `${key} day 89`).toBeLessThanOrEqual(4);
    }
    expect(PL["help.econ_can_b"]).toContain("2–4×");
    expect(EN["help.econ_can_b"]).toContain("two to four times");
  });
});

describe("a producer's quote reads its shed, not its size (v0.99.4)", () => {
  /**
   * Measured before, on a settled world: 13 of 69 producer pairs on
   * `RATIO_MIN`, and the stand-in demand of thirty tons turned the ratio
   * upside down - Nombre de Dios cocoa 19 of 13, Rio de la Hacha tobacco 14
   * of 10, a small grower selling its own crop above the base.
   */
  const settled = runDays(makeWorld(), 400);
  const pairs = Object.keys(CITIES).flatMap(k =>
    CITIES[k].produces.filter(i => !CITIES[k].demands.includes(i)).map(i => [k, i] as const));

  it("asks at most the base for its own crop with the shed full", () => {
    const dear = pairs.filter(([k, i]) =>
      settled.ports[k].inventory[i] >= inventoryCap(k, i) - 0.5 &&
      settled.ports[k].prices[i] > getBasePrice(k, i));
    expect(dear).toEqual([]);
  });

  it("is off the floor, so the first tons bought move the quote", () => {
    const cap = inventoryCap("havana", STAPLE);
    const full = spotPrice("havana", STAPLE, cap, 1);
    const drawn = spotPrice("havana", STAPLE, cap - 30, 1);
    expect(drawn).toBeGreaterThan(full);
    expect(spotPrice("havana", STAPLE, cap, 1)).toBe(
      Math.round(getBasePrice("havana", STAPLE) * PRODUCER_FULL_RATIO * cap / (cap + 1)));
  });

  it("treats a big grower and a small one alike at a full shed", () => {
    const ratio = (k: string, i: string) =>
      spotPrice(k, i, inventoryCap(k, i), 1) / getBasePrice(k, i);
    expect(Math.abs(ratio("havana", "sugar_cane") - ratio("nombre_de_dios", "cocoa"))).toBeLessThan(0.1);
  });
});
