import type { EntityId, PortId, FactionId, QuestId } from "./ids.ts";
import type { EntityState } from "./EntityState.ts";
import type { CaptainProfile } from "./CaptainState.ts";

export type Vec2 = { x: number; y: number };
export type HeadingRad = number; // 0..2π

export type GameTime = {
  day: number;
  hour: number;
  minute: number;
  tick: number;
};

export type RngState = {
  seed: number;
  state: number;
};

export type QuestRuntimeState = {
  questId: QuestId;
  stage: string;
  data: Record<string, unknown>;
  accepted: boolean;
  completed: boolean;
};

export type PlayerLocation = {
  type: "sea" | "port";
  portId?: PortId;
  pos: Vec2;
};

/** An escort ship in the player's fleet (not the flagship). */
export type FleetShip = {
  classId: string;       // ShipClassId as string
  hullHp: number;
  hullMax: number;
  sailsHp: number;
  sailsMax: number;
  cannons: number;
};

export type PlayerState = {
  id: EntityId;
  shipId: EntityId;
  gold: number;
  notoriety: number;
  reputation: Record<string, number>; // keyed by FactionId string
  ranks: Record<string, number>; // factionId -> rank index (0 = no rank)
  location: PlayerLocation;
  questLog: QuestRuntimeState[];
  /** Escort ships (0-2). Flagship = entity's ship. Total fleet max 3. */
  fleet: FleetShip[];
  /** Game day of the last division of plunder. The crew counts from here. */
  lastPlunderDay: number;
  /** Towns stormed and taken, however they were disposed of afterwards. */
  citiesCaptured: number;
  /** Standing with each governor's daughter, keyed by port id (0..100). */
  courtship: Record<string, number>;
  /** Final score, written once the captain retires. Absent while still at sea. */
  retirementScore?: number;
};

export type WeatherState = {
  windDirRad: HeadingRad;
  windStrength: number; // 0..1
  stormActive: boolean;
  stormTimer: number;
};

export type PortRuntimeState = {
  portId: PortId;
  factionId: FactionId;
  prices: Record<string, number>; // itemId -> current price
  inventory: Record<string, number>; // itemId -> qty available
  shipyardQueue: string[];
  availableCrew: number; // crew available for recruitment at tavern
  // ── Living-world numerics (v7+) ────────────────────────────
  /** Current population (people). Drifts toward baseline; events push it. */
  population: number;
  /** Current wealth (0..1000). Drifts toward baseline; events push it. */
  wealth: number;
  /** Garrison strength (0..100). Drops on raids; recovers slowly. */
  defense: number;
  /** Extra goods this port temporarily produces (e.g. "gold" after a strike). */
  bonusProduces: string[];
};

export type GameEventEntry = {
  day: number;
  hour: number;
  minute: number;
  key: string;
  vars?: Record<string, string | number>;
};

export type WorldEventType =
  | "war_start" | "war_end" | "epidemic" | "pirate_raid"
  | "trade_boom" | "slave_revolt" | "hurricane"
  | "treasure_fleet" | "new_governor"
  // ── v0.9.7 economy expansion ────────────────────────────
  | "gold_discovery" | "native_raid" | "famine" | "harvest"
  | "royal_decree" | "treaty_signed";

export type WorldEventState = {
  id: string;
  type: WorldEventType;
  startDay: number;
  endDay: number;
  ports: string[];        // affected port IDs
  factions: string[];     // involved faction IDs
  severity: 1 | 2 | 3;
  headline: string;       // i18n key
  vars: Record<string, string | number>;
};

export type WorldState = {
  version: number;
  time: GameTime;
  rng: RngState;
  player: PlayerState;
  entities: Record<string, EntityState>;
  ports: Record<string, PortRuntimeState>;
  weather: WeatherState;
  worldFlags: Record<string, boolean>;
  eventLog: GameEventEntry[];
  /** Active world events (wars, epidemics, etc.) */
  worldEvents: WorldEventState[];
  /** IDs of world events player has already been notified about */
  knownEventIds: string[];
  playerName: string;
  eraId: string;
  startYear: number;
  gameSpeed: number; // time minutes per tick: 0.6=slow, 1.2=normal, 2.4=fast
  captain: CaptainProfile;
};

// Re-export EntityState from its own module
export type { EntityState } from "./EntityState.ts";
