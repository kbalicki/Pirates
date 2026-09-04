import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  findSeaPath,
  isSeaClear,
  isSeaCell,
  pathLength,
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

describe("grid resolution", () => {
  it("is coarse on purpose — a ship is not a tile", () => {
    // If this ever drops to single pixels the A* cost goes up 1600-fold and
    // the string-pull stops being able to simplify anything.
    expect(SEA_CELL).toBeGreaterThanOrEqual(20);
  });
});
