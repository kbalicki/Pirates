import Phaser from "phaser";

const MIN_SEAGULLS = 5;
const MAX_SEAGULLS = 10;
const SEAGULL_DEPTH = 3500;
const FLAP_INTERVAL = 300;
const CULL_MARGIN = 80;
const WINGSPAN = 5;
const DRIFT_SPEED = 0.4;
const WANDER_STRENGTH = 0.02;
/** Max tiles from land a seagull can be (Manhattan distance). */
const MAX_COAST_DIST = 4;

interface Seagull {
  gameObject: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  flapPhase: boolean;
  flapTimer: number;
}

export class SeagullRenderer {
  private scene: Phaser.Scene;
  private landGrid: boolean[][];
  private seagulls: Seagull[] = [];
  private seed = 7717;
  /** Coast distance grid: 0=land, 1=adjacent water, 2=two away, etc. 999=deep ocean. */
  private coastDist: number[][];
  private gridRows: number;
  private gridCols: number;

  constructor(scene: Phaser.Scene, landGrid: boolean[][]) {
    this.scene = scene;
    this.landGrid = landGrid;
    this.gridRows = landGrid.length;
    this.gridCols = landGrid[0]?.length ?? 0;

    // Pre-compute coast distance via BFS
    this.coastDist = this.buildCoastDistGrid();

    const cam = scene.cameras.main;
    const count = MIN_SEAGULLS + Math.floor(this.rand() * (MAX_SEAGULLS - MIN_SEAGULLS + 1));
    for (let i = 0; i < count; i++) {
      const x = cam.scrollX + this.rand() * cam.width;
      const y = cam.scrollY + this.rand() * cam.height;
      if (this.isNearCoast(x, y)) {
        this.spawnSeagull(x, y);
      }
    }
  }

  update(windDirRad: number, windStrength: number): void {
    const cam = this.scene.cameras.main;
    const dt = this.scene.game.loop.delta;

    const windDx = Math.sin(windDirRad) * DRIFT_SPEED * windStrength;
    const windDy = -Math.cos(windDirRad) * DRIFT_SPEED * windStrength;

    for (const gull of this.seagulls) {
      gull.flapTimer += dt;
      if (gull.flapTimer >= FLAP_INTERVAL) {
        gull.flapTimer -= FLAP_INTERVAL;
        gull.flapPhase = !gull.flapPhase;
        this.drawSeagullGraphics(gull);
      }

      gull.vx += (this.rand() - 0.5) * WANDER_STRENGTH;
      gull.vy += (this.rand() - 0.5) * WANDER_STRENGTH;

      gull.x += gull.vx + windDx;
      gull.y += gull.vy + windDy;

      gull.gameObject.setPosition(gull.x, gull.y);
    }

    // Cull seagulls outside viewport
    const viewLeft = cam.scrollX - CULL_MARGIN;
    const viewRight = cam.scrollX + cam.width + CULL_MARGIN;
    const viewTop = cam.scrollY - CULL_MARGIN;
    const viewBottom = cam.scrollY + cam.height + CULL_MARGIN;

    for (let i = this.seagulls.length - 1; i >= 0; i--) {
      const g = this.seagulls[i];
      if (g.x < viewLeft || g.x > viewRight || g.y < viewTop || g.y > viewBottom) {
        g.gameObject.destroy();
        this.seagulls.splice(i, 1);
      }
    }

    // Respawn at camera edges (near coast only)
    while (this.seagulls.length < MIN_SEAGULLS) {
      let spawned = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        const pos = this.getEdgeSpawnPosition(cam);
        if (pos && this.isNearCoast(pos.x, pos.y)) {
          this.spawnSeagull(pos.x, pos.y);
          spawned = true;
          break;
        }
      }
      if (!spawned) break;
    }

    // Occasionally spawn extras near coast
    if (this.seagulls.length < MAX_SEAGULLS && this.rand() < 0.04) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const pos = this.getEdgeSpawnPosition(cam);
        if (pos && this.isNearCoast(pos.x, pos.y)) {
          this.spawnSeagull(pos.x, pos.y);
          break;
        }
      }
    }
  }

  destroy(): void {
    for (const gull of this.seagulls) {
      gull.gameObject.destroy();
    }
    this.seagulls = [];
  }

  /** BFS from all land cells to compute distance-to-land for water cells. */
  private buildCoastDistGrid(): number[][] {
    const dist: number[][] = [];
    for (let r = 0; r < this.gridRows; r++) {
      dist[r] = new Array(this.gridCols).fill(999);
    }

    const queue: [number, number][] = [];
    for (let r = 0; r < this.gridRows; r++) {
      for (let c = 0; c < this.gridCols; c++) {
        if (this.landGrid[r][c]) {
          dist[r][c] = 0;
          queue.push([r, c]);
        }
      }
    }

    let head = 0;
    while (head < queue.length) {
      const [cr, cc] = queue[head++];
      const nd = dist[cr][cc] + 1;
      if (nd > MAX_COAST_DIST + 1) continue;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nr = cr + dr;
        const nc = cc + dc;
        if (nr >= 0 && nr < this.gridRows && nc >= 0 && nc < this.gridCols && dist[nr][nc] > nd) {
          dist[nr][nc] = nd;
          queue.push([nr, nc]);
        }
      }
    }
    return dist;
  }

  /** Check if world position is water near coastline (within MAX_COAST_DIST tiles of land). */
  private isNearCoast(worldX: number, worldY: number): boolean {
    const col = Math.floor(worldX / 32);
    const row = Math.floor(worldY / 32);
    if (row < 0 || row >= this.gridRows || col < 0 || col >= this.gridCols) {
      return false; // out of bounds = deep ocean, no seagulls
    }
    const d = this.coastDist[row][col];
    // Coastal cells: land (0) and nearby water (1..MAX_COAST_DIST)
    return d >= 0 && d <= MAX_COAST_DIST;
  }

  private spawnSeagull(x: number, y: number): void {
    const flapPhase = this.rand() > 0.5;

    const g = this.scene.add.graphics();
    g.setDepth(SEAGULL_DEPTH);

    const gull: Seagull = {
      gameObject: g,
      x,
      y,
      vx: (this.rand() - 0.5) * 0.3,
      vy: (this.rand() - 0.5) * 0.3,
      flapPhase,
      flapTimer: this.rand() * FLAP_INTERVAL,
    };

    this.drawSeagullGraphics(gull);
    this.seagulls.push(gull);
  }

  private drawSeagullGraphics(gull: Seagull): void {
    const g = gull.gameObject;
    g.clear();

    const half = WINGSPAN / 2;

    if (gull.flapPhase) {
      // V-shape (wings up)
      g.lineStyle(1.0, 0xffffff, 0.9);
      g.beginPath();
      g.moveTo(-half, -2);
      g.lineTo(0, 0);
      g.lineTo(half, -2);
      g.strokePath();
      g.lineStyle(1, 0x888888, 0.3);
      g.beginPath();
      g.moveTo(-half + 1, -1);
      g.lineTo(0, 1);
      g.lineTo(half - 1, -1);
      g.strokePath();
    } else {
      // M-shape (wings down)
      g.lineStyle(1.0, 0xffffff, 0.9);
      g.beginPath();
      g.moveTo(-half, -1);
      g.lineTo(-half * 0.4, -2);
      g.lineTo(0, -1);
      g.lineTo(half * 0.4, -2);
      g.lineTo(half, -1);
      g.strokePath();
      g.lineStyle(1, 0x888888, 0.3);
      g.beginPath();
      g.moveTo(-half + 1, 0);
      g.lineTo(-half * 0.4, -1);
      g.lineTo(0, 0);
      g.lineTo(half * 0.4, -1);
      g.lineTo(half - 1, 0);
      g.strokePath();
    }
  }

  private getEdgeSpawnPosition(cam: Phaser.Cameras.Scene2D.Camera): { x: number; y: number } | null {
    const margin = 60;
    const side = Math.floor(this.rand() * 4);
    let x: number, y: number;

    switch (side) {
      case 0:
        x = cam.scrollX + this.rand() * cam.width;
        y = cam.scrollY - margin;
        break;
      case 1:
        x = cam.scrollX + cam.width + margin;
        y = cam.scrollY + this.rand() * cam.height;
        break;
      case 2:
        x = cam.scrollX + this.rand() * cam.width;
        y = cam.scrollY + cam.height + margin;
        break;
      default:
        x = cam.scrollX - margin;
        y = cam.scrollY + this.rand() * cam.height;
        break;
    }

    x = Math.max(0, Math.min(3200, x));
    y = Math.max(0, Math.min(2400, y));

    return { x, y };
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}
