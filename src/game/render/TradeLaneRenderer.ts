/**
 * TradeLaneRenderer — the shipping on the chart.
 *
 * `TradeRouteSystem` works out which town supplies which and by what water. A
 * captain who cannot see any of that is back to guessing where the merchantmen
 * are, which is the thing the whole module exists to stop.
 *
 * So the lanes go on the chart, drawn the way a lane is drawn on a chart: a
 * thin line following the actual course round the islands, not a ruled line
 * between two dots. A lane somebody has been preying on is drawn in a warmer
 * colour, because that is the one worth knowing about — either as a place the
 * pickings have been good, or as the reason a town at the far end is going
 * short.
 *
 * Toggled with L and remembered in `pc_lanes`. It is on by default: a feature
 * whose default is invisible is a feature nobody finds.
 *
 * All widths are **screen** pixels divided by the camera zoom, for the same
 * reason as in `ExpeditionCourseRenderer` — a pencil line is the width of a
 * pencil at every scale of chart.
 */

import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import { tradeRoutes, laneThroughput } from "../../core/systems/TradeRouteSystem.ts";
import { blockadedPorts } from "../../core/systems/BlockadeSystem.ts";

/** Below the expedition courses (450) and well above the land fill. */
const LANE_DEPTH = 430;

const LANE_WIDTH = 1.1;
const LANE_COLOR = 0x6f8fa8;
const LANE_ALPHA = 0.32;

/** A lane that has been preyed on, or that runs out of a shut-in harbour. */
const TROUBLED_COLOR = 0xc98a4b;
const TROUBLED_ALPHA = 0.75;
const TROUBLED_WIDTH = 1.8;

export type TradeLaneResult = {
  gfx: Phaser.GameObjects.Graphics;
  /** Camera zoom the widths were computed against. */
  drawnZoom: number;
  /** Ids of the lanes drawn as troubled, so a redraw can be skipped. */
  drawnTroubled: string[];
};

/** Lanes that are not running normally today: preyed upon, or cut at the source. */
function troubledLanes(world: WorldState): string[] {
  const shut = new Set(blockadedPorts(world));
  return tradeRoutes()
    .filter(r => shut.has(r.from) || shut.has(r.to) || laneThroughput(world, r.id) < 1)
    .map(r => r.id);
}

export function drawTradeLanes(
  scene: Phaser.Scene,
  world: WorldState,
  zoom: number,
): TradeLaneResult {
  const gfx = scene.add.graphics();
  gfx.setDepth(LANE_DEPTH);
  const scale = 1 / Math.max(0.1, zoom);
  const troubled = new Set(troubledLanes(world));

  for (const lane of tradeRoutes()) {
    const bad = troubled.has(lane.id);
    gfx.lineStyle(
      (bad ? TROUBLED_WIDTH : LANE_WIDTH) * scale,
      bad ? TROUBLED_COLOR : LANE_COLOR,
      bad ? TROUBLED_ALPHA : LANE_ALPHA,
    );
    gfx.beginPath();
    gfx.moveTo(lane.path[0].x, lane.path[0].y);
    for (let i = 1; i < lane.path.length; i++) gfx.lineTo(lane.path[i].x, lane.path[i].y);
    gfx.strokePath();
  }

  return { gfx, drawnZoom: zoom, drawnTroubled: [...troubled] };
}

export function lanesStale(
  prev: TradeLaneResult | null,
  world: WorldState,
  zoom: number,
): boolean {
  if (!prev) return true;
  if (prev.drawnZoom !== zoom) return true;
  const now = troubledLanes(world);
  if (now.length !== prev.drawnTroubled.length) return true;
  return now.some((id, i) => id !== prev.drawnTroubled[i]);
}

export function clearTradeLanes(prev: TradeLaneResult | null): void {
  prev?.gfx.destroy();
}
