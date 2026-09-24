/**
 * CartographicGrid — the chart's lat/lon grid.
 *
 * The lines are drawn here, in world space, once. The **labels** that say which
 * line is which are drawn by `UIOverlayScene.updateGridLabels`, in screen
 * space, pinned to the margin the way a chart pins them.
 *
 * Until v0.98.0 they were drawn by `PortMarkerRenderer` in world space, all
 * thirteen at one spot: the five latitudes at `x = MAP_W/2 - 100` and the eight
 * longitudes at `y = MAP_H/2 - 50`, a single cross in the middle of a
 * 3200x2400 sea. Measured over the 45 ports and the three zoom steps that draw
 * the grid at all, **115 of 1755 (port, label) pairs had the label in frame —
 * 6.6%** — while 191 grid lines crossed the view at the widest step. He could
 * see the lines and not the number naming them.
 *
 * `Phaser` is imported as a **type only**: everything below the class is pure
 * Mercator arithmetic, and a value import put it behind a browser, so nothing
 * outside one could measure the grid at all (the v0.91.0 shape).
 */
import type Phaser from "phaser";

const mercY = (lat: number): number =>
  Math.log(Math.tan(Math.PI / 4 + ((lat * Math.PI) / 180) / 2));
const Y_TOP = mercY(35);
const Y_BOT = mercY(7);

function geoToPixel(lon: number, lat: number, mapW: number, mapH: number): { x: number; y: number } {
  return {
    x: ((lon - -100) / 45) * mapW,
    y: ((Y_TOP - mercY(lat)) / (Y_TOP - Y_BOT)) * mapH,
  };
}

export function pixelToGeo(px: number, py: number, mapW: number, mapH: number): { lonW: number; lat: number } {
  const lon = (px / mapW) * 45 + -100;
  const lonW = -lon;
  const ml = Y_TOP - (py / mapH) * (Y_TOP - Y_BOT);
  const lat = ((2 * Math.atan(Math.exp(ml)) - Math.PI / 2) * 180) / Math.PI;
  return { lonW, lat };
}

/** The grid is gone from here in, and full below `GRID_FULL_ZOOM`. */
export const GRID_HIDE_ZOOM = 3;
export const GRID_FULL_ZOOM = 2.2;

export type GridFade = { visible: boolean; alpha: number };

/**
 * How strongly the grid draws at this zoom — **one rule, read twice**.
 *
 * The lines used to fade 2.2 to 3 and the labels 2 to 3, two numbers about one
 * thing, which is the shape this project keeps finding. Below 3 the chart is
 * wide enough that a degree grid helps; closer in it is clutter over a coast.
 */
export function gridFade(zoom: number): GridFade {
  const alpha = zoom < GRID_FULL_ZOOM
    ? 1
    : Math.max(0, 1 - (zoom - GRID_FULL_ZOOM) / (GRID_HIDE_ZOOM - GRID_FULL_ZOOM));
  return { visible: zoom < GRID_HIDE_ZOOM, alpha };
}

export const LAT_LINES = [10, 15, 20, 25, 30];
export const LON_LINES = [-60, -65, -70, -75, -80, -85, -90, -95];

export function getLatWorldY(lat: number, mapH: number): number {
  return geoToPixel(0, lat, 3200, mapH).y;
}
export function getLonWorldX(lon: number, mapW: number): number {
  return geoToPixel(lon, 0, mapW, 2400).x;
}

export class CartographicGrid {
  private gridGraphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, mapWidth: number, mapHeight: number) {
    this.gridGraphics = scene.add.graphics();
    this.gridGraphics.setDepth(50);
    this.gridGraphics.lineStyle(1.0, 0xccaa55, 0.15);

    for (const lat of LAT_LINES) {
      const py = geoToPixel(0, lat, mapWidth, mapHeight).y;
      this.gridGraphics.lineBetween(0, py, mapWidth, py);
    }
    for (const lon of LON_LINES) {
      const px = geoToPixel(lon, 0, mapWidth, mapHeight).x;
      this.gridGraphics.lineBetween(px, 0, px, mapHeight);
    }
  }

  /** Apply the one fade rule, and hand it back for the labels to use. */
  update(): GridFade {
    const fade = gridFade(this.gridGraphics.scene.cameras.main.zoom);
    this.gridGraphics.setVisible(fade.visible);
    this.gridGraphics.setAlpha(fade.alpha);
    return fade;
  }

  destroy(): void {
    this.gridGraphics.destroy();
  }
}
