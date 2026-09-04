import type { WorldState } from "../model/WorldState.ts";
import type { WorldCommand } from "../model/Commands.ts";
import type { WorldEvent, Transition, EngineResult } from "../model/Events.ts";
import { reduceCommand } from "./reducers.ts";
import { advanceTime, dayToCalendar, daysInMonth, tickBoundaryCrossed } from "../systems/TimeSystem.ts";
import { updateWeather } from "../systems/WeatherSystem.ts";
import { updateNavigation, findOpenSeaHeading, type TerrainQuery } from "../systems/NavigationSystem.ts";
import { fleetSpeedMultiplier } from "../systems/FleetSystem.ts";
import { checkEncounters } from "../systems/EncounterSystem.ts";
import { processCrewConsumption, hourBoundaryCrossed } from "../systems/CrewConsumptionSystem.ts";
import { addLogEntry } from "../systems/EventLogSystem.ts";
import { updateNpcSpawns } from "../systems/NpcSpawnSystem.ts";
import { updateNpcAi } from "../systems/NpcAiSystem.ts";
import { updateWorldEvents } from "../systems/WorldEventSystem.ts";
import { tickReconquest, DEFENSE_HELD_FLAG, DEFENSE_LOST_FLAG } from "../systems/ReconquestSystem.ts";
import { tickCampaigns } from "../systems/CrownCampaignSystem.ts";
import { tickExpeditionFleets } from "../systems/ExpeditionFleetSystem.ts";
import { economyDailyTick } from "../systems/EconomyTickSystem.ts";
import { tickBlockades } from "../systems/BlockadeSystem.ts";
import { tickRouteDisruption } from "../systems/TradeRouteSystem.ts";
import { checkNpcNewsExchange } from "../systems/NpcNewsSystem.ts";
import { repairAtSea } from "../systems/ShipRepairSystem.ts";
import { applyOverdueMorale } from "../systems/PlunderSystem.ts";
import { advanceQuests } from "../systems/QuestSystem.ts";
import { t } from "../i18n/index.ts";
import { buildQuestRegistry } from "../systems/QuestRegistry.ts";

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

    // 2.5 Day change logging + world events + economy tick + training drift
    if (oldTime.day !== newTime.day) {
      world = addLogEntry(
        { ...world, time: newTime },
        "event.day_passed",
        { day: String(newTime.day) },
      );
      // Relief squadrons first: a crown coming back for a town the player took
      // resolves its landing *before* `updateWorldEvents` expires anything, or
      // an expedition that arrives on a skipped day would be dropped instead of
      // fought — a silent bug that only shows up as towns nobody ever attacks.
      const relief = tickReconquest({ ...world, time: newTime });
      world = relief.world;
      allEvents.push(...relief.events);
      // A landing settled offscreen still pays a defence commission (v0.17.0).
      // `settleRelief` stamped the outcome flag; the quest machine only ever
      // hears about a flag when somebody hands it a `flag_set`, so this is that
      // somebody. Both flags are offered because `triggerMatches` checks the
      // flag is actually true — only one of them can be.
      for (const portKey of relief.settled) {
        for (const flag of [DEFENSE_HELD_FLAG + portKey, DEFENSE_LOST_FLAG + portKey]) {
          const advanced = advanceQuests(world, { type: "flag_set", key: flag }, buildQuestRegistry(world));
          world = advanced.world;
        }
      }
      // A landing the player is standing in comes back unresolved. Hand it to
      // the scene layer as a transition and stop simulating the day around it —
      // `CityDefenseScene` writes the outcome itself, and letting the economy
      // and the news run first would have the player reading about a town he is
      // still fighting for.
      if (relief.playable) {
        allTransitions.push({
          type: "GoToScene",
          scene: "CityDefense",
          payload: relief.playable as unknown as Record<string, unknown>,
        });
      }
      // Crowns at war now take colonies off each other, and those expeditions
      // arrive through the same `expeditionsInFlight` loop above — so they are
      // launched after it, or a zero-day passage would be fought the morning it
      // was ordered.
      const campaigns = tickCampaigns(world);
      world = campaigns.world;
      allEvents.push(...campaigns.events);
      // Generate/expire world events once per day
      world = updateWorldEvents(world);
      // The cordon is settled before the economy runs, so the day a blockade
      // closes is the first day the town goes short — and the shippers' nerve
      // comes back on the same clock it was lost on.
      const cordon = tickBlockades(world);
      world = tickRouteDisruption(cordon.world);
      allEvents.push(...cordon.events);
      // Daily economy simulation (production, consumption, price update, recovery)
      world = economyDailyTick(world);
      // An unpaid crew grumbles. Morale already drives reload speed, boarding
      // strength and repair pace, so this is felt long before anyone mutinies.
      world = applyOverdueMorale(world);
      // Jury repairs: the carpenter's crew patches what it can while under way,
      // up to a hard cap well short of seaworthy. Proper work needs a shipyard.
      world = repairAtSea(world).world;
      // A day going by is a quest event like any other (v0.17.0). `days_passed`
      // has been in `QuestSystem` and covered by tests since v0.12.0 with
      // nothing emitting it; the governor's defence commission is the first
      // chain that can be missed, so it is the first that needs a clock. The
      // engine is the only thing that sees every day change.
      const questDay = advanceQuests(
        world,
        { type: "days_passed", days: 0 },
        buildQuestRegistry(world),
      );
      if (questDay.advanced.length > 0) {
        const registry = buildQuestRegistry(questDay.world);
        world = questDay.world;
        // The line the player sees is the terminal stage's own objective —
        // "the commission has lapsed" — rather than a quest id. Nothing else
        // has to know what kind of quest just ran out of time.
        for (const id of [...questDay.failed, ...questDay.completed]) {
          const runtime = world.player.questLog.find(q => (q.questId as string) === id);
          const stage = runtime && registry[id]?.stages[runtime.stage];
          if (stage) allEvents.push({ type: "Toast", message: t(stage.objectiveKey, stage.vars) });
        }
      }
      // Crew gains experience every day spent at sea (not in port). The
      // consorts drill with the flagship — a green prize crew catches up
      // because it is sailing in company, which is the whole point of the
      // penalty being temporary rather than permanent (v0.21.0).
      if (world.player.location.type === "sea" && world.captain) {
        const prev = world.captain.training ?? 0.3;
        const next = Math.min(1, prev + 0.0005);
        const fleet = (world.player.fleet ?? []).map(consort =>
          consort.training === undefined
            ? consort
            : { ...consort, training: Math.min(1, consort.training + 0.0005) },
        );
        const fleetMoved = fleet.some((c, i) => c !== (world.player.fleet ?? [])[i]);
        if (next !== prev || fleetMoved) {
          world = {
            ...world,
            captain: { ...world.captain, training: next },
            player: { ...world.player, fleet },
          };
        }
      }
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
    world = updateNpcSpawns(world, dtTicks);
    updatedEntities = { ...world.entities };

    // 6.1 Invasion squadrons (v0.17.0). After the generic spawner, because it
    // reconciles hulls the spawner is told to keep its hands off — and because
    // a squadron sunk this tick has to have its losses written into the event
    // before anything else reads the landing's strength.
    const expeditionFleets = tickExpeditionFleets(world, dtTicks);
    world = expeditionFleets.world;
    updatedEntities = { ...world.entities };
    allEvents.push(...expeditionFleets.events);

    // 6.5 NPC AI decisions (heading, behavior state)
    world = updateNpcAi(world, dtTicks);

    // 6.5b NPC news exchange — check every ~20 ticks (~1s)
    if (tickBoundaryCrossed(world.time.tick - dtTicks, world.time.tick, 20)) {
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
