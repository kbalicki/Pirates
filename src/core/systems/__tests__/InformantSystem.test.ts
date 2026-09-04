import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  raidOffer,
  acceptRaid,
  activeRaids,
  raidQuest,
  raidQuestId,
  raidCutFlag,
  raidDone,
  raidProgress,
  raidVictim,
  tickRaidCommissions,
  MAX_ACTIVE_RAIDS,
  RAID_SEVERITY,
  RAID_NOTORIETY,
  RAID_REPUTATION,
} from "../InformantSystem.ts";
import { validateQuest, advanceQuests } from "../QuestSystem.ts";
import { buildQuestRegistry } from "../QuestRegistry.ts";
import { disruptRoute, tradeRoutes, resetTradeRoutes, laneThroughput } from "../TradeRouteSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { initPortPrices, initPortInventory } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId } from "../../model/ids.ts";
import { setLandmasses, getFallbackLandmasses } from "../../data/geography.ts";
import { resetSeaGrid } from "../../services/Pathfinding.ts";
import type { WorldState, PortRuntimeState } from "../../model/WorldState.ts";

// ===========================================================================
// InformantSystem — the man at the back of the tavern
// ===========================================================================

/**
 * A commission is a promise about one named lane, and the thing it is measured
 * against — `routeDisruption` — was already in the world before this system
 * existed. So what is worth asserting is the joinery:
 *
 *   - the offer is somebody else's trade, never the town's own;
 *   - the quest it builds is a sound state machine and is rebuilt from the
 *     commission alone, so a reload cannot extend its own deadline;
 *   - the flag is stamped exactly once, when the lane is as quiet as promised,
 *     and the payment comes out of the quest machine rather than from here.
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

/**
 * The lane network is derived from the coastline, and under vitest there is no
 * coastline — every course is a straight line and `routesNear` answers about a
 * map that sails through where Cuba would be. The lanes are still the right
 * lanes, which is all these tests read.
 */
beforeEach(() => {
  setLandmasses(getFallbackLandmasses());
  resetSeaGrid();
  resetTradeRoutes();
});
afterEach(() => {
  resetTradeRoutes();
  resetSeaGrid();
});

/** A town whose tavern actually has a lane worth talking about. */
function portWithAnOffer(world: WorldState): { portKey: string } {
  for (const key of Object.keys(CITIES)) {
    if (raidOffer(world, key)) return { portKey: key };
  }
  throw new Error("no port in the whole Caribbean has an informer's job");
}

describe("the offer on the table", () => {
  it("is somewhere to be had", () => {
    const world = makeWorld();
    const { portKey } = portWithAnOffer(world);
    expect(raidOffer(world, portKey)).not.toBeNull();
  });

  it("is never against the town's own crown", () => {
    const world = makeWorld();
    for (const key of Object.keys(CITIES)) {
      const offer = raidOffer(world, key);
      if (!offer) continue;
      expect(offer.crown).not.toBe(CITIES[key].factionId as string);
    }
  });

  it("never asks a town to ruin a lane it is an end of", () => {
    const world = makeWorld();
    for (const key of Object.keys(CITIES)) {
      const offer = raidOffer(world, key);
      if (!offer) continue;
      expect(offer.from).not.toBe(key);
      expect(offer.to).not.toBe(key);
    }
  });

  it("asks for the severity the constant says, and pays something for it", () => {
    const world = makeWorld();
    const offer = raidOffer(world, portWithAnOffer(world).portKey)!;
    expect(offer.severity).toBe(RAID_SEVERITY);
    expect(offer.reward).toBeGreaterThan(0);
    expect(offer.days).toBeGreaterThan(0);
    expect(offer.id).toBe(raidQuestId(offer.routeId));
  });

  it("has nothing to sell about a run that is already dead", () => {
    let world = makeWorld();
    const { portKey } = portWithAnOffer(world);
    const offer = raidOffer(world, portKey)!;
    // Scare the lane past what the commission would ask for.
    for (let i = 0; i < 5; i++) world = disruptRoute(world, offer.routeId);
    expect(laneThroughput(world, offer.routeId)).toBeLessThanOrEqual(1 - RAID_SEVERITY);

    const again = raidOffer(world, portKey);
    expect(again?.routeId).not.toBe(offer.routeId);
  });

  it("stops offering while the captain is already under one", () => {
    const world = makeWorld();
    const { portKey } = portWithAnOffer(world);
    const signed = acceptRaid(world, raidOffer(world, portKey)!).world;
    expect(activeRaids(signed)).toHaveLength(MAX_ACTIVE_RAIDS);
    expect(raidOffer(signed, portKey)).toBeNull();
  });

  it("names the crown whose trade it is, in words", () => {
    const world = makeWorld();
    const offer = raidOffer(world, portWithAnOffer(world).portKey)!;
    expect(raidVictim(offer)).toBeTruthy();
    expect(raidVictim(offer)).not.toBe(offer.crown);
  });
});

describe("signing it", () => {
  it("puts the commission in the log and nothing in the purse", () => {
    const world = makeWorld();
    const offer = raidOffer(world, portWithAnOffer(world).portKey)!;
    const after = acceptRaid(world, offer).world;

    expect(after.player.gold).toBe(world.player.gold);
    expect(activeRaids(after)[0].routeId).toBe(offer.routeId);
  });

  it("refuses a second one", () => {
    const world = makeWorld();
    const { portKey } = portWithAnOffer(world);
    const first = acceptRaid(world, raidOffer(world, portKey)!).world;
    // Build a second commission by hand — the offer function would refuse to
    // hand one over, and what is under test here is the guard in `acceptRaid`.
    const other = tradeRoutes().find(r => r.id !== activeRaids(first)[0].routeId)!;
    const second = acceptRaid(first, { ...activeRaids(first)[0], id: raidQuestId(other.id), routeId: other.id });
    expect(second.error).toBe("informer.too_many");
    expect(activeRaids(second.world)).toHaveLength(1);
  });
});

describe("the quest it builds", () => {
  it("is a sound state machine", () => {
    const world = makeWorld();
    const offer = raidOffer(world, portWithAnOffer(world).portKey)!;
    expect(validateQuest(raidQuest(offer))).toEqual([]);
  });

  it("is rebuilt from the commission alone, so a reload cannot extend it", () => {
    const world = makeWorld();
    const offer = raidOffer(world, portWithAnOffer(world).portKey)!;
    const signed = acceptRaid(world, offer).world;
    const later = { ...signed, time: { ...signed.time, day: signed.time.day + 500 } };

    const registry = buildQuestRegistry(later);
    const def = registry[offer.id];
    expect(def).toBeDefined();
    const deadline = def.stages.hunt.on!.find(tr => tr.trigger.type === "days_passed")!;
    expect(deadline.trigger).toEqual({ type: "days_passed", days: offer.days });
  });

  it("pays, blackens the captain's name and sours the crown when the flag is stamped", () => {
    const world = makeWorld();
    const offer = raidOffer(world, portWithAnOffer(world).portKey)!;
    const signed = acceptRaid(world, offer).world;
    const stamped = { ...signed, worldFlags: { ...signed.worldFlags, [raidCutFlag(offer)]: true } };

    const out = advanceQuests(
      stamped,
      { type: "flag_set", key: raidCutFlag(offer) },
      buildQuestRegistry(stamped),
    );

    expect(out.completed).toContain(offer.id);
    expect(out.world.player.gold).toBe(world.player.gold + offer.reward);
    expect(out.world.player.notoriety).toBe(RAID_NOTORIETY);
    expect(out.world.player.reputation[offer.crown]).toBe(RAID_REPUTATION);
  });

  it("lapses rather than punishes when the run outlives the deadline", () => {
    const world = makeWorld();
    const offer = raidOffer(world, portWithAnOffer(world).portKey)!;
    const signed = acceptRaid(world, offer).world;
    const late = { ...signed, time: { ...signed.time, day: signed.time.day + offer.days } };

    const out = advanceQuests(late, { type: "days_passed", days: 0 }, buildQuestRegistry(late));
    expect(out.failed).toContain(offer.id);
    expect(out.world.player.gold).toBe(world.player.gold);
    expect(out.world.player.notoriety).toBe(0);
  });
});

describe("watching the lane", () => {
  it("says nothing while the run is still sailing", () => {
    const world = makeWorld();
    const offer = raidOffer(world, portWithAnOffer(world).portKey)!;
    const signed = acceptRaid(world, offer).world;
    expect(raidDone(signed, offer)).toBe(false);
    expect(tickRaidCommissions(signed).flags).toEqual([]);
  });

  it("reads progress against what was asked, and never past all of it", () => {
    const world = makeWorld();
    const offer = raidOffer(world, portWithAnOffer(world).portKey)!;
    let signed = acceptRaid(world, offer).world;
    expect(raidProgress(signed, offer)).toBe(0);

    signed = disruptRoute(signed, offer.routeId);
    expect(raidProgress(signed, offer)).toBeGreaterThan(0);
    expect(raidProgress(signed, offer)).toBeLessThan(1);

    for (let i = 0; i < 5; i++) signed = disruptRoute(signed, offer.routeId);
    expect(raidProgress(signed, offer)).toBe(1);
  });

  it("stamps the flag once the run is as quiet as it was paid to be", () => {
    const world = makeWorld();
    const offer = raidOffer(world, portWithAnOffer(world).portKey)!;
    let signed = acceptRaid(world, offer).world;
    for (let i = 0; i < 3; i++) signed = disruptRoute(signed, offer.routeId);

    const first = tickRaidCommissions(signed);
    expect(first.flags).toEqual([raidCutFlag(offer)]);
    expect(first.world.worldFlags[raidCutFlag(offer)]).toBe(true);

    // And never twice: the second day would otherwise pay the same job again.
    expect(tickRaidCommissions(first.world).flags).toEqual([]);
  });

  it("ignores a lane nobody commissioned", () => {
    let world = makeWorld();
    const other = tradeRoutes()[0];
    for (let i = 0; i < 4; i++) world = disruptRoute(world, other.id);
    expect(tickRaidCommissions(world).flags).toEqual([]);
  });
});
