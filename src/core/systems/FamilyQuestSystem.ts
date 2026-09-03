/**
 * FamilyQuestSystem — the reason the captain went to sea in the first place.
 *
 * `QUESTS` in `core/data/quests.ts` has been an empty map since v0.5.6, with a
 * comment promising hand-authored quests. Treasure maps (v0.12.0) proved the
 * machine works but they are generated filler: a hole, a number, done. This is
 * the first thread with a beginning, a middle and an end that the player is
 * meant to remember.
 *
 * ## The shape
 *
 * A marquis of the crown that hates the captain's own took the family and
 * scattered them across three of his towns. Each step names one town and one
 * relative. Getting there is the sailing; getting them out is a duel on the
 * quayside, because that is how this game settles anything personal.
 *
 *   step 0   the sister    →  flag family_step_0  →  step 1
 *   step 1   the brother   →  flag family_step_1  →  step 2
 *   step 2   the father    →  flag family_step_2  →  done
 *
 * The flags are the join between the pure quest machine and the scene that
 * stages the fight: `QuestSystem` knows nothing about duels, and `DuelScene`
 * knows nothing about quests, so the scene sets a flag and the machine notices.
 *
 * ## Where a chain comes from
 *
 * Like a treasure map, a chain is an *instance*: the three towns are drawn
 * once, stored in the quest's own `data`, and the `QuestDef` is rebuilt from
 * them whenever the registry is needed. Nothing new goes into `WorldState` for
 * it. Unlike a treasure map, there is only ever one — a captain has one family.
 */

import type { WorldState, RngState } from "../model/WorldState.ts";
import { CITIES } from "../data/cities.ts";
import { FACTIONS } from "../data/factions.ts";
import { rngNextInt } from "../services/RNG.ts";
import type { QuestDef } from "./QuestSystem.ts";
import { startQuest, findQuest } from "./QuestSystem.ts";
import { portFaction } from "./SiegeSystem.ts";

export const FAMILY_QUEST_ID = "family_search";
/** Flag prefix the rescue scene sets; the quest machine watches for it. */
export const FAMILY_STEP_FLAG = "family_step_";
/** What an informer in a tavern wants for the first name and place. */
export const INFORMER_PRICE = 200;

export type Relative = "sister" | "brother" | "father";

export const RELATIVE_ORDER: Relative[] = ["sister", "brother", "father"];

export type FamilyStep = {
  portKey: string;
  relative: Relative;
};

export type FamilyChain = {
  /** Crown whose marquis holds them. */
  villainFaction: string;
  steps: FamilyStep[];
};

/** Gold each rescue is worth — the family was not taken for nothing. */
export const STEP_REWARD = [800, 1500, 3000];

/**
 * Whose marquis did it: the crown that likes the captain's own least.
 *
 * Derived rather than fixed so that a Spanish captain hunts an English
 * marquis. The story is the same; the map it happens on is not.
 */
export function villainFactionFor(nationality: string): string {
  const relations = FACTIONS[nationality]?.relations ?? {};
  let worst = "spain";
  let worstValue = Infinity;
  for (const [faction, value] of Object.entries(relations)) {
    // Pirates hold no marquis and no towns worth naming at the start.
    if (faction === "pirates" || faction === nationality) continue;
    if (value < worstValue) { worstValue = value; worst = faction; }
  }
  return worst;
}

/** Towns of that crown a marquis could plausibly hide someone in. */
export function candidatePorts(world: WorldState, villainFaction: string): string[] {
  return Object.keys(CITIES)
    .filter(key => (portFaction(world, key) as string) === villainFaction)
    .filter(key => CITIES[key].type !== "outpost")
    .sort();
}

/**
 * Draw the three towns.
 *
 * Sorted candidates plus a seeded draw means the same save always produces the
 * same chain, and a test can name the ports it expects.
 */
export function createFamilyChain(world: WorldState, rng: RngState): { chain: FamilyChain; rng: RngState } {
  const villainFaction = villainFactionFor(world.captain?.nationality ?? "england");
  const pool = candidatePorts(world, villainFaction);
  const steps: FamilyStep[] = [];
  let state = rng;

  const remaining = [...pool];
  for (let i = 0; i < RELATIVE_ORDER.length; i++) {
    if (remaining.length === 0) break;
    const pick = rngNextInt(state, 0, remaining.length - 1);
    state = pick.state;
    steps.push({ portKey: remaining.splice(pick.value, 1)[0], relative: RELATIVE_ORDER[i] });
  }

  return { chain: { villainFaction, steps }, rng: state };
}

/**
 * The quest definition for one chain.
 *
 * Rewards use `DialogueEffect` like every other quest, so the payout survives
 * the scene that triggered it being torn down. The last step also pays in
 * standing: freeing a family the marquis took is the sort of thing that gets
 * told in every tavern on the coast.
 */
export function familyQuest(chain: FamilyChain, nationality: string): QuestDef {
  const stages: QuestDef["stages"] = {};

  chain.steps.forEach((step, i) => {
    const last = i === chain.steps.length - 1;
    stages["step" + i] = {
      id: "step" + i,
      objectiveKey: "family.objective_" + step.relative,
      vars: { port: CITIES[step.portKey]?.name ?? step.portKey },
      on: [{
        trigger: { type: "flag_set", key: FAMILY_STEP_FLAG + i },
        next: last ? "done" : "step" + (i + 1),
        effects: last
          ? [
              { type: "gold", amount: STEP_REWARD[i] ?? 1000 },
              { type: "reputation", faction: nationality, amount: 20 },
              { type: "log", key: "family.log_reunited", vars: { gold: STEP_REWARD[i] ?? 1000 } },
            ]
          : [
              { type: "gold", amount: STEP_REWARD[i] ?? 800 },
              { type: "log", key: "family.log_freed_" + step.relative },
            ],
      }],
    };
  });

  stages.done = { id: "done", objectiveKey: "family.objective_done", completes: true };

  return {
    id: FAMILY_QUEST_ID,
    titleKey: "family.quest_title",
    start: "step0",
    stages,
  };
}

/** The chain the captain is following, if any. */
export function activeFamilyChain(world: WorldState): FamilyChain | undefined {
  const runtime = findQuest(world, FAMILY_QUEST_ID);
  return runtime?.data.chain as FamilyChain | undefined;
}

/** Index of the step the captain is on; undefined once it is finished. */
export function currentStepIndex(world: WorldState): number | undefined {
  const runtime = findQuest(world, FAMILY_QUEST_ID);
  if (!runtime || runtime.completed) return undefined;
  const index = Number(String(runtime.stage).replace("step", ""));
  return Number.isFinite(index) ? index : undefined;
}

/** The step to be done here, if this is the town the trail leads to. */
export function stepAtPort(world: WorldState, portKey: string): { step: FamilyStep; index: number } | undefined {
  const chain = activeFamilyChain(world);
  const index = currentStepIndex(world);
  if (!chain || index === undefined) return undefined;
  const step = chain.steps[index];
  if (!step || step.portKey !== portKey) return undefined;
  return { step, index };
}

/**
 * Start the hunt.
 *
 * Two ways in, and both are legitimate: pay an informer in a tavern, or hear it
 * over dinner from a governor's daughter who has come to trust you. The second
 * is free, which is the point — `RomanceSystem` needed somewhere for its
 * middle threshold to lead.
 */
export function startFamilySearch(world: WorldState, rng: RngState): { world: WorldState; rng: RngState; started: boolean } {
  if (findQuest(world, FAMILY_QUEST_ID)) return { world, rng, started: false };

  const { chain, rng: next } = createFamilyChain(world, rng);
  if (chain.steps.length === 0) return { world, rng: next, started: false };

  const def = familyQuest(chain, world.captain?.nationality ?? "england");
  return { world: startQuest(world, def, { chain }), rng: next, started: true };
}

/**
 * Mark one relative free. The quest machine picks the flag up on the next
 * `advanceQuests` call, which is what actually pays and moves the stage.
 */
export function freeRelative(world: WorldState, index: number): WorldState {
  return { ...world, worldFlags: { ...world.worldFlags, [FAMILY_STEP_FLAG + index]: true } };
}

/** How many of the family are out, for the retirement ledger. */
export function relativesFreed(world: WorldState): number {
  return RELATIVE_ORDER.reduce(
    (count, _, i) => count + (world.worldFlags[FAMILY_STEP_FLAG + i] === true ? 1 : 0),
    0,
  );
}
