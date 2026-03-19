/**
 * Cache of water positions near each port.
 * Used by NPC AI to navigate TO ports without hitting land.
 * Computed once when geography is loaded.
 */
import type { Vec2 } from "../model/WorldState.ts";
import { PORTS } from "../data/ports.ts";
import { LANDMASSES } from "../data/geography.ts";
import { pointInLandmass } from "../services/Geometry.ts";

/** Water approach position for each port (key = port id string) */
const portWaterCache: Map<string, Vec2> = new Map();
let cacheBuilt = false;

function isWater(pos: Vec2): boolean {
  if (pos.x < 5 || pos.y < 5 || pos.x > 3195 || pos.y > 2395) return false;
  for (const lm of LANDMASSES) {
    if (pointInLandmass(pos, lm)) return false;
  }
  return true;
}

/** Build the cache. Call after LANDMASSES is populated. */
export function buildPortWaterCache(): void {
  portWaterCache.clear();
  for (const [portKey, port] of Object.entries(PORTS)) {
    const waterPos = findWaterApproach(port.pos);
    if (waterPos) {
      portWaterCache.set(portKey, waterPos);
    }
  }
  cacheBuilt = true;
}

/** Get the cached water position for a port. Falls back to port.pos if not found. */
export function getPortWaterPos(portKey: string): Vec2 {
  if (!cacheBuilt && LANDMASSES.length > 0) {
    buildPortWaterCache();
  }
  return portWaterCache.get(portKey) ?? PORTS[portKey]?.pos ?? { x: 0, y: 0 };
}

/**
 * Find the nearest water position around a land-based port.
 * Searches radially outward at multiple angles.
 */
function findWaterApproach(pos: Vec2): Vec2 | null {
  // Search outward for a water position that has clearance (not right on the coast edge).
  // Start further out so ships have room to approach without hitting land.
  for (let dist = 40; dist <= 120; dist += 8) {
    for (let a = 0; a < 16; a++) {
      const angle = (a / 16) * Math.PI * 2;
      const candidate: Vec2 = {
        x: pos.x + Math.sin(angle) * dist,
        y: pos.y - Math.cos(angle) * dist,
      };
      // Require the position AND a small area around it to be water (clearance check)
      if (isWater(candidate) &&
          isWater({ x: candidate.x + 10, y: candidate.y }) &&
          isWater({ x: candidate.x - 10, y: candidate.y }) &&
          isWater({ x: candidate.x, y: candidate.y + 10 }) &&
          isWater({ x: candidate.x, y: candidate.y - 10 })) {
        return candidate;
      }
    }
  }
  // Fallback: less strict check
  for (let dist = 30; dist <= 100; dist += 10) {
    for (let a = 0; a < 12; a++) {
      const angle = (a / 12) * Math.PI * 2;
      const candidate: Vec2 = {
        x: pos.x + Math.sin(angle) * dist,
        y: pos.y - Math.cos(angle) * dist,
      };
      if (isWater(candidate)) return candidate;
    }
  }
  return null;
}
