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
  if (w.time.day <= PEACE_GRACE_DAYS) return w;
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

  return { ...w, rng };
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
