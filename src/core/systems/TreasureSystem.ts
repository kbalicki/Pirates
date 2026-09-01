/**
 * TreasureSystem — buried gold, and the maps that half-tell you where it is.
 *
 * The first reason to go ashore. `isOnFoot` walking has existed since v0.9.3
 * and had nothing to do; treasure maps give it a point, and give tavern rumours
 * something to sell.
 *
 * ## A map is a promise with error bars
 *
 * Every map names a spot and a `precision` — how badly it lies. A crude sketch
 * puts you within a few hundred units of the chest; a surveyor's chart within a
 * few dozen. Digging tells you whether you are on it, near it or nowhere, so a
 * bad map is still usable, just slower: you land, dig, walk toward "warmer",
 * and dig again.
 *
 * ## Some of them are bait
 *
 * A fraction of maps are sold by men who would rather have your purse than your
 * custom. Those resolve into an ambush at the dig site — which the game already
 * knows how to stage, because the captains fight it out in `DuelScene`.
 * Winning keeps the treasure and the reputation; losing costs gold.
 *
 * Everything here is seeded from `RngState`, so the same save digs up the same
 * chest twice and a test can pin exact numbers.
 */

import type { WorldState, RngState, Vec2 } from "../model/WorldState.ts";
import { rngNext, rngNextInt } from "../services/RNG.ts";
import type { QuestDef } from "./QuestSystem.ts";

/** How precise a map is, and what that costs to buy. */
export type MapQuality = "crude" | "fair" | "exact";

export type MapQualityDef = {
  id: MapQuality;
  /** World units within which a dig counts as finding the chest. */
  radius: number;
  /** Asking price in the tavern. */
  price: number;
  nameKey: string;
};

export const MAP_QUALITIES: MapQualityDef[] = [
  { id: "crude", radius: 220, price: 300, nameKey: "treasure.quality_crude" },
  { id: "fair", radius: 110, price: 800, nameKey: "treasure.quality_fair" },
  { id: "exact", radius: 45, price: 2000, nameKey: "treasure.quality_exact" },
];

/** Distance at which a dig reports "warmer" rather than nothing at all. */
export const WARM_MULTIPLIER = 3;

/** Share of maps that turn out to be an ambush. */
export const AMBUSH_CHANCE = 0.25;

export type TreasureMap = {
  /** Quest id this map is tracked under. */
  questId: string;
  /** Where the chest actually is, in world coordinates. */
  spot: Vec2;
  quality: MapQuality;
  /** Radius within which a dig finds it. */
  radius: number;
  /** Gold in the chest. */
  reward: number;
  /** True when the "map" is really an invitation to a fight. */
  ambush: boolean;
  /** Port whose tavern sold or told of it, for flavour. */
  fromPort: string;
  /** City key the chest is buried near — what the map actually names. */
  nearCity: string;
};

export type DigOutcome = "found" | "warm" | "cold";

export function qualityDef(quality: MapQuality): MapQualityDef {
  return MAP_QUALITIES.find(q => q.id === quality) ?? MAP_QUALITIES[0];
}

/**
 * Roll a new map for a spot that is already known to be diggable land.
 *
 * The caller picks the spot, because only the game layer knows where the land
 * is; this decides how good the map is, what is in the hole and whether anyone
 * is waiting by it.
 */
export function createTreasureMap(
  rng: RngState,
  spot: Vec2,
  quality: MapQuality,
  fromPort: string,
  nearCity = "",
): { map: TreasureMap; rng: RngState } {
  const def = qualityDef(quality);

  const rewardRoll = rngNextInt(rng, 400, 2500);
  let state = rewardRoll.state;

  const ambushRoll = rngNext(state);
  state = ambushRoll.state;

  const idRoll = rngNextInt(state, 100000, 999999);
  state = idRoll.state;

  return {
    map: {
      questId: `treasure_${idRoll.value}`,
      spot: { x: Math.round(spot.x), y: Math.round(spot.y) },
      quality,
      radius: def.radius,
      // A better map costs more and is worth more: the men who draw them
      // accurately also know which holes are worth drawing.
      reward: Math.round(rewardRoll.value * (quality === "exact" ? 1.6 : quality === "fair" ? 1.25 : 1)),
      ambush: ambushRoll.value < AMBUSH_CHANCE,
      fromPort,
      nearCity,
    },
    rng: state,
  };
}

/** How a dig at `pos` resolves against a map. */
export function digOutcome(map: TreasureMap, pos: Vec2): DigOutcome {
  const dx = pos.x - map.spot.x;
  const dy = pos.y - map.spot.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= map.radius) return "found";
  if (dist <= map.radius * WARM_MULTIPLIER) return "warm";
  return "cold";
}

/** Bearing from a dig back toward the chest, as an i18n key for a compass hint. */
export function digHintKey(map: TreasureMap, pos: Vec2): string {
  const dx = map.spot.x - pos.x;
  const dy = map.spot.y - pos.y;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  // Screen y grows downward, so "north" is negative dy.
  const compass = ["treasure.dir_e", "treasure.dir_se", "treasure.dir_s", "treasure.dir_sw",
                   "treasure.dir_w", "treasure.dir_nw", "treasure.dir_n", "treasure.dir_ne"];
  const index = ((Math.round(deg / 45) % 8) + 8) % 8;
  return compass[index];
}

/**
 * The quest definition for one map.
 *
 * Two stages and no more: dig in the right place, and it is over. The reward is
 * handed out by the transition's effects, so a completed hunt pays even if the
 * scene that triggered it has already been torn down.
 */
export function treasureQuest(map: TreasureMap): QuestDef {
  return {
    id: map.questId,
    titleKey: "treasure.quest_title",
    start: "search",
    stages: {
      search: {
        id: "search",
        objectiveKey: "treasure.objective_search",
        vars: { city: map.nearCity, port: map.fromPort },
        on: [
          {
            trigger: { type: "dig_at", x: map.spot.x, y: map.spot.y, radius: map.radius },
            next: "found",
            // An ambush pays nothing here — the fight decides, and the game
            // layer awards the chest only once the duel is won.
            effects: map.ambush
              ? [{ type: "log", key: "treasure.log_ambush" }]
              : [
                  { type: "gold", amount: map.reward },
                  { type: "log", key: "treasure.log_found", vars: { gold: map.reward } },
                ],
          },
        ],
      },
      found: { id: "found", objectiveKey: "treasure.objective_done", completes: true },
    },
  };
}

/** Maps the player is still hunting, newest first. */
export function activeTreasureMaps(world: WorldState): TreasureMap[] {
  return world.player.questLog
    .filter(q => !q.completed && (q.questId as string).startsWith("treasure_"))
    .map(q => q.data.map as TreasureMap)
    .filter((m): m is TreasureMap => !!m)
    .reverse();
}

/**
 * Where a chest ends up: near a named city, a short walk from the shore.
 *
 * The spot is derived from the city rather than from the terrain grid, which
 * only the map scene has. Every city sits on land and the offset is small
 * compared with even an exact map's radius, so the search area always overlaps
 * ground the player can actually stand on.
 */
export const BURIAL_MAX_OFFSET = 150;

export function pickBurialSpot(rng: RngState, cityPos: Vec2): { spot: Vec2; rng: RngState } {
  const angleRoll = rngNext(rng);
  const distRoll = rngNext(angleRoll.state);
  const angle = angleRoll.value * Math.PI * 2;
  const dist = 40 + distRoll.value * (BURIAL_MAX_OFFSET - 40);
  return {
    spot: {
      x: cityPos.x + Math.cos(angle) * dist,
      y: cityPos.y + Math.sin(angle) * dist,
    },
    rng: distRoll.state,
  };
}

/**
 * What a tavern is willing to sell today.
 *
 * One map per port per day, its quality drawn from the port's own luck — a
 * quiet outpost deals in rumours, a capital sometimes has a real chart.
 */
export function tavernMapQuality(rng: RngState, portWealth: number): { quality: MapQuality; rng: RngState } {
  const roll = rngNext(rng);
  const wealthBias = Math.max(0, Math.min(1, portWealth / 1000));
  const value = roll.value + wealthBias * 0.35;
  const quality: MapQuality = value > 0.92 ? "exact" : value > 0.62 ? "fair" : "crude";
  return { quality, rng: roll.state };
}
