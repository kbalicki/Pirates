import Phaser from "phaser";
import { UI_FONT, TEXT_RES, txt } from "../ui/textStyle.ts";
import { APP_VERSION } from "../../version.ts";

const MARGIN = 8;
const COMPASS_SIZE = 100; // px on screen

function strengthToKnots(s: number): number {
  return Math.round(s * 40);
}

/**
 * UI Overlay Scene — runs on top of MainMapScene.
 * Has its own camera that NEVER zooms or scrolls.
 * Used for: wind compass, and future fixed UI elements.
 */
export class UIOverlayScene extends Phaser.Scene {
  private roseSprite!: Phaser.GameObjects.Image;
  private needleSprite!: Phaser.GameObjects.Image;
  private windLabel!: Phaser.GameObjects.Text;
  private versionText!: Phaser.GameObjects.Text;
  private dateText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "UIOverlayScene" });
  }

  create(): void {
    // This scene's camera: zoom=1, scroll=(0,0), transparent background
    this.cameras.main.setBackgroundColor("rgba(0,0,0,0)");

    const cam = this.cameras.main;
    const DATE_OFFSET = 18; // space for date label above compass
    const cx = cam.width - MARGIN - COMPASS_SIZE / 2;
    const cy = MARGIN + DATE_OFFSET + COMPASS_SIZE / 2;

    // Wind rose
    if (this.textures.exists("windrose")) {
      const nativeSize = this.textures.get("windrose").getSourceImage().width || 68;
      const scale = COMPASS_SIZE / nativeSize;

      this.roseSprite = this.add.image(cx, cy, "windrose");
      this.roseSprite.setScale(scale);
      this.roseSprite.setDepth(10);

      this.needleSprite = this.add.image(cx, cy, "compass_needle");
      this.needleSprite.setScale(scale);
      this.needleSprite.setDepth(20);
    }

    // Date label — right-aligned, above compass
    this.dateText = this.add.text(cam.width - MARGIN, MARGIN - 2, "", {
      fontFamily: UI_FONT,
      fontSize: "11px",
      color: "#ccccaa",
      resolution: TEXT_RES,
      stroke: "#000000",
      strokeThickness: 2,
    });
    this.dateText.setOrigin(1, 0);
    this.dateText.setDepth(30);

    // Wind label
    this.windLabel = this.add.text(cx, cy + COMPASS_SIZE / 2 + 6, "Calm", {
      fontFamily: UI_FONT,
      fontSize: "12px",
      color: "#cccccc",
      resolution: TEXT_RES,
      stroke: "#000000",
      strokeThickness: 2,
    });
    this.windLabel.setOrigin(0.5, 0);
    this.windLabel.setDepth(30);

    // Version label — bottom-right
    this.versionText = this.add.text(
      cam.width - 6, cam.height - 4,
      `v${APP_VERSION}`, {
        ...txt(9, { color: "#888888" }),
        stroke: "#000000",
        strokeThickness: 2,
      },
    );
    this.versionText.setOrigin(1, 1);
    this.versionText.setDepth(10);

    // Reposition on resize
    this.scale.on("resize", (gameSize: Phaser.Structs.Size) => {
      this.cameras.main.setSize(gameSize.width, gameSize.height);
      this.repositionAll(gameSize.width, gameSize.height);
    });
  }

  private repositionAll(width: number, height: number): void {
    const DATE_OFFSET = 18;
    const cx = width - MARGIN - COMPASS_SIZE / 2;
    const cy = MARGIN + DATE_OFFSET + COMPASS_SIZE / 2;
    if (this.dateText) this.dateText.setPosition(width - MARGIN, MARGIN - 2);
    if (this.roseSprite) this.roseSprite.setPosition(cx, cy);
    if (this.needleSprite) this.needleSprite.setPosition(cx, cy);
    if (this.windLabel) this.windLabel.setPosition(cx, cy + COMPASS_SIZE / 2 + 6);
    if (this.versionText) this.versionText.setPosition(width - 6, height - 4);
  }

  /** Called from MainMapScene each frame with current date string */
  updateDate(dateStr: string): void {
    if (this.dateText) {
      this.dateText.setText(dateStr);
    }
  }

  /** Called from MainMapScene each frame with current wind data */
  updateWind(windDirRad: number, windStrength: number): void {
    if (this.needleSprite) {
      this.needleSprite.setRotation(windDirRad);
    }
    if (this.windLabel) {
      const knots = strengthToKnots(windStrength);
      this.windLabel.setText(knots === 0 ? "Calm" : `${knots} kn`);
    }
  }
}
