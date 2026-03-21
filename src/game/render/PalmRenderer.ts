/**
 * Palm forest renderer — tiles a procedural palm forest texture over land areas.
 *
 * Instead of individual palm sprites, generates a 512×512 tileable texture
 * and fills landmass polygons with it using canvas pattern fill.
 * Result is a single Image at land depth.
 *
 * Zoom scaling: visible at zoom 3+, scale adjusts with zoom.
 */
import Phaser from "phaser";
import { LANDMASSES } from "../../core/data/geography.ts";
import { chaikinSmooth } from "../../core/services/Geometry.ts";
import { generatePalmForestTexture } from "./PalmForestTexture.ts";

const PALM_DEPTH = -899; // just above land (-900)

export class PalmRenderer {
  private image: Phaser.GameObjects.Image | null = null;

  constructor(scene: Phaser.Scene, _landGrid: boolean[][]) {
    const mapW = 3200;
    const mapH = 2400;

    // Generate tileable palm forest texture
    const forestTile = generatePalmForestTexture(512, 0.012, 1.0, 42);

    // Create full-map canvas, fill land polygons with forest pattern
    const canvas = document.createElement("canvas");
    canvas.width = mapW;
    canvas.height = mapH;
    const ctx = canvas.getContext("2d")!;

    const pattern = ctx.createPattern(forestTile, "repeat")!;

    for (const lm of LANDMASSES) {
      if (lm.polygon.length < 3) continue;
      const pts = chaikinSmooth(lm.polygon, 2);

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = pattern;
      ctx.fill();
    }

    // Register as Phaser texture
    const key = "__palm_forest";
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, canvas);

    this.image = scene.add.image(mapW / 2, mapH / 2, key);
    this.image.setDisplaySize(mapW, mapH);
    this.image.setOrigin(0.5, 0.5);
    this.image.setDepth(PALM_DEPTH);

    console.log("PalmRenderer: forest texture pattern applied to land");
  }

  update(): void {
    // No per-frame update needed — static texture
  }

  destroy(): void {
    if (this.image) {
      this.image.destroy();
      this.image = null;
    }
  }
}
