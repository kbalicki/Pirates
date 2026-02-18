// Placeholder for Phase 8 quest system
// Quest FSM/graph will be implemented here

import type { QuestRuntimeState } from "../model/WorldState.ts";
import type { QuestId } from "../model/ids.ts";

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
