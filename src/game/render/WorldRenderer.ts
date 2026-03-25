import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import type { EntityState } from "../../core/model/EntityState.ts";
import type { WorldEvent } from "../../core/model/Events.ts";
import { headingToDir8, vec2Dist } from "../../core/services/Geometry.ts";
// FACTIONS import removed — tint disabled due to blue rect artifacts
import { txt } from "../ui/textStyle.ts";

/** Visibility range — how far the player can see NPC ships (in world units) */
const VISION_RANGE = 50;
/** Distance over which ships fade in/out at the edge of vision range */
const FADE_BAND = 25;

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
  /** Vision range circle overlay (Arc, not Graphics — no blue rect) */
  private visionCircle: Phaser.GameObjects.Arc | null = null;
  /** Whether fog-of-war is enabled. OFF by default for debug/testing. */
  fogOfWarEnabled = false;
  /** Animation tick */
  private wakeTick = 0;
  /** Visual positions per entity (velocity-predicted + drift-corrected) */
  private visualPos: Map<string, { x: number; y: number }> = new Map();
  /** Drift correction factor: very gentle pull toward authoritative position */
  private static readonly DRIFT_CORRECTION = 0.03;

  /** Get the current visual position for an entity. */
  getSmoothedPos(id: string, entity: EntityState): { x: number; y: number } {
    return this.visualPos.get(id) ?? entity.pos;
  }

  sync(scene: Phaser.Scene, world: WorldState, deltaSec = 0.016, gameSpeed = 1.2): void {
    this.wakeTick++;
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
        // Reset visual position to prevent velocity prediction artifacts on mode change
        this.visualPos.delete(id);
        // Also manage anchor sprite
        if (curMode === "landed") {
          // Show ghost ship at anchor — same zoom-based scale as sailing ships
          if (entity.anchorPos && id === playerShipId) {
            const anchor = this.createShipSprite(scene, entity);
            anchor.setPosition(entity.anchorPos.x, entity.anchorPos.y);
            anchor.setAlpha(0.4);
            anchor.setDepth(entity.anchorPos.y - 1);
            // Apply zoom-based scaling (same formula as sailing ships)
            const cam = scene.cameras.main;
            const t2 = Math.min(1, (cam.zoom - 1.5) / (12 - 1.5));
            anchor.setScale(0.086 * (0.10 + t2 * 0.23));
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

      // Velocity prediction + drift correction (moves EVERY frame like clouds)
      let vp = this.visualPos.get(id);
      if (!vp) {
        vp = { x: entity.pos.x, y: entity.pos.y };
        this.visualPos.set(id, vp);
      } else if (curMode === "landed") {
        // Landed: snap to position immediately, no velocity prediction
        vp.x = entity.pos.x;
        vp.y = entity.pos.y;
      } else {
        // 1. Predict: advance by velocity (match physics speed exactly)
        const vel = entity.vel ?? { x: 0, y: 0 };
        vp.x += vel.x * deltaSec * 60 * gameSpeed; // 60 = TICK_RATE
        vp.y += vel.y * deltaSec * 60 * gameSpeed;

        // 2. Correct: gently pull toward authoritative physics position
        vp.x += (entity.pos.x - vp.x) * WorldRenderer.DRIFT_CORRECTION;
        vp.y += (entity.pos.y - vp.y) * WorldRenderer.DRIFT_CORRECTION;
      }
      sprite.setPosition(vp.x, vp.y);

      // Update direction frame
      if (entity.kind === "ship") {
        if (curMode === "landed") {
          // PNG crew has no direction frames — only set frame for procedural spritesheet
          if (sprite.texture.key !== "crew_party_img") {
            const dir8 = headingToDir8(entity.heading);
            const crewFrame = DIR8_TO_CREW_FRAME[dir8];
            sprite.setFrame(crewFrame);
          }
        } else {
          const dir8 = headingToDir8(entity.heading);
          sprite.setFrame(DIR8_TO_FRAME[dir8]);
        }
      }

      // Depth sort: y + offset
      sprite.setDepth(vp.y + entity.depthOffset);

      // Scale ship: 33% at max zoom in, smaller at zoom out
      if (entity.kind === "ship" && curMode !== "landed") {
        const cam = scene.cameras.main;
        const baseScale = 0.086; // for 256px frames
        const t = Math.min(1, (cam.zoom - 1.5) / (12 - 1.5));
        const zoomFactor = 0.10 + t * 0.23;
        sprite.setScale(baseScale * zoomFactor);
        // Also scale anchor sprite if present
        const anchorSpr = this.anchorSprites.get(id);
        if (anchorSpr) anchorSpr.setScale(baseScale * zoomFactor);
      }
      // Scale anchor for landed entities too (zoom may change while landed)
      if (curMode === "landed") {
        const anchorSpr = this.anchorSprites.get(id);
        if (anchorSpr) {
          const cam = scene.cameras.main;
          const t = Math.min(1, (cam.zoom - 1.5) / (12 - 1.5));
          anchorSpr.setScale(0.086 * (0.10 + t * 0.23));
        }
      }

      // Wake: irregular arcs from bow to stern, spreading outward
      if (entity.kind === "ship" && curMode === "sailing" && entity.sailLevel > 0) {
        // Use heading + sailLevel for wake (not frame-delta which is 0 between ticks)
        if (this.wakeTick % 4 === 0) {
          const heading = entity.heading;
          const fwX = Math.sin(heading);
          const fwY = -Math.cos(heading);
          const sX = Math.cos(heading);
          const sY = Math.sin(heading);
          const int = Math.min(1, entity.sailLevel);
          const count = 4 + Math.floor(int * 4); // 4-8

          for (let i = 0; i < count; i++) {
            // From bow (-2) to past stern (+3) — not just behind
            const along = -2 + Math.random() * 5;
            // Irregularity: random side offset, wider further back
            const spreadBase = 0.8 + Math.max(0, along) * 0.3;
            const sign = Math.random() > 0.5 ? 1 : -1;
            const hullDist = (spreadBase + Math.random() * 0.4) * sign;

            const wx = vp.x - fwX * along + sX * hullDist;
            const wy = vp.y - fwY * along + sY * hullDist;

            // Random arc params for irregularity
            const radius = 0.2 + Math.random() * 0.25;
            const arcSpan = 20 + Math.random() * 25; // 20-45 degree arc (half length)
            const baseAngle = Phaser.Math.RadToDeg(heading) + (sign > 0 ? -90 : 90);
            const startDeg = baseAngle - arcSpan / 2 + (Math.random() - 0.5) * 30;
            const endDeg = startDeg + arcSpan;
            const col = Math.random() > 0.4 ? 0xffffff : 0xccddff;

            const arc = scene.add.arc(wx, wy, radius, startDeg, endDeg, false, col, 0);
            arc.setStrokeStyle(0.4, col, 0.12);
            arc.setFillStyle(col, 0);
            arc.setDepth(vp.y - 1);
            arc.setClosePath(false);

            // Drift outward + fade + grow slightly
            const driftX = sX * sign * 0.4;
            const driftY = sY * sign * 0.4;
            scene.tweens.add({
              targets: arc,
              alpha: 0,
              x: wx + driftX,
              y: wy + driftY,
              scaleX: 1.2 + Math.random() * 0.3,
              scaleY: 1.2 + Math.random() * 0.3,
              duration: 350 + Math.random() * 350,
              onComplete: () => arc.destroy(),
            });
          }
        }
      }

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

        // Faction tint removed — caused blue rectangles around sprites
        // TODO: replace with small flag sprite next to NPC ship
      }
    }

    // Remove sprites for entities that no longer exist
    for (const [id, sprite] of this.entitySprites) {
      if (!seenIds.has(id)) {
        sprite.destroy();
        this.entitySprites.delete(id);
        this.entityModes.delete(id);
        this.visualPos.delete(id);
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
    // All ships use "sailship" spritesheet (transparent background).
    // AI-generated ship_* PNGs have opaque blue (#0C2340) backgrounds — skip them.
    let textureKey = entity.kind === "ship" ? "sailship" : "fx_default";
    const sprite = scene.add.sprite(entity.pos.x, entity.pos.y, textureKey, 0);
    sprite.setOrigin(0.5, 0.5);
    if (entity.kind === "ship") sprite.setScale(0.086);
    return sprite;
  }

  private createCrewSprite(scene: Phaser.Scene, entity: EntityState): Phaser.GameObjects.Sprite {
    // Use PNG crew sprite if available, fallback to procedural
    const key = scene.textures.exists("crew_party_img") ? "crew_party_img"
      : scene.textures.exists("crew_party") ? "crew_party" : "sailship";
    const sprite = scene.add.sprite(entity.pos.x, entity.pos.y, key, 0);
    sprite.setOrigin(0.5, 0.5);
    // PNG is 256px wide — scale to ~12 world px
    if (key === "crew_party_img") {
      const texW = scene.textures.getFrame(key).width || 256;
      sprite.setScale(12 / texW);
    } else {
      sprite.setScale(key === "crew_party" ? 0.133 : 0.02);
    }
    return sprite;
  }

  private createShipSprite(scene: Phaser.Scene, entity: EntityState): Phaser.GameObjects.Sprite {
    // Use sailship for all — AI ship_* PNGs have opaque blue backgrounds
    const textureKey = "sailship";
    void entity; // suppress unused
    const sprite = scene.add.sprite(0, 0, textureKey, 0);
    sprite.setOrigin(0.5, 0.5);
    sprite.setScale(0.086);
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

  /** Draw vision range circle — uses Arc (not Graphics) to avoid blue rect artifacts. */
  drawVisionCircle(scene: Phaser.Scene, playerPos: { x: number; y: number }): void {
    if (!this.visionCircle) {
      this.visionCircle = scene.add.circle(0, 0, VISION_RANGE, 0x000000, 0);
      this.visionCircle.setStrokeStyle(1.5, 0xccaa55, this.fogOfWarEnabled ? 0.25 : 0.12);
      this.visionCircle.setDepth(100);
    }
    this.visionCircle.setPosition(playerPos.x, playerPos.y);
    this.visionCircle.setRadius(VISION_RANGE);
    const alpha = this.fogOfWarEnabled ? 0.25 : 0.12;
    this.visionCircle.setStrokeStyle(1.5, 0xccaa55, alpha);
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
