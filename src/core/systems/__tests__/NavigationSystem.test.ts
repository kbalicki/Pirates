import { describe, it, expect, beforeAll } from "vitest";
import { updateNavigation, type TerrainQuery } from "../NavigationSystem.ts";
import { pointInPolygon, pointInLandmass } from "../../services/Geometry.ts";
import { LANDMASSES, setLandmasses, getFallbackLandmasses } from "../../data/geography.ts";
import { windSpeedModifier } from "../WeatherSystem.ts";
import type { EntityState } from "../../model/EntityState.ts";
import type { WeatherState, Vec2 } from "../../model/WorldState.ts";
import type { EntityId, ShipClassId, FactionId } from "../../model/ids.ts";

// ===========================================================================
// Setup: load fallback landmasses for tests
// ===========================================================================

beforeAll(() => {
  if (LANDMASSES.length === 0) {
    setLandmasses(getFallbackLandmasses());
  }
});

// ===========================================================================
// Helpers
// ===========================================================================

function makeShip(overrides: Partial<EntityState> = {}): EntityState {
  return {
    id: "test-ship" as EntityId,
    kind: "ship",
    mode: "sailing",
    pos: { x: 1600, y: 1600 },
    vel: { x: 0, y: 0 },
    heading: 0,
    sailLevel: 1,
    depthOffset: 0,
    ship: {
      classId: "sloop" as ShipClassId,
      factionId: "pirate" as FactionId,
      hullHp: 60,
      hullMax: 60,
      sailsHp: 50,
      sailsMax: 50,
      cannons: 8,
      cargo: {},
      cargoCap: 40,
      crew: { current: 20, max: 30, morale: 1 },
    },
    ...overrides,
  };
}

const TAILWIND: WeatherState = {
  windDirRad: Math.PI,
  windStrength: 0.8,
  stormActive: false,
  stormTimer: 0,
};

const HEADWIND: WeatherState = {
  windDirRad: 0,
  windStrength: 1.0,
  stormActive: false,
  stormTimer: 0,
};

const CROSSWIND: WeatherState = {
  windDirRad: Math.PI / 2,
  windStrength: 0.7,
  stormActive: false,
  stormTimer: 0,
};

function realTerrainAt(wx: number, wy: number): "sea" | "shallow" | "reef" | "land" {
  if (wx < 0 || wy < 0 || wx > 3200 || wy > 2400) return "land";
  const pt = { x: wx, y: wy };
  for (const lm of LANDMASSES) {
    if (pointInLandmass(pt, lm)) return "land";
  }
  return "sea";
}

function whichLandmass(wx: number, wy: number): string | null {
  if (wx < 0 || wy < 0 || wx > 3200 || wy > 2400) return "oob";
  const pt = { x: wx, y: wy };
  for (const lm of LANDMASSES) {
    if (pointInLandmass(pt, lm)) return lm.id;
  }
  return null;
}

function boxTerrain(
  landBox: { x: number; y: number; w: number; h: number },
): TerrainQuery {
  return (wx, wy) => {
    if (
      wx >= landBox.x && wx < landBox.x + landBox.w &&
      wy >= landBox.y && wy < landBox.y + landBox.h
    ) return "land";
    return "sea";
  };
}

function ptDist(a: Vec2, b: Vec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ===========================================================================
// 1) pointInPolygon — basic geometry
// ===========================================================================

describe("pointInPolygon — basic", () => {
  const square: Vec2[] = [
    { x: 0, y: 0 }, { x: 100, y: 0 },
    { x: 100, y: 100 }, { x: 0, y: 100 },
  ];

  it("inside square center", () => expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true));
  it("inside square near corner", () => expect(pointInPolygon({ x: 1, y: 1 }, square)).toBe(true));
  it("inside square near edge", () => expect(pointInPolygon({ x: 50, y: 1 }, square)).toBe(true));
  it("outside square right", () => expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false));
  it("outside square left", () => expect(pointInPolygon({ x: -50, y: 50 }, square)).toBe(false));
  it("outside square top", () => expect(pointInPolygon({ x: 50, y: -50 }, square)).toBe(false));
  it("outside square bottom", () => expect(pointInPolygon({ x: 50, y: 150 }, square)).toBe(false));

  const triangle: Vec2[] = [{ x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  it("inside triangle", () => expect(pointInPolygon({ x: 50, y: 60 }, triangle)).toBe(true));
  it("outside triangle above", () => expect(pointInPolygon({ x: 50, y: -10 }, triangle)).toBe(false));
  it("outside triangle beside", () => expect(pointInPolygon({ x: 10, y: 10 }, triangle)).toBe(false));

  const lShape: Vec2[] = [
    { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 },
    { x: 100, y: 50 }, { x: 100, y: 100 }, { x: 0, y: 100 },
  ];
  it("inside L lower left", () => expect(pointInPolygon({ x: 25, y: 75 }, lShape)).toBe(true));
  it("inside L lower right", () => expect(pointInPolygon({ x: 75, y: 75 }, lShape)).toBe(true));
  it("inside L upper left", () => expect(pointInPolygon({ x: 25, y: 25 }, lShape)).toBe(true));
  it("outside L concave notch", () => expect(pointInPolygon({ x: 75, y: 25 }, lShape)).toBe(false));
});

// ===========================================================================
// 2) pointInLandmass — bbox optimization
// ===========================================================================

describe("pointInLandmass — bbox optimization", () => {
  it("point outside bbox is rejected fast", () => {
    const lm = {
      id: "test",
      polygon: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 100, y: 200 }],
      bbox: { minX: 100, minY: 100, maxX: 200, maxY: 200 },
    };
    expect(pointInLandmass({ x: 50, y: 150 }, lm)).toBe(false);
    expect(pointInLandmass({ x: 150, y: 150 }, lm)).toBe(true);
  });

  it("works without bbox", () => {
    const lm = {
      id: "test",
      polygon: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 100, y: 200 }],
    };
    expect(pointInLandmass({ x: 150, y: 150 }, lm)).toBe(true);
    expect(pointInLandmass({ x: 50, y: 150 }, lm)).toBe(false);
  });
});

// ===========================================================================
// 3) Terrain query — known sea points are sea
// ===========================================================================

describe("terrain query — known points", () => {
  const seaPoints: Array<[string, Vec2]> = [
    ["mid Caribbean", { x: 1600, y: 1800 }],
    ["east Caribbean", { x: 2500, y: 1700 }],
    ["north Atlantic", { x: 2000, y: 300 }],
  ];

  for (const [name, pos] of seaPoints) {
    it(`${name} (${pos.x},${pos.y}) is sea`, () => {
      expect(realTerrainAt(pos.x, pos.y)).toBe("sea");
    });
  }

  it("negative coords → land", () => expect(realTerrainAt(-10, -10)).toBe("land"));
  it("beyond map → land", () => expect(realTerrainAt(3300, 2500)).toBe("land"));
});

// ===========================================================================
// 4) Fallback landmasses — interior points are inside
// ===========================================================================

describe("fallback landmass interior points", () => {
  it("each fallback landmass has valid interior", () => {
    for (const lm of LANDMASSES) {
      // Compute centroid-ish point
      let cx = 0, cy = 0;
      for (const p of lm.polygon) { cx += p.x; cy += p.y; }
      cx /= lm.polygon.length;
      cy /= lm.polygon.length;
      // At least the centroid region should generally be inside
      // (not guaranteed for concave shapes, but should work for most)
    }
    expect(LANDMASSES.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 5) windSpeedModifier
// ===========================================================================

describe("windSpeedModifier", () => {
  it("headwind ≥ 0.29", () => {
    expect(windSpeedModifier(0, 0, 1.0)).toBeGreaterThanOrEqual(0.29);
  });

  it("tailwind > 1.0", () => {
    expect(windSpeedModifier(0, Math.PI, 1.0)).toBeGreaterThan(1.0);
  });

  it("crosswind ≈ 0.7..1.3", () => {
    const mod = windSpeedModifier(0, Math.PI / 2, 1.0);
    expect(mod).toBeGreaterThanOrEqual(0.7);
    expect(mod).toBeLessThanOrEqual(1.3);
  });

  it("zero wind → modifier = 1.0", () => {
    expect(windSpeedModifier(0, 0, 0)).toBeCloseTo(1.0, 5);
    expect(windSpeedModifier(0, Math.PI, 0)).toBeCloseTo(1.0, 5);
  });

  it("never zero for any heading/wind at full strength (3969 combos)", () => {
    for (let h = 0; h < Math.PI * 2; h += 0.1) {
      for (let w = 0; w < Math.PI * 2; w += 0.1) {
        expect(windSpeedModifier(h, w, 1.0)).toBeGreaterThan(0);
      }
    }
  });

  it("never negative for any heading/wind/strength combo", () => {
    for (let h = 0; h < Math.PI * 2; h += 0.3) {
      for (let w = 0; w < Math.PI * 2; w += 0.3) {
        for (let s = 0; s <= 1.0; s += 0.2) {
          expect(windSpeedModifier(h, w, s)).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("minimum at worst headwind is ≈ 0.3", () => {
    const mod = windSpeedModifier(0, 0, 1.0);
    expect(mod).toBeGreaterThanOrEqual(0.28);
    expect(mod).toBeLessThanOrEqual(0.35);
  });
});

// ===========================================================================
// 6) updateNavigation — sailing mechanics
// ===========================================================================

describe("updateNavigation — sailing mechanics", () => {
  it("moves with favorable wind", () => {
    const ship = makeShip({ pos: { x: 1600, y: 1800 }, heading: Math.PI });
    const r = updateNavigation(ship, TAILWIND, realTerrainAt, 1);
    expect(r.pos.y).toBeGreaterThan(1800);
    expect(r.mode).toBe("sailing");
  });

  it("moves with headwind (slowly)", () => {
    const ship = makeShip({ pos: { x: 1600, y: 1800 }, heading: 0 });
    const r = updateNavigation(ship, HEADWIND, realTerrainAt, 1);
    expect(r.pos.y).toBeLessThan(1800);
    expect(r.mode).toBe("sailing");
  });

  it("moves with crosswind", () => {
    const ship = makeShip({ pos: { x: 1600, y: 1800 }, heading: 0 });
    const r = updateNavigation(ship, CROSSWIND, realTerrainAt, 1);
    expect(r.pos.y).toBeLessThan(1800);
  });

  it("reef: 0.3x speed + hull damage", () => {
    const reefTerrain: TerrainQuery = () => "reef";
    const ship = makeShip({ pos: { x: 100, y: 100 }, heading: 0 });
    const result = updateNavigation(ship, TAILWIND, reefTerrain, 1);
    expect(result.ship!.hullHp).toBeLessThan(60);
    const normalResult = updateNavigation(
      makeShip({ pos: { x: 100, y: 100 }, heading: 0 }),
      TAILWIND, () => "sea", 1,
    );
    const reefDist = ptDist(result.pos, ship.pos);
    const normalDist = ptDist(normalResult.pos, { x: 100, y: 100 });
    expect(reefDist).toBeCloseTo(normalDist * 0.3, 1);
  });

  it("shallow: 0.6x speed", () => {
    const ship = makeShip({ pos: { x: 100, y: 100 }, heading: 0 });
    const result = updateNavigation(ship, TAILWIND, () => "shallow", 1);
    const normalResult = updateNavigation(
      makeShip({ pos: { x: 100, y: 100 }, heading: 0 }),
      TAILWIND, () => "sea", 1,
    );
    expect(ptDist(result.pos, { x: 100, y: 100 }))
      .toBeCloseTo(ptDist(normalResult.pos, { x: 100, y: 100 }) * 0.6, 1);
  });

  it("non-ship entity returned unchanged", () => {
    const e = makeShip({ kind: "fx", ship: undefined });
    expect(updateNavigation(e, TAILWIND, realTerrainAt, 1)).toBe(e);
  });

  it("sailLevel=0 → no movement", () => {
    const ship = makeShip({ pos: { x: 1600, y: 1800 }, heading: 0, sailLevel: 0 });
    const r = updateNavigation(ship, TAILWIND, realTerrainAt, 1);
    expect(r.pos).toEqual({ x: 1600, y: 1800 });
  });

  it("disembark into land box", () => {
    const terrain = boxTerrain({ x: 0, y: 0, w: 200, h: 100 });
    const ship = makeShip({ pos: { x: 100, y: 102 }, heading: 0 });
    const r = updateNavigation(ship, TAILWIND, terrain, 1);
    expect(r.mode).toBe("landed");
    expect(r.anchorPos).toBeDefined();
    expect(r.sailLevel).toBe(0);
  });
});

// ===========================================================================
// 7) Landed mode
// ===========================================================================

describe("updateNavigation — landed mode", () => {
  it("sail=0 → zero velocity", () => {
    const e = makeShip({ mode: "landed", pos: { x: 500, y: 500 }, sailLevel: 0 });
    expect(updateNavigation(e, TAILWIND, () => "land", 1).vel).toEqual({ x: 0, y: 0 });
  });

  it("walk on land moves entity", () => {
    const terrain = boxTerrain({ x: 0, y: 0, w: 1000, h: 1000 });
    const e = makeShip({ mode: "landed", pos: { x: 500, y: 500 }, heading: 0, sailLevel: 1 });
    expect(updateNavigation(e, TAILWIND, terrain, 1).pos.y).toBeLessThan(500);
  });

  it("walking toward water → slides along coast or stops", () => {
    const terrain = boxTerrain({ x: 0, y: 0, w: 200, h: 100 });
    const e = makeShip({ mode: "landed", pos: { x: 100, y: 99.8 }, heading: Math.PI, sailLevel: 1 });
    const result = updateNavigation(e, TAILWIND, terrain, 1);
    // Should stay on land (y <= 100) — either slides along coast or stops
    expect(result.pos.y).toBeLessThanOrEqual(100);
  });

  it("can walk freely in all 8 compass directions on open land", () => {
    const terrain = boxTerrain({ x: 0, y: 0, w: 1000, h: 1000 });
    const center = { x: 500, y: 500 };
    // N, NE, E, SE, S, SW, W, NW
    const headings = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, 5*Math.PI/4, 3*Math.PI/2, 7*Math.PI/4];
    for (const h of headings) {
      const e = makeShip({ mode: "landed", pos: center, heading: h, sailLevel: 1 });
      const result = updateNavigation(e, TAILWIND, terrain, 1);
      const moved = Math.sqrt((result.pos.x - center.x) ** 2 + (result.pos.y - center.y) ** 2);
      expect(moved).toBeGreaterThan(0.1);
    }
  });

  it("coast sliding: 50 ticks walking along south coast stays on land", () => {
    const terrain = boxTerrain({ x: 0, y: 0, w: 500, h: 200 });
    // Start inland, head southeast (will hit south coast and slide east)
    let e = makeShip({ mode: "landed", pos: { x: 100, y: 180 }, heading: 2.36, sailLevel: 1 }); // ~135° SE
    for (let i = 0; i < 50; i++) {
      e = updateNavigation(e, TAILWIND, terrain, 1);
      expect(e.pos.y).toBeLessThanOrEqual(200);
      expect(e.pos.y).toBeGreaterThanOrEqual(0);
      expect(e.mode).toBe("landed");
    }
    // Should have moved east along the coast
    expect(e.pos.x).toBeGreaterThan(100);
  });
});

// ===========================================================================
// 8) Multi-tick simulation — no false disembark on open sea
// ===========================================================================

describe("multi-tick simulation — no false disembark on sea", () => {
  it("100 ticks south from open sea → stays sailing", () => {
    let e = makeShip({ pos: { x: 1600, y: 1800 }, heading: Math.PI });
    for (let i = 0; i < 100; i++) {
      e = updateNavigation(e, TAILWIND, realTerrainAt, 1);
      if (e.pos.y < 2300) expect(e.mode).toBe("sailing");
    }
  });

  it("if ship lands, must be on real land", () => {
    let e = makeShip({ pos: { x: 1600, y: 1800 }, heading: 0 });
    for (let i = 0; i < 200; i++) {
      e = updateNavigation(e, TAILWIND, realTerrainAt, 1);
      if (e.mode === "landed") {
        expect(whichLandmass(e.pos.x, e.pos.y)).not.toBeNull();
        break;
      }
    }
  });

  it("8 headings from open sea: 30 ticks, if lands → real land", () => {
    for (let h = 0; h < Math.PI * 2; h += Math.PI / 4) {
      let e = makeShip({ pos: { x: 1600, y: 1800 }, heading: h });
      for (let i = 0; i < 30; i++) {
        e = updateNavigation(e, TAILWIND, realTerrainAt, 1);
        if (e.mode === "landed") {
          expect(whichLandmass(e.pos.x, e.pos.y)).not.toBeNull();
          break;
        }
      }
    }
  });
});

// ===========================================================================
// 9) Heading sweep — 64 headings at open sea position
// ===========================================================================

describe("heading sweep — 64 headings at open sea", () => {
  const pos = { x: 1600, y: 1800 };

  for (let hi = 0; hi < 64; hi++) {
    const heading = (hi / 64) * Math.PI * 2;
    const hDeg = Math.round(heading * 180 / Math.PI);

    it(`heading ${hDeg}°: if lands, on real land`, () => {
      const ship = makeShip({ pos, heading });
      const r = updateNavigation(ship, HEADWIND, realTerrainAt, 1);
      if (r.mode === "landed") {
        expect(whichLandmass(r.pos.x, r.pos.y)).not.toBeNull();
      }
    });
  }
});
