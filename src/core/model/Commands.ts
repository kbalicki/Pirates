import type { EntityId, PortId, ItemId, QuestId, SaveSlotId } from "./ids.ts";
import type { Vec2, HeadingRad } from "./WorldState.ts";

export type WorldCommand =
  | { type: "SetSailLevel"; value: number }
  | { type: "Turn"; dir: "left" | "right"; amount: number }
  | { type: "SetHeading"; heading: HeadingRad }
  | { type: "Interact"; at: Vec2 }
  | { type: "EnterPort"; portId: PortId }
  | { type: "ExitPort" }
  | { type: "TradeBuy"; portId: PortId; itemId: ItemId; qty: number }
  | { type: "TradeSell"; portId: PortId; itemId: ItemId; qty: number }
  | { type: "RepairShip"; portId: PortId; amount: number }
  | { type: "AcceptQuest"; questId: QuestId }
  | { type: "AbandonQuest"; questId: QuestId }
  | { type: "StartEncounterResolution"; encounterId: string }
  | { type: "StartSeaBattle"; enemyEntityId: EntityId }
  | { type: "SaveGame"; slotId: SaveSlotId }
  | { type: "LoadGame"; slotId: SaveSlotId }
  | { type: "NewGame"; seed: number }
  | { type: "Disembark" }
  | { type: "Embark" };

export type CombatCommand =
  | { type: "SetSailLevel"; value: number }
  | { type: "Turn"; dir: "left" | "right"; amount: number }
  | { type: "FireCannons"; side: "left" | "right" }
  | { type: "CeaseFire" }
  | { type: "AttemptDisengage" }
  | { type: "EndBattleAcknowledge" };
