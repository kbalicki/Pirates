/**
 * Shallow water renderer — turquoise gradient + animated shimmer.
 *
 * 1. Static turquoise gradient along coastlines (Graphics strokes).
 * 2. Animated noise shimmer: 4 pre-rendered canvas frames cycled every ~350ms.
 *    Each frame has random white/cyan dots in the "shore zone" (water near land).
 *    Canvas is 200×150 (2× grid resolution) scaled to 3200×2400 with LINEAR filtering.
 *
 * Total objects: 1 Graphics + 4 Images. No per-pixel per-frame updates.
 */
import Phaser from "phaser";
import { LANDMASSES } from "../../core/data/geography.ts";
import { chaikinSmooth } from "../../core/services/Geometry.ts";

const SHALLOW_DEPTH = -950;
const SHIMMER_DEPTH = -948;
const SHIMMER_FRAMES = 4;
const FRAME_DURATION = 350; // ms per shimmer frame
const CANVAS_SCALE = 2;     // pixels per grid cell (100×75 grid → 200×150 canvas)
const CELL = 32;

export class ShallowWaterRenderer {
  private gradientGfx: Phaser.GameObjects.Graphics;
  private shimmerImages: Phaser.GameObjects.Image[] = [];
  private currentFrame = 0;
  private frameTimer = 0;

  constructor(scene: Phaser.Scene, landGrid: boolean[][]) {
    const gridRows = landGrid.length;
    const gridCols = landGrid[0]?.length ?? 0;

    // ── 1. Static turquoise gradient ──
    this.gradientGfx = scene.add.graphics();
    this.gradientGfx.setDepth(SHALLOW_DEPTH);

    for (const lm of LANDMASSES) {
      if (lm.polygon.length < 3) continue;
      const pts = chaikinSmooth(lm.polygon, 2);
      this.strokePoly(this.gradientGfx, pts, 18, 0x186068, 0.12);
      this.strokePoly(this.gradientGfx, pts, 10, 0x209888, 0.16);
      this.strokePoly(this.gradientGfx, pts, 5, 0x40c8b8, 0.20);
    }

    // ── 2. Compute water-coast distance (BFS from land into water) ──
    const waterDist = this.buildWaterCoastDist(landGrid, gridRows, gridCols);

    // ── 3. Generate shimmer frames ──
    const cw = gridCols * CANVAS_SCALE;
    const ch = gridRows * CANVAS_SCALE;
    const mapW = gridCols * CELL;
    const mapH = gridRows * CELL;

    for (let f = 0; f < SHIMMER_FRAMES; f++) {
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d")!;

      // Seed per frame for different noise patterns
      let seed = f * 9973 + 12345;
      const rng = () => {
        seed = (seed * 16807 + 0) % 2147483647;
        return seed / 2147483647;
      };

      // Paint noise in shore zone
      for (let gr = 0; gr < gridRows; gr++) {
        for (let gc = 0; gc < gridCols; gc++) {
          const dist = waterDist[gr][gc];
          if (dist < 1 || dist > 4) continue; // only shore zone water cells

          // More noise closer to coast
          const intensity = dist === 1 ? 0.6 : dist === 2 ? 0.35 : dist === 3 ? 0.15 : 0.06;
          const dotCount = dist === 1 ? 3 : dist === 2 ? 2 : 1;

          for (let d = 0; d < dotCount; d++) {
            const px = gc * CANVAS_SCALE + rng() * CANVAS_SCALE;
            const py = gr * CANVAS_SCALE + rng() * CANVAS_SCALE;

            // White or light cyan
            const isCyan = rng() > 0.5;
            const alpha = intensity * (0.3 + rng() * 0.7);

            if (isCyan) {
              ctx.fillStyle = `rgba(140, 220, 230, ${alpha})`;
            } else {
              ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            }

            // Draw a small dot (1-2 canvas pixels)
            const size = 0.5 + rng() * 1.0;
            ctx.fillRect(px, py, size, size);
          }
        }
      }

      // Register as Phaser texture
      const key = `shimmer_frame_${f}`;
      if (scene.textures.exists(key)) scene.textures.remove(key);
      const tex = scene.textures.addCanvas(key, canvas);
      if (tex) tex.setFilter(Phaser.Textures.FilterMode.LINEAR);

      // Create Image scaled to full map
      const img = scene.add.image(mapW / 2, mapH / 2, key);
      img.setDisplaySize(mapW, mapH);
      img.setOrigin(0.5, 0.5);
      img.setDepth(SHIMMER_DEPTH);
      img.setVisible(f === 0);

      this.shimmerImages.push(img);
    }

    console.log(`ShallowWater: gradient + ${SHIMMER_FRAMES} shimmer frames (${cw}×${ch})`);
  }

  update(): void {
    this.frameTimer += 16; // ~60fps
    if (this.frameTimer >= FRAME_DURATION) {
      this.frameTimer -= FRAME_DURATION;

      // Hide current frame, show next
      this.shimmerImages[this.currentFrame].setVisible(false);
      this.currentFrame = (this.currentFrame + 1) % SHIMMER_FRAMES;
      this.shimmerImages[this.currentFrame].setVisible(true);
    }
  }

  /**
   * BFS from land cells outward into water.
   * Returns grid where: land = 0, water adjacent to land = 1, etc.
   */
  private buildWaterCoastDist(landGrid: boolean[][], rows: number, cols: number): number[][] {
    const dist: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(999));
    const queue: [number, number][] = [];

    // Seed: all land cells = 0
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (landGrid[r][c]) {
          dist[r][c] = 0;
          queue.push([r, c]);
        }
      }
    }

    // BFS outward into water
    let head = 0;
    while (head < queue.length) {
      const [cr, cc] = queue[head++];
      const nd = dist[cr][cc] + 1;
      if (nd > 5) continue;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nr = cr + dr, nc = cc + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (dist[nr][nc] <= nd) continue;
        dist[nr][nc] = nd;
        queue.push([nr, nc]);
      }
    }

    return dist;
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

  destroy(): void {
    this.gradientGfx.destroy();
    for (const img of this.shimmerImages) img.destroy();
    this.shimmerImages = [];
  }
}
