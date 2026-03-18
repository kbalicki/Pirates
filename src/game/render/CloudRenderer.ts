import Phaser from "phaser";

const MIN_CLOUDS = 23;
const MAX_CLOUDS = 38;
const CLOUD_BASE_SPEED = 0.3;
const CLOUD_DEPTH = 4000;
const CULL_MARGIN = 100;

interface CloudInstance {
  gameObject: Phaser.GameObjects.GameObject & { setPosition(x: number, y: number): void; destroy(): void };
  x: number;
  y: number;
  width: number;
  height: number;
  alpha: number;
  speedMultiplier: number;
}

export class CloudRenderer {
  private scene: Phaser.Scene;
  private mapWidth: number;
  private mapHeight: number;
  private clouds: CloudInstance[] = [];
  private seed: number = 9973;
  private spriteKeys: string[] = [];

  constructor(scene: Phaser.Scene, mapWidth: number, mapHeight: number) {
    this.scene = scene;
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;

    // Detect available cloud sprite textures
    for (let i = 1; i <= 6; i++) {
      const key = `cloud_${i}`;
      if (scene.textures.exists(key)) {
        this.spriteKeys.push(key);
      }
    }

    // Spawn initial clouds scattered across the camera viewport
    const cam = scene.cameras.main;
    const count = MIN_CLOUDS + Math.floor(this.rand() * (MAX_CLOUDS - MIN_CLOUDS + 1));
    for (let i = 0; i < count; i++) {
      const x = cam.scrollX + this.rand() * cam.width;
      const y = cam.scrollY + this.rand() * cam.height;
      this.spawnCloud(x, y);
    }
  }

  update(windDirRad: number, windStrength: number): void {
    const cam = this.scene.cameras.main;

    const moveAngle = windDirRad + Math.PI;
    const dxUnit = Math.sin(moveAngle);
    const dyUnit = -Math.cos(moveAngle);

    for (const cloud of this.clouds) {
      const speed = CLOUD_BASE_SPEED * windStrength * cloud.speedMultiplier;
      cloud.x += dxUnit * speed;
      cloud.y += dyUnit * speed;
      cloud.gameObject.setPosition(cloud.x, cloud.y);
    }

    const viewLeft = cam.scrollX - CULL_MARGIN;
    const viewRight = cam.scrollX + cam.width + CULL_MARGIN;
    const viewTop = cam.scrollY - CULL_MARGIN;
    const viewBottom = cam.scrollY + cam.height + CULL_MARGIN;

    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      const outOfView =
        c.x + c.width < viewLeft ||
        c.x - c.width > viewRight ||
        c.y + c.height < viewTop ||
        c.y - c.height > viewBottom;
      const outOfWorld =
        c.x < -CULL_MARGIN ||
        c.x > this.mapWidth + CULL_MARGIN ||
        c.y < -CULL_MARGIN ||
        c.y > this.mapHeight + CULL_MARGIN;

      if (outOfView || outOfWorld) {
        c.gameObject.destroy();
        this.clouds.splice(i, 1);
      }
    }

    while (this.clouds.length < MIN_CLOUDS) {
      const pos = this.getUpwindSpawnPosition(windDirRad, cam);
      if (pos) {
        this.spawnCloud(pos.x, pos.y);
      } else {
        break;
      }
    }

    if (this.clouds.length < MAX_CLOUDS && this.rand() < 0.02) {
      const pos = this.getUpwindSpawnPosition(windDirRad, cam);
      if (pos) {
        this.spawnCloud(pos.x, pos.y);
      }
    }
  }

  destroy(): void {
    for (const cloud of this.clouds) {
      cloud.gameObject.destroy();
    }
    this.clouds = [];
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private getUpwindSpawnPosition(
    windDirRad: number,
    cam: Phaser.Cameras.Scene2D.Camera,
  ): { x: number; y: number } | null {
    const margin = 120;
    const sinW = Math.sin(windDirRad);
    const cosW = -Math.cos(windDirRad);

    let x: number;
    let y: number;

    if (Math.abs(sinW) > Math.abs(cosW)) {
      if (sinW > 0) {
        x = cam.scrollX + cam.width + margin;
      } else {
        x = cam.scrollX - margin;
      }
      y = cam.scrollY + this.rand() * cam.height;
    } else {
      if (cosW > 0) {
        y = cam.scrollY + cam.height + margin;
      } else {
        y = cam.scrollY - margin;
      }
      x = cam.scrollX + this.rand() * cam.width;
    }

    x = Math.max(-50, Math.min(this.mapWidth + 50, x));
    y = Math.max(-50, Math.min(this.mapHeight + 50, y));

    return { x, y };
  }

  /** Pick a tint color: mostly white, sometimes gray. */
  private pickCloudTint(): number {
    const roll = this.rand();
    if (roll < 0.45) return 0xffffff;
    if (roll < 0.70) return 0xe8e8ee;
    if (roll < 0.85) return 0xd0d0da;
    if (roll < 0.95) return 0xb8b8c4;
    return 0xa0a0b0;
  }

  private spawnCloud(x: number, y: number): void {
    const scale = 0.4 + this.rand() * 2.1;
    const alpha = 0.12 + this.rand() * 0.73;
    const speedMultiplier = Math.max(0.3, 1.4 - scale * 0.3);

    if (this.spriteKeys.length > 0) {
      const key = this.spriteKeys[Math.floor(this.rand() * this.spriteKeys.length)];
      const img = this.scene.add.image(x, y, key);
      img.setDepth(CLOUD_DEPTH);
      // Stretch horizontally, compress vertically — always wide & flat
      const scaleX = scale * (1.0 + this.rand() * 0.6);
      const scaleY = scale * (0.3 + this.rand() * 0.25);
      img.setScale(scaleX, scaleY);
      img.setAlpha(alpha);
      if (this.rand() > 0.5) img.setFlipX(true);
      img.setTint(this.pickCloudTint());

      const texFrame = this.scene.textures.getFrame(key);
      const width = (texFrame?.width ?? 100) * scaleX;
      const height = (texFrame?.height ?? 60) * scaleY;

      this.clouds.push({ gameObject: img, x, y, width, height, alpha, speedMultiplier });
    } else {
      const g = this.scene.add.graphics();
      g.setDepth(CLOUD_DEPTH);

      const width = 60 + Math.floor(this.rand() * 160);
      const height = 10 + Math.floor(this.rand() * 25);

      const tint = this.pickCloudTint();
      this.drawCloudShape(g, width, height, alpha, tint);
      g.setPosition(x, y);

      this.clouds.push({ gameObject: g, x, y, width, height, alpha, speedMultiplier });
    }
  }

  /**
   * Generate control points for an irregular closed blob.
   * Points lie on a circle with randomly varied radii.
   */
  private generateBlobPoints(
    cx: number, cy: number,
    radiusX: number, radiusY: number,
    numPoints: number,
  ): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const rMul = 0.55 + this.rand() * 0.9;
      points.push({
        x: cx + Math.cos(angle) * radiusX * rMul,
        y: cy + Math.sin(angle) * radiusY * rMul,
      });
    }
    return points;
  }

  /**
   * Draw a filled smooth closed curve through control points using
   * Catmull-Rom spline (subdivided into many short line segments).
   * This gives rounded, organic shapes — NO straight edges.
   */
  private drawSmoothBlob(
    g: Phaser.GameObjects.Graphics,
    pts: { x: number; y: number }[],
  ): void {
    const n = pts.length;
    if (n < 3) return;

    const SEGMENTS_PER_SPAN = 8; // smoothness per control point pair

    // Catmull-Rom interpolation helper
    const catmullRom = (
      p0: { x: number; y: number }, p1: { x: number; y: number },
      p2: { x: number; y: number }, p3: { x: number; y: number },
      t: number,
    ) => {
      const t2 = t * t;
      const t3 = t2 * t;
      return {
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      };
    };

    // Build smooth curve points
    const curve: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[(i + 2) % n];

      for (let s = 0; s < SEGMENTS_PER_SPAN; s++) {
        const t = s / SEGMENTS_PER_SPAN;
        curve.push(catmullRom(p0, p1, p2, p3, t));
      }
    }

    // Draw filled path
    g.beginPath();
    g.moveTo(curve[0].x, curve[0].y);
    for (let i = 1; i < curve.length; i++) {
      g.lineTo(curve[i].x, curve[i].y);
    }
    g.closePath();
    g.fillPath();
  }

  /**
   * Draw an irregular cloud from overlapping smooth blobs.
   * Each blob is a Catmull-Rom spline — no straight edges anywhere.
   */
  private drawCloudShape(
    g: Phaser.GameObjects.Graphics,
    w: number,
    h: number,
    alpha: number,
    tint: number,
  ): void {
    const tR = (tint >> 16) & 0xff;
    const tG = (tint >> 8) & 0xff;
    const tB = tint & 0xff;
    const shadowTint = ((tR * 0.82) << 16) | ((tG * 0.82) << 8) | (tB * 0.85);

    // Outer blobs: scattered horizontally across cloud area
    const numBlobs = 4 + Math.floor(this.rand() * 6);
    for (let i = 0; i < numBlobs; i++) {
      const bx = (this.rand() - 0.5) * w * 0.85;
      const by = (this.rand() - 0.5) * h * 0.5;
      const bw = w * (0.18 + this.rand() * 0.25);
      const bh = h * (0.10 + this.rand() * 0.15);
      const numVerts = 6 + Math.floor(this.rand() * 5);
      const pts = this.generateBlobPoints(bx, by, bw, bh, numVerts);

      g.fillStyle(tint, alpha * (0.3 + this.rand() * 0.5));
      this.drawSmoothBlob(g, pts);
    }

    // Core blobs: denser, near center, wide & flat
    const coreBlobs = 2 + Math.floor(this.rand() * 2);
    for (let i = 0; i < coreBlobs; i++) {
      const bx = (this.rand() - 0.5) * w * 0.35;
      const by = (this.rand() - 0.5) * h * 0.2;
      const bw = w * (0.25 + this.rand() * 0.2);
      const bh = h * (0.12 + this.rand() * 0.12);
      const numVerts = 7 + Math.floor(this.rand() * 4);
      const pts = this.generateBlobPoints(bx, by, bw, bh, numVerts);

      g.fillStyle(tint, alpha * (0.4 + this.rand() * 0.35));
      this.drawSmoothBlob(g, pts);
    }

    // Bottom shadow blobs
    const shadowBlobs = 1 + Math.floor(this.rand() * 2);
    for (let i = 0; i < shadowBlobs; i++) {
      const bx = (this.rand() - 0.5) * w * 0.5;
      const by = h * 0.1 + this.rand() * h * 0.1;
      const bw = w * (0.18 + this.rand() * 0.18);
      const bh = h * (0.06 + this.rand() * 0.06);
      const numVerts = 6 + Math.floor(this.rand() * 4);
      const pts = this.generateBlobPoints(bx, by, bw, bh, numVerts);

      g.fillStyle(shadowTint, alpha * 0.2);
      this.drawSmoothBlob(g, pts);
    }

    // Horizontal wisps: thin, wide streaks on edges
    const wisps = 1 + Math.floor(this.rand() * 3);
    for (let i = 0; i < wisps; i++) {
      const bx = (this.rand() - 0.5) * w * 0.7;
      const by = (this.rand() - 0.5) * h * 0.4;
      const bw = 12 + this.rand() * 20;
      const bh = 3 + this.rand() * 5;
      const pts = this.generateBlobPoints(bx, by, bw, bh, 5 + Math.floor(this.rand() * 3));

      g.fillStyle(tint, alpha * (0.15 + this.rand() * 0.2));
      this.drawSmoothBlob(g, pts);
    }
  }
}
