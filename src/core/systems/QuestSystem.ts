/**
 * QuestSystem — a small state machine per quest.
 *
 * Until v0.12.0 this file held two array helpers and a comment saying the FSM
 * was not built yet, and `QUESTS` was an empty map. Nothing in the game had a
 * goal beyond "keep sailing". This is the machine, and treasure maps are its
 * first real consumer.
 *
 * ## Shape
 *
 * A quest is a set of stages. Each stage says what the player should be doing
 * (`objectiveKey`) and lists what moves it on: a trigger plus the stage to go
 * to, optionally with effects. Triggers are data, like dialogue conditions, so
 * a quest can be authored, saved and asserted without any code behind it.
 *
 *   stage "sail"  on reach_port(tortuga)      → "dig"
 *   stage "dig"   on dig_at(x, y, r)          → "done"   (+ gold)
 *   stage "done"  completes
 *
 * Rewards reuse `DialogueEffect` rather than inventing a second effect
 * vocabulary — gold, reputation, flags and log lines are the same things a
 * conversation hands out, and `applyEffect` already knows how to apply them.
 *
 * ## Runtime
 *
 * Progress lives in `player.questLog` as `QuestRuntimeState`, which already
 * existed. `data` carries whatever the quest needs to remember — for a
 * treasure hunt that is the buried location and how precise the map is — so no
 * new save fields were needed for the machine itself.
 */

import type { WorldState, QuestRuntimeState } from "../model/WorldState.ts";
import type { QuestId } from "../model/ids.ts";
import { questId as makeQuestId } from "../model/ids.ts";
import type { DialogueEffect } from "./DialogueSystem.ts";
import { applyEffect } from "./DialogueSystem.ts";

export type QuestTrigger =
  /** The player enters a specific port. */
  | { type: "reach_port"; portId: string }
  /** The player digs within `radius` world units of a point. */
  | { type: "dig_at"; x: number; y: number; radius: number }
  /** A world flag has been set. */
  | { type: "flag_set"; key: string }
  /** N days have passed since the quest reached this stage. */
  | { type: "days_passed"; days: number };

export type QuestTransition = {
  trigger: QuestTrigger;
  /** Stage to move to. */
  next: string;
  effects?: DialogueEffect[];
};

export type QuestStage = {
  id: string;
  /** i18n key describing the current objective, for the quest log. */
  objectiveKey: string;
  vars?: Record<string, string | number>;
  on?: QuestTransition[];
  /** Terminal: the quest is finished successfully. */
  completes?: boolean;
  /** Terminal: the quest is over and was not achieved. */
  fails?: boolean;
};

export type QuestDef = {
  id: string;
  titleKey: string;
  start: string;
  stages: Record<string, QuestStage>;
};

/** Registry of quest definitions the world knows about, by quest id. */
export type QuestRegistry = Record<string, QuestDef>;

// ── Log helpers (kept from the original placeholder) ──────

export function acceptQuest(questLog: QuestRuntimeState[], questId: QuestId): QuestRuntimeState[] {
  return [...questLog, {
    questId,
    stage: "started",
    data: {},
    accepted: true,
    completed: false,
  }];
}

export function abandonQuest(questLog: QuestRuntimeState[], questId: QuestId): QuestRuntimeState[] {
  return questLog.filter(q => q.questId !== questId);
}

// ── Starting and reading ──────────────────────────────────

/**
 * Put a quest in the log at its starting stage.
 *
 * `data` is whatever this instance needs to remember. Starting a quest that is
 * already in the log is refused rather than duplicated — two copies of the same
 * treasure hunt would both fire on the same dig.
 */
export function startQuest(
  world: WorldState,
  def: QuestDef,
  data: Record<string, unknown> = {},
): WorldState {
  if (world.player.questLog.some(q => (q.questId as string) === def.id)) return world;

  const entry: QuestRuntimeState = {
    questId: makeQuestId(def.id),
    stage: def.start,
    data: { ...data, startedDay: world.time.day },
    accepted: true,
    completed: false,
  };
  return { ...world, player: { ...world.player, questLog: [...world.player.questLog, entry] } };
}

export function findQuest(world: WorldState, questId: string): QuestRuntimeState | undefined {
  return world.player.questLog.find(q => (q.questId as string) === questId);
}

/** Quests still in play, with the stage they are on. */
export function activeQuests(
  world: WorldState,
  registry: QuestRegistry,
): { runtime: QuestRuntimeState; def: QuestDef; stage: QuestStage }[] {
  const result: { runtime: QuestRuntimeState; def: QuestDef; stage: QuestStage }[] = [];
  for (const runtime of world.player.questLog) {
    if (runtime.completed) continue;
    const def = registry[runtime.questId as string];
    const stage = def?.stages[runtime.stage];
    if (def && stage) result.push({ runtime, def, stage });
  }
  return result;
}

/** True when the quest finished and did so successfully. */
export function questSucceeded(world: WorldState, questId: string): boolean {
  const runtime = findQuest(world, questId);
  return runtime?.completed === true && runtime.data.outcome === "completed";
}

// ── Advancing ─────────────────────────────────────────────

function triggerMatches(
  trigger: QuestTrigger,
  event: QuestTrigger,
  runtime: QuestRuntimeState,
  world: WorldState,
): boolean {
  if (trigger.type !== event.type) return false;

  switch (trigger.type) {
    case "reach_port":
      return event.type === "reach_port" && trigger.portId === event.portId;
    case "flag_set":
      return event.type === "flag_set" && trigger.key === event.key
        && world.worldFlags[trigger.key] === true;
    case "dig_at": {
      if (event.type !== "dig_at") return false;
      const dx = event.x - trigger.x;
      const dy = event.y - trigger.y;
      return Math.sqrt(dx * dx + dy * dy) <= trigger.radius;
    }
    case "days_passed": {
      if (event.type !== "days_passed") return false;
      const since = world.time.day - Number(runtime.data.stageEnteredDay ?? runtime.data.startedDay ?? 0);
      return since >= trigger.days;
    }
  }
}

export type QuestAdvance = {
  world: WorldState;
  /** Quest ids that moved to a new stage. */
  advanced: string[];
  /** Quest ids that finished successfully. */
  completed: string[];
  /** Quest ids that ended in failure. */
  failed: string[];
};

/**
 * Feed one event to every active quest.
 *
 * Each quest takes at most one transition per event — a stage that could match
 * the same trigger twice would otherwise skip ahead in a single dig. Effects
 * fire in order, then the runtime moves.
 */
export function advanceQuests(
  world: WorldState,
  event: QuestTrigger,
  registry: QuestRegistry,
): QuestAdvance {
  let w = world;
  const advanced: string[] = [];
  const completed: string[] = [];
  const failed: string[] = [];

  const newLog = w.player.questLog.map(runtime => runtime);

  for (let i = 0; i < newLog.length; i++) {
    const runtime = newLog[i];
    if (runtime.completed) continue;

    const def = registry[runtime.questId as string];
    const stage = def?.stages[runtime.stage];
    if (!def || !stage?.on) continue;

    const transition = stage.on.find(tr => triggerMatches(tr.trigger, event, runtime, w));
    if (!transition) continue;

    for (const effect of transition.effects ?? []) {
      w = applyEffect(effect, w);
    }

    const nextStage = def.stages[transition.next];
    const isTerminal = !nextStage || nextStage.completes === true || nextStage.fails === true;

    newLog[i] = {
      ...runtime,
      stage: nextStage ? transition.next : runtime.stage,
      completed: isTerminal,
      data: {
        ...runtime.data,
        stageEnteredDay: w.time.day,
        ...(isTerminal ? { outcome: nextStage?.fails ? "failed" : "completed" } : {}),
      },
    };

    const id = runtime.questId as string;
    advanced.push(id);
    if (isTerminal) (nextStage?.fails ? failed : completed).push(id);
  }

  if (advanced.length === 0) return { world, advanced, completed, failed };

  return {
    world: { ...w, player: { ...w.player, questLog: newLog } },
    advanced,
    completed,
    failed,
  };
}

/**
 * Validate a quest definition: the start stage exists, every transition
 * resolves, and every non-terminal stage has at least one way out.
 * Returns a list of problems — empty means the quest is sound.
 */
export function validateQuest(def: QuestDef): string[] {
  const problems: string[] = [];
  if (!def.stages[def.start]) problems.push(`start stage "${def.start}" does not exist`);

  for (const [id, stage] of Object.entries(def.stages)) {
    if (stage.id !== id) problems.push(`stage "${id}" carries mismatched id "${stage.id}"`);

    const terminal = stage.completes || stage.fails;
    if (!terminal && (!stage.on || stage.on.length === 0)) {
      problems.push(`stage "${id}" is neither terminal nor has any way out`);
    }
    if (terminal && stage.on && stage.on.length > 0) {
      problems.push(`stage "${id}" is terminal but still lists transitions`);
    }
    for (const transition of stage.on ?? []) {
      if (!def.stages[transition.next]) {
        problems.push(`stage "${id}" points at missing stage "${transition.next}"`);
      }
    }
  }
  return problems;
}
