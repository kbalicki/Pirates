import Phaser from "phaser";
import { UI_FONT, TEXT_RES, txt } from "../ui/textStyle.ts";
import { APP_VERSION } from "../../version.ts";
import { WindCompassWidget } from "../render/WindCompassWidget.ts";

const MARGIN = 8;
const COMPASS_SIZE = 100; // px on screen

/**
 * UI Overlay Scene — runs on top of MainMapScene.
 * Has its own camera that NEVER zooms or scrolls.
 * Used for: wind compass, and future fixed UI elements.
 */
export class UIOverlayScene extends Phaser.Scene {
  private compass!: WindCompassWidget;
  private versionText!: Phaser.GameObjects.Text;
  private dateText!: Phaser.GameObjects.Text;
  private zoomText!: Phaser.GameObjects.Text;
  private gridLabels: Phaser.GameObjects.Text[] = [];

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

    // Wind compass (procedurally drawn — no external images)
    this.compass = new WindCompassWidget(this, cx, cy, COMPASS_SIZE);

    // Date label — top-left corner
    this.dateText = this.add.text(MARGIN, MARGIN, "", {
      fontFamily: UI_FONT,
      fontSize: "16px",
      color: "#ccccaa",
      resolution: TEXT_RES,
      stroke: "#000000",
      strokeThickness: 2,
    });
    this.dateText.setOrigin(0, 0);
    this.dateText.setDepth(30);

    // Version label — bottom-right
    this.versionText = this.add.text(
      cam.width - 6, cam.height - 4,
      `v${APP_VERSION}`, {
        ...txt(14, { color: "#888888" }),
        stroke: "#000000",
        strokeThickness: 2,
      },
    );
    this.versionText.setOrigin(1, 1);
    this.versionText.setDepth(10);

    // Zoom label — bottom-left
    this.zoomText = this.add.text(6, cam.height - 4, "zoom: ?", {
      ...txt(12, { color: "#888888" }),
      stroke: "#000000",
      strokeThickness: 2,
    });
    this.zoomText.setOrigin(0, 1);
    this.zoomText.setDepth(10);

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
    if (this.dateText) this.dateText.setPosition(MARGIN, MARGIN);
    if (this.compass) this.compass.reposition(cx, cy);
    if (this.versionText) this.versionText.setPosition(width - 6, height - 4);
    if (this.zoomText) this.zoomText.setPosition(6, height - 4);
  }

  /** Called from MainMapScene each frame with current date string */
  updateDate(dateStr: string): void {
    if (this.dateText) {
      this.dateText.setText(dateStr);
    }
  }

  /** Called from MainMapScene each frame with current wind data */
  updateWind(windDirRad: number, windStrength: number): void {
    if (this.compass) {
      this.compass.updateWind(windDirRad, windStrength);
    }
  }

  /** Called from MainMapScene each frame with current zoom level */
  updateZoom(zoom: number): void {
    if (this.zoomText) {
      // Show integer zoom level (1×–12×)
      this.zoomText.setText(`zoom: ${Math.round(zoom)}×`);
    }
  }

  /** Update cartographic grid labels — screen-space positions from MainMapScene camera */
  updateGridLabels(
    camScrollX: number, camScrollY: number, camZoom: number,
    camW: number, camH: number, visible: boolean,
  ): void {
    // Mercator helpers (same as CartographicGrid.ts)
    const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + ((lat * Math.PI) / 180) / 2));
    const Y_TOP = mercY(35), Y_BOT = mercY(7);
    const MAP_W = 3200, MAP_H = 2400;

    const LAT_LINES = [10, 15, 20, 25, 30];
    const LON_LINES = [-60, -65, -70, -75, -80, -85, -90, -95];

    // Create labels on first call
    if (this.gridLabels.length === 0) {
      for (const lat of LAT_LINES) {
        const label = this.add.text(0, 0, `${lat}°N`, {
          fontFamily: UI_FONT, fontSize: "13px", color: "#ffdd88",
          resolution: TEXT_RES, stroke: "#000000", strokeThickness: 3,
        });
        label.setDepth(100);
        this.gridLabels.push(label);
      }
      for (const lon of LON_LINES) {
        const label = this.add.text(0, 0, `${-lon}°W`, {
          fontFamily: UI_FONT, fontSize: "13px", color: "#ffdd88",
          resolution: TEXT_RES, stroke: "#000000", strokeThickness: 3,
        });
        label.setDepth(100);
        this.gridLabels.push(label);
      }
    }

    // Fade: full at zoom <2, fade 2-3, hidden >=3
    const alpha = !visible ? 0 : camZoom < 2 ? 1 : Math.max(0, 1 - (camZoom - 2));

    let idx = 0;
    for (const lat of LAT_LINES) {
      const worldY = ((Y_TOP - mercY(lat)) / (Y_TOP - Y_BOT)) * MAP_H;
      const screenY = (worldY - camScrollY) * camZoom;
      const label = this.gridLabels[idx];
      if (alpha > 0.01 && screenY > 5 && screenY < camH - 5) {
        label.setVisible(true);
        label.setPosition(6, screenY);
        label.setOrigin(0, 0.5);
        label.setAlpha(alpha);
      } else {
        label.setVisible(false);
      }
      idx++;
    }
    for (const lon of LON_LINES) {
      const worldX = ((-lon - (-100)) / 45) * MAP_W;
      const screenX = (worldX - camScrollX) * camZoom;
      const label = this.gridLabels[idx];
      if (alpha > 0.01 && screenX > 20 && screenX < camW - 20) {
        label.setVisible(true);
        label.setPosition(screenX, camH - 20);
        label.setOrigin(0.5, 1);
        label.setAlpha(alpha);
      } else {
        label.setVisible(false);
      }
      idx++;
    }
  }
}
