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
  priceMul: 1,
  popDelta: 0,
  wealthDelta: 0,
  defenseDelta: 0,
  crewMul: 1,
  portClosed: false,
  recoveryMul: 1,
};

/** Per-type continuous effect on each affected port. */
function effectsForType(type: WorldEventType, severity: 1 | 2 | 3): EventDailyEffects {
  const sev = severity; // 1..3 — used to scale a few values
  switch (type) {
    case "epidemic":
      return { ...NEUTRAL,
        consumptionMul: 1.0,
        priceMul: 1 + 0.15 * sev,   // food/water cost more during plague
        popDelta: -2 * sev,         // ~60/month for severity 1
        wealthDelta: -1 * sev,
        crewMul: 0.5,
      };
    case "pirate_raid":
      return { ...NEUTRAL,
        defenseDelta: -1,
        productionMul: 0.7,
      };
    case "trade_boom":
      return { ...NEUTRAL,
        productionMul: 1.5,
        priceMul: 0.8,
        wealthDelta: +5,
      };
    case "slave_revolt":
      return { ...NEUTRAL,
        productionMul: 0.3,
        wealthDelta: -3,
        crewMul: 0.5,
      };
    case "hurricane":
      return { ...NEUTRAL,
        portClosed: true,
        productionMul: 0,
      };
    case "treasure_fleet":
      return { ...NEUTRAL,
        wealthDelta: +2, // small boost to source ports while convoy assembles
      };
    case "new_governor":
      return { ...NEUTRAL,
        wealthDelta: +5,
      };
    case "war_start":
      return { ...NEUTRAL,
        productionMul: 0.85,  // trade disruption
        priceMul: 1.1,
      };
    // ── v0.9.7 economy expansion ────────────────────────────
    case "gold_discovery":
      return { ...NEUTRAL,
        popDelta: +8,         // workers migrate in
        wealthDelta: +10,
        productionMul: 1.2,
      };
    case "native_raid":
      return { ...NEUTRAL,
        productionMul: 0.5,
        wealthDelta: -2,
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
        wealthDelta: +3,
      };
    case "royal_decree":
      return { ...NEUTRAL,
        priceMul: 1.2,        // tariff
        wealthDelta: +1,
      };
    case "treaty_signed":
      return { ...NEUTRAL,
        productionMul: 1.15,
        wealthDelta: +2,
      };
    case "war_end":
    default:
      return NEUTRAL;
  }
}

/**
 * Aggregate effects from all active events on a given port.
 * Multipliers compound, deltas sum.
 */
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

    const e = effectsForType(ev.type, ev.severity);
    agg = {
      productionMul: agg.productionMul * e.productionMul,
      consumptionMul: agg.consumptionMul * e.consumptionMul,
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
