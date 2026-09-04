/**
 * Trade routes — the shipping lanes the Caribbean actually runs on.
 *
 * Until v0.21.0 trade between ports was a number. `EconomyTickSystem` step 3.5
 * topped every colony up with whatever it demanded and did not grow, and called
 * it "licensed imports". That fixed the starvation bug it was written for, but
 * it left the module with a hole its own notes admitted: *there is nothing to
 * cut*. A war took a flat 30% off every port of a warring crown whether it sat
 * on a strait or in a back bay, because the supply had no geography.
 *
 * A lane gives it one. For every good a town needs and cannot grow, this module
 * names the port that actually supplies it and the water the cargo crosses:
 *
 *   - the supplier is the nearest producer **by sea**, not by straight line,
 *     with a thumb on the scale for its own crown's ports;
 *   - the course is a real `findSeaPath` around the islands;
 *   - what arrives is the lane's share, and the lane can be interfered with —
 *     by a blockade at either end, or by convoys taken on the passage.
 *
 * Two goods deliberately have no lanes and never will:
 *
 *   - **water**, which nobody produces, because it comes out of a well;
 *   - anything whose nearest producer is more than `MAX_LANE_LENGTH` away,
 *     which is an ocean import — the Seville packet, not a coasting trade.
 *
 * Both fall back to full supply. That is not a fudge to keep the numbers where
 * they were: it is the reason a blockade of Port Royale starves it of food and
 * rum without making its people die of thirst.
 */

import type { Vec2, WorldState } from "../model/WorldState.ts";
import { CITIES } from "../data/cities.ts";
import { landmassGeneration } from "../data/geography.ts";
import { findSeaPath, pathLength, distanceToPath } from "../services/Pathfinding.ts";
import { getPortWaterPos } from "./PortWaterPositions.ts";

/** A regular run between two ports, carrying what the second cannot grow. */
export type TradeRoute = {
  /** `"<from>__<to>"` — stable, derived, never stored in a save. */
  id: string;
  from: string;
  to: string;
  /** Goods this run carries. Sorted, so the id and the cargo are reproducible. */
  items: string[];
  /** Course over water: endpoints plus the corners between them. */
  path: Vec2[];
  /** Length of that course in world units. */
  length: number;
};

/** Beyond this, the nearest producer is not a coasting trade but an ocean one. */
const MAX_LANE_LENGTH = 1500;

/** How much a supplier of one's own crown is preferred, as a distance discount. */
const SAME_CROWN_DISCOUNT = 0.7;

/** What a lane delivers when nothing is interfering with it. */
export const LANE_FULL = 1;

/** What still gets through to a port whose supplier is shut in and unreplaceable. */
const SUPPLIER_SHUT_SHARE = 0.3;

/**
 * What arrives when the usual supplier is shut but somebody else grows it too.
 *
 * A blockade of the *only* cocoa port in reach is a different act from a
 * blockade of one of four sugar ports, and until v0.23.0 the model could not
 * tell them apart: shutting a harbour cut its clients to 30% whether or not
 * there was another producer a day further on. Now the trade goes the long way
 * round at a worse price — which is what it did in life, and which makes
 * blockading a sole supplier the strategically interesting act it should be.
 */
const REROUTE_SHARE = 0.65;

/** Convoys taken on a lane: how fast the shippers' nerve comes back, per day. */
const DISRUPTION_DECAY = 0.12;

/** Severity added by one convoy lost, and the ceiling any lane can reach. */
export const DISRUPTION_PER_PRIZE = 0.3;
const DISRUPTION_MAX = 0.85;

/** Days a fresh scare stays on the books before it starts decaying out. */
const DISRUPTION_DAYS = 12;

export type RouteDisruption = { severity: number; until: number };

// ── The lane network ───────────────────────────────────────────────────────

type Network = {
  routes: TradeRoute[];
  /** "<port>|<item>" -> producers after the chosen one, nearest first. */
  alternates: Record<string, string[]>;
};

let cachedNetwork: Network | null = null;
let cachedGeneration = -1;

/**
 * Every lane in the Caribbean, derived from `CITIES` and the coastline.
 *
 * Memoized on `landmassGeneration()`: the network is a pure function of the map
 * and only changes when the coastline is swapped in at boot. Under vitest,
 * where no land is loaded, every course is a straight line — the lanes are
 * still the right lanes, they simply sail through where Cuba would be.
 */
export function tradeRoutes(): TradeRoute[] {
  return network().routes;
}

/**
 * Producers of `item` that could serve `portKey` if the usual one could not,
 * in the order the trade would turn to them.
 *
 * Empty when the chosen supplier is the only one in reach — and that emptiness
 * is the whole point: it is what makes one blockade worth ten of another.
 */
export function alternateSuppliers(portKey: string, item: string): string[] {
  return network().alternates[`${portKey}|${item}`] ?? [];
}

function network(): Network {
  const gen = landmassGeneration();
  if (cachedNetwork && cachedGeneration === gen) return cachedNetwork;

  /** item -> ports that grow it */
  const producers: Record<string, string[]> = {};
  for (const [key, def] of Object.entries(CITIES)) {
    for (const item of def.produces) {
      (producers[item] ??= []).push(key);
    }
  }

  /** "<from>__<to>" -> route under construction */
  const merged = new Map<string, TradeRoute>();
  const alternates: Record<string, string[]> = {};

  for (const [toKey, toDef] of Object.entries(CITIES)) {
    for (const item of toDef.demands) {
      if (toDef.produces.includes(item)) continue;      // grows its own
      const candidates = producers[item];
      if (!candidates || candidates.length === 0) continue; // a well, not a lane

      const ranked: { from: string; path: Vec2[]; length: number; score: number }[] = [];
      for (const fromKey of candidates) {
        if (fromKey === toKey) continue;
        const path = laneCourse(fromKey, toKey);
        if (!path) continue;
        const length = pathLength(path);
        const sameCrown =
          (CITIES[fromKey].factionId as string) === (toDef.factionId as string);
        ranked.push({ from: fromKey, path, length, score: length * (sameCrown ? SAME_CROWN_DISCOUNT : 1) });
      }
      ranked.sort((a, b) => a.score - b.score);
      const best = ranked[0];
      if (!best || best.length > MAX_LANE_LENGTH) continue; // ocean import

      // Who else could serve this town, and how far the trade would have to
      // reach to do it. A second source twice as far away is still a second
      // source; one on the other side of the sea is not.
      alternates[`${toKey}|${item}`] = ranked
        .slice(1)
        .filter(r => r.length <= MAX_LANE_LENGTH * REROUTE_REACH)
        .map(r => r.from);

      const id = `${best.from}__${toKey}`;
      const existing = merged.get(id);
      if (existing) {
        if (!existing.items.includes(item)) {
          existing.items = [...existing.items, item].sort();
        }
      } else {
        merged.set(id, {
          id,
          from: best.from,
          to: toKey,
          items: [item],
          path: best.path,
          length: best.length,
        });
      }
    }
  }

  cachedNetwork = { routes: [...merged.values()], alternates };
  cachedGeneration = gen;
  return cachedNetwork;
}

/** How much further than a normal lane the trade will reach for a second source. */
const REROUTE_REACH = 1.5;

/** The water between two ports, or null if a ship cannot get from one to the other. */
function laneCourse(fromKey: string, toKey: string): Vec2[] | null {
  const a = getPortWaterPos(fromKey);
  const b = getPortWaterPos(toKey);
  if (!a || !b) return null;
  return findSeaPath(a, b);
}

/** Drop the memoized network. For tests that swap the coastline underneath it. */
export function resetTradeRoutes(): void {
  cachedNetwork = null;
  cachedGeneration = -1;
}

export function routesTo(portKey: string): TradeRoute[] {
  return tradeRoutes().filter(r => r.to === portKey);
}

export function routesFrom(portKey: string): TradeRoute[] {
  return tradeRoutes().filter(r => r.from === portKey);
}

/** The lane that brings `item` to `portKey`, if any. */
export function routeSupplying(portKey: string, item: string): TradeRoute | undefined {
  return tradeRoutes().find(r => r.to === portKey && r.items.includes(item));
}

/** Lanes whose course passes within `radius` of a point. Nearest first. */
export function routesNear(pos: Vec2, radius: number): TradeRoute[] {
  return tradeRoutes()
    .map(r => ({ r, d: distanceToPath(r.path, pos) }))
    .filter(x => x.d <= radius)
    .sort((a, b) => a.d - b.d)
    .map(x => x.r);
}

// ── Disruption ─────────────────────────────────────────────────────────────

/**
 * Read the disruption ledger.
 *
 * Optional on `WorldState` and read through here everywhere, so a save written
 * before this release answers "nothing is disrupted" — which is true of it.
 */
export function disruptions(world: WorldState): Record<string, RouteDisruption> {
  return world.routeDisruption ?? {};
}

/** How much of a lane's traffic is still sailing, 0..1. */
export function laneThroughput(world: WorldState, routeId: string): number {
  const d = disruptions(world)[routeId];
  if (!d) return LANE_FULL;
  if (world.time.day > d.until) return LANE_FULL;
  return Math.max(1 - DISRUPTION_MAX, 1 - d.severity);
}

/**
 * Record that a lane just lost a ship.
 *
 * Shippers do not stop sailing because one hull was taken; they sail less, ask
 * more for it, and come back when the sea quietens. Hence a severity that
 * accumulates to a ceiling and decays daily rather than a switch.
 */
export function disruptRoute(world: WorldState, routeId: string, amount = DISRUPTION_PER_PRIZE): WorldState {
  const ledger = disruptions(world);
  const prev = ledger[routeId];
  const carried = prev && world.time.day <= prev.until ? prev.severity : 0;
  const severity = Math.min(DISRUPTION_MAX, carried + amount);
  return {
    ...world,
    routeDisruption: {
      ...ledger,
      [routeId]: { severity, until: world.time.day + DISRUPTION_DAYS },
    },
  };
}

/** Daily: nerve comes back, and spent entries leave the ledger. */
export function tickRouteDisruption(world: WorldState): WorldState {
  const ledger = disruptions(world);
  const ids = Object.keys(ledger);
  if (ids.length === 0) return world;

  const next: Record<string, RouteDisruption> = {};
  let changed = false;
  for (const id of ids) {
    const d = ledger[id];
    if (world.time.day > d.until) { changed = true; continue; }
    const severity = d.severity - DISRUPTION_DECAY;
    if (severity <= 0) { changed = true; continue; }
    next[id] = { severity, until: d.until };
    if (severity !== d.severity) changed = true;
  }
  if (!changed) return world;
  return { ...world, routeDisruption: next };
}

// ── What actually arrives ──────────────────────────────────────────────────

/**
 * Share of a port's daily need for one good that reaches its quay, 0..1.
 *
 * `shutIn(portKey)` is how the caller reports a port that is not being served
 * at all — a blockade, or a `portClosed` event. It is passed in rather than
 * imported so this module stays a pure function of the world plus that answer,
 * and so `BlockadeSystem` can own the definition of "shut in".
 */
export function laneSupplyShare(
  world: WorldState,
  portKey: string,
  item: string,
  shutIn: (port: string) => boolean,
): number {
  const route = routeSupplying(portKey, item);
  // No lane: a well, or an ocean import. Neither can be interdicted here.
  if (!route) return LANE_FULL;
  const throughput = laneThroughput(world, route.id);
  if (!shutIn(route.from)) return throughput;

  // The usual supplier is shut. If anybody else within reach grows this, the
  // trade goes the long way round — worse, but not a famine. If nobody does,
  // all that gets through is what smugglers carry and what sailed before the
  // cordon closed.
  const open = alternateSuppliers(portKey, item).some(port => !shutIn(port));
  return throughput * (open ? REROUTE_SHARE : SUPPLIER_SHUT_SHARE);
}
