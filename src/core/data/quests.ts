import type { QuestDef } from "../systems/QuestSystem.ts";

/**
 * Static quest definitions.
 *
 * Treasure hunts are *not* here: every map is a one-off instance built by
 * `TreasureSystem.treasureQuest()` around the spot it happens to name, and the
 * definition is rebuilt from the map stored in the quest's own `data` whenever
 * the registry is needed. This map holds hand-authored quests — the story
 * threads in later modules — of which there are none yet.
 */
export const QUESTS: Record<string, QuestDef> = {};
