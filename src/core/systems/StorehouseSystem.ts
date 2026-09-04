/**
 * A warehouse of his own, in any town that will lease him one.
 *
 * Until now the captain had exactly one place to put cargo down: the family
 * storehouse his marriage gave him, in one town, on his father-in-law's
 * sufferance (`HomePortSystem`). Everywhere else his hold was his entire
 * fortune — forty tons on the starting sloop — which meant the trading game
 * was always "carry it or sell it now", and the whole market layer the last
 * three releases built could only ever be played one hold at a time.
 *
 * A lease is the other option: pay a month's rent and the goods can wait for
 * a better price, or for a bigger ship, or for the war to end.
 *
 * ## Why this does not break the economy
 *
 * The note that deferred this feature for two releases was right about the
 * risk: a captain who can store anywhere can buy every cheap barrel in the
 * Caribbean and sit on it. Three things now stop that, and only the third is
 * new here:
 *
 *   1. **Prices slide as he trades** (`PricingSystem`, v0.24.0). Buying out a
 *      warehouse drives the quote up under his own hand, so cornering a
 *      market costs more with every ton. This is the important one: it is
 *      what changed, and it is why the feature is safe to build now.
 *   2. **Stored goods are his, not the town's.** They sit off the port's
 *      inventory, so hoarding does not secretly prop a town's supply up, and
 *      releasing a hoard is an ordinary sale that moves the price like any
 *      other.
 *   3. **Rent runs whether he is there or not**, and a lease that lapses is
 *      auctioned. Storage has a carrying cost, which is the thing that makes
 *      hoarding a decision rather than a free option.
 *
 * ## The lapse
 *
 * When the rent runs out the landlord sells the contents to cover his arrears
 * and the captain gets what is left — half the market value, which is what an
 * auction of somebody else's goods fetches. Not a silent void: he is told, in
 * gold and in the log. The goods go onto the town's own shelves and the quotes
 * move to match, because an auction is a delivery like any other.
 *
 * The home port keeps its own storehouse and its own rules — free, larger,
 * and forfeit if the town changes crowns. `goodsAshore` and the rest read
 * whichever store applies to the town being asked about, so the port screen
 * does not have to know which kind it is standing in.
 */

import type { WorldState } from "../model/WorldState.ts";
import { CITIES, type CitySize } from "../data/cities.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { portAccess } from "./PortAccessSystem.ts";
import { creditTrade } from "./TradeLedgerSystem.ts";
import { repricePort } from "./PricingSystem.ts";
import { inventoryCap } from "../data/economyBaselines.ts";
import {
  isHomePort,
  warehouseOf,
  warehouseFree,
  holdFree,
  storeGoods,
  withdrawGoods,
  WAREHOUSE_CAP,
} from "./HomePortSystem.ts";

/** Days a term of rent buys. */
export const LEASE_DAYS = 30;

/** Tons a rented storehouse holds, by the size of the town. */
const LEASE_CAP: Record<CitySize, number> = {
  small: 100,
  medium: 200,
  large: 350,
  capital: 500,
};

/** Rent per ton of capacity, per term, before the town's own multipliers. */
const RENT_PER_TON = 1.5;

/** What the captain clears when a lapsed lease is auctioned off under him. */
const AUCTION_SHARE = 0.5;

export type StorehouseLease = {
  /** Last day the rent covers. Past it, the landlord may auction. */
  paidUntil: number;
  goods: Record<string, number>;
};

/** Every lease he holds. Empty on a save written before this release. */
export function leases(world: WorldState): Record<string, StorehouseLease> {
  return world.player.storehouses ?? {};
}

export function leaseAt(world: WorldState, portKey: string): StorehouseLease | undefined {
  return leases(world)[portKey];
}

/** Tons a storehouse in this town would hold — leased, or the family's. */
export function storageCap(world: WorldState, portKey: string): number {
  if (isHomePort(world, portKey)) return WAREHOUSE_CAP;
  const size = CITIES[portKey]?.population;
  return size ? LEASE_CAP[size] : 0;
}

/** True when he has somewhere to put goods down in this town today. */
export function hasStorage(world: WorldState, portKey: string): boolean {
  return isHomePort(world, portKey) || leaseAt(world, portKey) !== undefined;
}

/** The goods he has ashore here, whichever kind of store this is. */
export function goodsAshore(world: WorldState, portKey: string): Record<string, number> {
  if (isHomePort(world, portKey)) return warehouseOf(world);
  return leaseAt(world, portKey)?.goods ?? {};
}

export function storageUsed(world: WorldState, portKey: string): number {
  return Object.values(goodsAshore(world, portKey)).reduce((a, b) => a + b, 0);
}

export function storageFree(world: WorldState, portKey: string): number {
  if (isHomePort(world, portKey)) return warehouseFree(world);
  if (!hasStorage(world, portKey)) return 0;
  return Math.max(0, storageCap(world, portKey) - storageUsed(world, portKey));
}

/** Days of rent left, or 0 for a lease that has run out or never existed. */
export function daysLeft(world: WorldState, portKey: string): number {
  const lease = leaseAt(world, portKey);
  if (!lease) return 0;
  return Math.max(0, lease.paidUntil - world.time.day);
}

/**
 * What a term of rent costs here.
 *
 * Bigger towns want more for a bigger shed, rich towns want more than poor
 * ones, and a town that likes him gives him the same discount its merchants
 * give him at the counter — the lease is a piece of business like any other,
 * and `portAccess` is the one place the town's opinion is priced.
 */
export function rentFor(world: WorldState, portKey: string): number {
  const cap = storageCap(world, portKey);
  if (cap <= 0) return 0;
  const wealth = world.ports[portKey]?.wealth ?? 300;
  const standing = portAccess(world, portKey).serviceMul;
  return Math.max(1, Math.round(cap * RENT_PER_TON * (0.8 + (wealth / 1000) * 0.6) * standing));
}

/** True when this town would lease him a shed at all. */
export function canRent(world: WorldState, portKey: string): boolean {
  if (isHomePort(world, portKey)) return false;   // he already has one, for nothing
  if (!CITIES[portKey]) return false;
  return portAccess(world, portKey).canRentStore;
}

export type RentResult = {
  world: WorldState;
  rented: boolean;
  cost: number;
  error?: string;
};

/**
 * Take a shed for a month, or add a month to the one he has.
 *
 * Extending runs from whichever is later — today, or the day the current term
 * ends — so paying early buys thirty days rather than throwing away what is
 * left, and paying late does not backdate a term he did not have.
 */
export function rentStorehouse(world: WorldState, portKey: string): RentResult {
  if (!canRent(world, portKey)) {
    return { world, rented: false, cost: 0, error: "not_welcome" };
  }
  const cost = rentFor(world, portKey);
  if (world.player.gold < cost) {
    return { world, rented: false, cost, error: "not_enough_gold" };
  }

  const existing = leaseAt(world, portKey);
  const from = Math.max(world.time.day, existing?.paidUntil ?? world.time.day);
  const lease: StorehouseLease = {
    paidUntil: from + LEASE_DAYS,
    goods: existing?.goods ?? {},
  };

  const port = world.ports[portKey];
  const next: WorldState = {
    ...world,
    player: {
      ...world.player,
      gold: world.player.gold - cost,
      storehouses: { ...leases(world), [portKey]: lease },
    },
    // Rent is money crossing this town's quay, so it goes on the same ledger
    // every other transaction does.
    ports: port ? { ...world.ports, [portKey]: creditTrade(port, cost) } : world.ports,
  };

  return {
    world: addLogEntry(next, "storehouse.log_rented", {
      port: CITIES[portKey]?.name ?? portKey,
      gold: cost,
      days: LEASE_DAYS,
    }),
    rented: true,
    cost,
  };
}

export type TransferResult = { world: WorldState; moved: number };

/** Put goods ashore in this town. Clamps to hold, to store, and to the lease. */
export function storeAt(
  world: WorldState,
  portKey: string,
  itemId: string,
  qty: number,
): TransferResult {
  if (isHomePort(world, portKey)) return storeGoods(world, itemId, qty);

  const lease = leaseAt(world, portKey);
  if (!lease) return { world, moved: 0 };

  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  if (!entity?.ship) return { world, moved: 0 };

  const aboard = entity.ship.cargo?.[itemId] ?? 0;
  const moved = Math.max(0, Math.min(Math.floor(qty), aboard, storageFree(world, portKey)));
  if (moved <= 0) return { world, moved: 0 };

  const cargo = { ...entity.ship.cargo };
  cargo[itemId] = aboard - moved;
  if (cargo[itemId] <= 0) delete cargo[itemId];

  const goods = { ...lease.goods };
  goods[itemId] = (goods[itemId] ?? 0) + moved;

  return {
    world: {
      ...world,
      player: {
        ...world.player,
        storehouses: { ...leases(world), [portKey]: { ...lease, goods } },
      },
      entities: { ...world.entities, [shipId]: { ...entity, ship: { ...entity.ship, cargo } } },
    },
    moved,
  };
}

/** Take goods back aboard, as far as the hold allows. */
export function withdrawAt(
  world: WorldState,
  portKey: string,
  itemId: string,
  qty: number,
): TransferResult {
  if (isHomePort(world, portKey)) return withdrawGoods(world, itemId, qty);

  const lease = leaseAt(world, portKey);
  if (!lease) return { world, moved: 0 };

  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  if (!entity?.ship) return { world, moved: 0 };

  const stored = lease.goods[itemId] ?? 0;
  const moved = Math.max(0, Math.min(Math.floor(qty), stored, holdFree(world)));
  if (moved <= 0) return { world, moved: 0 };

  const goods = { ...lease.goods };
  goods[itemId] = stored - moved;
  if (goods[itemId] <= 0) delete goods[itemId];

  const cargo = { ...entity.ship.cargo };
  cargo[itemId] = (cargo[itemId] ?? 0) + moved;

  return {
    world: {
      ...world,
      player: {
        ...world.player,
        storehouses: { ...leases(world), [portKey]: { ...lease, goods } },
      },
      entities: { ...world.entities, [shipId]: { ...entity, ship: { ...entity.ship, cargo } } },
    },
    moved,
  };
}

/**
 * Daily: leases that have run out are auctioned.
 *
 * The landlord sells the contents at the local price, takes his arrears and
 * his fee, and sends on what is left. The captain is told the number, because
 * a hoard that quietly evaporated would read as a lost save rather than a
 * lost bet. An empty lease simply lapses, with a line and no money.
 */
export function tickStorehouses(world: WorldState): WorldState {
  const held = leases(world);
  const keys = Object.keys(held);
  if (keys.length === 0) return world;

  let w = world;
  let changed = false;
  const kept: Record<string, StorehouseLease> = {};

  for (const portKey of keys) {
    const lease = held[portKey];
    if (world.time.day <= lease.paidUntil) {
      kept[portKey] = lease;
      continue;
    }
    changed = true;

    const port = w.ports[portKey];
    let value = 0;
    const sold: Record<string, number> = {};
    const inventory = { ...(port?.inventory ?? {}) };
    for (const [item, qty] of Object.entries(lease.goods)) {
      if (qty <= 0) continue;
      value += (port?.prices[item] ?? 0) * qty;
      sold[item] = qty;
      // The goods do not vanish: they go on the town's own shelves, and the
      // quotes move to match. An auction is a delivery like any other.
      const cap = inventoryCap(portKey, item);
      const have = inventory[item] ?? 0;
      inventory[item] = Math.max(have, Math.min(cap, have + qty));
    }
    const paidOut = Math.round(value * AUCTION_SHARE);

    // What the town is actually out of pocket is the captain's share — the
    // arrears and the auctioneer's fee stayed with a local landlord.
    const settled = port
      ? creditTrade(repricePort(w, portKey, Object.keys(sold), inventory) ?? port, -paidOut)
      : undefined;

    w = {
      ...w,
      player: { ...w.player, gold: w.player.gold + paidOut },
      ports: settled ? { ...w.ports, [portKey]: settled } : w.ports,
    };
    w = addLogEntry(w, paidOut > 0 ? "storehouse.log_auctioned" : "storehouse.log_lapsed", {
      port: CITIES[portKey]?.name ?? portKey,
      gold: paidOut,
    });
  }

  if (!changed) return world;
  return { ...w, player: { ...w.player, storehouses: kept } };
}
