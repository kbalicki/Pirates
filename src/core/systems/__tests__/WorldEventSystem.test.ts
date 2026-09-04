import { describe, it, expect } from "vitest";
import { seedInitialEvents, updateWorldEvents, getPortNews } from "../WorldEventSystem.ts";
import { getAggregatedEffects, MAX_WEALTH_DELTA } from "../EventEffectsSystem.ts";
import { economyDailyTick } from "../EconomyTickSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { FACTIONS } from "../../data/factions.ts";
import { initPortPrices, initPortInventory } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId } from "../../model/ids.ts";
import { EN } from "../../i18n/locales/en.ts";
import type { WorldState, PortRuntimeState } from "../../model/WorldState.ts";

// ===========================================================================
// WorldEventSystem — the events have to land somewhere
// ===========================================================================

/**
 * This file exists because of one line, and the line was wrong for the whole
 * life of the module:
 *
 *     const port = allPorts[portR.value % allPorts.length];
 *
 * `rngNext` returns a float in [0,1), so the modulo gives the float straight
 * back and the lookup is `allPorts[0.37]` — `undefined`. Every event the world
 * ever created therefore had no port: the headline read "Spanish treasure fleet
 * preparing to sail from undefined", `ports` was `[undefined]` so no tavern
 * carried the news and `getAggregatedEffects` never matched, and the faction
 * fell through to "pirates" for all of them. Fifteen event types and ten
 * historical wars, and the random half of the living world moved nothing.
 *
 * It was found by reading a noticeboard in a screenshot. So the assertions here
 * are the dull ones nobody writes until they have been bitten: that a thing the
 * generator produced actually exists.
 */

function makePort(key: string): PortRuntimeState {
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
  };
}

function makeWorld(seed = 1): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  for (const key of Object.keys(CITIES)) ports[key] = makePort(key);
  return {
    version: 12,
    time: { day: 1, hour: 12, minute: 0, tick: 0 },
    rng: { seed, state: seed },
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
  } as unknown as WorldState;
}

describe("seedInitialEvents — the world starts with five things happening", () => {
  it("names a real port in every one of them", () => {
    const w = seedInitialEvents(makeWorld());
    expect(w.worldEvents.length).toBeGreaterThan(0);
    const names = new Set(Object.values(CITIES).map(c => c.name));
    for (const ev of w.worldEvents) {
      expect(ev.vars?.port, `${ev.id} has no port`).toBeDefined();
      expect(names.has(String(ev.vars!.port)), `${ev.id}: ${ev.vars!.port}`).toBe(true);
    }
  });

  it("names the crown that actually holds it, not always the pirates", () => {
    const w = seedInitialEvents(makeWorld());
    const crowns = new Set(w.worldEvents.map(ev => String(ev.vars?.faction)));
    const real = new Set(Object.values(FACTIONS).map(f => f.name));
    for (const crown of crowns) expect(real.has(crown), crown).toBe(true);
    // Five events all belonging to one faction was the signature of the bug.
    expect(crowns.size).toBeGreaterThan(1);
  });

  it("attaches every event to ports that exist", () => {
    const w = seedInitialEvents(makeWorld());
    for (const ev of w.worldEvents) {
      expect(ev.ports.length).toBeGreaterThan(0);
      for (const key of ev.ports) expect(CITIES[key], `${ev.id} -> ${key}`).toBeDefined();
    }
  });

  it("puts the news on the noticeboard of the town it happened in", () => {
    const w = seedInitialEvents(makeWorld());
    for (const ev of w.worldEvents) {
      const news = getPortNews(w, ev.ports[0]);
      expect(news.some(n => n.eventId === ev.id), `${ev.id} is nowhere`).toBe(true);
    }
  });

  it("actually reaches the economy of that town", () => {
    // The half of the bug with no visible symptom: with `ports: [undefined]`
    // nothing ever matched here, so fifteen event types modified nothing.
    const w = seedInitialEvents(makeWorld());
    const touched = w.worldEvents.some(ev => {
      const fx = getAggregatedEffects(w, ev.ports[0]);
      return fx.productionMul !== 1 || fx.consumptionMul !== 1 || fx.priceMul !== 1
        || fx.popDelta !== 0 || fx.wealthDelta !== 0 || fx.defenseDelta !== 0
        || fx.portClosed || fx.recoveryMul !== 1 || fx.importMul !== 1;
    });
    expect(touched).toBe(true);
  });

  it("fills every variable its headline asks for", () => {
    const w = seedInitialEvents(makeWorld());
    for (const ev of w.worldEvents) {
      const line = EN[ev.headline];
      expect(line, `${ev.headline} missing from en.ts`).toBeDefined();
      for (const name of line!.matchAll(/\{\{(\w+)\}\}/g)) {
        expect(ev.vars?.[name[1]], `${ev.headline} has no {{${name[1]}}}`).toBeDefined();
      }
    }
  });

  it("seeds once and only once", () => {
    const once = seedInitialEvents(makeWorld());
    expect(seedInitialEvents(once).worldEvents.length).toBe(once.worldEvents.length);
  });

  it("gives the same world the same five events", () => {
    const a = seedInitialEvents(makeWorld(7)).worldEvents.map(e => e.id);
    const b = seedInitialEvents(makeWorld(7)).worldEvents.map(e => e.id);
    expect(b).toEqual(a);
  });
});

describe("the events the world spawns as it runs", () => {
  /** A year of days, so the random roll has fired many times. */
  function runYear(seed: number): WorldState {
    let w = seedInitialEvents(makeWorld(seed));
    for (let d = 0; d < 365; d++) {
      w = { ...w, time: { ...w.time, day: w.time.day + 1 } };
      w = updateWorldEvents(w);
    }
    return w;
  }

  it("name real ports and real crowns, every one of them", () => {
    const w = runYear(3);
    const names = new Set(Object.values(CITIES).map(c => c.name));
    const crowns = new Set(Object.values(FACTIONS).map(f => f.name));
    let checked = 0;
    for (const ev of w.eventLog) {
      if (!ev.key.startsWith("news.")) continue;
      if (ev.vars?.port !== undefined) {
        expect(names.has(String(ev.vars.port)), `${ev.key}: ${ev.vars.port}`).toBe(true);
        checked++;
      }
      if (ev.vars?.faction !== undefined) {
        expect(crowns.has(String(ev.vars.faction)), `${ev.key}: ${ev.vars.faction}`).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("attach themselves to ports that exist", () => {
    for (const ev of runYear(11).worldEvents) {
      for (const key of ev.ports) expect(CITIES[key], `${ev.id} -> ${key}`).toBeDefined();
    }
  });

  it("spread over more than one town across a year", () => {
    // With the float-modulo bug every single one landed on `undefined`, so this
    // set had exactly one member — and it was not a town.
    const towns = new Set<string>();
    for (const ev of runYear(5).worldEvents) for (const key of ev.ports) towns.add(key);
    expect(towns.size).toBeGreaterThan(3);
  });
});


// ===========================================================================
// An event is a perturbation, not a new baseline (v0.28.0)
// ===========================================================================

/**
 * The other half of the same bug. With no event ever landing on a port, the
 * daily effect table had never been measured against a running economy — and it
 * had been written as though a point of `wealthDelta` a day were a small thing.
 * It is not: the pull toward baseline is 1% of the gap, so `d` a day settles the
 * town `d * 100` points away. A gold strike at +10 a day for a year was the
 * whole 0..1000 scale.
 *
 * Switched on unmeasured, the old table lifted the Caribbean's total wealth 39%
 * and pinned every rich Spanish colony on the clamp. These tests hold the two
 * rules that fixed it.
 */

describe("the balance of the event table", () => {
  const TYPES = [
    "epidemic", "pirate_raid", "trade_boom", "slave_revolt", "hurricane",
    "treasure_fleet", "new_governor", "war_start", "gold_discovery",
    "native_raid", "famine", "harvest", "royal_decree", "treaty_signed",
  ] as const;

  it("gives no single event more standing pressure than the ceiling", () => {
    for (const type of TYPES) {
      for (const severity of [1, 2, 3] as const) {
        const base = makeWorld();
        const w: WorldState = {
          ...base,
          worldEvents: [{
            id: `t_${type}`,
            type,
            startDay: 1,
            endDay: 999,
            ports: ["havana"],
            factions: ["spain"],
            severity,
            headline: "news.trade_boom",
            vars: {},
          }],
        } as unknown as WorldState;
        const fx = getAggregatedEffects(w, "havana");
        expect(Math.abs(fx.wealthDelta), `${type} sev ${severity}`)
          .toBeLessThanOrEqual(MAX_WEALTH_DELTA + 1e-9);
      }
    }
  });

  it("will not start a second event of the same type on the same town", () => {
    // The stacking that put four Spanish capitals on the clamp: three royal
    // decrees at once, each covering the same twenty-four ports.
    let w = seedInitialEvents(makeWorld(2));
    for (let d = 0; d < 365; d++) {
      w = { ...w, time: { ...w.time, day: w.time.day + 1 } };
      w = updateWorldEvents(w);
    }
    const live = w.worldEvents.filter(ev => ev.endDay >= w.time.day);
    for (const key of Object.keys(CITIES)) {
      const here = live.filter(ev => ev.ports.includes(key)).map(ev => ev.type);
      expect(new Set(here).size, `${key}: ${here.join(",")}`).toBe(here.length);
    }
  });

  it("leaves the Caribbean livelier without leaving it richer", () => {
    // Measured: a year of events moves the total by a few percent and settles
    // individual towns tens of points either way. The old table moved it 39%.
    function run(withEvents: boolean, seed: number): number {
      let w = withEvents ? seedInitialEvents(makeWorld(seed)) : makeWorld(seed);
      for (let d = 0; d < 365; d++) {
        w = { ...w, time: { ...w.time, day: w.time.day + 1 } };
        if (withEvents) w = updateWorldEvents(w);
        w = economyDailyTick(w);
      }
      return Object.values(w.ports).reduce((sum, p) => sum + p.wealth, 0);
    }
    const quiet = run(false, 1);
    for (const seed of [1, 3, 11]) {
      const lively = run(true, seed);
      expect(lively, `seed ${seed}`).toBeGreaterThan(quiet * 0.9);
      expect(lively, `seed ${seed}`).toBeLessThan(quiet * 1.1);
    }
  });
});
