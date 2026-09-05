/**
 * World Event System — generates historical + random events.
 *
 * Called once per game day from WorldEngine.
 * Historical wars fire on exact calendar dates.
 * Random events fire with weighted probability.
 */

import type { WorldState, WorldEventState, WorldEventType } from "../model/WorldState.ts";
import type { NewsItem } from "../model/EntityState.ts";
import { dayToCalendar, calendarToDay } from "./TimeSystem.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { rngNext, rngNextFloat } from "../services/RNG.ts";
import { PORTS } from "../data/ports.ts";

// ── Historical Wars ──────────────────────────────────────

type HistoricalWar = {
  id: string;
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
  factions: [string, string];
  headline: string;
  endHeadline: string;
};

const HISTORICAL_WARS: HistoricalWar[] = [
  {
    id: "eighty_years_war",
    startYear: 1568, startMonth: 5,
    endYear: 1648, endMonth: 1,
    factions: ["spain", "netherlands"],
    headline: "news.war_start",
    endHeadline: "news.war_end",
  },
  {
    id: "anglo_spanish_war_1",
    startYear: 1585, startMonth: 8,
    endYear: 1604, endMonth: 8,
    factions: ["spain", "england"],
    headline: "news.war_start",
    endHeadline: "news.war_end",
  },
  {
    id: "anglo_spanish_war_2",
    startYear: 1625, startMonth: 3,
    endYear: 1630, endMonth: 11,
    factions: ["spain", "england"],
    headline: "news.war_start",
    endHeadline: "news.war_end",
  },
  {
    id: "anglo_french_war",
    startYear: 1627, startMonth: 6,
    endYear: 1629, endMonth: 4,
    factions: ["england", "france"],
    headline: "news.war_start",
    endHeadline: "news.war_end",
  },
  {
    id: "franco_spanish_war",
    startYear: 1635, startMonth: 5,
    endYear: 1659, endMonth: 11,
    factions: ["france", "spain"],
    headline: "news.war_start",
    endHeadline: "news.war_end",
  },
  {
    id: "first_anglo_dutch_war",
    startYear: 1652, startMonth: 7,
    endYear: 1654, endMonth: 4,
    factions: ["england", "netherlands"],
    headline: "news.war_start",
    endHeadline: "news.war_end",
  },
  {
    id: "second_anglo_dutch_war",
    startYear: 1665, startMonth: 3,
    endYear: 1667, endMonth: 7,
    factions: ["england", "netherlands"],
    headline: "news.war_start",
    endHeadline: "news.war_end",
  },
  {
    id: "war_of_devolution",
    startYear: 1667, startMonth: 5,
    endYear: 1668, endMonth: 5,
    factions: ["france", "spain"],
    headline: "news.war_start",
    endHeadline: "news.war_end",
  },
  {
    id: "franco_dutch_war",
    startYear: 1672, startMonth: 4,
    endYear: 1678, endMonth: 9,
    factions: ["france", "netherlands"],
    headline: "news.war_start",
    endHeadline: "news.war_end",
  },
  {
    id: "nine_years_war",
    startYear: 1689, startMonth: 5,
    endYear: 1697, endMonth: 9,
    factions: ["france", "england"],
    headline: "news.war_start",
    endHeadline: "news.war_end",
  },
];

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
  },
  {
    type: "new_governor",
    headline: "news.new_governor",
    weight: 1,
    durationDays: [1, 1], // instant event
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

/**
 * Seed an initial pool of world events at game start so NPCs always have
 * something to talk about on day 1. Picks 4-6 random event templates and
 * scatters them across random ports with a positive remaining duration.
 */
export function seedInitialEvents(world: WorldState): WorldState {
  if (world.worldEvents.length > 0) return world;
  let w = world;
  let rng = w.rng;
  const allPorts = Object.keys(PORTS);
  const seedCount = 5;

  for (let i = 0; i < seedCount; i++) {
    const tmplR = rngNextFloat(rng, 0, 1);
    rng = tmplR.state;
    const tmpl = RANDOM_EVENTS[Math.floor(tmplR.value * RANDOM_EVENTS.length)];
    if (!tmpl) continue;

    const portR = rngNext(rng);
    rng = portR.state;
    // `rngNext` returns a float in [0,1). Taking it modulo the array length —
    // which this did until v0.28.0 — returns the float back, so every seeded
    // event indexed `allPorts[0.37]` and got `undefined`: no port name in the
    // headline, no port in `ports`, and therefore no effect on anything and no
    // news anywhere. Five events at the start of every game, all of them dead.
    const port = allPorts[Math.floor(portR.value * allPorts.length)];
    const portDef = PORTS[port];
    const portName = portDef?.name ?? port;
    const factionId = portDef?.factionId as string ?? "pirates";

    const durR = rngNextFloat(rng, 0, 1);
    rng = durR.state;
    const duration = Math.round(
      tmpl.durationDays[0] + durR.value * (tmpl.durationDays[1] - tmpl.durationDays[0]),
    );

    const eventId = `seed_${tmpl.type}_${i}_${port}`;
    const newEvent: WorldEventState = {
      id: eventId,
      type: tmpl.type,
      startDay: w.time.day,
      endDay: w.time.day + duration,
      ports: tmpl.affectsPorts === 0
        ? allPorts.filter(k => PORTS[k].factionId === "spain")
        : [port],
      factions: [factionId],
      severity: tmpl.severity,
      headline: tmpl.headline,
      vars: { port: portName, faction: factionName(factionId), duration },
    };
    w = { ...w, worldEvents: [...w.worldEvents, newEvent] };
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

  // 2. Expire old events
  w = expireEvents(w);

  // 3. Roll for random events (~3-4 per week = ~50% chance per day)
  w = rollRandomEvents(w, cal);

  return w;
}

/** Get active news for a specific port (for tavern). */
export function getPortNews(world: WorldState, portId: string): NewsItem[] {
  const active = world.worldEvents.filter(
    ev => ev.endDay >= world.time.day && (ev.ports.length === 0 || ev.ports.includes(portId)),
  );
  return active.slice(-5).map(ev => ({
    eventId: ev.id,
    headline: ev.headline,
    vars: ev.vars,
    dayHeard: world.time.day,
    sourcePort: portId,
  }));
}

/** Give NPC fresh news from a port they're visiting. */
export function giveNpcPortNews(world: WorldState, entityId: string, portId: string): WorldState {
  const entity = world.entities[entityId];
  if (!entity?.ai) return world;

  const news = getPortNews(world, portId);
  if (news.length === 0) return world;

  return {
    ...world,
    entities: {
      ...world.entities,
      [entityId]: {
        ...entity,
        ai: {
          ...entity.ai,
          news: news.slice(0, 5),
          lastPortVisited: portId,
        },
      },
    },
  };
}

// ── Internal helpers ─────────────────────────────────────

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
const TREATY_DAYS = 60;

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

function expireEvents(world: WorldState): WorldState {
  const active = world.worldEvents.filter(ev => ev.endDay >= world.time.day);
  if (active.length === world.worldEvents.length) return world;
  return { ...world, worldEvents: active };
}

function rollRandomEvents(world: WorldState, cal: { year: number; month: number }): WorldState {
  let w = world;
  let rng = w.rng;

  // ~50% chance of an event per day (3-4 per week)
  let r = rngNextFloat(rng, 0, 1);
  rng = r.state;
  if (r.value > 0.5) return { ...w, rng };

  // Weighted selection
  const eligible = RANDOM_EVENTS.filter(
    tmpl => !tmpl.seasonal || tmpl.seasonal.includes(cal.month),
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
  if (!chosen) return { ...w, rng };

  // Don't stack too many of the same type
  const sameTypeCount = w.worldEvents.filter(ev => ev.type === chosen!.type).length;
  if (sameTypeCount >= 3) return { ...w, rng };

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
  if (pool.length === 0) return { ...w, rng };

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
    affectedPorts = [mainPort];
    // Add nearby ports for multi-port events
    if (chosen.affectsPorts > 1) {
      const nearby = allPorts
        .filter(k => k !== mainPort)
        .sort(() => 0.5 - Math.random())
        .slice(0, chosen.affectsPorts - 1);
      affectedPorts.push(...nearby);
    }
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
  if (alreadyHere) return { ...w, rng };

  const durR = rngNextFloat(rng, 0, 1);
  rng = durR.state;
  const durRoll = durR.value;
  const duration = Math.round(
    chosen.durationDays[0] + durRoll * (chosen.durationDays[1] - chosen.durationDays[0]),
  );

  const eventId = `${chosen.type}_${w.time.day}_${mainPort}`;
  const factionId = portDef?.factionId as string ?? "pirates";
  const vars: Record<string, string | number> = {
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

  w = {
    ...w,
    rng,
    worldEvents: [...w.worldEvents, newEvent],
  };

  // Log the event
  w = addLogEntry(w, chosen.headline, vars);

  return w;
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
