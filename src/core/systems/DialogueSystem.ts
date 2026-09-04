/**
 * DialogueSystem — data-driven conversations.
 *
 * The old `DialogueScene` rendered the words "Dialogue Scene (TODO)" and was
 * deleted in v0.9.8.1. This is the real thing, and it is deliberately *not* a
 * scene: a conversation is a data structure plus a reducer, so the same tree
 * can be drawn inside the port dialog box, in a full-screen scene, or asserted
 * in a test with no Phaser anywhere near it.
 *
 * ## The shape of a conversation
 *
 * A `DialogueTree` is a map of nodes. A node is one thing the other person
 * says plus the replies available to the player. A reply may be gated on world
 * state (`when`), may change the world (`effects`), and either points at the
 * next node or ends the conversation.
 *
 *   node "greeting"
 *     ├─ "ask about the letter"   when rep >= friendly   → node "letter"
 *     ├─ "ask what he has heard"                         → node "rumor"
 *     └─ "take your leave"                               → end
 *
 * ## Why conditions and effects are data, not callbacks
 *
 * Trees are meant to be authored in `core/data/`, saved, and eventually loaded
 * from quest definitions. A callback cannot be serialised and cannot be
 * inspected by a test; a `{ type: "reputation", faction, min }` object can be
 * both. The escape hatch for anything genuinely game-specific is
 * `{ type: "custom", id }`, which the caller resolves through a handler map —
 * that is how the governor hands out a letter of marque without this module
 * having to know what a letter of marque is.
 */

import type { WorldState } from "../model/WorldState.ts";
import type { SkillId } from "../model/CaptainState.ts";
import { getReputationLevel } from "./ReputationSystem.ts";
import { changeReputation } from "./ReputationSystem.ts";
import { addLogEntry } from "./EventLogSystem.ts";

export type ReputationLevel = ReturnType<typeof getReputationLevel>;

export type DialogueCondition =
  /** A world flag is set (or, with `value: false`, is not). */
  | { type: "flag"; key: string; value?: boolean }
  /** Standing with a faction, by raw score or by named level. */
  | { type: "reputation"; faction: string; min?: number; max?: number; atLeast?: ReputationLevel }
  | { type: "gold"; min?: number; max?: number }
  | { type: "skill"; skill: SkillId; min: number }
  | { type: "day"; min?: number; max?: number }
  | { type: "not"; of: DialogueCondition }
  | { type: "all"; of: DialogueCondition[] }
  | { type: "any"; of: DialogueCondition[] };

export type DialogueEffect =
  | { type: "set_flag"; key: string; value?: boolean }
  | { type: "gold"; amount: number }
  | { type: "reputation"; faction: string; amount: number }
  /**
   * Change how notorious the captain is (v0.23.0).
   *
   * Added for the charter carried off: stealing a merchant's cargo is not just
   * something one crown resents, it is something the whole sea hears about, and
   * reputation alone could not say that.
   */
  | { type: "notoriety"; amount: number }
  | { type: "log"; key: string; vars?: Record<string, string | number> }
  /** Anything this module has no business knowing about. Resolved by the caller. */
  | { type: "custom"; id: string };

export type DialogueOption = {
  id: string;
  textKey: string;
  vars?: Record<string, string | number>;
  /** Hidden entirely when this does not hold. */
  when?: DialogueCondition;
  effects?: DialogueEffect[];
  /** Next node id; omitted ends the conversation. */
  next?: string;
};

export type DialogueNode = {
  id: string;
  /** i18n key for what the other person says. */
  textKey: string;
  vars?: Record<string, string | number>;
  options: DialogueOption[];
};

export type DialogueTree = {
  id: string;
  start: string;
  nodes: Record<string, DialogueNode>;
};

export type DialogueRuntime = {
  treeId: string;
  nodeId: string;
  /** Option ids taken so far, oldest first — lets a tree react to what was said. */
  history: string[];
  ended: boolean;
};

/** Resolves `{ type: "custom" }` effects. Returns the new world. */
export type CustomEffectHandler = (world: WorldState, id: string) => WorldState;

// ── Conditions ────────────────────────────────────────────

const LEVEL_ORDER: ReputationLevel[] = ["hostile", "unfriendly", "neutral", "friendly", "allied"];

export function evaluateCondition(cond: DialogueCondition, world: WorldState): boolean {
  switch (cond.type) {
    case "flag": {
      const actual = world.worldFlags[cond.key] === true;
      return actual === (cond.value ?? true);
    }
    case "reputation": {
      const rep = world.player.reputation[cond.faction] ?? 0;
      if (cond.min !== undefined && rep < cond.min) return false;
      if (cond.max !== undefined && rep > cond.max) return false;
      if (cond.atLeast !== undefined) {
        const have = LEVEL_ORDER.indexOf(getReputationLevel(rep));
        const need = LEVEL_ORDER.indexOf(cond.atLeast);
        if (have < need) return false;
      }
      return true;
    }
    case "gold": {
      const gold = world.player.gold;
      if (cond.min !== undefined && gold < cond.min) return false;
      if (cond.max !== undefined && gold > cond.max) return false;
      return true;
    }
    case "skill": {
      const value = world.captain?.skills?.[cond.skill] ?? 0;
      return value >= cond.min;
    }
    case "day": {
      const day = world.time.day;
      if (cond.min !== undefined && day < cond.min) return false;
      if (cond.max !== undefined && day > cond.max) return false;
      return true;
    }
    case "not":
      return !evaluateCondition(cond.of, world);
    case "all":
      return cond.of.every(c => evaluateCondition(c, world));
    case "any":
      return cond.of.some(c => evaluateCondition(c, world));
  }
}

// ── Effects ───────────────────────────────────────────────

export function applyEffect(
  effect: DialogueEffect,
  world: WorldState,
  onCustom?: CustomEffectHandler,
): WorldState {
  switch (effect.type) {
    case "set_flag":
      return { ...world, worldFlags: { ...world.worldFlags, [effect.key]: effect.value ?? true } };
    case "gold":
      return { ...world, player: { ...world.player, gold: Math.max(0, world.player.gold + effect.amount) } };
    case "reputation":
      return {
        ...world,
        player: {
          ...world.player,
          reputation: changeReputation(world.player.reputation, effect.faction, effect.amount),
        },
      };
    case "notoriety":
      return {
        ...world,
        player: { ...world.player, notoriety: Math.max(0, (world.player.notoriety ?? 0) + effect.amount) },
      };
    case "log":
      return addLogEntry(world, effect.key, effect.vars);
    case "custom":
      // Unhandled custom effects are a no-op rather than a crash: a tree may be
      // written for a context that supports an effect the current caller does not.
      return onCustom ? onCustom(world, effect.id) : world;
  }
}

// ── Runtime ───────────────────────────────────────────────

export function startDialogue(tree: DialogueTree): DialogueRuntime {
  return { treeId: tree.id, nodeId: tree.start, history: [], ended: false };
}

export function currentNode(tree: DialogueTree, runtime: DialogueRuntime): DialogueNode | undefined {
  return tree.nodes[runtime.nodeId];
}

/** Replies the player can actually see right now. */
export function visibleOptions(
  tree: DialogueTree,
  runtime: DialogueRuntime,
  world: WorldState,
): DialogueOption[] {
  if (runtime.ended) return [];
  const node = currentNode(tree, runtime);
  if (!node) return [];
  return node.options.filter(o => !o.when || evaluateCondition(o.when, world));
}

export type DialogueStep = {
  runtime: DialogueRuntime;
  world: WorldState;
  /** False when the option was not available — nothing was applied. */
  taken: boolean;
};

/**
 * Take one reply. Effects fire in order, then the conversation moves on.
 *
 * A reply that is not currently visible is refused rather than applied: the
 * option list a caller rendered may be a frame out of date, and a gated reply
 * must never fire because of that.
 */
export function chooseOption(
  tree: DialogueTree,
  runtime: DialogueRuntime,
  world: WorldState,
  optionId: string,
  onCustom?: CustomEffectHandler,
): DialogueStep {
  if (runtime.ended) return { runtime, world, taken: false };

  const option = visibleOptions(tree, runtime, world).find(o => o.id === optionId);
  if (!option) return { runtime, world, taken: false };

  let w = world;
  for (const effect of option.effects ?? []) {
    w = applyEffect(effect, w, onCustom);
  }

  const history = [...runtime.history, option.id];
  const nextNode = option.next ? tree.nodes[option.next] : undefined;

  // Pointing at a node that does not exist ends the conversation instead of
  // stranding the player in a dialog box with no way out.
  const ended = !option.next || !nextNode;

  return {
    runtime: {
      ...runtime,
      nodeId: ended ? runtime.nodeId : option.next!,
      history,
      ended,
    },
    world: w,
    taken: true,
  };
}

/**
 * Validate a tree at authoring time: every `next` resolves, the start node
 * exists, ids are unique, and no node is a dead end with no way out.
 * Returns a list of problems — empty means the tree is sound.
 */
export function validateTree(tree: DialogueTree): string[] {
  const problems: string[] = [];
  if (!tree.nodes[tree.start]) problems.push(`start node "${tree.start}" does not exist`);

  for (const [id, node] of Object.entries(tree.nodes)) {
    if (node.id !== id) problems.push(`node "${id}" carries mismatched id "${node.id}"`);
    if (node.options.length === 0) problems.push(`node "${id}" has no options — the player would be stuck`);

    const seen = new Set<string>();
    for (const option of node.options) {
      if (seen.has(option.id)) problems.push(`node "${id}" has two options with id "${option.id}"`);
      seen.add(option.id);
      if (option.next && !tree.nodes[option.next]) {
        problems.push(`node "${id}" option "${option.id}" points at missing node "${option.next}"`);
      }
    }

    // A node whose every option is gated can strand the player if all gates close.
    if (node.options.every(o => o.when)) {
      problems.push(`node "${id}" has no unconditional option — it can leave the player with no reply`);
    }
  }
  return problems;
}
