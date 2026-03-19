import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import { PORTS } from "../../core/data/ports.ts";
import { LANDMASSES } from "../../core/data/geography.ts";
import { FACTIONS } from "../../core/data/factions.ts";
import { vec2Dist } from "../../core/services/Geometry.ts";

const MINIMAP_SIZE = 160;
const MINIMAP_MARGIN = 10;

export class MinimapRenderer {
  private graphics: Phaser.GameObjects.Graphics;
  private mapWidth: number;
  private mapHeight: number;
  /** Synced with WorldRenderer.fogOfWarEnabled */
  fogOfWarEnabled = false;

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
    const playerEntity = world.entities[world.player.shipId as string];
    for (const entity of Object.values(world.entities)) {
      const ex = mx + entity.pos.x * scaleX;
      const ey = my + entity.pos.y * scaleY;

      if (entity.id === world.player.shipId) {
        // Player: green dot
        this.graphics.fillStyle(0x00ff00, 1);
        this.graphics.fillCircle(ex, ey, 3);
      } else if (entity.kind === "ship" && entity.ai) {
        // NPC ships: faction-colored dots
        // Respect fog-of-war if enabled
        if (this.fogOfWarEnabled && playerEntity) {
          const dist = vec2Dist(entity.pos, playerEntity.pos);
          if (dist > 200) continue; // Skip dots outside vision range
        }
        const factionKey = entity.ship?.factionId as string;
        const factionDef = FACTIONS[factionKey];
        const color = factionDef?.color ?? 0xff0000;
        this.graphics.fillStyle(color, 0.9);
        this.graphics.fillCircle(ex, ey, 2);
      }
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
