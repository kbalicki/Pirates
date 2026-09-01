// Quest log primitives. The quest FSM/graph itself is not built yet —
// see TODO.md (v0.12.0, treasure maps) for the first real consumer.

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
