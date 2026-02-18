import type { EntityId, ShipClassId, FactionId } from "./ids.ts";
import type { Vec2, HeadingRad } from "./WorldState.ts";

export type CombatShipData = {
  classId: ShipClassId;
  factionId: FactionId;
  hullHp: number;
  hullMax: number;
  sailsHp: number;
  sailsMax: number;
  cannons: number;
  crew: {
    current: number;
    max: number;
    morale: number;
  };
  cooldown: {
    left: number;  // ticks until ready
    right: number;
  };
};

export type CombatEntityState = {
  id: EntityId;
  kind: "ship" | "projectile" | "fx";
  pos: Vec2;
  vel: Vec2;
  heading: HeadingRad;
  ship?: CombatShipData;
};

export type CombatState = {
  version: number;
  time: { tick: number };
  arena: { width: number; height: number };
  wind: { dirRad: HeadingRad; strength: number };
  playerShipId: EntityId;
  enemyShipId: EntityId;
  entities: Record<string, CombatEntityState>;
  events: CombatEvent[];
};

export type CombatEvent =
  | { type: "Sound"; id: string }
  | { type: "FxHit"; pos: Vec2 }
  | { type: "CannonFired"; side: "left" | "right"; shipId: EntityId }
  | { type: "ShipDamaged"; shipId: EntityId; hullDelta: number; sailsDelta: number }
  | { type: "BattleEnded"; outcome: "win" | "lose" | "disengaged"; loot?: Record<string, number> };
