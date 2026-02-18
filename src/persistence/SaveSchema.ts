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
