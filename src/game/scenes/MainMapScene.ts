import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import type { Transition } from "../../core/model/Events.ts";
import { WorldEngine } from "../../core/engine/WorldEngine.ts";
import type { TerrainType } from "../../core/systems/NavigationSystem.ts";
import { WorldRenderer } from "../render/WorldRenderer.ts";
import { CameraController } from "../render/CameraController.ts";
import { MinimapRenderer } from "../render/MinimapRenderer.ts";
import { CloudRenderer } from "../render/CloudRenderer.ts";
import { WindCompassRenderer } from "../render/WindCompassRenderer.ts";
import { FxManager } from "../render/FxManager.ts";
import { InputMapper } from "../input/InputMapper.ts";
import { CommandQueue } from "../input/CommandQueue.ts";
import { PORTS } from "../../core/data/ports.ts";
import type { PortDef } from "../../core/data/ports.ts";
import { FACTIONS } from "../../core/data/factions.ts";
import { LANDMASSES } from "../../core/data/geography.ts";
import { vec2Dist, pointInPolygon } from "../../core/services/Geometry.ts";
import { buildTileMap } from "../render/TileMapBuilder.ts";
import { formatTime } from "../../core/systems/TimeSystem.ts";
import { t } from "../../core/i18n/index.ts";
import { txt } from "../ui/textStyle.ts";

const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;

export class MainMapScene extends Phaser.Scene {
  private worldState!: WorldState;
  private engine!: WorldEngine;
  private worldRenderer!: WorldRenderer;
  private cameraCtrl!: CameraController;
  private minimap!: MinimapRenderer;
  private cloudRenderer!: CloudRenderer;
  private windCompass!: WindCompassRenderer;
  private inputMapper!: InputMapper;
  private commandQueue!: CommandQueue;

  private tickAccumulator = 0;

  private hudText!: Phaser.GameObjects.Text;
  private portPromptText: Phaser.GameObjects.Text | null = null;
  private portDialogOpen = false;
  private wasNearPort = false;

  constructor() {
    super({ key: "MainMapScene" });
  }

  init(data?: { worldState?: WorldState }): void {
    if (data?.worldState) {
      this.worldState = data.worldState;
    }
  }

  create(): void {
    if (!this.worldState) {
      this.worldState = this.registry.get("worldState") as WorldState;
    }

    this.createTilemap();

    const terrainQuery = this.createTerrainQuery();
    this.engine = new WorldEngine(terrainQuery);
    this.worldRenderer = new WorldRenderer();

    const mapW = 3200;
    const mapH = 2400;

    this.cameraCtrl = new CameraController(this.cameras.main);
    this.cameraCtrl.setBounds(0, 0, mapW, mapH);

    // Snap camera to player immediately so we don't start at (0,0)
    const playerEntity = this.worldState.entities[this.worldState.player.shipId as string];
    if (playerEntity) {
      this.cameraCtrl.snapTo(playerEntity.pos);
    }

    this.minimap = new MinimapRenderer(this, mapW, mapH);
    this.cloudRenderer = new CloudRenderer(this, mapW, mapH);
    this.windCompass = new WindCompassRenderer(this);

    new FxManager(this);

    this.commandQueue = new CommandQueue();
    this.inputMapper = new InputMapper(this, this.commandQueue);

    this.hudText = this.add.text(10, 10, "", {
      ...txt(14, { color: "#ffffff" }),
      backgroundColor: "#00000088",
      padding: { x: 8, y: 4 },
    });
    this.hudText.setScrollFactor(0);
    this.hudText.setDepth(9500);

    this.portPromptText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height - 60,
      "",
      { ...txt(16, { color: "#ffdd44" }), backgroundColor: "#00000088", padding: { x: 12, y: 6 } },
    );
    this.portPromptText.setOrigin(0.5);
    this.portPromptText.setScrollFactor(0);
    this.portPromptText.setDepth(9500);
    this.portPromptText.setVisible(false);

    this.portDialogOpen = false;
    this.wasNearPort = false;

    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-E", () => {
        if (!this.portDialogOpen) {
          const nearPort = this.findNearPort();
          if (nearPort) {
            this.openPortDialog(nearPort);
          }
        }
      });

      this.input.keyboard.on("keydown-SPACE", () => {
        this.scene.launch("OptionsMenuScene", {
          worldState: this.worldState,
        });
        this.time.delayedCall(0, () => {
          this.scene.pause();
        });
      });
    }

    // Listen for PortApproachScene closing — resume ourselves
    this.events.on("resume", () => {
      this.portDialogOpen = false;
    });

    this.drawPortMarkers();
    this.worldRenderer.sync(this, this.worldState);
  }

  private createTilemap(): void {
    if (this.textures.exists("tilepack")) {
      buildTileMap(this);
      this.drawCompassRose();
      return;
    }
    this.createProceduralSea();
  }

  private createProceduralSea(): void {
    const mapW = 3200;
    const mapH = 2400;

    // --- Deep ocean base ---
    const bg = this.add.graphics();
    bg.setDepth(-1000);
    bg.fillStyle(0x071e3d, 1);
    bg.fillRect(0, 0, mapW, mapH);

    // Static ocean color variation
    const CELL = 48;
    for (let y = 0; y < mapH; y += CELL) {
      for (let x = 0; x < mapW; x += CELL) {
        const n1 = Math.sin(x * 0.005 + y * 0.003) * 0.5;
        const n2 = Math.sin(x * 0.012 - y * 0.007 + 2.1) * 0.3;
        const n3 = Math.sin(x * 0.003 + y * 0.009 + 4.7) * 0.2;
        const noise = n1 + n2 + n3;

        const r = Math.max(0, Math.floor(7 + noise * 6));
        const g = Math.max(0, Math.floor(30 + noise * 14));
        const b = Math.max(0, Math.floor(61 + noise * 18));
        bg.fillStyle((r << 16) | (g << 8) | b, 1);
        bg.fillRect(x, y, CELL, CELL);
      }
    }

    // --- Organic wave patterns (irregular, scattered) ---
    const waves = this.add.graphics();
    waves.setDepth(-990);

    let waveSeed = 137;
    const waveRand = () => {
      waveSeed = (waveSeed * 16807) % 2147483647;
      return waveSeed / 2147483647;
    };

    // Scattered wave strokes at varying angles and lengths
    for (let i = 0; i < 120; i++) {
      const sx = waveRand() * mapW;
      const sy = waveRand() * mapH;
      const angle = (waveRand() - 0.5) * 0.6;
      const len = 60 + waveRand() * 180;
      const amp = 1.5 + waveRand() * 3;
      const freq = 0.03 + waveRand() * 0.05;
      const alpha = 0.06 + waveRand() * 0.08;

      waves.lineStyle(1, 0x3a7aaa, alpha);
      waves.beginPath();
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const steps = Math.floor(len / 4);
      for (let s = 0; s <= steps; s++) {
        const tt = (s / steps) * len;
        const perp = Math.sin(tt * freq) * amp;
        const px = sx + cosA * tt - sinA * perp;
        const py = sy + sinA * tt + cosA * perp;
        if (s === 0) waves.moveTo(px, py);
        else waves.lineTo(px, py);
      }
      waves.strokePath();
    }

    // Broad, subtle ocean current lines
    for (let i = 0; i < 18; i++) {
      const sy = waveRand() * mapH;
      const sx = waveRand() * mapW * 0.3;
      const curveLen = 300 + waveRand() * 600;
      waves.lineStyle(2, 0x1a4a7a, 0.04 + waveRand() * 0.04);
      waves.beginPath();
      for (let tt = 0; tt < curveLen; tt += 6) {
        const wy = sy + Math.sin(tt * 0.007 + i * 1.7) * 18 + Math.sin(tt * 0.019 + i * 3.1) * 6;
        const wx = sx + tt;
        if (tt === 0) waves.moveTo(wx, wy);
        else waves.lineTo(wx, wy);
      }
      waves.strokePath();
    }

    // --- Shallow water around landmasses ---
    const shallow = this.add.graphics();
    shallow.setDepth(-600);
    for (const lm of LANDMASSES) {
      this.fillPolygonOffset(shallow, lm.polygon, 20, 0x1a5588, 0.35);
    }

    // --- Landmass polygons ---
    const land = this.add.graphics();
    land.setDepth(-500);
    for (const lm of LANDMASSES) {
      // Sand beach border
      this.fillPolygonOffset(land, lm.polygon, 4, 0xd4b96a, 1);

      // Base green landmass
      this.fillPolygonDirect(land, lm.polygon, 0x3a8a3a, 1);

      // Darker jungle interior on larger landmasses
      if (lm.polygon.length > 6) {
        this.fillPolygonOffset(land, lm.polygon, -6, 0x2d6b2d, 0.6);
      }
    }

    // --- Foam / whitecap dots ---
    const detail = this.add.graphics();
    detail.setDepth(-400);
    let seed = 42;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 150; i++) {
      const fx = rand() * mapW;
      const fy = rand() * mapH;
      // Skip foam on land
      let onLand = false;
      for (const lm of LANDMASSES) {
        if (pointInPolygon({ x: fx, y: fy }, lm.polygon)) {
          onLand = true;
          break;
        }
      }
      if (onLand) continue;
      detail.fillStyle(0xffffff, 0.05 + rand() * 0.05);
      detail.fillCircle(fx, fy, 1 + rand() * 2);
    }

    // --- Compass rose ---
    detail.lineStyle(2, 0xccaa66, 0.4);
    detail.strokeCircle(120, 150, 30);
    detail.lineStyle(1, 0xccaa66, 0.3);
    detail.lineBetween(120, 122, 120, 178);
    detail.lineBetween(92, 150, 148, 150);
    const nLabel = this.add.text(120, 112, "N", { ...txt(10, { color: "#ccaa66" }) });
    nLabel.setOrigin(0.5).setDepth(-400).setAlpha(0.5);
  }

  /** Fill a polygon directly with given style. */
  private fillPolygonDirect(
    g: Phaser.GameObjects.Graphics,
    polygon: { x: number; y: number }[],
    color: number,
    alpha: number,
  ): void {
    if (polygon.length < 3) return;
    g.fillStyle(color, alpha);
    g.beginPath();
    g.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) {
      g.lineTo(polygon[i].x, polygon[i].y);
    }
    g.closePath();
    g.fillPath();
  }

  /** Fill a polygon expanded/contracted by offset pixels (approximate). */
  private fillPolygonOffset(
    g: Phaser.GameObjects.Graphics,
    polygon: { x: number; y: number }[],
    offset: number,
    color: number,
    alpha: number,
  ): void {
    if (polygon.length < 3) return;
    // Compute centroid
    let cx = 0, cy = 0;
    for (const p of polygon) { cx += p.x; cy += p.y; }
    cx /= polygon.length;
    cy /= polygon.length;

    // Expand/contract each point along the direction from centroid
    const expanded = polygon.map((p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return { x: p.x, y: p.y };
      const scale = (dist + offset) / dist;
      return { x: cx + dx * scale, y: cy + dy * scale };
    });

    this.fillPolygonDirect(g, expanded, color, alpha);
  }

  private createTerrainQuery(): (wx: number, wy: number) => TerrainType {
    return (wx: number, wy: number): TerrainType => {
      // Polygon-based landmass collision (pixel-accurate)
      for (const lm of LANDMASSES) {
        if (pointInPolygon({ x: wx, y: wy }, lm.polygon)) {
          return "land";
        }
      }

      if (wx < 0 || wy < 0 || wx > 3200 || wy > 2400) {
        return "land";
      }

      return "sea";
    };
  }

  private drawCompassRose(): void {
    const g = this.add.graphics();
    g.setDepth(-300);
    g.lineStyle(2, 0xccaa66, 0.4);
    g.strokeCircle(120, 150, 30);
    g.lineStyle(1, 0xccaa66, 0.3);
    g.lineBetween(120, 122, 120, 178);
    g.lineBetween(92, 150, 148, 150);
    const nLabel = this.add.text(120, 112, "N", { ...txt(10, { color: "#ccaa66" }) });
    nLabel.setOrigin(0.5).setDepth(-300).setAlpha(0.5);
  }

  private drawPortMarkers(): void {
    const g = this.add.graphics();
    g.setDepth(500);

    for (const [portKey, port] of Object.entries(PORTS)) {
      // Draw city icon (no dock radius circle)
      this.drawCityIcon(g, port);

      const label = this.add.text(port.pos.x, port.pos.y - 22, t("port." + portKey + ".name"), {
        ...txt(14, { bold: true }),
        stroke: "#ffffff",
        strokeThickness: 2,
      });
      label.setOrigin(0.5, 1);
      label.setDepth(500);
    }
  }

  private drawCityIcon(g: Phaser.GameObjects.Graphics, port: PortDef): void {
    const x = port.pos.x;
    const y = port.pos.y;
    const factionDef = FACTIONS[port.factionId as string];
    const flagColor = factionDef?.color ?? 0xaaaaaa;

    if (port.type === "fort") {
      // Stone fort with corner towers and crenellations
      g.fillStyle(0x777777, 1);
      g.fillRect(x - 9, y - 7, 18, 14);
      g.fillStyle(0x666666, 1);
      g.fillRect(x - 11, y - 9, 5, 5);
      g.fillRect(x + 6, y - 9, 5, 5);
      g.fillRect(x - 11, y + 4, 5, 5);
      g.fillRect(x + 6, y + 4, 5, 5);
      // Crenellations on top
      g.fillStyle(0x888888, 1);
      for (let i = -10; i <= 8; i += 3) {
        g.fillRect(x + i, y - 11, 2, 2);
      }
      // Gate
      g.fillStyle(0x443322, 1);
      g.fillRect(x - 2, y + 2, 4, 5);
      // Flag on tower
      g.lineStyle(1, 0xdddddd, 0.9);
      g.lineBetween(x - 9, y - 9, x - 9, y - 16);
      g.fillStyle(flagColor, 1);
      g.fillTriangle(x - 9, y - 16, x - 3, y - 14, x - 9, y - 12);
    } else if (port.type === "city") {
      // Cluster of colonial buildings with church tower
      g.fillStyle(0xc9a855, 1);
      g.fillRect(x - 10, y - 3, 6, 7);
      g.fillStyle(0xb89845, 1);
      g.fillRect(x - 3, y - 6, 7, 10);
      g.fillStyle(0xc9a855, 1);
      g.fillRect(x + 5, y - 2, 6, 6);
      // Roofs (dark terracotta)
      g.fillStyle(0x8b4513, 1);
      g.fillTriangle(x - 11, y - 3, x - 3, y - 3, x - 7, y - 7);
      g.fillTriangle(x - 4, y - 6, x + 5, y - 6, x + 0.5, y - 10);
      g.fillTriangle(x + 4, y - 2, x + 12, y - 2, x + 8, y - 6);
      // Church tower / spire
      g.fillStyle(0xd4b96a, 1);
      g.fillRect(x - 1, y - 13, 3, 7);
      g.fillStyle(0xccaa55, 1);
      g.fillTriangle(x - 2, y - 13, x + 3, y - 13, x + 0.5, y - 17);
      // Cross on top
      g.lineStyle(1, 0xffdd44, 0.9);
      g.lineBetween(x + 0.5, y - 17, x + 0.5, y - 19);
      g.lineBetween(x - 1, y - 18, x + 2, y - 18);
      // Windows (warm glow)
      g.fillStyle(0xffdd44, 0.7);
      g.fillRect(x - 8, y - 1, 2, 2);
      g.fillRect(x - 1, y - 4, 2, 2);
      g.fillRect(x + 1, y - 1, 2, 2);
      g.fillRect(x + 7, y, 2, 2);
      // Flag
      g.lineStyle(1, 0xdddddd, 0.8);
      g.lineBetween(x + 8, y - 2, x + 8, y - 9);
      g.fillStyle(flagColor, 1);
      g.fillTriangle(x + 8, y - 9, x + 13, y - 7.5, x + 8, y - 6);
    } else {
      // Outpost: small huts with palm-leaf roofs
      g.fillStyle(0x8b7355, 1);
      g.fillRect(x - 6, y - 2, 5, 5);
      g.fillRect(x + 1, y - 1, 5, 4);
      // Thatched roofs (green)
      g.fillStyle(0x556633, 1);
      g.fillTriangle(x - 7, y - 2, x, y - 2, x - 3.5, y - 6);
      g.fillTriangle(x, y - 1, x + 7, y - 1, x + 3.5, y - 5);
      // Dock/pier
      g.fillStyle(0x8b6b40, 0.8);
      g.fillRect(x - 1, y + 3, 2, 6);
      g.fillRect(x - 4, y + 8, 8, 2);
      // Skull flag (pirate outpost)
      g.lineStyle(1, 0xaaaaaa, 0.8);
      g.lineBetween(x - 3, y - 2, x - 3, y - 10);
      g.fillStyle(0x111111, 1);
      g.fillRect(x - 3, y - 10, 5, 3);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(x - 1, y - 9, 1);
    }
  }

  private findNearPort(): (typeof PORTS)[keyof typeof PORTS] | null {
    const playerEntity = this.worldState.entities[this.worldState.player.shipId as string];
    if (!playerEntity) return null;

    for (const port of Object.values(PORTS)) {
      const dist = vec2Dist(playerEntity.pos, port.pos);
      if (dist <= port.dockRadius) {
        return port;
      }
    }
    return null;
  }

  private openPortDialog(port: PortDef): void {
    this.portDialogOpen = true;
    const portKey = Object.entries(PORTS).find(([_, p]) => p === port)?.[0];
    if (!portKey) return;
    // Launch overlay first, THEN pause on next frame to avoid Phaser timing issues
    this.scene.launch("PortApproachScene", {
      worldState: this.worldState,
      portId: portKey,
    });
    this.time.delayedCall(0, () => {
      this.scene.pause();
    });
  }

  update(_time: number, delta: number): void {
    this.inputMapper.update();
    this.tickAccumulator += delta;

    while (this.tickAccumulator >= TICK_MS) {
      this.tickAccumulator -= TICK_MS;

      const commands = this.commandQueue.drain();
      const result = this.engine.apply(this.worldState, commands, 1);
      this.worldState = result.state;
      this.registry.set("worldState", this.worldState);

      if (result.events.length > 0) {
        this.worldRenderer.applyEvents(this, result.events);
      }

      if (result.transitions) {
        for (const t of result.transitions) {
          this.handleTransition(t);
          return;
        }
      }
    }

    this.worldRenderer.sync(this, this.worldState);

    const playerEntity = this.worldState.entities[this.worldState.player.shipId as string];
    if (playerEntity) {
      this.cameraCtrl.setTarget(playerEntity.pos);
      this.cameraCtrl.update();
    }

    this.minimap.update(this, this.worldState);
    this.cloudRenderer.update(this.worldState.weather.windDirRad, this.worldState.weather.windStrength);
    this.windCompass.update(this.worldState.weather.windDirRad, this.worldState.weather.windStrength);
    this.updateHud();
    this.updatePortPrompt();
  }

  private updateHud(): void {
    const player = this.worldState.player;
    const playerEntity = this.worldState.entities[player.shipId as string];
    const timeStr = formatTime(this.worldState.time);
    const windStr = t("hud.wind", { pct: (this.worldState.weather.windStrength * 100).toFixed(0) });

    let hullStr = "";
    if (playerEntity?.ship) {
      hullStr = `${t("hud.hull", { current: Math.round(playerEntity.ship.hullHp), max: playerEntity.ship.hullMax })}  ${t("hud.sails", { current: Math.round(playerEntity.ship.sailsHp), max: playerEntity.ship.sailsMax })}`;
    }

    const sailPct = ((playerEntity?.sailLevel ?? 0) * 100).toFixed(0);
    const posStr = playerEntity
      ? t("hud.pos", { x: Math.round(playerEntity.pos.x), y: Math.round(playerEntity.pos.y) })
      : "";
    const speedStr = playerEntity
      ? t("hud.speed", { value: Math.round(Math.sqrt(playerEntity.vel.x ** 2 + playerEntity.vel.y ** 2) * 100) / 100 })
      : "";
    this.hudText.setText(
      `${timeStr}  |  ${t("hud.gold")}: ${player.gold}  |  ${windStr}\n${hullStr}  |  ${t("hud.sail_pct", { pct: sailPct })}  |  ${speedStr}\n${posStr}  |  ${t("hud.controls")}`,
    );
  }

  private updatePortPrompt(): void {
    const nearPort = this.findNearPort();
    if (nearPort) {
      // Auto-trigger dialog when first entering dock radius
      if (!this.wasNearPort && !this.portDialogOpen) {
        this.openPortDialog(nearPort);
      }
      this.wasNearPort = true;
      const promptPortKey = Object.entries(PORTS).find(([_, p]) => p === nearPort)?.[0] ?? "";
      this.portPromptText!.setText(t("approach.prompt", { name: t("port." + promptPortKey + ".name") }));
      this.portPromptText!.setVisible(!this.portDialogOpen);
    } else {
      this.wasNearPort = false;
      this.portPromptText!.setVisible(false);
    }
  }

  private handleTransition(t: Transition): void {
    const payload = t.payload as Record<string, unknown> | undefined;
    switch (t.scene) {
      case "Port":
        this.scene.start("PortScene", { worldState: this.worldState, portId: payload?.portId });
        break;
      case "SeaBattle":
        this.scene.start("SeaBattleScene", { worldState: this.worldState, enemyId: payload?.enemyId });
        break;
      default:
        break;
    }
  }

  shutdown(): void {
    this.worldRenderer.destroy();
    this.minimap.destroy();
    this.cloudRenderer.destroy();
    this.windCompass.destroy();
    this.inputMapper.destroy();
  }
}
