import { describe, it, expect } from "vitest";
import {
  squadronFor,
  createDefense,
  expeditionOf,
  fleetGuns,
  defenseRound,
  landableMen,
  landMen,
  townStrength,
  defenseOdds,
  resolveDefenseAssault,
  splitTownLosses,
  applyDefenseOutcome,
  abandonDefense,
  transportExposure,
  ESCORT_COVER,
  SQUADRON_PATIENCE,
  LANDING_TRIGGER_WALLS,
  ROUTED_PARTY_SURVIVAL,
  DEFENCE_CLAIMANT_REP,
  ALLY_DEFENCE_REP,
  type DefenseState,
} from "../CityDefenseSystem.ts";
import { garrisonFor, attackForceFor, landingParty, MAX_WAVES } from "../SiegeSystem.ts";
import { RELIEF_COOLDOWN_DAYS, type PendingDefense } from "../ReconquestSystem.ts";
import type { WorldState, PortRuntimeState } from "../../model/WorldState.ts";
import { entityId, shipClassId, factionId, portId } from "../../model/ids.ts";
import { CITIES } from "../../data/cities.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";

// ===========================================================================
// CityDefenseSystem — the landing fought from behind the walls
// ===========================================================================

/** A Spanish fort the player has taken, and a French outpost he has not. */
const FORT = "cartagena";
const ALLY_PORT = "port_royal";

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

function takenPort(portKey: string, over: Partial<PortRuntimeState> = {}): PortRuntimeState {
  return makePort(portKey, {
    factionId: factionId("pirates"),
    capturedDay: 100,
    defense: Math.round(getPortBaseline(portKey).defense * 0.4),
    garrison: 0,
    ...over,
  });
}

function makeWorld(over: {
  shipClass?: string;
  crew?: number;
  morale?: number;
  gunnery?: number;
  training?: number;
  ports?: Record<string, PortRuntimeState>;
  reputation?: Record<string, number>;
  rngState?: number;
} = {}): WorldState {
  const {
    shipClass = "frigate", morale = 0.8, gunnery = 5, training = 0.5, rngState = 7,
  } = over;
  const cls = SHIP_CLASSES[shipClass];
  const crew = over.crew ?? cls.crewMax;
  const pos = { x: CITIES[FORT].pos.x, y: CITIES[FORT].pos.y };

  return {
    version: 12,
    time: { day: 200, hour: 12, minute: 0, tick: 0 },
    rng: { seed: rngState, state: rngState },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: 1000,
      notoriety: 10,
      reputation: over.reputation ?? {},
      ranks: {},
      location: { type: "sea", pos },
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
          crew: { current: crew, max: Math.max(cls.crewMax, crew), morale },
          cargo: {},
        },
      },
    },
    ports: over.ports ?? { [FORT]: takenPort(FORT, { garrison: 60 }) },
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
      skills: { fencing: 5, gunnery, navigation: 5, medicine: 5, charm: 5 },
      startAge: 20,
      training,
    },
  } as WorldState;
}

function pendingFor(portKey = FORT, over: Partial<PendingDefense> = {}): PendingDefense {
  return {
    portKey,
    claimant: CITIES[portKey].factionId as unknown as string,
    holder: "pirates",
    expedition: { soldiers: 160, guns: 40, sailDays: 8 },
    allied: false,
    ...over,
  };
}

// ---------------------------------------------------------------------------

describe("setting the battle up", () => {
  it("takes the squadron straight off the expedition that sailed", () => {
    const sq = squadronFor({ soldiers: 160, guns: 40, sailDays: 9 });
    expect(sq.soldiers).toBe(160);
    expect(sq.soldiersMax).toBe(160);
    expect(sq.guns).toBe(40);
    expect(sq.gunsMax).toBe(40);
  });

  it("never leaves a max at zero, so no bar divides by nothing", () => {
    const sq = squadronFor({ soldiers: 0, guns: 0, sailDays: 0 });
    expect(sq.soldiersMax).toBeGreaterThan(0);
    expect(sq.gunsMax).toBeGreaterThan(0);
  });

  it("puts the town's own garrison, walls and guns on the defending side", () => {
    const world = makeWorld();
    const state = createDefense(world, pendingFor());
    expect(state.fort).toEqual(garrisonFor(world, FORT));
    expect(state.stationed).toBe(60);
    expect(state.landed).toBe(0);
    expect(state.phase).toBe("bombard");
  });

  it("counts stationed men in the fort, so the garrison lever is worth something here too", () => {
    const bare = createDefense(makeWorld({ ports: { [FORT]: takenPort(FORT, { garrison: 0 }) } }), pendingFor());
    const manned = createDefense(makeWorld({ ports: { [FORT]: takenPort(FORT, { garrison: 90 }) } }), pendingFor());
    expect(manned.fort.soldiers).toBe(bare.fort.soldiers + 90);
  });

  it("counts a fleet with a hull as engaged and a wreck as not", () => {
    const healthy = createDefense(makeWorld(), pendingFor());
    expect(healthy.fleetEngaged).toBe(true);

    const world = makeWorld();
    const ship = world.entities.player_ship.ship!;
    const wrecked = {
      ...world,
      entities: {
        ...world.entities,
        player_ship: {
          ...world.entities.player_ship,
          ship: { ...ship, hullHp: ship.hullMax * 0.05 },
        },
      },
    } as WorldState;
    expect(createDefense(wrecked, pendingFor()).fleetEngaged).toBe(false);
  });

  it("hands the squadron back as an expedition for the settlement to read", () => {
    const state = createDefense(makeWorld(), pendingFor());
    expect(expeditionOf(state)).toEqual({ soldiers: 160, guns: 40, sailDays: 0 });
  });
});

describe("what the ships still bring", () => {
  it("counts every gun while the crew is aboard", () => {
    const state = createDefense(makeWorld(), pendingFor());
    expect(fleetGuns(state, state.force.crew)).toBe(state.force.cannons);
  });

  it("falls off in proportion to the hands taken off the decks", () => {
    const state = createDefense(makeWorld(), pendingFor());
    const half = { ...state, force: { ...state.force, crew: Math.round(state.force.crew / 2) } };
    expect(fleetGuns(half, state.force.crew)).toBeCloseTo(state.force.cannons / 2, 0);
  });

  it("is nothing at all once the fleet has stood out to sea", () => {
    const state = createDefense(makeWorld(), pendingFor());
    expect(fleetGuns({ ...state, fleetEngaged: false }, state.force.crew)).toBe(0);
  });
});

describe("the bombardment", () => {
  const world = makeWorld();
  const start = createDefense(world, pendingFor());

  it("drowns soldiers when the battery goes for the boats, and touches no gun", () => {
    const round = defenseRound(start, "transports", world.rng, start.force.crew);
    expect(round.soldiersDrowned).toBeGreaterThan(0);
    expect(round.squadronGunsSilenced).toBe(0);
    expect(round.state.squadron.soldiers).toBe(start.squadron.soldiers - round.soldiersDrowned);
    expect(round.state.squadron.guns).toBe(start.squadron.guns);
  });

  it("silences escort guns when it goes for the escorts, and drowns nobody", () => {
    const round = defenseRound(start, "escorts", world.rng, start.force.crew);
    expect(round.squadronGunsSilenced).toBeGreaterThan(0);
    expect(round.soldiersDrowned).toBe(0);
    expect(round.state.squadron.soldiers).toBe(start.squadron.soldiers);
  });

  it("costs the town wall and shore guns either way — there is no free round", () => {
    for (const target of ["transports", "escorts"] as const) {
      const round = defenseRound(start, target, world.rng, start.force.crew);
      expect(round.wallsBreached).toBeGreaterThan(0);
      expect(round.state.fort.walls).toBeLessThan(start.fort.walls);
    }
  });

  it("puts shot into the anchorage only while the ships are lying in it", () => {
    const engaged = defenseRound(start, "escorts", world.rng, start.force.crew);
    expect(engaged.hullLost).toBeGreaterThan(0);

    const alone = { ...start, fleetEngaged: false };
    const clear = defenseRound(alone, "escorts", world.rng, start.force.crew);
    expect(clear.hullLost).toBe(0);
    expect(clear.crewLost).toBe(0);
    // And all of that shot goes into the town instead.
    expect(clear.wallsBreached).toBeGreaterThan(engaged.wallsBreached);
  });

  it("is the same battle twice from the same seed", () => {
    const a = defenseRound(start, "transports", { seed: 5, state: 5 }, start.force.crew);
    const b = defenseRound(start, "transports", { seed: 5, state: 5 }, start.force.crew);
    expect(a.soldiersDrowned).toBe(b.soldiersDrowned);
    expect(a.wallsBreached).toBe(b.wallsBreached);
    expect(a.rng).toEqual(b.rng);
  });

  it("lands them once the walls are down past the trigger", () => {
    const breached: DefenseState = {
      ...start,
      fort: { ...start.fort, walls: start.fort.wallsMax * (LANDING_TRIGGER_WALLS + 0.02) },
    };
    const round = defenseRound(breached, "escorts", world.rng, start.force.crew);
    expect(round.landing).toBe(true);
    expect(round.state.phase).toBe("assault");
  });

  it("lands them anyway once the squadron has waited long enough", () => {
    const patient: DefenseState = { ...start, round: SQUADRON_PATIENCE - 1 };
    expect(defenseRound(patient, "escorts", world.rng, start.force.crew).landing).toBe(true);
  });

  it("lands them the moment the escort has nothing left to shoot with", () => {
    const quiet: DefenseState = { ...start, squadron: { ...start.squadron, guns: 1 } };
    const round = defenseRound(quiet, "escorts", world.rng, start.force.crew);
    expect(round.state.squadron.guns).toBe(0);
    expect(round.landing).toBe(true);
  });

  it("ends the whole thing without a beach when the last boat goes down", () => {
    const thin: DefenseState = { ...start, squadron: { ...start.squadron, soldiers: 1 } };
    const round = defenseRound(thin, "transports", world.rng, start.force.crew);
    expect(round.squadronBroken).toBe(true);
    expect(round.landing).toBe(false);
    expect(round.state.phase).toBe("over");
  });

  it("drives the fleet off once its hull is gone, and stops it taking fire after", () => {
    const battered: DefenseState = {
      ...start,
      force: { ...start.force, hullHp: start.force.hullMax * 0.21 },
    };
    const round = defenseRound(battered, "escorts", world.rng, start.force.crew);
    expect(round.fleetDriven).toBe(true);
    expect(round.state.fleetEngaged).toBe(false);
  });
});

describe("the escort screening the boats", () => {
  const world = makeWorld();
  const start = createDefense(world, pendingFor());

  it("soaks most of the shot aimed past it while its guns are up", () => {
    expect(transportExposure(start)).toBeCloseTo(1 - ESCORT_COVER, 5);
  });

  it("stops soaking anything once it is silenced", () => {
    expect(transportExposure({ ...start, squadron: { ...start.squadron, guns: 0 } })).toBe(1);
  });

  it("means the same battery drowns far more once the escort is down", () => {
    const covered = defenseRound(start, "transports", world.rng, start.force.crew);
    const open = defenseRound(
      { ...start, squadron: { ...start.squadron, guns: 0 } },
      "transports", world.rng, start.force.crew,
    );
    expect(open.soldiersDrowned).toBeGreaterThan(covered.soldiersDrowned * 2);
  });

  it("makes going for the boats first a real cost, not a free win", () => {
    // Four rounds straight at the transports against an intact escort must not
    // finish the expedition — otherwise the targeting choice is decoration.
    let state = createDefense(world, pendingFor(FORT, {
      expedition: { soldiers: 300, guns: 75, sailDays: 0 },
    }));
    let rng = world.rng;
    for (let i = 0; i < 4; i++) {
      const round = defenseRound(state, "transports", rng, start.force.crew);
      state = round.state;
      rng = round.rng;
    }
    expect(state.squadron.soldiers).toBeGreaterThan(0);
  });
});

describe("manning the walls", () => {
  const world = makeWorld();
  const start = createDefense(world, pendingFor());

  it("offers exactly the landing party a siege would put ashore", () => {
    expect(landableMen(start)).toBe(landingParty(start.force));
  });

  it("moves the men off the decks and onto the walls", () => {
    const after = landMen(start);
    const men = landableMen(start);
    expect(after.landed).toBe(men);
    expect(after.fort.soldiers).toBe(start.fort.soldiers + men);
    expect(after.force.crew).toBe(start.force.crew - men);
  });

  it("is one-shot: there is no second landing party", () => {
    const once = landMen(start);
    expect(landableMen(once)).toBe(0);
    expect(landMen(once)).toEqual(once);
  });

  it("offers nobody once the ships have gone", () => {
    expect(landableMen({ ...start, fleetEngaged: false })).toBe(0);
  });

  it("quiets the ships' guns by the same proportion it fills the walls", () => {
    const after = landMen(start);
    expect(fleetGuns(after, start.force.crew)).toBeLessThan(fleetGuns(start, start.force.crew));
  });
});

describe("what the town is worth when the boats ground", () => {
  const world = makeWorld();
  const start = createDefense(world, pendingFor());

  it("is worth far more behind an intact curtain than in a breach", () => {
    const whole = townStrength({ ...start, fort: { ...start.fort, walls: start.fort.wallsMax } });
    const breach = townStrength({ ...start, fort: { ...start.fort, walls: 0 } });
    expect(whole).toBeGreaterThan(breach * 1.5);
  });

  it("rises with the men on the walls", () => {
    const more = townStrength({ ...start, fort: { ...start.fort, soldiers: start.fort.soldiers * 2 } });
    expect(more).toBeGreaterThan(townStrength(start));
  });

  it("gives the town certain odds against an expedition with nobody left in it", () => {
    expect(defenseOdds({ ...start, squadron: { ...start.squadron, soldiers: 0 } })).toBe(1);
  });

  it("gives it none at all with nobody on the walls", () => {
    expect(defenseOdds({ ...start, fort: { ...start.fort, soldiers: 0 } })).toBe(0);
  });

  it("improves as the landing force is thinned", () => {
    const heavy = defenseOdds(start);
    const thinned = defenseOdds({ ...start, squadron: { ...start.squadron, soldiers: 40 } });
    expect(thinned).toBeGreaterThan(heavy);
  });
});

describe("the beach", () => {
  const world = makeWorld();

  it("holds against a landing it heavily outweighs", () => {
    const state = createDefense(
      makeWorld({ ports: { [FORT]: takenPort(FORT, { garrison: 400 }) } }),
      pendingFor(FORT, { expedition: { soldiers: 30, guns: 8, sailDays: 0 } }),
    );
    expect(resolveDefenseAssault(state, world.rng).held).toBe(true);
  });

  it("falls to one that heavily outweighs it", () => {
    const state = createDefense(
      makeWorld({ ports: { [FORT]: takenPort(FORT, { garrison: 0, defense: 2 }) } }),
      pendingFor(FORT, { expedition: { soldiers: 900, guns: 220, sailDays: 0 } }),
    );
    expect(resolveDefenseAssault(state, world.rng).held).toBe(false);
  });

  it("never runs more waves than a siege does", () => {
    const state = createDefense(world, pendingFor());
    expect(resolveDefenseAssault(state, world.rng).waves.length).toBeLessThanOrEqual(MAX_WAVES);
  });

  it("costs both sides men, and reports what is left standing", () => {
    const state = createDefense(world, pendingFor());
    const result = resolveDefenseAssault(state, world.rng);
    expect(result.townLosses).toBeGreaterThan(0);
    expect(result.landingLosses).toBeGreaterThan(0);
    expect(result.townLeft).toBe(state.fort.soldiers - result.townLosses);
  });

  it("is the same beach twice from the same seed", () => {
    const state = createDefense(world, pendingFor());
    const a = resolveDefenseAssault(state, { seed: 11, state: 11 });
    const b = resolveDefenseAssault(state, { seed: 11, state: 11 });
    expect(a).toEqual(b);
  });

  it("holds every seed when the odds are lopsided its way", () => {
    const state = createDefense(
      makeWorld({ ports: { [FORT]: takenPort(FORT, { garrison: 500 }) } }),
      pendingFor(FORT, { expedition: { soldiers: 25, guns: 6, sailDays: 0 } }),
    );
    for (let seed = 1; seed <= 12; seed++) {
      expect(resolveDefenseAssault(state, { seed, state: seed }).held).toBe(true);
    }
  });
});

describe("splitting the town's casualties", () => {
  const world = makeWorld();
  const base = createDefense(world, pendingFor());
  const state: DefenseState = { ...landMen(base), stationed: 60 };

  it("takes stationed men and the landing party down together when the town holds", () => {
    const half = Math.round(state.fort.soldiers / 2);
    const split = splitTownLosses(state, half, true);
    expect(split.garrisonAfter).toBeLessThan(state.stationed);
    expect(split.partySurvivors).toBeLessThan(state.landed);
    expect(split.garrisonAfter).toBeGreaterThan(0);
  });

  it("brings everyone back when the walls were never really pressed", () => {
    const split = splitTownLosses(state, state.fort.soldiers, true);
    expect(split.garrisonAfter).toBe(state.stationed);
    expect(split.partySurvivors).toBe(state.landed);
  });

  it("keeps nobody in a town that fell, and swims a few of the party back", () => {
    const split = splitTownLosses(state, 0, false);
    expect(split.garrisonAfter).toBe(0);
    expect(split.partySurvivors).toBe(Math.round(state.landed * ROUTED_PARTY_SURVIVAL));
  });
});

describe("writing the outcome down", () => {
  it("keeps the flag, pays for the transports and starts the cooling-off period", () => {
    const world = makeWorld();
    const state = createDefense(world, pendingFor());
    const out = applyDefenseOutcome(world, state, state.force, true, state.fort.soldiers);
    expect(out.held).toBe(true);
    expect(out.world.ports[FORT].factionId as unknown as string).toBe("pirates");
    expect(out.gold).toBeGreaterThan(0);
    expect(out.world.player.gold).toBe(world.player.gold + out.gold);
    expect(out.world.ports[FORT].nextReliefDay).toBe(world.time.day + RELIEF_COOLDOWN_DAYS);
  });

  it("hands the town back to the crown that came for it when the walls are carried", () => {
    const world = makeWorld();
    const state = createDefense(world, pendingFor());
    const out = applyDefenseOutcome(world, state, state.force, false, 0);
    expect(out.world.ports[FORT].factionId as unknown as string).toBe(CITIES[FORT].factionId as unknown as string);
    expect(out.world.ports[FORT].garrison).toBe(0);
    // Back under its founding flag, so nothing is counting against it any more.
    expect(out.world.ports[FORT].capturedDay).toBeUndefined();
    expect(out.gold).toBe(0);
  });

  it("costs standing with the crown whose landing it was, win or lose", () => {
    const world = makeWorld();
    const state = createDefense(world, pendingFor());
    const claimant = CITIES[FORT].factionId as unknown as string;
    for (const held of [true, false]) {
      const out = applyDefenseOutcome(world, state, state.force, held, held ? state.fort.soldiers : 0);
      expect(out.world.player.reputation[claimant]).toBe(DEFENCE_CLAIMANT_REP);
    }
  });

  it("pays an ally for a colony that was never yours, and only if you held it", () => {
    const ports = { [ALLY_PORT]: makePort(ALLY_PORT, { defense: 40, garrison: 0 }) };
    const world = makeWorld({ ports });
    const pending = pendingFor(ALLY_PORT, {
      claimant: "spain",
      holder: "england",
      allied: true,
    });
    const state = createDefense(world, pending);

    const won = applyDefenseOutcome(world, state, state.force, true, state.fort.soldiers);
    expect(won.world.player.reputation.england).toBe(ALLY_DEFENCE_REP);
    expect(won.world.player.reputation.spain).toBe(DEFENCE_CLAIMANT_REP);

    const lost = applyDefenseOutcome(world, state, state.force, false, 0);
    expect(lost.world.player.reputation.england ?? 0).toBe(0);
    expect(lost.world.ports[ALLY_PORT].factionId as unknown as string).toBe("spain");
    // Spain never founded Port Royale, so the clock starts against them too.
    expect(lost.world.ports[ALLY_PORT].capturedDay).toBe(world.time.day);
  });

  it("writes the fight's hull and crew back onto the ships that paid for it", () => {
    const world = makeWorld();
    const state = createDefense(world, pendingFor());
    const battered: DefenseState = {
      ...state,
      force: { ...state.force, hullHp: state.force.hullHp - 40, crew: state.force.crew - 25 },
    };
    const out = applyDefenseOutcome(world, battered, state.force, true, battered.fort.soldiers);
    const ship = out.world.entities.player_ship.ship!;
    expect(ship.hullHp).toBeLessThan(world.entities.player_ship.ship!.hullHp);
    expect(ship.crew.current).toBe(world.entities.player_ship.ship!.crew.current - 25);
  });

  it("brings the surviving landing party back aboard rather than counting it lost", () => {
    const world = makeWorld();
    const state = landMen(createDefense(world, pendingFor()));
    const out = applyDefenseOutcome(world, state, createDefense(world, pendingFor()).force, true, state.fort.soldiers);
    // Nobody was hurt, so every man who went ashore is back at his gun.
    expect(out.world.entities.player_ship.ship!.crew.current)
      .toBe(world.entities.player_ship.ship!.crew.current);
  });
});

describe("cutting the cables", () => {
  it("collects no gold and writes no line about holding the place in person", () => {
    const world = makeWorld();
    const state = createDefense(world, pendingFor());
    const { outcome } = abandonDefense(world, state, state.force, world.rng);
    expect(outcome.gold).toBe(0);
    expect(outcome.world.eventLog.some(e => e.key === "reconquest.log_held_present")).toBe(false);
  });

  it("leaves a well-manned town able to hold on its own", () => {
    const world = makeWorld({ ports: { [FORT]: takenPort(FORT, { garrison: 400 }) } });
    const state = createDefense(
      world, pendingFor(FORT, { expedition: { soldiers: 30, guns: 8, sailDays: 0 } }),
    );
    const { outcome } = abandonDefense(world, state, state.force, world.rng);
    expect(outcome.held).toBe(true);
    expect(outcome.world.ports[FORT].factionId as unknown as string).toBe("pirates");
  });

  it("loses a town that had nothing but the player standing in front of it", () => {
    const world = makeWorld({ ports: { [FORT]: takenPort(FORT, { garrison: 0, defense: 2 }) } });
    const state = createDefense(
      world, pendingFor(FORT, { expedition: { soldiers: 900, guns: 220, sailDays: 0 } }),
    );
    const { outcome } = abandonDefense(world, state, state.force, world.rng);
    expect(outcome.held).toBe(false);
    expect(outcome.world.ports[FORT].factionId as unknown as string)
      .toBe(CITIES[FORT].factionId as unknown as string);
  });

  it("is the same decision twice from the same seed", () => {
    const world = makeWorld();
    const state = createDefense(world, pendingFor());
    const a = abandonDefense(world, state, state.force, { seed: 4, state: 4 });
    const b = abandonDefense(world, state, state.force, { seed: 4, state: 4 });
    expect(a.outcome.held).toBe(b.outcome.held);
    expect(a.rng).toEqual(b.rng);
  });
});

describe("the shape of the whole thing", () => {
  it("thinning the boats and saving the wall both improve the town's odds", () => {
    const world = makeWorld();
    const start = createDefense(world, pendingFor());

    const thinned = defenseOdds({
      ...start, squadron: { ...start.squadron, soldiers: start.squadron.soldiers - 60 },
    });
    const walled = defenseOdds({
      ...start, fort: { ...start.fort, walls: start.fort.wallsMax },
    });
    expect(thinned).toBeGreaterThan(defenseOdds(start));
    expect(walled).toBeGreaterThanOrEqual(defenseOdds(start));
  });

  it("a fleet in the roads is worth more shot at the enemy than wall it costs", () => {
    const world = makeWorld();
    const start = createDefense(world, pendingFor());
    const engaged = defenseRound(start, "transports", world.rng, start.force.crew);
    const alone = defenseRound({ ...start, fleetEngaged: false }, "transports", world.rng, start.force.crew);
    expect(engaged.soldiersDrowned).toBeGreaterThan(alone.soldiersDrowned);
  });

  it("never lets the pooled force go negative however long the battle runs", () => {
    const world = makeWorld();
    let state = createDefense(world, pendingFor(FORT, {
      expedition: { soldiers: 900, guns: 400, sailDays: 0 },
    }));
    let rng = world.rng;
    for (let i = 0; i < 20 && state.phase === "bombard"; i++) {
      const round = defenseRound(state, "escorts", rng, attackForceFor(world).crew);
      state = round.state;
      rng = round.rng;
    }
    expect(state.force.hullHp).toBeGreaterThanOrEqual(0);
    expect(state.force.crew).toBeGreaterThanOrEqual(0);
    expect(state.fort.walls).toBeGreaterThanOrEqual(0);
    expect(state.squadron.guns).toBeGreaterThanOrEqual(0);
  });
});
