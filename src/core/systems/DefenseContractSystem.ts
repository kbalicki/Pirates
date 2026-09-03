/**
 * DefenseContractSystem — the governor asks.
 *
 * v0.16.0 made somebody else's colony defensible: stand off an allied harbour
 * when a landing arrives and you fight it, for reputation and the wrecked
 * transports. What it did not add was any way to *be asked*. The player had to
 * happen to be there, which meant reading a news item, guessing a date, and
 * loitering — and the reward for guessing right was a fight he had not been
 * promised anything for. A whole branch of the game was reachable only by
 * accident.
 *
 * This is the commission. A governor of a crown that counts the captain as one
 * of its own, with a landing bearing down on one of its colonies, offers gold
 * and standing for the town being held. It is the first hand-authored quest
 * chain in the game, and the first thing that fires `reach_port` — a trigger
 * `QuestSystem` has supported and covered by tests since v0.12.0 while nothing
 * in any scene emitted it.
 *
 * ## The chain
 *
 *   sail   — get to the town      reach_port      → stand
 *                                 days_passed(n)  → late   (fail)
 *   stand  — hold it              defense_held_X  → paid   (gold, standing)
 *                                 defense_lost_X  → fell   (fail)
 *                                 days_passed(25) → late   (fail)
 *
 * The two joints are deliberately different in kind. Getting there is a
 * position, so it is `reach_port`. Holding it is an outcome, so it is a world
 * flag — and `settleRelief` stamps that flag on *every* path a landing can be
 * settled by, which is what lets the contract pay out whether the player fought
 * the battle round by round in `CityDefenseScene`, sailed off and left the
 * garrison to it, or broke the squadron at sea before it ever arrived.
 *
 * That last case is the one worth pointing at: sinking the transports two
 * hundred miles from the town does not settle a landing, so no flag is stamped
 * and the contract simply runs out its clock. Correct, and slightly cruel — the
 * governor pays for a town defended, not for a fleet mislaid.
 *
 * ## Why the deadline is baked at signing
 *
 * `days_passed` counts from the day the stage was entered, and `QuestDef`s for
 * quest *instances* are rebuilt from `questLog` data on every load
 * (`buildQuestRegistry`). So the window has to be a number that does not move:
 * it is computed once from the arrival day and the day the captain shook hands,
 * and stored. Recomputing it against "today" would quietly extend the deadline
 * every time the game was reloaded.
 */

import type { WorldState } from "../model/WorldState.ts";
import type { QuestDef } from "./QuestSystem.ts";
import { startQuest } from "./QuestSystem.ts";
import { CITIES } from "../data/cities.ts";
import { FACTIONS } from "../data/factions.ts";
import { portFaction, SIZE_SOLDIERS } from "./SiegeSystem.ts";
import {
  alliedWith,
  playerHolds,
  expeditionsInFlight,
  expeditionFromEvent,
  DEFENSE_HELD_FLAG,
  DEFENSE_LOST_FLAG,
} from "./ReconquestSystem.ts";

// ── Constants ─────────────────────────────────────────────

/** Quest ids for a commission all start with this. */
export const DEFENSE_QUEST_PREFIX = "defense_";

/**
 * Days of grace past the landing's arrival before the contract lapses.
 *
 * The passage estimate in the news is what the governor has, and a fleet at sea
 * does not keep to a timetable. Three days is enough that a captain who sailed
 * straight there is never punished for the weather.
 */
export const ARRIVAL_GRACE_DAYS = 3;

/** Days the captain may stand on the wall before the commission is written off. */
export const STATION_LIMIT_DAYS = 25;

/** A landing this close is already unreachable; the governor does not ask. */
export const MIN_NOTICE_DAYS = 2;

/** Gold per soldier in the boats, on top of the flat fee. */
export const REWARD_PER_SOLDIER = 5;
/** Flat fee for taking the commission at all. */
export const REWARD_BASE = 300;
/** Standing gained with the crown that asked. */
export const CONTRACT_REPUTATION = 15;

// ── The offer ─────────────────────────────────────────────

export type DefenseContract = {
  /** The colony under threat. */
  portKey: string;
  /** Localised town name, so the quest log reads without a lookup. */
  portName: string;
  /** The crown that is asking. */
  holder: string;
  /** The crown in the boats. */
  claimant: string;
  /** The landing this contract is about. */
  eventId: string;
  /** Day the squadron is expected off the harbour. */
  arrivalDay: number;
  /** Day the captain took the commission. */
  acceptedDay: number;
  soldiers: number;
  reward: number;
};

export function defenseQuestId(portKey: string): string {
  return DEFENSE_QUEST_PREFIX + portKey;
}

/** The commission the captain is under right now, if any. */
export function activeContract(world: WorldState): DefenseContract | undefined {
  for (const runtime of world.player.questLog) {
    if (runtime.completed) continue;
    if (!(runtime.questId as string).startsWith(DEFENSE_QUEST_PREFIX)) continue;
    const contract = runtime.data.contract as DefenseContract | undefined;
    if (contract) return contract;
  }
  return undefined;
}

/** What holding this town is worth to the crown that owns it. */
export function contractReward(portKey: string, soldiers: number): number {
  const def = CITIES[portKey];
  const weight = def ? SIZE_SOLDIERS[def.population] / SIZE_SOLDIERS.small : 1;
  return Math.round(REWARD_BASE * weight + soldiers * REWARD_PER_SOLDIER);
}

/**
 * What the governor of this port has to ask, if anything.
 *
 * Four gates, and each of them is a different kind of "no":
 *
 *   not their captain    — a governor does not hand his colonies to a stranger
 *   already under one    — one commission at a time; a captain cannot be in
 *                          two harbours, and two payouts for one battle would
 *                          be the obvious exploit
 *   the player's own town — he took it off this crown; they are not paying him
 *                          to keep it
 *   too late to sail     — an offer nobody could accept in time is worse than
 *                          no offer
 *
 * The soonest landing wins, so the crown asks about the fire it is actually
 * standing in front of.
 */
export function offerFor(world: WorldState, portKey: string): DefenseContract | undefined {
  const holder = portFaction(world, portKey) as string;
  if (!holder || holder === "pirates") return undefined;
  if (!alliedWith(world, holder)) return undefined;
  if (activeContract(world)) return undefined;

  let best: DefenseContract | undefined;
  for (const event of expeditionsInFlight(world)) {
    const target = event.ports[0];
    if (!CITIES[target]) continue;
    if ((portFaction(world, target) as string) !== holder) continue;
    if (playerHolds(world, target)) continue;
    if (event.endDay - world.time.day < MIN_NOTICE_DAYS) continue;

    const expedition = expeditionFromEvent(event);
    const candidate: DefenseContract = {
      portKey: target,
      portName: CITIES[target].name,
      holder,
      claimant: event.factions[0],
      eventId: event.id,
      arrivalDay: event.endDay,
      acceptedDay: world.time.day,
      soldiers: expedition.soldiers,
      reward: contractReward(target, expedition.soldiers),
    };
    if (!best || candidate.arrivalDay < best.arrivalDay) best = candidate;
  }
  return best;
}

// ── The quest ─────────────────────────────────────────────

/**
 * Rebuild the chain from a signed contract.
 *
 * Every number in here comes out of the contract, never out of `world`: this is
 * called from `buildQuestRegistry` on load as well as at signing, and a
 * definition that read the clock would drift between the two.
 */
export function defenseQuest(contract: DefenseContract): QuestDef {
  const id = defenseQuestId(contract.portKey);
  const window = Math.max(
    MIN_NOTICE_DAYS,
    contract.arrivalDay - contract.acceptedDay + ARRIVAL_GRACE_DAYS,
  );
  const vars = {
    port: contract.portName,
    faction: FACTIONS[contract.holder]?.name ?? contract.holder,
    enemy: FACTIONS[contract.claimant]?.name ?? contract.claimant,
    soldiers: contract.soldiers,
    gold: contract.reward,
    days: window,
  };

  return {
    id,
    titleKey: "quest.defense_title",
    start: "sail",
    stages: {
      sail: {
        id: "sail",
        objectiveKey: "quest.defense_sail",
        vars,
        on: [
          { trigger: { type: "reach_port", portId: contract.portKey }, next: "stand" },
          { trigger: { type: "days_passed", days: window }, next: "late" },
        ],
      },
      stand: {
        id: "stand",
        objectiveKey: "quest.defense_stand",
        vars,
        on: [
          {
            trigger: { type: "flag_set", key: DEFENSE_HELD_FLAG + contract.portKey },
            next: "paid",
            effects: [
              { type: "gold", amount: contract.reward },
              { type: "reputation", faction: contract.holder, amount: CONTRACT_REPUTATION },
              { type: "log", key: "quest.defense_paid", vars },
            ],
          },
          {
            trigger: { type: "flag_set", key: DEFENSE_LOST_FLAG + contract.portKey },
            next: "fell",
            effects: [{ type: "log", key: "quest.defense_fell", vars }],
          },
          { trigger: { type: "days_passed", days: STATION_LIMIT_DAYS }, next: "late" },
        ],
      },
      paid: { id: "paid", objectiveKey: "quest.defense_paid", vars, completes: true },
      fell: { id: "fell", objectiveKey: "quest.defense_fell", vars, fails: true },
      late: { id: "late", objectiveKey: "quest.defense_late", vars, fails: true },
    },
  };
}

/**
 * Sign it.
 *
 * The contract goes into the quest's own `data`, the way a treasure map and a
 * family chain do, so `buildQuestRegistry` can put the definition back together
 * from the log alone and nothing new has to be saved.
 */
export function acceptDefenseContract(world: WorldState, contract: DefenseContract): WorldState {
  return startQuest(world, defenseQuest(contract), { contract });
}
