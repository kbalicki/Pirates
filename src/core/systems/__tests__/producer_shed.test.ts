import { describe, it, expect } from "vitest";
import { economyDailyTick, townHunger } from "../EconomyTickSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { initPortPrices, initPortInventory } from "../../data/prices.ts";
import {
  getPortBaseline, baselineProductionRate, baselineConsumptionRate,
  inventoryCap, PRODUCER_COVER_DAYS, IMPORT_COVER_DAYS,
} from "../../data/economyBaselines.ts";
import { portId, entityId } from "../../model/ids.ts";
import type { WorldState, WorldEventState, PortRuntimeState } from "../../model/WorldState.ts";

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
    // The floor is not the defect — a full shed *should* be at the floor. The
    // defect was that nothing could ever leave it. Havana sugar is still three
    // gold on its own quay, which is what the whole trade loop is built on.
    const w = runDays(makeWorld(), 400);
    expect(w.ports.havana.prices[STAPLE]).toBe(3);
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
