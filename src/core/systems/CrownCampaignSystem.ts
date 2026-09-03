/**
 * CrownCampaignSystem — the wars on the news board reach the map.
 *
 * The game has had ten historical wars since v0.9.7. They doubled navy patrols,
 * they moved prices, they put privateers in the water — and the map they were
 * fought over never changed by so much as one flag. Only the player could take
 * a town. Every colony on the board was, in the end, a fixture.
 *
 * That made the biggest mechanic in the game a solo act. `SiegeSystem` and
 * `ReconquestSystem` between them already knew how to change hands and how to
 * come back for a town; what was missing was anyone else doing it.
 *
 * ## The loop
 *
 *   1. Two crowns are at war (`war_start`, from `WorldEventSystem`).
 *   2. Every day the stronger side rolls to fit out an expedition against one
 *      of the other's colonies. It picks the weakest thing it can reach, which
 *      means a town the player has just gutted is exactly the sort of place
 *      that gets taken while he is over the horizon.
 *   3. The expedition is an ordinary `WorldEventState`, so it travels the news
 *      plumbing — the taverns of both crowns, and every NPC carrying gossip.
 *   4. It arrives, and `tickReconquest` fights it out with the same arithmetic
 *      a relief squadron uses. If the player happens to be standing off that
 *      harbour and the defenders count him a friend, he fights it in person in
 *      `CityDefenseScene` instead of reading about it.
 *
 * Step 4 is the whole reason this module and `CityDefenseSystem` shipped in the
 * same release. A war that moves flags is background colour on its own; a war
 * that moves flags and lets you stand in the way of one is a reason to keep a
 * letter of marque.
 *
 * ## Why crowns are slower about it than the player
 *
 * `CAMPAIGN_DAILY_BASE` is half `RELIEF_DAILY_BASE`, and a town that has just
 * been fought over is off the table for `CAMPAIGN_COOLDOWN_DAYS`. A crown
 * taking a colony is a season's work and a line in a history book; the player
 * doing it is Tuesday. If the two rates were equal the map would churn, every
 * flag would be provisional, and taking a town yourself would stop meaning
 * anything.
 *
 * Pure and seeded from `RngState`, like the rest of `core/`.
 */

import type { WorldState, RngState, WorldEventState } from "../model/WorldState.ts";
import type { WorldEvent } from "../model/Events.ts";
import { CITIES } from "../data/cities.ts";
import { FACTIONS } from "../data/factions.ts";
import { getPortBaseline } from "../data/economyBaselines.ts";
import { rngNext, rngNextFloat, rngNextInt } from "../services/RNG.ts";
import { t } from "../i18n/index.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { portFaction, SIZE_SOLDIERS } from "./SiegeSystem.ts";
import { crownStrength, activeExpeditionFor, SIZE_PRIORITY } from "./ReconquestSystem.ts";

// ── Constants ─────────────────────────────────────────────

/** Daily chance a crown at war fits out an expedition, before modifiers. */
export const CAMPAIGN_DAILY_BASE = 0.03;
/** Expeditions between crowns that may be at sea at any one time. */
export const MAX_CAMPAIGNS_IN_FLIGHT = 2;
/** Days the expedition is at sea, and the warning everyone gets. */
export const CAMPAIGN_SAIL_DAYS: [number, number] = [10, 20];
/** Days a town is left alone after any expedition has been fought over it. */
export const CAMPAIGN_COOLDOWN_DAYS = 90;
/**
 * Crowns are more careful than pirates, and this is where that lives.
 *
 * A campaign is only launched when the target looks takeable. `defense` above
 * this and the ministers find something else to do with the fleet — which is
 * what makes the player's own raiding read as strategy: a colony he has just
 * knocked the walls off is a colony somebody else can now have.
 */
export const CAMPAIGN_DEFENSE_CEILING = 70;

const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));

// ── Who is fighting whom ──────────────────────────────────

export type CrownWar = { attacker: string; defender: string };

/**
 * Every crown pairing currently at war, both ways round.
 *
 * `war_start` records two factions and no aggressor, because for prices and
 * patrols it does not matter which. For a landing it does, so each war is read
 * out in both directions and the roll decides who is doing the sailing.
 */
export function warPairs(world: WorldState): CrownWar[] {
  const pairs: CrownWar[] = [];
  for (const ev of world.worldEvents) {
    if (ev.type !== "war_start" || ev.endDay < world.time.day) continue;
    const [a, b] = ev.factions;
    if (!a || !b) continue;
    pairs.push({ attacker: a, defender: b });
    pairs.push({ attacker: b, defender: a });
  }
  return pairs;
}

/** Expeditions between crowns currently at sea. */
export function campaignsInFlight(world: WorldState): WorldEventState[] {
  return world.worldEvents.filter(ev => ev.type === "campaign");
}

/**
 * Colonies of `defender` that `attacker` would actually sail for today.
 *
 * A town already being fought over, one still inside its cooling-off period and
 * one behind a full-strength wall are all off the list. What is left is the
 * soft underbelly of an empire, which is what an eighteenth-century ministry
 * would have been looking at too.
 */
export function campaignTargets(world: WorldState, war: CrownWar): string[] {
  const targets: string[] = [];
  for (const key of Object.keys(CITIES)) {
    if ((portFaction(world, key) as string) !== war.defender) continue;
    const port = world.ports[key];
    if (!port) continue;
    if (activeExpeditionFor(world, key)) continue;
    if ((port.nextCampaignDay ?? 0) > world.time.day) continue;
    if (port.defense > CAMPAIGN_DEFENSE_CEILING) continue;
    targets.push(key);
  }
  return targets;
}

/**
 * How attractive a colony is to the crown that wants it.
 *
 * Weak first, big second, and the exponent is what makes that ordering true
 * rather than merely intended. Linear in `defense`, the size term won: a
 * well-walled medium town outweighed a defenceless outpost, which is not how
 * anybody picks a target. Squaring the weakness term puts a place the player
 * has just gutted at the top of the list where it belongs — and keeps
 * `SIZE_PRIORITY`, the same axis a crown uses for its own lost towns, as the
 * tie-breaker between two equally soft ones.
 */
export function targetWeight(world: WorldState, portKey: string): number {
  const def = CITIES[portKey];
  if (!def) return 0;
  const port = world.ports[portKey];
  const defense = clamp(0, 100, port?.defense ?? getPortBaseline(portKey).defense);
  const softness = 1.05 - defense / 100;
  return softness * softness * SIZE_PRIORITY[def.population];
}

/** The chance, today, that this crown sends an expedition against that one. */
export function campaignChance(world: WorldState, war: CrownWar): number {
  if (campaignsInFlight(world).length >= MAX_CAMPAIGNS_IN_FLIGHT) return 0;
  if (campaignTargets(world, war).length === 0) return 0;
  const mine = crownStrength(world, war.attacker);
  const theirs = crownStrength(world, war.defender);
  if (mine <= 0) return 0;
  // A crown that is winning the wider war presses; one being stripped of its
  // own colonies has nothing to spare for anyone else's.
  const momentum = clamp(0.4, 1.6, 0.6 + (mine - theirs) * 1.2);
  return CAMPAIGN_DAILY_BASE * clamp(0.3, 1.2, 0.3 + mine * 0.9) * momentum;
}

// ── Picking a town and fitting out for it ─────────────────

/** Choose which colony the expedition is for, weighted by `targetWeight`. */
export function pickTarget(
  world: WorldState,
  war: CrownWar,
  rng: RngState,
): { portKey?: string; rng: RngState } {
  const targets = campaignTargets(world, war);
  if (targets.length === 0) return { rng };

  const weights = targets.map(key => targetWeight(world, key));
  const total = weights.reduce((a, b) => a + b, 0);
  const roll = rngNext(rng);
  if (total <= 0) {
    const pick = rngNextInt(roll.state, 0, targets.length - 1);
    return { portKey: targets[pick.value], rng: pick.state };
  }

  let cursor = roll.value * total;
  for (let i = 0; i < targets.length; i++) {
    cursor -= weights[i];
    if (cursor <= 0) return { portKey: targets[i], rng: roll.state };
  }
  return { portKey: targets[targets.length - 1], rng: roll.state };
}

/**
 * Put a crown's expedition to sea.
 *
 * The event carries the same three numbers a relief squadron does — soldiers,
 * guns, days — because `resolveRelief` and `CityDefenseSystem` both read it
 * back through `expeditionFromEvent`, and there is deliberately only one shape
 * of landing in this game.
 *
 * `ports` lists the target plus every colony of both crowns. Neither side keeps
 * that sort of thing quiet, and a landing the player cannot hear about coming
 * is a landing he cannot do anything about. `EventEffectsSystem` gives the type
 * no per-port effect, which is what makes so wide a list safe.
 */
export function launchCampaign(
  world: WorldState,
  war: CrownWar,
  portKey: string,
  rng: RngState,
): { world: WorldState; event: WorldEventState; rng: RngState } {
  const def = CITIES[portKey];
  const strength = clamp(0.5, 1.2, 0.4 + crownStrength(world, war.attacker) * 0.8);
  const sizeRoll = rngNextFloat(rng, 0.85, 1.35);
  const soldiers = Math.max(
    25,
    Math.round(SIZE_SOLDIERS[def.population] * sizeRoll.value * strength),
  );
  const sailRoll = rngNextInt(sizeRoll.state, CAMPAIGN_SAIL_DAYS[0], CAMPAIGN_SAIL_DAYS[1]);

  const vars: Record<string, string | number> = {
    port: def.name,
    faction: FACTIONS[war.attacker]?.name ?? war.attacker,
    holder: FACTIONS[war.defender]?.name ?? war.defender,
    soldiers,
    guns: Math.max(4, Math.round(soldiers / 4)),
    days: sailRoll.value,
  };

  const involved = Object.keys(CITIES).filter(k => {
    const owner = portFaction(world, k) as string;
    return k !== portKey && (owner === war.attacker || owner === war.defender);
  });

  const event: WorldEventState = {
    id: `campaign_${portKey}_${world.time.day}`,
    type: "campaign",
    startDay: world.time.day,
    endDay: world.time.day + sailRoll.value,
    ports: [portKey, ...involved],
    // Same order `resolveRelief` reads: the one coming, then the one holding.
    factions: [war.attacker, war.defender],
    severity: 3,
    headline: "news.campaign",
    vars,
  };

  let w: WorldState = {
    ...world,
    worldEvents: [...world.worldEvents, event],
    // Same reasoning as `launchExpedition`: the toast tells the player, so the
    // chart is allowed to know. See `ExpeditionCourseRenderer`.
    knownEventIds: [...(world.knownEventIds ?? []), event.id],
    ports: {
      ...world.ports,
      [portKey]: { ...world.ports[portKey], nextCampaignDay: world.time.day + CAMPAIGN_COOLDOWN_DAYS },
    },
  };
  w = addLogEntry(w, "news.campaign", vars);
  return { world: w, event, rng: sailRoll.state };
}

// ── Daily tick ────────────────────────────────────────────

export type CampaignTick = {
  world: WorldState;
  events: WorldEvent[];
};

/**
 * Once per game day, after `tickReconquest` has resolved what has arrived.
 *
 * Order matters the other way round from the relief tick: launching first would
 * let a campaign be fitted out and fought on the same morning, because
 * `tickReconquest` walks every expedition whose passage is over and a
 * zero-day passage counts.
 */
export function tickCampaigns(world: WorldState): CampaignTick {
  let w = world;
  let rng = w.rng;
  const events: WorldEvent[] = [];

  for (const war of warPairs(w)) {
    const chance = campaignChance(w, war);
    if (chance <= 0) continue;
    const roll = rngNext(rng);
    rng = roll.state;
    if (roll.value >= chance) continue;

    const picked = pickTarget(w, war, rng);
    rng = picked.rng;
    if (!picked.portKey) continue;

    const launched = launchCampaign(w, war, picked.portKey, rng);
    w = launched.world;
    rng = launched.rng;
    events.push({ type: "Toast", message: t("campaign.toast_sailing", launched.event.vars) });
  }

  return { world: { ...w, rng }, events };
}
