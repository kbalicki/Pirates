/**
 * CurrentRenderer — the set of the sea, drawn on the chart (v0.41.0).
 *
 * A current that can only be inferred from your reckoning being wrong is, as
 * far as the player is concerned, a bug. `CurrentSystem` carries every hull on
 * the map; this is the half that lets a captain plan around it instead of
 * discovering it.
 *
 * Drawn the way set is drawn on a chart: rows of small arrows along the band,
 * pointing the way the water goes, thicker where it runs harder. Faint, and
 * *under* the trade lanes — the lanes are where ships choose to go and the
 * current is what the sea does regardless, so the choice belongs on top.
 *
 * Toggled with `C` and remembered in `pc_currents`, on by default. Every width
 * is in screen pixels divided by the camera zoom, like the lanes and the
 * expedition courses: an arrow on a chart is the size of an arrow at any scale.
 */

import Phaser from "phaser";
import { CURRENTS } from "../../core/data/currents.ts";
import { headingToVec } from "../../core/services/Geometry.ts";

/** Under the trade lanes (430), above the land fill. */
const CURRENT_DEPTH = 410;

/** How far apart the arrows sit, in world units. */
const ARROW_SPACING = 150;
const ARROW_LEN = 26;
const ARROW_HEAD = 7;

const CURRENT_COLOR = 0x5f9ea0;
/** Alpha at the weakest band on the chart, and at the strongest. */
const ALPHA_MIN = 0.18;
const ALPHA_MAX = 0.42;
const WIDTH_MIN = 0.9;
const WIDTH_MAX = 2.0;

export type CurrentResult = {
  gfx: Phaser.GameObjects.Graphics;
  drawnZoom: number;
};

const strengths = CURRENTS.map(c => c.strength);
const WEAKEST = Math.min(...strengths);
const STRONGEST = Math.max(...strengths);

/** 0 at the weakest band, 1 at the strongest. */
function heft(strength: number): number {
  if (STRONGEST <= WEAKEST) return 1;
  return (strength - WEAKEST) / (STRONGEST - WEAKEST);
}

export function drawCurrents(scene: Phaser.Scene, zoom: number): CurrentResult {
  const gfx = scene.add.graphics();
  gfx.setDepth(CURRENT_DEPTH);
  const scale = 1 / Math.max(0.1, zoom);

  for (const band of CURRENTS) {
    const t = heft(band.strength);
    gfx.lineStyle(
      (WIDTH_MIN + (WIDTH_MAX - WIDTH_MIN) * t) * scale,
      CURRENT_COLOR,
      ALPHA_MIN + (ALPHA_MAX - ALPHA_MIN) * t,
    );

    const dir = headingToVec(band.flowsToward);
    // Perpendicular, for the two barbs of the arrowhead.
    const perp = { x: -dir.y, y: dir.x };
    const len = ARROW_LEN * scale;
    const head = ARROW_HEAD * scale;

    // Inset half a spacing so the arrows sit inside the band rather than on its
    // edge, and step in world units so the pattern does not crawl when zooming.
    for (let x = band.rect.x + ARROW_SPACING / 2; x < band.rect.x + band.rect.w; x += ARROW_SPACING) {
      for (let y = band.rect.y + ARROW_SPACING / 2; y < band.rect.y + band.rect.h; y += ARROW_SPACING) {
        const tipX = x + dir.x * len / 2;
        const tipY = y + dir.y * len / 2;
        const tailX = x - dir.x * len / 2;
        const tailY = y - dir.y * len / 2;

        gfx.beginPath();
        gfx.moveTo(tailX, tailY);
        gfx.lineTo(tipX, tipY);
        gfx.moveTo(tipX, tipY);
        gfx.lineTo(tipX - dir.x * head + perp.x * head * 0.6, tipY - dir.y * head + perp.y * head * 0.6);
        gfx.moveTo(tipX, tipY);
        gfx.lineTo(tipX - dir.x * head - perp.x * head * 0.6, tipY - dir.y * head - perp.y * head * 0.6);
        gfx.strokePath();
      }
    }
  }

  return { gfx, drawnZoom: zoom };
}

/** Only a zoom changes these — the sea runs the same way every day. */
export function currentsStale(prev: CurrentResult | null, zoom: number): boolean {
  return !prev || prev.drawnZoom !== zoom;
}

export function clearCurrents(prev: CurrentResult | null): void {
  prev?.gfx.destroy();
}
