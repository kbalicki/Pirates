import { describe, it, expect } from "vitest";
import {
  repairAtSea,
  repairEffort,
  rescueSurvivors,
  SEA_REPAIR_HULL_CAP,
  SEA_REPAIR_SAILS_CAP,
  SEA_REPAIR_MIN_CREW_FRAC,
  RESCUE_FRACTION,
} from "../ShipRepairSystem.ts";
import type { WorldState } from "../../model/WorldState.ts";
import { entityId, shipClassId, factionId } from "../../model/ids.ts";

// ===========================================================================
// ShipRepairSystem — jury repairs at sea, survivors out of the water (v0.9.9.2)
// ===========================================================================

/**
 * The point of the cap is that a ship can always get home but never fight its
 * way back to strength without a shipyard. Most of these tests are about where
 * the work stops, not how fast it goes.
 */

const HULL_MAX = 60;
const SAILS_MAX = 50;
const CREW_MAX = 30;

function makeWorld(over: {
  hullHp?: number; sailsHp?: number; crew?: number; morale?: number;
  location?: "sea" | "port"; training?: number;
} = {}): WorldState {
  const {
    hullHp = 12, sailsHp = 10, crew = CREW_MAX, morale = 1.0,
    location = "sea", training = 0.5,
  } = over;
  return {
    version: 9,
    time: { day: 100, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: 500,
      notoriety: 0,
      reputation: {},
      ranks: {},
      location: { type: location, pos: { x: 0, y: 0 } },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
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
          classId: shipClassId("sloop"),
          factionId: factionId("england"),
          hullHp, hullMax: HULL_MAX,
          sailsHp, sailsMax: SAILS_MAX,
          cannons: 8,
          cargoCap: 40,
          crew: { current: crew, max: CREW_MAX, morale },
          cargo: {},
        },
      },
    },
    ports: {},
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
      training,
    },
  } as WorldState;
}

const shipOf = (w: WorldState) => w.entities.player_ship.ship!;

/** Repair day after day until nothing more is mended. Returns the settled world. */
function repairUntilDone(world: WorldState, maxDays = 500): { world: WorldState; days: number } {
  let w = world;
  for (let day = 1; day <= maxDays; day++) {
    const r = repairAtSea(w);
    w = r.world;
    if (r.hullMended <= 0 && r.sailsMended <= 0) return { world: w, days: day };
  }
  return { world: w, days: maxDays };
}

describe("repairEffort", () => {
  it("a full, willing crew works a full day", () => {
    expect(repairEffort(CREW_MAX, CREW_MAX, 1.0)).toBe(1);
  });

  it("too few hands means no work at all", () => {
    const atFloor = CREW_MAX * SEA_REPAIR_MIN_CREW_FRAC;
    expect(repairEffort(atFloor - 0.001, CREW_MAX, 1.0)).toBe(0);
    expect(repairEffort(atFloor, CREW_MAX, 1.0)).toBe(0); // ramp starts at 0 here
    expect(repairEffort(atFloor + 3, CREW_MAX, 1.0)).toBeGreaterThan(0);
  });

  it("hands and willingness multiply — half of each is a quarter of a day", () => {
    const full = repairEffort(CREW_MAX, CREW_MAX, 1.0);
    const halfMorale = repairEffort(CREW_MAX, CREW_MAX, 0.5);
    expect(halfMorale).toBeCloseTo(full * 0.5, 10);
  });

  it("a mutinous crew does nothing however many of them there are", () => {
    expect(repairEffort(CREW_MAX, CREW_MAX, 0)).toBe(0);
  });

  it("more hands never means less work", () => {
    let prev = -1;
    for (let crew = 0; crew <= CREW_MAX; crew++) {
      const e = repairEffort(crew, CREW_MAX, 0.8);
      expect(e).toBeGreaterThanOrEqual(prev);
      prev = e;
    }
  });

  it("survives a ship with no berths at all", () => {
    expect(repairEffort(0, 0, 1)).toBe(0);
  });
});

describe("repairAtSea — where the work stops", () => {
  it("mends a battered ship a little each day", () => {
    const world = makeWorld({ hullHp: 12, sailsHp: 10 });
    const r = repairAtSea(world);
    expect(r.hullMended).toBeGreaterThan(0);
    expect(r.sailsMended).toBeGreaterThan(0);
    expect(shipOf(r.world).hullHp).toBeGreaterThan(12);
    expect(shipOf(r.world).sailsHp).toBeGreaterThan(10);
  });

  it("never takes the hull past the jury-repair cap", () => {
    const { world } = repairUntilDone(makeWorld({ hullHp: 5, sailsHp: 5 }));
    expect(shipOf(world).hullHp).toBeCloseTo(HULL_MAX * SEA_REPAIR_HULL_CAP, 6);
    expect(shipOf(world).sailsHp).toBeCloseTo(SAILS_MAX * SEA_REPAIR_SAILS_CAP, 6);
  });

  it("gets a foundering ship off the sinking stage — that is the whole point", () => {
    // 20 % hull is below the 25 % foundering threshold from DamageSystem.
    const { world } = repairUntilDone(makeWorld({ hullHp: HULL_MAX * 0.20 }));
    expect(shipOf(world).hullHp / HULL_MAX).toBeGreaterThan(0.25);
  });

  it("does nothing for a ship already above both caps", () => {
    const world = makeWorld({ hullHp: HULL_MAX, sailsHp: SAILS_MAX });
    const r = repairAtSea(world);
    expect(r.hullMended).toBe(0);
    expect(r.sailsMended).toBe(0);
    expect(r.world).toBe(world);
  });

  it("mends the rig even when the hull is already at its cap", () => {
    const world = makeWorld({ hullHp: HULL_MAX, sailsHp: 2 });
    const r = repairAtSea(world);
    expect(r.hullMended).toBe(0);
    expect(r.sailsMended).toBeGreaterThan(0);
  });

  it("does no work in port — that is what the shipyard is for", () => {
    const world = makeWorld({ location: "port" });
    expect(repairAtSea(world).world).toBe(world);
  });

  it("does no work with too few hands left", () => {
    const world = makeWorld({ crew: 3 });
    expect(repairAtSea(world).hullMended).toBe(0);
  });

  it("cannot raise a hull that has already gone down", () => {
    const world = makeWorld({ hullHp: 0 });
    expect(repairAtSea(world).world).toBe(world);
    expect(shipOf(repairAtSea(world).world).hullHp).toBe(0);
  });

  it("a willing crew mends faster than a sullen one", () => {
    const eager = repairAtSea(makeWorld({ morale: 1.0 })).hullMended;
    const sullen = repairAtSea(makeWorld({ morale: 0.3 })).hullMended;
    expect(eager).toBeGreaterThan(sullen);
    expect(sullen).toBeGreaterThan(0);
  });

  it("takes weeks, not an afternoon", () => {
    const { days } = repairUntilDone(makeWorld({ hullHp: 5, sailsHp: 5, morale: 1.0 }));
    expect(days).toBeGreaterThan(10);
  });

  it("logs the work once it adds up to a visible point", () => {
    const world = makeWorld({ hullHp: 5, sailsHp: 5 });
    const r = repairAtSea(world);
    expect(r.world.eventLog.some(e => e.key === "event.repaired_at_sea")).toBe(true);
  });

  it("stays quiet on a day that mends less than a point", () => {
    // Barely enough hands to work: the day's progress rounds to nothing worth saying.
    const world = makeWorld({ hullHp: 5, sailsHp: 5, crew: 7, morale: 0.15 });
    const r = repairAtSea(world);
    expect(r.hullMended + r.sailsMended).toBeLessThan(1);
    expect(r.world.eventLog.some(e => e.key === "event.repaired_at_sea")).toBe(false);
  });

  it("does not mutate the world it was handed", () => {
    const world = makeWorld();
    const before = structuredClone(world);
    repairAtSea(world);
    expect(world).toEqual(before);
  });
});

describe("rescueSurvivors", () => {
  it("pulls a fraction of a beaten crew out of the water", () => {
    const world = makeWorld({ crew: 10 });
    const r = rescueSurvivors(world, 20);
    expect(r.rescued).toBe(Math.floor(20 * RESCUE_FRACTION));
    expect(shipOf(r.world).crew.current).toBe(10 + r.rescued);
  });

  it("most of a sunk crew is lost even when you try", () => {
    expect(rescueSurvivors(makeWorld({ crew: 0 }), 20).rescued).toBeLessThan(20 / 2);
  });

  it("takes nobody aboard when there are no berths", () => {
    const world = makeWorld({ crew: CREW_MAX });
    const r = rescueSurvivors(world, 20);
    expect(r.rescued).toBe(0);
    expect(r.turnedAway).toBeGreaterThan(0);
    expect(r.world).toBe(world);
  });

  it("fills the last berths and leaves the rest in the water", () => {
    const world = makeWorld({ crew: CREW_MAX - 2 });
    const r = rescueSurvivors(world, 50);
    expect(r.rescued).toBe(2);
    expect(r.turnedAway).toBe(Math.floor(50 * RESCUE_FRACTION) - 2);
    expect(shipOf(r.world).crew.current).toBe(CREW_MAX);
  });

  it("an empty wreck leaves nobody to find", () => {
    const world = makeWorld({ crew: 10 });
    expect(rescueSurvivors(world, 0).rescued).toBe(0);
    expect(rescueSurvivors(world, 0).world).toBe(world);
  });

  it("pressed men dilute the crew's training", () => {
    const world = makeWorld({ crew: 10, training: 0.9 });
    const r = rescueSurvivors(world, 20);
    expect(r.rescued).toBeGreaterThan(0);
    expect(r.world.captain!.training).toBeLessThan(0.9);
  });

  it("logs the rescue", () => {
    const r = rescueSurvivors(makeWorld({ crew: 10 }), 20);
    expect(r.world.eventLog.some(e => e.key === "event.survivors_rescued")).toBe(true);
  });

  it("never exceeds the ship's complement", () => {
    for (let crew = 0; crew <= CREW_MAX; crew += 5) {
      const r = rescueSurvivors(makeWorld({ crew }), 200);
      expect(shipOf(r.world).crew.current).toBeLessThanOrEqual(CREW_MAX);
    }
  });

  it("ignores a nonsense survivor count", () => {
    expect(rescueSurvivors(makeWorld({ crew: 10 }), -50).rescued).toBe(0);
  });

  it("does not mutate the world it was handed", () => {
    const world = makeWorld({ crew: 10 });
    const before = structuredClone(world);
    rescueSurvivors(world, 20);
    expect(world).toEqual(before);
  });
});
