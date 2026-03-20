/**
 * Layered volumetric clouds — inspired by codepen spite/DgQzLv.
 * Reference: https://codepen.io/spite/pen/DgQzLv
 *
 * Each cloud = cluster of 3-5 overlapping Image sprites at different
 * offsets/scales/alphas, creating illusion of 3D depth.
 * Layers drift at slightly different speeds for parallax effect.
 */
import Phaser from "phaser";

const MIN_CLOUDS = 800;
const MAX_CLOUDS = 1300;
const CLOUD_BASE_SPEED = 0.15;
const CLOUD_DEPTH = 4000;
const CULL_MARGIN = 150;
const SPAWN_MARGIN = 400;
const FADE_IN_RATE = 0.004;
// Each cloud = 3-5 layers for volumetric depth

interface CloudLayer {
  image: Phaser.GameObjects.Image;
  offsetX: number; // relative offset from cluster center
  offsetY: number;
  speedMul: number; // parallax speed multiplier (0.8-1.2)
}

interface CloudCluster {
  layers: CloudLayer[];
  x: number;
  y: number;
  width: number;
  height: number;
  targetAlpha: number;
  currentAlpha: number;
  speedMultiplier: number;
}

export class CloudRenderer {
  private scene: Phaser.Scene;
  private mapWidth: number;
  private mapHeight: number;
  private clouds: CloudCluster[] = [];
  private seed: number = 9973;
  private spriteKeys: string[] = [];

  constructor(scene: Phaser.Scene, mapWidth: number, mapHeight: number) {
    this.scene = scene;
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;

    // Use the spite codepen cloud texture (single puffy cloud PNG)
    if (scene.textures.exists("cloud_spite")) {
      scene.textures.get("cloud_spite").setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.spriteKeys.push("cloud_spite");
    }

    if (this.spriteKeys.length === 0) return;

    // Spawn initial clouds across entire map
    const count = MIN_CLOUDS + Math.floor(this.rand() * (MAX_CLOUDS - MIN_CLOUDS + 1));
    for (let i = 0; i < count; i++) {
      const x = this.rand() * this.mapWidth;
      const y = this.rand() * this.mapHeight;
      this.spawnCloud(x, y, true);
    }
  }

  update(windDirRad: number, windStrength: number): void {
    const cam = this.scene.cameras.main;
    const moveAngle = windDirRad + Math.PI;
    const dxUnit = Math.sin(moveAngle);
    const dyUnit = -Math.cos(moveAngle);

    // Zoom-based scale: smaller at all zooms (half size at max zoom)
    // At zoom 1.5 (min): scale 0.15, at zoom 12 (max): scale 0.5
    const zoomScale = 0.15 + (cam.zoom - 1.5) / (12 - 1.5) * 0.35;

    for (const cloud of this.clouds) {
      const speed = CLOUD_BASE_SPEED * windStrength * cloud.speedMultiplier;
      cloud.x += dxUnit * speed;
      cloud.y += dyUnit * speed;

      // Update each layer with slight parallax offset + zoom scaling
      for (const layer of cloud.layers) {
        const lSpeed = speed * layer.speedMul;
        const lx = cloud.x + layer.offsetX + dxUnit * lSpeed * 0.3;
        const ly = cloud.y + layer.offsetY + dyUnit * lSpeed * 0.3;
        layer.image.setPosition(lx, ly);
        // Apply zoom scale on top of original layer scale
        const origSx = layer.image.getData("origSx") as number;
        const origSy = layer.image.getData("origSy") as number;
        if (origSx) {
          layer.image.setScale(origSx * zoomScale, origSy * zoomScale);
        }
      }

      // Fade in
      if (cloud.currentAlpha < cloud.targetAlpha) {
        cloud.currentAlpha = Math.min(cloud.targetAlpha, cloud.currentAlpha + FADE_IN_RATE);
        for (let i = 0; i < cloud.layers.length; i++) {
          // Inner layers more opaque, outer layers more transparent
          const layerFactor = 1 - (i / cloud.layers.length) * 0.4;
          cloud.layers[i].image.setAlpha(cloud.currentAlpha * layerFactor);
        }
      }
    }

    // Cull clouds outside view
    const viewLeft = cam.scrollX - CULL_MARGIN;
    const viewRight = cam.scrollX + cam.width + CULL_MARGIN;
    const viewTop = cam.scrollY - CULL_MARGIN;
    const viewBottom = cam.scrollY + cam.height + CULL_MARGIN;

    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      const out = c.x + c.width < viewLeft || c.x - c.width > viewRight ||
                  c.y + c.height < viewTop || c.y - c.height > viewBottom ||
                  c.x < -CULL_MARGIN || c.x > this.mapWidth + CULL_MARGIN ||
                  c.y < -CULL_MARGIN || c.y > this.mapHeight + CULL_MARGIN;
      if (out) {
        for (const layer of c.layers) layer.image.destroy();
        this.clouds.splice(i, 1);
      }
    }

    // Respawn
    while (this.clouds.length < MIN_CLOUDS) {
      const pos = this.getUpwindSpawnPosition(windDirRad, cam);
      if (pos) this.spawnCloud(pos.x, pos.y, false);
      else break;
    }
    if (this.clouds.length < MAX_CLOUDS && this.rand() < 0.01) {
      const pos = this.getUpwindSpawnPosition(windDirRad, cam);
      if (pos) this.spawnCloud(pos.x, pos.y, false);
    }
  }

  destroy(): void {
    for (const cloud of this.clouds) {
      for (const layer of cloud.layers) layer.image.destroy();
    }
    this.clouds = [];
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private spawnCloud(x: number, y: number, initialFull: boolean): void {
    if (this.spriteKeys.length === 0) return;

    // Wide variety: tiny wisps to massive cumulus
    const sizeRoll = this.rand();
    let baseScale: number, numLayers: number, targetAlpha: number;

    if (sizeRoll < 0.3) {
      // Small wisp (30%) — alpha 50-65%
      baseScale = 0.06 + this.rand() * 0.08;
      numLayers = 2 + Math.floor(this.rand() * 3);
      targetAlpha = 0.50 + this.rand() * 0.15;
    } else if (sizeRoll < 0.7) {
      // Medium cloud (40%) — alpha 55-80%
      baseScale = 0.12 + this.rand() * 0.2;
      numLayers = 5 + Math.floor(this.rand() * 6);
      targetAlpha = 0.55 + this.rand() * 0.25;
    } else {
      // Large cumulus (30%) — alpha 65-90%
      baseScale = 0.25 + this.rand() * 0.4;
      numLayers = 8 + Math.floor(this.rand() * 10);
      targetAlpha = 0.65 + this.rand() * 0.25;
    }

    const startAlpha = initialFull ? targetAlpha : 0;
    const speedMultiplier = Math.max(0.2, 1.5 - baseScale);

    const layers: CloudLayer[] = [];
    // Random horizontal stretch per cloud (1.0 = round, 2.0 = wide flat)
    const cloudStretchX = 0.8 + this.rand() * 1.5;
    const cloudStretchY = 0.5 + this.rand() * 0.7;

    for (let i = 0; i < numLayers; i++) {
      const key = this.spriteKeys[Math.floor(this.rand() * this.spriteKeys.length)];
      const img = this.scene.add.image(x, y, key);
      img.setDepth(CLOUD_DEPTH + i);

      // Each layer varies in scale — store original for zoom scaling
      const layerScale = baseScale * (0.5 + this.rand() * 0.7);
      const sx = layerScale * cloudStretchX;
      const sy = layerScale * cloudStretchY;
      img.setScale(sx, sy);
      img.setData("origSx", sx);
      img.setData("origSy", sy);

      // Accumulating alpha
      const layerAlpha = startAlpha * (0.2 + this.rand() * 0.4);
      img.setAlpha(layerAlpha);

      // Flip for variety
      if (this.rand() > 0.5) img.setFlipX(true);
      if (this.rand() > 0.5) img.setFlipY(true);

      // Slight rotation per layer for organic look
      img.setAngle((this.rand() - 0.5) * 40);

      img.setTint(0xffffff);

      // Tight clustering — spread proportional to cloud size
      const spread = baseScale * 20 * this.rand();
      const offsetAngle = this.rand() * Math.PI * 2;

      layers.push({
        image: img,
        offsetX: Math.cos(offsetAngle) * spread * cloudStretchX,
        offsetY: Math.sin(offsetAngle) * spread * cloudStretchY * 0.5,
        speedMul: 0.9 + this.rand() * 0.2,
      });
    }

    // Estimate bounding size
    const texW = 100; // approx
    const width = texW * baseScale * 2;
    const height = texW * baseScale * 1.2;

    this.clouds.push({
      layers, x, y, width, height,
      targetAlpha, currentAlpha: startAlpha, speedMultiplier,
    });
  }

  private getUpwindSpawnPosition(
    windDirRad: number, cam: Phaser.Cameras.Scene2D.Camera,
  ): { x: number; y: number } | null {
    const sinW = Math.sin(windDirRad);
    const cosW = -Math.cos(windDirRad);
    let x: number, y: number;

    if (Math.abs(sinW) > Math.abs(cosW)) {
      x = sinW > 0 ? cam.scrollX + cam.width + SPAWN_MARGIN : cam.scrollX - SPAWN_MARGIN;
      y = cam.scrollY + this.rand() * cam.height;
    } else {
      y = cosW > 0 ? cam.scrollY + cam.height + SPAWN_MARGIN : cam.scrollY - SPAWN_MARGIN;
      x = cam.scrollX + this.rand() * cam.width;
    }

    x = Math.max(-SPAWN_MARGIN, Math.min(this.mapWidth + SPAWN_MARGIN, x));
    y = Math.max(-SPAWN_MARGIN, Math.min(this.mapHeight + SPAWN_MARGIN, y));
    return { x, y };
  }
}
