import Phaser from "phaser";
import { PORTS } from "../../core/data/ports.ts";
import { drawCityIcon } from "./CityIconRenderer.ts";
import { t } from "../../core/i18n/index.ts";
import { txt } from "../ui/textStyle.ts";

export interface PortMarkerResult {
  portSafePositions: Map<string, { x: number; y: number }>;
  cityLabels: Array<{ text: Phaser.GameObjects.Text; anchorX: number; anchorY: number; offsetPx: number }>;
}

/**
 * Renders port markers (city icons, flags, labels) on the map.
 * Snaps port positions to the nearest coastal land cell.
 */
export class PortMarkerRenderer {
  private scene: Phaser.Scene;
  private landGrid: boolean[][];

  constructor(scene: Phaser.Scene, landGrid: boolean[][]) {
    this.scene = scene;
    this.landGrid = landGrid;
  }

  render(): PortMarkerResult {
    const portSafePositions = new Map<string, { x: number; y: number }>();
    const cityLabels: PortMarkerResult["cityLabels"] = [];

    const g = this.scene.add.graphics();
    g.setDepth(500);

    for (const [portKey, port] of Object.entries(PORTS)) {
      // Snap port to nearest coastal land cell — used for rendering AND dock interaction
      const safePos = this.snapToCoast(port.pos);
      portSafePositions.set(portKey, safePos);
      const drawPort = { ...port, pos: safePos };

      drawCityIcon(this.scene, g, drawPort);

      // Add historical flag sprite next to city — close to buildings
      const factionId = port.factionId as string;
      const flagKey = `flag_${factionId}`;
      if (this.scene.textures.exists(flagKey)) {
        const isLg = port.population === "large" || port.population === "capital";
        const isFort = port.type === "fort";
        const flagX = safePos.x + (isFort ? -9 : isLg ? 14 : port.population === "medium" ? 9 : 8);
        const flagY = safePos.y - (isFort ? 16 : isLg ? 16 : port.population === "medium" ? 10 : 8);
        const flagImg = this.scene.add.image(flagX, flagY, flagKey);
        flagImg.setDepth(501);
        flagImg.setScale(0.5);
        // Waving animation
        this.scene.tweens.add({
          targets: flagImg,
          angle: { from: -3, to: 3 },
          ease: "Sine.easeInOut",
          duration: 1500,
          yoyo: true,
          repeat: -1,
        });
      }

      const isLarge = port.population === "large" || port.population === "capital";
      const labelSize = isLarge ? 16 : port.population === "medium" ? 14 : 11;
      // Label anchored below the city, offset in screen pixels each frame
      const anchorX = safePos.x;
      const anchorY = safePos.y + (isLarge ? 8 : port.population === "medium" ? 6 : 5);

      const label = this.scene.add.text(anchorX, anchorY, t("port." + portKey + ".name"), {
        ...txt(labelSize, { bold: true, color: "#ffffff" }),
        stroke: "#222222",
        strokeThickness: 3,
        shadow: { offsetX: 1, offsetY: 1, color: "#000000", blur: 2, fill: true, stroke: true },
      });
      label.setOrigin(0.5, 0);
      label.setDepth(600); // above everything
      cityLabels.push({ text: label, anchorX, anchorY, offsetPx: 0 });

      // Debug: port interaction radius circle (only when debug mode ON)
      if (localStorage.getItem("pc_debug") === "1") {
        const dg = this.scene.add.circle(safePos.x, safePos.y, 6, 0x00ff00, 0);
        dg.setStrokeStyle(0.3, 0x00ff00, 0.3);
        dg.setDepth(499);
        // Landed radius circle
        const dg2 = this.scene.add.circle(safePos.x, safePos.y, 20, 0xffff00, 0);
        dg2.setStrokeStyle(0.3, 0xffff00, 0.2);
        dg2.setDepth(499);
      }
    }

    return { portSafePositions, cityLabels };
  }

  /**
   * Snap a port position to the nearest coastal land cell.
   * A coastal cell is a land cell in landGrid that has at least one water neighbor.
   * This guarantees: (1) the port is on land, (2) ships can reach it from water.
   */
  private snapToCoast(pos: { x: number; y: number }): { x: number; y: number } {
    const CELL = 32;
    const rows = this.landGrid.length;
    const cols = this.landGrid[0]?.length ?? 0;

    const isCoastal = (r: number, c: number): boolean => {
      if (!this.landGrid[r][c]) return false; // must be land
      // Check 4-neighbors for water
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return true; // map edge = water
        if (!this.landGrid[nr][nc]) return true;
      }
      return false;
    };

    // BFS outward from the port's grid cell to find the nearest coastal land cell
    const startCol = Math.floor(pos.x / CELL);
    const startRow = Math.floor(pos.y / CELL);
    const clampR = (r: number) => Math.max(0, Math.min(rows - 1, r));
    const clampC = (c: number) => Math.max(0, Math.min(cols - 1, c));
    const sr = clampR(startRow), sc = clampC(startCol);

    // Quick check: already on a coastal cell
    if (isCoastal(sr, sc)) return pos;

    const visited = new Set<number>();
    const key = (r: number, c: number) => r * cols + c;
    const queue: [number, number][] = [[sr, sc]];
    visited.add(key(sr, sc));

    let bestR = sr, bestC = sc;
    let bestDist = Infinity;
    const MAX_SEARCH = 30; // max BFS radius in cells

    let head = 0;
    while (head < queue.length) {
      const [cr, cc] = queue[head++];
      const dist = Math.abs(cr - sr) + Math.abs(cc - sc);
      if (dist > MAX_SEARCH) continue;

      if (isCoastal(cr, cc)) {
        // Pick the coastal cell closest to original position (Euclidean)
        const cx = cc * CELL + CELL / 2;
        const cy = cr * CELL + CELL / 2;
        const d = (pos.x - cx) ** 2 + (pos.y - cy) ** 2;
        if (d < bestDist) {
          bestDist = d;
          bestR = cr;
          bestC = cc;
        }
        // Don't expand beyond found coastal cells at this distance
        if (dist < MAX_SEARCH) {
          // Keep searching at same distance for closer Euclidean match
        }
        continue; // don't expand past coastal cells
      }

      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nr = cr + dr, nc = cc + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const k = key(nr, nc);
        if (visited.has(k)) continue;
        visited.add(k);
        queue.push([nr, nc]);
      }
    }

    if (bestDist < Infinity) {
      return { x: bestC * CELL + CELL / 2, y: bestR * CELL + CELL / 2 };
    }
    return pos; // fallback
  }
}
