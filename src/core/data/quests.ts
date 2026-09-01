import type { QuestId, FactionId } from "../model/ids.ts";

export type QuestDef = {
  id: QuestId;
  title: string;
  description: string;
  factionId?: FactionId;
  type: "transport" | "bounty" | "explore" | "escort";
};

// No quests defined yet. First batch lands with treasure maps — see TODO.md v0.12.0.
export const QUESTS: Record<string, QuestDef> = {};
