/**
 * CargoContractSystem — the charter. Somebody else's goods, your hold.
 *
 * v0.22.0 gave the Caribbean real shipping lanes and then left the player
 * standing on the quay watching them. He could *cut* a lane — blockade it, prey
 * on it — and the only way to make money out of trade was still the oldest one
 * in the game: buy low here, sell high there, entirely on his own account.
 *
 * A charter is the other half. A merchant with cargo and no bottom to put it in
 * pays for a passage: carry so much of this to that port by that day and the
 * money is waiting. It is the trade the lanes already describe, offered to the
 * player at the price the lane is currently worth — which is the part that
 * makes it interesting:
 *
 *   - the fee scales with the passage, so the long runs pay;
 *   - **danger money** scales with what has been happening on that lane. A run
 *     that has lost hulls to pirates lately pays a premium, because nobody else
 *     will take it. The player who spent last month sinking merchantmen on the
 *     Havana run is offered more to sail it himself, which is a joke the game
 *     tells without saying anything;
 *   - a blockaded destination pays most of all, because getting in is the
 *     whole job.
 *
 * And the cargo is not his. He can sell it in the wrong port — nothing stops
 * him — and that is a real choice with a real cost: the charter lapses, the
 * crown that chartered it takes it personally, and his notoriety goes up. The
 * honest carrier and the thief use the same screen.
 */

import type { WorldState } from "../model/WorldState.ts";
import type { QuestDef } from "./QuestSystem.ts";
import { startQuest } from "./QuestSystem.ts";
import { CITIES } from "../data/cities.ts";
import { ITEMS } from "../data/items.ts";
import { FACTIONS } from "../data/factions.ts";
import { routesFrom, disruptions } from "./TradeRouteSystem.ts";
import { blockadeEffective } from "./BlockadeSystem.ts";
import { portFaction } from "./SiegeSystem.ts";

/** Quest ids for a charter all start with this. */
export const CARGO_QUEST_PREFIX = "cargo_";

/** Charters a captain may be under at once. Two holds' worth is a busy ship. */
export const MAX_ACTIVE_CHARTERS = 2;

/** Offers a merchant has on the table at any one time. */
export const OFFERS_PER_PORT = 3;

/** Freight, as a multiple of what the cargo is worth at base prices. */
const FREIGHT_BASE = 0.55;
/** Extra freight for the length of the passage, at the far end of the network. */
const FREIGHT_DISTANCE = 0.75;
/** Danger money, as a multiple of how badly the lane has been preyed upon. */
const FREIGHT_DANGER = 1.2;
/** What a merchant pays to have a cordon run for him. */
const FREIGHT_BLOCKADE = 1.6;

/** Days allowed, per hundred units of passage, plus a flat allowance. */
const DAYS_PER_HUNDRED = 1.6;
const DAYS_BASE = 8;

/** Standing gained for a charter honoured, and lost for one carried off. */
export const CHARTER_REPUTATION = 6;
export const CHARTER_BETRAYAL_REPUTATION = -12;
export const CHARTER_BETRAYAL_NOTORIETY = 5;

export type CargoContract = {
  /** Quest id: `cargo_<from>__<to>_<item>`. Stable, so a port cannot double-offer. */
  id: string;
  from: string;
  to: string;
  /** Localised town name, so the quest log reads without a lookup. */
  toName: string;
  item: string;
  qty: number;
  reward: number;
  /** The crown whose merchants are paying — the destination's owner. */
  crown: string;
  acceptedDay: number;
  /** Days allowed, baked at signing for the reason `DefenseContractSystem` bakes its own. */
  days: number;
};

export function cargoQuestId(from: string, to: string, item: string): string {
  return `${CARGO_QUEST_PREFIX}${from}__${to}_${item}`;
}

/** The flag a delivery stamps. The quest hangs off it, as a defence does. */
export function cargoDeliveredFlag(contract: CargoContract): string {
  return "cargo_delivered_" + contract.id;
}

/** Charters the captain is under right now. */
export function activeCharters(world: WorldState): CargoContract[] {
  const out: CargoContract[] = [];
  for (const runtime of world.player.questLog) {
    if (runtime.completed) continue;
    if (!(runtime.questId as string).startsWith(CARGO_QUEST_PREFIX)) continue;
    const contract = runtime.data.contract as CargoContract | undefined;
    if (contract) out.push(contract);
  }
  return out;
}

/** How much cargo the flagship could still stow. */
export function holdRoom(world: WorldState): number {
  const ship = world.entities[world.player.shipId as string]?.ship;
  if (!ship) return 0;
  const stowed = Object.values(ship.cargo ?? {}).reduce((sum, q) => sum + q, 0);
  return Math.max(0, ship.cargoCap - stowed);
}

/**
 * What a passage on this lane is worth today.
 *
 * Exported because the offer screen prints the parts: a captain deciding
 * whether to run a blockade for money should be able to see that that is what
 * he is being paid for.
 */
export function freightFor(
  world: WorldState,
  routeId: string,
  to: string,
  item: string,
  qty: number,
  length: number,
): number {
  const goods = (ITEMS[item]?.basePrice ?? 10) * qty;
  const distance = FREIGHT_BASE + FREIGHT_DISTANCE * Math.min(1, length / 1500);
  const severity = disruptions(world)[routeId]?.severity ?? 0;
  const danger = 1 + FREIGHT_DANGER * severity;
  const cordon = blockadeEffective(world, to) ? FREIGHT_BLOCKADE : 1;
  return Math.round(goods * distance * danger * cordon);
}

/**
 * The charters on offer in this port today.
 *
 * Derived, never stored: a merchant's book is a function of the lanes out of
 * his town, what is in his warehouse and what the sea has been like lately. It
 * is stable within a day because nothing in it reads a clock finer than the
 * day, and it changes on its own as the world does — a lane that loses a hull
 * tonight pays better tomorrow morning.
 */
export function cargoOffers(world: WorldState, portKey: string): CargoContract[] {
  const stock = world.ports[portKey]?.inventory ?? {};
  const taken = new Set(activeCharters(world).map(c => c.id));
  const offers: CargoContract[] = [];

  for (const lane of routesFrom(portKey)) {
    for (const item of lane.items) {
      const id = cargoQuestId(lane.from, lane.to, item);
      if (taken.has(id)) continue;
      // A merchant cannot charter what is not in his warehouse. This is also
      // what makes a blockaded or stripped port stop offering work.
      const available = Math.floor(stock[item] ?? 0);
      // Sized to the ship as well as to the run. A merchant splits a
      // consignment across whatever bottoms he can get, and without this the
      // starting sloop — ten tons of free hold — would be offered nothing but
      // forty-ton freights it could never lift, which is the same as the
      // feature not existing for the first hour of the game.
      const wanted = Math.max(MIN_CHARTER, holdRoom(world));
      const qty = Math.min(charterSize(lane.length), available, wanted);
      if (qty < MIN_CHARTER) continue;

      const days = Math.max(
        DAYS_BASE,
        Math.round(DAYS_BASE + (lane.length / 100) * DAYS_PER_HUNDRED),
      );
      offers.push({
        id,
        from: lane.from,
        to: lane.to,
        toName: CITIES[lane.to]?.name ?? lane.to,
        item,
        qty,
        reward: freightFor(world, lane.id, lane.to, item, qty, lane.length),
        crown: portFaction(world, lane.to) as string,
        acceptedDay: world.time.day,
        days,
      });
    }
  }

  // Best paying first, then the biggest — a merchant leads with his problem.
  offers.sort((a, b) => b.reward - a.reward || b.qty - a.qty);
  return offers.slice(0, OFFERS_PER_PORT);
}

/** Below this there is no charter worth writing. */
const MIN_CHARTER = 10;

/** Tons a merchant wants shifted, by how far it has to go. */
function charterSize(length: number): number {
  return Math.round(12 + Math.min(1, length / 1200) * 28);
}

/**
 * Rebuild the quest from a signed charter.
 *
 * Every number comes out of the contract, never out of `world` — this runs from
 * `buildQuestRegistry` on load as well as at signing, and a definition that read
 * the clock would quietly extend its own deadline on every reload.
 */
export function cargoQuest(contract: CargoContract): QuestDef {
  const vars = {
    port: contract.toName,
    item: ITEMS[contract.item]?.name ?? contract.item,
    qty: contract.qty,
    gold: contract.reward,
    days: contract.days,
  };

  return {
    id: contract.id,
    titleKey: "quest.cargo_title",
    start: "carry",
    stages: {
      carry: {
        id: "carry",
        objectiveKey: "quest.cargo_carry",
        vars,
        on: [
          {
            trigger: { type: "flag_set", key: cargoDeliveredFlag(contract) },
            next: "paid",
            effects: [
              { type: "gold", amount: contract.reward },
              { type: "reputation", faction: contract.crown, amount: CHARTER_REPUTATION },
              { type: "log", key: "quest.cargo_paid", vars },
            ],
          },
          {
            trigger: { type: "days_passed", days: contract.days },
            next: "late",
            effects: [
              { type: "reputation", faction: contract.crown, amount: CHARTER_BETRAYAL_REPUTATION },
              { type: "notoriety", amount: CHARTER_BETRAYAL_NOTORIETY },
              { type: "log", key: "quest.cargo_late", vars },
            ],
          },
        ],
      },
      paid: { id: "paid", objectiveKey: "quest.cargo_paid", vars, completes: true },
      late: { id: "late", objectiveKey: "quest.cargo_late", vars, fails: true },
    },
  };
}

export type CharterResult = { world: WorldState; error?: string };

/**
 * Sign it: the goods come out of the merchant's warehouse and into the hold.
 *
 * Loading here rather than at delivery is the point of the mechanic. From this
 * moment the cargo is aboard, it takes up room he could have filled himself,
 * and it can be taken off him at sea — which is what makes a charter a voyage
 * rather than a button.
 */
export function acceptCharter(world: WorldState, contract: CargoContract): CharterResult {
  if (activeCharters(world).length >= MAX_ACTIVE_CHARTERS) {
    return { world, error: "charter.too_many" };
  }
  if (holdRoom(world) < contract.qty) {
    return { world, error: "charter.no_room" };
  }
  const port = world.ports[contract.from];
  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  if (!port || !entity?.ship) return { world, error: "charter.no_room" };
  if ((port.inventory[contract.item] ?? 0) < contract.qty) {
    return { world, error: "charter.no_stock" };
  }

  const inventory = { ...port.inventory };
  inventory[contract.item] = (inventory[contract.item] ?? 0) - contract.qty;
  const cargo = { ...entity.ship.cargo };
  cargo[contract.item] = (cargo[contract.item] ?? 0) + contract.qty;

  const loaded: WorldState = {
    ...world,
    ports: { ...world.ports, [contract.from]: { ...port, inventory } },
    entities: { ...world.entities, [shipId]: { ...entity, ship: { ...entity.ship, cargo } } },
  };

  return { world: startQuest(loaded, cargoQuest(contract), { contract }) };
}

/** Is this charter deliverable right here, right now? */
export function canDeliver(world: WorldState, contract: CargoContract): boolean {
  if (world.player.location.type !== "port") return false;
  if ((world.player.location.portId as string) !== contract.to) return false;
  const cargo = world.entities[world.player.shipId as string]?.ship?.cargo ?? {};
  return (cargo[contract.item] ?? 0) >= contract.qty;
}

/**
 * Hand it over: the goods leave the hold and go into the town's warehouse.
 *
 * The flag is what the quest actually watches, so the payment, the standing and
 * the log line all come out of `advanceQuests` rather than from here. The
 * caller runs that — the same shape the defence commission uses.
 */
export function deliverCharter(world: WorldState, contract: CargoContract): CharterResult {
  if (!canDeliver(world, contract)) return { world, error: "charter.not_here" };

  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  const port = world.ports[contract.to];
  if (!entity?.ship || !port) return { world, error: "charter.not_here" };

  const cargo = { ...entity.ship.cargo };
  cargo[contract.item] = (cargo[contract.item] ?? 0) - contract.qty;
  if (cargo[contract.item] <= 0) delete cargo[contract.item];

  const inventory = { ...port.inventory };
  inventory[contract.item] = (inventory[contract.item] ?? 0) + contract.qty;

  return {
    world: {
      ...world,
      entities: { ...world.entities, [shipId]: { ...entity, ship: { ...entity.ship, cargo } } },
      ports: { ...world.ports, [contract.to]: { ...port, inventory } },
      worldFlags: { ...world.worldFlags, [cargoDeliveredFlag(contract)]: true },
    },
  };
}

/** Who is paying, in words the offer screen can print. */
export function charterPayer(contract: CargoContract): string {
  return FACTIONS[contract.crown]?.name ?? contract.crown;
}
