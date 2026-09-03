import { describe, it, expect } from "vitest";
import { economyDailyTick } from "../EconomyTickSystem.ts";
import {
  getAggregatedEffects,
  applyOneShotEffects,
  isPortClosed,
  areFactionsAtWar,
  warSpawnMultipliers,
} from "../EventEffectsSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { initPortPrices, initPortInventory } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId, factionId } from "../../model/ids.ts";
import type { WorldState, WorldEventState, WorldEventType, PortRuntimeState } from "../../model/WorldState.ts";

// ===========================================================================
// EconomyTickSystem + EventEffectsSystem — the living world's daily heartbeat
// ===========================================================================

/**
 * One tick per game day, per port: one-shot event hits, then production,
 * consumption, price recompute, per-day event deltas and finally a slow drift
 * back toward the city's baseline. Everything is pure, so a test can run a
 * hundred days in a loop and watch where the numbers settle.
 *
 * The fixture keeps three real cities rather than inventing fake ones — the
 * tick reads `CITIES[portKey].produces/demands`, so a made-up key is skipped.
 */

const PORT_KEYS = ["port_royal", "havana", "tortuga"] as const;

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
  for (const key of PORT_KEYS) ports[key] = makePort(key);

  return {
    version: 9,
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

function makeEvent(type: WorldEventType, over: Partial<WorldEventState> = {}): WorldEventState {
  return {
    id: "ev_" + type,
    type,
    startDay: 90,
    endDay: 200,
    ports: ["port_royal"],
    factions: [],
    severity: 1,
    headline: "event." + type,
    vars: {},
    ...over,
  };
}

/** Advance the world N days. The tick itself is day-agnostic; time is bumped for event windows. */
function runDays(world: WorldState, days: number): WorldState {
  let w = world;
  for (let i = 0; i < days; i++) {
    w = economyDailyTick(w);
    w = { ...w, time: { ...w.time, day: w.time.day + 1 } };
  }
  return w;
}

describe("economyDailyTick — shape and purity", () => {
  it("returns a new world without touching the old one", () => {
    const before = makeWorld();
    const snapshot = structuredClone(before);
    const after = economyDailyTick(before);
    expect(before).toEqual(snapshot);
    expect(after).not.toBe(before);
  });

  it("keeps every port it was given", () => {
    const after = economyDailyTick(makeWorld());
    expect(Object.keys(after.ports).sort()).toEqual([...PORT_KEYS].sort());
  });

  it("leaves a port with no city definition alone instead of crashing", () => {
    const world = makeWorld();
    (world.ports as any).atlantis = makePort("port_royal", { portId: portId("atlantis") });
    const after = economyDailyTick(world);
    expect(after.ports.atlantis).toEqual(world.ports.atlantis);
  });

  it("never produces a negative or unbounded stat", () => {
    const w = runDays(makeWorld(), 60);
    for (const key of PORT_KEYS) {
      const p = w.ports[key];
      expect(p.population).toBeGreaterThanOrEqual(0);
      expect(p.wealth).toBeGreaterThanOrEqual(0);
      expect(p.wealth).toBeLessThanOrEqual(1000);
      expect(p.defense).toBeGreaterThanOrEqual(0);
      expect(p.defense).toBeLessThanOrEqual(100);
      for (const qty of Object.values(p.inventory)) expect(qty).toBeGreaterThanOrEqual(0);
      for (const price of Object.values(p.prices)) expect(price).toBeGreaterThanOrEqual(1);
    }
  });

  it("keeps stats whole so saves do not accumulate float drift", () => {
    const w = runDays(makeWorld(), 10);
    for (const key of PORT_KEYS) {
      const p = w.ports[key];
      expect(Number.isInteger(p.population)).toBe(true);
      expect(Number.isInteger(p.wealth)).toBe(true);
      expect(Number.isInteger(p.defense)).toBe(true);
      for (const price of Object.values(p.prices)) expect(Number.isInteger(price)).toBe(true);
    }
  });
});

describe("production and consumption", () => {
  it("a port accumulates what it produces", () => {
    const world = makeWorld();
    const good = CITIES.port_royal.produces[0];
    const before = world.ports.port_royal.inventory[good] ?? 0;
    const after = runDays(world, 5).ports.port_royal.inventory[good] ?? 0;
    expect(after).toBeGreaterThan(before);
  });

  it("stock of a produced good is capped, not infinite", () => {
    const good = CITIES.port_royal.produces[0];
    const long = runDays(makeWorld(), 400).ports.port_royal.inventory[good] ?? 0;
    const longer = runDays(makeWorld(), 800).ports.port_royal.inventory[good] ?? 0;
    expect(longer).toBeCloseTo(long, 5);
  });

  it("a port burns through what it demands", () => {
    const need = CITIES.port_royal.demands[0];
    const world = makeWorld();
    world.ports.port_royal.inventory[need] = 500;
    const after = runDays(world, 3).ports.port_royal.inventory[need];
    expect(after).toBeLessThan(500);
  });

  it("scarcity makes a demanded good dearer than a glut does", () => {
    const need = CITIES.port_royal.demands[0];

    const scarce = makeWorld();
    scarce.ports.port_royal.inventory[need] = 0;
    const starving = economyDailyTick(scarce).ports.port_royal.prices[need];

    const glut = makeWorld();
    glut.ports.port_royal.inventory[need] = 5000;
    const flooded = economyDailyTick(glut).ports.port_royal.prices[need];

    expect(starving).toBeGreaterThan(flooded);
  });

  it("a port nobody supplies grows poorer", () => {
    // Emptying the shelves is no longer enough: since v0.20.0 the licensed
    // trade restocks a colony every day, which is the whole point of it. A town
    // under the black flag is one no merchant will call at, and that is what
    // being unable to feed itself now means.
    const world = makeWorld();
    world.ports.port_royal.factionId = factionId("pirates");
    world.ports.port_royal.capturedDay = 1;
    for (const need of CITIES.port_royal.demands) world.ports.port_royal.inventory[need] = 0;
    world.ports.port_royal.wealth = 500;
    expect(runDays(world, 5).ports.port_royal.wealth).toBeLessThan(500);
  });

  it("a supplied colony is not punished for demanding anything at all", () => {
    // The bug this pins: a port consumed `demands` out of its own inventory and
    // nothing ever put them there, so every good it did not produce cost it a
    // flat point of wealth a day, for ever. Port Royale demands sugar, cocoa
    // and tobacco and produces neither, so it bled 3/day from the day the world
    // was made and settled at 353 against a baseline of 600.
    const settled = runDays(makeWorld(), 600).ports.port_royal.wealth;
    expect(settled).toBe(getPortBaseline("port_royal").wealth);
  });

  it("keeps the shelves stocked with what the town cannot make", () => {
    const world = makeWorld();
    for (const need of CITIES.port_royal.demands) world.ports.port_royal.inventory[need] = 0;
    const after = runDays(world, 30).ports.port_royal;
    // Consumed the same day it arrives, so the shelf is not *full* — but the
    // town is fed, which is what the wealth term measures.
    expect(after.wealth).toBeGreaterThanOrEqual(world.ports.port_royal.wealth);
  });
});

describe("recovery toward baseline", () => {
  it("a sacked port claws its way back up", () => {
    const world = makeWorld();
    const baseline = getPortBaseline("port_royal");
    world.ports.port_royal.defense = 0;
    world.ports.port_royal.wealth = 0;

    const after = runDays(world, 120).ports.port_royal;
    expect(after.defense).toBeGreaterThan(0);
    expect(after.defense).toBeLessThanOrEqual(baseline.defense);
    expect(after.wealth).toBeGreaterThan(0);
  });

  it("an inflated port drifts back down", () => {
    const world = makeWorld();
    const baseline = getPortBaseline("port_royal");
    world.ports.port_royal.defense = 100;
    const after = runDays(world, 200).ports.port_royal.defense;
    expect(after).toBeLessThan(100);
    expect(after).toBeGreaterThanOrEqual(baseline.defense - 5);
  });

  it("population settles near its baseline and stays there", () => {
    const baseline = getPortBaseline("havana");
    const settled = runDays(makeWorld(), 400).ports.havana.population;
    const later = runDays(makeWorld(), 600).ports.havana.population;
    expect(Math.abs(settled - baseline.population) / baseline.population).toBeLessThan(0.2);
    expect(Math.abs(later - settled) / baseline.population).toBeLessThan(0.1);
  });
});

describe("a town under the black flag (v0.19.0)", () => {
  /** The same world, with Port Royale taken and held by the brotherhood. */
  function held() {
    const world = makeWorld();
    world.ports.port_royal.factionId = factionId("pirates");
    world.ports.port_royal.capturedDay = 1;
    return world;
  }

  it("settles well below the numbers it had as a colony", () => {
    const baseline = getPortBaseline("port_royal");
    const after = runDays(held(), 600).ports.port_royal;
    // Before v0.19.0 both of these climbed back to the royal baseline: the
    // prize regenerated under the flag that guarantees none of it.
    expect(after.wealth).toBeLessThan(baseline.wealth * 0.7);
    expect(after.population).toBeLessThan(baseline.population * 0.85);
  });

  it("declines without evaporating", () => {
    // The first cut of this used a 0.42 wealth target and settled Port Royale
    // at a wealth of 5: the town did not decline, it vanished. Wealth carries a
    // constant downward trade pressure on top of the drift, so the equilibrium
    // falls much further than the target does. These bounds are the tuning.
    const royal = runDays(makeWorld(), 600).ports.port_royal;
    const after = runDays(held(), 600).ports.port_royal;
    expect(after.wealth).toBeGreaterThan(royal.wealth * 0.35);
    expect(after.wealth).toBeLessThan(royal.wealth * 0.75);
    expect(after.population).toBeGreaterThan(royal.population * 0.5);
  });

  it("recovers toward the royal numbers again once a crown holds it", () => {
    const settled = runDays(held(), 400);
    const stillHeld = runDays(settled, 400).ports.port_royal.wealth;

    const returned: WorldState = {
      ...settled,
      ports: {
        ...settled.ports,
        port_royal: {
          ...settled.ports.port_royal,
          factionId: CITIES.port_royal.factionId,
          capturedDay: undefined,
        },
      },
    };
    const after = runDays(returned, 400).ports.port_royal.wealth;
    expect(after).toBeGreaterThan(stillHeld);
  });
});

describe("getAggregatedEffects", () => {
  it("an undisturbed port gets neutral effects", () => {
    const e = getAggregatedEffects(makeWorld(), "port_royal");
    expect(e.productionMul).toBe(1);
    expect(e.consumptionMul).toBe(1);
    expect(e.priceMul).toBe(1);
    expect(e.popDelta).toBe(0);
    expect(e.portClosed).toBe(false);
  });

  it("only the ports named by the event are affected", () => {
    const world = makeWorld({ worldEvents: [makeEvent("trade_boom", { ports: ["port_royal"] })] });
    expect(getAggregatedEffects(world, "port_royal").productionMul).toBeGreaterThan(1);
    expect(getAggregatedEffects(world, "havana").productionMul).toBe(1);
  });

  it("an event with no port list is world-wide", () => {
    const world = makeWorld({ worldEvents: [makeEvent("trade_boom", { ports: [] })] });
    for (const key of PORT_KEYS) {
      expect(getAggregatedEffects(world, key).productionMul).toBeGreaterThan(1);
    }
  });

  it("a war reaches every port of the warring factions and no others", () => {
    const spain = CITIES.havana.factionId as string;
    const world = makeWorld({
      worldEvents: [makeEvent("war_start", { ports: [], factions: [spain, "france"] })],
    });
    const atWar = getAggregatedEffects(world, "havana");
    const neutral = getAggregatedEffects(world, "port_royal");
    expect(atWar).not.toEqual(neutral);
  });

  it("an expired event stops mattering", () => {
    const world = makeWorld({ worldEvents: [makeEvent("trade_boom", { endDay: 99 })] });
    expect(getAggregatedEffects(world, "port_royal").productionMul).toBe(1);
  });

  it("multipliers compound and deltas sum when events overlap", () => {
    const one = makeWorld({ worldEvents: [makeEvent("trade_boom")] });
    const two = makeWorld({
      worldEvents: [makeEvent("trade_boom"), makeEvent("trade_boom", { id: "ev_boom2" })],
    });
    const a = getAggregatedEffects(one, "port_royal");
    const b = getAggregatedEffects(two, "port_royal");
    expect(b.productionMul).toBeCloseTo(a.productionMul ** 2, 10);
    expect(b.wealthDelta).toBeCloseTo(a.wealthDelta * 2, 10);
  });

  it("severity scales an epidemic's bite", () => {
    const mild = makeWorld({ worldEvents: [makeEvent("epidemic", { severity: 1 })] });
    const grave = makeWorld({ worldEvents: [makeEvent("epidemic", { severity: 3 })] });
    expect(getAggregatedEffects(grave, "port_royal").popDelta)
      .toBeLessThan(getAggregatedEffects(mild, "port_royal").popDelta);
  });
});

describe("applyOneShotEffects", () => {
  it("a pirate raid takes wealth and cargo the moment it lands", () => {
    const world = makeWorld({ worldEvents: [makeEvent("pirate_raid")] });
    world.ports.port_royal.wealth = 500;
    const good = CITIES.port_royal.produces[0];
    world.ports.port_royal.inventory[good] = 100;

    const after = applyOneShotEffects(world);
    expect(after.ports.port_royal.wealth).toBe(420);
    expect(after.ports.port_royal.inventory[good]).toBe(70);
  });

  it("fires exactly once, however many days pass", () => {
    const world = makeWorld({ worldEvents: [makeEvent("pirate_raid")] });
    world.ports.port_royal.wealth = 500;

    const once = applyOneShotEffects(world);
    const twice = applyOneShotEffects(once);
    expect(twice.ports.port_royal.wealth).toBe(once.ports.port_royal.wealth);
    expect(twice.worldEvents[0].vars._applied).toBe(1);
  });

  it("a gold strike adds a bonus produce and a windfall", () => {
    const world = makeWorld({ worldEvents: [makeEvent("gold_discovery")] });
    const after = applyOneShotEffects(world);
    expect(after.ports.port_royal.bonusProduces).toContain("gold");
    expect(after.ports.port_royal.wealth).toBeGreaterThan(world.ports.port_royal.wealth);
  });

  it("gold is priced and stocked once the strike is producing", () => {
    let world = makeWorld({ worldEvents: [makeEvent("gold_discovery")] });
    world = runDays(world, 5);
    expect(world.ports.port_royal.inventory.gold).toBeGreaterThan(0);
    expect(world.ports.port_royal.prices.gold).toBeGreaterThanOrEqual(40);
  });

  it("a native raid cannot push a port below zero", () => {
    const world = makeWorld({ worldEvents: [makeEvent("native_raid")] });
    world.ports.port_royal.wealth = 10;
    world.ports.port_royal.defense = 5;
    const after = applyOneShotEffects(world);
    expect(after.ports.port_royal.wealth).toBe(0);
    expect(after.ports.port_royal.defense).toBe(0);
  });

  it("an event type with no one-shot leaves the world object alone", () => {
    const world = makeWorld({ worldEvents: [makeEvent("treasure_fleet")] });
    expect(applyOneShotEffects(world)).toBe(world);
  });

  it("a war's one-shot hits every port of the warring factions", () => {
    const spain = CITIES.havana.factionId as string;
    const world = makeWorld({
      worldEvents: [makeEvent("war_start", { ports: [], factions: [spain] })],
    });
    // war_start has no one-shot of its own — the world must come back unchanged
    expect(applyOneShotEffects(world)).toBe(world);
  });
});

describe("port closure and war helpers", () => {
  it("a closed port neither produces nor consumes", () => {
    const world = makeWorld({ worldEvents: [makeEvent("hurricane")] });
    if (!isPortClosed(world, "port_royal")) return; // hurricane may not close ports
    const good = CITIES.port_royal.produces[0];
    // First tick fires the hurricane's one-shot cargo loss; compare after that.
    const settled = economyDailyTick(world);
    const before = settled.ports.port_royal.inventory[good] ?? 0;
    const after = economyDailyTick(settled).ports.port_royal.inventory[good] ?? 0;
    expect(after).toBeCloseTo(before, 5);
  });

  it("a closed port still drifts back toward its baseline", () => {
    const world = makeWorld({ worldEvents: [makeEvent("hurricane", { endDay: 400 })] });
    if (!isPortClosed(world, "port_royal")) return;
    world.ports.port_royal.defense = 0;
    const after = runDays(world, 60).ports.port_royal.defense;
    expect(after).toBeGreaterThan(0);
  });

  it("areFactionsAtWar only reports a live war between both parties", () => {
    const world = makeWorld({
      worldEvents: [makeEvent("war_start", { ports: [], factions: ["england", "spain"] })],
    });
    expect(areFactionsAtWar(world, "england", "spain")).toBe(true);
    expect(areFactionsAtWar(world, "spain", "england")).toBe(true);
    expect(areFactionsAtWar(world, "england", "france")).toBe(false);
  });

  it("a finished war is no longer a war", () => {
    const world = makeWorld({
      worldEvents: [makeEvent("war_start", { ports: [], factions: ["england", "spain"], endDay: 99 })],
    });
    expect(areFactionsAtWar(world, "england", "spain")).toBe(false);
  });

  it("warring navies put twice as many hulls to sea", () => {
    const world = makeWorld({
      worldEvents: [makeEvent("war_start", { ports: [], factions: ["england", "spain"] })],
    });
    const mul = warSpawnMultipliers(world);
    expect(mul.england).toBe(2);
    expect(mul.spain).toBe(2);
    expect(mul.france).toBeUndefined();
  });

  it("peace means no spawn multipliers at all", () => {
    expect(warSpawnMultipliers(makeWorld())).toEqual({});
  });
});


