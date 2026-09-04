import { describe, it, expect } from "vitest";
import {
  recruitCrew,
  generateAvailableCrew,
  grainOffer,
  sellGrain,
  GRANARY_REPUTATION,
} from "../PortInteractionSystem.ts";
import { baselineConsumptionRate } from "../../data/economyBaselines.ts";
import { isPortClosed } from "../EventEffectsSystem.ts";
import { ITEMS } from "../../data/items.ts";
import { initPortPrices } from "../../data/prices.ts";
import { spotPrice } from "../PricingSystem.ts";
import { consortCrew, FLEET_CREW_FRACTION } from "../FleetSystem.ts";
import type { WorldState, PortRuntimeState, FleetShip } from "../../model/WorldState.ts";
import { entityId, shipClassId, factionId, portId } from "../../model/ids.ts";
import { CITIES } from "../../data/cities.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";

// ===========================================================================
// PortInteractionSystem — the tavern's crew pool
// ===========================================================================
//
// Only the recruiting path is covered here, and only because v0.17.0 changed
// what a berth means: consorts carry their own men now, so a hire that stopped
// at the flagship's rail would have left a gutted consort gutted for good.

const PORT = "port_royal";

function makePort(over: Partial<PortRuntimeState> = {}): PortRuntimeState {
  const baseline = getPortBaseline(PORT);
  return {
    portId: portId(PORT),
    factionId: CITIES[PORT].factionId,
    prices: {},
    inventory: {},
    shipyardQueue: [],
    availableCrew: 50,
    population: baseline.population,
    wealth: baseline.wealth,
    defense: baseline.defense,
    bonusProduces: [],
    ...over,
  };
}

function consort(classId: string, crew?: number): FleetShip {
  const cls = SHIP_CLASSES[classId];
  return {
    classId,
    hullHp: cls.hullMax,
    hullMax: cls.hullMax,
    sailsHp: cls.sailsMax,
    sailsMax: cls.sailsMax,
    cannons: cls.cannons,
    ...(crew === undefined ? {} : { crew }),
  };
}

function makeWorld(over: {
  crew?: number;
  fleet?: FleetShip[];
  availableCrew?: number;
} = {}): WorldState {
  const cls = SHIP_CLASSES.frigate;
  const crew = over.crew ?? cls.crewMax;
  return {
    version: 12,
    time: { day: 100, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 5, state: 5 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: 5000,
      notoriety: 0,
      reputation: {},
      ranks: {},
      location: { type: "port", portId: portId(PORT), pos: { x: 0, y: 0 } },
      questLog: [],
      fleet: over.fleet ?? [],
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
    },
    entities: {
      player_ship: {
        id: entityId("player_ship"),
        kind: "ship",
        mode: "sailing",
        depthOffset: 0,
        pos: { x: 0, y: 0 },
        vel: { x: 0, y: 0 },
        heading: 0,
        sailLevel: 0.5,
        ship: {
          classId: shipClassId("frigate"),
          factionId: factionId("england"),
          hullHp: cls.hullMax,
          hullMax: cls.hullMax,
          sailsHp: cls.sailsMax,
          sailsMax: cls.sailsMax,
          cannons: cls.cannons,
          cargo: {},
          cargoCap: cls.cargoCap,
          crew: { current: crew, max: cls.crewMax, morale: 0.8 },
        },
      },
    },
    ports: { [PORT]: makePort(over.availableCrew === undefined ? {} : { availableCrew: over.availableCrew }) },
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: {},
    eventLog: [],
    worldEvents: [],
    knownEventIds: [],
    playerName: "Test",
    eraId: "1660",
    startYear: 1660,
    gameSpeed: 1.2,
    captain: {
      name: "Test", nationality: "england", birthYear: 1640, startAge: 20,
      skills: { fencing: 5, gunnery: 5, navigation: 5, charm: 5, medicine: 5 },
      training: 0.5,
    },
  } as WorldState;
}

describe("recruitCrew — berths across the fleet, not just the flagship", () => {
  it("fills the flagship first", () => {
    const w = makeWorld({ crew: SHIP_CLASSES.frigate.crewMax - 10, fleet: [consort("sloop", 2)] });
    const out = recruitCrew(w, portId(PORT), 6);
    expect(out.recruited).toBe(6);
    expect(out.world.entities.player_ship.ship!.crew.current)
      .toBe(SHIP_CLASSES.frigate.crewMax - 4);
    expect(consortCrew(out.world.player.fleet[0])).toBe(2);
  });

  it("spills what will not fit into the consorts", () => {
    const w = makeWorld({ crew: SHIP_CLASSES.frigate.crewMax - 3, fleet: [consort("sloop", 2)] });
    const out = recruitCrew(w, portId(PORT), 9);
    expect(out.recruited).toBe(9);
    expect(out.world.entities.player_ship.ship!.crew.current).toBe(SHIP_CLASSES.frigate.crewMax);
    expect(consortCrew(out.world.player.fleet[0])).toBe(8);
  });

  it("mans a consort even when the flagship is already full", () => {
    const w = makeWorld({ fleet: [consort("sloop", 1)] });
    const out = recruitCrew(w, portId(PORT), 5);
    expect(out.recruited).toBe(5);
    expect(out.world.entities.player_ship.ship!.crew.current).toBe(SHIP_CLASSES.frigate.crewMax);
    expect(consortCrew(out.world.player.fleet[0])).toBe(6);
  });

  it("refuses when every berth in the fleet is taken", () => {
    const w = makeWorld({ fleet: [consort("sloop", SHIP_CLASSES.sloop.crewMax)] });
    const out = recruitCrew(w, portId(PORT), 5);
    expect(out.recruited).toBe(0);
    expect(out.error).toBe("crew_full");
  });

  it("still refuses a full flagship with no consorts at all", () => {
    const out = recruitCrew(makeWorld(), portId(PORT), 5);
    expect(out.recruited).toBe(0);
    expect(out.error).toBe("crew_full");
  });

  it("never hires more than the town has", () => {
    const w = makeWorld({ crew: 10, availableCrew: 3, fleet: [consort("sloop", 0)] });
    const out = recruitCrew(w, portId(PORT), 40);
    expect(out.recruited).toBe(3);
    expect(out.world.ports[PORT].availableCrew).toBe(0);
  });

  it("only dilutes drill with the men who joined the flagship", () => {
    // Everyone here goes to the consort, so the flagship's drill is untouched.
    const w = makeWorld({ fleet: [consort("sloop", 0)] });
    const out = recruitCrew(w, portId(PORT), 5);
    expect(out.world.captain.training).toBe(w.captain.training);
  });

  it("does dilute drill when the recruits walk the flagship's own deck", () => {
    const w = makeWorld({ crew: 10 });
    const out = recruitCrew(w, portId(PORT), 10);
    expect(out.world.captain.training!).toBeLessThan(w.captain.training!);
  });

  it("counts a consort that never recorded a crew at its notional complement", () => {
    const w = makeWorld({ fleet: [consort("sloop")] });
    const out = recruitCrew(w, portId(PORT), 5);
    const expected = Math.round(SHIP_CLASSES.sloop.crewMax * FLEET_CREW_FRACTION);
    expect(out.recruited).toBe(Math.min(5, SHIP_CLASSES.sloop.crewMax - expected));
  });

  it("does not mutate the world it was handed", () => {
    const w = makeWorld({ crew: 10, fleet: [consort("sloop", 1)] });
    recruitCrew(w, portId(PORT), 20);
    expect(w.entities.player_ship.ship!.crew.current).toBe(10);
    expect(w.player.fleet[0].crew).toBe(1);
  });
});


// ===========================================================================
// A hungry town: men for bread, and the public granary (v0.27.0)
// ===========================================================================

/**
 * Hunger stopped being only a number on the port record in v0.27.0. It does two
 * things a captain can act on, and they point in opposite directions: it fills
 * the tavern with men who will take a berth and a meal, and it puts a governor
 * in front of him who will pay gold *and standing* for whatever is in the hold.
 *
 * The second is the interesting one to test, because the obvious way to write
 * it is farmable — a governor who buys the same forty tons every afternoon.
 */

const HUNGRY = 0.6;

/** The town's own runtime record, short of everything and stocked with prices. */
function hungryWorld(hunger: number, cargo: Record<string, number> = {}): WorldState {
  const base = makeWorld();
  const ship = base.entities.player_ship.ship!;
  return {
    ...base,
    ports: {
      ...base.ports,
      [PORT]: { ...base.ports[PORT], hunger, prices: initPortPrices(PORT), inventory: {} },
    },
    entities: {
      ...base.entities,
      player_ship: { ...base.entities.player_ship, ship: { ...ship, cargo } },
    },
  } as WorldState;
}

describe("the tavern in a hungry town", () => {
  it("puts more men on the bench than the same town fed", () => {
    const fed = generateAvailableCrew(hungryWorld(0), portId(PORT)).ports[PORT].availableCrew;
    const starving = generateAvailableCrew(hungryWorld(1), portId(PORT)).ports[PORT].availableCrew;
    expect(starving).toBeGreaterThan(fed);
  });

  it("rolls the same dice either way", () => {
    // The v0.24.0 rule, restated: what the town has eaten scales the result,
    // never the roll. A shortage must not silently reshuffle every other random
    // thing in the game.
    const fed = generateAvailableCrew(hungryWorld(0), portId(PORT)).rng;
    const starving = generateAvailableCrew(hungryWorld(1), portId(PORT)).rng;
    expect(starving).toEqual(fed);
  });
});

describe("the public granary", () => {
  const ITEM = CITIES[PORT].demands[0];

  it("has nothing to say in a town that is eating", () => {
    expect(grainOffer(hungryWorld(0, { [ITEM]: 100 }), PORT)).toBeNull();
  });

  it("has nothing to say to a captain in ballast", () => {
    expect(grainOffer(hungryWorld(HUNGRY), PORT)).toBeNull();
  });

  it("asks for what the town has fewest days of", () => {
    const world = hungryWorld(HUNGRY, { [ITEM]: 100 });
    const offer = grainOffer(world, PORT)!;
    expect(offer.item).toBe(ITEM);
    expect(offer.qty).toBeGreaterThan(0);
  });

  it("takes no more than the hold holds", () => {
    const offer = grainOffer(hungryWorld(HUNGRY, { [ITEM]: 5 }), PORT)!;
    expect(offer.qty).toBeLessThanOrEqual(5);
  });

  it("never bids above what the town's own famine quote would fetch", () => {
    // A crown relieving its own colony is not bidding against itself. If the
    // granary paid the famine price the merchant's counter would be pointless
    // in exactly the towns worth sailing to.
    const world = hungryWorld(HUNGRY, { [ITEM]: 100 });
    const offer = grainOffer(world, PORT)!;
    const counter = (world.ports[PORT].prices[ITEM] ?? 0) * offer.qty;
    expect(offer.gold).toBeLessThanOrEqual(counter);
  });

  it("lands the cargo, pays the gold and mends the standing", () => {
    const world = hungryWorld(HUNGRY, { [ITEM]: 100 });
    const offer = grainOffer(world, PORT)!;
    const after = sellGrain(world, offer).world;
    const crown = CITIES[PORT].factionId as unknown as string;

    expect(after.entities.player_ship.ship!.cargo[ITEM] ?? 0).toBe(100 - offer.qty);
    expect(after.ports[PORT].inventory[ITEM]).toBeCloseTo(offer.qty, 5);
    expect(after.player.gold).toBe(world.player.gold + offer.gold);
    expect(after.player.reputation[crown] ?? 0).toBe(offer.reputation);
    expect(after.eventLog.some(e => e.key === "event.granary_relieved")).toBe(true);
  });

  it("requotes the shelf it just filled", () => {
    // Not "the price falls": the fixture starts from a base quote on an empty
    // shed, which is not what an empty shed is worth. What must be true is that
    // the quote is the one the *new* stock earns, the same afternoon — so it
    // sits below what the town would have asked with nothing on the shelf.
    const world = hungryWorld(HUNGRY, { [ITEM]: 100 });
    const offer = grainOffer(world, PORT)!;
    const after = sellGrain(world, offer).world;
    const pop = world.ports[PORT].population;
    expect(after.ports[PORT].prices[ITEM])
      .toBe(spotPrice(PORT, ITEM, offer.qty, pop));
    expect(after.ports[PORT].prices[ITEM])
      .toBeLessThan(spotPrice(PORT, ITEM, 0, pop));
  });

  it("cannot be sold to twice — the gap is what it is asking about", () => {
    // The farm this would otherwise be: land forty tons, turn round, land forty
    // more. Landing raises the stock, the gap closes and the reply is gone
    // until the town has eaten its way back down to short.
    const world = hungryWorld(HUNGRY, { [ITEM]: 400 });
    const first = grainOffer(world, PORT)!;
    const after = sellGrain(world, first).world;
    expect(grainOffer(after, PORT)).toBeNull();
  });

  it("pays the full standing only for closing the whole gap", () => {
    const need = baselineConsumptionRate(PORT, CITIES[PORT].demands[0], makeWorld().ports[PORT].population);
    expect(need).toBeGreaterThan(0);
    const full = grainOffer(hungryWorld(HUNGRY, { [ITEM]: 1000 }), PORT)!;
    const part = grainOffer(hungryWorld(HUNGRY, { [ITEM]: 5 }), PORT)!;
    expect(full.reputation).toBe(GRANARY_REPUTATION);
    expect(part.reputation).toBeLessThan(full.reputation);
  });

  it("refuses a sale the hold cannot cover", () => {
    const world = hungryWorld(HUNGRY, { [ITEM]: 100 });
    const offer = grainOffer(world, PORT)!;
    const empty = hungryWorld(HUNGRY, {});
    expect(sellGrain(empty, offer).error).toBe("granary.no_cargo");
  });

  it("is priced off the good's base, not the town's quote", () => {
    const world = hungryWorld(HUNGRY, { [ITEM]: 100 });
    const offer = grainOffer(world, PORT)!;
    const base = (ITEMS[ITEM]?.basePrice ?? 0) * offer.qty;
    expect(offer.gold).toBeGreaterThan(base);
    expect(offer.gold).toBeLessThan(base * 2);
  });
});


// ===========================================================================
// What an event does to a town the captain is standing in (v0.29.0)
// ===========================================================================

/**
 * v0.28.0 found that no world event had ever attached itself to a port, so
 * nobody had ever noticed that two of the effects they declare were not read by
 * anything at all. `crewMul` — a plague halves the men who will sign — was
 * consumed nowhere in the codebase; `portClosed` gated the daily economy and
 * nothing else, so a captain sailed into a harbour that was officially shut and
 * traded across a counter nobody was standing behind.
 */

function withEvent(world: WorldState, type: string, severity: 1 | 2 | 3 = 2): WorldState {
  return {
    ...world,
    worldEvents: [{
      id: `ev_${type}`,
      type,
      startDay: 1,
      endDay: 999,
      ports: [PORT],
      factions: ["england"],
      severity,
      headline: `news.${type}`,
      vars: {},
    }],
  } as unknown as WorldState;
}

describe("a plague empties the tavern", () => {
  it("puts fewer men on the bench than the same town in good health", () => {
    const well = generateAvailableCrew(hungryWorld(0), portId(PORT)).ports[PORT].availableCrew;
    const sick = generateAvailableCrew(
      withEvent(hungryWorld(0), "epidemic"), portId(PORT),
    ).ports[PORT].availableCrew;
    expect(sick).toBeLessThan(well);
  });

  it("takes a smaller bite for a famine than for a plague", () => {
    const plague = generateAvailableCrew(
      withEvent(hungryWorld(0), "epidemic"), portId(PORT),
    ).ports[PORT].availableCrew;
    const famine = generateAvailableCrew(
      withEvent(hungryWorld(0), "famine"), portId(PORT),
    ).ports[PORT].availableCrew;
    expect(famine).toBeGreaterThan(plague);
  });

  it("rolls the same dice either way", () => {
    const well = generateAvailableCrew(hungryWorld(0), portId(PORT)).rng;
    const sick = generateAvailableCrew(withEvent(hungryWorld(0), "epidemic"), portId(PORT)).rng;
    expect(sick).toEqual(well);
  });
});

describe("a shut harbour", () => {
  it("is shut while the hurricane is over it", () => {
    // The contract `PortApproachScene` reads before it offers the door.
    expect(isPortClosed(withEvent(hungryWorld(0), "hurricane"), PORT)).toBe(true);
  });

  it("is open in a town where nothing is happening", () => {
    expect(isPortClosed(hungryWorld(0), PORT)).toBe(false);
  });

  it("is open again once the storm has blown out", () => {
    const past = withEvent(hungryWorld(0), "hurricane");
    const later = { ...past, time: { ...past.time, day: 2000 } } as WorldState;
    expect(isPortClosed(later, PORT)).toBe(false);
  });
});
