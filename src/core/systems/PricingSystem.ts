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
import { baselineConsumptionRate } from "../data/economyBaselines.ts";
import { getAggregatedEffects } from "./EventEffectsSystem.ts";

/** How many days of consumption count as "the market is balanced". */
const DEMAND_HORIZON_DAYS = 30;

/** Floor and ceiling on supply-to-demand, so a glut never makes a good free. */
const RATIO_MIN = 0.4;
const RATIO_MAX = 3.0;

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
): number {
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
  const priceMul = getAggregatedEffects(world, portKey).priceMul;
  const price = spotPrice(portKey, item, port.inventory[item] ?? 0, port.population, priceMul);
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
  const priceMul = getAggregatedEffects(world, portKey).priceMul;

  let prices = port.prices;
  let changed = false;
  for (const item of items) {
    if (!ITEMS[item]) continue;
    const price = spotPrice(portKey, item, stock[item] ?? 0, port.population, priceMul);
    if (prices[item] === price) continue;
    if (!changed) { prices = { ...prices }; changed = true; }
    prices[item] = price;
  }

  const nextInventory = inventory ?? port.inventory;
  if (!changed && nextInventory === port.inventory) return port;
  return { ...port, prices, inventory: nextInventory };
}
