import Phaser from "phaser";
import {
  hullCondition,
  rigCondition,
  type HullCondition,
  type RigCondition,
} from "../../core/systems/DamageSystem.ts";

/**
 * ShipDamageOverlay — draws battle damage onto a ship sprite procedurally.
 *
 * v0.9.9 gave hull and rigging named condition stages, but the ship still
 * looked identical at 90 % and at 20 %: the only cues were the two bars and,
 * below 25 %, a smoke puff. The obvious fix was a set of AI-generated damage
 * frames; that was tried in the LoRA v2 pass and failed outright — every "torn
 * sails" or "broken mast" prompt came back as an untouched ship, because the
 * model has no notion of a damaged version of a thing it only ever saw intact.
 * Four generated frames, four clean ships.
 *
 * Drawing it instead is cheaper and more honest: the marks come from the same
 * numbers the engine steers by, so they cannot drift out of sync with the stage
 * the ship is actually in.
 *
 * ## Why the marks are placed in screen space, not rotated by heading
 *
 * `sailship.png` is a 3/4 view, not a true top-down: in every one of its eight
 * frames the hull sits in the lower part of the cell and the canvas fills the
 * upper part. Rotating the marks by heading — the first thing this class did —
 * put shot holes in the rigging on half the headings and in empty padding on
 * the rest. Since the artwork's own orientation is fixed regardless of which
 * way the ship is pointing, so is the damage: holes low, tears high, spar over
 * the side and down.
 *
 * ## What gets drawn
 *
 *   leaking     two dark shot holes along the hull
 *   crippled    four holes, plus notches bitten out of the canvas
 *   foundering  six holes, ragged canvas, and a waterline stain
 *   torn rig    notches in the canvas
 *   dismasted   a spar over the side, dragging
 *
 * Positions are jittered from a hash of the ship's id, so a given ship's damage
 * stays put from frame to frame instead of crawling, and two ships in the same
 * battle are marked differently.
 */
export class ShipDamageOverlay {
  private g: Phaser.GameObjects.Graphics;
  /** Stable per-ship jitter, 0..1. */
  private jitter: number[];

  constructor(scene: Phaser.Scene, shipId: string, depth = 55) {
    this.g = scene.add.graphics().setDepth(depth);
    this.jitter = hashToUnitValues(shipId, 6);
  }

  /**
   * Redraw for the current state. `radius` is roughly the on-screen half-width
   * of the sprite, so the marks scale with whatever it is scaled to.
   */
  draw(
    sx: number, sy: number,
    ship: { hullHp: number; hullMax: number; sailsHp: number; sailsMax: number } | undefined,
    radius: number,
  ): void {
    this.g.clear();
    if (!ship) return;

    const hull = hullCondition(ship.hullHp, ship.hullMax);
    const rig = rigCondition(ship.sailsHp, ship.sailsMax);
    if (hull === "sunk") return; // the sinking tween owns the sprite by then
    if (hull === "sound" && rig === "full") return;

    this.drawHullDamage(hull, sx, sy, radius);
    this.drawRigDamage(rig, sx, sy, radius);
    if (rig === "dismasted") this.drawTrailingSpar(sx, sy, radius);
  }

  /** Shot holes along the hull — the lower band of the sprite. */
  private drawHullDamage(hull: HullCondition, sx: number, sy: number, radius: number): void {
    const holes = hull === "leaking" ? 2 : hull === "crippled" ? 4 : hull === "foundering" ? 6 : 0;
    if (holes === 0) return;

    for (let i = 0; i < holes; i++) {
      const j = this.jitter[i % this.jitter.length];
      const x = sx + (-0.42 + ((i * 0.29 + j * 0.35) % 0.85)) * radius;
      const y = sy + (0.18 + j * 0.20) * radius;
      const size = Math.max(1.1, radius * (0.055 + j * 0.03));
      this.g.fillStyle(0x1a1008, 0.9).fillCircle(x, y, size);
      this.g.fillStyle(0x000000, 0.55).fillCircle(x + size * 0.25, y + size * 0.2, size * 0.5);
    }

    // A foundering hull sits low enough to stain along the waterline.
    if (hull === "foundering") {
      const y = sy + radius * 0.42;
      this.g.lineStyle(Math.max(1.5, radius * 0.11), 0x123044, 0.5)
        .lineBetween(sx - radius * 0.5, y, sx + radius * 0.5, y);
    }
  }

  /** Notches bitten out of the canvas — chain-shot damage, read at a glance. */
  private drawRigDamage(rig: RigCondition, sx: number, sy: number, radius: number): void {
    const tears = rig === "torn" ? 2 : rig === "tattered" ? 4 : rig === "dismasted" ? 5 : 0;
    if (tears === 0) return;

    for (let i = 0; i < tears; i++) {
      const j = this.jitter[(i + 2) % this.jitter.length];
      const x = sx + (-0.30 + ((i * 0.24 + j * 0.28) % 0.62)) * radius;
      const y = sy + (-0.34 + j * 0.28) * radius;
      const w = Math.max(1.4, radius * (0.075 + j * 0.045));
      // A wedge of shadow reads as a hole in the canvas at sprite scale.
      this.g.fillStyle(0x2b2a26, 0.75);
      this.g.beginPath();
      this.g.moveTo(x, y - w);
      this.g.lineTo(x + w * 0.7, y + w * 0.55);
      this.g.lineTo(x - w * 0.7, y + w * 0.55);
      this.g.closePath();
      this.g.fillPath();
    }
  }

  /** A spar over the side, dragging. The visual for "this ship is not leaving". */
  private drawTrailingSpar(sx: number, sy: number, radius: number): void {
    const side = this.jitter[0] > 0.5 ? 1 : -1;
    const rootX = sx + side * radius * 0.10;
    const rootY = sy - radius * 0.10;
    const tipX = sx + side * radius * 0.80;
    const tipY = sy + radius * 0.40;

    this.g.lineStyle(Math.max(1.4, radius * 0.075), 0x4a3a26, 0.95).lineBetween(rootX, rootY, tipX, tipY);
    // Slack canvas trailing off the end of it, not a ball floating above deck.
    this.g.lineStyle(Math.max(1.2, radius * 0.05), 0xd8d2c4, 0.55)
      .lineBetween(tipX, tipY, tipX - side * radius * 0.16, tipY + radius * 0.14);
  }

  setVisible(visible: boolean): void {
    this.g.setVisible(visible);
  }

  destroy(): void {
    this.g.destroy();
  }
}

/**
 * Deterministic 0..1 values from a string.
 *
 * A plain FNV-1a walk, mixed once per output so consecutive values are not
 * correlated: the point is that a ship's holes stay put across frames and
 * differ between ships, not cryptographic quality.
 */
function hashToUnitValues(seed: string, count: number): number[] {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h ^= h >>> 15;
    h = Math.imul(h, 0x2545f491) >>> 0;
    out.push((h >>> 8) / 0xffffff);
  }
  return out;
}
