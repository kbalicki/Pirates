import type { WorldState } from "../model/WorldState.ts";
import type { CombatState } from "../model/CombatState.ts";

export type SavePayload = {
  meta: SaveMeta;
  world: WorldState;
  combat?: CombatState;
};

export type SaveMeta = {
  slotId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  playtimeSeconds: number;
  worldVersion: number;
};

export function serializeWorld(world: WorldState): string {
  return JSON.stringify(world);
}

export function deserializeWorld(json: string): WorldState {
  return JSON.parse(json) as WorldState;
}

export function serializePayload(payload: SavePayload): string {
  return JSON.stringify(payload);
}

export function deserializePayload(json: string): SavePayload {
  return JSON.parse(json) as SavePayload;
}
