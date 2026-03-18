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

export type PlayerState = {
  id: EntityId;
  shipId: EntityId;
  gold: number;
  notoriety: number;
  reputation: Record<string, number>; // keyed by FactionId string
  ranks: Record<string, number>; // factionId -> rank index (0 = no rank)
  location: PlayerLocation;
  questLog: QuestRuntimeState[];
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
};

export type GameEventEntry = {
  day: number;
  hour: number;
  minute: number;
  key: string;
  vars?: Record<string, string | number>;
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
  playerName: string;
  eraId: string;
  startYear: number;
  gameSpeed: number; // time minutes per tick: 0.6=slow, 1.2=normal, 2.4=fast
  captain: CaptainProfile;
};

// Re-export EntityState from its own module
export type { EntityState } from "./EntityState.ts";
