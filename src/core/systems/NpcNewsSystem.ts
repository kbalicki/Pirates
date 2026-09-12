/**
 * What a passing ship tells you, and what you have to close with her for.
 *
 * An NPC is born out of a departure port carrying that town's noticeboard
 * (`NpcSpawnSystem`) and vanishes again at her destination, so the sea is full
 * of hulls with something to say. That is the third step of the information
 * layer built in v0.28.0–v0.30.0: events → port boards → carriers → the player.
 *
 * ## What was wrong with it (v0.62.0)
 *
 * The carrier step had **two** channels and neither worked as written.
 *
 *   1. This module ran at `HAIL_RANGE = 30` and took **three** items off her
 *      board, silently. The `npc_news` event it produced was declared in
 *      `Events.ts`, pushed by `WorldEngine`, and had **no `case` anywhere** —
 *      so nothing was ever said on the screen. The items landed in the journal
 *      and in `knownEventIds`, which is why chart marks, expedition courses and
 *      a hurricane's road appeared without anyone mentioning them.
 *   2. `ShipEncounterScene` — the ship you actually chose to hail, at
 *      `ENCOUNTER_RANGE = 18` — is written correctly: it registers what it
 *      shows. But it could never have anything to register.
 *
 * Because thirty is further out than eighteen, (1) always fired before (2) was
 * reachable. Measured over 8 seeds × 10 years: a board carries **2.36** items
 * on average (the cap is `NEWS_ON_A_BOARD = 5`, but `getPortNews` keeps only
 * what touches that town or its crown), so **three items is her whole board**.
 * The reply the player chose was therefore a no-op that redisplayed what a
 * silent rule twelve units further out had handed him a moment earlier — and
 * the granting code behind it had never once had anything left to grant.
 *
 * ## The split now
 *
 * News is scarce and worth a decision: one board covers **15%** of the ~16
 * events live in the world at a time, three boards **26%**. So it is worth
 * splitting rather than giving away.
 *
 *   - **A hail across the water** (`HAIL_RANGE`) gives **one** item, and says
 *     so. The one it gives is the top of her board, which since v0.57.0 is
 *     sorted by reach — the thing that concerns her own town most, which is
 *     exactly what a man shouts across a hundred yards of sea.
 *   - **Going alongside** — the encounter screen — gives the rest, and now it
 *     registers. `takeNpcNews` is what that reply calls.
 *
 * Once hailed, a ship does not shout again: `AiData.hailed` says so. Without
 * it the one-item rule was worth nothing, because the check runs once a second
 * and would have handed over item two, then three, then her whole board, to a
 * captain sailing quietly alongside.
 */

import type { WorldState } from "../model/WorldState.ts";
import type { NewsItem } from "../model/EntityState.ts";
import { vec2Dist } from "../services/Geometry.ts";
import { addLogEntry } from "./EventLogSystem.ts";

/**
 * How far a ship will call across to another.
 *
 * Wider than `ENCOUNTER_RANGE` (18) on purpose: a hail happens before you are
 * close enough to talk, and the difference between the two is the whole point
 * of the split.
 */
export const HAIL_RANGE = 30;

/** How much a hail is worth. The rest is behind the decision to close. */
export const HAIL_ITEMS = 1;

/** Behaviors that will share news with the player at all. */
const FRIENDLY_BEHAVIORS = new Set(["trader", "navy", "escort"]);

export type NewsExchangeResult = {
  world: WorldState;
  /** What was heard this tick — empty when nothing was. */
  newNews: NewsItem[];
};

/** Items on this ship's board the player does not already know. */
export function freshNews(world: WorldState, npcId: string): NewsItem[] {
  const known = new Set(world.knownEventIds ?? []);
  const carried = world.entities[npcId]?.ai?.news ?? [];
  return carried.filter(n => !known.has(n.eventId));
}

/** Write news into what the captain knows, and into his journal. */
function receive(world: WorldState, items: NewsItem[]): WorldState {
  if (items.length === 0) return world;
  const known = new Set(world.knownEventIds ?? []);
  for (const n of items) known.add(n.eventId);
  let w: WorldState = { ...world, knownEventIds: [...known] };
  for (const n of items) w = addLogEntry(w, n.headline, n.vars);
  return w;
}

/**
 * Everything she still has that the captain does not.
 *
 * What the encounter screen's reply calls. The screen used to do this itself,
 * correctly, inside the loop that drew the lines — and it was dead code, since
 * the hail had taken her whole board before the screen could open. It lives
 * here now because the two channels have to agree about what "already known"
 * means, and because a scene is the wrong place to keep that rule.
 */
export function takeNpcNews(world: WorldState, npcId: string): NewsExchangeResult {
  const items = freshNews(world, npcId);
  if (items.length === 0) return { world, newNews: [] };
  return { world: receive(world, items), newNews: items };
}

/**
 * The hail. Called every ~20 ticks from the engine.
 *
 * One item per ship, once per ship, and it is announced — see the header for
 * why all three of those are the fix rather than three separate choices.
 */
export function checkNpcNewsExchange(world: WorldState): NewsExchangeResult {
  const playerShipId = world.player.shipId as string;
  const playerEntity = world.entities[playerShipId];
  if (!playerEntity || playerEntity.mode !== "sailing") {
    return { world, newNews: [] };
  }

  const heard: NewsItem[] = [];
  let entities = world.entities;
  let w = world;

  for (const [id, entity] of Object.entries(world.entities)) {
    if (id === playerShipId) continue;
    if (entity.kind !== "ship" || !entity.ai) continue;
    if (!FRIENDLY_BEHAVIORS.has(entity.ai.behavior)) continue;
    if (entity.ai.hailed) continue;
    if (vec2Dist(entity.pos, playerEntity.pos) > HAIL_RANGE) continue;

    // Marked whatever she had to say, so a captain sailing alongside does not
    // collect her board an item a second.
    entities = { ...entities, [id]: { ...entity, ai: { ...entity.ai, hailed: true } } };

    const fresh = freshNews(w, id);
    if (fresh.length === 0) continue;
    const shouted = fresh.slice(0, HAIL_ITEMS);
    heard.push(...shouted);
    w = receive(w, shouted);
  }

  if (entities === world.entities) return { world, newNews: [] };
  return { world: { ...w, entities }, newNews: heard };
}
