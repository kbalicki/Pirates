/**
 * A prize's hold — what is actually aboard the ship you just took.
 *
 * Until now every ship in the Caribbean sailed empty and beating one paid a
 * random 50-150 gold whether she was a Spanish plate-fleet galleon or a
 * fishing pinnace. The hold existed in the model (`ShipData.cargo`) and nothing
 * ever put anything in it.
 *
 * Now traders load from the lane they are sailing (`NpcSpawnSystem`), so a
 * merchantman on the Havana-Port Royale run is carrying sugar and rum, and
 * taking her means shifting that cargo into your own hold — as much of it as
 * you have room for. What you cannot stow is *the point*: a full hold is a
 * decision, and a small fast ship is not a prize-taker.
 *
 * The gold is what the rest of her was worth broken up — chests, fittings, the
 * purser's box — and scales with her tonnage rather than a die roll, so a big
 * prize pays like one even when her hold was empty.
 */

import type { WorldState } from "../model/WorldState.ts";
import type { EntityState, ShipData } from "../model/EntityState.ts";
import { ITEMS } from "../data/items.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { routesFrom, disruptRoute } from "./TradeRouteSystem.ts";

/** Share of a beaten ship's hold that survives to be transferred. */
const SALVAGE_SUNK = 0.5;      // she went down under you; boats save half
const SALVAGE_STRUCK = 0.85;   // she struck; her people help you shift it
const SALVAGE_TAKEN = 1;       // she is yours, hold and all

/** Gold from a hull, per ton of her class. */
const GOLD_PER_TON = 0.55;

/** Floor and ceiling on the purse, so nothing is either pointless or absurd. */
const GOLD_MIN = 40;
const GOLD_MAX = 900;

export type PrizeOutcome = "win" | "surrender" | "captured";

export type Prize = {
  /** Goods moved into the player's hold. */
  taken: Record<string, number>;
  /** Goods left in the water for want of room. */
  spilled: Record<string, number>;
  /** Coin and plate, separate from the cargo. */
  gold: number;
  /** What the cargo taken is worth at base prices — for the result screen. */
  cargoValue: number;
};

/** Units already stowed. Capacity is counted in units, as `Validation` does. */
function stowed(cargo: Record<string, number>): number {
  return Object.values(cargo).reduce((sum, q) => sum + q, 0);
}

function salvageShare(outcome: PrizeOutcome): number {
  if (outcome === "captured") return SALVAGE_TAKEN;
  if (outcome === "surrender") return SALVAGE_STRUCK;
  return SALVAGE_SUNK;
}

/**
 * Work out what comes across from a beaten ship, given the room you have.
 *
 * Pure, and deliberately not random: the variance is already in *which* ship
 * you caught and what she happened to be carrying.
 */
export function computePrize(
  enemy: ShipData | undefined,
  player: ShipData | undefined,
  outcome: PrizeOutcome,
): Prize {
  const empty: Prize = { taken: {}, spilled: {}, gold: 0, cargoValue: 0 };
  if (!enemy) return empty;

  const share = salvageShare(outcome);
  const taken: Record<string, number> = {};
  const spilled: Record<string, number> = {};
  let cargoValue = 0;

  let room = player
    ? Math.max(0, player.cargoCap - stowed(player.cargo ?? {}))
    : 0;

  // Biggest value first: a captain with three tons of room takes the cocoa and
  // leaves the water butts.
  const holds = Object.entries(enemy.cargo ?? {})
    .map(([item, qty]) => ({ item, qty: Math.floor(qty * share), unit: ITEMS[item]?.basePrice ?? 1 }))
    .filter(h => h.qty > 0)
    .sort((a, b) => b.unit - a.unit);

  for (const hold of holds) {
    const fits = Math.min(hold.qty, room);
    if (fits > 0) {
      taken[hold.item] = (taken[hold.item] ?? 0) + fits;
      cargoValue += fits * hold.unit;
      room -= fits;
    }
    const left = hold.qty - fits;
    if (left > 0) spilled[hold.item] = left;
  }

  const tons = SHIP_CLASSES[enemy.classId as string]?.tonnage ?? 60;
  const gold = Math.round(
    Math.max(GOLD_MIN, Math.min(GOLD_MAX, tons * GOLD_PER_TON * share)),
  );

  return { taken, spilled, gold, cargoValue };
}

/**
 * Move a prize into the world: cargo into the player's hold, gold into his
 * purse, and a note in the shippers' ledger that this lane just lost a hull.
 *
 * That last part is what closes the loop with `TradeRouteSystem`: preying on
 * the Havana run makes the Havana run thinner, which the ports at the far end
 * of it feel within the week.
 */
export function applyPrize(
  world: WorldState,
  enemy: EntityState | undefined,
  outcome: PrizeOutcome,
): { world: WorldState; prize: Prize } {
  const playerId = world.player.shipId as string;
  const playerEntity = world.entities[playerId];
  const prize = computePrize(enemy?.ship, playerEntity?.ship, outcome);

  let w = world;

  if (playerEntity?.ship && Object.keys(prize.taken).length > 0) {
    const cargo = { ...playerEntity.ship.cargo };
    for (const [item, qty] of Object.entries(prize.taken)) {
      cargo[item] = (cargo[item] ?? 0) + qty;
    }
    w = {
      ...w,
      entities: {
        ...w.entities,
        [playerId]: { ...playerEntity, ship: { ...playerEntity.ship, cargo } },
      },
    };
  }

  w = { ...w, player: { ...w.player, gold: w.player.gold + prize.gold } };

  // Which run was she on? The AI knows where she was bound and where she
  // sailed from; that pair is the lane.
  const from = enemy?.ai?.lastPortVisited;
  const to = enemy?.ai?.targetPortId as string | undefined;
  if (enemy?.ai?.behavior === "trader" && from && to) {
    const lane = routesFrom(from).find(r => r.to === to);
    if (lane) w = disruptRoute(w, lane.id);
  }

  return { world: w, prize };
}
