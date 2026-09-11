import Phaser from "phaser";
import { villageList } from "../../core/data/villages.ts";
import { snapToCoast } from "./PortMarkerRenderer.ts";
import { t } from "../../core/i18n/index.ts";
import { txt } from "../ui/textStyle.ts";

/**
 * Native villages on the chart (v0.58.0).
 *
 * Drawn procedurally and deliberately small. Everything the chart carries is
 * either a **world**-sized thing or a **screen**-sized annotation (the v0.30.0
 * rule); a village is a place, so its huts are world-sized — six units across,
 * smaller than the ten a fishing town gets, because it is smaller. The label
 * is a screen-pixel annotation like every town name beside it, and is handed
 * back to `MainMapScene` to be folded into `cityLabels`, where the one loop
 * that scales labels by `1 / zoom` already lives.
 *
 * No flag, no ensign, no faction colour. That absence is the point: this is
 * the only settlement on the chart that belongs to nobody, and a captain
 * should be able to see that from the fact that nothing is flying over it.
 *
 * Positions go through the **same** `snapToCoast` the forty-five towns use, so
 * a village is always on land with water beside it and a ship can always close
 * to hailing distance.
 */

export interface VillageMarkerResult {
  /** Coast-snapped position per village key — what proximity is measured against. */
  villageSafePositions: Map<string, { x: number; y: number }>;
  labels: Array<{ text: Phaser.GameObjects.Text; anchorX: number; anchorY: number; offsetPx: number }>;
  graphics: Phaser.GameObjects.Graphics;
}

/** Thatched roofs seen from above, a cooking fire, and a canoe drawn up. */
function drawVillage(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  // Cleared ground
  g.fillStyle(0xb99a62, 0.18);
  g.fillCircle(x, y, 3.4);

  // Three round thatched roofs around the fire
  const huts: Array<[number, number, number]> = [
    [-1.8, -0.6, 1.5],
    [1.7, -1.0, 1.2],
    [0.4, 1.7, 1.1],
  ];
  for (const [dx, dy, r] of huts) {
    g.fillStyle(0x000000, 0.16);
    g.fillCircle(x + dx + 0.3, y + dy + 0.4, r);
    g.fillStyle(0x7a6b3a, 1);
    g.fillCircle(x + dx, y + dy, r);
    g.fillStyle(0x5f5329, 0.7);
    g.fillCircle(x + dx, y + dy, r * 0.55);
  }

  // The fire in the middle of the compound — the one warm pixel on the chart
  g.fillStyle(0xd08a3a, 0.9);
  g.fillCircle(x, y, 0.5);

  // Canoe drawn up on the sand, pointing away from the huts
  g.fillStyle(0x6b5030, 0.85);
  g.fillEllipse(x - 3.4, y + 2.4, 2.6, 0.9);
}

export function renderVillageMarkers(
  scene: Phaser.Scene,
  landGrid: boolean[][],
): VillageMarkerResult {
  const villageSafePositions = new Map<string, { x: number; y: number }>();
  const labels: VillageMarkerResult["labels"] = [];

  const g = scene.add.graphics();
  // Just under the towns: a village never hides a harbour.
  g.setDepth(499);

  for (const v of villageList()) {
    const pos = snapToCoast(landGrid, v.pos);
    villageSafePositions.set(v.id, pos);
    drawVillage(g, pos.x, pos.y);

    const label = scene.add.text(pos.x, pos.y + 2.5, t(`village.${v.id}.name`), {
      ...txt(11, { bold: false, color: "#e8d8b0" }),
      stroke: "#222222",
      strokeThickness: 3,
      shadow: { offsetX: 1, offsetY: 1, color: "#000000", blur: 2, fill: true, stroke: true },
    });
    label.setOrigin(0.5, 0);
    label.setDepth(502);
    labels.push({ text: label, anchorX: pos.x, anchorY: pos.y + 2.5, offsetPx: 0 });
  }

  return { villageSafePositions, labels, graphics: g };
}
