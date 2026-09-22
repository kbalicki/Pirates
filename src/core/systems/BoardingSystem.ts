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
 *
 * "player" and "enemy" here mean **boarder** and **defender**: since v0.86.0
 * the enemy comes across too, and then the captain is the second argument.
 */

import type { CombatShipData } from "../model/CombatState.ts";
import { HULL_WIDTH } from "./CombatSystem.ts";

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

/**
 * How far a grapnel carries: the width of a hull, because it is thrown from
 * alongside (v0.86.0).
 *
 * It was a flat 30 px, and nothing in the game could be at 30 px. The enemy's
 * own boarder mode steers for 40 ("get close enough to grapple", said the
 * comment) and since v0.85.0 no helm the engine steers closes inside a hull's
 * width at all. Measured over 144 battles with a captain who fought his guns
 * and did not ram: the two ships were inside 30 px for **0 ticks of 518 400**,
 * and `canBoard` passed on **none** of them. Boarding was reachable only by
 * steering into her on purpose.
 */
export const BOARDING_RANGE = HULL_WIDTH;
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

/**
 * Resolve the boarding combat. swordsmanship 0..10 captain skill.
 *
 * `forcedCapture` overrides who wins without touching how the casualties are
 * worked out: since v0.10.0 the captains settle it with steel in `DuelScene`,
 * and the melee around them is still costed from the two crews' strength. Left
 * undefined, the old single-roll comparison decides it — which is what NPC-on-
 * NPC boardings and any headless caller still use.
 */
export function resolveBoarding(
  playerShip: CombatShipData,
  enemyShip: CombatShipData,
  swordsmanship: number,
  forcedCapture?: boolean,
  defenderSkill = 0,
): BoardingResult {
  const skillBonus = 1 + Math.max(0, swordsmanship) / 10;
  // The blade counts for whoever is holding it. Left at 0 this is exactly the
  // arithmetic of every release before v0.86.0; it is read when the enemy is
  // the one coming across and the captain is the one defending his deck.
  const defenceBonus = 1 + Math.max(0, defenderSkill) / 10;
  const playerStrength = playerShip.crew.current * Math.max(0.1, playerShip.crew.morale) * skillBonus;
  const enemyStrength = enemyShip.crew.current * Math.max(0.1, enemyShip.crew.morale) * defenceBonus;

  const captured = forcedCapture ?? playerStrength >= enemyStrength;
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
