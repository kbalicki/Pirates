import { SHIP_CLASSES } from "../data/ships.ts";
import type { WorldState, FleetShip } from "../model/WorldState.ts";

/**
 * The squadron has one hold (v0.77.0).
 *
 * Until this release the fleet's second and third hulls had no `cargo` field at
 * all. A captain who bought a merchantman as a consort — and the shipyard's
 * list prints her two hundred and fifty tons of hold in its own column while he
 * decides — added nothing whatever to what he could carry, and a merchantman
 * taken as a prize joined the fleet with her hold emptied into the sea on the
 * way. Measured, on a sloop's forty tons: **54% of every prize's cargo went
 * over the side** across the nine classes, and 82% of a deep-laden
 * merchantman's — 185 tons of the 225 she was carrying — while
 * `SALVAGE_TAKEN = 1` in `PrizeSystem` carried the comment *"she is yours, hold
 * and all"*.
 *
 * So the hold is a property of the squadron, not of the flagship, and this
 * module is the one place that knows it. The flagship is filled first and
 * emptied first, which leaves the common case — a captain sailing alone —
 * behaving exactly as it did.
 *
 * `FleetShip.cargo` is optional and read through `consortCargo`, so a save
 * written before this release answers `{}` and needs no migration step: a
 * consort simply starts carrying things the first time something is stowed in
 * her.
 *
 * One unit throughout, and it is the ton. `ItemDef.weight` was removed in this
 * release: it had two readers, neither of which was a capacity rule — see
 * `EconomySystem`.
 */

/** What a consort carries. `{}` for a hull from a save written before v0.77.0. */
export function consortCargo(consort: FleetShip): Record<string, number> {
  return consort.cargo ?? {};
}

/** Her class's hold, in tons. */
export function consortCargoCap(consort: FleetShip): number {
  return SHIP_CLASSES[consort.classId]?.cargoCap ?? 0;
}

/** Tons in a hold. Capacity is counted in tons, as `Validation` does. */
export function stowedIn(cargo: Record<string, number> | undefined): number {
  return Object.values(cargo ?? {}).reduce((sum, q) => sum + q, 0);
}

/** Every hull the captain sails, flagship first. */
function consorts(world: WorldState): FleetShip[] {
  return world.player.fleet ?? [];
}

/** Tons the whole squadron could stow if every hold were empty. */
export function squadronCap(world: WorldState): number {
  const flag = world.entities[world.player.shipId as string]?.ship;
  return (flag?.cargoCap ?? 0) + consorts(world).reduce((s, c) => s + consortCargoCap(c), 0);
}

/** Tons stowed across the squadron. */
export function squadronStowed(world: WorldState): number {
  const flag = world.entities[world.player.shipId as string]?.ship;
  return stowedIn(flag?.cargo) + consorts(world).reduce((s, c) => s + stowedIn(consortCargo(c)), 0);
}

/** Tons the squadron could still take. */
export function squadronRoom(world: WorldState): number {
  return Math.max(0, squadronCap(world) - squadronStowed(world));
}

/** Tons of one good the squadron is carrying, wherever it is stowed. */
export function squadronHeld(world: WorldState, item: string): number {
  const flag = world.entities[world.player.shipId as string]?.ship;
  return (flag?.cargo?.[item] ?? 0) + consorts(world).reduce((s, c) => s + (consortCargo(c)[item] ?? 0), 0);
}

/** Everything the squadron is carrying, by good. */
export function squadronManifest(world: WorldState): Record<string, number> {
  const out: Record<string, number> = {};
  const flag = world.entities[world.player.shipId as string]?.ship;
  for (const [item, qty] of Object.entries(flag?.cargo ?? {})) out[item] = (out[item] ?? 0) + qty;
  for (const c of consorts(world)) {
    for (const [item, qty] of Object.entries(consortCargo(c))) out[item] = (out[item] ?? 0) + qty;
  }
  return out;
}

function writeFlagCargo(world: WorldState, cargo: Record<string, number>): WorldState {
  const id = world.player.shipId as string;
  const entity = world.entities[id];
  if (!entity?.ship) return world;
  return { ...world, entities: { ...world.entities, [id]: { ...entity, ship: { ...entity.ship, cargo } } } };
}

function writeFleet(world: WorldState, fleet: FleetShip[]): WorldState {
  return { ...world, player: { ...world.player, fleet } };
}

/**
 * Stow goods in the squadron, flagship first.
 *
 * Returns what would not fit, so the caller can say so: a prize spills the
 * remainder into the water, a purchase is refused before it reaches here.
 */
export function stowInSquadron(
  world: WorldState,
  goods: Record<string, number>,
): { world: WorldState; stowed: Record<string, number>; spilled: Record<string, number> } {
  const stowed: Record<string, number> = {};
  const spilled: Record<string, number> = {};

  const flag = world.entities[world.player.shipId as string]?.ship;
  const flagCargo = { ...(flag?.cargo ?? {}) };
  let flagRoom = flag ? Math.max(0, flag.cargoCap - stowedIn(flagCargo)) : 0;

  const fleet = consorts(world).map(c => ({ ...c, cargo: { ...consortCargo(c) } }));
  const room = fleet.map(c => Math.max(0, consortCargoCap(c) - stowedIn(c.cargo)));

  for (const [item, wanted] of Object.entries(goods)) {
    let left = wanted;
    if (left > 0 && flagRoom > 0) {
      const fits = Math.min(left, flagRoom);
      flagCargo[item] = (flagCargo[item] ?? 0) + fits;
      flagRoom -= fits;
      left -= fits;
      stowed[item] = (stowed[item] ?? 0) + fits;
    }
    for (let i = 0; i < fleet.length && left > 0; i++) {
      if (room[i] <= 0) continue;
      const fits = Math.min(left, room[i]);
      fleet[i].cargo[item] = (fleet[i].cargo[item] ?? 0) + fits;
      room[i] -= fits;
      left -= fits;
      stowed[item] = (stowed[item] ?? 0) + fits;
    }
    if (left > 0) spilled[item] = left;
  }

  let w = flag ? writeFlagCargo(world, flagCargo) : world;
  if (fleet.length > 0) w = writeFleet(w, fleet);
  return { world: w, stowed, spilled };
}

/**
 * Take goods out of the squadron, flagship first.
 *
 * Returns how much was actually found — a caller that has already checked
 * `squadronHeld` will get what it asked for.
 */
export function drawFromSquadron(
  world: WorldState,
  item: string,
  qty: number,
): { world: WorldState; taken: number } {
  let left = qty;
  const flag = world.entities[world.player.shipId as string]?.ship;
  const flagCargo = { ...(flag?.cargo ?? {}) };

  if (left > 0 && (flagCargo[item] ?? 0) > 0) {
    const off = Math.min(left, flagCargo[item]);
    flagCargo[item] -= off;
    if (flagCargo[item] <= 0) delete flagCargo[item];
    left -= off;
  }

  const fleet = consorts(world).map(c => ({ ...c, cargo: { ...consortCargo(c) } }));
  for (let i = 0; i < fleet.length && left > 0; i++) {
    const have = fleet[i].cargo[item] ?? 0;
    if (have <= 0) continue;
    const off = Math.min(left, have);
    fleet[i].cargo[item] = have - off;
    if (fleet[i].cargo[item] <= 0) delete fleet[i].cargo[item];
    left -= off;
  }

  let w = flag ? writeFlagCargo(world, flagCargo) : world;
  if (fleet.length > 0) w = writeFleet(w, fleet);
  return { world: w, taken: qty - left };
}

/**
 * A consort leaves the squadron — sold at a yard, abandoned at sea, or lost.
 *
 * What she carries goes with her unless there is room for it in the hulls that
 * remain. That is the consequence that makes the squadron's hold a decision
 * rather than a free extension: a captain who fills the merchantman and then
 * sells her at the next yard sells her cargo too.
 *
 * Returns the world with her gone and the goods redistributed, plus what could
 * not be moved, so the screen can name it.
 */
export function detachConsort(
  world: WorldState,
  index: number,
): { world: WorldState; lost: Record<string, number> } {
  const fleet = consorts(world);
  if (index < 0 || index >= fleet.length) return { world, lost: {} };

  const leaving = consortCargo(fleet[index]);
  const w = writeFleet(world, fleet.filter((_, i) => i !== index));
  if (stowedIn(leaving) <= 0) return { world: w, lost: {} };

  const moved = stowInSquadron(w, leaving);
  return { world: moved.world, lost: moved.spilled };
}
