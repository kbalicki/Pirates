import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import type { EntityState } from "../../core/model/EntityState.ts";
import type { WorldEvent } from "../../core/model/Events.ts";
import { headingToDir8 } from "../../core/services/Geometry.ts";
import { txt } from "../ui/textStyle.ts";

/**
 * Map headingToDir8 index → sailship spritesheet frame index.
 *
 * headingToDir8: 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW
 * Spritesheet:   row0=[SW,S,SE,E]  row1=[NE,N,NW,W]  → frames 0–7
 * (bowsprit analysis: frame 3=E, frame 7=W, frame 4=NE, frame 6=NW)
 */
export const DIR8_TO_FRAME = [
  5,  // 0 N  → frame 5
  4,  // 1 NE → frame 4
  3,  // 2 E  → frame 3
  2,  // 3 SE → frame 2
  1,  // 4 S  → frame 1
  0,  // 5 SW → frame 0
  7,  // 6 W  → frame 7
  6,  // 7 NW → frame 6
];

export class WorldRenderer {
  private entitySprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private portMarkers: Map<string, Phaser.GameObjects.Graphics> = new Map();

  sync(scene: Phaser.Scene, world: WorldState): void {
    const seenIds = new Set<string>();
    const playerShipId = world.player.shipId as string;

    // Sync entity sprites
    for (const [id, entity] of Object.entries(world.entities)) {
      seenIds.add(id);

      let sprite = this.entitySprites.get(id);

      if (!sprite) {
        sprite = this.createEntitySprite(scene, entity, id === playerShipId);
        this.entitySprites.set(id, sprite);
      }

      // Update position
      sprite.setPosition(entity.pos.x, entity.pos.y);

      // Update direction frame (sailship spritesheet)
      if (entity.kind === "ship") {
        const dir8 = headingToDir8(entity.heading);
        sprite.setFrame(DIR8_TO_FRAME[dir8]);
      }

      // Depth sort: y + offset
      sprite.setDepth(entity.pos.y + entity.depthOffset);
    }

    // Remove sprites for entities that no longer exist
    for (const [id, sprite] of this.entitySprites) {
      if (!seenIds.has(id)) {
        sprite.destroy();
        this.entitySprites.delete(id);
      }
    }
  }

  applyEvents(scene: Phaser.Scene, events: WorldEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case "Toast":
          this.showToast(scene, event.message);
          break;
        case "SpawnFx":
          // Placeholder for particle effects
          break;
      }
    }
  }

  private createEntitySprite(scene: Phaser.Scene, entity: EntityState, _isPlayer: boolean): Phaser.GameObjects.Sprite {
    const textureKey = entity.kind === "ship" ? "sailship" : "fx_default";
    const sprite = scene.add.sprite(entity.pos.x, entity.pos.y, textureKey, 0);
    sprite.setOrigin(0.5, 0.5);
    if (entity.kind === "ship") sprite.setScale(0.33);
    return sprite;
  }

  private showToast(scene: Phaser.Scene, message: string): void {
    const text = scene.add.text(
      scene.cameras.main.width / 2,
      80,
      message,
      { ...txt(16, { color: "#ffffff" }), backgroundColor: "#000000aa", padding: { x: 12, y: 6 } },
    );
    text.setOrigin(0.5);
    text.setScrollFactor(0);
    text.setDepth(10000);

    scene.tweens.add({
      targets: text,
      alpha: 0,
      y: 40,
      duration: 2000,
      delay: 1000,
      onComplete: () => text.destroy(),
    });
  }

  destroy(): void {
    for (const sprite of this.entitySprites.values()) {
      sprite.destroy();
    }
    this.entitySprites.clear();
    for (const marker of this.portMarkers.values()) {
      marker.destroy();
    }
    this.portMarkers.clear();
  }
}
