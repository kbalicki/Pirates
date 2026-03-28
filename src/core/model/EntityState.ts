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

export type NewsItem = {
  eventId: string;
  headline: string;       // i18n key
  vars: Record<string, string | number>;
  dayHeard: number;
  sourcePort: string;     // port where NPC heard this
};

export type AiData = {
  behavior: "trader" | "pirate" | "navy" | "escort" | "pirate_hunter";
  state: "patrol" | "travel" | "chase" | "flee" | "dock";
  targetEntityId?: EntityId;
  targetPortId?: PortId;
  aggression: number; // 0..1
  awarenessRadius: number; // in world units
  /** News carried by this NPC (max 5). Picked up at ports. */
  news?: NewsItem[];
  /** Last port visited — determines when NPC gets fresh news. */
  lastPortVisited?: string;
};

export type EntityMode = "sailing" | "landed";

export type EntityState = {
  id: EntityId;
  kind: "ship" | "fleet" | "fx";
  mode: EntityMode;
  pos: Vec2;
  vel: Vec2;
  heading: HeadingRad;
  sailLevel: number; // 0..1
  depthOffset: number;
  /** When landed, the ship stays anchored here. */
  anchorPos?: Vec2;
  ship?: ShipData;
  ai?: AiData;
  /** Tick when crew last embarked — used for grace period to prevent instant re-landing. */
  embarkTick?: number;
  /** Tick when crew landed — cooldown prevents instant re-embark. */
  landedTick?: number;
  /** Tick when NPC last hit coastline — AI won't override heading during cooldown. */
  coastAvoidTick?: number;
};
