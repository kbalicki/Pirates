import { describe, it, expect } from "vitest";
import {
  MAX_FLEET_SIZE,
  fleetSize,
  canAddToFleet,
  fleetSpeedMultiplier,
  fleetMaxMastHeight,
  fleetMinCrew,
  fleetTotalCannons,
  addToFleet,
  removeFromFleet,
  fleetSummary,
  FLEET_CREW_FRACTION,
  FLEET_DEFAULT_MORALE,
  consortMorale,
  fleetMorale,
  consortTraining,
  fleetTraining,
  greenCrewTraining,
  GREEN_CREW_PENALTY,
  GREEN_CREW_FLOOR,
  consortCrew,
  consortCrewMax,
  consortBerthsFree,
  manConsorts,
} from "../FleetSystem.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import type { FleetShip, PlayerState } from "../../model/WorldState.ts";
import type { ShipData } from "../../model/EntityState.ts";
import { entityId, shipClassId, factionId } from "../../model/ids.ts";

// ===========================================================================
// FleetSystem — flagship + up to two consorts
// ===========================================================================

/**
 * Fleet rules under test:
 *   • at most 3 hulls total (flagship is NOT in `player.fleet`)
 *   • the fleet sails as fast as its slowest ship
 *   • it sees as far as its tallest mast
 *   • it needs the sum of every ship's minimum crew to be worked at all
 */

function player(fleet: FleetShip[] = []): PlayerState {
  return {
    id: entityId("player"),
    shipId: entityId("player_ship"),
    gold: 500,
    notoriety: 0,
    reputation: {},
    ranks: {},
    location: { type: "sea", pos: { x: 0, y: 0 } },
    questLog: [],
    fleet,
    lastPlunderDay: 1,
    citiesCaptured: 0,
    courtship: {},
  };
}

function escort(classId: string, damage = 0): FleetShip {
  const cls = SHIP_CLASSES[classId];
  return {
    classId,
    hullHp: cls.hullMax - damage,
    hullMax: cls.hullMax,
    sailsHp: cls.sailsMax,
    sailsMax: cls.sailsMax,
    cannons: cls.cannons,
  };
}

function flagship(classId = "sloop"): ShipData {
  const cls = SHIP_CLASSES[classId];
  return {
    classId: shipClassId(classId),
    factionId: factionId("england"),
    hullHp: cls.hullMax,
    hullMax: cls.hullMax,
    sailsHp: cls.sailsMax,
    sailsMax: cls.sailsMax,
    cannons: cls.cannons,
    cargoCap: cls.cargoCap,
    crew: { current: cls.crewMax, max: cls.crewMax, morale: 0.8 },
    cargo: {},
  };
}

describe("fleet size and capacity", () => {
  it("a lone captain still counts as one ship", () => {
    expect(fleetSize(player())).toBe(1);
  });

  it("counts the flagship plus every consort", () => {
    expect(fleetSize(player([escort("sloop")]))).toBe(2);
    expect(fleetSize(player([escort("sloop"), escort("barque")]))).toBe(MAX_FLEET_SIZE - 1 + 1);
  });

  it("tolerates a save that predates the fleet field", () => {
    const legacy = { ...player(), fleet: undefined } as unknown as PlayerState;
    expect(fleetSize(legacy)).toBe(1);
    expect(canAddToFleet(legacy)).toBe(true);
  });

  it("closes the roster at three hulls", () => {
    expect(canAddToFleet(player())).toBe(true);
    expect(canAddToFleet(player([escort("sloop")]))).toBe(true);
    expect(canAddToFleet(player([escort("sloop"), escort("barque")]))).toBe(false);
  });
});

describe("addToFleet / removeFromFleet", () => {
  it("adds a ship at full health", () => {
    const fleet = addToFleet([], "frigate")!;
    const cls = SHIP_CLASSES.frigate;
    expect(fleet).toHaveLength(1);
    expect(fleet[0]).toEqual({
      classId: "frigate",
      hullHp: cls.hullMax,
      hullMax: cls.hullMax,
      sailsHp: cls.sailsMax,
      sailsMax: cls.sailsMax,
      cannons: cls.cannons,
      crew: Math.round(cls.crewMax * FLEET_CREW_FRACTION),
      morale: FLEET_DEFAULT_MORALE,
    });
  });

  it("refuses a third consort — that would be a fourth hull", () => {
    expect(addToFleet([escort("sloop"), escort("barque")], "galleon")).toBeNull();
  });

  it("refuses a ship class that does not exist", () => {
    expect(addToFleet([], "man_o_war")).toBeNull();
  });

  it("does not mutate the fleet it was handed", () => {
    const fleet: FleetShip[] = [escort("sloop")];
    addToFleet(fleet, "barque");
    expect(fleet).toHaveLength(1);
  });

  it("removes by index and leaves the rest in order", () => {
    const fleet = [escort("sloop"), escort("barque"), escort("frigate")];
    const after = removeFromFleet(fleet, 1);
    expect(after.map(s => s.classId)).toEqual(["sloop", "frigate"]);
    expect(fleet).toHaveLength(3); // original untouched
  });

  it("ignores an index that is not in the fleet", () => {
    const fleet = [escort("sloop")];
    expect(removeFromFleet(fleet, 7)).toHaveLength(1);
    expect(removeFromFleet(fleet, -1)).toHaveLength(1);
  });
});

describe("fleetSpeedMultiplier — the slowest hull sets the pace", () => {
  it("a lone flagship sails at its own speed", () => {
    expect(fleetSpeedMultiplier("sloop", [])).toBe(1);
  });

  it("a slower consort drags the whole fleet down", () => {
    const mul = fleetSpeedMultiplier("sloop", [escort("galleon")]);
    expect(mul).toBeLessThan(1);
    expect(mul).toBeCloseTo(SHIP_CLASSES.galleon.speedBase / SHIP_CLASSES.sloop.speedBase, 10);
  });

  it("a faster consort buys nothing", () => {
    expect(fleetSpeedMultiplier("galleon", [escort("pinnace")])).toBe(1);
  });

  it("takes the slowest of several consorts", () => {
    const mul = fleetSpeedMultiplier("pinnace", [escort("sloop"), escort("galleon")]);
    expect(mul).toBeCloseTo(SHIP_CLASSES.galleon.speedBase / SHIP_CLASSES.pinnace.speedBase, 10);
  });

  it("falls back to 1 for an unknown flagship class", () => {
    expect(fleetSpeedMultiplier("man_o_war", [escort("galleon")])).toBe(1);
  });

  it("ignores a consort whose class is unknown rather than reporting zero speed", () => {
    const rogue = { ...escort("sloop"), classId: "man_o_war" };
    expect(fleetSpeedMultiplier("sloop", [rogue])).toBe(1);
  });
});

describe("fleetMaxMastHeight — the tallest mast does the looking", () => {
  it("a lone flagship sees from its own masthead", () => {
    expect(fleetMaxMastHeight("sloop", [])).toBe(SHIP_CLASSES.sloop.mastHeight);
  });

  it("a taller consort extends the horizon", () => {
    expect(fleetMaxMastHeight("sloop", [escort("galleon")])).toBe(SHIP_CLASSES.galleon.mastHeight);
  });

  it("a shorter consort does not shrink it", () => {
    expect(fleetMaxMastHeight("galleon", [escort("pinnace")])).toBe(SHIP_CLASSES.galleon.mastHeight);
  });

  it("falls back to a sane height for an unknown flagship class", () => {
    expect(fleetMaxMastHeight("man_o_war", [])).toBeGreaterThan(0);
  });
});

describe("fleetMinCrew and fleetTotalCannons", () => {
  it("minimum crew is the sum over every hull", () => {
    const expected = SHIP_CLASSES.sloop.crewMin + SHIP_CLASSES.barque.crewMin + SHIP_CLASSES.frigate.crewMin;
    expect(fleetMinCrew("sloop", [escort("barque"), escort("frigate")])).toBe(expected);
  });

  it("adding a hull always raises the crew requirement", () => {
    const alone = fleetMinCrew("sloop", []);
    expect(fleetMinCrew("sloop", [escort("pinnace")])).toBeGreaterThan(alone);
  });

  it("cannons add up across the fleet", () => {
    const total = fleetTotalCannons(flagship("sloop"), [escort("frigate")]);
    expect(total).toBe(SHIP_CLASSES.sloop.cannons + SHIP_CLASSES.frigate.cannons);
  });

  it("a lone flagship contributes only its own guns", () => {
    expect(fleetTotalCannons(flagship("galleon"), [])).toBe(SHIP_CLASSES.galleon.cannons);
  });
});

describe("fleetSummary — what the fleet tab renders", () => {
  it("lists the flagship first and marks it as no escort", () => {
    const rows = fleetSummary("sloop", [escort("barque")]);
    expect(rows[0].isEscort).toBe(false);
    expect(rows[0].classId).toBe("sloop");
    expect(rows[1].isEscort).toBe(true);
  });

  it("reports consort condition as a whole percentage", () => {
    const half = escort("barque", Math.floor(SHIP_CLASSES.barque.hullMax / 2));
    const rows = fleetSummary("sloop", [half]);
    expect(rows[1].hullPercent).toBeGreaterThanOrEqual(49);
    expect(rows[1].hullPercent).toBeLessThanOrEqual(51);
    expect(Number.isInteger(rows[1].hullPercent)).toBe(true);
  });

  it("names an unknown consort class instead of crashing", () => {
    const rogue = { ...escort("sloop"), classId: "man_o_war" };
    expect(fleetSummary("sloop", [rogue])[1].name).toBe("Unknown");
  });

  it("shows 0% rather than NaN for a hull with no maximum", () => {
    const broken = { ...escort("sloop"), hullMax: 0, sailsMax: 0 };
    const row = fleetSummary("sloop", [broken])[1];
    expect(row.hullPercent).toBe(0);
    expect(row.sailsPercent).toBe(0);
  });

  it("skips a flagship class that does not exist and still lists the consorts", () => {
    const rows = fleetSummary("man_o_war", [escort("sloop")]);
    expect(rows).toHaveLength(1);
    expect(rows[0].isEscort).toBe(true);
  });
});

// ===========================================================================
// Consort crews (v0.17.0)
// ===========================================================================

/**
 * Before v0.17.0 a consort's complement was recomputed from its class every
 * time anyone asked, so a ship that lost half its people at a siege had them
 * all back by the next one. `FleetShip.crew` is optional so that old saves keep
 * answering the number they always did — that fallback is what these tests
 * pin down first.
 */
describe("consortCrew — the number, and what it falls back to", () => {
  it("derives the old notional complement when the field was never written", () => {
    const { crew: _dropped, ...legacy } = escort("barque");
    expect(consortCrew(legacy)).toBe(
      Math.round(SHIP_CLASSES.barque.crewMax * FLEET_CREW_FRACTION),
    );
  });

  it("reads the ship's own count once it has one", () => {
    expect(consortCrew({ ...escort("barque"), crew: 7 })).toBe(7);
  });

  it("never reports a negative complement", () => {
    expect(consortCrew({ ...escort("barque"), crew: -5 })).toBe(0);
  });

  it("reports no berths at all for a class that does not exist", () => {
    expect(consortCrewMax({ ...escort("sloop"), classId: "man_o_war" })).toBe(0);
  });
});

describe("consortBerthsFree / manConsorts — putting men back aboard", () => {
  it("counts every empty berth across the consorts", () => {
    const a = { ...escort("sloop"), crew: 2 };
    const b = { ...escort("barque"), crew: 3 };
    expect(consortBerthsFree([a, b])).toBe(
      SHIP_CLASSES.sloop.crewMax - 2 + SHIP_CLASSES.barque.crewMax - 3,
    );
  });

  it("counts nothing free on a full fleet", () => {
    const full = { ...escort("sloop"), crew: SHIP_CLASSES.sloop.crewMax };
    expect(consortBerthsFree([full])).toBe(0);
  });

  it("fills the shortest-handed consort first, not the first in the array", () => {
    const nearlyFull = { ...escort("barque"), crew: SHIP_CLASSES.barque.crewMax - 1 };
    const gutted = { ...escort("sloop"), crew: 1 };
    const { fleet, placed } = manConsorts([nearlyFull, gutted], 4);
    expect(placed).toBe(4);
    // Every man goes to the sloop: it is short by more than four, so the
    // barque's single empty berth is never the worst gap in the fleet.
    expect(fleet[0].crew).toBe(SHIP_CLASSES.barque.crewMax - 1);
    expect(fleet[1].crew).toBe(5);
  });

  it("places only what fits and says how many that was", () => {
    const gutted = { ...escort("sloop"), crew: SHIP_CLASSES.sloop.crewMax - 2 };
    const { fleet, placed } = manConsorts([gutted], 10);
    expect(placed).toBe(2);
    expect(fleet[0].crew).toBe(SHIP_CLASSES.sloop.crewMax);
  });

  it("leaves the array untouched when there is nobody to place", () => {
    const before = [escort("sloop")];
    const { fleet, placed } = manConsorts(before, 0);
    expect(placed).toBe(0);
    expect(fleet).toBe(before);
  });

  it("leaves the array untouched when every berth is already taken", () => {
    const before = [{ ...escort("sloop"), crew: SHIP_CLASSES.sloop.crewMax }];
    const { fleet, placed } = manConsorts(before, 20);
    expect(placed).toBe(0);
    expect(fleet).toBe(before);
  });

  it("has no consorts to man in a one-ship fleet", () => {
    expect(manConsorts([], 30)).toEqual({ fleet: [], placed: 0 });
  });
});

describe("addToFleet — a hull joins already manned", () => {
  it("gives a bought or captured hull the notional prize crew", () => {
    const fleet = addToFleet([], "barque")!;
    expect(fleet[0].crew).toBe(Math.round(SHIP_CLASSES.barque.crewMax * FLEET_CREW_FRACTION));
  });
});

// ===========================================================================
// Consort morale (v0.19.0)
// ===========================================================================

/**
 * `SeaBattleScene` used to build every consort with a flat 0.8 morale, so a
 * ship whose people had not been paid in two months reloaded as briskly as the
 * flagship. The field is optional and that flat number is its fallback.
 */
describe("consortMorale / fleetMorale", () => {
  it("falls back to the number the sea battle used to conjure", () => {
    const { morale: _dropped, ...legacy } = { ...escort("sloop"), morale: 0.4 };
    expect(consortMorale(legacy)).toBe(FLEET_DEFAULT_MORALE);
  });

  it("reads the ship's own morale once it has one", () => {
    expect(consortMorale({ ...escort("sloop"), morale: 0.31 })).toBeCloseTo(0.31, 6);
  });

  it("clamps a value that has drifted out of range", () => {
    expect(consortMorale({ ...escort("sloop"), morale: 1.9 })).toBe(1);
    expect(consortMorale({ ...escort("sloop"), morale: -2 })).toBe(0);
  });

  it("is the flagship's own morale for a one-ship fleet", () => {
    expect(fleetMorale(0.42, 60, [])).toBeCloseTo(0.42, 6);
  });

  it("weights by men, so a small unhappy consort barely moves a big fleet", () => {
    const pinnace = { ...escort("pinnace"), crew: 4, morale: 0 };
    const pooled = fleetMorale(1, 200, [pinnace]);
    expect(pooled).toBeGreaterThan(0.95);
    expect(pooled).toBeLessThan(1);
  });

  it("is dragged down properly when the unhappy ship carries the men", () => {
    const galleon = { ...escort("galleon"), crew: 200, morale: 0 };
    expect(fleetMorale(1, 10, [galleon])).toBeLessThan(0.1);
  });

  it("falls back to the flagship rather than dividing by zero in an empty fleet", () => {
    expect(fleetMorale(0.7, 0, [])).toBeCloseTo(0.7, 6);
  });
});

// ===========================================================================
// Consort training (v0.21.0)
// ===========================================================================

describe("consortTraining / fleetTraining / greenCrewTraining", () => {
  it("falls back to the flagship's drill when the ship has none of its own", () => {
    const { training: _dropped, ...legacy } = { ...escort("sloop"), training: 0.9 };
    expect(consortTraining(legacy, 0.62)).toBeCloseTo(0.62, 6);
  });

  it("reads the ship's own drill once it has one", () => {
    expect(consortTraining({ ...escort("sloop"), training: 0.21 }, 0.9)).toBeCloseTo(0.21, 6);
  });

  it("seeds a joining hull a notch below the captain's own crew", () => {
    expect(greenCrewTraining(0.6)).toBeCloseTo(0.6 - GREEN_CREW_PENALTY, 6);
  });

  it("never seeds below the floor, however green the captain is", () => {
    expect(greenCrewTraining(0.05)).toBe(GREEN_CREW_FLOOR);
  });

  it("gives a bought or captured hull its own green crew", () => {
    const fleet = addToFleet([], "barque", 0.7)!;
    expect(fleet[0].training).toBeCloseTo(greenCrewTraining(0.7), 6);
  });

  it("leaves the field off when the caller does not say — the old two-arg call", () => {
    expect(addToFleet([], "barque")![0].training).toBeUndefined();
  });

  it("drags the fleet's drill down in proportion to the men aboard", () => {
    const green = { ...escort("galleon"), crew: 200, training: 0.2 };
    const pooled = fleetTraining(0.9, 20, [green]);
    expect(pooled).toBeLessThan(0.35);
    expect(pooled).toBeGreaterThan(0.2);
  });

  it("is the flagship's own drill for a one-ship fleet", () => {
    expect(fleetTraining(0.44, 60, [])).toBeCloseTo(0.44, 6);
  });
});
