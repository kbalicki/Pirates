/**
 * CrewSystem — how many hands a ship needs to be worked, and what it costs her
 * when they are not there.
 *
 * `ShipClassDef.crewMin` has been in the table for all nine classes since the
 * classes were written — 4 for a pinnace, 40 for a galleon — and until v0.49.0
 * exactly one place in the game consulted it: the shipyard's purchase gate,
 * which refused to sell a consort to a captain whose flagship carried fewer men
 * than the whole fleet's minimum. Everywhere else the number was decoration. It
 * was printed on the help screen and in the yard's column, and a ship crewed by
 * six men sailed, tacked and reefed exactly like one crewed by sixty.
 *
 * Worse, the commonest way to gain a hull walked round the gate entirely. A
 * captured galleon joined the fleet manned by `crewMax x 0.8` men who came from
 * nowhere at all: the flagship lost nobody, and a sloop's boarding party of
 * two dozen turned into a hundred and twenty men across two ships.
 *
 * So the pool is real now. A prize is manned out of the flagship's own people,
 * made up with whichever prisoners will serve, and a ship worked by too few
 * hands answers her helm badly.
 *
 * ## Why the tiers look the way they do
 *
 * Same shape as `DamageSystem`: named stages with coarse multipliers, so that
 * crossing one is *felt* rather than smoothly discounted. But the numbers lean
 * the other way. Damage takes a ship's speed; short-handedness takes her
 * **handling**. A skeleton crew can keep the courses set and run before the
 * wind almost as fast as a full one — what they cannot do is brace round in a
 * hurry or shorten sail before a squall. So `turnMul` falls twice as fast as
 * `speedMul`, and `handlingMul` — the time a sail change takes — climbs.
 *
 * That is also what makes the mechanic a decision instead of a tax: an
 * undermanned prize cannot run away and cannot come about, which is exactly
 * the risk a captain accepts when he takes something bigger than he can man.
 *
 * ## The neutral is "fully manned", and it was already true everywhere
 *
 * Measured against the class table before a line of this was written:
 *
 * ```
 * NPC spawn (crewMax x 0.7):   1.87 .. 2.63 x crewMin
 * consort fallback (x 0.8):    2.13 .. 3.00 x crewMin
 * player's starting sloop:     30 men against crewMin 8  = 3.75 x
 * ```
 *
 * Every hull already afloat in every save is comfortably above the first
 * threshold, so every multiplier below reads 1.0 for all of them and nothing
 * that was balanced gets rebalanced. Same discipline as centring the skill
 * hooks on 5 in v0.47.0.
 *
 * And what the table gives, unprompted, is a mechanic that scales with the
 * captain's career:
 *
 * ```
 * sloop (24 men after a boarding) can fully man: pinnace, barque, brigantine,
 *   fluyt, merchantman.  frigate 0.64, fast galleon 0.53, galleon 0.40
 * frigate (64) can man everything but a galleon, and that at 0.97
 * galleon (96) can man anything
 * ```
 *
 * The ambitious early capture is the case that bites. The veteran never feels
 * it. Nothing had to be tuned for that: it fell out of `crewMin` and `crewMax`
 * as they were already written.
 */

import { SHIP_CLASSES } from "../data/ships.ts";

export type ManningCondition = "full" | "short" | "skeleton" | "unworkable";

export type ManningTier = {
  id: ManningCondition;
  /** Lowest fraction of `crewMin` that still counts as this tier. */
  minFrac: number;
  /** Multiplier on speed through the water. */
  speedMul: number;
  /** Multiplier on turn rate — the first thing too few hands costs. */
  turnMul: number;
  /** Multiplier on how long a sail change takes. Above 1: slower. */
  handlingMul: number;
  nameKey: string;
};

export const MANNING_TIERS: ManningTier[] = [
  { id: "full",       minFrac: 1.00, speedMul: 1.00, turnMul: 1.00, handlingMul: 1.0, nameKey: "manning.full" },
  { id: "short",      minFrac: 0.70, speedMul: 0.92, turnMul: 0.75, handlingMul: 1.6, nameKey: "manning.short" },
  { id: "skeleton",   minFrac: 0.40, speedMul: 0.78, turnMul: 0.50, handlingMul: 2.4, nameKey: "manning.skeleton" },
  { id: "unworkable", minFrac: 0.00, speedMul: 0.65, turnMul: 0.30, handlingMul: 3.5, nameKey: "manning.unworkable" },
];

/**
 * Share of a beaten crew that will take the articles rather than the hold.
 *
 * Half, and the other half are prisoners to be landed. The figure sits beside
 * `RESCUE_SHARE = 0.40` in `ShipRepairSystem`, which is the same idea for men
 * pulled out of the water — pressed men are easier to come by than drowning
 * ones, and they are worth less, which the morale below says.
 */
export const PRESS_SHARE = 0.5;

/**
 * How a pressed man feels about his new ship, 0..1.
 *
 * Well below the 0.8 a consort is otherwise assumed to have. The prize crew's
 * mood is the weighted average of your own people and theirs, so a galleon
 * taken by a sloop and filled out with her own beaten crew sails under men who
 * would rather be somewhere else — and `fleetMorale` already weights every
 * consort's mood by the men aboard it when the fleet storms a town.
 */
export const PRESSED_MORALE = 0.2;

/** The working minimum for a class. Unknown class answers 0 — she needs nobody. */
export function workingMinimum(classId: string): number {
  return SHIP_CLASSES[classId]?.crewMin ?? 0;
}

/**
 * Men aboard as a fraction of the working minimum.
 *
 * Answers 1 for a class nobody knows, so an entity with a bad class id sails
 * exactly as it did before this module existed — the same benign-default rule
 * `depthAt` follows when no depth field has been set.
 */
export function manningFraction(men: number, classId: string): number {
  const min = workingMinimum(classId);
  if (!(min > 0)) return 1;
  return Math.max(0, men) / min;
}

export function manningCondition(men: number, classId: string): ManningCondition {
  const frac = manningFraction(men, classId);
  for (const tier of MANNING_TIERS) {
    if (frac >= tier.minFrac) return tier.id;
  }
  return "unworkable";
}

export function manningTier(men: number, classId: string): ManningTier {
  const id = manningCondition(men, classId);
  return MANNING_TIERS.find(t => t.id === id) ?? MANNING_TIERS[3];
}

export function manningSpeedMultiplier(men: number, classId: string): number {
  return manningTier(men, classId).speedMul;
}

export function manningTurnMultiplier(men: number, classId: string): number {
  return manningTier(men, classId).turnMul;
}

export function manningHandlingMultiplier(men: number, classId: string): number {
  return manningTier(men, classId).handlingMul;
}

/** True while a ship has fewer hands than it takes to work her properly. */
export function isShortHanded(men: number, classId: string): boolean {
  return manningCondition(men, classId) !== "full";
}

/**
 * Men the flagship can put into a boat without falling short herself.
 *
 * Exactly the surplus above her own working minimum — not a comfortable margin
 * above it. Sending the last sparable man leaves her on the edge of her own
 * first tier, which is the right place for the decision to sit: one casualty
 * afterwards and the flagship is short-handed too.
 */
export function spareHands(men: number, classId: string): number {
  return Math.max(0, Math.floor(men) - workingMinimum(classId));
}

export type PrizeManning = {
  /** False when not one man could be put aboard — she cannot be taken at all. */
  manned: boolean;
  /** Men left on the flagship afterwards. */
  flagshipCrew: number;
  /** Men aboard the prize. */
  prizeCrew: number;
  /** How many of those came out of the flagship's own people. */
  fromOwn: number;
  /** How many were her own beaten crew, taking the articles. */
  pressed: number;
  /** Mood of the mixed crew now aboard her, 0..1. */
  prizeMorale: number;
};

/**
 * Work out who sails a prize home.
 *
 * Your own people first, up to what she needs; her beaten crew makes up the
 * rest, as far as `PRESS_SHARE` of them will serve. Nothing is invented: if
 * both together fall short of `crewMin`, she is taken anyway and sails
 * short-handed, which is the interesting outcome rather than a failure.
 *
 * `manned: false` is the one refusal — a hull with nobody at all aboard is not
 * a prize, it is a wreck you happen to be standing next to.
 */
export function manPrize(
  flagshipCrew: number,
  flagshipClassId: string,
  prizeClassId: string,
  prisoners: number,
  flagshipMorale = 0.8,
): PrizeManning {
  const need = workingMinimum(prizeClassId);
  const spare = spareHands(flagshipCrew, flagshipClassId);
  const fromOwn = Math.min(need, spare);
  const willing = Math.max(0, Math.floor(Math.max(0, prisoners) * PRESS_SHARE));
  const pressed = Math.min(Math.max(0, need - fromOwn), willing);
  const prizeCrew = fromOwn + pressed;

  if (prizeCrew <= 0) {
    return {
      manned: false,
      flagshipCrew: Math.max(0, Math.floor(flagshipCrew)),
      prizeCrew: 0, fromOwn: 0, pressed: 0, prizeMorale: 0,
    };
  }

  const morale = (fromOwn * flagshipMorale + pressed * PRESSED_MORALE) / prizeCrew;

  return {
    manned: true,
    flagshipCrew: Math.max(0, Math.floor(flagshipCrew) - fromOwn),
    prizeCrew,
    fromOwn,
    pressed,
    prizeMorale: Math.max(0, Math.min(1, morale)),
  };
}
