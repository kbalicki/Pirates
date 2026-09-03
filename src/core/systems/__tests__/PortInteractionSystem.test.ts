import { describe, it, expect } from "vitest";
import { recruitCrew } from "../PortInteractionSystem.ts";
import { consortCrew, FLEET_CREW_FRACTION } from "../FleetSystem.ts";
import type { WorldState, PortRuntimeState, FleetShip } from "../../model/WorldState.ts";
import { entityId, shipClassId, factionId, portId } from "../../model/ids.ts";
import { CITIES } from "../../data/cities.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";

// ===========================================================================
// PortInteractionSystem — the tavern's crew pool
// ===========================================================================
//
// Only the recruiting path is covered here, and only because v0.17.0 changed
// what a berth means: consorts carry their own men now, so a hire that stopped
// at the flagship's rail would have left a gutted consort gutted for good.

const PORT = "port_royal";

function makePort(over: Partial<PortRuntimeState> = {}): PortRuntimeState {
  const baseline = getPortBaseline(PORT);
  return {
    portId: portId(PORT),
    factionId: CITIES[PORT].factionId,
    prices: {},
    inventory: {},
    shipyardQueue: [],
    availableCrew: 50,
    population: baseline.population,
    wealth: baseline.wealth,
    defense: baseline.defense,
    bonusProduces: [],
    ...over,
  };
}

function consort(classId: string, crew?: number): FleetShip {
  const cls = SHIP_CLASSES[classId];
  return {
    classId,
    hullHp: cls.hullMax,
    hullMax: cls.hullMax,
    sailsHp: cls.sailsMax,
    sailsMax: cls.sailsMax,
    cannons: cls.cannons,
    ...(crew === undefined ? {} : { crew }),
  };
}

function makeWorld(over: {
  crew?: number;
  fleet?: FleetShip[];
  availableCrew?: number;
} = {}): WorldState {
  const cls = SHIP_CLASSES.frigate;
  const crew = over.crew ?? cls.crewMax;
  return {
    version: 12,
    time: { day: 100, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 5, state: 5 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: 5000,
      notoriety: 0,
      reputation: {},
      ranks: {},
      location: { type: "port", portId: portId(PORT), pos: { x: 0, y: 0 } },
      questLog: [],
      fleet: over.fleet ?? [],
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
          classId: shipClassId("frigate"),
          factionId: factionId("england"),
          hullHp: cls.hullMax,
          hullMax: cls.hullMax,
          sailsHp: cls.sailsMax,
          sailsMax: cls.sailsMax,
          cannons: cls.cannons,
          cargo: {},
          cargoCap: cls.cargoCap,
          crew: { current: crew, max: cls.crewMax, morale: 0.8 },
        },
      },
    },
    ports: { [PORT]: makePort(over.availableCrew === undefined ? {} : { availableCrew: over.availableCrew }) },
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: {},
    eventLog: [],
    worldEvents: [],
    knownEventIds: [],
    playerName: "Test",
    eraId: "1660",
    startYear: 1660,
    gameSpeed: 1.2,
    captain: {
      name: "Test", nationality: "england", birthYear: 1640, startAge: 20,
      skills: { fencing: 5, gunnery: 5, navigation: 5, charm: 5, medicine: 5 },
      training: 0.5,
    },
  } as WorldState;
}

describe("recruitCrew — berths across the fleet, not just the flagship", () => {
  it("fills the flagship first", () => {
    const w = makeWorld({ crew: SHIP_CLASSES.frigate.crewMax - 10, fleet: [consort("sloop", 2)] });
    const out = recruitCrew(w, portId(PORT), 6);
    expect(out.recruited).toBe(6);
    expect(out.world.entities.player_ship.ship!.crew.current)
      .toBe(SHIP_CLASSES.frigate.crewMax - 4);
    expect(consortCrew(out.world.player.fleet[0])).toBe(2);
  });

  it("spills what will not fit into the consorts", () => {
    const w = makeWorld({ crew: SHIP_CLASSES.frigate.crewMax - 3, fleet: [consort("sloop", 2)] });
    const out = recruitCrew(w, portId(PORT), 9);
    expect(out.recruited).toBe(9);
    expect(out.world.entities.player_ship.ship!.crew.current).toBe(SHIP_CLASSES.frigate.crewMax);
    expect(consortCrew(out.world.player.fleet[0])).toBe(8);
  });

  it("mans a consort even when the flagship is already full", () => {
    const w = makeWorld({ fleet: [consort("sloop", 1)] });
    const out = recruitCrew(w, portId(PORT), 5);
    expect(out.recruited).toBe(5);
    expect(out.world.entities.player_ship.ship!.crew.current).toBe(SHIP_CLASSES.frigate.crewMax);
    expect(consortCrew(out.world.player.fleet[0])).toBe(6);
  });

  it("refuses when every berth in the fleet is taken", () => {
    const w = makeWorld({ fleet: [consort("sloop", SHIP_CLASSES.sloop.crewMax)] });
    const out = recruitCrew(w, portId(PORT), 5);
    expect(out.recruited).toBe(0);
    expect(out.error).toBe("crew_full");
  });

  it("still refuses a full flagship with no consorts at all", () => {
    const out = recruitCrew(makeWorld(), portId(PORT), 5);
    expect(out.recruited).toBe(0);
    expect(out.error).toBe("crew_full");
  });

  it("never hires more than the town has", () => {
    const w = makeWorld({ crew: 10, availableCrew: 3, fleet: [consort("sloop", 0)] });
    const out = recruitCrew(w, portId(PORT), 40);
    expect(out.recruited).toBe(3);
    expect(out.world.ports[PORT].availableCrew).toBe(0);
  });

  it("only dilutes drill with the men who joined the flagship", () => {
    // Everyone here goes to the consort, so the flagship's drill is untouched.
    const w = makeWorld({ fleet: [consort("sloop", 0)] });
    const out = recruitCrew(w, portId(PORT), 5);
    expect(out.world.captain.training).toBe(w.captain.training);
  });

  it("does dilute drill when the recruits walk the flagship's own deck", () => {
    const w = makeWorld({ crew: 10 });
    const out = recruitCrew(w, portId(PORT), 10);
    expect(out.world.captain.training!).toBeLessThan(w.captain.training!);
  });

  it("counts a consort that never recorded a crew at its notional complement", () => {
    const w = makeWorld({ fleet: [consort("sloop")] });
    const out = recruitCrew(w, portId(PORT), 5);
    const expected = Math.round(SHIP_CLASSES.sloop.crewMax * FLEET_CREW_FRACTION);
    expect(out.recruited).toBe(Math.min(5, SHIP_CLASSES.sloop.crewMax - expected));
  });

  it("does not mutate the world it was handed", () => {
    const w = makeWorld({ crew: 10, fleet: [consort("sloop", 1)] });
    recruitCrew(w, portId(PORT), 20);
    expect(w.entities.player_ship.ship!.crew.current).toBe(10);
    expect(w.player.fleet[0].crew).toBe(1);
  });
});
