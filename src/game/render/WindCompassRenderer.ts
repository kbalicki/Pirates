import Phaser from "phaser";
import { UI_FONT, TEXT_RES } from "../ui/textStyle.ts";

const COMPASS_MARGIN = 10;
const ROSE_SCALE = 1.15; // 68px * 1.15 ≈ 78px display size

export class WindCompassRenderer {
  private roseSprite: Phaser.GameObjects.Image;
  private needleSprite: Phaser.GameObjects.Image;
  private windLabel: Phaser.GameObjects.Text;

  /** Screen-space center of the compass. */
  private cx: number;
  private cy: number;

  constructor(scene: Phaser.Scene) {
    const cam = scene.cameras.main;
    this.cx = cam.width - COMPASS_MARGIN - 40;
    this.cy = COMPASS_MARGIN + 40;

    // Wind rose background sprite
    this.roseSprite = scene.add.image(this.cx, this.cy, "windrose");
    this.roseSprite.setScrollFactor(0);
    this.roseSprite.setDepth(9000);
    this.roseSprite.setScale(ROSE_SCALE);

    // Rotating needle sprite (points upward = north by default)
    this.needleSprite = scene.add.image(this.cx, this.cy, "compass_needle");
    this.needleSprite.setScrollFactor(0);
    this.needleSprite.setDepth(9050);
    this.needleSprite.setScale(ROSE_SCALE);

    // "Wind: XX%" text below compass
    const labelY = this.cy + (40 * ROSE_SCALE) + 4;
    this.windLabel = scene.add.text(
      this.cx,
      labelY,
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

  reposition(camWidth: number): void {
    this.cx = camWidth - COMPASS_MARGIN - 40;
    this.cy = COMPASS_MARGIN + 40;
    this.roseSprite.setPosition(this.cx, this.cy);
    this.needleSprite.setPosition(this.cx, this.cy);
    this.windLabel.setPosition(this.cx, this.cy + (40 * ROSE_SCALE) + 4);
  }

  update(windDirRad: number, windStrength: number): void {
    // Rotate needle to point in wind direction
    // windDirRad: 0=N, PI/2=E, PI=S, 3PI/2=W (clockwise from north)
    this.needleSprite.setRotation(windDirRad);

    // Update wind percentage text
    const pct = Math.round(Math.max(0, Math.min(1, windStrength)) * 100);
    this.windLabel.setText(`Wind: ${pct}%`);
  }

  destroy(): void {
    this.roseSprite.destroy();
    this.needleSprite.destroy();
    this.windLabel.destroy();
  }
}
