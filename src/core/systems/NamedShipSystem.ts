/**
 * NamedShipSystem — the hulls that are the same hull tomorrow (v0.32.0).
 *
 * Every ship in this game has been anonymous. `NpcSpawnSystem` puts traders and
 * patrols on the water inside the player's horizon and takes them off behind
 * him; two fluyts off Havana on consecutive mornings are not the same fluyt and
 * nothing in the world remembers either. That is the right model for traffic —
 * it is what makes forty-five ports' worth of shipping affordable — and it is
 * why the informer's third commission has been on the TODO list unwritten since
 * v0.25.0. "Sink the *Santa Ana*" needs a *Santa Ana* that is still there when
 * the captain has crossed the Caribbean to find her.
 *
 * ## She is a record, not an entity
 *
 * A handful of named merchantmen live in `world.namedShips` as bookkeeping: a
 * name, a crown, a class, the lane she works, and how far along it she is. She
 * has no entity and costs nothing while the player is elsewhere. Within
 * `MATERIALIZE_RANGE` she is put on the chart as a real NPC and behaves like
 * any other trader; beyond it she is taken off again, and her damage and her
 * progress are written back first.
 *
 * That is `ExpeditionFleetSystem`'s pattern, deliberately: it is the one place
 * in this codebase that already solved "a thing that exists on the map and only
 * sometimes exists on the water", and its rule — **write back before you
 * despawn** — is the whole reason the model is safe.
 *
 * ## Progress, not position
 *
 * The obvious way to store where she is, is where she is. It is also wrong: her
 * lane is a course over water with corners in it, and a stored `{x, y}` drifts
 * off that course every time she is materialised, chased, and put back.
 *
 * So the record stores **how far along her passage she is** and **the day that
 * was true**, and her position is derived from those two numbers and the lane —
 * exactly as an expedition's is. Write-back projects her real position onto the
 * course and stores the fraction. She is therefore always on her own route, the
 * chart can draw her without her being afloat, and one number covers a passage
 * she is halfway through when the player last saw her a week ago.
 *
 * ## Why she is a merchantman
 *
 * A named warship would be a boss fight, which is a different game. A named
 * merchantman is a *target*: somebody's livelihood with a schedule, worth
 * intercepting because a house three hundred miles away will pay to see her
 * stopped. That is the commission this system exists for.
 */

import type { WorldState, RngState, Vec2 } from "../model/WorldState.ts";
import type { EntityState } from "../model/EntityState.ts";
import { entityId, factionId as makeFactionId, portId as makePortId } from "../model/ids.ts";
import { CITIES } from "../data/cities.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { shipName } from "../data/shipNames.ts";
import { tradeRoutes, type TradeRoute } from "./TradeRouteSystem.ts";
import { portFaction } from "./SiegeSystem.ts";
import { pointAlong, nearestWater, MATERIALIZE_RANGE } from "./ExpeditionFleetSystem.ts";
import { rngNextFloat } from "../services/RNG.ts";
import { tickBoundaryCrossed } from "./TimeSystem.ts";

/** How many named hulls the Caribbean carries. */
export const NAMED_SHIP_COUNT = 6;

/** Classes a house would put a name and a schedule on. */
const NAMED_CLASSES = ["fluyt", "merchantman", "galleon"];

/**
 * World units a named merchantman makes in a day.
 *
 * Not her class's top speed: a working trader loses days to harbours, weather
 * and convoy. 120 puts a 900-unit lane at seven or eight days each way, which
 * is long enough that a captain who is told where she sailed from has to make a
 * decision about where to wait, and short enough that the decision pays off
 * inside one commission's deadline.
 */
export const PASSAGE_SPEED = 120;

/** Same cadence as the expedition hulls — twice a second at 20 ticks. */
const NAMED_INTERVAL_TICKS = 40;

export type NamedShipFate = "sunk" | "taken";

export type NamedShip = {
  /** `named_<n>`. Stable for the life of the world. */
  id: string;
  name: string;
  /** Register she is on — this is who pays for her and who resents her loss. */
  crown: string;
  classId: string;
  /** The lane she works, and its two ends. */
  routeId: string;
  from: string;
  to: string;
  /**
   * Where she is on her round trip, in passages: 0..1 is `from`→`to`, 1..2 is
   * the way back. Wraps. See the module header for why this and not a position.
   */
  progress: number;
  /** The day `progress` was last true. */
  progressDay: number;
  /** Days one passage takes her, derived from the lane and `PASSAGE_SPEED`. */
  passageDays: number;
  /** Damage she carries between meetings, so a mauled ship stays mauled. */
  hullHp: number;
  sailsHp: number;
  /** Set once and never cleared; a ship on the bottom stays on the bottom. */
  fate?: NamedShipFate;
};

/** Every named hull the world knows about, afloat or not. */
export function namedShips(world: WorldState): NamedShip[] {
  return world.namedShips ?? [];
}

/** The ones still working. */
export function livingNamedShips(world: WorldState): NamedShip[] {
  return namedShips(world).filter(s => !s.fate);
}

export function namedShipById(world: WorldState, id: string): NamedShip | undefined {
  return namedShips(world).find(s => s.id === id);
}

/** The route record behind a named ship, or nothing if the lane network moved. */
export function laneOf(ship: NamedShip): TradeRoute | undefined {
  return tradeRoutes().find(r => r.id === ship.routeId);
}

/**
 * Her phase today: 0..2, wrapping, where 0..1 is outbound.
 *
 * A round trip is two passages plus nothing — she does not lie in harbour,
 * because a day alongside is a day the chart would have to explain and nobody
 * would enjoy reading.
 */
export function phaseAt(ship: NamedShip, day: number): number {
  const elapsed = (day - ship.progressDay) / Math.max(0.5, ship.passageDays);
  const raw = (ship.progress + elapsed) % 2;
  return raw < 0 ? raw + 2 : raw;
}

/** True when she is on the leg from `from` to `to` today. */
export function outbound(ship: NamedShip, day: number): boolean {
  return phaseAt(ship, day) < 1;
}

/** The harbour she is standing towards today. */
export function boundFor(ship: NamedShip, day: number): string {
  return outbound(ship, day) ? ship.to : ship.from;
}

/** Where the reckoning puts her today, or nothing if her lane is gone. */
export function namedShipPos(world: WorldState, ship: NamedShip): Vec2 | undefined {
  const lane = laneOf(ship);
  if (!lane || lane.path.length === 0) return undefined;
  const phase = phaseAt(ship, world.time.day);
  const fraction = phase < 1 ? phase : 2 - phase;
  return pointAlong(lane.path, fraction);
}

// ── Seeding ──────────────────────────────────────────────

/**
 * Put named hulls on the busiest lanes, once.
 *
 * Called from the daily tick rather than from world creation, and that is on
 * purpose: `namedShips` is an optional field, so a save from before this
 * release simply has none, and seeding here means such a save grows them on its
 * next morning instead of needing a migration step that does nothing but add an
 * empty array.
 *
 * The longest lanes are chosen because a long lane is one worth waiting on: a
 * ship that crosses forty units of water is never anywhere in particular.
 */
export function seedNamedShips(world: WorldState, rng: RngState): { world: WorldState; rng: RngState } {
  if (world.namedShips !== undefined) return { world, rng };

  const lanes = [...tradeRoutes()]
    .filter(r => CITIES[r.from] && CITIES[r.to])
    .sort((a, b) => b.length - a.length);

  const ships: NamedShip[] = [];
  const usedCrowns: Record<string, number> = {};
  let r = rng;

  for (const lane of lanes) {
    if (ships.length >= NAMED_SHIP_COUNT) break;
    // One per crown before any crown gets a second, so the informer always has
    // somebody else's ship to point at whichever tavern the captain is in.
    const crown = portFaction(world, lane.from) as string;
    if ((usedCrowns[crown] ?? 0) > Math.floor(ships.length / 4)) continue;
    if (ships.some(s => s.from === lane.from || s.to === lane.to)) continue;

    const roll = rngNextFloat(r, 0, 1);
    r = roll.state;
    const classId = NAMED_CLASSES[Math.floor(roll.value * NAMED_CLASSES.length)];
    const cls = SHIP_CLASSES[classId];
    if (!cls) continue;

    const start = rngNextFloat(r, 0, 2);
    r = start.state;

    usedCrowns[crown] = (usedCrowns[crown] ?? 0) + 1;
    ships.push({
      id: `named_${ships.length}`,
      name: shipName(crown, ships.length * 3 + Math.floor(start.value * 7)),
      crown,
      classId,
      routeId: lane.id,
      from: lane.from,
      to: lane.to,
      // Scattered round their circuits, or all six would sail on the same tide.
      progress: start.value,
      progressDay: world.time.day,
      passageDays: Math.max(2, Math.round(lane.length / PASSAGE_SPEED)),
      hullHp: cls.hullMax,
      sailsHp: cls.sailsMax,
    });
  }

  return { world: { ...world, namedShips: ships }, rng: r };
}

// ── On and off the chart ─────────────────────────────────

/** Her entity, if she is afloat. */
export function hullOf(world: WorldState, shipId: string): [string, EntityState] | undefined {
  for (const [id, e] of Object.entries(world.entities)) {
    if (e.ai?.namedShipId === shipId) return [id, e];
  }
  return undefined;
}

/** True when the player is close enough for her to be on the water. */
export function withinReach(world: WorldState, pos: Vec2): boolean {
  if (world.player.location.type === "port") return false;
  const player = world.entities[world.player.shipId as string]?.pos ?? world.player.location.pos;
  const dx = player.x - pos.x;
  const dy = player.y - pos.y;
  return dx * dx + dy * dy <= MATERIALIZE_RANGE * MATERIALIZE_RANGE;
}

function headingTowards(from: Vec2, to: Vec2): number {
  return Math.atan2(to.x - from.x, -(to.y - from.y));
}

/** Put her on the water at `pos`, carrying whatever damage she already had. */
export function materializeNamed(world: WorldState, ship: NamedShip, pos: Vec2): WorldState {
  const cls = SHIP_CLASSES[ship.classId];
  const lane = laneOf(ship);
  if (!cls || !lane) return world;

  const target = CITIES[boundFor(ship, world.time.day)];
  const heading = target ? headingTowards(pos, target.pos) : 0;
  const id = entityId(`named_${ship.id}`);

  return {
    ...world,
    entities: {
      ...world.entities,
      [id as string]: {
        id,
        kind: "ship",
        mode: "sailing",
        pos,
        vel: { x: 0, y: 0 },
        heading,
        sailLevel: 0.75,
        depthOffset: 0,
        ship: {
          classId: cls.id,
          factionId: makeFactionId(ship.crown),
          hullHp: ship.hullHp,
          hullMax: cls.hullMax,
          sailsHp: ship.sailsHp,
          sailsMax: cls.sailsMax,
          cannons: cls.cannons,
          // Her hold is filled by the ordinary lading rules when she is met;
          // what she is carrying is a property of the lane, not of her name.
          cargo: {},
          cargoCap: cls.cargoCap,
          crew: { current: Math.round(cls.crewMax * 0.8), max: cls.crewMax, morale: 0.75 },
        },
        ai: {
          behavior: "trader",
          state: "travel",
          targetPortId: makePortId(boundFor(ship, world.time.day)),
          aggression: 0.05,
          awarenessRadius: 200,
          namedShipId: ship.id,
        },
      },
    },
  };
}

/**
 * The point on her course nearest a position, as a fraction of the course.
 *
 * Used only on write-back. Projecting rather than measuring from the ends is
 * what keeps a ship that has been chased two hundred units off her track from
 * jumping when she is put back on the chart — she resumes from the part of the
 * passage she had actually reached.
 */
export function projectOnPath(path: Vec2[], p: Vec2): number {
  if (path.length < 2) return 0;
  let travelled = 0;
  let total = 0;
  let best = { dist: Infinity, at: 0 };

  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const leg = Math.hypot(dx, dy);
    total += leg;
    if (leg <= 0) continue;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (leg * leg)));
    const qx = a.x + dx * t;
    const qy = a.y + dy * t;
    const d = Math.hypot(p.x - qx, p.y - qy);
    if (d < best.dist) best = { dist: d, at: travelled + leg * t };
    travelled += leg;
  }

  return total > 0 ? best.at / total : 0;
}

/**
 * Write her entity back into her record.
 *
 * The single rule that makes the whole model safe, and the same one
 * `ExpeditionFleetSystem` runs on: this happens **before** anything is removed
 * from the chart, so a fight the player broke off is remembered rather than
 * healed by her going over the horizon.
 */
export function writeBackNamed(world: WorldState, ship: NamedShip): WorldState {
  const found = hullOf(world, ship.id);
  const lane = laneOf(ship);
  if (!found || !lane) return world;
  const [, entity] = found;

  const fraction = projectOnPath(lane.path, entity.pos);
  // Which leg she is on is a property of the schedule, not of the projection —
  // the same point of water is one fraction outbound and its mirror coming home.
  const phase = phaseAt(ship, world.time.day);
  const progress = phase < 1 ? fraction : 2 - fraction;

  return {
    ...world,
    namedShips: namedShips(world).map(s => s.id !== ship.id ? s : {
      ...s,
      progress,
      progressDay: world.time.day,
      hullHp: entity.ship?.hullHp ?? s.hullHp,
      sailsHp: entity.ship?.sailsHp ?? s.sailsHp,
    }),
  };
}

/** Take her off the chart. Call `writeBackNamed` first, always. */
export function dematerializeNamed(world: WorldState, shipId: string): WorldState {
  const found = hullOf(world, shipId);
  if (!found) return world;
  const entities = { ...world.entities };
  delete entities[found[0]];
  return { ...world, entities };
}

// ── The end of her ───────────────────────────────────────

/** The flag her loss stamps. Whatever is hunting her hangs off this. */
export function namedShipFateFlag(shipId: string): string {
  return "named_gone_" + shipId;
}

/**
 * Record that a named ship has been sunk or taken.
 *
 * Called from the battle scene in the same breath as `applyPrize`, and for the
 * same reason: both read the enemy off the world, so both have to run before
 * she is removed from it. Returns the world unchanged for any other hull, which
 * is what lets the call site be one unconditional line.
 */
export function settleNamedShip(
  world: WorldState,
  entity: EntityState | undefined,
  fate: NamedShipFate,
): WorldState {
  const shipId = entity?.ai?.namedShipId;
  if (!shipId) return world;
  const ship = namedShipById(world, shipId);
  if (!ship || ship.fate) return world;

  return {
    ...world,
    namedShips: namedShips(world).map(s => s.id === shipId ? { ...s, fate } : s),
    worldFlags: { ...world.worldFlags, [namedShipFateFlag(shipId)]: true },
  };
}

// ── The tick ─────────────────────────────────────────────

/**
 * Reconcile every named hull with what is on the chart.
 *
 * Order is fixed and matters, exactly as it does for the expedition hulls:
 * write back what is afloat, then decide whether it should still be afloat.
 * Doing it the other way round loses whatever the player had just done to her.
 */
export function tickNamedShips(world: WorldState, dtTicks: number): WorldState {
  const tick = world.time.tick;
  if (!tickBoundaryCrossed(tick - dtTicks, tick, NAMED_INTERVAL_TICKS)) return world;

  const seeded = seedNamedShips(world, world.rng);
  let w = seeded.world;
  if (seeded.rng !== world.rng) w = { ...w, rng: seeded.rng };

  for (const ship of namedShips(w)) {
    const afloat = hullOf(w, ship.id) !== undefined;

    // A ship that has been sunk or taken is a record, not a hull. She is left
    // in the list so that whatever was hunting her can still read her name.
    if (ship.fate) {
      if (afloat) w = dematerializeNamed(w, ship.id);
      continue;
    }

    if (afloat) w = writeBackNamed(w, ship);
    const current = namedShipById(w, ship.id);
    if (!current) continue;

    const ideal = namedShipPos(w, current);
    if (!ideal) continue;
    const pos = nearestWater(ideal);
    const near = withinReach(w, ideal) && pos !== undefined;

    if (near && !afloat && pos) {
      w = materializeNamed(w, current, pos);
    } else if (!near && afloat) {
      w = dematerializeNamed(w, current.id);
    }
  }

  return w;
}
