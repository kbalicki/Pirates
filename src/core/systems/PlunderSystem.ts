/**
 * PlunderSystem — the crew wants its share, and eventually says so.
 *
 * Everything the player accumulates has so far been free: gold piles up, the
 * crew sails on, and nothing ever asks for anything back. This is the first
 * mechanic that takes something away on a clock.
 *
 * ## The loop
 *
 * Every `PLUNDER_INTERVAL_DAYS` at sea the crew expects a division of the
 * plunder. Past that date morale bleeds a little every day — the same morale
 * that already drives reload speed, boarding strength and repair pace, so an
 * ignored crew is measurably worse at everything before it ever mutinies.
 *
 * Dividing the plunder is done in port. It costs most of the gold on hand and
 * most of the crew: paid men go ashore to spend it. What is left is a small,
 * loyal, well-rested core and a clean slate — which is exactly the rhythm the
 * genre runs on. You cannot hoard forever, and every division is a decision
 * about when to cash in a voyage.
 *
 * The captain's cut rises with rank and notoriety: a famous privateer with a
 * commission argues from a stronger position than an unknown with one sloop.
 */

import type { WorldState } from "../model/WorldState.ts";
import { addLogEntry } from "./EventLogSystem.ts";

/** Days between divisions before the crew starts grumbling. */
export const PLUNDER_INTERVAL_DAYS = 60;
/** Morale lost per day once a division is overdue. */
export const PLUNDER_OVERDUE_MORALE_PER_DAY = 0.004;
/** Morale can only be dragged this low by an unpaid crew alone. */
export const PLUNDER_OVERDUE_MORALE_FLOOR = 0.15;

/** Smallest share of the takings the captain ever keeps. */
export const CAPTAIN_SHARE_MIN = 0.35;
/** Largest share, for a famous captain with rank behind him. */
export const CAPTAIN_SHARE_MAX = 0.60;

/** Fraction of the crew that stays aboard after being paid. */
export const CREW_REMAINING_AFTER_SHARE = 0.35;

export type PlunderStatus = {
  /** Day the last division happened (or the voyage began). */
  lastShareDay: number;
  daysSince: number;
  daysUntilDue: number;
  overdue: boolean;
  /** How many days past due; 0 when not overdue. */
  daysOverdue: number;
};

export function plunderStatus(world: WorldState): PlunderStatus {
  const lastShareDay = world.player.lastPlunderDay ?? 1;
  const daysSince = Math.max(0, world.time.day - lastShareDay);
  const daysOverdue = Math.max(0, daysSince - PLUNDER_INTERVAL_DAYS);
  return {
    lastShareDay,
    daysSince,
    daysUntilDue: Math.max(0, PLUNDER_INTERVAL_DAYS - daysSince),
    overdue: daysOverdue > 0,
    daysOverdue,
  };
}

/**
 * The captain's cut, 0..1.
 *
 * Rank with any faction and a fearsome name both argue for a bigger share;
 * an unknown captain takes the traditional minimum.
 */
export function captainShare(world: WorldState): number {
  const bestRank = Math.max(0, ...Object.values(world.player.ranks ?? {}), 0);
  const fromRank = Math.min(0.15, bestRank * 0.03);
  const fromFame = Math.min(0.10, Math.max(0, world.player.notoriety) / 500);
  return Math.min(CAPTAIN_SHARE_MAX, CAPTAIN_SHARE_MIN + fromRank + fromFame);
}

/**
 * One day of an unpaid crew grumbling. A no-op until the division is overdue.
 * Pure — returns a new world.
 */
export function applyOverdueMorale(world: WorldState): WorldState {
  if (!plunderStatus(world).overdue) return world;

  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  const ship = entity?.ship;
  if (!ship) return world;

  const morale = ship.crew.morale;
  if (morale <= PLUNDER_OVERDUE_MORALE_FLOOR) return world;

  const next = Math.max(PLUNDER_OVERDUE_MORALE_FLOOR, morale - PLUNDER_OVERDUE_MORALE_PER_DAY);
  if (next === morale) return world;

  return {
    ...world,
    entities: {
      ...world.entities,
      [shipId]: { ...entity, ship: { ...ship, crew: { ...ship.crew, morale: next } } },
    },
  };
}

export type ShareResult = {
  world: WorldState;
  /** Gold the captain kept. */
  captainKept: number;
  /** Gold handed out to the crew. */
  crewPaid: number;
  /** Hands who took their money and went ashore. */
  crewLeft: number;
  error?: "not_in_port" | "no_ship" | "nothing_to_divide";
};

/**
 * Divide the plunder. Only in port — the men want a tavern, not a deck.
 *
 * Gold is split by `captainShare()`, most of the crew goes ashore with its
 * money, and those who stay are rested and content. The clock resets.
 */
export function dividePlunder(world: WorldState): ShareResult {
  if (world.player.location.type !== "port") {
    return { world, captainKept: 0, crewPaid: 0, crewLeft: 0, error: "not_in_port" };
  }

  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  const ship = entity?.ship;
  if (!ship) return { world, captainKept: 0, crewPaid: 0, crewLeft: 0, error: "no_ship" };

  const gold = world.player.gold;
  if (gold <= 0) {
    return { world, captainKept: 0, crewPaid: 0, crewLeft: 0, error: "nothing_to_divide" };
  }

  const share = captainShare(world);
  const captainKept = Math.floor(gold * share);
  const crewPaid = gold - captainKept;

  const stays = Math.max(1, Math.round(ship.crew.current * CREW_REMAINING_AFTER_SHARE));
  const crewLeft = Math.max(0, ship.crew.current - stays);

  const divided: WorldState = {
    ...world,
    player: {
      ...world.player,
      gold: captainKept,
      lastPlunderDay: world.time.day,
    },
    entities: {
      ...world.entities,
      [shipId]: {
        ...entity,
        ship: { ...ship, crew: { ...ship.crew, current: stays, morale: 1 } },
      },
    },
  };

  return {
    world: addLogEntry(divided, "event.plunder_divided", { crew: crewPaid, kept: captainKept, left: crewLeft }),
    captainKept,
    crewPaid,
    crewLeft,
  };
}
