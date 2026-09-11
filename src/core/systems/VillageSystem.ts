/**
 * VillageSystem — the first counter on this chart that flies nobody's flag.
 *
 * ## What was already here, and what was measured before a line was written
 *
 * `native_raid` is a complete world event: a headline, a whitelist of eleven
 * frontier towns, a one-shot that takes **forty points of defence**, fifteen
 * percent of the people and a hundred and fifty of the wealth, and a daily
 * bite on top of it. It fires. Nobody makes it happen. The help screen has
 * said for twenty releases that a raid on a Spanish fort is *an opportunity
 * for a pirate*, and a captain has never had a way to ask for one.
 *
 * Two designs were **killed by measurement** before this one was written, and
 * they are worth recording because they are the obvious ones:
 *
 *   - **Water and provisions at a village.** A starting sloop carries five
 *     days of water and the arithmetic looks tight. It is not: over the whole
 *     3200×2400 chart the median cell is **283 units from the nearest port**
 *     and the ninetieth percentile is 694, against roughly 300 units sailed a
 *     day. A captain is never more than a day from a quay that sells water.
 *     A village that sold provisions would be a shop in a street full of them.
 *   - **The war party as a general lever.** It is not general. Seven of the
 *     eleven towns `native_raid` is allowed to fall on are **outposts sitting
 *     at fifteen points of defence**, where minus forty buys one gun and no
 *     walls that were not already nothing. The eight villages here were sited
 *     so that **six of them neighbour a real city** — Panama, Granada,
 *     Campeche, Villa Hermosa, Martinique, Trinidad — where the same forty
 *     points takes walls from forty-five to five, and Panama's sixty to twenty.
 *     Where it is worth little the offer still stands, and the screen names the
 *     town so the captain can see what he is buying.
 *
 * ## Standing has two halves, and only one of them is stored
 *
 * `villageStanding` = what your enemies have done for you + what you have.
 *
 *   - **The derived half.** These people live beside a colony. What that
 *     colony's crown thinks of you is read **fresh, every time**, and read
 *     *backwards*: a captain Spain has a price on starts civil with the Guna
 *     of Darién, and a captain in good odour with Spain starts a stranger.
 *     This is the mirror image of `PortAccessSystem`, which is one table about
 *     what a crown's opinion buys you at a quay; here the same number buys you
 *     the opposite thing a day's sail inland.
 *   - **The earned half.** What you personally carried up the beach. That is
 *     an event, so it is *stamped* (`player.villages[key].standing`) and never
 *     re-derived — the rule from v0.31.0.
 *
 * The stored half lives in an **optional** record read through `?? {}`, so
 * migrations stay at v12 for the twentieth release running: a save from before
 * this one has done nothing with anybody, which is the truth about it.
 *
 * ## Why rum for gold
 *
 * No new items. `gold` has been the game's only `rare` good since v0.29.0 —
 * **no port starts with a grain of it** and it appears on a counter only where
 * a strike put it there — so a village is the one standing source of the one
 * thing a colony cannot sell you. And `PricingSystem` already ruins the trade
 * for anyone who tries to industrialise it: the plate fleet measured gold
 * falling from 77 a ton to 31 as a hold is emptied into one town (v0.46.0).
 * The trade is small by construction. Its job is not to be a living — it is
 * the way goodwill is bought, and goodwill is what buys the war party.
 *
 * Pure. No Phaser, no `Math.random`: a war party is stamped in the world tick's
 * own terms, and the offer a village makes today is a function of the day.
 */

import type { WorldState, WorldEventState, Vec2 } from "../model/WorldState.ts";
import { VILLAGES, villageList, type VillageDef } from "../data/villages.ts";
import { CITIES } from "../data/cities.ts";
import { portFaction } from "./SiegeSystem.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { clamp } from "../services/Geometry.ts";
// A log entry keeps its `vars` and renders them verbatim a long time later, so
// a raw key would reach the journal as "village.darien.name" (the v0.37.0
// lesson). Names are baked where the entry is made.
import { t } from "../i18n/index.ts";

// ── The numbers ───────────────────────────────────────────

/**
 * How close the ship has to be before the village hails her.
 *
 * Eight times a town's dock radius, because there is no harbour to steer into
 * — only a beach to anchor off, and a boat to send. Measured: at forty units
 * four of the eight anchorages put a sloop **aground** before she was close
 * enough to be heard, because the land grid the depth field is built from is
 * coarser than the coastline polygons and its shore is fatter than the drawn
 * one. Fifty units, together with the four metres `VILLAGE_ANCHORAGE_DEPTH`
 * keeps over a village's landing, gives the four shallow-draught hulls room to
 * lie and leaves the five deep ones aground — which is the rule, not an
 * accident.
 *
 * Every village is sited at least sixty-five units from the nearest town, so
 * this range and a town's six can never both be live at once.
 */
export const VILLAGE_RANGE = 50;

/** Tons of rum one visit's barter costs, whatever they hand back. */
export const TRADE_RUM = 6;

/** Days before the same village has anything to barter again. */
export const TRADE_COOLDOWN_DAYS = 10;

/** Standing a completed barter is worth. */
export const STANDING_PER_TRADE = 15;

/** Standing at which they will take up arms for you. */
export const WAR_PARTY_STANDING = 60;

/** Tons of rum a war party costs, over and above the goodwill. */
export const WAR_PARTY_RUM = 6;

/**
 * Goodwill a war party spends.
 *
 * Bigger than a single barter on purpose. Asking men to go and fight is not a
 * favour that can be bought back in one visit, so the lever has a real
 * cooldown without needing a date field to enforce one: two more crossings
 * with a full hold before they will do it again.
 */
export const WAR_PARTY_STANDING_COST = 30;

/** Days a war party's raid runs. The low end of the `native_raid` template. */
export const WAR_PARTY_DAYS = 40;

/** The four things a village can think of a captain. */
export type VillageTier = "wary" | "civil" | "friendly" | "kin";

const TIER_FLOOR: Array<[VillageTier, number]> = [
  ["kin", 75],
  ["friendly", 50],
  ["civil", 25],
  ["wary", 0],
];

export type VillageMemory = {
  /** Goodwill earned by this captain in person, 0..100. */
  standing: number;
  /** Day of the last barter. Absent until he has traded once. */
  traded?: number;
};

// ── Reading the map ───────────────────────────────────────

export function villageDef(key: string): VillageDef | undefined {
  return VILLAGES[key];
}

/** The village within hailing distance of a position, if any. */
export function villageNear(pos: Vec2, radius = VILLAGE_RANGE, positions?: Map<string, Vec2>): VillageDef | null {
  for (const v of villageList()) {
    const p = positions?.get(v.id) ?? v.pos;
    if (Math.hypot(pos.x - p.x, pos.y - p.y) <= radius) return v;
  }
  return null;
}

/** The crown flying over the colony this village lives beside, **today**. */
export function neighbourCrown(world: WorldState, key: string): string {
  const v = VILLAGES[key];
  if (!v) return "spain";
  return portFaction(world, v.neighbour) as string;
}

// ── Standing ──────────────────────────────────────────────

/**
 * The half of standing that is not the captain's doing.
 *
 * Read straight off his reputation with the crown next door, inverted and
 * scaled into 0..45: allied with that crown is nothing here, hated by it is
 * most of the way to civil. Deliberately capped below `WAR_PARTY_STANDING` —
 * having Spain's enemies as friends is an introduction, never a war party.
 */
export function baseStanding(world: WorldState, key: string): number {
  const crown = neighbourCrown(world, key);
  const rep = world.player.reputation?.[crown] ?? 0;
  return Math.round(clamp(20 - rep / 4, 0, 45));
}

/** What this captain personally has with them. Absent until he does something. */
export function villageMemory(world: WorldState, key: string): VillageMemory {
  return world.player.villages?.[key] ?? { standing: 0 };
}

/** The whole of it, 0..100. */
export function villageStanding(world: WorldState, key: string): number {
  return Math.round(clamp(baseStanding(world, key) + villageMemory(world, key).standing, 0, 100));
}

export function villageTier(standing: number): VillageTier {
  for (const [tier, floor] of TIER_FLOOR) {
    if (standing >= floor) return tier;
  }
  return "wary";
}

function tierIndex(tier: VillageTier): number {
  return ["wary", "civil", "friendly", "kin"].indexOf(tier);
}

/** Write the earned half back, clamped, without touching anything else. */
function withMemory(world: WorldState, key: string, patch: Partial<VillageMemory>): WorldState {
  const prev = villageMemory(world, key);
  const next: VillageMemory = {
    ...prev,
    ...patch,
    standing: Math.round(clamp(patch.standing ?? prev.standing, 0, 100)),
  };
  return {
    ...world,
    player: {
      ...world.player,
      villages: { ...(world.player.villages ?? {}), [key]: next },
    },
  };
}

// ── Barter ────────────────────────────────────────────────

export type VillageOffer = {
  /** Tons of rum they want. */
  rum: number;
  /** Tons of gold they will hand over for it. */
  gold: number;
};

/**
 * What they will barter today, or `null` while the last exchange is still too
 * fresh.
 *
 * The price of being a stranger is the whole of the table: at `wary` two tons
 * of gold for six of rum is barely worth the crossing, at `kin` five tons is
 * worth making the crossing for. Nothing is rolled — the offer is a function of
 * the tier, so a captain can plan a run against it.
 */
export function tradeCooldownLeft(world: WorldState, key: string): number {
  const mem = villageMemory(world, key);
  if (mem.traded === undefined) return 0;
  return Math.max(0, TRADE_COOLDOWN_DAYS - (world.time.day - mem.traded));
}

export function tradeOffer(world: WorldState, key: string): VillageOffer | null {
  if (!VILLAGES[key]) return null;
  const mem = villageMemory(world, key);
  if (mem.traded !== undefined && world.time.day - mem.traded < TRADE_COOLDOWN_DAYS) return null;
  const gold = 2 + tierIndex(villageTier(villageStanding(world, key)));
  return { rum: TRADE_RUM, gold };
}

/** Tons of a good in the flagship's hold. */
export function holdOf(world: WorldState, item: string): number {
  const ship = world.entities[world.player.shipId as string]?.ship;
  return ship?.cargo?.[item] ?? 0;
}

function withCargo(world: WorldState, deltas: Record<string, number>): WorldState {
  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  if (!entity?.ship) return world;
  const cargo = { ...entity.ship.cargo };
  for (const [item, delta] of Object.entries(deltas)) {
    const next = (cargo[item] ?? 0) + delta;
    if (next <= 0.001) delete cargo[item];
    else cargo[item] = next;
  }
  return {
    ...world,
    entities: { ...world.entities, [shipId]: { ...entity, ship: { ...entity.ship, cargo } } },
  };
}

export type TradeResult = { world: WorldState; gold: number; ok: boolean; reason?: "cooldown" | "no_rum" };

/**
 * Carry the rum up the beach and come back down with the gold.
 *
 * There is deliberately **no room check**, and there cannot be one that ever
 * fires: they never hand back more than they take (`TRADE_RUM` is six and the
 * best tier pays five), so a barter always leaves the hold lighter than it
 * found it. A guard that cannot trip is the same dead weight as a field
 * nothing reads, so the invariant is asserted in the tests instead of being
 * defended here.
 */
export function barter(world: WorldState, key: string): TradeResult {
  const offer = tradeOffer(world, key);
  if (!offer) return { world, gold: 0, ok: false, reason: "cooldown" };
  if (holdOf(world, "rum") < offer.rum) return { world, gold: 0, ok: false, reason: "no_rum" };

  let w = withCargo(world, { rum: -offer.rum, gold: offer.gold });
  w = withMemory(w, key, {
    standing: villageMemory(w, key).standing + STANDING_PER_TRADE,
    traded: w.time.day,
  });
  w = addLogEntry(w, "village.log_trade", {
    village: t(`village.${key}.name`),
    gold: offer.gold,
    rum: offer.rum,
  });
  return { world: w, gold: offer.gold, ok: true };
}

// ── The war party ─────────────────────────────────────────

export type WarPartyOffer = {
  /** The colony they would fall on. */
  target: string;
  /** Whether they will do it today, and why not if they will not. */
  ready: boolean;
  reason?: "standing" | "no_rum" | "already";
  rum: number;
  standing: number;
  needed: number;
};

/** Is a raid this village started still running on its neighbour? */
function raidStanding(world: WorldState, target: string): boolean {
  return world.worldEvents.some(
    ev => ev.type === "native_raid" && ev.endDay >= world.time.day && ev.ports.includes(target),
  );
}

export function warPartyOffer(world: WorldState, key: string): WarPartyOffer | null {
  const v = VILLAGES[key];
  if (!v) return null;
  const standing = villageStanding(world, key);
  const base: WarPartyOffer = {
    target: v.neighbour,
    ready: true,
    rum: WAR_PARTY_RUM,
    standing,
    needed: WAR_PARTY_STANDING,
  };
  if (raidStanding(world, v.neighbour)) return { ...base, ready: false, reason: "already" };
  if (standing < WAR_PARTY_STANDING) return { ...base, ready: false, reason: "standing" };
  if (holdOf(world, "rum") < WAR_PARTY_RUM) return { ...base, ready: false, reason: "no_rum" };
  return base;
}

/**
 * Set them going.
 *
 * The event is built in exactly the shape `rollOneEvent` builds one — same id
 * scheme, same `vars` (including `mainPort`, which is the town **key** every
 * reader looks the place up by, and `port`, which is the display string the
 * headline prints) — so `applyOneShotEffects` fires it at the next midnight and
 * every noticeboard, rumour and chart mark in the game carries it without
 * knowing where it came from.
 *
 * It goes into `knownEventIds` because the captain was standing on the beach
 * when it was agreed. Nobody else ever learns it was him: that deniability is
 * the point of paying for a raid instead of making one.
 */
export function sendWarParty(world: WorldState, key: string): { world: WorldState; ok: boolean } {
  const offer = warPartyOffer(world, key);
  if (!offer?.ready) return { world, ok: false };
  const target = offer.target;
  const def = CITIES[target];

  const event: WorldEventState = {
    id: `native_raid_${world.time.day}_${target}`,
    type: "native_raid",
    startDay: world.time.day,
    endDay: world.time.day + WAR_PARTY_DAYS,
    ports: [target],
    factions: [portFaction(world, target) as string],
    severity: 2,
    headline: "news.native_raid",
    vars: {
      mainPort: target,
      port: def?.name ?? target,
      // A display name, not the key. `vars.faction` is a printed string
      // everywhere else an event is built, and a raw key stamped into a save
      // prints as "spain" the day somebody writes a headline that uses it —
      // the v0.37.0 lesson, one line below the comment that cites it.
      faction: t(`faction.${portFaction(world, target)}.name`),
      duration: WAR_PARTY_DAYS,
    },
  };

  let w = withCargo(world, { rum: -WAR_PARTY_RUM });
  w = withMemory(w, key, { standing: villageMemory(w, key).standing - WAR_PARTY_STANDING_COST });
  w = {
    ...w,
    worldEvents: [...w.worldEvents, event],
    knownEventIds: [...(w.knownEventIds ?? []), event.id],
  };
  w = addLogEntry(w, "village.log_war_party", {
    village: t(`village.${key}.name`),
    port: t(`port.${target}.name`),
  });
  return { world: w, ok: true };
}
