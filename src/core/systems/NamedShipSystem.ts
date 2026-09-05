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
 *
 * ## She finds out (v0.34.0)
 *
 * Through v0.33.0 she worked her run no matter what happened to her. A captain
 * who fought her convoy and broke off found her a week later exactly where the
 * chart said she would be, which quietly made the reckoning a tracker after
 * all: nothing in the world was capable of contradicting it.
 *
 * Now a fight she survives is remembered as an *unanswered scare*, and she
 * answers them **in harbour**, because harbour is the only place a merchantman
 * can do anything about anybody. She lies alongside longer than her schedule
 * says (`layingOver`), she takes on a consort if her house can spare one, and
 * after a second scare she works a different lane out of that port altogether.
 * Then the count is spent: she has done what she can, and making her do it
 * again costs the captain another engagement.
 *
 * None of it touches his chart, and that is the point. The mark is still the
 * reckoning from the last thing he was told; it has simply become capable of
 * being wrong. The counter-play is the three sources it always was — a tavern
 * in earshot will say she is lying at Havana, and reading that redraws the run.
 *
 * ## She runs (v0.35.0)
 *
 * v0.34.0 gave her an answer she could only give in harbour. Met at sea she
 * still stood on, straight at whatever was closing on her, because a named
 * merchantman is a `behavior: "trader"` hull and a trader steers for its
 * destination and nothing else.
 *
 * Now she bolts — for **one of the two ends of her own passage**, whichever she
 * has the better head start to, and that choice is the whole of the mechanic.
 * Both ends are on her lane, so a chase never puts her record out of step with
 * her; and cutting her off from the near refuge is a *decision the player makes
 * with his ship's position*, not a die roll.
 *
 * Reaching it (`SHELTER_RANGE`) is an escape: she is stamped as having made
 * that harbour, kept in for `SHELTER_LAYOVER` days, and taken off the chart.
 * A chase he loses therefore costs him the ship *and* puts his reckoning wrong,
 * which is v0.34.0's currency.
 *
 * Being chased is deliberately **not** a scare. A fight is what teaches her
 * something; a chase she won taught her nothing she did not already know, and
 * escalating on it would let a player who never lands a shot drive her convoy
 * up and her schedule to pieces.
 */

import type { WorldState, RngState, Vec2 } from "../model/WorldState.ts";
import type { WorldEvent } from "../model/Events.ts";
import type { EntityState } from "../model/EntityState.ts";
import { entityId, factionId as makeFactionId, portId as makePortId } from "../model/ids.ts";
import { CITIES } from "../data/cities.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { shipName } from "../data/shipNames.ts";
import { tradeRoutes, type TradeRoute } from "./TradeRouteSystem.ts";
import { portFaction } from "./SiegeSystem.ts";
import { pointAlong, nearestWater, MATERIALIZE_RANGE } from "./ExpeditionFleetSystem.ts";
import { getPortWaterPos } from "./PortWaterPositions.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { t } from "../i18n/index.ts";
import { rngNextFloat } from "../services/RNG.ts";
import { tickBoundaryCrossed } from "./TimeSystem.ts";

/** How many named hulls the Caribbean carries. */
export const NAMED_SHIP_COUNT = 6;

/** Classes a house would put a name and a schedule on. */
const NAMED_CLASSES = ["fluyt", "merchantman", "galleon"];

/**
 * How many hulls sail in company with her, by what she is worth (v0.33.0).
 *
 * v0.32.0 made the hunt a navigation problem — work out which end of the
 * passage to sit on — and stopped there, so catching her was the whole of it
 * and a lone merchantman was no fight at all. A convoy on the richest of them
 * is the other half of the problem: the galleon is worth the most gold and
 * cannot be taken by a sloop, and the fluyt is worth least and can.
 *
 * Two is deliberately the ceiling. Three escorts is not a harder decision than
 * two, it is simply a battle the player declines.
 */
const ESCORTS_BY_CLASS: Record<string, number> = {
  fluyt: 0,
  merchantman: 1,
  galleon: 2,
};

/** Classes a crown puts on convoy duty. */
const ESCORT_CLASSES = ["brigantine", "frigate"];

/**
 * Hulls in company with her, ceiling (v0.34.0).
 *
 * The same two v0.33.0 gave the galleon, and for the same reason: a third
 * escort is not a harder decision, it is a battle the player declines. So a
 * scare buys a fluyt her first consort and a merchantman her second, and buys
 * the galleon — already at the ceiling — nothing but a later sailing and a new
 * run. Her answer to being hunted is deliberately allowed to be *no answer* on
 * the one axis where more of it would break the commission.
 */
export const ESCORT_MAX = 2;

/**
 * Days she lies alongside per unanswered scare, and the most she will.
 *
 * Two days is roughly a quarter of a leg on a middling lane — a couple of
 * hundred units of water. Enough that a captain sitting exactly where his
 * reckoning says finds empty sea, and not so much that the mark on his chart
 * stops being worth drawing. Six is the ceiling because past a third of her
 * circuit she is not late any more, she is missing.
 */
export const LAYOVER_PER_SCARE = 2;
export const LAYOVER_MAX = 6;

/**
 * Scares before her house changes her run entirely.
 *
 * Two, not one, and the difference matters. Rerouting is the harshest thing she
 * does — it makes the drawn lane wrong, not merely the mark on it — and it
 * should cost the captain a real engagement rather than one exchange of fire.
 * Two scares inside a single passage means he pressed her: fought her escort
 * and then her, or fought her and came back for a second attempt.
 */
export const REROUTE_AFTER_SCARES = 2;

/**
 * How near the harbour she is running for counts as being under its guns
 * (v0.35.0).
 *
 * Ninety units against an encounter range of eighteen: he has to be genuinely
 * alongside to stop her, and a stern chase that closes slowly runs out of sea
 * rather than ending in a boarding. That is the shape a chase should have.
 */
export const SHELTER_RANGE = 90;

/**
 * Days she stays in after running from somebody, when she was never fought.
 *
 * A flat two, and it is not `answerHarrying`'s layover — a ship that has been
 * chased has not been *taught* anything (see the module header), so she does not
 * take on a consort or change her run over it. She simply does not put to sea
 * again the same afternoon, which is enough to make his chart wrong.
 */
export const SHELTER_LAYOVER = 2;

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
  /**
   * Hulls sailing in company with her (v0.33.0), and the ledger of them.
   *
   * Recomputed from what is afloat on write-back and never decremented
   * anywhere else — the same rule `ExpeditionFleetSystem.syncLedger` runs on,
   * and for the same reason: a squadron the player has half destroyed has to be
   * counted by what is left rather than by what somebody remembered to subtract.
   *
   * Optional and read through `escortCount()`: a save written by v0.32.0 has
   * named ships and no convoys, and reads as sailing alone rather than needing
   * a migration step.
   */
  escorts?: number;
  /**
   * Fights she has survived and not yet answered (v0.34.0).
   *
   * Counted up by `harryNamedShip` when an engagement ends with her still
   * afloat, spent to nothing by `answerHarrying` the next time she makes
   * harbour. A count of *outstanding* scares rather than a career total,
   * because what it buys — a longer stay alongside, a consort, a new lane — is
   * something she does once and is then done with.
   *
   * Optional, like everything else added to this record after it shipped: a
   * save from v0.32.0 or v0.33.0 reads as a ship nobody has troubled.
   */
  harried?: number;
  /** Set once and never cleared; a ship on the bottom stays on the bottom. */
  fate?: NamedShipFate;
};

/** Hulls in company with her, defaulting a v0.32.0 save to sailing alone. */
export function escortCount(ship: NamedShip): number {
  return Math.max(0, ship.escorts ?? 0);
}

/** Fights she has survived and not yet done anything about (v0.34.0). */
export function harryCount(ship: NamedShip): number {
  return Math.max(0, ship.harried ?? 0);
}

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
  // Clamped at nought, and that one `max` is the whole of the layover (v0.34.0):
  // a record whose `progressDay` is in the future is a ship still alongside, and
  // her phase stays exactly where the harbour left it until the day comes round.
  // No second field, no migration, and every read of her position gets it free.
  const elapsed = Math.max(0, day - ship.progressDay) / Math.max(0.5, ship.passageDays);
  const raw = (ship.progress + elapsed) % 2;
  return raw < 0 ? raw + 2 : raw;
}

/** True while she is still alongside and her schedule has not started again. */
export function layingOver(ship: NamedShip, day: number): boolean {
  return day < ship.progressDay;
}

/** The harbour she is lying in, if she is lying in one. */
export function lyingAt(ship: NamedShip, day: number): string | undefined {
  if (!layingOver(ship, day)) return undefined;
  return ship.progress < 1 ? ship.from : ship.to;
}

/**
 * The day she makes the harbour she is standing towards.
 *
 * Derived from the record rather than stamped, like everything else about her
 * schedule: the fraction of the leg she has left, times the days a leg takes.
 * Fractional on purpose — rounding her arrival to a whole day would shave hours
 * off every circuit and walk her schedule away from the one the informer sold.
 */
export function arrivalDay(ship: NamedShip): number {
  const legLeft = 1 - (ship.progress % 1);
  return ship.progressDay + legLeft * Math.max(0.5, ship.passageDays);
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
      escorts: ESCORTS_BY_CLASS[classId] ?? 0,
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

/** Hulls sailing in company with her, if any are afloat. */
export function escortsOf(world: WorldState, shipId: string): [string, EntityState][] {
  const out: [string, EntityState][] = [];
  for (const [id, e] of Object.entries(world.entities)) {
    if (e.ai?.namedEscortOf === shipId) out.push([id, e]);
  }
  return out;
}

/** Screen-space spacing of a convoy, in world units. */
const ESCORT_SPACING = 46;

/**
 * Put her on the water at `pos`, carrying whatever damage she already had, with
 * however much of her convoy is still with her.
 *
 * The escorts are anonymous on purpose: they are a squadron, not characters,
 * and a crown replaces a lost escort without anybody writing a name down. What
 * persists is *how many*, in her record.
 */
export function materializeNamed(world: WorldState, ship: NamedShip, pos: Vec2): WorldState {
  const cls = SHIP_CLASSES[ship.classId];
  const lane = laneOf(ship);
  if (!cls || !lane) return world;

  const target = CITIES[boundFor(ship, world.time.day)];
  const heading = target ? headingTowards(pos, target.pos) : 0;
  const id = entityId(`named_${ship.id}`);

  // Abeam of her course, so the convoy spreads across it rather than along it.
  const sideX = Math.cos(heading);
  const sideY = Math.sin(heading);
  const escorts: Record<string, EntityState> = {};
  for (let i = 0; i < escortCount(ship); i++) {
    const escortClass = SHIP_CLASSES[ESCORT_CLASSES[i % ESCORT_CLASSES.length]];
    if (!escortClass) continue;
    const offset = (i === 0 ? 1 : -1) * ESCORT_SPACING;
    const at = nearestWater({ x: pos.x + sideX * offset, y: pos.y + sideY * offset });
    if (!at) continue;
    const eid = entityId(`namedesc_${ship.id}_${i}`);
    escorts[eid as string] = {
      id: eid,
      kind: "ship",
      mode: "sailing",
      pos: at,
      vel: { x: 0, y: 0 },
      heading,
      sailLevel: 0.75,
      depthOffset: 0,
      ship: {
        classId: escortClass.id,
        factionId: makeFactionId(ship.crown),
        hullHp: escortClass.hullMax,
        hullMax: escortClass.hullMax,
        sailsHp: escortClass.sailsMax,
        sailsMax: escortClass.sailsMax,
        cannons: escortClass.cannons,
        cargo: {},
        cargoCap: escortClass.cargoCap,
        crew: { current: Math.round(escortClass.crewMax * 0.85), max: escortClass.crewMax, morale: 0.8 },
      },
      ai: {
        // A warship on convoy duty closes on anybody who closes on her charge.
        behavior: "navy",
        state: "travel",
        targetPortId: makePortId(boundFor(ship, world.time.day)),
        aggression: 0.8,
        awarenessRadius: 280,
        namedEscortOf: ship.id,
      },
    };
  }

  return {
    ...world,
    entities: {
      ...world.entities,
      ...escorts,
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
      // Counted from what is afloat, never decremented — an escort the player
      // sank an hour ago is simply not here to be counted.
      escorts: escortsOf(world, ship.id).length,
    }),
  };
}

/** Take her and her convoy off the chart. Call `writeBackNamed` first, always. */
export function dematerializeNamed(world: WorldState, shipId: string): WorldState {
  const found = hullOf(world, shipId);
  const escorts = escortsOf(world, shipId);
  if (!found && escorts.length === 0) return world;
  const entities = { ...world.entities };
  if (found) delete entities[found[0]];
  for (const [id] of escorts) delete entities[id];
  return { ...world, entities };
}

// ── What he has been told ────────────────────────────────

/**
 * How long a sighting is worth pencilling on a chart (v0.33.0).
 *
 * Three weeks. Her circuit is a fortnight on a middling lane, so a report older
 * than this has her somewhere on the whole run with equal probability and the
 * mark would be decoration rather than information.
 */
export const REPORT_LIFE_DAYS = 21;

export type NamedShipReport = {
  /** The day he was told. Staleness and the fading of the mark hang off this. */
  day: number;
  /** The phase she was at that day. */
  progress: number;
  /**
   * The run the report was about, and how long a leg of it took (v0.34.0).
   *
   * Carried because she can change her lane now, and when she does, the chart
   * must go on drawing the one he was told about. A mark walking along a course
   * she has abandoned is exactly the kind of wrong a paper chart is: it is not
   * the world lying to him, it is his own information going out of date, and
   * the moment somebody tells him otherwise it is corrected.
   *
   * Optional, so a report written by v0.33.0 falls back on her current lane —
   * which is what it meant when it was written.
   */
  routeId?: string;
  passageDays?: number;
  /**
   * When she was said to be sailing again, if the report caught her alongside.
   *
   * Without it the reckoning would walk her out of a harbour she is still tied
   * up in, and a tavern that has just said "she is lying at Havana" would be
   * contradicted by the chart on the same screen.
   */
  holdUntil?: number;
};

export function namedReports(world: WorldState): Record<string, NamedShipReport> {
  return world.namedShipReports ?? {};
}

/**
 * Write down where she was today, because somebody has just said so.
 *
 * A *report*, not a position: what goes on the chart is the phase she was at on
 * the day he heard it, and today's mark is that phase walked forward by the
 * days since. He is doing the reckoning the informer would have done, with the
 * same information and the same chance of being wrong — she may have been taken
 * by somebody else, or held up, or he may simply have mis-added.
 *
 * This is why the chart does not draw her live. A marker that moved with her
 * would turn an interception into following an arrow, and the whole content of
 * the commission is the guess about which end of the passage to sit on.
 */
export function reportNamedShip(world: WorldState, shipId: string): WorldState {
  const ship = namedShipById(world, shipId);
  if (!ship || ship.fate) return world;
  return {
    ...world,
    namedShipReports: {
      ...namedReports(world),
      [shipId]: {
        day: world.time.day,
        progress: phaseAt(ship, world.time.day),
        // What he is told is her *book*, not just her whereabouts: which run
        // she is working and how long she takes over a leg of it. That is what
        // lets the mark keep walking a lane she has since abandoned (v0.34.0).
        routeId: ship.routeId,
        passageDays: ship.passageDays,
        ...(layingOver(ship, world.time.day) ? { holdUntil: ship.progressDay } : {}),
      },
    },
  };
}

/** The reports still worth anything, newest first. */
export function livingReports(world: WorldState): { ship: NamedShip; report: NamedShipReport }[] {
  const out: { ship: NamedShip; report: NamedShipReport }[] = [];
  for (const [id, report] of Object.entries(namedReports(world))) {
    if (world.time.day - report.day > REPORT_LIFE_DAYS) continue;
    const ship = namedShipById(world, id);
    if (!ship || ship.fate) continue;
    out.push({ ship, report });
  }
  out.sort((a, b) => b.report.day - a.report.day);
  return out;
}

/**
 * Where his reckoning puts her today, from a report — not where she is.
 *
 * The two agree exactly while nothing has interfered with her, and that is the
 * point: the chart is only ever as good as the last thing he was told, and
 * every hour he spends elsewhere is an hour it could have gone wrong.
 */
export function reckonedPos(world: WorldState, ship: NamedShip, report: NamedShipReport): Vec2 | undefined {
  const lane = reportedLane(ship, report);
  if (!lane || lane.path.length === 0) return undefined;
  // His arithmetic, on his information: her schedule as he was given it, from
  // the day she was said to be sailing again rather than from the day he heard.
  const days = Math.max(0.5, report.passageDays ?? ship.passageDays);
  const from = Math.max(report.day, report.holdUntil ?? report.day);
  const elapsed = Math.max(0, world.time.day - from) / days;
  const raw = (report.progress + elapsed) % 2;
  const phase = raw < 0 ? raw + 2 : raw;
  return pointAlong(lane.path, phase < 1 ? phase : 2 - phase);
}

/**
 * The run a report described, which is not always the run she is on (v0.34.0).
 *
 * Everything drawn on the chart goes through here rather than through
 * `laneOf`, so that a ship who has changed her lane since he last heard of her
 * leaves his pencil marks where he made them.
 */
export function reportedLane(ship: NamedShip, report: NamedShipReport): TradeRoute | undefined {
  if (report.routeId) {
    const lane = tradeRoutes().find(r => r.id === report.routeId);
    if (lane) return lane;
  }
  return laneOf(ship);
}

// ── She finds out ────────────────────────────────────

/**
 * Remember that she was in a fight and came out of it (v0.34.0).
 *
 * Called from the battle scene in the same breath as `settleNamedShip`, and the
 * two are exclusive by construction: one records the end of her, the other that
 * there was no end of her. `hullSurvived` is what tells them apart, and it is
 * only consulted for her own hull — an engagement with one of her escorts is a
 * scare for her whoever won it, because whatever else happened, somebody came
 * out of the dark at her convoy.
 *
 * Returns the world unchanged for any other hull, which is what lets the call
 * site be one unconditional line.
 */
export function harryNamedShip(
  world: WorldState,
  entity: EntityState | undefined,
  hullSurvived: boolean,
): WorldState {
  const own = entity?.ai?.namedShipId;
  const escorted = entity?.ai?.namedEscortOf;
  const shipId = escorted ?? (hullSurvived ? own : undefined);
  if (!shipId) return world;
  const ship = namedShipById(world, shipId);
  if (!ship || ship.fate) return world;

  return {
    ...world,
    namedShips: namedShips(world).map(s =>
      s.id !== shipId ? s : { ...s, harried: harryCount(s) + 1 }),
  };
}

/**
 * A different lane out of the harbour she is lying in.
 *
 * Only lanes that *start* here are candidates, because her record's `progress`
 * is measured from `from` and a course walked backwards would put her at the
 * wrong end of her own passage. Where no such lane exists — a town nobody ships
 * out of — she keeps the run she has, which reads correctly: she had nowhere
 * else to go.
 */
function rerouteFrom(ship: NamedShip, port: string, rng: RngState): { ship: NamedShip; rng: RngState } {
  const options = tradeRoutes().filter(r =>
    r.from === port && r.id !== ship.routeId && CITIES[r.to] && r.length > 0);
  if (options.length === 0) return { ship, rng };

  const roll = rngNextFloat(rng, 0, 1);
  // `Math.floor(value * length)`, never `% length` — `rngNextFloat` returns a
  // fraction and modulo on it hands back an index like 0.37.
  const lane = options[Math.floor(roll.value * options.length)];
  return {
    ship: {
      ...ship,
      routeId: lane.id,
      from: lane.from,
      to: lane.to,
      passageDays: Math.max(2, Math.round(lane.length / PASSAGE_SPEED)),
    },
    rng: roll.state,
  };
}

/**
 * What she does about it, done in harbour, once (v0.34.0).
 *
 * Three answers in escalation, all of them things a merchant house would
 * actually do and none of them things the player can see happen:
 *
 * - **she sails late** — `LAYOVER_PER_SCARE` days per outstanding scare, which
 *   is what puts the captain's reckoning ahead of her;
 * - **she takes on a consort** — up to `ESCORT_MAX`, so a fluyt that has been
 *   jumped is no longer the easy one;
 * - **she changes her run** — from the second scare, which is the only one of
 *   the three that makes the *drawn lane* wrong rather than the mark on it.
 *
 * Then the count is spent. She has answered; making her answer again costs
 * another engagement. Returning the record unchanged for a ship nobody has
 * troubled is deliberate — the settled world must be bit-for-bit what it was
 * before this release, and it is.
 */
export function answerHarrying(
  ship: NamedShip,
  arrived: number,
  rng: RngState,
  /**
   * The end she made, when the caller already knows (v0.35.0).
   *
   * The harbour call on the tick does not: it infers the end from the leg she
   * was on, because she got there by sailing her schedule. A ship who **ran**
   * for one of her two harbours knows exactly which, and the record it hands in
   * has already been stamped — inferring from that stamp would read her arrival
   * at `to` as an arrival at `from` and turn her circuit inside out.
   */
  at?: "from" | "to",
): { ship: NamedShip; rng: RngState } {
  const scares = harryCount(ship);
  if (scares <= 0) return { ship, rng };

  // Which end she has just made, and therefore which phase she resumes from:
  // outbound she is at `to` and starts back at 1, homeward she is at `from`
  // and starts out again at 0.
  const outboundLeg = at ? at === "to" : ship.progress < 1;
  const port = outboundLeg ? ship.to : ship.from;

  const layover = Math.min(LAYOVER_MAX, LAYOVER_PER_SCARE * scares);
  let answered: NamedShip = {
    ...ship,
    progress: outboundLeg ? 1 : 0,
    progressDay: arrived + layover,
    escorts: Math.min(ESCORT_MAX, escortCount(ship) + 1),
    harried: 0,
  };
  let r = rng;

  if (scares >= REROUTE_AFTER_SCARES) {
    const rerouted = rerouteFrom(answered, port, r);
    r = rerouted.rng;
    // A new lane is walked from its own beginning, and its beginning is here.
    answered = rerouted.ship.routeId === answered.routeId
      ? rerouted.ship
      : { ...rerouted.ship, progress: 0 };
  }

  return { ship: answered, rng: r };
}

/**
 * Which end of her own passage she runs for (v0.35.0).
 *
 * Both ends, and only her own two ends, because they are the two points on the
 * water where her record and her position are the same thing. A merchantman who
 * bolted for the nearest friendly harbour would arrive somewhere her schedule
 * has never heard of, and `progress` would be a lie from that moment on.
 *
 * The score is a race: how much of a head start she has on him to that refuge
 * (`dist(refuge, him) − dist(refuge, her)`). It reads exactly as it should —
 * she runs from him, and she runs *towards* the shorter of her two remaining
 * passages, and putting the player between her and the near end is what forces
 * her onto the long one.
 */
export function boltFor(ship: NamedShip, her: Vec2, threat: Vec2): "from" | "to" | undefined {
  const lane = laneOf(ship);
  if (!lane || lane.path.length === 0) return undefined;

  const ends: ["from" | "to", Vec2][] = [
    ["from", lane.path[0]],
    ["to", lane.path[lane.path.length - 1]],
  ];

  let best: { end: "from" | "to"; lead: number } | undefined;
  for (const [end, at] of ends) {
    const lead = Math.hypot(at.x - threat.x, at.y - threat.y)
      - Math.hypot(at.x - her.x, at.y - her.y);
    if (!best || lead > best.lead) best = { end, lead };
  }
  return best?.end;
}

/**
 * She has got in. Stamp the arrival, keep her in, take her off the chart.
 *
 * The arrival is stamped at the **end of the leg she ran for**, so a chase
 * leaves her schedule coherent: she made that harbour, early, and the rest of
 * her circuit runs from there. Any scares she is carrying are answered here in
 * the ordinary way — she is in harbour, which is the only place she answers
 * anything — and a ship who was merely chased gets `SHELTER_LAYOVER` instead.
 */
export function makeShelter(
  world: WorldState,
  ship: NamedShip,
  end: "from" | "to",
  rng: RngState,
): { world: WorldState; rng: RngState } {
  const arrived = world.time.day;
  const landed: NamedShip = { ...ship, progress: end === "to" ? 1 : 0, progressDay: arrived };

  const answered = harryCount(landed) > 0
    ? answerHarrying(landed, arrived, rng, end)
    : { ship: { ...landed, progressDay: arrived + SHELTER_LAYOVER }, rng };

  const w = {
    ...world,
    namedShips: namedShips(world).map(x => x.id === ship.id ? answered.ship : x),
  };
  return { world: dematerializeNamed(w, ship.id), rng: answered.rng };
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

  // Her report goes with her: a mark on the chart for a ship on the bottom is
  // the one kind of stale information the captain cannot correct by waiting.
  const reports = { ...namedReports(world) };
  delete reports[shipId];

  return {
    ...world,
    namedShips: namedShips(world).map(s => s.id === shipId ? { ...s, fate } : s),
    namedShipReports: reports,
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
 *
 * Between those two steps sits the harbour call (v0.34.0), and it sits there
 * because it is the one moment a ship the player cannot see changes her mind.
 * It does nothing at all to a ship nobody has troubled, which is what keeps a
 * world with no hunting in it identical to the world v0.33.0 ticked.
 */
export function tickNamedShips(
  world: WorldState,
  dtTicks: number,
): { world: WorldState; events: WorldEvent[] } {
  const tick = world.time.tick;
  const events: WorldEvent[] = [];
  if (!tickBoundaryCrossed(tick - dtTicks, tick, NAMED_INTERVAL_TICKS)) return { world, events };

  const seeded = seedNamedShips(world, world.rng);
  let w = seeded.world;
  if (seeded.rng !== world.rng) w = { ...w, rng: seeded.rng };

  for (const ship of namedShips(w)) {
    // Her own hull decides whether she is on the chart; the convoy follows it.
    // A ship whose escorts are afloat but whose own hull is not has been sunk,
    // and `settleNamedShip` has already said so.
    const afloat = hullOf(w, ship.id) !== undefined;

    // A ship that has been sunk or taken is a record, not a hull. She is left
    // in the list so that whatever was hunting her can still read her name.
    if (ship.fate) {
      if (afloat) w = dematerializeNamed(w, ship.id);
      continue;
    }

    if (afloat) w = writeBackNamed(w, ship);
    let current = namedShipById(w, ship.id);
    if (!current) continue;

    // She has run for one end of her own passage and got there (v0.35.0). The
    // chase is over and he has lost her: she is stamped as having made that
    // harbour — early, but at a point her schedule knows — kept in, and taken
    // off the chart. The toast exists because a ship that simply vanished off
    // his bow reads as a bug rather than as an escape.
    const hull = afloat ? hullOf(w, current.id) : undefined;
    const bolting = hull?.[1].ai?.state === "flee" ? hull[1].ai?.targetPortId as string | undefined : undefined;
    if (hull && bolting && (bolting === current.from || bolting === current.to)) {
      const haven = getPortWaterPos(bolting);
      if (Math.hypot(hull[1].pos.x - haven.x, hull[1].pos.y - haven.y) <= SHELTER_RANGE) {
        const got = makeShelter(w, current, bolting === current.to ? "to" : "from", w.rng);
        w = { ...got.world, rng: got.rng };
        const where = CITIES[bolting]?.name ?? bolting;
        w = addLogEntry(w, "named.log_escaped", { ship: current.name, port: where });
        events.push({ type: "Toast", message: t("named.escaped", { ship: current.name, port: where }) });
        continue;
      }
    }

    // She has made harbour with a fight behind her, and harbour is where she
    // does something about it. Only while she is off the chart: a ship under
    // the player's guns has not tied up anywhere, and her write-back keeps
    // moving her arrival ahead of the clock for exactly as long as he is there.
    if (!afloat && harryCount(current) > 0 && w.time.day >= arrivalDay(current)) {
      const answered = answerHarrying(current, arrivalDay(current), w.rng);
      current = answered.ship;
      w = {
        ...w,
        rng: answered.rng,
        namedShips: namedShips(w).map(x => x.id === current!.id ? current! : x),
      };
    }

    // Alongside is not on the water. A captain who sits where his reckoning
    // says finds nothing, because she has not sailed yet — and the tavern in
    // the next town is the thing that can tell him so.
    if (layingOver(current, w.time.day)) {
      if (afloat) w = dematerializeNamed(w, current.id);
      continue;
    }

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

  return { world: w, events };
}
