import Phaser from "phaser";
import type { WorldState } from "../core/model/WorldState.ts";
import { entityId, factionId, shipClassId } from "../core/model/ids.ts";
import { createRng } from "../core/services/RNG.ts";
import { PORTS } from "../core/data/ports.ts";
import { FACTIONS } from "../core/data/factions.ts";
import { SHIP_CLASSES } from "../core/data/ships.ts";
import { initPortPrices, initPortInventory } from "../core/data/prices.ts";
import { getPortBaseline } from "../core/data/economyBaselines.ts";
import { CURRENT_WORLD_VERSION } from "../persistence/Migrations.ts";
import { DEFAULT_ERA, ERAS } from "../core/data/eras.ts";
import type { CaptainProfile } from "../core/model/CaptainState.ts";
import { createDefaultCaptainProfile } from "../core/model/CaptainState.ts";
import { BootScene } from "./scenes/BootScene.ts";
import { PreloadScene } from "./scenes/PreloadScene.ts";
import { CharacterCreationScene } from "./scenes/CharacterCreationScene.ts";
import { MainMapScene } from "./scenes/MainMapScene.ts";
import { PortScene } from "./scenes/PortScene.ts";
import { SeaBattleScene } from "./scenes/SeaBattleScene.ts";
import { DuelScene } from "./scenes/DuelScene.ts";
import { CityAssaultScene } from "./scenes/CityAssaultScene.ts";
import { CityDefenseScene } from "./scenes/CityDefenseScene.ts";
import { RetirementScene } from "./scenes/RetirementScene.ts";
import { PauseMenuScene } from "./scenes/PauseMenuScene.ts";
import { PortApproachScene } from "./scenes/PortApproachScene.ts";
import { ShipEncounterScene } from "./scenes/ShipEncounterScene.ts";
import { OptionsMenuScene } from "./scenes/OptionsMenuScene.ts";
import { UIOverlayScene } from "./scenes/UIOverlayScene.ts";
import { CityInfoScene } from "./scenes/CityInfoScene.ts";
import { HelpScene } from "./scenes/HelpScene.ts";
import { BattleHelpScene } from "./scenes/BattleHelpScene.ts";
import { seedInitialEvents } from "../core/systems/WorldEventSystem.ts";

export function createNewWorldState(
  seed: number,
  playerName = "Captain",
  eraId = DEFAULT_ERA,
  startYear = ERAS[DEFAULT_ERA].startYear,
  captain?: Partial<CaptainProfile>,
): WorldState {
  const captainProfile: CaptainProfile = {
    ...createDefaultCaptainProfile(),
    ...captain,
    skills: { ...createDefaultCaptainProfile().skills, ...captain?.skills },
  };
  const playerShipId = entityId("player_ship");

  // Initialize port runtime states from all cities
  const ports: Record<string, WorldState["ports"][string]> = {};
  for (const [key, portDef] of Object.entries(PORTS)) {
    const baseline = getPortBaseline(key);
    ports[key] = {
      portId: portDef.id,
      factionId: portDef.factionId,
      prices: initPortPrices(key),
      inventory: initPortInventory(key),
      shipyardQueue: [],
      availableCrew: 0,
      population: baseline.population,
      wealth: baseline.wealth,
      defense: baseline.defense,
      bonusProduces: [],
    };
  }

  // Initialize reputations
  const reputation: Record<string, number> = {};
  for (const [key, faction] of Object.entries(FACTIONS)) {
    reputation[key] = faction.defaultReputation;
  }
  // Bonus reputation with own nation
  if (reputation[captainProfile.nationality] !== undefined) {
    reputation[captainProfile.nationality] += 20;
  }

  const sloopClass = SHIP_CLASSES["sloop"];

  // Start at home port based on nationality
  const homePortKey: Record<string, string> = {
    france: "tortuga",
    england: "port_royal",
    spain: "havana",
    netherlands: "curacao",
  };
  const portKey = homePortKey[captainProfile.nationality] ?? "port_royal";
  const homePort = PORTS[portKey];
  // Start in water near the home port (offset south beyond dock detection range)
  const startPos = homePort
    ? { x: homePort.pos.x, y: homePort.pos.y + homePort.dockRadius + 50 }
    : { x: 1600, y: 480 };

  const world: WorldState = {
    version: CURRENT_WORLD_VERSION,
    time: { day: 1, hour: 8, minute: 0, tick: 0 },
    rng: createRng(seed),
    player: {
      id: playerShipId,
      shipId: playerShipId,
      gold: 500,
      notoriety: 0,
      reputation,
      ranks: { spain: 0, england: 0, france: 0, netherlands: 0, pirates: 0 },
      location: { type: "sea", pos: startPos },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
    },
    entities: {
      [playerShipId as string]: {
        id: playerShipId,
        kind: "ship",
        mode: "sailing",
        pos: startPos,
        vel: { x: 0, y: 0 },
        heading: 0,
        sailLevel: 0,
        depthOffset: 0,
        ship: {
          classId: shipClassId("sloop"),
          factionId: factionId(captainProfile.nationality),
          hullHp: sloopClass.hullMax,
          hullMax: sloopClass.hullMax,
          sailsHp: sloopClass.sailsMax,
          sailsMax: sloopClass.sailsMax,
          cannons: sloopClass.cannons,
          cargo: { food: 15, water: 15 },
          cargoCap: sloopClass.cargoCap,
          crew: {
            current: 20,
            max: sloopClass.crewMax,
            morale: 0.8,
          },
        },
      },
    },
    ports,
    weather: {
      windDirRad: Math.PI * 0.75, // NW trade winds
      windStrength: 0.5,
      stormActive: false,
      stormTimer: 0,
    },
    worldFlags: {},
    eventLog: [],
    worldEvents: [],
    knownEventIds: [],
    playerName,
    eraId,
    startYear,
    gameSpeed: 1.2, // "normal" — 1 day ≈ 1 minute real time
    captain: captainProfile,
  };

  // Seed initial events so NPCs already have news to share on day 1
  return seedInitialEvents(world);
}

export function launchGame(containerId: string): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: containerId,
    width: window.innerWidth,
    height: window.innerHeight,
    pixelArt: true,
    roundPixels: false,
    antialias: false,
    backgroundColor: "#0c2340",
    scale: {
      mode: Phaser.Scale.RESIZE,
    },
    scene: [
      BootScene,
      PreloadScene,
      CharacterCreationScene,
      MainMapScene,
      PortScene,
      PortApproachScene,
      ShipEncounterScene,
      SeaBattleScene,
      DuelScene,
      CityAssaultScene,
      CityDefenseScene,
      RetirementScene,
      PauseMenuScene,
      OptionsMenuScene,
      UIOverlayScene,
      CityInfoScene,
      HelpScene,
      BattleHelpScene,
    ],
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
  };

  const game = new Phaser.Game(config);
  (window as unknown as Record<string, unknown>).__PHASER_GAME__ = game;
  (window as unknown as Record<string, unknown>).__CREATE_WORLD__ = createNewWorldState;

  // Override Phaser's "image-rendering: pixelated" CSS on the canvas.
  // Sprite textures stay pixel-perfect (WebGL NEAREST filtering is set
  // separately by pixelArt:true). This only affects the final canvas-to-
  // screen scaling, making text smooth and readable when the 800x600
  // canvas is scaled up to fill the browser window.
  game.events.once("ready", () => {
    game.canvas.style.imageRendering = "auto";
  });

  return game;
}
