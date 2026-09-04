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
  reliefOffer,
  acceptRelief,
  activeRelief,
  reliefQuest,
  reliefQuestId,
  reliefLandedFlag,
  canLandRelief,
  landRelief,
  supplyShortfall,
  MAX_ACTIVE_RELIEF,
  RELIEF_REPUTATION,
  RELIEF_NOTORIETY,
} from "../InformantSystem.ts";
import { validateQuest, advanceQuests } from "../QuestSystem.ts";
import { buildQuestRegistry } from "../QuestRegistry.ts";
import { disruptRoute, tradeRoutes, resetTradeRoutes, laneThroughput } from "../TradeRouteSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { initPortPrices, initPortInventory } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId, factionId, shipClassId } from "../../model/ids.ts";
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


// ═══════════════════════════════════════════════════════════════════════════
// The relief order — the informer's other line of work (v0.26.0)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A purchase order, not a freight, and the tests are mostly about that
 * difference: nothing is loaded at signing, the goods have to be found, and the
 * rate is struck against the item's base price so that buying at the starving
 * town's own counter and selling it back across the table can never pay.
 */

function withShip(world: WorldState, cargoCap = 60, cargo: Record<string, number> = {}): WorldState {
  return {
    ...world,
    entities: {
      ...world.entities,
      player_ship: {
        id: entityId("player_ship"),
        kind: "ship",
        mode: "sailing",
        pos: { x: 0, y: 0 },
        vel: { x: 0, y: 0 },
        heading: 0,
        sailLevel: 0.5,
        depthOffset: 0,
        ship: {
          classId: shipClassId("merchantman"),
          factionId: factionId("england"),
          hullHp: 100, hullMax: 100,
          sailsHp: 100, sailsMax: 100,
          cannons: 10,
          cargo,
          cargoCap,
          crew: { current: 40, max: 60, morale: 0.8 },
        },
      },
    },
  } as unknown as WorldState;
}

/** A world where one town's supplier has been taken and its shelves are going bare. */
function starvedWorld(cargoCap = 60): WorldState {
  const base = withShip(makeWorld(), cargoCap);
  // The lane that carries the most is the one worth cutting; cutting it at the
  // source is what a conquest does.
  const lane = tradeRoutes()[0];
  return {
    ...base,
    ports: {
      ...base.ports,
      [lane.from]: { ...base.ports[lane.from], factionId: factionId("pirates") },
    },
  };
}

/** The town that lane used to serve, and the good it is now short of. */
function starvedTown(): { port: string; item: string } {
  const lane = tradeRoutes()[0];
  return { port: lane.to, item: lane.items[0] };
}

describe("supplyShortfall", () => {
  it("is nothing at all in a world where every lane runs", () => {
    const world = withShip(makeWorld());
    const { port, item } = starvedTown();
    expect(supplyShortfall(world, port, item)).toBe(0);
  });

  it("rises when the town's supplier is shut in", () => {
    const { port, item } = starvedTown();
    expect(supplyShortfall(starvedWorld(), port, item)).toBeGreaterThan(0);
  });

  it("rises when the shippers have been frightened off the run", () => {
    const world = withShip(makeWorld());
    const lane = tradeRoutes()[0];
    const scared = disruptRoute(disruptRoute(world, lane.id), lane.id);
    expect(supplyShortfall(scared, lane.to, lane.items[0]))
      .toBeGreaterThan(supplyShortfall(world, lane.to, lane.items[0]));
  });
});

describe("the relief order on the table", () => {
  it("is nowhere to be had while the Caribbean is running normally", () => {
    const world = withShip(makeWorld());
    for (const key of Object.keys(CITIES)) expect(reliefOffer(world, key)).toBeNull();
  });

  it("appears once a town cannot get what it eats", () => {
    const world = starvedWorld();
    const offers = Object.keys(CITIES).map(key => reliefOffer(world, key)).filter(Boolean);
    expect(offers.length).toBeGreaterThan(0);
  });

  it("is never for the town it is offered in", () => {
    const world = starvedWorld();
    for (const key of Object.keys(CITIES)) {
      const offer = reliefOffer(world, key);
      if (offer) expect(offer.port).not.toBe(key);
    }
  });

  it("is sized to the hold that has to lift it", () => {
    const small = starvedWorld(20);
    const big = starvedWorld(200);
    const key = Object.keys(CITIES).find(k => reliefOffer(small, k))!;
    expect(reliefOffer(small, key)!.qty).toBeLessThan(reliefOffer(big, key)!.qty);
  });

  it("is not offered at all to a hold too small to be worth a paper", () => {
    const world = starvedWorld(4);
    for (const key of Object.keys(CITIES)) expect(reliefOffer(world, key)).toBeNull();
  });

  it("pays less than the starving town's own counter would charge for it", () => {
    // The reason the rate is struck against the base price and not the local
    // quote: otherwise a captain buys at the counter, turns round and sells it
    // back to the man who is paying him to bring it.
    const world = starvedWorld();
    const key = Object.keys(CITIES).find(k => reliefOffer(world, k))!;
    const offer = reliefOffer(world, key)!;
    const counter = (world.ports[offer.port].prices[offer.item] ?? 0) * offer.qty;
    expect(offer.reward).toBeLessThan(counter);
  });

  it("stops offering while one is already in hand", () => {
    const world = starvedWorld();
    const key = Object.keys(CITIES).find(k => reliefOffer(world, k))!;
    const taken = acceptRelief(world, reliefOffer(world, key)!).world;
    expect(activeRelief(taken).length).toBe(MAX_ACTIVE_RELIEF);
    expect(reliefOffer(taken, key)).toBeNull();
  });
});

describe("signing a relief order", () => {
  it("hands over nothing — the goods are the captain's problem", () => {
    const world = starvedWorld();
    const key = Object.keys(CITIES).find(k => reliefOffer(world, k))!;
    const offer = reliefOffer(world, key)!;
    const signed = acceptRelief(world, offer).world;

    const hold = signed.entities[signed.player.shipId as string]?.ship?.cargo ?? {};
    expect(hold[offer.item] ?? 0).toBe(0);
    expect(signed.player.gold).toBe(world.player.gold);
    expect(signed.ports[key].inventory).toEqual(world.ports[key].inventory);
  });

  it("refuses a second one", () => {
    const world = starvedWorld();
    const key = Object.keys(CITIES).find(k => reliefOffer(world, k))!;
    const offer = reliefOffer(world, key)!;
    const once = acceptRelief(world, offer).world;
    expect(acceptRelief(once, offer).error).toBe("informer.relief_too_many");
  });

  it("builds a sound quest that rebuilds from the commission alone", () => {
    const world = starvedWorld();
    const key = Object.keys(CITIES).find(k => reliefOffer(world, k))!;
    const offer = reliefOffer(world, key)!;
    expect(validateQuest(reliefQuest(offer))).toEqual([]);

    const signed = acceptRelief(world, offer).world;
    const registry = buildQuestRegistry(signed);
    expect(registry[reliefQuestId(offer.port, offer.item)]).toBeDefined();
  });
});

describe("landing a relief order", () => {
  function signedAtDestination(): { world: WorldState; offer: ReturnType<typeof reliefOffer> } {
    const world = starvedWorld();
    const key = Object.keys(CITIES).find(k => reliefOffer(world, k))!;
    const offer = reliefOffer(world, key)!;
    const signed = acceptRelief(world, offer).world;
    const shipId = signed.player.shipId as string;
    const entity = signed.entities[shipId];
    return {
      world: {
        ...signed,
        player: {
          ...signed.player,
          location: { type: "port", portId: portId(offer.port) },
        },
        entities: {
          ...signed.entities,
          [shipId]: { ...entity, ship: { ...entity.ship!, cargo: { [offer.item]: offer.qty } } },
        },
      } as unknown as WorldState,
      offer,
    };
  }

  it("cannot be landed anywhere but the town that ordered it", () => {
    const { world, offer } = signedAtDestination();
    const elsewhere = {
      ...world,
      player: { ...world.player, location: { type: "port", portId: portId("tortuga") } },
    } as unknown as WorldState;
    expect(canLandRelief(elsewhere, offer!)).toBe(offer!.port === "tortuga");
  });

  it("cannot be landed without the goods aboard", () => {
    const { world, offer } = signedAtDestination();
    const shipId = world.player.shipId as string;
    const empty = {
      ...world,
      entities: {
        ...world.entities,
        [shipId]: { ...world.entities[shipId], ship: { ...world.entities[shipId].ship!, cargo: {} } },
      },
    } as unknown as WorldState;
    expect(canLandRelief(empty, offer!)).toBe(false);
    expect(landRelief(empty, offer!).error).toBe("informer.relief_not_here");
  });

  it("moves the goods onto the town's shelves and requotes them", () => {
    const { world, offer } = signedAtDestination();
    const before = world.ports[offer!.port];
    const after = landRelief(world, offer!).world.ports[offer!.port];

    expect(after.inventory[offer!.item]).toBeCloseTo((before.inventory[offer!.item] ?? 0) + offer!.qty, 5);
    expect(after.prices[offer!.item]).toBeLessThanOrEqual(before.prices[offer!.item]);
  });

  it("empties the hold of exactly what was promised", () => {
    const { world, offer } = signedAtDestination();
    const shipId = world.player.shipId as string;
    const after = landRelief(world, offer!).world.entities[shipId].ship!.cargo;
    expect(after[offer!.item] ?? 0).toBe(0);
  });

  it("pays through the quest machine, not from the landing", () => {
    const { world, offer } = signedAtDestination();
    const landed = landRelief(world, offer!).world;
    // Nothing has been paid yet: `landRelief` only stamps the flag.
    expect(landed.player.gold).toBe(world.player.gold);
    expect(landed.worldFlags[reliefLandedFlag(offer!)]).toBe(true);

    const advanced = advanceQuests(
      landed,
      { type: "flag_set", key: reliefLandedFlag(offer!) },
      buildQuestRegistry(landed),
    ).world;
    expect(advanced.player.gold).toBe(world.player.gold + offer!.reward);
    expect(advanced.player.notoriety).toBe((world.player.notoriety ?? 0) + RELIEF_NOTORIETY);
    expect(advanced.player.reputation[offer!.crown] ?? 0).toBe(RELIEF_REPUTATION);
  });

  it("is the opposite of the raid commission on the same axis", () => {
    // One buys notoriety with a crown's goodwill, the other buys a little of
    // that goodwill back. Having both is the point of having either.
    expect(RELIEF_REPUTATION).toBeGreaterThan(0);
    expect(RAID_REPUTATION).toBeLessThan(0);
  });
});
