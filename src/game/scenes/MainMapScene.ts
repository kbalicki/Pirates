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
import { formatCalendarDate } from "../../core/systems/TimeSystem.ts";
import { t } from "../../core/i18n/index.ts";
import { txt } from "../ui/textStyle.ts";
import { APP_VERSION } from "../../version.ts";

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

  private dateText!: Phaser.GameObjects.Text;
  private hudText!: Phaser.GameObjects.Text;
  private portPromptText: Phaser.GameObjects.Text | null = null;
  private portDialogOpen = false;
  private wasNearPort = false;
  private windSound: Phaser.Sound.BaseSound | null = null;

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

    // Date display — small black text, top-left
    this.dateText = this.add.text(10, 8, "", txt(11, { color: "#111111" }));
    this.dateText.setScrollFactor(0);
    this.dateText.setDepth(9500);

    // Compact HUD — below date
    this.hudText = this.add.text(10, 40, "", {
      ...txt(11, { color: "#ffffff" }),
      backgroundColor: "#00000088",
      padding: { x: 6, y: 3 },
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

    // Version label — bottom-right
    const versionText = this.add.text(
      this.cameras.main.width - 6, this.cameras.main.height - 4,
      `v${APP_VERSION}`, txt(8, { color: "#666666" }),
    );
    versionText.setOrigin(1, 1);
    versionText.setScrollFactor(0);
    versionText.setDepth(9500);

    // Wind ambient sound
    if (this.cache.audio.exists("wind_loop")) {
      this.windSound = this.sound.add("wind_loop", { loop: true, volume: 0 });
      (this.windSound as Phaser.Sound.WebAudioSound).play();
    }

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
    // Always use the Caribbean background image when available
    this.createProceduralSea();
  }

  private createProceduralSea(): void {
    const mapW = 3200;
    const mapH = 2400;

    // --- Map background image ---
    if (this.textures.exists("caribbean_bg")) {
      const bgSprite = this.add.image(0, 0, "caribbean_bg");
      bgSprite.setOrigin(0, 0);
      bgSprite.setDepth(-1000);
    } else {
      // Fallback: solid ocean
      const bg = this.add.graphics();
      bg.setDepth(-1000);
      bg.fillStyle(0x071e3d, 1);
      bg.fillRect(0, 0, mapW, mapH);
    }

    // --- Organic wave patterns over the ocean ---
    const waves = this.add.graphics();
    waves.setDepth(-900);

    let waveSeed = 137;
    const waveRand = () => {
      waveSeed = (waveSeed * 16807) % 2147483647;
      return waveSeed / 2147483647;
    };

    for (let i = 0; i < 100; i++) {
      const sx = waveRand() * mapW;
      const sy = waveRand() * mapH;
      // Skip waves on land
      let onLand = false;
      for (const lm of LANDMASSES) {
        if (pointInPolygon({ x: sx, y: sy }, lm.polygon)) { onLand = true; break; }
      }
      if (onLand) continue;

      const angle = (waveRand() - 0.5) * 0.6;
      const len = 60 + waveRand() * 160;
      const amp = 1.5 + waveRand() * 2.5;
      const freq = 0.03 + waveRand() * 0.05;
      const alpha = 0.04 + waveRand() * 0.06;

      waves.lineStyle(1, 0x5a9aba, alpha);
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

    // --- Foam / whitecap dots ---
    const detail = this.add.graphics();
    detail.setDepth(-800);
    let seed = 42;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 120; i++) {
      const fx = rand() * mapW;
      const fy = rand() * mapH;
      let onLand = false;
      for (const lm of LANDMASSES) {
        if (pointInPolygon({ x: fx, y: fy }, lm.polygon)) { onLand = true; break; }
      }
      if (onLand) continue;
      detail.fillStyle(0xffffff, 0.04 + rand() * 0.04);
      detail.fillCircle(fx, fy, 1 + rand() * 2);
    }

    // --- Beach fringe along coastlines ---
    const beach = this.add.graphics();
    beach.setDepth(-850);
    for (const lm of LANDMASSES) {
      if (lm.polygon.length < 3) continue;
      // Outer sandy glow
      beach.lineStyle(8, 0xd4c07a, 0.25);
      beach.beginPath();
      beach.moveTo(lm.polygon[0].x, lm.polygon[0].y);
      for (let i = 1; i < lm.polygon.length; i++) {
        beach.lineTo(lm.polygon[i].x, lm.polygon[i].y);
      }
      beach.closePath();
      beach.strokePath();
      // Inner sand edge
      beach.lineStyle(3, 0xe8d9a0, 0.35);
      beach.beginPath();
      beach.moveTo(lm.polygon[0].x, lm.polygon[0].y);
      for (let i = 1; i < lm.polygon.length; i++) {
        beach.lineTo(lm.polygon[i].x, lm.polygon[i].y);
      }
      beach.closePath();
      beach.strokePath();
      // Foam highlight
      beach.lineStyle(1.5, 0xffffff, 0.12);
      beach.beginPath();
      beach.moveTo(lm.polygon[0].x, lm.polygon[0].y);
      for (let i = 1; i < lm.polygon.length; i++) {
        beach.lineTo(lm.polygon[i].x, lm.polygon[i].y);
      }
      beach.closePath();
      beach.strokePath();
    }
  }

  private createTerrainQuery(): (wx: number, wy: number) => TerrainType {
    // Pre-compute port positions for dock-area exemption
    const portAreas = Object.values(PORTS).map((p) => ({
      x: p.pos.x,
      y: p.pos.y,
      r2: (p.dockRadius + 10) * (p.dockRadius + 10),
    }));

    return (wx: number, wy: number): TerrainType => {
      if (wx < 0 || wy < 0 || wx > 3200 || wy > 2400) {
        return "land";
      }

      // Near a port dock → always navigable water
      for (const pa of portAreas) {
        const dx = wx - pa.x;
        const dy = wy - pa.y;
        if (dx * dx + dy * dy < pa.r2) {
          return "sea";
        }
      }

      for (const lm of LANDMASSES) {
        if (pointInPolygon({ x: wx, y: wy }, lm.polygon)) {
          return "land";
        }
      }
      return "sea";
    };
  }

  private drawPortMarkers(): void {
    const g = this.add.graphics();
    g.setDepth(500);

    for (const [portKey, port] of Object.entries(PORTS)) {
      this.drawCityIcon(g, port);

      const isLarge = port.population === "large" || port.population === "capital";
      const labelSize = isLarge ? 14 : port.population === "medium" ? 12 : 10;
      const labelY = port.type === "fort"
        ? port.pos.y - (isLarge ? 30 : 22)
        : port.pos.y - (isLarge ? 36 : port.population === "medium" ? 28 : 18);

      const label = this.add.text(port.pos.x, labelY, t("port." + portKey + ".name"), {
        ...txt(labelSize, { bold: true }),
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
    const pop = port.population;

    if (port.type === "fort") {
      this.drawFort(g, x, y, flagColor, pop);
    } else if (pop === "large" || pop === "capital") {
      this.drawCityLarge(g, x, y, flagColor);
    } else if (pop === "medium") {
      this.drawCityMedium(g, x, y, flagColor);
    } else {
      this.drawCitySmall(g, x, y, flagColor);
    }
  }

  /** Large city: walled town with church, multiple buildings, prominent flag */
  private drawCityLarge(g: Phaser.GameObjects.Graphics, x: number, y: number, flagColor: number): void {
    // City wall base
    g.fillStyle(0x8a7a5a, 1);
    g.fillRect(x - 18, y + 2, 36, 4);
    // Wall crenellations
    g.fillStyle(0x7a6a4a, 1);
    for (let i = -17; i <= 15; i += 4) {
      g.fillRect(x + i, y - 1, 3, 3);
    }

    // Left building
    g.fillStyle(0xc9a855, 1);
    g.fillRect(x - 14, y - 8, 8, 10);
    g.fillStyle(0x8b4513, 1);
    g.fillTriangle(x - 15, y - 8, x - 5, y - 8, x - 10, y - 13);

    // Central tall building (town hall)
    g.fillStyle(0xb89845, 1);
    g.fillRect(x - 4, y - 12, 9, 14);
    g.fillStyle(0x8b4513, 1);
    g.fillTriangle(x - 5, y - 12, x + 6, y - 12, x + 0.5, y - 17);

    // Right building
    g.fillStyle(0xc9a855, 1);
    g.fillRect(x + 7, y - 6, 7, 8);
    g.fillStyle(0x8b4513, 1);
    g.fillTriangle(x + 6, y - 6, x + 15, y - 6, x + 10.5, y - 10);

    // Church tower (tallest element)
    g.fillStyle(0xd4b96a, 1);
    g.fillRect(x - 1, y - 22, 3, 10);
    g.fillStyle(0xccaa55, 1);
    g.fillTriangle(x - 2, y - 22, x + 3, y - 22, x + 0.5, y - 26);
    // Cross on top
    g.lineStyle(1, 0xffdd44, 0.9);
    g.lineBetween(x + 0.5, y - 26, x + 0.5, y - 29);
    g.lineBetween(x - 1, y - 28, x + 2, y - 28);

    // Windows (lit)
    g.fillStyle(0xffdd44, 0.7);
    g.fillRect(x - 12, y - 6, 2, 2);
    g.fillRect(x - 9, y - 6, 2, 2);
    g.fillRect(x - 2, y - 10, 2, 2);
    g.fillRect(x + 2, y - 10, 2, 2);
    g.fillRect(x - 2, y - 6, 2, 2);
    g.fillRect(x + 2, y - 6, 2, 2);
    g.fillRect(x + 9, y - 4, 2, 2);

    // Doors
    g.fillStyle(0x443322, 1);
    g.fillRect(x - 1, y - 2, 3, 4);
    g.fillRect(x - 11, y - 2, 3, 4);

    // Flag pole (right side)
    g.lineStyle(1, 0xdddddd, 0.9);
    g.lineBetween(x + 14, y - 6, x + 14, y - 16);
    g.fillStyle(flagColor, 1);
    g.fillTriangle(x + 14, y - 16, x + 20, y - 14, x + 14, y - 12);
  }

  /** Medium city: 2-3 buildings with roofs, flag */
  private drawCityMedium(g: Phaser.GameObjects.Graphics, x: number, y: number, flagColor: number): void {
    // Left building
    g.fillStyle(0xc9a855, 1);
    g.fillRect(x - 9, y - 4, 7, 7);
    g.fillStyle(0x8b4513, 1);
    g.fillTriangle(x - 10, y - 4, x - 1, y - 4, x - 5.5, y - 8);

    // Central building (taller)
    g.fillStyle(0xb89845, 1);
    g.fillRect(x - 1, y - 7, 6, 10);
    g.fillStyle(0x8b4513, 1);
    g.fillTriangle(x - 2, y - 7, x + 6, y - 7, x + 2, y - 12);

    // Tower/steeple
    g.fillStyle(0xd4b96a, 1);
    g.fillRect(x + 1, y - 16, 2, 4);
    g.fillStyle(0xccaa55, 1);
    g.fillTriangle(x, y - 16, x + 4, y - 16, x + 2, y - 19);

    // Right small structure
    g.fillStyle(0xc9a855, 1);
    g.fillRect(x + 6, y - 2, 5, 5);
    g.fillStyle(0x8b4513, 1);
    g.fillTriangle(x + 5, y - 2, x + 12, y - 2, x + 8.5, y - 5);

    // Windows
    g.fillStyle(0xffdd44, 0.7);
    g.fillRect(x - 7, y - 2, 2, 2);
    g.fillRect(x + 1, y - 5, 2, 2);
    g.fillRect(x + 1, y - 1, 2, 2);

    // Door
    g.fillStyle(0x443322, 1);
    g.fillRect(x + 1, y + 1, 2, 2);

    // Flag pole
    g.lineStyle(1, 0xdddddd, 0.8);
    g.lineBetween(x + 9, y - 2, x + 9, y - 10);
    g.fillStyle(flagColor, 1);
    g.fillTriangle(x + 9, y - 10, x + 14, y - 8.5, x + 9, y - 7);
  }

  /** Small settlement: 1-2 huts, tiny flag */
  private drawCitySmall(g: Phaser.GameObjects.Graphics, x: number, y: number, flagColor: number): void {
    // Main hut
    g.fillStyle(0x8b7355, 1);
    g.fillRect(x - 5, y - 2, 6, 5);
    g.fillStyle(0x556633, 1);
    g.fillTriangle(x - 6, y - 2, x + 2, y - 2, x - 2, y - 6);

    // Second small hut
    g.fillStyle(0x8b7355, 1);
    g.fillRect(x + 2, y - 1, 5, 4);
    g.fillStyle(0x556633, 1);
    g.fillTriangle(x + 1, y - 1, x + 8, y - 1, x + 4.5, y - 4);

    // Dock/pier
    g.fillStyle(0x8b6b40, 0.8);
    g.fillRect(x - 1, y + 3, 2, 5);
    g.fillRect(x - 3, y + 7, 6, 2);

    // Small flag pole
    g.lineStyle(1, 0xaaaaaa, 0.8);
    g.lineBetween(x - 3, y - 2, x - 3, y - 10);
    g.fillStyle(flagColor, 1);
    g.fillTriangle(x - 3, y - 10, x + 1, y - 8.5, x - 3, y - 7);
  }

  /** Fort: stone walls with towers, scales by population */
  private drawFort(g: Phaser.GameObjects.Graphics, x: number, y: number, flagColor: number, pop: string): void {
    const big = pop === "large" || pop === "capital" || pop === "medium";
    const s = big ? 1.2 : 1.0;

    // Main wall
    g.fillStyle(0x777777, 1);
    g.fillRect(x - 9 * s, y - 7 * s, 18 * s, 14 * s);

    // Corner towers
    g.fillStyle(0x666666, 1);
    g.fillRect(x - 11 * s, y - 9 * s, 5 * s, 5 * s);
    g.fillRect(x + 6 * s, y - 9 * s, 5 * s, 5 * s);
    g.fillRect(x - 11 * s, y + 4 * s, 5 * s, 5 * s);
    g.fillRect(x + 6 * s, y + 4 * s, 5 * s, 5 * s);

    // Battlements
    g.fillStyle(0x888888, 1);
    for (let i = -10 * s; i <= 8 * s; i += 3 * s) {
      g.fillRect(x + i, y - 11 * s, 2 * s, 2 * s);
    }

    // Gate
    g.fillStyle(0x443322, 1);
    g.fillRect(x - 2 * s, y + 2 * s, 4 * s, 5 * s);

    // Gate arch
    g.lineStyle(1, 0x555555, 0.8);
    g.strokeRect(x - 2 * s, y + 2 * s, 4 * s, 5 * s);

    // Flag pole
    g.lineStyle(1, 0xdddddd, 0.9);
    g.lineBetween(x - 9 * s, y - 9 * s, x - 9 * s, y - 16 * s);
    g.fillStyle(flagColor, 1);
    g.fillTriangle(x - 9 * s, y - 16 * s, x - 3 * s, y - 14 * s, x - 9 * s, y - 12 * s);

    if (big) {
      // Extra detail for larger forts: cannon positions
      g.fillStyle(0x333333, 1);
      g.fillCircle(x - 8 * s, y - 6 * s, 1.5);
      g.fillCircle(x + 8 * s, y - 6 * s, 1.5);
      g.fillCircle(x - 8 * s, y + 6 * s, 1.5);
      g.fillCircle(x + 8 * s, y + 6 * s, 1.5);
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

    // Game speed multiplier scales the effective simulation rate
    const speedMultiplier = this.worldState.gameSpeed ?? 1.2;
    this.tickAccumulator += delta * speedMultiplier;

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

    // Wind sound volume follows wind strength
    if (this.windSound && "setVolume" in this.windSound) {
      (this.windSound as Phaser.Sound.WebAudioSound).setVolume(
        this.worldState.weather.windStrength * 0.6,
      );
    }

    this.updateHud();
    this.updatePortPrompt();
  }

  private updateHud(): void {
    const player = this.worldState.player;
    const playerEntity = this.worldState.entities[player.shipId as string];

    // Date text (top-left, no background)
    const dateStr = formatCalendarDate(this.worldState.time, this.worldState.startYear);
    const hh = String(this.worldState.time.hour).padStart(2, "0");
    const mm = String(this.worldState.time.minute).padStart(2, "0");
    this.dateText.setText(`${dateStr}\n${hh}:${mm}`);

    // Compact HUD
    let line1 = `${t("hud.gold")}: ${player.gold}`;
    if (playerEntity?.ship) {
      line1 += `  |  ${t("hud.hull", { current: Math.round(playerEntity.ship.hullHp), max: playerEntity.ship.hullMax })}`;
      line1 += `  |  ${t("hud.crew", { current: playerEntity.ship.crew.current, max: playerEntity.ship.crew.max })}`;
    }

    const sailPct = ((playerEntity?.sailLevel ?? 0) * 100).toFixed(0);
    const speedStr = playerEntity
      ? t("hud.speed", { value: Math.round(Math.sqrt(playerEntity.vel.x ** 2 + playerEntity.vel.y ** 2) * 100) / 100 })
      : "";
    const line2 = `${t("hud.sail_pct", { pct: sailPct })}  |  ${speedStr}  |  ${t("hud.controls")}`;

    this.hudText.setText(`${line1}\n${line2}`);
  }

  private updatePortPrompt(): void {
    const nearPort = this.findNearPort();
    if (nearPort) {
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
    if (this.windSound) {
      this.windSound.stop();
      this.windSound.destroy();
      this.windSound = null;
    }
  }
}
