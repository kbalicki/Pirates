/**
 * PredationSystem — the sea has other quarrels than yours.
 *
 * Until v0.50.0 every hull on the water was steering by exactly one question:
 * where is the player. A rover lay off a wealthy harbour and **loitered** while
 * a laden merchantman crossed her bow at eighty units; a pirate hunter patrolled
 * from port to port past the rover; a navy frigate ignored both. `NpcAiSystem`
 * says so itself, of the one line that reads another ship's state at all: "it is
 * the only thing in this file that reads another ship's state to decide its
 * own."
 *
 * Three things were lying there dead, and together they are one mechanic:
 *
 *   | What | State before |
 *   |---|---|
 *   | `AiData.aggression` | rolled for every hull from the behaviour table (trader 0-0.1, navy 0.3-0.7, pirate 0.6-1.0, hunter 0.5-0.9) and **read by nothing** |
 *   | `AiData.targetEntityId` | declared on the record, **never written and never read** |
 *   | the whole `pirate` behaviour | `pickBehavior` returns it only for a port whose crown is `pirates`, and **no port starts pirate**, so `updatePirate`'s sixty lines never ran |
 *
 * The third is the one that makes the other two unreachable. Measured on a
 * fresh world, 200 samples over 4000 ticks: 22.3 hulls afloat, 58.8% navy,
 * 31.9% trader, 9.3% pirate hunter — and **not one pirate**. Two hunters are
 * permanently on patrol looking for a species the game never puts on the water.
 *
 * ## Where a rover fits out
 *
 * From an **outpost**, and the data already names the right harbours: of the 45
 * towns, 18 are `type: "outpost"` — a quay with no fort and a governor a long
 * way off — and they include Tortuga, Petit Goave, Port-de-Paix, Leogane, Santa
 * Catalina and the Bahamas. Nothing had to be invented or hand-listed; the same
 * discipline as deriving the trade lanes from the coastline.
 *
 * And from a town under the black flag, which needs the other half of this
 * release: `NpcSpawnSystem` read `PortDef.factionId` — the map as it stood in
 * 1680 — rather than `portFaction`, so a colony the player had taken went on
 * sending out its old crown's merchantmen for ever. That is the project's own
 * documented rule, broken in the one file where it is most visible.
 *
 * ## Why it does not turn the sea into a brawl
 *
 * Measured before any of this was written, using navy hulls as a stand-in for
 * where a lurking rover would be: **a rover has a laden trader inside her chase
 * radius 54% of the time** (mean 0.88 targets). That is frequent enough to be
 * worth watching and far short of saturating — and it is throttled twice more:
 * by how few rovers are afloat, and by `aggression`, which finally decides
 * something. A hull only leaves her business for a target she likes the look
 * of, and `PREY_ODDS` scales that by how much bigger she is.
 */

import type { Vec2 } from "../model/WorldState.ts";
import type { EntityState } from "../model/EntityState.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { vec2Dist } from "../services/Geometry.ts";

/** How far a hull will look for somebody else's quarrel, as a share of her awareness. */
export const PREY_REACH = 1.0;

/** Closer than this and the two are alongside: the hunt resolves. */
export const PREY_STRIKE_RANGE = 34;

/**
 * Aggression a hull needs before she will leave her voyage for a target.
 *
 * Below it she has seen the prize and decided her cargo, or her orders, are
 * worth more. Traders roll 0-0.1 and never pass; navy rolls 0.3-0.7 and passes
 * about half the time; a rover rolls 0.6-1.0 and always does. That is the
 * table doing its job for the first time since it was written.
 */
export const PREY_AGGRESSION_FLOOR = 0.35;

/** Guns a hull must have over her target before she likes the odds at all. */
export const PREY_ODDS = 0.7;

/** What a ship is worth defending herself with when she has no stomach for it. */
export const DEFENCE_FLOOR = 0.35;

export type PreyKind = "plunder" | "police";

/**
 * What one hull wants with another, or nothing.
 *
 * Deliberately a pure function of the two behaviours and the two crowns rather
 * than a table of factions: the point is that a rover wants **cargo** and a
 * hunter wants **rovers**, and a man-of-war wants whoever her crown is fighting.
 */
export function preyKind(
  hunterBehavior: string,
  _hunterCrown: string,
  targetBehavior: string,
  targetCrown: string,
): PreyKind | null {
  if (hunterBehavior === "pirate") {
    // A rover takes cargo, not warships, and never one of her own.
    if (targetCrown === "pirates") return null;
    return targetBehavior === "trader" ? "plunder" : null;
  }
  if (hunterBehavior === "pirate_hunter" || hunterBehavior === "navy") {
    return targetCrown === "pirates" ? "police" : null;
  }
  return null;
}

/** Tons of cargo in her hold. A rover is looking for a laden ship, not any ship. */
export function holdTons(entity: EntityState): number {
  return Object.values(entity.ship?.cargo ?? {}).reduce((a, b) => a + b, 0);
}

/**
 * Fighting weight: guns, and the hands to serve them.
 *
 * Crew is counted as a square root so that a hundred-man galleon is worth more
 * than a thirty-man sloop without being worth four of her — the same shape the
 * boarding roll uses, and the reason a well-found brigantine can take a
 * short-handed merchantman twice her size.
 */
export function fightingWeight(entity: EntityState): number {
  const ship = entity.ship;
  if (!ship) return 0;
  const guns = ship.cannons;
  const hands = Math.max(0, ship.crew.current);
  const hull = ship.hullMax > 0 ? Math.max(0.2, ship.hullHp / ship.hullMax) : 1;
  return (guns + Math.sqrt(hands)) * hull;
}

/**
 * What she is worth in a fight she did not want.
 *
 * A merchantman is not a man-of-war with cargo in her: her guns are for
 * frightening off a boat, her crew are seamen, and nobody aboard is paid to die
 * for somebody else's cocoa. Measured without this, a rover could never take
 * anything — a pinnace weighs 7 against a merchantman's 18, so the odds gate
 * refused every single hunt and the only fights in twenty days were men-of-war
 * sinking rovers.
 *
 * The scale is `aggression`, the same number that decides whether she attacks —
 * trader 0-0.1, navy 0.3-0.7, rover 0.6-1.0 — so the behaviour table finally
 * does both halves of its job with one roll.
 */
export function defenceWeight(entity: EntityState): number {
  const will = Math.max(0, Math.min(1, entity.ai?.aggression ?? 0.5));
  return fightingWeight(entity) * (DEFENCE_FLOOR + (1 - DEFENCE_FLOOR) * will);
}

/**
 * Does this hull go after that one?
 *
 * Three gates, in order of how cheap they are to ask: does she want her at all,
 * is she willing, does she like the odds. A rover also wants the hold to be
 * worth the powder — an empty merchantman is left alone, which is what the gold
 * burgee has been telling the *player* since v0.25.0.
 */
export function wantsPrey(
  hunter: EntityState,
  hunterCrown: string,
  target: EntityState,
  targetCrown: string,
): PreyKind | null {
  const ha = hunter.ai;
  const ta = target.ai;
  if (!ha || !ta || !hunter.ship || !target.ship) return null;
  if (hunter.mode !== "sailing" || target.mode !== "sailing") return null;

  const kind = preyKind(ha.behavior, hunterCrown, ta.behavior, targetCrown);
  if (!kind) return null;
  if ((ha.aggression ?? 0) < PREY_AGGRESSION_FLOOR) return null;
  if (kind === "plunder" && holdTons(target) <= 0) return null;

  const mine = fightingWeight(hunter);
  const theirs = defenceWeight(target);
  if (mine < theirs * PREY_ODDS) return null;

  return kind;
}

export type PreyChoice = { id: string; kind: PreyKind; dist: number };

/**
 * The best quarry within reach, or nothing.
 *
 * Nearest wins rather than richest: a hull chooses with her eyes, and reading a
 * hold across two hundred units is the one thing `syncCargoBurgee` established
 * she cannot do (`CARGO_READ_SHARE`). The cargo test above is a test of whether
 * the chase is *worth finishing*, not of what she can see from here.
 */
export function pickPrey(
  hunterId: string,
  hunter: EntityState,
  candidates: Array<[string, EntityState]>,
  crownOf: (e: EntityState) => string,
  reach: number,
): PreyChoice | null {
  let best: PreyChoice | null = null;
  const hunterCrown = crownOf(hunter);
  for (const [id, other] of candidates) {
    if (id === hunterId) continue;
    const d = vec2Dist(hunter.pos, other.pos);
    if (d > reach) continue;
    if (best && d >= best.dist) continue;
    const kind = wantsPrey(hunter, hunterCrown, other, crownOf(other));
    if (!kind) continue;
    best = { id, kind, dist: d };
  }
  return best;
}

export type HuntOutcome = {
  /** The loser. Removed from the water. */
  loserId: string;
  /** True when she was taken rather than sunk — a rover keeps a prize. */
  taken: boolean;
  /** Cargo that changed hands, if any. */
  spoils: Record<string, number>;
};

/**
 * Settle a hunt that has closed to strike range.
 *
 * Deliberately one roll and not a battle. The player's own fights get an arena,
 * a wind, ammunition and a duel; two hulls he happens to be sailing past get
 * the answer, because simulating them properly would cost the frame budget of
 * the fight he is actually in — and because from his deck what he sees is a
 * chase, a broadside and a ship going down, which is exactly what this is.
 *
 * `roll` is 0..1 from the world RNG, so the outcome is deterministic with the
 * save. Weight decides the odds; the underdog wins about as often as the
 * boarding roll would let her.
 */
export function resolveHunt(
  hunterId: string,
  hunter: EntityState,
  targetId: string,
  target: EntityState,
  kind: PreyKind,
  roll: number,
): HuntOutcome {
  const mine = fightingWeight(hunter);
  const theirs = defenceWeight(target);
  const odds = mine / Math.max(0.001, mine + theirs);

  const hunterWins = roll < odds;
  const loserId = hunterWins ? targetId : hunterId;
  const loser = hunterWins ? target : hunter;

  // A rover takes what floats; a man-of-war sinks what she catches. She is not
  // out for a prize, she is out to end the nuisance.
  const taken = hunterWins && kind === "plunder";
  const spoils = taken ? { ...(loser.ship?.cargo ?? {}) } : {};

  return { loserId, taken, spoils };
}

/** Where the fight happened, for the log and for anything that wants to draw it. */
export function huntPos(a: EntityState, b: EntityState): Vec2 {
  return { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2 };
}

/** Guns aboard, for the log line. */
export function gunsOf(entity: EntityState): number {
  return entity.ship?.cannons ?? SHIP_CLASSES[entity.ship?.classId as string]?.cannons ?? 0;
}

// ===========================================================================
// The world-level step
// ===========================================================================

import type { WorldState } from "../model/WorldState.ts";
import { rngNext } from "../services/RNG.ts";
import { tickBoundaryCrossed } from "./TimeSystem.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { disruptRoute } from "./TradeRouteSystem.ts";

/** Ticks between predation decisions. Slower than the AI's own cadence: a hull
 *  picks a quarry once and then keeps after her, rather than re-choosing every
 *  second and swerving between two merchantmen for ever. */
export const PREDATION_INTERVAL = 60;

/** How far the player has to be to see it happen and get a line in his log. */
export const WITNESS_RANGE = 700;

const crownOfEntity = (e: EntityState) => (e.ship?.factionId as string) ?? "";

/**
 * One pass of everybody else's quarrels.
 *
 * Kept out of `NpcAiSystem` because it is the one thing in the NPC layer that
 * changes the *set* of ships rather than a heading: a hunt that closes takes a
 * hull off the water. `NpcAiSystem` steers toward `targetEntityId`; this
 * decides who has one, and settles it when the two are alongside.
 */
export function runPredation(world: WorldState, dtTicks: number): WorldState {
  const tick = world.time.tick;
  if (!tickBoundaryCrossed(tick - dtTicks, tick, PREDATION_INTERVAL)) return world;

  const playerShipId = world.player.shipId as string;
  const playerPos = world.entities[playerShipId]?.pos;

  const npcs = Object.entries(world.entities).filter(
    ([id, e]) => id !== playerShipId && e.kind === "ship" && e.ai && e.ship,
  );
  if (npcs.length < 2) return world;

  let rng = world.rng;
  let entities = world.entities;
  let out = world;
  let changed = false;
  const gone = new Set<string>();

  for (const [id, entity] of npcs) {
    if (gone.has(id)) continue;
    const ai = entity.ai!;
    // A named hull is somebody's charge and has her own reasons; leave her and
    // her escorts to `NamedShipSystem`.
    if (ai.namedShipId || ai.namedEscortOf || ai.expedition || ai.plateFleetId) continue;

    const current = ai.targetEntityId as string | undefined;
    const quarry = current && !gone.has(current) ? entities[current] : undefined;

    // ---- already after somebody: close, or give her up ----
    if (quarry?.ship && quarry.mode === "sailing") {
      const d = Math.hypot(entity.pos.x - quarry.pos.x, entity.pos.y - quarry.pos.y);
      if (d <= PREY_STRIKE_RANGE) {
        const kind = preyKind(ai.behavior, crownOfEntity(entity), quarry.ai!.behavior, crownOfEntity(quarry));
        if (kind) {
          let roll: number;
          ({ value: roll, state: rng } = rngNext(rng));
          const outcome = resolveHunt(id, entity, current!, quarry, kind, roll);
          out = settleHunt(out, id, entity, current!, quarry, outcome, kind, playerPos);
          entities = out.entities;
          gone.add(outcome.loserId);
          changed = true;
          continue;
        }
      }
      const reach = (ai.awarenessRadius ?? 200) * PREY_REACH * 1.5;
      if (d <= reach) continue; // still worth chasing
      // Lost her.
      entities = { ...entities, [id]: { ...entity, ai: { ...ai, targetEntityId: undefined, state: "patrol" } } };
      out = { ...out, entities };
      changed = true;
      continue;
    }

    // ---- look for one ----
    const choice = pickPrey(
      id, entity,
      npcs.filter(([oid]) => !gone.has(oid)),
      crownOfEntity,
      (ai.awarenessRadius ?? 200) * PREY_REACH,
    );
    if (!choice) {
      if (current) {
        entities = { ...entities, [id]: { ...entity, ai: { ...ai, targetEntityId: undefined } } };
        out = { ...out, entities };
        changed = true;
      }
      continue;
    }
    entities = {
      ...entities,
      [id]: { ...entity, ai: { ...ai, targetEntityId: choice.id as typeof ai.targetEntityId, state: "chase" } },
    };
    out = { ...out, entities };
    changed = true;
  }

  if (!changed && rng === world.rng) return world;
  return { ...out, entities, rng };
}

/**
 * Take the loser off the water and let the world know.
 *
 * The consequences are all ones that already existed: a trader taken on a lane
 * is that lane preyed upon (`routeDisruption`, v0.22.0), and the player gets a
 * line in his log only if he was near enough to see it. Nothing new is stored.
 */
function settleHunt(
  world: WorldState,
  hunterId: string,
  hunter: EntityState,
  targetId: string,
  target: EntityState,
  outcome: HuntOutcome,
  kind: PreyKind,
  playerPos?: Vec2,
): WorldState {
  const loser = outcome.loserId === hunterId ? hunter : target;
  const winner = outcome.loserId === hunterId ? target : hunter;
  const winnerId = outcome.loserId === hunterId ? targetId : hunterId;

  const { [outcome.loserId]: _dropped, ...rest } = world.entities;
  let w: WorldState = { ...world, entities: rest };

  // A prize is a hold that changed hands, not a new hull: the winner is an NPC
  // and NPC fleets are not modelled. She carries the cargo on, which is what
  // makes a rover worth catching afterwards.
  if (outcome.taken && rest[winnerId]?.ship) {
    const hold = { ...(rest[winnerId].ship!.cargo ?? {}) };
    for (const [item, qty] of Object.entries(outcome.spoils)) hold[item] = (hold[item] ?? 0) + qty;
    w = {
      ...w,
      entities: { ...rest, [winnerId]: { ...rest[winnerId], ship: { ...rest[winnerId].ship!, cargo: hold },
        ai: { ...rest[winnerId].ai!, targetEntityId: undefined, state: "patrol" } } },
    };
  } else if (rest[winnerId]?.ai) {
    w = {
      ...w,
      entities: { ...rest, [winnerId]: { ...rest[winnerId], ai: { ...rest[winnerId].ai!, targetEntityId: undefined, state: "patrol" } } },
    };
  }

  // A merchantman lost on her lane is that lane preyed upon. The shippers do
  // not care who took her.
  const laneId = loser.ai?.lane?.routeId;
  if (laneId) w = disruptRoute(w, laneId);

  const near = playerPos
    && Math.hypot(playerPos.x - loser.pos.x, playerPos.y - loser.pos.y) < WITNESS_RANGE;
  if (near) {
    w = addLogEntry(w, kind === "plunder" ? "event.npc_plundered" : "event.npc_policed", {
      hunter: crownOfEntity(winner) || "?",
      prey: crownOfEntity(loser) || "?",
      taken: outcome.taken ? 1 : 0,
    });
  }

  return w;
}
