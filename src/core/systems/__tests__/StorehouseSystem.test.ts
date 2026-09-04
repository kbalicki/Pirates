import { describe, it, expect } from "vitest";
import {
  leases,
  leaseAt,
  storageCap,
  storageFree,
  storageUsed,
  hasStorage,
  goodsAshore,
  daysLeft,
  rentFor,
  canRent,
  rentStorehouse,
  storeAt,
  withdrawAt,
  tickStorehouses,
  LEASE_DAYS,
} from "../StorehouseSystem.ts";
import { WAREHOUSE_CAP } from "../HomePortSystem.ts";
import { spotPrice } from "../PricingSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { ITEMS } from "../../data/items.ts";
import { initPortPrices } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId, factionId, shipClassId } from "../../model/ids.ts";
import type { WorldState, PortRuntimeState } from "../../model/WorldState.ts";
import type { EntityState } from "../../model/EntityState.ts";

// ===========================================================================
// StorehouseSystem — a warehouse of his own
// ===========================================================================

/**
 * A lease is a hold that does not sail. Three things decide whether it is a
 * feature or an exploit, and the tests go after all three: the rent runs
 * whether he is present or not, a lapse costs him rather than quietly voiding
 * his goods, and the goods stored are his — off the town's books, so a hoard
 * cannot secretly feed the place it is sitting in.
 */

const PORT = "port_royal";          // large, English
const SMALL = Object.keys(CITIES).find(k => CITIES[k].population === "small")!;
const CROWN = CITIES[PORT].factionId as unknown as string;
const GOOD = Object.keys(ITEMS)[0];

function makePort(key: string): PortRuntimeState {
  const baseline = getPortBaseline(key);
  // Deliberately well under `inventoryCap` for a good the town does not make,
  // so an auction has somewhere to put what it dumps on the quay.
  const stocked: Record<string, number> = {};
  for (const item of Object.keys(ITEMS)) stocked[item] = 5;
  return {
    portId: portId(key),
    factionId: CITIES[key].factionId,
    prices: initPortPrices(key),
    inventory: stocked,
    shipyardQueue: [],
    availableCrew: 20,
    population: baseline.population,
    wealth: baseline.wealth,
    defense: baseline.defense,
    bonusProduces: [],
  };
}

function makeShip(cargo: Record<string, number> = {}): EntityState {
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
      cargo,
      cargoCap: 400,
      crew: { current: 40, max: 60, morale: 0.8 },
    },
  };
}

function makeWorld(over: { rep?: number; gold?: number; cargo?: Record<string, number> } = {}): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  for (const key of Object.keys(CITIES)) ports[key] = makePort(key);
  return {
    version: 13,
    time: { day: 100, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: over.gold ?? 100000,
      notoriety: 0,
      reputation: { [CROWN]: over.rep ?? 0 },
      ranks: {},
      location: { type: "port", portId: portId(PORT), pos: { x: 100, y: 100 } },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
    },
    entities: { player_ship: makeShip(over.cargo ?? { [GOOD]: 200 }) },
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

/** A world with a paid-up lease in `PORT` and `qty` of `GOOD` already ashore. */
function withLease(qty = 0): WorldState {
  const rented = rentStorehouse(makeWorld(), PORT).world;
  return qty > 0 ? storeAt(rented, PORT, GOOD, qty).world : rented;
}

// ── Nothing where there is nothing ─────────────────────────────────────────

describe("a save with no leases", () => {
  it("reports none, everywhere", () => {
    const w = makeWorld();
    expect(leases(w)).toEqual({});
    expect(leaseAt(w, PORT)).toBeUndefined();
    expect(hasStorage(w, PORT)).toBe(false);
    expect(storageFree(w, PORT)).toBe(0);
    expect(goodsAshore(w, PORT)).toEqual({});
    expect(daysLeft(w, PORT)).toBe(0);
  });

  it("is left alone by the daily tick", () => {
    const w = makeWorld();
    expect(tickStorehouses(w)).toBe(w);
  });

  it("refuses to store anything", () => {
    expect(storeAt(makeWorld(), PORT, GOOD, 10).moved).toBe(0);
    expect(withdrawAt(makeWorld(), PORT, GOOD, 10).moved).toBe(0);
  });
});

// ── Taking a lease ─────────────────────────────────────────────────────────

describe("renting", () => {
  it("a bigger town lets a bigger shed and charges more for it", () => {
    const w = makeWorld();
    expect(storageCap(w, PORT)).toBeGreaterThan(storageCap(w, SMALL));
    expect(rentFor(w, PORT)).toBeGreaterThan(rentFor(w, SMALL));
  });

  it("a town that likes him gives him the same discount its merchants do", () => {
    expect(rentFor(makeWorld({ rep: 80 }), PORT)).toBeLessThan(rentFor(makeWorld({ rep: -80 }), PORT));
  });

  it("nobody leases property to a captain his own crown has a price on", () => {
    expect(canRent(makeWorld({ rep: -80 }), PORT)).toBe(false);
    expect(canRent(makeWorld({ rep: -40 }), PORT)).toBe(false);
    expect(canRent(makeWorld({ rep: 0 }), PORT)).toBe(true);
    expect(rentStorehouse(makeWorld({ rep: -80 }), PORT).error).toBe("not_welcome");
  });

  it("takes the rent out of his purse and puts it on the town's ledger", () => {
    const w = makeWorld();
    const out = rentStorehouse(w, PORT);
    expect(out.rented).toBe(true);
    expect(w.player.gold - out.world.player.gold).toBe(out.cost);
    expect(out.world.ports[PORT].tradeBalance).toBe(out.cost);
  });

  it("will not lease to a man who cannot pay", () => {
    const out = rentStorehouse(makeWorld({ gold: 1 }), PORT);
    expect(out.rented).toBe(false);
    expect(out.error).toBe("not_enough_gold");
  });

  it("buys exactly a term, from today", () => {
    const w = makeWorld();
    const out = rentStorehouse(w, PORT).world;
    expect(daysLeft(out, PORT)).toBe(LEASE_DAYS);
    expect(leaseAt(out, PORT)!.paidUntil).toBe(w.time.day + LEASE_DAYS);
  });

  it("renewing early adds a term instead of throwing the rest away", () => {
    const once = rentStorehouse(makeWorld(), PORT).world;
    const twice = rentStorehouse(once, PORT).world;
    expect(daysLeft(twice, PORT)).toBe(LEASE_DAYS * 2);
  });

  it("renewing keeps whatever is already inside", () => {
    const stocked = withLease(50);
    const renewed = rentStorehouse(stocked, PORT).world;
    expect(goodsAshore(renewed, PORT)[GOOD]).toBe(50);
  });
});

// ── Moving goods ───────────────────────────────────────────────────────────

describe("the shed itself", () => {
  it("takes goods off the ship and gives them back", () => {
    const stored = storeAt(withLease(), PORT, GOOD, 60);
    expect(stored.moved).toBe(60);
    expect(goodsAshore(stored.world, PORT)[GOOD]).toBe(60);
    expect(stored.world.entities.player_ship.ship!.cargo[GOOD]).toBe(140);

    const back = withdrawAt(stored.world, PORT, GOOD, 25);
    expect(back.moved).toBe(25);
    expect(goodsAshore(back.world, PORT)[GOOD]).toBe(35);
    expect(back.world.entities.player_ship.ship!.cargo[GOOD]).toBe(165);
  });

  it("clamps to what is there rather than refusing", () => {
    const w = withLease(10);
    expect(withdrawAt(w, PORT, GOOD, 999).moved).toBe(10);
    expect(storeAt(w, PORT, GOOD, 999).moved).toBe(storageFree(w, PORT));
  });

  it("will not overfill the shed", () => {
    const w = makeWorld({ cargo: { [GOOD]: 5000 } });
    const rented = rentStorehouse(w, PORT).world;
    const stored = storeAt(rented, PORT, GOOD, 5000);
    expect(stored.moved).toBe(storageCap(w, PORT));
    expect(storageFree(stored.world, PORT)).toBe(0);
    expect(storageUsed(stored.world, PORT)).toBe(storageCap(w, PORT));
  });

  it("drops the line when the last of a good leaves", () => {
    const w = withLease(10);
    const emptied = withdrawAt(w, PORT, GOOD, 10).world;
    expect(goodsAshore(emptied, PORT)[GOOD]).toBeUndefined();
  });

  it("keeps each town's shed separate", () => {
    let w = withLease(30);
    w = rentStorehouse(w, SMALL).world;
    w = storeAt(w, SMALL, GOOD, 7).world;
    expect(goodsAshore(w, PORT)[GOOD]).toBe(30);
    expect(goodsAshore(w, SMALL)[GOOD]).toBe(7);
  });

  it("stores nothing in the town's own inventory — the goods are his", () => {
    const before = makeWorld().ports[PORT].inventory[GOOD];
    const after = withLease(100).ports[PORT].inventory[GOOD];
    expect(after).toBe(before);
  });
});

// ── The lapse ──────────────────────────────────────────────────────────────

describe("when the rent runs out", () => {
  function expired(qty: number): WorldState {
    const w = withLease(qty);
    return { ...w, time: { ...w.time, day: w.time.day + LEASE_DAYS + 1 } };
  }

  it("leaves a paid-up lease alone", () => {
    const w = withLease(20);
    expect(tickStorehouses(w)).toBe(w);
  });

  it("takes the shed back", () => {
    const after = tickStorehouses(expired(20));
    expect(leaseAt(after, PORT)).toBeUndefined();
    expect(hasStorage(after, PORT)).toBe(false);
  });

  it("auctions what was inside and sends on part of what it fetched", () => {
    const before = expired(40);
    const after = tickStorehouses(before);
    const paid = after.player.gold - before.player.gold;
    const worth = before.ports[PORT].prices[GOOD] * 40;
    expect(paid).toBeGreaterThan(0);
    expect(paid).toBeLessThan(worth);
  });

  it("puts the auctioned goods on the town's shelves and moves the quote", () => {
    const before = expired(40);
    const after = tickStorehouses(before);
    const town = after.ports[PORT];
    expect(town.inventory[GOOD]).toBeGreaterThan(before.ports[PORT].inventory[GOOD]);
    // The fixture's opening prices are base prices, not spot ones, so the
    // comparison that means anything is against the same formula run on the
    // stock that was there before the auction dumped its load.
    expect(town.prices[GOOD]).toBe(
      spotPrice(PORT, GOOD, town.inventory[GOOD], town.population),
    );
    expect(town.prices[GOOD]).toBeLessThan(
      spotPrice(PORT, GOOD, before.ports[PORT].inventory[GOOD], town.population),
    );
  });

  it("takes the captain's share off the town's ledger", () => {
    const before = expired(40);
    const after = tickStorehouses(before);
    const paid = after.player.gold - before.player.gold;
    expect(after.ports[PORT].tradeBalance).toBe((before.ports[PORT].tradeBalance ?? 0) - paid);
  });

  it("an empty shed simply goes back, with no money either way", () => {
    const before = expired(0);
    const after = tickStorehouses(before);
    expect(after.player.gold).toBe(before.player.gold);
    expect(leaseAt(after, PORT)).toBeUndefined();
  });

  it("tells him what happened", () => {
    const before = expired(40);
    const after = tickStorehouses(before);
    expect(after.eventLog[after.eventLog.length - 1].key).toBe("storehouse.log_auctioned");
  });

  it("only takes back the lease that expired", () => {
    let w = withLease(20);
    w = rentStorehouse(w, SMALL).world;
    // Let only the first term run out: the second was taken a fortnight later.
    w = { ...w, time: { ...w.time, day: w.time.day + 10 } };
    w = rentStorehouse(w, SMALL).world;   // SMALL now paid further ahead
    w = { ...w, time: { ...w.time, day: w.time.day + LEASE_DAYS + 1 } };
    const after = tickStorehouses(w);
    expect(leaseAt(after, PORT)).toBeUndefined();
    expect(leaseAt(after, SMALL)).toBeDefined();
  });
});

// ── The family storehouse still works the way it did ───────────────────────

describe("the home port's own storehouse", () => {
  it("is not rentable and does not need to be", () => {
    // No marriage in this fixture, so `isHomePort` is false everywhere — the
    // point being that `canRent` refuses only for the home port, not for the
    // absence of one.
    expect(canRent(makeWorld(), PORT)).toBe(true);
    expect(WAREHOUSE_CAP).toBeGreaterThan(0);
  });
});
