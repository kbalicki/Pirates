import { describe, it, expect } from "vitest";
import {
  tickBlockades,
  blockadeDays,
  blockadeEffective,
  blockadedPorts,
  portUnderPressure,
  harbourInReach,
  blockadeReadiness,
  fleetGuns,
  gunsToBlockade,
  portShutIn,
  BLOCKADE_RADIUS,
  BLOCKADE_ONSET_DAYS,
} from "../BlockadeSystem.ts";
import { economyDailyTick } from "../EconomyTickSystem.ts";
import { getPortWaterPos } from "../PortWaterPositions.ts";
import { CITIES } from "../../data/cities.ts";
import { initPortPrices, initPortInventory } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId, factionId, shipClassId } from "../../model/ids.ts";
import type { WorldState, PortRuntimeState } from "../../model/WorldState.ts";
import type { EntityState } from "../../model/EntityState.ts";

// ===========================================================================
// BlockadeSystem — pressing a harbour by being there
// ===========================================================================

/**
 * The whole mechanic is a counter that goes up while the player is on station
 * and down while he is not, so the tests are mostly about that counter: what
 * moves it, what gates it, and what it does to the town once it bites.
 *
 * `TARGET` is Port Royale because it demands three goods it does not grow, so
 * the economy half of the assertion has something to starve.
 */

const TARGET = "port_royal";
const AWAY = { x: 10, y: 10 };

function makePort(key: string, over: Partial<PortRuntimeState> = {}): PortRuntimeState {
  const baseline = getPortBaseline(key);
  return {
    portId: portId(key),
    factionId: CITIES[key].factionId,
    prices: initPortPrices(key),
    inventory: initPortInventory(key),
    shipyardQueue: [],
    availableCrew: 10,
    population: baseline.population,
    wealth: baseline.wealth,
    defense: baseline.defense,
    bonusProduces: [],
    ...over,
  };
}

function makeShip(pos: { x: number; y: number }, cannons: number): EntityState {
  return {
    id: entityId("player_ship"),
    kind: "ship",
    mode: "sailing",
    pos,
    vel: { x: 0, y: 0 },
    heading: 0,
    sailLevel: 0.5,
    depthOffset: 0,
    ship: {
      classId: shipClassId("frigate"),
      factionId: factionId("england"),
      hullHp: 100, hullMax: 100,
      sailsHp: 100, sailsMax: 100,
      cannons,
      cargo: {},
      cargoCap: 80,
      crew: { current: 60, max: 100, morale: 0.8 },
    },
  };
}

function makeWorld(opts: { pos?: { x: number; y: number }; cannons?: number } = {}): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  for (const key of Object.keys(CITIES)) ports[key] = makePort(key);
  const pos = opts.pos ?? AWAY;
  return {
    version: 13,
    time: { day: 100, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: 500,
      notoriety: 0,
      reputation: {},
      ranks: {},
      location: { type: "sea", pos },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
    },
    entities: { player_ship: makeShip(pos, opts.cannons ?? 40) },
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

/** Put the player on station off `TARGET` with guns enough to matter. */
function onStation(cannons = 40): WorldState {
  return makeWorld({ pos: getPortWaterPos(TARGET), cannons });
}

/** Run N days of blockade bookkeeping, advancing the clock. */
function press(world: WorldState, days: number): WorldState {
  let w = world;
  for (let i = 0; i < days; i++) {
    w = tickBlockades(w).world;
    w = { ...w, time: { ...w.time, day: w.time.day + 1 } };
  }
  return w;
}

describe("who is being pressed", () => {
  it("nobody, when the player is out at sea", () => {
    expect(portUnderPressure(makeWorld())).toBeNull();
    expect(harbourInReach(makeWorld())).toBeNull();
  });

  it("the harbour he is lying off", () => {
    expect(portUnderPressure(onStation())).toBe(TARGET);
  });

  it("nobody, when he is ashore", () => {
    const w = onStation();
    const inPort: WorldState = {
      ...w,
      player: { ...w.player, location: { type: "port", portId: portId(TARGET), pos: w.player.location.pos } },
    };
    expect(portUnderPressure(inPort)).toBeNull();
  });

  it("nobody, once he is past the radius", () => {
    const water = getPortWaterPos(TARGET);
    // Well clear of every harbour, not merely clear of this one — a step east
    // of Port Royale lands inside the radius of Leogane.
    const far = { x: water.x, y: water.y - BLOCKADE_RADIUS * 4 };
    expect(portUnderPressure(makeWorld({ pos: far }))).toBeNull();
  });

  it("the harbour is in reach even when the guns are not enough", () => {
    const w = makeWorld({ pos: getPortWaterPos(TARGET), cannons: 1 });
    expect(harbourInReach(w)).toBe(TARGET);
    expect(portUnderPressure(w)).toBeNull();
  });
});

describe("guns", () => {
  it("counts the whole fleet, not just the flagship", () => {
    const w = onStation(10);
    const withConsort: WorldState = {
      ...w,
      player: {
        ...w.player,
        fleet: [{ classId: "sloop", hullHp: 1, hullMax: 1, sailsHp: 1, sailsMax: 1, cannons: 8 }],
      },
    };
    expect(fleetGuns(withConsort)).toBe(18);
  });

  it("asks for more against a better-defended town", () => {
    const w = onStation();
    const weak: WorldState = { ...w, ports: { ...w.ports, [TARGET]: { ...w.ports[TARGET], defense: 10 } } };
    const strong: WorldState = { ...w, ports: { ...w.ports, [TARGET]: { ...w.ports[TARGET], defense: 90 } } };
    expect(gunsToBlockade(strong, TARGET)).toBeGreaterThan(gunsToBlockade(weak, TARGET));
  });

  it("reports readiness in the terms the HUD prints", () => {
    const w = onStation(6);
    const r = blockadeReadiness(w, TARGET);
    expect(r.guns).toBe(6);
    expect(r.required).toBe(gunsToBlockade(w, TARGET));
    expect(r.ready).toBe(r.guns >= r.required);
  });
});

describe("the cordon tightening", () => {
  it("counts up a day at a time", () => {
    let w = onStation();
    w = press(w, 1);
    expect(blockadeDays(w, TARGET)).toBe(1);
    w = press(w, 1);
    expect(blockadeDays(w, TARGET)).toBe(2);
  });

  it("does not bite until the onset day", () => {
    const w = press(onStation(), BLOCKADE_ONSET_DAYS - 1);
    expect(blockadeEffective(w, TARGET)).toBe(false);
    const later = press(w, 1);
    expect(blockadeEffective(later, TARGET)).toBe(true);
  });

  it("announces itself exactly once", () => {
    let w = onStation();
    let announcements = 0;
    for (let i = 0; i < 8; i++) {
      const r = tickBlockades(w);
      w = { ...r.world, time: { ...r.world.time, day: r.world.time.day + 1 } };
      announcements += r.events.filter(e => e.type === "Toast").length;
    }
    expect(announcements).toBe(1);
  });

  it("presses only one harbour at a time", () => {
    const w = press(onStation(), 5);
    expect(blockadedPorts(w)).toEqual([TARGET]);
  });

  it("slackens rather than snapping when he sails off", () => {
    let w = press(onStation(), 6);
    const held = blockadeDays(w, TARGET);
    // Same world, player far away.
    w = { ...w, player: { ...w.player, location: { type: "sea", pos: AWAY } }, entities: { player_ship: makeShip(AWAY, 40) } };
    w = press(w, 1);
    expect(blockadeDays(w, TARGET)).toBe(held - 1);
    expect(blockadeEffective(w, TARGET)).toBe(true);
  });

  it("lifts once the counter runs out, and says so", () => {
    let w = press(onStation(), 4);
    w = { ...w, player: { ...w.player, location: { type: "sea", pos: AWAY } }, entities: { player_ship: makeShip(AWAY, 40) } };
    let lifted = false;
    let daysStillBiting = 0;
    for (let i = 0; i < 10; i++) {
      const r = tickBlockades(w);
      w = { ...r.world, time: { ...r.world.time, day: r.world.time.day + 1 } };
      if (r.events.some(e => e.type === "Toast")) lifted = true;
      if (!lifted) daysStillBiting++;
    }
    // It stopped biting before the counter reached zero — the slack days are
    // the squadron being over the horizon, not the town still being shut.
    expect(daysStillBiting).toBeGreaterThan(0);
    expect(blockadeDays(w, TARGET)).toBe(0);
    expect(w.ports[TARGET].blockadeDays).toBeUndefined();
    expect(lifted).toBe(true);
  });

  it("stops counting up long past the point of usefulness", () => {
    const w = press(onStation(), 200);
    expect(blockadeDays(w, TARGET)).toBeLessThan(60);
  });
});

describe("what it costs the town", () => {
  it("thins the garrison every day it holds", () => {
    const start = onStation();
    const before = start.ports[TARGET].defense;
    const after = press(start, 10);
    expect(after.ports[TARGET].defense).toBeLessThan(before);
  });

  it("starves the port of everything a lane brings it", () => {
    const blockaded = press(onStation(), BLOCKADE_ONSET_DAYS);
    const open = onStation();

    const runEconomy = (w: WorldState, days: number): WorldState => {
      let out = w;
      for (let i = 0; i < days; i++) {
        out = economyDailyTick(out);
        out = { ...out, time: { ...out.time, day: out.time.day + 1 } };
      }
      return out;
    };

    const starved = runEconomy(blockaded, 30);
    const fed = runEconomy(open, 30);
    expect(starved.ports[TARGET].wealth).toBeLessThan(fed.ports[TARGET].wealth);
  });

  it("stops the town rebuilding while the cordon holds", () => {
    // A town knocked well below its baseline recovers when open and does not
    // when shut, which is the half of the mechanic that makes it worth staying.
    const hurt = (w: WorldState): WorldState => ({
      ...w,
      ports: { ...w.ports, [TARGET]: { ...w.ports[TARGET], population: 500 } },
    });
    const open = economyDailyTick(hurt(onStation()));
    const shut = economyDailyTick(hurt(press(onStation(), BLOCKADE_ONSET_DAYS)));
    expect(open.ports[TARGET].population).toBeGreaterThan(shut.ports[TARGET].population);
  });

  it("costs the player standing with the crown that owns it", () => {
    const w = press(onStation(), 6);
    const owner = CITIES[TARGET].factionId as string;
    expect(w.player.reputation[owner]).toBeLessThan(0);
    expect(w.player.notoriety).toBeGreaterThan(0);
  });

  it("costs nothing while the cordon has not yet bitten", () => {
    const w = press(onStation(), 1);
    const owner = CITIES[TARGET].factionId as string;
    expect(w.player.reputation[owner] ?? 0).toBe(0);
  });
});

describe("portShutIn", () => {
  it("is false for an ordinary harbour", () => {
    expect(portShutIn(makeWorld(), TARGET)).toBe(false);
  });

  it("is true once a cordon bites", () => {
    expect(portShutIn(press(onStation(), BLOCKADE_ONSET_DAYS), TARGET)).toBe(true);
  });
});

describe("purity", () => {
  it("does not mutate the world it is given", () => {
    const before = onStation();
    const snapshot = structuredClone(before);
    tickBlockades(before);
    expect(before).toEqual(snapshot);
  });
});
