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
 * ## The debt is a ceiling, not a bleed (v0.71.0)
 *
 * It was written as a bleed, and for thirty releases the bleed did nothing at
 * all. `CrewConsumptionSystem` gives a fed crew **0.005 morale an hour**; this
 * module took **0.004 a day**. The larder outran the debt **thirty to one**,
 * and it only had to hold for **forty-eight minutes of each day** to cancel it
 * outright. Measured on the engine: a crew five hundred and forty-seven days
 * past its division, with food and water aboard, sits at **morale 1.000** — and
 * climbs there from the floor in a week. A round of drinks did the same for ten
 * gold, which priced the whole mechanic at **0.27 gold a day**, against the
 * thirteen thousand gold and seventy-eight of a hundred and twenty hands that
 * an actual division costs.
 *
 * "You cannot hoard forever" was the design. You could hoard forever.
 *
 * The cure is the one v0.67.0 found for the price ceiling: **the thing was a
 * condition, and it was written as an event.** `moraleCeiling` is the best an
 * unpaid crew will feel however well it eats, and every hand that *raises*
 * morale clamps to it — the larder, the tavern, the surgeon. Nothing else
 * changed: a paid crew recovers exactly as fast as it always did, and an
 * unpaid one still walks down the same curve at the same rate.
 *
 * What money buys is a good night. It does not buy a settled account.
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
import { consortMorale } from "./FleetSystem.ts";

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
/**
 * The best an unpaid crew will feel, whatever else is done for them.
 *
 * Exactly the curve the daily bleed used to walk — `PLUNDER_OVERDUE_MORALE_PER_DAY`
 * off a day, down to the floor — except that it is now a **property of the
 * debt** rather than something that happened once a day and could be undone
 * before the next one came round. Read by everything that lifts morale, which
 * is the whole of the fix.
 *
 * A crew that is not overdue has no ceiling, and the value is 1.
 */
export function moraleCeiling(world: WorldState): number {
  const { daysOverdue } = plunderStatus(world);
  if (daysOverdue <= 0) return 1;
  return Math.max(
    PLUNDER_OVERDUE_MORALE_FLOOR,
    1 - daysOverdue * PLUNDER_OVERDUE_MORALE_PER_DAY,
  );
}

/** Lift `morale`, but no further than an unpaid crew allows. */
export function raiseMorale(world: WorldState, morale: number, by: number): number {
  const ceiling = moraleCeiling(world);
  // Never *lower* anything: a crew already above its ceiling is walked down by
  // `applyOverdueMorale` at the day boundary, not by having a drink.
  return Math.max(morale, Math.min(Math.min(1, morale + by), ceiling));
}

export function applyOverdueMorale(world: WorldState): WorldState {
  if (!plunderStatus(world).overdue) return world;

  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  const ship = entity?.ship;
  if (!ship) return world;

  const ceiling = moraleCeiling(world);
  const decay = (m: number) => Math.min(m, ceiling);

  const morale = decay(ship.crew.morale);
  // The consorts' people are owed the same share and grumble at the same rate
  // (v0.19.0). Before this only the flagship noticed, which made a fleet's
  // morale a property of one deck.
  const fleet = (world.player.fleet ?? []).map(consort => {
    const next = decay(consortMorale(consort));
    return next === consortMorale(consort) ? consort : { ...consort, morale: next };
  });

  const fleetChanged = fleet.some((c, i) => c !== (world.player.fleet ?? [])[i]);
  if (morale === ship.crew.morale && !fleetChanged) return world;

  return {
    ...world,
    player: { ...world.player, fleet },
    entities: {
      ...world.entities,
      [shipId]: { ...entity, ship: { ...ship, crew: { ...ship.crew, morale } } },
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
      // Everyone who was owed a share got one, the men on the consorts included.
      fleet: (world.player.fleet ?? []).map(c => ({ ...c, morale: 1 })),
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
