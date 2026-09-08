/**
 * DiplomacySystem — the crowns fall out on their own (v0.51.0).
 *
 * ## The measurement that produced this file
 *
 * The default era is `pirates_sunset`, and it begins in 1680. The Franco-Dutch
 * war ended in September 1678; the Nine Years' War begins in May 1689. The
 * table of ten historical wars has **nothing** in between, and no random event
 * template has ever been of type `war_start`. Measured over the first ten
 * in-game years of each era:
 *
 * ```
 *   silver_empire        1560:  17% of months at war
 *   merchants_smugglers  1600: 100%
 *   new_colonists        1620: 100%
 *   war_for_profit       1640: 100%
 *   buccaneer_heroes     1660:  32%
 *   pirates_sunset       1680:   7%   <- the default
 * ```
 *
 * Nine and a bit in-game years to the next war, and a game day is a real
 * minute: **fifty-seven hours of play before any crown is at war with any
 * other.** Every consumer downstream of a war therefore did nothing at all in
 * the game as it is actually started:
 *
 * - `NpcSpawnSystem` doubles a warring crown's navy and puts privateers out —
 *   never.
 * - `EventEffectsSystem` cuts a besieged crown's imports to 0.7 — never.
 * - The peace of v0.30.0, `treaty_signed`, only exists as the end of a war —
 *   so it never fired either.
 * - **And a letter of marque covered nothing.** `coveringPatrons` asks whether
 *   the patron is at war with the victim. In 1680 no crown is at war with
 *   anybody, so the answer was always no: every prize a commissioned captain
 *   took was *uncovered*, worth −8 with his own patron, and the credit half of
 *   v0.37.0 — the entire point of carrying the paper — was unreachable. The
 *   governor hands the letter out on standing alone and never checks that he
 *   has a war to hand it out for, so a captain who earned one was strictly
 *   worse off for taking it.
 *
 * That is the mirror of the sweep this project keeps running. Not a producer
 * with no consumer: **six consumers with no producer.** Nothing here had to be
 * designed — it had to be *supplied*.
 *
 * ## Relations were a matrix nobody read
 *
 * `FACTIONS[x].relations` has declared a full 5x5 table since the first
 * commit — Spain at −30 with England, −20 with France, −10 with the Dutch;
 * England and the Netherlands the one friendly pair at +10 — and exactly one
 * line in the whole codebase read it, to pick a villain's crown for a family
 * quest. It is the natural producer of the odds: crowns that dislike each
 * other fall out sooner. So the war that was missing is derived from the
 * matrix that was idle, and neither needed inventing.
 *
 * ## What an alliance is here
 *
 * The TODO has carried "two crowns allied does not exist" for a dozen
 * releases, with the honest objection attached: *what would an alliance do?*
 * This is the answer, and it is derived rather than stored. Two crowns at war
 * with the same third crown are **co-belligerents**, and that lifts their
 * relation by `CO_BELLIGERENT` for exactly as long as the shared war lasts —
 * which in turn makes them less likely to fall out with each other while it
 * does. England and the Netherlands, +10 on paper, stand at +35 through the
 * Anglo-Spanish war; France and the Netherlands, 0 on paper, at +25 while both
 * fight Spain. No field, no save, no migration: an alliance is a fact about
 * today's wars, and `relationBetween` computes it.
 *
 * ## The alliance had no day it began (v0.55.0)
 *
 * All of the above stayed true and one thing about it did not survive contact
 * with the world: a fact that is only ever *computed* has no history. The
 * relation lifted the moment the second war began and dropped the moment it
 * ended, and nothing anywhere said so — `areAllied` was exported for four
 * releases and read by **nobody**, no news board carried it, no NPC repeated
 * it, and the tavern that will tell a captain the price of bread in the next
 * bay had nothing to say about two crowns making common cause against a third.
 * Measured over 150 game-years: two crowns share an enemy on **28.8% of days**,
 * in episodes averaging sixteen months. A quarter of the game's calendar was a
 * fact the game could not mention.
 *
 * So the *state* stays derived — `areAllied` is still the truth and still asks
 * today's wars — and only the **beginning** is stamped, in an `alliance`
 * event, on the day it happens. That is the split this project keeps arriving
 * at (see `project_derived_vs_recorded_facts`): derive what is true now, stamp
 * what happened then. Nothing new goes into the save, because a world event is
 * something the save already holds.
 *
 * ## Why the same event and not a new one
 *
 * A war declared here is a `war_start` `WorldEventState`, identical in shape to
 * one off the historical table, and its peace is the same `treaty_signed`. That
 * is the whole reason this file is short: the news boards, the NPC carriers who
 * repeat them, the map marks, the navy multiplier, the import cut, the letters
 * of marque and the chart annotations all already know what a war is. Nothing
 * downstream was touched.
 */

import type { WorldState, WorldEventState } from "../model/WorldState.ts";
import { FACTIONS } from "../data/factions.ts";
import { PORTS } from "../data/ports.ts";
import { rngNextFloat } from "../services/RNG.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { changeReputation, getReputationLevel, type ReputationLevel } from "./ReputationSystem.ts";
import { HISTORICAL_WARS } from "../data/wars.ts";
import { calendarToDay } from "./TimeSystem.ts";

/**
 * How long the peace itself is an event (v0.30.0).
 *
 * A treaty is not a new normal, it is the fortnight or two in which convoys
 * that had been laid up sail again and the underwriters come back. Sixty days
 * of `treaty_signed` (production and imports ×1.15, half a point of wealth a
 * day) is worth about twenty points of settled wealth to each town by the time
 * it lifts — the same order as any other good news, and deliberately less than
 * the war it ends took away.
 */
export const TREATY_DAYS = 60;

/**
 * Is the calendar about to start a war between these two crowns?
 *
 * Asked before every roll below, so that the dice never pre-empt the
 * historical table and leave two overlapping wars between the same two crowns
 * on every news board in the Caribbean. The table is authoritative; the dice
 * fill the gaps it leaves, and 1680 is a nine-year gap.
 */
export function historicalWarPending(
  world: WorldState,
  a: string,
  b: string,
  withinDays: number,
): boolean {
  return HISTORICAL_WARS.some(war => {
    if (!war.factions.includes(a) || !war.factions.includes(b)) return false;
    const start = calendarToDay(war.startYear, war.startMonth, 1, world.startYear);
    return start >= world.time.day && start - world.time.day <= withinDays;
  });
}

/** The crowns that can be at war with each other. Pirates are not a crown. */
export const CROWNS = ["spain", "england", "france", "netherlands"];

/**
 * What being at war does to a relation.
 *
 * Below the −60 that reads as "hostile" everywhere else standing is read, so
 * that a live war always outranks whatever the two crowns thought of each
 * other in peacetime. It is a floor and not a delta: England and the
 * Netherlands at +10 are at −70 while they fight, exactly like Spain and
 * England at −30.
 */
export const WAR_RELATION = -70;

/**
 * What a common enemy is worth.
 *
 * Enough to carry the friendly pair (+10) to +35 and the indifferent pair (0)
 * to +25, which is the "friendly" band — and not enough to reach "allied" on
 * one shared war alone. Two shared enemies do reach it.
 */
export const CO_BELLIGERENT = 25;

/** How much of a shared-enemy bonus one war can be worth, at most twice. */
export const CO_BELLIGERENT_MAX_WARS = 2;

/**
 * The daily odds that a crown-pair falls out, before their opinion of each
 * other is applied.
 *
 * Tuned against the historical record rather than chosen: the ten wars in the
 * table cover 79% of the years between 1560 and 1700, and this is the number
 * that puts a peacetime era on roughly the same footing. See the test.
 */
export const WAR_CHANCE_BASE = 0.00035;

/**
 * The share of the odds a pair carries whatever their relation.
 *
 * Without a floor, France and the Netherlands (0 on paper) and England and the
 * Netherlands (+10) could never fall out — and both pairs fought real wars in
 * this period, three of them in the English case. A relation makes a war
 * likelier; it does not make one impossible. Same shape as `defenceWeight` in
 * `PredationSystem`, and for the same reason.
 */
export const HOSTILITY_FLOOR = 0.25;

/** How long a war declared in play runs, in years. */
export const WAR_MIN_YEARS = 1;
export const WAR_MAX_YEARS = 4;

/**
 * How long the world is left in whatever peace it was born into.
 *
 * A war on the third morning would read as noise rather than as news. The
 * captain gets a season to learn the map first, and an era that starts *in* a
 * war is untouched by this either way.
 */
export const PEACE_GRACE_DAYS = 90;

/**
 * How far ahead a war on the calendar suppresses one off the dice.
 *
 * The historical table is authoritative: if Spain and England are due to fall
 * out in eighteen months anyway, the dice do not get to pre-empt it and leave
 * two overlapping wars between the same two crowns on the news boards.
 */
export const HISTORICAL_LOOKAHEAD_DAYS = 730;

/** The id every war declared by this system carries, so it can be told apart. */
export function dynamicWarId(a: string, b: string): string {
  return `war_dyn_${[a, b].sort().join("_")}`;
}

function crownName(key: string): string {
  return FACTIONS[key]?.name ?? key;
}

/** Every crown this one is fighting today. */
export function enemiesOf(world: WorldState, faction: string): string[] {
  const out = new Set<string>();
  for (const ev of world.worldEvents) {
    if (ev.type !== "war_start" || ev.endDay < world.time.day) continue;
    if (!ev.factions.includes(faction)) continue;
    for (const f of ev.factions) if (f !== faction) out.add(f);
  }
  return [...out];
}

/** Crowns both of these are fighting — the shared enemies that make an alliance. */
export function coBelligerentAgainst(world: WorldState, a: string, b: string): string[] {
  const ea = enemiesOf(world, a);
  const eb = new Set(enemiesOf(world, b));
  return ea.filter(f => eb.has(f));
}

/**
 * What these two crowns think of each other **today**.
 *
 * The static matrix is the baseline; a live war overrides it downward, and a
 * shared enemy lifts it. This is the function every other reader of crown
 * relations should call — `FACTIONS[x].relations[y]` is what the two thought of
 * each other before the game began.
 */
export function relationBetween(world: WorldState, a: string, b: string): number {
  if (a === b) return 100;
  const base = FACTIONS[a]?.relations[b] ?? 0;
  const shared = coBelligerentAgainst(world, a, b);
  // At war beats everything, including a war they are both in against a third.
  if (enemiesOf(world, a).includes(b)) return Math.min(base, WAR_RELATION);
  if (shared.length === 0) return base;
  const lift = CO_BELLIGERENT * Math.min(CO_BELLIGERENT_MAX_WARS, shared.length);
  return Math.max(-100, Math.min(100, base + lift));
}

/** True when these two are allied in the only sense this world has: a shared war. */
export function areAllied(world: WorldState, a: string, b: string): boolean {
  return coBelligerentAgainst(world, a, b).length > 0;
}

// ── The alliance as a thing that happened (v0.55.0) ───────

/**
 * How far ahead an alliance event is dated.
 *
 * It is refreshed every day the alliance holds and pulled back behind today the
 * day it does not, so this number is never reached and never read as a
 * prediction — it exists only so that `expireEvents` leaves a living alliance
 * alone. Ten years is longer than any war this world runs.
 */
export const ALLIANCE_HORIZON_DAYS = 3650;

/** Every alliance currently on the news boards. */
export function activeAlliances(world: WorldState): WorldEventState[] {
  return world.worldEvents.filter(
    ev => ev.type === "alliance" && ev.endDay >= world.time.day,
  );
}

/** The alliance event for this pair, in whichever order it was stamped. */
export function allianceBetween(
  world: WorldState,
  a: string,
  b: string,
): WorldEventState | undefined {
  return activeAlliances(world).find(
    ev => ev.factions.includes(a) && ev.factions.includes(b),
  );
}

/**
 * The day these two made common cause, or undefined if they have not.
 *
 * The one thing about an alliance that cannot be recomputed from today's wars,
 * and therefore the one thing worth writing down.
 */
export function alliedSince(world: WorldState, a: string, b: string): number | undefined {
  return allianceBetween(world, a, b)?.startDay;
}

/**
 * Open, refresh and close the alliances the wars imply.
 *
 * Called at the end of `updateDiplomacy`, so a war declared this morning can
 * make an alliance this afternoon, and `concludeDynamicWars` at the top has
 * already taken away the one that ended — which is what makes a lapse
 * detectable on the day it happens rather than the day after.
 *
 * `vars.against` is stamped, not recomputed: it names the enemy that *made*
 * this alliance. When that particular war ends while another shared one runs
 * on, the pair are still allies but they are allies about something else, so
 * the old alliance is concluded and a new one opened the same day. That is
 * cheaper than it sounds and it keeps every sentence on the news boards true
 * of the day it was written.
 */
export function stampAlliances(world: WorldState): WorldState {
  let w = world;

  for (const [a, b] of crownPairs()) {
    const shared = coBelligerentAgainst(w, a, b);
    const existing = allianceBetween(w, a, b);
    const stale = existing !== undefined
      && !shared.includes(existing.vars.againstId as string);

    if (existing && (shared.length === 0 || stale)) {
      w = {
        ...w,
        // Behind today: `expireEvents` runs next and takes it off the boards.
        worldEvents: w.worldEvents.map(ev =>
          ev.id === existing.id ? { ...ev, endDay: w.time.day - 1 } : ev,
        ),
      };
      w = addLogEntry(w, "news.alliance_end", {
        faction1: crownName(a),
        faction2: crownName(b),
        against: existing.vars.against as string,
      });
    }

    if (shared.length === 0) continue;
    if (existing && !stale) {
      w = {
        ...w,
        worldEvents: w.worldEvents.map(ev =>
          ev.id === existing.id
            ? { ...ev, endDay: w.time.day + ALLIANCE_HORIZON_DAYS }
            : ev,
        ),
      };
      continue;
    }

    const vars = {
      faction1: crownName(a),
      faction2: crownName(b),
      against: crownName(shared[0]),
      againstId: shared[0],
    };
    const ev: WorldEventState = {
      id: `alliance_${[a, b].sort().join("_")}_${w.time.day}`,
      type: "alliance",
      startDay: w.time.day,
      endDay: w.time.day + ALLIANCE_HORIZON_DAYS,
      // Empty, like every other faction-scale event: it is news everywhere.
      ports: [],
      factions: [a, b],
      severity: 2,
      headline: "news.alliance",
      vars,
    };
    w = { ...w, worldEvents: [...w.worldEvents, ev] };
    w = addLogEntry(w, "news.alliance", vars);
  }

  return w;
}

/**
 * How ready this pair is to fall out, as a share of the base odds.
 *
 * Mapped off the live relation so that a pair already fighting a common enemy
 * is markedly less likely to turn on each other — which is the second thing an
 * alliance does, after the first (it is a fact the news can report).
 */
export function hostilityFactor(relation: number): number {
  const h = Math.max(0, Math.min(1, (10 - relation) / 40));
  return HOSTILITY_FLOOR + (1 - HOSTILITY_FLOOR) * h;
}

/** Every unordered pair of crowns, in a fixed order so the roll is reproducible. */
export function crownPairs(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < CROWNS.length; i++) {
    for (let j = i + 1; j < CROWNS.length; j++) out.push([CROWNS[i], CROWNS[j]]);
  }
  return out;
}

/**
 * Declare and conclude the wars nobody wrote on the calendar.
 *
 * Called once a game day from `updateWorldEvents`, **before** `expireEvents`:
 * a war that ends today has to be turned into a treaty while it is still in
 * the list, which is exactly the trap `checkHistoricalWars` documents.
 */
export function updateDiplomacy(world: WorldState): WorldState {
  let w = concludeDynamicWars(world);
  if (w.time.day <= PEACE_GRACE_DAYS) return stampAlliances(w);
  let rng = w.rng;

  for (const [a, b] of crownPairs()) {
    const r = rngNextFloat(rng, 0, 1);
    rng = r.state;
    if (enemiesOf(w, a).includes(b)) continue;
    if (historicalWarPending(w, a, b, HISTORICAL_LOOKAHEAD_DAYS)) continue;

    const chance = WAR_CHANCE_BASE * hostilityFactor(relationBetween(w, a, b));
    if (r.value > chance) continue;

    const dur = rngNextFloat(rng, WAR_MIN_YEARS, WAR_MAX_YEARS);
    rng = dur.state;
    const vars = { faction1: crownName(a), faction2: crownName(b) };
    const ev: WorldEventState = {
      id: dynamicWarId(a, b),
      type: "war_start",
      startDay: w.time.day,
      endDay: w.time.day + Math.round(dur.value * 365),
      ports: [],
      factions: [a, b],
      severity: 3,
      headline: "news.war_start",
      vars,
    };
    w = { ...w, worldEvents: [...w.worldEvents, ev] };
    w = addLogEntry(w, "news.war_start", vars);
  }

  return stampAlliances({ ...w, rng });
}

/**
 * Turn a war that runs out today into the peace that ends it.
 *
 * `expireEvents` would simply delete it, and a war that vanishes is the exact
 * bug v0.30.0 was written to fix: no treaty on the news boards, no NPC
 * carrying it, `treaty_signed` produced by nothing.
 */
function concludeDynamicWars(world: WorldState): WorldState {
  let w = world;
  const ending = w.worldEvents.filter(
    ev => ev.type === "war_start"
      && ev.id.startsWith("war_dyn_")
      && ev.endDay < w.time.day,
  );
  for (const war of ending) {
    const vars = {
      faction1: crownName(war.factions[0]),
      faction2: crownName(war.factions[1]),
    };
    const treaty: WorldEventState = {
      id: `treaty_dyn_${war.factions.slice().sort().join("_")}`,
      type: "treaty_signed",
      startDay: w.time.day,
      endDay: w.time.day + TREATY_DAYS,
      ports: Object.keys(PORTS).filter(k => war.factions.includes(PORTS[k].factionId as string)),
      factions: [...war.factions],
      severity: 1,
      headline: "news.treaty_signed",
      vars,
    };
    w = {
      ...w,
      worldEvents: [...w.worldEvents.filter(ev => ev.id !== war.id), treaty],
    };
    w = addLogEntry(w, "news.war_end", vars);
  }
  return w;
}

// ── What the other crowns make of it (v0.52.0) ───────────

/**
 * How much a crown cares that you have hurt another crown.
 *
 * Reputation has been a **vector of four independent numbers** since it was
 * written: every hand that moves it names one crown. Measured, that means six
 * traders make Spain hostile (−60) and the other three crowns sit at **exactly
 * zero for the rest of the career** unless the captain goes and serves them.
 * Burning Spanish shipping for a year bought nothing at all in Port Royale —
 * in a world whose own data says England is at −30 with Spain, and in a genre
 * where "the enemy of my enemy" is the whole of the buccaneer's standing.
 *
 * The reward needed no inventing: `PortAccessSystem` has priced *friendly*
 * since v0.24.0 (spread 0.08 instead of 0.12, half again the crew pool, the
 * yard at 0.9). What was missing was any way to reach it without serving.
 *
 * ## Why tiers and not a proportion
 *
 * The obvious shape is `delta × relation / 100 × share`, and it was measured
 * first. Two things killed it:
 *
 * - **Rounding eats the quiet relations.** Reputation is an integer, and
 *   `Math.round(10 × 0.10 × 0.3)` is **zero** — at −10 the Dutch would not move
 *   in sixty prizes. The same trap as `wealth` before v0.24.0 gave it a decimal
 *   place, and the fix there was to find the fraction a home. Here there is a
 *   better answer than a new field.
 * - **A share large enough to fix that unmakes the letter of marque.** At 0.5 a
 *   prize was worth +4 to a crown at war with the victim against the patron's
 *   +5 — one release after v0.51.0 finally made a commission mean anything.
 *
 * Named tiers do what the manning tiers and the hull tiers do: they make
 * crossing a stage something a player can feel and a reader can check at a
 * glance, and they keep the numbers whole. Measured, they leave the letter
 * **2.5× better in a war and 5× better in peace**, which is where it belongs.
 */
export type NoticeTier = {
  id: "enemy" | "rival" | "indifferent" | "ally";
  /** The highest relation that still falls in this tier. */
  maxRelation: number;
  /** Points per unit of act weight. */
  perAct: number;
};

/**
 * The table. Ordered, and read by walking it — the first row whose
 * `maxRelation` the relation does not exceed wins.
 *
 * `rival` reaches to −15 on purpose: Spain sits at −30 with England and −20
 * with France, but only −10 with the Dutch, so in peacetime a Spanish prize is
 * something England and France thank you for and the Dutch shrug at. That is
 * the relation matrix doing work rather than being a decoration, and it is why
 * the boundary is not a round −20.
 */
export const NOTICE_TIERS: NoticeTier[] = [
  { id: "enemy",       maxRelation: -60, perAct:  2 },
  { id: "rival",       maxRelation: -15, perAct:  1 },
  { id: "indifferent", maxRelation:  19, perAct:  0 },
  { id: "ally",        maxRelation: 100, perAct: -1 },
];

/**
 * What an act is worth, before the observer's opinion scales it.
 *
 * A city is not five traders; it is the largest thing a captain does to a
 * crown, and the one that reaches every other capital in the Caribbean.
 */
export const ACT_TRADER = 1;
export const ACT_NAVY = 2;
export const ACT_CITY = 5;

/**
 * A **negative** weight, because handing a town to a crown is a favour to it
 * rather than an injury.
 *
 * The sign does the whole of the work: a crown at war with the one you served
 * reads it at −4, a crown that merely dislikes him at −2, and a crown standing
 * beside him at +2. It replaced a flat −5 to every other capital, which said
 * that taking Cartagena for England offended the Dutch exactly as much as it
 * offended Spain.
 */
export const ACT_SERVICE = -2;

export function noticeTier(relation: number): NoticeTier {
  for (const tier of NOTICE_TIERS) {
    if (relation <= tier.maxRelation) return tier;
  }
  return NOTICE_TIERS[NOTICE_TIERS.length - 1];
}

/** What this crown makes of an act of the given weight against that one. */
export function noticedBy(
  world: WorldState,
  observer: string,
  victim: string,
  weight: number,
): number {
  if (observer === victim) return 0;
  return noticeTier(relationBetween(world, observer, victim)).perAct * weight;
}

export type RippleResult = {
  reputation: Record<string, number>;
  /** Crowns whose standing band changed because of this, for the log. */
  crossed: Array<{ faction: string; from: ReputationLevel; to: ReputationLevel }>;
};

/**
 * Spread a hostile act against one crown across the others.
 *
 * **The brethren are not an observer here.** A pirate is not a crown, his
 * relations run −80 to −40 with everybody, and he would take a cut of every
 * prize on top of the credit `settleHostileAct` already pays him — the same act
 * counted twice. `CROWNS` is the observer set for that reason.
 *
 * `settled` names the crowns the caller has **already** paid for this same act,
 * and it is not an optimisation. A patron whose commission covers a prize is a
 * crown at war with the victim *by definition* — that is what "covered" means —
 * so without this he collects the patron's credit and the enemy-of-my-enemy
 * credit for one act. The letter is the specific, larger accounting of exactly
 * this relation; the ripple is the general one, for everyone holding no paper.
 * Caught by four existing tests going red at +7 where they said +5.
 *
 * Returns the bands that changed rather than logging itself, because the caller
 * knows what the act was and this does not.
 */
export function rippleReputation(
  world: WorldState,
  reputation: Record<string, number>,
  victim: string,
  weight: number,
  settled: string[] = [],
): RippleResult {
  let out = reputation;
  const crossed: RippleResult["crossed"] = [];
  if (!CROWNS.includes(victim)) return { reputation: out, crossed };

  for (const observer of CROWNS) {
    if (settled.includes(observer)) continue;
    const delta = noticedBy(world, observer, victim, weight);
    if (delta === 0) continue;
    const before = getReputationLevel(out[observer] ?? 0);
    out = changeReputation(out, observer, delta);
    const after = getReputationLevel(out[observer] ?? 0);
    if (before !== after) crossed.push({ faction: observer, from: before, to: after });
  }
  return { reputation: out, crossed };
}
