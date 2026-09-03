import { describe, it, expect } from "vitest";
import {
  heldDefenseCeiling,
  heldEconomyCeiling,
  garrisonCapacity,
  garrisonAt,
  maxStationable,
  stationMen,
  crownStrength,
  claimantFor,
  reliefChance,
  activeExpeditionFor,
  daysUntilRelief,
  expeditionFor,
  launchExpedition,
  playerPresentAt,
  fleetDefenceContribution,
  defenceStrength,
  attackStrength,
  holdOdds,
  resolveRelief,
  settleRelief,
  tickReconquest,
  playerHolds,
  playerDefends,
  alliedWith,
  pendingDefenseFor,
  RELIEF_GRACE_DAYS,
  RELIEF_COOLDOWN_DAYS,
  RELIEF_DAILY_BASE,
  RELIEF_SAIL_DAYS,
  SIZE_PRIORITY,
  AT_WAR_PENALTY,
  ESCALATION_DAYS,
  HELD_DEFENSE_SHARE,
  HELD_POPULATION_SHARE,
  HELD_WEALTH_SHARE,
  PRESENCE_RANGE,
  WRECK_GOLD_PER_SOLDIER,
  ROYAL_QUALITY,
  type Expedition,
} from "../ReconquestSystem.ts";
import { garrisonFor, capturePort, attackForceFor, SHIP_KEEPERS, SIZE_SOLDIERS } from "../SiegeSystem.ts";
import type { WorldState, PortRuntimeState, WorldEventState } from "../../model/WorldState.ts";
import { entityId, shipClassId, factionId, portId } from "../../model/ids.ts";
import { CITIES } from "../../data/cities.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";

// ===========================================================================
// ReconquestSystem — the crown coming back for a town the player took
// ===========================================================================

/** A large Spanish fort and a small French outpost: both ends of every curve. */
const FORT = "cartagena";
const OUTPOST = "tortuga";

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

/** The same port, but flying the black flag since `capturedDay`. */
function takenPort(portKey: string, over: Partial<PortRuntimeState> = {}): PortRuntimeState {
  return makePort(portKey, {
    factionId: factionId("pirates"),
    capturedDay: 100,
    defense: Math.round(getPortBaseline(portKey).defense * 0.15),
    garrison: 0,
    ...over,
  });
}

function makeWorld(over: {
  shipClass?: string;
  crew?: number;
  morale?: number;
  fencing?: number;
  training?: number;
  day?: number;
  gold?: number;
  pos?: { x: number; y: number };
  inPort?: string;
  ports?: Record<string, PortRuntimeState>;
  worldEvents?: WorldEventState[];
  rngState?: number;
} = {}): WorldState {
  const {
    shipClass = "frigate", morale = 0.8, fencing = 5, training = 0.5,
    day = 130, gold = 1000, pos = { x: 0, y: 0 }, rngState = 7,
  } = over;
  const cls = SHIP_CLASSES[shipClass];
  const crew = over.crew ?? cls.crewMax;

  return {
    version: 12,
    time: { day, hour: 12, minute: 0, tick: 0 },
    rng: { seed: rngState, state: rngState },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold,
      notoriety: 10,
      reputation: {},
      ranks: {},
      location: over.inPort
        ? { type: "port", portId: portId(over.inPort), pos }
        : { type: "sea", pos },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
      citiesCaptured: 1,
      courtship: {},
    },
    entities: {
      player_ship: {
        id: entityId("player_ship"),
        kind: "ship",
        mode: "sailing",
        depthOffset: 0,
        pos,
        vel: { x: 0, y: 0 },
        heading: 0,
        sailLevel: 0.5,
        ship: {
          classId: shipClassId(shipClass),
          factionId: factionId("england"),
          hullHp: cls.hullMax, hullMax: cls.hullMax,
          sailsHp: cls.sailsMax, sailsMax: cls.sailsMax,
          cannons: cls.cannons,
          cargoCap: cls.cargoCap,
          // Berths never below the complement the fixture asked for: an
          // over-crewed ship has no free berths, and every "take the men back
          // aboard" case would silently do nothing.
          crew: { current: crew, max: Math.max(cls.crewMax, crew), morale },
          cargo: {},
        },
      },
    },
    ports: over.ports ?? { [FORT]: takenPort(FORT), [OUTPOST]: makePort(OUTPOST) },
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: {},
    eventLog: [],
    worldEvents: over.worldEvents ?? [],
    knownEventIds: [],
    playerName: "Captain",
    eraId: "pirates_sunset",
    startYear: 1690,
    gameSpeed: 1.2,
    captain: {
      nationality: "england",
      skills: { fencing, gunnery: 5, navigation: 5, medicine: 5, charm: 5 },
      startAge: 20,
      training,
    },
  } as WorldState;
}

/** A squadron already at sea for `portKey`, arriving on `endDay`. */
function inFlight(portKey: string, over: Partial<WorldEventState> = {}): WorldEventState {
  return {
    id: `reconquest_${portKey}_100`,
    type: "reconquest",
    startDay: 120,
    endDay: 130,
    ports: [portKey],
    factions: [CITIES[portKey].factionId as string, "pirates"],
    severity: 3,
    headline: "news.reconquest",
    vars: { port: portKey, faction: "Spain", soldiers: 120, guns: 30, days: 10 },
    ...over,
  };
}

function warEvent(faction: string, endDay = 999): WorldEventState {
  return {
    id: "war_test",
    type: "war_start",
    startDay: 1,
    endDay,
    ports: [],
    factions: [faction, "england"],
    severity: 3,
    headline: "news.war_start",
    vars: {},
  };
}

// ---------------------------------------------------------------------------

describe("heldDefenseCeiling", () => {
  it("leaves a town that never changed hands recovering toward its royal baseline", () => {
    const world = makeWorld({ ports: { [FORT]: makePort(FORT) } });
    expect(heldDefenseCeiling(world, FORT)).toBe(getPortBaseline(FORT).defense);
  });

  it("caps a town that changed hands at what its own people will raise", () => {
    const world = makeWorld();
    const baseline = getPortBaseline(FORT).defense;
    expect(heldDefenseCeiling(world, FORT)).toBe(Math.round(baseline * HELD_DEFENSE_SHARE));
    expect(heldDefenseCeiling(world, FORT)).toBeLessThan(baseline);
  });

  it("goes back to the royal baseline once the crown holds the town again", () => {
    const world = makeWorld();
    const back = {
      ...world,
      ports: { ...world.ports, [FORT]: { ...world.ports[FORT], factionId: CITIES[FORT].factionId } },
    };
    expect(heldDefenseCeiling(back, FORT)).toBe(getPortBaseline(FORT).defense);
  });
});

describe("heldEconomyCeiling", () => {
  it("leaves a royal colony drifting toward its own numbers", () => {
    const world = makeWorld({ ports: { [FORT]: makePort(FORT) } });
    const baseline = getPortBaseline(FORT);
    expect(heldEconomyCeiling(world, FORT)).toEqual({
      population: baseline.population,
      wealth: baseline.wealth,
    });
  });

  it("cuts both when the town flies the black flag", () => {
    const world = makeWorld();
    const baseline = getPortBaseline(FORT);
    const ceiling = heldEconomyCeiling(world, FORT);
    expect(ceiling.population).toBe(Math.round(baseline.population * HELD_POPULATION_SHARE));
    expect(ceiling.wealth).toBe(Math.round(baseline.wealth * HELD_WEALTH_SHARE));
  });

  it("keeps both targets meaningfully below the colony's own numbers", () => {
    // Deliberately not "wealth is cut harder than population": these are
    // targets for two quantities with different dynamics. Wealth also carries a
    // constant downward trade pressure, so its *equilibrium* falls much further
    // than its target does — see the constant's own comment, and the
    // black-flag tests in EconomyTickSystem for the settled numbers.
    expect(HELD_WEALTH_SHARE).toBeLessThan(1);
    expect(HELD_POPULATION_SHARE).toBeLessThan(1);
    expect(HELD_WEALTH_SHARE).toBeGreaterThan(0.5);
  });

  it("is unchanged for a colony one crown took off another", () => {
    // v0.16.0 lets crowns take towns from each other. A conquered colony still
    // gets a governor and a budget, so only the black flag is special here.
    const world = makeWorld();
    const french = {
      ...world,
      ports: { ...world.ports, [FORT]: { ...world.ports[FORT], factionId: factionId("france") } },
    };
    const baseline = getPortBaseline(FORT);
    expect(heldEconomyCeiling(french, FORT).wealth).toBe(baseline.wealth);
  });
});

describe("stationing men", () => {
  it("scales capacity with what the town keeps under arms", () => {
    expect(garrisonCapacity(FORT)).toBe(SIZE_SOLDIERS[CITIES[FORT].population] * 2);
    expect(garrisonCapacity(OUTPOST)).toBeLessThan(garrisonCapacity(FORT));
    expect(garrisonCapacity("no_such_port")).toBe(0);
  });

  it("moves men off the deck and onto the walls", () => {
    const world = makeWorld({ crew: 100 });
    const next = stationMen(world, FORT, 40);
    expect(garrisonAt(next, FORT)).toBe(40);
    expect(next.entities.player_ship.ship!.crew.current).toBe(60);
  });

  it("never strips the ship below its keepers", () => {
    const world = makeWorld({ crew: 20 });
    expect(maxStationable(world, FORT)).toBe(20 - SHIP_KEEPERS);
    const next = stationMen(world, FORT, 999);
    expect(next.entities.player_ship.ship!.crew.current).toBe(SHIP_KEEPERS);
  });

  it("never puts more men in a town than it can hold", () => {
    const world = makeWorld({ shipClass: "galleon", crew: 400 });
    const next = stationMen(world, OUTPOST, 999);
    expect(garrisonAt(next, OUTPOST)).toBe(garrisonCapacity(OUTPOST));
  });

  it("takes men back aboard, up to the free berths", () => {
    const world = stationMen(makeWorld({ crew: 100 }), FORT, 50);
    const back = stationMen(world, FORT, -20);
    expect(garrisonAt(back, FORT)).toBe(30);
    expect(back.entities.player_ship.ship!.crew.current).toBe(70);
  });

  it("cannot take back men who are not there", () => {
    const world = stationMen(makeWorld({ crew: 100 }), FORT, 10);
    const back = stationMen(world, FORT, -50);
    expect(garrisonAt(back, FORT)).toBe(0);
    expect(back.entities.player_ship.ship!.crew.current).toBe(100);
  });

  it("leaves the world untouched when there is nothing to move", () => {
    const world = makeWorld({ crew: SHIP_KEEPERS });
    expect(stationMen(world, FORT, 30)).toBe(world);
  });

  it("counts stationed men as soldiers on the walls", () => {
    const world = makeWorld({ crew: 200 });
    const before = garrisonFor(world, FORT).soldiers;
    const after = garrisonFor(stationMen(world, FORT, 60), FORT).soldiers;
    expect(after - before).toBe(60);
  });
});

describe("crownStrength", () => {
  it("is 1 for a crown that still holds everything it started with", () => {
    const world = makeWorld({ ports: {} });
    expect(crownStrength(world, "spain")).toBeCloseTo(1, 5);
  });

  it("falls as its towns are taken", () => {
    const full = makeWorld({ ports: {} });
    const stripped = makeWorld({ ports: { [FORT]: takenPort(FORT) } });
    expect(crownStrength(stripped, "spain")).toBeLessThan(crownStrength(full, "spain"));
  });

  it("is 0 for a faction that never held a town on the starting map", () => {
    expect(crownStrength(makeWorld(), "pirates")).toBe(0);
  });
});

describe("reliefChance", () => {
  it("is zero for a town still flying its own flag", () => {
    const world = makeWorld({ ports: { [FORT]: makePort(FORT) } });
    expect(reliefChance(world, FORT)).toBe(0);
  });

  it("is zero inside the grace period after the town falls", () => {
    const world = makeWorld({ day: 100 + RELIEF_GRACE_DAYS - 1 });
    expect(reliefChance(world, FORT)).toBe(0);
  });

  it("becomes positive once the grace period is up", () => {
    const world = makeWorld({ day: 100 + RELIEF_GRACE_DAYS });
    expect(reliefChance(world, FORT)).toBeGreaterThan(0);
  });

  it("is zero while a squadron is already at sea for that town", () => {
    const world = makeWorld({ worldEvents: [inFlight(FORT)] });
    expect(reliefChance(world, FORT)).toBe(0);
  });

  it("respects a cooldown written after a failed attempt", () => {
    const world = makeWorld({
      day: 200,
      ports: { [FORT]: takenPort(FORT, { nextReliefDay: 250 }) },
    });
    expect(reliefChance(world, FORT)).toBe(0);
    expect(reliefChance({ ...world, time: { ...world.time, day: 250 } }, FORT)).toBeGreaterThan(0);
  });

  it("wants a large town back more than a small one", () => {
    const big = makeWorld({ ports: { [FORT]: takenPort(FORT) } });
    const small = makeWorld({ ports: { [OUTPOST]: takenPort(OUTPOST) } });
    expect(reliefChance(big, FORT)).toBeGreaterThan(reliefChance(small, OUTPOST));
    expect(SIZE_PRIORITY[CITIES[FORT].population])
      .toBeGreaterThan(SIZE_PRIORITY[CITIES[OUTPOST].population]);
  });

  it("halves while the crown has a war on its hands", () => {
    const peace = makeWorld();
    const war = makeWorld({ worldEvents: [warEvent("spain")] });
    expect(reliefChance(war, FORT)).toBeCloseTo(reliefChance(peace, FORT) * AT_WAR_PENALTY, 6);
  });

  it("ignores a war that has already ended", () => {
    const peace = makeWorld();
    const old = makeWorld({ worldEvents: [warEvent("spain", 10)] });
    expect(reliefChance(old, FORT)).toBeCloseTo(reliefChance(peace, FORT), 6);
  });

  it("never exceeds the base rate for a town of ordinary size", () => {
    expect(reliefChance(makeWorld(), FORT)).toBeLessThan(RELIEF_DAILY_BASE * 2);
  });

  it("is zero for a crown with nothing left to sail from", () => {
    const ports: Record<string, PortRuntimeState> = {};
    for (const key of Object.keys(CITIES)) {
      if ((CITIES[key].factionId as string) === "spain") ports[key] = takenPort(key);
    }
    expect(crownStrength(makeWorld({ ports }), "spain")).toBe(0);
    expect(reliefChance(makeWorld({ ports }), FORT)).toBe(0);
  });
});

describe("expeditionFor", () => {
  it("is deterministic from the seed", () => {
    const world = makeWorld();
    const a = expeditionFor(world, FORT, { seed: 1, state: 1 });
    const b = expeditionFor(world, FORT, { seed: 1, state: 1 });
    expect(a.expedition).toEqual(b.expedition);
  });

  it("sends more men after a town for a bigger town", () => {
    const world = makeWorld({
      ports: { [FORT]: takenPort(FORT), [OUTPOST]: takenPort(OUTPOST) },
    });
    const rng = { seed: 5, state: 5 };
    expect(expeditionFor(world, FORT, rng).expedition.soldiers)
      .toBeGreaterThan(expeditionFor(world, OUTPOST, rng).expedition.soldiers);
  });

  it("escalates the longer the town stays lost", () => {
    const rng = { seed: 9, state: 9 };
    const fresh = makeWorld({ day: 120 });
    const stale = makeWorld({ day: 100 + ESCALATION_DAYS });
    const a = expeditionFor(fresh, FORT, rng).expedition.soldiers;
    const b = expeditionFor(stale, FORT, rng).expedition.soldiers;
    expect(b).toBeGreaterThan(a);
    // Doubling is the cap, not a step on the way.
    expect(b / a).toBeLessThanOrEqual(2.05);
  });

  it("stops escalating past the cap", () => {
    const rng = { seed: 9, state: 9 };
    const capped = expeditionFor(makeWorld({ day: 100 + ESCALATION_DAYS }), FORT, rng).expedition;
    const beyond = expeditionFor(makeWorld({ day: 100 + ESCALATION_DAYS * 4 }), FORT, rng).expedition;
    expect(beyond.soldiers).toBe(capped.soldiers);
  });

  it("always sends a force worth the name, with guns and a passage", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const e = expeditionFor(makeWorld(), OUTPOST, { seed, state: seed }).expedition;
      expect(e.soldiers).toBeGreaterThanOrEqual(20);
      expect(e.guns).toBeGreaterThanOrEqual(4);
      expect(e.sailDays).toBeGreaterThanOrEqual(RELIEF_SAIL_DAYS[0]);
      expect(e.sailDays).toBeLessThanOrEqual(RELIEF_SAIL_DAYS[1]);
    }
  });
});

describe("launchExpedition", () => {
  it("puts an event at sea with an arrival day and a warning", () => {
    const world = makeWorld();
    const { world: next, event } = launchExpedition(world, FORT, world.rng);
    expect(event.type).toBe("reconquest");
    expect(event.ports[0]).toBe(FORT);
    expect(event.endDay - event.startDay).toBe(Number(event.vars.days));
    expect(event.endDay).toBeGreaterThan(world.time.day);
    expect(activeExpeditionFor(next, FORT)).toBeDefined();
    expect(daysUntilRelief(next, FORT)).toBe(Number(event.vars.days));
  });

  it("names the crown that lost the town, not the one holding it", () => {
    const world = makeWorld();
    const { event } = launchExpedition(world, FORT, world.rng);
    expect(event.factions[0]).toBe(claimantFor(FORT));
    expect(event.factions[1]).toBe("pirates");
  });

  it("spreads the news across every harbour the claimant still holds", () => {
    const world = makeWorld();
    const { event } = launchExpedition(world, FORT, world.rng);
    const spanish = Object.keys(CITIES).filter(
      k => k !== FORT && (CITIES[k].factionId as string) === "spain",
    );
    expect(event.ports.length).toBeGreaterThan(1);
    for (const key of spanish) expect(event.ports).toContain(key);
    // The town under threat is first — everything downstream reads ports[0].
    expect(event.ports[0]).toBe(FORT);
  });

  it("writes a line into the log the player can read", () => {
    const world = makeWorld();
    const { world: next } = launchExpedition(world, FORT, world.rng);
    expect(next.eventLog.at(-1)?.key).toBe("news.reconquest");
  });
});

describe("presence and strength", () => {
  it("counts the fleet as present when it is off the town", () => {
    const at = CITIES[FORT].pos;
    expect(playerPresentAt(makeWorld({ pos: at }), FORT)).toBe(true);
    expect(playerPresentAt(makeWorld({ pos: { x: at.x + PRESENCE_RANGE * 2, y: at.y } }), FORT)).toBe(false);
  });

  it("counts the player as present when docked in the town itself", () => {
    const far = { x: 9999, y: 9999 };
    expect(playerPresentAt(makeWorld({ pos: far, inPort: FORT }), FORT)).toBe(true);
    expect(playerPresentAt(makeWorld({ pos: far, inPort: OUTPOST }), FORT)).toBe(false);
  });

  it("throws a landing party's worth of men into the defence", () => {
    const world = makeWorld({ crew: 180 });
    expect(fleetDefenceContribution(world)).toBeGreaterThan(100);
    expect(fleetDefenceContribution(makeWorld({ crew: SHIP_KEEPERS }))).toBe(0);
  });

  it("rises with the men stationed in the town", () => {
    const world = makeWorld({ crew: 200 });
    const bare = defenceStrength(world, FORT, false);
    const manned = defenceStrength(stationMen(world, FORT, 60), FORT, false);
    expect(manned).toBeGreaterThan(bare);
  });

  it("rises with the walls the town still has", () => {
    const low = makeWorld({ ports: { [FORT]: takenPort(FORT, { defense: 5 }) } });
    const high = makeWorld({ ports: { [FORT]: takenPort(FORT, { defense: 45 }) } });
    expect(defenceStrength(high, FORT, false)).toBeGreaterThan(defenceStrength(low, FORT, false));
  });

  it("is worth far more with the fleet in the roads", () => {
    const world = makeWorld({ crew: 180 });
    expect(defenceStrength(world, FORT, true)).toBeGreaterThan(defenceStrength(world, FORT, false));
  });

  it("prices royal regulars above their raw numbers", () => {
    const e: Expedition = { soldiers: 100, guns: 0, sailDays: 8 };
    expect(attackStrength(e)).toBe(Math.round(100 * ROYAL_QUALITY));
    expect(attackStrength({ ...e, guns: 40 })).toBeGreaterThan(attackStrength(e));
  });
});

describe("holdOdds", () => {
  it("is a coin flip when the two sides are equal", () => {
    expect(holdOdds(100, 100)).toBeCloseTo(0.5, 6);
  });

  it("rises with the defence and falls with the attack", () => {
    expect(holdOdds(200, 100)).toBeGreaterThan(holdOdds(100, 100));
    expect(holdOdds(100, 200)).toBeLessThan(holdOdds(100, 100));
  });

  it("is sharper than the raw ratio, so a lopsided fight behaves like one", () => {
    const raw = 100 / (100 + 200);
    expect(holdOdds(100, 200)).toBeLessThan(raw);
    expect(holdOdds(200, 100)).toBeGreaterThan(200 / 300);
  });

  it("stays between 0 and 1 at the extremes", () => {
    expect(holdOdds(0, 100)).toBe(0);
    expect(holdOdds(100, 0)).toBe(1);
    expect(holdOdds(1, 10000)).toBeGreaterThanOrEqual(0);
    expect(holdOdds(10000, 1)).toBeLessThanOrEqual(1);
  });
});

describe("resolveRelief", () => {
  /** A squadron so large nothing can stop it. */
  const overwhelming = inFlight(FORT, { vars: { port: FORT, faction: "Spain", soldiers: 5000, guns: 900, days: 10 } });
  /** A squadron so small it cannot fail to be broken. */
  const token = inFlight(FORT, { vars: { port: FORT, faction: "Spain", soldiers: 20, guns: 4, days: 10 } });

  it("hands the town back to the crown that lost it when the landing carries", () => {
    const world = makeWorld({ worldEvents: [overwhelming] });
    const { result } = resolveRelief(world, overwhelming, world.rng);
    expect(result.townLost).toBe(true);
    expect(result.world.ports[FORT].factionId as string).toBe("spain");
    expect(result.world.ports[FORT].capturedDay).toBeUndefined();
    expect(result.world.ports[FORT].garrison).toBe(0);
  });

  it("leaves the flag alone when the town holds, and sets the cooldown", () => {
    const world = makeWorld({ worldEvents: [token], crew: 200 });
    const manned = stationMen(world, FORT, 100);
    const { result } = resolveRelief(manned, token, manned.rng);
    expect(result.townLost).toBe(false);
    expect(result.world.ports[FORT].factionId as string).toBe("pirates");
    expect(result.world.ports[FORT].nextReliefDay).toBe(manned.time.day + RELIEF_COOLDOWN_DAYS);
  });

  it("takes the squadron off the map either way", () => {
    for (const ev of [overwhelming, token]) {
      const world = makeWorld({ worldEvents: [ev], crew: 200 });
      const { result } = resolveRelief(world, ev, world.rng);
      expect(result.world.worldEvents.some(e => e.id === ev.id)).toBe(false);
    }
  });

  it("costs the garrison men whichever way it goes", () => {
    const world = stationMen(makeWorld({ worldEvents: [token], crew: 200 }), FORT, 80);
    const { result } = resolveRelief(world, token, world.rng);
    expect(result.garrisonLost).toBeGreaterThan(0);
    expect(result.world.ports[FORT].garrison).toBe(80 - result.garrisonLost);
  });

  it("pays for the wrecked transports only to a captain who was there", () => {
    const near = stationMen(makeWorld({ worldEvents: [token], crew: 200, pos: CITIES[FORT].pos }), FORT, 100);
    const far = stationMen(makeWorld({ worldEvents: [token], crew: 200, pos: { x: 0, y: 0 } }), FORT, 100);
    const there = resolveRelief(near, token, near.rng).result;
    const away = resolveRelief(far, token, far.rng).result;
    expect(there.playerPresent).toBe(true);
    expect(there.gold).toBe(Math.round(20 * WRECK_GOLD_PER_SOLDIER));
    expect(away.playerPresent).toBe(false);
    expect(away.gold).toBe(0);
  });

  it("bleeds the crew of a captain who stood on the beach", () => {
    const world = stationMen(makeWorld({ worldEvents: [token], crew: 200, pos: CITIES[FORT].pos }), FORT, 60);
    const before = world.entities.player_ship.ship!.crew.current;
    const { result } = resolveRelief(world, token, world.rng);
    expect(result.world.entities.player_ship.ship!.crew.current).toBeLessThan(before);
  });

  it("leaves the crew of a captain who was elsewhere alone", () => {
    const world = makeWorld({ worldEvents: [token], crew: 200, pos: { x: 0, y: 0 } });
    const before = world.entities.player_ship.ship!.crew.current;
    const { result } = resolveRelief(world, token, world.rng);
    expect(result.world.entities.player_ship.ship!.crew.current).toBe(before);
  });

  it("adds to the captain's name when the town holds", () => {
    const world = stationMen(makeWorld({ worldEvents: [token], crew: 200 }), FORT, 100);
    const { result } = resolveRelief(world, token, world.rng);
    expect(result.world.player.notoriety).toBeGreaterThan(world.player.notoriety);
  });

  it("writes a log line the player can read either way", () => {
    const lost = resolveRelief(makeWorld({ worldEvents: [overwhelming] }), overwhelming, { seed: 1, state: 1 });
    expect(lost.result.world.eventLog.at(-1)?.key).toBe("reconquest.log_lost");

    const held = stationMen(makeWorld({ worldEvents: [token], crew: 200 }), FORT, 120);
    const kept = resolveRelief(held, token, held.rng);
    expect(kept.result.world.eventLog.at(-1)?.key).toMatch(/^reconquest\.log_held/);
  });

  it("is deterministic from the seed", () => {
    const world = makeWorld({ worldEvents: [inFlight(FORT)], crew: 200 });
    const a = resolveRelief(world, world.worldEvents[0], { seed: 3, state: 3 });
    const b = resolveRelief(world, world.worldEvents[0], { seed: 3, state: 3 });
    expect(a.result.townLost).toBe(b.result.townLost);
    expect(a.result.garrisonLost).toBe(b.result.garrisonLost);
    expect(a.rng).toEqual(b.rng);
  });

  it("is decided by strength: a manned town beats a token squadron across every seed", () => {
    const held = stationMen(makeWorld({ worldEvents: [token], crew: 250 }), FORT, 150);
    for (let seed = 1; seed <= 25; seed++) {
      expect(resolveRelief(held, token, { seed, state: seed }).result.townLost).toBe(false);
    }
  });

  it("is decided by strength: an empty town falls to an overwhelming one across every seed", () => {
    const bare = makeWorld({ worldEvents: [overwhelming], pos: { x: 0, y: 0 } });
    for (let seed = 1; seed <= 25; seed++) {
      expect(resolveRelief(bare, overwhelming, { seed, state: seed }).result.townLost).toBe(true);
    }
  });
});

describe("tickReconquest", () => {
  it("bleeds a garrison a little every day", () => {
    const world = stationMen(makeWorld({ crew: 300, shipClass: "galleon" }), FORT, 200);
    const { world: next } = tickReconquest(world);
    expect(garrisonAt(next, FORT)).toBeLessThan(200);
    expect(garrisonAt(next, FORT)).toBeGreaterThan(190);
  });

  it("never lets a garrison go negative", () => {
    let world = stationMen(makeWorld({ crew: 100 }), FORT, 1);
    for (let i = 0; i < 20; i++) world = tickReconquest(world).world;
    expect(garrisonAt(world, FORT)).toBe(0);
  });

  it("leaves a squadron still at sea alone", () => {
    const world = makeWorld({ day: 125, worldEvents: [inFlight(FORT, { endDay: 130 })] });
    const { world: next, ownersChanged } = tickReconquest(world);
    expect(activeExpeditionFor(next, FORT)).toBeDefined();
    expect(ownersChanged).toEqual([]);
  });

  it("fights the landing on the day the squadron arrives", () => {
    const world = makeWorld({ day: 130, worldEvents: [inFlight(FORT, { endDay: 130 })] });
    const { world: next, events } = tickReconquest(world);
    expect(activeExpeditionFor(next, FORT)).toBeUndefined();
    expect(events.length).toBeGreaterThan(0);
  });

  it("still fights a landing whose day was skipped over", () => {
    const world = makeWorld({ day: 140, worldEvents: [inFlight(FORT, { endDay: 130 })] });
    const { world: next } = tickReconquest(world);
    expect(activeExpeditionFor(next, FORT)).toBeUndefined();
  });

  it("reports the towns whose flag changed, so the map can repaint", () => {
    const overwhelming = inFlight(FORT, {
      endDay: 130,
      vars: { port: FORT, faction: "Spain", soldiers: 5000, guns: 900, days: 10 },
    });
    const world = makeWorld({ day: 130, worldEvents: [overwhelming] });
    const { ownersChanged, world: next } = tickReconquest(world);
    expect(ownersChanged).toEqual([FORT]);
    expect(next.ports[FORT].factionId as string).toBe("spain");
  });

  it("eventually sends a squadron for a town left alone", () => {
    let world = makeWorld({ day: 120 });
    let launched = false;
    for (let i = 0; i < 400 && !launched; i++) {
      world = { ...tickReconquest(world).world };
      world = { ...world, time: { ...world.time, day: world.time.day + 1 } };
      if (activeExpeditionFor(world, FORT)) launched = true;
    }
    expect(launched).toBe(true);
  });

  it("never sends one for a town nobody took", () => {
    let world = makeWorld({ ports: { [OUTPOST]: makePort(OUTPOST) } });
    for (let i = 0; i < 200; i++) {
      world = tickReconquest(world).world;
      world = { ...world, time: { ...world.time, day: world.time.day + 1 } };
    }
    expect(activeExpeditionFor(world, OUTPOST)).toBeUndefined();
  });

  it("advances the rng so two identical days do not repeat themselves", () => {
    const world = makeWorld({ day: 200 });
    expect(tickReconquest(world).world.rng).not.toEqual(world.rng);
  });
});

describe("capturePort stamps the clock the crown counts from", () => {
  it("records the day a town changes hands", () => {
    const world = makeWorld({ day: 300, ports: { [FORT]: makePort(FORT) } });
    const { world: next } = capturePort(world, FORT, "brethren");
    expect(next.ports[FORT].capturedDay).toBe(300);
    expect(next.ports[FORT].garrison).toBe(0);
  });

  it("starts no clock for a town that was only sacked", () => {
    const world = makeWorld({ day: 300, ports: { [FORT]: makePort(FORT) } });
    const { world: next } = capturePort(world, FORT, "plunder");
    expect(next.ports[FORT].factionId as string).toBe("spain");
    expect(next.ports[FORT].capturedDay).toBeUndefined();
    expect(reliefChance(next, FORT)).toBe(0);
  });

  it("clears the cooldown of a town taken back off its new owner", () => {
    const world = makeWorld({
      day: 300,
      ports: { [FORT]: takenPort(FORT, { nextReliefDay: 400 }) },
    });
    const { world: next } = capturePort(world, FORT, "sponsor", "england");
    expect(next.ports[FORT].factionId as string).toBe("england");
    expect(next.ports[FORT].capturedDay).toBe(300);
    expect(next.ports[FORT].nextReliefDay).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// v0.16.0 — a landing the player can fight in person, and a map crowns move
// ---------------------------------------------------------------------------

describe("whose town it is", () => {
  it("counts a town the player kept for the brethren as his", () => {
    expect(playerHolds(makeWorld(), FORT)).toBe(true);
  });

  it("does not count a town that never changed hands", () => {
    const world = makeWorld({ ports: { [OUTPOST]: makePort(OUTPOST) } });
    expect(playerHolds(world, OUTPOST)).toBe(false);
  });

  it("does not count a town handed to a sponsor: that is their colony now", () => {
    const world = makeWorld({
      ports: { [FORT]: makePort(FORT, { factionId: factionId("england"), capturedDay: 100 }) },
    });
    expect(playerHolds(world, FORT)).toBe(false);
    // And a crown pays for its garrison, so it recovers like any other colony.
    expect(heldDefenseCeiling(world, FORT)).toBe(getPortBaseline(FORT).defense);
  });
});

describe("who counts the player a friend", () => {
  it("counts a crown that gave him a letter of marque", () => {
    const world = makeWorld();
    const commissioned = { ...world, worldFlags: { letter_of_marque_england: true } };
    expect(alliedWith(commissioned, "england")).toBe(true);
    expect(alliedWith(world, "england")).toBe(false);
  });

  it("counts a crown he has earned his way up to", () => {
    const world = makeWorld();
    const friendly = { ...world, player: { ...world.player, reputation: { france: 40 } } };
    const allied = { ...world, player: { ...world.player, reputation: { france: 75 } } };
    expect(alliedWith(friendly, "france")).toBe(false);
    expect(alliedWith(allied, "france")).toBe(true);
  });

  it("never counts the brotherhood, which has no colonies to defend", () => {
    const world = makeWorld();
    const loved = { ...world, player: { ...world.player, reputation: { pirates: 100 } } };
    expect(alliedWith(loved, "pirates")).toBe(false);
  });
});

describe("which landings the player gets to fight", () => {
  const arriving = inFlight(FORT, { endDay: 130 });

  it("offers his own town when he is standing off it", () => {
    const world = makeWorld({ day: 130, pos: { ...CITIES[FORT].pos } });
    const pending = pendingDefenseFor(world, arriving);
    expect(pending).toBeDefined();
    expect(pending!.portKey).toBe(FORT);
    expect(pending!.allied).toBe(false);
    expect(pending!.holder).toBe("pirates");
    expect(pending!.expedition.soldiers).toBe(120);
  });

  it("offers nothing when he is over the horizon", () => {
    const world = makeWorld({ day: 130, pos: { x: 0, y: 0 } });
    expect(pendingDefenseFor(world, arriving)).toBeUndefined();
  });

  it("offers an ally's colony he is commissioned by, and says so", () => {
    const owner = CITIES[OUTPOST].factionId as string;
    const world = makeWorld({
      day: 130,
      pos: { ...CITIES[OUTPOST].pos },
      ports: { [OUTPOST]: makePort(OUTPOST) },
    });
    const commissioned = {
      ...world,
      worldFlags: { ["letter_of_marque_" + owner]: true },
    };
    const event = inFlight(OUTPOST, { endDay: 130, factions: ["spain", owner] });
    const pending = pendingDefenseFor(commissioned, event);
    expect(pending).toBeDefined();
    expect(pending!.allied).toBe(true);
    expect(pending!.claimant).toBe("spain");
  });

  it("offers nothing for a colony he has no standing with, however close he is", () => {
    const owner = CITIES[OUTPOST].factionId as string;
    const world = makeWorld({
      day: 130,
      pos: { ...CITIES[OUTPOST].pos },
      ports: { [OUTPOST]: makePort(OUTPOST) },
    });
    const event = inFlight(OUTPOST, { endDay: 130, factions: ["spain", owner] });
    expect(pendingDefenseFor(world, event)).toBeUndefined();
  });
});

describe("standing in a defence", () => {
  it("only counts the player into a town that is actually his", () => {
    const own = makeWorld({ day: 130, pos: { ...CITIES[FORT].pos } });
    expect(playerDefends(own, FORT)).toBe(true);

    const someoneElses = makeWorld({
      day: 130,
      pos: { ...CITIES[OUTPOST].pos },
      ports: { [OUTPOST]: makePort(OUTPOST) },
    });
    expect(playerDefends(someoneElses, OUTPOST)).toBe(false);
  });
});

describe("tickReconquest hands a playable landing back unresolved", () => {
  it("names the town instead of settling it when the player is there", () => {
    const world = makeWorld({
      day: 130,
      pos: { ...CITIES[FORT].pos },
      worldEvents: [inFlight(FORT, { endDay: 130 })],
    });
    const tick = tickReconquest(world);
    expect(tick.playable).toBeDefined();
    expect(tick.playable!.portKey).toBe(FORT);
    // Nothing written: no toast, no flag change, no line in the log.
    expect(tick.ownersChanged).toEqual([]);
    expect(tick.world.ports[FORT].factionId as string).toBe("pirates");
    expect(tick.world.eventLog).toEqual(world.eventLog);
  });

  it("drops the event all the same, so it cannot be expired away tomorrow", () => {
    const world = makeWorld({
      day: 130,
      pos: { ...CITIES[FORT].pos },
      worldEvents: [inFlight(FORT, { endDay: 130 })],
    });
    expect(activeExpeditionFor(tickReconquest(world).world, FORT)).toBeUndefined();
  });

  it("settles it as before when the player is nowhere near", () => {
    const world = makeWorld({
      day: 130,
      pos: { x: 0, y: 0 },
      worldEvents: [inFlight(FORT, { endDay: 130 })],
    });
    const tick = tickReconquest(world);
    expect(tick.playable).toBeUndefined();
    expect(tick.events.length).toBeGreaterThan(0);
  });

  it("makes only one landing a day playable and settles the rest", () => {
    const second = "porto_bello";
    const world = makeWorld({
      day: 130,
      pos: { ...CITIES[FORT].pos },
      ports: { [FORT]: takenPort(FORT), [second]: takenPort(second) },
      worldEvents: [inFlight(FORT, { endDay: 130 }), inFlight(second, { endDay: 130 })],
    });
    const tick = tickReconquest(world);
    expect(tick.playable!.portKey).toBe(FORT);
    expect(activeExpeditionFor(tick.world, second)).toBeUndefined();
    expect(tick.events.length).toBeGreaterThan(0);
  });
});

describe("settleRelief is the one place a landing is written down", () => {
  const expedition = { soldiers: 120, guns: 30, sailDays: 10 };

  it("keeps the flag and starts the cooling-off period when the town holds", () => {
    const world = makeWorld({ day: 200 });
    const out = settleRelief(world, FORT, "spain", expedition, {
      held: true, playerFought: false, garrisonAfter: 40, partyLost: 0,
    });
    expect(out.world.ports[FORT].factionId as string).toBe("pirates");
    expect(out.world.ports[FORT].garrison).toBe(40);
    expect(out.world.ports[FORT].nextReliefDay).toBe(200 + RELIEF_COOLDOWN_DAYS);
    expect(out.gold).toBe(0);
  });

  it("pays for the transports only when the player was in it", () => {
    const world = makeWorld({ day: 200 });
    const out = settleRelief(world, FORT, "spain", expedition, {
      held: true, playerFought: true, garrisonAfter: 0, partyLost: 0,
    });
    expect(out.gold).toBe(expedition.soldiers * WRECK_GOLD_PER_SOLDIER);
    expect(out.world.eventLog.some(e => e.key === "reconquest.log_held_present")).toBe(true);
  });

  it("clears the clock when the town goes back under the flag it was founded with", () => {
    const world = makeWorld({ day: 200 });
    const out = settleRelief(world, FORT, "spain", expedition, {
      held: false, playerFought: false, garrisonAfter: 0, partyLost: 0,
    });
    expect(out.world.ports[FORT].factionId as string).toBe("spain");
    expect(out.world.ports[FORT].capturedDay).toBeUndefined();
  });

  it("starts a new one when a different crown takes it", () => {
    const world = makeWorld({ day: 200 });
    const out = settleRelief(world, FORT, "france", expedition, {
      held: false, playerFought: false, garrisonAfter: 0, partyLost: 0,
    });
    expect(out.world.ports[FORT].factionId as string).toBe("france");
    expect(out.world.ports[FORT].capturedDay).toBe(200);
  });

  it("takes the losses out of the ships when a fought battle hands them over", () => {
    const world = makeWorld({ day: 200 });
    const before = world.entities.player_ship.ship!;
    const initial = attackForceFor(world);
    const out = settleRelief(world, FORT, "spain", expedition, {
      held: true, playerFought: true, garrisonAfter: 0, partyLost: 0,
      force: { initial, final: { ...initial, crew: initial.crew - 30, hullHp: initial.hullHp - 20 } },
    });
    const after = out.world.entities.player_ship.ship!;
    expect(after.crew.current).toBe(before.crew.current - 30);
    expect(after.hullHp).toBeLessThan(before.hullHp);
  });
});
