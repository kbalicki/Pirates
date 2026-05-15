import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import type { Transition } from "../../core/model/Events.ts";
import { WorldEngine } from "../../core/engine/WorldEngine.ts";
import { type TerrainType, findOpenSeaHeading } from "../../core/systems/NavigationSystem.ts";
import { WorldRenderer, visionRangeForMast } from "../render/WorldRenderer.ts";
import { fleetMaxMastHeight } from "../../core/systems/FleetSystem.ts";
import { CameraController } from "../render/CameraController.ts";
// MinimapRenderer removed — map available in SPACE menu
import { CloudRenderer } from "../render/CloudRenderer.ts";
import { SeagullRenderer } from "../render/SeagullRenderer.ts";
import type { UIOverlayScene } from "./UIOverlayScene.ts";
import { FxManager } from "../render/FxManager.ts";
import { generateFlagTextures, generateCrewTexture } from "../render/TextureFactory.ts";
import { PortMarkerRenderer } from "../render/PortMarkerRenderer.ts";
import { WaterRenderer } from "../render/WaterRenderer.ts";
import { CartographicGrid } from "../render/CartographicGrid.ts";
import { CirrusRenderer } from "../render/CirrusRenderer.ts";

import { PalmRenderer } from "../render/PalmRenderer.ts";
import { MountainRenderer } from "../render/MountainRenderer.ts";
import { InputMapper } from "../input/InputMapper.ts";
import { SailSystem } from "../../core/systems/SailSystem.ts";
import { isInIrons } from "../../core/systems/WeatherSystem.ts";
import { SHIP_CLASSES } from "../../core/data/ships.ts";
import { CommandQueue } from "../input/CommandQueue.ts";
import { PORTS } from "../../core/data/ports.ts";
import type { PortDef } from "../../core/data/ports.ts";
import { LANDMASSES, setLandmasses } from "../../core/data/geography.ts";
import type { LandmassDef, LandmassBbox } from "../../core/data/geography.ts";
import { vec2Dist, pointInLandmass, chaikinSmooth } from "../../core/services/Geometry.ts";
import { buildPortWaterCache } from "../../core/systems/PortWaterPositions.ts";
import { formatCalendarDate } from "../../core/systems/TimeSystem.ts";
import { t } from "../../core/i18n/index.ts";
import { txt } from "../ui/textStyle.ts";
import { getSoundGain } from "../settings/SoundSettings.ts";
// APP_VERSION moved to UIOverlayScene

// Variable timestep — 1 tick per frame, dtTicks proportional to delta

export class MainMapScene extends Phaser.Scene {
  private worldState!: WorldState;
  private engine!: WorldEngine;
  private worldRenderer!: WorldRenderer;
  private cameraCtrl!: CameraController;
  // minimap removed — info available in SPACE menu
  private cloudRenderer!: CloudRenderer;
  private cirrusRenderer!: CirrusRenderer;


  private palmRenderer!: PalmRenderer;
  private mountainRenderer!: MountainRenderer;
  private seaTextureTile: Phaser.GameObjects.TileSprite | null = null;
  private beachGfx: Phaser.GameObjects.Graphics | null = null;
  private seagullRenderer!: SeagullRenderer;
  private uiOverlay!: UIOverlayScene;
  private waterRenderer!: WaterRenderer;
  private cartographicGrid!: CartographicGrid;
  private landGrid!: boolean[][];
  private inputMapper!: InputMapper;
  private sailSystem = new SailSystem(0);
  private commandQueue!: CommandQueue;

  // tickAccumulator removed — using variable timestep (1 tick per frame)
  /** Force furled sails on first update tick */
  private needSailReset = true;
  private sailResetFrames = 0;

  // dateText moved to UIOverlayScene
  private portPromptText: Phaser.GameObjects.Text | null = null;
  private portDialogOpen = false;
  private wasNearPort = false;
  private shipEncounterOpen = false;
  private lastEncounteredNpcId: string | null = null;
  // versionText moved to UIOverlayScene
  private onResize: ((gameSize: Phaser.Structs.Size) => void) | null = null;
  private windSound: Phaser.Sound.BaseSound | null = null;

  /** Public: re-apply wind volume immediately (called from OptionsMenu when slider changes). */
  applyWindVolume(): void {
    if (this.windSound && "setVolume" in this.windSound) {
      const gain = getSoundGain("wind");
      const wind = this.worldState?.weather?.windStrength ?? 0.5;
      const vol = (0.25 + wind * 0.55) * gain;
      (this.windSound as Phaser.Sound.WebAudioSound).setVolume(vol);
    }
  }

  private gridContainer: Phaser.GameObjects.Container | null = null;
  private osmCities: Array<{ name: string; x: number; y: number }> = [];
  /** Cached nudged port positions (on land). Key = port id string. */
  private portSafePositions: Map<string, { x: number; y: number }> = new Map();
  /** All city/port labels with anchor points for zoom-independent positioning. */
  private cityLabels: Array<{ text: Phaser.GameObjects.Text; anchorX: number; anchorY: number; offsetPx: number }> = [];
  private cityGraphics: Phaser.GameObjects.Graphics | null = null;
  private flagImages: Phaser.GameObjects.Image[] = [];
  private coordLabels: Array<{ text: Phaser.GameObjects.Text; anchorX: number; anchorY: number }> = [];

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

    // Load real geography from JSON (generated by scripts/generate_caribbean_geo.mjs)
    this.initGeoData();

    this.createTilemap();
    generateFlagTextures(this);
    generateCrewTexture(this);

    const terrainQuery = this.createTerrainQuery();
    this.engine = new WorldEngine(terrainQuery);
    this.worldRenderer = new WorldRenderer();

    const mapW = 3200;
    const mapH = 2400;

    this.cameraCtrl = new CameraController(this.cameras.main);
    // pixelArt:true forces roundPixels=true, causing 1-world-px jumps (12 screen px at max zoom)
    this.cameras.main.setRoundPixels(false);
    this.cameraCtrl.setBounds(0, 0, mapW, mapH);

    // Snap camera to player immediately so we don't start at (0,0)
    const playerEntity = this.worldState.entities[this.worldState.player.shipId as string];
    if (playerEntity) {
      this.cameraCtrl.snapTo(playerEntity.pos);
    }

    this.cloudRenderer = new CloudRenderer(this, mapW, mapH);
    this.cirrusRenderer = new CirrusRenderer(this, mapW, mapH);


    this.palmRenderer = new PalmRenderer(this, this.landGrid);
    this.mountainRenderer = new MountainRenderer(this, this.landGrid);
    this.seagullRenderer = new SeagullRenderer(this, this.landGrid);
    // Launch UI overlay scene (separate layer, no zoom)
    if (!this.scene.isActive("UIOverlayScene")) {
      this.scene.launch("UIOverlayScene");
    }
    this.uiOverlay = this.scene.get("UIOverlayScene") as UIOverlayScene;

    new FxManager(this);

    this.commandQueue = new CommandQueue();
    this.sailSystem = new SailSystem(0);
    this.inputMapper = new InputMapper(this, this.commandQueue, this.sailSystem);

    // Date display moved to UIOverlayScene

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

    // Version label moved to UIOverlayScene

    // Wind ambient sound
    if (this.cache.audio.exists("wind_loop")) {
      this.windSound = this.sound.add("wind_loop", { loop: true, volume: 0 });
      (this.windSound as Phaser.Sound.WebAudioSound).play();
    }

    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-E", () => {
        const pe = this.worldState.entities[this.worldState.player.shipId as string];
        // E key: embark on ship when landed near anchor
        if (pe?.mode === "landed" && pe.anchorPos) {
          const distToShip = vec2Dist(pe.pos, pe.anchorPos);
          if (distToShip < 50) {
            this.commandQueue.push({ type: "Embark" });
            return;
          }
        }
        // E key: interact with port
        if (!this.portDialogOpen) {
          const nearPort = this.findNearPort();
          if (nearPort) {
            this.openPortDialog(nearPort);
          }
        }
      });

      this.input.keyboard.on("keydown-G", () => {
        this.toggleGrid();
      });

      this.input.keyboard.on("keydown-H", () => {
        this.scene.launch("HelpScene");
        this.time.delayedCall(0, () => this.scene.pause());
      });

      this.input.keyboard.on("keydown-V", () => {
        this.worldRenderer.fogOfWarEnabled = !this.worldRenderer.fogOfWarEnabled;
        // minimap removed
        const mode = this.worldRenderer.fogOfWarEnabled ? "ON" : "OFF (test)";
        this.worldRenderer.applyEvents(this, [{ type: "Toast", message: `Fog of war: ${mode}` }]);
      });

      this.input.keyboard.on("keydown-L", () => {
        this.toggleLandMode();
      });

      this.input.keyboard.on("keydown-SPACE", () => {
        if (this.scene.isActive("OptionsMenuScene") || this.shipEncounterOpen) return;
        // Snapshot player ship heading/velocity so they survive the pause/resume cycle
        const pid = this.worldState.player.shipId as string;
        const pe = this.worldState.entities[pid];
        const headingSnap = pe?.heading ?? 0;
        const velSnap = pe?.vel;

        this.scene.launch("OptionsMenuScene", {
          worldState: this.worldState,
        });
        this.scene.pause();

        // Pull keyboard state to a safe default so JustDown latches don't fire on resume
        this.commandQueue.drain();
        if (this.input.keyboard) this.input.keyboard.resetKeys();

        this.scene.get("OptionsMenuScene")?.events.once("shutdown", () => {
          // Refresh worldState from registry (menu may have mutated it)
          this.worldState = this.registry.get("worldState") ?? this.worldState;
          const cur = this.worldState.entities[pid];
          if (cur && cur.kind === "ship") {
            this.worldState = {
              ...this.worldState,
              entities: {
                ...this.worldState.entities,
                [pid]: { ...cur, heading: headingSnap, vel: velSnap ?? cur.vel },
              },
            };
            this.registry.set("worldState", this.worldState);
          }
          this.commandQueue.drain();
          if (this.input.keyboard) this.input.keyboard.resetKeys();
        });
      });
    }

    // Mouse wheel zoom
    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _over: Phaser.GameObjects.GameObject[], _dx: number, deltaY: number) => {
      this.cameraCtrl.adjustZoom(deltaY);
    });

    // Click on city → show info panel
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.portDialogOpen) return;
      // Convert screen coords to world coords
      const worldPos = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      // Find nearest city within click radius (scaled by zoom)
      const clickRadius = 20 / this.cameras.main.zoom + 10; // generous at all zooms
      let nearestKey: string | null = null;
      let nearestDist = Infinity;
      for (const [portKey, port] of Object.entries(PORTS)) {
        const checkPos = this.portSafePositions.get(portKey) ?? port.pos;
        const dx = worldPos.x - checkPos.x;
        const dy = worldPos.y - checkPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < clickRadius && dist < nearestDist) {
          nearestDist = dist;
          nearestKey = portKey;
        }
      }
      if (nearestKey) {
        this.scene.launch("CityInfoScene", {
          portKey: nearestKey,
          worldState: this.worldState,
        });
        this.time.delayedCall(0, () => this.scene.pause());
      }
    });

    // Listen for PortApproachScene closing — resume ourselves
    this.events.on("resume", () => {
      this.portDialogOpen = false;
      // Only push to open sea if ship is sailing AND not in embark grace period
      const pe = this.worldState.entities[this.worldState.player.shipId as string];
      if (pe?.mode === "sailing" && !pe.embarkTick) {
        this.pushShipToOpenSea();
        this.sailSystem.setImmediate(1); // Reefed on departure
      }
    });

    // Dynamic resize handling
    this.onResize = (gameSize: Phaser.Structs.Size) => {
      this.cameras.main.setSize(gameSize.width, gameSize.height);
      // Reposition fixed HUD elements
      this.portPromptText!.setPosition(gameSize.width / 2, gameSize.height - 60);
      // versionText in UIOverlayScene
      // UI overlay repositions itself via its own resize handler
      // Minimap repositions itself each frame via cam.width
    };
    this.scale.on("resize", this.onResize);

    const portMarkers = new PortMarkerRenderer(this, this.landGrid).render();
    this.portSafePositions = portMarkers.portSafePositions;
    this.cityLabels = portMarkers.cityLabels;
    this.coordLabels = portMarkers.coordLabels;
    this.cityGraphics = portMarkers.cityGraphics;
    this.flagImages = portMarkers.flagImages;
    // OSM geographic labels removed — only port names shown
    this.worldRenderer.sync(this, this.worldState);
  }

  private initGeoData(): void {
    if (!this.cache.json.exists("caribbean_geo")) {
      console.warn("caribbean_geo.json not loaded — using fallback polygons");
      return;
    }

    const raw = this.cache.json.get("caribbean_geo") as {
      landmasses: Array<{
        id: string;
        polygon: number[][];
        bbox: [number, number, number, number];
      }>;
      osmCities: Array<{ name: string; x: number; y: number }>;
    };

    const parsed: LandmassDef[] = raw.landmasses.map((lm) => ({
      id: lm.id,
      polygon: lm.polygon.map(([x, y]) => ({ x, y })),
      bbox: {
        minX: lm.bbox[0],
        minY: lm.bbox[1],
        maxX: lm.bbox[2],
        maxY: lm.bbox[3],
      } as LandmassBbox,
    }));

    setLandmasses(parsed);
    buildPortWaterCache(); // Pre-compute water positions near ports for NPC navigation
    this.osmCities = raw.osmCities ?? [];
    console.log(`Loaded ${parsed.length} landmasses, ${this.osmCities.length} OSM cities`);
  }

  private createTilemap(): void {
    // All packs use OSM procedural rendering for now
    const mapW = 3200;
    const mapH = 2400;

    // Animated water surface with subtle wave patterns
    this.waterRenderer = new WaterRenderer(this, mapW, mapH);

    // Sea photo texture — mirror-tiled for seamless joins, UNDER wave layers
    if (this.textures.exists("sea_texture")) {
      // Scale source to 1024×1024 square, then mirror-tile → 2048×2048 seamless
      const srcImg = this.textures.get("sea_texture").getSourceImage() as HTMLImageElement;
      const HALF = 1024;
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = HALF;
      cropCanvas.height = HALF;
      const cctx = cropCanvas.getContext("2d")!;
      // Scale full source into 1024×1024 (slight stretch OK — it's water)
      cctx.drawImage(srcImg, 0, 0, srcImg.width, srcImg.height, 0, 0, HALF, HALF);

      // Mirror-tile: 2×2 → seamless 2048×2048
      const mirrorCanvas = document.createElement("canvas");
      mirrorCanvas.width = HALF * 2;
      mirrorCanvas.height = HALF * 2;
      const mctx = mirrorCanvas.getContext("2d")!;
      // Top-left: original
      mctx.drawImage(cropCanvas, 0, 0);
      // Top-right: flip horizontal
      mctx.save(); mctx.translate(HALF * 2, 0); mctx.scale(-1, 1);
      mctx.drawImage(cropCanvas, 0, 0); mctx.restore();
      // Bottom-left: flip vertical
      mctx.save(); mctx.translate(0, HALF * 2); mctx.scale(1, -1);
      mctx.drawImage(cropCanvas, 0, 0); mctx.restore();
      // Bottom-right: flip both
      mctx.save(); mctx.translate(HALF * 2, HALF * 2); mctx.scale(-1, -1);
      mctx.drawImage(cropCanvas, 0, 0); mctx.restore();

      const seaKey = "__sea_mirror";
      if (this.textures.exists(seaKey)) this.textures.remove(seaKey);
      const seaTex = this.textures.addCanvas(seaKey, mirrorCanvas);
      if (seaTex) seaTex.setFilter(Phaser.Textures.FilterMode.LINEAR);

      // TileSprite: scaled so 1 texture pixel ≈ 1 screen pixel at max zoom (12x)
      this.seaTextureTile = this.add.tileSprite(mapW / 2, mapH / 2, mapW, mapH, seaKey);
      this.seaTextureTile.setOrigin(0.5, 0.5);
      this.seaTextureTile.setDepth(-999);
      this.seaTextureTile.setAlpha(0.66);
      const MAX_ZOOM = 12;
      this.seaTextureTile.setTileScale(1 / MAX_ZOOM, 1 / MAX_ZOOM);
    }

    // Cartographic lat/lon grid (visible at far zoom only)
    this.cartographicGrid = new CartographicGrid(this, mapW, mapH);
    // No Graphics needed — eliminates potential WebGL bounding box artifacts

    const drawPoly = (gfx: Phaser.GameObjects.Graphics, pts: { x: number; y: number }[]) => {
      gfx.beginPath();
      gfx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) gfx.lineTo(pts[i].x, pts[i].y);
      gfx.closePath();
    };

    // Draw landmasses with smoothed coastlines
    const landGfx = this.add.graphics();
    landGfx.setDepth(-900);
    for (const lm of LANDMASSES) {
      if (lm.polygon.length < 3) continue;
      const smooth = chaikinSmooth(lm.polygon, 3);
      // Filled green land
      landGfx.fillStyle(0x5C6628, 1);
      drawPoly(landGfx, smooth);
      landGfx.fillPath();
    }

    // Beach: Phaser Graphics strokes (GPU-rendered, no pixelation)
    // 3 overlapping strokes: outer faint → center bright
    this.beachGfx = this.add.graphics();
    this.beachGfx.setDepth(-895);
    for (const lm of LANDMASSES) {
      if (lm.polygon.length < 3) continue;
      const smooth = chaikinSmooth(lm.polygon, 3); // 3 iterations for smoother curves
      // Outer glow (0.8px, 20% alpha)
      this.beachGfx.lineStyle(0.8, 0xc8a84e, 0.20);
      drawPoly(this.beachGfx, smooth);
      this.beachGfx.strokePath();
      // Mid (0.5px, 35%)
      this.beachGfx.lineStyle(0.5, 0xc8a84e, 0.35);
      drawPoly(this.beachGfx, smooth);
      this.beachGfx.strokePath();
      // Center (0.3px, 60%)
      this.beachGfx.lineStyle(0.3, 0xc8a84e, 0.60);
      drawPoly(this.beachGfx, smooth);
      this.beachGfx.strokePath();
    }

    // Build land grid from polygons for navigation/seagulls
    // Sample a 4x4 sub-grid per cell so small islands (< 32px) aren't missed
    const CELL = 32;
    const cols = Math.ceil(mapW / CELL);
    const rows = Math.ceil(mapH / CELL);
    const SUB = 4; // sub-samples per axis
    const step = CELL / SUB;
    this.landGrid = Array.from({ length: rows }, () => Array(cols).fill(false));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let found = false;
        for (let sy = 0; sy < SUB && !found; sy++) {
          for (let sx = 0; sx < SUB && !found; sx++) {
            const px = c * CELL + step * (sx + 0.5);
            const py = r * CELL + step * (sy + 0.5);
            const pt = { x: px, y: py };
            for (const lm of LANDMASSES) {
              if (pointInLandmass(pt, lm)) {
                this.landGrid[r][c] = true;
                found = true;
                break;
              }
            }
          }
        }
      }
    }
  }

  private toggleLandMode(): void {
    const playerEntity = this.worldState.entities[this.worldState.player.shipId as string];
    if (!playerEntity) return;

    // L key only used to embark (return to ship) — disembark is automatic on land collision
    if (playerEntity.mode === "landed") {
      this.commandQueue.push({ type: "Embark" });
    }
  }

  private createTerrainQuery(): (wx: number, wy: number) => TerrainType {
    return (wx: number, wy: number): TerrainType => {
      if (wx < 0 || wy < 0 || wx > 3200 || wy > 2400) {
        return "land";
      }

      const pt = { x: wx, y: wy };
      for (const lm of LANDMASSES) {
        if (pointInLandmass(pt, lm)) {
          return "land";
        }
      }
      return "sea";
    };
  }

  /** Convert lon/lat to pixel coordinates (same Mercator formula as cities.ts geoToMap). */
  private geoToPixel(lon: number, lat: number): { x: number; y: number } {
    const mercYFn = (l: number) => Math.log(Math.tan(Math.PI / 4 + ((l * Math.PI) / 180) / 2));
    const yTop = mercYFn(35);
    const yBot = mercYFn(7);
    return {
      x: ((lon - (-100)) / 45) * 3200,
      y: ((yTop - mercYFn(lat)) / (yTop - yBot)) * 2400,
    };
  }

  private toggleGrid(): void {
    if (this.gridContainer) {
      this.gridContainer.destroy();
      this.gridContainer = null;
      return;
    }
    this.gridContainer = this.add.container(0, 0);
    this.gridContainer.setDepth(9000);

    const g = this.add.graphics();
    this.gridContainer.add(g);

    // Draw longitude lines (vertical) from 98°W to 56°W
    for (let lon = -98; lon <= -56; lon += 2) {
      const px = this.geoToPixel(lon, 0).x;
      const isMajor = (-lon) % 10 === 0;
      g.lineStyle(isMajor ? 1.5 : 0.5, 0xffffff, isMajor ? 0.5 : 0.2);
      g.lineBetween(px, 0, px, 2400);
      // Label
      const label = this.add.text(px, 4, `${-lon}°W`, {
        ...txt(isMajor ? 11 : 9, { color: "#ffffff" }),
        backgroundColor: "#00000088",
        padding: { x: 2, y: 1 },
      });
      label.setOrigin(0.5, 0);
      this.gridContainer.add(label);
    }

    // Draw latitude lines (horizontal) from 8°N to 34°N
    for (let lat = 8; lat <= 34; lat += 2) {
      const py = this.geoToPixel(0, lat).y;
      const isMajor = lat % 10 === 0;
      g.lineStyle(isMajor ? 1.5 : 0.5, 0xffffff, isMajor ? 0.5 : 0.2);
      g.lineBetween(0, py, 3200, py);
      // Label
      const label = this.add.text(4, py, `${lat}°N`, {
        ...txt(isMajor ? 11 : 9, { color: "#ffffff" }),
        backgroundColor: "#00000088",
        padding: { x: 2, y: 1 },
      });
      label.setOrigin(0, 0.5);
      this.gridContainer.add(label);
    }

    // Mark each port with its coordinate
    for (const [, port] of Object.entries(PORTS)) {
      const px = port.pos.x;
      const py = port.pos.y;
      // Reverse-calculate lon/lat from pixel position (Mercator inverse)
      const lon = (px / 3200) * 45 + (-100);
      // For lat, we need inverse Mercator — approximate with display
      const mercYFn = (l: number) => Math.log(Math.tan(Math.PI / 4 + ((l * Math.PI) / 180) / 2));
      const yTop = mercYFn(35);
      const yBot = mercYFn(7);
      const mercLat = yTop - (py / 2400) * (yTop - yBot);
      const lat = (2 * Math.atan(Math.exp(mercLat)) - Math.PI / 2) * 180 / Math.PI;
      const coordLabel = this.add.text(px, py + 14, `${(-lon).toFixed(1)}°W ${lat.toFixed(1)}°N`, {
        ...txt(8, { color: "#ffff00" }),
        backgroundColor: "#000000aa",
        padding: { x: 2, y: 1 },
      });
      coordLabel.setOrigin(0.5, 0);
      this.gridContainer.add(coordLabel);
    }
  }

  private findNearPort(): (typeof PORTS)[keyof typeof PORTS] | null {
    const playerEntity = this.worldState.entities[this.worldState.player.shipId as string];
    if (!playerEntity) return null;

    const isLanded = playerEntity.mode === "landed";
    const radius = isLanded ? 10 : 6; // tighter on foot

    for (const [portKey, port] of Object.entries(PORTS)) {
      // Use coast-snapped position (on land, adjacent to water) for all checks
      const checkPos = this.portSafePositions.get(portKey) ?? port.pos;
      const dist = vec2Dist(playerEntity.pos, checkPos);
      if (dist <= radius) {
        return port;
      }
    }
    return null;
  }

  private openPortDialog(port: PortDef): void {
    this.portDialogOpen = true;
    const portKey = Object.entries(PORTS).find(([_, p]) => p === port)?.[0];
    if (!portKey) return;

    // Stop the ship when approaching a port from sea
    const playerEntity = this.worldState.entities[this.worldState.player.shipId as string];
    if (playerEntity && playerEntity.mode !== "landed") {
      const shipId = this.worldState.player.shipId as string;
      this.worldState = {
        ...this.worldState,
        entities: {
          ...this.worldState.entities,
          [shipId]: {
            ...playerEntity,
            vel: { x: 0, y: 0 },
            sailLevel: 0,
          },
        },
      };
      this.registry.set("worldState", this.worldState);
    }

    const isOnFoot = playerEntity?.mode === "landed";
    this.scene.launch("PortApproachScene", {
      worldState: this.worldState,
      portId: portKey,
      isOnFoot,
    });
    this.time.delayedCall(0, () => {
      this.scene.pause();
    });
  }

  update(_time: number, delta: number): void {
    // Force furled sails: skip first 3 frames entirely to flush stale keyboard state
    if (this.needSailReset) {
      this.needSailReset = false;
      this.sailResetFrames = 3;
      const sid = this.worldState.player.shipId as string;
      const ship = this.worldState.entities[sid];
      if (ship) {
        this.worldState = {
          ...this.worldState,
          entities: {
            ...this.worldState.entities,
            [sid]: { ...ship, sailLevel: 0, vel: { x: 0, y: 0 } },
          },
        };
        this.registry.set("worldState", this.worldState);
      }
    }
    if (this.sailResetFrames > 0) {
      this.sailResetFrames--;
      // Drain any stale keyboard commands and discard them
      this.sailSystem.setImmediate(0);
      this.commandQueue.drain();
      return; // Skip entire update — no input, no simulation, no movement
    }

    // Sync input mode with entity mode
    const pe = this.worldState.entities[this.worldState.player.shipId as string];
    this.inputMapper.setLandedMode(pe?.mode === "landed");
    this.inputMapper.update();

    // Mouse steering: hold left button to steer toward cursor
    this.updateMouseSteering(pe);

    // Variable timestep: exactly 1 tick per frame, proportional to delta.
    // Like seagulls — movement every frame, no accumulator, no 0-tick or 2-tick frames.
    const cappedDelta = Math.min(delta, 50); // cap at 50ms (20fps min)
    const dtTicks = cappedDelta / (1000 / 20); // normalized: 1.0 at 20fps, ~0.33 at 60fps
    const gameSpeed = this.worldState.gameSpeed ?? 1.2;

    // Update sail transition (smooth 3s between levels)
    this.sailSystem.update(cappedDelta);
    // Push current sail value as command each frame
    const pe2 = this.worldState.entities[this.worldState.player.shipId as string];
    if (pe2?.mode === "sailing") {
      this.commandQueue.push({ type: "SetSailLevel", value: this.sailSystem.getCurrentValue() });
    }

    const commands = this.commandQueue.drain();
    const result = this.engine.apply(this.worldState, commands, dtTicks * gameSpeed);
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

    // Sync fog-of-war from settings (debug mode disables it)
    const debugMode = localStorage.getItem("pc_debug") !== "0";
    const fogSetting = localStorage.getItem("pc_fog") === "1";
    this.worldRenderer.fogOfWarEnabled = debugMode ? false : fogSetting;

    // Calculate vision range from fleet's tallest mast
    const playerEntity = this.worldState.entities[this.worldState.player.shipId as string];
    const playerShipClass = playerEntity?.ship ? SHIP_CLASSES[playerEntity.ship.classId as string] : null;
    const maxMast = playerEntity?.ship
      ? fleetMaxMastHeight(playerEntity.ship.classId as string, this.worldState.player.fleet ?? [])
      : (playerShipClass?.mastHeight ?? 15);
    const visionRange = visionRangeForMast(maxMast);

    // Render: direct position with gentle lerp (no prediction at 60Hz)
    this.worldRenderer.sync(this, this.worldState, visionRange);

    if (playerEntity) {
      const smoothPos = this.worldRenderer.getSmoothedPos(
        this.worldState.player.shipId as string, playerEntity,
      );
      this.cameraCtrl.setTarget(smoothPos);
      this.cameraCtrl.update();
      this.worldRenderer.drawVisionCircle(this, smoothPos, visionRange);
    }

    // City zoom scaling
    const camZoom = this.cameras.main.zoom;

    // City ICONS (Graphics): fade out at far zoom, hidden below zoom 2
    if (this.cityGraphics) {
      const iconAlpha = camZoom < 2 ? 0 : camZoom < 3 ? (camZoom - 2) : 1;
      this.cityGraphics.setAlpha(iconAlpha);
      this.cityGraphics.setVisible(camZoom > 2);
    }

    // FLAGS: small at max zoom, scale with inverse zoom for constant screen size
    for (const flag of this.flagImages) {
      // Constant ~20 screen pixels wide at any zoom: 20 / zoom / textureWidth
      const flagScale = 20 / camZoom / 16; // 16 = flag texture width
      flag.setScale(flagScale);
      flag.setVisible(true);
    }

    // LABELS: constant screen size (inverse zoom)
    const labelScale = 1 / camZoom;
    const gridAlpha = camZoom < 2.2 ? 1 : camZoom < 3 ? 1 - (camZoom - 2.2) / 0.8 : 0;
    for (const entry of this.cityLabels) {
      const isGrid = entry.text.getData("isGrid");
      if (isGrid) {
        entry.text.setVisible(gridAlpha > 0.01);
        entry.text.setAlpha(gridAlpha);
      }
      entry.text.setScale(labelScale);
      entry.text.setPosition(
        entry.anchorX + entry.offsetPx / camZoom,
        entry.anchorY,
      );
    }

    // Coord labels hidden — backend only, not shown to player
    for (const entry of this.coordLabels) {
      entry.text.setVisible(false);
    }

    this.cloudRenderer.update(this.worldState.weather.windDirRad, this.worldState.weather.windStrength);
    this.cirrusRenderer.update(this.worldState.weather.windDirRad, this.worldState.weather.windStrength);


    this.palmRenderer.update();

    // Sea texture: smooth alpha ramp from zoom 2 to max zoom
    if (this.seaTextureTile) {
      const z = this.cameras.main.zoom;
      // zoom <2: invisible, zoom 2→12: linear 0→0.50
      const t = Math.max(0, Math.min(1, (z - 2) / (12 - 2)));
      this.seaTextureTile.setAlpha(t * 0.50);
    }

    // Beach: fade with zoom, invisible at far zoom
    if (this.beachGfx) {
      const z = this.cameras.main.zoom;
      // zoom <2: invisible, zoom 2→4: fade 0→1, zoom 4+: full
      const beachAlpha = z < 2 ? 0 : z < 4 ? (z - 2) / (4 - 2) : 1;
      this.beachGfx.setAlpha(beachAlpha);
    }

    this.seagullRenderer.update(this.worldState.weather.windDirRad, this.worldState.weather.windStrength);
    this.uiOverlay?.updateWind(this.worldState.weather.windDirRad, this.worldState.weather.windStrength);
    this.uiOverlay?.updateZoom(this.cameras.main.zoom);
    this.uiOverlay?.updateFleet(this.worldState.player.fleet?.length ?? 0);
    // Check if sailing into wind (dead zone)
    const pe3 = this.worldState.entities[this.worldState.player.shipId as string];
    const psc = pe3?.ship ? SHIP_CLASSES[pe3.ship.classId as string] : null;
    const inIrons = pe3?.mode === "sailing" && pe3.sailLevel > 0
      && isInIrons(pe3.heading, this.worldState.weather.windDirRad, psc?.minWindAngle);

    this.uiOverlay?.updateSail(
      inIrons ? t("sail.in_irons") ?? "Pod wiatr!" : t(this.sailSystem.getTargetDef().nameKey),
      this.sailSystem.isTransitioning(),
    );

    // Ship speed display
    const vel3 = pe3?.vel ?? { x: 0, y: 0 };
    const shipSpeed = Math.sqrt(vel3.x * vel3.x + vel3.y * vel3.y);
    this.uiOverlay?.updateSpeed(pe3?.mode === "sailing" ? shipSpeed : 0);

    // Animate water surface with wind
    this.waterRenderer.update(this.worldState.weather.windDirRad, this.worldState.weather.windStrength);
    // Cartographic grid: show/hide based on zoom
    this.cartographicGrid.update();
    this.mountainRenderer.update(this.cameras.main.zoom);

    // Wind sound volume: base audible level scaled by wind strength × user gain (0..1)
    // At gain=10 the wind is clearly heard even in calm weather; at gain=0 muted.
    if (this.windSound && "setVolume" in this.windSound) {
      const gain = getSoundGain("wind");
      const wind = this.worldState.weather.windStrength; // 0..1
      const vol = (0.25 + wind * 0.55) * gain; // 0..0.8 range
      (this.windSound as Phaser.Sound.WebAudioSound).setVolume(vol);
    }

    // Auto-embark: when crew walks close to the anchored ship, board automatically
    // Only after at least 40 ticks on land (cooldown prevents instant re-embark after landing)
    if (playerEntity?.mode === "landed" && playerEntity.anchorPos) {
      const ticksOnLand = this.worldState.time.tick - (playerEntity.landedTick ?? 0);
      if (ticksOnLand > 40) {
        const distToShip = vec2Dist(playerEntity.pos, playerEntity.anchorPos);
        if (distToShip < 8) {
          this.commandQueue.push({ type: "Embark" });
        }
      }
    }

    this.updateHud();
    this.updatePortPrompt();
    this.checkNpcEncounter();
  }

  /** Steer ship/crew toward mouse cursor while left button is held. */
  private updateMouseSteering(playerEntity: { pos: { x: number; y: number }; heading: number; mode: string; sailLevel: number } | undefined): void {
    if (!playerEntity) return;
    // LPM does nothing while sailing — only works on land
    if (playerEntity.mode !== "landed") return;
    const pointer = this.input.activePointer;
    if (!pointer.isDown || pointer.button !== 0) return;

    // Convert screen coordinates to world coordinates
    const cam = this.cameras.main;
    const worldX = pointer.x / cam.zoom + cam.scrollX;
    const worldY = pointer.y / cam.zoom + cam.scrollY;

    const dx = worldX - playerEntity.pos.x;
    const dy = worldY - playerEntity.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 5) return; // too close, ignore

    // heading: 0=N, PI/2=E, PI=S — atan2(dx, -dy) matches this convention
    const targetHeading = Math.atan2(dx, -dy);

    if (playerEntity.mode === "landed") {
      // Land mode: set heading and walk
      this.commandQueue.push({ type: "SetHeading", heading: targetHeading });
      this.commandQueue.push({ type: "SetSailLevel", value: 1 });
    } else {
      // Sailing mode: steer only, do NOT change sails
      this.commandQueue.push({ type: "SetHeading", heading: targetHeading });
    }
  }

  private updateHud(): void {
    // Date in UIOverlayScene (no time, just date)
    const dateStr = formatCalendarDate(this.worldState.time, this.worldState.startYear);
    const uiOverlay = this.scene.get("UIOverlayScene") as import("./UIOverlayScene.ts").UIOverlayScene;
    if (uiOverlay?.updateDate) {
      uiOverlay.updateDate(dateStr);
    }
  }

  /** After leaving port dialog, push ship perpendicular to coast toward open sea. */
  private pushShipToOpenSea(): void {
    const shipId = this.worldState.player.shipId as string;
    const entity = this.worldState.entities[shipId];
    if (!entity || entity.mode !== "sailing") return;

    const terrainQuery = (x: number, y: number): TerrainType => {
      const col = Math.floor(x / 32);
      const row = Math.floor(y / 32);
      if (row < 0 || row >= this.landGrid.length || col < 0 || col >= (this.landGrid[0]?.length ?? 0)) {
        return "sea";
      }
      return this.landGrid[row][col] ? "land" : "sea";
    };

    const seaHeading = findOpenSeaHeading(entity.pos.x, entity.pos.y, terrainQuery, entity.heading);
    const pushDist = 5;
    this.worldState = {
      ...this.worldState,
      entities: {
        ...this.worldState.entities,
        [shipId]: {
          ...entity,
          heading: seaHeading,
          sailLevel: 0.05, // barely moving on departure
          pos: {
            x: entity.pos.x + Math.sin(seaHeading) * pushDist,
            y: entity.pos.y - Math.cos(seaHeading) * pushDist,
          },
          embarkTick: this.worldState.time.tick,
        },
      },
    };
  }

  /** Check if player is close to a friendly NPC — trigger encounter dialog. */
  private checkNpcEncounter(): void {
    if (this.shipEncounterOpen || this.portDialogOpen) return;

    const playerEntity = this.worldState.entities[this.worldState.player.shipId as string];
    if (!playerEntity || playerEntity.mode !== "sailing") return;

    const ENCOUNTER_RANGE = 18; // world px — very close, like port approach
    const playerShipId = this.worldState.player.shipId as string;

    for (const [id, entity] of Object.entries(this.worldState.entities)) {
      if (id === playerShipId) continue;
      if (entity.kind !== "ship" || !entity.ai) continue;
      // Only friendly NPC trigger encounter (trader, navy)
      const behavior = entity.ai.behavior;
      if (behavior === "pirate" || behavior === "pirate_hunter") continue;

      const dist = vec2Dist(playerEntity.pos, entity.pos);
      if (dist > ENCOUNTER_RANGE) continue;

      // Same NPC: only re-trigger after player has left & re-entered the range
      // (lastEncounteredNpcId is cleared in the block below when dist > ENCOUNTER_RANGE).
      if (id === this.lastEncounteredNpcId) continue;

      this.shipEncounterOpen = true;
      this.lastEncounteredNpcId = id;

      this.scene.pause();
      this.scene.launch("ShipEncounterScene", {
        worldState: this.worldState,
        npcEntityId: id,
      });

      // When encounter scene stops, resume
      this.scene.get("ShipEncounterScene")?.events.once("shutdown", () => {
        this.shipEncounterOpen = false;
        // Retrieve updated worldState from registry
        this.worldState = this.registry.get("worldState") ?? this.worldState;
      });

      return; // one encounter at a time
    }

    // Clear the moment player leaves encounter range — re-entry triggers a new encounter.
    if (this.lastEncounteredNpcId) {
      const lastNpc = this.worldState.entities[this.lastEncounteredNpcId];
      if (!lastNpc || vec2Dist(playerEntity.pos, lastNpc.pos) > ENCOUNTER_RANGE) {
        this.lastEncounteredNpcId = null;
      }
    }
  }

  private updatePortPrompt(): void {
    const playerEntity = this.worldState.entities[this.worldState.player.shipId as string];

    // Check for nearby port — works in BOTH sailing and landed modes
    const nearPort = this.findNearPort();
    if (nearPort) {
      if (!this.wasNearPort && !this.portDialogOpen) {
        this.openPortDialog(nearPort);
      }
      this.wasNearPort = true;
      const promptPortKey = Object.entries(PORTS).find(([_, p]) => p === nearPort)?.[0] ?? "";
      this.portPromptText!.setText(t("approach.prompt", { name: t("port." + promptPortKey + ".name") }));
      this.portPromptText!.setVisible(!this.portDialogOpen);
      return;
    }

    this.wasNearPort = false;

    // Landed mode: show ship boarding prompt when near anchor
    if (playerEntity?.mode === "landed" && playerEntity.anchorPos) {
      const distToShip = vec2Dist(playerEntity.pos, playerEntity.anchorPos);
      if (distToShip < 50) {
        this.portPromptText!.setText(t("hud.embark_ship_prompt"));
        this.portPromptText!.setVisible(true);
        return;
      }
      // Far from ship: show general embark hint
      this.portPromptText!.setText(t("hud.embark_prompt"));
      this.portPromptText!.setVisible(true);
      return;
    }

    this.portPromptText!.setVisible(false);
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
    if (this.onResize) {
      this.scale.off("resize", this.onResize);
      this.onResize = null;
    }
    this.worldRenderer.destroy();
    this.cartographicGrid.destroy();
    this.cloudRenderer.destroy();
    this.cirrusRenderer.destroy();


    this.palmRenderer.destroy();
    this.mountainRenderer.destroy();
    this.waterRenderer.destroy();
    this.seagullRenderer.destroy();
    this.scene.stop("UIOverlayScene");
    this.inputMapper.destroy();
    if (this.windSound) {
      this.windSound.stop();
      this.windSound.destroy();
      this.windSound = null;
    }
  }
}
