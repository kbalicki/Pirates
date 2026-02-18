import type { EntityId, ShipClassId, FactionId, PortId } from "./ids.ts";
import type { Vec2, HeadingRad } from "./WorldState.ts";

export type ShipData = {
  classId: ShipClassId;
  factionId: FactionId;
  hullHp: number;
  hullMax: number;
  sailsHp: number;
  sailsMax: number;
  cannons: number;
  cargo: Record<string, number>; // itemId -> qty
  cargoCap: number;
  crew: {
    current: number;
    max: number;
    morale: number; // 0..1
  };
};

export type AiData = {
  behavior: "trader" | "pirate" | "navy" | "escort";
  state: "patrol" | "travel" | "chase" | "flee" | "dock";
  targetEntityId?: EntityId;
  targetPortId?: PortId;
  aggression: number; // 0..1
  awarenessRadius: number; // in world units
};

export type EntityState = {
  id: EntityId;
  kind: "ship" | "fleet" | "fx";
  pos: Vec2;
  vel: Vec2;
  heading: HeadingRad;
  sailLevel: number; // 0..1
  depthOffset: number;
  ship?: ShipData;
  ai?: AiData;
};
