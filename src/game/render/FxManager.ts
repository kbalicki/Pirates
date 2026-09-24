import type Phaser from "phaser";
import type { Vec2 } from "../../core/model/WorldState.ts";

export class FxManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  spawnHit(pos: Vec2): void {
    const circle = this.scene.add.circle(pos.x, pos.y, 6, 0xff4400, 0.8);
    circle.setDepth(pos.y + 1000);
    this.scene.tweens.add({
      targets: circle,
      scaleX: 3,
      scaleY: 3,
      alpha: 0,
      duration: 600,
      onComplete: () => circle.destroy(),
    });
  }
}
