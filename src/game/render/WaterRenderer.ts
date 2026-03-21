/**
 * Ocean surface — seamless mirrored wave texture, no visible tile seams.
 * Draws on 512×512 canvas, then mirrors to 1024×1024 for seamless tiling.
 */
import Phaser from "phaser";

const HALF = 512;
const TEX_SIZE = HALF * 2; // mirrored = 1024

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function generateHalfTexture(seed: number, baseAlpha: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = HALF;
  canvas.height = HALF;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, HALF, HALF);

  // Dense short wave strokes — high count for visibility at max zoom
  const numStrokes = 1200;
  for (let i = 0; i < numStrokes; i++) {
    const sx = hash(i * 3.7, seed * 5.3) * HALF;
    const sy = hash(i * 7.1, seed * 2.9) * HALF;
    const len = 6 + hash(i * 11.3, seed * 8.7) * 25; // shorter strokes
    const baseAngle = smoothNoise(sx * 0.008 + seed, sy * 0.008) * 1.4 - 0.7;
    const strokeAlpha = baseAlpha * (0.8 + hash(i * 13.1, seed * 4.1) * 1.5);
    const width = 0.6 + hash(i * 9.3, seed * 6.7) * 1.0;

    ctx.globalAlpha = strokeAlpha;
    ctx.strokeStyle = hash(i * 5.1, seed) > 0.3 ? "#3366aa" : "#4488bb";
    ctx.lineWidth = width;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    const segments = 4 + Math.floor(hash(i * 2.3, seed * 9.1) * 4);
    let cx = sx, cy = sy;
    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      const noiseY = smoothNoise(cx * 0.02 + seed * 2, cy * 0.02 + i) * 4 - 2;
      cx += len / segments;
      cy = sy + Math.sin(t * Math.PI * 2 + baseAngle) * 2 + noiseY;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  // Tiny glint dots
  ctx.fillStyle = "#6699bb";
  for (let i = 0; i < 200; i++) {
    const gx = hash(i * 17.3, seed * 23.1) * HALF;
    const gy = hash(i * 31.7, seed * 13.9) * HALF;
    ctx.globalAlpha = baseAlpha * (0.8 + hash(i * 7.7, seed * 3.3) * 0.5);
    ctx.beginPath();
    ctx.arc(gx, gy, 0.4 + hash(i * 3.1, seed) * 0.4, 0, Math.PI * 2); // tiny radius
    ctx.fill();
  }

  return canvas;
}

/** Mirror a half-canvas into 4 quadrants for seamless tiling */
function mirrorTexture(half: HTMLCanvasElement): HTMLCanvasElement {
  const full = document.createElement("canvas");
  full.width = TEX_SIZE;
  full.height = TEX_SIZE;
  const ctx = full.getContext("2d")!;

  // Top-left: original
  ctx.drawImage(half, 0, 0);

  // Top-right: flip horizontal
  ctx.save();
  ctx.translate(TEX_SIZE, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(half, 0, 0);
  ctx.restore();

  // Bottom-left: flip vertical
  ctx.save();
  ctx.translate(0, TEX_SIZE);
  ctx.scale(1, -1);
  ctx.drawImage(half, 0, 0);
  ctx.restore();

  // Bottom-right: flip both
  ctx.save();
  ctx.translate(TEX_SIZE, TEX_SIZE);
  ctx.scale(-1, -1);
  ctx.drawImage(half, 0, 0);
  ctx.restore();

  // Soft blur
  const blurred = document.createElement("canvas");
  blurred.width = TEX_SIZE;
  blurred.height = TEX_SIZE;
  const bctx = blurred.getContext("2d")!;
  bctx.filter = "blur(2px)";
  bctx.drawImage(full, 0, 0);

  return blurred;
}

export class WaterRenderer {
  private layer1: Phaser.GameObjects.TileSprite;
  private layer2: Phaser.GameObjects.TileSprite;

  constructor(scene: Phaser.Scene, mapWidth: number, mapHeight: number) {
    if (!scene.textures.exists("water_wave1")) {
      const half1 = generateHalfTexture(0, 0.14);
      scene.textures.addCanvas("water_wave1", mirrorTexture(half1));
    }
    if (!scene.textures.exists("water_wave2")) {
      const half2 = generateHalfTexture(42, 0.10);
      scene.textures.addCanvas("water_wave2", mirrorTexture(half2));
    }

    // Set LINEAR filtering to avoid pixelation at max zoom
    scene.textures.get("water_wave1").setFilter(Phaser.Textures.FilterMode.LINEAR);
    scene.textures.get("water_wave2").setFilter(Phaser.Textures.FilterMode.LINEAR);

    this.layer1 = scene.add.tileSprite(
      mapWidth / 2, mapHeight / 2, mapWidth, mapHeight, "water_wave1",
    );
    this.layer1.setDepth(-998);

    this.layer2 = scene.add.tileSprite(
      mapWidth / 2, mapHeight / 2, mapWidth, mapHeight, "water_wave2",
    );
    this.layer2.setDepth(-997);
    this.layer2.setAlpha(0.7);

  }

  update(windDirRad: number, windStrength: number): void {
    const s1 = 0.06 * windStrength;
    const s2 = 0.03 * windStrength;

    this.layer1.tilePositionX += Math.sin(windDirRad) * s1;
    this.layer1.tilePositionY += -Math.cos(windDirRad) * s1;

    this.layer2.tilePositionX += Math.sin(windDirRad + 0.5) * s2;
    this.layer2.tilePositionY += -Math.cos(windDirRad + 0.5) * s2;

    // Waves hidden at far zoom, fade in at medium zoom
    // zoom <3: invisible, zoom 3→6: fade 0→1.0, zoom 6+: full
    const cam = this.layer1.scene.cameras.main;
    const z = cam.zoom;
    const waveAlpha = z < 3 ? 0 : z < 6 ? (z - 3) / (6 - 3) : 1;
    this.layer1.setAlpha(waveAlpha);
    this.layer2.setAlpha(waveAlpha * 0.7);
  }

  destroy(): void {
    this.layer1.destroy();
    this.layer2.destroy();
  }
}
