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

    const baseline = getPortBaseline(portKey);
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

      // 4. Consumption
      for (const item of def.demands) {
        const need = baselineConsumptionRate(portKey, item, port.population) * effects.consumptionMul;
        const have = inventory[item] ?? 0;
        const drained = Math.min(need, have);
        inventory[item] = have - drained;
        // Selling demanded goods generates wealth; shortage hurts
        wealth += drained * 0.3;
        if (drained < need) wealth -= 1;
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
    const rmul = effects.recoveryMul;
    wealth     += (baseline.wealth     - wealth)     * RECOVERY_WEALTH * rmul;
    population += (baseline.population - population) * RECOVERY_POPULATION * rmul;
    defense    += (baseline.defense    - defense)    * RECOVERY_DEFENSE * rmul;

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
