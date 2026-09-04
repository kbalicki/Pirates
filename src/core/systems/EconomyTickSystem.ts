/**
 * Economy Tick — daily simulation of the Caribbean economy.
 *
 * Called once per game day (from WorldEngine, when day rolls over).
 * Order of operations per port:
 *
 *   1. Apply one-shot event effects (pirate_raid hit, gold strike, etc.)
 *   2. Compute aggregated daily multipliers from active events
 *   3. Production: produced goods → inventory (capped, multiplied by event)
 *   4. Consumption: demanded goods drain inventory (multiplied by event)
 *   5. Price recompute from supply/demand ratio × marketModifier × eventPriceMul
 *   6. Apply per-day flat deltas (pop/wealth/defense)
 *   7. Natural recovery toward baseline (slow drift)
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
import { laneSupplyShare, routeSupplying } from "./TradeRouteSystem.ts";
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
const IMPORT_SHARE_BLACK_FLAG = 0.35;
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

const RECOVERY_WEALTH = 0.01;     // 1% per day toward baseline
const RECOVERY_POPULATION = 0.005; // 0.5% per day
const RECOVERY_DEFENSE = 0.02;    // 2% per day

/**
 * Run a single day of economy simulation across all ports.
 * Pure function — returns a new WorldState.
 */
export function economyDailyTick(world: WorldState): WorldState {
  // 1. One-shot event hits (raid/hurricane/strike etc.)
  const w = applyOneShotEffects(world);

  const newPorts = { ...w.ports };
  const itemKeys = Object.keys(ITEMS);

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

  /** A port's books, worked out but not yet clamped, rounded or written back. */
  type Books = {
    port: PortRuntimeState;
    inventory: Record<string, number>;
    prices: Record<string, number>;
    wealth: number;
    population: number;
    defense: number;
  };
  const books: Record<string, Books> = {};

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
    let wealth = port.wealth + effects.wealthDelta;
    let population = port.population + effects.popDelta;
    let defense = port.defense + effects.defenseDelta;

    if (!tradingPaused) {
      // 3. Production
      for (const item of allProduces) {
        if (!ITEMS[item] && item !== "gold") continue;
        const base = baselineProductionRate(portKey, item, port.wealth);
        // bonus produces (e.g. gold) get a flat rate even if not in CityDef
        const rate = base > 0 ? base : 3;
        const produced = rate * effects.productionMul;
        const cap = inventoryCap(portKey, item);
        inventory[item] = Math.min(cap, (inventory[item] ?? 0) + produced);
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
      const flagShare = playerHolds(w, portKey) ? IMPORT_SHARE_BLACK_FLAG : IMPORT_SHARE_CROWN;
      const cordon = blockadeEffective(w, portKey) ? BLOCKADE_SUPPLY_SHARE : 1;
      for (const item of def.demands) {
        if (allProduces.includes(item)) continue;
        const need = baselineConsumptionRate(portKey, item, port.population);
        const cap = inventoryCap(portKey, item);
        const lane = laneSupplyShare(w, portKey, item, p => portShutIn(w, p));
        const arriving = need * flagShare * lane * cordon * effects.importMul;
        const had = inventory[item] ?? 0;
        inventory[item] = Math.min(cap, had + arriving);

        // Money follows goods (v0.24.0). What the warehouse would not take is
        // not delivered and is not paid for, so the landed quantity is the one
        // that settles — not the quantity that set out.
        const landed = inventory[item] - had;
        const route = landed > 0 ? routeSupplying(portKey, item) : undefined;
        if (route) {
          // Yesterday's quotes at both ends: the exporter's, because that is
          // what he was paid, and this town's, because that is what his cargo
          // fetches here. Today's are still being worked out.
          const origin = w.ports[route.from];
          const paid = (origin?.prices[item] ?? ITEMS[item]?.basePrice ?? 0) * landed;
          const soldFor = (port.prices[item] ?? ITEMS[item]?.basePrice ?? 0) * landed;
          const value = deliveryValue(paid, soldFor);
          laneGold[route.from] = (laneGold[route.from] ?? 0) + value.paid;
          laneGold[portKey] = (laneGold[portKey] ?? 0) + value.margin;
        }
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
    wealth     += (baseline.wealth - wealth) * RECOVERY_WEALTH * rmul;
    population += (heldPopulationCeiling(w, portKey) - population) * RECOVERY_POPULATION * rmul;
    // A town that changed hands rebuilds only toward what its own people will
    // raise for whoever holds the fort — no crown is paying for a garrison any
    // more. Without this the player would never have to defend a conquest.
    defense    += (heldDefenseCeiling(w, portKey) - defense) * RECOVERY_DEFENSE * rmul;

    // Round inventory values (avoid float drift in saves)
    for (const k of Object.keys(inventory)) {
      inventory[k] = Math.max(0, Math.round(inventory[k] * 10) / 10);
    }

    books[portKey] = { port, inventory, prices: newPrices, wealth, population, defense };
  }

  // 8. Settle the day's ledger (v0.24.0).
  //
  // Everything that crossed a quay since midnight — the lane deliveries just
  // worked out above, and whatever the player and the traffic on the map put
  // through `tradeBalance` during the day — becomes wealth here, once, at one
  // rate. Then the slate is wiped and the total is filed where the port screen
  // can read it back to him.
  for (const portKey of Object.keys(books)) {
    const b = books[portKey];
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
