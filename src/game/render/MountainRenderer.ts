/**
 * MountainRenderer — paints small hill/mountain icons on land interior to
 * suggest elevation. Uses cartographic style: filled triangle + shadow side,
 * occasional snow cap on the biggest peaks.
 *
 * Stable: positions are derived from a seeded RNG so the layout is deterministic.
 *
 * Visibility: full from `MOUNTAIN_FULL_ZOOM` (2) in, and **dimmed rather than
 * hidden** below it — `MOUNTAIN_FAR_ALPHA` (0.5), because at overview zoom the
 * peaks sit on top of the city dots. Until v0.98.2.0 this line said *"faded out
 * at low zoom, full opacity at zoom >= 4"*, which was wrong twice: 4 is not a
 * threshold this file has, and the peaks are never faded out. The method's own
 * docstring below said the opposite of the header, correctly, for eleven
 * releases.
 */
// Type-only: nothing here touches Phaser's runtime, which is what lets the
// zoom thresholds below be read in a test without a browser (v0.98.2.0).
import type Phaser from "phaser";
import { PORTS } from "../../core/data/ports.ts";

/** Below this the peaks are dimmed; from here in they are drawn in full. */
export const MOUNTAIN_FULL_ZOOM = 2;
/** What they fade to at overview zoom, where they overlap the city dots. */
export const MOUNTAIN_FAR_ALPHA = 0.5;

const CELL = 32;
const MOUNTAIN_DEPTH = 100; // above land/beach/water, below flags/cities/ships
const MIN_COAST_DIST = 1;    // include cells adjacent to coast (more coverage)
const PORT_KEEP_OUT = 60;    // world px around each port — no mountains
const FILL_PROB_PER_CELL = 0.55;

interface Mountain {
  x: number;
  y: number;
  size: number;       // base half-width in world px
  height: number;     // peak height in world px
  hasSnow: boolean;
}

export class MountainRenderer {
  private gfx: Phaser.GameObjects.Graphics;
  private mountains: Mountain[] = [];
  private seed = 31337;

  constructor(scene: Phaser.Scene, landGrid: boolean[][]) {
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(MOUNTAIN_DEPTH);

    const rows = landGrid.length;
    const cols = landGrid[0]?.length ?? 0;

    // BFS coast distance: distance from each land cell to nearest non-land cell.
    // d=0 → coast tile (adjacent to water), d grows toward island interior.
    const dist: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1));
    const queue: [number, number][] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!landGrid[r][c]) continue;
        // Coast: any 4-neighbor is water (or edge)
        const isCoast =
          r === 0 || r === rows - 1 || c === 0 || c === cols - 1 ||
          !landGrid[r - 1][c] || !landGrid[r + 1][c] ||
          !landGrid[r][c - 1] || !landGrid[r][c + 1];
        if (isCoast) {
          dist[r][c] = 0;
          queue.push([r, c]);
        }
      }
    }
    let head = 0;
    while (head < queue.length) {
      const [cr, cc] = queue[head++];
      const nd = dist[cr][cc] + 1;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nr = cr + dr;
        const nc = cc + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (!landGrid[nr][nc]) continue;
        if (dist[nr][nc] === -1 || dist[nr][nc] > nd) {
          dist[nr][nc] = nd;
          queue.push([nr, nc]);
        }
      }
    }

    // Generate mountain positions in interior cells
    const portPositions = Object.values(PORTS).map(p => p.pos);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const d = dist[r][c];
        if (d < MIN_COAST_DIST) continue;
        if (this.rand() > FILL_PROB_PER_CELL) continue;

        const wx = c * CELL + CELL * 0.5 + (this.rand() - 0.5) * CELL * 0.6;
        const wy = r * CELL + CELL * 0.5 + (this.rand() - 0.5) * CELL * 0.6;

        // Skip if too close to a port
        let nearPort = false;
        for (const pp of portPositions) {
          const dx = wx - pp.x;
          const dy = wy - pp.y;
          if (dx * dx + dy * dy < PORT_KEEP_OUT * PORT_KEEP_OUT) {
            nearPort = true;
            break;
          }
        }
        if (nearPort) continue;

        // Size scales with coast distance: deep interior = bigger mountains
        // Base 6px doubles previous values — readable at z4-z12
        const sizeBase = 6 + Math.min(d - MIN_COAST_DIST, 6) * 2.5;
        const size = sizeBase * (0.7 + this.rand() * 0.6);
        const height = size * (1.5 + this.rand() * 0.5);
        const hasSnow = d >= 4 && size > 12 && this.rand() < 0.5;

        this.mountains.push({ x: wx, y: wy, size, height, hasSnow });
      }
    }

    // Sort by y so closer mountains overlap further ones correctly
    this.mountains.sort((a, b) => a.y - b.y);
    console.log(`MountainRenderer: placed ${this.mountains.length} mountains (grid ${rows}×${cols})`);
    this.draw(scene);
  }

  /** Render all mountains. Called once at construction; static thereafter. */
  private draw(_scene: Phaser.Scene): void {
    this.gfx.clear();

    for (const m of this.mountains) {
      // Light side (sun from upper-left) — warm olive/brown
      this.gfx.fillStyle(0x4a4a22, 1);
      this.gfx.beginPath();
      this.gfx.moveTo(m.x - m.size, m.y);
      this.gfx.lineTo(m.x, m.y - m.height);
      this.gfx.lineTo(m.x, m.y);
      this.gfx.closePath();
      this.gfx.fillPath();

      // Shadow side — darker
      this.gfx.fillStyle(0x2e3318, 1);
      this.gfx.beginPath();
      this.gfx.moveTo(m.x, m.y - m.height);
      this.gfx.lineTo(m.x + m.size, m.y);
      this.gfx.lineTo(m.x, m.y);
      this.gfx.closePath();
      this.gfx.fillPath();

      // Outline for cartographic clarity
      this.gfx.lineStyle(0.6, 0x1a1a0e, 0.7);
      this.gfx.beginPath();
      this.gfx.moveTo(m.x - m.size, m.y);
      this.gfx.lineTo(m.x, m.y - m.height);
      this.gfx.lineTo(m.x + m.size, m.y);
      this.gfx.strokePath();

      // Snow cap on tall mountains
      if (m.hasSnow) {
        const capH = m.height * 0.25;
        const capW = m.size * 0.25;
        this.gfx.fillStyle(0xf5f0e5, 1);
        this.gfx.beginPath();
        this.gfx.moveTo(m.x - capW, m.y - m.height + capH);
        this.gfx.lineTo(m.x, m.y - m.height);
        this.gfx.lineTo(m.x + capW, m.y - m.height + capH);
        this.gfx.closePath();
        this.gfx.fillPath();
      }
    }
  }

  /** Visible everywhere; only dimmed at overview zoom. See the header. */
  update(zoom: number): void {
    this.gfx.setAlpha(zoom < MOUNTAIN_FULL_ZOOM ? MOUNTAIN_FAR_ALPHA : 1);
  }

  destroy(): void {
    this.gfx.destroy();
    this.mountains = [];
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}
