import type { WorldState } from "../model/WorldState.ts";
import type { WorldEvent } from "../model/Events.ts";
import type { PortId, ItemId } from "../model/ids.ts";
import { ITEMS } from "../data/items.ts";

export type TradeResult = {
  world: WorldState;
  events: WorldEvent[];
  error?: string;
};

export function executeBuy(
  world: WorldState,
  portId: PortId,
  itemId: ItemId,
  qty: number,
): TradeResult {
  const port = world.ports[portId as string];
  const playerEntity = world.entities[world.player.shipId as string];
  if (!port || !playerEntity?.ship) {
    return { world, events: [], error: "Invalid port or player ship" };
  }

  const item = ITEMS[itemId as string];
  if (!item) return { world, events: [], error: "Unknown item" };

  const price = port.prices[itemId as string] ?? item.basePrice;
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

  const newWorld: WorldState = {
    ...world,
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
    ports: {
      ...world.ports,
      [portId as string]: { ...port, inventory: newPortInventory },
    },
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
  const port = world.ports[portId as string];
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

  const price = port.prices[itemId as string] ?? item.basePrice;
  const totalEarned = price * qty;

  const newCargo = { ...playerEntity.ship.cargo };
  newCargo[itemId as string] = owned - qty;
  if (newCargo[itemId as string] === 0) delete newCargo[itemId as string];

  const newPortInventory = { ...port.inventory };
  newPortInventory[itemId as string] = (newPortInventory[itemId as string] ?? 0) + qty;

  const newWorld: WorldState = {
    ...world,
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
    ports: {
      ...world.ports,
      [portId as string]: { ...port, inventory: newPortInventory },
    },
  };

  const events: WorldEvent[] = [
    { type: "Trade", itemId, qty, goldDelta: totalEarned },
  ];

  return { world: newWorld, events };
}
