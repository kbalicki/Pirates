import Phaser from "phaser";
import { MusicManager } from "../audio/MusicManager.ts";
import { createNewWorldState } from "../GameApp.ts";
import { txt } from "../ui/textStyle.ts";
import { getPackPrefix } from "../settings/AssetPack.ts";
import { CITIES } from "../../core/data/cities.ts";
import { factionId } from "../../core/model/ids.ts";
import { expeditionPos, nearestWater } from "../../core/systems/ExpeditionFleetSystem.ts";
import { getPortWaterPos } from "../../core/systems/PortWaterPositions.ts";
import { routesTo } from "../../core/systems/TradeRouteSystem.ts";
import { generateAvailableCrew } from "../../core/systems/PortInteractionSystem.ts";
import { reroutedOnto } from "../../core/systems/EconomyTickSystem.ts";
import { loadLandmassesFromCache } from "../world/GeoLoader.ts";
import { setZoomLevel, type ZoomLevel } from "../settings/ZoomSetting.ts";

/** Crown ids are lower case in the data and title case on a noticeboard. */
function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
import { BLOCKADE_ONSET_DAYS } from "../../core/systems/BlockadeSystem.ts";

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
    //   ?relief=cartagena — a town already taken, with a royal squadron arriving today
    //   ?defend=cartagena — the same landing, fought in person (&ally=1 for someone else's town)
    //   ?intercept=cartagena — the same expedition, met at sea half a passage out
    //   ?commission=port_royal — the governor there with a colony under threat
    //   ?home=port_royal — married into that town, with a battered fleet and a full hold
    //   ?blockade=havana — lying off that harbour with guns enough to shut it
    //   ?event=hurricane&port=havana — that event running on that town, ship lying off it
    //   ?famine=tortuga — standing in that town with its supplier under the black flag
    //                    (&stand=cover — standing instead in the port covering its runs)
    //                    the town is already a fortnight hungry and the hold is full
    const params = new URLSearchParams(window.location.search);
    if (params.has("zoom")) {
      // Through the setter, not straight into localStorage: `initZoomSetting`
      // has already read the key in `BootScene`, which runs before this, so a
      // bare write only took effect on the *next* load of the page. Anything
      // driving the game headless gets one load and was silently looking at
      // the stored zoom rather than the one it asked for (v0.30.0).
      setZoomLevel(params.get("zoom")! as ZoomLevel);
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
    if (params.has("relief")) {
      const portKey = params.get("relief") || "cartagena";
      const men = params.has("garrison") ? Number(params.get("garrison")) : 120;
      const soldiers = params.has("soldiers") ? Number(params.get("soldiers")) : 100;
      const world = this.createReliefWorld(
        portKey,
        Number.isFinite(men) ? men : 120,
        Number.isFinite(soldiers) ? soldiers : 100,
      );
      this.registry.set("worldState", world);
      this.scene.start("MainMapScene", { worldState: world });
      return;
    }
    if (params.has("defend")) {
      const portKey = params.get("defend") || "cartagena";
      const men = params.has("garrison") ? Number(params.get("garrison")) : 60;
      const soldiers = params.has("soldiers") ? Number(params.get("soldiers")) : 140;
      const ally = params.get("ally") === "1";
      const world = this.createDefenseWorld(
        portKey,
        Number.isFinite(men) ? men : 60,
        ally,
      );
      this.registry.set("worldState", world);
      this.scene.start("CityDefenseScene", {
        worldState: world,
        pending: {
          portKey,
          // Somebody has to be attacking, and it cannot be the crown holding
          // the place: for an allied defence the claimant is the town's
          // hereditary rival rather than its owner.
          claimant: ally
            ? ((CITIES[portKey]?.factionId as unknown as string) === "spain" ? "england" : "spain")
            : ((CITIES[portKey]?.factionId as unknown as string) ?? "spain"),
          holder: ally
            ? ((CITIES[portKey]?.factionId as unknown as string) ?? "spain")
            : "pirates",
          expedition: {
            soldiers: Number.isFinite(soldiers) ? soldiers : 140,
            guns: Math.round((Number.isFinite(soldiers) ? soldiers : 140) / 4),
            sailDays: 0,
          },
          allied: ally,
        },
      });
      return;
    }
    if (params.has("intercept")) {
      const portKey = params.get("intercept") || "cartagena";
      const soldiers = params.has("soldiers") ? Number(params.get("soldiers")) : 200;
      const world = this.createInterceptWorld(
        portKey,
        Number.isFinite(soldiers) ? soldiers : 200,
      );
      this.registry.set("worldState", world);
      this.scene.start("MainMapScene", { worldState: world });
      return;
    }
    if (params.has("commission")) {
      const portKey = params.get("commission") || "port_royal";
      const world = this.createCommissionWorld(portKey);
      this.registry.set("worldState", world);
      this.scene.start("PortScene", { worldState: world, portId: portKey });
      return;
    }
    if (params.has("home")) {
      const portKey = params.get("home") || "port_royal";
      const world = this.createHomePortWorld(portKey);
      this.registry.set("worldState", world);
      this.scene.start("PortScene", { worldState: world, portId: portKey });
      return;
    }
    if (params.has("blockade")) {
      const portKey = params.get("blockade") || "havana";
      const world = this.createBlockadeWorld(portKey);
      this.registry.set("worldState", world);
      this.scene.start("MainMapScene", { worldState: world });
      return;
    }
    if (params.has("event")) {
      const world = this.createEventWorld(
        params.get("event") || "hurricane",
        params.get("port") || "havana",
      );
      this.registry.set("worldState", world);
      this.scene.start("MainMapScene", { worldState: world });
      return;
    }
    if (params.has("famine")) {
      const portKey = params.get("famine") || "tortuga";
      const world = this.createFamineWorld(portKey, params.get("stand") === "cover");
      this.registry.set("worldState", world);
      const standing = (world.player.location.portId as unknown as string) ?? portKey;
      this.scene.start("PortScene", { worldState: world, portId: standing });
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
        fleet: [{ classId: "frigate", hullHp: 120, hullMax: 120, sailsHp: 90, sailsMax: 90, cannons: 28, crew: 100 }],
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

  /**
   * A town already taken, with the crown's answer one day out, for `?relief=`.
   *
   * Waiting for the real thing means holding a town for a month of game time.
   * This puts the player off the harbour of a pirate-held port with a squadron
   * arriving today and the clock running fast enough to see it land, which is
   * the only part of `ReconquestSystem` that cannot be read off a unit test:
   * the toast, the log line and the flag on the map.
   *
   * `&garrison=N` sets the men on the walls and `&soldiers=N` the size of the
   * squadron, so both endings are drivable and the balance is adjustable
   * without a rebuild: the default holds the town, `&soldiers=600` loses it.
   */
  /**
   * A town under attack with the player standing in it, for `?defend=`.
   *
   * Same shortcut as `?relief=`, one step further along: there is no squadron
   * at sea and no clock to run down, because the scene is started directly with
   * a `PendingDefense`. What this world has to get right is the town — who
   * holds it, how many men are on the walls, and (for `&ally=1`) the letter of
   * marque that makes somebody else's colony the player's business.
   */
  private createDefenseWorld(portKey: string, men: number, ally: boolean): import("../../core/model/WorldState.ts").WorldState {
    const base = this.createSiegeWorld();
    const def = CITIES[portKey];
    if (!def) return base;
    const port = base.ports[portKey];
    const owner = def.factionId as unknown as string;
    return {
      ...base,
      worldFlags: ally
        ? { ...base.worldFlags, [`letter_of_marque_${owner}`]: true }
        : base.worldFlags,
      // In the harbour itself: `playerPresentAt` short-circuits on a port
      // location, so this is the least fragile way to be unambiguously there.
      player: {
        ...base.player,
        location: { type: "port", portId: def.id, pos: { ...def.pos } },
        citiesCaptured: ally ? 0 : 1,
      },
      ports: port ? {
        ...base.ports,
        [portKey]: {
          ...port,
          factionId: ally ? port.factionId : factionId("pirates"),
          capturedDay: ally ? undefined : base.time.day - 40,
          defense: Math.round(port.defense * 0.6),
          garrison: Math.max(0, Math.round(men)),
        },
      } : base.ports,
    };
  }

  private createReliefWorld(portKey: string, men: number, soldiers: number): import("../../core/model/WorldState.ts").WorldState {
    const base = this.createSiegeWorld();
    const def = CITIES[portKey];
    if (!def) return base;
    const port = base.ports[portKey];
    const shipId = base.player.shipId as string;
    const entity = base.entities[shipId];
    const day = base.time.day;
    // Close enough for `PRESENCE_RANGE`, far enough out that the port dialog
    // does not open: `PortApproachScene` pauses the world, and a paused world
    // never sees a day change, so a squadron parked on the anchorage would
    // never arrive. The crew may walk ashore here; presence is measured in
    // distance, so that costs this harness nothing.
    const pos = { x: def.pos.x + 60, y: def.pos.y + 60 };

    return {
      ...base,
      // A game day every second or so — the tick this exercises is daily.
      gameSpeed: 30,
      player: { ...base.player, location: { type: "sea", pos }, citiesCaptured: 1 },
      entities: entity ? { ...base.entities, [shipId]: { ...entity, pos } } : base.entities,
      ports: port ? {
        ...base.ports,
        [portKey]: {
          ...port,
          factionId: factionId("pirates"),
          capturedDay: day - 60,
          // Two months of the town patching its own walls, which is roughly
          // where `heldDefenseCeiling` leaves a place nobody is paying for.
          defense: Math.round(port.defense * 0.4),
          garrison: Math.max(0, Math.round(men)),
        },
      } : base.ports,
      worldEvents: [
        ...base.worldEvents,
        {
          id: `reconquest_${portKey}_debug`,
          type: "reconquest" as const,
          startDay: day - 8,
          endDay: day,
          ports: [portKey],
          factions: [def.factionId as string, "pirates"],
          severity: 3 as const,
          headline: "news.reconquest",
          vars: { port: def.name, faction: def.factionId as string, soldiers, guns: Math.round(soldiers / 4), days: 8 },
        },
      ],
    };
  }

  /**
   * An expedition halfway across the map with the player sitting on it, for
   * `?intercept=`.
   *
   * The one part of `ExpeditionFleetSystem` a unit test cannot show is the
   * thing itself: four sails coming up over the horizon under a Spanish flag,
   * two of them fat and low in the water. Waiting for that in an ordinary game
   * means holding a town for two months and then guessing a bearing.
   *
   * The passage is set so today is its midpoint, and the player is dropped on
   * the squadron's computed position, which is what `withinReach` measures. The
   * event's arrival is still ten days out, so there is time to sink every hull
   * and watch the landing be struck from the world.
   */
  private createInterceptWorld(portKey: string, soldiers: number): import("../../core/model/WorldState.ts").WorldState {
    const base = this.createSiegeWorld();
    const def = CITIES[portKey];
    if (!def) return base;
    const port = base.ports[portKey];
    const day = base.time.day;

    const event = {
      id: `reconquest_${portKey}_debug`,
      type: "reconquest" as const,
      startDay: day - 10,
      endDay: day + 10,
      ports: [portKey],
      factions: [def.factionId as unknown as string, "pirates"],
      severity: 3 as const,
      headline: "news.reconquest",
      vars: {
        port: def.name,
        faction: def.factionId as unknown as string,
        soldiers,
        guns: Math.round(soldiers / 4),
        days: 20,
      },
    };

    const staged: import("../../core/model/WorldState.ts").WorldState = {
      ...base,
      ports: port ? {
        ...base.ports,
        [portKey]: {
          ...port,
          factionId: factionId("pirates"),
          capturedDay: day - 60,
          defense: Math.round(port.defense * 0.4),
          garrison: 80,
        },
      } : base.ports,
      worldEvents: [...base.worldEvents, event],
      // The chart only pencils in a course the captain has been told about.
      knownEventIds: [...base.knownEventIds, event.id],
    };

    // Where the squadron is today, straight out of the same function the
    // running game uses — no second copy of the route arithmetic here.
    const pos = expeditionPos(staged, event) ?? { x: def.pos.x + 200, y: def.pos.y + 200 };
    const shipId = staged.player.shipId as string;
    const entity = staged.entities[shipId];

    return {
      ...staged,
      player: { ...staged.player, location: { type: "sea", pos: { ...pos } } },
      entities: entity
        ? { ...staged.entities, [shipId]: { ...entity, pos: { ...pos } } }
        : staged.entities,
    };
  }

  /**
   * A governor with a colony under threat and a captain he trusts, for
   * `?commission=`.
   *
   * The offer has four gates on it and one of them is a landing already at sea
   * against a *different* colony of the same crown, which in an ordinary game
   * means waiting for two crowns to go to war and then for the roll. This puts
   * the captain in the audience chamber with a letter of marque in his pocket
   * and a Spanish expedition twelve days off a neighbouring English town.
   */
  private createCommissionWorld(portKey: string): import("../../core/model/WorldState.ts").WorldState {
    const base = this.createSiegeWorld();
    const here = CITIES[portKey];
    if (!here) return base;
    const crown = here.factionId as unknown as string;
    const day = base.time.day;

    // Another colony of the same crown, as far from this one as possible, so
    // the offer is never confused with the town the captain is standing in.
    let target: string | undefined;
    let best = -1;
    for (const [key, def] of Object.entries(CITIES)) {
      if (key === portKey) continue;
      if ((def.factionId as unknown as string) !== crown) continue;
      const d = (def.pos.x - here.pos.x) ** 2 + (def.pos.y - here.pos.y) ** 2;
      if (d > best) { best = d; target = key; }
    }
    if (!target) return base;

    return {
      ...base,
      worldFlags: { ...base.worldFlags, [`letter_of_marque_${crown}`]: true },
      player: {
        ...base.player,
        location: { type: "port", portId: here.id, pos: { ...here.pos } },
      },
      worldEvents: [
        ...base.worldEvents,
        {
          id: `campaign_${target}_debug`,
          type: "campaign" as const,
          startDay: day,
          endDay: day + 12,
          ports: [target],
          factions: [crown === "spain" ? "england" : "spain", crown],
          severity: 3 as const,
          headline: "news.campaign",
          vars: {
            port: CITIES[target].name,
            faction: crown === "spain" ? "england" : "spain",
            holder: crown,
            soldiers: 180,
            guns: 45,
            days: 12,
          },
        },
      ],
    };
  }

  /**
   * A squadron already on station off a harbour, for `?blockade=`.
   *
   * Pressing a blockade in an ordinary game means finding a town, bringing
   * guns enough to matter and then *staying there* for days of game time.
   * What the screen has to show is the day the cordon bites, so this puts a
   * heavily gunned ship on the water position off the port with the counter
   * one short of onset — the next day change closes it.
   */
  private createBlockadeWorld(portKey: string): import("../../core/model/WorldState.ts").WorldState {
    const base = this.createSiegeWorld();
    const def = CITIES[portKey];
    const port = base.ports[portKey];
    if (!def || !port) return base;
    const shipId = base.player.shipId as string;
    const entity = base.entities[shipId];
    if (!entity) return base;
    // Standing *off* the harbour, not in its mouth: the water position is a
    // ship's length from the quay and trips the approach dialogue. The station
    // also has to be nearer this harbour than any other, or the cordon presses
    // the neighbour — Havana and the Florida Keys are two hundred units apart
    // on this chart and the first naive offset pressed the wrong one.
    loadLandmassesFromCache(this);
    const water = getPortWaterPos(portKey);
    const nearestTo = (at: { x: number; y: number }): string => {
      let best = portKey;
      let bestDist = Infinity;
      for (const key of Object.keys(base.ports)) {
        const w = getPortWaterPos(key);
        const d = Math.hypot(w.x - at.x, w.y - at.y);
        if (d < bestDist) { bestDist = d; best = key; }
      }
      return best;
    };
    let station = water;
    for (let dist = 160; dist <= 240 && station === water; dist += 40) {
      for (let a = 0; a < 16; a++) {
        const angle = (a / 16) * Math.PI * 2;
        const at = { x: water.x + Math.cos(angle) * dist, y: water.y + Math.sin(angle) * dist };
        if (nearestWater(at) !== at) continue;      // land, or nudged off it
        if (nearestTo(at) !== portKey) continue;    // that is somebody else's harbour
        station = at;
        break;
      }
    }

    return {
      ...base,
      player: { ...base.player, location: { type: "sea", pos: { ...station } } },
      entities: {
        ...base.entities,
        [shipId]: { ...entity, mode: "sailing", pos: { ...station }, vel: { x: 0, y: 0 } },
      },
      ports: {
        ...base.ports,
        [portKey]: { ...port, blockadeDays: BLOCKADE_ONSET_DAYS - 1 },
      },
    };
  }

  /**
   * One named world event, running on one named town, for `?event=` (v0.29.0).
   *
   * v0.28.0 found that no random event had ever attached itself to a port, so
   * the whole layer had never been *played*. Reaching a particular one in an
   * ordinary game means waiting for a weighted roll and then finding the town it
   * chose, which is no way to look at fifteen of them. This stamps the event on
   * the town and puts the ship on the water outside it, close enough that the
   * approach dialogue opens by itself.
   */
  private createEventWorld(
    type: string,
    portKey: string,
  ): import("../../core/model/WorldState.ts").WorldState {
    const base = this.createSiegeWorld();
    const def = CITIES[portKey];
    if (!def) return base;
    loadLandmassesFromCache(this);

    const day = base.time.day;
    const staged: import("../../core/model/WorldState.ts").WorldState = {
      ...base,
      worldEvents: [
        ...base.worldEvents,
        {
          id: `debug_${type}_${portKey}`,
          type: type as import("../../core/model/WorldState.ts").WorldEventType,
          startDay: day,
          endDay: day + 60,
          ports: [portKey],
          factions: [def.factionId as unknown as string],
          severity: 2 as const,
          headline: `news.${type}`,
          // Every headline this can stamp, not just the town-shaped ones: the
          // war and treaty strings interpolate two crowns, and a `vars` bag
          // that is missing a key prints the raw `{{faction1}}` on the tavern
          // noticeboard rather than failing (v0.30.0 — seen on a screenshot).
          vars: {
            port: def.name,
            faction: def.factionId as unknown as string,
            faction1: capitalise(def.factionId as unknown as string),
            faction2: "England",
            duration: 60,
          },
        },
      ],
      // Everything the world already seeded counts as heard, plus the staged
      // one (v0.30.0). The chart only pencils in what a tavern or a passing
      // captain has told him about, so without this the marks are invisible in
      // exactly the world built to look at them — and a handful of seeded
      // events scattered over the Caribbean is the picture the feature is
      // about, rather than one pin under the bowsprit.
      knownEventIds: [
        ...base.knownEventIds,
        ...base.worldEvents.map(ev => ev.id),
        `debug_${type}_${portKey}`,
      ],
    };

    // A gold strike is the one event whose point is what it leaves in the
    // warehouse, and `applyOneShotEffects` only fires on the day it lands — so
    // the debug world hands the town a week's diggings to have on the counter.
    const port = staged.ports[portKey];
    const withStock = type === "gold_discovery" && port
      ? {
          ...staged,
          ports: {
            ...staged.ports,
            [portKey]: {
              ...port,
              bonusProduces: [...port.bonusProduces, "gold"],
              inventory: { ...port.inventory, gold: 25 },
            },
          },
        }
      : staged;

    // Right on top of the town, not out on the water: `findNearPort` fires
    // within six pixels of the coast-snapped position, and the nearest water
    // tile is further out than that — the approach would never open by itself.
    const at = { x: def.pos.x, y: def.pos.y };
    const shipId = withStock.player.shipId as string;
    const entity = withStock.entities[shipId];
    return {
      ...withStock,
      player: { ...withStock.player, location: { type: "sea", pos: { ...at } } },
      entities: entity
        ? { ...withStock.entities, [shipId]: { ...entity, mode: "sailing", pos: { ...at }, vel: { x: 0, y: 0 } } }
        : withStock.entities,
    };
  }

  /**
   * A town whose supplier has been taken, for `?famine=` (v0.26.0).
   *
   * Two things in this release only exist downstream of somebody's harbour
   * being shut, and reaching that in an ordinary game means storming a fort:
   * the merchant's counter says whose runs this town is covering, and the
   * informer in the tavern has a relief order for a town that cannot get what
   * it eats. So this puts the black flag over every port that supplies this
   * one, and stands the captain in the port menu with a hold to fill.
   *
   * `&stand=cover` stands him instead in the town that has picked the runs up,
   * because that is where the other half of the release shows: a warehouse
   * being drawn down for somebody else's customers, and the merchant's counter
   * saying so.
   */
  private createFamineWorld(portKey: string, standInCover = false): import("../../core/model/WorldState.ts").WorldState {
    const base = this.createSiegeWorld();
    const def = CITIES[portKey];
    if (!def) return base;
    // The lane network asks about water, and a debug world built in here has
    // not loaded the coastline yet — without this every course is a straight
    // line through Cuba and the suppliers come out wrong.
    loadLandmassesFromCache(this);

    const ports = { ...base.ports };
    for (const lane of routesTo(portKey)) {
      const from = ports[lane.from];
      if (!from) continue;
      ports[lane.from] = { ...from, factionId: "pirates" as unknown as typeof from.factionId };
    }

    // A famine that is already a fortnight old, so the screens have something
    // to show on the first frame (v0.27.0). Stamping `hunger` and emptying the
    // shelves is exactly what a run of daily ticks would have left behind, and
    // it saves the tester a hundred days of game time — the tick itself is
    // covered by `EconomyTickSystem.test.ts`, not by looking at it.
    const shortDef = CITIES[portKey];
    const short = ports[portKey];
    if (short && shortDef) {
      const inventory = { ...short.inventory };
      for (const item of shortDef.demands) {
        if (shortDef.produces.includes(item)) continue;
        inventory[item] = 0;
      }
      ports[portKey] = { ...short, inventory, hunger: 0.45 };
    }

    const starved = { ...base, ports };
    let standing = portKey;
    if (standInCover) {
      const cover = Object.keys(CITIES).find(key => reroutedOnto(starved, key).length > 0);
      if (cover) standing = cover;
    }
    const stand = CITIES[standing];

    // And a hold with the answer in it, or the governor's reply is not on the
    // screen to be looked at.
    const shipId = base.player.shipId as string;
    const entity = base.entities[shipId];
    const carrying = shortDef?.demands.find(i => !shortDef.produces.includes(i));
    const entities = entity?.ship && carrying
      ? {
          ...base.entities,
          [shipId]: {
            ...entity,
            ship: {
              ...entity.ship,
              cargo: {
                ...entity.ship.cargo,
                [carrying]: Math.max(
                  0,
                  entity.ship.cargoCap
                    - Object.values(entity.ship.cargo).reduce((sum, q) => sum + q, 0),
                ),
              },
            },
          },
        }
      : base.entities;

    // Short-handed, and with the tavern's bench filled the way walking in
    // through the gate would fill it — `PortApproachScene` does that, and a
    // debug world that jumps straight to the port menu never passes through it.
    // Without both, the one thing hunger does to a tavern is invisible here.
    const manned = entities[shipId];
    const shorthanded = manned?.ship
      ? {
          ...entities,
          [shipId]: {
            ...manned,
            ship: {
              ...manned.ship,
              crew: { ...manned.ship.crew, current: Math.floor(manned.ship.crew.max * 0.5) },
            },
          },
        }
      : entities;

    return generateAvailableCrew({
      ...starved,
      entities: shorthanded,
      player: {
        ...base.player,
        location: { type: "port", portId: stand.id, pos: { ...stand.pos } },
      },
    }, stand.id);
  }

  /**
   * A married captain standing in his wife's home town, for `?home=`.
   *
   * Reaching this in an ordinary game means courting a governor's daughter to
   * 85 with a rank behind it, which is a career. What the screen has to show is
   * the day *after* the wedding: the storehouse in the port menu, and a yard
   * that careens the whole fleet without sending a bill. So the fleet arrives
   * battered and the hold arrives full.
   */
  private createHomePortWorld(portKey: string): import("../../core/model/WorldState.ts").WorldState {
    const base = this.createSiegeWorld();
    const def = CITIES[portKey];
    if (!def) return base;
    const crown = def.factionId as unknown as string;
    const shipId = base.player.shipId as string;
    const entity = base.entities[shipId];
    if (!entity?.ship) return base;

    return {
      ...base,
      worldFlags: {
        ...base.worldFlags,
        captain_married: true,
        ["married_to_" + portKey]: true,
      },
      player: {
        ...base.player,
        location: { type: "port", portId: def.id, pos: { ...def.pos } },
        homeCrown: crown,
        ranks: { ...base.player.ranks, [crown]: 2 },
        courtship: { ...base.player.courtship, [portKey]: 100 },
        fleet: base.player.fleet.map(c => ({ ...c, hullHp: c.hullMax * 0.4, sailsHp: c.sailsMax * 0.3 })),
      },
      entities: {
        ...base.entities,
        [shipId]: {
          ...entity,
          ship: {
            ...entity.ship,
            hullHp: entity.ship.hullMax * 0.55,
            sailsHp: entity.ship.sailsMax * 0.45,
            cargo: { sugar_cane: 20, rum: 15, tobacco: 5 },
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
