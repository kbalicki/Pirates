import Phaser from "phaser";
import { UI_FONT, TEXT_RES } from "../ui/textStyle.ts";

const COMPASS_SIZE = 80;
const COMPASS_MARGIN = 10;
const COMPASS_RADIUS = 30;
const BG_RADIUS = 38;

const CARDINAL_TICK_LEN = 5;
const DIAGONAL_TICK_LEN = 3;

export class WindCompassRenderer {
  private baseGraphics: Phaser.GameObjects.Graphics;
  private arrowGraphics: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private windLabel: Phaser.GameObjects.Text;

  /** Screen-space center of the compass. */
  private cx: number;
  private cy: number;

  constructor(scene: Phaser.Scene) {
    const cam = scene.cameras.main;
    this.cx = COMPASS_MARGIN + COMPASS_SIZE / 2;
    this.cy = cam.height - COMPASS_MARGIN - COMPASS_SIZE / 2;

    // --- Static base (drawn once) ---
    this.baseGraphics = scene.add.graphics();
    this.baseGraphics.setScrollFactor(0);
    this.baseGraphics.setDepth(9000);

    // Semi-transparent dark circle background
    this.baseGraphics.fillStyle(0x001133, 0.7);
    this.baseGraphics.fillCircle(this.cx, this.cy, BG_RADIUS);

    // Compass ring stroke
    this.baseGraphics.lineStyle(1, 0x4488aa, 0.8);
    this.baseGraphics.strokeCircle(this.cx, this.cy, COMPASS_RADIUS);

    // 8 tick marks: N, NE, E, SE, S, SW, W, NW
    // Heading convention: 0=N, increases clockwise
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4; // 0, PI/4, PI/2, ...
      const isCardinal = i % 2 === 0;
      const tickLen = isCardinal ? CARDINAL_TICK_LEN : DIAGONAL_TICK_LEN;

      const innerR = COMPASS_RADIUS - tickLen;
      const outerR = COMPASS_RADIUS;

      // Heading convention: angle 0 = North (up), clockwise
      const sx = Math.sin(angle);
      const sy = -Math.cos(angle);

      this.baseGraphics.lineStyle(1, 0x4488aa, 0.8);
      this.baseGraphics.lineBetween(
        this.cx + sx * innerR,
        this.cy + sy * innerR,
        this.cx + sx * outerR,
        this.cy + sy * outerR,
      );
    }

    // Cardinal text labels: N, E, S, W
    const cardinalDefs: { text: string; angle: number; color: string }[] = [
      { text: "N", angle: 0, color: "#ff6644" },
      { text: "E", angle: Math.PI / 2, color: "#88aacc" },
      { text: "S", angle: Math.PI, color: "#88aacc" },
      { text: "W", angle: (3 * Math.PI) / 2, color: "#88aacc" },
    ];

    const labelRadius = COMPASS_RADIUS + 6;
    for (const def of cardinalDefs) {
      const lx = this.cx + Math.sin(def.angle) * labelRadius;
      const ly = this.cy - Math.cos(def.angle) * labelRadius;

      const label = scene.add.text(lx, ly, def.text, {
        fontFamily: UI_FONT,
        fontSize: "8px",
        color: def.color,
        resolution: TEXT_RES,
      });
      label.setOrigin(0.5);
      label.setScrollFactor(0);
      label.setDepth(9050);
      this.labels.push(label);
    }

    // --- Dynamic arrow graphics (redrawn each update) ---
    this.arrowGraphics = scene.add.graphics();
    this.arrowGraphics.setScrollFactor(0);
    this.arrowGraphics.setDepth(9050);

    // --- "Wind: XX%" text below compass ---
    this.windLabel = scene.add.text(
      this.cx,
      this.cy + BG_RADIUS + 6,
      "Wind: 0%",
      {
        fontFamily: UI_FONT,
        fontSize: "10px",
        color: "#cccccc",
        resolution: TEXT_RES,
      },
    );
    this.windLabel.setOrigin(0.5, 0);
    this.windLabel.setScrollFactor(0);
    this.windLabel.setDepth(9100);
  }

  update(windDirRad: number, windStrength: number): void {
    this.arrowGraphics.clear();

    const strength = Math.max(0, Math.min(1, windStrength));

    // Arrow length scales with wind strength
    const arrowLen = 8 + strength * (COMPASS_RADIUS - 12);

    // Arrow tip position (points in wind-from direction)
    // tipX = cx + sin(windDirRad) * len, tipY = cy - cos(windDirRad) * len
    const tipX = this.cx + Math.sin(windDirRad) * arrowLen;
    const tipY = this.cy - Math.cos(windDirRad) * arrowLen;

    // Color gradient: green (light wind) to red (strong wind)
    const r = Math.floor(Math.min(255, 100 + strength * 155));
    const g = Math.floor(Math.max(0, 200 - strength * 120));
    const b = Math.floor(Math.max(0, 100 - strength * 50));
    const color = (r << 16) | (g << 8) | b;

    // Line from center to tip
    this.arrowGraphics.lineStyle(2, color, 0.9);
    this.arrowGraphics.lineBetween(this.cx, this.cy, tipX, tipY);

    // Filled triangle arrowhead at the tip
    const headLen = 6;
    const spread = 0.4; // radians

    // Base of arrowhead (point back toward center)
    const backAngle = windDirRad + Math.PI; // opposite direction
    const leftAngle = backAngle - spread;
    const rightAngle = backAngle + spread;

    const leftX = tipX + Math.sin(leftAngle) * headLen;
    const leftY = tipY - Math.cos(leftAngle) * headLen;
    const rightX = tipX + Math.sin(rightAngle) * headLen;
    const rightY = tipY - Math.cos(rightAngle) * headLen;

    this.arrowGraphics.fillStyle(color, 0.9);
    this.arrowGraphics.fillTriangle(tipX, tipY, leftX, leftY, rightX, rightY);

    // White center dot
    this.arrowGraphics.fillStyle(0xffffff, 0.8);
    this.arrowGraphics.fillCircle(this.cx, this.cy, 2);

    // Update wind percentage text
    const pct = Math.round(strength * 100);
    this.windLabel.setText(`Wind: ${pct}%`);
  }

  destroy(): void {
    this.baseGraphics.destroy();
    this.arrowGraphics.destroy();
    for (const label of this.labels) {
      label.destroy();
    }
    this.labels = [];
    this.windLabel.destroy();
  }
}
