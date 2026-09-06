import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  findSeaPath,
  findSeaPassage,
  PASSAGE_SPEED,
  isSeaClear,
  isSeaCell,
  pathLength,
  passageCost,
  distanceToPath,
  resetSeaGrid,
  SEA_CELL,
} from "../Pathfinding.ts";
import {
  LANDMASSES,
  setLandmasses,
  getFallbackLandmasses,
  landmassGeneration,
} from "../../data/geography.ts";
import { pointInLandmass } from "../Geometry.ts";

// ===========================================================================
// Pathfinding — A* over the sea grid
// ===========================================================================

/**
 * Two regimes matter and both are tested here.
 *
 * With **no coastline loaded** — which is the default under vitest, and the
 * state the module has to survive because `LANDMASSES` is filled in at boot
 * from GeoJSON — every query is open water and every course is a straight
 * line. That is the degradation the rest of the game relies on.
 *
 * With the **fallback coastline** (Cuba, Hispaniola, Jamaica, Puerto Rico) the
 * grid is real, and the interesting property is the one the whole module exists
 * for: a course between two points on opposite sides of an island does not go
 * through the island.
 */

function restoreEmpty(): void {
  setLandmasses([]);
  resetSeaGrid();
}

describe("with no coastline loaded", () => {
  beforeEach(restoreEmpty);

  it("treats every point as water", () => {
    expect(isSeaCell({ x: 1600, y: 1200 })).toBe(true);
    expect(isSeaClear({ x: 0, y: 0 }, { x: 3000, y: 2000 })).toBe(true);
  });

  it("answers a straight line, not null", () => {
    const path = findSeaPath({ x: 100, y: 100 }, { x: 2000, y: 1500 });
    expect(path).not.toBeNull();
    expect(path).toEqual([{ x: 100, y: 100 }, { x: 2000, y: 1500 }]);
  });
});

describe("with the fallback coastline", () => {
  beforeEach(() => {
    setLandmasses(getFallbackLandmasses());
    resetSeaGrid();
  });
  afterEach(restoreEmpty);

  it("knows land from water", () => {
    const cuba = LANDMASSES.find(l => l.id === "cuba")!;
    const inland = {
      x: (cuba.bbox!.minX + cuba.bbox!.maxX) / 2,
      y: (cuba.bbox!.minY + cuba.bbox!.maxY) / 2,
    };
    // The centre of the bbox is only useful if it really is inside the polygon.
    if (pointInLandmass(inland, cuba)) expect(isSeaCell(inland)).toBe(false);
    expect(isSeaCell({ x: 300, y: 2200 })).toBe(true);
  });

  it("routes round an island rather than through it", () => {
    const cuba = LANDMASSES.find(l => l.id === "cuba")!;
    const north = { x: (cuba.bbox!.minX + cuba.bbox!.maxX) / 2, y: cuba.bbox!.minY - 60 };
    const south = { x: (cuba.bbox!.minX + cuba.bbox!.maxX) / 2, y: cuba.bbox!.maxY + 60 };

    const path = findSeaPath(north, south);
    expect(path).not.toBeNull();
    // More than one leg means it had to turn — a straight line here is land.
    expect(path!.length).toBeGreaterThan(2);

    // Sample the whole course: no leg may cross a landmass.
    for (let i = 1; i < path!.length; i++) {
      expect(isSeaClear(path![i - 1], path![i])).toBe(true);
    }
  });

  it("is longer than the ruler line when it has to go round", () => {
    const cuba = LANDMASSES.find(l => l.id === "cuba")!;
    const north = { x: (cuba.bbox!.minX + cuba.bbox!.maxX) / 2, y: cuba.bbox!.minY - 60 };
    const south = { x: (cuba.bbox!.minX + cuba.bbox!.maxX) / 2, y: cuba.bbox!.maxY + 60 };
    const path = findSeaPath(north, south)!;
    const ruler = Math.hypot(south.x - north.x, south.y - north.y);
    expect(pathLength(path)).toBeGreaterThan(ruler);
  });

  it("keeps a straight line when the water really is clear", () => {
    const a = { x: 200, y: 2100 };
    const b = { x: 700, y: 2200 };
    if (isSeaClear(a, b)) {
      expect(findSeaPath(a, b)).toEqual([a, b]);
    }
  });

  it("rebuilds the grid when the coastline is swapped", () => {
    const before = landmassGeneration();
    setLandmasses([]);
    expect(landmassGeneration()).toBeGreaterThan(before);
    // Without the rebuild this would still answer "land" from the cached grid.
    const cuba = getFallbackLandmasses().find(l => l.id === "cuba")!;
    expect(isSeaCell({ x: (cuba.bbox!.minX + cuba.bbox!.maxX) / 2, y: (cuba.bbox!.minY + cuba.bbox!.maxY) / 2 })).toBe(true);
  });
});

// ===========================================================================
// The shortest course is not the quickest one (v0.42.0)
// ===========================================================================

/**
 * A made-up current running due east across the middle of the chart, strong
 * enough to matter to a merchantman. The real table lives in `data/currents.ts`;
 * what is asserted here is the arithmetic, not the geography.
 */
const EASTERLY_SET = 0.06;
const eastward = () => ({ x: EASTERLY_SET, y: 0 });
const noSet = () => ({ x: 0, y: 0 });

describe("a passage costed in time", () => {
  beforeEach(restoreEmpty);

  it("is reckoned against a laden merchantman, not a frigate", () => {
    // The whole difference between a current that matters and one that does
    // not: four knots is two thirds of a fluyt and a third of a frigate.
    expect(PASSAGE_SPEED).toBeCloseTo(0.125, 6);
  });

  it("costs a still sea exactly its length, so nothing changed without a current", () => {
    const a = { x: 200, y: 200 };
    const b = { x: 900, y: 200 };
    const plain = findSeaPassage(a, b)!;
    expect(plain.cost).toBeCloseTo(plain.length / SEA_CELL, 9);
    expect(findSeaPassage(a, b, noSet)!.cost).toBeCloseTo(plain.cost, 9);
  });

  it("is cheaper with the set than against it, over the same water", () => {
    const west = { x: 200, y: 200 };
    const east = { x: 1400, y: 200 };
    const withIt = findSeaPassage(west, east, eastward)!;
    const againstIt = findSeaPassage(east, west, eastward)!;
    expect(withIt.length).toBeCloseTo(againstIt.length, 6);   // the same water...
    expect(withIt.cost).toBeLessThan(againstIt.cost);          // ...not the same passage
  });

  it("is asymmetric, which is the point", () => {
    const a = { x: 300, y: 700 };
    const b = { x: 1500, y: 700 };
    expect(findSeaPassage(a, b, eastward)!.cost)
      .not.toBeCloseTo(findSeaPassage(b, a, eastward)!.cost, 3);
  });

  it("prefers a further supplier who runs down to a nearer one who beats up", () => {
    // What a lane is ranked on. Both ship *to* the port; the set runs east.
    const port = { x: 800, y: 400 };
    const nearButFoul = { x: 1100, y: 400 };  // 300 units, and dead against
    const farButFair = { x: 300, y: 400 };    // 500 units, and dead with
    const foul = findSeaPassage(nearButFoul, port, eastward)!;
    const fair = findSeaPassage(farButFair, port, eastward)!;
    expect(fair.length).toBeGreaterThan(foul.length);   // further in miles...
    expect(fair.cost).toBeLessThan(foul.cost);          // ...nearer in days
  });

  it("leaves a course across the set alone", () => {
    const north = findSeaPassage({ x: 700, y: 200 }, { x: 700, y: 1000 }, eastward)!;
    expect(north.cost).toBeCloseTo(north.length / SEA_CELL, 6);
  });

  it("hands the same path back as findSeaPath, which is still the old signature", () => {
    const a = { x: 100, y: 100 };
    const b = { x: 800, y: 800 };
    expect(findSeaPath(a, b)).toEqual(findSeaPassage(a, b)!.path);
  });
});

describe("a passage costed in time, with a coastline in the way", () => {
  beforeEach(() => {
    setLandmasses(getFallbackLandmasses());
    resetSeaGrid();
  });
  afterEach(restoreEmpty);

  it("still goes round the island, and still says how long it took", () => {
    const cuba = LANDMASSES.find(l => l.id === "cuba")!;
    const north = { x: (cuba.bbox!.minX + cuba.bbox!.maxX) / 2, y: cuba.bbox!.minY - 120 };
    const south = { x: (cuba.bbox!.minX + cuba.bbox!.maxX) / 2, y: cuba.bbox!.maxY + 120 };
    const passage = findSeaPassage(north, south, eastward)!;
    expect(passage.path.length).toBeGreaterThan(2);
    for (const p of passage.path) expect(pointInLandmass(p, cuba)).toBe(false);
    expect(passage.cost).toBeGreaterThan(0);
  });

  it("costs the beat round it more than the run", () => {
    const cuba = LANDMASSES.find(l => l.id === "cuba")!;
    const west = { x: cuba.bbox!.minX - 150, y: (cuba.bbox!.minY + cuba.bbox!.maxY) / 2 };
    const east = { x: cuba.bbox!.maxX + 150, y: (cuba.bbox!.minY + cuba.bbox!.maxY) / 2 };
    expect(findSeaPassage(west, east, eastward)!.cost)
      .toBeLessThan(findSeaPassage(east, west, eastward)!.cost);
  });
});

describe("distanceToPath", () => {
  beforeEach(restoreEmpty);

  it("is zero on the line and the perpendicular distance off it", () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(distanceToPath(path, { x: 50, y: 0 })).toBeCloseTo(0);
    expect(distanceToPath(path, { x: 50, y: 30 })).toBeCloseTo(30);
  });

  it("clamps to the ends rather than extending the line", () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    // 40 beyond the end, not 0 as an infinite line would say.
    expect(distanceToPath(path, { x: 140, y: 0 })).toBeCloseTo(40);
  });

  it("takes the nearest leg of a dog-leg", () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(distanceToPath(path, { x: 110, y: 50 })).toBeCloseTo(10);
  });
});

describe("pathLength", () => {
  it("sums the legs and answers 0 for a single point", () => {
    expect(pathLength([{ x: 0, y: 0 }])).toBe(0);
    expect(pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBeCloseTo(5);
    expect(pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 8 }])).toBeCloseTo(9);
  });
});

describe("passageCost", () => {
  it("costs a still sea exactly its length, like everything else here", () => {
    const line = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }];
    expect(passageCost(line)).toBeCloseTo(pathLength(line) / SEA_CELL, 9);
    expect(passageCost(line, noSet)).toBeCloseTo(pathLength(line) / SEA_CELL, 9);
  });

  it("charges the way home more than the way out, over the very same line", () => {
    const line = [{ x: 200, y: 400 }, { x: 1600, y: 400 }];
    const withIt = passageCost(line, eastward);
    const againstIt = passageCost([...line].reverse(), eastward);
    expect(withIt).toBeLessThan(againstIt);
    // Same water, same length: the difference is the sea and nothing else.
    expect(pathLength(line)).toBeCloseTo(pathLength([...line].reverse()), 9);
  });

  it("costs a set athwart the course as if there were none", () => {
    // A current across the bow neither helps nor hinders in this model, which
    // is why the two directions of a north-south lane come out equal.
    const line = [{ x: 500, y: 200 }, { x: 500, y: 1200 }];
    expect(passageCost(line, eastward)).toBeCloseTo(pathLength(line) / SEA_CELL, 6);
  });

  it("samples a long leg more than once, so a band it only clips is only clipped", () => {
    // A leg 800 units long crossing a set that stops halfway: one sample at the
    // midpoint would price the whole leg off the wrong water.
    const halfway = (p: { x: number; y: number }) =>
      p.x < 600 ? { x: 0.08, y: 0 } : { x: 0, y: 0 };
    const line = [{ x: 200, y: 300 }, { x: 1000, y: 300 }];
    const cost = passageCost(line, halfway);
    const still = pathLength(line) / SEA_CELL;
    const allOfIt = passageCost([{ x: 200, y: 300 }, { x: 599, y: 300 }], halfway)
      * (pathLength(line) / pathLength([{ x: 200, y: 300 }, { x: 599, y: 300 }]));
    expect(cost).toBeLessThan(still);       // half of it was helped...
    expect(cost).toBeGreaterThan(allOfIt);  // ...and only half
  });

  it("answers nought for a course that goes nowhere", () => {
    expect(passageCost([{ x: 5, y: 5 }], eastward)).toBe(0);
    expect(passageCost([{ x: 5, y: 5 }, { x: 5, y: 5 }], eastward)).toBe(0);
  });
});

describe("grid resolution", () => {
  it("is coarse on purpose — a ship is not a tile", () => {
    // If this ever drops to single pixels the A* cost goes up 1600-fold and
    // the string-pull stops being able to simplify anything.
    expect(SEA_CELL).toBeGreaterThanOrEqual(20);
  });
});
