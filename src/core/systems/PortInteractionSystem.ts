import type { WorldState } from "../model/WorldState.ts";
import type { FactionId, PortId, ShipClassId } from "../model/ids.ts";
import type { CitySize } from "../data/cities.ts";
import { CITIES } from "../data/cities.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { canAddToFleet, addToFleet, removeFromFleet, fleetMinCrew, consortBerthsFree, manConsorts } from "./FleetSystem.ts";
import { rngNextInt } from "../services/RNG.ts";
import { getReputationLevel } from "./ReputationSystem.ts";
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

  return {
    ...world,
    rng: newRng,
    ports: {
      ...world.ports,
      [portKey]: { ...portState, availableCrew: crewCount },
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
 * Repair ship hull. Repairs all damage, deducts gold (2g/HP).
 */
export function repairShip(world: WorldState): RepairResult {
  const playerEntity = world.entities[world.player.shipId as string];
  if (!playerEntity?.ship) {
    return { world, repaired: 0, cost: 0, error: "no_ship" };
  }

  const damage = playerEntity.ship.hullMax - playerEntity.ship.hullHp;
  if (damage <= 0) {
    return { world, repaired: 0, cost: 0, error: "no_damage" };
  }

  const repairAmount = Math.min(damage, Math.floor(world.player.gold / REPAIR_COST_PER_HP));
  if (repairAmount <= 0) {
    return { world, repaired: 0, cost: 0, error: "not_enough_gold" };
  }

  const cost = repairAmount * REPAIR_COST_PER_HP;

  const newWorld = addLogEntry(
    {
      ...world,
      player: { ...world.player, gold: world.player.gold - cost },
      entities: {
        ...world.entities,
        [world.player.shipId as string]: {
          ...playerEntity,
          ship: { ...playerEntity.ship, hullHp: playerEntity.ship.hullHp + repairAmount },
        },
      },
    },
    "event.repaired",
    { gold: cost },
  );

  return { world: newWorld, repaired: repairAmount, cost };
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
): BuyShipResult {
  const classDef = SHIP_CLASSES[newShipClassId as string];
  if (!classDef) return { world, bought: false, error: "unknown_ship_class" };

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
): FleetBuyResult {
  if (!canAddToFleet(world.player)) {
    return { world, bought: false, error: "fleet_full" };
  }

  const classDef = SHIP_CLASSES[newShipClassId as string];
  if (!classDef) return { world, bought: false, error: "unknown_ship_class" };

  if (world.player.gold < classDef.buyPrice) {
    return { world, bought: false, error: "not_enough_gold" };
  }

  // Check if player has enough crew to man the new ship
  const playerEntity = world.entities[world.player.shipId as string];
  const currentCrew = playerEntity?.ship?.crew.current ?? 0;
  const newFleet = addToFleet(world.player.fleet ?? [], newShipClassId as string);
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
