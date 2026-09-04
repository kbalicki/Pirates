/**
 * What a town will actually do for you — reputation, finally, at the quay.
 *
 * Eleven releases put reputation into the game. Sinking a Spanish plate ship
 * cost you with Spain; taking a French town cost you with France; a charter
 * honoured bought standing with the crown that paid for it; the governor
 * counts it before he hands over a letter of marque or a daughter. And then
 * the player walked past the fort into the town and **every single one of
 * those numbers stopped mattering**. Cartagena, which he had spent a year
 * burning, sold him powder at the same price as Port Royale, signed him
 * freight, and let its sons ship out with him.
 *
 * That was the largest gap between what the game recorded and what the game
 * did. This module closes it, and it does so as one table rather than five
 * scattered checks, so that "what does hostile mean" has exactly one answer:
 *
 *   - **The merchant deals with anybody**, at a price. He is a merchant. What
 *     changes is his *spread*: the gap between what he asks and what he
 *     offers. An ally quotes him within a few percent of the posted price; a
 *     town he has been burning quotes him thirty percent either way and makes
 *     its opinion of him back on every barrel.
 *   - **The tavern is where standing bites hardest.** Men sign on with a
 *     captain their families do not hate. Hostile: nobody. Allied: the pool
 *     is half again as deep.
 *   - **The freight office needs trust and has none to spare.** A merchant
 *     hands over forty tons of somebody else's cocoa on a promise. He will
 *     not hand it to a man his own crown has a price on. Below neutral there
 *     is no work — and no landlord will lease him a warehouse either.
 *   - **The yard will mend anyone's hull for money** — a shipwright is not a
 *     patriot — but it charges an enemy double, and it does not sell him a
 *     ship. A hull is a weapon and he would sail it straight back.
 *
 * ## Why a spread and not a multiplier
 *
 * The obvious shape — mark the price up for an enemy, down for a friend, and
 * use the same number for both directions — is a money printer, and the first
 * screenshot of it proved so: a friendly Port Royale asked 14 for sugar and
 * offered 16, so a captain could stand at the counter buying and selling the
 * same barrel until he owned the Caribbean. A bid and an ask around one posted
 * price cannot do that by construction, however extreme the standing, which is
 * the whole reason it is written this way.
 *
 * Everything is read against the flag flying over the town **today**
 * (`portFaction`), never `CityDef.factionId`, which is a map from 1680.
 */

import type { WorldState } from "../model/WorldState.ts";
import { getReputationLevel, type ReputationLevel } from "./ReputationSystem.ts";
import { portFaction } from "./SiegeSystem.ts";

export type PortAccess = {
  /** The crown whose flag flies here today. */
  faction: string;
  reputation: number;
  level: ReputationLevel;
  /**
   * Half the gap between what the merchant asks and what he offers, as a
   * share of the posted price.
   *
   * He asks `posted × (1 + spread)` and offers `posted × (1 - spread)`, so it
   * is never possible to make money standing still — see the note above. The
   * spread is the whole of the town's opinion at the counter.
   */
  spread: number;
  /** Share of the town's crew pool that will sign on with this captain. */
  crewMul: number;
  /** Whether the freight office has any work for him at all. */
  canCharter: boolean;
  /**
   * Whether anyone here will lease him a warehouse.
   *
   * Kept as its own column rather than folded into `canCharter`, though the
   * two currently agree: they are separate pieces of business — a merchant
   * trusting him with cargo, and a landlord trusting him with a building —
   * and the day one wants to move without the other, this table is where it
   * should show.
   */
  canRentStore: boolean;
  /** Whether the yard will sell him a hull. */
  canBuyShips: boolean;
  /**
   * What the town charges him for work and for rent, as a multiple of the
   * standing rate. The yard's bill and a warehouse lease both read this.
   */
  serviceMul: number;
};

type Tier = Omit<PortAccess, "faction" | "reputation" | "level">;

/**
 * The table. Deliberately one table and not five functions: the whole value of
 * this module is that a reader can see the shape of "unfriendly" at a glance
 * and check that it sits between "hostile" and "neutral" in every column.
 */
const TIERS: Record<ReputationLevel, Tier> = {
  hostile:    { spread: 0.30, crewMul: 0,    canCharter: false, canRentStore: false, canBuyShips: false, serviceMul: 2.0 },
  unfriendly: { spread: 0.20, crewMul: 0.4,  canCharter: false, canRentStore: false, canBuyShips: true,  serviceMul: 1.3 },
  neutral:    { spread: 0.12, crewMul: 1,    canCharter: true,  canRentStore: true,  canBuyShips: true,  serviceMul: 1.0 },
  friendly:   { spread: 0.08, crewMul: 1.25, canCharter: true,  canRentStore: true,  canBuyShips: true,  serviceMul: 0.9 },
  allied:     { spread: 0.05, crewMul: 1.5,  canCharter: true,  canRentStore: true,  canBuyShips: true,  serviceMul: 0.8 },
};

/** What this town will do for the player today. */
export function portAccess(world: WorldState, portKey: string): PortAccess {
  const faction = portFaction(world, portKey) as string;
  const reputation = world.player.reputation[faction] ?? 0;
  const level = getReputationLevel(reputation);
  return { faction, reputation, level, ...TIERS[level] };
}

/** What the counter asks for one unit of a good. */
export function buyPrice(basePrice: number, access: PortAccess): number {
  return Math.max(1, Math.round(basePrice * (1 + access.spread)));
}

/**
 * What the counter offers for one unit of a good.
 *
 * Never more than the ask, even after rounding: at a price of one or two
 * coins the two sides round together, and a bid a penny over the ask would be
 * the same money printer this design exists to rule out.
 */
export function sellPrice(basePrice: number, access: PortAccess): number {
  const bid = Math.max(1, Math.round(basePrice * (1 - access.spread)));
  return Math.min(bid, buyPrice(basePrice, access));
}
