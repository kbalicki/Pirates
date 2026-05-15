/**
 * World Event System — generates historical + random events.
 *
 * Called once per game day from WorldEngine.
 * Historical wars fire on exact calendar dates.
 * Random events fire with weighted probability.
 */

import type { WorldState, WorldEventState, WorldEventType } from "../model/WorldState.ts";
import type { NewsItem } from "../model/EntityState.ts";
import { dayToCalendar } from "./TimeSystem.ts";
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
};

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
    const port = allPorts[portR.value % allPorts.length];
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

function checkHistoricalWars(world: WorldState, cal: { year: number; month: number; dayOfMonth: number }): WorldState {
  let w = world;

  for (const war of HISTORICAL_WARS) {
    const activeId = `war_${war.id}`;
    const alreadyActive = w.worldEvents.some(ev => ev.id === activeId);

    // War start
    if (!alreadyActive && cal.year === war.startYear && cal.month === war.startMonth && cal.dayOfMonth === 1) {
      const endDay = w.time.day + (war.endYear - war.startYear) * 365 + (war.endMonth - war.startMonth) * 30;
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
      w = {
        ...w,
        worldEvents: w.worldEvents.filter(ev => ev.id !== activeId),
      };
      const vars = { faction1: factionName(war.factions[0]), faction2: factionName(war.factions[1]) };
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

  // Pick random port(s)
  const allPorts = Object.keys(PORTS);
  const portRng = rngNext(rng);
  rng = portRng.state;
  const portIdx = portRng.value;
  const mainPort = allPorts[portIdx % allPorts.length];
  const portDef = PORTS[mainPort];
  const portName = portDef?.name ?? mainPort;

  let affectedPorts: string[];
  if (chosen.affectsPorts === 0) {
    // All ports of a faction (treasure fleet = spanish ports)
    affectedPorts = allPorts.filter(k => PORTS[k].factionId === "spain");
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
