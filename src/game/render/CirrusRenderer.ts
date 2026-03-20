/**
 * High-altitude cirrus clouds — thin silver wisps visible at far zoom.
 * Adds depth and sense of height to the map when zoomed out.
 * Only visible below zoom ~5 (disappear when zoomed in close).
 *
 * Separate module — does not affect other renderers.
 */
import Phaser from "phaser";

const NUM_WISPS = 40;
const CIRRUS_DEPTH = 5000; // ABOVE cumulus clouds so always visible
const DRIFT_SPEED = 0.04; // very slow — high altitude

interface CirrusWisp {
  image: Phaser.GameObjects.Image;
  x: number;
  y: number;
  speed: number;
}

export class CirrusRenderer {
  private scene: Phaser.Scene;
  private wisps: CirrusWisp[] = [];
  private mapW: number;
  private mapH: number;
  private textureReady = false;

  constructor(scene: Phaser.Scene, mapWidth: number, mapHeight: number) {
    this.scene = scene;
    this.mapW = mapWidth;
    this.mapH = mapHeight;

    // Generate cirrus texture: thin stretched wisps
    this.generateTexture();

    if (!this.textureReady) return;

    for (let i = 0; i < NUM_WISPS; i++) {
      this.spawnWisp(
        Math.random() * mapWidth,
        Math.random() * mapHeight,
      );
    }
  }

  private generateTexture(): void {
    if (this.scene.textures.exists("cirrus")) {
      this.textureReady = true;
      return;
    }

    // Large soft translucent blob — like thin high-altitude haze
    const S = 256;
    const canvas = document.createElement("canvas");
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext("2d")!;

    // Multiple overlapping soft radial gradients for organic haze shape
    const blobs = [
      { x: 0.5, y: 0.5, r: 0.45, a: 0.25 },
      { x: 0.3, y: 0.4, r: 0.3, a: 0.18 },
      { x: 0.7, y: 0.55, r: 0.35, a: 0.20 },
      { x: 0.4, y: 0.6, r: 0.25, a: 0.15 },
      { x: 0.6, y: 0.35, r: 0.28, a: 0.18 },
    ];

    for (const b of blobs) {
      const cx = b.x * S, cy = b.y * S, r = b.r * S;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `rgba(220,230,245,${b.a})`);
      grad.addColorStop(0.5, `rgba(210,220,240,${b.a * 0.5})`);
      grad.addColorStop(1, "rgba(200,215,235,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, S, S);
    }

    // Heavy blur for very soft haze
    const blurred = document.createElement("canvas");
    blurred.width = S;
    blurred.height = S;
    const bctx = blurred.getContext("2d")!;
    bctx.filter = "blur(8px)";
    bctx.drawImage(canvas, 0, 0);

    this.scene.textures.addCanvas("cirrus", blurred);
    this.scene.textures.get("cirrus").setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.textureReady = true;
  }

  private spawnWisp(x: number, y: number): void {
    const img = this.scene.add.image(x, y, "cirrus");
    img.setDepth(CIRRUS_DEPTH);

    // Large, wide haze patches — clearly visible at far zoom
    const scaleX = 3.0 + Math.random() * 5.0;
    const scaleY = 2.0 + Math.random() * 3.0;
    img.setScale(scaleX, scaleY);
    img.setAlpha(0.5 + Math.random() * 0.3);

    // Slight angle
    img.setAngle((Math.random() - 0.5) * 20);

    if (Math.random() > 0.5) img.setFlipX(true);

    this.wisps.push({
      image: img,
      x, y,
      speed: 0.7 + Math.random() * 0.6,
    });
  }

  update(windDirRad: number, windStrength: number): void {
    const cam = this.scene.cameras.main;

    // Visible only at far zoom — fade fast: full at zoom 1.5, invisible at zoom 2.5
    const fadeStart = 2.0, fadeEnd = 2.5;
    const visibility = cam.zoom < fadeStart ? 1.0 :
      cam.zoom < fadeEnd ? 1 - (cam.zoom - fadeStart) / (fadeEnd - fadeStart) : 0;

    const moveAngle = windDirRad + Math.PI;
    const dx = Math.sin(moveAngle) * DRIFT_SPEED * windStrength;
    const dy = -Math.cos(moveAngle) * DRIFT_SPEED * windStrength;

    for (const wisp of this.wisps) {
      // Drift with wind (slower than cumulus — higher altitude)
      wisp.x += dx * wisp.speed;
      wisp.y += dy * wisp.speed;

      // Wrap around
      if (wisp.x < -200) wisp.x += this.mapW + 400;
      if (wisp.x > this.mapW + 200) wisp.x -= this.mapW + 400;
      if (wisp.y < -100) wisp.y += this.mapH + 200;
      if (wisp.y > this.mapH + 100) wisp.y -= this.mapH + 200;

      wisp.image.setPosition(wisp.x, wisp.y);
      wisp.image.setVisible(visibility > 0.01);
      if (visibility > 0.01) {
        wisp.image.setAlpha(wisp.image.getData("baseAlpha") ?? 0.4 * visibility);
      }
    }

    // Store base alpha on first run
    if (this.wisps.length > 0 && !this.wisps[0].image.getData("baseAlpha")) {
      for (const wisp of this.wisps) {
        wisp.image.setData("baseAlpha", wisp.image.alpha);
      }
    }

    // Apply visibility fade
    for (const wisp of this.wisps) {
      const base = wisp.image.getData("baseAlpha") as number ?? 0.4;
      wisp.image.setAlpha(base * visibility);
    }
  }

  destroy(): void {
    for (const wisp of this.wisps) wisp.image.destroy();
    this.wisps = [];
  }
}
