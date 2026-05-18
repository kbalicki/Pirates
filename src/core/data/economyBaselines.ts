/**
 * Economy baseline derivation from CityDef enums.
 *
 * Numeric runtime state (population, wealth, defense, production/consumption rates)
 * is recomputed from the canonical CityDef each time we need a "what this port
 * should look like undisturbed" reference value. Active world events push the
 * current state away from baseline; the daily recovery step pulls it back.
 *
 * Production / consumption rates are derived per-day, not stored on state,
 * so that event multipliers (trade_boom, slave_revolt, etc.) take effect
 * immediately without state migration.
 */

import { CITIES, type CityDef, type CitySize, type WealthLevel } from "./cities.ts";

const POPULATION_BASE: Record<CitySize, number> = {
  small: 500,
  medium: 2500,
  large: 10000,
  capital: 25000,
};

const WEALTH_BASE: Record<WealthLevel, number> = {
  poor: 100,
  modest: 300,
  prosperous: 600,
  wealthy: 900,
};

const POP_BUCKET_BONUS: Record<CitySize, number> = {
  small: 5,
  medium: 15,
  large: 30,
  capital: 50,
};

const TYPE_DEFENSE: Record<CityDef["type"], number> = {
  outpost: 10,
  city: 30,
  fort: 70,
};

export type PortBaseline = {
  population: number;
  wealth: number;
  defense: number;
};

export function getPortBaseline(portKey: string): PortBaseline {
  const def = CITIES[portKey];
  if (!def) return { population: 500, wealth: 200, defense: 10 };
  const population = POPULATION_BASE[def.population];
  const wealth = WEALTH_BASE[def.wealth];
  const defense = Math.min(100, TYPE_DEFENSE[def.type] + POP_BUCKET_BONUS[def.population]);
  return { population, wealth, defense };
}

/**
 * Production rate per produced item, in units/day, scaled by marketLevel
 * and dampened by current wealth (a poor port produces less even if it can).
 */
export function baselineProductionRate(portKey: string, itemKey: string, currentWealth: number): number {
  const def = CITIES[portKey];
  if (!def || !def.produces.includes(itemKey)) return 0;
  const rate = 2 + def.marketLevel * 2; // 4..12 units/day
  const wealthFactor = 0.5 + Math.min(1, currentWealth / 900) * 0.5; // 0.5..1.0
  return rate * wealthFactor;
}

/**
 * Consumption rate per demanded item, in units/day, scaled by population bucket.
 * Larger populations consume more.
 */
export function baselineConsumptionRate(portKey: string, itemKey: string, currentPopulation: number): number {
  const def = CITIES[portKey];
  if (!def || !def.demands.includes(itemKey)) return 0;
  const popFactor = Math.max(0.3, Math.min(3, currentPopulation / 2500));
  return 1.5 * popFactor; // ~0.45..4.5 units/day
}

/** Per-item inventory cap (a producer port can stockpile up to this much). */
export function inventoryCap(portKey: string, itemKey: string): number {
  const def = CITIES[portKey];
  if (!def) return 50;
  const producing = def.produces.includes(itemKey);
  return producing ? def.marketLevel * 50 : 30;
}
