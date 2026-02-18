import type { WorldState } from "../model/WorldState.ts";
import type { WorldCommand } from "../model/Commands.ts";
import type { WorldEvent, Transition, EngineResult } from "../model/Events.ts";
import { reduceCommand } from "./reducers.ts";
import { advanceTime, dayToCalendar, daysInMonth } from "../systems/TimeSystem.ts";
import { updateWeather } from "../systems/WeatherSystem.ts";
import { updateNavigation, type TerrainQuery } from "../systems/NavigationSystem.ts";
import { checkEncounters } from "../systems/EncounterSystem.ts";
import { processCrewConsumption, hourBoundaryCrossed } from "../systems/CrewConsumptionSystem.ts";
import { addLogEntry } from "../systems/EventLogSystem.ts";

export class WorldEngine {
  private terrainQuery: TerrainQuery;

  constructor(terrainQuery: TerrainQuery) {
    this.terrainQuery = terrainQuery;
  }

  apply(
    prev: WorldState,
    commands: WorldCommand[],
    dtTicks: number,
  ): EngineResult<WorldState, WorldEvent> {
    let world = prev;
    const allEvents: WorldEvent[] = [];
    const allTransitions: Transition[] = [];

    // 1. Apply player commands
    for (const cmd of commands) {
      const result = reduceCommand(world, cmd);
      world = result.world;
      allEvents.push(...result.events);
      allTransitions.push(...result.transitions);
    }

    // If player is in port, skip world simulation
    if (world.player.location.type === "port") {
      return { state: world, events: allEvents, transitions: allTransitions.length > 0 ? allTransitions : undefined };
    }

    // 2. Advance time
    const oldTime = world.time;
    const newTime = advanceTime(world.time, dtTicks);

    // 2.5 Day change logging
    if (oldTime.day !== newTime.day) {
      world = addLogEntry(
        { ...world, time: newTime },
        "event.day_passed",
        { day: String(newTime.day) },
      );
    }

    // 2.6 Crew consumption (once per game-hour)
    if (hourBoundaryCrossed(oldTime, newTime)) {
      const consumeResult = processCrewConsumption({ ...world, time: newTime });
      world = consumeResult.world;
      allEvents.push(...consumeResult.events);
    }

    // 3. Update weather (season-aware)
    const cal = dayToCalendar(newTime.day, world.startYear);
    const dim = daysInMonth(cal.month, cal.year);
    const weatherResult = updateWeather(world.weather, world.rng, dtTicks, cal.month, cal.dayOfMonth, dim);

    // 4. Update player ship navigation
    const playerShipId = world.player.shipId as string;
    const playerEntity = world.entities[playerShipId];
    let updatedEntities = { ...world.entities };

    if (playerEntity) {
      const updatedPlayer = updateNavigation(
        playerEntity,
        weatherResult.weather,
        this.terrainQuery,
        dtTicks,
      );
      updatedEntities[playerShipId] = updatedPlayer;

      // 5. Update player location pos
      world = {
        ...world,
        player: {
          ...world.player,
          location: { ...world.player.location, pos: updatedPlayer.pos },
        },
      };
    }

    // 6. Update AI entities (placeholder - just basic movement for now)
    for (const [id, entity] of Object.entries(updatedEntities)) {
      if (id === playerShipId) continue;
      if (entity.kind !== "ship" || !entity.ai) continue;

      // Simple: just continue on heading with current sailLevel
      updatedEntities[id] = updateNavigation(
        entity,
        weatherResult.weather,
        this.terrainQuery,
        dtTicks,
      );
    }

    // 7. Check encounters
    const playerPos = updatedEntities[playerShipId]?.pos ?? world.player.location.pos;
    const encounterResult = checkEncounters(
      { ...world, rng: weatherResult.rng },
      playerPos,
      dtTicks,
    );
    allEvents.push(...encounterResult.events);

    // 8. Assemble new state
    const newWorld: WorldState = {
      ...world,
      time: newTime,
      rng: encounterResult.rng,
      weather: weatherResult.weather,
      entities: updatedEntities,
    };

    return {
      state: newWorld,
      events: allEvents,
      transitions: allTransitions.length > 0 ? allTransitions : undefined,
    };
  }
}
