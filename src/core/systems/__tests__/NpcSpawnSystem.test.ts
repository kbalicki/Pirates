import { describe, it, expect } from "vitest";
import { updateNpcSpawns } from "../NpcSpawnSystem.ts";
import { tradeRoutes } from "../TradeRouteSystem.ts";
import { getPortWaterPos } from "../PortWaterPositions.ts";
import { CITIES } from "../../data/cities.ts";
import { ITEMS } from "../../data/items.ts";
import { initPortPrices } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId, factionId, shipClassId } from "../../model/ids.ts";
import type { WorldState, PortRuntimeState } from "../../model/WorldState.ts";
import type { EntityState } from "../../model/EntityState.ts";

// ===========================================================================
// NpcSpawnSystem — the carriage loop
// ===========================================================================

/**
 * v0.23.0 made the hulls near the player carry *real* goods: a departing
 * trader loads out of her port's warehouse and a docking one lands her hold
 * into the warehouse at the far end. What is worth asserting is that loop —
 * goods leave one place and arrive at another — plus the guard that keeps it
 * from being a wrecking ball: a hull may draw a warehouse down, never strip it.
 */

const STOCK = 400;

function makePort(key: string, over: Partial<PortRuntimeState> = {}): PortRuntimeState {
  const baseline = getPortBaseline(key);
  const inventory: Record<string, number> = {};
  for (const item of Object.keys(ITEMS)) inventory[item] = STOCK;
  return {
    portId: portId(key),
    factionId: CITIES[key].factionId,
    prices: initPortPrices(key),
    inventory,
    shipyardQueue: [],
    availableCrew: 10,
    population: baseline.population,
    wealth: baseline.wealth,
    defense: baseline.defense,
    bonusProduces: [],
    ...over,
  };
}

function makeWorld(playerPos = { x: 1500, y: 1200 }): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  for (const key of Object.keys(CITIES)) ports[key] = makePort(key);
  const player: EntityState = {
    id: entityId("player_ship"),
    kind: "ship",
    mode: "sailing",
    pos: playerPos,
    vel: { x: 0, y: 0 },
    heading: 0,
    sailLevel: 0.5,
    depthOffset: 0,
    ship: {
      classId: shipClassId("frigate"),
      factionId: factionId("england"),
      hullHp: 100, hullMax: 100,
      sailsHp: 100, sailsMax: 100,
      cannons: 20,
      cargo: {},
      cargoCap: 80,
      crew: { current: 50, max: 80, morale: 0.8 },
    },
  };
  return {
    version: 13,
    time: { day: 100, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 7, state: 7 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: 500,
      notoriety: 0,
      reputation: {},
      ranks: {},
      location: { type: "sea", pos: playerPos },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
    },
    entities: { player_ship: player },
    ports,
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: {},
    eventLog: [],
    worldEvents: [],
    knownEventIds: [],
    playerName: "Captain",
    eraId: "pirates_sunset",
    startYear: 1690,
    gameSpeed: 1.2,
    captain: {
      nationality: "england",
      skills: { fencing: 5, gunnery: 5, navigation: 5, medicine: 5, charm: 5 },
      startAge: 20,
      training: 0.3,
    },
  };
}

/** Cross the spawn interval N times. */
function runSpawns(world: WorldState, times: number): WorldState {
  let w = world;
  for (let i = 0; i < times; i++) {
    w = { ...w, time: { ...w.time, tick: w.time.tick + 60 } };
    w = updateNpcSpawns(w, 60);
  }
  return w;
}

const goodsAfloat = (w: WorldState): number =>
  Object.values(w.entities)
    .filter(e => e.ai && e.ship)
    .reduce((sum, e) => sum + Object.values(e.ship!.cargo ?? {}).reduce((s, q) => s + q, 0), 0);

const goodsAshore = (w: WorldState): number =>
  Object.values(w.ports)
    .reduce((sum, p) => sum + Object.values(p.inventory).reduce((s, q) => s + q, 0), 0);

describe("loading out of the warehouse", () => {
  it("puts hulls on the map at all", () => {
    const after = runSpawns(makeWorld(), 6);
    expect(Object.values(after.entities).filter(e => e.ai).length).toBeGreaterThan(0);
  });

  it("gives lane traders a hold with something in it", () => {
    const after = runSpawns(makeWorld(), 12);
    const laden = Object.values(after.entities)
      .filter(e => e.ai?.behavior === "trader" && e.ai.lane)
      .filter(e => Object.keys(e.ship?.cargo ?? {}).length > 0);
    expect(laden.length).toBeGreaterThan(0);
    for (const hull of laden) {
      const stowed = Object.values(hull.ship!.cargo).reduce((s, q) => s + q, 0);
      expect(stowed).toBeGreaterThan(0);
      expect(stowed).toBeLessThanOrEqual(hull.ship!.cargoCap);
    }
  });

  it("carries only what the lane it sails actually carries", () => {
    const after = runSpawns(makeWorld(), 12);
    for (const hull of Object.values(after.entities)) {
      const laneId = hull.ai?.lane?.routeId;
      if (!laneId) continue;
      const lane = tradeRoutes().find(r => r.id === laneId)!;
      for (const item of Object.keys(hull.ship?.cargo ?? {})) {
        expect(lane.items).toContain(item);
      }
    }
  });

  it("takes the cargo out of somebody's warehouse", () => {
    const before = makeWorld();
    const after = runSpawns(before, 12);
    expect(goodsAfloat(after)).toBeGreaterThan(0);
    expect(goodsAshore(after)).toBeLessThan(goodsAshore(before));
  });

  it("never strips a warehouse to nothing", () => {
    // Fifty spawn passes is far more traffic than the map ever carries.
    const after = runSpawns(makeWorld(), 50);
    for (const port of Object.values(after.ports)) {
      for (const qty of Object.values(port.inventory)) {
        expect(qty).toBeGreaterThan(0);
      }
    }
  });
});

describe("landing it at the far end", () => {
  it("adds a docking trader's hold to the port and removes her", () => {
    const lane = tradeRoutes()[0];
    const water = getPortWaterPos(lane.to);
    const base = makeWorld(water);
    const item = lane.items[0];

    const trader: EntityState = {
      id: entityId("npc_trader"),
      kind: "ship",
      mode: "sailing",
      pos: { ...water },
      vel: { x: 0, y: 0 },
      heading: 0,
      sailLevel: 0.5,
      depthOffset: 0,
      ship: {
        classId: shipClassId("fluyt"),
        factionId: CITIES[lane.from].factionId,
        hullHp: 100, hullMax: 100,
        sailsHp: 100, sailsMax: 100,
        cannons: 4,
        cargo: { [item]: 30 },
        cargoCap: 100,
        crew: { current: 20, max: 30, morale: 0.7 },
      },
      ai: {
        behavior: "trader",
        state: "travel",
        aggression: 0,
        awarenessRadius: 120,
        targetPortId: portId(lane.to),
        lastPortVisited: lane.from,
        lane: { routeId: lane.id, wp: 1 },
      },
    };

    // Room on the quay for her to land into: a warehouse already at its cap
    // takes nothing, which is correct and would prove nothing here.
    const world: WorldState = {
      ...base,
      entities: { ...base.entities, npc_trader: trader },
      ports: { ...base.ports, [lane.to]: { ...base.ports[lane.to], inventory: { [item]: 0 } } },
    };
    const before = world.ports[lane.to].inventory[item] ?? 0;
    const after = runSpawns(world, 1);

    expect(after.entities.npc_trader).toBeUndefined();
    expect(after.ports[lane.to].inventory[item]).toBeGreaterThan(before);
  });

  it("caps a delivery at what the warehouse will hold", () => {
    const lane = tradeRoutes()[0];
    const water = getPortWaterPos(lane.to);
    const base = makeWorld(water);
    const item = lane.items[0];

    const trader: EntityState = {
      id: entityId("npc_trader"),
      kind: "ship",
      mode: "sailing",
      pos: { ...water },
      vel: { x: 0, y: 0 },
      heading: 0,
      sailLevel: 0.5,
      depthOffset: 0,
      ship: {
        classId: shipClassId("galleon"),
        factionId: CITIES[lane.from].factionId,
        hullHp: 100, hullMax: 100,
        sailsHp: 100, sailsMax: 100,
        cannons: 4,
        cargo: { [item]: 100000 },
        cargoCap: 100000,
        crew: { current: 20, max: 30, morale: 0.7 },
      },
      ai: {
        behavior: "trader",
        state: "travel",
        aggression: 0,
        awarenessRadius: 120,
        targetPortId: portId(lane.to),
        lastPortVisited: lane.from,
        lane: { routeId: lane.id, wp: 1 },
      },
    };

    const world: WorldState = { ...base, entities: { ...base.entities, npc_trader: trader } };
    const after = runSpawns(world, 1);
    // An absurd hold does not become an absurd warehouse.
    expect(after.ports[lane.to].inventory[item]).toBeLessThan(100000);
  });
});

describe("purity", () => {
  it("does not mutate the world it is given", () => {
    const world = makeWorld();
    const snapshot = structuredClone(world);
    runSpawns(world, 5);
    expect(world).toEqual(snapshot);
  });

  it("does nothing at all between spawn intervals", () => {
    // Tick 10 is inside an interval; tick 0 is a boundary and would fire.
    const world = makeWorld();
    const midInterval: WorldState = { ...world, time: { ...world.time, tick: 10 } };
    expect(updateNpcSpawns(midInterval, 1)).toBe(midInterval);
  });
});

// ===========================================================================
// Rovers (v0.50.0)
// ===========================================================================

describe("the Caribbean has pirates in it", () => {
  /** Run the spawner long enough for the weighted port roll to reach outposts. */
  function sail(days: number): WorldState {
    let w = makeWorld();
    for (let t = 0; t < days * 24 * 60; t++) {
      w = updateNpcSpawns(w, 1);
      w = { ...w, time: { ...w.time, tick: w.time.tick + 1 } };
    }
    return w;
  }

  it("puts rovers on the water at all", () => {
    // Before v0.50.0 `pickBehavior` returned "pirate" only for a port whose
    // crown was `pirates`, and no port starts pirate: measured on a fresh world,
    // 22 hulls afloat and not one of them a rover, while two pirate hunters
    // patrolled for a species the game never spawned.
    const w = sail(3);
    const rovers = Object.values(w.entities).filter(e => e.ai?.behavior === "pirate");
    expect(rovers.length).toBeGreaterThan(0);
  });

  it("flies the black flag over every one of them", () => {
    const w = sail(3);
    const rovers = Object.values(w.entities).filter(e => e.ai?.behavior === "pirate");
    for (const r of rovers) {
      expect(r.ship!.factionId as unknown as string).toBe("pirates");
    }
  });

  it("keeps them a minority of the traffic", () => {
    const w = sail(3);
    const npcs = Object.values(w.entities).filter(e => e.ai && e.id !== w.player.shipId);
    const rovers = npcs.filter(e => e.ai!.behavior === "pirate");
    expect(rovers.length / npcs.length).toBeLessThan(0.3);
  });

  it("gives every hull the aggression its trade calls for", () => {
    const w = sail(3);
    for (const e of Object.values(w.entities)) {
      if (!e.ai || e.id === w.player.shipId) continue;
      expect(e.ai.aggression).toBeGreaterThanOrEqual(0);
      expect(e.ai.aggression).toBeLessThanOrEqual(1);
      if (e.ai.behavior === "trader") expect(e.ai.aggression).toBeLessThan(0.2);
      if (e.ai.behavior === "pirate") expect(e.ai.aggression).toBeGreaterThan(0.5);
    }
  });

  it("reads the flag flying over the town today, not the one on the 1680 map", () => {
    // A colony the player has stormed sends out *his* ships. Before v0.50.0 the
    // spawner read `PortDef.factionId`, which never changes, so a captured town
    // went on sending English merchantmen out for the rest of the game.
    let w = makeWorld();
    const key = Object.keys(w.ports).find(k => (CITIES[k].factionId as unknown as string) === "spain")!;
    w = {
      ...w,
      ports: { ...w.ports, [key]: { ...w.ports[key], factionId: factionId("pirates"), capturedDay: 1 } },
    };
    let seen = false;
    for (let t = 0; t < 20 * 24 * 60 && !seen; t++) {
      w = updateNpcSpawns(w, 1);
      w = { ...w, time: { ...w.time, tick: w.time.tick + 1 } };
      seen = Object.values(w.entities).some(e => e.ai?.behavior === "pirate"
        && (e.ship!.factionId as unknown as string) === "pirates");
    }
    expect(seen).toBe(true);
  });
});
