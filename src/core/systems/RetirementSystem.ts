/**
 * RetirementSystem — how a career is scored when the captain hangs up his sword.
 *
 * Without an ending a Caribbean career is an infinite loop: there is no reason
 * to stop, so nothing you accumulate ever gets weighed. Retirement closes the
 * arc `PlunderSystem` and `AgingSystem` open — the crew keeps asking for its
 * share, the sword arm keeps slowing, and at some point the sensible move is to
 * take the land the governor is offering and count what you have.
 *
 * ## Scoring
 *
 * Five sources, deliberately different in kind so no single grind dominates:
 *
 *   wealth       gold kept plus what the fleet is worth
 *   standing     ranks held with every faction
 *   reputation   how much of the Caribbean is glad to see you
 *   fame         notoriety — the pirate's own ledger
 *   longevity    years survived at sea, with a bonus for retiring in one piece
 *   conquest     towns stormed and taken (v0.13.0)
 *   family       relatives freed, and whether the captain married (v0.14.0)
 *
 * The last two are deliberately the only lines that cannot be ground out in a
 * final year of raiding: a marriage takes dozens of visits to one town and a
 * rank her father will accept, and the family thread takes three voyages
 * across the map. They are what makes an old career worth more than a rich one.
 *
 * The age term is the interesting one: retiring young is worth less because
 * there is less career behind it, but every year past the decline also costs
 * something, so the best score is not "sail until you die". There is a right
 * moment, and finding it is the game.
 */

import type { WorldState } from "../model/WorldState.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { captainAge, AGE_DECLINING_FROM } from "./AgingSystem.ts";
import { marriagePoints } from "./RomanceSystem.ts";
import { relativesFreed } from "./FamilyQuestSystem.ts";

/** World flag set once the captain has retired. */
export const RETIRED_FLAG = "captain_retired";

export type ScoreLine = {
  /** i18n key naming this line. */
  key: string;
  /** Raw quantity behind it (gold, ranks, years...). */
  amount: number;
  points: number;
};

export type RetirementScore = {
  lines: ScoreLine[];
  total: number;
  age: number;
  yearsAtSea: number;
  /** i18n key of the rank the score earns, from "beggar" up to "legend". */
  titleKey: string;
};

const TITLE_THRESHOLDS: { min: number; key: string }[] = [
  { min: 12000, key: "retire.title_legend" },
  { min: 6000, key: "retire.title_admiral" },
  { min: 3000, key: "retire.title_captain" },
  { min: 1200, key: "retire.title_privateer" },
  { min: 400, key: "retire.title_sailor" },
  { min: 0, key: "retire.title_pauper" },
];

/** What the fleet would fetch: flagship plus consorts, at half the yard price. */
export function fleetValue(world: WorldState): number {
  const ship = world.entities[world.player.shipId as string]?.ship;
  let total = 0;
  if (ship) total += (SHIP_CLASSES[ship.classId as string]?.buyPrice ?? 0) / 2;
  for (const escort of world.player.fleet ?? []) {
    total += (SHIP_CLASSES[escort.classId]?.buyPrice ?? 0) / 2;
  }
  return Math.round(total);
}

/**
 * Score the career as it stands. Pure and side-effect free, so the cabin can
 * show a running total long before the player commits to anything.
 */
export function computeScore(world: WorldState): RetirementScore {
  const age = captainAge(world);
  const yearsAtSea = Math.max(0, age - (world.captain?.startAge ?? 20));

  const gold = Math.max(0, world.player.gold);
  const ships = fleetValue(world);
  const rankTotal = Object.values(world.player.ranks ?? {}).reduce((a, b) => a + b, 0);
  const goodwill = Object.values(world.player.reputation ?? {})
    .reduce((sum, rep) => sum + Math.max(0, rep), 0);
  const fame = Math.max(0, world.player.notoriety);

  // Every year at sea is worth 40; every year past the decline costs 70, so a
  // year spent after 50 is net negative and the term peaks right at the point
  // where the captain's body starts letting him down. That is the whole shape
  // of the ending: stop too early and there is no career behind you, sail on
  // forever and you give it back.
  const overstayed = Math.max(0, age - AGE_DECLINING_FROM);
  const longevityPoints = Math.max(0, Math.round(yearsAtSea * 40 - overstayed * 70));

  const towns = Math.max(0, world.player.citiesCaptured ?? 0);
  const freed = relativesFreed(world);
  const marriage = marriagePoints(world);

  const lines: ScoreLine[] = [
    { key: "retire.line_gold", amount: gold, points: Math.round(gold / 10) },
    { key: "retire.line_fleet", amount: ships, points: Math.round(ships / 20) },
    { key: "retire.line_ranks", amount: rankTotal, points: rankTotal * 300 },
    { key: "retire.line_reputation", amount: Math.round(goodwill), points: Math.round(goodwill * 4) },
    { key: "retire.line_fame", amount: fame, points: fame * 12 },
    { key: "retire.line_years", amount: yearsAtSea, points: longevityPoints },
    { key: "retire.line_towns", amount: towns, points: towns * 400 },
    { key: "retire.line_family", amount: freed, points: freed * 700 },
    { key: "retire.line_marriage", amount: marriage > 0 ? 1 : 0, points: marriage },
  ];

  const total = lines.reduce((sum, l) => sum + l.points, 0);
  const titleKey = (TITLE_THRESHOLDS.find(t => total >= t.min) ?? TITLE_THRESHOLDS[TITLE_THRESHOLDS.length - 1]).key;

  return { lines, total, age, yearsAtSea, titleKey };
}

export function hasRetired(world: WorldState): boolean {
  return world.worldFlags[RETIRED_FLAG] === true;
}

export type RetireResult = {
  world: WorldState;
  score: RetirementScore;
  error?: "already_retired" | "not_in_port";
};

/**
 * Hang up the sword. Only in port, and only once — the score is frozen into
 * the world so the summary screen and any later save both agree on it.
 */
export function retire(world: WorldState): RetireResult {
  const score = computeScore(world);
  if (hasRetired(world)) return { world, score, error: "already_retired" };
  if (world.player.location.type !== "port") return { world, score, error: "not_in_port" };

  const retired: WorldState = {
    ...world,
    worldFlags: { ...world.worldFlags, [RETIRED_FLAG]: true },
    player: { ...world.player, retirementScore: score.total },
  };

  return {
    world: addLogEntry(retired, "event.retired", { score: score.total }),
    score,
  };
}
