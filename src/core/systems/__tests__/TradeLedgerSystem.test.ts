import { describe, it, expect } from "vitest";
import {
  cargoValue,
  creditTrade,
  deliveryValue,
  settleDailyLedger,
  tradeIncome,
  GOLD_PER_WEALTH,
  MAX_TRADE_WEALTH_PER_DAY,
} from "../TradeLedgerSystem.ts";
import { spotPrice, repriceItem, repricePort } from "../PricingSystem.ts";
import { economyDailyTick } from "../EconomyTickSystem.ts";
import { executeBuy, executeSell, playerBuyPrice, playerSellPrice } from "../EconomySystem.ts";
import { routesTo, routesFrom } from "../TradeRouteSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { ITEMS } from "../../data/items.ts";
import { initPortPrices, initPortInventory } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId, factionId, shipClassId, itemId } from "../../model/ids.ts";
import type { WorldState, PortRuntimeState } from "../../model/WorldState.ts";
import type { EntityState } from "../../model/EntityState.ts";

// ===========================================================================
// TradeLedgerSystem + PricingSystem — money follows goods
// ===========================================================================

/**
 * Two halves of the same release. `PricingSystem` says a quote is a function
 * of the stock behind it *whenever* the stock moves, not once a night; the
 * ledger says every movement of goods has a payment on the other side of it.
 *
 * The things worth pinning down are the ones that were wrong before, and the
 * ones that could plausibly go wrong now:
 *
 *   - a hold sold into one town does not all go at the price of the first ton;
 *   - a town on lanes settles measurably richer than the same town off them,
 *     and — the trap `project_ceiling_not_equilibrium` describes — it settles
 *     somewhere finite rather than climbing to the clamp;
 *   - the player's gold really leaves the town when the town buys from him.
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

function makeShip(cargoCap = 400): EntityState {
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
      gold: 100000,
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
    entities: { player_ship: makeShip() },
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
    ...over,
  } as unknown as WorldState;
}

function runDays(world: WorldState, days: number): WorldState {
  let w = world;
  for (let i = 0; i < days; i++) {
    w = { ...w, time: { ...w.time, day: w.time.day + 1 } };
    w = economyDailyTick(w);
  }
  return w;
}

// ── PricingSystem ──────────────────────────────────────────────────────────

describe("spotPrice — a quote is a function of the stock behind it", () => {
  const item = CITIES.port_royal.demands[0];

  it("a scarce good is dearer than a plentiful one", () => {
    const scarce = spotPrice("port_royal", item, 0, 10000);
    const plentiful = spotPrice("port_royal", item, 200, 10000);
    expect(scarce).toBeGreaterThan(plentiful);
  });

  it("never falls to nothing however big the glut", () => {
    expect(spotPrice("port_royal", item, 1e6, 10000)).toBeGreaterThanOrEqual(1);
  });

  it("event multipliers ride on top of it", () => {
    const plain = spotPrice("port_royal", item, 20, 10000);
    const doubled = spotPrice("port_royal", item, 20, 10000, 2);
    expect(doubled).toBeGreaterThan(plain);
  });

  it("is the same arithmetic the daily tick uses", () => {
    // The extraction must not have changed a number. One day of ticking, then
    // ask this module what the quote should be from the stock that came out.
    const after = runDays(makeWorld(), 1).ports.port_royal;
    for (const key of Object.keys(ITEMS)) {
      expect(after.prices[key]).toBe(
        spotPrice("port_royal", key, after.inventory[key] ?? 0, after.population),
      );
    }
  });
});

describe("repriceItem / repricePort", () => {
  it("requotes one good against the stock now on the shelf", () => {
    const w = makeWorld();
    const item = CITIES.port_royal.demands[0];
    const emptied = {
      ...w,
      ports: {
        ...w.ports,
        port_royal: { ...w.ports.port_royal, inventory: { ...w.ports.port_royal.inventory, [item]: 0 } },
      },
    };
    const before = w.ports.port_royal.prices[item];
    const after = repriceItem(emptied, "port_royal", item)!.prices[item];
    expect(after).toBeGreaterThan(before);
  });

  it("leaves the port object alone when nothing moved", () => {
    const w = makeWorld();
    const settled = runDays(w, 1);
    const item = CITIES.port_royal.demands[0];
    expect(repriceItem(settled, "port_royal", item)).toBe(settled.ports.port_royal);
  });

  it("answers null for a port or an item that does not exist", () => {
    const w = makeWorld();
    expect(repriceItem(w, "atlantis", "sugar")).toBeNull();
    expect(repriceItem(w, "port_royal", "moonrock")).toBeNull();
    expect(repricePort(w, "atlantis", ["sugar"])).toBeNull();
  });

  it("takes a replacement inventory and quotes against that", () => {
    const w = makeWorld();
    const item = CITIES.port_royal.demands[0];
    const stuffed = { ...w.ports.port_royal.inventory, [item]: 5000 };
    const out = repricePort(w, "port_royal", [item], stuffed)!;
    expect(out.inventory[item]).toBe(5000);
    expect(out.prices[item]).toBeLessThan(w.ports.port_royal.prices[item]);
  });
});

// ── The ledger's arithmetic ────────────────────────────────────────────────

describe("cargoValue", () => {
  it("values a parcel at the port's posted prices", () => {
    const port = makePort("port_royal");
    const item = Object.keys(ITEMS)[0];
    expect(cargoValue(port, { [item]: 3 })).toBe(port.prices[item] * 3);
  });

  it("ignores empty and negative lines, and an absent port is worth nothing", () => {
    const port = makePort("port_royal");
    expect(cargoValue(port, { sugar: 0, rum: -5 })).toBe(0);
    expect(cargoValue(undefined, { sugar: 10 })).toBe(0);
  });
});

describe("deliveryValue — who gets what out of a voyage", () => {
  it("pays the exporter what the cargo cost on his own quay", () => {
    expect(deliveryValue(100, 180).paid).toBe(100);
  });

  it("gives the importer a share of the difference", () => {
    expect(deliveryValue(100, 180).margin).toBe(40);
  });

  it("pays no margin when the cargo is worth less at the far end", () => {
    expect(deliveryValue(100, 60).margin).toBe(0);
  });

  it("caps the margin, so a famine does not enrich the starving town", () => {
    // Quoted at four times what it cost: the cut is capped at the cost itself
    // before the share is taken, so 100 in never clears more than 50.
    expect(deliveryValue(100, 400).margin).toBe(50);
  });
});

describe("settleDailyLedger", () => {
  it("converts gold to wealth at one rate", () => {
    expect(settleDailyLedger(GOLD_PER_WEALTH)).toBeCloseTo(1, 6);
    expect(settleDailyLedger(-GOLD_PER_WEALTH)).toBeCloseTo(-1, 6);
  });

  it("keeps the fraction — this is the whole reason the ledger exists", () => {
    expect(settleDailyLedger(GOLD_PER_WEALTH / 2)).toBeCloseTo(0.5, 6);
  });

  it("is bounded in both directions", () => {
    expect(settleDailyLedger(1e9)).toBe(MAX_TRADE_WEALTH_PER_DAY);
    expect(settleDailyLedger(-1e9)).toBe(-MAX_TRADE_WEALTH_PER_DAY);
  });
});

describe("creditTrade", () => {
  it("accrues gold across several settlements in one day", () => {
    let port = makePort("port_royal");
    port = creditTrade(port, 120);
    port = creditTrade(port, -20);
    expect(port.tradeBalance).toBe(100);
  });

  it("leaves the port untouched for a zero credit", () => {
    const port = makePort("port_royal");
    expect(creditTrade(port, 0)).toBe(port);
  });

  it("starts from nothing on a save that predates the ledger", () => {
    const port = makePort("port_royal");
    expect(port.tradeBalance).toBeUndefined();
    expect(creditTrade(port, 50).tradeBalance).toBe(50);
  });
});

// ── The loop, end to end ───────────────────────────────────────────────────

describe("the lane money loop", () => {
  it("files the day's turnover where the port screen can read it", () => {
    const w = runDays(makeWorld(), 5);
    expect(tradeIncome(w, "port_royal")).toBeGreaterThan(0);
    expect(w.ports.port_royal.tradeBalance).toBe(0);
  });

  it("reports nothing for a world written before the ledger existed", () => {
    expect(tradeIncome(makeWorld(), "port_royal")).toBe(0);
  });

  it("makes a town on many lanes richer than its baseline", () => {
    // Port Royale is where a dozen lanes end. Left alone it should now settle
    // above the number it would have had with no shipping at all.
    const settled = runDays(makeWorld(), 400).ports.port_royal;
    expect(routesTo("port_royal").length + routesFrom("port_royal").length).toBeGreaterThan(4);
    expect(settled.wealth).toBeGreaterThan(getPortBaseline("port_royal").wealth);
  });

  it("settles somewhere finite instead of climbing to the clamp", () => {
    // `project_ceiling_not_equilibrium`: the interesting number is where it
    // stops, not what it is pulled toward. Four hundred days and eight hundred
    // days must agree.
    const at400 = runDays(makeWorld(), 400).ports.port_royal.wealth;
    const at800 = runDays(makeWorld(), 800).ports.port_royal.wealth;
    expect(at800).toBeCloseTo(at400, 1);
    expect(at800).toBeLessThan(1000);
  });

  it("leaves a town at the end of no lane exactly where it was", () => {
    const idle = Object.keys(CITIES).find(
      k => routesTo(k).length === 0 && routesFrom(k).length === 0,
    );
    if (!idle) return; // every town is on the network; nothing to check
    const settled = runDays(makeWorld(), 200).ports[idle];
    expect(settled.tradeIncome).toBe(0);
  });

  it("pays a shut-in port far less than an open one", () => {
    // A cordon does not stop trade dead — smugglers still get in, and the
    // supply model has always said so — but it takes most of it, at both ends:
    // nothing lands here, and the towns this one supplies fall back to a
    // trickle. Both halves come off the same ledger.
    const open = runDays(makeWorld(), 3).ports.port_royal;
    const shut = makeWorld();
    shut.ports.port_royal = { ...shut.ports.port_royal, blockadeDays: 10 };
    const under = runDays(shut, 3).ports.port_royal;
    expect(under.tradeIncome!).toBeLessThan(open.tradeIncome!);
  });

  it("and a blockade costs it wealth as well as goods", () => {
    const shut = makeWorld();
    shut.ports.port_royal = { ...shut.ports.port_royal, blockadeDays: 10 };
    const under = runDays(shut, 30).ports.port_royal;
    const free = runDays(makeWorld(), 30).ports.port_royal;
    expect(under.wealth).toBeLessThan(free.wealth);
  });
});

// ── The player at the counter ──────────────────────────────────────────────

describe("the player is an economic actor now", () => {
  const item = CITIES.port_royal.produces[0];

  it("his gold goes onto the town's ledger when he buys", () => {
    const w = makeWorld();
    const out = executeBuy(w, portId("port_royal"), itemId(item), 5);
    expect(out.error).toBeUndefined();
    const spent = w.player.gold - out.world.player.gold;
    expect(spent).toBeGreaterThan(0);
    expect(out.world.ports.port_royal.tradeBalance).toBe(spent);
  });

  it("and comes off it when the town buys from him", () => {
    const bought = executeBuy(makeWorld(), portId("port_royal"), itemId(item), 20).world;
    const out = executeSell(bought, portId("port_royal"), itemId(item), 20);
    expect(out.error).toBeUndefined();
    const earned = out.world.player.gold - bought.player.gold;
    expect(earned).toBeGreaterThan(0);
    expect(out.world.ports.port_royal.tradeBalance).toBe(
      (bought.ports.port_royal.tradeBalance ?? 0) - earned,
    );
  });

  it("a hold sold in one town does not all go at the first ton's price", () => {
    // The bug this pins: prices were recomputed once a night, so two hundred
    // tons dumped on a village went at the price of the first one and the
    // whole trading game was "find the biggest spread and repeat".
    let w = makeWorld();
    w = {
      ...w,
      entities: {
        ...w.entities,
        player_ship: {
          ...w.entities.player_ship,
          ship: { ...w.entities.player_ship.ship!, cargo: { [item]: 300 } },
        },
      },
    };
    const first = playerSellPrice(w, "port_royal", item);
    const after = executeSell(w, portId("port_royal"), itemId(item), 200).world;
    const later = playerSellPrice(after, "port_royal", item);
    expect(later).toBeLessThan(first);
  });

  it("and buying a warehouse out makes the next ton dearer", () => {
    const w = makeWorld();
    const first = playerBuyPrice(w, "port_royal", item);
    const stock = w.ports.port_royal.inventory[item] ?? 0;
    const after = executeBuy(w, portId("port_royal"), itemId(item), Math.floor(stock * 0.9)).world;
    expect(playerBuyPrice(after, "port_royal", item)).toBeGreaterThan(first);
  });

  it("a day's trading with him moves the town's wealth by a bounded amount", () => {
    let w = makeWorld();
    w = {
      ...w,
      entities: {
        ...w.entities,
        player_ship: {
          ...w.entities.player_ship,
          ship: { ...w.entities.player_ship.ship!, cargo: { [item]: 400 }, cargoCap: 4000 },
        },
      },
    };
    const before = w.ports.port_royal.wealth;
    const sold = executeSell(w, portId("port_royal"), itemId(item), 400).world;
    const after = runDays(sold, 1).ports.port_royal.wealth;
    expect(after).toBeLessThan(before);
    expect(before - after).toBeLessThanOrEqual(MAX_TRADE_WEALTH_PER_DAY + 3);
  });
});


// ===========================================================================
// Gold — a good that exists only where it is struck (v0.29.0)
// ===========================================================================

/**
 * `gold_discovery` has put "gold" in a town's `bonusProduces` since v0.9.7 and
 * the daily tick has priced it ever since, but it was not in `ITEMS` — so the
 * merchant's counter never listed it and `executeBuy` turned it away as an
 * unknown item. The one event in the table whose point is that it leaves
 * something behind left something nobody in the game could touch.
 */

describe("gold", () => {
  it("is a real good, and a rare one", () => {
    expect(ITEMS.gold).toBeDefined();
    expect(ITEMS.gold.rare).toBe(true);
  });

  it("is in nobody's warehouse when the world is made", () => {
    for (const key of Object.keys(CITIES)) {
      expect(initPortInventory(key).gold, key).toBe(0);
    }
  });

  it("can be bought where it has been struck", () => {
    const base = makeWorld();
    const world: WorldState = {
      ...base,
      ports: {
        ...base.ports,
        havana: {
          ...base.ports.havana,
          bonusProduces: ["gold"],
          inventory: { ...base.ports.havana.inventory, gold: 40 },
        },
      },
    };
    const bought = executeBuy(world, portId("havana"), itemId("gold"), 10);
    expect(bought.error).toBeUndefined();
    const hold = bought.world.entities.player_ship.ship!.cargo.gold ?? 0;
    expect(hold).toBe(10);
  });

  it("is worth carrying: dear where there is none, cheap where they dig it", () => {
    // The whole reason the event is worth sailing to. A strike town's warehouse
    // is full, so its quote is low; anywhere else has none at all.
    const base = makeWorld();
    const struck: WorldState = {
      ...base,
      ports: {
        ...base.ports,
        havana: {
          ...base.ports.havana,
          bonusProduces: ["gold"],
          inventory: { ...base.ports.havana.inventory, gold: 40 },
        },
      },
    };
    // After a day, which is when the world quotes anything: `initPortPrices`
    // hands every town the same static base price for a good none of them has
    // ever seen, and it is the daily requote that turns an empty warehouse into
    // a high quote and a full one into a low one.
    const priced = runDays(struck, 1);
    const ask = playerBuyPrice(priced, "havana", "gold");
    const bid = playerSellPrice(priced, "tortuga", "gold");
    expect(bid).toBeGreaterThan(ask * 1.5);
  });
});
