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

/**
 * Days of its own eating a town keeps of a good it does not grow (v0.67.0).
 *
 * This number exists because the flat 30 tons it replaces was not a warehouse,
 * it was a gag on the price model. `PricingSystem` calls a market balanced at
 * **thirty days of consumption** - up to 135 tons in a capital - so a shed that
 * could never hold more than 30 quoted at `RATIO_MAX` whatever was in it.
 * Measured across 45 ports: **23 of 130 import quotes could not leave x3**, and
 * the manual's promise that a full warehouse brings the price down to x0.4 was
 * unreachable for anything a town imports.
 *
 * What it cost the game, which is worse than the arithmetic: every large town
 * paid the same maximum for everything it wanted, so there was no reason to
 * prefer one counter to another, no reason to read the news board, and no
 * difference between a town that was actually short and a town that was full.
 * The demand half of the model was drawing no distinctions at all.
 *
 * Twenty days, chosen by sweeping 10 / 15 / 20 / 30 / 45 / 90 over a settled
 * decade and reading the counter:
 *
 *     days   quotes at x3   Havana water   cocoa Caracas->Havana
 *       10        23/130        41t @ 15         6 -> 96  (x16.0)
 *       15         0/130        63t @ 11         6 -> 68  (x11.3)
 *   >>  20         0/130        86t @  8         6 -> 50  (x8.3)
 *       30         0/130       131t @  5         6 -> 33  (x5.5)
 *       90       floor, 130/130   401t @  2      imports cheaper than crops
 *
 * Twenty is the first step where nothing is pinned and the captain's trade is
 * still plainly worth making. Ninety inverts the world - a town's imports end
 * up cheaper than what it grows - and ten changes nothing at all.
 *
 * The floor of twelve tons is for the small end: an outpost eats 0.45 a day, so
 * a cover rule alone would give it five tons. Twelve is about a month for such
 * a place, and it is deliberately below the old flat thirty, because thirty was
 * **sixty days' cover** for an outpost and had it selling imported food at 3
 * gold - under the base price of the thing. A remote colony pays more for what
 * must be carried to it, not less; that is now the case (3 -> 8 gold).
 */
export const IMPORT_COVER_DAYS = 20;

/** Tons an importing town keeps whatever its size. */
const IMPORT_COVER_FLOOR = 12;

/**
 * Days of its own output a producer keeps on the quay (v0.75.0).
 *
 * The other half of `IMPORT_COVER_DAYS`, and it went unread for eight
 * releases. `marketLevel * 50` is 150 to 250 tons, against a producer that
 * makes about six tons a day and ships a median of a third of that, so the
 * shed stood at the cap in **69 of 69** cases and threw 440 tons a day away
 * across the map.
 *
 * What that cost is the same thing the import ceiling cost, in the mirror.
 * `PricingSystem` prices a good the town does not eat against a stand-in
 * demand of one ton a day, so the quote leaves `RATIO_MIN` only below about
 * fifty tons - a third of the cap. **61 of 69** produced goods were therefore
 * quoted at the floor, permanently, and nothing in the world could move them:
 * a slave revolt cutting output to 30% for sixty days changed the price of the
 * town's own staple by **0.0%**, and the pirate raid that already takes 30% of
 * the warehouse changed it by nothing either. The manual states "output x0.3"
 * and "output x1.5" as if a captain could see them.
 */
export const PRODUCER_COVER_DAYS = 8;

/** Tons a producer keeps whatever its size. */
const PRODUCER_COVER_FLOOR = 20;

/** Per-item inventory cap (a producer port can stockpile up to this much). */
export function inventoryCap(portKey: string, itemKey: string): number {
  const def = CITIES[portKey];
  if (!def) return 50;
  if (def.produces.includes(itemKey)) {
    // Baseline wealth, not today's, for the reason the import branch uses
    // baseline population: a cap that shrank with the town would shrink the
    // warehouse of a town an event had already emptied.
    const rate = baselineProductionRate(portKey, itemKey, getPortBaseline(portKey).wealth);
    return Math.max(PRODUCER_COVER_FLOOR, rate * PRODUCER_COVER_DAYS);
  }
  // A good the town neither grows nor eats keeps no cover, because there is no
  // eating to measure it against. Gold on its way through a strike town is the
  // case that matters: it is stocked by `bonusProduces`, which this function
  // cannot see, and it kept the flat thirty it always had.
  if (!def.demands.includes(itemKey)) return 30;
  // Baseline population, not today's: a cap that moved with the population
  // would shrink the warehouse of a town an epidemic had already emptied.
  const pop = getPortBaseline(portKey).population;
  return Math.max(IMPORT_COVER_FLOOR, baselineConsumptionRate(portKey, itemKey, pop) * IMPORT_COVER_DAYS);
}
