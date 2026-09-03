import Phaser from "phaser";
import { MusicManager } from "../audio/MusicManager.ts";
import { createNewWorldState } from "../GameApp.ts";
import { txt } from "../ui/textStyle.ts";
import { getPackPrefix } from "../settings/AssetPack.ts";

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: "PreloadScene" });
  }

  preload(): void {
    // Show loading bar
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(width / 2 - 160, height / 2 - 15, 320, 30);

    const loadingText = this.add.text(width / 2, height / 2 - 40, "Loading...",
      txt(18, { color: "#ffffff" }),
    );
    loadingText.setOrigin(0.5);

    this.load.on("progress", (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0x44aa88, 1);
      progressBar.fillRect(width / 2 - 155, height / 2 - 10, 310 * value, 20);
    });

    this.load.on("complete", () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
    });

    // Load all game assets
    this.loadAssets();
  }

  private loadAssets(): void {
    // ──── Common assets (always loaded) ────

    // Sail ship spritesheet (8 directions, 4×2 grid, 256×256 per frame)
    this.load.spritesheet("sailship", "assets/sprites/sailship.png", {
      frameWidth: 256,
      frameHeight: 256,
    });

    // Pirate tilepack (384x320, 12×10 grid of 32×32 tiles)
    this.load.spritesheet("tilepack", "assets/tiles/tilepack.png", {
      frameWidth: 32,
      frameHeight: 32,
    });

    // Sea photo texture (for water overlay)
    this.load.image("sea_texture", "assets/sprites/sea_texture.png");

    // Crew party sprite (transparent PNG, replaces procedural)
    this.load.image("crew_party_img", "assets/sprites/crew_party.png");

    // Sail icon for UI
    this.load.image("sail_icon", "assets/ui/sail_icon.png");

    // City sprites (transparent PNG)
    this.load.image("city_large", "assets/sprites/city_large.png");
    this.load.image("city_medium", "assets/sprites/city_medium.png");
    this.load.image("city_small", "assets/sprites/city_small.png");
    this.load.image("city_fort_large", "assets/sprites/city_fort_large.png");
    this.load.image("city_fort_medium", "assets/sprites/city_fort_medium.png");
    this.load.image("city_fort_small", "assets/sprites/city_fort_small.png");

    // Land texture (tropical forest from above)
    this.load.image("land_texture", "assets/sprites/land_texture.png");

    // Animated water spritesheet (40 frames, 128x128 each, 8 cols × 5 rows)
    this.load.spritesheet("water_anim", "assets/tiles/water_anim.png", {
      frameWidth: 128,
      frameHeight: 128,
    });

    // Pirate theme music
    this.load.audio("pirate_theme", "assets/audio/pirate_adventure.wav");

    // Wind loop (CC BY 3.0 — Jonathan Shaw / InspectorJ, looped by AntumDeluge)
    this.load.audio("wind_loop", "assets/audio/wind_loop.ogg");

    // Seagull cry (soundreality — Pixabay license)
    this.load.audio("seagull", "assets/audio/seagull.mp3");

    // Caribbean map background (3200x2400, matches game world)
    this.load.image("caribbean_bg", "assets/map/caribbean_bg.png");

    // Real geography data (Natural Earth coastlines + OSM cities)
    this.load.json("caribbean_geo", "data/caribbean_geo.json");

    // Wind rose compass (CC-BY 4.0 — Deco / prushik, opengameart.org)
    this.load.image("windrose", "assets/sprites/windrose.png");
    this.load.image("compass_needle", "assets/sprites/compass_needle.png");

    // Start screen background
    this.load.image("start_bg", "assets/ui/start_bg.jpg");

    // Parchment panel (used on start screen for all packs)
    this.load.image("parchment_panel", "assets/ui/parchment_panel.png");

    // Cloud texture from codepen spite/DgQzLv — the real puffy cloud texture
    this.load.image("cloud_spite", "assets/sprites/clouds/cloud_spite.png");

    // ──── Pack-specific assets (only for enhanced pack) ────

    const prefix = getPackPrefix();
    if (!prefix) return; // all packs use procedural rendering — no extra map assets

    // Water tile (seamless)
    this.load.image("water_tile", `${prefix}tiles/water_tile.png`);

    // Beach/sand tile (seamless, 32x32)
    this.load.image("beach_tile", `${prefix}tiles/beach_tile.png`);

    // Green grass/jungle tile (seamless, 32x32)
    this.load.image("grass_tile", `${prefix}tiles/grass_tile.png`);

    // Palm tree sprites (4 variants)
    for (let i = 1; i <= 4; i++) {
      this.load.image(`palm_${i}`, `${prefix}sprites/palms/palm_${i}.png`);
    }

    // City building sprites (3 sizes)
    this.load.image("city_small", `${prefix}sprites/cities/city_small.png`);
    this.load.image("city_medium", `${prefix}sprites/cities/city_medium.png`);
    this.load.image("city_large", `${prefix}sprites/cities/city_large.png`);

    // Ship spritesheets (5 types, 8 directions each)
    const shipTypes = ["sloop", "brigantine", "frigate", "galleon", "merchant"];
    for (const type of shipTypes) {
      this.load.spritesheet(`ship_${type}`, `${prefix}sprites/ships/ship_${type}.png`, {
        frameWidth: 96,
        frameHeight: 64,
      });
    }
  }

  create(): void {
    // Set NEAREST filtering on pixel-art sprite textures (keep them crisp)
    for (const key of ["tilepack", "water_anim", "windrose", "compass_needle"]) {
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }

    // Cloud texture loaded from file — no generation needed
    if (this.textures.exists("cloud_spite")) {
      this.textures.get("cloud_spite").setFilter(Phaser.Textures.FilterMode.LINEAR);
    }

    // Ship, city, crew sprites: LINEAR filtering (detailed images, not pixel art)
    for (const key of ["sailship", "city_large", "city_medium", "city_small", "city_fort_large", "city_fort_medium", "city_fort_small", "crew_party_img"]) {
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    }

    // Initialize music manager (accessible from all scenes via registry)
    this.registry.set("musicManager", new MusicManager(this.game));

    // URL params for dev/debug:
    //   ?skip        — bypass character creation, go straight to map
    //   ?zoom=N      — set initial zoom level (e.g. ?zoom=z10 or ?zoom=8)
    //   ?debug=1     — enable debug mode
    //   ?battle=1    — bypass everything, launch straight into a sea battle vs a test enemy
    //   ?battle=trader|navy|pirate — choose enemy archetype
    //   ?siege=cartagena — jump straight to a city assault, with a ship able to try it
    const params = new URLSearchParams(window.location.search);
    if (params.has("zoom")) {
      localStorage.setItem("pc_zoom_level", params.get("zoom")!);
    }
    if (params.has("debug")) {
      localStorage.setItem("pc_debug", params.get("debug")!);
    }
    if (params.has("battle")) {
      const world = this.createBattleWorld(params.get("battle") ?? "1");
      this.registry.set("worldState", world);
      // jump straight to combat — testMode triggers random corner spawn
      this.scene.start("SeaBattleScene", { worldState: world, enemyId: "test_enemy", testMode: true });
      return;
    }
    if (params.has("siege")) {
      const portKey = params.get("siege") || "cartagena";
      const world = this.createSiegeWorld();
      this.registry.set("worldState", world);
      this.scene.start("CityAssaultScene", { worldState: world, portId: portKey });
      return;
    }
    if (params.has("skip")) {
      const world = createNewWorldState(Date.now());
      this.registry.set("worldState", world);
      this.scene.start("MainMapScene", { worldState: world });
    } else {
      this.scene.start("CharacterCreationScene");
    }
  }

  /**
   * A world with a ship that can actually try a fort, for `?siege=` testing.
   *
   * The starting sloop is driven off a first-rate battery long before its guns
   * are out — which is correct, and useless for looking at the screen. This
   * hands the captain a frigate, a consort and a letter of marque, so every
   * branch of the spoils menu is reachable.
   */
  private createSiegeWorld(): import("../../core/model/WorldState.ts").WorldState {
    const world = createNewWorldState(Date.now());
    const shipId = world.player.shipId as string;
    const entity = world.entities[shipId];
    if (!entity?.ship) return world;
    return {
      ...world,
      worldFlags: { ...world.worldFlags, letter_of_marque_england: true },
      player: {
        ...world.player,
        fleet: [{ classId: "frigate", hullHp: 120, hullMax: 120, sailsHp: 90, sailsMax: 90, cannons: 28 }],
      },
      entities: {
        ...world.entities,
        [shipId]: {
          ...entity,
          ship: {
            ...entity.ship,
            classId: "frigate" as import("../../core/model/ids.ts").ShipClassId,
            hullHp: 120, hullMax: 120,
            sailsHp: 90, sailsMax: 90,
            cannons: 28,
            crew: { current: 80, max: 80, morale: 0.9 },
          },
        },
      },
    };
  }

  /** Build a minimal world with the player + one test enemy NPC near them for ?battle testing. */
  private createBattleWorld(kind: string): import("../../core/model/WorldState.ts").WorldState {
    const world = createNewWorldState(Date.now());
    const playerEntity = world.entities[world.player.shipId as string];
    if (!playerEntity) return world;
    // Pick enemy behavior from ?battle=trader|navy|pirate (default = trader)
    let behavior: "trader" | "navy" | "pirate" | "pirate_hunter" = "trader";
    if (kind === "navy") behavior = "navy";
    else if (kind === "pirate") behavior = "pirate";
    else if (kind === "hunter") behavior = "pirate_hunter";
    const enemy: import("../../core/model/EntityState.ts").EntityState = {
      id: "test_enemy" as import("../../core/model/ids.ts").EntityId,
      kind: "ship",
      pos: { x: playerEntity.pos.x + 50, y: playerEntity.pos.y },
      vel: { x: 0, y: 0 },
      heading: Math.PI,
      sailLevel: 0.5,
      mode: "sailing",
      depthOffset: 0,
      ship: {
        classId: "brigantine" as import("../../core/model/ids.ts").ShipClassId,
        factionId: (behavior === "navy" ? "england" : behavior === "pirate" || behavior === "pirate_hunter" ? "pirates" : "spain") as import("../../core/model/ids.ts").FactionId,
        hullHp: 80, hullMax: 80,
        sailsHp: 60, sailsMax: 60,
        cannons: 16,
        cargoCap: 100,
        cargo: {},
        crew: { current: 30, max: 40, morale: 0.7 },
      },
      ai: {
        behavior,
        state: "travel",
        aggression: 0.5,
        awarenessRadius: 200,
      },
    };
    return {
      ...world,
      entities: { ...world.entities, [enemy.id as string]: enemy },
    };
  }

}
