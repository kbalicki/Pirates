import Phaser from "phaser";
import { UI_FONT, TEXT_RES } from "../ui/textStyle.ts";

const MARGIN_PX = 8;       // screen pixels from edge
const SIZE_PX = 100;        // desired screen pixel size of compass
const LABEL_GAP_PX = 8;    // gap between compass and label

function strengthToKnots(s: number): number {
  return Math.round(s * 40);
}

/**
 * Wind compass rose — positioned in WORLD coordinates every frame
 * to match the top-right corner of the viewport. No scrollFactor tricks.
 * Scale adjusted each frame to maintain constant screen pixel size.
 */
export class WindCompassRenderer {
  private roseSprite: Phaser.GameObjects.Image;
  private needleSprite: Phaser.GameObjects.Image;
  private windLabel: Phaser.GameObjects.Text;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.roseSprite = scene.add.image(0, 0, "windrose");
    this.roseSprite.setDepth(9800);

    this.needleSprite = scene.add.image(0, 0, "compass_needle");
    this.needleSprite.setDepth(9850);

    this.windLabel = scene.add.text(0, 0, "Calm", {
      fontFamily: UI_FONT,
      fontSize: "11px",
      color: "#cccccc",
      resolution: TEXT_RES,
      stroke: "#000000",
      strokeThickness: 2,
    });
    this.windLabel.setOrigin(0.5, 0);
    this.windLabel.setDepth(9900);
  }

  reposition(_camWidth: number): void {
    // Handled in update()
  }

  update(windDirRad: number, windStrength: number): void {
    const cam = this.scene.cameras.main;
    const zoom = cam.zoom;

    // Convert desired screen-pixel position to world coordinates
    const halfCompass = SIZE_PX / 2;
    const screenRight = cam.width;
    const screenCX = screenRight - MARGIN_PX - halfCompass; // screen px from left
    const screenCY = MARGIN_PX + halfCompass;               // screen px from top

    // Screen pixel → world coordinate
    const worldX = cam.scrollX + screenCX / zoom;
    const worldY = cam.scrollY + screenCY / zoom;

    // Scale: compass texture is ~68px native; we want SIZE_PX on screen
    const nativeSize = 68;
    const desiredScale = SIZE_PX / nativeSize;
    const worldScale = desiredScale / zoom;

    this.roseSprite.setPosition(worldX, worldY);
    this.roseSprite.setScale(worldScale);

    this.needleSprite.setPosition(worldX, worldY);
    this.needleSprite.setScale(worldScale);
    this.needleSprite.setRotation(windDirRad);

    // Label below compass
    const labelWorldY = worldY + (halfCompass + LABEL_GAP_PX) / zoom;
    this.windLabel.setPosition(worldX, labelWorldY);
    this.windLabel.setScale(1 / zoom);

    const knots = strengthToKnots(windStrength);
    this.windLabel.setText(knots === 0 ? "Calm" : `${knots} kn`);
  }

  destroy(): void {
    this.roseSprite.destroy();
    this.needleSprite.destroy();
    this.windLabel.destroy();
  }
}
