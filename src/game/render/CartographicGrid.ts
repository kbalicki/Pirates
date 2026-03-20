/**
 * CartographicGrid — lat/lon grid LINES only.
 * Labels are created by PortMarkerRenderer (same path as city labels — proven to work).
 */
import Phaser from "phaser";

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

  update(): void {
    const zoom = this.gridGraphics.scene.cameras.main.zoom;
    const visible = zoom < 3;
    const alpha = zoom < 2.2 ? 1 : 1 - (zoom - 2.2) / 0.8; // full at <2.2, fade 2.2-3, hidden >=3
    this.gridGraphics.setVisible(visible);
    this.gridGraphics.setAlpha(alpha);
  }

  destroy(): void {
    this.gridGraphics.destroy();
  }
}
