/**
 * What an event's headline says **today** — as against what it said the day it
 * was stamped.
 *
 * `WorldEventState.headline` and `.vars` are written once, when the event is
 * created, and never touched again. For most of the table that is exactly
 * right, and v0.43.0 made it a rule: a fact about an event is stamped at the
 * event, never derived from today's world, or the chart starts lying whenever
 * the world moves under it.
 *
 * The rule has a boundary, and three events were standing on the wrong side of
 * it. **A phase is not a fact about the event; it is a fact about today.** A
 * squadron that is eighteen days out is eighteen days out *on the morning it
 * sails* and one day out on the eve of the landing, and the sentence on the
 * noticeboard was the same sentence both times.
 *
 * Measured before writing any of this:
 *
 * - **the landing clock.** 1143 campaigns over twelve seeds: on **93.1%** of
 *   the 16 481 board-days the number was wrong, on **79.2%** wrong by three
 *   days or more, median overstatement **7 days**, worst case **20** — a board
 *   reading "twenty days out" on the day the men came ashore. And the same
 *   sentence carries `{{soldiers}}`, which `ExpeditionFleetSystem` rewrites
 *   every tick as hulls are sunk, so one number in it was live and the other
 *   was frozen. The town's own garrison screen, two menu items away, has
 *   counted down correctly since v0.17.0 (`daysUntilRelief`).
 * - **the plate fleet.** She is alongside for `PLATE_MUSTER_SHARE` of the
 *   event and at sea for the rest, so "preparing to sail from Vera Cruz" is
 *   false on **72.3%** of her board-days; when it is false she is a median of
 *   **1158 units** from that harbour, which on this map is the whole
 *   Cartagena–Havana passage and twice the run from Havana to Port Royale.
 *   The one headline in the game a captain would cross the Caribbean for sent
 *   him to an empty roadstead.
 * - **the storm.** Since v0.45.0 a hurricane is one eye walking a road, not
 *   three circles standing still. On **56%** of its board-days the eye is past
 *   the town the headline names — and the tavern has known where it is going
 *   since v0.70.0 (`tavern.rumor_hurricane_bound`), so the noticeboard was the
 *   worse of the town's two channels.
 *
 * What is *not* here is the journal. `addLogEntry` at the moment the event
 * breaks writes a dated record of what was said that day, and a dated record
 * is supposed to keep saying it. Nothing in this file touches the log.
 *
 * The recomputation happens **at read time only**. Writing it back into
 * `ev.vars` would be a much worse bug than the one it fixes:
 * `ReconquestSystem.expeditionFromEvent` reads `vars.days` back as the
 * expedition's `sailDays`, so a countdown stamped into the event would shorten
 * the voyage every day it was read.
 *
 * Because `getPortNews` copies the *live* text into the `NewsItem` a ship
 * carries away, an NPC's copy is frozen on the day she picked it up, which is
 * the right answer for a ship that has been at sea a week.
 */

import type { WorldState, WorldEventState } from "../model/WorldState.ts";
import { plateNews } from "./TreasureFleetSystem.ts";
import { liveHurricanes } from "./WeatherFieldSystem.ts";
import { expeditionNews } from "./ExpeditionFleetSystem.ts";

export type LiveNews = {
  headline: string;
  vars: Record<string, string | number>;
};

/**
 * Where the storm is now, rather than where it came ashore.
 *
 * `HurricaneReport.port` and `.bound` are already name keys (v0.63.0), so they
 * drop straight into `vars` and decline in Polish like any other port (v0.69.0).
 */
function stormNews(world: WorldState, ev: WorldEventState): LiveNews {
  const report = liveHurricanes(world).find(h => h.id === ev.id);
  // A storm that landed on one town only - `pickNeighbours` answers fewer than
  // it was asked for round an isolated harbour, and says so - never moves off
  // it, and `report.port` never differs from the stamped one. That is the same
  // branch as a storm the world has already dropped, and it wants the same
  // answer: say what was stamped.
  if (!report || report.port === ev.vars.port) {
    return { headline: ev.headline, vars: ev.vars };
  }
  return {
    headline: "news.hurricane_bound",
    vars: { ...ev.vars, port: report.port, bound: report.bound },
  };
}

/** The headline and vars this event should be rendered with today. */
export function liveNews(world: WorldState, ev: WorldEventState): LiveNews {
  switch (ev.type) {
    case "treasure_fleet":
      return plateNews(world, ev);
    case "hurricane":
      return stormNews(world, ev);
    case "reconquest":
    case "campaign":
      return expeditionNews(world, ev);
    default:
      return { headline: ev.headline, vars: ev.vars };
  }
}
