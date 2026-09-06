/**
 * ExpeditionCourseRenderer — drawing what the taverns told you.
 *
 * v0.17.0 gave a crown's landing real hulls you can meet at sea, and then left
 * the player with an interesting problem he had no tools for: the news says
 * four hundred Spaniards are twelve days out of somewhere, bound for Cartagena,
 * and the squadron only exists on the chart within 620 units of your bow. The
 * course had to be *deduced* — from which crown was sending it, which of their
 * harbours was nearest the target, and how many days had gone by. That is not a
 * navigation problem, it is a homework problem, and no amount of it makes the
 * interception more interesting.
 *
 * So the chart draws it: a dashed line from the harbour the squadron sailed
 * from to the town it is going to, a marker where the reckoning puts it today,
 * and the days remaining beside it.
 *
 * ## Only what he has heard
 *
 * The line is drawn for expeditions in `world.knownEventIds` — the set a tavern
 * keeper or a passing captain has actually told him about. An expedition he has
 * not heard of is not on his chart, which keeps the news network worth having:
 * calling at ports and hailing strange sails is how the map fills in.
 *
 * That is also why this is not fog-of-war-gated. Fog is about what the lookout
 * can see; this is about what the captain has been told, and a chart pencilled
 * from harbour gossip does not care whether the horizon is clear.
 *
 * ## And the plate fleet, since v0.46.0
 *
 * A treasure fleet turned out to be the same drawing with different words: a
 * squadron that sailed from a named harbour, on a course over real water, with
 * one town on the way that everybody knows it must call at, and a number of
 * days left. So it is drawn here rather than by a third renderer of its own —
 * `chartedSquadrons` gathers both kinds into one shape and there is a single
 * draw loop.
 *
 * The ring goes on **Havana** for her, because that is the mark worth putting
 * on a chart: the rendezvous is the one point on a fortnight's passage where a
 * captain knows she has to be.
 */

import Phaser from "phaser";
import type { WorldState, WorldEventState } from "../../core/model/WorldState.ts";
import { CITIES } from "../../core/data/cities.ts";
import { FACTIONS } from "../../core/data/factions.ts";
import { originPortFor, expeditionPos, expeditionCourse } from "../../core/systems/ExpeditionFleetSystem.ts";
import {
  plateFleets,
  plateCourse,
  platePos,
  musterPortFor,
  PLATE_RENDEZVOUS,
} from "../../core/systems/TreasureFleetSystem.ts";
import { expeditionsInFlight } from "../../core/systems/ReconquestSystem.ts";
import { txt } from "../ui/textStyle.ts";
import { t } from "../../core/i18n/index.ts";

/** Under the port markers (499-600) and well above the land fill. */
const COURSE_DEPTH = 450;
const LABEL_DEPTH = 601;

/**
 * Sizes below are in **screen** pixels and are divided by the camera zoom
 * before use.
 *
 * Everything on this chart is drawn in world units, so an annotation with fixed
 * world-space dimensions grows with the zoom — at z2 the arrowhead covered a
 * peninsula and the label ran clean off the screen. A note pencilled on a chart
 * is the width of a pencil whatever the scale of the chart.
 */
const DASH = 9;
const GAP = 7;
/** Radius of the ring drawn round the town the squadron is bound for. */
const TARGET_RING = 46;
/** Half-length of the arrowhead marking where the squadron is reckoned to be. */
const MARKER = 8;
/** Font size of the strength-and-days note. */
const LABEL_PX = 12;

export type ExpeditionCourseResult = {
  gfx: Phaser.GameObjects.Graphics;
  labels: Phaser.GameObjects.Text[];
  /** Event ids the current drawing is of, so a redraw can be skipped. */
  drawnIds: string[];
  /** Day the current drawing was made for — the marker moves daily. */
  drawnDay: number;
  /** Camera zoom the sizes were computed against. */
  drawnZoom: number;
};

/** Expeditions the player has actually been told about. */
export function knownExpeditions(world: WorldState): WorldEventState[] {
  const known = new Set(world.knownEventIds ?? []);
  return expeditionsInFlight(world).filter(ev => known.has(ev.id));
}

/** Plate fleets he has been told about **and** that have actually put to sea. */
export function knownPlateFleets(world: WorldState): WorldEventState[] {
  const known = new Set(world.knownEventIds ?? []);
  // `platePos` answers nothing while she is still loading, which is what keeps
  // the chart honest during the days the headline calls "preparing to sail".
  return plateFleets(world).filter(ev => known.has(ev.id) && platePos(world, ev) !== undefined);
}

/** One squadron on the chart, whoever owns it and whatever it is carrying. */
type ChartedSquadron = {
  id: string;
  course: { x: number; y: number }[];
  at: { x: number; y: number };
  /** The town to ring: a landing's target, a plate fleet's rendezvous. */
  ring: { x: number; y: number };
  color: number;
  label: string;
};

/**
 * Everything pencilled on this chart as "a squadron somewhere on a passage".
 *
 * Two sources, one shape. Anything that fails to produce a course, a position
 * or both ends is simply not drawn — a half-drawn passage is worse than none.
 */
function chartedSquadrons(world: WorldState): ChartedSquadron[] {
  const out: ChartedSquadron[] = [];

  for (const event of knownExpeditions(world)) {
    const target = CITIES[event.ports[0]];
    const originKey = originPortFor(world, event);
    const origin = originKey ? CITIES[originKey] : undefined;
    const course = expeditionCourse(world, event);
    const at = expeditionPos(world, event);
    if (!target || !origin || !course || !at) continue;
    out.push({
      id: event.id,
      course,
      at,
      ring: target.pos,
      color: FACTIONS[event.factions[0]]?.color ?? 0xcc4444,
      label: t("expedition.course_label", {
        soldiers: Number(event.vars.soldiers) || 0,
        days: Math.max(0, event.endDay - world.time.day),
      }),
    });
  }

  for (const event of knownPlateFleets(world)) {
    const course = plateCourse(event);
    const at = platePos(world, event);
    const muster = musterPortFor(event);
    const rendezvous = CITIES[PLATE_RENDEZVOUS];
    if (!course || !at || !muster || !rendezvous) continue;
    out.push({
      id: event.id,
      course,
      at,
      ring: rendezvous.pos,
      // Her own crown's colour: she is a Spanish squadron and reads as one.
      color: FACTIONS.spain?.color ?? 0xd4a017,
      label: t("plate.course_label", {
        port: rendezvous.name,
        days: Math.max(0, event.endDay - world.time.day),
      }),
    });
  }

  return out;
}

function dashedLine(
  g: Phaser.GameObjects.Graphics,
  from: { x: number; y: number },
  to: { x: number; y: number },
  scale: number,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len;
  const uy = dy / len;
  const dash = DASH * scale;
  const step = (DASH + GAP) * scale;

  for (let d = 0; d < len; d += step) {
    const end = Math.min(len, d + dash);
    g.beginPath();
    g.moveTo(from.x + ux * d, from.y + uy * d);
    g.lineTo(from.x + ux * end, from.y + uy * end);
    g.strokePath();
  }
}


/**
 * The next corner of the course after the point the marker sits on.
 *
 * Used only to aim the arrowhead. Falls back to the last point, which is the
 * right answer for a squadron on its final leg.
 */
function nearestCourseLegEnd(course: { x: number; y: number }[], at: { x: number; y: number }): { x: number; y: number } {
  let best = course[course.length - 1];
  let bestDist = Infinity;
  for (let i = 1; i < course.length; i++) {
    const d = Math.hypot(course[i].x - at.x, course[i].y - at.y);
    if (d > 1 && d < bestDist) { bestDist = d; best = course[i]; }
  }
  return best;
}

/**
 * Draw every course the player knows about.
 *
 * Returns the objects so the caller can destroy them on the next redraw. There
 * is no incremental update: the whole thing is at most a handful of lines, and
 * a landing that arrived, was scattered or changed strength would otherwise
 * need its own diff.
 */
export function drawExpeditionCourses(
  scene: Phaser.Scene,
  world: WorldState,
  zoom: number,
): ExpeditionCourseResult {
  const gfx = scene.add.graphics();
  gfx.setDepth(COURSE_DEPTH);
  const labels: Phaser.GameObjects.Text[] = [];
  const drawnIds: string[] = [];
  // World units per screen pixel at the current zoom.
  const scale = 1 / Math.max(0.1, zoom);

  for (const squadron of chartedSquadrons(world)) {
    const { course, at, color } = squadron;
    drawnIds.push(squadron.id);

    // The passage, and the ring on the place it ends. Since v0.23.0 the course
    // is the real water the squadron crosses rather than a ruled line, so it
    // no longer runs through the peninsula it has to sail round.
    gfx.lineStyle(1.6 * scale, color, 0.7);
    for (let i = 1; i < course.length; i++) dashedLine(gfx, course[i - 1], course[i], scale);
    // A ring wide enough to clear the town sprite, or it reads as part of the
    // icon rather than as a mark somebody put on the chart.
    gfx.lineStyle(2.2 * scale, color, 0.85);
    gfx.strokeCircle(squadron.ring.x, squadron.ring.y, TARGET_RING * scale);

    // Where the reckoning puts it: an arrowhead on the course, so the bearing
    // reads off the chart without having to work out which end is which. It
    // points along the leg the marker is actually on, which on a dog-legged
    // passage is not the bearing of the whole voyage.
    const legEnd = nearestCourseLegEnd(course, at);
    const heading = Math.atan2(legEnd.y - at.y, legEnd.x - at.x);
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    const m = MARKER * scale;
    gfx.fillStyle(color, 0.9);
    gfx.beginPath();
    gfx.moveTo(at.x + fx * m, at.y + fy * m);
    gfx.lineTo(at.x - fx * m - fy * m * 0.7, at.y - fy * m + fx * m * 0.7);
    gfx.lineTo(at.x - fx * m + fy * m * 0.7, at.y - fy * m - fx * m * 0.7);
    gfx.closePath();
    gfx.fillPath();

    const label = scene.add.text(
      at.x, at.y - (MARKER + 4) * scale,
      squadron.label,
      txt(LABEL_PX, { color: "#" + color.toString(16).padStart(6, "0") }),
    );
    label.setOrigin(0.5, 1);
    label.setScale(scale);
    label.setDepth(LABEL_DEPTH);
    labels.push(label);
  }

  return { gfx, labels, drawnIds, drawnDay: world.time.day, drawnZoom: zoom };
}

/** True when what is on screen no longer matches what the world says. */
export function coursesStale(
  prev: ExpeditionCourseResult | null,
  world: WorldState,
  zoom: number,
): boolean {
  if (!prev) return true;
  if (prev.drawnDay !== world.time.day) return true;
  if (prev.drawnZoom !== zoom) return true;
  const now = chartedSquadrons(world).map(s => s.id);
  if (now.length !== prev.drawnIds.length) return true;
  return now.some((id, i) => id !== prev.drawnIds[i]);
}

export function clearExpeditionCourses(prev: ExpeditionCourseResult | null): void {
  if (!prev) return;
  prev.gfx.destroy();
  for (const label of prev.labels) label.destroy();
}
