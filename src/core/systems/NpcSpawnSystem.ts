/**
 * NPC Ship Spawn System
 *
 * Ships spawn FROM ports (departing) and despawn INTO ports (docking).
 * Bigger cities generate more traffic. All spawns are validated to be in water.
 * Pirates and pirate hunters patrol busy shipping lanes, not random areas.
 */
import type { WorldState, Vec2 } from "../model/WorldState.ts";
import type { EntityState, AiData } from "../model/EntityState.ts";
import { entityId } from "../model/ids.ts";
import type { PortId } from "../model/ids.ts";
import { PORTS } from "../data/ports.ts";
import type { PortDef } from "../data/ports.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { getPortNews } from "./WorldEventSystem.ts";
import { warSpawnMultipliers } from "./EventEffectsSystem.ts";
import { LANDMASSES } from "../data/geography.ts";
import { pointInLandmass, normalizeHeading } from "../services/Geometry.ts";
import { getPortWaterPos } from "./PortWaterPositions.ts";
import { rngNext, rngNextInt, rngNextFloat } from "../services/RNG.ts";

// ---- Configuration ----
const MAX_NPC_SHIPS = 30;
const SPAWN_INTERVAL_TICKS = 60;    // check spawn every 3s
const DESPAWN_DISTANCE = 900;        // remove NPCs this far from player
const DOCK_RADIUS = 55;              // when NPC is this close to port water pos, it "docks" (disappears)

/** Population → max concurrent ships that can depart from this port */
const POP_SHIP_WEIGHT: Record<string, number> = {
  capital: 5,
  large: 3,
  medium: 2,
  small: 1,
};

/** Behavior templates */
const BEHAVIOR_TEMPLATES: Record<string, {
  shipClasses: string[];
  sailLevel: [number, number];
  aggression: [number, number];
  awarenessRadius: number;
}> = {
  trader: {
    shipClasses: ["merchantman", "fluyt", "barque", "brigantine"],
    sailLevel: [0.5, 0.8],
    aggression: [0, 0.1],
    awarenessRadius: 120,
  },
  navy: {
    shipClasses: ["frigate", "brigantine", "galleon", "fast_galleon"],
    sailLevel: [0.6, 0.9],
    aggression: [0.3, 0.7],
    awarenessRadius: 200,
  },
  pirate: {
    shipClasses: ["pinnace", "sloop", "brigantine", "frigate"],
    sailLevel: [0.7, 1.0],
    aggression: [0.6, 1.0],
    awarenessRadius: 250,
  },
  pirate_hunter: {
    shipClasses: ["frigate", "brigantine", "fast_galleon"],
    sailLevel: [0.8, 1.0],
    aggression: [0.5, 0.9],
    awarenessRadius: 300,
  },
};

/** Check if a world position is in water (not on any landmass) */
function isWater(pos: Vec2): boolean {
  if (pos.x < 5 || pos.y < 5 || pos.x > 3195 || pos.y > 2395) return false;
  for (const lm of LANDMASSES) {
    if (pointInLandmass(pos, lm)) return false;
  }
  return true;
}

/**
 * Find a water position near a port (for spawning departing ships).
 * Tries multiple angles radiating outward from the port position.
 */
function findWaterNearPort(port: PortDef, _rng: { seed: number; state: number }): { pos: Vec2; heading: number } | null {
  const cx = port.pos.x;
  const cy = port.pos.y;

  // Try 12 angles at increasing distances
  for (let dist = 40; dist <= 80; dist += 10) {
    for (let a = 0; a < 12; a++) {
      const angle = (a / 12) * Math.PI * 2;
      const px = cx + Math.sin(angle) * dist;
      const py = cy - Math.cos(angle) * dist;
      const pos = { x: px, y: py };
      if (isWater(pos)) {
        // Heading = away from port (outward)
        const heading = normalizeHeading(angle);
        return { pos, heading };
      }
    }
  }
  return null; // No water found near this port
}

/**
 * Pick a destination port for a ship departing from originPort.
 * Prefers ports of the same faction, weighted by population size.
 */
function pickDestinationPort(
  originKey: string,
  factionId: string,
  rng: { seed: number; state: number },
): { portKey: string; rng: typeof rng } {
  // Build weighted list: same-faction ports get 3x weight, bigger ports get more weight
  const candidates: { key: string; weight: number }[] = [];
  for (const [key, port] of Object.entries(PORTS)) {
    if (key === originKey) continue;
    const popWeight = POP_SHIP_WEIGHT[port.population] ?? 1;
    const factionBonus = (port.factionId as string) === factionId ? 3 : 1;
    candidates.push({ key, weight: popWeight * factionBonus });
  }
  if (candidates.length === 0) return { portKey: originKey, rng };

  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  let roll: number;
  ({ value: roll, state: rng } = rngNextFloat(rng, 0, totalWeight));

  let cumulative = 0;
  for (const c of candidates) {
    cumulative += c.weight;
    if (roll <= cumulative) return { portKey: c.key, rng };
  }
  return { portKey: candidates[candidates.length - 1].key, rng };
}

/**
 * Determine NPC behavior based on faction. European factions produce traders + navy.
 * Pirates faction produces pirates. 10% chance of pirate_hunter from European factions.
 *
 * When `atWar` is true (faction is involved in an active war), navy frequency
 * jumps from ~45% to ~70% at the expense of traders.
 */
function pickBehavior(factionId: string, roll: number, atWar: boolean): AiData["behavior"] {
  if (factionId === "pirates") return "pirate";
  if (roll < 0.10) return "pirate_hunter" as AiData["behavior"];
  const traderCutoff = atWar ? 0.30 : 0.55;
  if (roll < traderCutoff) return "trader";
  return "navy";
}

/**
 * Main spawn/despawn function. Called every tick from WorldEngine.
 */
export function updateNpcSpawns(world: WorldState): WorldState {
  const tick = world.time.tick;
  if (tick % SPAWN_INTERVAL_TICKS !== 0) return world;

  const playerEntity = world.entities[world.player.shipId as string];
  if (!playerEntity) return world;
  const playerPos = playerEntity.pos;

  let rng = world.rng;
  let entities = { ...world.entities };
  const playerShipId = world.player.shipId as string;

  // ---- DESPAWN: far away NPCs ----
  for (const [id, e] of Object.entries(entities)) {
    if (id === playerShipId) continue;
    if (e.kind !== "ship" || !e.ai) continue;
    const dx = e.pos.x - playerPos.x;
    const dy = e.pos.y - playerPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > DESPAWN_DISTANCE) {
      const copy = { ...entities };
      delete copy[id];
      entities = copy;
    }
  }

  // ---- DOCK: NPCs arriving at their target port disappear ----
  for (const [id, e] of Object.entries(entities)) {
    if (id === playerShipId) continue;
    if (e.kind !== "ship" || !e.ai) continue;
    if (e.ai.state !== "travel" && e.ai.state !== "patrol") continue;
    const targetPortKey = e.ai.targetPortId as string;
    if (!targetPortKey) continue;
    const targetPort = PORTS[targetPortKey];
    if (!targetPort) continue;
    const waterPos = getPortWaterPos(targetPortKey);
    const dx = e.pos.x - waterPos.x;
    const dy = e.pos.y - waterPos.y;
    if (Math.sqrt(dx * dx + dy * dy) < DOCK_RADIUS) {
      // Ship docks — remove from map
      const copy = { ...entities };
      delete copy[id];
      entities = copy;
    }
  }

  // ---- COUNT current NPCs ----
  let currentNpcCount = 0;
  for (const [id, e] of Object.entries(entities)) {
    if (id === playerShipId) continue;
    if (e.kind === "ship" && e.ai) currentNpcCount++;
  }

  // ---- SPAWN: new NPCs departing from ports ----
  if (currentNpcCount < MAX_NPC_SHIPS) {
    const spawnsToAttempt = Math.min(2, MAX_NPC_SHIPS - currentNpcCount);

    // War-driven faction spawn multiplier (≥1 for warring nations).
    const warMul = warSpawnMultipliers(world);

    for (let s = 0; s < spawnsToAttempt; s++) {
      // Weight port selection by population × war multiplier (bigger city + at war = more ships)
      const portEntries = Object.entries(PORTS);
      const weights = portEntries.map(([, p]) => {
        const pop = POP_SHIP_WEIGHT[p.population] ?? 1;
        const war = warMul[p.factionId as string] ?? 1;
        return pop * war;
      });
      const totalWeight = weights.reduce((a, b) => a + b, 0);

      let roll: number;
      ({ value: roll, state: rng } = rngNextFloat(rng, 0, totalWeight));
      let cumW = 0;
      let chosenIdx = 0;
      for (let i = 0; i < weights.length; i++) {
        cumW += weights[i];
        if (roll <= cumW) { chosenIdx = i; break; }
      }

      const [portKey, port] = portEntries[chosenIdx];
      const factionKey = port.factionId as string;
      const factionAtWar = (warMul[factionKey] ?? 1) > 1;

      // Find valid water spawn position near this port
      const spawnPoint = findWaterNearPort(port, rng);
      if (!spawnPoint) continue; // Skip if port is landlocked

      // Pick behavior — wartime shifts traders → navy
      let behaviorRoll: number;
      ({ value: behaviorRoll, state: rng } = rngNext(rng));
      const behavior = pickBehavior(factionKey, behaviorRoll, factionAtWar);
      const template = BEHAVIOR_TEMPLATES[behavior] ?? BEHAVIOR_TEMPLATES.trader;

      // Pick ship class
      let classIdx: number;
      ({ value: classIdx, state: rng } = rngNextInt(rng, 0, template.shipClasses.length - 1));
      const classId = template.shipClasses[classIdx];
      const shipClass = SHIP_CLASSES[classId];
      if (!shipClass) continue;

      // Pick destination port
      let destPortKey: string;
      if (behavior === "pirate" || behavior === ("pirate_hunter" as string)) {
        // Pirates/hunters: pick a wealthy port's vicinity as patrol target
        const wealthyPorts = Object.entries(PORTS)
          .filter(([k, p]) => k !== portKey && (p.wealth === "prosperous" || p.wealth === "wealthy" || p.population === "capital"));
        if (wealthyPorts.length > 0) {
          let idx: number;
          ({ value: idx, state: rng } = rngNextInt(rng, 0, wealthyPorts.length - 1));
          destPortKey = wealthyPorts[idx][0];
        } else {
          ({ portKey: destPortKey, rng } = pickDestinationPort(portKey, factionKey, rng));
        }
      } else {
        ({ portKey: destPortKey, rng } = pickDestinationPort(portKey, factionKey, rng));
      }

      // Heading toward destination
      const destPort = PORTS[destPortKey];
      const heading = destPort
        ? normalizeHeading(Math.atan2(destPort.pos.x - spawnPoint.pos.x, -(destPort.pos.y - spawnPoint.pos.y)))
        : spawnPoint.heading;

      // Sail level
      let sailLevel: number;
      ({ value: sailLevel, state: rng } = rngNextFloat(rng, template.sailLevel[0], template.sailLevel[1]));

      // Aggression
      let aggression: number;
      ({ value: aggression, state: rng } = rngNextFloat(rng, template.aggression[0], template.aggression[1]));

      const npcId = entityId(`npc_${tick}_${s}_${classId}`);
      const npcEntity: EntityState = {
        id: npcId,
        kind: "ship",
        mode: "sailing",
        pos: spawnPoint.pos,
        vel: { x: 0, y: 0 },
        heading,
        sailLevel,
        depthOffset: 0,
        ship: {
          classId: shipClass.id,
          factionId: port.factionId,
          hullHp: shipClass.hullMax,
          hullMax: shipClass.hullMax,
          sailsHp: shipClass.sailsMax,
          sailsMax: shipClass.sailsMax,
          cannons: shipClass.cannons,
          cargo: {},
          cargoCap: shipClass.cargoCap,
          crew: {
            current: Math.round(shipClass.crewMax * 0.7),
            max: shipClass.crewMax,
            morale: 0.7,
          },
        },
        ai: {
          behavior: behavior as AiData["behavior"],
          state: "travel",
          targetPortId: destPortKey as unknown as PortId,
          aggression,
          awarenessRadius: template.awarenessRadius,
          news: getPortNews(world, portKey).slice(0, 5),
          lastPortVisited: portKey,
        },
      };

      entities = { ...entities, [npcId as string]: npcEntity };
    }
  }

  return { ...world, entities, rng };
}
