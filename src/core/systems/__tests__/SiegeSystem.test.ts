import { describe, it, expect } from "vitest";
import {
  portFaction,
  portChangedHands,
  garrisonFor,
  attackForceFor,
  createSiege,
  bombardAccuracy,
  fortAccuracy,
  bombardRound,
  landingParty,
  assaultStrengths,
  assaultOdds,
  resolveAssault,
  capturePort,
  repulsedAtPort,
  availableSponsors,
  writeBackForce,
  lootValue,
  LANDING_FRACTION,
  SHIP_KEEPERS,
  DEFENDER_ROUT,
  MAX_WAVES,
  FLEET_BREAK_HULL,
  FLEET_CREW_FRACTION,
  type SiegeState,
} from "../SiegeSystem.ts";
import type { WorldState, PortRuntimeState } from "../../model/WorldState.ts";
import { entityId, shipClassId, factionId, portId } from "../../model/ids.ts";
import { CITIES } from "../../data/cities.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";

// ===========================================================================
// SiegeSystem — bombardment, the landing, and who ends up holding the town
// ===========================================================================

/**
 * `cartagena` is a Spanish fort, large and wealthy; `tortuga` is a small
 * French outpost. Between them they cover both ends of every curve here.
 */
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

function makeWorld(over: {
  shipClass?: string;
  hullHp?: number;
  crew?: number;
  morale?: number;
  gunnery?: number;
  fencing?: number;
  training?: number;
  gold?: number;
  startAge?: number;
  day?: number;
  fleet?: { classId: string; hullHp: number; hullMax: number; cannons: number }[];
  ports?: Record<string, PortRuntimeState>;
  flags?: Record<string, boolean>;
  ranks?: Record<string, number>;
  reputation?: Record<string, number>;
} = {}): WorldState {
  const {
    shipClass = "frigate", morale = 0.8, gunnery = 5, fencing = 5, training = 0.5,
    gold = 1000, startAge = 20, day = 100, fleet = [], flags = {}, ranks = {}, reputation = {},
  } = over;
  const cls = SHIP_CLASSES[shipClass];
  const hullHp = over.hullHp ?? cls.hullMax;
  const crew = over.crew ?? cls.crewMax;

  return {
    version: 11,
    time: { day, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 7, state: 7 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold,
      notoriety: 10,
      reputation,
      ranks,
      location: { type: "sea", pos: { x: 0, y: 0 } },
      questLog: [],
      fleet: fleet.map(f => ({
        classId: f.classId,
        hullHp: f.hullHp,
        hullMax: f.hullMax,
        sailsHp: 50,
        sailsMax: 50,
        cannons: f.cannons,
      })),
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
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
          classId: shipClassId(shipClass),
          factionId: factionId("england"),
          hullHp, hullMax: cls.hullMax,
          sailsHp: cls.sailsMax, sailsMax: cls.sailsMax,
          cannons: cls.cannons,
          cargoCap: cls.cargoCap,
          crew: { current: crew, max: cls.crewMax, morale },
          cargo: {},
        },
      },
    },
    ports: over.ports ?? { [FORT]: makePort(FORT), [OUTPOST]: makePort(OUTPOST) },
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: flags,
    eventLog: [],
    worldEvents: [],
    knownEventIds: [],
    playerName: "Captain",
    eraId: "pirates_sunset",
    startYear: 1690,
    gameSpeed: 1.2,
    captain: {
      nationality: "england",
      skills: { fencing, gunnery, navigation: 5, medicine: 5, charm: 5 },
      startAge,
      training,
    },
  } as WorldState;
}

/** Bombard until the guns are silent or the fleet breaks. Returns the last state. */
function bombardUntilSilent(state: SiegeState, maxRounds = 60): { state: SiegeState; rounds: number } {
  let s = state;
  let rng = { seed: 3, state: 3 };
  for (let i = 1; i <= maxRounds; i++) {
    const r = bombardRound(s, rng);
    s = r.state;
    rng = r.rng;
    if (s.fort.guns <= 0 || r.fleetBroken) return { state: s, rounds: i };
  }
  return { state: s, rounds: maxRounds };
}

// ── Ownership ─────────────────────────────────────────────

describe("portFaction", () => {
  it("reads the runtime owner, not the 1680 map", () => {
    const w = makeWorld({ ports: { [FORT]: makePort(FORT, { factionId: factionId("pirates") }) } });
    expect(portFaction(w, FORT) as string).toBe("pirates");
    expect(CITIES[FORT].factionId as string).toBe("spain");
  });

  it("falls back to the static definition when the port has no runtime state", () => {
    const w = makeWorld({ ports: {} });
    expect(portFaction(w, FORT) as string).toBe("spain");
  });

  it("never returns undefined for a port nobody has heard of", () => {
    const w = makeWorld({ ports: {} });
    expect(typeof (portFaction(w, "atlantis") as string)).toBe("string");
  });

  it("portChangedHands is false at the start of a game", () => {
    expect(portChangedHands(makeWorld(), FORT)).toBe(false);
  });

  it("portChangedHands is true once a flag comes down", () => {
    const w = makeWorld({ ports: { [FORT]: makePort(FORT, { factionId: factionId("england") }) } });
    expect(portChangedHands(w, FORT)).toBe(true);
  });
});

// ── The garrison ──────────────────────────────────────────

describe("garrisonFor", () => {
  it("a fort mounts far more guns than an outpost", () => {
    const w = makeWorld();
    expect(garrisonFor(w, FORT).guns).toBeGreaterThan(garrisonFor(w, OUTPOST).guns * 3);
  });

  it("an outpost has no curtain wall worth the name", () => {
    const w = makeWorld();
    expect(garrisonFor(w, OUTPOST).walls).toBeLessThanOrEqual(35);
  });

  it("walls track the port's own defence value", () => {
    const strong = makeWorld({ ports: { [FORT]: makePort(FORT, { defense: 100 }) } });
    const weak = makeWorld({ ports: { [FORT]: makePort(FORT, { defense: 20 }) } });
    expect(garrisonFor(strong, FORT).walls).toBeGreaterThan(garrisonFor(weak, FORT).walls);
  });

  it("a raided port with no defence left still keeps a token guard", () => {
    const w = makeWorld({ ports: { [FORT]: makePort(FORT, { defense: 0 }) } });
    const g = garrisonFor(w, FORT);
    expect(g.guns).toBeGreaterThanOrEqual(0);
    expect(g.soldiers).toBeGreaterThan(0);
  });

  it("a town emptied by plague is measurably easier to storm", () => {
    const healthy = makeWorld({ ports: { [FORT]: makePort(FORT) } });
    const base = getPortBaseline(FORT);
    const stricken = makeWorld({ ports: { [FORT]: makePort(FORT, { population: Math.round(base.population * 0.5) }) } });
    expect(garrisonFor(stricken, FORT).soldiers).toBeLessThan(garrisonFor(healthy, FORT).soldiers);
  });

  it("population scaling is clamped so a boom town is not invincible", () => {
    const base = getPortBaseline(FORT);
    const boom = makeWorld({ ports: { [FORT]: makePort(FORT, { population: base.population * 10 }) } });
    const normal = makeWorld();
    expect(garrisonFor(boom, FORT).soldiers).toBeLessThanOrEqual(garrisonFor(normal, FORT).soldiers * 1.31);
  });

  it("wallsMax and soldiersMax are never zero, so ratios are safe to divide by", () => {
    const w = makeWorld({ ports: { [OUTPOST]: makePort(OUTPOST, { defense: 0, population: 0 }) } });
    const g = garrisonFor(w, OUTPOST);
    expect(g.wallsMax).toBeGreaterThan(0);
    expect(g.soldiersMax).toBeGreaterThan(0);
  });

  it("an unknown port has nothing to defend it", () => {
    expect(garrisonFor(makeWorld(), "atlantis").soldiers).toBe(0);
  });
});

// ── The attacking force ───────────────────────────────────

describe("attackForceFor", () => {
  it("a lone frigate brings its own broadside and no more", () => {
    const f = attackForceFor(makeWorld({ shipClass: "frigate" }));
    expect(f.cannons).toBe(SHIP_CLASSES.frigate.cannons);
    expect(f.crew).toBe(SHIP_CLASSES.frigate.crewMax);
  });

  it("consorts add their guns to every round", () => {
    const solo = attackForceFor(makeWorld());
    const withConsort = attackForceFor(makeWorld({
      fleet: [{ classId: "sloop", hullHp: 60, hullMax: 60, cannons: 8 }],
    }));
    expect(withConsort.cannons).toBe(solo.cannons + 8);
  });

  it("consorts land most of their berths, not all of them", () => {
    const f = attackForceFor(makeWorld({
      fleet: [{ classId: "galleon", hullHp: 180, hullMax: 180, cannons: 36 }],
    }));
    const expected = SHIP_CLASSES.frigate.crewMax
      + Math.round(SHIP_CLASSES.galleon.crewMax * FLEET_CREW_FRACTION);
    expect(f.crew).toBe(expected);
  });

  it("hull is pooled across the fleet, so a consort is a second life", () => {
    const f = attackForceFor(makeWorld({
      fleet: [{ classId: "sloop", hullHp: 60, hullMax: 60, cannons: 8 }],
    }));
    expect(f.hullMax).toBe(SHIP_CLASSES.frigate.hullMax + 60);
  });

  it("gunnery is the aged value, not the sheet value", () => {
    const young = attackForceFor(makeWorld({ gunnery: 10, startAge: 20, day: 1 }));
    const old = attackForceFor(makeWorld({ gunnery: 10, startAge: 20, day: 365 * 40 }));
    expect(old.gunnery).toBeLessThan(young.gunnery);
  });
});

// ── Bombardment ───────────────────────────────────────────

describe("bombardAccuracy", () => {
  it("a green gunner still lands a third of his shot", () => {
    expect(bombardAccuracy(0, 0)).toBeCloseTo(0.35, 5);
  });

  it("a master gunner with a drilled crew tops out at 0.85", () => {
    expect(bombardAccuracy(10, 1)).toBeCloseTo(0.85, 5);
  });

  it("rises with both skill and drill", () => {
    expect(bombardAccuracy(8, 0.5)).toBeGreaterThan(bombardAccuracy(4, 0.5));
    expect(bombardAccuracy(5, 0.9)).toBeGreaterThan(bombardAccuracy(5, 0.1));
  });

  it("clamps a nonsense skill instead of extrapolating", () => {
    expect(bombardAccuracy(99, 9)).toBeCloseTo(0.85, 5);
  });
});

describe("fortAccuracy", () => {
  it("intact walls make the best gun platform in the bay", () => {
    expect(fortAccuracy(100, 100)).toBeCloseTo(0.55, 5);
  });

  it("rubble still shoots, just worse", () => {
    expect(fortAccuracy(0, 100)).toBeCloseTo(0.30, 5);
  });

  it("falls monotonically as the walls come down", () => {
    let previous = Infinity;
    for (let walls = 100; walls >= 0; walls -= 10) {
      const value = fortAccuracy(walls, 100);
      expect(value).toBeLessThanOrEqual(previous);
      previous = value;
    }
  });
});

describe("bombardRound", () => {
  it("costs the fort guns and walls", () => {
    const s = createSiege(makeWorld(), FORT);
    const r = bombardRound(s, { seed: 1, state: 1 });
    expect(r.state.fort.guns).toBeLessThan(s.fort.guns);
    expect(r.state.fort.walls).toBeLessThan(s.fort.walls);
  });

  it("costs the fleet hull and men — the fort fires the same round", () => {
    const s = createSiege(makeWorld(), FORT);
    const r = bombardRound(s, { seed: 1, state: 1 });
    expect(r.hullLost).toBeGreaterThan(0);
    expect(r.state.force.hullHp).toBeLessThan(s.force.hullHp);
  });

  it("is deterministic for the same seed", () => {
    const s = createSiege(makeWorld(), FORT);
    const a = bombardRound(s, { seed: 5, state: 5 });
    const b = bombardRound(s, { seed: 5, state: 5 });
    expect(a.state.fort.guns).toBe(b.state.fort.guns);
    expect(a.hullLost).toBe(b.hullLost);
  });

  it("advances the round counter", () => {
    const s = createSiege(makeWorld(), FORT);
    expect(bombardRound(s, { seed: 1, state: 1 }).state.round).toBe(1);
  });

  it("never drives guns or walls below zero", () => {
    const s = createSiege(makeWorld({ ports: { [FORT]: makePort(FORT, { defense: 5 }) } }), FORT);
    const settled = bombardUntilSilent(s).state;
    expect(settled.fort.guns).toBeGreaterThanOrEqual(0);
    expect(settled.fort.walls).toBeGreaterThanOrEqual(0);
  });

  it("a silenced fort stops hurting the fleet", () => {
    const s = createSiege(makeWorld({ ports: { [OUTPOST]: makePort(OUTPOST, { defense: 4 }) } }), OUTPOST);
    const silent = bombardUntilSilent(s).state;
    if (silent.fort.guns === 0) {
      const after = bombardRound(silent, { seed: 9, state: 9 });
      expect(after.hullLost).toBe(0);
      expect(after.crewLost).toBe(0);
    }
  });

  it("a frigate can silence a first-rate fort, but it takes a while", () => {
    const { state, rounds } = bombardUntilSilent(createSiege(makeWorld({ shipClass: "frigate" }), FORT));
    expect(state.fort.guns).toBe(0);
    expect(rounds).toBeGreaterThan(4);
  });

  it("a sloop is driven off before the fort's guns are out", () => {
    const s = createSiege(makeWorld({ shipClass: "sloop" }), FORT);
    const { state } = bombardUntilSilent(s);
    expect(state.phase).toBe("over");
    expect(state.fort.guns).toBeGreaterThan(0);
  });

  it("a fleet takes the same fort where one hull could not", () => {
    const solo = bombardUntilSilent(createSiege(makeWorld({ shipClass: "sloop" }), FORT)).state;
    const squadron = bombardUntilSilent(createSiege(makeWorld({
      shipClass: "sloop",
      fleet: [
        { classId: "frigate", hullHp: 120, hullMax: 120, cannons: 28 },
        { classId: "frigate", hullHp: 120, hullMax: 120, cannons: 28 },
      ],
    }), FORT)).state;
    expect(solo.fort.guns).toBeGreaterThan(squadron.fort.guns);
  });

  it("breaking off is flagged the moment the hull runs out", () => {
    const s = createSiege(makeWorld({ shipClass: "pinnace" }), FORT);
    let state = s;
    let rng = { seed: 2, state: 2 };
    let broken = false;
    for (let i = 0; i < 40 && !broken; i++) {
      const r = bombardRound(state, rng);
      state = r.state;
      rng = r.rng;
      broken = r.fleetBroken;
    }
    expect(broken).toBe(true);
    expect(state.force.hullHp).toBeLessThanOrEqual(state.force.hullMax * FLEET_BREAK_HULL);
  });
});

// ── The landing ───────────────────────────────────────────

describe("landingParty", () => {
  it("leaves hands aboard to keep the ships off the rocks", () => {
    const force = attackForceFor(makeWorld({ shipClass: "frigate" }));
    expect(landingParty(force)).toBeLessThanOrEqual(force.crew - SHIP_KEEPERS);
  });

  it("lands the stated fraction when there is crew to spare", () => {
    const force = attackForceFor(makeWorld({ shipClass: "galleon" }));
    expect(landingParty(force)).toBe(Math.round(force.crew * LANDING_FRACTION));
  });

  it("never lands a negative number of men", () => {
    const force = { ...attackForceFor(makeWorld()), crew: 2 };
    expect(landingParty(force)).toBe(0);
  });
});

describe("assaultStrengths", () => {
  it("knocking the walls down is worth most of the defence", () => {
    const world = makeWorld();
    const intact = createSiege(world, FORT);
    const breached: SiegeState = { ...intact, fort: { ...intact.fort, walls: 0 } };
    expect(assaultStrengths(breached, 70).defence)
      .toBeLessThan(assaultStrengths(intact, 70).defence * 0.75);
  });

  it("surviving shore guns sweep the beach", () => {
    const world = makeWorld();
    const s = createSiege(world, FORT);
    const silenced: SiegeState = { ...s, fort: { ...s.fort, guns: 0 } };
    expect(assaultStrengths(silenced, 70).defence).toBeLessThan(assaultStrengths(s, 70).defence);
  });

  it("a swordsman captain is worth real men on the sand", () => {
    const poor = createSiege(makeWorld({ fencing: 1 }), FORT);
    const good = createSiege(makeWorld({ fencing: 10 }), FORT);
    expect(assaultStrengths(good, 70).attack).toBeGreaterThan(assaultStrengths(poor, 70).attack);
  });

  it("a sullen crew storms nothing", () => {
    const happy = createSiege(makeWorld({ morale: 1 }), FORT);
    const sullen = createSiege(makeWorld({ morale: 0.1 }), FORT);
    expect(assaultStrengths(sullen, 70).attack).toBeLessThan(assaultStrengths(happy, 70).attack);
  });
});

describe("assaultOdds", () => {
  it("landing against an intact first-rate fort is a losing bet", () => {
    expect(assaultOdds(createSiege(makeWorld(), FORT), 70)).toBeLessThan(0.5);
  });

  it("the same landing after a proper bombardment is a winning one", () => {
    const s = createSiege(makeWorld(), FORT);
    const softened: SiegeState = { ...s, fort: { ...s.fort, walls: 0, guns: 0 } };
    expect(assaultOdds(softened, 70)).toBeGreaterThan(0.5);
  });

  it("stays inside 0..1 even for a hopeless assault", () => {
    const s = createSiege(makeWorld({ shipClass: "pinnace" }), FORT);
    const odds = assaultOdds(s, 100);
    expect(odds).toBeGreaterThanOrEqual(0);
    expect(odds).toBeLessThanOrEqual(1);
  });

  it("an outpost falls to a frigate's crew without softening", () => {
    expect(assaultOdds(createSiege(makeWorld(), OUTPOST), 10)).toBeGreaterThan(0.5);
  });
});

describe("resolveAssault", () => {
  it("a breached fort falls", () => {
    const s = createSiege(makeWorld(), FORT);
    const softened: SiegeState = { ...s, fort: { ...s.fort, walls: 0, guns: 0 } };
    expect(resolveAssault(softened, 70, { seed: 1, state: 1 }).captured).toBe(true);
  });

  it("an intact fort throws the landing back into the sea", () => {
    const s = createSiege(makeWorld({ shipClass: "sloop" }), FORT);
    expect(resolveAssault(s, 70, { seed: 1, state: 1 }).captured).toBe(false);
  });

  it("is deterministic for the same seed", () => {
    const s = createSiege(makeWorld(), OUTPOST);
    const a = resolveAssault(s, 10, { seed: 4, state: 4 });
    const b = resolveAssault(s, 10, { seed: 4, state: 4 });
    expect(a.attackerLosses).toBe(b.attackerLosses);
    expect(a.captured).toBe(b.captured);
  });

  it("never runs longer than the wave cap", () => {
    const s = createSiege(makeWorld(), FORT);
    expect(resolveAssault(s, 70, { seed: 2, state: 2 }).waves.length).toBeLessThanOrEqual(MAX_WAVES);
  });

  it("costs the winner men too — a town is never taken for free", () => {
    const s = createSiege(makeWorld(), OUTPOST);
    const r = resolveAssault(s, 10, { seed: 6, state: 6 });
    expect(r.captured).toBe(true);
    expect(r.attackerLosses).toBeGreaterThan(0);
  });

  it("losses never exceed the men who landed", () => {
    const s = createSiege(makeWorld({ shipClass: "sloop" }), FORT);
    const r = resolveAssault(s, 70, { seed: 8, state: 8 });
    expect(r.attackerLosses).toBeLessThanOrEqual(landingParty(s.force));
    expect(r.attackersLeft).toBeGreaterThanOrEqual(0);
  });

  it("a captured town has lost at least the rout fraction of its garrison", () => {
    const s = createSiege(makeWorld(), OUTPOST);
    const r = resolveAssault(s, 10, { seed: 11, state: 11 });
    expect(r.defenderLosses).toBeGreaterThanOrEqual(Math.floor(s.fort.soldiers * (1 - DEFENDER_ROUT)) - 1);
  });

  it("advances the rng so a second assault is not a replay of the first", () => {
    const s = createSiege(makeWorld(), OUTPOST);
    const r = resolveAssault(s, 10, { seed: 3, state: 3 });
    expect(r.rng.state).not.toBe(3);
  });
});

// ── Writing the damage back ───────────────────────────────

describe("writeBackForce", () => {
  it("a lone ship takes the whole bill", () => {
    const w = makeWorld();
    const before = attackForceFor(w);
    const after = { ...before, hullHp: before.hullHp - 40, crew: before.crew - 12 };
    const out = writeBackForce(w, before, after);
    expect(out.entities.player_ship.ship!.hullHp).toBe(SHIP_CLASSES.frigate.hullMax - 40);
    expect(out.entities.player_ship.ship!.crew.current).toBe(SHIP_CLASSES.frigate.crewMax - 12);
  });

  it("a squadron splits the hull damage by how much hull each brought", () => {
    const w = makeWorld({ fleet: [{ classId: "frigate", hullHp: 120, hullMax: 120, cannons: 28 }] });
    const before = attackForceFor(w);
    const after = { ...before, hullHp: before.hullHp - 40, crew: before.crew };
    const out = writeBackForce(w, before, after);
    // Two identical hulls: 20 each.
    expect(out.entities.player_ship.ship!.hullHp).toBeCloseTo(100, 1);
    expect(out.player.fleet[0].hullHp).toBeCloseTo(100, 1);
  });

  it("assault casualties on top of the bombardment still land", () => {
    const w = makeWorld();
    const before = attackForceFor(w);
    const out = writeBackForce(w, before, before, 20);
    expect(out.entities.player_ship.ship!.crew.current).toBe(SHIP_CLASSES.frigate.crewMax - 20);
  });

  it("never drives a hull or a crew below zero", () => {
    const w = makeWorld();
    const before = attackForceFor(w);
    const after = { ...before, hullHp: 0, crew: 0 };
    const out = writeBackForce(w, before, after, 9999);
    expect(out.entities.player_ship.ship!.hullHp).toBe(0);
    expect(out.entities.player_ship.ship!.crew.current).toBe(0);
  });

  it("does not mutate the world it was handed", () => {
    const w = makeWorld();
    const before = attackForceFor(w);
    writeBackForce(w, before, { ...before, hullHp: 0, crew: 0 });
    expect(w.entities.player_ship.ship!.hullHp).toBe(SHIP_CLASSES.frigate.hullMax);
  });
});

// ── Spoils ────────────────────────────────────────────────

describe("lootValue", () => {
  it("a wealthy capital is worth far more than a poor outpost", () => {
    const w = makeWorld();
    expect(lootValue(w.ports[FORT], FORT)).toBeGreaterThan(lootValue(w.ports[OUTPOST], OUTPOST));
  });

  it("a town already stripped by an earlier raid pays less", () => {
    const rich = makePort(FORT);
    const poor = makePort(FORT, { wealth: 50, population: 400 });
    expect(lootValue(poor, FORT)).toBeLessThan(lootValue(rich, FORT));
  });

  it("falls back to the baseline for a port with no runtime state", () => {
    expect(lootValue(undefined, FORT)).toBeGreaterThan(0);
  });
});

describe("capturePort", () => {
  it("sacking leaves the old flag flying over the ruin", () => {
    const w = makeWorld();
    const r = capturePort(w, FORT, "plunder");
    expect(r.newOwner as string).toBe("spain");
    expect(portFaction(r.world, FORT) as string).toBe("spain");
  });

  it("sacking pays the most", () => {
    const w = makeWorld();
    expect(capturePort(w, FORT, "plunder").gold)
      .toBeGreaterThan(capturePort(w, FORT, "sponsor", "england").gold);
  });

  it("handing the town to a sponsor changes the flag and buys a rank", () => {
    const w = makeWorld({ flags: { letter_of_marque_england: true } });
    const r = capturePort(w, FORT, "sponsor", "england");
    expect(portFaction(r.world, FORT) as string).toBe("england");
    expect(r.world.player.ranks.england).toBe(1);
  });

  it("keeping it for the brethren raises the black flag", () => {
    const r = capturePort(makeWorld(), FORT, "brethren");
    expect(portFaction(r.world, FORT) as string).toBe("pirates");
    expect(r.world.player.reputation.pirates).toBeGreaterThan(0);
  });

  it("the crown that lost the town takes it badly whatever you do with it", () => {
    for (const choice of ["plunder", "sponsor", "brethren"] as const) {
      const r = capturePort(makeWorld(), FORT, choice, "england");
      expect(r.world.player.reputation.spain).toBeLessThan(0);
    }
  });

  it("taking cities for a rival crown makes the others uneasy", () => {
    const r = capturePort(makeWorld(), FORT, "sponsor", "england");
    expect(r.world.player.reputation.france).toBeLessThan(0);
    expect(r.world.player.reputation.netherlands).toBeLessThan(0);
  });

  it("the gold reaches the hold", () => {
    const w = makeWorld({ gold: 100 });
    const r = capturePort(w, FORT, "plunder");
    expect(r.world.player.gold).toBe(100 + r.gold);
  });

  it("the garrison is gutted", () => {
    const r = capturePort(makeWorld(), FORT, "plunder");
    expect(r.world.ports[FORT].defense).toBeLessThan(makeWorld().ports[FORT].defense * 0.2);
  });

  it("a sponsor inherits a town in better shape than a sacked one", () => {
    const sacked = capturePort(makeWorld(), FORT, "plunder").world;
    const handed = capturePort(makeWorld(), FORT, "sponsor", "england").world;
    expect(handed.ports[FORT].wealth).toBeGreaterThan(sacked.ports[FORT].wealth);
  });

  it("counts toward the career, once per town taken", () => {
    const first = capturePort(makeWorld(), FORT, "plunder").world;
    expect(first.player.citiesCaptured).toBe(1);
    expect(capturePort(first, OUTPOST, "plunder").world.player.citiesCaptured).toBe(2);
  });

  it("notoriety rises most when the town is kept by pirates", () => {
    const w = makeWorld();
    const brethren = capturePort(w, FORT, "brethren").world.player.notoriety;
    const sponsor = capturePort(w, FORT, "sponsor", "england").world.player.notoriety;
    expect(brethren).toBeGreaterThan(sponsor);
  });

  it("writes a line in the log", () => {
    const r = capturePort(makeWorld(), FORT, "plunder");
    expect(r.world.eventLog.some(e => e.key === "siege.log_captured")).toBe(true);
  });

  it("rank never runs past the top of the ladder", () => {
    let w = makeWorld({ ranks: { england: 5 } });
    w = capturePort(w, FORT, "sponsor", "england").world;
    expect(w.player.ranks.england).toBe(5);
  });

  it("does not mutate the world it was handed", () => {
    const w = makeWorld({ gold: 500 });
    capturePort(w, FORT, "plunder");
    expect(w.player.gold).toBe(500);
    expect(portFaction(w, FORT) as string).toBe("spain");
  });
});

describe("repulsedAtPort", () => {
  it("costs standing with the crown whose town you tried to burn", () => {
    const w = repulsedAtPort(makeWorld(), FORT);
    expect(w.player.reputation.spain).toBeLessThan(0);
  });

  it("costs less than actually taking the place", () => {
    const failed = repulsedAtPort(makeWorld(), FORT).player.reputation.spain;
    const taken = capturePort(makeWorld(), FORT, "plunder").world.player.reputation.spain;
    expect(failed).toBeGreaterThan(taken);
  });

  it("leaves the flag where it was", () => {
    expect(portFaction(repulsedAtPort(makeWorld(), FORT), FORT) as string).toBe("spain");
  });

  it("writes a line in the log", () => {
    expect(repulsedAtPort(makeWorld(), FORT).eventLog.some(e => e.key === "siege.log_repulsed")).toBe(true);
  });
});

describe("availableSponsors", () => {
  it("is empty without a commission", () => {
    expect(availableSponsors(makeWorld(), FORT)).toEqual([]);
  });

  it("lists crowns the player carries a letter from", () => {
    const w = makeWorld({ flags: { letter_of_marque_england: true, letter_of_marque_france: true } });
    expect(availableSponsors(w, FORT).sort()).toEqual(["england", "france"]);
  });

  it("never offers the town back to the crown that just lost it", () => {
    const w = makeWorld({ flags: { letter_of_marque_spain: true } });
    expect(availableSponsors(w, FORT)).toEqual([]);
  });
});
