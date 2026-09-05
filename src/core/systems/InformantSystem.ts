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
 *
 * Since v0.26.0 he has a second thing to sell, at the bottom of this file: a
 * **relief order** into a town that cannot get what it eats. The two pull in
 * opposite directions on the same axis, which is the point of having both — one
 * costs standing with a crown and buys notoriety, the other earns a little of
 * that standing back from the crown it feeds.
 */

import type { WorldState } from "../model/WorldState.ts";
import type { QuestDef } from "./QuestSystem.ts";
import { startQuest } from "./QuestSystem.ts";
import { CITIES } from "../data/cities.ts";
import { FACTIONS } from "../data/factions.ts";
import { routesNear, laneThroughput, laneSupplyShare, disruptions } from "./TradeRouteSystem.ts";
import { getPortWaterPos } from "./PortWaterPositions.ts";
import { portFaction } from "./SiegeSystem.ts";
import { ITEMS } from "../data/items.ts";
import { blockadeEffective, BLOCKADE_SUPPLY_SHARE } from "./BlockadeSystem.ts";
import { playerHolds } from "./ReconquestSystem.ts";
import { supplierShutIn, blackFlagImportShare } from "./EconomyTickSystem.ts";
import { repriceItem } from "./PricingSystem.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import {
  livingNamedShips,
  namedShipById,
  namedShipPos,
  namedShipFateFlag,
} from "./NamedShipSystem.ts";

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


// ═══════════════════════════════════════════════════════════════════════════
// The other kind of work: a town that cannot get what it eats (v0.26.0)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The informer's second commission — and why it is a purchase order, not a
 * freight.
 *
 * The obvious second job for the man at the back of the tavern was "run this
 * past the cordon for us", and the obvious second job is already in the game:
 * the freight office has paid `FREIGHT_BLOCKADE` — half again — for exactly
 * that since v0.23.0, and building it here as well would be the same screen
 * with a worse name on it.
 *
 * What the freight office cannot do is buy. A charter hands the captain
 * somebody else's cargo and asks him to carry it; a house with a starving
 * customer and no supplier has no cargo to hand him. So this commission gives
 * him nothing at signing except a price:
 *
 *     land <qty> of <good> in <town> within <days> — <gold>, whatever it cost you
 *
 * That is a different game from a charter. Nothing can be stolen from him
 * because nothing was lent; the risk is commercial rather than custodial. He
 * has to *source* the goods — buy them cheap where they grow, or take them out
 * of a prize's hold — and the money is made on the spread, not on the passage.
 *
 * And the reason such a town exists at all is v0.26.0's other half: a lane
 * delivery now comes out of a real warehouse, so a shut-in supplier leaves his
 * clients genuinely short once whoever covered for him runs dry. A captain who
 * takes a town creates these commissions himself, three hundred miles away,
 * without being told.
 *
 * The rate is struck against the item's **base** price and then held *under*
 * the town's own quote, and both halves of that are load-bearing. A starving
 * town quotes triple, so a premium over the local price would be an invitation
 * to buy at the counter and sell it back across the same table; and a flat rate
 * with no reference to the counter at all is the same invitation whenever the
 * famine has not reached the price yet — which was measured, not reasoned
 * about, the first time this was written. A house that would pay more than the
 * market next to it is not a house, it is a bug.
 *
 * What the captain is being paid for, then, is not a better price per ton. It
 * is a *fixed* one for the whole hold: selling forty tons over the counter of a
 * town with thirty tons of shed slides the quote down under his own feet, and
 * this does not.
 */

/** Quest ids for a relief order all start with this. */
export const RELIEF_QUEST_PREFIX = "relief_";

/** One at a time: he is one hold, and the point is that the hold is committed. */
export const MAX_ACTIVE_RELIEF = 1;

/** How far the tavern's gossip reaches for a town in trouble. */
const RELIEF_REACH = 900;

/** Below this, a town is inconvenienced rather than short, and nobody pays. */
const RELIEF_MIN_SHORTFALL = 0.25;

/** Rate per ton, as a multiple of the good's base price: floor and full famine. */
const RELIEF_RATE_BASE = 1.6;
const RELIEF_RATE_SHORTFALL = 1.4;

/** And never more than this share of what the town's own counter is asking. */
const RELIEF_UNDERCUT = 0.9;

/** Tons: the least worth writing a paper for, and the most one house needs. */
const RELIEF_MIN_TONS = 8;
const RELIEF_MAX_TONS = 40;

/** Days allowed. A voyage out to find the goods and a voyage back. */
const RELIEF_DAYS = 24;

/** What landing it does for the captain's name, and for theirs. */
export const RELIEF_REPUTATION = 6;
export const RELIEF_NOTORIETY = 3;
/** And what letting them starve costs, having said he would not. */
export const RELIEF_LAPSE_REPUTATION = -5;

export type ReliefCommission = {
  /** `relief_<port>_<item>`. Stable, so one town cannot be commissioned twice. */
  id: string;
  port: string;
  portName: string;
  item: string;
  qty: number;
  reward: number;
  /** How short the town is of this, 0..1. Printed, so the price has a reason. */
  shortfall: number;
  /** The crown that will remember being fed. */
  crown: string;
  acceptedDay: number;
  days: number;
};

export function reliefQuestId(portKey: string, item: string): string {
  return `${RELIEF_QUEST_PREFIX}${portKey}_${item}`;
}

/** The flag a landing stamps. The quest hangs off it, as a charter does. */
export function reliefLandedFlag(commission: ReliefCommission): string {
  return "relief_landed_" + commission.id;
}

/** Relief orders the captain is under right now. */
export function activeRelief(world: WorldState): ReliefCommission[] {
  const out: ReliefCommission[] = [];
  for (const runtime of world.player.questLog) {
    if (runtime.completed) continue;
    if (!(runtime.questId as string).startsWith(RELIEF_QUEST_PREFIX)) continue;
    const commission = runtime.data.commission as ReliefCommission | undefined;
    if (commission) out.push(commission);
  }
  return out;
}

/**
 * How much of a town's daily need for one good is failing to arrive, 0..1.
 *
 * Every way the world has of stopping a delivery, multiplied: the lane itself
 * (a shut-in supplier, a run the shippers are afraid of), a cordon across this
 * harbour, and the black flag over the town hall. The same three numbers
 * `EconomyTickSystem` multiplies when it decides what actually lands, read from
 * outside — so the figure the informer quotes is the figure the town is living.
 */
export function supplyShortfall(world: WorldState, portKey: string, item: string): number {
  const lane = laneSupplyShare(world, portKey, item, port => supplierShutIn(world, port));
  const cordon = blockadeEffective(world, portKey) ? BLOCKADE_SUPPLY_SHARE : 1;
  const flag = playerHolds(world, portKey) ? blackFlagImportShare(world) : 1;
  return Math.max(0, Math.min(1, 1 - lane * cordon * flag));
}

/** Tons this hold could lift for the job, whatever is in it at the moment. */
function reliefSize(world: WorldState): number {
  const cap = world.entities[world.player.shipId as string]?.ship?.cargoCap ?? 0;
  return Math.min(RELIEF_MAX_TONS, Math.floor(cap * 0.6));
}

/**
 * The relief order on the table in this tavern today, or nothing.
 *
 * Derived like every other offer in this game. The worst-off town in reach
 * wins, and its own tavern is excluded — a house does not pay a stranger to
 * bring in what it is standing on top of.
 */
export function reliefOffer(world: WorldState, portKey: string): ReliefCommission | null {
  if (activeRelief(world).length >= MAX_ACTIVE_RELIEF) return null;

  const here = getPortWaterPos(portKey);
  if (!here) return null;
  const qty = reliefSize(world);
  if (qty < RELIEF_MIN_TONS) return null;

  let best: ReliefCommission | null = null;
  for (const [townKey, def] of Object.entries(CITIES)) {
    if (townKey === portKey) continue;
    const town = world.ports[townKey];
    if (!town) continue;
    const there = getPortWaterPos(townKey);
    if (!there) continue;
    if (Math.hypot(there.x - here.x, there.y - here.y) > RELIEF_REACH) continue;

    for (const item of def.demands) {
      if (def.produces.includes(item)) continue;
      const shortfall = supplyShortfall(world, townKey, item);
      if (shortfall < RELIEF_MIN_SHORTFALL) continue;

      const rate = RELIEF_RATE_BASE + RELIEF_RATE_SHORTFALL * shortfall;
      const posted = town.prices[item] ?? ITEMS[item]?.basePrice ?? 0;
      const perTon = Math.min((ITEMS[item]?.basePrice ?? 10) * rate, posted * RELIEF_UNDERCUT);
      if (perTon <= 0) continue;
      const commission: ReliefCommission = {
        id: reliefQuestId(townKey, item),
        port: townKey,
        portName: CITIES[townKey]?.name ?? townKey,
        item,
        qty,
        reward: Math.round(perTon * qty),
        shortfall,
        crown: portFaction(world, townKey) as string,
        acceptedDay: world.time.day,
        days: RELIEF_DAYS,
      };
      if (!best || commission.reward > best.reward) best = commission;
    }
  }
  return best;
}

/**
 * Rebuild the quest from a signed relief order.
 *
 * Every number out of the commission, never out of `world` — `buildQuestRegistry`
 * runs this on every load.
 */
export function reliefQuest(commission: ReliefCommission): QuestDef {
  const vars = {
    port: commission.portName,
    item: ITEMS[commission.item]?.name ?? commission.item,
    qty: commission.qty,
    gold: commission.reward,
    days: commission.days,
  };

  return {
    id: commission.id,
    titleKey: "quest.relief_title",
    start: "run",
    stages: {
      run: {
        id: "run",
        objectiveKey: "quest.relief_run",
        vars,
        on: [
          {
            trigger: { type: "flag_set", key: reliefLandedFlag(commission) },
            next: "paid",
            effects: [
              { type: "gold", amount: commission.reward },
              { type: "reputation", faction: commission.crown, amount: RELIEF_REPUTATION },
              { type: "notoriety", amount: RELIEF_NOTORIETY },
              { type: "log", key: "quest.relief_paid", vars },
            ],
          },
          {
            trigger: { type: "days_passed", days: commission.days },
            next: "cold",
            effects: [
              { type: "reputation", faction: commission.crown, amount: RELIEF_LAPSE_REPUTATION },
              { type: "log", key: "quest.relief_cold", vars },
            ],
          },
        ],
      },
      paid: { id: "paid", objectiveKey: "quest.relief_paid", vars, completes: true },
      cold: { id: "cold", objectiveKey: "quest.relief_cold", vars, fails: true },
    },
  };
}

export type ReliefResult = { world: WorldState; error?: string };

/** Take the order. Nothing is loaded: the goods are his problem, and that is the job. */
export function acceptRelief(world: WorldState, commission: ReliefCommission): ReliefResult {
  if (activeRelief(world).length >= MAX_ACTIVE_RELIEF) {
    return { world, error: "informer.relief_too_many" };
  }
  return { world: startQuest(world, reliefQuest(commission), { commission }) };
}

/** Is this order landable right here, right now? */
export function canLandRelief(world: WorldState, commission: ReliefCommission): boolean {
  if (world.player.location.type !== "port") return false;
  if ((world.player.location.portId as string) !== commission.port) return false;
  const cargo = world.entities[world.player.shipId as string]?.ship?.cargo ?? {};
  return (cargo[commission.item] ?? 0) >= commission.qty;
}

/**
 * Land it: the goods leave the hold and go onto the town's shelves.
 *
 * And are requoted on the way, because a town that has just had forty tons of
 * food walked into it is not short of food any more — `PricingSystem` has
 * existed since v0.24.0 precisely so that this is true the same afternoon
 * rather than at midnight.
 *
 * The flag is all this stamps. Gold, standing and the log line come out of
 * `advanceQuests`, which the caller runs — the same division of labour the
 * charter and the defence commission use.
 */
export function landRelief(world: WorldState, commission: ReliefCommission): ReliefResult {
  if (!canLandRelief(world, commission)) return { world, error: "informer.relief_not_here" };

  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  const port = world.ports[commission.port];
  if (!entity?.ship || !port) return { world, error: "informer.relief_not_here" };

  const cargo = { ...entity.ship.cargo };
  cargo[commission.item] = (cargo[commission.item] ?? 0) - commission.qty;
  if (cargo[commission.item] <= 0) delete cargo[commission.item];

  const inventory = { ...port.inventory };
  inventory[commission.item] = (inventory[commission.item] ?? 0) + commission.qty;

  const landed: WorldState = {
    ...world,
    entities: { ...world.entities, [shipId]: { ...entity, ship: { ...entity.ship, cargo } } },
    ports: { ...world.ports, [commission.port]: { ...port, inventory } },
    worldFlags: { ...world.worldFlags, [reliefLandedFlag(commission)]: true },
  };

  const repriced = repriceItem(landed, commission.port, commission.item);
  if (!repriced) return { world: landed };
  return { world: { ...landed, ports: { ...landed.ports, [commission.port]: repriced } } };
}


// ═══════════════════════════════════════════════════════════════════════════
// The third kind of work: a ship with a name (v0.32.0)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The informer's third commission, and the reason it waited seven releases.
 *
 * It has been on the list since v0.25.0 as "sink the Santa Ana" with a note
 * saying it is not cheap, and the note was right: every hull in this game was
 * spawned inside the player's horizon and forgotten behind him, so there was no
 * Santa Ana to sink. Naming one and pricing her would have been a quest that
 * asked the captain to find a ship the world does not contain.
 *
 * `NamedShipSystem` is what makes it possible — a handful of merchantmen that
 * are the same merchantman tomorrow, working a lane on a schedule, materialised
 * only when he is near. This is the commission that pays for them.
 *
 * ## Why it is a different job from cutting a lane
 *
 * The raid commission (v0.25.0) is a *statistical* job: be on that lane for a
 * fortnight and take enough hulls that the traffic stops. Nothing in it is a
 * particular ship, and the captain is paid for a pattern of behaviour.
 *
 * This is the opposite. One hull, named, on a known route, and the whole
 * problem is *interception* — she left Havana six days ago and makes the passage
 * in nine, so where should he be tomorrow. Taking her is worth more than sinking
 * her to the captain (a prize is a prize) and exactly the same to the house,
 * which is a decision worth having rather than a rule worth writing.
 *
 * The crown whose register she is on remembers it harder than a lane raid,
 * because a lane is an inconvenience and a named ship is somebody's ruin.
 */

/** Quest ids for a hunt all start with this. */
export const HUNT_QUEST_PREFIX = "hunt_";

/** One at a time, and for a blunter reason than the raid's: she is one ship. */
export const MAX_ACTIVE_HUNTS = 1;

/** How far from the tavern her lane may run and still be worth mentioning. */
const HUNT_REACH = 900;

/**
 * Days allowed.
 *
 * Long enough for two of her round trips on a middling lane, so a captain who
 * guesses the wrong end of the passage gets a second chance rather than a failed
 * contract; short enough that he cannot simply blunder into her.
 */
const HUNT_DAYS = 40;

/** Fee: a retainer plus what her tonnage is worth to the house that wants her gone. */
const HUNT_BASE_FEE = 400;
const HUNT_TONNAGE_FEE = 3.2;

/** What her crown makes of it, and what the brethren do. A name is not a lane. */
export const HUNT_REPUTATION = -18;
export const HUNT_NOTORIETY = 10;

export type HuntCommission = {
  /** `hunt_<shipId>`. Stable, so one ship cannot be commissioned twice. */
  id: string;
  shipId: string;
  shipName: string;
  /** Her register — the crown that will remember this. */
  crown: string;
  classId: string;
  /** The two ends of her run, localised, so the quest log reads without lookup. */
  fromName: string;
  toName: string;
  reward: number;
  acceptedDay: number;
  /** Baked at signing, for the reason every other contract here bakes it. */
  days: number;
};

export function huntQuestId(shipId: string): string {
  return HUNT_QUEST_PREFIX + shipId;
}

/** Commissions the captain is under right now. */
export function activeHunts(world: WorldState): HuntCommission[] {
  const out: HuntCommission[] = [];
  for (const runtime of world.player.questLog) {
    if (runtime.completed) continue;
    if (!(runtime.questId as string).startsWith(HUNT_QUEST_PREFIX)) continue;
    const commission = runtime.data.commission as HuntCommission | undefined;
    if (commission) out.push(commission);
  }
  return out;
}

/**
 * The ship on the table in this tavern today, or nothing.
 *
 * Derived, never stored, like the other two. She must be somebody else's — a
 * house does not pay to have its own crown's ships taken, and the tavern it
 * drinks in is that crown's — and her run has to pass near enough that the man
 * at the back table would know her schedule at all.
 */
export function huntOffer(world: WorldState, portKey: string): HuntCommission | null {
  if (activeHunts(world).length >= MAX_ACTIVE_HUNTS) return null;

  const here = getPortWaterPos(portKey);
  if (!here) return null;
  const localCrown = portFaction(world, portKey) as string;

  let best: HuntCommission | null = null;
  for (const ship of livingNamedShips(world)) {
    if (ship.crown === localCrown) continue;
    const pos = namedShipPos(world, ship);
    if (!pos) continue;
    if (Math.hypot(pos.x - here.x, pos.y - here.y) > HUNT_REACH) continue;

    const tonnage = SHIP_CLASSES[ship.classId]?.tonnage ?? 200;
    const commission: HuntCommission = {
      id: huntQuestId(ship.id),
      shipId: ship.id,
      shipName: ship.name,
      crown: ship.crown,
      classId: ship.classId,
      fromName: CITIES[ship.from]?.name ?? ship.from,
      toName: CITIES[ship.to]?.name ?? ship.to,
      reward: Math.round(HUNT_BASE_FEE + HUNT_TONNAGE_FEE * tonnage),
      acceptedDay: world.time.day,
      days: HUNT_DAYS,
    };
    if (!best || commission.reward > best.reward) best = commission;
  }
  return best;
}

/** Whose ship she is, in words the tavern screen can print. */
export function huntVictim(commission: HuntCommission): string {
  return FACTIONS[commission.crown]?.name ?? commission.crown;
}

/**
 * Rebuild the quest from a signed commission.
 *
 * Same rule as the other two: every number comes out of the commission and none
 * out of `world`, because `buildQuestRegistry` runs this on every load and a
 * definition that read today's clock would hand itself another forty days each
 * time the player opened a save.
 */
export function huntQuest(commission: HuntCommission): QuestDef {
  const vars = {
    ship: commission.shipName,
    from: commission.fromName,
    port: commission.toName,
    gold: commission.reward,
    days: commission.days,
  };

  return {
    id: commission.id,
    titleKey: "quest.hunt_title",
    start: "hunt",
    stages: {
      hunt: {
        id: "hunt",
        objectiveKey: "quest.hunt_find",
        vars,
        on: [
          {
            // Sunk or taken, the house does not mind which; `settleNamedShip`
            // stamps the same flag for both, and what the captain does with her
            // hold is his own business.
            trigger: { type: "flag_set", key: namedShipFateFlag(commission.shipId) },
            next: "paid",
            effects: [
              { type: "gold", amount: commission.reward },
              { type: "reputation", faction: commission.crown, amount: HUNT_REPUTATION },
              { type: "notoriety", amount: HUNT_NOTORIETY },
              { type: "log", key: "quest.hunt_paid", vars },
            ],
          },
          {
            trigger: { type: "days_passed", days: commission.days },
            next: "cold",
            effects: [{ type: "log", key: "quest.hunt_cold", vars }],
          },
        ],
      },
      paid: { id: "paid", objectiveKey: "quest.hunt_paid", vars, completes: true },
      cold: { id: "cold", objectiveKey: "quest.hunt_cold", vars, fails: true },
    },
  };
}

export type HuntResult = { world: WorldState; error?: string };

/** Take the job. Nothing changes hands until she is on the bottom or in his fleet. */
export function acceptHunt(world: WorldState, commission: HuntCommission): HuntResult {
  if (activeHunts(world).length >= MAX_ACTIVE_HUNTS) {
    return { world, error: "informer.too_many" };
  }
  const ship = namedShipById(world, commission.shipId);
  if (!ship || ship.fate) return { world, error: "informer.already_gone" };
  return { world: startQuest(world, huntQuest(commission), { commission }) };
}
