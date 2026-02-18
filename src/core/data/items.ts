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
};
