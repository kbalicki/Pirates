/**
 * Fleet management system.
 *
 * The player's fleet = 1 flagship (entity.ship) + 0-2 extra ships (player.fleet[]).
 * Max 3 ships total. All ships in the fleet belong to the player.
 *
 * Fleet rules:
 * - Speed = MIN speedBase across all ships (slowest ship limits fleet)
 * - Vision = MAX mastHeight across all ships (tallest mast sees furthest)
 * - Crew = shared pool on flagship; each ship needs crewMin to operate
 * - Cargo = flagship only
 * - Abandon extra ship at sea anytime; sell in shipyard
 * - Capture in combat (future) adds to fleet if slot available
 */

import { SHIP_CLASSES } from "../data/ships.ts";
import type { FleetShip, PlayerState } from "../model/WorldState.ts";
import type { ShipData } from "../model/EntityState.ts";

export const MAX_FLEET_SIZE = 3; // flagship + 2 escorts

/** Get total fleet size (1 flagship + escorts). */
export function fleetSize(player: PlayerState): number {
  return 1 + (player.fleet?.length ?? 0);
}

/** Can the player add another ship to the fleet? */
export function canAddToFleet(player: PlayerState): boolean {
  return fleetSize(player) < MAX_FLEET_SIZE;
}

/** Get the effective speed multiplier for the fleet (ratio of slowest to flagship). */
export function fleetSpeedMultiplier(flagshipClassId: string, fleet: FleetShip[]): number {
  const flagshipClass = SHIP_CLASSES[flagshipClassId];
  if (!flagshipClass || fleet.length === 0) return 1;

  let minSpeed = flagshipClass.speedBase;
  for (const escort of fleet) {
    const cls = SHIP_CLASSES[escort.classId];
    if (cls && cls.speedBase < minSpeed) {
      minSpeed = cls.speedBase;
    }
  }
  return minSpeed / flagshipClass.speedBase;
}

/** Get the tallest mast height across the entire fleet. */
export function fleetMaxMastHeight(flagshipClassId: string, fleet: FleetShip[]): number {
  const flagshipClass = SHIP_CLASSES[flagshipClassId];
  let maxMast = flagshipClass?.mastHeight ?? 15;

  for (const escort of fleet) {
    const cls = SHIP_CLASSES[escort.classId];
    if (cls && cls.mastHeight > maxMast) {
      maxMast = cls.mastHeight;
    }
  }
  return maxMast;
}

/**
 * Crew a consort is assumed to carry when its own count has never been written.
 *
 * Most of its berths, but not all — a prize crew is thinner than a ship's own
 * complement, and a consort has no captain aboard to press more.
 */
export const FLEET_CREW_FRACTION = 0.8;

/** Berths aboard a consort. */
export function consortCrewMax(consort: FleetShip): number {
  return SHIP_CLASSES[consort.classId]?.crewMax ?? 0;
}

/**
 * Men aboard a consort.
 *
 * Until v0.17.0 `FleetShip` had no crew at all and every reader derived this
 * number from the class, which meant a consort walked off a siege beach with
 * whatever it had walked on with. The field is optional, so this is also the
 * one place the old behaviour survives: a save written before the field existed
 * answers exactly what it used to until the ship next takes losses.
 */
export function consortCrew(consort: FleetShip): number {
  return Math.max(0, Math.round(consort.crew ?? consortCrewMax(consort) * FLEET_CREW_FRACTION));
}

/**
 * Morale a consort is assumed to have when none was ever written.
 *
 * The number `SeaBattleScene` used to hardcode when it built an ally out of a
 * `FleetShip`, so a save from before the field existed fights exactly as it did.
 */
export const FLEET_DEFAULT_MORALE = 0.8;

/** How the men aboard a consort feel, 0..1. */
export function consortMorale(consort: FleetShip): number {
  return Math.max(0, Math.min(1, consort.morale ?? FLEET_DEFAULT_MORALE));
}

/**
 * Morale across the whole fleet, weighted by how many men each ship carries.
 *
 * Weighted rather than averaged: a mutinous pinnace should not drag a
 * hundred-hand frigate down to its own mood, and a happy pinnace should not
 * rescue one. Falls back to the flagship's own morale for a one-ship fleet,
 * which is what every caller got before this existed.
 */
export function fleetMorale(flagshipMorale: number, flagshipCrew: number, fleet: FleetShip[]): number {
  let men = Math.max(0, flagshipCrew);
  let sum = Math.max(0, flagshipCrew) * flagshipMorale;
  for (const consort of fleet) {
    const crew = consortCrew(consort);
    men += crew;
    sum += crew * consortMorale(consort);
  }
  return men > 0 ? Math.max(0, Math.min(1, sum / men)) : flagshipMorale;
}

/** How far below the captain's own crew a newly joined hull starts. */
export const GREEN_CREW_PENALTY = 0.15;
/** Drill no crew falls below, however green. */
export const GREEN_CREW_FLOOR = 0.2;

/** How well a consort's people are drilled. */
export function consortTraining(consort: FleetShip, flagshipTraining: number): number {
  return Math.max(0, Math.min(1, consort.training ?? flagshipTraining));
}

/**
 * Drill across the fleet, weighted by men — the same shape as `fleetMorale`.
 *
 * This is what makes a second ship a real decision rather than free guns: a
 * hull that joins today is manned by people the captain has never drilled, and
 * a siege bombardment is measurably worse for it until they catch up.
 */
export function fleetTraining(
  flagshipTraining: number,
  flagshipCrew: number,
  fleet: FleetShip[],
): number {
  let men = Math.max(0, flagshipCrew);
  let sum = Math.max(0, flagshipCrew) * flagshipTraining;
  for (const consort of fleet) {
    const crew = consortCrew(consort);
    men += crew;
    sum += crew * consortTraining(consort, flagshipTraining);
  }
  return men > 0 ? Math.max(0, Math.min(1, sum / men)) : flagshipTraining;
}

/** What a hull joining the fleet today knows. */
export function greenCrewTraining(captainTraining: number): number {
  return Math.max(GREEN_CREW_FLOOR, Math.min(1, captainTraining - GREEN_CREW_PENALTY));
}

/** Berths standing empty across the consorts. */
export function consortBerthsFree(fleet: FleetShip[]): number {
  return fleet.reduce((sum, c) => sum + Math.max(0, consortCrewMax(c) - consortCrew(c)), 0);
}

/**
 * Put `men` aboard the consorts, shortest-handed ship first.
 *
 * Hiring in a tavern used to stop at the flagship's own berths, which after
 * v0.17.0 would have left a gutted consort permanently gutted — the same
 * one-way ratchet a dismasted ship at zero speed would have been. Men go where
 * they are most needed, and what will not fit is handed back to the caller.
 */
export function manConsorts(fleet: FleetShip[], men: number): { fleet: FleetShip[]; placed: number } {
  let left = Math.max(0, Math.floor(men));
  if (left <= 0 || fleet.length === 0) return { fleet, placed: 0 };

  const crews = fleet.map(consortCrew);
  const caps = fleet.map(consortCrewMax);
  let placed = 0;

  // Round-robin by shortfall rather than in array order: two half-empty
  // consorts should both be usable, not one full and one skeleton.
  for (;;) {
    let worst = -1;
    let worstShort = 0;
    for (let i = 0; i < fleet.length; i++) {
      const short = caps[i] - crews[i];
      if (short > worstShort) { worstShort = short; worst = i; }
    }
    if (worst < 0 || left <= 0) break;
    crews[worst] += 1;
    placed += 1;
    left -= 1;
  }

  if (placed === 0) return { fleet, placed: 0 };
  return { fleet: fleet.map((c, i) => ({ ...c, crew: crews[i] })), placed };
}

/** Total minimum crew needed to operate the entire fleet. */
export function fleetMinCrew(flagshipClassId: string, fleet: FleetShip[]): number {
  const flagshipClass = SHIP_CLASSES[flagshipClassId];
  let total = flagshipClass?.crewMin ?? 8;

  for (const escort of fleet) {
    const cls = SHIP_CLASSES[escort.classId];
    if (cls) total += cls.crewMin;
  }
  return total;
}

/** Total cannons across the fleet (for future combat). */
export function fleetTotalCannons(flagshipShip: ShipData, fleet: FleetShip[]): number {
  let total = flagshipShip.cannons;
  for (const escort of fleet) {
    total += escort.cannons;
  }
  return total;
}

/**
 * Add a ship to the fleet. Returns updated fleet array or null if full.
 *
 * `captainTraining` seeds the new hull's drill a notch below the captain's own
 * crew. It is optional so the older two-argument call still means what it did.
 */
export function addToFleet(
  fleet: FleetShip[],
  classId: string,
  captainTraining?: number,
): FleetShip[] | null {
  if (fleet.length >= MAX_FLEET_SIZE - 1) return null; // -1 because flagship not in array

  const cls = SHIP_CLASSES[classId];
  if (!cls) return null;

  return [
    ...fleet,
    {
      classId,
      hullHp: cls.hullMax,
      hullMax: cls.hullMax,
      sailsHp: cls.sailsMax,
      sailsMax: cls.sailsMax,
      cannons: cls.cannons,
      // A hull joining the fleet is manned by the prize crew that took it, or
      // by the yard that sold it. Either way it is the notional complement, so
      // buying and capturing behave the way they did before the field existed.
      crew: Math.round(cls.crewMax * FLEET_CREW_FRACTION),
      morale: FLEET_DEFAULT_MORALE,
      ...(captainTraining === undefined ? {} : { training: greenCrewTraining(captainTraining) }),
    },
  ];
}

/** Remove a ship from the fleet by index. Returns updated fleet array. */
export function removeFromFleet(fleet: FleetShip[], index: number): FleetShip[] {
  return fleet.filter((_, i) => i !== index);
}

/** Get summary info for all fleet ships (for UI display). */
export function fleetSummary(
  flagshipClassId: string,
  fleet: FleetShip[],
): Array<{ name: string; classId: string; hullPercent: number; sailsPercent: number; isEscort: boolean }> {
  const result: Array<{ name: string; classId: string; hullPercent: number; sailsPercent: number; isEscort: boolean }> = [];

  const flagCls = SHIP_CLASSES[flagshipClassId];
  if (flagCls) {
    result.push({
      name: flagCls.name,
      classId: flagshipClassId,
      hullPercent: 100,
      sailsPercent: 100,
      isEscort: false,
    });
  }

  for (const escort of fleet) {
    const cls = SHIP_CLASSES[escort.classId];
    result.push({
      name: cls?.name ?? "Unknown",
      classId: escort.classId,
      hullPercent: escort.hullMax > 0 ? Math.round((escort.hullHp / escort.hullMax) * 100) : 0,
      sailsPercent: escort.sailsMax > 0 ? Math.round((escort.sailsHp / escort.sailsMax) * 100) : 0,
      isEscort: true,
    });
  }

  return result;
}
