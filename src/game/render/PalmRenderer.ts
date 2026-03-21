/**
 * Palm forest renderer — tiles a procedural palm forest texture over land.
 *
 * Uses Phaser TileSprite (auto-repeating) + GeometryMask from land polygons.
 * The texture is 512×512 and tiles at world scale — camera zoom naturally
 * makes it appear smaller when zoomed out, detailed when zoomed in.
 */
import Phaser from "phaser";
import { LANDMASSES } from "../../core/data/geography.ts";
import { chaikinSmooth } from "../../core/services/Geometry.ts";
import { generatePalmForestTexture } from "./PalmForestTexture.ts";

const PALM_DEPTH = -899; // just above land (-900), below cities (500+)
const TILE_SIZE = 512;
// How many world pixels one texture tile covers.
// At max zoom (12x), 64 world px = 768 screen px — good palm detail.
const WORLD_TILE_SIZE = 64;

export class PalmRenderer {
  private tileSprite: Phaser.GameObjects.TileSprite | null = null;
  private maskGfx: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene, _landGrid: boolean[][]) {
    const mapW = 3200;
    const mapH = 2400;

    // Generate tileable palm forest texture
    const forestCanvas = generatePalmForestTexture(TILE_SIZE, 0.012, 1.0, 42);

    // Register as Phaser texture
    const key = "__palm_forest_tile";
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.addCanvas(key, forestCanvas);
    if (tex) tex.setFilter(Phaser.Textures.FilterMode.LINEAR);

    // Create TileSprite covering entire map
    this.tileSprite = scene.add.tileSprite(
      mapW / 2, mapH / 2, mapW, mapH, key,
    );
    this.tileSprite.setOrigin(0.5, 0.5);
    this.tileSprite.setDepth(PALM_DEPTH);

    // Scale the tile pattern: TILE_SIZE texture pixels = WORLD_TILE_SIZE world pixels
    const tileScale = WORLD_TILE_SIZE / TILE_SIZE;
    this.tileSprite.setTileScale(tileScale, tileScale);

    // Create mask from land polygons — palms only visible on land
    this.maskGfx = scene.add.graphics();
    this.maskGfx.setVisible(false); // mask shape doesn't need to be visible

    for (const lm of LANDMASSES) {
      if (lm.polygon.length < 3) continue;
      const pts = chaikinSmooth(lm.polygon, 2);
      this.maskGfx.fillStyle(0xffffff);
      this.maskGfx.beginPath();
      this.maskGfx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        this.maskGfx.lineTo(pts[i].x, pts[i].y);
      }
      this.maskGfx.closePath();
      this.maskGfx.fillPath();
    }

    const mask = new Phaser.Display.Masks.GeometryMask(scene, this.maskGfx);
    this.tileSprite.setMask(mask);

    console.log(`PalmRenderer: TileSprite ${TILE_SIZE}px tile → ${WORLD_TILE_SIZE}px world, masked to land`);
  }

  update(): void {
    // No per-frame update — camera zoom handles scaling naturally
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
