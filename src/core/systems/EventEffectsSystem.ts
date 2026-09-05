/**
 * Event Effects — Phase 2 of the world-event system.
 *
 * Active world events apply two kinds of pressure on a port each day:
 *   • multipliers on production / consumption / price (continuous)
 *   • flat deltas to population / wealth / defense (continuous, per-day)
 *
 * A separate one-shot pass fires when an event first appears (e.g. a pirate
 * raid wipes 80 wealth + 30% inventory at strike time, not gradually).
 *
 * Called from EconomyTickSystem once per game day.
 */

import type { WorldState, WorldEventState, WorldEventType } from "../model/WorldState.ts";

/** Continuous per-day effects on a port while an event is active. */
export type EventDailyEffects = {
  /** Multiplied with production rate per produced item. Default 1. */
  productionMul: number;
  /** Multiplied with consumption rate per demanded item. Default 1. */
  consumptionMul: number;
  /**
   * Multiplied with the licensed trade that supplies a port (v0.21.0).
   *
   * Separate from `productionMul` because a hurricane, a war and a raid do very
   * different things to a harvest and to a convoy. A war barely dents what the
   * fields grow and takes a third off what reaches the quay; a native raid burns
   * the fields and leaves the sea lanes alone. Folding both into one number made
   * the wars on the news board something the player read about rather than
   * something every port felt.
   */
  importMul: number;
  /** Multiplied with the demand/supply-derived price. Default 1. */
  priceMul: number;
  /** Flat add to population each day (can be negative). */
  popDelta: number;
  /** Flat add to wealth each day (can be negative). */
  wealthDelta: number;
  /** Flat add to defense each day (can be negative). */
  defenseDelta: number;
  /** Multiplier on availableCrew (for tavern recruitment). Default 1. */
  crewMul: number;
  /** If true, port is closed (no docking, no trade). Default false. */
  portClosed: boolean;
  /** Multiplier slowing baseline recovery (e.g. native_raid → 0.5). Default 1. */
  recoveryMul: number;
};

const NEUTRAL: EventDailyEffects = {
  productionMul: 1,
  consumptionMul: 1,
  importMul: 1,
  priceMul: 1,
  popDelta: 0,
  wealthDelta: 0,
  defenseDelta: 0,
  crewMul: 1,
  portClosed: false,
  recoveryMul: 1,
};

/**
 * What a day of `wealthDelta` is actually worth — read this before touching one.
 *
 * `EconomyTickSystem` pulls wealth toward baseline by `RECOVERY_WEALTH` (1%) of
 * the gap every day, so a standing pressure of `d` points a day settles the town
 * `d / 0.01 = d * 100` points away from where it would otherwise sit, and takes
 * about a hundred days to get there. A number that reads like a modest nudge is
 * therefore a permanent revaluation:
 *
 *     +10/day for a year  →  +1000, which is the whole 0..1000 scale
 *     +3/day for 90 days  →  about +190 by the time it lifts
 *     +1/day for 30 days  →  about +26
 *
 * The table below was written in v0.9.7 against the first of those readings and
 * never measured, because of a one-line bug that meant no random event ever
 * attached itself to a port (see `WorldEventSystem`, fixed in v0.28.0). With the
 * events actually landing, the old numbers put Havana and Santiago on the 1000
 * clamp inside a year and lifted the Caribbean's total wealth by 39%.
 *
 * So the deltas are scaled to a rule: **an event is a perturbation, not a new
 * baseline.** No single event may be worth more than `EVENT_WEALTH_CEILING`
 * points of settled offset, which puts the strongest of them at about a sixth
 * of a prosperous colony's worth — plainly felt, never transformative. What
 * makes an event dramatic is its one-shot hit, its production and price
 * multipliers, and what it does to people; not a standing subsidy.
 */
export const EVENT_WEALTH_CEILING = 150;

/** A day's pressure worth that ceiling, given a 1%/day pull toward baseline. */
export const MAX_WEALTH_DELTA = EVENT_WEALTH_CEILING / 100;

/** Per-type continuous effect on each affected port. */
function effectsForType(type: WorldEventType, severity: 1 | 2 | 3): EventDailyEffects {
  const sev = severity; // 1..3 — used to scale a few values
  switch (type) {
    case "epidemic":
      return { ...NEUTRAL,
        consumptionMul: 1.0,
        priceMul: 1 + 0.15 * sev,   // food/water cost more during plague
        popDelta: -2 * sev,         // ~60/month for severity 1
        wealthDelta: -0.5 * sev,    // -50..-150 settled; the plague's bite is in the people
        crewMul: 0.5,
      };
    case "pirate_raid":
      return { ...NEUTRAL,
        defenseDelta: -1,
        productionMul: 0.7,
        // Masters will not call at a coast that is being worked over.
        importMul: 0.75,
      };
    case "trade_boom":
      return { ...NEUTRAL,
        productionMul: 1.5,
        importMul: 1.2,
        priceMul: 0.8,
        wealthDelta: +MAX_WEALTH_DELTA,   // a boom is the strongest good news there is
      };
    case "slave_revolt":
      return { ...NEUTRAL,
        productionMul: 0.3,
        wealthDelta: -MAX_WEALTH_DELTA,
        crewMul: 0.5,
      };
    case "hurricane":
      return { ...NEUTRAL,
        portClosed: true,
        productionMul: 0,
      };
    case "treasure_fleet":
      return { ...NEUTRAL,
        // Every Spanish port at once, so it is deliberately the mildest of them.
        wealthDelta: +0.5,
      };
    case "new_governor":
      // One day long: this is a one-shot dressed as a daily, and at a day's
      // length it is worth about five points however it is written.
      return { ...NEUTRAL,
        wealthDelta: +MAX_WEALTH_DELTA,
      };
    case "war_start":
      return { ...NEUTRAL,
        productionMul: 0.85,
        // Convoys are diverted, hulls are requisitioned and the other side's
        // privateers are on every route. The fields are barely touched; the
        // quay is another matter, and this is what makes a war on the news
        // board something the whole map can feel.
        importMul: 0.7,
        priceMul: 1.1,
      };
    // ── v0.9.7 economy expansion ────────────────────────────
    case "gold_discovery":
      return { ...NEUTRAL,
        popDelta: +8,         // workers migrate in
        // Was +10 — a year of it is the entire wealth scale. The strike's real
        // reward is the gold in `bonusProduces` and the hundred-point windfall
        // in `applyOneShotEffects`; this is only the boom town around it.
        wealthDelta: +MAX_WEALTH_DELTA,
        productionMul: 1.2,
      };
    case "native_raid":
      return { ...NEUTRAL,
        productionMul: 0.5,
        wealthDelta: -1,
        defenseDelta: -0.5,
        recoveryMul: 0.5,    // recovery cut in half
      };
    case "famine":
      return { ...NEUTRAL,
        consumptionMul: 1.5,  // people eating reserves
        priceMul: 2.0,         // food spikes
        popDelta: -3,
        crewMul: 0.7,
      };
    case "harvest":
      return { ...NEUTRAL,
        productionMul: 1.8,
        priceMul: 0.6,
        wealthDelta: +1,
      };
    case "royal_decree":
      return { ...NEUTRAL,
        priceMul: 1.2,        // tariff
        // A whole crown's ports, for up to a year: the mildest of the lot.
        wealthDelta: +0.3,
      };
    case "treaty_signed":
      return { ...NEUTRAL,
        productionMul: 1.15,
        // Peace reopens the routes before it changes anything ashore.
        importMul: 1.15,
        wealthDelta: +0.5,
      };
    // A relief squadron is a fleet at sea, not a condition in a town, and its
    // event lists every port its crown still holds so the news travels. Giving
    // it any per-port effect would apply that effect to a whole empire.
    case "reconquest":
    case "campaign":
    case "war_end":
    default:
      return NEUTRAL;
  }
}

/**
 * Aggregate effects from all active events on a given port.
 * Multipliers compound, deltas sum.
 */
/**
 * How long a war goes on hurting trade before trade works round it (v0.31.0).
 *
 * The war row in the table above describes an *outbreak*: convoys laid up,
 * underwriters refusing the risk, hulls requisitioned, the other side's
 * privateers on every route. None of that is a permanent condition. Neutral
 * bottoms are chartered, smugglers find the gap, new routes settle, and after a
 * couple of years the quay is busy again — under a different flag and at a worse
 * rate, but busy.
 *
 * The distinction was invisible while the only wars that existed were declared
 * in play, and it stopped being invisible the moment v0.31.0 put the wars that
 * were *already being fought* on the map. Measured with a flat bite, seeding
 * them took **39% off the wealth of the whole Caribbean** in the 1600 and 1640
 * eras and held it there for decades: the Eighty Years' War runs eighty years,
 * and an eighty-year perturbation is not a perturbation, it is the setting.
 *
 * So the bite fades. A war seeded at world creation has been running for
 * thirty-two years and its multipliers are already spent — the town's baseline
 * *is* what a generation of that war made of it — while the fighting itself is
 * as real as ever: `areFactionsAtWar`, the doubled navy spawns, the privateers
 * and the news boards do not read this at all.
 */
export const WAR_ADAPTATION_DAYS = 730;

/**
 * Share of the outbreak still being felt, 1 on the day war is declared and 0
 * once trade has had `WAR_ADAPTATION_DAYS` to work round it.
 */
export function warBite(startDay: number, today: number): number {
  const elapsed = Math.max(0, today - startDay);
  return Math.max(0, 1 - elapsed / WAR_ADAPTATION_DAYS);
}

/** Ease a multiplier back toward 1 as the outbreak wears off. */
function fade(mul: number, bite: number): number {
  return 1 + (mul - 1) * bite;
}

export function getAggregatedEffects(world: WorldState, portKey: string): EventDailyEffects {
  let agg: EventDailyEffects = { ...NEUTRAL };
  const day = world.time.day;
  for (const ev of world.worldEvents) {
    if (ev.endDay < day) continue;
    // war_start is special: it affects ALL ports of warring factions
    let affects = false;
    if (ev.type === "war_start") {
      const port = world.ports[portKey];
      affects = ev.factions.includes(port?.factionId as string);
    } else {
      affects = ev.ports.length === 0 || ev.ports.includes(portKey);
    }
    if (!affects) continue;

    let e = effectsForType(ev.type, ev.severity);
    // A war's bite is at its outbreak; everything else in the table is a
    // condition that lasts as long as the event does.
    if (ev.type === "war_start") {
      const bite = warBite(ev.startDay, day);
      e = { ...e,
        productionMul: fade(e.productionMul, bite),
        importMul: fade(e.importMul, bite),
        priceMul: fade(e.priceMul, bite),
      };
    }
    agg = {
      productionMul: agg.productionMul * e.productionMul,
      consumptionMul: agg.consumptionMul * e.consumptionMul,
      importMul: agg.importMul * e.importMul,
      priceMul: agg.priceMul * e.priceMul,
      popDelta: agg.popDelta + e.popDelta,
      wealthDelta: agg.wealthDelta + e.wealthDelta,
      defenseDelta: agg.defenseDelta + e.defenseDelta,
      crewMul: agg.crewMul * e.crewMul,
      portClosed: agg.portClosed || e.portClosed,
      recoveryMul: Math.min(agg.recoveryMul, e.recoveryMul),
    };
  }
  return agg;
}

/**
 * One-shot effects fired when an event first appears.
 * Returns a partial port-state update keyed by port id.
 *
 * Marks event.vars._applied = 1 so we don't double-fire.
 */
export function applyOneShotEffects(world: WorldState): WorldState {
  let w = world;
  let dirty = false;
  const newEvents: WorldEventState[] = [];
  const portUpdates: Record<string, Partial<{
    population: number; wealth: number; defense: number;
    inventory: Record<string, number>;
    bonusProduces: string[];
  }>> = {};

  for (const ev of w.worldEvents) {
    if (ev.vars._applied) {
      newEvents.push(ev);
      continue;
    }
    const targets = ev.type === "war_start"
      ? Object.keys(w.ports).filter(k => ev.factions.includes(w.ports[k]?.factionId as string))
      : (ev.ports.length === 0 ? [] : ev.ports);

    for (const portKey of targets) {
      const port = w.ports[portKey];
      if (!port) continue;
      const u = portUpdates[portKey] ?? {};
      switch (ev.type) {
        case "pirate_raid":
          u.wealth = (u.wealth ?? port.wealth) - 80;
          u.inventory = Object.fromEntries(
            Object.entries(u.inventory ?? port.inventory).map(([k, v]) => [k, Math.round(v * 0.7)]),
          );
          dirty = true;
          break;
        case "hurricane":
          u.wealth = (u.wealth ?? port.wealth) - 30;
          u.inventory = Object.fromEntries(
            Object.entries(u.inventory ?? port.inventory).map(([k, v]) => [k, Math.round(v * 0.85)]),
          );
          dirty = true;
          break;
        case "native_raid":
          u.population = Math.round((u.population ?? port.population) * 0.85);
          u.wealth = Math.max(0, (u.wealth ?? port.wealth) - 150);
          u.defense = Math.max(0, (u.defense ?? port.defense) - 40);
          dirty = true;
          break;
        case "gold_discovery":
          if (!port.bonusProduces.includes("gold")) {
            u.bonusProduces = [...port.bonusProduces, "gold"];
          }
          u.wealth = (u.wealth ?? port.wealth) + 100; // initial windfall
          dirty = true;
          break;
        case "epidemic":
          u.population = Math.round((u.population ?? port.population) * 0.97);
          dirty = true;
          break;
        case "slave_revolt":
          u.wealth = Math.max(0, (u.wealth ?? port.wealth) - 50);
          dirty = true;
          break;
        case "new_governor":
          u.wealth = (u.wealth ?? port.wealth) + 50;
          dirty = true;
          break;
        case "royal_decree":
          u.wealth = (u.wealth ?? port.wealth) + 30;
          dirty = true;
          break;
        default:
          // no one-shot
          break;
      }
      portUpdates[portKey] = u;
    }

    newEvents.push({ ...ev, vars: { ...ev.vars, _applied: 1 } });
  }

  if (!dirty) return w;

  const newPorts = { ...w.ports };
  for (const [key, upd] of Object.entries(portUpdates)) {
    const cur = newPorts[key];
    if (!cur) continue;
    newPorts[key] = {
      ...cur,
      ...(upd.population !== undefined ? { population: Math.max(0, Math.round(upd.population)) } : {}),
      ...(upd.wealth !== undefined ? { wealth: Math.max(0, Math.round(upd.wealth)) } : {}),
      ...(upd.defense !== undefined ? { defense: Math.max(0, Math.min(100, Math.round(upd.defense))) } : {}),
      ...(upd.inventory !== undefined ? { inventory: upd.inventory } : {}),
      ...(upd.bonusProduces !== undefined ? { bonusProduces: upd.bonusProduces } : {}),
    };
  }

  return { ...w, ports: newPorts, worldEvents: newEvents };
}

/** Returns true if a port is currently closed by some event (no docking). */
export function isPortClosed(world: WorldState, portKey: string): boolean {
  return getAggregatedEffects(world, portKey).portClosed;
}

/** Check whether two factions are at war (re-exported for convenience). */
export function areFactionsAtWar(world: WorldState, a: string, b: string): boolean {
  return world.worldEvents.some(ev =>
    ev.type === "war_start" &&
    ev.endDay >= world.time.day &&
    ev.factions.includes(a) && ev.factions.includes(b)
  );
}

/** Map of factionId → spawn multiplier for warring nations (≥1). */
export function warSpawnMultipliers(world: WorldState): Record<string, number> {
  const mul: Record<string, number> = {};
  for (const ev of world.worldEvents) {
    if (ev.type !== "war_start" || ev.endDay < world.time.day) continue;
    for (const f of ev.factions) {
      mul[f] = Math.max(mul[f] ?? 1, 2);
    }
  }
  return mul;
}
