/**
 * Blockade — the first thing a captain can do to a town without landing on it.
 *
 * `portClosed` has existed since v0.9.7 and `importMul` since v0.21.0, and
 * nothing the player did could ever set either. Standing off a harbour with the
 * guns run out was the commonest act in these waters and the game had no verb
 * for it. This is that verb, and it is deliberately not a menu command: you
 * blockade a port by *being there*, day after day, which is exactly what it
 * cost in life.
 *
 * How it reads at the table:
 *
 *   - stay within `BLOCKADE_RADIUS` of a town you do not hold, with guns enough
 *     to matter against its batteries, and the cordon tightens a day at a time;
 *   - after `BLOCKADE_ONSET_DAYS` it bites: the lanes into that port carry
 *     `BLOCKADE_SUPPLY_SHARE` of what they did, its wealth bleeds through the
 *     shortages `EconomyTickSystem` already prices, and its garrison stops
 *     being paid and starts thinning;
 *   - the crown that owns it does not forget: reputation falls every day you
 *     sit there, notoriety rises, and its navy fits out for that port;
 *   - sail off and the cordon slackens a day at a time rather than snapping,
 *     so watering ship does not undo a fortnight's work.
 *
 * The payoff is that a starved town is a takeable town. A blockade is the slow
 * half of the siege the player has been able to fight since v0.13.0.
 */

import type { WorldState } from "../model/WorldState.ts";
import type { WorldEvent } from "../model/Events.ts";
import { CITIES } from "../data/cities.ts";
import { vec2Dist } from "../services/Geometry.ts";
import { getPortWaterPos } from "./PortWaterPositions.ts";
import { playerHolds } from "./ReconquestSystem.ts";
import { portFaction } from "./SiegeSystem.ts";
import { changeReputation } from "./ReputationSystem.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { getAggregatedEffects } from "./EventEffectsSystem.ts";
import { t } from "../i18n/index.ts";

/** How close the player must lie to be standing off the harbour. */
export const BLOCKADE_RADIUS = 320;

/** Days on station before the cordon is felt ashore. */
export const BLOCKADE_ONSET_DAYS = 2;

/** Days of pressure past which nothing further is gained by staying. */
const BLOCKADE_MAX_DAYS = BLOCKADE_ONSET_DAYS + 30;

/** Share of the lanes into a blockaded port that still gets through. */
export const BLOCKADE_SUPPLY_SHARE = 0.15;

/** Guns needed against a town with no batteries at all, plus one per ten defence. */
const BASE_GUNS_REQUIRED = 4;

/** Garrison lost per day under blockade — nobody is paying or feeding them. */
const BLOCKADE_DEFENSE_DRAIN = 1;

/** What the owning crown thinks of it, per day. */
const BLOCKADE_REPUTATION_PER_DAY = -2;
const BLOCKADE_NOTORIETY_PER_DAY = 1;

/** Guns the player's whole fleet can bring to bear. */
export function fleetGuns(world: WorldState): number {
  const flag = world.entities[world.player.shipId as string]?.ship;
  let guns = flag?.cannons ?? 0;
  for (const consort of world.player.fleet ?? []) guns += consort.cannons;
  return guns;
}

/** Guns a town's batteries make necessary before a cordon means anything. */
export function gunsToBlockade(world: WorldState, portKey: string): number {
  const defense = world.ports[portKey]?.defense ?? 0;
  return BASE_GUNS_REQUIRED + Math.round(defense / 10);
}

/** Days the cordon has been on this port. 0 when there is none. */
export function blockadeDays(world: WorldState, portKey: string): number {
  return world.ports[portKey]?.blockadeDays ?? 0;
}

/** Is this port's trade actually being strangled right now? */
export function blockadeEffective(world: WorldState, portKey: string): boolean {
  return blockadeDays(world, portKey) >= BLOCKADE_ONSET_DAYS;
}

/** Every port currently under an effective cordon. */
export function blockadedPorts(world: WorldState): string[] {
  return Object.keys(world.ports).filter(k => blockadeEffective(world, k));
}

/**
 * Is this port being served by anybody at all?
 *
 * The one definition, handed to `TradeRouteSystem` so a lane out of a shut-in
 * port carries almost nothing — a blockade of Havana is felt in every town
 * Havana supplies, which is the geography the trade module was missing.
 */
export function portShutIn(world: WorldState, portKey: string): boolean {
  return blockadeEffective(world, portKey) || getAggregatedEffects(world, portKey).portClosed;
}

/**
 * The port the player is standing off today, or null.
 *
 * Nearest first, so lying between two harbours presses the closer one rather
 * than both. A town the player already holds is his own and cannot be
 * blockaded; nor can one he is currently ashore in.
 */
export function portUnderPressure(world: WorldState): string | null {
  const harbour = harbourInReach(world);
  if (!harbour) return null;
  return fleetGuns(world) >= gunsToBlockade(world, harbour) ? harbour : null;
}

/**
 * The harbour the player is lying off, guns or no guns.
 *
 * Split out from `portUnderPressure` because the HUD has to be able to say
 * "you are here but you have not brought enough" — a cordon that silently does
 * nothing is indistinguishable from a broken one.
 */
export function harbourInReach(world: WorldState): string | null {
  if (world.player.location.type !== "sea") return null;
  const ship = world.entities[world.player.shipId as string];
  if (!ship || ship.mode !== "sailing") return null;

  let best: string | null = null;
  let bestDist = Infinity;
  for (const portKey of Object.keys(CITIES)) {
    if (!world.ports[portKey]) continue;
    if (playerHolds(world, portKey)) continue;
    const dist = vec2Dist(ship.pos, getPortWaterPos(portKey));
    if (dist > BLOCKADE_RADIUS || dist >= bestDist) continue;
    best = portKey;
    bestDist = dist;
  }
  return best;
}

/**
 * One day of blockade bookkeeping. Runs before the economy tick, so the day a
 * cordon closes is the first day the port goes short.
 */
export function tickBlockades(world: WorldState): { world: WorldState; events: WorldEvent[] } {
  const pressed = portUnderPressure(world);
  const events: WorldEvent[] = [];
  let w = world;

  const ports = { ...w.ports };
  let portsChanged = false;

  for (const portKey of Object.keys(ports)) {
    const port = ports[portKey];
    const prev = port.blockadeDays ?? 0;
    const next = portKey === pressed
      ? Math.min(BLOCKADE_MAX_DAYS, prev + 1)
      : prev - 1;
    if (next === prev) continue;

    // Announcements hang off the *biting* threshold, not off zero. A cordon
    // slackens for days after the squadron leaves, and telling the player it
    // was lifted a week after it stopped mattering is telling him nothing.
    const wasBiting = prev >= BLOCKADE_ONSET_DAYS;
    const isBiting = next >= BLOCKADE_ONSET_DAYS;
    const name = CITIES[portKey]?.name ?? portKey;
    if (!wasBiting && isBiting) {
      events.push({ type: "Toast", message: t("blockade.established", { port: name }) });
      w = addLogEntry(w, "blockade.log_established", { port: name });
    } else if (wasBiting && !isBiting) {
      events.push({ type: "Toast", message: t("blockade.lifted", { port: name }) });
      w = addLogEntry(w, "blockade.log_lifted", { port: name });
    }

    portsChanged = true;
    if (next <= 0) {
      const { blockadeDays: _lifted, ...rest } = port;
      ports[portKey] = rest;
      continue;
    }

    // A garrison nobody is paying or feeding thins out. This is what makes a
    // cordon worth keeping: an assault later meets fewer men on the wall.
    const defense = isBiting && portKey === pressed
      ? Math.max(0, port.defense - BLOCKADE_DEFENSE_DRAIN)
      : port.defense;

    ports[portKey] = { ...port, blockadeDays: next, defense };
  }

  if (portsChanged) w = { ...w, ports };

  // Standing off a crown's harbour is an act of war, whatever flag you fly.
  if (pressed && (ports[pressed]?.blockadeDays ?? 0) >= BLOCKADE_ONSET_DAYS) {
    const owner = portFaction(w, pressed) as string;
    w = {
      ...w,
      player: {
        ...w.player,
        reputation: changeReputation(w.player.reputation, owner, BLOCKADE_REPUTATION_PER_DAY),
        notoriety: (w.player.notoriety ?? 0) + BLOCKADE_NOTORIETY_PER_DAY,
      },
    };
  }

  return { world: w, events };
}

/**
 * Fleet strength as a shorthand the UI can print.
 *
 * Kept here rather than in `FleetSystem` because the only question it answers
 * is the blockade one: have I brought enough guns to shut this harbour?
 */
export function blockadeReadiness(world: WorldState, portKey: string): {
  guns: number;
  required: number;
  ready: boolean;
} {
  const guns = fleetGuns(world);
  const required = gunsToBlockade(world, portKey);
  return { guns, required, ready: guns >= required };
}
