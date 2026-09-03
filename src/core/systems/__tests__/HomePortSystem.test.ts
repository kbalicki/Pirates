import { describe, it, expect } from "vitest";
import {
  homePort,
  homePortActive,
  isHomePort,
  careen,
  warehouseOf,
  warehouseUsed,
  warehouseFree,
  holdFree,
  storeGoods,
  withdrawGoods,
  WAREHOUSE_CAP,
} from "../HomePortSystem.ts";
import {
  propose,
  dowryFor,
  payDowry,
  daughterFor,
  MARRIED_FLAG,
  MARRIED_TO_PREFIX,
  MARRIAGE_THRESHOLD,
  MARRIAGE_MIN_RANK,
  DOWRY_BASE,
  DOWRY_PER_WEALTH,
  DOWRY_PER_RANK,
} from "../RomanceSystem.ts";
import { repairShip, repairableDamage } from "../PortInteractionSystem.ts";
import type { WorldState, PortRuntimeState, FleetShip } from "../../model/WorldState.ts";
import { entityId, shipClassId, factionId, portId } from "../../model/ids.ts";
import { CITIES } from "../../data/cities.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";

// ===========================================================================
// HomePortSystem — what a marriage is actually for
// ===========================================================================
//
// Before v0.18.0 the wedding paid in standing and in retirement points and
// changed nothing about the day after it. These tests pin the three things that
// do change, and the one rule that can take them all away again: the town has
// to still fly her father's flag.

const HOME = "port_royal";

function makePort(portKey: string, over: Partial<PortRuntimeState> = {}): PortRuntimeState {
  const baseline = getPortBaseline(portKey);
  return {
    portId: portId(portKey),
    factionId: CITIES[portKey].factionId,
    prices: {},
    inventory: {},
    shipyardQueue: [],
    availableCrew: 0,
    population: baseline.population,
    wealth: baseline.wealth,
    defense: baseline.defense,
    bonusProduces: [],
    ...over,
  };
}

function consort(classId: string, over: Partial<FleetShip> = {}): FleetShip {
  const cls = SHIP_CLASSES[classId];
  return {
    classId,
    hullHp: cls.hullMax,
    hullMax: cls.hullMax,
    sailsHp: cls.sailsMax,
    sailsMax: cls.sailsMax,
    cannons: cls.cannons,
    crew: Math.round(cls.crewMax * 0.8),
    ...over,
  };
}

function makeWorld(over: {
  married?: string;
  flags?: Record<string, boolean>;
  ports?: Record<string, PortRuntimeState>;
  fleet?: FleetShip[];
  cargo?: Record<string, number>;
  warehouse?: Record<string, number>;
  hullHp?: number;
  sailsHp?: number;
  gold?: number;
  ranks?: Record<string, number>;
  courtship?: Record<string, number>;
  homeCrown?: string;
} = {}): WorldState {
  const cls = SHIP_CLASSES.frigate;
  const flags: Record<string, boolean> = { ...(over.flags ?? {}) };
  if (over.married) {
    flags[MARRIED_FLAG] = true;
    flags[MARRIED_TO_PREFIX + over.married] = true;
  }

  return {
    version: 12,
    time: { day: 400, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 4, state: 4 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: over.gold ?? 5000,
      notoriety: 30,
      reputation: {},
      ranks: over.ranks ?? {},
      location: { type: "port", portId: portId(HOME), pos: { x: 0, y: 0 } },
      questLog: [],
      fleet: over.fleet ?? [],
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: over.courtship ?? {},
      ...(over.warehouse === undefined ? {} : { warehouse: over.warehouse }),
      ...(over.homeCrown === undefined ? {} : { homeCrown: over.homeCrown }),
    },
    entities: {
      player_ship: {
        id: entityId("player_ship"),
        kind: "ship",
        mode: "sailing",
        depthOffset: 0,
        pos: { x: 0, y: 0 },
        vel: { x: 0, y: 0 },
        heading: 0,
        sailLevel: 0.5,
        ship: {
          classId: shipClassId("frigate"),
          factionId: factionId("england"),
          hullHp: over.hullHp ?? cls.hullMax,
          hullMax: cls.hullMax,
          sailsHp: over.sailsHp ?? cls.sailsMax,
          sailsMax: cls.sailsMax,
          cannons: cls.cannons,
          cargo: over.cargo ?? {},
          cargoCap: cls.cargoCap,
          crew: { current: cls.crewMax, max: cls.crewMax, morale: 0.8 },
        },
      },
    },
    ports: over.ports ?? { [HOME]: makePort(HOME) },
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: flags,
    eventLog: [],
    worldEvents: [],
    knownEventIds: [],
    playerName: "Test",
    eraId: "1660",
    startYear: 1660,
    gameSpeed: 1.2,
    captain: {
      name: "Test",
      nationality: "england",
      birthYear: 1640,
      startAge: 20,
      skills: { fencing: 5, gunnery: 5, navigation: 5, charm: 5, medicine: 5 },
      training: 0.5,
    },
  } as WorldState;
}

// ── Which town, and whether it still counts ───────────────

describe("homePort / homePortActive", () => {
  it("has no home port before the wedding", () => {
    expect(homePort(makeWorld())).toBeUndefined();
    expect(homePortActive(makeWorld())).toBe(false);
  });

  it("is the town the captain married into", () => {
    const w = makeWorld({ married: HOME });
    expect(homePort(w)).toBe(HOME);
    expect(isHomePort(w, HOME)).toBe(true);
  });

  it("is not some other town", () => {
    expect(isHomePort(makeWorld({ married: HOME }), "cartagena")).toBe(false);
  });

  it("lapses when the town changes hands to another crown", () => {
    const w = makeWorld({
      married: HOME,
      homeCrown: "england",
      ports: { [HOME]: makePort(HOME, { factionId: factionId("spain"), capturedDay: 300 }) },
    });
    // The marriage stands — the credit does not.
    expect(homePort(w)).toBe(HOME);
    expect(homePortActive(w)).toBe(false);
    expect(isHomePort(w, HOME)).toBe(false);
  });

  it("lapses when the captain takes the town himself", () => {
    const w = makeWorld({
      married: HOME,
      ports: { [HOME]: makePort(HOME, { factionId: factionId("pirates"), capturedDay: 300 }) },
    });
    expect(homePortActive(w)).toBe(false);
  });

  it("comes back when her father's flag goes back up", () => {
    const lost = makeWorld({
      married: HOME,
      ports: { [HOME]: makePort(HOME, { factionId: factionId("spain"), capturedDay: 300 }) },
    });
    const back = { ...lost, ports: { [HOME]: makePort(HOME) } };
    expect(homePortActive(back)).toBe(true);
  });
});

// ── The dowry ─────────────────────────────────────────────

describe("dowryFor / payDowry", () => {
  it("is worth more from a richer town", () => {
    const poor = makeWorld({ ports: { [HOME]: makePort(HOME, { wealth: 100 }) } });
    const rich = makeWorld({ ports: { [HOME]: makePort(HOME, { wealth: 900 }) } });
    expect(dowryFor(rich, HOME)).toBeGreaterThan(dowryFor(poor, HOME));
  });

  it("is worth more to a captain with a rank", () => {
    const commoner = makeWorld();
    const knight = makeWorld({ ranks: { england: 3 } });
    expect(dowryFor(knight, HOME) - dowryFor(commoner, HOME)).toBe(DOWRY_PER_RANK * 3);
  });

  it("adds up the way the constants say", () => {
    const w = makeWorld({ ports: { [HOME]: makePort(HOME, { wealth: 500 }) }, ranks: { england: 2 } });
    expect(dowryFor(w, HOME)).toBe(
      Math.round(DOWRY_BASE + 500 * DOWRY_PER_WEALTH + 2 * DOWRY_PER_RANK),
    );
  });

  it("is nothing at all for a town with no governor's household", () => {
    const outpost = Object.keys(CITIES).find(k => !daughterFor(makeWorld(), k));
    if (outpost) expect(dowryFor(makeWorld(), outpost)).toBe(0);
  });

  it("goes into the captain's purse and into the log", () => {
    const w = makeWorld({ gold: 100 });
    const out = payDowry(w, HOME);
    expect(out.world.player.gold).toBe(100 + out.gold);
    expect(out.world.eventLog.some(e => e.key === "home.log_dowry")).toBe(true);
  });

  it("is paid by the wedding itself", () => {
    const daughter = daughterFor(makeWorld(), HOME)!;
    const w = makeWorld({
      gold: 0,
      courtship: { [HOME]: MARRIAGE_THRESHOLD },
      ranks: { [daughter.factionKey]: MARRIAGE_MIN_RANK },
    });
    const out = propose(w, HOME);
    expect(out.accepted).toBe(true);
    expect(out.dowry).toBe(dowryFor(w, HOME));
    expect(out.world.player.gold).toBe(out.dowry);
  });
});

// ── Careening ─────────────────────────────────────────────

describe("careen — the family yard", () => {
  it("makes good hull and rig on the flagship", () => {
    const w = makeWorld({ married: HOME, hullHp: 40, sailsHp: 30 });
    const out = careen(w);
    const ship = out.world.entities.player_ship.ship!;
    expect(ship.hullHp).toBe(ship.hullMax);
    expect(ship.sailsHp).toBe(ship.sailsMax);
    expect(out.restored).toBe(
      (ship.hullMax - 40) + (ship.sailsMax - 30),
    );
  });

  it("makes good the consorts too", () => {
    const battered = consort("barque", { hullHp: 10, sailsHp: 5 });
    const out = careen(makeWorld({ married: HOME, fleet: [battered] }));
    expect(out.world.player.fleet[0].hullHp).toBe(battered.hullMax);
    expect(out.world.player.fleet[0].sailsHp).toBe(battered.sailsMax);
  });

  it("costs nothing", () => {
    const w = makeWorld({ married: HOME, hullHp: 10, gold: 3 });
    expect(careen(w).world.player.gold).toBe(3);
  });

  it("does nothing at all to a sound fleet", () => {
    const w = makeWorld({ married: HOME });
    const out = careen(w);
    expect(out.restored).toBe(0);
    expect(out.world).toBe(w);
  });
});

// ── Paid repair, which had to be widened to match ─────────

describe("repairShip — hull and rig, flagship and consorts", () => {
  it("counts every damaged part of the fleet", () => {
    const w = makeWorld({ hullHp: 100, sailsHp: 50, fleet: [consort("barque", { hullHp: 20 })] });
    const cls = SHIP_CLASSES.frigate;
    const barque = SHIP_CLASSES.barque;
    expect(repairableDamage(w)).toBe(
      (cls.hullMax - 100) + (cls.sailsMax - 50) + (barque.hullMax - 20),
    );
  });

  it("repairs the rig, which it did not do before v0.18.0", () => {
    const w = makeWorld({ sailsHp: 10 });
    const out = repairShip(w);
    const ship = out.world.entities.player_ship.ship!;
    expect(ship.sailsHp).toBe(ship.sailsMax);
  });

  it("repairs a consort, which it did not do before either", () => {
    const w = makeWorld({ fleet: [consort("barque", { hullHp: 5 })] });
    const out = repairShip(w);
    expect(out.world.player.fleet[0].hullHp).toBe(SHIP_CLASSES.barque.hullMax);
  });

  it("spends what gold there is on the worst damage first", () => {
    // Ten gold buys five points, and the flagship's hull is the worst of it.
    const w = makeWorld({ gold: 10, hullHp: 20, sailsHp: SHIP_CLASSES.frigate.sailsMax - 2 });
    const out = repairShip(w);
    expect(out.world.entities.player_ship.ship!.hullHp).toBe(25);
    expect(out.world.entities.player_ship.ship!.sailsHp).toBe(SHIP_CLASSES.frigate.sailsMax - 2);
    expect(out.world.player.gold).toBe(0);
  });

  it("says there is nothing to do on a sound fleet", () => {
    expect(repairShip(makeWorld()).error).toBe("no_damage");
  });
});

// ── The storehouse ────────────────────────────────────────

describe("the storehouse", () => {
  it("is empty on a save that never had one", () => {
    const w = makeWorld();
    expect(warehouseOf(w)).toEqual({});
    expect(warehouseUsed(w)).toBe(0);
    expect(warehouseFree(w)).toBe(WAREHOUSE_CAP);
  });

  it("takes goods out of the hold and puts them ashore", () => {
    const w = makeWorld({ married: HOME, cargo: { sugar_cane: 30 } });
    const out = storeGoods(w, "sugar_cane", 20);
    expect(out.moved).toBe(20);
    expect(out.world.entities.player_ship.ship!.cargo.sugar_cane).toBe(10);
    expect(warehouseOf(out.world).sugar_cane).toBe(20);
  });

  it("drops the row rather than leaving a zero behind", () => {
    const w = makeWorld({ married: HOME, cargo: { rum: 5 } });
    const out = storeGoods(w, "rum", 5);
    expect(out.world.entities.player_ship.ship!.cargo.rum).toBeUndefined();
  });

  it("moves only what is aboard", () => {
    const w = makeWorld({ married: HOME, cargo: { rum: 4 } });
    expect(storeGoods(w, "rum", 50).moved).toBe(4);
  });

  it("moves only what the storehouse will take", () => {
    const w = makeWorld({
      married: HOME,
      cargo: { rum: 40 },
      warehouse: { sugar_cane: WAREHOUSE_CAP - 3 },
    });
    expect(storeGoods(w, "rum", 40).moved).toBe(3);
  });

  it("takes goods back aboard", () => {
    const w = makeWorld({ married: HOME, warehouse: { tobacco: 25 } });
    const out = withdrawGoods(w, "tobacco", 10);
    expect(out.moved).toBe(10);
    expect(out.world.entities.player_ship.ship!.cargo.tobacco).toBe(10);
    expect(warehouseOf(out.world).tobacco).toBe(15);
  });

  it("takes back only what the hold has room for", () => {
    const cap = SHIP_CLASSES.frigate.cargoCap;
    const w = makeWorld({
      married: HOME,
      cargo: { rum: cap - 2 },
      warehouse: { tobacco: 40 },
    });
    expect(holdFree(w)).toBe(2);
    expect(withdrawGoods(w, "tobacco", 40).moved).toBe(2);
  });

  it("empties the row when the last of it comes aboard", () => {
    const w = makeWorld({ married: HOME, warehouse: { tobacco: 6 } });
    expect(warehouseOf(withdrawGoods(w, "tobacco", 6).world).tobacco).toBeUndefined();
  });

  it("does nothing when there is nothing to move", () => {
    const w = makeWorld({ married: HOME });
    expect(storeGoods(w, "rum", 10).world).toBe(w);
    expect(withdrawGoods(w, "rum", 10).world).toBe(w);
  });

  it("does not mutate the world it was handed", () => {
    const w = makeWorld({ married: HOME, cargo: { rum: 10 } });
    storeGoods(w, "rum", 10);
    expect(w.entities.player_ship.ship!.cargo.rum).toBe(10);
    expect(w.player.warehouse).toBeUndefined();
  });
});
