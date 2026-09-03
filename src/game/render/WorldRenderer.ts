import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import type { EntityState } from "../../core/model/EntityState.ts";
import type { WorldEvent } from "../../core/model/Events.ts";

/** Flag size in screen pixels per texture pixel, held constant across zooms. */
const FLAG_SCREEN_SCALE = 0.8;
/** Where the ensign sits relative to the hull, in flag-sized units. */
const FLAG_OFFSET_X = 7;
const FLAG_OFFSET_Y = 5;
/** Clearance between the top of the ensign and the war streamer above it. */
const PENNANT_GAP = 13;
import { headingToDir8, vec2Dist } from "../../core/services/Geometry.ts";
// FACTIONS import removed — tint disabled due to blue rect artifacts
import { txt } from "../ui/textStyle.ts";

/** Base vision range (world units) — added to mast height bonus */
const BASE_VISION = 25;
/** World-px of vision per meter of mast height */
const RANGE_PER_METER = 1.14;
/** Distance over which ships fade in/out at the edge of vision range */
const FADE_BAND = 25;

/** Calculate vision range from mast height: Pinnace(10m)→36, Sloop(15m)→42, Galleon(35m)→65 */
export function visionRangeForMast(mastHeight: number): number {
  return BASE_VISION + mastHeight * RANGE_PER_METER;
}

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
  /**
   * A small ensign flown beside each NPC hull, keyed by entity id.
   *
   * Whose ship that is has been the single most useful thing on this screen and
   * the hardest to find out: the answer lived in the encounter dialogue, which
   * means sailing up to it. It was a sprite tint once, until v0.9.x, and the
   * tint drew a blue rectangle round every hull — the sprite sheet has no alpha
   * to tint. A separate 16x12 flag has no such problem, and it is the same
   * texture the port markers already fly.
   */
  private flagSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  /**
   * A red streamer above the ensign on anything that fights.
   *
   * The ensign answers "whose"; this answers "what". Every hull on this map is
   * drawn from one sprite sheet, so a merchantman and a frigate of the same
   * crown were, until v0.20.0, indistinguishable until you were close enough to
   * hail — by which time the frigate has decided what it thinks of you.
   */
  private pennantSprites: Map<string, Phaser.GameObjects.Image> = new Map();
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

  /** Get the current visual position for an entity. */
  getSmoothedPos(id: string, entity: EntityState): { x: number; y: number } {
    return this.visualPos.get(id) ?? entity.pos;
  }

  sync(scene: Phaser.Scene, world: WorldState, visionRange = 50): void {
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

      // Direct position — zero smoothing, zero lag
      const vp = { x: entity.pos.x, y: entity.pos.y };
      this.visualPos.set(id, vp);
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
          const count = 12 + Math.floor(int * 12); // 12-24 (3× more)

          for (let i = 0; i < count; i++) {
            const along = -1 + Math.random() * 3; // shorter range: -1 to +2 (was -2 to +3)
            const spreadBase = 0.4 + Math.max(0, along) * 0.2; // tighter spread
            const sign = Math.random() > 0.5 ? 1 : -1;
            const hullDist = (spreadBase + Math.random() * 0.3) * sign;

            const wx = vp.x - fwX * along + sX * hullDist;
            const wy = vp.y - fwY * along + sY * hullDist;

            const radius = 0.1 + Math.random() * 0.12; // 50% smaller radius
            const arcSpan = 10 + Math.random() * 12; // 50% shorter arcs
            const baseAngle = Phaser.Math.RadToDeg(heading) + (sign > 0 ? -90 : 90);
            const startDeg = baseAngle - arcSpan / 2 + (Math.random() - 0.5) * 15;
            const endDeg = startDeg + arcSpan;
            const col = Math.random() > 0.4 ? 0xffffff : 0xccddff;

            const arc = scene.add.arc(wx, wy, radius, startDeg, endDeg, false, col, 0);
            arc.setStrokeStyle(0.3, col, 0.15);
            arc.setFillStyle(col, 0);
            arc.setDepth(vp.y - 1);
            arc.setClosePath(false);

            const driftX = sX * sign * 0.2; // 50% shorter drift
            const driftY = sY * sign * 0.2;
            scene.tweens.add({
              targets: arc,
              alpha: 0,
              x: wx + driftX,
              y: wy + driftY,
              scaleX: 1.1 + Math.random() * 0.15,
              scaleY: 1.1 + Math.random() * 0.15,
              duration: 200 + Math.random() * 200, // shorter lifetime
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
          if (dist > visionRange) {
            sprite.setAlpha(0);
          } else if (dist > visionRange - FADE_BAND) {
            // Smooth fade at edge of vision
            const t = (visionRange - dist) / FADE_BAND;
            sprite.setAlpha(t);
          } else {
            sprite.setAlpha(1);
          }
        } else {
          // Fog-of-war disabled (test mode): show all, dim distant ones slightly
          const dimAlpha = dist > visionRange ? 0.4 : 1.0;
          sprite.setAlpha(dimAlpha);
        }

        this.syncFlag(scene, id, entity, sprite);
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
        const flag = this.flagSprites.get(id);
        if (flag) { flag.destroy(); this.flagSprites.delete(id); }
        const pennant = this.pennantSprites.get(id);
        if (pennant) { pennant.destroy(); this.pennantSprites.delete(id); }
      }
    }
  }

  /**
   * Fly the right colours beside an NPC hull.
   *
   * Follows the hull's own alpha, so a ship fading out at the edge of vision
   * takes its ensign with it and the fog is never given away by a flag hanging
   * in empty water. Held at a constant *screen* size rather than scaled with
   * the hull: at low zoom a proportional flag is two pixels of mud, and the
   * whole point of it is to be read at a glance.
   */
  private syncFlag(
    scene: Phaser.Scene,
    id: string,
    entity: EntityState,
    hull: Phaser.GameObjects.Sprite,
  ): void {
    const faction = entity.ship?.factionId as string | undefined;
    const key = faction ? `flag_${faction}` : undefined;
    if (!key || !scene.textures.exists(key)) return;

    let flag = this.flagSprites.get(id);
    if (!flag) {
      flag = scene.add.image(hull.x, hull.y, key);
      flag.setOrigin(0, 1);
      this.flagSprites.set(id, flag);
    } else if (flag.texture.key !== key) {
      // A hull that changed hands — a prize, or a town's colours changing under
      // a ship still at sea. Cheaper than destroying and rebuilding it.
      flag.setTexture(key);
    }

    const zoom = scene.cameras.main.zoom;
    const scale = FLAG_SCREEN_SCALE / Math.max(0.1, zoom);
    flag.setScale(scale);
    // Off the stern quarter, clear of the hull and of its own wake.
    flag.setPosition(hull.x + FLAG_OFFSET_X * scale, hull.y - FLAG_OFFSET_Y * scale);
    flag.setDepth(hull.depth + 1);
    flag.setAlpha(hull.alpha);
    flag.setVisible(hull.visible && hull.alpha > 0.05);

    this.syncPennant(scene, id, entity, flag, scale);
  }

  /** The war streamer, flown only by hulls that will fight. */
  private syncPennant(
    scene: Phaser.Scene,
    id: string,
    entity: EntityState,
    flag: Phaser.GameObjects.Image,
    scale: number,
  ): void {
    const behavior = entity.ai?.behavior;
    const fights = behavior === "navy" || behavior === "pirate" || behavior === "pirate_hunter";
    let pennant = this.pennantSprites.get(id);

    if (!fights || !scene.textures.exists("pennant_war")) {
      if (pennant) { pennant.destroy(); this.pennantSprites.delete(id); }
      return;
    }

    if (!pennant) {
      pennant = scene.add.image(flag.x, flag.y, "pennant_war");
      pennant.setOrigin(0, 1);
      this.pennantSprites.set(id, pennant);
    }
    pennant.setScale(scale);
    pennant.setPosition(flag.x, flag.y - PENNANT_GAP * scale);
    pennant.setDepth(flag.depth);
    pennant.setAlpha(flag.alpha);
    pennant.setVisible(flag.visible);
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
  drawVisionCircle(scene: Phaser.Scene, playerPos: { x: number; y: number }, visionRange: number): void {
    if (!this.visionCircle) {
      this.visionCircle = scene.add.circle(0, 0, visionRange, 0x000000, 0);
      this.visionCircle.setStrokeStyle(1.5, 0xccaa55, this.fogOfWarEnabled ? 0.25 : 0.12);
      this.visionCircle.setDepth(100);
    }
    this.visionCircle.setPosition(playerPos.x, playerPos.y);
    this.visionCircle.setRadius(visionRange);
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
