import type { CombatState, CombatEntityState, CombatEvent } from "../model/CombatState.ts";
import type { CombatCommand } from "../model/Commands.ts";
import type { EngineResult } from "../model/Events.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { headingToVec, vec2Add, vec2Scale, vec2Dist, normalizeHeading, clamp } from "../services/Geometry.ts";
import { windSpeedModifier } from "../systems/WeatherSystem.ts";
import { CANNON_COOLDOWN_TICKS, CANNON_RANGE, CANNON_DAMAGE_HULL, CANNON_DAMAGE_SAILS } from "../systems/CombatSystem.ts";

export class CombatEngine {
  apply(
    prev: CombatState,
    commands: CombatCommand[],
    dtTicks: number,
  ): EngineResult<CombatState, CombatEvent> {
    let state = prev;
    const events: CombatEvent[] = [];

    // Apply player commands
    for (const cmd of commands) {
      const result = this.reduceCommand(state, state.playerShipId as string, cmd);
      state = result.state;
      events.push(...result.events);
    }

    // Tick cooldowns and movement for all ships
    const updatedEntities: Record<string, CombatEntityState> = {};

    for (const [id, entity] of Object.entries(state.entities)) {
      let updated = entity;

      if (entity.kind === "ship" && entity.ship) {
        // Move ship
        const shipClass = SHIP_CLASSES[entity.ship.classId as string];
        if (shipClass) {
          const windMod = windSpeedModifier(entity.heading, state.wind.dirRad, state.wind.strength);
          const sailsMod = entity.ship.sailsHp / entity.ship.sailsMax;
          const speed = shipClass.speedBase * (entity.vel.x !== 0 || entity.vel.y !== 0 ? 1 : 0) * windMod * sailsMod;

          const dir = headingToVec(entity.heading);
          const vel = vec2Scale(dir, speed);
          const newPos = vec2Add(entity.pos, vec2Scale(vel, dtTicks));

          // Clamp to arena bounds
          const clampedPos = {
            x: clamp(newPos.x, 0, state.arena.width),
            y: clamp(newPos.y, 0, state.arena.height),
          };

          // Tick cooldowns
          const newCooldown = {
            left: Math.max(0, entity.ship.cooldown.left - dtTicks),
            right: Math.max(0, entity.ship.cooldown.right - dtTicks),
          };

          updated = {
            ...entity,
            pos: clampedPos,
            vel,
            ship: { ...entity.ship, cooldown: newCooldown },
          };
        }
      }

      updatedEntities[id] = updated;
    }

    // Simple enemy AI
    const enemyId = state.enemyShipId as string;
    const playerId = state.playerShipId as string;
    const enemy = updatedEntities[enemyId];
    const player = updatedEntities[playerId];

    if (enemy?.ship && player) {
      const aiResult = this.runEnemyAI(enemy, player, dtTicks);
      updatedEntities[enemyId] = aiResult.entity;
      events.push(...aiResult.events);
    }

    // Check battle end conditions
    const playerShip = updatedEntities[playerId];
    const enemyShip = updatedEntities[enemyId];

    if (playerShip?.ship && playerShip.ship.hullHp <= 0) {
      events.push({ type: "BattleEnded", outcome: "lose" });
    } else if (enemyShip?.ship && enemyShip.ship.hullHp <= 0) {
      events.push({ type: "BattleEnded", outcome: "win", loot: enemyShip.ship ? { gold: 50 } : undefined });
    }

    const newState: CombatState = {
      ...state,
      time: { tick: state.time.tick + dtTicks },
      entities: updatedEntities,
      events,
    };

    return { state: newState, events };
  }

  private reduceCommand(
    state: CombatState,
    shipId: string,
    cmd: CombatCommand,
  ): { state: CombatState; events: CombatEvent[] } {
    const entity = state.entities[shipId];
    if (!entity?.ship) return { state, events: [] };

    const events: CombatEvent[] = [];

    switch (cmd.type) {
      case "SetSailLevel": {
        const dir = headingToVec(entity.heading);
        const newVel = vec2Scale(dir, clamp(cmd.value, 0, 1));
        return {
          state: {
            ...state,
            entities: {
              ...state.entities,
              [shipId]: { ...entity, vel: newVel },
            },
          },
          events,
        };
      }

      case "Turn": {
        const shipClass = SHIP_CLASSES[entity.ship.classId as string];
        const maxTurn = shipClass?.turnRate ?? 0.08;
        const amount = clamp(cmd.amount, 0, maxTurn);
        const delta = cmd.dir === "left" ? -amount : amount;
        return {
          state: {
            ...state,
            entities: {
              ...state.entities,
              [shipId]: { ...entity, heading: normalizeHeading(entity.heading + delta) },
            },
          },
          events,
        };
      }

      case "FireCannons": {
        const cooldown = cmd.side === "left" ? entity.ship.cooldown.left : entity.ship.cooldown.right;
        if (cooldown > 0) return { state, events };

        events.push({ type: "CannonFired", side: cmd.side, shipId: entity.id });
        events.push({ type: "Sound", id: "cannon_fire" });

        // Find target (the other ship)
        const targetId = shipId === (state.playerShipId as string) ? state.enemyShipId : state.playerShipId;
        const target = state.entities[targetId as string];

        if (target) {
          const dist = vec2Dist(entity.pos, target.pos);
          if (dist <= CANNON_RANGE && target.ship) {
            // Hit! Apply damage
            const newTargetShip = {
              ...target.ship,
              hullHp: Math.max(0, target.ship.hullHp - CANNON_DAMAGE_HULL),
              sailsHp: Math.max(0, target.ship.sailsHp - CANNON_DAMAGE_SAILS),
            };
            events.push({
              type: "ShipDamaged",
              shipId: target.id,
              hullDelta: -CANNON_DAMAGE_HULL,
              sailsDelta: -CANNON_DAMAGE_SAILS,
            });
            events.push({ type: "FxHit", pos: target.pos });
            events.push({ type: "Sound", id: "cannon_hit" });

            const newCooldown = { ...entity.ship.cooldown };
            if (cmd.side === "left") newCooldown.left = CANNON_COOLDOWN_TICKS;
            else newCooldown.right = CANNON_COOLDOWN_TICKS;

            return {
              state: {
                ...state,
                entities: {
                  ...state.entities,
                  [shipId]: { ...entity, ship: { ...entity.ship, cooldown: newCooldown } },
                  [targetId as string]: { ...target, ship: newTargetShip },
                },
              },
              events,
            };
          }
        }

        // Miss or out of range - still set cooldown
        const newCooldown = { ...entity.ship.cooldown };
        if (cmd.side === "left") newCooldown.left = CANNON_COOLDOWN_TICKS;
        else newCooldown.right = CANNON_COOLDOWN_TICKS;

        return {
          state: {
            ...state,
            entities: {
              ...state.entities,
              [shipId]: { ...entity, ship: { ...entity.ship, cooldown: newCooldown } },
            },
          },
          events,
        };
      }

      default:
        return { state, events };
    }
  }

  private runEnemyAI(
    enemy: CombatEntityState,
    player: CombatEntityState,
    _dtTicks: number,
  ): { entity: CombatEntityState; events: CombatEvent[] } {
    if (!enemy.ship) return { entity: enemy, events: [] };

    const events: CombatEvent[] = [];
    let updated = enemy;

    const dist = vec2Dist(enemy.pos, player.pos);

    // Simple AI: try to maintain broadside distance and fire when ready
    const dx = player.pos.x - enemy.pos.x;
    const dy = player.pos.y - enemy.pos.y;
    const angleToPlayer = Math.atan2(dx, -dy);

    // Adjust heading towards player but offset for broadside
    const broadSideOffset = Math.PI / 2;
    const desiredHeading = normalizeHeading(angleToPlayer + broadSideOffset);
    const shipClass = SHIP_CLASSES[enemy.ship.classId as string];
    const turnRate = shipClass?.turnRate ?? 0.08;

    let headingDiff = desiredHeading - enemy.heading;
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;

    const turnAmount = Math.min(Math.abs(headingDiff), turnRate);
    const newHeading = normalizeHeading(enemy.heading + Math.sign(headingDiff) * turnAmount);

    // Set sail based on distance
    const dir = headingToVec(newHeading);
    const speed = dist > CANNON_RANGE * 0.8 ? 1.0 : 0.5;

    updated = {
      ...enemy,
      heading: newHeading,
      vel: vec2Scale(dir, speed),
    };

    // Fire if in range and cooldown ready
    if (dist <= CANNON_RANGE && enemy.ship.cooldown.left <= 0) {
      events.push({ type: "CannonFired", side: "left", shipId: enemy.id });
      events.push({ type: "Sound", id: "cannon_fire" });

      if (player.ship) {
        events.push({
          type: "ShipDamaged",
          shipId: player.id,
          hullDelta: -CANNON_DAMAGE_HULL,
          sailsDelta: -CANNON_DAMAGE_SAILS,
        });
        events.push({ type: "FxHit", pos: player.pos });
      }

      updated = {
        ...updated,
        ship: {
          ...updated.ship!,
          cooldown: { ...updated.ship!.cooldown, left: CANNON_COOLDOWN_TICKS },
        },
      };
    }

    return { entity: updated, events };
  }
}
