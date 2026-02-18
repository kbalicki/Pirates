import Phaser from "phaser";
import type { WorldState } from "../core/model/WorldState.ts";
import { entityId, factionId, shipClassId } from "../core/model/ids.ts";
import { createRng } from "../core/services/RNG.ts";
import { PORTS } from "../core/data/ports.ts";
import { FACTIONS } from "../core/data/factions.ts";
import { SHIP_CLASSES } from "../core/data/ships.ts";
import { initPortPrices, initPortInventory } from "../core/data/prices.ts";
import { CURRENT_WORLD_VERSION } from "../persistence/Migrations.ts";
import { DEFAULT_ERA, ERAS } from "../core/data/eras.ts";
import { BootScene } from "./scenes/BootScene.ts";
import { PreloadScene } from "./scenes/PreloadScene.ts";
import { CharacterCreationScene } from "./scenes/CharacterCreationScene.ts";
import { MainMapScene } from "./scenes/MainMapScene.ts";
import { PortScene } from "./scenes/PortScene.ts";
import { SeaBattleScene } from "./scenes/SeaBattleScene.ts";
import { DialogueScene } from "./scenes/DialogueScene.ts";
import { PauseMenuScene } from "./scenes/PauseMenuScene.ts";
import { SaveLoadScene } from "./scenes/SaveLoadScene.ts";
import { PortApproachScene } from "./scenes/PortApproachScene.ts";
import { OptionsMenuScene } from "./scenes/OptionsMenuScene.ts";

export function createNewWorldState(
  seed: number,
  playerName = "Captain",
  eraId = DEFAULT_ERA,
  startYear = ERAS[DEFAULT_ERA].startYear,
): WorldState {
  const playerShipId = entityId("player_ship");

  // Initialize port runtime states from all cities
  const ports: Record<string, WorldState["ports"][string]> = {};
  for (const [key, portDef] of Object.entries(PORTS)) {
    ports[key] = {
      portId: portDef.id,
      factionId: portDef.factionId,
      prices: initPortPrices(key),
      inventory: initPortInventory(key),
      shipyardQueue: [],
      availableCrew: 0,
    };
  }

  // Initialize reputations
  const reputation: Record<string, number> = {};
  for (const [key, faction] of Object.entries(FACTIONS)) {
    reputation[key] = faction.defaultReputation;
  }

  const sloopClass = SHIP_CLASSES["sloop"];

  // Start near open sea in central Caribbean (close to Nassau)
  const startPos = { x: 1600, y: 480 };

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
    },
    entities: {
      [playerShipId as string]: {
        id: playerShipId,
        kind: "ship",
        pos: startPos,
        vel: { x: 0, y: 0 },
        heading: 0,
        sailLevel: 0,
        depthOffset: 0,
        ship: {
          classId: shipClassId("sloop"),
          factionId: factionId("england"),
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
    playerName,
    eraId,
    startYear,
  };

  return world;
}

export function launchGame(containerId: string): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: containerId,
    width: 800,
    height: 600,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: "#0a0a1a",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [
      BootScene,
      PreloadScene,
      CharacterCreationScene,
      MainMapScene,
      PortScene,
      PortApproachScene,
      SeaBattleScene,
      DialogueScene,
      PauseMenuScene,
      SaveLoadScene,
      OptionsMenuScene,
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
