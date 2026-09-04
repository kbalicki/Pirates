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
import { inventoryCap } from "../data/economyBaselines.ts";
import { routesFrom, type TradeRoute } from "./TradeRouteSystem.ts";
import { blockadeEffective } from "./BlockadeSystem.ts";
import { repricePort } from "./PricingSystem.ts";
import { tickBoundaryCrossed } from "./TimeSystem.ts";

// ---- Configuration ----
const MAX_NPC_SHIPS = 30;
const SPAWN_INTERVAL_TICKS = 60;    // check spawn every 3s
const DESPAWN_DISTANCE = 900;        // remove NPCs this far from player
const DOCK_RADIUS = 55;              // when NPC is this close to port water pos, it "docks" (disappears)
const BLOCKADE_SPAWN_WEIGHT = 3;     // how much busier a blockaded harbour is

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
 * A trader leaving this port sails a lane, not a whim (v0.22.0).
 *
 * `TradeRouteSystem` already knows which town supplies which, so a merchantman
 * out of Havana is bound somewhere Havana actually supplies. When no lane
 * leaves this port — a place that grows nothing anybody else needs — she falls
 * back to the old weighted guess, which is the right answer for a ship in
 * ballast.
 */
function pickLane(
  originKey: string,
  rng: { seed: number; state: number },
): { lane: TradeRoute | null; rng: typeof rng } {
  const lanes = routesFrom(originKey);
  if (lanes.length === 0) return { lane: null, rng };
  let idx: number;
  ({ value: idx, state: rng } = rngNextInt(rng, 0, lanes.length - 1));
  return { lane: lanes[idx], rng };
}

/** Share of a trader's hold that is full when she sails a lane. */
const LANE_LOAD_MIN = 0.55;
const LANE_LOAD_MAX = 0.9;

/**
 * How much of a port's stock of one good the trade may take at once.
 *
 * The hulls near the player are a *sample* of the trade, not the whole of it —
 * the abstraction in `EconomyTickSystem` still carries the bulk, because
 * nothing off-screen is simulated. So a departing hull may draw down the
 * quayside stock but never strip it: a town whose warehouse the player happens
 * to be sitting next to must not go hungry for it.
 */
const EXPORT_TAKE_SHARE = 0.25;

/**
 * Load a hold from the lane she is sailing, out of the port's own warehouse.
 *
 * Split across the goods the run carries, in whole units, so the prize the
 * player takes reads as a cargo — "sugar and rum out of Havana" — rather than
 * as a number. What comes out of the warehouse is what goes in the hold: this
 * is the goods actually moving, which is why she can be worth taking and why
 * her arrival is worth something at the far end.
 */
function loadHold(
  lane: TradeRoute,
  cargoCap: number,
  stock: Record<string, number>,
  rng: { seed: number; state: number },
): { cargo: Record<string, number>; taken: Record<string, number>; rng: typeof rng } {
  let fill: number;
  ({ value: fill, state: rng } = rngNextFloat(rng, LANE_LOAD_MIN, LANE_LOAD_MAX));
  const total = Math.floor(cargoCap * fill);
  const cargo: Record<string, number> = {};
  const taken: Record<string, number> = {};
  if (total <= 0 || lane.items.length === 0) return { cargo, taken, rng };

  const each = Math.floor(total / lane.items.length);
  let left = total;
  for (const item of lane.items) {
    const wanted = Math.min(each, left);
    if (wanted <= 0) continue;
    const available = Math.floor((stock[item] ?? 0) * EXPORT_TAKE_SHARE);
    const qty = Math.min(wanted, available);
    if (qty <= 0) continue;
    cargo[item] = qty;
    taken[item] = qty;
    left -= qty;
  }
  return { cargo, taken, rng };
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
 *
 * `dtTicks` is how much clock this frame added, and it is needed because the
 * clock is a float: see `tickBoundaryCrossed`. Gating on `tick % N === 0` meant
 * this function had not put a single ship on the map since the engine went to a
 * variable timestep.
 */
export function updateNpcSpawns(world: WorldState, dtTicks: number): WorldState {
  const tick = world.time.tick;
  if (!tickBoundaryCrossed(tick - dtTicks, tick, SPAWN_INTERVAL_TICKS)) return world;

  const playerEntity = world.entities[world.player.shipId as string];
  if (!playerEntity) return world;
  const playerPos = playerEntity.pos;

  let rng = world.rng;
  let entities = { ...world.entities };
  // Goods physically move between warehouses now, so the spawn pass writes to
  // `ports` as well as `entities` (v0.23.0).
  let ports = world.ports;
  const playerShipId = world.player.shipId as string;

  // ---- DESPAWN: far away NPCs ----
  for (const [id, e] of Object.entries(entities)) {
    if (id === playerShipId) continue;
    if (e.kind !== "ship" || !e.ai) continue;
    // An invasion squadron is not ordinary traffic: `ExpeditionFleetSystem`
    // owns its hulls and has to write their losses into the world event before
    // any of them leaves the chart. Deleted here they would take those losses
    // with them, and the landing would arrive at full strength.
    if (e.ai.expedition) continue;
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
    // Same reason as above, plus one of its own: an expedition's target port is
    // the town it is invading, so docking would have the squadron tie up
    // alongside the place it came to storm.
    if (e.ai.expedition) continue;
    const targetPortKey = e.ai.targetPortId as string;
    if (!targetPortKey) continue;
    const targetPort = PORTS[targetPortKey];
    if (!targetPort) continue;
    const waterPos = getPortWaterPos(targetPortKey);
    const dx = e.pos.x - waterPos.x;
    const dy = e.pos.y - waterPos.y;
    if (Math.sqrt(dx * dx + dy * dy) < DOCK_RADIUS) {
      // Her hold comes ashore before she does (v0.23.0). This is the far end of
      // the loop that `loadHold` opened: goods left one warehouse and now reach
      // another, so a convoy the player took is a delivery that never arrives.
      const hold = e.ship?.cargo;
      if (hold && Object.keys(hold).length > 0 && ports[targetPortKey]) {
        const port = ports[targetPortKey];
        const inventory = { ...port.inventory };
        for (const [item, qty] of Object.entries(hold)) {
          if (qty <= 0) continue;
          const cap = inventoryCap(targetPortKey, item);
          const have = inventory[item] ?? 0;
          // Never *below* what was already there: a warehouse that is somehow
          // over its cap — an old save, an event that dumped goods on it — must
          // not be quietly emptied by a delivery arriving.
          inventory[item] = Math.max(have, Math.min(cap, have + qty));
        }
        // The stock is written in and the goods are requoted against it
        // (v0.24.0), so a convoy making port moves the market the moment she
        // ties up rather than at the following midnight.
        //
        // She settles no *money*, deliberately. The hulls on the chart are a
        // sample of the trade and the ledger sits one level up, on the lane
        // itself, where `EconomyTickSystem` pays for the whole of it. Paying
        // here as well would count the same voyage twice — and, worse, would
        // pay a town extra for the accident of the player happening to be
        // anchored off it. Taking this convoy still costs both ends: her cargo
        // is gone out of one warehouse and never reaches the other, and
        // `disruptRoute` thins the lane that pays them.
        ports = {
          ...ports,
          [targetPortKey]: repricePort({ ...world, ports }, targetPortKey, Object.keys(hold), inventory)
            ?? { ...port, inventory },
        };
      }
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
      const weights = portEntries.map(([key, p]) => {
        const pop = POP_SHIP_WEIGHT[p.population] ?? 1;
        const war = warMul[p.factionId as string] ?? 1;
        // A blockaded harbour is the busiest water in the Caribbean: the crown
        // is fitting out to break the cordon and everybody else is trying to
        // slip through it (v0.22.0).
        const cordon = blockadeEffective(world, key) ? BLOCKADE_SPAWN_WEIGHT : 1;
        return pop * war * cordon;
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
      // A cordon puts a crown on a war footing at that harbour whether or not
      // it is at war with anybody: the ships that come out are men-of-war.
      const factionAtWar = (warMul[factionKey] ?? 1) > 1 || blockadeEffective(world, portKey);

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
      let lane: TradeRoute | null = null;
      if (behavior === "trader") {
        ({ lane, rng } = pickLane(portKey, rng));
      }
      if (lane) {
        destPortKey = lane.to;
      } else if (behavior === "pirate" || behavior === ("pirate_hunter" as string)) {
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

      // What she is carrying, if she is carrying anything (v0.22.0). Only
      // traders on a lane load a hold; a patrol sails in ballast.
      let laneCargo: Record<string, number> = {};
      if (lane) {
        const stock = ports[portKey]?.inventory ?? {};
        let taken: Record<string, number>;
        ({ cargo: laneCargo, taken, rng } = loadHold(lane, shipClass.cargoCap, stock, rng));
        if (Object.keys(taken).length > 0 && ports[portKey]) {
          const origin = ports[portKey];
          const inventory = { ...origin.inventory };
          for (const [item, qty] of Object.entries(taken)) {
            inventory[item] = Math.max(0, (inventory[item] ?? 0) - qty);
          }
          // The warehouse is lighter, so the quay quotes higher. Loading a
          // convoy out of a small town is visible in its market the same
          // afternoon.
          ports = {
            ...ports,
            [portKey]: repricePort({ ...world, ports }, portKey, Object.keys(taken), inventory)
              ?? { ...origin, inventory },
          };
        }
      }

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
          cargo: laneCargo,
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
          lane: lane ? { routeId: lane.id, wp: 1 } : undefined,
          lastPortVisited: portKey,
        },
      };

      entities = { ...entities, [npcId as string]: npcEntity };
    }
  }

  return { ...world, entities, ports, rng };
}
