/**
 * PrivateerSystem — what a letter of marque is actually for (v0.37.0).
 *
 * The letter has been in the game since the first governor's dialogue and, up
 * to now, it has been a keepsake. Two systems read it — `ReconquestSystem`
 * counts you an ally of the crown that issued it, and `SiegeSystem` lets you
 * hand a captured town to one — and that is the whole of it. At sea, the paper
 * did nothing: taking a Spanish trader cost the same standing with Spain, and
 * bought the same credit with the brethren, whether you carried an English
 * commission or nothing at all.
 *
 * That is the shape of "a field with no consumer", one floor up: the flag *was*
 * consumed, but not by anything the player does on an ordinary afternoon.
 *
 * ## The commission is a job, and it has a shape
 *
 * A hostile act is now settled against whatever paper the captain carries:
 *
 * - **Covered** — his patron is at war with the victim's crown. The patron
 *   declares the prize good and thinks better of him, and the brethren credit
 *   him with only half of it. He is a privateer, and a privateer is not a
 *   pirate.
 * - **Uncovered** — he holds a commission and takes a hull his patron has no
 *   quarrel with. The crown is embarrassed by him, and says so. This is the
 *   *cost* of carrying the paper, and it is why the letter is a decision rather
 *   than a free bonus: without one, an indiscriminate captain answers to nobody.
 * - **Betrayal** — he takes a hull of the very crown that commissioned him. The
 *   letter is torn up on the spot. Nothing else in the game revokes it, and
 *   nothing else should: a commission ends when you turn on your patron.
 *
 * ## Why the counter makes it exclusive
 *
 * Until this release a captain could collect all four crowns' letters and be
 * covered against everybody by somebody. That made "uncovered" unreachable and
 * "which crown do I serve" a question with no answer. Taking a new commission
 * now gives up the old one (`requestLetterOfMarque`).
 *
 * Exclusivity is enforced **at the counter only**, and every function here works
 * over the *set* of letters held. A save written before this release may carry
 * two, and it reads correctly rather than needing a migration: covered if any
 * of them is at war with the victim, embarrassed by each that is not.
 */

import type { WorldState } from "../model/WorldState.ts";
import { changeReputation } from "./ReputationSystem.ts";
import { areFactionsAtWar } from "./EventEffectsSystem.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { FACTIONS } from "../data/factions.ts";

/**
 * A crown's name for a line the Journal will print.
 *
 * Log entries keep their `vars` and render them verbatim later, so a raw
 * faction key put in one reaches the screen as "england". `huntQuest` bakes its
 * town names for the same reason.
 */
function crownName(key: string): string {
  return FACTIONS[key]?.name ?? key;
}

export const MARQUE_PREFIX = "letter_of_marque_";

export function marqueFlag(faction: string): string {
  return MARQUE_PREFIX + faction;
}

/** Every crown whose commission the captain is carrying. */
export function letterCrowns(world: WorldState): string[] {
  return Object.keys(world.worldFlags)
    .filter(k => k.startsWith(MARQUE_PREFIX) && world.worldFlags[k] === true)
    .map(k => k.slice(MARQUE_PREFIX.length));
}

/** Patrons at war with this crown — the ones whose paper covers the act. */
export function coveringPatrons(world: WorldState, victim: string): string[] {
  return letterCrowns(world).filter(c => c !== victim && areFactionsAtWar(world, c, victim));
}

/** Patrons with no quarrel with this crown — the ones the act embarrasses. */
export function embarrassedPatrons(world: WorldState, victim: string): string[] {
  return letterCrowns(world).filter(c => c !== victim && !areFactionsAtWar(world, c, victim));
}

/** True when the captain is carrying the victim's own commission. */
export function betrayedPatron(world: WorldState, victim: string): boolean {
  return letterCrowns(world).includes(victim);
}

// ── What a hostile act costs and pays ────────────────────

/** What the victim's crown makes of it. Unchanged since the first battle. */
export const HOSTILE_REP_TRADER = -10;
export const HOSTILE_REP_NAVY = -20;

/** What the brethren make of it. Also unchanged — before a commission. */
export const BRETHREN_TRADER = 6;
export const BRETHREN_NAVY = 12;

/**
 * How much of that credit a commissioned captain earns.
 *
 * Half. He is doing the same thing to the same ship, and the brethren are not
 * fools — but a man carrying a crown's paper is not one of them either, and the
 * whole interest of the letter is that it pulls him away from the black flag
 * without pulling him out of the fight.
 */
export const PRIVATEER_BRETHREN_SHARE = 0.5;

/** What the patron thinks of a prize taken from an enemy of his. */
export const PRIZE_PATRON_TRADER = 5;
export const PRIZE_PATRON_NAVY = 10;

/**
 * What the patron thinks of a prize taken from somebody he is at peace with.
 *
 * Deliberately larger than a single covered trader is worth. Carrying a
 * commission and using it indiscriminately has to be worse than carrying none,
 * or the letter would be a free bonus and the choice of patron would not be a
 * choice.
 */
export const UNCOVERED_PATRON = -8;

export type PrizeStanding = {
  world: WorldState;
  /** Crowns that declared the prize good. */
  covered: string[];
  /** Crowns embarrassed by it. */
  uncovered: string[];
  /** True when a commission was torn up. */
  revoked: boolean;
};

/**
 * Settle a fight against a crown's hull: standing, the brethren, and the paper.
 *
 * This is the block that used to sit inline in `SeaBattleScene`, moved into the
 * core unchanged in its arithmetic and then given the commission to read. The
 * scene keeps the decision about *when* an act is hostile; everything about
 * what it is worth lives here, where it can be asserted.
 *
 * A pirate has no crown to offend, so a fight with one settles nothing — the
 * world comes back untouched, which is what lets the call site be one line.
 */
export function settleHostileAct(
  world: WorldState,
  victim: string | undefined,
  behavior: string | undefined,
): PrizeStanding {
  const none = { world, covered: [], uncovered: [], revoked: false };
  if (!victim || !behavior || behavior === "pirate") return none;

  const isNavy = behavior === "navy";
  const covered = coveringPatrons(world, victim);
  const uncovered = embarrassedPatrons(world, victim);
  const betrayed = betrayedPatron(world, victim);

  // The brethren's credit, halved for a man with a commission that covers him.
  const brethren = isNavy ? BRETHREN_NAVY : BRETHREN_TRADER;
  const credit = covered.length > 0
    ? Math.round(brethren * PRIVATEER_BRETHREN_SHARE)
    : brethren;

  let reputation = changeReputation(
    changeReputation(world.player.reputation, victim, isNavy ? HOSTILE_REP_NAVY : HOSTILE_REP_TRADER),
    "pirates",
    credit,
  );

  for (const patron of covered) {
    reputation = changeReputation(reputation, patron, isNavy ? PRIZE_PATRON_NAVY : PRIZE_PATRON_TRADER);
  }
  for (const patron of uncovered) {
    reputation = changeReputation(reputation, patron, UNCOVERED_PATRON);
  }

  let flags = world.worldFlags;
  if (betrayed) {
    // Torn up on the spot. Nothing else in the game revokes a commission, and
    // nothing else should.
    flags = { ...flags };
    delete flags[marqueFlag(victim)];
  }

  let w: WorldState = {
    ...world,
    player: { ...world.player, reputation },
    worldFlags: flags,
  };

  for (const patron of covered) {
    w = addLogEntry(w, "privateer.log_prize", { faction: crownName(patron) });
  }
  for (const patron of uncovered) {
    w = addLogEntry(w, "privateer.log_uncovered", { faction: crownName(patron), victim: crownName(victim) });
  }
  if (betrayed) w = addLogEntry(w, "privateer.log_revoked", { faction: crownName(victim) });

  return { world: w, covered, uncovered, revoked: betrayed };
}
