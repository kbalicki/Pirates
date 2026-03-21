/**
 * Land texture renderer — tiles a photo texture (tropical forest from above)
 * over land areas using TileSprite + GeometryMask.
 *
 * Uses land_texture.png if available, falls back to procedural generation.
 * Camera zoom naturally scales the texture.
 */
import Phaser from "phaser";
import { LANDMASSES } from "../../core/data/geography.ts";
import { chaikinSmooth } from "../../core/services/Geometry.ts";

const LAND_TEX_DEPTH = -899; // just above land (-900), below cities (500+)
const MAX_ZOOM = 12;

export class PalmRenderer {
  private tileSprite: Phaser.GameObjects.TileSprite | null = null;
  private maskGfx: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene, _landGrid: boolean[][]) {
    const mapW = 3200;
    const mapH = 2400;

    // Use photo texture if loaded, otherwise skip
    let texKey = "land_texture";
    if (!scene.textures.exists(texKey)) {
      console.log("PalmRenderer: no land_texture found, skipping");
      return;
    }

    // Set LINEAR filtering for smooth scaling
    scene.textures.get(texKey).setFilter(Phaser.Textures.FilterMode.LINEAR);

    // Mirror-tile for seamless joins
    const srcImg = scene.textures.get(texKey).getSourceImage() as HTMLImageElement;
    const HALF = Math.min(srcImg.width, srcImg.height, 1024);
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = HALF;
    cropCanvas.height = HALF;
    const cctx = cropCanvas.getContext("2d")!;
    cctx.drawImage(srcImg, 0, 0, srcImg.width, srcImg.height, 0, 0, HALF, HALF);

    const mirrorCanvas = document.createElement("canvas");
    mirrorCanvas.width = HALF * 2;
    mirrorCanvas.height = HALF * 2;
    const mctx = mirrorCanvas.getContext("2d")!;
    mctx.drawImage(cropCanvas, 0, 0);
    mctx.save(); mctx.translate(HALF * 2, 0); mctx.scale(-1, 1);
    mctx.drawImage(cropCanvas, 0, 0); mctx.restore();
    mctx.save(); mctx.translate(0, HALF * 2); mctx.scale(1, -1);
    mctx.drawImage(cropCanvas, 0, 0); mctx.restore();
    mctx.save(); mctx.translate(HALF * 2, HALF * 2); mctx.scale(-1, -1);
    mctx.drawImage(cropCanvas, 0, 0); mctx.restore();

    const mirrorKey = "__land_mirror";
    if (scene.textures.exists(mirrorKey)) scene.textures.remove(mirrorKey);
    const mirrorTex = scene.textures.addCanvas(mirrorKey, mirrorCanvas);
    if (mirrorTex) mirrorTex.setFilter(Phaser.Textures.FilterMode.LINEAR);

    // TileSprite covering entire map
    this.tileSprite = scene.add.tileSprite(mapW / 2, mapH / 2, mapW, mapH, mirrorKey);
    this.tileSprite.setOrigin(0.5, 0.5);
    this.tileSprite.setDepth(LAND_TEX_DEPTH);

    // Scale: 1 texel ≈ 1 screen pixel at max zoom (same as sea texture)
    const tileScale = 1 / MAX_ZOOM;
    this.tileSprite.setTileScale(tileScale, tileScale);

    // GeometryMask: clips land texture strictly to land polygons (no leaking onto water)
    this.maskGfx = scene.add.graphics();
    this.maskGfx.setVisible(false);
    for (const lm of LANDMASSES) {
      if (lm.polygon.length < 3) continue;
      const pts = chaikinSmooth(lm.polygon, 2);
      this.maskGfx.fillStyle(0xffffff);
      this.maskGfx.beginPath();
      this.maskGfx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) this.maskGfx.lineTo(pts[i].x, pts[i].y);
      this.maskGfx.closePath();
      this.maskGfx.fillPath();
    }
    this.tileSprite.setMask(new Phaser.Display.Masks.GeometryMask(scene, this.maskGfx));

    console.log(`PalmRenderer: land_texture mirror-tiled, tileScale ${tileScale.toFixed(4)}`);
  }

  update(): void {
    // Static — camera zoom handles scaling naturally
  }

  destroy(): void {
    if (this.tileSprite) {
      this.tileSprite.clearMask(true);
      this.tileSprite.destroy();
      this.tileSprite = null;
    }
    if (this.maskGfx) {
      this.maskGfx.destroy();
      this.maskGfx = null;
    }
  }
}
