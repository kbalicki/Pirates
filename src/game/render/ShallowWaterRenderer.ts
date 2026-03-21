/**
 * Shallow water / shore foam renderer.
 *
 * 1. Static turquoise gradient along coastline polygons (shallow water)
 * 2. Animated segmented foam — short dashed white lines that "roll"
 *    toward shore with staggered phases.
 *
 * All Graphics drawn ONCE at init. Per-frame only alpha changes.
 * Depth between water (-997) and land (-900).
 */
import Phaser from "phaser";
import { LANDMASSES } from "../../core/data/geography.ts";
import { chaikinSmooth } from "../../core/services/Geometry.ts";

const SHALLOW_DEPTH = -950;
/** Number of foam layers (at different distances from coast). */
const WAVE_BANDS = 4;
/** How many phase groups per band — segments in same group pulse together. */
const PHASE_GROUPS = 6;
/** Segment length in world units along the coastline. */
const SEG_LEN = 8;

interface CoastSegment {
  x1: number; y1: number;
  x2: number; y2: number;
  /** Outward normal (toward water). */
  nx: number; ny: number;
  /** Phase group for animation. */
  group: number;
}

export class ShallowWaterRenderer {
  private gradientGfx: Phaser.GameObjects.Graphics;
  /** foamGfx[band][group] — one Graphics per (band, phaseGroup) combination. */
  private foamGfx: Phaser.GameObjects.Graphics[][] = [];
  private time = 0;

  constructor(scene: Phaser.Scene) {
    // ── 1. Static turquoise gradient ──
    this.gradientGfx = scene.add.graphics();
    this.gradientGfx.setDepth(SHALLOW_DEPTH);

    for (const lm of LANDMASSES) {
      if (lm.polygon.length < 3) continue;
      const pts = chaikinSmooth(lm.polygon, 2);
      this.strokePoly(this.gradientGfx, pts, 18, 0x186068, 0.15);
      this.strokePoly(this.gradientGfx, pts, 10, 0x209888, 0.20);
      this.strokePoly(this.gradientGfx, pts, 5, 0x40c8b8, 0.25);
    }

    // ── 2. Segmented foam ──
    // Collect all coastline segments with outward normals
    const allSegments: CoastSegment[] = [];
    for (const lm of LANDMASSES) {
      if (lm.polygon.length < 3) continue;
      const pts = chaikinSmooth(lm.polygon, 2);
      const center = this.polyCenter(pts);

      // Walk along polygon, emit segments of ~SEG_LEN
      let accumulated = 0;
      let segStart = pts[0];
      let segIdx = 0;

      for (let i = 1; i <= pts.length; i++) {
        const p = pts[i % pts.length];
        const dx = p.x - segStart.x;
        const dy = p.y - segStart.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        accumulated += d;

        if (accumulated >= SEG_LEN) {
          // Emit this segment
          const mx = (segStart.x + p.x) / 2;
          const my = (segStart.y + p.y) / 2;
          // Outward normal: perpendicular to segment, pointing away from center
          const len = d || 1;
          let nx = -dy / len;
          let ny = dx / len;
          // Ensure normal points outward (away from polygon center)
          const toCenterX = center.x - mx;
          const toCenterY = center.y - my;
          if (nx * toCenterX + ny * toCenterY > 0) {
            nx = -nx;
            ny = -ny;
          }

          allSegments.push({
            x1: segStart.x, y1: segStart.y,
            x2: p.x, y2: p.y,
            nx, ny,
            group: segIdx % PHASE_GROUPS,
          });

          segStart = p;
          accumulated = 0;
          segIdx++;
        } else {
          segStart = p;
        }
      }
    }

    // Create Graphics objects: one per (band, phaseGroup)
    // band 0 = right at coast, band 3 = furthest into water
    for (let band = 0; band < WAVE_BANDS; band++) {
      this.foamGfx[band] = [];
      const offset = band * 1.8; // distance outward from coast
      const lineW = band === 0 ? 1.2 : band === 1 ? 1.8 : band === 2 ? 1.4 : 0.8;

      for (let group = 0; group < PHASE_GROUPS; group++) {
        const gfx = scene.add.graphics();
        gfx.setDepth(SHALLOW_DEPTH + 1 + band);
        gfx.lineStyle(lineW, 0xffffff, 0.7);
        gfx.beginPath();

        // Draw all segments belonging to this group, offset by band distance
        for (const seg of allSegments) {
          if (seg.group !== group) continue;
          gfx.moveTo(seg.x1 + seg.nx * offset, seg.y1 + seg.ny * offset);
          gfx.lineTo(seg.x2 + seg.nx * offset, seg.y2 + seg.ny * offset);
        }

        gfx.strokePath();
        gfx.setAlpha(0);
        this.foamGfx[band].push(gfx);
      }
    }
  }

  update(): void {
    this.time += 0.016;

    for (let band = 0; band < WAVE_BANDS; band++) {
      for (let group = 0; group < PHASE_GROUPS; group++) {
        // Wave rolls inward: outer bands (higher band#) peak first
        // Each group has a random-ish phase offset
        const bandPhase = (WAVE_BANDS - 1 - band) * 0.6; // outer peaks first
        const groupPhase = group * (Math.PI * 2 / PHASE_GROUPS);
        const phase = this.time * 1.8 + bandPhase + groupPhase;

        // Sharp peak: use pow to make the wave crest narrow
        const raw = Math.sin(phase);
        const wave = raw > 0 ? Math.pow(raw, 2) : 0;

        // Outer bands are fainter
        const bandAlpha = band === 0 ? 0.45 : band === 1 ? 0.35 : band === 2 ? 0.25 : 0.12;
        this.foamGfx[band][group].setAlpha(wave * bandAlpha);
      }
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
    for (const band of this.foamGfx) {
      for (const gfx of band) gfx.destroy();
    }
    this.foamGfx = [];
  }
}
