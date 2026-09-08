import type { EntityState } from "../model/EntityState.ts";
import type { WeatherState, Vec2 } from "../model/WorldState.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { headingToVec, vec2Add, vec2Scale, normalizeHeading, clamp } from "../services/Geometry.ts";
import { windPolar, navigatedWindModifier, NEUTRAL_NAVIGATION } from "./WeatherSystem.ts";
import { mapDamageSpeedMultiplier } from "./DamageSystem.ts";
import { depthAt, soundings, AGROUND_HULL_PER_TICK } from "../services/SeaDepth.ts";
import { manningSpeedMultiplier, manningTurnMultiplier } from "./CrewSystem.ts";

export type TerrainQuery = (worldX: number, worldY: number) => TerrainType;

/**
 * What is under the ship.
 *
 * `"shallow"` and `"reef"` were members here from the beginning, with real
 * handling below, and **nothing ever returned them**: the map's terrain query
 * answers `"land"` or `"sea"` and nothing else. Depth is not a property of a
 * square of water anyway — it is a comparison between the water and the hull —
 * so it lives in `SeaDepth` and the enum tells the truth again (v0.48.0).
 */
export type TerrainType = "sea" | "land";

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
  /** Fleet speed multiplier (1.0 = solo, <1 = slowest escort limits speed). */
  fleetSpeedMul = 1,
  /**
   * The set of the sea here, in world units per tick (v0.41.0).
   *
   * Added to the ship's own velocity, never to her heading: a current carries a
   * ship, it does not steer her. Everything downstream — the anti-tunnelling
   * walk, the reef branch, the speed readout on the HUD — then works on speed
   * over the ground, which is the number that actually matters and the one that
   * makes the Straits of Florida visible without a word of UI.
   */
  current: Vec2 = { x: 0, y: 0 },
  /**
   * The man at the chart table, 0..10 (v0.47.0).
   *
   * Defaults to `NEUTRAL_NAVIGATION`, which is exactly how every hull in the
   * game sailed before the skill had a reader — so NPCs, which are steered by
   * nobody in particular, keep sailing that way and only the player's own
   * flagship is affected by what is on his sheet.
   */
  navigation: number = NEUTRAL_NAVIGATION,
): EntityState {
  if (entity.kind !== "ship" || !entity.ship) return entity;

  // Landed mode: walk on land
  if (entity.mode === "landed") {
    return updateLandMovement(entity, terrainAt, dtTicks);
  }

  const shipClass = SHIP_CLASSES[entity.ship.classId as string];
  if (!shipClass) return entity;

  // Calculate effective speed (fleet multiplier slows to slowest ship)
  // A good navigator is worth most where the wind serves worst, and nothing at
  // all on a broad reach — see `navigatedWindModifier`.
  const polar = windPolar(
    entity.heading, weather.windDirRad, weather.windStrength, shipClass.minWindAngle ?? 30,
  );
  const windMod = navigatedWindModifier(polar.speed, navigation, polar.draw);
  // Damage tiers (v0.9.9). Unlike in battle, a dismasted ship still crawls —
  // repairs only exist in port, so a true zero here would strand the player.
  const damageMod = mapDamageSpeedMultiplier(
    entity.ship.hullHp, entity.ship.hullMax,
    entity.ship.sailsHp, entity.ship.sailsMax,
  );
  // Hands enough to work her (v0.49.0). Reads 1.0 for every fully manned hull,
  // which is every NPC and every consort in every save written before this
  // release — see the measurement in `CrewSystem`. Nothing had to be passed in:
  // the muster roll was already on the entity.
  const manningMod = manningSpeedMultiplier(entity.ship.crew.current, entity.ship.classId as string);
  const baseSpeed = shipClass.speedBase * entity.sailLevel * windMod * damageMod * fleetSpeedMul * manningMod;

  // Direction vector from heading
  const dir = headingToVec(entity.heading);

  // New velocity: what she makes through the water, plus what the water makes.
  const vel: Vec2 = vec2Add(vec2Scale(dir, baseSpeed), current);

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

        // Land just a few pixels onto shore (not deep inland)
        const landPos = findShorePos(cx, cy, entity.heading, terrainAt);

        return {
          ...entity,
          mode: "landed",
          anchorPos,
          pos: landPos,
          vel: { x: 0, y: 0 },
          sailLevel: 0,
          landedTick: -1, // will be set to actual tick by WorldEngine
        };
      }
    }
  }

  // How much water there is where she is about to be, against how much she
  // needs (v0.48.0). Replaces two branches keyed on terrain types no query
  // ever returned; depth is a comparison with the hull, not a kind of square.
  const sea = soundings(depthAt(newPos.x, newPos.y), shipClass.draft ?? 0);

  const finalVel = vec2Scale(vel, sea.speedMul);
  const finalPos = vec2Add(entity.pos, vec2Scale(finalVel, dtTicks));

  if (sea.aground) {
    // She keeps steerage way — barely — so the player can back out of it. A
    // true zero would strand a deep hull the first time she wandered inshore,
    // which is the same reason a dismasted ship still crawls on the map.
    return {
      ...entity,
      pos: finalPos,
      vel: finalVel,
      aground: true,
      // Cleared, not left standing: she was shoaling on the way in and both
      // flags are meant to describe this tick only.
      shoaling: undefined,
      ship: {
        ...entity.ship,
        hullHp: Math.max(0, entity.ship.hullHp - AGROUND_HULL_PER_TICK * dtTicks),
      },
    };
  }

  // Both flags are cleared rather than left standing: they describe where she
  // is this tick, not something that happened to her.
  return {
    ...entity,
    pos: finalPos,
    vel: finalVel,
    aground: undefined,
    shoaling: sea.shoal ? true : undefined,
  };
}

/**
 * Place crew just a few pixels onto shore from the collision point.
 * Steps 3px in the ship's heading direction (inland). Falls back to hit point.
 */
function findShorePos(hitX: number, hitY: number, heading: number, terrainAt: TerrainQuery): Vec2 {
  const sx = Math.sin(heading);
  const sy = -Math.cos(heading);
  // Step 3px inland from the collision point
  for (const dist of [3, 2, 1]) {
    const nx = hitX + sx * dist;
    const ny = hitY + sy * dist;
    if (terrainAt(nx, ny) === "land") {
      return { x: nx, y: ny };
    }
  }
  return { x: hitX, y: hitY };
}

/**
 * Find a position well inside the landmass (used for recovery only).
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
    const baseTurn = shipClass?.turnRate ?? 0.48;
    // Reefed sails = more maneuverable: 0→+50%, 0.33→+33%, 0.5→+25%, 1.0→+0%
    const sailBonus = 1 + (1 - entity.sailLevel) * 0.5;
    // And men enough to brace the yards round (v0.49.0). Short-handedness costs
    // a ship her handling before it costs her speed, so this multiplier falls
    // roughly twice as fast as the one on `baseSpeed` above.
    const hands = manningTurnMultiplier(entity.ship!.crew.current, entity.ship!.classId as string);
    return baseTurn * sailBonus * hands;
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
