/**
 * NPC AI System
 *
 * - Traders & Navy: sail between ports (heading toward targetPortId)
 * - Pirates: lurk near wealthy ports / busy shipping lanes, chase non-pirate ships
 * - Pirate Hunters: patrol shipping lanes, chase pirate ships
 * - Named merchantmen: run for one end of their own passage (v0.35.0)
 *
 * NPC ships that arrive at their target port are removed by NpcSpawnSystem (docking).
 *
 * ## The chase (v0.35.0)
 *
 * Everything else in here steers at a point and lets `NavigationSystem` work out
 * how fast that turns out to be. A ship running for her life cannot afford
 * that: the polar curve makes the difference between two headings a factor of
 * three, and picking the one that merely *points* at safety is how a merchantman
 * ends up beating into the wind with a sloop walking up her wake.
 *
 * `bestVmgHeading` samples the whole compass and takes the heading with the best
 * speed **made good** towards where she wants to be. It is four lines, it uses
 * the same `windSpeedModifier` the player's own ship uses, and it is the reason
 * a chase in this game is a wind problem rather than a comparison of two numbers
 * in `ships.ts`. She is slower than almost anything that would chase her; what
 * she has is the right to choose the point of sail, and against a square rig
 * running for a harbour dead upwind, that is worth more than a knot.
 */
import type { WorldState, Vec2 } from "../model/WorldState.ts";
import type { EntityState } from "../model/EntityState.ts";
import { PORTS } from "../data/ports.ts";
import type { PortId } from "../model/ids.ts";
import { vec2Dist, normalizeHeading } from "../services/Geometry.ts";
import { getPortWaterPos } from "./PortWaterPositions.ts";
import { rngNext, rngNextInt, rngNextFloat } from "../services/RNG.ts";
import { tickBoundaryCrossed } from "./TimeSystem.ts";
import { tradeRoutes } from "./TradeRouteSystem.ts";
import { windSpeedModifier } from "./WeatherSystem.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { boltFor, namedShipById, hullOf, harryCount, boundFor, type NamedShip } from "./NamedShipSystem.ts";

const AI_UPDATE_INTERVAL = 20;       // ticks between AI decisions (~1s)
const PIRATE_CHASE_RADIUS = 200;
const HUNTER_CHASE_RADIUS = 250;
const LOITER_TURN_CHANCE = 0.05;     // chance per AI tick to adjust heading when loitering
const WAYPOINT_RADIUS = 70;          // how close counts as "rounded that corner"

/**
 * How finely she looks for her best point of sail (v0.35.0).
 *
 * Thirty-six is every ten degrees, which is finer than the curve's own features
 * (a thirty-degree dead zone, a sixty-degree reach band) and cheap enough to run
 * for one ship on one AI tick.
 */
const FLEE_SAMPLES = 36;

/** Notoriety past which a named merchantman does not wait to be introduced. */
const FLEE_NOTORIETY = 50;

/**
 * Update AI decisions for all NPC ships.
 */
export function updateNpcAi(world: WorldState, dtTicks: number): WorldState {
  const tick = world.time.tick;
  const prevTick = tick - dtTicks;
  const playerShipId = world.player.shipId as string;
  const playerEntity = world.entities[playerShipId];
  if (!playerEntity) return world;

  let rng = world.rng;
  let entities = { ...world.entities };
  let changed = false;

  for (const [id, entity] of Object.entries(entities)) {
    if (id === playerShipId) continue;
    if (entity.kind !== "ship" || !entity.ai) continue;

    // Skip AI if ship is in coast avoidance cooldown (let it sail away from land first)
    if (entity.coastAvoidTick && (tick - entity.coastAvoidTick) < 60) continue;

    // Stagger updates across ticks. The offset spreads the fleet's decisions
    // over the interval; the boundary check is what makes the interval fire at
    // all on a fractional clock (see `tickBoundaryCrossed`).
    const idHash = simpleHash(id);
    if (!tickBoundaryCrossed(prevTick, tick, AI_UPDATE_INTERVAL, idHash)) continue;

    const result = updateSingleNpc(entity, playerEntity, world, rng);
    if (result.entity !== entity) {
      entities = { ...entities, [id]: result.entity };
      changed = true;
    }
    rng = result.rng;
  }

  if (!changed && rng === world.rng) return world;
  return { ...world, entities, rng };
}

function updateSingleNpc(
  entity: EntityState,
  player: EntityState,
  world: WorldState,
  rng: typeof world.rng,
): { entity: EntityState; rng: typeof world.rng } {
  const ai = entity.ai!;
  const distToPlayer = vec2Dist(entity.pos, player.pos);

  // A hull with a name and a house behind her, and the hulls paid to keep her
  // afloat (v0.35.0). Both are ordinary `trader`/`navy` behaviours underneath;
  // what they have that nothing else does is a reason to care which particular
  // ship is closing on them.
  if (ai.namedShipId) return updateNamedTrader(entity, player, distToPlayer, world, rng);
  if (ai.namedEscortOf) return updateNamedEscort(entity, player, distToPlayer, world, rng);

  switch (ai.behavior) {
    case "trader":
      return updatePortToPort(entity, rng);
    case "navy":
      return updateNavy(entity, player, distToPlayer, world, rng);
    case "pirate":
      return updatePirate(entity, player, distToPlayer, rng);
    case "pirate_hunter":
      return updatePirateHunter(entity, player, distToPlayer, world, rng);
    default:
      return updatePortToPort(entity, rng);
  }
}

// ===== TRADERS & GENERIC PORT-TO-PORT =====

/** Sail toward target port. If no target, pick a new one. */
function updatePortToPort(
  entity: EntityState,
  rng: typeof entity.heading extends number ? any : never,
): { entity: EntityState; rng: any } {
  const ai = entity.ai!;

  if (!ai.targetPortId) {
    // Pick any port as destination
    const portKeys = Object.keys(PORTS);
    let idx: number;
    ({ value: idx, state: rng } = rngNextInt(rng, 0, portKeys.length - 1));
    return {
      entity: {
        ...entity,
        ai: { ...ai, targetPortId: portKeys[idx] as unknown as PortId, state: "travel" as const },
      },
      rng,
    };
  }

  const targetPortKey = ai.targetPortId as string;
  const targetPort = PORTS[targetPortKey];
  if (!targetPort) {
    return {
      entity: { ...entity, ai: { ...ai, targetPortId: undefined } },
      rng,
    };
  }

  // A trader on a lane steers for the next corner of her course rather than
  // straight at the harbour — that is the whole point of having a course
  // (v0.22.0). Everything else still steers at the destination and bounces off
  // whatever land is in the way, which is fine for a patrol with no schedule.
  if (ai.lane) {
    const route = tradeRoutes().find(r => r.id === ai.lane!.routeId);
    if (route) {
      let wp = ai.lane.wp;
      while (wp < route.path.length - 1 && vec2Dist(entity.pos, route.path[wp]) < WAYPOINT_RADIUS) wp++;
      const mark = route.path[Math.min(wp, route.path.length - 1)];
      const heading = headingToward(entity.pos, mark);
      const lane = wp === ai.lane.wp ? ai.lane : { ...ai.lane, wp };
      return { entity: { ...entity, heading, ai: { ...ai, lane } }, rng };
    }
  }

  // Navigate toward water position near target port (not the land position!)
  const waterPos = getPortWaterPos(targetPortKey);
  const heading = headingToward(entity.pos, waterPos);
  return { entity: { ...entity, heading }, rng };
}

// ===== NAMED MERCHANTMEN (v0.35.0) =====

/**
 * The heading with the best speed *made good* toward a bearing.
 *
 * `score = polar(heading) × cos(heading − wanted)`: how fast she goes on that
 * heading, times how much of it is in the direction she wants. Exported because
 * it is the whole of the chase and deserves its own assertions — a square rig
 * with a sixty-degree dead zone asked for a bearing dead to windward must come
 * back with something forty-five degrees off it, not with the bearing itself.
 */
export function bestVmgHeading(
  wanted: number,
  windDirRad: number,
  windStrength: number,
  minWindAngle: number,
): number {
  let best = wanted;
  let bestScore = -Infinity;
  for (let i = 0; i < FLEE_SAMPLES; i++) {
    const h = normalizeHeading((i / FLEE_SAMPLES) * Math.PI * 2);
    const made = windSpeedModifier(h, windDirRad, windStrength, minWindAngle) * Math.cos(h - wanted);
    if (made > bestScore) { bestScore = made; best = h; }
  }
  return best;
}

/**
 * Whether this player is something she runs from.
 *
 * Two answers, and the second is the interesting one. The first is the test the
 * navy already uses — a pirate, or somebody her crown has come to hate — and it
 * is what makes a black-flagged captain unable to walk up to any named hull in
 * the Caribbean. The second is `harried`: **once she has been shot at, she runs
 * from everybody**, which is v0.34.0's counter made visible at sea. The first
 * interception is clean; every one after it has to be earned.
 */
function fleesFrom(world: WorldState, player: EntityState, ship: NamedShip): boolean {
  const rep = world.player.reputation[ship.crown] ?? 0;
  const playerFaction = player.ship?.factionId as string;
  if (playerFaction === "pirates" || rep <= -60) return true;
  if ((world.player.notoriety ?? 0) > FLEE_NOTORIETY) return true;
  return harryCount(ship) > 0;
}

/** A named merchantman: runs, or works her passage. */
function updateNamedTrader(
  entity: EntityState,
  player: EntityState,
  distToPlayer: number,
  world: WorldState,
  rng: typeof world.rng,
): { entity: EntityState; rng: typeof world.rng } {
  const ai = entity.ai!;
  const ship = namedShipById(world, ai.namedShipId as string);
  if (!ship) return updatePortToPort(entity, rng);

  const threatened = distToPlayer < ai.awarenessRadius && fleesFrom(world, player, ship);

  if (!threatened) {
    // He has fallen astern, or was never anything to her. She picks her passage
    // up where she left it — her *record* still knows where that is, so nothing
    // has to be remembered on the hull.
    if (ai.state !== "flee") return updatePortToPort(entity, rng);
    return updatePortToPort({
      ...entity,
      sailLevel: 0.75,
      ai: { ...ai, state: "travel", targetPortId: boundFor(ship, world.time.day) as unknown as PortId },
    }, rng);
  }

  // The refuge is chosen ONCE and held. Recomputing it every second would have
  // her swing between her two harbours as he manoeuvres, which looks like a
  // ship that cannot make up its mind rather than one that has committed.
  const already = ai.state === "flee" ? (ai.targetPortId as string | undefined) : undefined;
  const end = already === ship.from || already === ship.to
    ? already
    : (() => {
        const pick = boltFor(ship, entity.pos, player.pos);
        return pick === "to" ? ship.to : pick === "from" ? ship.from : undefined;
      })();
  if (!end) return updatePortToPort(entity, rng);

  const haven = getPortWaterPos(end);
  const cls = SHIP_CLASSES[entity.ship?.classId as string];
  const heading = bestVmgHeading(
    headingToward(entity.pos, haven),
    world.weather.windDirRad,
    world.weather.windStrength,
    cls?.minWindAngle ?? 30,
  );

  return {
    entity: {
      ...entity,
      heading,
      // Everything she has. A merchantman under chase is not economising on
      // canvas, and the reefed-is-handier trade has nothing to offer a ship
      // whose whole plan is a straight line to a harbour.
      sailLevel: 1,
      ai: { ...ai, state: "flee", targetPortId: end as unknown as PortId },
    },
    rng,
  };
}

/**
 * One of her escorts.
 *
 * Ordinary navy behaviour, except for the line that matters: **when the charge
 * runs, the escort turns back**, whatever the player's standing is. That is what
 * a convoy is for, and it is the only thing in this file that reads another
 * ship's state to decide its own. Without it the escorts run alongside her and
 * the convoy is decoration — the player simply picks her out of the middle of it.
 */
function updateNamedEscort(
  entity: EntityState,
  player: EntityState,
  distToPlayer: number,
  world: WorldState,
  rng: typeof world.rng,
): { entity: EntityState; rng: typeof world.rng } {
  const ai = entity.ai!;
  const charge = hullOf(world, ai.namedEscortOf as string);

  if (charge && charge[1].ai?.state === "flee" && distToPlayer < ai.awarenessRadius * 2) {
    return {
      entity: {
        ...entity,
        heading: headingToward(entity.pos, player.pos),
        sailLevel: 1,
        ai: { ...ai, state: "chase" },
      },
      rng,
    };
  }

  return updateNavy(entity, player, distToPlayer, world, rng);
}

// ===== NAVY =====

/** Navy: sail between own faction's ports, chase hostile player */
function updateNavy(
  entity: EntityState,
  player: EntityState,
  distToPlayer: number,
  world: WorldState,
  rng: typeof world.rng,
): { entity: EntityState; rng: typeof world.rng } {
  const ai = entity.ai!;
  const factionKey = entity.ship?.factionId as string;

  // Chase hostile player
  const playerRep = world.player.reputation[factionKey] ?? 0;
  const playerFaction = player.ship?.factionId as string;
  const isHostile = playerRep <= -60 || playerFaction === "pirates";

  if (isHostile && distToPlayer < ai.awarenessRadius) {
    const heading = headingToward(entity.pos, player.pos);
    return {
      entity: {
        ...entity,
        heading,
        sailLevel: Math.min(1, entity.sailLevel + 0.1),
        ai: { ...ai, state: "chase" as const },
      },
      rng,
    };
  }

  // Otherwise: sail between own faction's ports
  if (!ai.targetPortId) {
    const ownPorts = Object.entries(PORTS)
      .filter(([, p]) => (p.factionId as string) === factionKey);
    if (ownPorts.length > 0) {
      let idx: number;
      ({ value: idx, state: rng } = rngNextInt(rng, 0, ownPorts.length - 1));
      return {
        entity: {
          ...entity,
          ai: { ...ai, targetPortId: ownPorts[idx][0] as unknown as PortId, state: "travel" as const },
        },
        rng,
      };
    }
  }

  return updatePortToPort(entity, rng);
}

// ===== PIRATES =====

/** Pirates: lurk near wealthy ports (busy lanes), chase non-pirate ships */
function updatePirate(
  entity: EntityState,
  player: EntityState,
  distToPlayer: number,
  rng: typeof entity.heading extends number ? any : never,
): { entity: EntityState; rng: any } {
  const ai = entity.ai!;
  const playerFaction = player.ship?.factionId as string;

  // Chase non-pirate player if close
  if (playerFaction !== "pirates" && distToPlayer < PIRATE_CHASE_RADIUS) {
    return {
      entity: {
        ...entity,
        heading: headingToward(entity.pos, player.pos),
        sailLevel: 1.0,
        ai: { ...ai, state: "chase" as const },
      },
      rng,
    };
  }

  // Patrol toward target (wealthy port area) — use water position
  if (ai.targetPortId) {
    const portKey = ai.targetPortId as string;
    const port = PORTS[portKey];
    if (port) {
      const waterPos = getPortWaterPos(portKey);
      const dist = vec2Dist(entity.pos, waterPos);
      if (dist < 120) {
        // Near target — loiter (random small heading changes)
        return addLoiter(entity, rng);
      }
      return {
        entity: { ...entity, heading: headingToward(entity.pos, waterPos) },
        rng,
      };
    }
  }

  // Pick a new wealthy port to lurk near
  const wealthyPorts = Object.entries(PORTS)
    .filter(([, p]) => p.wealth === "prosperous" || p.wealth === "wealthy" || p.population === "capital" || p.population === "large");
  if (wealthyPorts.length > 0) {
    let idx: number;
    ({ value: idx, state: rng } = rngNextInt(rng, 0, wealthyPorts.length - 1));
    return {
      entity: {
        ...entity,
        ai: { ...ai, targetPortId: wealthyPorts[idx][0] as unknown as PortId, state: "patrol" as const },
      },
      rng,
    };
  }

  return addLoiter(entity, rng);
}

// ===== PIRATE HUNTERS =====

/** Pirate hunters: patrol between ports, chase pirate player */
function updatePirateHunter(
  entity: EntityState,
  player: EntityState,
  distToPlayer: number,
  world: WorldState,
  rng: typeof world.rng,
): { entity: EntityState; rng: typeof world.rng } {
  const ai = entity.ai!;
  const playerFaction = player.ship?.factionId as string;
  const playerNotoriety = world.player.notoriety ?? 0;

  // Chase pirate player or high-notoriety player
  if ((playerFaction === "pirates" || playerNotoriety > 50) && distToPlayer < HUNTER_CHASE_RADIUS) {
    return {
      entity: {
        ...entity,
        heading: headingToward(entity.pos, player.pos),
        sailLevel: 1.0,
        ai: { ...ai, state: "chase" as const },
      },
      rng,
    };
  }

  // Patrol between ports (like navy, but cross-faction)
  return updatePortToPort(entity, rng);
}

// ===== Helpers =====

function headingToward(from: Vec2, to: Vec2): number {
  return normalizeHeading(Math.atan2(to.x - from.x, -(to.y - from.y)));
}

/** Small random heading adjustments for loitering ships */
function addLoiter(
  entity: EntityState,
  rng: any,
): { entity: EntityState; rng: any } {
  let roll: number;
  ({ value: roll, state: rng } = rngNext(rng));
  if (roll < LOITER_TURN_CHANCE) {
    let delta: number;
    ({ value: delta, state: rng } = rngNextFloat(rng, -0.4, 0.4));
    return {
      entity: { ...entity, heading: normalizeHeading(entity.heading + delta) },
      rng,
    };
  }
  return { entity, rng };
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
