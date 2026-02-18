import Phaser from "phaser";
import type { EntityState } from "../../core/model/EntityState.ts";

export function createEntityView(scene: Phaser.Scene, entity: EntityState): Phaser.GameObjects.Sprite {
  const textureKey = entity.kind === "ship" ? "sailship" : "fx_default";
  const sprite = scene.add.sprite(entity.pos.x, entity.pos.y, textureKey, 0);
  sprite.setOrigin(0.5, 0.5);
  return sprite;
}
