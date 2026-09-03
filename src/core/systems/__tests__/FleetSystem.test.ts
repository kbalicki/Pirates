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
