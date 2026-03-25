/**
 * Ocean wave overlay — two photo-based TileSprite layers with parallax movement.
 *
 * Uses the same sea_texture as the base ocean but scrolled at different
 * speeds/angles. Overlapping creates natural wave interference pattern.
 * Visible at zoom 7-10 (normalized). ADD blend mode.
 */
import Phaser from "phaser";

export class WaterRenderer {
  private layer1: Phaser.GameObjects.TileSprite | null = null;
  private layer2: Phaser.GameObjects.TileSprite | null = null;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, mapWidth: number, mapHeight: number) {
    this.scene = scene;

    // Use sea_texture if loaded — same photo as base ocean
    if (!scene.textures.exists("sea_texture")) return;

    // Mirror-tile for seamless joins (same process as MainMapScene sea texture)
    const srcImg = scene.textures.get("sea_texture").getSourceImage() as HTMLImageElement;
    const HALF = Math.min(srcImg.width, srcImg.height, 512);

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = HALF; cropCanvas.height = HALF;
    const cctx = cropCanvas.getContext("2d")!;
    // Use a different crop region than the base texture for variety
    cctx.drawImage(srcImg, srcImg.width / 4, srcImg.height / 4, HALF, HALF, 0, 0, HALF, HALF);

    const mirrorCanvas = document.createElement("canvas");
    mirrorCanvas.width = HALF * 2; mirrorCanvas.height = HALF * 2;
    const mctx = mirrorCanvas.getContext("2d")!;
    mctx.drawImage(cropCanvas, 0, 0);
    mctx.save(); mctx.translate(HALF * 2, 0); mctx.scale(-1, 1);
    mctx.drawImage(cropCanvas, 0, 0); mctx.restore();
    mctx.save(); mctx.translate(0, HALF * 2); mctx.scale(1, -1);
    mctx.drawImage(cropCanvas, 0, 0); mctx.restore();
    mctx.save(); mctx.translate(HALF * 2, HALF * 2); mctx.scale(-1, -1);
    mctx.drawImage(cropCanvas, 0, 0); mctx.restore();

    // Brighten slightly for contrast against base texture
    const bctx = mirrorCanvas.getContext("2d")!;
    bctx.globalCompositeOperation = "lighter";
    bctx.fillStyle = "rgba(30, 50, 60, 0.15)";
    bctx.fillRect(0, 0, HALF * 2, HALF * 2);
    bctx.globalCompositeOperation = "source-over";

    const waveKey = "__wave_overlay";
    if (scene.textures.exists(waveKey)) scene.textures.remove(waveKey);
    const tex = scene.textures.addCanvas(waveKey, mirrorCanvas);
    if (tex) tex.setFilter(Phaser.Textures.FilterMode.LINEAR);

    // Layer 1: moves with wind
    this.layer1 = scene.add.tileSprite(mapWidth / 2, mapHeight / 2, mapWidth, mapHeight, waveKey);
    this.layer1.setOrigin(0.5, 0.5);
    this.layer1.setDepth(-998);
    this.layer1.setBlendMode(Phaser.BlendModes.ADD);
    this.layer1.setTileScale(1 / 12, 1 / 12); // same scale as sea texture
    this.layer1.setAlpha(0);

    // Layer 2: moves at different angle for interference
    this.layer2 = scene.add.tileSprite(mapWidth / 2, mapHeight / 2, mapWidth, mapHeight, waveKey);
    this.layer2.setOrigin(0.5, 0.5);
    this.layer2.setDepth(-997);
    this.layer2.setBlendMode(Phaser.BlendModes.ADD);
    this.layer2.setTileScale(1 / 10, 1 / 10); // slightly different scale for variety
    this.layer2.setAlpha(0);
  }

  update(windDirRad: number, windStrength: number): void {
    if (!this.layer1 || !this.layer2) return;

    // Scroll layers in different directions for wave interference
    const speed1 = 0.8 * windStrength;
    const speed2 = 0.5 * windStrength;
    const angle2 = windDirRad + 0.7; // offset angle for second layer

    this.layer1.tilePositionX += Math.sin(windDirRad) * speed1;
    this.layer1.tilePositionY += -Math.cos(windDirRad) * speed1;

    this.layer2.tilePositionX += Math.sin(angle2) * speed2;
    this.layer2.tilePositionY += -Math.cos(angle2) * speed2;

    // Visible at zoom 7-10 (normalized) = camera 8.85→12
    const cam = this.scene.cameras.main;
    const z = cam.zoom;
    const waveAlpha = z < 8.85 ? 0 : Math.min(1, (z - 8.85) / (12 - 8.85));
    this.layer1.setAlpha(waveAlpha * 0.7);
    this.layer2.setAlpha(waveAlpha * 0.5);
  }

  destroy(): void {
    if (this.layer1) this.layer1.destroy();
    if (this.layer2) this.layer2.destroy();
  }
}
