import { describe, it, expect } from "vitest";
import {
  seedInitialEvents, seedHistoricalWars, updateWorldEvents, getPortNews,
  SEED_COUNT, NEWS_ON_A_BOARD,
} from "../WorldEventSystem.ts";
import { PORTS } from "../../data/ports.ts";
import { MUSTER_PORTS, musterPortFor } from "../TreasureFleetSystem.ts";
import {
  getAggregatedEffects,
  areFactionsAtWar,
  warSpawnMultipliers,
  warBite,
  MAX_WEALTH_DELTA,
  WAR_ADAPTATION_DAYS,
} from "../EventEffectsSystem.ts";
import { economyDailyTick } from "../EconomyTickSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { calendarToDay } from "../TimeSystem.ts";
import { ERAS } from "../../data/eras.ts";
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

function makeWorld(seed = 1, startYear = 1690): WorldState {
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
    startYear,
    gameSpeed: 1.2,
  } as unknown as WorldState;
}

/**
 * Run the event machine (only) forward, one day at a time.
 *
 * The day is advanced before each update, exactly as `WorldEngine` does it, so
 * `n` steps from a fresh world land on day `1 + n`.
 */
function runEventDays(world: WorldState, days: number): WorldState {
  let w = world;
  for (let d = 0; d < days; d++) {
    w = { ...w, time: { ...w.time, day: w.time.day + 1 } };
    w = updateWorldEvents(w);
  }
  return w;
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

describe("a seeded event obeys its own template", () => {
  // Ignored entirely until v0.46.0 — the same bug as `pickNeighbours` in
  // v0.45.0, one layer up: the seeder picked from every port on the map.
  it("puts a harvest only where something grows", () => {
    for (const seed of [1, 2, 3, 5, 8, 13, 21]) {
      for (const ev of seedInitialEvents(makeWorld(seed)).worldEvents) {
        if (ev.type !== "harvest") continue;
        for (const key of ev.ports) {
          const grows = PORTS[key]?.produces ?? [];
          expect(grows.includes("sugar_cane") || grows.includes("food"), `${ev.id}: ${key}`).toBe(true);
        }
      }
    }
  });

  it("musters a plate fleet in a silver port, and tells her which one", () => {
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34]) {
      for (const ev of seedInitialEvents(makeWorld(seed)).worldEvents) {
        if (ev.type !== "treasure_fleet") continue;
        const muster = ev.vars.muster as string;
        expect(MUSTER_PORTS, ev.id).toContain(muster);
        // Without the stamp the first plate fleet of every game is a headline
        // that never sails.
        expect(musterPortFor(ev), ev.id).toBe(muster);
      }
    }
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

  it("puts a multi-town event on towns near each other, not scattered over the map", () => {
    // Three bugs lived in the four lines this checks. The one that showed was
    // that a "nearby" port was drawn from EVERY port on the map: a hurricane
    // over Cartagena also struck Bermuda, two thousand units away.
    for (const seed of [3, 5, 11, 17]) {
      for (const ev of runYear(seed).worldEvents) {
        if (ev.ports.length < 2 || ev.ports.length > 3) continue;   // not a faction-wide one
        const first = CITIES[ev.ports[0]];
        if (!first) continue;
        for (const key of ev.ports.slice(1)) {
          const d = Math.hypot(CITIES[key].pos.x - first.pos.x, CITIES[key].pos.y - first.pos.y);
          expect(d, `${ev.id}: ${ev.ports[0]} -> ${key}`).toBeLessThanOrEqual(700);
        }
      }
    }
  });

  it("orders those towns outward from the first, which is what makes them a road", () => {
    // `WeatherFieldSystem.hurricaneTrack` walks this list in order. A list that
    // was not ordered would send a storm back and forth over the same water.
    for (const ev of runYear(7).worldEvents) {
      if (ev.ports.length < 3 || ev.ports.length > 3) continue;
      const first = CITIES[ev.ports[0]];
      if (!first) continue;
      const away = ev.ports.slice(1).map(k =>
        Math.hypot(CITIES[k].pos.x - first.pos.x, CITIES[k].pos.y - first.pos.y));
      for (let i = 1; i < away.length; i++) expect(away[i]).toBeGreaterThanOrEqual(away[i - 1]);
    }
  });

  it("spawns the same world twice from the same seed", () => {
    // `sort(() => 0.5 - Math.random())` was the one call to Math.random left
    // inside the deterministic world tick, so this could not have passed.
    const a = runYear(23);
    const b = runYear(23);
    expect(a.worldEvents.map(e => `${e.id}|${e.ports.join(",")}`))
      .toEqual(b.worldEvents.map(e => `${e.id}|${e.ports.join(",")}`));
  });

  it("keeps a filtered event inside its own filter, on every town it touches", () => {
    // `harvest` is restricted to towns that grow sugar or food. Its second town
    // used to be drawn from the unfiltered list, so it could land on neither.
    for (const seed of [3, 5, 11]) {
      for (const ev of runYear(seed).worldEvents) {
        if (ev.type !== "harvest") continue;
        for (const key of ev.ports) {
          const grows = PORTS[key]?.produces ?? [];
          expect(grows.includes("sugar_cane") || grows.includes("food"), `${ev.id}: ${key}`).toBe(true);
        }
      }
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

  /**
   * The claim is about the *table*, so it has to be measured over the table.
   *
   * This assertion used to be "three named seeds each land within 10% of a
   * quiet world", and it was green for twenty-five releases while being false:
   * measured over forty seeds the code it was guarding put three of them
   * outside that band and two outside fifteen. Seeds 1, 3 and 11 simply
   * happened to be three of the thirty-seven that fit — the same mistake as the
   * NPC tacking test in v0.53.0, which asserted at the one wind strength where
   * the bug was absent.
   *
   * A year of events is a *distribution*, and only two things about it are
   * worth pinning. The table must not be a pump — over enough years it adds
   * about as much as it takes, which is what `wealthDelta` read against
   * `RECOVERY_WEALTH` is supposed to mean. And no single year may run away: a
   * famine and an epidemic on the same rich coast is a bad year and should read
   * as one, but the Caribbean is not allowed to lose a quarter of itself to the
   * dice. Measured on the current table: mean -0.8%, median +2.0%, worst seed
   * in forty -19.3%.
   */
  it("leaves the Caribbean livelier without leaving it richer", { timeout: 60000 }, () => {
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
    const deviations: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      deviations.push((run(true, seed) / quiet - 1) * 100);
    }
    const mean = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    expect(Math.abs(mean), `mean ${mean.toFixed(1)}%`).toBeLessThan(5);
    for (let i = 0; i < deviations.length; i++) {
      expect(Math.abs(deviations[i]), `seed ${i + 1}: ${deviations[i].toFixed(1)}%`)
        .toBeLessThan(25);
    }
  });
});

// ===========================================================================
// The historical wars, and the peace that ends them (v0.30.0)
// ===========================================================================

/**
 * Two things were wrong and each hid the other.
 *
 * A war's `endDay` was `startDay + years * 365 + months * 30` against a
 * calendar with leap years in it, so `expireEvents` deleted the war a few days
 * before its own end date; the end-of-war branch only runs for a war it can
 * still see, so it never ran. And what that branch did was delete the event and
 * write a line in the log — which meant `treaty_signed`, a type with a headline
 * in two languages and a row in the effects table since v0.9.7, had never once
 * been produced by anything. Peace was the only thing in this world that
 * happened without happening anywhere.
 *
 * The War of Devolution (May 1667 - May 1668) is the shortest in the table and
 * the cheapest to run past.
 */
const DEVOLUTION_START = 121;   // 1 May 1667, counting from 1 January 1667
const DEVOLUTION_END = 487;     // 1 May 1668

describe("a war on the calendar", () => {
  it("starts on its own date and not before", () => {
    const before = runEventDays(makeWorld(1, 1667), DEVOLUTION_START - 2);  // day 120
    expect(before.worldEvents.some(ev => ev.id === "war_war_of_devolution")).toBe(false);
    const after = runEventDays(before, 2);
    expect(after.worldEvents.some(ev => ev.id === "war_war_of_devolution")).toBe(true);
  });

  it("survives to its own end date instead of evaporating a few days short", () => {
    const w = runEventDays(makeWorld(1, 1667), DEVOLUTION_END - 2);  // day 486
    const war = w.worldEvents.find(ev => ev.id === "war_war_of_devolution");
    expect(war).toBeDefined();
    expect(war!.endDay).toBe(DEVOLUTION_END);
  });

  it("is gone the day the peace is signed", () => {
    const w = runEventDays(makeWorld(1, 1667), DEVOLUTION_END - 1);  // day 487
    expect(w.worldEvents.some(ev => ev.id === "war_war_of_devolution")).toBe(false);
  });
});

describe("the peace that ends it", () => {
  const signed = () => runEventDays(makeWorld(1, 1667), DEVOLUTION_END - 1);

  it("puts a treaty in the world, which nothing in this game had ever done", () => {
    const treaty = signed().worldEvents.find(ev => ev.type === "treaty_signed");
    expect(treaty).toBeDefined();
    expect(treaty!.factions.sort()).toEqual(["france", "spain"]);
  });

  it("covers the towns of both crowns and nobody else's", () => {
    const treaty = signed().worldEvents.find(ev => ev.type === "treaty_signed")!;
    expect(treaty.ports.length).toBeGreaterThan(5);
    for (const key of treaty.ports) {
      expect(["france", "spain"], key).toContain(CITIES[key].factionId as unknown as string);
    }
  });

  it("reaches the effects table, whose treaty row had never run", () => {
    const w = signed();
    const port = w.worldEvents.find(ev => ev.type === "treaty_signed")!.ports[0];
    expect(getAggregatedEffects(w, port).importMul).toBeGreaterThan(1);
  });

  it("is news a tavern in either country can print", () => {
    const w = signed();
    const port = w.worldEvents.find(ev => ev.type === "treaty_signed")!.ports[0];
    const heard = getPortNews(w, port).map(n => n.headline);
    expect(heard).toContain("news.treaty_signed");
    expect(EN["news.treaty_signed"]).toBeTruthy();
  });

  it("lifts, because a treaty is a reopening and not a new normal", () => {
    const w = runEventDays(signed(), 90);
    expect(w.worldEvents.some(ev => ev.type === "treaty_signed")).toBe(false);
  });
});

// ===========================================================================
// The wars that were already being fought (v0.31.0)
// ===========================================================================

/**
 * `checkHistoricalWars` creates a war only on the exact day its start date comes
 * round — the right rule for a war that breaks out during a career and the wrong
 * one for the day the career begins. Three of the six eras open inside a war:
 * 1600 inside two, 1620 inside the Eighty Years' War, 1640 inside two. All three
 * opened in perfect peace.
 *
 * Seeding them is only safe because of the second half of this change. A war's
 * table row describes an *outbreak*, and applied flat to an eighty-year war it
 * took **39% off the wealth of the whole Caribbean** and held it there for
 * decades. `warBite` fades the trade multipliers over two years, so a war that
 * has been running since before the captain was born arrives with its bite
 * spent — and is still, in every other respect, a war.
 */
describe("seedHistoricalWars", () => {
  it("opens the 1620 era inside the Eighty Years' War", () => {
    const w = seedHistoricalWars(makeWorld(1, 1620));
    const wars = w.worldEvents.filter(ev => ev.type === "war_start");
    expect(wars.map(ev => ev.id)).toEqual(["war_eighty_years_war"]);
    expect(wars[0].factions.sort()).toEqual(["netherlands", "spain"]);
  });

  it("opens the 1600 and 1640 eras inside two wars each", () => {
    expect(seedHistoricalWars(makeWorld(1, 1600)).worldEvents).toHaveLength(2);
    expect(seedHistoricalWars(makeWorld(1, 1640)).worldEvents).toHaveLength(2);
  });

  it("leaves the years of peace at peace", () => {
    for (const year of [1560, 1660, 1680]) {
      expect(seedHistoricalWars(makeWorld(1, year)).worldEvents, `${year}`).toEqual([]);
    }
  });

  it("dates the outbreak where it actually happened, decades before day 1", () => {
    const war = seedHistoricalWars(makeWorld(1, 1620)).worldEvents[0];
    // May 1568 to January 1620 — a little over 51 years.
    expect(war.startDay).toBeLessThan(0);
    expect(-war.startDay / 365).toBeGreaterThan(51);
    expect(-war.startDay / 365).toBeLessThan(52);
  });

  it("ends it on its own calendar date, not a day sooner", () => {
    const war = seedHistoricalWars(makeWorld(1, 1620)).worldEvents[0];
    // 1 January 1648, counting from 1 January 1620.
    expect(war.endDay).toBe(calendarToDay(1648, 1, 1, 1620));
  });

  it("puts it on the news board, because the captain has to hear of it somewhere", () => {
    const w = seedHistoricalWars(makeWorld(1, 1620));
    // Not "War declared!" — that is a lie about a war fifty-two years old.
    expect(w.eventLog.some(e => e.key === "news.war_ongoing")).toBe(true);
    expect(w.eventLog.some(e => e.key === "news.war_start")).toBe(false);
    expect(EN["news.war_ongoing"]).toContain("{{since}}");
    expect(w.worldEvents[0].vars.since).toBe(1568);
  });

  it("is a war in every sense the rest of the game asks about", () => {
    const w = seedHistoricalWars(makeWorld(1, 1620));
    expect(areFactionsAtWar(w, "spain", "netherlands")).toBe(true);
    expect(warSpawnMultipliers(w).spain).toBe(2);
  });

  it("but has no bite left in it, so the towns keep their baselines", () => {
    const w = seedHistoricalWars(makeWorld(1, 1620));
    const spanish = Object.keys(w.ports).find(k => CITIES[k].factionId as unknown as string === "spain")!;
    const effects = getAggregatedEffects(w, spanish);
    expect(effects.importMul).toBeCloseTo(1, 5);
    expect(effects.productionMul).toBeCloseTo(1, 5);
  });
});

describe("warBite — a war hurts trade worst when it breaks out", () => {
  it("is whole on the day war is declared", () => {
    expect(warBite(100, 100)).toBe(1);
  });

  it("is spent once trade has had two years to work round it", () => {
    expect(warBite(1, 1 + WAR_ADAPTATION_DAYS)).toBe(0);
    expect(warBite(1, 1 + WAR_ADAPTATION_DAYS * 3)).toBe(0);
  });

  it("halves in a year", () => {
    expect(warBite(1, 1 + WAR_ADAPTATION_DAYS / 2)).toBeCloseTo(0.5, 5);
  });

  it("cuts imports hard at the outbreak and lets them back afterwards", () => {
    let w = makeWorld(1, 1690);
    const war = {
      id: "war_test", type: "war_start" as const, startDay: 1, endDay: 4000,
      ports: [], factions: ["spain", "england"], severity: 3 as const,
      headline: "news.war_start", vars: {},
    };
    w = { ...w, worldEvents: [war] };
    const spanish = Object.keys(w.ports).find(k => CITIES[k].factionId as unknown as string === "spain")!;
    const at = (day: number) =>
      getAggregatedEffects({ ...w, time: { ...w.time, day } }, spanish).importMul;
    expect(at(1)).toBeCloseTo(0.7, 5);
    expect(at(1 + WAR_ADAPTATION_DAYS / 2)).toBeCloseTo(0.85, 5);
    expect(at(1 + WAR_ADAPTATION_DAYS)).toBeCloseTo(1, 5);
  });

  it("does not touch a town of a crown that is not in it", () => {
    let w = makeWorld(1, 1690);
    w = { ...w, worldEvents: [{
      id: "war_test", type: "war_start", startDay: 1, endDay: 4000,
      ports: [], factions: ["england", "netherlands"], severity: 3,
      headline: "news.war_start", vars: {},
    }] };
    const french = Object.keys(w.ports).find(k => CITIES[k].factionId as unknown as string === "france")!;
    expect(getAggregatedEffects(w, french).importMul).toBe(1);
  });
});

describe("the measurement that decided the shape of this", () => {
  /**
   * The guard that caught it. Seeding the wars with the flat bite the table used
   * to apply put every era that opens inside one 20-40% below the era that does
   * not — silently, for decades of game time, decided by nothing but which era
   * the player picked off the character screen.
   *
   * A year is enough: the divergence was visible inside four hundred days.
   */
  it("leaves an era that opens inside a war as rich as one that does not", () => {
    const YEAR_DAYS = 400;
    function settle(startYear: number, seedWars: boolean): number {
      let w = makeWorld(5, startYear);
      if (seedWars) w = seedHistoricalWars(w);
      for (let d = 0; d < YEAR_DAYS; d++) {
        w = { ...w, time: { ...w.time, day: w.time.day + 1 } };
        w = updateWorldEvents(w);
        w = economyDailyTick(w);
      }
      return Object.values(w.ports).reduce((sum, p) => sum + p.wealth, 0);
    }
    // 1600 and 1640 open inside two wars each, 1620 inside one.
    for (const year of [1600, 1620, 1640]) {
      const quiet = settle(year, false);
      const atWar = settle(year, true);
      expect(atWar / quiet, `era ${year}`).toBeGreaterThan(0.95);
      expect(atWar / quiet, `era ${year}`).toBeLessThan(1.05);
    }
  });
});


// ===========================================================================
// The world's first day (v0.57.0)
//
// `seedInitialEvents` was a second reading of `RANDOM_EVENTS`, written before
// the daily roller had grown most of its rules and never brought back into
// line with it. Every assertion below is one of the five ways the two had
// drifted apart, and each was measured over four thousand worlds before a line
// was changed. They pass now because both functions go through `rollOneEvent`;
// they are here so that a sixth reading of the table never gets written.
// ===========================================================================

describe("the world's first day", () => {
  function seeded(seed: number, startYear = 1690): WorldState {
    return seedInitialEvents(makeWorld(seed, startYear));
  }

  /**
   * The one that cost the most, and the one no amount of reading
   * `seedInitialEvents` would have found: it is not a bug in that function at
   * all, it is a bug in the sentence `worldEvents.length > 0`.
   *
   * That guard means "already seeded" only while nothing else can put an event
   * in the list first. v0.31.0 put `seedHistoricalWars` in front of it, and in
   * the three eras that open *inside* a war — 1600, 1620, 1640 — the list was
   * never empty on the line above, so the function returned at once and the
   * world opened with no living events whatsoever. Measured: 0 of 5, in half
   * the eras in the game, for twenty-five releases.
   */
  it("stocks every era, including the three that open inside a war", () => {
    for (const key of Object.keys(ERAS)) {
      const era = ERAS[key];
      const wars = seedHistoricalWars(makeWorld(7, era.startYear));
      const full = seedInitialEvents(wars);
      const added = full.worldEvents.length - wars.worldEvents.length;
      expect(added, key + " (" + era.startYear + ")").toBeGreaterThan(0);
      // And the wars it found standing there are still standing afterwards.
      for (const war of wars.worldEvents) {
        expect(full.worldEvents.some(ev => ev.id === war.id), key + ": " + war.id).toBe(true);
      }
    }
  });

  it("does not hand out a second helping when called twice", () => {
    const once = seeded(3);
    const twice = seedInitialEvents(once);
    expect(twice.worldEvents.length).toBe(once.worldEvents.length);
  });

  it("opens the world with events, and not more than it was asked for", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = seeded(seed);
      expect(w.worldEvents.length, "seed " + seed).toBeGreaterThan(0);
      expect(w.worldEvents.length, "seed " + seed).toBeLessThanOrEqual(SEED_COUNT);
    }
  });

  /**
   * Every game in this project opens on 1 January, and the seed never looked at
   * `seasonal`. A hurricane (Jun-Nov) or a harvest (Sep-Nov) therefore stood on
   * the noticeboard in the dead of winter on **16.5%** of all seeded events,
   * measured over four thousand worlds.
   */
  it("does not open a January world with a hurricane or a harvest", () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const ev of seeded(seed).worldEvents) {
        expect(["hurricane", "harvest"], "seed " + seed).not.toContain(ev.type);
      }
    }
  });

  /**
   * The seed picked `RANDOM_EVENTS[floor(r * length)]` — every template equally
   * likely, whatever its `weight`. Measured over four thousand worlds: a pirate
   * raid, the commonest thing in the table at weight 5, came up at 0.47x the
   * rate the table asks for, while a slave revolt at weight 1 came up 2.41x too
   * often. Day one was the one day in the game on which the rare things were
   * the likely ones.
   */
  it("reads the weights the table was written with", () => {
    const seen: Record<string, number> = {};
    let total = 0;
    for (let seed = 1; seed <= 600; seed++) {
      for (const ev of seeded(seed).worldEvents) {
        seen[ev.type] = (seen[ev.type] ?? 0) + 1;
        total++;
      }
    }
    // Weight 5 against weight 1: an ordering, not a tuned ratio.
    expect(seen.pirate_raid ?? 0).toBeGreaterThan((seen.slave_revolt ?? 0) * 2);
    expect(seen.trade_boom ?? 0).toBeGreaterThan((seen.famine ?? 0) * 2);
    // And the commonest template takes a share of the whole that a flat pick
    // over twelve templates could not produce.
    expect((seen.pirate_raid ?? 0) / total).toBeGreaterThan(0.15);
  });

  /**
   * `affectsPorts: 0` means "every port of the crown this fell on". The seed
   * wrote `factionId === "spain"` flat, so a **French** royal decree was laid on
   * all twenty-four Spanish colonies with France's name in the headline — 44.7%
   * of every decree the game ever opened with, and up to a year of somebody
   * else's `priceMul: 1.2` on the Spanish Main.
   */
  it("lays a crown-wide event on the crown it fell on", () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const ev of seeded(seed).worldEvents) {
        if (ev.ports.length <= 1) continue;
        const crown = ev.factions[0];
        // The plate fleet is Spanish by construction; it is the one exception
        // the roller makes and it makes it deliberately.
        if (ev.type === "treasure_fleet") {
          expect(crown, "seed " + seed).toBe("spain");
          continue;
        }
        if (ev.type !== "royal_decree") continue;
        for (const key of ev.ports) {
          expect(PORTS[key].factionId, "seed " + seed + ": " + ev.id).toBe(crown);
        }
      }
    }
  });

  /**
   * `affectsPorts` above 1 asks for neighbours; the seed wrote `[port]` and
   * nothing else. Measured: **every** seeded multi-port event in four thousand
   * worlds — 3300 of 3300 — covered exactly one town. A hurricane over three
   * harbours had been a hurricane over one since the table was written.
   */
  it("gives a multi-town event its neighbours", () => {
    // Out of season in January, so reach one the way the roller does: run the
    // world into the hurricane season and take the first storm off the board.
    let w = seedInitialEvents(makeWorld(4));
    let found = 0;
    for (let d = 0; d < 900 && found === 0; d++) {
      w = { ...w, time: { ...w.time, day: w.time.day + 1 } };
      w = updateWorldEvents(w);
      const storm = w.worldEvents.find(ev => ev.type === "hurricane");
      if (storm) {
        expect(storm.ports.length).toBeGreaterThan(1);
        found++;
      }
    }
    expect(found, "no hurricane in two and a half years").toBe(1);
  });

  /**
   * The roller refuses to put two of a type on one town; the seed had no such
   * rule, because it had no idea what it had already placed — it built all five
   * of its events against the same untouched world. Appending as it goes is
   * what fixed that, and it is the reason `rollOneEvent` takes a world rather
   * than a list of events.
   */
  it("never opens a town with two of the same thing", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const w = seeded(seed);
      for (const key of Object.keys(CITIES)) {
        const here = w.worldEvents.filter(ev => ev.ports.includes(key)).map(ev => ev.type);
        expect(new Set(here).size, "seed " + seed + " " + key + ": " + here.join(",")).toBe(here.length);
      }
    }
  });

  it("names a port that exists, on every event it opens with", () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const ev of seeded(seed).worldEvents) {
        expect(ev.ports.length, "seed " + seed + ": " + ev.id).toBeGreaterThan(0);
        for (const key of ev.ports) expect(PORTS[key], "seed " + seed + ": " + key).toBeDefined();
        expect(typeof ev.vars.mainPort, "seed " + seed + ": " + ev.id).toBe("string");
        expect(PORTS[ev.vars.mainPort as string]).toBeDefined();
      }
    }
  });
});


// ===========================================================================
// The noticeboard is a board, not a stack (v0.57.0)
// ===========================================================================

describe("what the town has to say", () => {
  function boardWorld(): WorldState {
    const w = makeWorld(1);
    const crownWide = (i: number) => ({
      id: "decree_" + i,
      type: "royal_decree" as const,
      startDay: 100 + i,          // the newest arrivals
      endDay: 400,
      ports: Object.keys(CITIES).filter(k => CITIES[k].factionId === "spain"),
      factions: ["spain"],
      severity: 1 as const,
      headline: "news.royal_decree",
      vars: {},
    });
    const ownNews = {
      id: "siege_here",
      type: "pirate_raid" as const,
      startDay: 2,                // the oldest thing on the list
      endDay: 400,
      ports: ["havana"],
      factions: ["spain"],
      severity: 1 as const,
      headline: "news.pirate_raid",
      vars: {},
    };
    return {
      ...w,
      time: { ...w.time, day: 120 },
      // Deliberately in the order that used to break it: the town's own news
      // added first, then more crown-wide events than the board can hold.
      worldEvents: [ownNews, ...[0, 1, 2, 3, 4, 5].map(crownWide)],
    } as unknown as WorldState;
  }

  /**
   * `active.slice(-5)` took the five events added to `worldEvents` most
   * recently — an arrival order, which is a fact about the array and not about
   * the town. Measured over three seeds, ten years, every seventh day, all
   * forty-five towns: 11.1% of town-days have more than five live events, and
   * on 0.7% of them the town's own news was the thing pushed off.
   */
  it("never drops the town's own news for somebody else's decree", () => {
    const heard = getPortNews(boardWorld(), "havana").map(n => n.eventId);
    expect(heard.length).toBe(NEWS_ON_A_BOARD);
    expect(heard[0]).toBe("siege_here");
  });

  it("reads from the top: newest first inside each group", () => {
    const heard = getPortNews(boardWorld(), "havana").map(n => n.eventId);
    expect(heard.slice(1)).toEqual(["decree_5", "decree_4", "decree_3", "decree_2"]);
  });

  /**
   * `ports: []` is the faction-scale convention — a war, a treaty, an alliance
   * (v0.55.0) — and it means "every board there is". It must still reach this
   * one; it just does not get to stand above the harbour it is standing in.
   */
  it("puts a war below the harbour it is read in, and still carries it", () => {
    const w = boardWorld();
    const withWar = {
      ...w,
      worldEvents: [
        ...w.worldEvents.filter(ev => ev.id === "siege_here" || ev.id === "decree_5"),
        {
          id: "war_here", type: "war_start" as const, startDay: 119, endDay: 400,
          ports: [], factions: ["spain", "england"], severity: 3 as const,
          headline: "news.war_start", vars: {},
        },
      ],
    } as unknown as WorldState;
    const heard = getPortNews(withWar, "havana").map(n => n.eventId);
    expect(heard).toEqual(["siege_here", "decree_5", "war_here"]);
  });

  it("carries a crown-wide event to a town that has nothing of its own", () => {
    const w = boardWorld();
    const heard = getPortNews(w, "havana").map(n => n.eventId);
    const quiet = getPortNews(
      { ...w, worldEvents: w.worldEvents.filter(ev => ev.id !== "siege_here") } as WorldState,
      "havana",
    ).map(n => n.eventId);
    expect(heard).toContain("decree_5");
    expect(quiet.length).toBe(NEWS_ON_A_BOARD);
    expect(quiet).not.toContain("siege_here");
  });
});
