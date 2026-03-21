/**
 * Shallow water + shore foam renderer.
 *
 * 1. Static turquoise gradient along coastline (shallow water look).
 * 2. Foam patches — small procedural Image sprites placed along the coast
 *    with per-patch alpha + position animation. Viewport-culled.
 *
 * Uses Image objects (not Arc/Circle/Graphics per patch) to avoid artifacts.
 */
import Phaser from "phaser";
import { LANDMASSES } from "../../core/data/geography.ts";
import { chaikinSmooth } from "../../core/services/Geometry.ts";

const SHALLOW_DEPTH = -950;
const FOAM_DEPTH = -949;
const FOAM_SPACING = 12;       // world-px between foam patches along coast
const FOAM_VARIANTS = 8;       // number of different foam textures
const MIN_ZOOM = 3;            // foam hidden below this zoom

/* ── Procedural foam patch texture ── */

function generateFoamTextures(scene: Phaser.Scene): void {
  for (let v = 0; v < FOAM_VARIANTS; v++) {
    const key = `foam_patch_${v}`;
    if (scene.textures.exists(key)) continue;

    // Each patch: irregular elongated white shape, ~24×8 px
    const w = 20 + Math.floor(seededRandom(v * 77 + 1) * 12);  // 20-31
    const h = 5 + Math.floor(seededRandom(v * 77 + 2) * 5);    // 5-9
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;

    // Draw irregular ellipse-ish foam shape
    ctx.fillStyle = "white";
    ctx.beginPath();
    const cx = w / 2, cy = h / 2;
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      // Base ellipse + per-vertex noise
      const noise = 0.7 + seededRandom(v * 100 + i * 13) * 0.6;
      const rx = (w / 2 - 1) * noise;
      const ry = (h / 2 - 1) * noise;
      const px = cx + Math.cos(angle) * rx;
      const py = cy + Math.sin(angle) * ry;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // Soften edges with a slight blur
    ctx.globalAlpha = 0.5;
    ctx.filter = "blur(1px)";
    ctx.drawImage(canvas, 0, 0);

    const tex = scene.textures.addCanvas(key, canvas);
    if (tex) tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}

function seededRandom(seed: number): number {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
  s ^= s >>> 16;
  return (s >>> 0) / 0x100000000;
}

/* ── Foam patch data ── */

interface FoamPatch {
  img: Phaser.GameObjects.Image;
  baseX: number;
  baseY: number;
  /** Outward normal (toward water). */
  nx: number;
  ny: number;
  /** Random phase for animation. */
  phase: number;
  /** Tangent angle (rotation). */
  angle: number;
}

/* ── Renderer ── */

export class ShallowWaterRenderer {
  private gradientGfx: Phaser.GameObjects.Graphics;
  private patches: FoamPatch[] = [];
  private time = 0;

  constructor(scene: Phaser.Scene) {
    // ── 1. Static turquoise gradient ──
    this.gradientGfx = scene.add.graphics();
    this.gradientGfx.setDepth(SHALLOW_DEPTH);

    const allPts: { pts: { x: number; y: number }[]; center: { x: number; y: number } }[] = [];

    for (const lm of LANDMASSES) {
      if (lm.polygon.length < 3) continue;
      const pts = chaikinSmooth(lm.polygon, 2);
      const center = polyCenter(pts);
      allPts.push({ pts, center });

      this.strokePoly(this.gradientGfx, pts, 18, 0x186068, 0.15);
      this.strokePoly(this.gradientGfx, pts, 10, 0x209888, 0.20);
      this.strokePoly(this.gradientGfx, pts, 5, 0x40c8b8, 0.25);
    }

    // ── 2. Foam patches ──
    generateFoamTextures(scene);

    let patchIdx = 0;
    for (const { pts, center } of allPts) {
      // Walk along polygon, place foam patches at regular intervals
      let accum = 0;
      for (let i = 0; i < pts.length; i++) {
        const p0 = pts[i];
        const p1 = pts[(i + 1) % pts.length];
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const segLen = Math.sqrt(dx * dx + dy * dy);
        if (segLen < 0.5) continue;

        accum += segLen;
        if (accum < FOAM_SPACING) continue;
        accum -= FOAM_SPACING;

        // Position: midpoint of this edge
        const mx = (p0.x + p1.x) / 2;
        const my = (p0.y + p1.y) / 2;

        // Tangent and outward normal
        const tx = dx / segLen;
        const ty = dy / segLen;
        let nx = -ty;
        let ny = tx;
        // Ensure normal points outward
        if (nx * (center.x - mx) + ny * (center.y - my) > 0) {
          nx = -nx;
          ny = -ny;
        }

        // Place foam 2-4px outward from coast
        const outDist = 2 + seededRandom(patchIdx * 37) * 2;
        const fx = mx + nx * outDist;
        const fy = my + ny * outDist;

        const variant = patchIdx % FOAM_VARIANTS;
        const key = `foam_patch_${variant}`;
        const img = scene.add.image(fx, fy, key);
        img.setOrigin(0.5, 0.5);
        img.setDepth(FOAM_DEPTH);
        img.setAlpha(0);
        img.setScale(0.25 + seededRandom(patchIdx * 53) * 0.20); // 0.25-0.45

        // Rotate to align with coastline tangent
        const angle = Math.atan2(ty, tx);
        img.setRotation(angle);

        this.patches.push({
          img,
          baseX: fx,
          baseY: fy,
          nx, ny,
          phase: seededRandom(patchIdx * 91) * Math.PI * 2,
          angle,
        });

        patchIdx++;
      }
    }
    console.log(`ShallowWater: ${this.patches.length} foam patches`);
  }

  update(): void {
    this.time += 0.016;
    const cam = this.scene?.cameras?.main;
    if (!cam) return;
    const zoom = cam.zoom;

    // Hide foam below minimum zoom
    if (zoom < MIN_ZOOM) {
      for (const p of this.patches) {
        if (p.img.visible) p.img.setVisible(false);
      }
      return;
    }

    // Viewport culling
    const wv = cam.worldView;
    const margin = 40;
    const viewL = wv.x - margin;
    const viewR = wv.right + margin;
    const viewT = wv.y - margin;
    const viewB = wv.bottom + margin;

    for (const p of this.patches) {
      if (p.baseX < viewL || p.baseX > viewR || p.baseY < viewT || p.baseY > viewB) {
        if (p.img.visible) p.img.setVisible(false);
        continue;
      }

      if (!p.img.visible) p.img.setVisible(true);

      // Animation: alpha pulse + slight position oscillation toward shore
      const wave = Math.sin(this.time * 1.5 + p.phase);
      const alpha = wave > 0 ? wave * wave * 0.6 : 0; // sharp crest, 0-0.6 range
      p.img.setAlpha(alpha);

      // Subtle movement perpendicular to coast (±1.5px)
      const drift = Math.sin(this.time * 0.8 + p.phase * 0.7) * 1.5;
      p.img.setPosition(p.baseX + p.nx * drift, p.baseY + p.ny * drift);
    }
  }

  private get scene(): Phaser.Scene | null {
    return this.gradientGfx?.scene ?? null;
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
    for (const p of this.patches) p.img.destroy();
    this.patches = [];
  }
}

function polyCenter(pts: { x: number; y: number }[]): { x: number; y: number } {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  return { x: cx / pts.length, y: cy / pts.length };
}
