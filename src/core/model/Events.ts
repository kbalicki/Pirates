import type { EntityId, PortId, ItemId } from "./ids.ts";
import type { Vec2 } from "./WorldState.ts";

export type Transition = {
  type: "GoToScene";
  scene: "MainMap" | "Port" | "SeaBattle" | "Dialogue" | "SaveLoad";
  payload?: unknown;
};

export type WorldEvent =
  | { type: "Sound"; id: string }
  | { type: "Toast"; message: string }
  | { type: "SpawnFx"; id: string; pos: Vec2 }
  | { type: "Encounter"; encounterId: string; kind: string }
  | { type: "PortEntered"; portId: PortId }
  | { type: "BattleStarted"; enemyId: EntityId }
  | { type: "Trade"; itemId: ItemId; qty: number; goldDelta: number };

export type EngineResult<S, E> = {
  state: S;
  events: E[];
  transitions?: Transition[];
};
