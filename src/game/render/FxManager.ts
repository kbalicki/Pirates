import Phaser from "phaser";
import type { Vec2 } from "../../core/model/WorldState.ts";

export class FxManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  spawnSplash(pos: Vec2): void {
    const circle = this.scene.add.circle(pos.x, pos.y, 4, 0xffffff, 0.6);
    circle.setDepth(pos.y + 1000);
    this.scene.tweens.add({
      targets: circle,
      scaleX: 2,
      scaleY: 2,
      alpha: 0,
      duration: 400,
      onComplete: () => circle.destroy(),
    });
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

  spawnSmoke(pos: Vec2): void {
    const circle = this.scene.add.circle(pos.x, pos.y, 8, 0x888888, 0.5);
    circle.setDepth(pos.y + 1000);
    this.scene.tweens.add({
      targets: circle,
      y: pos.y - 20,
      scaleX: 2,
      scaleY: 2,
      alpha: 0,
      duration: 800,
      onComplete: () => circle.destroy(),
    });
  }
}
