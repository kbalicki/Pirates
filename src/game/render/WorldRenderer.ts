import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import type { EntityState } from "../../core/model/EntityState.ts";
import type { WorldEvent } from "../../core/model/Events.ts";
import { headingToDir8, vec2Dist } from "../../core/services/Geometry.ts";
import { FACTIONS } from "../../core/data/factions.ts";
import { txt } from "../ui/textStyle.ts";

/** Visibility range — how far the player can see NPC ships (in world units) */
const VISION_RANGE = 200;
/** Distance over which ships fade in/out at the edge of vision range */
const FADE_BAND = 50;

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

/** Map 8-direction → crew spritesheet frame (4 frames: 0=S, 1=W, 2=E, 3=N). */
const DIR8_TO_CREW_FRAME = [
  3,  // 0 N
  2,  // 1 NE → E
  2,  // 2 E
  0,  // 3 SE → S
  0,  // 4 S
  1,  // 5 SW → W
  1,  // 6 W
  3,  // 7 NW → N
];

export class WorldRenderer {
  private entitySprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  /** Anchor ship sprite shown at dock position when crew is on land. */
  private anchorSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private portMarkers: Map<string, Phaser.GameObjects.Graphics> = new Map();
  /** Track mode per entity to detect mode changes. */
  private entityModes: Map<string, string> = new Map();
  /** Vision range circle overlay */
  private visionCircle: Phaser.GameObjects.Graphics | null = null;
  /** Whether fog-of-war is enabled. OFF by default for debug/testing. */
  fogOfWarEnabled = false;

  sync(scene: Phaser.Scene, world: WorldState): void {
    const seenIds = new Set<string>();
    const playerShipId = world.player.shipId as string;
    const playerEntity = world.entities[playerShipId];

    // Sync entity sprites
    for (const [id, entity] of Object.entries(world.entities)) {
      seenIds.add(id);

      const prevMode = this.entityModes.get(id);
      const curMode = entity.mode ?? "sailing";

      // If mode changed, destroy old sprite so we create new one with correct texture
      if (prevMode && prevMode !== curMode) {
        const oldSprite = this.entitySprites.get(id);
        if (oldSprite) { oldSprite.destroy(); this.entitySprites.delete(id); }
        // Also manage anchor sprite
        if (curMode === "landed") {
          // Show ghost ship at anchor
          if (entity.anchorPos && id === playerShipId) {
            const anchor = this.createShipSprite(scene, entity);
            anchor.setPosition(entity.anchorPos.x, entity.anchorPos.y);
            anchor.setAlpha(0.4);
            anchor.setDepth(entity.anchorPos.y - 1);
            this.anchorSprites.set(id, anchor);
          }
        } else {
          // Remove anchor sprite
          const anchorSpr = this.anchorSprites.get(id);
          if (anchorSpr) { anchorSpr.destroy(); this.anchorSprites.delete(id); }
        }
      }
      this.entityModes.set(id, curMode);

      let sprite = this.entitySprites.get(id);

      if (!sprite) {
        if (curMode === "landed" && id === playerShipId) {
          sprite = this.createCrewSprite(scene, entity);
        } else {
          sprite = this.createEntitySprite(scene, entity, id === playerShipId);
        }
        this.entitySprites.set(id, sprite);
      }

      // Update position
      sprite.setPosition(entity.pos.x, entity.pos.y);

      // Update direction frame
      if (entity.kind === "ship") {
        if (curMode === "landed") {
          // Crew sprite: 4 direction frames (D, L, R, U)
          const dir8 = headingToDir8(entity.heading);
          const crewFrame = DIR8_TO_CREW_FRAME[dir8];
          sprite.setFrame(crewFrame);
        } else {
          const dir8 = headingToDir8(entity.heading);
          sprite.setFrame(DIR8_TO_FRAME[dir8]);
        }
      }

      // Depth sort: y + offset
      sprite.setDepth(entity.pos.y + entity.depthOffset);

      // NPC visibility: fog-of-war alpha based on distance to player
      const isPlayer = id === playerShipId;
      if (!isPlayer && entity.ai && playerEntity) {
        const dist = vec2Dist(entity.pos, playerEntity.pos);
        if (this.fogOfWarEnabled) {
          if (dist > VISION_RANGE) {
            sprite.setAlpha(0);
          } else if (dist > VISION_RANGE - FADE_BAND) {
            // Smooth fade at edge of vision
            const t = (VISION_RANGE - dist) / FADE_BAND;
            sprite.setAlpha(t);
          } else {
            sprite.setAlpha(1);
          }
        } else {
          // Fog-of-war disabled (test mode): show all, dim distant ones slightly
          const dimAlpha = dist > VISION_RANGE ? 0.4 : 1.0;
          sprite.setAlpha(dimAlpha);
        }

        // Faction color tint for NPC ships
        const factionKey = entity.ship?.factionId as string;
        const factionDef = FACTIONS[factionKey];
        if (factionDef) {
          sprite.setTint(factionDef.color);
        }
      }
    }

    // Remove sprites for entities that no longer exist
    for (const [id, sprite] of this.entitySprites) {
      if (!seenIds.has(id)) {
        sprite.destroy();
        this.entitySprites.delete(id);
        this.entityModes.delete(id);
        const anchor = this.anchorSprites.get(id);
        if (anchor) { anchor.destroy(); this.anchorSprites.delete(id); }
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
    let textureKey = "sailship";
    if (entity.kind === "ship" && entity.ship) {
      // Map ship classId to AI-generated spritesheet texture
      const classId = entity.ship.classId as string;
      const classToTexture: Record<string, string> = {
        sloop: "ship_sloop",
        brigantine: "ship_brigantine",
        frigate: "ship_frigate",
        galleon: "ship_galleon",
        merchantman: "ship_merchant",
      };
      const aiKey = classToTexture[classId];
      if (aiKey && scene.textures.exists(aiKey)) {
        textureKey = aiKey;
      }
    } else if (entity.kind !== "ship") {
      textureKey = "fx_default";
    }
    const sprite = scene.add.sprite(entity.pos.x, entity.pos.y, textureKey, 0);
    sprite.setOrigin(0.5, 0.5);
    if (entity.kind === "ship") sprite.setScale(0.33);
    return sprite;
  }

  private createCrewSprite(scene: Phaser.Scene, entity: EntityState): Phaser.GameObjects.Sprite {
    const key = scene.textures.exists("crew_party") ? "crew_party" : "sailship";
    const sprite = scene.add.sprite(entity.pos.x, entity.pos.y, key, 0);
    sprite.setOrigin(0.5, 0.5);
    sprite.setScale(key === "crew_party" ? 1.0 : 0.2);
    return sprite;
  }

  private createShipSprite(scene: Phaser.Scene, entity: EntityState): Phaser.GameObjects.Sprite {
    let textureKey = "sailship";
    if (entity.ship) {
      const classId = entity.ship.classId as string;
      const classToTexture: Record<string, string> = {
        sloop: "ship_sloop", brigantine: "ship_brigantine",
        frigate: "ship_frigate", galleon: "ship_galleon", merchantman: "ship_merchant",
      };
      const aiKey = classToTexture[classId];
      if (aiKey && scene.textures.exists(aiKey)) textureKey = aiKey;
    }
    const sprite = scene.add.sprite(0, 0, textureKey, 0);
    sprite.setOrigin(0.5, 0.5);
    sprite.setScale(0.33);
    if (entity.kind === "ship") {
      const dir8 = headingToDir8(entity.heading);
      sprite.setFrame(DIR8_TO_FRAME[dir8]);
    }
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

  /** Draw a subtle vision range circle around the player ship (always visible). */
  drawVisionCircle(scene: Phaser.Scene, playerPos: { x: number; y: number }): void {
    if (!this.visionCircle) {
      this.visionCircle = scene.add.graphics();
      this.visionCircle.setDepth(100);
    }
    this.visionCircle.clear();

    const cx = playerPos.x;
    const cy = playerPos.y;
    const r = VISION_RANGE;

    // Smooth circle — brighter when fog enabled, dimmer when debug mode
    const alpha = this.fogOfWarEnabled ? 0.2 : 0.08;
    const color = this.fogOfWarEnabled ? 0x88bbff : 0xffffff;

    this.visionCircle.lineStyle(1.5, color, alpha);
    this.visionCircle.strokeCircle(cx, cy, r);
  }

  destroy(): void {
    for (const sprite of this.entitySprites.values()) sprite.destroy();
    this.entitySprites.clear();
    for (const sprite of this.anchorSprites.values()) sprite.destroy();
    this.anchorSprites.clear();
    this.entityModes.clear();
    for (const marker of this.portMarkers.values()) marker.destroy();
    this.portMarkers.clear();
    if (this.visionCircle) { this.visionCircle.destroy(); this.visionCircle = null; }
  }
}
