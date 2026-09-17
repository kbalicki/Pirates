/**
 * What they are saying in the tavern — and, since v0.28.0, whether it is true.
 *
 * The rumour was a list of eight strings rotated by the day of the month. It
 * was charming and it was furniture: the same sentence about a ghost ship off
 * Bermuda whether the player had spent the last month blockading Havana or
 * asleep in Port Royale. Meanwhile the world had grown a great deal to say.
 * Six releases built a trade layer with consequences a captain can *cause* —
 * lanes that lose their nerve (v0.22.0), harbours shut as suppliers (v0.25.0),
 * a stand-in warehouse drained covering somebody else's runs (v0.26.0), a town
 * that cannot feed itself (v0.27.0) — and every one of them was invisible until
 * he happened to sail there and look at a price.
 *
 * So the tavern reports the world now. What it says is chosen from facts the
 * world is already keeping, which means this module records nothing and can
 * never disagree with the thing it is describing.
 *
 * ## Gossip is local
 *
 * Only facts within `RUMOR_REACH` of this town are on offer. That is the same
 * principle `NpcNewsSystem` runs on — word travels by hull, not by wire — and
 * it has a consequence worth having: the tavern in a busy hub is a better place
 * to drink than the one in a back bay, because more is happening within earshot
 * of it. A captain hunting for somewhere to sell a hold of food is now doing
 * something when he buys a round.
 *
 * ## One thing a day, and it rotates
 *
 * A tavern has one thing worth hearing, and the same tavern says the same thing
 * all day: `(day + the town's own name) % candidates` picks it. Deterministic,
 * derived, stored nowhere — the same save always tells the same story on the
 * same morning, and a captain who waits a day hears the next fact rather than
 * the same one again.
 *
 * The eight old flavour lines are still here and still get told, but only when
 * there is little else going on. A quiet Caribbean gossips about ghost ships; a
 * busy one talks about the price of bread.
 */

import type { WorldState } from "../model/WorldState.ts";
import { CITIES } from "../data/cities.ts";

import { baselineConsumptionRate } from "../data/economyBaselines.ts";
import { townHunger, townIsHungry, reroutedOnto, supplierShutIn } from "./EconomyTickSystem.ts";
import { disruptions, tradeRoutes } from "./TradeRouteSystem.ts";
import { livingNamedShips, phaseAt, outbound, lyingAt } from "./NamedShipSystem.ts";
import { blockadeEffective } from "./BlockadeSystem.ts";
import { isPortClosed } from "./EventEffectsSystem.ts";
import { playerHolds } from "./ReconquestSystem.ts";
import { tradeIncome } from "./TradeLedgerSystem.ts";
import { activeAlliances, enemiesOf } from "./DiplomacySystem.ts";
import { portFaction } from "./SiegeSystem.ts";
import { offerFor } from "./DefenseContractSystem.ts";
import {
  plateFleets, musterPortFor, stillMustering, PLATE_RENDEZVOUS,
} from "./TreasureFleetSystem.ts";
import { liveHurricanes } from "./WeatherFieldSystem.ts";
import { eventSeason } from "./WorldEventSystem.ts";
import { dayToCalendar } from "./TimeSystem.ts";

import { factionNameKey, itemNameKeyGen, portNameKey } from "../i18n/names.ts";
/** One thing the tavern has to say, ready for `t()`. */
export type Rumor = { key: string; vars?: Record<string, string | number> };

/**
 * How far talk carries.
 *
 * Wider than the informer's reach (700) and the relief order's (900), because
 * hearing about a thing is cheaper than being paid to act on it — but not
 * infinite, or every tavern in the Caribbean would tell the same story and the
 * choice of where to drink would mean nothing.
 */
const RUMOR_REACH = 1300;

/** A lane has to be this frightened before anybody remarks on it. */
const RUMOR_DISRUPTION = 0.35;

/** Gold a quay must clear in a day before it counts as a busy one. */
const RUMOR_BUSY_QUAY = 60;

/** Below this many real facts, the old stories get a turn as well. */
const QUIET_WORLD = 2;

/** How famous a captain has to be before the back table is discussing him. */
const FAME_TALKED_ABOUT = 25;

/**
 * The eight originals, read against the world that grew around them (v0.70.0).
 *
 * They were furniture, and v0.28.0 left them in the pool for a quiet Caribbean
 * on the grounds that a tavern should never be silent. What nobody had done was
 * read them. Measured on a fresh world - `rumorsAt` over all forty-five ports on
 * day one - **every port is quiet**, so these eight are not the fallback: they
 * are the entire first thing a captain ever hears in a tavern. And three of them
 * were checkably untrue.
 *
 * - *"Sugar prices are sky-high in Barbados"*: Barbados **grows** sugar.
 *   Settled, it is 34th of 45 for the price of it - 4 gold against 27 at Port
 *   Royale. A captain who believed it carried a hold to the one counter in the
 *   Caribbean that would pay him least.
 * - *"Blackbeard's men have been raiding near Nassau"*: Blackbeard is in no
 *   other line of this codebase, and his career (1716-18) begins thirty-six
 *   years after the latest era the game has.
 * - *"A Spanish treasure fleet was spotted heading through the Windward
 *   Passage"*: since v0.46.0 the plate fleet is a **real event** with a real
 *   muster port and a real course, and that course does not go near the
 *   Windward Passage - she musters on the Main, rounds Havana and goes home by
 *   the Florida Straits. Worse than the wrong water is what was missing:
 *   `rumorsAt` did not know about her at all, so the most valuable thing in the
 *   game never crossed the channel built to report the world, and a made-up
 *   version of it did instead.
 *
 * So a flavour line is offered only when the world agrees with it. The ones the
 * world can answer carry their answer in `vars`; the ones it cannot are worded
 * so they claim nothing. The ghost ship off Bermuda is the only one left with no
 * predicate, and that is the point of keeping it: a tavern needs one line that
 * is just a story.
 */
type Flavour = {
  key: string;
  /** Vars when the world bears the line out, `null` when it does not. */
  when?: (
    world: WorldState,
    portKey: string,
    neighbours: string[],
  ) => Record<string, string | number> | null;
};

const FLAVOURS: Flavour[] = [
  // Claims nothing about a place any more. It used to name an island south of
  // Jamaica, which is not where any map the tavern sells points - a map names a
  // spot near a town, and which town is exactly what the paper is for.
  { key: "tavern.rumor_treasure" },

  // Weather, but only in the season the event table itself rolls on. Read from
  // `eventSeason`, not copied: a season in two places is the v0.57.0 defect.
  {
    key: "tavern.rumor_storm",
    when: world => {
      const months = eventSeason("hurricane");
      const month = dayToCalendar(world.time.day, world.startYear).month;
      return !months || months.includes(month) ? {} : null;
    },
  },

  // Sugar, the right way round: it is cheap where they grow it. The line is now
  // the trade rule the whole economy runs on, told as gossip.
  {
    key: "tavern.rumor_trade",
    when: (_world, _here, neighbours) => {
      const grower = neighbours.find(key => CITIES[key]?.produces.includes("sugar_cane"));
      return grower ? { port: portNameKey(grower) } : null;
    },
  },

  // His own name, coming back at him across a table. The game has no Blackbeard
  // and never did; it has a captain whose notoriety it has been counting all
  // along.
  {
    key: "tavern.rumor_pirates",
    when: world =>
      (world.player.notoriety ?? 0) >= FAME_TALKED_ABOUT ? { name: world.playerName } : null,
  },

  // A war this town's own flag is actually in. Same rule as the alliance rumour
  // (v0.55.0): a Dutch quay talks about what the Dutch are doing, it does not
  // recite the whole Caribbean's diplomatic post.
  {
    key: "tavern.rumor_war",
    when: (world, portKey) => {
      const flag = portFaction(world, portKey) as string;
      const foes = enemiesOf(world, flag);
      return foes.length > 0
        ? { crown: factionNameKey(flag), enemy: factionNameKey(foes[0]) }
        : null;
    },
  },

  // A governor with work on the table, named. `offerFor` wants an ally's
  // standing and a landing already at sea, so this is rare - and when it fires
  // it is worth more than anything else in the pool, because a defence
  // commission is easy to sail past without ever knowing it existed.
  {
    key: "tavern.rumor_governor",
    when: (world, portKey, neighbours) => {
      for (const key of [portKey, ...neighbours]) {
        if (offerFor(world, key)) return { port: portNameKey(key) };
      }
      return null;
    },
  },

  // The one that claims nothing, and therefore the one that stays.
  { key: "tavern.rumor_ghost_ship" },
];

/** The old stories that are true in this town today. */
export function flavoursAt(world: WorldState, portKey: string, neighbours: string[]): Rumor[] {
  const out: Rumor[] = [];
  for (const flavour of FLAVOURS) {
    if (!flavour.when) { out.push({ key: flavour.key }); continue; }
    const vars = flavour.when(world, portKey, neighbours);
    if (vars) out.push({ key: flavour.key, vars });
  }
  return out;
}

/** Towns within earshot of this one, this one excluded. */
/**
 * How lately a named ship must have sailed for her departure to still be news.
 *
 * Three days: long enough that a captain in the next port over can act on it,
 * short enough that it stays gossip rather than a position report.
 */
const RUMOR_FRESH_DAYS = 3;

function within(portKey: string): string[] {
  const here = CITIES[portKey];
  if (!here) return [];
  const out: string[] = [];
  for (const [key, def] of Object.entries(CITIES)) {
    if (key === portKey) continue;
    if (Math.hypot(def.pos.x - here.pos.x, def.pos.y - here.pos.y) > RUMOR_REACH) continue;
    out.push(key);
  }
  return out;
}

/** The good a hungry town is shortest of, so the rumour names something useful. */
function shortestOf(world: WorldState, portKey: string): string | null {
  const def = CITIES[portKey];
  const port = world.ports[portKey];
  if (!def || !port) return null;
  let worst: string | null = null;
  let worstDays = Infinity;
  for (const item of def.demands) {
    const need = baselineConsumptionRate(portKey, item, port.population);
    if (need <= 0) continue;
    const days = (port.inventory[item] ?? 0) / need;
    if (days < worstDays) { worstDays = days; worst = item; }
  }
  return worst;
}

/**
 * Everything worth saying in this town today, most useful first.
 *
 * Exported because the ordering is the design: a captain who has been told
 * where the bread is short can act on it this afternoon, and one told which
 * quay is busy can act on it this year. A test reads this rather than the
 * day's pick, so it can assert what the tavern *knows* without pinning which
 * morning it says it.
 */
export function rumorsAt(world: WorldState, portKey: string): Rumor[] {
  const out: Rumor[] = [];
  const neighbours = within(portKey);

  // 0. Weather standing between here and somewhere (v0.70.0). First because it
  //    is the only fact in the list a captain has to act on *before* he casts
  //    off rather than after, and because the tavern is one of the ways he can
  //    find out at all: `knownHurricanes` is filtered by his own chart, so a
  //    channel built on it could never tell him anything new. The road has
  //    towns on it since v0.45.0, so the line can say which way she is walking.
  for (const storm of liveHurricanes(world)) {
    const here = portNameKey(portKey);
    const onRoad = [storm.port, storm.bound].some(
      name => name === here || neighbours.some(key => portNameKey(key) === name),
    );
    if (!onRoad) continue;
    out.push({
      key: storm.bound === storm.port ? "tavern.rumor_hurricane" : "tavern.rumor_hurricane_bound",
      vars: storm.bound === storm.port
        ? { port: storm.port, days: storm.daysLeft }
        : { port: storm.port, bound: storm.bound, days: storm.daysLeft },
    });
    break;                                   // one storm is weather, three is a forecast
  }

  // 0b. The plate fleet (v0.70.0). The single most valuable thing in the game,
  //     and until now the tavern had never heard of her - while telling a
  //     made-up version of the same story with the wrong water in it. She is
  //     news on the Main, where she loads, and at the rendezvous she cannot
  //     avoid; the fortnight in harbour is what makes an interception a plan
  //     rather than a coincidence, so the two halves of her passage say
  //     different things.
  for (const event of plateFleets(world)) {
    const muster = musterPortFor(event);
    if (!muster) continue;
    const audible = (key: string) => key === portKey || neighbours.includes(key);
    if (!audible(muster) && !audible(PLATE_RENDEZVOUS)) continue;
    out.push(stillMustering(world, event)
      ? { key: "tavern.rumor_plate_muster", vars: { port: portNameKey(muster) } }
      : {
        key: "tavern.rumor_plate_sailed",
        vars: { port: portNameKey(muster), rendezvous: portNameKey(PLATE_RENDEZVOUS) },
      });
    break;
  }

  // 1. Somewhere within reach cannot feed itself, and that is money.
  const hungry = neighbours
    .filter(key => townIsHungry(world, key))
    .sort((a, b) => townHunger(world, b) - townHunger(world, a));
  for (const key of hungry.slice(0, 2)) {
    const item = shortestOf(world, key);
    if (!item) continue;
    out.push({
      key: "tavern.rumor_hunger",
      vars: {
        port: portNameKey(key),
        item: itemNameKeyGen(item),
        pct: Math.round(townHunger(world, key) * 100),
      },
    });
  }

  // 2. A cordon. The one fact here the player may well have caused himself.
  for (const key of neighbours) {
    if (!blockadeEffective(world, key)) continue;
    out.push({ key: "tavern.rumor_blockade", vars: { port: portNameKey(key) } });
  }

  // 3. A harbour nobody can enter. Since v0.29.0 a shut port really is shut to
  //    the player, and its own news board is behind the door he cannot open —
  //    so the tavern next door is the only place he can be told before he wastes
  //    the passage.
  for (const key of neighbours) {
    if (!isPortClosed(world, key)) continue;
    out.push({ key: "tavern.rumor_shut", vars: { port: portNameKey(key) } });
    break;
  }

  // 4. A quay carrying somebody else's runs: bare shelves and high prices.
  for (const key of neighbours) {
    const covering = reroutedOnto(world, key);
    if (covering.length === 0) continue;
    const shut = tradeRoutes().find(
      lane => lane.items.includes(covering[0].item) && supplierShutIn(world, lane.from),
    );
    out.push({
      key: "tavern.rumor_covering",
      vars: {
        port: portNameKey(key),
        other: shut ? portNameKey(shut.from) : "",
        item: itemNameKeyGen(covering[0].item),
      },
    });
    break;                                   // one is a story, four is a ledger
  }

  // 5. A run nobody will insure. Usually his own work, told back to him.
  const ledger = disruptions(world);
  for (const lane of tradeRoutes()) {
    const d = ledger[lane.id];
    if (!d || world.time.day > d.until || d.severity < RUMOR_DISRUPTION) continue;
    if (!neighbours.includes(lane.from) && !neighbours.includes(lane.to)) continue;
    out.push({
      key: "tavern.rumor_lane",
      vars: {
        from: portNameKey(lane.from),
        to: portNameKey(lane.to),
      },
    });
    break;
  }

  // 6. A town flying no crown's colours.
  for (const key of neighbours) {
    if (!playerHolds(world, key)) continue;
    out.push({ key: "tavern.rumor_black_flag", vars: { port: portNameKey(key) } });
    break;
  }

  // 7. A named hull that has just cleared a harbour within earshot (v0.32.0).
  //    The only fact in this list that is worth *acting on within the hour*,
  //    and the only channel through which a captain under a hunt commission can
  //    find out which end of the passage she is on: her schedule is in her
  //    record, but a record is not something he can read. She has to be freshly
  //    away — a ship that sailed a week ago is a ship that could be anywhere,
  //    and a rumour that told him so every day would be a tracker rather than
  //    gossip.
  for (const ship of livingNamedShips(world)) {
    const day = world.time.day;

    // Still alongside, because somebody put a shot into her last week
    // (v0.34.0). This is the counter-play to the whole of that release: his
    // chart is walking a mark towards a rendezvous she is not going to keep,
    // and the man at the back table is the only one who can tell him why. It
    // carries `shipId` for the same reason the departure rumour does — reading
    // it is what corrects the reckoning.
    const alongside = lyingAt(ship, day);
    if (alongside) {
      if (!neighbours.includes(alongside) && alongside !== portKey) continue;
      out.push({
        key: "tavern.rumor_named_held",
        vars: {
          ship: ship.name,
          port: portNameKey(alongside),
          shipId: ship.id,
        },
      });
      break;
    }

    const phase = phaseAt(ship, day);
    const legDay = (phase < 1 ? phase : phase - 1) * ship.passageDays;
    if (legDay > RUMOR_FRESH_DAYS) continue;
    const from = outbound(ship, day) ? ship.from : ship.to;
    const to = outbound(ship, day) ? ship.to : ship.from;
    if (!neighbours.includes(from) && from !== portKey) continue;
    out.push({
      key: "tavern.rumor_named",
      vars: {
        ship: ship.name,
        port: portNameKey(from),
        to: portNameKey(to),
        // Carried so the tavern screen can write the sighting onto the chart
        // when the captain actually reads it (v0.33.0). Unused by the string.
        shipId: ship.id,
      },
    });
    break;
  }

  // 8. Two crowns standing together (v0.55.0). The one fact in this list with
  //    no geography in it, so it earns its place a different way: it has to be
  //    about **this town's own flag**. A Dutch quay talks about what the Dutch
  //    are doing; it does not read the whole Caribbean's diplomatic post. The
  //    alliance is stamped, so the tavern is repeating something that happened
  //    on a day rather than reciting a computation.
  const flag = portFaction(world, portKey) as string;
  for (const ev of activeAlliances(world)) {
    if (!ev.factions.includes(flag)) continue;
    out.push({
      key: "tavern.rumor_alliance",
      vars: {
        faction1: ev.vars.faction1 as string,
        faction2: ev.vars.faction2 as string,
        against: ev.vars.against as string,
      },
    });
    break;
  }

  // 9. Where the money is crossing a quay. The slowest fact, told last.
  let busiest: string | null = null;
  let best = RUMOR_BUSY_QUAY;
  for (const key of neighbours) {
    const income = tradeIncome(world, key);
    if (income > best) { best = income; busiest = key; }
  }
  if (busiest) {
    out.push({ key: "tavern.rumor_busy_quay", vars: { port: portNameKey(busiest) } });
  }

  return out;
}

/**
 * What this tavern is saying today.
 *
 * The pick rotates on the day and on the town, so two ports never chorus and a
 * captain who comes back tomorrow hears the next thing rather than the same
 * thing. When the world has little to report the old stories join the pool, so
 * the tavern is never silent and never only a noticeboard.
 */
export function tavernRumor(world: WorldState, portKey: string): Rumor {
  const real = rumorsAt(world, portKey);
  const pool: Rumor[] = real.length >= QUIET_WORLD
    ? real
    : [...real, ...flavoursAt(world, portKey, within(portKey))];

  let hash = 0;
  for (let i = 0; i < portKey.length; i++) hash = (hash * 31 + portKey.charCodeAt(i)) | 0;
  const index = Math.abs(world.time.day + hash) % pool.length;
  return pool[index];
}
