/**
 * World Event System — generates historical + random events.
 *
 * Called once per game day from WorldEngine.
 * Historical wars fire on exact calendar dates.
 * Random events fire with weighted probability.
 */

import type { WorldState, WorldEventState, WorldEventType, RngState } from "../model/WorldState.ts";
import type { NewsItem } from "../model/EntityState.ts";
import { dayToCalendar, calendarToDay } from "./TimeSystem.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { rngNext, rngNextFloat, rngNextInt } from "../services/RNG.ts";
import { MUSTER_PORTS } from "./TreasureFleetSystem.ts";
import { PORTS } from "../data/ports.ts";
import { HISTORICAL_WARS } from "../data/wars.ts";
import { updateDiplomacy, TREATY_DAYS } from "./DiplomacySystem.ts";
import { GOVERNOR_NEW_DAYS } from "./PardonSystem.ts";

// ── Random Event Templates ───────────────────────────────

type RandomEventTemplate = {
  type: WorldEventType;
  headline: string;
  weight: number;          // relative probability
  durationDays: [number, number]; // min, max
  severity: 1 | 2 | 3;
  affectsPorts: number;    // how many ports affected (0 = all of faction)
  seasonal?: number[];     // months when this can happen (empty = any)
  /** Restrict to a specific list of port keys. If undefined, any port. */
  portWhitelist?: string[];
  /** Restrict to a faction id. If undefined, any faction. */
  factionWhitelist?: string[];
  /** Skip ports where this predicate returns false. */
  filter?: (portKey: string) => boolean;
};

// Spanish frontier outposts — vulnerable to indigenous raids
const NATIVE_RAID_PORTS = [
  "villa_hermosa", "campeche", "cumana", "rio_de_la_hacha",
  "trinidad", "santa_marta", "st_augustine", "nombre_de_dios",
  "margarita", "gibraltar", "puerto_cabello",
];

const RANDOM_EVENTS: RandomEventTemplate[] = [
  {
    type: "epidemic",
    headline: "news.epidemic",
    weight: 3,
    durationDays: [30, 90],
    severity: 2,
    affectsPorts: 1,
  },
  {
    type: "pirate_raid",
    headline: "news.pirate_raid",
    weight: 5,
    durationDays: [7, 14],
    severity: 1,
    affectsPorts: 1,
  },
  {
    type: "trade_boom",
    headline: "news.trade_boom",
    weight: 4,
    durationDays: [14, 30],
    severity: 1,
    affectsPorts: 1,
  },
  {
    type: "slave_revolt",
    headline: "news.slave_revolt",
    weight: 1,
    durationDays: [7, 30],
    severity: 2,
    affectsPorts: 1,
  },
  {
    type: "hurricane",
    headline: "news.hurricane",
    weight: 2,
    durationDays: [3, 7],
    severity: 3,
    affectsPorts: 3,
    seasonal: [6, 7, 8, 9, 10, 11], // Jun-Nov hurricane season
  },
  {
    type: "treasure_fleet",
    headline: "news.treasure_fleet",
    weight: 2,
    durationDays: [14, 21],
    severity: 2,
    affectsPorts: 0, // Spanish ports only
    // She musters where the silver actually is (v0.46.0). Until the fleet
    // sailed it did not matter which Spanish town the headline named; now the
    // muster port is the first leg of a real passage, and "preparing to sail
    // from Gibraltar" would put the plate fleet in a lagoon.
    portWhitelist: MUSTER_PORTS,
  },
  {
    type: "new_governor",
    headline: "news.new_governor",
    weight: 1,
    // Not an instant any more (v0.61.0). It was `[1, 1]`, which meant the one
    // town it named had it off its noticeboard before any ship could carry the
    // news anywhere — and since v0.61.0 the appointment is a window the captain
    // can sail into (`PardonSystem.GOVERNOR_NEW_DAYS`), so the event has to be
    // live for as long as the new man is new. The daily wealth row went with
    // it: the fifty gold is a one-shot and was always applied as one.
    durationDays: [GOVERNOR_NEW_DAYS, GOVERNOR_NEW_DAYS],
    severity: 1,
    affectsPorts: 1,
  },
  // ── v0.9.7 economy expansion ─────────────────────────────
  {
    type: "gold_discovery",
    headline: "news.gold_discovery",
    weight: 1,
    durationDays: [180, 365],
    severity: 2,
    affectsPorts: 1,
    // Small or medium towns only — capitals aren't "discovering" gold
    filter: (k: string) => {
      const c = PORTS[k];
      return !!c && (c.population === "small" || c.population === "medium");
    },
  },
  {
    type: "native_raid",
    headline: "news.native_raid",
    weight: 2,
    durationDays: [30, 60],
    severity: 2,
    affectsPorts: 1,
    portWhitelist: NATIVE_RAID_PORTS,
  },
  {
    type: "famine",
    headline: "news.famine",
    weight: 1,
    durationDays: [30, 120],
    severity: 2,
    affectsPorts: 1,
  },
  {
    type: "harvest",
    headline: "news.harvest",
    weight: 4,
    durationDays: [45, 90],
    severity: 1,
    affectsPorts: 2,
    seasonal: [9, 10, 11],
    filter: (k: string) => !!PORTS[k]?.produces?.includes("sugar_cane") || !!PORTS[k]?.produces?.includes("food"),
  },
  {
    type: "royal_decree",
    headline: "news.royal_decree",
    weight: 2,
    durationDays: [180, 365],
    severity: 1,
    affectsPorts: 0,  // applies to all ports of the faction
  },
];

// ── Faction name helpers ─────────────────────────────────

const FACTION_NAMES: Record<string, { en: string; pl: string }> = {
  spain: { en: "Spain", pl: "Hiszpania" },
  england: { en: "England", pl: "Anglia" },
  france: { en: "France", pl: "Francja" },
  netherlands: { en: "Netherlands", pl: "Holandia" },
  pirates: { en: "Pirates", pl: "Piraci" },
};

function factionName(id: string): string {
  return FACTION_NAMES[id]?.en ?? id;
}

// ── Main update function ─────────────────────────────────

/** How many random events the world tries to open with. */
export const SEED_COUNT = 5;

/**
 * Stock the world with events on day one, so the first tavern a captain walks
 * into and the first ship he speaks have something to tell him.
 *
 * This used to be its own reading of `RANDOM_EVENTS` and had drifted a long
 * way from the one the world actually runs on — see `rollOneEvent`, which both
 * now call. What is left here is the two things that are genuinely different
 * about day one:
 *
 * **It happens once.** The guard used to be `worldEvents.length > 0`, which
 * meant "already seeded" only for as long as nothing else put an event in the
 * list first. v0.31.0 put `seedHistoricalWars` in front of it and the sentence
 * quietly changed meaning: in the three eras that open *inside* a war — 1600,
 * 1620 and 1640 — the list was never empty, the seed returned immediately, and
 * the world began with **no living events at all**. Half the eras in the game,
 * for twenty-five releases, opened with silent noticeboards. The guard now asks
 * the question it meant to ask: is there already an event of a kind this
 * function produces?
 *
 * **Nothing is stamped in the past.** Events get today's `startDay`, unlike the
 * wars beside them, which reach back real years. A famine the captain sails
 * into on his first morning is a famine that began this morning; giving it a
 * history would mean giving it the economic bite of that history too, and
 * `warBite` is the only thing in the game entitled to do that.
 */
export function seedInitialEvents(world: WorldState): WorldState {
  const randomTypes = new Set<WorldEventType>(RANDOM_EVENTS.map(t => t.type));
  if (world.worldEvents.some(ev => randomTypes.has(ev.type))) return world;

  const month = dayToCalendar(world.time.day, world.startYear).month;
  let w = world;
  let rng = w.rng;

  // Appended one at a time on purpose: every guard inside `rollOneEvent` asks
  // what is already standing, so five picks collected and added at the end
  // would be five picks that cannot see each other — which is exactly how the
  // old seed managed to open 6.4% of worlds with three of the same thing.
  for (let i = 0; i < SEED_COUNT; i++) {
    const rolled = rollOneEvent(w, month, rng);
    rng = rolled.rng;
    if (!rolled.event) continue;
    w = { ...w, worldEvents: [...w.worldEvents, rolled.event] };
  }

  return { ...w, rng };
}

/**
 * Put the wars that were already being fought on the map (v0.31.0).
 *
 * `checkHistoricalWars` creates a war only on the exact day its start date comes
 * round, which is the right rule for a war that breaks out during a career and
 * the wrong one for the day the career begins. Three of the six eras open inside
 * a war — 1600 inside two, 1620 inside the Eighty Years' War, 1640 inside two —
 * and every one of them opened in perfect peace, with the news boards silent and
 * the fighting only ever mentioned in the past tense.
 *
 * `startDay` is **negative** — the real number of days back to the outbreak —
 * and that is the whole reason this is safe to do at all. `EventEffectsSystem`
 * reads it through `warBite`, so a war that has been going on for thirty-two
 * years arrives with its economic bite already spent, and the towns sit on the
 * baselines that a generation of it made of them. Everything about the war as a
 * live situation is untouched: the news boards carry it, `areFactionsAtWar`
 * answers yes, and `NpcSpawnSystem` doubles the navy and puts privateers out.
 *
 * Seeded with the flat bite the table used to apply, this took **39% off the
 * wealth of the entire Caribbean** in the 1600 and 1640 eras and held it there
 * for decades. Measure before believing an event is small.
 *
 * The end comes off the calendar, exactly as for a war declared in play.
 *
 * Called once, from `createNewWorldState`, alongside `seedInitialEvents`.
 */
export function seedHistoricalWars(world: WorldState): WorldState {
  const startMonths = world.startYear * 12 + 1;
  const live = HISTORICAL_WARS.filter(war => {
    const from = war.startYear * 12 + war.startMonth;
    const to = war.endYear * 12 + war.endMonth;
    return from <= startMonths && startMonths < to;
  });
  if (live.length === 0) return world;

  const events: WorldEventState[] = live.map(war => ({
    id: `war_${war.id}`,
    type: "war_start",
    // Days back to the outbreak, both ends measured from 1 January of the year
    // the war began so the subtraction is exact rather than an estimate.
    startDay: 1 - (
      calendarToDay(world.startYear, 1, 1, war.startYear)
      - calendarToDay(war.startYear, war.startMonth, 1, war.startYear)
    ),
    endDay: calendarToDay(war.endYear, war.endMonth, 1, world.startYear),
    ports: [],
    factions: [...war.factions],
    severity: 3,
    // Not `war.headline`: "War declared!" is a lie about a war that has been
    // going on for fifty-two years, and the tavern noticeboard of a Spanish town
    // in 1620 was saying exactly that. Seen on a screenshot, like the last two.
    headline: "news.war_ongoing",
    vars: {
      faction1: factionName(war.factions[0]),
      faction2: factionName(war.factions[1]),
      since: war.startYear,
    },
  }));

  let w: WorldState = { ...world, worldEvents: [...world.worldEvents, ...events] };
  for (const ev of events) w = addLogEntry(w, "news.war_ongoing", ev.vars);
  return w;
}

/** Call once per game day. Returns updated world with new events. */
export function updateWorldEvents(world: WorldState): WorldState {
  const cal = dayToCalendar(world.time.day, world.startYear);
  let w = world;

  // 1. Check historical war starts/ends
  w = checkHistoricalWars(w, cal);

  // 1.5. The wars nobody wrote on the calendar (v0.51.0). Before `expireEvents`
  // and deliberately so: a war that runs out today has to become a treaty while
  // it is still in the list, which is the same trap the war-end check above
  // documents.
  w = updateDiplomacy(w);

  // 2. Expire old events
  w = expireEvents(w);

  // 3. Roll for random events (~3-4 per week = ~50% chance per day)
  w = rollRandomEvents(w, cal);

  return w;
}

/** How many items a noticeboard holds, and how many an NPC carries away. */
export const NEWS_ON_A_BOARD = 5;

/**
 * What this town has to say today — the tavern board, and what a ship sailing
 * from here carries with her.
 *
 * A board, not a stack. This used to be `active.slice(-5)`: the five events
 * added to `worldEvents` most recently, which is an arrival order and has
 * nothing to do with what the town cares about. Measured over three seeds, ten
 * years, every seventh day, all forty-five towns: **11.1%** of town-days carry
 * more than five live events, and on **0.7%** of them the board was full enough
 * to push out the town's *own* news — a siege on the harbour losing its place
 * to a royal decree issued a thousand miles away. Small, and free to fix, which
 * is the only reason it waited this long.
 *
 * The order is the whole fix, and the key is **reach**: the fewer towns an
 * event concerns, the higher it stands. A raid on this harbour is about here; a
 * royal decree names two dozen ports and this one happens to be among them; a
 * war between crowns carries `ports: []`, the faction-scale convention, and
 * concerns every board in the Caribbean equally. "Contains this town" would not
 * have separated the first two — the decree does contain it — which is why the
 * comparison counts towns instead of asking a yes-or-no question. Inside a
 * group the newest thing is first, because a noticeboard is read from the top.
 */
export function getPortNews(world: WorldState, portId: string): NewsItem[] {
  const active = world.worldEvents.filter(
    ev => ev.endDay >= world.time.day && (ev.ports.length === 0 || ev.ports.includes(portId)),
  );
  const reach = (ev: WorldEventState) =>
    (ev.ports.length === 0 ? Number.MAX_SAFE_INTEGER : ev.ports.length);
  const ranked = [...active].sort(
    (a, b) => reach(a) - reach(b) || b.startDay - a.startDay,
  );
  return ranked.slice(0, NEWS_ON_A_BOARD).map(ev => ({
    eventId: ev.id,
    headline: ev.headline,
    vars: ev.vars,
    dayHeard: world.time.day,
    sourcePort: portId,
  }));
}

// ── Internal helpers ─────────────────────────────────────


function checkHistoricalWars(world: WorldState, cal: { year: number; month: number; dayOfMonth: number }): WorldState {
  let w = world;

  for (const war of HISTORICAL_WARS) {
    const activeId = `war_${war.id}`;
    const alreadyActive = w.worldEvents.some(ev => ev.id === activeId);

    // War start
    if (!alreadyActive && cal.year === war.startYear && cal.month === war.startMonth && cal.dayOfMonth === 1) {
      // Off the calendar, not off an estimate. This used to be
      // `day + years * 365 + months * 30`, which is short by a day every four
      // years, and `expireEvents` deletes an event the day after its `endDay`
      // — so every war in this table vanished a few days before its own end
      // date, `alreadyActive` was false when the date came round, and the peace
      // below has never once been declared in the history of this module.
      const endDay = calendarToDay(war.endYear, war.endMonth, 1, w.startYear);
      const newEvent: WorldEventState = {
        id: activeId,
        type: "war_start",
        startDay: w.time.day,
        endDay,
        ports: [],
        factions: [...war.factions],
        severity: 3,
        headline: war.headline,
        vars: { faction1: factionName(war.factions[0]), faction2: factionName(war.factions[1]) },
      };
      w = {
        ...w,
        worldEvents: [...w.worldEvents, newEvent],
      };
      w = addLogEntry(w, "news.war_start", newEvent.vars);
    }

    // War end (check if active war has ended by calendar date)
    if (alreadyActive && cal.year === war.endYear && cal.month === war.endMonth && cal.dayOfMonth === 1) {
      const vars = { faction1: factionName(war.factions[0]), faction2: factionName(war.factions[1]) };
      // The peace is an event of its own, and it has to be, for two reasons.
      // `EventEffectsSystem` has had a `treaty_signed` row since v0.9.7 that
      // nothing ever produced — the mirror of the dead fields v0.29.0 went
      // looking for — and `getPortNews` only carries what is in `worldEvents`,
      // so a war that simply disappeared was news no tavern ever printed and no
      // captain at sea ever passed on. War is something the whole map feels;
      // peace was a line in the captain's own log and nothing else.
      const treaty: WorldEventState = {
        id: `treaty_${war.id}`,
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
        worldEvents: [...w.worldEvents.filter(ev => ev.id !== activeId), treaty],
      };
      w = addLogEntry(w, "news.war_end", vars);
    }
  }

  return w;
}

/**
 * How far a multi-port event may reach past the town it is named for.
 *
 * A hurricane crossing the sea at fifteen knots covers about four hundred
 * units of this map in a day and runs for three to seven, so a second landfall
 * seven hundred units on is a storm doing what a storm does. Beyond that it is
 * two storms.
 */
const NEIGHBOUR_REACH = 700;

/**
 * How many of the nearest candidates the roll chooses between.
 *
 * Taking the single nearest every time would make a hurricane at Cartagena
 * always the same three towns; drawing from the nearest handful keeps it a
 * region rather than a fixture.
 */
const NEIGHBOUR_SHORTLIST = 6;

/**
 * The other towns a multi-port event touches: near the first one, and rolled.
 *
 * Three separate bugs lived in the four lines this replaces, and they had been
 * there since the event system was written:
 *
 * 1. **They were not nearby.** The variable was called `nearby` and the comment
 *    said "Add nearby ports", but the list it drew from was *every port on the
 *    map*, unsorted. A hurricane over Cartagena also struck Bermuda.
 * 2. **They were not seeded.** `sort(() => 0.5 - Math.random())` is the one
 *    call to `Math.random` that was left inside the deterministic world tick,
 *    so two replays of the same seed produced different worlds. (It is not a
 *    uniform shuffle either, but that hardly mattered next to the rest.)
 * 3. **They ignored the template's own filter.** `harvest` is restricted to
 *    towns that grow sugar or food; its second town was drawn from everything,
 *    so a harvest could land on a port that grows neither.
 *
 * Drawing from `pool` fixes the third, sorting by distance the first, and
 * `rngNextInt` the second. The result is ordered **outward from the first
 * town**, which is what makes it a road rather than a scatter — see
 * `WeatherFieldSystem.hurricaneTrack`.
 */
export function pickNeighbours(
  pool: string[],
  mainPort: string,
  count: number,
  rng: RngState,
): { ports: string[]; rng: RngState } {
  if (count <= 0) return { ports: [], rng };
  const here = PORTS[mainPort]?.pos;
  if (!here) return { ports: [], rng };

  const dist = (k: string) => Math.hypot(PORTS[k].pos.x - here.x, PORTS[k].pos.y - here.y);
  const shortlist = pool
    .filter(k => k !== mainPort && PORTS[k] && dist(k) <= NEIGHBOUR_REACH)
    .sort((a, b) => dist(a) - dist(b))
    .slice(0, NEIGHBOUR_SHORTLIST);

  const chosen: string[] = [];
  let r = rng;
  // Fewer neighbours than asked for is the right answer for an isolated town,
  // not a failure: a hurricane over Bermuda has nowhere else to go.
  while (chosen.length < count && shortlist.length > 0) {
    const roll = rngNextInt(r, 0, shortlist.length - 1);
    r = roll.state;
    chosen.push(shortlist.splice(roll.value, 1)[0]);
  }
  chosen.sort((a, b) => dist(a) - dist(b));
  return { ports: chosen, rng: r };
}

function expireEvents(world: WorldState): WorldState {
  const active = world.worldEvents.filter(ev => ev.endDay >= world.time.day);
  if (active.length === world.worldEvents.length) return world;
  return { ...world, worldEvents: active };
}

/**
 * Choose one random event from the table and build it, or answer `null` when
 * nothing the table offers may land in this world today.
 *
 * Everything that decides *what* an event is and *where* it falls lives here
 * and nowhere else, and that is the whole point of the function. Until v0.57.0
 * the daily roll and the day-one seed were two separate readings of the same
 * table, and the second had drifted from the first in five ways: it picked
 * templates **uniformly** instead of by `weight`, ignored `seasonal`,
 * collapsed every multi-port event onto a single town, laid every
 * faction-wide event on **Spain** whichever crown issued it, and had neither
 * of the guards against stacking. A second reader of a table is a second set
 * of rules, and it will always be the one nobody maintains.
 *
 * The world is passed in rather than the event list because every guard below
 * asks a question about what is already standing — which is also why the seed
 * has to append as it goes rather than collect five picks and add them at the
 * end.
 */
function rollOneEvent(
  world: WorldState,
  month: number,
  rngIn: RngState,
): { event: WorldEventState | null; rng: RngState } {
  const w = world;
  let rng = rngIn;
  let r: { value: number; state: RngState };
  const nothing = (state: RngState) => ({ event: null, rng: state });

  // Weighted selection
  const eligible = RANDOM_EVENTS.filter(
    tmpl => !tmpl.seasonal || tmpl.seasonal.includes(month),
  );
  const totalWeight = eligible.reduce((sum, tmpl) => sum + tmpl.weight, 0);
  r = rngNextFloat(rng, 0, 1);
  rng = r.state;
  const pick = r.value;

  let cumulative = 0;
  let chosen: RandomEventTemplate | null = null;
  for (const tmpl of eligible) {
    cumulative += tmpl.weight / totalWeight;
    if (pick <= cumulative) { chosen = tmpl; break; }
  }
  if (!chosen) return nothing(rng);

  // Don't stack too many of the same type
  const sameTypeCount = w.worldEvents.filter(ev => ev.type === chosen!.type).length;
  if (sameTypeCount >= 3) return nothing(rng);

  // Build candidate-port pool honoring whitelist + filter
  const allPorts = Object.keys(PORTS);
  let pool = allPorts;
  if (chosen.portWhitelist) pool = pool.filter(k => chosen!.portWhitelist!.includes(k));
  if (chosen.factionWhitelist) pool = pool.filter(k => chosen!.factionWhitelist!.includes(PORTS[k].factionId as string));
  if (chosen.filter) pool = pool.filter(chosen.filter);
  // Gold discovery: skip ports that already produce gold
  if (chosen.type === "gold_discovery") {
    pool = pool.filter(k => !w.ports[k]?.bonusProduces?.includes("gold"));
  }
  if (pool.length === 0) return nothing(rng);

  // Pick a port from the eligible pool
  const portRng = rngNext(rng);
  rng = portRng.state;
  // The same float-modulo mistake as in `seedInitialEvents`, and the same
  // consequence: every random event the world has ever spawned picked
  // `pool[0.37]`, so `mainPort` was undefined, the headline read "sail from
  // undefined", `affectedPorts` was `[undefined]` and the whole living-world
  // event layer moved nothing. Fixed in v0.28.0, found by reading a tavern
  // noticeboard in a screenshot.
  const mainPort = pool[Math.floor(portRng.value * pool.length)];
  const portDef = PORTS[mainPort];
  const portName = portDef?.name ?? mainPort;

  let affectedPorts: string[];
  if (chosen.affectsPorts === 0) {
    // All ports of the chosen port's faction. treasure_fleet stays Spanish-only
    // (its faction is naturally Spain via its source port).
    const targetFaction = chosen.type === "treasure_fleet" ? "spain" : (portDef?.factionId as string);
    affectedPorts = allPorts.filter(k => PORTS[k].factionId === targetFaction);
  } else {
    const picked = pickNeighbours(pool, mainPort, chosen.affectsPorts - 1, rng);
    rng = picked.rng;
    affectedPorts = [mainPort, ...picked.ports];
  }

  // One of a kind per town (v0.28.0). A crown does not issue three tariff
  // decrees at once and a harbour does not have two hurricanes, and until the
  // events actually landed anywhere nobody could see that it was allowed: the
  // `sameTypeCount >= 3` guard above counts events, not overlap, and a
  // faction-wide decree covers twenty-four ports. Three of them on the same
  // twenty-four put every rich Spanish colony on the wealth clamp inside a year.
  const alreadyHere = w.worldEvents.some(
    ev => ev.type === chosen!.type
      && ev.endDay >= w.time.day
      && ev.ports.some(port => affectedPorts.includes(port)),
  );
  if (alreadyHere) return nothing(rng);

  const durR = rngNextFloat(rng, 0, 1);
  rng = durR.state;
  const durRoll = durR.value;
  const duration = Math.round(
    chosen.durationDays[0] + durRoll * (chosen.durationDays[1] - chosen.durationDays[0]),
  );

  const eventId = `${chosen.type}_${w.time.day}_${mainPort}`;
  const factionId = portDef?.factionId as string ?? "pirates";
  const vars: Record<string, string | number> = {
    // The town's **key**, not its name. `port` below is a display string and
    // has been read as one since the first headline; anything that needs to
    // look the town up needs this instead (the same lesson as the raw faction
    // key reaching the journal in v0.37.0).
    mainPort: mainPort,
    // The plate fleet's first leg starts here, and a fact about an event is
    // stamped at the event (v0.43.0), never derived from today's world.
    ...(chosen.type === "treasure_fleet" ? { muster: mainPort } : {}),
    port: portName,
    faction: factionName(factionId),
    duration,
  };

  const newEvent: WorldEventState = {
    id: eventId,
    type: chosen.type,
    startDay: w.time.day,
    endDay: w.time.day + duration,
    ports: affectedPorts,
    factions: [factionId],
    severity: chosen.severity,
    headline: chosen.headline,
    vars,
  };

  return { event: newEvent, rng };
}

function rollRandomEvents(world: WorldState, cal: { year: number; month: number }): WorldState {
  const w = world;

  // ~50% chance of an event per day (3-4 per week)
  const gate = rngNextFloat(w.rng, 0, 1);
  if (gate.value > 0.5) return { ...w, rng: gate.state };

  const rolled = rollOneEvent(w, cal.month, gate.state);
  if (!rolled.event) return { ...w, rng: rolled.rng };

  const next: WorldState = {
    ...w,
    rng: rolled.rng,
    worldEvents: [...w.worldEvents, rolled.event],
  };

  // Log the event
  return addLogEntry(next, rolled.event.headline, rolled.event.vars);
}

/** Check if two factions are at war. */
export function areAtWar(world: WorldState, faction1: string, faction2: string): boolean {
  return world.worldEvents.some(
    ev => ev.type === "war_start" &&
      ev.factions.includes(faction1) && ev.factions.includes(faction2),
  );
}

/** Get all active wars as summaries. */
export function getActiveWars(world: WorldState): Array<{ factions: string[]; headline: string }> {
  return world.worldEvents
    .filter(ev => ev.type === "war_start")
    .map(ev => ({ factions: ev.factions, headline: ev.headline }));
}
