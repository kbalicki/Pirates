import type { WorldState } from "../core/model/WorldState.ts";
import type { CombatState } from "../core/model/CombatState.ts";
import type { SaveSlotId } from "../core/model/ids.ts";

export type SaveMeta = {
  slotId: SaveSlotId;
  title: string;
  createdAt: number;
  updatedAt: number;
  playtimeSeconds: number;
  worldVersion: number;
};

export type SavePayload = {
  meta: SaveMeta;
  world: WorldState;
  combat?: CombatState;
};

/**
 * The game day a save's title records.
 *
 * The title is written `Day N` by the save tab and has been since the first
 * save, so every slot in every captain's browser carries it in English. Both
 * screens that list saves printed it as it stood -- `Slot 1: Dzień Day 1` in
 * the Polish game (v0.96.0) -- so the number is read back out and each screen
 * words it in its own language. A title with no number in it is day 1.
 */
export function saveTitleDay(title: string): number {
  const m = /(\d+)/.exec(title);
  const day = m ? parseInt(m[1], 10) : NaN;
  return Number.isFinite(day) && day >= 1 ? day : 1;
}
