import Phaser from "phaser";
import { t } from "../../core/i18n/I18n.ts";
import { fmtNum, fmtTrim } from "../../core/i18n/numbers.ts";
import { UI_FONT, TEXT_RES, txt } from "../ui/textStyle.ts";
import { APP_VERSION } from "../../version.ts";
import { WindCompassWidget } from "../render/WindCompassWidget.ts";
import { MAX_FLEET_SIZE } from "../../core/systems/FleetSystem.ts";
import {
  LAT_LINES, LON_LINES, getLatWorldY, getLonWorldX,
} from "../render/CartographicGrid.ts";

/** The chart's size in world pixels — the grid is placed against it. */
const MAP_W = 3200;
const MAP_H = 2400;

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
/**
 * The stack under the compass, top to bottom, as offsets from `sailY`.
 *
 * It used to be written out twice — once when the lines were made and once
 * when the window was resized — and the two disagreed about the weather
 * warning: 104 on the way in, 72 on a resize, which is four pixels under the
 * squadron line and *above* the blockade line it is documented as following.
 * Resize the window in a squall and the warning landed on top of the fleet
 * (v0.82.0). One table, read by both.
 */
const HUD_ROW = {
  sail: 0,
  speed: 18,
  windward: 36,
  drift: 52,
  fleet: 68,
  blockade: 86,
  relief: 104,
  storm: 122,
} as const;

export class UIOverlayScene extends Phaser.Scene {
  private compass!: WindCompassWidget;
  private versionText!: Phaser.GameObjects.Text;
  private dateText!: Phaser.GameObjects.Text;
  private zoomText!: Phaser.GameObjects.Text;
  private sailText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private fleetText!: Phaser.GameObjects.Text;
  private blockadeText!: Phaser.GameObjects.Text;
  private reliefText!: Phaser.GameObjects.Text;
  private windwardText!: Phaser.GameObjects.Text;
  private driftText!: Phaser.GameObjects.Text;
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
    this.zoomText = this.add.text(6, cam.height - 4, t("hud.zoom", { level: "?" }), {
      ...txt(12, { color: "#888888" }),
      stroke: "#000000",
      strokeThickness: 2,
    });
    this.zoomText.setOrigin(0, 1);
    this.zoomText.setDepth(10);

    // Sail level — below compass, text only
    const sailY = MARGIN + 18 + COMPASS_SIZE + 28;
    this.sailText = this.add.text(cam.width - MARGIN, sailY + HUD_ROW.sail, "", {
      ...txt(13, { color: "#ffdd88" }),
      stroke: "#000000",
      strokeThickness: 3,
    });
    this.sailText.setOrigin(1, 0);
    this.sailText.setDepth(30);

    // Ship speed — below sail text
    this.speedText = this.add.text(cam.width - MARGIN, sailY + HUD_ROW.speed, "", {
      ...txt(12, { color: "#aaccee" }),
      stroke: "#000000",
      strokeThickness: 2,
    });
    this.speedText.setOrigin(1, 0);
    this.speedText.setDepth(30);

    // Working to windward — below speed (v0.54.0). Only drawn when she is
    // actually on the wind, so it costs nothing on a reach.
    this.windwardText = this.add.text(cam.width - MARGIN, sailY + HUD_ROW.windward, "", {
      ...txt(11, { color: "#88cc88" }),
      stroke: "#000000",
      strokeThickness: 2,
    });
    this.windwardText.setOrigin(1, 0);
    this.windwardText.setDepth(30);

    // What the water is doing to her, when it is doing enough to matter.
    this.driftText = this.add.text(cam.width - MARGIN, sailY + HUD_ROW.drift, "", {
      ...txt(11, { color: "#66aacc" }),
      stroke: "#000000",
      strokeThickness: 2,
    });
    this.driftText.setOrigin(1, 0);
    this.driftText.setDepth(30);

    // Fleet info — below speed
    this.fleetText = this.add.text(cam.width - MARGIN, sailY + HUD_ROW.fleet, "", {
      ...txt(11, { color: "#6699cc" }),
      stroke: "#000000",
      strokeThickness: 2,
    });
    this.fleetText.setOrigin(1, 0);
    this.fleetText.setDepth(30);

    // Blockade — under the fleet line. Silent unless the player is actually
    // standing off a harbour, which is the only time it has anything to say.
    this.blockadeText = this.add.text(cam.width - MARGIN, sailY + HUD_ROW.blockade, "", {
      ...txt(11, { color: "#cc8844" }),
      stroke: "#000000",
      strokeThickness: 2,
    });
    this.blockadeText.setOrigin(1, 0);
    this.blockadeText.setDepth(30);

    // A squadron standing in for one of his towns (v0.93.0). Same row shape as
    // the cordon above it, and for the same reason: `PRESENCE_RANGE` decides
    // whether he is given the battle, and 400 world px is off the screen at
    // every zoom the game offers.
    this.reliefText = this.add.text(cam.width - MARGIN, sailY + HUD_ROW.relief, "", {
      ...txt(11, { color: "#cc8844" }),
      stroke: "#000000",
      strokeThickness: 2,
    });
    this.reliefText.setOrigin(1, 0);
    this.reliefText.setDepth(30);

    // The squall wash — below everything else this scene draws.
    this.stormVeil = this.add.rectangle(0, 0, cam.width, cam.height, STORM_VEIL_COLOUR, 0);
    this.stormVeil.setOrigin(0, 0);
    this.stormVeil.setDepth(-10);

    // Weather warning — under the blockade line, and silent in fair weather.
    this.stormText = this.add.text(cam.width - MARGIN, sailY + HUD_ROW.storm, "", {
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
    if (this.sailText) this.sailText.setPosition(width - MARGIN, sailY + HUD_ROW.sail);
    if (this.speedText) this.speedText.setPosition(width - MARGIN, sailY + HUD_ROW.speed);
    if (this.windwardText) this.windwardText.setPosition(width - MARGIN, sailY + HUD_ROW.windward);
    if (this.driftText) this.driftText.setPosition(width - MARGIN, sailY + HUD_ROW.drift);
    if (this.fleetText) this.fleetText.setPosition(width - MARGIN, sailY + HUD_ROW.fleet);
    if (this.blockadeText) this.blockadeText.setPosition(width - MARGIN, sailY + HUD_ROW.blockade);
    if (this.reliefText) this.reliefText.setPosition(width - MARGIN, sailY + HUD_ROW.relief);
    if (this.stormText) this.stormText.setPosition(width - MARGIN, sailY + HUD_ROW.storm);
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
        const knots = fmtNum(speed * 32);
        this.speedText.setText(t("hud.knots", { knots }));
      }
    }
  }

  /**
   * The three things a captain could not see while beating (v0.54.0).
   *
   * `beatDeg` is her best beat off the wind, `offWind` where her bow is now,
   * and `made` the share of her speed that is actually going to windward. The
   * hint fires when the other tack would do better than the one she is on —
   * the same comparison the merchant traffic has been making since v0.53.0.2,
   * which the player had no version of at all.
   */
  updateWindward(info: {
    beating: boolean; beatDeg: number; offWind: number;
    made: number; goAbout: boolean;
  } | null): void {
    if (!this.windwardText) return;
    if (!info || !info.beating) { this.windwardText.setText(""); return; }
    const onIt = Math.abs(info.offWind - info.beatDeg) <= 4;
    const arrow = info.offWind < info.beatDeg ? "\u2192" : "\u2190"; // fall off / come up
    this.windwardText.setText(
      `${t("hud.beat")} ${Math.round(info.offWind)}\u00b0/${Math.round(info.beatDeg)}\u00b0 `
      + `${onIt ? "\u2713" : arrow}  ${t("hud.made_good")} ${fmtNum(info.made * 32)}`
      + (info.goAbout ? `  \u21bb ${t("hud.go_about")}` : ""),
    );
    this.windwardText.setColor(onIt ? "#88cc88" : "#ccaa55");
  }

  /** How far the water is setting her off her own heading, in degrees. */
  updateDrift(setDeg: number | null, overGround: number): void {
    if (!this.driftText) return;
    if (setDeg === null || Math.abs(setDeg) < 3) { this.driftText.setText(""); return; }
    this.driftText.setText(
      t("hud.set_drift", {
        sign: setDeg > 0 ? "+" : "",
        deg: Math.round(setDeg),
        speed: t("hud.knots", { knots: fmtNum(overGround * 32) }),
      }),
    );
  }

  /** Pass the sailing sectors down to the rose. */
  updateCompassSectors(
    windDirRad: number, minWindAngleDeg: number, bestBeatDeg: number, shipHeading: number,
  ): void {
    this.compass?.updateSailing(windDirRad, minWindAngleDeg, bestBeatDeg, shipHeading);
  }

  /** Called from MainMapScene each frame with fleet info */
  updateFleet(fleetCount: number): void {
    if (this.fleetText) {
      if (fleetCount > 0) {
        this.fleetText.setText(t("hud.fleet", { count: fleetCount + 1, max: MAX_FLEET_SIZE }));
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
   * The landing he has been warned of, and whether he can reach it (v0.93.0).
   *
   * Red when he cannot: that is the state he can still do something about, and
   * the one the game used to say nothing at all about.
   */
  updateRelief(line: string, urgent: boolean): void {
    if (!this.reliefText) return;
    this.reliefText.setText(line);
    this.reliefText.setColor(urgent ? "#dd5544" : "#cc8844");
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
      // The magnification itself, not its rounding (v0.97.0): the fourteen
      // steps run 1.5 to 12 and `Math.round` gave them **eleven** readings, so
      // the three widest pairs printed the same number and `1×`, which the
      // line here used to promise, could never appear at all.
      this.zoomText.setText(t("hud.zoom", { level: fmtTrim(zoom) }));
    }
  }

  /**
   * The degree labels, at the margin of the screen (v0.98.0).
   *
   * Written in v0.9.x and **never called** until v0.98.0, while
   * `PortMarkerRenderer` drew thirteen world-space labels bunched at one spot
   * in the middle of the sea: measured, the label was in frame for **115 of
   * 1755 (port, label) pairs, 6.6%**, at the three zoom steps that draw the
   * grid at all. A chart names its lines at the edge, where the line leaves
   * the paper, which is what this does — latitudes down the left margin,
   * longitudes along the bottom, each one drawn only while its line actually
   * crosses the view.
   *
   * `alpha` comes from `gridFade`, the same call that set the lines: the two
   * used to compute their own, and disagreed (2.2 against 2).
   */
  updateGridLabels(
    camScrollX: number, camScrollY: number, camZoom: number,
    camW: number, camH: number, alpha: number,
  ): void {
    if (this.gridLabels.length === 0) {
      if (alpha <= 0.01) return;                       // nothing to build yet
      const style = {
        fontFamily: UI_FONT, fontSize: "13px", color: "#ffdd88",
        resolution: TEXT_RES, stroke: "#000000", strokeThickness: 3,
      };
      for (const lat of LAT_LINES) {
        this.gridLabels.push(this.add.text(0, 0, `${lat}°N`, style).setDepth(100));
      }
      for (const lon of LON_LINES) {
        this.gridLabels.push(this.add.text(0, 0, `${-lon}°W`, style).setDepth(100));
      }
    }

    let idx = 0;
    for (const lat of LAT_LINES) {
      const screenY = (getLatWorldY(lat, MAP_H) - camScrollY) * camZoom;
      const label = this.gridLabels[idx++];
      const on = alpha > 0.01 && screenY > 5 && screenY < camH - 5;
      label.setVisible(on);
      if (on) {
        label.setOrigin(0, 0.5);
        label.setPosition(6, screenY);
        label.setAlpha(alpha);
      }
    }
    for (const lon of LON_LINES) {
      const screenX = (getLonWorldX(lon, MAP_W) - camScrollX) * camZoom;
      const label = this.gridLabels[idx++];
      const on = alpha > 0.01 && screenX > 20 && screenX < camW - 20;
      label.setVisible(on);
      if (on) {
        label.setOrigin(0.5, 1);
        label.setPosition(screenX, camH - 20);
        label.setAlpha(alpha);
      }
    }
  }
}
