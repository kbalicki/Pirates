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
  /**
   * Men aboard this consort (v0.17.0).
   *
   * Optional, and read everywhere through `consortCrew()`, which falls back to
   * `crewMax x FLEET_CREW_FRACTION` — the notional complement every consort was
   * assumed to carry before this field existed. That fallback is why no
   * migration step was added: an old save simply keeps answering the same
   * number it always did, and starts recording losses the first time it takes
   * any.
   */
  crew?: number;
  /**
   * How the men aboard this consort feel about the voyage (v0.19.0).
   *
   * Optional, read through `consortMorale()`, which falls back to
   * `FLEET_DEFAULT_MORALE` — the flat 0.8 the sea battle used to conjure for
   * every consort. An old save keeps answering exactly what it did.
   */
  morale?: number;
  /**
   * How well the men on this consort are drilled, 0..1 (v0.21.0).
   *
   * Optional, read through `consortTraining()`, which falls back to the
   * flagship's own drill — exactly what every consort used before the field
   * existed, so an old save fights the same. A hull that *joins* the fleet is
   * seeded a notch below the captain's own crew, because a prize crew or a
   * yard's delivery crew is not the crew he has spent years drilling.
   */
  training?: number;
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
  /**
   * Goods left in the family storehouse at the home port (v0.18.0).
   *
   * Optional and read through `warehouseOf()`, which answers `{}` when it is
   * absent — an old save has nothing ashore because there was nowhere to put
   * it, so there is nothing for a migration step to invent.
   */
  warehouse?: Record<string, number>;
  /**
   * The crown his wife's father served, recorded at the wedding (v0.18.0).
   *
   * `daughterFor` derives a governor's daughter from whoever holds the town
   * *today*, so it cannot answer this: a captured colony grows a new governor
   * with a new daughter. Optional, and `homePortActive` falls back to the
   * town's founding crown when it is absent, which is right for every save
   * written before the field existed.
   */
  homeCrown?: string;
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
  // ── Holding a town you took (v12+) ────────────────────────
  /**
   * The day this town last changed hands. Absent while it still flies the flag
   * it started with. The dispossessed crown counts from here: the longer a town
   * stays lost, the bigger the squadron it sends to take it back.
   */
  capturedDay?: number;
  /** Men the player has stationed here. They are the town's real defence. */
  garrison?: number;
  /** Earliest day a relief expedition may sail again. Set after each attempt. */
  nextReliefDay?: number;
  /**
   * Days the player's squadron has been standing off this harbour (v0.22.0).
   *
   * Counts up while he lies within `BLOCKADE_RADIUS` with guns enough to
   * matter, and back down when he leaves — so it is a measure of pressure, not
   * a flag. It bites at `BLOCKADE_ONSET_DAYS`. Optional, read through
   * `blockadeDays()`, and absent means the harbour is open: exactly what every
   * save written before this release means.
   */
  blockadeDays?: number;
  /**
   * Earliest day a rival crown may fit out a campaign against this town (v13+).
   *
   * Stamped when an expedition sails rather than when it lands, so a colony is
   * not queued up for a second invasion while the first is still at sea.
   */
  nextCampaignDay?: number;
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
  | "royal_decree" | "treaty_signed"
  // ── v0.15.0 the crown comes back ────────────────────────
  | "reconquest"
  // ── v0.16.0 crowns take colonies off each other ─────────
  | "campaign";

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
  /**
   * How badly each shipping lane has been preyed upon (v0.22.0).
   *
   * Keyed by `TradeRoute.id`, which is derived from the map and never stored,
   * so this survives a change to the lane network by simply going stale and
   * decaying out. Optional and read through `disruptions()`; a save from before
   * this release has quiet seas, which is what it had.
   */
  routeDisruption?: Record<string, { severity: number; until: number }>;
  playerName: string;
  eraId: string;
  startYear: number;
  gameSpeed: number; // time minutes per tick: 0.6=slow, 1.2=normal, 2.4=fast
  captain: CaptainProfile;
};

// Re-export EntityState from its own module
export type { EntityState } from "./EntityState.ts";
