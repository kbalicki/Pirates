import type { WorldState } from "../model/WorldState.ts";
import type { EntityState } from "../model/EntityState.ts";
import type { WorldCommand } from "../model/Commands.ts";
import type { WorldEvent, Transition } from "../model/Events.ts";
import { applyTurn, applySailLevel } from "../systems/NavigationSystem.ts";
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
      newWorld = {
        ...world,
        player: {
          ...world.player,
          location: { type: "sea", pos: world.player.location.pos },
        },
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

    // NewGame, SaveGame, LoadGame handled at higher level (GameApp)
    default:
      break;
  }

  return { world: newWorld, events, transitions };
}
