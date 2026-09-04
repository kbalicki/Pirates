import { itemId } from "../model/ids.ts";
import type { ItemId } from "../model/ids.ts";

export type ItemCategory = "trade" | "supply";

export type ItemDef = {
  id: ItemId;
  name: string;
  basePrice: number;
  weight: number;
  legal: boolean;
  category: ItemCategory;
  isConsumable: boolean;
  /**
   * A good that exists only where it is found, not one every quay carries.
   *
   * Ordinary goods are stocked in every port at world creation and listed on
   * every merchant's counter whether he has any or not — that is what makes
   * the trade screen a market. A rare good is the other thing: no port starts
   * with a grain of it, and it appears on a counter only where something put
   * it there. Gold is the first, and until v0.29.0 it was not an item at all,
   * which meant a gold strike produced a commodity **nobody in the game could
   * buy** — the strike moved a town's wealth and left the player nothing to
   * sail for.
   */
  rare?: boolean;
};

export const ITEMS: Record<string, ItemDef> = {
  sugar_cane: {
    id: itemId("sugar_cane"),
    name: "Sugar Cane",
    basePrice: 10,
    weight: 2,
    legal: true,
    category: "trade",
    isConsumable: false,
  },
  tobacco: {
    id: itemId("tobacco"),
    name: "Tobacco",
    basePrice: 15,
    weight: 1,
    legal: true,
    category: "trade",
    isConsumable: false,
  },
  cocoa: {
    id: itemId("cocoa"),
    name: "Cocoa",
    basePrice: 20,
    weight: 1,
    legal: true,
    category: "trade",
    isConsumable: false,
  },
  rum: {
    id: itemId("rum"),
    name: "Rum",
    basePrice: 12,
    weight: 1,
    legal: true,
    category: "trade",
    isConsumable: false,
  },
  food: {
    id: itemId("food"),
    name: "Food",
    basePrice: 5,
    weight: 1,
    legal: true,
    category: "supply",
    isConsumable: true,
  },
  water: {
    id: itemId("water"),
    name: "Water",
    basePrice: 3,
    weight: 1,
    legal: true,
    category: "supply",
    isConsumable: true,
  },
  /**
   * Struck, not grown (v0.29.0).
   *
   * `gold_discovery` has added "gold" to a town's `bonusProduces` since v0.9.7
   * and `EconomyTickSystem` has priced it ever since — but with no entry here
   * the merchant's counter never listed it and `executeBuy` refused it as an
   * unknown item. A boom town piled it in a warehouse nobody could open.
   */
  gold: {
    id: itemId("gold"),
    name: "Gold",
    basePrice: 80,
    weight: 1,
    legal: true,
    category: "trade",
    isConsumable: false,
    rare: true,
  },
};
