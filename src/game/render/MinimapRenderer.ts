import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import { PORTS } from "../../core/data/ports.ts";
import { LANDMASSES } from "../../core/data/geography.ts";

const MINIMAP_SIZE = 160;
const MINIMAP_MARGIN = 10;

export class MinimapRenderer {
  private graphics: Phaser.GameObjects.Graphics;
  private mapWidth: number;
  private mapHeight: number;

  constructor(scene: Phaser.Scene, mapWidth: number, mapHeight: number) {
    this.graphics = scene.add.graphics();
    this.graphics.setScrollFactor(0);
    this.graphics.setDepth(9000);
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
  }

  update(scene: Phaser.Scene, world: WorldState): void {
    this.graphics.clear();

    const cam = scene.cameras.main;
    const mx = cam.width - MINIMAP_SIZE - MINIMAP_MARGIN;
    const my = MINIMAP_MARGIN;

    // Background
    this.graphics.fillStyle(0x001133, 0.8);
    this.graphics.fillRect(mx, my, MINIMAP_SIZE, MINIMAP_SIZE);
    this.graphics.lineStyle(1, 0x4488aa, 1);
    this.graphics.strokeRect(mx, my, MINIMAP_SIZE, MINIMAP_SIZE);

    const scaleX = MINIMAP_SIZE / this.mapWidth;
    const scaleY = MINIMAP_SIZE / this.mapHeight;

    // Draw landmass outlines
    this.graphics.fillStyle(0x2a5a2a, 0.6);
    for (const lm of LANDMASSES) {
      if (lm.polygon.length < 3) continue;
      this.graphics.beginPath();
      this.graphics.moveTo(
        mx + lm.polygon[0].x * scaleX,
        my + lm.polygon[0].y * scaleY,
      );
      for (let i = 1; i < lm.polygon.length; i++) {
        this.graphics.lineTo(
          mx + lm.polygon[i].x * scaleX,
          my + lm.polygon[i].y * scaleY,
        );
      }
      this.graphics.closePath();
      this.graphics.fillPath();
    }

    // Draw port dots
    for (const port of Object.values(PORTS)) {
      const px = mx + port.pos.x * scaleX;
      const py = my + port.pos.y * scaleY;
      this.graphics.fillStyle(0xffdd44, 0.9);
      this.graphics.fillCircle(px, py, 2);
    }

    // Draw entities
    for (const entity of Object.values(world.entities)) {
      const ex = mx + entity.pos.x * scaleX;
      const ey = my + entity.pos.y * scaleY;

      if (entity.id === world.player.shipId) {
        this.graphics.fillStyle(0x00ff00, 1);
        this.graphics.fillCircle(ex, ey, 3);
      } else if (entity.kind === "ship") {
        this.graphics.fillStyle(0xff0000, 0.8);
        this.graphics.fillCircle(ex, ey, 2);
      }
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
