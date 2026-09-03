import type { EntityId, PortId, ItemId } from "./ids.ts";
import type { Vec2 } from "./WorldState.ts";
import type { NewsItem } from "./EntityState.ts";

export type Transition = {
  type: "GoToScene";
  scene: "MainMap" | "Port" | "SeaBattle" | "Dialogue" | "SaveLoad" | "CityDefense";
  payload?: unknown;
};

export type WorldEvent =
  | { type: "Sound"; id: string }
  | { type: "Toast"; message: string }
  | { type: "SpawnFx"; id: string; pos: Vec2 }
  | { type: "Encounter"; encounterId: string; kind: string }
  | { type: "PortEntered"; portId: PortId }
  | { type: "BattleStarted"; enemyId: EntityId }
  | { type: "Trade"; itemId: ItemId; qty: number; goldDelta: number }
  | { type: "npc_news"; news: NewsItem[] };

export type EngineResult<S, E> = {
  state: S;
  events: E[];
  transitions?: Transition[];
};
