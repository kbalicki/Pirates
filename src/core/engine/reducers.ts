import type { WorldState } from "../model/WorldState.ts";
import type { EntityState } from "../model/EntityState.ts";
import type { WorldCommand } from "../model/Commands.ts";
import type { WorldEvent, Transition } from "../model/Events.ts";
import { applyTurn, applySailLevel } from "../systems/NavigationSystem.ts";
import { normalizeHeading } from "../services/Geometry.ts";
import { executeBuy, executeSell } from "../systems/EconomySystem.ts";
import { PORTS } from "../data/ports.ts";
import { vec2Dist } from "../services/Geometry.ts";
import { addLogEntry } from "../systems/EventLogSystem.ts";

export type ReducerResult = {
  world: WorldState;
  events: WorldEvent[];
  transitions: Transition[];
};

export function reduceCommand(world: WorldState, cmd: WorldCommand): ReducerResult {
  const events: WorldEvent[] = [];
  const transitions: Transition[] = [];
  let newWorld = world;

  const playerEntity = world.entities[world.player.shipId as string];
  if (!playerEntity) return { world, events, transitions };

  switch (cmd.type) {
    case "SetSailLevel": {
      const updated = applySailLevel(playerEntity, cmd.value);
      newWorld = {
        ...world,
        entities: { ...world.entities, [world.player.shipId as string]: updated },
      };
      break;
    }

    case "Turn": {
      const updated = applyTurn(playerEntity, cmd.dir, cmd.amount);
      newWorld = {
        ...world,
        entities: { ...world.entities, [world.player.shipId as string]: updated },
      };
      break;
    }

    case "SetHeading": {
      const updated: EntityState = { ...playerEntity, heading: cmd.heading };
      newWorld = {
        ...world,
        entities: { ...world.entities, [world.player.shipId as string]: updated },
      };
      break;
    }

    case "EnterPort": {
      const portDef = PORTS[cmd.portId as string];
      if (!portDef) break;

      // Check distance
      const dist = vec2Dist(playerEntity.pos, portDef.pos);
      if (dist > portDef.dockRadius) break;

      newWorld = {
        ...world,
        player: {
          ...world.player,
          location: { type: "port", portId: cmd.portId, pos: playerEntity.pos },
        },
      };
      newWorld = addLogEntry(newWorld, "event.arrived", { port: portDef.name });
      events.push({ type: "PortEntered", portId: cmd.portId });
      events.push({ type: "Sound", id: "port_enter" });
      transitions.push({ type: "GoToScene", scene: "Port", payload: { portId: cmd.portId } });
      break;
    }

    case "ExitPort": {
      const exitPortDef = PORTS[world.player.location.portId as string];
      // Place ship at the port's position so it spawns near the port on the map
      const exitPos = exitPortDef ? exitPortDef.pos : world.player.location.pos;
      const updatedEntity: EntityState = {
        ...playerEntity,
        pos: { ...exitPos },
        vel: { x: 0, y: 0 },
        sailLevel: 0,
      };
      newWorld = {
        ...world,
        player: {
          ...world.player,
          location: { type: "sea", pos: exitPos },
        },
        entities: { ...world.entities, [world.player.shipId as string]: updatedEntity },
      };
      if (exitPortDef) {
        newWorld = addLogEntry(newWorld, "event.departed", { port: exitPortDef.name });
      }
      transitions.push({ type: "GoToScene", scene: "MainMap" });
      break;
    }

    case "TradeBuy": {
      const result = executeBuy(world, cmd.portId, cmd.itemId, cmd.qty);
      newWorld = result.world;
      events.push(...result.events);
      break;
    }

    case "TradeSell": {
      const result = executeSell(world, cmd.portId, cmd.itemId, cmd.qty);
      newWorld = result.world;
      events.push(...result.events);
      break;
    }

    case "RepairShip": {
      if (!playerEntity.ship) break;
      const repairCost = cmd.amount * 2; // 2 gold per HP
      if (world.player.gold < repairCost) break;

      const newHull = Math.min(playerEntity.ship.hullMax, playerEntity.ship.hullHp + cmd.amount);
      const actualRepair = newHull - playerEntity.ship.hullHp;
      const actualCost = actualRepair * 2;

      newWorld = {
        ...world,
        player: { ...world.player, gold: world.player.gold - actualCost },
        entities: {
          ...world.entities,
          [world.player.shipId as string]: {
            ...playerEntity,
            ship: { ...playerEntity.ship, hullHp: newHull },
          },
        },
      };
      break;
    }

    case "StartSeaBattle": {
      events.push({ type: "BattleStarted", enemyId: cmd.enemyEntityId });
      transitions.push({ type: "GoToScene", scene: "SeaBattle", payload: { enemyId: cmd.enemyEntityId } });
      break;
    }

    case "Disembark": {
      if (playerEntity.mode === "landed") break; // already on land
      // Must be stopped (near coastline — velocity zeroed by land collision)
      const speed = Math.sqrt(playerEntity.vel.x ** 2 + playerEntity.vel.y ** 2);
      if (speed > 0.1) break; // must be nearly stopped
      const updated: EntityState = {
        ...playerEntity,
        mode: "landed",
        anchorPos: { ...playerEntity.pos },
        sailLevel: 0,
        vel: { x: 0, y: 0 },
      };
      newWorld = {
        ...world,
        entities: { ...world.entities, [world.player.shipId as string]: updated },
      };
      newWorld = addLogEntry(newWorld, "event.disembarked");
      break;
    }

    case "Embark": {
      if (playerEntity.mode !== "landed") break; // already sailing
      // Return to ship anchor position
      const anchorPos = playerEntity.anchorPos ?? playerEntity.pos;
      // Heading will be corrected by WorldEngine using terrain query (findOpenSeaHeading)
      // For now set a fallback heading pointing from crew → anchor (rough seaward direction)
      const edx = anchorPos.x - playerEntity.pos.x;
      const edy = anchorPos.y - playerEntity.pos.y;
      const elen = Math.sqrt(edx * edx + edy * edy);
      const fallbackHeading = elen > 0.1
        ? normalizeHeading(Math.atan2(edx, -edy))
        : playerEntity.heading;
      // Push anchor further from land in seaward direction to prevent instant re-landing
      const pushDist = 5;
      const pushX = Math.sin(fallbackHeading) * pushDist;
      const pushY = -Math.cos(fallbackHeading) * pushDist;
      const safeAnchor = { x: anchorPos.x + pushX, y: anchorPos.y + pushY };
      const updated: EntityState = {
        ...playerEntity,
        mode: "sailing",
        pos: safeAnchor,
        heading: fallbackHeading,
        anchorPos: undefined,
        sailLevel: 0.1, // minimal sails — slow departure from land
        vel: { x: 0, y: 0 },
        embarkTick: world.time.tick, // grace period marker
      };
      newWorld = {
        ...world,
        entities: { ...world.entities, [world.player.shipId as string]: updated },
        player: {
          ...world.player,
          location: { ...world.player.location, pos: anchorPos },
        },
      };
      newWorld = addLogEntry(newWorld, "event.embarked");
      break;
    }

    // NewGame, SaveGame, LoadGame handled at higher level (GameApp)
    default:
      break;
  }

  return { world: newWorld, events, transitions };
}
