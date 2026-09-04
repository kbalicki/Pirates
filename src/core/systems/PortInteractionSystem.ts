import type { WorldState } from "../model/WorldState.ts";
import type { FactionId, PortId, ShipClassId } from "../model/ids.ts";
import type { CitySize } from "../data/cities.ts";
import { CITIES } from "../data/cities.ts";
import { ITEMS } from "../data/items.ts";
import { baselineConsumptionRate, inventoryCap } from "../data/economyBaselines.ts";
import { repriceItem } from "./PricingSystem.ts";
import { portFaction } from "./SiegeSystem.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { canAddToFleet, addToFleet, removeFromFleet, fleetMinCrew, consortBerthsFree, manConsorts } from "./FleetSystem.ts";
import { rngNextInt } from "../services/RNG.ts";
import { getReputationLevel } from "./ReputationSystem.ts";
import { portAccess } from "./PortAccessSystem.ts";
import { townHunger, townIsHungry } from "./EconomyTickSystem.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { diluteTraining } from "../model/CaptainState.ts";

// ── Governor ──────────────────────────────────────────────

export type GovernorResult = {
  world: WorldState;
  granted: boolean;
  error?: string;
};

const RECRUIT_COST_PER_SAILOR = 0;
const DRINKS_COST = 10;
const MORALE_BOOST = 0.15;
const REPAIR_COST_PER_HP = 2;

/**
 * Request a letter of marque from a faction's governor.
 * Requires reputation >= "friendly" (rep >= 20).
 */
export function requestLetterOfMarque(
  world: WorldState,
  factionId: FactionId,
): GovernorResult {
  const factionKey = factionId as string;
  const flagKey = `letter_of_marque_${factionKey}`;

  if (world.worldFlags[flagKey]) {
    return { world, granted: false, error: "already_granted" };
  }

  const rep = world.player.reputation[factionKey] ?? 0;
  const level = getReputationLevel(rep);

  if (level !== "friendly" && level !== "allied") {
    return { world, granted: false, error: "insufficient_reputation" };
  }

  const newWorld = addLogEntry(
    { ...world, worldFlags: { ...world.worldFlags, [flagKey]: true } },
    "event.letter_of_marque",
    { faction: factionKey },
  );

  return { world: newWorld, granted: true };
}

// ── Crew Recruitment Pool ─────────────────────────────────

/** How many more men a town that ate nothing yesterday puts in the tavern. */
const HUNGER_CREW_BONUS = 1.0;

const CREW_RANGE: Record<CitySize, [number, number]> = {
  small:   [2, 10],
  medium:  [5, 15],
  large:   [10, 25],
  capital: [10, 30],
};

/**
 * Generate available crew for a port based on city size.
 * Called when entering a port. Returns updated world with
 * the port's availableCrew set and RNG advanced.
 *
 * Scaled by the town's opinion of the captain since v0.24.0. Men sign on with
 * somebody their families do not hate, and in a town he has been burning they
 * do not sign on at all — which is the first place a hostile port has ever
 * felt different from a friendly one from the inside. The roll happens either
 * way, so the world's RNG advances identically whatever his standing: a
 * reputation must not silently reshuffle every other random thing in the game.
 *
 * And scaled again by what the town had to eat yesterday (v0.27.0). A hungry
 * town is a town full of men who will take a berth and a meal, so the shortage
 * the player can now *cause* — by taking a supplier, by shutting a harbour, by
 * making a run uninsurable — is also a shortage he can crew out of. It is the
 * same lever from the other end, and the reason hunger is worth modelling at
 * all rather than merely displaying.
 *
 * The two multipliers compound on purpose: a starving town that hates him
 * still sends nobody. Bread is not that persuasive.
 */
export function generateAvailableCrew(
  world: WorldState,
  portId: PortId,
): WorldState {
  const portKey = portId as string;
  const cityDef = CITIES[portKey];
  if (!cityDef) return world;

  const range = CREW_RANGE[cityDef.population];
  const { value: crewCount, state: newRng } = rngNextInt(world.rng, range[0], range[1]);

  const portState = world.ports[portKey];
  if (!portState) return world;

  const hungry = 1 + townHunger(world, portKey) * HUNGER_CREW_BONUS;
  const willing = Math.floor(crewCount * portAccess(world, portKey).crewMul * hungry);

  return {
    ...world,
    rng: newRng,
    ports: {
      ...world.ports,
      [portKey]: { ...portState, availableCrew: willing },
    },
  };
}

// ── Tavern ────────────────────────────────────────────────

export type RecruitResult = {
  world: WorldState;
  recruited: number;
  error?: string;
};

/**
 * Recruit crew at the tavern.
 *
 * Berths are counted across the whole fleet, not just the flagship (v0.17.0).
 * Consorts carry their own men now and lose them at a siege, so a hire that
 * stopped at the flagship's own rail would have left a gutted consort gutted
 * for the rest of the game. The flagship fills first — it is the one with the
 * captain aboard — and what will not fit there goes out to the shortest-handed
 * consort, by `manConsorts`.
 */
export function recruitCrew(
  world: WorldState,
  portId: PortId,
  count: number,
): RecruitResult {
  const portKey = portId as string;
  const portState = world.ports[portKey];
  const playerEntity = world.entities[world.player.shipId as string];
  if (!playerEntity?.ship) {
    return { world, recruited: 0, error: "no_ship" };
  }

  if (!portAccess(world, portKey).crewMul) {
    return { world, recruited: 0, error: "no_crew_available" };
  }

  const crew = playerEntity.ship.crew;
  const fleet = world.player.fleet ?? [];
  const flagSpace = crew.max - crew.current;
  const shipSpace = flagSpace + consortBerthsFree(fleet);
  const affordable = Math.floor(world.player.gold / RECRUIT_COST_PER_SAILOR);
  const poolAvailable = portState?.availableCrew ?? 0;
  const actual = Math.min(count, shipSpace, affordable, poolAvailable);

  if (actual <= 0) {
    if (poolAvailable <= 0) return { world, recruited: 0, error: "no_crew_available" };
    if (shipSpace <= 0) return { world, recruited: 0, error: "crew_full" };
    return { world, recruited: 0, error: "not_enough_gold" };
  }

  const cost = actual * RECRUIT_COST_PER_SAILOR;
  const toFlagship = Math.min(flagSpace, actual);
  const { fleet: manned } = manConsorts(fleet, actual - toFlagship);

  // Fresh recruits are untrained — they dilute the crew's overall training
  // by a weighted average against rookie value 0. Only the men who actually
  // walk the flagship's deck count: `training` is the flagship's drill.
  const captain = world.captain;
  const newTraining = captain && toFlagship > 0
    ? diluteTraining(captain.training ?? 0.3, crew.current, toFlagship)
    : undefined;

  const newWorld = addLogEntry(
    {
      ...world,
      player: { ...world.player, gold: world.player.gold - cost, fleet: manned },
      entities: {
        ...world.entities,
        [world.player.shipId as string]: {
          ...playerEntity,
          ship: {
            ...playerEntity.ship,
            crew: { ...crew, current: crew.current + toFlagship },
          },
        },
      },
      ports: portState
        ? {
            ...world.ports,
            [portKey]: {
              ...portState,
              availableCrew: portState.availableCrew - actual,
            },
          }
        : world.ports,
      captain: captain && newTraining !== undefined
        ? { ...captain, training: newTraining }
        : world.captain,
    },
    "event.recruited_crew",
    { count: actual, cost },
  );

  return { world: newWorld, recruited: actual };
}

export type MoraleBoostResult = {
  world: WorldState;
  boosted: boolean;
  error?: string;
};

/**
 * Buy a round of drinks to boost crew morale.
 * Cost: 10g. Morale +15%, capped at 1.0.
 */
export function buyRoundOfDrinks(world: WorldState): MoraleBoostResult {
  if (world.player.gold < DRINKS_COST) {
    return { world, boosted: false, error: "not_enough_gold" };
  }

  const playerEntity = world.entities[world.player.shipId as string];
  if (!playerEntity?.ship) {
    return { world, boosted: false, error: "no_ship" };
  }

  const newMorale = Math.min(1.0, playerEntity.ship.crew.morale + MORALE_BOOST);

  const newWorld = addLogEntry(
    {
      ...world,
      player: { ...world.player, gold: world.player.gold - DRINKS_COST },
      entities: {
        ...world.entities,
        [world.player.shipId as string]: {
          ...playerEntity,
          ship: {
            ...playerEntity.ship,
            crew: { ...playerEntity.ship.crew, morale: newMorale },
          },
        },
      },
    },
    "event.bought_drinks",
    { cost: DRINKS_COST },
  );

  return { world: newWorld, boosted: true };
}

// ── Shipyard ──────────────────────────────────────────────

export type RepairResult = {
  world: WorldState;
  repaired: number;
  cost: number;
  error?: string;
};

/**
 * What a yard would have to put right across the whole fleet.
 *
 * Hull and rig, flagship and consorts. Until v0.18.0 this counted the
 * flagship's hull and nothing else, so a shredded suit of sails and a consort
 * shot to pieces were both repaired only by the jury work `ShipRepairSystem`
 * does at sea — which is capped well short of seaworthy on purpose. A ship
 * could be permanently half-rigged with a shipyard in front of it.
 */
export function repairableDamage(world: WorldState): number {
  const ship = world.entities[world.player.shipId as string]?.ship;
  let damage = 0;
  if (ship) {
    damage += Math.max(0, ship.hullMax - ship.hullHp);
    damage += Math.max(0, ship.sailsMax - ship.sailsHp);
  }
  for (const consort of world.player.fleet ?? []) {
    damage += Math.max(0, consort.hullMax - consort.hullHp);
    damage += Math.max(0, consort.sailsMax - consort.sailsHp);
  }
  return Math.round(damage);
}

/**
 * Repair the fleet at 2g per point, as far as the gold goes.
 *
 * Worst first, so a captain who cannot afford the whole bill buys the thing
 * most likely to sink him rather than whatever happens to be first in an array.
 */
export function repairShip(world: WorldState, portId?: PortId): RepairResult {
  const playerEntity = world.entities[world.player.shipId as string];
  if (!playerEntity?.ship) {
    return { world, repaired: 0, cost: 0, error: "no_ship" };
  }

  const damage = repairableDamage(world);
  if (damage <= 0) {
    return { world, repaired: 0, cost: 0, error: "no_damage" };
  }

  // A shipwright is not a patriot — he will mend anybody's hull — but he
  // charges an enemy double and an ally a discount (v0.24.0). The port is
  // optional because `ShipRepairSystem` and the tests both call this without
  // one, and a yard with no town around it charges the standing rate.
  const rate = repairRate(world, portId);
  let budget = Math.min(damage, Math.floor(world.player.gold / rate));
  if (budget <= 0) {
    return { world, repaired: 0, cost: 0, error: "not_enough_gold" };
  }
  const cost = Math.round(budget * rate);

  // Every damaged part of the fleet as one list, worst first.
  type Part = { get: () => number; put: (v: number) => void; missing: number };
  let hullHp = playerEntity.ship.hullHp;
  let sailsHp = playerEntity.ship.sailsHp;
  const fleet = (world.player.fleet ?? []).map(c => ({ ...c }));

  const parts: Part[] = [
    { get: () => hullHp, put: v => { hullHp = v; }, missing: playerEntity.ship.hullMax - hullHp },
    { get: () => sailsHp, put: v => { sailsHp = v; }, missing: playerEntity.ship.sailsMax - sailsHp },
  ];
  for (const consort of fleet) {
    parts.push({
      get: () => consort.hullHp,
      put: v => { consort.hullHp = v; },
      missing: consort.hullMax - consort.hullHp,
    });
    parts.push({
      get: () => consort.sailsHp,
      put: v => { consort.sailsHp = v; },
      missing: consort.sailsMax - consort.sailsHp,
    });
  }
  parts.sort((a, b) => b.missing - a.missing);

  for (const part of parts) {
    if (budget <= 0) break;
    const take = Math.min(budget, Math.max(0, part.missing));
    if (take <= 0) continue;
    part.put(part.get() + take);
    budget -= take;
  }

  const newWorld = addLogEntry(
    {
      ...world,
      player: { ...world.player, gold: world.player.gold - cost, fleet },
      entities: {
        ...world.entities,
        [world.player.shipId as string]: {
          ...playerEntity,
          ship: { ...playerEntity.ship, hullHp, sailsHp },
        },
      },
    },
    "event.repaired",
    { gold: cost },
  );

  return { world: newWorld, repaired: Math.round(cost / rate), cost };
}

/** What this yard asks per point of damage, the town's opinion included. */
export function repairRate(world: WorldState, portId?: PortId): number {
  if (!portId) return REPAIR_COST_PER_HP;
  return REPAIR_COST_PER_HP * portAccess(world, portId as string).serviceMul;
}

export type BuyShipResult = {
  world: WorldState;
  bought: boolean;
  error?: string;
};

/**
 * Buy a new ship, replacing the current one.
 * Transfers as much cargo and crew as the new ship can hold.
 */
export function buyShip(
  world: WorldState,
  newShipClassId: ShipClassId,
  portId?: PortId,
): BuyShipResult {
  const classDef = SHIP_CLASSES[newShipClassId as string];
  if (!classDef) return { world, bought: false, error: "unknown_ship_class" };

  // A hull is a weapon, and a town he is at war with knows where he would sail
  // it (v0.24.0). Repairs are still on offer; a new ship is not.
  if (portId && !portAccess(world, portId as string).canBuyShips) {
    return { world, bought: false, error: "not_welcome" };
  }

  if (world.player.gold < classDef.buyPrice) {
    return { world, bought: false, error: "not_enough_gold" };
  }

  const playerEntity = world.entities[world.player.shipId as string];
  if (!playerEntity?.ship) {
    return { world, bought: false, error: "no_current_ship" };
  }

  const oldShip = playerEntity.ship;

  // Transfer crew (capped at new ship's max)
  const newCrewCurrent = Math.min(oldShip.crew.current, classDef.crewMax);

  // Transfer cargo (capped at new ship's cargo capacity)
  const newCargo: Record<string, number> = {};
  let cargoUsed = 0;
  for (const [itemKey, qty] of Object.entries(oldShip.cargo)) {
    const transferQty = Math.min(qty, classDef.cargoCap - cargoUsed);
    if (transferQty > 0) {
      newCargo[itemKey] = transferQty;
      cargoUsed += transferQty;
    }
    if (cargoUsed >= classDef.cargoCap) break;
  }

  const newWorld = addLogEntry(
    {
      ...world,
      player: { ...world.player, gold: world.player.gold - classDef.buyPrice },
      entities: {
        ...world.entities,
        [world.player.shipId as string]: {
          ...playerEntity,
          ship: {
            classId: newShipClassId,
            factionId: oldShip.factionId,
            hullHp: classDef.hullMax,
            hullMax: classDef.hullMax,
            sailsHp: classDef.sailsMax,
            sailsMax: classDef.sailsMax,
            cannons: classDef.cannons,
            cargo: newCargo,
            cargoCap: classDef.cargoCap,
            crew: {
              current: newCrewCurrent,
              max: classDef.crewMax,
              morale: oldShip.crew.morale,
            },
          },
        },
      },
    },
    "event.bought_ship",
    { ship: classDef.name, cost: classDef.buyPrice },
  );

  return { world: newWorld, bought: true };
}

// ── Fleet Management ─────────────────────────────────────

export type FleetBuyResult = {
  world: WorldState;
  bought: boolean;
  error?: string;
};

/** Buy a ship and ADD it to the fleet as an escort (max 3 total). */
export function buyShipToFleet(
  world: WorldState,
  newShipClassId: ShipClassId,
  portId?: PortId,
): FleetBuyResult {
  if (!canAddToFleet(world.player)) {
    return { world, bought: false, error: "fleet_full" };
  }

  if (portId && !portAccess(world, portId as string).canBuyShips) {
    return { world, bought: false, error: "not_welcome" };
  }

  const classDef = SHIP_CLASSES[newShipClassId as string];
  if (!classDef) return { world, bought: false, error: "unknown_ship_class" };

  if (world.player.gold < classDef.buyPrice) {
    return { world, bought: false, error: "not_enough_gold" };
  }

  // Check if player has enough crew to man the new ship
  const playerEntity = world.entities[world.player.shipId as string];
  const currentCrew = playerEntity?.ship?.crew.current ?? 0;
  const newFleet = addToFleet(
    world.player.fleet ?? [],
    newShipClassId as string,
    world.captain?.training ?? 0.3,
  );
  if (!newFleet) return { world, bought: false, error: "fleet_full" };

  const flagshipClassId = playerEntity?.ship?.classId as string;
  const minCrewNeeded = fleetMinCrew(flagshipClassId, newFleet);
  if (currentCrew < minCrewNeeded) {
    return { world, bought: false, error: "not_enough_crew" };
  }

  const newWorld = addLogEntry(
    {
      ...world,
      player: {
        ...world.player,
        gold: world.player.gold - classDef.buyPrice,
        fleet: newFleet,
      },
    },
    "event.bought_escort",
    { ship: classDef.name, cost: classDef.buyPrice },
  );

  return { world: newWorld, bought: true };
}

export type FleetSellResult = {
  world: WorldState;
  sold: boolean;
  goldReceived: number;
  error?: string;
};

/** Sell an escort ship from the fleet. Returns 40% of buy price. */
export function sellFleetShip(
  world: WorldState,
  fleetIndex: number,
): FleetSellResult {
  const fleet = world.player.fleet ?? [];
  if (fleetIndex < 0 || fleetIndex >= fleet.length) {
    return { world, sold: false, goldReceived: 0, error: "invalid_index" };
  }

  const escort = fleet[fleetIndex];
  const classDef = SHIP_CLASSES[escort.classId];
  const sellPrice = classDef ? Math.floor(classDef.buyPrice * 0.4) : 0;

  const newWorld = addLogEntry(
    {
      ...world,
      player: {
        ...world.player,
        gold: world.player.gold + sellPrice,
        fleet: removeFromFleet(fleet, fleetIndex),
      },
    },
    "event.sold_escort",
    { ship: classDef?.name ?? "Ship", price: sellPrice },
  );

  return { world: newWorld, sold: true, goldReceived: sellPrice };
}

/** Abandon an escort ship at sea (no gold received). */
export function abandonFleetShip(
  world: WorldState,
  fleetIndex: number,
): WorldState {
  const fleet = world.player.fleet ?? [];
  if (fleetIndex < 0 || fleetIndex >= fleet.length) return world;

  const escort = fleet[fleetIndex];
  const classDef = SHIP_CLASSES[escort.classId];

  return addLogEntry(
    {
      ...world,
      player: {
        ...world.player,
        fleet: removeFromFleet(fleet, fleetIndex),
      },
    },
    "event.abandoned_ship",
    { ship: classDef?.name ?? "Ship" },
  );
}

// ── Rumors ────────────────────────────────────────────────

const RUMOR_KEYS = [
  "tavern.rumor_treasure",
  "tavern.rumor_fleet",
  "tavern.rumor_storm",
  "tavern.rumor_trade",
  "tavern.rumor_pirates",
  "tavern.rumor_war",
  "tavern.rumor_governor",
  "tavern.rumor_ghost_ship",
];

/**
 * Get a deterministic rumor key based on the current game day.
 */
export function getRumorKey(world: WorldState): string {
  const index = (world.time.day + world.time.hour) % RUMOR_KEYS.length;
  return RUMOR_KEYS[index];
}


// ── The public granary ────────────────────────────────────────────────────

/**
 * Selling a hungry town's governor what it cannot get (v0.27.0).
 *
 * v0.26.0 made a shortage real and v0.27.0 gave it a face; this is the door out
 * of one, and it is deliberately **not** another contract. The informer's
 * relief order is a paper signed in one town about another, in advance, for
 * gold. This is a man standing in front of the captain in the town that is
 * short, looking at a hold that already has the answer in it:
 *
 *     land it now, and I will pay the crown's price and forget whose work it was
 *
 * So it settles on the spot — no quest, no deadline, no registry entry, nothing
 * in the save — and half of what it pays is **standing**, which is the only
 * currency a governor has that a merchant does not. A captain who starved a
 * colony by taking its supplier can buy his way back into it with a cargo, and
 * that loop is the whole point: the shortage the player causes is a shortage he
 * can then sell into, twice.
 *
 * The price is struck against the item's base, not the famine quote. A crown
 * relieving its own colony is not bidding against itself, and a governor paying
 * three times over the odds would be a better customer than the merchant next
 * door — which would make the merchant's counter pointless in exactly the towns
 * the player most wants to visit.
 */

/**
 * Days of supply the granary is trying to put back on the shelf.
 *
 * Thirty, the same horizon `PricingSystem` calls a balanced market — and in
 * practice the shed is the binding constraint, not the calendar: an imported
 * good caps at thirty tons in any town in the Caribbean, large or small, so
 * what the governor asks for is a sloop-load and never a convoy. That is the
 * right scale for something paid mostly in goodwill.
 */
const GRANARY_DAYS = 30;

/** What the crown pays per ton, as a multiple of the good's base price. */
const GRANARY_RATE = 1.2;

/** Standing for relieving the whole of what the granary asked for. */
export const GRANARY_REPUTATION = 8;

/** Below this there is nothing to talk about. */
const GRANARY_MIN_TONS = 4;

export type GrainOffer = {
  portKey: string;
  item: string;
  /** Tons the governor will take — what he needs, or what is aboard. */
  qty: number;
  gold: number;
  /** Standing this covers, already scaled by how much of the gap it closes. */
  reputation: number;
};

/**
 * What the governor of this town would buy out of the captain's hold today.
 *
 * Derived, never stored, and recomputed after every sale — which is what stops
 * it being farmed: landing the cargo raises the stock, the gap closes, and the
 * reply is gone until the town has eaten its way back down. The good chosen is
 * the one the town has fewest days of, so a captain carrying two of them is
 * asked for the one that is actually killing people.
 */
export function grainOffer(world: WorldState, portKey: string): GrainOffer | null {
  const def = CITIES[portKey];
  const port = world.ports[portKey];
  if (!def || !port) return null;
  if (!townIsHungry(world, portKey)) return null;

  const cargo = world.entities[world.player.shipId as string]?.ship?.cargo ?? {};

  let best: GrainOffer | null = null;
  let worstDays = Infinity;
  for (const item of def.demands) {
    const aboard = Math.floor(cargo[item] ?? 0);
    if (aboard < GRANARY_MIN_TONS) continue;
    const need = baselineConsumptionRate(portKey, item, port.population);
    if (need <= 0) continue;
    const stock = port.inventory[item] ?? 0;
    const days = stock / need;
    if (days >= GRANARY_DAYS) continue;              // that shelf is fine
    // What he can actually put away: the shelf holds what it holds.
    const room = inventoryCap(portKey, item) - stock;
    const gap = Math.floor(Math.min(need * GRANARY_DAYS - stock, room));
    if (gap < GRANARY_MIN_TONS) continue;
    if (days >= worstDays) continue;

    const qty = Math.min(aboard, gap);
    worstDays = days;
    best = {
      portKey,
      item,
      qty,
      gold: Math.round((ITEMS[item]?.basePrice ?? 10) * qty * GRANARY_RATE),
      reputation: Math.max(1, Math.round(GRANARY_REPUTATION * Math.min(1, qty / gap))),
    };
  }
  return best;
}

export type GrainResult = { world: WorldState; error?: string };

/**
 * Land it. Gold, standing and the goods all move here, because nothing about
 * this is a promise — unlike every other agreement in the game, it is over
 * before the captain leaves the room.
 */
export function sellGrain(world: WorldState, offer: GrainOffer): GrainResult {
  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  const port = world.ports[offer.portKey];
  if (!entity?.ship || !port) return { world, error: "granary.not_here" };
  if ((entity.ship.cargo[offer.item] ?? 0) < offer.qty) return { world, error: "granary.no_cargo" };

  const cargo = { ...entity.ship.cargo };
  cargo[offer.item] = (cargo[offer.item] ?? 0) - offer.qty;
  if (cargo[offer.item] <= 0) delete cargo[offer.item];

  const inventory = { ...port.inventory };
  inventory[offer.item] = (inventory[offer.item] ?? 0) + offer.qty;

  const factionKey = portFaction(world, offer.portKey) as string;
  const landed: WorldState = {
    ...world,
    player: {
      ...world.player,
      gold: world.player.gold + offer.gold,
      reputation: {
        ...world.player.reputation,
        [factionKey]: (world.player.reputation[factionKey] ?? 0) + offer.reputation,
      },
    },
    entities: { ...world.entities, [shipId]: { ...entity, ship: { ...entity.ship, cargo } } },
    ports: { ...world.ports, [offer.portKey]: { ...port, inventory } },
  };

  // The shelf moved, so the quote moves with it — the same afternoon, not at
  // midnight (`PricingSystem`, v0.24.0).
  const repriced = repriceItem(landed, offer.portKey, offer.item);
  const withPrice: WorldState = repriced
    ? { ...landed, ports: { ...landed.ports, [offer.portKey]: repriced } }
    : landed;

  return {
    world: addLogEntry(withPrice, "event.granary_relieved", {
      qty: offer.qty,
      item: ITEMS[offer.item]?.name ?? offer.item,
      port: CITIES[offer.portKey]?.name ?? offer.portKey,
      gold: offer.gold,
    }),
  };
}
