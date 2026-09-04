/**
 * The merchant's counter — the player's own side of the trade.
 *
 * Two things changed here in v0.24.0 and both of them make the counter behave
 * like a market instead of a vending machine:
 *
 *   - **The town's opinion of him is in the price.** `portAccess` decides what
 *     the spread is; a hostile port buys low and sells high, an allied one
 *     does the reverse. Eleven releases of reputation finally reach the till.
 *   - **The price moves as he trades.** Every buy and every sale requotes the
 *     good against the stock that is left, so two hundred tons of sugar sold
 *     into a fishing village does not all go at the price of the first ton.
 *     And the gold that crosses the counter goes onto the town's ledger, where
 *     the daily tick turns it into wealth: he is an economic actor now, not a
 *     spectator with a purse.
 */

import type { WorldState } from "../model/WorldState.ts";
import type { WorldEvent } from "../model/Events.ts";
import type { PortId, ItemId } from "../model/ids.ts";
import { ITEMS } from "../data/items.ts";
import { portAccess, buyPrice, sellPrice } from "./PortAccessSystem.ts";
import { repriceItem } from "./PricingSystem.ts";
import { creditTrade } from "./TradeLedgerSystem.ts";

export type TradeResult = {
  world: WorldState;
  events: WorldEvent[];
  error?: string;
};

/** What this port asks the player for one unit today, standing included. */
export function playerBuyPrice(world: WorldState, portKey: string, itemKey: string): number {
  const posted = world.ports[portKey]?.prices[itemKey] ?? ITEMS[itemKey]?.basePrice ?? 1;
  return buyPrice(posted, portAccess(world, portKey));
}

/** What this port offers the player for one unit today, standing included. */
export function playerSellPrice(world: WorldState, portKey: string, itemKey: string): number {
  const posted = world.ports[portKey]?.prices[itemKey] ?? ITEMS[itemKey]?.basePrice ?? 1;
  return sellPrice(posted, portAccess(world, portKey));
}

export function executeBuy(
  world: WorldState,
  portId: PortId,
  itemId: ItemId,
  qty: number,
): TradeResult {
  const portKey = portId as string;
  const port = world.ports[portKey];
  const playerEntity = world.entities[world.player.shipId as string];
  if (!port || !playerEntity?.ship) {
    return { world, events: [], error: "Invalid port or player ship" };
  }

  const item = ITEMS[itemId as string];
  if (!item) return { world, events: [], error: "Unknown item" };

  const price = playerBuyPrice(world, portKey, itemId as string);
  const totalCost = price * qty;

  if (world.player.gold < totalCost) {
    return { world, events: [], error: "Not enough gold" };
  }

  const portStock = port.inventory[itemId as string] ?? 0;
  if (portStock < qty) {
    return { world, events: [], error: "Not enough stock" };
  }

  // Check cargo capacity
  const currentCargo = Object.values(playerEntity.ship.cargo).reduce<number>((s, q) => s + q, 0);
  const addedWeight = item.weight * qty;
  if (currentCargo + addedWeight > playerEntity.ship.cargoCap) {
    return { world, events: [], error: "Not enough cargo space" };
  }

  const newCargo = { ...playerEntity.ship.cargo };
  newCargo[itemId as string] = (newCargo[itemId as string] ?? 0) + qty;

  const newPortInventory = { ...port.inventory };
  newPortInventory[itemId as string] = portStock - qty;

  // The stock moved, so the quote moves with it — a captain buying out a
  // warehouse watches the price climb under his hand. And his gold is now the
  // town's: it goes on the ledger and becomes wealth at midnight.
  const stocked: WorldState = {
    ...world,
    ports: {
      ...world.ports,
      [portKey]: creditTrade({ ...port, inventory: newPortInventory }, totalCost),
    },
  };
  const repriced = repriceItem(stocked, portKey, itemId as string) ?? stocked.ports[portKey];

  const newWorld: WorldState = {
    ...stocked,
    player: {
      ...world.player,
      gold: world.player.gold - totalCost,
    },
    entities: {
      ...world.entities,
      [world.player.shipId as string]: {
        ...playerEntity,
        ship: { ...playerEntity.ship, cargo: newCargo },
      },
    },
    ports: { ...stocked.ports, [portKey]: repriced },
  };

  const events: WorldEvent[] = [
    { type: "Trade", itemId, qty, goldDelta: -totalCost },
  ];

  return { world: newWorld, events };
}

export function executeSell(
  world: WorldState,
  portId: PortId,
  itemId: ItemId,
  qty: number,
): TradeResult {
  const portKey = portId as string;
  const port = world.ports[portKey];
  const playerEntity = world.entities[world.player.shipId as string];
  if (!port || !playerEntity?.ship) {
    return { world, events: [], error: "Invalid port or player ship" };
  }

  const item = ITEMS[itemId as string];
  if (!item) return { world, events: [], error: "Unknown item" };

  const owned = playerEntity.ship.cargo[itemId as string] ?? 0;
  if (owned < qty) {
    return { world, events: [], error: "Not enough goods" };
  }

  const price = playerSellPrice(world, portKey, itemId as string);
  const totalEarned = price * qty;

  const newCargo = { ...playerEntity.ship.cargo };
  newCargo[itemId as string] = owned - qty;
  if (newCargo[itemId as string] === 0) delete newCargo[itemId as string];

  const newPortInventory = { ...port.inventory };
  newPortInventory[itemId as string] = (newPortInventory[itemId as string] ?? 0) + qty;

  const stocked: WorldState = {
    ...world,
    ports: {
      ...world.ports,
      [portKey]: creditTrade({ ...port, inventory: newPortInventory }, -totalEarned),
    },
  };
  const repriced = repriceItem(stocked, portKey, itemId as string) ?? stocked.ports[portKey];

  const newWorld: WorldState = {
    ...stocked,
    player: {
      ...world.player,
      gold: world.player.gold + totalEarned,
    },
    entities: {
      ...world.entities,
      [world.player.shipId as string]: {
        ...playerEntity,
        ship: { ...playerEntity.ship, cargo: newCargo },
      },
    },
    ports: { ...stocked.ports, [portKey]: repriced },
  };

  const events: WorldEvent[] = [
    { type: "Trade", itemId, qty, goldDelta: totalEarned },
  ];

  return { world: newWorld, events };
}
