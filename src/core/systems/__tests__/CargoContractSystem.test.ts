import { describe, it, expect } from "vitest";
import {
  cargoOffers,
  activeCharters,
  acceptCharter,
  deliverCharter,
  canDeliver,
  cargoDeliveredFlag,
  cargoQuest,
  cargoQuestId,
  holdRoom,
  freightFor,
  MAX_ACTIVE_CHARTERS,
  OFFERS_PER_PORT,
  CHARTER_REPUTATION,
  CHARTER_BETRAYAL_REPUTATION,
  CHARTER_BETRAYAL_NOTORIETY,
  type CargoContract,
} from "../CargoContractSystem.ts";
import { tradeRoutes, disruptRoute } from "../TradeRouteSystem.ts";
import { buildQuestRegistry } from "../QuestRegistry.ts";
import { advanceQuests } from "../QuestSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { ITEMS } from "../../data/items.ts";
import { initPortPrices, initPortInventory } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId, factionId, shipClassId } from "../../model/ids.ts";
import type { WorldState, PortRuntimeState } from "../../model/WorldState.ts";
import type { EntityState } from "../../model/EntityState.ts";

// ===========================================================================
// CargoContractSystem — the charter
// ===========================================================================

/**
 * A charter is a lane offered to the player at what the lane is worth today.
 * Three things are worth pinning down and all three are about *money and
 * goods actually moving*: the offer comes out of a real warehouse, the cargo
 * physically occupies the hold from the moment he signs, and the payment
 * happens through the quest machine rather than in the delivery function — so
 * nothing can pay twice.
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

function makeShip(cargoCap = 200): EntityState {
  return {
    id: entityId("player_ship"),
    kind: "ship",
    mode: "sailing",
    pos: { x: 100, y: 100 },
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
      cargo: {},
      cargoCap,
      crew: { current: 40, max: 60, morale: 0.8 },
    },
  };
}

function makeWorld(over: Partial<WorldState> = {}, cargoCap = 200): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  // Every port starts with a full warehouse, so a charter is always on offer.
  for (const key of Object.keys(CITIES)) {
    const stocked: Record<string, number> = {};
    for (const item of Object.keys(ITEMS)) stocked[item] = 200;
    ports[key] = makePort(key, { inventory: stocked });
  }
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
      location: { type: "sea", pos: { x: 100, y: 100 } },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
    },
    entities: { player_ship: makeShip(cargoCap) },
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

/** A port that actually has lanes leaving it, so there is something to offer. */
function exportingPort(): string {
  const lane = tradeRoutes()[0];
  return lane.from;
}

/** Put the player ashore in a port. */
function ashore(world: WorldState, portKey: string): WorldState {
  return {
    ...world,
    player: {
      ...world.player,
      location: { type: "port", portId: portId(portKey), pos: { ...CITIES[portKey].pos } },
    },
  };
}

describe("what is on offer", () => {
  it("offers charters out of a port that ships things", () => {
    const offers = cargoOffers(makeWorld(), exportingPort());
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.length).toBeLessThanOrEqual(OFFERS_PER_PORT);
  });

  it("only offers goods the destination actually wants shipped in", () => {
    const from = exportingPort();
    for (const offer of cargoOffers(makeWorld(), from)) {
      expect(offer.from).toBe(from);
      expect(CITIES[offer.to].demands).toContain(offer.item);
      expect(CITIES[from].produces).toContain(offer.item);
    }
  });

  it("offers nothing from a port with an empty warehouse", () => {
    const from = exportingPort();
    const w = makeWorld();
    const stripped: WorldState = {
      ...w,
      ports: { ...w.ports, [from]: { ...w.ports[from], inventory: {} } },
    };
    expect(cargoOffers(stripped, from)).toEqual([]);
  });

  it("offers nothing from a port with no lanes at all", () => {
    const noLanes = Object.keys(CITIES).find(k => tradeRoutes().every(r => r.from !== k));
    if (!noLanes) return; // every port exports something; nothing to assert
    expect(cargoOffers(makeWorld(), noLanes)).toEqual([]);
  });

  it("is the same book twice in the same day", () => {
    const from = exportingPort();
    const w = makeWorld();
    expect(cargoOffers(w, from)).toEqual(cargoOffers(w, from));
  });

  it("stops offering a charter already taken", () => {
    const from = exportingPort();
    let w = makeWorld();
    const first = cargoOffers(w, from)[0];
    w = acceptCharter(w, first).world;
    expect(cargoOffers(w, from).map(o => o.id)).not.toContain(first.id);
  });
});

describe("the fee", () => {
  it("pays more for a longer passage", () => {
    const w = makeWorld();
    const short = freightFor(w, "a__b", "havana", "sugar_cane", 20, 100);
    const long = freightFor(w, "a__b", "havana", "sugar_cane", 20, 1400);
    expect(long).toBeGreaterThan(short);
  });

  it("pays danger money on a lane that has been preyed upon", () => {
    const lane = tradeRoutes()[0];
    const quiet = makeWorld();
    const dangerous = disruptRoute(quiet, lane.id);
    const calm = freightFor(quiet, lane.id, lane.to, lane.items[0], 20, lane.length);
    const risky = freightFor(dangerous, lane.id, lane.to, lane.items[0], 20, lane.length);
    expect(risky).toBeGreaterThan(calm);
  });

  it("pays most of all to run a cordon", () => {
    const lane = tradeRoutes()[0];
    const open = makeWorld();
    const shut: WorldState = {
      ...open,
      ports: { ...open.ports, [lane.to]: { ...open.ports[lane.to], blockadeDays: 10 } },
    };
    expect(freightFor(shut, lane.id, lane.to, lane.items[0], 20, lane.length))
      .toBeGreaterThan(freightFor(open, lane.id, lane.to, lane.items[0], 20, lane.length));
  });

  it("scales with the size of the cargo", () => {
    const w = makeWorld();
    expect(freightFor(w, "a__b", "havana", "rum", 40, 500))
      .toBeGreaterThan(freightFor(w, "a__b", "havana", "rum", 20, 500));
  });
});

describe("signing", () => {
  it("moves the goods out of the warehouse and into the hold", () => {
    const from = exportingPort();
    const w = makeWorld();
    const offer = cargoOffers(w, from)[0];
    const before = w.ports[from].inventory[offer.item] ?? 0;

    const { world, error } = acceptCharter(w, offer);
    expect(error).toBeUndefined();
    expect(world.ports[from].inventory[offer.item]).toBe(before - offer.qty);
    expect(world.entities.player_ship.ship!.cargo[offer.item]).toBe(offer.qty);
  });

  it("puts the charter in the quest log where the registry can rebuild it", () => {
    const from = exportingPort();
    const offer = cargoOffers(makeWorld(), from)[0];
    const { world } = acceptCharter(makeWorld(), offer);
    expect(activeCharters(world).map(c => c.id)).toEqual([offer.id]);
    expect(buildQuestRegistry(world)[offer.id]).toBeDefined();
  });

  it("refuses when the hold has no room", () => {
    const from = exportingPort();
    const w = makeWorld({}, 5);
    const offer = cargoOffers(w, from)[0];
    const { world, error } = acceptCharter(w, offer);
    expect(error).toBe("charter.no_room");
    expect(world).toBe(w);
  });

  it("refuses a third charter", () => {
    const from = exportingPort();
    let w = makeWorld();
    let taken = 0;
    for (const offer of cargoOffers(w, from)) {
      const result = acceptCharter(w, offer);
      if (!result.error) { w = result.world; taken++; }
    }
    expect(taken).toBe(MAX_ACTIVE_CHARTERS);
    const extra = cargoOffers(w, from)[0];
    if (extra) expect(acceptCharter(w, extra).error).toBe("charter.too_many");
  });

  it("refuses when the merchant no longer has the goods", () => {
    const from = exportingPort();
    const w = makeWorld();
    const offer = cargoOffers(w, from)[0];
    const stripped: WorldState = {
      ...w,
      ports: { ...w.ports, [from]: { ...w.ports[from], inventory: { [offer.item]: 1 } } },
    };
    expect(acceptCharter(stripped, offer).error).toBe("charter.no_stock");
  });

  it("does not mutate the world it is given", () => {
    const from = exportingPort();
    const w = makeWorld();
    const snapshot = structuredClone(w);
    acceptCharter(w, cargoOffers(w, from)[0]);
    expect(w).toEqual(snapshot);
  });
});

describe("delivering", () => {
  function signed(): { world: WorldState; contract: CargoContract } {
    const from = exportingPort();
    const w = makeWorld();
    const offer = cargoOffers(w, from)[0];
    return { world: acceptCharter(w, offer).world, contract: offer };
  }

  it("is not deliverable at sea, nor in the wrong port", () => {
    const { world, contract } = signed();
    expect(canDeliver(world, contract)).toBe(false);
    expect(canDeliver(ashore(world, contract.from), contract)).toBe(false);
  });

  it("is deliverable in the right port with the goods aboard", () => {
    const { world, contract } = signed();
    expect(canDeliver(ashore(world, contract.to), contract)).toBe(true);
  });

  it("is not deliverable once the cargo has been sold off", () => {
    const { world, contract } = signed();
    const sold: WorldState = {
      ...world,
      entities: {
        ...world.entities,
        player_ship: {
          ...world.entities.player_ship,
          ship: { ...world.entities.player_ship.ship!, cargo: {} },
        },
      },
    };
    expect(canDeliver(ashore(sold, contract.to), contract)).toBe(false);
  });

  it("moves the goods ashore and stamps the flag the quest watches", () => {
    const { world, contract } = signed();
    const at = ashore(world, contract.to);
    const before = at.ports[contract.to].inventory[contract.item] ?? 0;

    const { world: after, error } = deliverCharter(at, contract);
    expect(error).toBeUndefined();
    expect(after.ports[contract.to].inventory[contract.item]).toBe(before + contract.qty);
    expect(after.entities.player_ship.ship!.cargo[contract.item]).toBeUndefined();
    expect(after.worldFlags[cargoDeliveredFlag(contract)]).toBe(true);
  });

  it("pays through the quest machine, not from the delivery itself", () => {
    const { world, contract } = signed();
    const at = ashore(world, contract.to);
    const goldBefore = at.player.gold;

    // Delivery alone moves goods and nothing else.
    const handed = deliverCharter(at, contract).world;
    expect(handed.player.gold).toBe(goldBefore);

    // The quest machine is what pays.
    const advanced = advanceQuests(
      handed,
      { type: "flag_set", key: cargoDeliveredFlag(contract) },
      buildQuestRegistry(handed),
    );
    expect(advanced.world.player.gold).toBe(goldBefore + contract.reward);
    expect(advanced.world.player.reputation[contract.crown]).toBe(CHARTER_REPUTATION);
    expect(advanced.completed).toContain(contract.id);
  });

  it("refuses to deliver where the charter is not bound", () => {
    const { world, contract } = signed();
    expect(deliverCharter(world, contract).error).toBe("charter.not_here");
  });
});

describe("carrying it off", () => {
  it("costs standing and notoriety when the days run out", () => {
    const from = exportingPort();
    const w = makeWorld();
    const offer = cargoOffers(w, from)[0];
    let world = acceptCharter(w, offer).world;

    // Sail about until the charter lapses.
    for (let d = 0; d <= offer.days + 1; d++) {
      world = { ...world, time: { ...world.time, day: world.time.day + 1 } };
      const advanced = advanceQuests(world, { type: "days_passed", days: 0 }, buildQuestRegistry(world));
      world = advanced.world;
    }

    expect(activeCharters(world)).toEqual([]);
    expect(world.player.reputation[offer.crown]).toBe(CHARTER_BETRAYAL_REPUTATION);
    expect(world.player.notoriety).toBe(CHARTER_BETRAYAL_NOTORIETY);
    // And he still has the goods — that is the whole temptation.
    expect(world.entities.player_ship.ship!.cargo[offer.item]).toBe(offer.qty);
  });
});

describe("holdRoom", () => {
  it("counts what is already stowed", () => {
    const w = makeWorld({}, 100);
    expect(holdRoom(w)).toBe(100);
    const loaded: WorldState = {
      ...w,
      entities: {
        ...w.entities,
        player_ship: {
          ...w.entities.player_ship,
          ship: { ...w.entities.player_ship.ship!, cargo: { rum: 30 } },
        },
      },
    };
    expect(holdRoom(loaded)).toBe(70);
  });
});

describe("the quest definition", () => {
  it("is rebuilt identically from the contract, so a reload cannot move the deadline", () => {
    const from = exportingPort();
    const offer = cargoOffers(makeWorld(), from)[0];
    expect(cargoQuest(offer)).toEqual(cargoQuest(offer));
    expect(cargoQuest(offer).id).toBe(cargoQuestId(offer.from, offer.to, offer.item));
  });
});
