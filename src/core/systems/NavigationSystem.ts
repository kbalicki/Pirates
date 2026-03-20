import type { EntityState } from "../model/EntityState.ts";
import type { WeatherState, Vec2 } from "../model/WorldState.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { headingToVec, vec2Add, vec2Scale, normalizeHeading, clamp } from "../services/Geometry.ts";
import { windSpeedModifier } from "./WeatherSystem.ts";

export type TerrainQuery = (worldX: number, worldY: number) => TerrainType;

export type TerrainType = "sea" | "shallow" | "reef" | "land";

const LAND_WALK_SPEED = 0.25; // walking speed on land (much slower than sailing)

/**
 * Process one tick of movement for an entity.
 * When a sailing ship collides with land it auto-disembarks:
 * the ship anchors at the last safe water position and crew
 * appears on the first land point.
 */
export function updateNavigation(
  entity: EntityState,
  weather: WeatherState,
  terrainAt: TerrainQuery,
  dtTicks: number,
): EntityState {
  if (entity.kind !== "ship" || !entity.ship) return entity;

  // Landed mode: walk on land
  if (entity.mode === "landed") {
    return updateLandMovement(entity, terrainAt, dtTicks);
  }

  const shipClass = SHIP_CLASSES[entity.ship.classId as string];
  if (!shipClass) return entity;

  // Calculate effective speed
  const windMod = windSpeedModifier(entity.heading, weather.windDirRad, weather.windStrength);
  const sailsMod = entity.ship.sailsHp / entity.ship.sailsMax;
  const baseSpeed = shipClass.speedBase * entity.sailLevel * windMod * sailsMod;

  // Direction vector from heading
  const dir = headingToVec(entity.heading);

  // New velocity
  const vel: Vec2 = vec2Scale(dir, baseSpeed);

  // Proposed new position
  const newPos = vec2Add(entity.pos, vec2Scale(vel, dtTicks));

  // Anti-tunneling: check terrain at multiple points along path
  const dx = newPos.x - entity.pos.x;
  const dy = newPos.y - entity.pos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Check land collision along movement path
  if (dist > 0.01) {
    const STEP = 2; // check every 2px for reliable narrow-land detection
    const steps = Math.max(1, Math.ceil(dist / STEP));

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const cx = entity.pos.x + dx * t;
      const cy = entity.pos.y + dy * t;

      const isLand = terrainAt(cx, cy) === "land";

      if (isLand) {
        // ---- AUTO-DISEMBARK ----
        // Anchor at last safe water position
        const safet = i === 1 ? 0 : (i - 1) / steps;
        const anchorPos: Vec2 = { x: entity.pos.x + dx * safet, y: entity.pos.y + dy * safet };

        // Find the deepest inland position by searching multiple directions
        const landPos = findDeepInlandPos(cx, cy, terrainAt);

        return {
          ...entity,
          mode: "landed",
          anchorPos,
          pos: landPos,
          vel: { x: 0, y: 0 },
          sailLevel: 0,
        };
      }
    }
  }

  // Check final terrain for reef/shallow effects
  const terrain = terrainAt(newPos.x, newPos.y);

  if (terrain === "reef") {
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

/**
 * Find a position well inside the landmass by searching radially from a hit
 * point and picking the direction with the deepest continuous land.
 */
function findDeepInlandPos(hitX: number, hitY: number, terrainAt: TerrainQuery): Vec2 {
  const TARGET = 20;
  let bestX = hitX, bestY = hitY, bestDepth = 0;

  for (let a = 0; a < 24; a++) {
    const angle = (a / 24) * Math.PI * 2;
    const sx = Math.sin(angle), sy = -Math.cos(angle);
    let depth = 0;
    for (let p = 1; p <= TARGET; p++) {
      if (terrainAt(hitX + sx * p, hitY + sy * p) === "land") depth = p;
      else break;
    }
    if (depth > bestDepth) {
      bestDepth = depth;
      bestX = hitX + sx * depth;
      bestY = hitY + sy * depth;
    }
  }
  return { x: bestX, y: bestY };
}

/**
 * Land movement: walk freely on land, gentle coast sliding at shallow angles.
 *
 * Rules:
 * - If desired direction is land → walk there (always works on open land)
 * - If blocked by water at a shallow angle (±45°) → slide along coast
 * - If blocked head-on → STOP. Player can turn and walk another direction.
 * - Heading is set directly by arrow keys (top-down directional control)
 */
function updateLandMovement(
  entity: EntityState,
  terrainAt: TerrainQuery,
  dtTicks: number,
): EntityState {
  if (entity.sailLevel <= 0) {
    return { ...entity, vel: { x: 0, y: 0 } };
  }

  // Recovery: if current position is not on land, nudge back
  if (terrainAt(entity.pos.x, entity.pos.y) !== "land") {
    const recovered = findDeepInlandPos(entity.pos.x, entity.pos.y, terrainAt);
    if (terrainAt(recovered.x, recovered.y) === "land") {
      return { ...entity, pos: recovered, vel: { x: 0, y: 0 } };
    }
    return { ...entity, vel: { x: 0, y: 0 } };
  }

  const speed = LAND_WALK_SPEED * entity.sailLevel;
  const step = speed * dtTicks;
  const heading = entity.heading;

  // 1. Try desired direction directly (full step, then half)
  for (const frac of [1.0, 0.5]) {
    const s = step * frac;
    const nx = entity.pos.x + Math.sin(heading) * s;
    const ny = entity.pos.y - Math.cos(heading) * s;
    if (terrainAt(nx, ny) === "land") {
      const v = speed * frac;
      return { ...entity, pos: { x: nx, y: ny }, vel: { x: Math.sin(heading) * v, y: -Math.cos(heading) * v } };
    }
  }

  // 2. Gentle coast sliding: only within ±45° of desired heading.
  //    This lets you walk along the beach at shallow angles,
  //    but stops you when walking head-on into water so you can turn.
  for (let deg = 5; deg <= 45; deg += 5) {
    const offset = (deg * Math.PI) / 180;
    for (const sign of [1, -1]) {
      const a = heading + offset * sign;
      const nx = entity.pos.x + Math.sin(a) * step;
      const ny = entity.pos.y - Math.cos(a) * step;
      if (terrainAt(nx, ny) === "land") {
        return { ...entity, pos: { x: nx, y: ny }, vel: { x: Math.sin(a) * speed, y: -Math.cos(a) * speed } };
      }
    }
  }

  // 3. Blocked head-on → stop. Player should turn and walk another direction.
  return { ...entity, vel: { x: 0, y: 0 } };
}

/**
 * Find the best heading to sail AWAY from land.
 * Samples terrain radially around a point and picks the direction
 * with the most open water (deepest continuous sea).
 */
export function findOpenSeaHeading(
  anchorX: number,
  anchorY: number,
  terrainAt: TerrainQuery,
  fallbackHeading: number,
): number {
  let bestAngle = fallbackHeading;
  let bestDepth = 0;
  const PROBE = 40; // pixels to sample outward

  for (let a = 0; a < 24; a++) {
    const angle = (a / 24) * Math.PI * 2;
    const sx = Math.sin(angle);
    const sy = -Math.cos(angle);
    let depth = 0;
    for (let p = 2; p <= PROBE; p += 2) {
      const terrain = terrainAt(anchorX + sx * p, anchorY + sy * p);
      if (terrain === "land") break;
      depth = p;
    }
    if (depth > bestDepth) {
      bestDepth = depth;
      bestAngle = angle;
    }
  }

  return bestAngle;
}

// Apply Turn command
export function applyTurn(entity: EntityState, dir: "left" | "right", amount: number): EntityState {
  if (entity.kind !== "ship" || !entity.ship) return entity;

  const turnRate = entity.mode === "landed" ? 0.96 : (() => {
    const shipClass = SHIP_CLASSES[entity.ship!.classId as string];
    return shipClass?.turnRate ?? 0.48;
  })();

  const clampedAmount = clamp(amount, 0, turnRate);
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
