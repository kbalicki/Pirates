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
  /**
   * The invasion this hull belongs to (v0.17.0).
   *
   * A crown's expedition is a `WorldEventState` crossing the map over one to
   * three weeks. While the player is near enough to see it, that event is given
   * hulls, and each hull carries a share of the landing. Sink it and the share
   * goes down with it — `ExpeditionFleetSystem` writes the survivors back into
   * the event every tick, so what comes ashore is whatever got through.
   *
   * Optional, and absent on every ordinary trader and patrol, so no save
   * migration was needed.
   */
  expedition?: {
    /** `WorldEventState.id` of the landing this hull is part of. */
    eventId: string;
    /** Soldiers in this hull's hold. Transports carry them; escorts carry none. */
    soldiers: number;
    /** Guns this hull adds to the landing's covering fire. */
    guns: number;
  };
  /**
   * `NamedShip.id` this hull is the body of (v0.32.0).
   *
   * A named merchantman is a record in `world.namedShips` that is put on the
   * water only inside the player's horizon; this is the thread back to it, so
   * her damage can be written into the record before she is despawned and her
   * loss can be recognised when she is sunk or taken. Absent on every ordinary
   * hull, so no save migration was needed.
   */
  namedShipId?: string;
  /**
   * The shipping lane this trader is sailing, and how far along it she is
   * (v0.22.0).
   *
   * Before this, every NPC steered straight at its destination and bounced off
   * whatever headland was in the way. A trader on a lane follows the course
   * `Pathfinding` worked out for it, corner by corner, which is why traffic now
   * goes *round* Cuba instead of into it.
   *
   * Only the route id is kept, never the course itself: the course is derived
   * from the map and would be dead weight in every save. Optional, so a patrol
   * — which still steers reactively — carries nothing.
   */
  lane?: { routeId: string; wp: number };
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
