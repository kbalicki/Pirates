import type { EntityId, ShipClassId, FactionId } from "./ids.ts";
import type { Vec2, HeadingRad } from "./WorldState.ts";
import type { AmmoType } from "../data/ammo.ts";

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
  /** Currently loaded ammunition (Phase B+). Default "round". */
  ammoType?: AmmoType;
};

export type CombatEntityState = {
  id: EntityId;
  kind: "ship" | "projectile" | "fx";
  pos: Vec2;
  vel: Vec2;
  heading: HeadingRad;
  /** 0..1 throttle: 0=Furled, 0.5=Battle, 1.0=Full sails. Drives movement speed. */
  sailLevel: number;
  ship?: CombatShipData;
};

export type CombatState = {
  version: number;
  time: { tick: number };
  arena: { width: number; height: number };
  /** Effective cannon range in arena pixels. ~half of arena.width by convention. */
  cannonRange: number;
  wind: { dirRad: HeadingRad; strength: number };
  playerShipId: EntityId;
  enemyShipId: EntityId;
  entities: Record<string, CombatEntityState>;
  events: CombatEvent[];
};

export type CombatEvent =
  | { type: "Sound"; id: string }
  | { type: "FxHit"; pos: Vec2 }
  | { type: "FxSplash"; pos: Vec2 }
  | { type: "CannonFired"; side: "left" | "right"; shipId: EntityId; ammo?: AmmoType; hit?: boolean; targetPos?: Vec2; fromPos?: Vec2 }
  | { type: "ShipDamaged"; shipId: EntityId; hullDelta: number; sailsDelta: number; crewDelta?: number }
  | { type: "Surrender"; shipId: EntityId }
  | { type: "BoardingRejected"; reason: "too_far" | "enemy_too_strong" }
  /** She has thrown her grapnels; whoever reads this owes the captain a duel. */
  | { type: "BoardingIncoming"; boarderId: EntityId }
  | { type: "DisengageRejected"; reason: "too_close" }
  /** `captured` is from the BOARDER's side: she carried the deck she came for. */
  | { type: "BoardingResolved"; boarderId: EntityId; captured: boolean; playerCrewAfter: number; enemyCrewAfter: number }
  | { type: "BattleEnded"; outcome: "win" | "lose" | "disengaged" | "surrender" | "captured"; loot?: Record<string, number> };
