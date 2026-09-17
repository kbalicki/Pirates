import { ITEMS } from "./items.ts";
import { PORTS } from "./ports.ts";
import { inventoryCap } from "./economyBaselines.ts";

// Price modifier for goods a port produces (cheaper to buy)
const PRODUCE_MODIFIER = 0.7;
// Price modifier for goods a port demands (more expensive, good to sell)
const DEMAND_MODIFIER = 1.4;

export function getBasePrice(portKey: string, itemKey: string): number {
  const item = ITEMS[itemKey];
  const port = PORTS[portKey];
  if (!item || !port) return 0;

  let price = item.basePrice;

  if (port.produces.includes(itemKey)) {
    price = Math.round(price * PRODUCE_MODIFIER);
  } else if (port.demands.includes(itemKey)) {
    price = Math.round(price * DEMAND_MODIFIER);
  }

  // Scale by market level (higher market = better base prices)
  const marketMod = 0.9 + port.marketLevel * 0.05;
  price = Math.round(price * marketMod);

  return Math.max(1, price);
}

export function initPortPrices(portKey: string): Record<string, number> {
  const prices: Record<string, number> = {};
  for (const itemKey of Object.keys(ITEMS)) {
    prices[itemKey] = getBasePrice(portKey, itemKey);
  }
  return prices;
}

export function initPortInventory(portKey: string): Record<string, number> {
  const inv: Record<string, number> = {};
  for (const [itemKey, def] of Object.entries(ITEMS)) {
    // A rare good is not stocked anywhere at the start of the world: it exists
    // where something puts it, and nowhere else (v0.29.0).
    if (def.rare) { inv[itemKey] = 0; continue; }
    // Open the world where it lives (v0.67.0). The old seed was a flat 30 tons
    // for a producer and 10 for everything else, times a wealth multiplier, and
    // the daily tick then spent the opening months of every game walking the
    // warehouses up to the level they settle at anyway. A new captain met the
    // shortage quotes of an empty Caribbean for his first hours of play and
    // watched them drift for no reason he could see - and the drift ran through
    // the ledger, which is why two releases of warehouse work each looked as
    // though it had made the Caribbean slightly richer when it had not.
    //
    // Nine tenths of the cap, and no wealth term: the cap already knows the
    // size of the town, and what a poor town produces is already halved by the
    // wealth factor in `baselineProductionRate`.
    inv[itemKey] = Math.round(inventoryCap(portKey, itemKey) * 0.9);
  }
  return inv;
}
