/**
 * Animated shore waves — white foam lines breaking on coastlines.
 * Visible at zoom in (>5), fade at medium zoom (3-5), invisible at far zoom (<3).
 * Uses coastDist grid to find water tiles adjacent to land.
 * Renders small animated white arcs along the shore.
 *
 * Separate module — does not affect other renderers.
 */
import Phaser from "phaser";

const WAVE_DEPTH = -800;
const CELL = 32;

interface ShoreWave {
  arc: Phaser.GameObjects.Arc;
  baseX: number;
  baseY: number;
  phase: number;
  size: number;
}

export class ShoreWaveRenderer {
  private scene: Phaser.Scene;
  private waves: ShoreWave[] = [];
  private time = 0;

  constructor(scene: Phaser.Scene, landGrid: boolean[][]) {
    this.scene = scene;

    const rows = landGrid.length;
    const cols = landGrid[0]?.length ?? 0;
    let shoreCount = 0;

    // Find water cells adjacent to land
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        if (landGrid[r][c]) continue;

        const hasLandNeighbor =
          landGrid[r - 1][c] || landGrid[r + 1][c] ||
          landGrid[r][c - 1] || landGrid[r][c + 1];

        if (!hasLandNeighbor) continue;

        // Shore cell found — create waves
        const count = 2 + (((r * 7 + c * 13) % 3 === 0) ? 1 : 0);
        for (let i = 0; i < count; i++) {
          const seed1 = Math.sin(r * 127.1 + c * 311.7 + i * 53.3) * 43758.5453;
          const seed2 = Math.sin(r * 269.5 + c * 183.3 + i * 97.1) * 28461.7231;
          const px = c * CELL + (seed1 - Math.floor(seed1)) * CELL;
          const py = r * CELL + (seed2 - Math.floor(seed2)) * CELL;
          const size = 1.5 + (seed1 - Math.floor(seed1)) * 1.5;

          const arc = scene.add.circle(px, py, size, 0xffffff, 0);
          arc.setStrokeStyle(0.8, 0xffffff, 0.4);
          arc.setDepth(WAVE_DEPTH);
          arc.setVisible(false);

          this.waves.push({ arc, baseX: px, baseY: py, phase: (seed1 - Math.floor(seed1)) * Math.PI * 2, size });
          shoreCount++;
        }
      }
    }
    console.log(`ShoreWaves: created ${shoreCount} wave arcs from ${rows}x${cols} grid`);
  }

  update(): void {
    this.time += 0.016;
    const cam = this.scene.cameras.main;

    // Visible at zoom 5+, fade 3-5, invisible below 3
    const fadeStart = 3, fadeFull = 5;
    const visibility = cam.zoom < fadeStart ? 0 :
      cam.zoom < fadeFull ? (cam.zoom - fadeStart) / (fadeFull - fadeStart) : 1;

    if (visibility < 0.01) {
      for (const w of this.waves) w.arc.setVisible(false);
      return;
    }

    // Only update near camera — use world coords
    // Use worldView for correct viewport bounds (scrollX/scrollY has origin offset)
    const wv = cam.worldView;
    const margin = 200;
    const viewL = wv.x - margin;
    const viewR = wv.right + margin;
    const viewT = wv.y - margin;
    const viewB = wv.bottom + margin;

    for (const w of this.waves) {
      if (w.baseX < viewL || w.baseX > viewR || w.baseY < viewT || w.baseY > viewB) {
        w.arc.setVisible(false);
        continue;
      }

      w.arc.setVisible(true);

      // Pulsing animation: foam appears and fades in waves
      const cycle = (this.time * 1.5 + w.phase) % (Math.PI * 2);
      const pulse = Math.max(0, Math.sin(cycle));
      const alpha = pulse * 0.3 * visibility;

      w.arc.setStrokeStyle(0.8, 0xffffff, alpha * 2);
      w.arc.setFillStyle(0xffffff, alpha);

      // Slight wobble toward/away from shore
      const wobbleX = Math.sin(this.time * 1.2 + w.phase) * 0.6;
      const wobbleY = Math.cos(this.time * 0.9 + w.phase * 1.3) * 0.4;
      w.arc.setPosition(w.baseX + wobbleX, w.baseY + wobbleY);

      // Scale with visibility
      w.arc.setScale(0.6 + visibility * 0.4);
    }
  }

  destroy(): void {
    for (const w of this.waves) w.arc.destroy();
    this.waves = [];
  }
}
