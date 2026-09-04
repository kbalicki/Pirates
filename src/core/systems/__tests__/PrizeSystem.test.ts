import { describe, it, expect } from "vitest";
import {
  computePrize, applyPrize,
  holdFill, holdTons, manifest, ladenTier,
  LADEN_SHARE, DEEP_LADEN_SHARE,
} from "../PrizeSystem.ts";
import { tradeRoutes, laneThroughput } from "../TradeRouteSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { initPortPrices, initPortInventory } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { ITEMS } from "../../data/items.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { portId, entityId, factionId, shipClassId } from "../../model/ids.ts";
import type { WorldState, PortRuntimeState } from "../../model/WorldState.ts";
import type { EntityState, ShipData } from "../../model/EntityState.ts";

// ===========================================================================
// PrizeSystem — what is actually aboard the ship you just took
// ===========================================================================

/**
 * Three questions, and they are all about the hold:
 *
 *   - how much of her cargo survives, which depends on whether she sank,
 *     struck or was carried;
 *   - how much of that fits in yours, which is the decision the mechanic
 *     exists to create;
 *   - what it does to the lane she was sailing, which is how preying on trade
 *     reaches the economy at all.
 */

function makeShipData(over: Partial<ShipData> = {}): ShipData {
  return {
    classId: shipClassId("merchantman"),
    factionId: factionId("spain"),
    hullHp: 100, hullMax: 100,
    sailsHp: 100, sailsMax: 100,
    cannons: 10,
    cargo: {},
    cargoCap: 100,
    crew: { current: 30, max: 50, morale: 0.6 },
    ...over,
  };
}

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

function makeWorld(playerShip: ShipData): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  for (const key of Object.keys(CITIES)) ports[key] = makePort(key);
  const player: EntityState = {
    id: entityId("player_ship"),
    kind: "ship",
    mode: "sailing",
    pos: { x: 100, y: 100 },
    vel: { x: 0, y: 0 },
    heading: 0,
    sailLevel: 0.5,
    depthOffset: 0,
    ship: playerShip,
  };
  return {
    version: 13,
    time: { day: 100, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: 1000,
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
    entities: { player_ship: player },
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
  };
}

function makeEnemy(ship: ShipData, ai?: EntityState["ai"]): EntityState {
  return {
    id: entityId("enemy"),
    kind: "ship",
    mode: "sailing",
    pos: { x: 120, y: 100 },
    vel: { x: 0, y: 0 },
    heading: 0,
    sailLevel: 0.5,
    depthOffset: 0,
    ship,
    ai,
  };
}

const total = (cargo: Record<string, number>) =>
  Object.values(cargo).reduce((s, q) => s + q, 0);

describe("computePrize — the hold", () => {
  it("brings nothing across from a ship that was carrying nothing", () => {
    const prize = computePrize(makeShipData(), makeShipData(), "captured");
    expect(prize.taken).toEqual({});
    expect(prize.spilled).toEqual({});
    expect(prize.cargoValue).toBe(0);
  });

  it("carries the whole hold across when she is taken and there is room", () => {
    const enemy = makeShipData({ cargo: { sugar_cane: 30, rum: 10 } });
    const player = makeShipData({ cargo: {}, cargoCap: 100 });
    const prize = computePrize(enemy, player, "captured");
    expect(prize.taken).toEqual({ sugar_cane: 30, rum: 10 });
    expect(prize.spilled).toEqual({});
  });

  it("loses half of it when she goes down under you", () => {
    const enemy = makeShipData({ cargo: { sugar_cane: 40 } });
    const prize = computePrize(enemy, makeShipData({ cargoCap: 200 }), "win");
    expect(prize.taken.sugar_cane).toBe(20);
  });

  it("saves more from a ship that struck than from one that sank", () => {
    const enemy = makeShipData({ cargo: { sugar_cane: 40 } });
    const roomy = makeShipData({ cargoCap: 200 });
    const sunk = computePrize(enemy, roomy, "win").taken.sugar_cane;
    const struck = computePrize(enemy, roomy, "surrender").taken.sugar_cane;
    const carried = computePrize(enemy, roomy, "captured").taken.sugar_cane;
    expect(struck).toBeGreaterThan(sunk);
    expect(carried).toBeGreaterThan(struck);
  });

  it("stops at the room in your own hold and leaves the rest in the water", () => {
    const enemy = makeShipData({ cargo: { sugar_cane: 60 } });
    const small = makeShipData({ cargo: {}, cargoCap: 20 });
    const prize = computePrize(enemy, small, "captured");
    expect(total(prize.taken)).toBe(20);
    expect(prize.spilled.sugar_cane).toBe(40);
  });

  it("counts what is already stowed against the room left", () => {
    const enemy = makeShipData({ cargo: { sugar_cane: 60 } });
    const half = makeShipData({ cargo: { food: 15 }, cargoCap: 20 });
    expect(total(computePrize(enemy, half, "captured").taken)).toBe(5);
  });

  it("takes the valuable goods first when the hold will not hold it all", () => {
    // Cocoa is worth twice sugar; a captain with room for ten takes the cocoa.
    expect(ITEMS.cocoa.basePrice).toBeGreaterThan(ITEMS.sugar_cane.basePrice);
    const enemy = makeShipData({ cargo: { sugar_cane: 40, cocoa: 40 } });
    const small = makeShipData({ cargo: {}, cargoCap: 10 });
    const prize = computePrize(enemy, small, "captured");
    expect(prize.taken).toEqual({ cocoa: 10 });
    expect(prize.spilled.sugar_cane).toBe(40);
  });

  it("takes nothing at all into a hold with no room", () => {
    const enemy = makeShipData({ cargo: { rum: 20 } });
    const full = makeShipData({ cargo: { food: 40 }, cargoCap: 40 });
    const prize = computePrize(enemy, full, "captured");
    expect(prize.taken).toEqual({});
    expect(prize.spilled.rum).toBe(20);
    expect(prize.gold).toBeGreaterThan(0); // the hull is still worth something
  });

  it("prices what came across at base prices", () => {
    const enemy = makeShipData({ cargo: { cocoa: 10 } });
    const prize = computePrize(enemy, makeShipData({ cargoCap: 100 }), "captured");
    expect(prize.cargoValue).toBe(10 * ITEMS.cocoa.basePrice);
  });
});

describe("computePrize — the purse", () => {
  it("pays by her tonnage, not by a die roll", () => {
    const small = makeShipData({ classId: shipClassId("sloop") });
    const big = makeShipData({ classId: shipClassId("galleon") });
    expect(SHIP_CLASSES.galleon.tonnage).toBeGreaterThan(SHIP_CLASSES.sloop.tonnage);
    const room = makeShipData({ cargoCap: 100 });
    expect(computePrize(big, room, "captured").gold)
      .toBeGreaterThan(computePrize(small, room, "captured").gold);
  });

  it("is deterministic — the same prize twice is the same prize", () => {
    const enemy = makeShipData({ cargo: { rum: 5 } });
    const player = makeShipData({ cargoCap: 50 });
    expect(computePrize(enemy, player, "win")).toEqual(computePrize(enemy, player, "win"));
  });

  it("pays best for a ship carried, worst for one sunk", () => {
    const enemy = makeShipData();
    const player = makeShipData({ cargoCap: 50 });
    expect(computePrize(enemy, player, "captured").gold)
      .toBeGreaterThan(computePrize(enemy, player, "win").gold);
  });

  it("answers an empty prize for no enemy at all", () => {
    expect(computePrize(undefined, makeShipData(), "win"))
      .toEqual({ taken: {}, spilled: {}, gold: 0, cargoValue: 0 });
  });
});

describe("applyPrize", () => {
  it("puts the cargo in the hold and the gold in the purse", () => {
    const w = makeWorld(makeShipData({ cargo: { food: 5 }, cargoCap: 100 }));
    const enemy = makeEnemy(makeShipData({ cargo: { rum: 20 } }));
    const { world, prize } = applyPrize(w, enemy, "captured");
    const hold = world.entities.player_ship.ship!.cargo;
    expect(hold.rum).toBe(20);
    expect(hold.food).toBe(5);
    expect(world.player.gold).toBe(w.player.gold + prize.gold);
  });

  it("does not mutate the world it is given", () => {
    const w = makeWorld(makeShipData({ cargoCap: 100 }));
    const snapshot = structuredClone(w);
    applyPrize(w, makeEnemy(makeShipData({ cargo: { rum: 10 } })), "captured");
    expect(w).toEqual(snapshot);
  });

  it("thins the lane a trader was sailing", () => {
    const lane = tradeRoutes()[0];
    const w = makeWorld(makeShipData({ cargoCap: 100 }));
    const enemy = makeEnemy(makeShipData({ cargo: { rum: 10 } }), {
      behavior: "trader",
      state: "travel",
      aggression: 0,
      awarenessRadius: 100,
      lastPortVisited: lane.from,
      targetPortId: portId(lane.to),
    });
    const { world } = applyPrize(w, enemy, "captured");
    expect(laneThroughput(world, lane.id)).toBeLessThan(1);
  });

  it("leaves the ledger alone for a warship, which is on no lane", () => {
    const lane = tradeRoutes()[0];
    const w = makeWorld(makeShipData({ cargoCap: 100 }));
    const enemy = makeEnemy(makeShipData(), {
      behavior: "navy",
      state: "travel",
      aggression: 0.5,
      awarenessRadius: 200,
      lastPortVisited: lane.from,
      targetPortId: portId(lane.to),
    });
    const { world } = applyPrize(w, enemy, "win");
    expect(world.routeDisruption ?? {}).toEqual({});
  });

  it("survives a trader whose ports are not a lane", () => {
    const w = makeWorld(makeShipData({ cargoCap: 100 }));
    const enemy = makeEnemy(makeShipData({ cargo: { rum: 4 } }), {
      behavior: "trader",
      state: "travel",
      aggression: 0,
      awarenessRadius: 100,
      lastPortVisited: "havana",
      targetPortId: portId("havana"),
    });
    const { world } = applyPrize(w, enemy, "win");
    expect(world.routeDisruption ?? {}).toEqual({});
  });
});

// ===========================================================================
// How she rides — what a lookout can report before anyone boards her
// ===========================================================================

describe("holdFill and ladenTier", () => {
  it("reads a hull with nothing aboard as in ballast", () => {
    const ship = makeShipData({ cargo: {}, cargoCap: 100 });
    expect(holdFill(ship)).toBe(0);
    expect(holdTons(ship)).toBe(0);
    expect(ladenTier(ship)).toBe(0);
  });

  it("reads a part cargo as laden and a full consignment as deep-laden", () => {
    const part = makeShipData({ cargo: { sugar_cane: 20 }, cargoCap: 100 });
    const full = makeShipData({ cargo: { sugar_cane: 70 }, cargoCap: 100 });
    expect(ladenTier(part)).toBe(1);
    expect(ladenTier(full)).toBe(2);
  });

  it("puts the thresholds exactly where the constants say", () => {
    const at = (units: number) => ladenTier(makeShipData({ cargo: { sugar_cane: units }, cargoCap: 100 }));
    expect(at(LADEN_SHARE * 100 - 1)).toBe(0);
    expect(at(LADEN_SHARE * 100)).toBe(1);
    expect(at(DEEP_LADEN_SHARE * 100 - 1)).toBe(1);
    expect(at(DEEP_LADEN_SHARE * 100)).toBe(2);
  });

  it("never reads deeper than full, whatever is stowed", () => {
    const overloaded = makeShipData({ cargo: { sugar_cane: 500 }, cargoCap: 100 });
    expect(holdFill(overloaded)).toBe(1);
  });

  it("answers for a hull that is not there at all", () => {
    expect(holdFill(undefined)).toBe(0);
    expect(ladenTier(undefined)).toBe(0);
    expect(manifest(undefined)).toEqual([]);
  });

  it("names the cargo in the order a prize crew would take it", () => {
    // cocoa is worth 20 a unit and sugar 10, so ten of cocoa outranks
    // fifteen of sugar — the same ranking `computePrize` shifts them in.
    const ship = makeShipData({ cargo: { sugar_cane: 15, cocoa: 10 }, cargoCap: 100 });
    expect(manifest(ship).map(h => h.item)).toEqual(["cocoa", "sugar_cane"]);
    expect(holdTons(ship)).toBe(25);
  });

  it("leaves out what is not aboard", () => {
    const ship = makeShipData({ cargo: { sugar_cane: 0, rum: 4 }, cargoCap: 100 });
    expect(manifest(ship)).toEqual([{ item: "rum", qty: 4 }]);
  });
});
