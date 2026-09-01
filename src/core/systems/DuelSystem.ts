/**
 * DuelSystem — sword fighting, resolved a blow at a time.
 *
 * Until now `fencing` was a captain skill that touched exactly one multiplier
 * in `BoardingSystem.resolveBoarding()`: you grappled, one number was compared
 * with another, and you were told who won. This module makes the fight itself
 * playable.
 *
 * ## The model
 *
 * A duel is fought along a **line** — the deck between the two captains. One
 * number, `advantage`, says who is driving whom back: positive means the player
 * is pressing forward, negative means being pushed toward the rail. Reach
 * `DUEL_WIN_ADVANTAGE` and the loser is over the side or on his knees.
 *
 * Each exchange both fighters commit to one action at one of three lines —
 * high (head), middle (body), low (legs):
 *
 *   attack_high / attack_mid / attack_low   press the attack at that line
 *   parry_high  / parry_mid  / parry_low    guard that line, ready to riposte
 *
 * Resolution is not rock-paper-scissors on the actions but on the **lines**:
 *
 *   attack vs parry on the SAME line   → parried; the defender ripostes and
 *                                        gains ground (this is how a patient
 *                                        fighter wins)
 *   attack vs parry on ANOTHER line    → the blow lands; the attacker gains
 *   attack vs attack                   → both land, but the better swordsman
 *                                        gains the difference; equal skill is
 *                                        a bruising wash
 *   parry vs parry                     → nothing happens except both catch
 *                                        their breath (stamina recovers)
 *
 * ## Why skill and stamina both matter
 *
 * `fencing` (0-10) scales how much ground a landed blow wins and how much a
 * riposte punishes. Stamina drains on every attack and recovers when guarding,
 * so a captain who swings every round tires and starts losing exchanges he
 * would otherwise win. That is the whole tactical texture: attack to win
 * ground, guard to bait a riposte and get your wind back.
 *
 * Everything is pure and seeded from `RngState`, so a duel replays identically
 * from the same seed — which is what makes it testable.
 */

import type { RngState } from "../model/WorldState.ts";
import { rngNext } from "../services/RNG.ts";

export type DuelLine = "high" | "mid" | "low";
export type DuelAction =
  | "attack_high" | "attack_mid" | "attack_low"
  | "parry_high" | "parry_mid" | "parry_low";

export const DUEL_LINES: DuelLine[] = ["high", "mid", "low"];
export const DUEL_ACTIONS: DuelAction[] = [
  "attack_high", "attack_mid", "attack_low",
  "parry_high", "parry_mid", "parry_low",
];

/** Ground gained/lost at which the duel is over. */
export const DUEL_WIN_ADVANTAGE = 6;
/** Stamina a fighter starts with and cannot exceed. */
export const DUEL_MAX_STAMINA = 10;
/** Stamina spent on an attack. */
export const DUEL_ATTACK_COST = 2;
/** Stamina recovered while guarding. */
export const DUEL_PARRY_RECOVERY = 3;
/** Below this stamina every action is weaker. */
export const DUEL_TIRED_THRESHOLD = 3;
/** How much a tired fighter's blows are worth. */
export const DUEL_TIRED_PENALTY = 0.5;

export type DuelFighter = {
  /** Captain fencing skill, 0-10. */
  fencing: number;
  stamina: number;
};

export type DuelOutcome = "ongoing" | "player_win" | "enemy_win";

export type DuelState = {
  /** Positive = player driving the enemy back; negative = player being driven back. */
  advantage: number;
  player: DuelFighter;
  enemy: DuelFighter;
  round: number;
  rng: RngState;
  outcome: DuelOutcome;
};

/** What happened in one exchange — the scene turns this into animation and text. */
export type DuelExchange = {
  playerAction: DuelAction;
  enemyAction: DuelAction;
  /** "player" gained ground, "enemy" gained ground, or "none". */
  gainedBy: "player" | "enemy" | "none";
  /** How much ground changed hands (always >= 0). */
  ground: number;
  /** Narration key for the log line. */
  resultKey: string;
  state: DuelState;
};

export function isAttack(action: DuelAction): boolean {
  return action.startsWith("attack_");
}

export function lineOf(action: DuelAction): DuelLine {
  return action.slice(action.indexOf("_") + 1) as DuelLine;
}

export function createDuel(
  playerFencing: number,
  enemyFencing: number,
  rng: RngState,
): DuelState {
  return {
    advantage: 0,
    player: { fencing: clamp01to10(playerFencing), stamina: DUEL_MAX_STAMINA },
    enemy: { fencing: clamp01to10(enemyFencing), stamina: DUEL_MAX_STAMINA },
    round: 0,
    rng,
    outcome: "ongoing",
  };
}

function clamp01to10(v: number): number {
  return Math.max(0, Math.min(10, v));
}

/**
 * Ground a fighter's landed blow is worth.
 *
 * A blade is a blade — even a novice's hit moves his man — so there is a flat
 * base, with skill adding on top. Being winded halves whatever you had.
 */
function blowWeight(fighter: DuelFighter): number {
  const base = 1 + fighter.fencing / 10;             // 1.0 .. 2.0
  const tired = fighter.stamina < DUEL_TIRED_THRESHOLD ? DUEL_TIRED_PENALTY : 1;
  return base * tired;
}

function spendStamina(fighter: DuelFighter, action: DuelAction): DuelFighter {
  const delta = isAttack(action) ? -DUEL_ATTACK_COST : DUEL_PARRY_RECOVERY;
  return { ...fighter, stamina: Math.max(0, Math.min(DUEL_MAX_STAMINA, fighter.stamina + delta)) };
}

/**
 * The enemy's choice for this exchange.
 *
 * Not random flailing: he attacks more often when he is winning or when the
 * player has been leaning on one line, and guards when winded. Skill makes him
 * likelier to guard the line the player actually used last — a good swordsman
 * reads you.
 */
export function chooseEnemyAction(
  state: DuelState,
  playerLastAction: DuelAction | null,
): { action: DuelAction; rng: RngState } {
  let rng = state.rng;
  const roll = (): number => {
    const r = rngNext(rng);
    rng = r.state;
    return r.value;
  };

  // Winded fighters guard almost always; it is the only way to get wind back.
  if (state.enemy.stamina < DUEL_ATTACK_COST) {
    const line = DUEL_LINES[Math.floor(roll() * 3) % 3];
    return { action: ("parry_" + line) as DuelAction, rng };
  }

  // Read: a skilled enemy guards the line the player just used.
  const readChance = state.enemy.fencing / 20; // 0 .. 0.5
  if (playerLastAction && isAttack(playerLastAction) && roll() < readChance) {
    return { action: ("parry_" + lineOf(playerLastAction)) as DuelAction, rng };
  }

  // Aggression rises when he is ahead, falls when he is being driven back.
  const aggression = 0.5 - state.advantage * 0.05;
  const verb = roll() < aggression ? "attack" : "parry";
  const line = DUEL_LINES[Math.floor(roll() * 3) % 3];
  return { action: (verb + "_" + line) as DuelAction, rng };
}

/**
 * Resolve one exchange. Pure — returns a new state alongside a description of
 * what happened, so the scene can narrate it without re-deriving anything.
 */
export function resolveExchange(
  state: DuelState,
  playerAction: DuelAction,
  enemyAction: DuelAction,
): DuelExchange {
  if (state.outcome !== "ongoing") {
    return {
      playerAction, enemyAction, gainedBy: "none", ground: 0,
      resultKey: "duel.over", state,
    };
  }

  const player = spendStamina(state.player, playerAction);
  const enemy = spendStamina(state.enemy, enemyAction);
  const mid: DuelState = { ...state, player, enemy, round: state.round + 1 };

  const pAttacks = isAttack(playerAction);
  const eAttacks = isAttack(enemyAction);
  const pLine = lineOf(playerAction);
  const eLine = lineOf(enemyAction);

  let gainedBy: DuelExchange["gainedBy"] = "none";
  let ground = 0;
  let resultKey = "duel.circling";

  if (pAttacks && eAttacks) {
    // Both committed. The better blade comes off better; equal skill is a wash.
    const diff = blowWeight(player) - blowWeight(enemy);
    ground = Math.abs(diff);
    if (ground < 0.05) {
      gainedBy = "none";
      ground = 0;
      resultKey = "duel.blades_lock";
    } else {
      gainedBy = diff > 0 ? "player" : "enemy";
      resultKey = "duel.trade_blows";
    }
  } else if (pAttacks && !eAttacks) {
    if (pLine === eLine) {
      // Parried on the right line — the riposte is what makes guarding pay.
      gainedBy = "enemy";
      ground = blowWeight(enemy);
      resultKey = "duel.parried_riposte";
    } else {
      gainedBy = "player";
      ground = blowWeight(player);
      resultKey = "duel.hit_lands";
    }
  } else if (!pAttacks && eAttacks) {
    if (pLine === eLine) {
      gainedBy = "player";
      ground = blowWeight(player);
      resultKey = "duel.parry_riposte";
    } else {
      gainedBy = "enemy";
      ground = blowWeight(enemy);
      resultKey = "duel.hit_taken";
    }
  } else {
    // Both guarding: nothing happens but both get their wind back.
    resultKey = "duel.circling";
  }

  const signed = gainedBy === "player" ? ground : gainedBy === "enemy" ? -ground : 0;
  const advantage = clampAdvantage(mid.advantage + signed);

  const outcome: DuelOutcome =
    advantage >= DUEL_WIN_ADVANTAGE ? "player_win"
    : advantage <= -DUEL_WIN_ADVANTAGE ? "enemy_win"
    : "ongoing";

  return {
    playerAction,
    enemyAction,
    gainedBy,
    ground,
    resultKey,
    state: { ...mid, advantage, outcome },
  };
}

function clampAdvantage(v: number): number {
  return Math.max(-DUEL_WIN_ADVANTAGE, Math.min(DUEL_WIN_ADVANTAGE, v));
}

/** Play one full exchange: the enemy picks, then both are resolved. */
export function duelStep(
  state: DuelState,
  playerAction: DuelAction,
  playerLastAction: DuelAction | null,
): DuelExchange {
  const { action: enemyAction, rng } = chooseEnemyAction(state, playerLastAction);
  return resolveExchange({ ...state, rng }, playerAction, enemyAction);
}

/**
 * Fencing skill of a ship's captain, derived from the crew it commands.
 *
 * NPC ships carry no captain profile, so their swordsmanship is inferred: a
 * bigger, better-manned ship is commanded by someone who has survived more
 * boardings. Kept here so both the scene and the tests agree on it.
 */
export function enemyFencingFor(crewCurrent: number, crewMax: number, notoriety: number): number {
  const crewFrac = crewMax > 0 ? Math.max(0, Math.min(1, crewCurrent / crewMax)) : 0;
  // 3 at half-empty and unknown, up to 9 against a full crew and a famous name.
  const fromCrew = 3 + crewFrac * 4;
  const fromFame = Math.max(0, Math.min(2, notoriety / 25));
  return clamp01to10(fromCrew + fromFame);
}
