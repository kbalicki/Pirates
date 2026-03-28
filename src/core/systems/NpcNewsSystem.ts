/**
 * NPC News System — handles news exchange between NPC ships and the player.
 *
 * - NPC picks up news when near a port (within DOCK_RADIUS)
 * - Player receives news when near a friendly/neutral NPC (within NEWS_RANGE)
 * - Hostile NPC (pirates, enemies) don't share news
 * - Same NPC won't share the same news twice until they visit a new port
 */

import type { WorldState } from "../model/WorldState.ts";
import type { NewsItem } from "../model/EntityState.ts";
import { vec2Dist } from "../services/Geometry.ts";
import { getPortNews } from "./WorldEventSystem.ts";
import { addLogEntry } from "./EventLogSystem.ts";

/** Distance at which player auto-receives news from NPC */
const NEWS_RANGE = 30;

/** Behaviors that will share news with the player */
const FRIENDLY_BEHAVIORS = new Set(["trader", "navy", "escort"]);

export type NewsExchangeResult = {
  world: WorldState;
  /** News items to display in popup (empty = no interaction) */
  newNews: NewsItem[];
};

/**
 * Check all NPC ships for news exchange with the player.
 * Called each tick from WorldEngine.
 */
export function checkNpcNewsExchange(world: WorldState): NewsExchangeResult {
  const playerShipId = world.player.shipId as string;
  const playerEntity = world.entities[playerShipId];
  if (!playerEntity || playerEntity.mode !== "sailing") {
    return { world, newNews: [] };
  }

  const knownIds = new Set(world.knownEventIds ?? []);
  let allNewNews: NewsItem[] = [];
  let updatedEntities = world.entities;
  let changed = false;

  for (const [id, entity] of Object.entries(world.entities)) {
    if (id === playerShipId) continue;
    if (entity.kind !== "ship" || !entity.ai) continue;

    // Only friendly/neutral NPC share news
    if (!FRIENDLY_BEHAVIORS.has(entity.ai.behavior)) continue;

    // Check distance
    const dist = vec2Dist(entity.pos, playerEntity.pos);
    if (dist > NEWS_RANGE) continue;

    // Does this NPC have news?
    const npcNews = entity.ai.news;
    if (!npcNews || npcNews.length === 0) continue;

    // Filter to news the player doesn't already know
    const freshNews = npcNews.filter(n => !knownIds.has(n.eventId));
    if (freshNews.length === 0) continue;

    // Take 1-3 random news items
    const toShare = freshNews.slice(0, Math.min(3, freshNews.length));
    allNewNews.push(...toShare);

    // Mark as known
    for (const n of toShare) {
      knownIds.add(n.eventId);
    }

    changed = true;
  }

  if (!changed) return { world, newNews: [] };

  // Update world with known event IDs and log entries
  let w: WorldState = {
    ...world,
    entities: updatedEntities,
    knownEventIds: [...knownIds],
  };

  // Log each news item
  for (const news of allNewNews) {
    w = addLogEntry(w, news.headline, news.vars);
  }

  return { world: w, newNews: allNewNews };
}

/**
 * When NPC docks at a port, give them fresh news.
 * Called from NpcSpawnSystem when NPC reaches dock radius.
 */
export function npcPickupNews(world: WorldState, entityId: string, portId: string): WorldState {
  const entity = world.entities[entityId];
  if (!entity?.ai) return world;

  const news = getPortNews(world, portId);
  if (news.length === 0 && !entity.ai.news?.length) return world;

  return {
    ...world,
    entities: {
      ...world.entities,
      [entityId]: {
        ...entity,
        ai: {
          ...entity.ai,
          news: news.slice(0, 5),
          lastPortVisited: portId,
        },
      },
    },
  };
}
