import type { WorldState, GameTime } from "../model/WorldState.ts";
import type { WorldEvent } from "../model/Events.ts";
// Toasts are drawn verbatim by `WorldRenderer.showToast`, so they have to be
// translated where they are made — the renderer has no idea these are keys.
import { t } from "../i18n/index.ts";

// Consumption rates: units consumed per crew member per game-day
const FOOD_PER_CREW_PER_DAY = 0.1;
const WATER_PER_CREW_PER_DAY = 0.15;

// Per-hour rates (consumption happens once per game-hour)
const FOOD_PER_CREW_PER_HOUR = FOOD_PER_CREW_PER_DAY / 24;
const WATER_PER_CREW_PER_HOUR = WATER_PER_CREW_PER_DAY / 24;

// Morale impact per hour
const MORALE_DROP_NO_FOOD = 0.02;
const MORALE_DROP_NO_WATER = 0.03;
const MORALE_RECOVERY_FED = 0.005;

// Crew death
const CREW_DEATH_THRESHOLD_MORALE = 0.2;
const CREW_DEATH_RATE = 0.02;

// Warning threshold (days of supply remaining)
// const LOW_SUPPLY_DAYS = 3; // reserved for future event log warnings

export type ConsumptionResult = {
  world: WorldState;
  events: WorldEvent[];
};

/**
 * Called once per game-hour when player is at sea.
 */
export function processCrewConsumption(world: WorldState): ConsumptionResult {
  const events: WorldEvent[] = [];
  const playerShipId = world.player.shipId as string;
  const entity = world.entities[playerShipId];
  if (!entity?.ship) return { world, events };

  const crew = entity.ship.crew.current;
  if (crew <= 0) return { world, events };

  const cargo = { ...entity.ship.cargo };
  let morale = entity.ship.crew.morale;
  let currentCrew = crew;

  // --- Consume food ---
  const foodNeeded = crew * FOOD_PER_CREW_PER_HOUR;
  const foodAvail = cargo["food"] ?? 0;
  let hasFood = true;

  if (foodAvail >= foodNeeded) {
    cargo["food"] = foodAvail - foodNeeded;
    if (cargo["food"] < 0.01) cargo["food"] = 0;
  } else {
    cargo["food"] = 0;
    hasFood = false;
    events.push({ type: "Toast", message: t("event.food_out") });
  }

  // --- Consume water ---
  const waterNeeded = crew * WATER_PER_CREW_PER_HOUR;
  const waterAvail = cargo["water"] ?? 0;
  let hasWater = true;

  if (waterAvail >= waterNeeded) {
    cargo["water"] = waterAvail - waterNeeded;
    if (cargo["water"] < 0.01) cargo["water"] = 0;
  } else {
    cargo["water"] = 0;
    hasWater = false;
    events.push({ type: "Toast", message: t("event.water_out") });
  }

  // --- Morale effects ---
  if (!hasFood) morale -= MORALE_DROP_NO_FOOD;
  if (!hasWater) morale -= MORALE_DROP_NO_WATER;
  if (hasFood && hasWater) morale = Math.min(1, morale + MORALE_RECOVERY_FED);
  morale = Math.max(0, Math.min(1, morale));

  // --- Crew death from starvation/dehydration ---
  let crewDeaths = 0;
  if (morale < CREW_DEATH_THRESHOLD_MORALE && (!hasFood || !hasWater)) {
    const deathFraction = CREW_DEATH_RATE * (1 - morale / CREW_DEATH_THRESHOLD_MORALE);
    crewDeaths = Math.max(1, Math.floor(currentCrew * deathFraction));
    currentCrew = Math.max(0, currentCrew - crewDeaths);
    events.push({ type: "Toast", message: t("event.crew_died", { count: crewDeaths }) });
  }

  // Low supply warnings — logged in event log only, no screen toast spam

  // --- Clean up zero-quantity cargo ---
  for (const key of Object.keys(cargo)) {
    if (cargo[key] <= 0) delete cargo[key];
  }

  const newWorld: WorldState = {
    ...world,
    entities: {
      ...world.entities,
      [playerShipId]: {
        ...entity,
        ship: {
          ...entity.ship,
          cargo,
          crew: {
            ...entity.ship.crew,
            current: currentCrew,
            morale,
          },
        },
      },
    },
  };

  return { world: newWorld, events };
}

/**
 * Check if an hour boundary was crossed between oldTime and newTime.
 */
export function hourBoundaryCrossed(oldTime: GameTime, newTime: GameTime): boolean {
  return oldTime.hour !== newTime.hour || oldTime.day !== newTime.day;
}
