/**
 * NamedShipCourseRenderer — where he was told she would be (v0.33.0).
 *
 * v0.32.0 gave six merchantmen a name and a schedule and left the captain with
 * a problem he had to solve on paper: the informer says she works Florida Keys
 * to Vera Cruz and cleared the Keys six days ago, she makes the passage in
 * nine, so where should he be tomorrow. That is a *good* problem — it is the
 * whole content of the commission — and it was being posed in a tavern and then
 * carried around in the player's head with nothing on the chart to hang it on.
 *
 * ## What is drawn, and what deliberately is not
 *
 * Her **run** — the lane, both ends, as a faint dashed line — and **one mark**
 * where his reckoning puts her, from the last report he was given.
 *
 * Not her position. That distinction is the entire design. A marker that
 * followed her would turn an interception into following an arrow, and the
 * commission would be a fetch quest with extra sailing. What this draws is a
 * *memory walked forward*: the phase she was at on the day somebody told him,
 * plus the days since, on her known schedule. It is right until something
 * interferes with her, and being wrong occasionally is what makes being right
 * worth anything.
 *
 * The three ways he gets a report are the three ways a captain would: signing
 * the commission (the informer knows her book), a tavern within earshot saying
 * she has just cleared a harbour, and seeing her himself.
 *
 * ## And since v0.34.0 it can actually be wrong
 *
 * A ship that has been in a fight and survived it answers that in harbour: she
 * sails late, and after a second scare she works a different lane entirely.
 * Neither is drawn. What is drawn is `reportedLane` and the reckoning off the
 * report's own copy of her schedule, so the chart keeps saying what he was
 * last told — a course she has abandoned, walked by a mark that is nowhere
 * near her. That is not a bug in the reckoning; it is the reckoning working.
 *
 * ## The mark goes stale
 *
 * A report older than `REPORT_LIFE_DAYS` is dropped by the core, and the mark
 * fades over that span — at three weeks his reckoning could put her anywhere on
 * the circuit, and a confident arrow saying otherwise would be a lie the chart
 * was telling him.
 *
 * Sizes are screen pixels over the camera zoom, for the reason in
 * `ExpeditionCourseRenderer`, and the ring clears the town sprite by being
 * measured in screen pixels around a point rather than around a sprite.
 */

import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import { livingReports, reckonedPos, reportedLane, REPORT_LIFE_DAYS } from "../../core/systems/NamedShipSystem.ts";
import { txt } from "../ui/textStyle.ts";
import { t } from "../../core/i18n/index.ts";

/** Under the port markers, above the land — same shelf as the expedition courses. */
const COURSE_DEPTH = 452;
const LABEL_DEPTH = 602;

/** Screen pixels. */
const DASH = 7;
const GAP = 8;
/** Half-width of the diamond marking the reckoned position. */
const MARK = 6;
const LABEL_PX = 11;

/**
 * A hunted merchantman's ink: the same gold the chart uses for an opportunity,
 * because that is what she is, and distinct from the faction colours a course
 * to a town is drawn in.
 */
const QUARRY_COLOR = 0xd4a017;

export type NamedCourseResult = {
  gfx: Phaser.GameObjects.Graphics;
  labels: Phaser.GameObjects.Text[];
  /** What was drawn, so a redraw can be skipped. */
  drawnKeys: string[];
  drawnZoom: number;
};

/** Identity of a drawn mark: which ship, which report, and how old it is today. */
function markKey(shipId: string, reportDay: number, today: number): string {
  return `${shipId}:${reportDay}:${today}`;
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

export function drawNamedCourses(
  scene: Phaser.Scene,
  world: WorldState,
  zoom: number,
): NamedCourseResult {
  const gfx = scene.add.graphics();
  gfx.setDepth(COURSE_DEPTH);
  const labels: Phaser.GameObjects.Text[] = [];
  const drawnKeys: string[] = [];
  const scale = 1 / Math.max(0.1, zoom);

  for (const { ship, report } of livingReports(world)) {
    // The run he was *told* about, which since v0.34.0 is not always the run
    // she is on: a ship who has been jumped twice changes her lane out of the
    // next harbour, and his pencil stays where he put it until somebody says
    // otherwise. Drawing `laneOf` here would silently correct his chart for
    // him, which is the one thing this renderer exists not to do.
    const lane = reportedLane(ship, report);
    const at = reckonedPos(world, ship, report);
    if (!lane || !at) continue;

    const age = world.time.day - report.day;
    // Confidence, and therefore ink: whole on the day he was told, gone by the
    // time the core drops the report.
    const fade = Math.max(0.15, 1 - age / REPORT_LIFE_DAYS);
    drawnKeys.push(markKey(ship.id, report.day, world.time.day));

    // Her run, both ways, faint — it does not change and it is not news.
    gfx.lineStyle(1.2 * scale, QUARRY_COLOR, 0.35 * fade);
    for (let i = 1; i < lane.path.length; i++) dashedLine(gfx, lane.path[i - 1], lane.path[i], scale);

    // Where the reckoning puts her: a diamond, which reads as a pencil mark
    // rather than as something the chart is sure of. An arrowhead was tried in
    // the expedition renderer and is right there, because a squadron's bearing
    // is known; hers is a guess and should not point.
    const m = MARK * scale;
    gfx.fillStyle(QUARRY_COLOR, 0.9 * fade);
    gfx.beginPath();
    gfx.moveTo(at.x, at.y - m);
    gfx.lineTo(at.x + m, at.y);
    gfx.lineTo(at.x, at.y + m);
    gfx.lineTo(at.x - m, at.y);
    gfx.closePath();
    gfx.fillPath();
    gfx.lineStyle(0.9 * scale, 0x2b2b2b, 0.8 * fade);
    gfx.strokeCircle(at.x, at.y, m * 1.9);

    const label = scene.add.text(
      at.x, at.y - (MARK + 3) * scale,
      t("named.reckoned", { ship: ship.name, days: age }),
      {
        ...txt(LABEL_PX, { bold: true, color: "#" + QUARRY_COLOR.toString(16).padStart(6, "0") }),
        stroke: "#1a1a1a",
        strokeThickness: 3,
      },
    );
    label.setOrigin(0.5, 1);
    label.setScale(scale);
    label.setAlpha(fade);
    label.setDepth(LABEL_DEPTH);
    labels.push(label);
  }

  return { gfx, labels, drawnKeys, drawnZoom: zoom };
}

/**
 * True when what is on screen no longer matches what the world says.
 *
 * The mark moves every day, so the day is part of a mark's identity — unlike
 * the event pins, which only change when the world does.
 */
export function namedCoursesStale(
  prev: NamedCourseResult | null,
  world: WorldState,
  zoom: number,
): boolean {
  if (!prev) return true;
  if (prev.drawnZoom !== zoom) return true;
  const now = livingReports(world).map(r => markKey(r.ship.id, r.report.day, world.time.day));
  if (now.length !== prev.drawnKeys.length) return true;
  return now.some((k, i) => k !== prev.drawnKeys[i]);
}

export function clearNamedCourses(prev: NamedCourseResult | null): void {
  if (!prev) return;
  prev.gfx.destroy();
  for (const label of prev.labels) label.destroy();
}
