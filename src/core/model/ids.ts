// Branded types for type-safe IDs
export type EntityId = string & { __brand: "EntityId" };
export type PortId = string & { __brand: "PortId" };
export type FactionId = string & { __brand: "FactionId" };
export type ItemId = string & { __brand: "ItemId" };
export type ShipClassId = string & { __brand: "ShipClassId" };
export type QuestId = string & { __brand: "QuestId" };
export type SaveSlotId = string & { __brand: "SaveSlotId" };

// Factory helpers
export function entityId(s: string): EntityId { return s as EntityId; }
export function portId(s: string): PortId { return s as PortId; }
export function factionId(s: string): FactionId { return s as FactionId; }
export function itemId(s: string): ItemId { return s as ItemId; }
export function shipClassId(s: string): ShipClassId { return s as ShipClassId; }
export function questId(s: string): QuestId { return s as QuestId; }
export function saveSlotId(s: string): SaveSlotId { return s as SaveSlotId; }
