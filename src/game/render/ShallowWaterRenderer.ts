/**
 * Shallow water / shore foam renderer.
 *
 * Two parts:
 * 1. Static turquoise gradient along coastline (shallow water look)
 * 2. Animated white foam lines that pulse in/out (wave effect)
 *
 * All Graphics objects are drawn ONCE at init. Per-frame only alpha changes.
 * Depth sits between water layers (-997) and land (-900).
 */
import Phaser from "phaser";
import { LANDMASSES } from "../../core/data/geography.ts";
import { chaikinSmooth } from "../../core/services/Geometry.ts";

const SHALLOW_DEPTH = -950;
const FOAM_LAYERS = 3;

export class ShallowWaterRenderer {
  private gradientGfx: Phaser.GameObjects.Graphics;
  private foamGfx: Phaser.GameObjects.Graphics[] = [];
  private time = 0;

  constructor(scene: Phaser.Scene) {
    // 1. Static turquoise gradient (shallow water)
    this.gradientGfx = scene.add.graphics();
    this.gradientGfx.setDepth(SHALLOW_DEPTH);

    for (const lm of LANDMASSES) {
      if (lm.polygon.length < 3) continue;
      const pts = chaikinSmooth(lm.polygon, 2);

      // Wide outer glow
      this.strokePoly(this.gradientGfx, pts, 18, 0x186068, 0.15);
      // Medium band
      this.strokePoly(this.gradientGfx, pts, 10, 0x209888, 0.20);
      // Narrow inner band
      this.strokePoly(this.gradientGfx, pts, 5, 0x40c8b8, 0.25);
    }

    // 2. Animated foam lines — 3 layers at different distances from coast
    // Each drawn once, alpha animated per-frame
    // Foam layers: draw white strokes at different offsets outward from coast
    const foamWidths = [2.0, 3.0, 2.0];
    // Offsets: move OUTWARD from coast into water (negative = outward)
    const foamScales = [0, -0.003, -0.007];
    for (let i = 0; i < FOAM_LAYERS; i++) {
      const gfx = scene.add.graphics();
      gfx.setDepth(SHALLOW_DEPTH + 1 + i);

      for (const lm of LANDMASSES) {
        if (lm.polygon.length < 3) continue;
        const pts = chaikinSmooth(lm.polygon, 2);

        // Offset points outward from polygon center for each layer
        const scale = foamScales[i];
        if (scale !== 0) {
          const center = this.polyCenter(pts);
          const offsetPts = pts.map(p => ({
            x: p.x + (center.x - p.x) * scale,
            y: p.y + (center.y - p.y) * scale,
          }));
          this.strokePoly(gfx, offsetPts, foamWidths[i], 0xffffff, 0.6);
        } else {
          this.strokePoly(gfx, pts, foamWidths[i], 0xffffff, 0.6);
        }
      }

      gfx.setAlpha(0);
      this.foamGfx.push(gfx);
    }
  }

  update(): void {
    this.time += 0.016;

    // Animate foam layers with offset sine waves
    for (let i = 0; i < this.foamGfx.length; i++) {
      const phase = this.time * 1.2 + i * (Math.PI * 2 / FOAM_LAYERS);
      // Sine wave: 0 to 0.5 alpha range, each layer offset
      const wave = Math.max(0, Math.sin(phase));
      this.foamGfx[i].setAlpha(wave * 0.5);
    }
  }

  private strokePoly(
    gfx: Phaser.GameObjects.Graphics,
    pts: { x: number; y: number }[],
    width: number,
    color: number,
    alpha: number,
  ): void {
    gfx.lineStyle(width, color, alpha);
    gfx.beginPath();
    gfx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      gfx.lineTo(pts[i].x, pts[i].y);
    }
    gfx.closePath();
    gfx.strokePath();
  }

  private polyCenter(pts: { x: number; y: number }[]): { x: number; y: number } {
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p.x; cy += p.y; }
    return { x: cx / pts.length, y: cy / pts.length };
  }

  destroy(): void {
    this.gradientGfx.destroy();
    for (const gfx of this.foamGfx) gfx.destroy();
    this.foamGfx = [];
  }
}
