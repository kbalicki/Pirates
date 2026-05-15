/**
 * Boarding System — resolves close-combat after grappling an enemy ship.
 *
 * Phase C: simplified, deterministic resolution (no live mini-game yet).
 * Combat is a single roll comparing both sides' fighting strength.
 *
 *   playerStrength = crew * morale * (1 + swordsmanship/10)
 *   enemyStrength  = crew * morale
 *
 * If playerStrength >= enemyStrength → capture. Otherwise → defeat.
 * Casualties scale with the strength ratio (loser takes more losses).
 */

import type { CombatShipData } from "../model/CombatState.ts";

export type BoardingPrecheck =
  | { ok: true }
  | { ok: false; reason: "too_far" | "enemy_too_strong" };

export type BoardingResult = {
  captured: boolean;
  playerCrewAfter: number;
  enemyCrewAfter: number;
  /** % of enemy resources looted on capture (0..1) */
  lootFraction: number;
};

export const BOARDING_RANGE = 30;       // arena px
export const BOARDING_MAX_ENEMY_HULL = 0.35;
export const BOARDING_MAX_ENEMY_CREW = 0.50;

export function canBoard(
  playerShip: CombatShipData,
  enemyShip: CombatShipData,
  distance: number,
): BoardingPrecheck {
  if (distance > BOARDING_RANGE) return { ok: false, reason: "too_far" };
  const hullPct = enemyShip.hullMax > 0 ? enemyShip.hullHp / enemyShip.hullMax : 0;
  const crewPct = enemyShip.crew.max > 0 ? enemyShip.crew.current / enemyShip.crew.max : 0;
  // Allow boarding if enemy is weakened (hull OR crew)
  if (hullPct > BOARDING_MAX_ENEMY_HULL && crewPct > BOARDING_MAX_ENEMY_CREW) {
    return { ok: false, reason: "enemy_too_strong" };
  }
  if (playerShip.crew.current < 5) return { ok: false, reason: "enemy_too_strong" };
  return { ok: true };
}

/** Resolve the boarding combat. swordsmanship 0..10 captain skill. */
export function resolveBoarding(
  playerShip: CombatShipData,
  enemyShip: CombatShipData,
  swordsmanship: number,
): BoardingResult {
  const skillBonus = 1 + Math.max(0, swordsmanship) / 10;
  const playerStrength = playerShip.crew.current * Math.max(0.1, playerShip.crew.morale) * skillBonus;
  const enemyStrength = enemyShip.crew.current * Math.max(0.1, enemyShip.crew.morale);

  const captured = playerStrength >= enemyStrength;
  const ratio = captured
    ? Math.min(2, playerStrength / Math.max(1, enemyStrength))
    : Math.min(2, enemyStrength / Math.max(1, playerStrength));

  // Loser takes 50-90% casualties, winner takes 10-30%
  const winnerLossPct = 0.10 + 0.20 / ratio;
  const loserLossPct = 0.50 + Math.min(0.40, 0.20 * ratio);

  const playerLossPct = captured ? winnerLossPct : loserLossPct;
  const enemyLossPct = captured ? loserLossPct : winnerLossPct;

  return {
    captured,
    playerCrewAfter: Math.max(0, Math.round(playerShip.crew.current * (1 - playerLossPct))),
    enemyCrewAfter: Math.max(0, Math.round(enemyShip.crew.current * (1 - enemyLossPct))),
    lootFraction: captured ? 0.80 : 0.0,
  };
}
