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
    // (wind blows FROM windDirRad, so clouds move away from that direction)
    const moveAngle = windDirRad + Math.PI;
    const dxUnit = Math.sin(moveAngle);
    const dyUnit = -Math.cos(moveAngle);

    // Update each cloud position
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
    // Clouds come FROM the windDirRad direction, so they spawn on that side
    const margin = 120;
    const sinW = Math.sin(windDirRad);
    const cosW = -Math.cos(windDirRad);

    // Determine which edge to spawn on based on wind direction
    let x: number;
    let y: number;

    // Predominantly horizontal wind component
    if (Math.abs(sinW) > Math.abs(cosW)) {
      if (sinW > 0) {
        // Wind from east side, spawn on right edge
        x = cam.scrollX + cam.width + margin;
      } else {
        // Wind from west side, spawn on left edge
        x = cam.scrollX - margin;
      }
      y = cam.scrollY + this.rand() * cam.height;
    } else {
      // Predominantly vertical wind component
      if (cosW > 0) {
        // Wind from south side, spawn on bottom edge
        y = cam.scrollY + cam.height + margin;
      } else {
        // Wind from north side, spawn on top edge
        y = cam.scrollY - margin;
      }
      x = cam.scrollX + this.rand() * cam.width;
    }

    // Clamp to world bounds + small tolerance
    x = Math.max(-50, Math.min(this.mapWidth + 50, x));
    y = Math.max(-50, Math.min(this.mapHeight + 50, y));

    return { x, y };
  }

  /** Create a cloud Graphics object at the given world position. */
  private spawnCloud(x: number, y: number): void {
    const g = this.scene.add.graphics();
    g.setDepth(CLOUD_DEPTH);

    const width = 40 + Math.floor(this.rand() * 61);   // 40-100
    const height = 15 + Math.floor(this.rand() * 21);   // 15-35
    const alpha = 0.15 + this.rand() * 0.20;            // 0.15-0.35
    const speedMultiplier = 0.7 + this.rand() * 0.6;    // 0.7-1.3

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
   * Draw a blocky pixel-art cloud shape using overlapping fillRect calls.
   * All rectangles are drawn centered around (0,0) so the Graphics
   * position controls the world placement.
   */
  private drawCloudShape(
    g: Phaser.GameObjects.Graphics,
    w: number,
    h: number,
    alpha: number,
  ): void {
    const halfW = Math.floor(w / 2);
    const halfH = Math.floor(h / 2);

    // Main body rectangle (widest, centered)
    g.fillStyle(0xffffff, alpha);
    g.fillRect(-halfW, -halfH + Math.floor(h * 0.2), w, Math.floor(h * 0.6));

    // Top bumps: 2-3 smaller rectangles above center for blobby look
    const numBumps = 2 + (w > 70 ? 1 : 0);
    const bumpSpacing = w / (numBumps + 1);
    for (let i = 0; i < numBumps; i++) {
      const bx = -halfW + Math.floor(bumpSpacing * (i + 1)) - Math.floor(bumpSpacing * 0.35);
      const bw = Math.floor(bumpSpacing * 0.7);
      const bh = Math.floor(h * 0.35 + this.rand() * h * 0.15);
      g.fillStyle(0xffffff, alpha);
      g.fillRect(bx, -halfH, bw, bh);
    }

    // Side extensions (small rectangles sticking out left and right)
    const extH = Math.floor(h * 0.3);
    const extW = Math.floor(w * 0.12);
    // Left extension
    g.fillStyle(0xffffff, alpha * 0.9);
    g.fillRect(-halfW - extW, -halfH + Math.floor(h * 0.3), extW, extH);
    // Right extension
    g.fillRect(halfW, -halfH + Math.floor(h * 0.25), extW, extH);

    // Light gray shadow rectangle along the bottom
    g.fillStyle(0xcccccc, alpha * 0.7);
    g.fillRect(
      -halfW + Math.floor(w * 0.05),
      halfH - Math.floor(h * 0.25),
      Math.floor(w * 0.9),
      Math.floor(h * 0.25),
    );
  }
}
