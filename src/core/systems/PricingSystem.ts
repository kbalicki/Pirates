/**
 * Pricing — one quotation, wherever goods happen to move.
 *
 * Until v0.24.0 the price of a good was recomputed in exactly one place, once
 * a day, at the bottom of `EconomyTickSystem`. Everything else that moved
 * goods — the player's merchant screen, a trader loading out of a warehouse, a
 * convoy landing her hold at the far end — moved the *stock* and left the
 * quotation alone until midnight.
 *
 * That had two visible consequences, and both of them were bugs the player
 * could feel:
 *
 *   - **A hold had no bottom to its market.** Two hundred tons of sugar sold
 *     into a fishing village went at the same price as the first ton. The town
 *     was a vending machine, not a market, and the whole trading game was
 *     "find the biggest spread and repeat until bored".
 *   - **Shipping did not show up in the quotes.** v0.23.0 made goods
 *     physically travel, which was the hard half; but a convoy arriving with
 *     eighty tons of cocoa did not move the price of cocoa until the following
 *     morning, so the thing the player had just done was invisible for a day.
 *
 * So the formula lives here now, and every hand that touches a warehouse calls
 * it. It is deliberately the same arithmetic the daily tick has always used —
 * this module is an extraction, not a redesign, and the daily tick still owns
 * the *supply* side (production, imports, consumption). What changed is only
 * that the number is no longer allowed to go stale between midnights.
 */

import type { WorldState, PortRuntimeState } from "../model/WorldState.ts";
import { ITEMS } from "../data/items.ts";
import { getBasePrice } from "../data/prices.ts";
import { baselineConsumptionRate, getPortBaseline, inventoryCap } from "../data/economyBaselines.ts";
import { CITIES } from "../data/cities.ts";
import { getAggregatedEffects, priceMulFor } from "./EventEffectsSystem.ts";

/** How many days of consumption count as "the market is balanced". */
const DEMAND_HORIZON_DAYS = 30;

/** Floor and ceiling on supply-to-demand, so a glut never makes a good free. */
const RATIO_MIN = 0.4;
const RATIO_MAX = 3.0;

/**
 * Gold outside a strike town is bought by the town's wealth (v0.99.1).
 *
 * Gold is the one good no town grows or eats, so its demand was the `|| 1`
 * fallback below - one ton a day, thirty in the horizon - against a shed that
 * is empty everywhere but a strike town. Measured on a settled Caribbean:
 * **45 of 45** counters quoted it at `RATIO_MAX`, a poor fishing town (228)
 * within a fifth of Havana (276), and what the captain sold stayed on the quay
 * for good - thirty tons in Havana were still thirty tons forty days later -
 * so every port was a one-time sink worth ~3 000 a run. The owner chose
 * demand from wealth (2026-09-25):
 *
 *   appetite = wealth / GOLD_WEALTH_PER_TON          tons a day the town absorbs
 *   demand   = appetite x DEMAND_HORIZON_DAYS
 *   supply   = stock + GOLD_FLOAT_TONS               gold already in its hands
 *
 * So an empty counter quotes the town's wealth - a wealthy capital (900) twice
 * the base, a poor one (100) the floor - a sale deepens the stock, and the
 * town spends it back down at its appetite, day by day (`EconomyTickSystem`).
 */
export const GOLD_WEALTH_PER_TON = 450;

/**
 * What a producer asks for its own staple when its shed is full (v0.99.4).
 *
 * A good the town grows and does not eat had the same `|| 1` stand-in demand
 * as gold - thirty tons - against a shed sized by v0.75.0 at eight days of the
 * town's own harvest, 20 to 96 tons. So the quote was a function of the SHED'S
 * SIZE, and backwards: measured on a settled world, the big growers sat on the
 * floor (Havana, Cartagena, Barbados sugar at 3 of 8; 13 of 69 pairs at
 * `RATIO_MIN`, where the first twenty tons bought moved nothing), while a
 * small one sold its own crop ABOVE the base price - Nombre de Dios cocoa 19
 * of 13, Rio de la Hacha tobacco 14 of 10 - the one place a staple should be
 * cheapest. The owner asked for it fixed (2026-09-25).
 *
 * Now the quote reads how full the shed is: `PRODUCER_FULL_RATIO x cap /
 * (stock + 1)` - half the base with the shed full, the base at half, the
 * ceiling as it empties - the same for a big grower and a small one, so the
 * difference between them is the base price and how hard they are drawn.
 */
export const PRODUCER_FULL_RATIO = 0.5;
export const GOLD_FLOAT_TONS = 30;

/** Tons of gold a day a town of this wealth takes off its own quay. */
export function goldAppetite(wealth: number): number {
  return Math.max(0, wealth) / GOLD_WEALTH_PER_TON;
}

/**
 * What one unit of `item` fetches on `portKey`'s quay, given that much stock.
 *
 * Pure arithmetic on numbers the caller already has, so it can be used both
 * from the daily tick (which is mid-flight through a port's books and has no
 * `PortRuntimeState` to hand yet) and from a trade (which has).
 */
export function spotPrice(
  portKey: string,
  item: string,
  stock: number,
  population: number,
  priceMul = 1,
  wealth = getPortBaseline(portKey).wealth,
): number {
  if (item === "gold") {
    const ratio = goldAppetite(wealth) * DEMAND_HORIZON_DAYS / (Math.max(0, stock) + GOLD_FLOAT_TONS);
    const clamped = Math.max(RATIO_MIN, Math.min(RATIO_MAX, ratio));
    return Math.max(1, Math.round(getBasePrice(portKey, item) * clamped * priceMul));
  }
  const def = CITIES[portKey];
  if (def && def.produces.includes(item) && !def.demands.includes(item)) {
    const ratio = PRODUCER_FULL_RATIO * inventoryCap(portKey, item) / (Math.max(0, stock) + 1);
    const clamped = Math.max(RATIO_MIN, Math.min(RATIO_MAX, ratio));
    return Math.max(1, Math.round(getBasePrice(portKey, item) * clamped * priceMul));
  }
  const supply = Math.max(0, stock) + 1;
  const demand = (baselineConsumptionRate(portKey, item, population) || 1) * DEMAND_HORIZON_DAYS;
  const ratio = Math.max(RATIO_MIN, Math.min(RATIO_MAX, demand / supply));
  return Math.max(1, Math.round(getBasePrice(portKey, item) * ratio * priceMul));
}

/**
 * Requote one good after its stock moved, keeping the port's event modifiers.
 *
 * The multiplier matters: a town under a hurricane warning is quoting food at
 * double, and a requote that forgot to ask would quietly cancel the event
 * until midnight put it back. Reading `getAggregatedEffects` here costs a walk
 * over the world's live events, which is a handful of entries.
 */
export function repriceItem(
  world: WorldState,
  portKey: string,
  item: string,
): PortRuntimeState | null {
  const port = world.ports[portKey];
  if (!port || !ITEMS[item]) return null;
  const effects = getAggregatedEffects(world, portKey);
  const price = spotPrice(portKey, item, port.inventory[item] ?? 0, port.population, priceMulFor(effects, item), port.wealth);
  if (port.prices[item] === price) return port;
  return { ...port, prices: { ...port.prices, [item]: price } };
}

/**
 * Requote several goods at once and hand back the whole port.
 *
 * Used where a hold changes hands: a delivery or a loading moves half a dozen
 * items in one act, and requoting them one at a time would rebuild the port
 * record — and re-derive the event effects — once per item.
 */
export function repricePort(
  world: WorldState,
  portKey: string,
  items: Iterable<string>,
  inventory?: Record<string, number>,
): PortRuntimeState | null {
  const port = world.ports[portKey];
  if (!port) return null;
  const stock = inventory ?? port.inventory;
  const effects = getAggregatedEffects(world, portKey);

  let prices = port.prices;
  let changed = false;
  for (const item of items) {
    if (!ITEMS[item]) continue;
    const price = spotPrice(portKey, item, stock[item] ?? 0, port.population, priceMulFor(effects, item), port.wealth);
    if (prices[item] === price) continue;
    if (!changed) { prices = { ...prices }; changed = true; }
    prices[item] = price;
  }

  const nextInventory = inventory ?? port.inventory;
  if (!changed && nextInventory === port.inventory) return port;
  return { ...port, prices, inventory: nextInventory };
}
