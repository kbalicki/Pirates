import type { EntityState } from "../model/EntityState.ts";
import type { WeatherState, Vec2 } from "../model/WorldState.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { headingToVec, vec2Add, vec2Scale, normalizeHeading, clamp } from "../services/Geometry.ts";
import { windSpeedModifier } from "./WeatherSystem.ts";

export type TerrainQuery = (worldX: number, worldY: number) => TerrainType;

export type TerrainType = "sea" | "shallow" | "reef" | "land";

// Process one tick of movement for an entity
export function updateNavigation(
  entity: EntityState,
  weather: WeatherState,
  terrainAt: TerrainQuery,
  dtTicks: number,
): EntityState {
  if (entity.kind !== "ship" || !entity.ship) return entity;

  const shipClass = SHIP_CLASSES[entity.ship.classId as string];
  if (!shipClass) return entity;

  // Calculate effective speed
  const windMod = windSpeedModifier(entity.heading, weather.windDirRad, weather.windStrength);
  const sailsMod = entity.ship.sailsHp / entity.ship.sailsMax; // damaged sails = slower
  const baseSpeed = shipClass.speedBase * entity.sailLevel * windMod * sailsMod;

  // Direction vector from heading
  const dir = headingToVec(entity.heading);

  // New velocity
  const vel: Vec2 = vec2Scale(dir, baseSpeed);

  // Proposed new position
  const newPos = vec2Add(entity.pos, vec2Scale(vel, dtTicks));

  // Terrain check at new position
  const terrain = terrainAt(newPos.x, newPos.y);

  if (terrain === "land") {
    // Block movement - stay at old position
    return { ...entity, vel: { x: 0, y: 0 } };
  }

  if (terrain === "reef") {
    // Slow down and apply damage
    const slowVel = vec2Scale(vel, 0.3);
    const slowPos = vec2Add(entity.pos, vec2Scale(slowVel, dtTicks));
    return {
      ...entity,
      pos: slowPos,
      vel: slowVel,
      ship: {
        ...entity.ship,
        hullHp: Math.max(0, entity.ship.hullHp - 0.5 * dtTicks),
      },
    };
  }

  let speedMul = 1.0;
  if (terrain === "shallow") {
    speedMul = 0.6;
  }

  const finalVel = vec2Scale(vel, speedMul);
  const finalPos = vec2Add(entity.pos, vec2Scale(finalVel, dtTicks));

  return {
    ...entity,
    pos: finalPos,
    vel: finalVel,
  };
}

// Apply Turn command
export function applyTurn(entity: EntityState, dir: "left" | "right", amount: number): EntityState {
  if (entity.kind !== "ship" || !entity.ship) return entity;

  const shipClass = SHIP_CLASSES[entity.ship.classId as string];
  if (!shipClass) return entity;

  const maxTurn = shipClass.turnRate;
  const clampedAmount = clamp(amount, 0, maxTurn);
  const delta = dir === "left" ? -clampedAmount : clampedAmount;

  return {
    ...entity,
    heading: normalizeHeading(entity.heading + delta),
  };
}

// Apply SetSailLevel command
export function applySailLevel(entity: EntityState, value: number): EntityState {
  return {
    ...entity,
    sailLevel: clamp(value, 0, 1),
  };
}
