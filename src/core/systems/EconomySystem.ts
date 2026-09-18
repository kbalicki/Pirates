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
import {
  portAccess, buyPrice, sellPrice, askExact, bidExact, tradeCost, tradeProceeds,
} from "./PortAccessSystem.ts";
import { repriceItem } from "./PricingSystem.ts";
import { squadronRoom, squadronHeld, stowInSquadron, drawFromSquadron } from "./HoldSystem.ts";
import { creditTrade } from "./TradeLedgerSystem.ts";

export type TradeResult = {
  world: WorldState;
  events: WorldEvent[];
  error?: string;
};

function posted(world: WorldState, portKey: string, itemKey: string): number {
  return world.ports[portKey]?.prices[itemKey] ?? ITEMS[itemKey]?.basePrice ?? 1;
}

/** What this port asks the player for one unit today, standing included. */
export function playerBuyPrice(world: WorldState, portKey: string, itemKey: string): number {
  return buyPrice(posted(world, portKey, itemKey), portAccess(world, portKey));
}

/** What this port offers the player for one unit today, standing included. */
export function playerSellPrice(world: WorldState, portKey: string, itemKey: string): number {
  return sellPrice(posted(world, portKey, itemKey), portAccess(world, portKey));
}

/**
 * The same two, unrounded — what the counter will print (v0.76.0).
 *
 * A quote of four gold at a neutral counter is 4.48 asked and 3.52 offered,
 * and printing them as four and four told the captain his standing was worth
 * nothing here. It is worth 0.96 a ton, and the screen says so.
 */
export function playerAskExact(world: WorldState, portKey: string, itemKey: string): number {
  return askExact(posted(world, portKey, itemKey), portAccess(world, portKey));
}

export function playerBidExact(world: WorldState, portKey: string, itemKey: string): number {
  return bidExact(posted(world, portKey, itemKey), portAccess(world, portKey));
}

/** What a lot of `qty` costs him, and what one fetches. Rounded once. */
export function playerBuyCost(world: WorldState, portKey: string, itemKey: string, qty: number): number {
  return tradeCost(posted(world, portKey, itemKey), portAccess(world, portKey), qty);
}

export function playerSellTake(world: WorldState, portKey: string, itemKey: string, qty: number): number {
  return tradeProceeds(posted(world, portKey, itemKey), portAccess(world, portKey), qty);
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

  // Rounded once, on the bill (v0.76.0) — a twelfth of four gold is not a
  // coin, and rounding it into one on every ton was where the town's opinion
  // of the captain went.
  const totalCost = playerBuyCost(world, portKey, itemId as string, qty);

  if (world.player.gold < totalCost) {
    return { world, events: [], error: "Not enough gold" };
  }

  const portStock = port.inventory[itemId as string] ?? 0;
  if (portStock < qty) {
    return { world, events: [], error: "Not enough stock" };
  }

  // Room enough across the squadron, and in tons (v0.77.0). This check used to
  // read `item.weight * qty` against a sum of tons already stowed — two units
  // in one comparison, and the only place in the game that weighed anything.
  // What it produced was not a capacity rule but a throttle on a single
  // transaction: an empty forty-ton sloop took twenty tons of cane, then ten,
  // then five, two, one and one, so "everything the hold will take" had to be
  // pressed six times and stopped at thirty-nine. `ItemDef.weight` is gone.
  if (squadronRoom(world) < qty) {
    return { world, events: [], error: "Not enough cargo space" };
  }

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

  const paid: WorldState = {
    ...stocked,
    player: {
      ...world.player,
      gold: world.player.gold - totalCost,
    },
    ports: { ...stocked.ports, [portKey]: repriced },
  };
  const newWorld = stowInSquadron(paid, { [itemId as string]: qty }).world;

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

  // Sold out of the squadron, not out of the flagship (v0.77.0).
  const owned = squadronHeld(world, itemId as string);
  if (owned < qty) {
    return { world, events: [], error: "Not enough goods" };
  }

  const totalEarned = playerSellTake(world, portKey, itemId as string, qty);

  const unloaded = drawFromSquadron(world, itemId as string, qty).world;

  const newPortInventory = { ...port.inventory };
  newPortInventory[itemId as string] = (newPortInventory[itemId as string] ?? 0) + qty;

  const stocked: WorldState = {
    ...unloaded,
    ports: {
      ...unloaded.ports,
      [portKey]: creditTrade({ ...port, inventory: newPortInventory }, -totalEarned),
    },
  };
  const repriced = repriceItem(stocked, portKey, itemId as string) ?? stocked.ports[portKey];

  const newWorld: WorldState = {
    ...stocked,
    player: {
      ...stocked.player,
      gold: world.player.gold + totalEarned,
    },
    ports: { ...stocked.ports, [portKey]: repriced },
  };

  const events: WorldEvent[] = [
    { type: "Trade", itemId, qty, goldDelta: totalEarned },
  ];

  return { world: newWorld, events };
}
