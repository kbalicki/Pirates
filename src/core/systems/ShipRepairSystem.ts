/**
 * ShipRepairSystem — jury repairs at sea and pulling survivors out of the water.
 *
 * Closes the last two gaps in the v0.9.9 damage module. Until now the only way
 * to mend a hull was `repairShip()` in a shipyard, which meant a ship that
 * limped out of a battle at 20 % hull sailed the whole way home at 20 %: the
 * damage stages had a floor you could never climb off under your own power.
 *
 * Two rules keep the shipyard worth paying for:
 *
 *   1. **A cap.** The carpenter's crew can plug shot holes and bend on spare
 *      canvas, not replace frames or step a new mast. Hull tops out at 50 % of
 *      max and rigging at 60 % — enough to get home, never enough to fight a
 *      fresh galleon.
 *   2. **A rate.** Work is measured per game day and scales with how many hands
 *      are left and how willing they are. A full, cheerful crew mends a few
 *      percent a day; a decimated, mutinous one barely keeps up with the sea.
 *
 * Repairs only happen at sea, under way, and never in port — in port the
 * shipyard does a proper job for gold.
 */

import type { WorldState } from "../model/WorldState.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { diluteTraining } from "../model/CaptainState.ts";

/** Jury repairs cannot take the hull past this fraction of its maximum. */
export const SEA_REPAIR_HULL_CAP = 0.50;
/** Spare canvas and splinted spars cannot take the rig past this fraction. */
export const SEA_REPAIR_SAILS_CAP = 0.60;

/** Best-case hull mended per day, as a fraction of hullMax (full, willing crew). */
export const SEA_REPAIR_HULL_PER_DAY = 0.025;
/** Best-case rigging mended per day, as a fraction of sailsMax. */
export const SEA_REPAIR_SAILS_PER_DAY = 0.035;

/** Below this fraction of full complement there are not enough hands to work. */
export const SEA_REPAIR_MIN_CREW_FRAC = 0.20;

export type SeaRepairResult = {
  world: WorldState;
  /** Hull points mended this day (0 when nothing happened). */
  hullMended: number;
  /** Sail points mended this day. */
  sailsMended: number;
};

/**
 * How much of a day's best-case work the crew actually manages, 0..1.
 *
 * Hands do the work and morale decides how hard they push, so the two multiply:
 * a half-strength crew at half morale manages a quarter of the day's work, not
 * three quarters of it.
 */
export function repairEffort(crewCurrent: number, crewMax: number, morale: number): number {
  if (!(crewMax > 0)) return 0;
  const crewFrac = Math.max(0, Math.min(1, crewCurrent / crewMax));
  if (crewFrac < SEA_REPAIR_MIN_CREW_FRAC) return 0;
  // Ramp the usable range 0.2..1.0 onto 0..1 so the threshold is not a cliff.
  const hands = (crewFrac - SEA_REPAIR_MIN_CREW_FRAC) / (1 - SEA_REPAIR_MIN_CREW_FRAC);
  const willing = Math.max(0, Math.min(1, morale));
  return hands * willing;
}

/**
 * One day of jury repairs on the player's ship. Pure — returns a new world.
 * A no-op (and no log entry) when the ship is in port, already above both caps,
 * or has too few hands left to work.
 */
export function repairAtSea(world: WorldState): SeaRepairResult {
  if (world.player.location.type !== "sea") return { world, hullMended: 0, sailsMended: 0 };

  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  const ship = entity?.ship;
  if (!ship) return { world, hullMended: 0, sailsMended: 0 };
  // A sunk hull is past mending.
  if (ship.hullHp <= 0) return { world, hullMended: 0, sailsMended: 0 };

  const effort = repairEffort(ship.crew.current, ship.crew.max, ship.crew.morale);
  if (effort <= 0) return { world, hullMended: 0, sailsMended: 0 };

  const hullCeiling = ship.hullMax * SEA_REPAIR_HULL_CAP;
  const sailsCeiling = ship.sailsMax * SEA_REPAIR_SAILS_CAP;

  const hullMended = Math.max(0, Math.min(
    hullCeiling - ship.hullHp,
    ship.hullMax * SEA_REPAIR_HULL_PER_DAY * effort,
  ));
  const sailsMended = Math.max(0, Math.min(
    sailsCeiling - ship.sailsHp,
    ship.sailsMax * SEA_REPAIR_SAILS_PER_DAY * effort,
  ));

  if (hullMended <= 0 && sailsMended <= 0) return { world, hullMended: 0, sailsMended: 0 };

  const repaired: WorldState = {
    ...world,
    entities: {
      ...world.entities,
      [shipId]: {
        ...entity,
        ship: {
          ...ship,
          hullHp: ship.hullHp + hullMended,
          sailsHp: ship.sailsHp + sailsMended,
        },
      },
    },
  };

  // Only worth telling the player about once the work adds up to a visible point.
  const logged = hullMended + sailsMended >= 1
    ? addLogEntry(repaired, "event.repaired_at_sea", {
        hull: Math.round(hullMended),
        sails: Math.round(sailsMended),
      })
    : repaired;

  return { world: logged, hullMended, sailsMended };
}

// ── Survivors ─────────────────────────────────────────────

/**
 * Fraction of a sunk ship's remaining crew that can be pulled out of the water.
 *
 * Rescue takes boats and time, and both are in short supply right after a
 * fight, so most of a beaten crew is lost even when you try. A ship that went
 * down slowly (more of its own crew still alive) leaves more men to find.
 */
export const RESCUE_FRACTION = 0.40;

export type RescueResult = {
  world: WorldState;
  /** Survivors who actually came aboard (limited by free berths). */
  rescued: number;
  /** Men found in the water but left there for want of room. */
  turnedAway: number;
};

/**
 * Pull survivors from a sunk enemy aboard the player's ship.
 *
 * Rescued men are pressed into the crew, which is why this dilutes training the
 * same way tavern recruits do — they know a different ship, and half of them
 * were shooting at you an hour ago.
 */
export function rescueSurvivors(world: WorldState, enemyCrewAlive: number): RescueResult {
  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  const ship = entity?.ship;
  if (!ship) return { world, rescued: 0, turnedAway: 0 };

  const found = Math.floor(Math.max(0, enemyCrewAlive) * RESCUE_FRACTION);
  if (found <= 0) return { world, rescued: 0, turnedAway: 0 };

  const berths = Math.max(0, ship.crew.max - ship.crew.current);
  const rescued = Math.min(found, berths);
  const turnedAway = found - rescued;

  if (rescued <= 0) return { world, rescued: 0, turnedAway };

  const captain = world.captain;
  const newTraining = captain
    ? diluteTraining(captain.training ?? 0.3, ship.crew.current, rescued)
    : undefined;

  const withCrew: WorldState = {
    ...world,
    entities: {
      ...world.entities,
      [shipId]: {
        ...entity,
        ship: { ...ship, crew: { ...ship.crew, current: ship.crew.current + rescued } },
      },
    },
    captain: captain && newTraining !== undefined
      ? { ...captain, training: newTraining }
      : world.captain,
  };

  return {
    world: addLogEntry(withCrew, "event.survivors_rescued", { count: rescued }),
    rescued,
    turnedAway,
  };
}
