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

/** Add a ship to the fleet. Returns updated fleet array or null if full. */
export function addToFleet(fleet: FleetShip[], classId: string): FleetShip[] | null {
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
