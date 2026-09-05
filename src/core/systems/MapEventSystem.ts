/**
 * MapEventSystem — what the chart says is happening ashore (v0.30.0).
 *
 * v0.28.0 made world events actually land on towns and v0.29.0 gave the player
 * things to do about them, but between the two the map stayed silent. A
 * hurricane shuts Cartagena, gold is struck at Campeche, plague empties the
 * tavern bench at Santiago — and the world map showed the same forty-five
 * identical town icons it showed on day one. The only way to find out was to
 * sail there and ask, which is exactly the "homework problem" that
 * `ExpeditionCourseRenderer` was written to kill for landings.
 *
 * So this derives, from the world as it already stands, the short list of marks
 * a captain would have pencilled on his own chart.
 *
 * ## Only what he has heard
 *
 * Same rule as the expedition courses: a mark exists for events in
 * `world.knownEventIds` — the set a tavern noticeboard or a hailed captain has
 * told him about. Not fog-of-war; fog is what the lookout can see, this is what
 * the captain has been told, and calling at ports is how the chart fills in.
 *
 * ## Only what is about a town
 *
 * Three exclusions, and each of them is the difference between a chart and a
 * mess:
 *
 * 1. **Crown-wide events are not town news.** A royal decree covers every port
 *    of a crown — twenty-four of them — and a treasure fleet every Spanish one.
 *    Twenty-four identical badges do not tell the player anything the flags
 *    already tell him, and they bury the one hurricane he needs to see. Anything
 *    covering more than `MARK_MAX_PORTS` towns is a property of the flag.
 * 2. **Landings are already drawn**, by `ExpeditionCourseRenderer`, with a
 *    course and a ring on the target. A second mark on the same town would be
 *    the same fact twice.
 * 3. **Wars have no town.** `war_start` / `war_end` / `treaty_signed` carry an
 *    empty `ports`, because they are about factions.
 *
 * ## One mark per town
 *
 * Two events can cover the same harbour. Drawing both stacks two badges on a
 * sprite six world-units across, so the town gets the mark that most changes
 * what the captain would do, and a count of the rest.
 */

import type { WorldState, WorldEventState, WorldEventType } from "../model/WorldState.ts";
import { isPortClosed } from "./EventEffectsSystem.ts";

/**
 * Above this many affected towns an event stops being news about a harbour and
 * becomes news about a crown. Hurricane covers 3, harvest 2, everything else 1;
 * the faction-wide events cover ten to twenty-four.
 */
export const MARK_MAX_PORTS = 4;

/** Events drawn elsewhere on the chart, or not about a town at all. */
const NOT_A_TOWN_MARK: ReadonlySet<WorldEventType> = new Set<WorldEventType>([
  // Drawn by ExpeditionCourseRenderer as a course and a ring.
  "reconquest",
  "campaign",
  // Faction-scale, and `ports` is empty for all three.
  "war_start",
  "war_end",
  "treaty_signed",
]);

/**
 * Is this worth sailing towards, or away from?
 *
 * The colour on the chart answers one question and only one, because at eight
 * screen pixels there is room for exactly one question. `neutral` is for the
 * events that are a change of circumstance rather than an opportunity or a
 * danger — a new governor is somebody else's problem until the captain has
 * business with him.
 */
export type MarkValence = "bad" | "good" | "neutral";

const VALENCE: Partial<Record<WorldEventType, MarkValence>> = {
  epidemic: "bad",
  pirate_raid: "bad",
  slave_revolt: "bad",
  hurricane: "bad",
  native_raid: "bad",
  famine: "bad",
  trade_boom: "good",
  gold_discovery: "good",
  harvest: "good",
  treasure_fleet: "good",
  new_governor: "neutral",
  royal_decree: "neutral",
};

export function markValence(type: WorldEventType): MarkValence {
  return VALENCE[type] ?? "neutral";
}

export type PortEventMark = {
  portKey: string;
  type: WorldEventType;
  severity: 1 | 2 | 3;
  /** Days from today until the event lifts; 0 on its last day. */
  daysLeft: number;
  /** The harbour is shut — he cannot go in at all while this lasts. */
  closed: boolean;
  valence: MarkValence;
  /** Other known events covering the same town, not drawn. */
  extra: number;
  /** Event whose mark this is, so a redraw can tell the drawing is stale. */
  eventId: string;
};

/** Events the player has been told about that are about one town in particular. */
function townEvents(world: WorldState): WorldEventState[] {
  const known = new Set(world.knownEventIds ?? []);
  return world.worldEvents.filter(ev =>
    ev.endDay >= world.time.day &&
    known.has(ev.id) &&
    !NOT_A_TOWN_MARK.has(ev.type) &&
    ev.ports.length > 0 &&
    ev.ports.length <= MARK_MAX_PORTS,
  );
}

/**
 * How much this changes what the captain would do, most first.
 *
 * A shut harbour outranks everything, because it is the one that turns a
 * planned call into a wasted week. Then severity. Then the *shorter* event: a
 * hurricane that lifts in three days is news, a gold strike that runs for a
 * year is a standing fact of the map.
 */
function moreUrgent(a: PortEventMark, b: PortEventMark): number {
  if (a.closed !== b.closed) return a.closed ? -1 : 1;
  if (a.severity !== b.severity) return b.severity - a.severity;
  if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
  return a.eventId < b.eventId ? -1 : 1;
}

/**
 * One mark per town, for every town the player has heard something about.
 *
 * Ordered by port key so the caller can compare two results cheaply — the
 * renderer redraws the lot whenever the list changes, and needs a stable order
 * to notice that it has not.
 */
export function knownPortEvents(world: WorldState): PortEventMark[] {
  const byPort = new Map<string, PortEventMark[]>();

  for (const ev of townEvents(world)) {
    for (const portKey of ev.ports) {
      if (!world.ports[portKey]) continue;
      const mark: PortEventMark = {
        portKey,
        type: ev.type,
        severity: ev.severity,
        daysLeft: Math.max(0, ev.endDay - world.time.day),
        // Asked of the port, not of the event: a town can be shut by any one of
        // several things at once, and what the captain needs to know is whether
        // the door is open.
        closed: isPortClosed(world, portKey),
        valence: markValence(ev.type),
        extra: 0,
        eventId: ev.id,
      };
      const list = byPort.get(portKey);
      if (list) list.push(mark); else byPort.set(portKey, [mark]);
    }
  }

  const out: PortEventMark[] = [];
  for (const marks of byPort.values()) {
    marks.sort(moreUrgent);
    out.push({ ...marks[0], extra: marks.length - 1 });
  }
  out.sort((a, b) => (a.portKey < b.portKey ? -1 : a.portKey > b.portKey ? 1 : 0));
  return out;
}
