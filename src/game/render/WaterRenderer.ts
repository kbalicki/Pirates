/**
 * Ocean surface renderer.
 *
 * Wave overlay DISABLED — procedural canvas strokes looked blocky/square.
 * Sea texture (sea_texture.png TileSprite) provides ocean detail at close zoom.
 * This class kept as placeholder for future wave implementation (shader or photo-based).
 */
import Phaser from "phaser";

export class WaterRenderer {
  private layer1: Phaser.GameObjects.TileSprite;
  private layer2: Phaser.GameObjects.TileSprite;

  constructor(scene: Phaser.Scene, _mapWidth: number, _mapHeight: number) {
    const emptyCanvas = document.createElement("canvas");
    emptyCanvas.width = 4; emptyCanvas.height = 4;
    if (!scene.textures.exists("water_empty")) {
      scene.textures.addCanvas("water_empty", emptyCanvas);
    }
    this.layer1 = scene.add.tileSprite(0, 0, 1, 1, "water_empty");
    this.layer1.setVisible(false);
    this.layer2 = scene.add.tileSprite(0, 0, 1, 1, "water_empty");
    this.layer2.setVisible(false);
  }

  update(_windDirRad: number, _windStrength: number): void {
    // Wave overlay disabled
  }

  destroy(): void {
    this.layer1.destroy();
    this.layer2.destroy();
  }
}
