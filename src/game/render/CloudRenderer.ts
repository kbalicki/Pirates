import Phaser from "phaser";

const MIN_CLOUDS = 12;
const MAX_CLOUDS = 20;
const CLOUD_BASE_SPEED = 0.3;
const CLOUD_DEPTH = 4000;
const CULL_MARGIN = 100;

interface CloudInstance {
  graphics: Phaser.GameObjects.Graphics;
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

  constructor(scene: Phaser.Scene, mapWidth: number, mapHeight: number) {
    this.scene = scene;
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;

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

    // Clouds drift in the OPPOSITE direction of windDirRad
    const moveAngle = windDirRad + Math.PI;
    const dxUnit = Math.sin(moveAngle);
    const dyUnit = -Math.cos(moveAngle);

    for (const cloud of this.clouds) {
      const speed = CLOUD_BASE_SPEED * windStrength * cloud.speedMultiplier;
      cloud.x += dxUnit * speed;
      cloud.y += dyUnit * speed;
      cloud.graphics.setPosition(cloud.x, cloud.y);
    }

    // Cull clouds that leave viewport + margin or world bounds
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
        c.graphics.destroy();
        this.clouds.splice(i, 1);
      }
    }

    // Spawn new clouds at the upwind edge when below minimum
    while (this.clouds.length < MIN_CLOUDS) {
      const pos = this.getUpwindSpawnPosition(windDirRad, cam);
      if (pos) {
        this.spawnCloud(pos.x, pos.y);
      } else {
        break;
      }
    }

    // Occasionally spawn up to MAX when there's room
    if (this.clouds.length < MAX_CLOUDS && this.rand() < 0.02) {
      const pos = this.getUpwindSpawnPosition(windDirRad, cam);
      if (pos) {
        this.spawnCloud(pos.x, pos.y);
      }
    }
  }

  destroy(): void {
    for (const cloud of this.clouds) {
      cloud.graphics.destroy();
    }
    this.clouds = [];
  }

  /** Deterministic PRNG (same pattern used in the codebase). */
  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** Calculate a spawn position at the upwind edge of the viewport (+ margin). */
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

  /** Create a cloud Graphics object at the given world position. */
  private spawnCloud(x: number, y: number): void {
    const g = this.scene.add.graphics();
    g.setDepth(CLOUD_DEPTH);

    const width = 30 + Math.floor(this.rand() * 121);   // 30-150
    const height = 15 + Math.floor(this.rand() * 66);    // 15-80
    const alpha = 0.20 + this.rand() * 0.60;             // 0.20-0.80
    const speedMultiplier = 0.7 + this.rand() * 0.6;     // 0.7-1.3

    this.drawCloudShape(g, width, height, alpha);

    g.setPosition(x, y);

    this.clouds.push({
      graphics: g,
      x,
      y,
      width,
      height,
      alpha,
      speedMultiplier,
    });
  }

  /**
   * Draw an organic cloud shape using many overlapping circles (puffs).
   * The arrangement follows a natural cloud profile: wider in the middle
   * with bumpy top and flatter bottom. All centered at (0,0).
   */
  private drawCloudShape(
    g: Phaser.GameObjects.Graphics,
    w: number,
    h: number,
    alpha: number,
  ): void {
    // Main body: row of overlapping ellipses spread horizontally
    const numPuffs = 6 + Math.floor(this.rand() * 5); // 6-10
    for (let i = 0; i < numPuffs; i++) {
      const t = i / (numPuffs - 1); // 0..1
      const px = (t - 0.5) * w * 0.85;
      const envelope = 1 - 4 * (t - 0.5) * (t - 0.5);
      const py = -(envelope * h * 0.15) + (this.rand() - 0.4) * h * 0.12;
      const r = (h * 0.18 + envelope * h * 0.18) * (0.7 + this.rand() * 0.35);
      const ew = r * (1.2 + this.rand() * 0.8);
      const eh = r * (0.6 + this.rand() * 0.5);
      g.fillStyle(0xffffff, alpha * (0.45 + this.rand() * 0.35));
      g.fillEllipse(px, py, ew * 2, eh * 2);
    }

    // Top bumps: random ellipses above the main body for billowy look
    const topBumps = 3 + Math.floor(this.rand() * 3); // 3-5
    for (let i = 0; i < topBumps; i++) {
      const px = (this.rand() - 0.5) * w * 0.6;
      const py = -h * 0.2 - this.rand() * h * 0.2;
      const r = h * 0.1 + this.rand() * h * 0.14;
      const ew = r * (1.0 + this.rand() * 1.0);
      const eh = r * (0.5 + this.rand() * 0.6);
      g.fillStyle(0xffffff, alpha * (0.5 + this.rand() * 0.3));
      g.fillEllipse(px, py, ew * 2, eh * 2);
    }

    // Fill gaps with medium ellipses in the center mass
    const fillPuffs = 2 + Math.floor(this.rand() * 3); // 2-4
    for (let i = 0; i < fillPuffs; i++) {
      const px = (this.rand() - 0.5) * w * 0.5;
      const py = (this.rand() - 0.45) * h * 0.25;
      const r = h * 0.12 + this.rand() * h * 0.12;
      const ew = r * (1.1 + this.rand() * 0.7);
      const eh = r * (0.7 + this.rand() * 0.5);
      g.fillStyle(0xffffff, alpha * (0.45 + this.rand() * 0.3));
      g.fillEllipse(px, py, ew * 2, eh * 2);
    }

    // Bottom shadow: flat ellipses along the underside
    const shadowPuffs = 2 + Math.floor(this.rand() * 2); // 2-3
    for (let i = 0; i < shadowPuffs; i++) {
      const px = (this.rand() - 0.5) * w * 0.5;
      const py = h * 0.05 + this.rand() * h * 0.1;
      const rw = w * 0.15 + this.rand() * w * 0.1;
      const rh = h * 0.06 + this.rand() * h * 0.06;
      g.fillStyle(0xdddde8, alpha * 0.2);
      g.fillEllipse(px, py, rw * 2, rh * 2);
    }
  }
}
