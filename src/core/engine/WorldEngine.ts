import type { WorldState } from "../model/WorldState.ts";
import type { WorldCommand } from "../model/Commands.ts";
import type { WorldEvent, Transition, EngineResult } from "../model/Events.ts";
import { reduceCommand } from "./reducers.ts";
import { advanceTime, dayToCalendar, daysInMonth } from "../systems/TimeSystem.ts";
import { updateWeather } from "../systems/WeatherSystem.ts";
import { updateNavigation, findOpenSeaHeading, type TerrainQuery } from "../systems/NavigationSystem.ts";
import { fleetSpeedMultiplier } from "../systems/FleetSystem.ts";
import { checkEncounters } from "../systems/EncounterSystem.ts";
import { processCrewConsumption, hourBoundaryCrossed } from "../systems/CrewConsumptionSystem.ts";
import { addLogEntry } from "../systems/EventLogSystem.ts";
import { updateNpcSpawns } from "../systems/NpcSpawnSystem.ts";
import { updateNpcAi } from "../systems/NpcAiSystem.ts";
import { updateWorldEvents } from "../systems/WorldEventSystem.ts";
import { economyDailyTick } from "../systems/EconomyTickSystem.ts";
import { checkNpcNewsExchange } from "../systems/NpcNewsSystem.ts";

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
    const prevMode = world.entities[world.player.shipId as string]?.mode;
    for (const cmd of commands) {
      const result = reduceCommand(world, cmd);
      world = result.world;
      allEvents.push(...result.events);
      allTransitions.push(...result.transitions);
    }

    // 1.5 After embark: correct heading to face open sea (perpendicular to coastline)
    const postCmdEntity = world.entities[world.player.shipId as string];
    if (prevMode === "landed" && postCmdEntity?.mode === "sailing") {
      const seaHeading = findOpenSeaHeading(
        postCmdEntity.pos.x, postCmdEntity.pos.y,
        this.terrainQuery, postCmdEntity.heading,
      );
      // Push position further along the corrected heading
      const pushDist = 10;
      const corrected = {
        ...postCmdEntity,
        heading: seaHeading,
        pos: {
          x: postCmdEntity.pos.x + Math.sin(seaHeading) * pushDist,
          y: postCmdEntity.pos.y - Math.cos(seaHeading) * pushDist,
        },
      };
      world = {
        ...world,
        entities: { ...world.entities, [world.player.shipId as string]: corrected },
      };
    }

    // If player is in port, skip world simulation
    if (world.player.location.type === "port") {
      return { state: world, events: allEvents, transitions: allTransitions.length > 0 ? allTransitions : undefined };
    }

    // 2. Advance time
    const oldTime = world.time;
    const newTime = advanceTime(world.time, dtTicks);

    // 2.5 Day change logging + world events + economy tick
    if (oldTime.day !== newTime.day) {
      world = addLogEntry(
        { ...world, time: newTime },
        "event.day_passed",
        { day: String(newTime.day) },
      );
      // Generate/expire world events once per day
      world = updateWorldEvents(world);
      // Daily economy simulation (production, consumption, price update, recovery)
      world = economyDailyTick(world);
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
      // Grace period: skip terrain collision for a few ticks after embarking
      const EMBARK_GRACE_TICKS = 15; // ~0.75 seconds at 20 ticks/s
      const embarkTick = playerEntity.embarkTick ?? 0;
      const ticksSinceEmbark = newTime.tick - embarkTick;
      const inGracePeriod = embarkTick > 0 && ticksSinceEmbark < EMBARK_GRACE_TICKS;

      if (inGracePeriod && playerEntity.mode === "sailing") {
        // During grace period: just move forward without terrain collision checks
        const dir = { x: Math.sin(playerEntity.heading), y: -Math.cos(playerEntity.heading) };
        const speed = 0.15; // very slow drift away from land
        const gracedEntity = {
          ...playerEntity,
          pos: {
            x: playerEntity.pos.x + dir.x * speed * dtTicks,
            y: playerEntity.pos.y + dir.y * speed * dtTicks,
          },
          vel: { x: dir.x * speed, y: dir.y * speed },
          // Clear embark tick after grace period ends
          embarkTick: ticksSinceEmbark >= EMBARK_GRACE_TICKS - 1 ? undefined : playerEntity.embarkTick,
        };
        updatedEntities[playerShipId] = gracedEntity;
        // Update player location
        world = {
          ...world,
          player: {
            ...world.player,
            location: { ...world.player.location, pos: gracedEntity.pos },
          },
        };
      } else {
        const prevEntityMode = playerEntity.mode;
        const fleetMul = playerEntity.ship
          ? fleetSpeedMultiplier(playerEntity.ship.classId as string, world.player.fleet ?? [])
          : 1;
        const updatedPlayer = updateNavigation(
          playerEntity,
          weatherResult.weather,
          this.terrainQuery,
          dtTicks,
          fleetMul,
        );
        updatedEntities[playerShipId] = updatedPlayer;

        // Detect auto-disembark (NavigationSystem switched mode on land collision)
        if (prevEntityMode === "sailing" && updatedPlayer.mode === "landed") {
          // Record landing tick for cooldown (prevents instant re-embark)
          updatedEntities[playerShipId] = { ...updatedPlayer, landedTick: newTime.tick };
          world = addLogEntry({ ...world, time: newTime }, "event.disembarked");
          allEvents.push({ type: "Toast", message: "Crew has gone ashore." });
        }

        // Detect auto-embark (crew walked back to water edge)
        if (prevEntityMode === "landed" && updatedPlayer.mode === "sailing") {
          world = addLogEntry({ ...world, time: newTime }, "event.embarked");
          allEvents.push({ type: "Toast", message: "Crew has returned to ship." });
        }

        // 5. Update player location pos
        world = {
          ...world,
          player: {
            ...world.player,
            location: { ...world.player.location, pos: updatedPlayer.pos },
          },
        };
      }
    }

    // 6. NPC spawn/despawn
    world = { ...world, entities: updatedEntities, time: newTime, weather: weatherResult.weather };
    world = updateNpcSpawns(world);
    updatedEntities = { ...world.entities };

    // 6.5 NPC AI decisions (heading, behavior state)
    world = updateNpcAi(world, dtTicks);

    // 6.5b NPC news exchange — check every ~20 ticks (~1s)
    if (world.time.tick % 20 === 0) {
      const newsResult = checkNpcNewsExchange(world);
      world = newsResult.world;
      if (newsResult.newNews.length > 0) {
        allEvents.push({ type: "npc_news", news: newsResult.newNews });
      }
    }

    updatedEntities = { ...world.entities };

    // 6.6 Update all AI ship navigation (movement + collision)
    const COAST_AVOID_TICKS = 60; // 3s cooldown after hitting land
    for (const [id, entity] of Object.entries(updatedEntities)) {
      if (id === playerShipId) continue;
      if (entity.kind !== "ship" || !entity.ai) continue;

      // During coast avoidance cooldown: sail forward but still check terrain
      const coastTick = entity.coastAvoidTick ?? 0;
      const ticksSinceCoast = newTime.tick - coastTick;
      if (coastTick > 0 && ticksSinceCoast < COAST_AVOID_TICKS) {
        const dir = { x: Math.sin(entity.heading), y: -Math.cos(entity.heading) };
        const spd = 1.5;
        const nextX = entity.pos.x + dir.x * spd * dtTicks;
        const nextY = entity.pos.y + dir.y * spd * dtTicks;

        // Check if next position is land — if so, pick a new safe heading
        if (this.terrainQuery(nextX, nextY) === "land") {
          const newSafeHeading = findOpenSeaHeading(
            entity.pos.x, entity.pos.y, this.terrainQuery, entity.heading,
          );
          updatedEntities[id] = {
            ...entity,
            heading: newSafeHeading,
            vel: { x: 0, y: 0 },
            coastAvoidTick: newTime.tick, // restart cooldown
          };
        } else {
          updatedEntities[id] = {
            ...entity,
            pos: { x: nextX, y: nextY },
            vel: { x: dir.x * spd, y: dir.y * spd },
            coastAvoidTick: ticksSinceCoast >= COAST_AVOID_TICKS - 1 ? undefined : entity.coastAvoidTick,
          };
        }
        continue;
      }

      const updatedNpc = updateNavigation(
        entity,
        weatherResult.weather,
        this.terrainQuery,
        dtTicks,
      );
      // If NPC hits land: find open sea direction and set coast avoidance cooldown
      if (updatedNpc.mode === "landed" && entity.mode === "sailing") {
        const safeHeading = findOpenSeaHeading(
          entity.pos.x, entity.pos.y, this.terrainQuery, entity.heading,
        );
        updatedEntities[id] = {
          ...entity,
          heading: safeHeading,
          vel: { x: 0, y: 0 },
          coastAvoidTick: newTime.tick, // start cooldown
        };
      } else {
        updatedEntities[id] = updatedNpc;
      }
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
