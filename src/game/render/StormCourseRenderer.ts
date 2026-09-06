/**
 * StormCourseRenderer — the storm has a road, and the road is on the chart (v0.45.0).
 *
 * Until this release a hurricane was three stationary circles standing over
 * three harbours, and the chart said so with three pins. Now it is one eye that
 * walks from the first of those towns to the last across the event's life — and
 * that change is only fair if it can be seen coming.
 *
 * A moving danger nobody can plot is not weather, it is a dice roll: the
 * captain gives the pin a wide berth and the storm finds him anyway, and
 * nothing on screen ever explains why. So this draws two things:
 *
 *   - **the road**, a dashed line through the warned towns, which turns three
 *     pins from a list into a schedule — Santa Marta tomorrow, Río de la Hacha
 *     on the fourth day;
 *   - **the eye today**, as a circle at the storm's true reach.
 *
 * ## The circle is the only annotation on this chart drawn in world units
 *
 * Everything else the map draws over the sea — labels, flags, courses, pins —
 * is a constant screen size divided by the zoom, because it is a *mark on
 * paper* and a mark does not grow when you lean closer. `HURRICANE_RADIUS` is
 * not a mark. It is 260 units of actual sea in which actual canvas is torn, and
 * drawing it any other size would be the chart lying about how much room there
 * is to get round it.
 *
 * The consequence is that the ring is only *read* zoomed out — at the zoom a
 * captain sails at, the circle is several screens across and all he sees is an
 * arc crossing the water ahead, which is exactly what a storm looks like from
 * inside one. So the label hangs off the eye's **centre mark**, in screen
 * pixels, like every other label on this chart. Hung off the top of the ring it
 * was three thousand pixels above the viewport and nobody ever saw it.
 *
 * ## Only storms he has heard of
 *
 * `knownHurricanes` filters on `knownEventIds`; the weather itself never does.
 * Same rule as the town pins and the reckoned mark: the chart carries what he
 * was told, and a storm nobody has mentioned is a surprise he is entitled to.
 */

import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import { knownHurricanes, HURRICANE_RADIUS } from "../../core/systems/WeatherFieldSystem.ts";
import { txt } from "../ui/textStyle.ts";
import { t } from "../../core/i18n/index.ts";

/** Between the trade lanes (430) and the expedition courses (450). */
const ROAD_DEPTH = 445;
const LABEL_DEPTH = 603;

/** Screen pixels. */
const DASH = 6;
const GAP = 7;
const LABEL_PX = 11;
/** Screen pixels between the eye's centre mark and its label. */
const LABEL_GAP = 16;

/**
 * Storm ink: a pale slate that reads as cloud against the sea and does not
 * collide with the teal of the currents (0x5f9ea0), the gold of a hunted
 * merchantman or any crown's colour on an expedition course.
 */
const STORM_COLOR = 0xc3cbdd;

/**
 * How far the eye must move before the drawing is redrawn, in world units.
 *
 * Unlike every other course on this chart the eye moves continuously, so its
 * identity cannot be the day. Eight units is under a twentieth of the radius —
 * invisible — and at the median storm's pace it is about twenty redraws a day.
 */
const EYE_STEP = 8;

export type StormCourseResult = {
  gfx: Phaser.GameObjects.Graphics;
  labels: Phaser.GameObjects.Text[];
  drawnKeys: string[];
  drawnZoom: number;
};

/** Identity of a drawn storm: which event, and where its eye is to the nearest step. */
function stormKey(id: string, eye: { x: number; y: number }, daysLeft: number): string {
  return `${id}:${Math.round(eye.x / EYE_STEP)}:${Math.round(eye.y / EYE_STEP)}:${daysLeft}`;
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

/** A ring of short strokes — a drawn circle would read as a range ring, not weather. */
function ragged(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  scale: number,
): void {
  const spokes = 36;
  for (let i = 0; i < spokes; i++) {
    const a0 = (i / spokes) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / spokes * 0.55;
    g.beginPath();
    g.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    g.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    g.strokePath();
  }
  // A short bar through the middle: this is a centre, not an area of interest.
  const tick = 10 * scale;
  g.beginPath();
  g.moveTo(cx - tick, cy);
  g.lineTo(cx + tick, cy);
  g.moveTo(cx, cy - tick);
  g.lineTo(cx, cy + tick);
  g.strokePath();
}

export function drawStormCourses(
  scene: Phaser.Scene,
  world: WorldState,
  zoom: number,
): StormCourseResult {
  const gfx = scene.add.graphics();
  gfx.setDepth(ROAD_DEPTH);
  const labels: Phaser.GameObjects.Text[] = [];
  const drawnKeys: string[] = [];
  const scale = 1 / Math.max(0.1, zoom);

  for (const storm of knownHurricanes(world)) {
    drawnKeys.push(stormKey(storm.id, storm.eye, storm.daysLeft));

    // The road she is walking, faint — it does not change and it is not news.
    gfx.lineStyle(1.2 * scale, STORM_COLOR, 0.4);
    for (let i = 1; i < storm.road.length; i++) {
      dashedLine(gfx, storm.road[i - 1], storm.road[i], scale);
    }

    // The eye today, at the reach it actually has (see the module header).
    gfx.lineStyle(1.6 * scale, STORM_COLOR, 0.7);
    ragged(gfx, storm.eye.x, storm.eye.y, HURRICANE_RADIUS, scale);

    // Just above the centre mark, in screen pixels — NOT above the ring. The
    // ring is 260 world units of radius, which at any zoom a captain actually
    // sails at is several screens tall, so a label hung off its top edge is a
    // label nobody ever sees.
    const label = scene.add.text(
      storm.eye.x, storm.eye.y - LABEL_GAP * scale,
      storm.bound === storm.port
        ? t("weather.chart_storm", { days: storm.daysLeft })
        : t("weather.chart_storm_bound", { port: storm.bound, days: storm.daysLeft }),
      {
        ...txt(LABEL_PX, { bold: true, color: "#" + STORM_COLOR.toString(16).padStart(6, "0") }),
        stroke: "#1a1a1a",
        strokeThickness: 3,
      },
    );
    label.setOrigin(0.5, 1);
    label.setScale(scale);
    label.setDepth(LABEL_DEPTH);
    labels.push(label);
  }

  return { gfx, labels, drawnKeys, drawnZoom: zoom };
}

/** True when what is on screen no longer matches what the world says. */
export function stormCoursesStale(
  prev: StormCourseResult | null,
  world: WorldState,
  zoom: number,
): boolean {
  if (!prev) return true;
  if (prev.drawnZoom !== zoom) return true;
  const now = knownHurricanes(world).map(s => stormKey(s.id, s.eye, s.daysLeft));
  if (now.length !== prev.drawnKeys.length) return true;
  return now.some((k, i) => k !== prev.drawnKeys[i]);
}

export function clearStormCourses(prev: StormCourseResult | null): void {
  if (!prev) return;
  prev.gfx.destroy();
  for (const label of prev.labels) label.destroy();
}
