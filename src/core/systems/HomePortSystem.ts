/**
 * HomePortSystem — what marrying into a governor's family is actually for.
 *
 * v0.14.0 let a captain court and marry a governor's daughter, and the wedding
 * paid in standing and in retirement points. Both of those are numbers on a
 * screen the player looks at twice a career. Nothing about the day after the
 * wedding was different from the day before it: no money changed hands, and the
 * town he had married into treated him exactly as it had the week before.
 *
 * A marriage should give you somewhere to *be from*.
 *
 * ## Three things, all tied to one town
 *
 *   dowry      one payment at the wedding, scaled by what the town is worth
 *   careening  hull and rig made good for the whole fleet, free, at that town
 *   storehouse cargo left ashore and picked up later, up to `WAREHOUSE_CAP`
 *
 * The dowry itself lives in `RomanceSystem` with the rest of the wedding: this
 * module needs `marriedTo` and `daughterFor` from there, so the dependency runs
 * one way and paying from `propose()` would have closed a cycle.
 *
 * The other two are the reason this is a *place* rather than a bonus. A free
 * yard everywhere would just mean repairs are free; a free yard in one named
 * harbour is a reason to plot a course home, which is the whole point of having
 * one. The storehouse is the same argument in cargo: a hold is 40 tons and a
 * good run is more than that, so somewhere to leave the overflow changes what
 * voyages are worth attempting.
 *
 * ## And it can be taken away
 *
 * `homePortActive` requires the town to still fly her father's flag. A colony
 * that changes hands — to another crown, to the brotherhood, or to the captain
 * himself — has a different governor in the residence and a different owner in
 * the shipyard, and the family's credit there is gone. Sacking your wife's home
 * town for the plunder is allowed, and it costs you the storehouse; the goods
 * stay in it, unreachable, until somebody puts her father's flag back up.
 *
 * That is deliberate, and it is the only place in the game where the player can
 * destroy something of his own by winning a battle.
 */

import type { WorldState } from "../model/WorldState.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { portFaction } from "./SiegeSystem.ts";
import { CITIES } from "../data/cities.ts";
import { marriedTo } from "./RomanceSystem.ts";

// ── Constants ─────────────────────────────────────────────

/** Tons the family storehouse will hold. */
export const WAREHOUSE_CAP = 300;

// ── The town ──────────────────────────────────────────────

/** The town the captain married into, whoever holds it now. */
export function homePort(world: WorldState): string | undefined {
  return marriedTo(world);
}

/**
 * True when the home port is still the home port in any useful sense.
 *
 * The marriage does not lapse — `marriedTo` keeps answering, the retirement
 * points stand, and the log line is still in the captain's history. What lapses
 * is the *credit*: her father's yard and her father's storehouse belong to
 * whoever holds the town this month.
 */
export function homePortActive(world: WorldState): boolean {
  const key = homePort(world);
  if (!key) return false;
  // Deliberately *not* `daughterFor(world, key).factionKey`: that reads the
  // town's owner today, so the comparison would be a tautology and a captured
  // colony would quietly grow a new governor's daughter to marry. The crown her
  // father served is a fact about the wedding, stamped by `propose`.
  const crown = world.player.homeCrown ?? (CITIES[key]?.factionId as unknown as string);
  return (portFaction(world, key) as string) === crown;
}

/** True when this is the town the captain married into and it still counts. */
export function isHomePort(world: WorldState, portKey: string): boolean {
  return homePort(world) === portKey && homePortActive(world);
}

// ── Careening ─────────────────────────────────────────────

export type CareenResult = {
  world: WorldState;
  /** Hull and rig points made good across the whole fleet. */
  restored: number;
};

/**
 * Make the whole fleet good, free, in the family's yard.
 *
 * Hull *and* rig, flagship *and* consorts — which is more than a paid yard did
 * before v0.18.0, and the reason `repairShip` was widened in the same release.
 * A benefit that is only a benefit because the paid version is broken is not a
 * benefit, it is a bug with a bow on it.
 */
export function careen(world: WorldState): CareenResult {
  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  let restored = 0;

  let w = world;
  if (entity?.ship) {
    restored += Math.max(0, entity.ship.hullMax - entity.ship.hullHp);
    restored += Math.max(0, entity.ship.sailsMax - entity.ship.sailsHp);
    w = {
      ...w,
      entities: {
        ...w.entities,
        [shipId]: {
          ...entity,
          ship: { ...entity.ship, hullHp: entity.ship.hullMax, sailsHp: entity.ship.sailsMax },
        },
      },
    };
  }

  const fleet = (w.player.fleet ?? []).map(consort => {
    restored += Math.max(0, consort.hullMax - consort.hullHp);
    restored += Math.max(0, consort.sailsMax - consort.sailsHp);
    return { ...consort, hullHp: consort.hullMax, sailsHp: consort.sailsMax };
  });

  if (restored <= 0) return { world, restored: 0 };

  w = { ...w, player: { ...w.player, fleet } };
  return { world: addLogEntry(w, "home.log_careened", { points: Math.round(restored) }), restored };
}

// ── The storehouse ────────────────────────────────────────

export function warehouseOf(world: WorldState): Record<string, number> {
  return world.player.warehouse ?? {};
}

export function warehouseUsed(world: WorldState): number {
  return Object.values(warehouseOf(world)).reduce((a, b) => a + b, 0);
}

export function warehouseFree(world: WorldState): number {
  return Math.max(0, WAREHOUSE_CAP - warehouseUsed(world));
}

/** Hold space aboard the flagship, which is the only ship that carries cargo. */
export function holdFree(world: WorldState): number {
  const ship = world.entities[world.player.shipId as string]?.ship;
  if (!ship) return 0;
  const cap = ship.cargoCap ?? SHIP_CLASSES[ship.classId as string]?.cargoCap ?? 0;
  const aboard = Object.values(ship.cargo ?? {}).reduce((a, b) => a + b, 0);
  return Math.max(0, cap - aboard);
}

export type TransferResult = {
  world: WorldState;
  moved: number;
};

/**
 * Put goods ashore.
 *
 * Moves as much as the hold has and the storehouse will take, and says how much
 * that was. Both directions clamp rather than refuse: a partial move is what a
 * dockhand would do, and a refusal on a one-ton overflow reads as a bug.
 */
export function storeGoods(world: WorldState, itemId: string, qty: number): TransferResult {
  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  if (!entity?.ship) return { world, moved: 0 };

  const aboard = entity.ship.cargo?.[itemId] ?? 0;
  const moved = Math.max(0, Math.min(Math.floor(qty), aboard, warehouseFree(world)));
  if (moved <= 0) return { world, moved: 0 };

  const cargo = { ...entity.ship.cargo };
  cargo[itemId] = aboard - moved;
  if (cargo[itemId] <= 0) delete cargo[itemId];

  const store = { ...warehouseOf(world) };
  store[itemId] = (store[itemId] ?? 0) + moved;

  return {
    world: {
      ...world,
      player: { ...world.player, warehouse: store },
      entities: { ...world.entities, [shipId]: { ...entity, ship: { ...entity.ship, cargo } } },
    },
    moved,
  };
}

/** Take goods back aboard, as far as the hold allows. */
export function withdrawGoods(world: WorldState, itemId: string, qty: number): TransferResult {
  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  if (!entity?.ship) return { world, moved: 0 };

  const stored = warehouseOf(world)[itemId] ?? 0;
  const moved = Math.max(0, Math.min(Math.floor(qty), stored, holdFree(world)));
  if (moved <= 0) return { world, moved: 0 };

  const store = { ...warehouseOf(world) };
  store[itemId] = stored - moved;
  if (store[itemId] <= 0) delete store[itemId];

  const cargo = { ...entity.ship.cargo };
  cargo[itemId] = (cargo[itemId] ?? 0) + moved;

  return {
    world: {
      ...world,
      player: { ...world.player, warehouse: store },
      entities: { ...world.entities, [shipId]: { ...entity, ship: { ...entity.ship, cargo } } },
    },
    moved,
  };
}
