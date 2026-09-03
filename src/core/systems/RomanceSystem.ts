/**
 * RomanceSystem — the governor has a daughter, and she is bored.
 *
 * `charm` has existed in `CaptainSkills` since character creation and until
 * v0.14.0 it did precisely nothing: no check anywhere in the codebase read it.
 * This is what it was for. It is also the second thing in the game (after
 * retirement) that rewards a career rather than a voyage — courtship is slow,
 * survives across visits, and pays off at the very end.
 *
 * ## Who exists
 *
 * Every town large enough to have a governor has exactly one daughter, derived
 * from the port key rather than stored: her name and her looks are the same in
 * every save, so two players can talk about "the one in Port Royale". Nothing
 * about her is written into `WorldState` except the one number that changes —
 * `player.courtship[portKey]`.
 *
 * ## How it moves
 *
 * Four approaches, each a different mix of skill, money and reputation:
 *
 *   compliment   pure charm, small and safe
 *   dance        charm again, but the swing is wide both ways
 *   gift         gold buys ground a plain compliment cannot
 *   boast        notoriety carries it — and a nobody who boasts looks a fool
 *
 * A failed approach costs ground, so the right move depends on who the captain
 * actually is. A rich, famous, tongue-tied brute courts differently from a
 * charming pauper, and both can get there.
 *
 * ## What it is worth
 *
 * At `SHARES_A_LEAD` she starts repeating what her father says over dinner —
 * which is where the family thread's first real clue comes from. At
 * `MARRIAGE_THRESHOLD`, and with rank enough that her father will hear of it,
 * the captain can marry — once, ever, and it is worth a great deal at
 * retirement. That is the point: the ending is scored, and this is the line
 * that cannot be ground out in the last month at sea.
 */

import type { WorldState, RngState } from "../model/WorldState.ts";
import { CITIES } from "../data/cities.ts";
import { getPortBaseline } from "../data/economyBaselines.ts";
import { rngNext } from "../services/RNG.ts";
import { effectiveSkill } from "./AgingSystem.ts";
import { changeReputation } from "./ReputationSystem.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { portFaction } from "./SiegeSystem.ts";

/** How striking she is. Harder to win, worth more at the end. */
export type Beauty = "plain" | "comely" | "beautiful";

export type Daughter = {
  portKey: string;
  name: string;
  beauty: Beauty;
  /** Faction whose governor she belongs to, as of now. */
  factionKey: string;
};

export type Approach = "compliment" | "dance" | "gift" | "boast";

/** World flag set once the captain is married. There is only ever one. */
export const MARRIED_FLAG = "captain_married";
/** Flag prefix recording which town the wife came from. */
export const MARRIED_TO_PREFIX = "married_to_";
/** Flag prefix set when a daughter has passed on what her father said. */
export const LEAD_PREFIX = "daughter_lead_";

/** Standing at which she starts talking about her father's business. */
export const SHARES_A_LEAD = 30;
/** Standing at which a proposal will not be laughed at. */
export const MARRIAGE_THRESHOLD = 85;
/** Rank her father expects of a son-in-law. */
export const MARRIAGE_MIN_RANK = 2;
/** Standing below which the governor's house is closed to the captain. */
export const REPUTATION_TO_BE_RECEIVED = 20;

/** What a gift costs, and what it is worth. */
export const GIFT_COST = 500;

/** Flat part of the dowry, before the town and the captain's rank are counted. */
export const DOWRY_BASE = 400;
/** Gold per point of the town's wealth (0..1000). */
export const DOWRY_PER_WEALTH = 3;
/** Gold per step of rank the captain holds with her crown. */
export const DOWRY_PER_RANK = 600;

const NAMES: Record<string, string[]> = {
  spain: ["Isabella", "Catalina", "Mercedes", "Beatriz", "Elena", "Inés"],
  england: ["Constance", "Abigail", "Eleanor", "Charlotte", "Harriet", "Rosalind"],
  france: ["Amélie", "Célestine", "Margot", "Ysabeau", "Sylvie", "Adrienne"],
  netherlands: ["Aaltje", "Griet", "Willemijn", "Marijke", "Femke", "Sanne"],
  pirates: ["Anne", "Grace", "Mary", "Jacquotte", "Charlotte", "Rachel"],
};

const BEAUTIES: Beauty[] = ["plain", "comely", "beautiful"];

/**
 * A stable small hash of a port key.
 *
 * Deliberately not the world RNG: who lives where must not depend on how many
 * dice the world has rolled since the game began, or reloading a save would
 * introduce the captain to a different woman.
 */
function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

/** Towns big enough to keep a governor, and therefore a household. */
export function hasGovernorsDaughter(portKey: string): boolean {
  const def = CITIES[portKey];
  if (!def) return false;
  return def.type !== "outpost" && def.population !== "small";
}

export function daughterFor(world: WorldState, portKey: string): Daughter | undefined {
  if (!hasGovernorsDaughter(portKey)) return undefined;
  const factionKey = portFaction(world, portKey) as string;
  const pool = NAMES[factionKey] ?? NAMES.england;
  const h = hashKey(portKey);
  return {
    portKey,
    name: pool[h % pool.length],
    // Beautiful daughters are the minority: the modulus is biased so that
    // roughly half the Caribbean is "comely" and only a sixth turns heads.
    beauty: BEAUTIES[[0, 1, 1, 1, 2, 0][(h >>> 8) % 6]],
    factionKey,
  };
}

/** Current standing with the daughter of this town. */
export function courtshipLevel(world: WorldState, portKey: string): number {
  return world.player.courtship?.[portKey] ?? 0;
}

/** True when the governor will receive the captain at all. */
export function willReceive(world: WorldState, portKey: string): boolean {
  const factionKey = portFaction(world, portKey) as string;
  return (world.player.reputation[factionKey] ?? 0) >= REPUTATION_TO_BE_RECEIVED;
}

export function isMarried(world: WorldState): boolean {
  return world.worldFlags[MARRIED_FLAG] === true;
}

/** Port whose daughter the captain married, if any. */
export function marriedTo(world: WorldState): string | undefined {
  const flag = Object.keys(world.worldFlags)
    .find(k => k.startsWith(MARRIED_TO_PREFIX) && world.worldFlags[k]);
  return flag ? flag.slice(MARRIED_TO_PREFIX.length) : undefined;
}

/** How hard this one is to impress. */
export function beautyDifficulty(beauty: Beauty): number {
  return beauty === "beautiful" ? 1.6 : beauty === "comely" ? 1.2 : 1.0;
}

/**
 * Odds an approach lands.
 *
 * Every approach leans on something different, and every approach gets harder
 * as her standing rises: the first compliment is easy, the eightieth point is
 * not. `difficulty` folds in how striking she is, so the same captain who
 * charms the plain daughter of a small town gets nowhere in Havana.
 */
export function approachChance(
  approach: Approach,
  charm: number,
  level: number,
  beauty: Beauty,
  gold: number,
  notoriety: number,
): number {
  const charmTerm = Math.max(0, Math.min(10, charm)) / 10;
  let base: number;
  switch (approach) {
    case "compliment":
      base = 0.45 + charmTerm * 0.35;
      break;
    case "dance":
      // The wide swing lives in the reward, not the odds.
      base = 0.35 + charmTerm * 0.45;
      break;
    case "gift":
      // Money talks even when the captain cannot; an empty purse says nothing.
      base = gold >= GIFT_COST ? 0.55 + charmTerm * 0.2 : 0;
      break;
    case "boast":
      // A famous captain's stories carry themselves. An unknown's do not.
      base = 0.2 + Math.min(1, Math.max(0, notoriety) / 80) * 0.55 + charmTerm * 0.1;
      break;
  }
  // Ground already won makes the next step steeper, scaled by how far above her
  // station the captain is reaching.
  const resistance = (level / 100) * 0.55 * beautyDifficulty(beauty);
  return Math.max(0.05, Math.min(0.95, base - resistance));
}

/** Ground won or lost by an approach that lands, or does not. */
const REWARD: Record<Approach, { win: number; lose: number }> = {
  compliment: { win: 6, lose: -3 },
  dance: { win: 14, lose: -9 },
  gift: { win: 12, lose: -4 },
  boast: { win: 10, lose: -8 },
};

export type CourtStep = {
  world: WorldState;
  rng: RngState;
  succeeded: boolean;
  /** Change in standing, positive or negative. */
  delta: number;
  level: number;
  /** True when this step took her past the point of sharing what she hears. */
  unlockedLead: boolean;
  /** Set when the approach could not be made at all. */
  error?: "no_daughter" | "not_received" | "married" | "cannot_afford";
};

/**
 * One approach at the governor's house.
 *
 * Refuses rather than half-applies: a gift the captain cannot pay for costs
 * nothing and moves nothing, which matters because the port UI decides what to
 * offer from the same `gold` value a frame earlier.
 */
export function court(
  world: WorldState,
  portKey: string,
  approach: Approach,
  rng: RngState,
): CourtStep {
  const level = courtshipLevel(world, portKey);
  const fail = (error: CourtStep["error"]): CourtStep =>
    ({ world, rng, succeeded: false, delta: 0, level, unlockedLead: false, error });

  const daughter = daughterFor(world, portKey);
  if (!daughter) return fail("no_daughter");
  if (isMarried(world)) return fail("married");
  if (!willReceive(world, portKey)) return fail("not_received");
  if (approach === "gift" && world.player.gold < GIFT_COST) return fail("cannot_afford");

  const roll = rngNext(rng);
  const chance = approachChance(
    approach,
    effectiveSkill(world, "charm"),
    level,
    daughter.beauty,
    world.player.gold,
    world.player.notoriety,
  );
  const succeeded = roll.value < chance;
  const delta = succeeded ? REWARD[approach].win : REWARD[approach].lose;
  const next = Math.max(0, Math.min(100, level + delta));

  const gold = approach === "gift" ? Math.max(0, world.player.gold - GIFT_COST) : world.player.gold;
  const unlockedLead = level < SHARES_A_LEAD && next >= SHARES_A_LEAD;

  let w: WorldState = {
    ...world,
    player: {
      ...world.player,
      gold,
      courtship: { ...(world.player.courtship ?? {}), [portKey]: next },
    },
  };

  if (unlockedLead) {
    w = { ...w, worldFlags: { ...w.worldFlags, [LEAD_PREFIX + portKey]: true } };
    w = addLogEntry(w, "romance.log_lead", { name: daughter.name });
  }

  return { world: w, rng: roll.state, succeeded, delta, level: next, unlockedLead };
}

export type ProposalResult = {
  world: WorldState;
  accepted: boolean;
  reason?: "no_daughter" | "already_married" | "too_soon" | "no_rank";
  /** Gold her father settled on the couple. Absent when she said no. */
  dowry?: number;
};

/**
 * Ask for her hand.
 *
 * Two gates, and they are different in kind: she has to want to (standing),
 * and her father has to allow it (rank). A charming nobody can get all the way
 * to the threshold and still be told no, which is exactly the pressure that
 * makes ranks worth chasing.
 */
export function propose(world: WorldState, portKey: string): ProposalResult {
  const daughter = daughterFor(world, portKey);
  if (!daughter) return { world, accepted: false, reason: "no_daughter" };
  if (isMarried(world)) return { world, accepted: false, reason: "already_married" };
  if (courtshipLevel(world, portKey) < MARRIAGE_THRESHOLD) {
    return { world, accepted: false, reason: "too_soon" };
  }
  if ((world.player.ranks?.[daughter.factionKey] ?? 0) < MARRIAGE_MIN_RANK) {
    return { world, accepted: false, reason: "no_rank" };
  }

  let w: WorldState = {
    ...world,
    worldFlags: {
      ...world.worldFlags,
      [MARRIED_FLAG]: true,
      [MARRIED_TO_PREFIX + portKey]: true,
    },
    player: {
      ...world.player,
      // A marriage into a governor's family is worth more standing than any
      // single voyage: the captain is now family, not a useful stranger.
      reputation: changeReputation(world.player.reputation, daughter.factionKey, 20),
      courtship: { ...(world.player.courtship ?? {}), [portKey]: 100 },
      // Whose daughter this is, as of today. See `homeCrown`.
      homeCrown: daughter.factionKey,
    },
  };
  w = addLogEntry(w, "romance.log_married", { name: daughter.name, port: CITIES[portKey]?.name ?? portKey });
  const settled = payDowry(w, portKey);

  return { world: settled.world, accepted: true, dowry: settled.gold };
}

/**
 * What her father settles on the couple.
 *
 * Read off the town's own wealth rather than a flat figure, so the governor of
 * Havana's daughter is a different proposition from the governor of Tortuga's —
 * and off rank, because a rank is what her father is really buying. Falls back
 * to the baseline for a town with no runtime entry, the same convention
 * `targetWeight` uses.
 */
export function dowryFor(world: WorldState, portKey: string): number {
  const daughter = daughterFor(world, portKey);
  if (!daughter) return 0;
  const wealth = world.ports[portKey]?.wealth ?? getPortBaseline(portKey).wealth;
  const rank = world.player.ranks?.[daughter.factionKey] ?? 0;
  return Math.round(DOWRY_BASE + wealth * DOWRY_PER_WEALTH + rank * DOWRY_PER_RANK);
}

/** Hand over the dowry and write it in the log. Called once, at the wedding. */
export function payDowry(world: WorldState, portKey: string): { world: WorldState; gold: number } {
  const gold = dowryFor(world, portKey);
  if (gold <= 0) return { world, gold: 0 };
  const w = addLogEntry(
    { ...world, player: { ...world.player, gold: world.player.gold + gold } },
    "home.log_dowry",
    { gold, port: CITIES[portKey]?.name ?? portKey },
  );
  return { world: w, gold };
}

/** Retirement points a marriage is worth, by how well the captain married. */
export function marriagePoints(world: WorldState): number {
  const portKey = marriedTo(world);
  if (!portKey) return 0;
  const daughter = daughterFor(world, portKey);
  if (!daughter) return 0;
  return daughter.beauty === "beautiful" ? 1500 : daughter.beauty === "comely" ? 900 : 500;
}
