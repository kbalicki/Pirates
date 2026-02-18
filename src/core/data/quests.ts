import type { QuestId, FactionId } from "../model/ids.ts";

export type QuestDef = {
  id: QuestId;
  title: string;
  description: string;
  factionId?: FactionId;
  type: "transport" | "bounty" | "explore" | "escort";
};

// Placeholder - quests will be expanded in Phase 8
export const QUESTS: Record<string, QuestDef> = {};
