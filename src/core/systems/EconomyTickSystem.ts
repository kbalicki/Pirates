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

import type { WorldState } from "../model/WorldState.ts";
import { CITIES } from "../data/cities.ts";
import { ITEMS } from "../data/items.ts";
import { getBasePrice } from "../data/prices.ts";
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
  let w = applyOneShotEffects(world);

  const newPorts = { ...w.ports };
  const itemKeys = Object.keys(ITEMS);

  for (const portKey of Object.keys(newPorts)) {
    const port = newPorts[portKey];
    const def = CITIES[portKey];
    if (!port || !def) continue;

    const effects = getAggregatedEffects(w, portKey);

    // Skip closed ports for trade simulation (still apply recovery + events)
    const tradingPaused = effects.portClosed;

    // Active produces = base + bonus (e.g. "gold" from gold_discovery)
    const allProduces = [...def.produces, ...port.bonusProduces];

    let inventory = { ...port.inventory };
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
      const importShare = playerHolds(w, portKey) ? IMPORT_SHARE_BLACK_FLAG : IMPORT_SHARE_CROWN;
      for (const item of def.demands) {
        if (allProduces.includes(item)) continue;
        const need = baselineConsumptionRate(portKey, item, port.population);
        const cap = inventoryCap(portKey, item);
        inventory[item] = Math.min(cap, (inventory[item] ?? 0) + need * importShare * effects.productionMul);
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

    // 5. Price recompute
    const newPrices: Record<string, number> = {};
    for (const item of itemKeys) {
      const itemDef = ITEMS[item];
      if (!itemDef) continue;
      const supply = (inventory[item] ?? 0) + 1;
      const demand = (baselineConsumptionRate(portKey, item, port.population) || 1) * 30;
      const ratio = Math.max(0.4, Math.min(3.0, demand / supply));
      const base = getBasePrice(portKey, item);
      const raw = base * ratio * effects.priceMul;
      newPrices[item] = Math.max(1, Math.round(raw));
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
    const rmul = effects.recoveryMul;
    const baseline = getPortBaseline(portKey);
    wealth     += (baseline.wealth - wealth) * RECOVERY_WEALTH * rmul;
    population += (heldPopulationCeiling(w, portKey) - population) * RECOVERY_POPULATION * rmul;
    // A town that changed hands rebuilds only toward what its own people will
    // raise for whoever holds the fort — no crown is paying for a garrison any
    // more. Without this the player would never have to defend a conquest.
    defense    += (heldDefenseCeiling(w, portKey) - defense) * RECOVERY_DEFENSE * rmul;

    // Clamp + round
    const finalWealth = Math.max(0, Math.min(1000, Math.round(wealth)));
    const finalPopulation = Math.max(0, Math.round(population));
    const finalDefense = Math.max(0, Math.min(100, Math.round(defense)));

    // Round inventory values (avoid float drift in saves)
    for (const k of Object.keys(inventory)) {
      inventory[k] = Math.max(0, Math.round(inventory[k] * 10) / 10);
    }

    newPorts[portKey] = {
      ...port,
      inventory,
      prices: newPrices,
      wealth: finalWealth,
      population: finalPopulation,
      defense: finalDefense,
    };
  }

  return { ...w, ports: newPorts };
}
