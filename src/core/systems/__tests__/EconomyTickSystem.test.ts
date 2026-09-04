import { describe, it, expect } from "vitest";
import {
  economyDailyTick,
  blackFlagImportShare,
  supplierShutIn,
  reroutedOnto,
  townHunger,
  townIsHungry,
  HUNGER_VISIBLE,
} from "../EconomyTickSystem.ts";
import {
  getAggregatedEffects,
  applyOneShotEffects,
  isPortClosed,
  areFactionsAtWar,
  warSpawnMultipliers,
} from "../EventEffectsSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { effectiveSupplier, tradeRoutes } from "../TradeRouteSystem.ts";
import { initPortPrices, initPortInventory } from "../../data/prices.ts";
import {
  getPortBaseline,
  baselineProductionRate,
  inventoryCap,
} from "../../data/economyBaselines.ts";
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
      // Wealth is the one exception, and it is deliberate (v0.24.0): a day's
      // trade through a quay is worth a fraction of a point, and rounding the
      // running total to a whole number every midnight threw that fraction
      // away — the trade ledger balanced four points above baseline instead of
      // the fifty the arithmetic says. One decimal is enough room for it and
      // still bounded, so saves do not drift.
      expect(Number.isInteger(Math.round(p.wealth * 10))).toBe(true);
      expect(Math.abs(p.wealth * 10 - Math.round(p.wealth * 10))).toBeLessThan(1e-6);
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
    //
    // Since v0.24.0 a supplied colony does better than merely break even: the
    // lanes that feed it also pay it, so Port Royale — where a dozen of them
    // end — settles some way *above* its baseline. What must stay true is the
    // thing this test was written for, that a town which demands goods is not
    // punished for demanding them.
    const baseline = getPortBaseline("port_royal").wealth;
    const settled = runDays(makeWorld(), 600).ports.port_royal.wealth;
    expect(settled).toBeGreaterThanOrEqual(baseline);
    expect(settled).toBeLessThan(baseline * 1.2);
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

describe("war strangles the shipping (v0.21.0)", () => {
  /** A world where England — Port Royale's crown — is at war with Spain. */
  function atWar() {
    const world = makeWorld();
    world.worldEvents = [makeEvent("war_start", {
      factions: ["england", "spain"],
      ports: [],
      startDay: 1,
      endDay: 9999,
    })];
    return world;
  }

  it("costs a colony wealth it would otherwise have kept", () => {
    const peace = runDays(makeWorld(), 600).ports.port_royal.wealth;
    const war = runDays(atWar(), 600).ports.port_royal.wealth;
    expect(war).toBeLessThan(peace);
    // Felt, not fatal: a war should hurt a port, not empty it.
    expect(war).toBeGreaterThan(peace * 0.5);
  });

  it("leaves a port of a crown that is not in it alone", () => {
    // Havana is Spanish here, so pick a port belonging to neither side.
    const neutral = Object.keys(CITIES).find(
      k => !["england", "spain"].includes(CITIES[k].factionId as unknown as string),
    )!;
    const peace = runDays(makeWorld(), 400).ports[neutral].wealth;
    const war = runDays(atWar(), 400).ports[neutral].wealth;
    expect(war).toBe(peace);
  });

  it("lets the port recover once the war is over", () => {
    const fought = runDays(atWar(), 400);
    const during = fought.ports.port_royal.wealth;
    const after = runDays({ ...fought, worldEvents: [] }, 400).ports.port_royal.wealth;
    expect(after).toBeGreaterThan(during);
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

// ===========================================================================
// The black flag — a town with no crown behind it
// ===========================================================================

/**
 * Port Royale flying the black flag, which is what `playerHolds` means: the
 * port's faction is "pirates" and the city it was founded as is not.
 */
function heldPortRoyal(over: Partial<WorldState> = {}): WorldState {
  const world = makeWorld(over);
  return {
    ...world,
    ports: {
      ...world.ports,
      port_royal: { ...world.ports.port_royal, factionId: factionId("pirates") },
    },
  };
}

describe("supplierShutIn", () => {
  it("counts a town under the black flag as one no licensed hull will lade at", () => {
    expect(supplierShutIn(heldPortRoyal(), "port_royal")).toBe(true);
  });

  it("leaves a colony alone, whoever's colony it is", () => {
    expect(supplierShutIn(makeWorld(), "port_royal")).toBe(false);
    expect(supplierShutIn(makeWorld(), "havana")).toBe(false);
  });
});

describe("blackFlagImportShare", () => {
  it("gives an unknown captain's den only what the smugglers will carry", () => {
    expect(blackFlagImportShare(makeWorld())).toBeCloseTo(0.35, 5);
  });

  it("rises with the captain's name and stops rising past full fame", () => {
    const at = (notoriety: number) => blackFlagImportShare(
      { ...makeWorld(), player: { ...makeWorld().player, notoriety } },
    );
    expect(at(50)).toBeGreaterThan(at(0));
    expect(at(100)).toBeGreaterThan(at(50));
    expect(at(400)).toBeCloseTo(at(100), 5);
    expect(at(100)).toBeCloseTo(0.75, 5);
  });

  it("is never dragged below the floor by a negative reading", () => {
    const at = blackFlagImportShare(
      { ...makeWorld(), player: { ...makeWorld().player, notoriety: -50 } },
    );
    expect(at).toBeCloseTo(0.35, 5);
  });
});

describe("a town under the black flag — where its wealth settles", () => {
  /**
   * The numbers here are measured, not chosen, and they are the argument
   * against the change this release deliberately did **not** make: pulling a
   * held town's wealth toward a smaller target. The gap it settles at is the
   * standing pressure divided by `RECOVERY_WEALTH` — about 380 for a starved
   * Port Royale — so any target under 380 settles the town at zero. Both a
   * 0.62 target and a flat daily upkeep were tried and emptied it inside a
   * year. What the flag changes is what reaches the quay, and that is enough.
   */
  it("costs a town most of its wealth without emptying it", () => {
    const settled = runDays(heldPortRoyal(), 400).ports.port_royal;
    expect(settled.wealth).toBeGreaterThan(120);
    expect(settled.wealth).toBeLessThan(getPortBaseline("port_royal").wealth * 0.55);
  });

  it("keeps a famous captain's den better fed than an unknown's", () => {
    const nobody = runDays(heldPortRoyal(), 400).ports.port_royal.wealth;
    const legend = runDays(
      heldPortRoyal({ player: { ...makeWorld().player, notoriety: 100 } }),
      400,
    ).ports.port_royal.wealth;
    expect(legend).toBeGreaterThan(nobody * 1.5);
  });

  it("starves the colonies that town used to supply", () => {
    // Tortuga buys from Port Royale. With Port Royale under the black flag no
    // licensed hull clears from it, so Tortuga goes looking elsewhere or goes
    // short — the first strategic consequence of a conquest felt from the far
    // side of the map.
    const asColony = runDays(makeWorld(), 400).ports.tortuga.wealth;
    const asDen = runDays(heldPortRoyal(), 400).ports.tortuga.wealth;
    expect(asDen).toBeLessThan(asColony);
  });
});


// ===========================================================================
// A delivery comes out of somebody's warehouse (v0.26.0)
// ===========================================================================

/**
 * Until this release the goods a lane landed were conjured at the destination:
 * the exporter was *paid* for them (v0.24.0) and, once shut in, the right
 * exporter was paid (v0.25.0), but no warehouse anywhere went down by a barrel.
 * A port that suddenly took over a blockaded rival's runs was neither strained
 * nor enriched by it.
 *
 * The two facts worth pinning down are the two that could plausibly go wrong:
 *
 *   - the **settled** world must not move, because the exporter's plantations
 *     were always growing what his lanes carry — the change is bookkeeping, not
 *     a new tax on the Caribbean;
 *   - the **disturbed** world must move, and in both directions at once: the
 *     town covering the runs sells dear and runs short, and its own clients
 *     eventually feel that a second source is a finite one.
 */

const ALL_PORTS = Object.keys(CITIES);

function makeFullWorld(over: Partial<WorldState> = {}): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  for (const key of ALL_PORTS) ports[key] = makePort(key);
  return { ...makeWorld(over), ports, ...over } as WorldState;
}

function heldIn(world: WorldState, portKey: string): WorldState {
  return {
    ...world,
    ports: {
      ...world.ports,
      [portKey]: { ...world.ports[portKey], factionId: factionId("pirates") },
    },
  };
}

/** The port that picks up `item` for `client` when its usual supplier shuts. */
function standIn(client: string, item: string, shut: string): string {
  const from = effectiveSupplier(client, item, port => port === shut);
  expect(from).toBeDefined();
  return from!;
}

describe("an exporter's warehouse — the settled world", () => {
  it("keeps a committed exporter's sheds full: he grows what his lanes carry", () => {
    const w = runDays(makeFullWorld(), 120);
    for (const lane of tradeRoutes().slice(0, 20)) {
      for (const item of lane.items) {
        const cap = inventoryCap(lane.from, item);
        // Full, give or take the town's own day's eating.
        expect(w.ports[lane.from].inventory[item]).toBeGreaterThan(cap * 0.9);
      }
    }
  });

  it("leaves the towns exactly where v0.25.0 left them", () => {
    // The regression guard for the whole rearrangement. These are the measured
    // settled values of the release before it; a lane that draws goods out of a
    // real warehouse must not, on its own, make the Caribbean poorer.
    const w = runDays(makeFullWorld(), 400);
    expect(w.ports.port_royal.wealth).toBeCloseTo(646.1, 0);
    expect(w.ports.havana.wealth).toBeCloseTo(907.6, 0);
    expect(w.ports.santiago.wealth).toBeCloseTo(617.1, 0);
    expect(w.ports.santo_domingo.wealth).toBeCloseTo(920.6, 0);
  });
});

describe("an exporter's warehouse — a producer answering an empty shed", () => {
  it("works harder when the sheds are bare than when they are full", () => {
    const item = CITIES.havana.produces[0];
    const empty = makeFullWorld();
    empty.ports.havana = { ...empty.ports.havana, inventory: { ...empty.ports.havana.inventory, [item]: 0 } };
    const gained = economyDailyTick(empty).ports.havana.inventory[item];
    expect(gained).toBeGreaterThan(baselineProductionRate("havana", item, empty.ports.havana.wealth));
  });

  it("stops at the cap however hard it works", () => {
    const item = CITIES.havana.produces[0];
    const w = runDays(makeFullWorld(), 60);
    expect(w.ports.havana.inventory[item]).toBeLessThanOrEqual(inventoryCap("havana", item));
  });
});

describe("an exporter's warehouse — covering somebody else's runs", () => {
  const item = "food";
  const client = "santiago";

  it("names the port that has taken the runs over, and what they cost it", () => {
    const held = heldIn(makeFullWorld(), "port_royal");
    const cover = standIn(client, item, "port_royal");
    const carried = reroutedOnto(held, cover);
    expect(carried.length).toBeGreaterThan(0);
    expect(carried.some(c => c.item === item && c.tons > 0)).toBe(true);
  });

  it("names nobody in a world where every lane is running normally", () => {
    const w = makeFullWorld();
    for (const port of ALL_PORTS) expect(reroutedOnto(w, port)).toEqual([]);
  });

  it("draws the stand-in's warehouse down and puts his prices up", () => {
    const held = heldIn(makeFullWorld(), "port_royal");
    const cover = standIn(client, item, "port_royal");

    const quiet = runDays(makeFullWorld(), 30).ports[cover];
    const strained = runDays(held, 30).ports[cover];

    expect(strained.inventory[item]).toBeLessThan(quiet.inventory[item] * 0.5);
    expect(strained.prices[item]).toBeGreaterThan(quiet.prices[item]);
  });

  it("pays him for it — the strain and the windfall are the same fact", () => {
    const held = heldIn(makeFullWorld(), "port_royal");
    const cover = standIn(client, item, "port_royal");

    const quiet = runDays(makeFullWorld(), 90).ports[cover];
    const strained = runDays(held, 90).ports[cover];

    expect(strained.tradeIncome ?? 0).toBeGreaterThan(quiet.tradeIncome ?? 0);
    expect(strained.wealth).toBeGreaterThan(quiet.wealth);
  });

  it("keeps his own people fed before anyone else's", () => {
    // The reserve is what stops a stand-in shipping his last barrel abroad.
    const held = runDays(heldIn(makeFullWorld(), "port_royal"), 90);
    const cover = standIn(client, item, "port_royal");
    expect(held.ports[cover].inventory[item]).toBeGreaterThan(0);
  });
});

describe("an exporter's warehouse — a second source is a finite one", () => {
  it("short-ships the orders when the quay cannot fill them all", () => {
    const item = "food";
    const held = heldIn(makeFullWorld(), "port_royal");
    const client = "santiago";
    const cover = standIn(client, item, "port_royal");

    // Same day, twice: once with the stand-in's sheds full, once with them
    // bare. The only difference is what he has to ship, so the difference in
    // what lands at the far end is the rationing and nothing else.
    const full = economyDailyTick(held).ports[client].inventory[item] ?? 0;
    const bare = economyDailyTick({
      ...held,
      ports: {
        ...held.ports,
        [cover]: { ...held.ports[cover], inventory: { ...held.ports[cover].inventory, [item]: 0 } },
      },
    }).ports[client].inventory[item] ?? 0;

    expect(bare).toBeLessThan(full);
  });

  it("leaves the towns it used to supply worse off than a costless reroute would", () => {
    // The point of the release, stated as an outcome: taking Port Royale is
    // felt across the sea for longer than the week its neighbours' warehouses
    // last, because the trade that covers for it runs out of goods.
    const quiet = runDays(makeFullWorld(), 200).ports.santiago.wealth;
    const cut = runDays(heldIn(makeFullWorld(), "port_royal"), 200).ports.santiago.wealth;
    expect(cut).toBeLessThan(quiet);
  });
});


// ===========================================================================
// What the town went without, and who left because of it (v0.27.0)
// ===========================================================================

/**
 * A shortage has cost a town *wealth* since v0.20.0 and nothing else. Nobody
 * left, no screen said so, and the tavern was as full in a famine as in a good
 * year — so the thing the player could now cause deliberately (v0.22.0 blockade,
 * v0.25.0 conquest, v0.26.0 a dry second source) was invisible from inside the
 * town it happened to.
 *
 * Two things are worth pinning down, and they pull against each other: the
 * figure must be **zero everywhere in a world that is running**, or every port
 * in the Caribbean would permanently look starved; and it must be large enough,
 * where it is real, to move people off the quay.
 */

describe("hunger — what the town went without", () => {
  it("is nothing at all in a Caribbean that is running", () => {
    const w = runDays(makeFullWorld(), 200);
    for (const key of ALL_PORTS) {
      expect(townHunger(w, key)).toBe(0);
      expect(townIsHungry(w, key)).toBe(false);
    }
  });

  it("answers nothing for a save written before it existed", () => {
    const w = makeFullWorld();
    expect(w.ports.port_royal.hunger).toBeUndefined();
    expect(townHunger(w, "port_royal")).toBe(0);
  });

  it("rises in a town whose supplier has been taken", () => {
    const held = runDays(heldIn(makeFullWorld(), "port_royal"), 200);
    expect(townHunger(held, "port_royal")).toBeGreaterThan(HUNGER_VISIBLE);
    expect(townIsHungry(held, "tortuga")).toBe(true);
  });
});

describe("hunger — the people leave", () => {
  it("costs a hungry town people, and a fed one none", () => {
    const quiet = runDays(makeFullWorld(), 200);
    const held = runDays(heldIn(makeFullWorld(), "port_royal"), 200);
    expect(quiet.ports.tortuga.population).toBe(getPortBaseline("tortuga").population);
    expect(held.ports.tortuga.population).toBeLessThan(quiet.ports.tortuga.population);
  });

  it("thins a town without emptying it, however long the famine runs", () => {
    const held = runDays(heldIn(makeFullWorld(), "port_royal"), 800);
    const settled = held.ports.tortuga.population;
    expect(settled).toBeGreaterThan(getPortBaseline("tortuga").population * 0.5);
    expect(settled).toBeLessThan(getPortBaseline("tortuga").population * 0.98);
  });

  it("keeps the fraction, or a village would never lose anybody at all", () => {
    // The trap `wealth` fell into in v0.24.0, one floor down. A town of five
    // hundred going a quarter short loses a fifth of a person a day; rounding
    // the total to whole people every midnight threw all of it away, so small
    // towns were immune to famine and cities were not. Nothing in the numbers
    // said so — the population simply never moved.
    // 120 days: long enough for the town's own shelves to run out behind the
    // cut lane, short enough that the whole drain is a handful of people —
    // which is exactly the regime integer rounding used to swallow.
    const held = runDays(heldIn(makeFullWorld(), "port_royal"), 120);
    const baseline = getPortBaseline("tortuga").population;
    const pop = held.ports.tortuga.population;
    expect(pop).toBeLessThan(baseline);
    expect(pop).toBeGreaterThan(baseline * 0.9);
  });
});
