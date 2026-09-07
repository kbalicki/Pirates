/**
 * Shallow water renderer — blurred canvas gradient + animated shimmer.
 *
 * NO polygon strokes. Instead:
 * 1. Paint turquoise pixels on a 400×300 canvas at water cells near coast.
 * 2. Apply blur(4px) for natural, soft gradient of varying width.
 * 3. Overlay as a single Image scaled to map size.
 * 4. Shimmer: 4 noise frames cycled for animation.
 *
 * Total: 5 Images (1 gradient + 4 shimmer). Zero Graphics objects.
 *
 * This file was finished and **never constructed** until v0.48.0 — a complete
 * renderer for water the simulation had no opinion about. Now that a deep hull
 * grounds in it, it is drawn, and it takes the coast-distance field from
 * `SeaDepth` rather than computing its own: the shelf on the chart and the
 * soundings under the keel are the same numbers, which is the only way the
 * picture can be trusted.
 */
import Phaser from "phaser";

const SHALLOW_DEPTH = -950;
const SHIMMER_DEPTH = -948;
const SHIMMER_FRAMES = 4;
const FRAME_DURATION = 400; // ms per shimmer frame
const CELL = 32;

export class ShallowWaterRenderer {
  private gradientImage: Phaser.GameObjects.Image | null = null;
  private shimmerImages: Phaser.GameObjects.Image[] = [];
  private currentFrame = 0;
  private frameTimer = 0;

  constructor(scene: Phaser.Scene, waterDist: number[][]) {
    const gridRows = waterDist.length;
    const gridCols = waterDist[0]?.length ?? 0;
    const mapW = gridCols * CELL;
    const mapH = gridRows * CELL;

    // ── 2. Blurred turquoise gradient canvas ──
    const SCALE = 4; // pixels per grid cell → 400×300
    const cw = gridCols * SCALE;
    const ch = gridRows * SCALE;

    const gradCanvas = document.createElement("canvas");
    gradCanvas.width = cw;
    gradCanvas.height = ch;
    const gctx = gradCanvas.getContext("2d")!;

    // Paint turquoise in shore zone water cells
    for (let gr = 0; gr < gridRows; gr++) {
      for (let gc = 0; gc < gridCols; gc++) {
        const dist = waterDist[gr][gc];
        if (dist < 1 || dist > 4) continue;

        let color: string;
        if (dist === 1) color = "rgba(30, 160, 150, 0.50)";
        else if (dist === 2) color = "rgba(25, 140, 135, 0.30)";
        else if (dist === 3) color = "rgba(20, 120, 120, 0.15)";
        else color = "rgba(18, 100, 110, 0.07)";

        gctx.fillStyle = color;
        gctx.fillRect(gc * SCALE, gr * SCALE, SCALE, SCALE);
      }
    }

    // Apply blur for soft natural gradient
    const blurred = document.createElement("canvas");
    blurred.width = cw;
    blurred.height = ch;
    const bctx = blurred.getContext("2d")!;
    // Tightened in v0.48.0. One canvas pixel is eight world units, so the old
    // 5+3 blur spread the shelf across roughly 300 world units — four times the
    // water that actually costs a hull anything. The picture has to be the
    // mechanic or it is worse than no picture at all.
    bctx.filter = "blur(2px)";
    bctx.drawImage(gradCanvas, 0, 0);
    bctx.filter = "blur(1px)";
    bctx.drawImage(blurred, 0, 0);

    const gradKey = "shallow_water_grad";
    if (scene.textures.exists(gradKey)) scene.textures.remove(gradKey);
    const gradTex = scene.textures.addCanvas(gradKey, blurred);
    if (gradTex) gradTex.setFilter(Phaser.Textures.FilterMode.LINEAR);

    this.gradientImage = scene.add.image(mapW / 2, mapH / 2, gradKey);
    this.gradientImage.setDisplaySize(mapW, mapH);
    this.gradientImage.setOrigin(0.5, 0.5);
    this.gradientImage.setDepth(SHALLOW_DEPTH);

    // ── 3. Shimmer noise frames ──
    for (let f = 0; f < SHIMMER_FRAMES; f++) {
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d")!;

      let seed = f * 7919 + 54321;
      const rng = () => {
        seed = (seed * 16807 + 0) % 2147483647;
        return seed / 2147483647;
      };

      for (let gr = 0; gr < gridRows; gr++) {
        for (let gc = 0; gc < gridCols; gc++) {
          const dist = waterDist[gr][gc];
          if (dist < 1 || dist > 3) continue;

          const dotCount = dist === 1 ? 5 : dist === 2 ? 3 : 1;

          for (let d = 0; d < dotCount; d++) {
            const px = gc * SCALE + rng() * SCALE;
            const py = gr * SCALE + rng() * SCALE;
            const alpha = (dist === 1 ? 0.7 : dist === 2 ? 0.4 : 0.2) * (0.4 + rng() * 0.6);
            const isCyan = rng() > 0.4;

            ctx.fillStyle = isCyan
              ? `rgba(180, 240, 245, ${alpha})`
              : `rgba(255, 255, 255, ${alpha})`;

            const size = 0.8 + rng() * 1.5;
            ctx.beginPath();
            ctx.arc(px, py, size / 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Light blur to blend dots
      const blurredShimmer = document.createElement("canvas");
      blurredShimmer.width = cw;
      blurredShimmer.height = ch;
      const sctx = blurredShimmer.getContext("2d")!;
      sctx.filter = "blur(1px)";
      sctx.drawImage(canvas, 0, 0);

      const key = `shimmer_frame_${f}`;
      if (scene.textures.exists(key)) scene.textures.remove(key);
      const tex = scene.textures.addCanvas(key, blurredShimmer);
      if (tex) tex.setFilter(Phaser.Textures.FilterMode.LINEAR);

      const img = scene.add.image(mapW / 2, mapH / 2, key);
      img.setDisplaySize(mapW, mapH);
      img.setOrigin(0.5, 0.5);
      img.setDepth(SHIMMER_DEPTH);
      img.setVisible(f === 0);

      this.shimmerImages.push(img);
    }

    console.log(`ShallowWater: blurred gradient (${cw}×${ch}) + ${SHIMMER_FRAMES} shimmer frames`);
  }

  update(): void {
    this.frameTimer += 16;
    if (this.frameTimer >= FRAME_DURATION) {
      this.frameTimer -= FRAME_DURATION;
      this.shimmerImages[this.currentFrame].setVisible(false);
      this.currentFrame = (this.currentFrame + 1) % SHIMMER_FRAMES;
      this.shimmerImages[this.currentFrame].setVisible(true);
    }
  }

  destroy(): void {
    if (this.gradientImage) this.gradientImage.destroy();
    for (const img of this.shimmerImages) img.destroy();
    this.shimmerImages = [];
  }
}
