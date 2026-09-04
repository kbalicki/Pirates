/**
 * The informer in the tavern — the third man who has work for a captain.
 *
 * The governor commissions a defence (v0.17.0) and the freight office a passage
 * (v0.23.0), and both are the crown's work: honest, paid, and written down. A
 * pirate had no third door. The man at the back of the tavern is it, and what he
 * sells is the only trade this game had no verb for — *somebody else's* trade,
 * ruined to order.
 *
 * A merchant house in this town does not want a rival's run raided in the
 * abstract. It wants the Havana–Port Royale sugar run to become uninsurable,
 * and it will pay for that and never admit to it. Which is exactly what
 * `TradeRouteSystem` has modelled since v0.22.0: `routeDisruption` is how badly
 * the shippers' nerve has gone on one named lane, it climbs 0.3 with every hull
 * taken there and decays 0.12 a day. So the commission does not ask for a body
 * count. It asks for a **number the world already keeps**, which means the
 * player fulfils it by doing the thing rather than by tallying it:
 *
 *     cut the <from>–<to> run to `severity` within `days`
 *
 * Three prizes in a fortnight will do it. Two will not, because the sea
 * quietens faster than that — and a captain who dawdles watches his own work
 * decay, which is a deadline with a reason behind it instead of a clock.
 *
 * What it costs: the crown at the far end of that lane is not stupid about who
 * has been on it. Reputation with them falls and notoriety rises — and since
 * v0.25.0 notoriety is what feeds a town under the black flag, so that is not a
 * penalty so much as a fork in the road.
 */

import type { WorldState } from "../model/WorldState.ts";
import type { QuestDef } from "./QuestSystem.ts";
import { startQuest } from "./QuestSystem.ts";
import { CITIES } from "../data/cities.ts";
import { FACTIONS } from "../data/factions.ts";
import { routesNear, laneThroughput, disruptions } from "./TradeRouteSystem.ts";
import { getPortWaterPos } from "./PortWaterPositions.ts";
import { portFaction } from "./SiegeSystem.ts";

/** Quest ids for an informer's commission all start with this. */
export const RAID_QUEST_PREFIX = "raid_";

/**
 * One at a time.
 *
 * Not an arbitrary limit: the job is to be *on* one lane for a fortnight, and
 * two of them at once would mean neither. The freight office allows two because
 * one hold can carry two consignments past the same headland.
 */
export const MAX_ACTIVE_RAIDS = 1;

/** How far from the tavern a lane can run and still be the local gossip. */
const RAID_REACH = 700;

/**
 * How badly the lane must be scared off before the house calls it done.
 *
 * `DISRUPTION_PER_PRIZE` is 0.3 and the decay is 0.12 a day, so 0.6 is three
 * hulls taken inside a couple of weeks — a season's work for a sloop, an
 * afternoon for a squadron. Anything less was reachable with two prizes, and
 * two prizes is what a captain does by accident.
 */
export const RAID_SEVERITY = 0.6;

/** Days allowed. Long enough for the weather, short enough that decay bites. */
const RAID_DAYS = 30;

/** Fee: a flat retainer plus what the length of the run is worth to ruin. */
const RAID_BASE_FEE = 250;
const RAID_DISTANCE_FEE = 900;

/** What the injured crown makes of it, and what the brethren do. */
export const RAID_REPUTATION = -14;
export const RAID_NOTORIETY = 8;

export type RaidCommission = {
  /** `raid_<routeId>`. Stable, so one lane cannot be commissioned twice. */
  id: string;
  routeId: string;
  from: string;
  to: string;
  /** Localised names, so the quest log reads without a lookup. */
  fromName: string;
  toName: string;
  /** The crown whose trade this is — the one that will remember it. */
  crown: string;
  severity: number;
  reward: number;
  acceptedDay: number;
  /** Baked at signing, for the reason every other contract in this game bakes it. */
  days: number;
};

export function raidQuestId(routeId: string): string {
  return RAID_QUEST_PREFIX + routeId;
}

/** The flag a cut lane stamps. The quest hangs off it, as a charter does. */
export function raidCutFlag(commission: RaidCommission): string {
  return "raid_cut_" + commission.id;
}

/** Commissions the captain is under right now. */
export function activeRaids(world: WorldState): RaidCommission[] {
  const out: RaidCommission[] = [];
  for (const runtime of world.player.questLog) {
    if (runtime.completed) continue;
    if (!(runtime.questId as string).startsWith(RAID_QUEST_PREFIX)) continue;
    const commission = runtime.data.commission as RaidCommission | undefined;
    if (commission) out.push(commission);
  }
  return out;
}

/** How far along the lane's ruin stands today, 0..1 against what was asked. */
export function raidProgress(world: WorldState, commission: RaidCommission): number {
  const severity = disruptions(world)[commission.routeId]?.severity ?? 0;
  return Math.min(1, severity / commission.severity);
}

/** True when the lane is as dead as the house wanted it. */
export function raidDone(world: WorldState, commission: RaidCommission): boolean {
  return laneThroughput(world, commission.routeId) <= 1 - commission.severity + 1e-9;
}

/**
 * The job on the table in this tavern today, or nothing.
 *
 * Derived, never stored, exactly as the freight office's book is: a function of
 * the lanes passing this town, whose trade they are, and how quiet they have
 * been lately. One offer rather than three — an informer has one thing worth
 * hearing, and a list of them would read as a job board rather than as a man
 * leaning over a table.
 *
 * The lane must belong to somebody else. A house does not pay to have its own
 * crown's shipping ruined, and a town's own trade is the trade its tavern
 * drinks on.
 */
export function raidOffer(world: WorldState, portKey: string): RaidCommission | null {
  if (activeRaids(world).length >= MAX_ACTIVE_RAIDS) return null;

  const here = getPortWaterPos(portKey);
  if (!here) return null;
  const localCrown = portFaction(world, portKey) as string;

  let best: RaidCommission | null = null;
  for (const lane of routesNear(here, RAID_REACH)) {
    const crown = portFaction(world, lane.to) as string;
    if (crown === localCrown) continue;               // not against our own
    if (lane.from === portKey || lane.to === portKey) continue;
    // Already ruined: there is nothing left to pay for.
    if (laneThroughput(world, lane.id) <= 1 - RAID_SEVERITY + 1e-9) continue;

    const reward = Math.round(
      RAID_BASE_FEE + RAID_DISTANCE_FEE * Math.min(1, lane.length / 1200),
    );
    const commission: RaidCommission = {
      id: raidQuestId(lane.id),
      routeId: lane.id,
      from: lane.from,
      to: lane.to,
      fromName: CITIES[lane.from]?.name ?? lane.from,
      toName: CITIES[lane.to]?.name ?? lane.to,
      crown,
      severity: RAID_SEVERITY,
      reward,
      acceptedDay: world.time.day,
      days: RAID_DAYS,
    };
    if (!best || commission.reward > best.reward) best = commission;
  }
  return best;
}

/** Whose trade it is, in words the tavern screen can print. */
export function raidVictim(commission: RaidCommission): string {
  return FACTIONS[commission.crown]?.name ?? commission.crown;
}

/**
 * Rebuild the quest from a signed commission.
 *
 * Every number comes out of the commission and never out of `world`: this runs
 * from `buildQuestRegistry` on every load, and a definition that read today's
 * clock would quietly hand itself another thirty days each time.
 */
export function raidQuest(commission: RaidCommission): QuestDef {
  const vars = {
    from: commission.fromName,
    port: commission.toName,
    gold: commission.reward,
    days: commission.days,
  };

  return {
    id: commission.id,
    titleKey: "quest.raid_title",
    start: "hunt",
    stages: {
      hunt: {
        id: "hunt",
        objectiveKey: "quest.raid_hunt",
        vars,
        on: [
          {
            trigger: { type: "flag_set", key: raidCutFlag(commission) },
            next: "paid",
            effects: [
              { type: "gold", amount: commission.reward },
              { type: "reputation", faction: commission.crown, amount: RAID_REPUTATION },
              { type: "notoriety", amount: RAID_NOTORIETY },
              { type: "log", key: "quest.raid_paid", vars },
            ],
          },
          {
            trigger: { type: "days_passed", days: commission.days },
            next: "cold",
            effects: [{ type: "log", key: "quest.raid_cold", vars }],
          },
        ],
      },
      paid: { id: "paid", objectiveKey: "quest.raid_paid", vars, completes: true },
      cold: { id: "cold", objectiveKey: "quest.raid_cold", vars, fails: true },
    },
  };
}

export type RaidResult = { world: WorldState; error?: string };

/** Take the job. Nothing changes hands until the lane is quiet. */
export function acceptRaid(world: WorldState, commission: RaidCommission): RaidResult {
  if (activeRaids(world).length >= MAX_ACTIVE_RAIDS) {
    return { world, error: "informer.too_many" };
  }
  return { world: startQuest(world, raidQuest(commission), { commission }) };
}

/**
 * Daily: has any commissioned lane gone as quiet as it was paid to go?
 *
 * The flags come back rather than the quests being advanced in here, because a
 * quest is advanced by whoever owns the day — `WorldEngine` — and a system that
 * both watched the world and paid out of it would be two systems in one coat.
 * The same shape `settleRelief` uses for a defence settled offscreen.
 */
export function tickRaidCommissions(world: WorldState): { world: WorldState; flags: string[] } {
  const flags: string[] = [];
  let worldFlags = world.worldFlags;

  for (const commission of activeRaids(world)) {
    const flag = raidCutFlag(commission);
    if (worldFlags[flag] === true) continue;
    if (!raidDone(world, commission)) continue;
    worldFlags = { ...worldFlags, [flag]: true };
    flags.push(flag);
  }

  if (flags.length === 0) return { world, flags };
  return { world: { ...world, worldFlags }, flags };
}
