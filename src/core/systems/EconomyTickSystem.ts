/**
 * Economy Tick — daily simulation of the Caribbean economy.
 *
 * Called once per game day (from WorldEngine, when day rolls over).
 * Order of operations per port:
 *
 *   1. Apply one-shot event effects (pirate_raid hit, gold strike, etc.)
 *   2. Compute aggregated daily multipliers from active events
 *   3. Production: produced goods → inventory (multiplied by event)
 *   3.5 Imports: an order is placed with whoever is actually shipping today
 *   3.6 Rationing: a supplier short of stock fills his orders pro rata
 *   4. Consumption: demanded goods drain inventory (multiplied by event)
 *   5. Price recompute from supply/demand ratio × marketModifier × eventPriceMul
 *   6. Apply per-day flat deltas (pop/wealth/defense)
 *   7. Natural recovery toward baseline (slow drift)
 *
 * Since v0.26.0 the goods a lane lands come *out of the exporter's warehouse*,
 * which is why steps 3.5 and 3.6 are separate passes over every port rather
 * than lines inside one loop — see `economyDailyTick`.
 */

import type { WorldState, PortRuntimeState } from "../model/WorldState.ts";
import { CITIES } from "../data/cities.ts";
import { ITEMS } from "../data/items.ts";
import {
  getPortBaseline,
  baselineProductionRate,
  baselineConsumptionRate,
  inventoryCap,
} from "../data/economyBaselines.ts";
import {
  getAggregatedEffects,
  applyOneShotEffects,
} from "./EventEffectsSystem.ts";
import { heldDefenseCeiling, heldPopulationCeiling, playerHolds } from "./ReconquestSystem.ts";
import {
  effectiveSupplier,
  laneClients,
  laneSupplyShare,
  routeSupplying,
} from "./TradeRouteSystem.ts";
import { blockadeEffective, portShutIn, BLOCKADE_SUPPLY_SHARE } from "./BlockadeSystem.ts";
import { spotPrice } from "./PricingSystem.ts";
import { deliveryValue, settleDailyLedger } from "./TradeLedgerSystem.ts";

/**
 * Share of a town's daily need that the trade it does not control brings in.
 *
 * The hole this fills, found while measuring v0.19.0: a port consumes
 * `def.demands` out of its own inventory, and **nothing ever put them there**.
 * There is no inter-port trade simulation, so every good a town demands but
 * does not produce was short every single day, for ever. Port Royale demands
 * sugar, cocoa and tobacco and produces neither, so it took a flat -3 wealth a
 * day from the day the world was made and settled at 353 against a baseline of
 * 600. Every port in the game was quietly starving.
 *
 * Licensed trade is the abstraction that fixes it: a colony under a crown is on
 * somebody's shipping routes and gets what it needs. It is not a fudge — it is
 * the thing the rest of the module has been talking about all along, and it
 * gives the black flag a *mechanism* rather than a modifier: a town nobody's
 * merchants will call at gets smugglers, and smugglers bring a third of what a
 * packet would.
 */
const IMPORT_SHARE_CROWN = 1.0;

/**
 * What the smugglers bring a town under the black flag, and what makes it more.
 *
 * The floor is what a den gets from the trade that will deal with anybody: a
 * third of what a licensed packet would land. On top of it sits the captain's
 * own name, and that is the point of this function.
 *
 * The alternative — the one v0.19.0 tried and v0.25.0 measured again before
 * dropping it for good — was to pull a held town's *wealth* toward a smaller
 * target. It cannot work, and the arithmetic says why. A held Port Royale runs
 * a standing shortage worth about 3.8 wealth a day, and the pull toward
 * baseline is 1% of the gap, so the town settles wherever the gap is 380: at a
 * royal target of 600 that is 223, and at any target below 380 it is **zero**.
 * Measured both ways: a 0.62 target and a flat daily upkeep each emptied the
 * town inside a year. The target is not the lever. What reaches the quay is.
 *
 * So a den's fortunes ride on its captain's reputation among the brethren,
 * which is a lever he already pulls every time he takes a prize:
 *
 *     share = 0.35 + min(1, notoriety / 100) * 0.4      → 0.35 .. 0.75
 *
 * A nobody's den starves at 223. A captain the whole Caribbean has heard of
 * keeps his town at better than four hundred, because the men who will not sell
 * to a colonial factor will sell to him. It is the first thing notoriety has
 * ever been *worth*, rather than merely cost.
 */
const IMPORT_SHARE_BLACK_FLAG = 0.35;
const IMPORT_NOTORIETY_BONUS = 0.4;
const IMPORT_NOTORIETY_FULL = 100;

export function blackFlagImportShare(world: WorldState): number {
  const fame = Math.min(1, Math.max(0, world.player.notoriety ?? 0) / IMPORT_NOTORIETY_FULL);
  return IMPORT_SHARE_BLACK_FLAG + fame * IMPORT_NOTORIETY_BONUS;
}
/**
 * Wealth lost per demanded good per day when the town cannot get all of it.
 *
 * Scaled by how much of the need went unmet, and **zero when the need is met**.
 * The old form was `+drained * 0.3` and a flat `-1` for any shortfall at all,
 * which made a fully supplied town impossible: the penalty fired even at 99%.
 * Now a supplied town sits at its target and a starved one falls below it,
 * which is what the target was always supposed to mean.
 */
const SHORTAGE_WEALTH_PER_ITEM = 2;

/**
 * A port nobody's licensed shipping will lade at today.
 *
 * `portShutIn` answers the physical question — is there a cordon across this
 * harbour mouth, is the port closed. The black flag is the other kind of shut:
 * the water is open and the wharves are working, and no crown's merchant will
 * put his consignment aboard a hull clearing from a pirate den. Both stop a
 * lane at its origin, so both belong in the answer `laneSupplyShare` is given.
 *
 * This is what makes taking a town an act against the *sea* and not only
 * against the town. Havana supplies four colonies with sugar; hold Havana and
 * those four go looking for another grower or go short, which is the first
 * strategic consequence of a conquest the player can feel from the far side of
 * the map.
 */
export function supplierShutIn(world: WorldState, portKey: string): boolean {
  return portShutIn(world, portKey) || playerHolds(world, portKey);
}

/**
 * How hard a plantation works to refill a warehouse the trade has drawn down.
 *
 * Since v0.26.0 a lane delivery physically leaves the exporter's warehouse, so
 * a producer's stock is no longer a number that only ever goes up. Something
 * has to put it back, and the honest something is the producer himself working
 * harder when his sheds are empty — up to `1 + RESTOCK_SURGE` times his normal
 * output at an empty warehouse, and exactly his normal output at a full one.
 *
 * The warehouse is therefore the memory of the whole mechanism: no new field in
 * the save, no capacity that has to be tracked and migrated. A port that has
 * been carrying somebody else's trade for a fortnight *looks* like it, because
 * its sheds are low and its prices are up, and it recovers by the same
 * arithmetic that drained it.
 */
const RESTOCK_SURGE = 1.0;

/**
 * Share of a producer's stock that never goes down the lanes, whoever asks.
 *
 * A quay does not ship its last barrel to a stranger. This never binds in the
 * settled world — a committed exporter's lanes ask for a few days' output out
 * of a warehouse holding a month's — and binds only under a reroute, which is
 * exactly where it is wanted: the town taking over a blockaded rival's runs
 * runs short *before* its own shelves are bare.
 */
const EXPORT_RESERVE = 0.15;

/**
 * Tons a day the lanes leaving this port expect of `item`.
 *
 * The map's answer, not today's: the clients of the *named* supplier, which is
 * what the plantations were planted for. A port that has been shut in still
 * counts here (see `laneClients`), and the port quietly covering its runs does
 * not — the cover comes out of stock nobody planted for, and that gap is the
 * cost of a reroute.
 */
function laneCommitment(world: WorldState, portKey: string, item: string): number {
  let total = 0;
  for (const client of laneClients(portKey, item)) {
    const port = world.ports[client];
    if (!port) continue;
    total += baselineConsumptionRate(client, item, port.population);
  }
  return total;
}

/**
 * What this port is shipping today for lanes that were never its own.
 *
 * Derived, never stored: a town covers a rival's runs exactly while that rival
 * is shut in, and the moment the cordon lifts or the black flag comes down the
 * trade goes home. Deriving it also means the answer cannot drift out of step
 * with what the daily tick actually does, because both are reading the same
 * two functions.
 *
 * The player meets this at the merchant's counter, where the prices have
 * doubled and the shelves are bare and the reason is three hundred miles away.
 */
export function reroutedOnto(
  world: WorldState,
  portKey: string,
): { item: string; tons: number }[] {
  const covered: Record<string, number> = {};
  const shutIn = (port: string) => supplierShutIn(world, port);
  if (shutIn(portKey)) return [];

  for (const [clientKey, client] of Object.entries(world.ports)) {
    const def = CITIES[clientKey];
    if (!def || clientKey === portKey) continue;
    for (const item of def.demands) {
      if (def.produces.includes(item)) continue;
      const route = routeSupplying(clientKey, item);
      // Its own lanes are its business; only somebody else's count as cover.
      if (!route || route.from === portKey) continue;
      if (effectiveSupplier(clientKey, item, shutIn) !== portKey) continue;
      covered[item] = (covered[item] ?? 0)
        + baselineConsumptionRate(clientKey, item, client.population);
    }
  }

  return Object.entries(covered)
    .map(([item, tons]) => ({ item, tons: Math.round(tons * 10) / 10 }))
    .sort((a, b) => b.tons - a.tons);
}

const RECOVERY_WEALTH = 0.01;     // 1% per day toward baseline
const RECOVERY_POPULATION = 0.005; // 0.5% per day
const RECOVERY_DEFENSE = 0.02;    // 2% per day

/**
 * Run a single day of economy simulation across all ports.
 * Pure function — returns a new WorldState.
 *
 * Four passes since v0.26.0, and the reason is that a lane delivery now moves
 * goods *out* of one warehouse as well as into another. A single pass over
 * `Object.keys(ports)` cannot do that: whether Havana can fill Tortuga's order
 * depends on what Santiago and Bridgetown asked of her the same morning, and
 * half of them come later in the map's key order than she does. So the day is:
 *
 *   1. every port grows its crop and writes its orders;
 *   2. each supplier's book is compared with the orders standing at his quay,
 *      and short-shipped pro rata if they come to more than he has;
 *   3. the cargo lands, and both ends of each lane are paid for it;
 *   4. what shipped leaves the exporter's sheds, the towns eat, prices are
 *      requoted and the slow pull toward baseline is applied.
 *
 * The rationing in pass 2 is the point of the whole rearrangement: it is what
 * makes a second source a *finite* one, and a blockade something a region can
 * absorb for a few weeks rather than for ever.
 */
export function economyDailyTick(world: WorldState): WorldState {
  // 1. One-shot event hits (raid/hurricane/strike etc.)
  const w = applyOneShotEffects(world);

  const newPorts = { ...w.ports };
  const itemKeys = Object.keys(ITEMS);
  const shutIn = (port: string) => supplierShutIn(w, port);

  /**
   * Gold each port earns or spends on the lanes today (v0.24.0).
   *
   * Filled during the pass and settled after it, because a delivery pays the
   * port at the *other* end of the lane — a port the loop may have finished
   * with an hour ago, or may not have reached yet. Accumulating it and
   * settling once is the only order that gives the same answer whichever way
   * `Object.keys` happens to come out.
   */
  const laneGold: Record<string, number> = {};

  /** An order standing at a supplier's quay this morning. */
  type Order = { from: string | undefined; want: number };

  /** A port's books, worked out but not yet clamped, rounded or written back. */
  type Books = {
    port: PortRuntimeState;
    effects: ReturnType<typeof getAggregatedEffects>;
    tradingPaused: boolean;
    /** Everything this port grows today, including event bonuses. */
    produces: string[];
    /** Stock after production, before exports and eating. May exceed the cap. */
    inventory: Record<string, number>;
    /** What its lanes are asking of the rest of the sea, by item. */
    orders: Record<string, Order>;
    wealth: number;
    population: number;
    defense: number;
  };
  const books: Record<string, Books> = {};

  /** "<supplier>|<item>" -> tons his lanes are asking of him today. */
  const asked: Record<string, number> = {};

  // ── Pass 1: crops in the ground, orders on the quay ──────────────────────
  for (const portKey of Object.keys(newPorts)) {
    const port = newPorts[portKey];
    const def = CITIES[portKey];
    if (!port || !def) continue;

    const effects = getAggregatedEffects(w, portKey);

    // Skip closed ports for trade simulation (still apply recovery + events)
    const tradingPaused = effects.portClosed;

    // Active produces = base + bonus (e.g. "gold" from gold_discovery)
    const allProduces = [...def.produces, ...port.bonusProduces];

    const inventory = { ...port.inventory };
    const orders: Record<string, Order> = {};
    const wealth = port.wealth + effects.wealthDelta;
    const population = port.population + effects.popDelta;
    const defense = port.defense + effects.defenseDelta;

    if (!tradingPaused) {
      // 3. Production
      //
      // Two terms the module did not have before v0.26.0. `committed` is what
      // the lanes leaving this port take away every day — output that was
      // always arriving at the far end and simply had no origin until the
      // warehouse started paying for it, so adding it here keeps the settled
      // world exactly where it was. `surge` is the producer's answer to an
      // empty shed, and it is what lets a town recover from carrying a
      // neighbour's trade.
      //
      // Deliberately *not* clamped to the cap here: exports come off this
      // number in pass 4 and the clamp happens after them. Clamping first
      // would make a committed exporter's stock saw up and down by a quarter
      // every day, and his prices with it.
      for (const item of allProduces) {
        if (!ITEMS[item] && item !== "gold") continue;
        const base = baselineProductionRate(portKey, item, port.wealth);
        // bonus produces (e.g. gold) get a flat rate even if not in CityDef
        const rate = base > 0 ? base : 3;
        const cap = inventoryCap(portKey, item);
        const stock = inventory[item] ?? 0;
        const empty = cap > 0 ? Math.max(0, Math.min(1, (cap - stock) / cap)) : 0;
        const committed = laneCommitment(w, portKey, item);
        const produced = (rate * (1 + RESTOCK_SURGE * empty) + committed) * effects.productionMul;
        inventory[item] = stock + produced;
      }

      // 3.5 Imports — the trade the town does not control (v0.20.0)
      //
      // Only for goods it demands and does not make itself; a producer supplies
      // its own. Inside the `tradingPaused` guard on purpose: a blockaded or
      // closed port is exactly one that is not being supplied.
      // Since v0.22.0 the share is no longer flat. Three things multiply:
      // whose flag flies here, whether the lane that carries this particular
      // good is still sailing (`laneSupplyShare` — a good with no producer
      // anywhere, such as water, has no lane and cannot be cut), and whether
      // somebody is standing off the harbour with the guns run out.
      //
      // What comes of it is an *order*, not a delivery: since v0.26.0 the
      // exporter has to have the goods, and whether he has them depends on who
      // else is asking him this morning. Pass 2 answers that.
      const flagShare = playerHolds(w, portKey) ? blackFlagImportShare(w) : IMPORT_SHARE_CROWN;
      const cordon = blockadeEffective(w, portKey) ? BLOCKADE_SUPPLY_SHARE : 1;
      for (const item of def.demands) {
        if (allProduces.includes(item)) continue;
        const need = baselineConsumptionRate(portKey, item, port.population);
        const cap = inventoryCap(portKey, item);
        const lane = laneSupplyShare(w, portKey, item, shutIn);
        // What the warehouse will not take is not ordered and is not paid for,
        // so the room is part of the order rather than a clamp after it.
        const room = Math.max(0, cap - (inventory[item] ?? 0));
        const want = Math.min(need * flagShare * lane * cordon * effects.importMul, room);
        if (want <= 0) continue;
        // Who is actually shipping it. Not the lane's named supplier if he is
        // shut in — a cordon or a black flag sends the trade to the next
        // grower, and until v0.25.0 the ledger went on paying the man whose
        // harbour was closed. When nobody within reach is open the goods still
        // trickle in, but they come by smugglers: no warehouse anywhere is
        // drawn down for them and no counting house books them.
        const from = effectiveSupplier(portKey, item, shutIn);
        orders[item] = { from, want };
        if (from) asked[`${from}|${item}`] = (asked[`${from}|${item}`] ?? 0) + want;
      }
    }

    books[portKey] = {
      port,
      effects,
      tradingPaused,
      produces: allProduces,
      inventory,
      orders,
      wealth,
      population,
      defense,
    };
  }

  // ── Pass 2: what the quay can actually ship ──────────────────────────────
  //
  // A supplier serves his own town first and keeps a reserve back; the rest is
  // divided pro rata among the orders standing in front of him. Under 1 for a
  // given supplier and good is the whole new fact of this release: a second
  // source is a *finite* second source.
  const fillRatio: Record<string, number> = {};
  for (const key of Object.keys(asked)) {
    const sep = key.lastIndexOf("|");
    const from = key.slice(0, sep);
    const item = key.slice(sep + 1);
    const supplier = books[from];
    // A supplier the world does not have on its books cannot be measured, so
    // the trade is left alone rather than starved on missing data.
    if (!supplier) { fillRatio[key] = 1; continue; }
    const localNeed = baselineConsumptionRate(from, item, supplier.port.population);
    const stock = supplier.inventory[item] ?? 0;
    const available = Math.max(0, stock * (1 - EXPORT_RESERVE) - localNeed);
    fillRatio[key] = asked[key] > 0 ? Math.min(1, available / asked[key]) : 1;
  }

  // ── Pass 3: the cargo lands, and both ends are paid ──────────────────────
  /** "<supplier>|<item>" -> tons that actually left his sheds today. */
  const shipped: Record<string, number> = {};
  for (const portKey of Object.keys(books)) {
    const b = books[portKey];
    for (const [item, order] of Object.entries(b.orders)) {
      const key = order.from ? `${order.from}|${item}` : "";
      const landed = order.from ? order.want * (fillRatio[key] ?? 1) : order.want;
      if (landed <= 0) continue;
      b.inventory[item] = (b.inventory[item] ?? 0) + landed;
      if (!order.from) continue;      // smugglers: no books, no warehouse
      shipped[key] = (shipped[key] ?? 0) + landed;

      // Money follows goods (v0.24.0). Yesterday's quotes at both ends: the
      // exporter's, because that is what he was paid, and this town's, because
      // that is what his cargo fetches here. Today's are still being worked out.
      const origin = w.ports[order.from];
      const paid = (origin?.prices[item] ?? ITEMS[item]?.basePrice ?? 0) * landed;
      const soldFor = (b.port.prices[item] ?? ITEMS[item]?.basePrice ?? 0) * landed;
      const value = deliveryValue(paid, soldFor);
      laneGold[order.from] = (laneGold[order.from] ?? 0) + value.paid;
      laneGold[portKey] = (laneGold[portKey] ?? 0) + value.margin;
    }
  }

  // ── Pass 4: sheds emptied, towns fed, prices requoted ────────────────────
  for (const portKey of Object.keys(books)) {
    const b = books[portKey];
    const port = b.port;
    const def = CITIES[portKey];
    const effects = b.effects;
    const inventory = b.inventory;
    let wealth = b.wealth;

    if (!b.tradingPaused) {
      // What went down the lanes leaves the shed, and only now is the cap
      // applied — a producer's warehouse holds what it holds after the day's
      // sailings, not before them.
      for (const item of b.produces) {
        if (inventory[item] === undefined) continue;
        const cap = inventoryCap(portKey, item);
        inventory[item] = Math.min(cap, inventory[item] - (shipped[`${portKey}|${item}`] ?? 0));
      }

      // 4. Consumption
      for (const item of def.demands) {
        const need = baselineConsumptionRate(portKey, item, port.population) * effects.consumptionMul;
        const have = inventory[item] ?? 0;
        const drained = Math.min(need, have);
        inventory[item] = have - drained;
        // A town that gets what it needs is neither better nor worse off for
        // it; one that goes short pays, in proportion to how short it went.
        const met = need > 0 ? Math.min(1, drained / need) : 1;
        wealth -= (1 - met) * SHORTAGE_WEALTH_PER_ITEM;
      }
    }

    // 5. Price recompute. The arithmetic lives in `PricingSystem` since
    // v0.24.0, because every hand that moves goods now requotes with it — the
    // merchant's counter and a docking convoy as well as this loop.
    const newPrices: Record<string, number> = {};
    for (const item of itemKeys) {
      if (!ITEMS[item]) continue;
      newPrices[item] = spotPrice(portKey, item, inventory[item] ?? 0, port.population, effects.priceMul);
    }
    // Bonus produce "gold" has its own price (very valuable)
    if (port.bonusProduces.includes("gold")) {
      const supply = (inventory["gold"] ?? 0) + 1;
      const ratio = Math.max(0.6, Math.min(2.5, 30 / supply));
      newPrices["gold"] = Math.max(40, Math.round(80 * ratio * effects.priceMul));
    }

    // 7. Recovery toward baseline (modulated by event recoveryMul)
    //
    // Population is pulled toward the *held* ceiling — a town under the black
    // flag keeps fewer people. Wealth is pulled toward the plain baseline and
    // is held down instead by what it cannot import, which is a mechanism
    // rather than a second modifier on the same quantity.
    // A blockaded town rebuilds nothing: the crown's money is not getting in
    // either. This is the half of the cordon that makes it worth keeping —
    // `tickBlockades` thins the garrison, and this stops it growing back.
    const rmul = blockadeEffective(w, portKey) ? 0 : effects.recoveryMul;
    const baseline = getPortBaseline(portKey);
    // Wealth is pulled toward the *royal* baseline even under the black flag,
    // and that is measured, not an oversight — see `blackFlagImportShare`.
    wealth       += (baseline.wealth - wealth) * RECOVERY_WEALTH * rmul;
    b.population += (heldPopulationCeiling(w, portKey) - b.population) * RECOVERY_POPULATION * rmul;
    // A town that changed hands rebuilds only toward what its own people will
    // raise for whoever holds the fort — no crown is paying for a garrison any
    // more. Without this the player would never have to defend a conquest.
    b.defense    += (heldDefenseCeiling(w, portKey) - b.defense) * RECOVERY_DEFENSE * rmul;

    // Round inventory values (avoid float drift in saves)
    for (const k of Object.keys(inventory)) {
      inventory[k] = Math.max(0, Math.round(inventory[k] * 10) / 10);
    }

    b.wealth = wealth;
    b.inventory = inventory;
    (b as Books & { prices?: Record<string, number> }).prices = newPrices;
  }

  // 8. Settle the day's ledger (v0.24.0).
  //
  // Everything that crossed a quay since midnight — the lane deliveries just
  // worked out above, and whatever the player and the traffic on the map put
  // through `tradeBalance` during the day — becomes wealth here, once, at one
  // rate. Then the slate is wiped and the total is filed where the port screen
  // can read it back to him.
  for (const portKey of Object.keys(books)) {
    const b = books[portKey] as Books & { prices: Record<string, number> };
    const gold = (b.port.tradeBalance ?? 0) + (laneGold[portKey] ?? 0);
    const wealth = b.wealth + settleDailyLedger(gold);

    newPorts[portKey] = {
      ...b.port,
      inventory: b.inventory,
      prices: b.prices,
      // Kept to one decimal rather than whole points (v0.24.0). A day's honest
      // trade through a busy quay is worth about half a point, and rounding
      // the running total to an integer every midnight threw that half away —
      // the ledger balanced against the pull toward baseline at four points
      // above it instead of the fifty the arithmetic actually says. Anything
      // that moves wealth slowly needs somewhere for the fraction to live.
      wealth: Math.max(0, Math.min(1000, Math.round(wealth * 10) / 10)),
      population: Math.max(0, Math.round(b.population)),
      defense: Math.max(0, Math.min(100, Math.round(b.defense))),
      tradeBalance: 0,
      tradeIncome: Math.round(gold),
    };
  }

  return { ...w, ports: newPorts };
}
