import Phaser from "phaser";
import { UI_FONT, TEXT_RES, txt } from "../ui/textStyle.ts";
import { APP_VERSION } from "../../version.ts";
import { WindCompassWidget } from "../render/WindCompassWidget.ts";

const MARGIN = 8;
const COMPASS_SIZE = 100; // px on screen

/** How dark a squall gets, and how quickly it gets there (v0.38.0). */
const STORM_VEIL_ALPHA = 0.34;
/** How dark it gets at the eye of a hurricane (v0.39.0). */
const STORM_VEIL_MAX = 0.62;
/** Dark blue-grey for a storm; pale grey for fog (v0.40.0). */
const STORM_VEIL_COLOUR = 0x0a1626;
const FOG_VEIL_COLOUR = 0xb9c6cf;
/** How white the world goes in a thick bank. Lower than a storm's wash: fog
 *  hides by washing the map out, and a fog you cannot see past is not fog. */
const FOG_VEIL_MAX = 0.5;
const STORM_VEIL_EASE = 0.04;

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
  private sailText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private fleetText!: Phaser.GameObjects.Text;
  private blockadeText!: Phaser.GameObjects.Text;
  private stormText!: Phaser.GameObjects.Text;
  /**
   * The squall itself (v0.38.0).
   *
   * A full-screen wash, and it lives here rather than in `MainMapScene` for the
   * reason everything fixed does: this scene's camera never zooms or scrolls,
   * so the veil covers the viewport at any zoom without being measured. It is
   * given the lowest depth in the scene, so it darkens the whole map and passes
   * *under* the compass and the HUD — which is where a weather effect belongs.
   */
  private stormVeil!: Phaser.GameObjects.Rectangle;
  private stormAlpha = 0;
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

    // Sail level — below compass, text only
    const sailY = MARGIN + 18 + COMPASS_SIZE + 28;
    this.sailText = this.add.text(cam.width - MARGIN, sailY, "", {
      ...txt(13, { color: "#ffdd88" }),
      stroke: "#000000",
      strokeThickness: 3,
    });
    this.sailText.setOrigin(1, 0);
    this.sailText.setDepth(30);

    // Ship speed — below sail text
    this.speedText = this.add.text(cam.width - MARGIN, sailY + 18, "", {
      ...txt(12, { color: "#aaccee" }),
      stroke: "#000000",
      strokeThickness: 2,
    });
    this.speedText.setOrigin(1, 0);
    this.speedText.setDepth(30);

    // Fleet info — below speed
    this.fleetText = this.add.text(cam.width - MARGIN, sailY + 36, "", {
      ...txt(11, { color: "#6699cc" }),
      stroke: "#000000",
      strokeThickness: 2,
    });
    this.fleetText.setOrigin(1, 0);
    this.fleetText.setDepth(30);

    // Blockade — under the fleet line. Silent unless the player is actually
    // standing off a harbour, which is the only time it has anything to say.
    this.blockadeText = this.add.text(cam.width - MARGIN, sailY + 54, "", {
      ...txt(11, { color: "#cc8844" }),
      stroke: "#000000",
      strokeThickness: 2,
    });
    this.blockadeText.setOrigin(1, 0);
    this.blockadeText.setDepth(30);

    // The squall wash — below everything else this scene draws.
    this.stormVeil = this.add.rectangle(0, 0, cam.width, cam.height, STORM_VEIL_COLOUR, 0);
    this.stormVeil.setOrigin(0, 0);
    this.stormVeil.setDepth(-10);

    // Weather warning — under the blockade line, and silent in fair weather.
    this.stormText = this.add.text(cam.width - MARGIN, sailY + 72, "", {
      ...txt(12, { bold: true, color: "#88aacc" }),
      stroke: "#000000",
      strokeThickness: 3,
    });
    this.stormText.setOrigin(1, 0);
    this.stormText.setDepth(30);

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
    const sailY = MARGIN + 18 + COMPASS_SIZE + 28;
    if (this.sailText) this.sailText.setPosition(width - MARGIN, sailY);
    if (this.speedText) this.speedText.setPosition(width - MARGIN, sailY + 18);
    if (this.fleetText) this.fleetText.setPosition(width - MARGIN, sailY + 36);
    if (this.blockadeText) this.blockadeText.setPosition(width - MARGIN, sailY + 54);
    if (this.stormText) this.stormText.setPosition(width - MARGIN, sailY + 72);
    if (this.stormVeil) this.stormVeil.setSize(width, height);
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

  /** Called from MainMapScene each frame with sail info */
  updateSail(levelName: string, transitioning: boolean): void {
    if (this.sailText) {
      this.sailText.setText(transitioning ? levelName + "..." : levelName);
    }
  }

  /** Called from MainMapScene each frame with ship speed */
  updateSpeed(speed: number): void {
    if (this.speedText) {
      if (speed < 0.001) {
        this.speedText.setText("");
      } else {
        // Convert to knots display: speedBase×windMod×32 = max knots (frigate=12kn)
        const knots = (speed * 32).toFixed(1);
        this.speedText.setText(`${knots} kn`);
      }
    }
  }

  /** Called from MainMapScene each frame with fleet info */
  updateFleet(fleetCount: number): void {
    if (this.fleetText) {
      if (fleetCount > 0) {
        this.fleetText.setText(`Flota: ${fleetCount + 1}/3`);
      } else {
        this.fleetText.setText("");
      }
    }
  }

  /**
   * Called from MainMapScene with the state of any cordon the player is
   * pressing (v0.22.0).
   *
   * Three things can be true and each needs saying: he is near a harbour but
   * has not the guns to shut it, the cordon is tightening but has not bitten
   * yet, or the port is shut. Anything else and the line is blank.
   */
  updateBlockade(line: string, effective: boolean): void {
    if (!this.blockadeText) return;
    this.blockadeText.setText(line);
    this.blockadeText.setColor(effective ? "#dd5544" : "#cc8844");
  }

  /**
   * Called from MainMapScene each frame with the weather warning, if any
   * (v0.38.0).
   *
   * The wash is eased rather than switched, because a squall that appeared
   * between two frames would read as a rendering fault rather than as weather.
   * `null` means fair weather and fades it back out.
   */
  updateStorm(line: string | null, danger: boolean, severity = 0, fog = 0): void {
    // A hurricane is darker than a squall, in proportion to how deep into it
    // the ship is (v0.39.0) — so the wash itself is a reading of how bad this
    // is, and standing out of the circle visibly lightens the sea before the
    // warning line goes away.
    //
    // Fog washes the same rectangle the other way (v0.40.0): pale instead of
    // dark, because a fog bank is bright and a squall is not, and the two never
    // meet — fog wants calm air and a storm is the opposite of that.
    const thick = Math.max(0, Math.min(1, fog));
    if (this.stormVeil) this.stormVeil.setFillStyle(thick > 0 ? FOG_VEIL_COLOUR : STORM_VEIL_COLOUR);
    const target = thick > 0
      ? FOG_VEIL_MAX * thick
      : line === null
        ? 0
        : STORM_VEIL_ALPHA + (STORM_VEIL_MAX - STORM_VEIL_ALPHA) * Math.max(0, Math.min(1, severity));
    this.stormAlpha += (target - this.stormAlpha) * STORM_VEIL_EASE;
    if (this.stormVeil) this.stormVeil.setAlpha(this.stormAlpha);
    if (this.stormText) {
      this.stormText.setText(line ?? "");
      this.stormText.setColor(danger ? "#dd7755" : "#88aacc");
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
