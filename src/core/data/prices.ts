import { ITEMS } from "./items.ts";
import { PORTS } from "./ports.ts";

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

const WEALTH_MULTIPLIER: Record<string, number> = {
  poor: 0.5,
  modest: 0.8,
  prosperous: 1.0,
  wealthy: 1.5,
};

export function initPortInventory(portKey: string): Record<string, number> {
  const inv: Record<string, number> = {};
  const port = PORTS[portKey];
  const wealthMult = WEALTH_MULTIPLIER[port?.wealth ?? "modest"] ?? 1.0;
  for (const [itemKey, def] of Object.entries(ITEMS)) {
    // A rare good is not stocked anywhere at the start of the world: it exists
    // where something puts it, and nowhere else (v0.29.0).
    if (def.rare) { inv[itemKey] = 0; continue; }
    const base = port?.produces.includes(itemKey) ? 30 : 10;
    inv[itemKey] = Math.round(base * wealthMult);
  }
  return inv;
}
