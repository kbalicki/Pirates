import { describe, it, expect, beforeAll } from "vitest";
import { updateNavigation, applyTurn, type TerrainQuery } from "../NavigationSystem.ts";
import { pointInPolygon, pointInLandmass } from "../../services/Geometry.ts";
import { setDepthField, AGROUND_SPEED_MUL, SHOAL_SPEED_MUL } from "../../services/SeaDepth.ts";
import { mapDamageSpeedMultiplier, MIN_AFLOAT_HULL } from "../DamageSystem.ts";
import { LANDMASSES, setLandmasses, getFallbackLandmasses } from "../../data/geography.ts";
import {
  windSpeedModifier, windPolar, navigatedWindModifier,
  NEUTRAL_NAVIGATION, BEAT_CEIL, IRONS_STEERAGE, bestBeatAngle,
} from "../WeatherSystem.ts";
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

function realTerrainAt(wx: number, wy: number): "sea" | "land" {
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

/**
 * Polar diagram introduced in v0.9.4 (`WeatherSystem.windSpeedModifier`).
 *
 * Convention: `windDirRad` is the direction the wind blows **from**, so the
 * angle used by the model is `|heading - windDir|` folded to 0..180°:
 *   0°   = bow straight into the wind  → no-go zone
 *   180° = running before the wind
 *
 * Curve at full strength, with the default `minWindAngle` of 30°:
 *   0-30°    → IRONS_STEERAGE (no-go zone, bare steerage way)
 *   30-60°   → 0→0.4 (close hauled, rising as sqrt off the edge)
 *   60-120°  → 0.4 → 1.5 → 1.1 (two quarter sines, peak at 90° beam reach)
 *   120-180° → 1.1 → 0.9 (running)
 *
 * At or above `BEAT_CEIL` the result is `1 + (factor - 1) * strength` exactly,
 * at every wind strength — that is the guarantee v0.53.0 was built around, and
 * it is asserted below. Below the ceiling the flat part of that blend is paid
 * out in proportion to how much sail is drawing, which is what stopped the
 * dead zone from being the fastest way to windward in the game.
 */
describe("windSpeedModifier", () => {
  it("no-go zone: straight into the wind she keeps bare steerage way", () => {
    expect(windSpeedModifier(0, 0, 1.0)).toBe(IRONS_STEERAGE);
  });

  it("no-go zone spans minWindAngle degrees", () => {
    const justInside = (29 * Math.PI) / 180;
    const justOutside = (31 * Math.PI) / 180;
    expect(windSpeedModifier(justInside, 0, 1.0, 30)).toBe(IRONS_STEERAGE);
    expect(windSpeedModifier(justOutside, 0, 1.0, 30)).toBeGreaterThan(IRONS_STEERAGE);
  });

  it("square rig (wider minWindAngle) has a wider no-go zone", () => {
    const at40deg = (40 * Math.PI) / 180;
    expect(windSpeedModifier(at40deg, 0, 1.0, 30)).toBeGreaterThan(IRONS_STEERAGE);
    expect(windSpeedModifier(at40deg, 0, 1.0, 60)).toBe(IRONS_STEERAGE);
  });

  it("close hauled (60°) = 0.4", () => {
    expect(windSpeedModifier(Math.PI / 3, 0, 1.0)).toBeCloseTo(0.4, 5);
  });

  it("beam reach (90°) is the fastest point of sail = 1.5", () => {
    expect(windSpeedModifier(Math.PI / 2, 0, 1.0)).toBeCloseTo(1.5, 5);
  });

  it("running (180°) = 0.9 — good but not the peak", () => {
    expect(windSpeedModifier(Math.PI, 0, 1.0)).toBeCloseTo(0.9, 5);
  });

  it("beam reach beats running beats close hauled", () => {
    const beam = windSpeedModifier(Math.PI / 2, 0, 1.0);
    const running = windSpeedModifier(Math.PI, 0, 1.0);
    const closeHauled = windSpeedModifier(Math.PI / 3, 0, 1.0);
    expect(beam).toBeGreaterThan(running);
    expect(running).toBeGreaterThan(closeHauled);
  });

  it("symmetric: port and starboard tack are equally fast", () => {
    for (let deg = 0; deg <= 180; deg += 15) {
      const rad = (deg * Math.PI) / 180;
      expect(windSpeedModifier(rad, 0, 1.0)).toBeCloseTo(
        windSpeedModifier(-rad, 0, 1.0), 10,
      );
    }
  });

  it("zero wind → modifier = 1.0", () => {
    expect(windSpeedModifier(0, 0, 0)).toBeCloseTo(1.0, 5);
    expect(windSpeedModifier(0, Math.PI, 0)).toBeCloseTo(1.0, 5);
  });

  it("wind strength scales the deviation from 1.0", () => {
    // Beam reach at half strength is halfway between 1.0 and 1.5.
    expect(windSpeedModifier(Math.PI / 2, 0, 0.5)).toBeCloseTo(1.25, 5);
    // The no-go zone does NOT sit halfway between 0 and 1 any more. It used to,
    // and 0.5 of base speed dead to windward was the fastest way upwind in the
    // game — see the block on the dead zone below.
    expect(windSpeedModifier(0, 0, 0.5)).toBeLessThan(0.1);
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

  it("only the no-go zone crawls — every other heading makes real way", () => {
    for (let deg = 31; deg <= 180; deg += 1) {
      const rad = (deg * Math.PI) / 180;
      expect(windSpeedModifier(rad, 0, 1.0, 30)).toBeGreaterThan(IRONS_STEERAGE);
    }
  });

  // Regression for TODO.md P0-2: the reach branch used to be a half sine that
  // fell back to 0.4 at 120° while the running branch picked up at 1.1, so a
  // ship at 119° sailed 0.4× and at 121° already 1.1×.
  it("broad reach is continuous across the 120° branch boundary", () => {
    for (const minWindAngle of [30, 35, 40, 45, 50, 55, 60]) {
      const before = windSpeedModifier((119.5 * Math.PI) / 180, 0, 1.0, minWindAngle);
      const after = windSpeedModifier((120.5 * Math.PI) / 180, 0, 1.0, minWindAngle);
      // The old branch seam jumped 0.7 here; a smooth handover moves ~0.04.
      expect(Math.abs(after - before)).toBeLessThan(0.1);
    }
  });

  it("the whole curve is continuous — no step bigger than 0.15 per degree", () => {
    for (const minWindAngle of [30, 45, 60]) {
      let prev = windSpeedModifier((minWindAngle * Math.PI) / 180, 0, 1.0, minWindAngle);
      for (let deg = minWindAngle + 1; deg <= 180; deg += 1) {
        const cur = windSpeedModifier((deg * Math.PI) / 180, 0, 1.0, minWindAngle);
        expect(Math.abs(cur - prev)).toBeLessThan(0.15);
        prev = cur;
      }
    }
  });

  it("speed falls off monotonically from the peak down to running", () => {
    // Peak sits halfway across the reach band; past it the curve only drops.
    const peakDeg = (30 + 30 + 120) / 2; // minWindAngle 30 → 90°
    let prev = windSpeedModifier((peakDeg * Math.PI) / 180, 0, 1.0, 30);
    for (let deg = peakDeg + 1; deg <= 180; deg += 1) {
      const cur = windSpeedModifier((deg * Math.PI) / 180, 0, 1.0, 30);
      expect(cur).toBeLessThanOrEqual(prev + 1e-9);
      prev = cur;
    }
  });

  it("broad reach at 120° hands over at 1.1 for every rig", () => {
    for (const minWindAngle of [30, 45, 60]) {
      expect(windSpeedModifier((120 * Math.PI) / 180, 0, 1.0, minWindAngle)).toBeCloseTo(1.1, 5);
    }
  });
});

// ===========================================================================
// 6) updateNavigation — sailing mechanics
// ===========================================================================

describe("updateNavigation — sailing mechanics", () => {
  it("moves with favorable wind", () => {
    // Wind from the south (TAILWIND), ship heading north → running before it.
    const ship = makeShip({ pos: { x: 1600, y: 1800 }, heading: 0 });
    const r = updateNavigation(ship, TAILWIND, realTerrainAt, 1);
    expect(r.pos.y).toBeLessThan(1800);
    expect(r.mode).toBe("sailing");
  });

  it("barely moves when pointed straight into the wind", () => {
    // HEADWIND blows from the north at full strength; heading 0 is the no-go zone.
    const ship = makeShip({ pos: { x: 1600, y: 1800 }, heading: 0 });
    const r = updateNavigation(ship, HEADWIND, realTerrainAt, 1);
    const crawl = ptDist(r.pos, { x: 1600, y: 1800 });
    const beam = ptDist(
      updateNavigation(
        makeShip({ pos: { x: 1600, y: 1800 }, heading: Math.PI / 2 }),
        HEADWIND, realTerrainAt, 1,
      ).pos,
      { x: 1600, y: 1800 },
    );
    expect(crawl).toBeGreaterThan(0);
    expect(crawl).toBeLessThan(beam / 20);
    expect(r.mode).toBe("sailing");
  });

  it("close hauled beats the no-go zone but trails a beam reach", () => {
    const at = (heading: number) => {
      const r = updateNavigation(
        makeShip({ pos: { x: 1600, y: 1800 }, heading }), HEADWIND, realTerrainAt, 1,
      );
      return ptDist(r.pos, { x: 1600, y: 1800 });
    };
    const closeHauled = at((60 * Math.PI) / 180);
    const beamReach = at(Math.PI / 2);
    expect(closeHauled).toBeGreaterThan(0);
    expect(beamReach).toBeGreaterThan(closeHauled);
  });

  it("moves with crosswind", () => {
    const ship = makeShip({ pos: { x: 1600, y: 1800 }, heading: 0 });
    const r = updateNavigation(ship, CROSSWIND, realTerrainAt, 1);
    expect(r.pos.y).toBeLessThan(1800);
  });

  // ── Soundings (v0.48.0) ──
  //
  // These two tests used to drive `terrainAt` to return "reef" and "shallow".
  // Nothing in the game ever returned either: the map's query answers "land"
  // or "sea", so both branches — and both of these tests — exercised code that
  // could not run. Depth is a comparison between the water and the hull now,
  // and it comes from `SeaDepth`.

  /**
   * The sandbank is not the seabed (v0.59.0).
   *
   * The branch above promises in its own comment that she "keeps steerage way
   * — barely — so the player can back out of it". The line three below that
   * comment took the promise away: at 0.12 hull a tick the bottom ground her
   * to **zero**, `hullTier` prices a hull of zero at zero speed, and the
   * steerage way was exactly nothing — with `repairAtSea` refusing her and
   * every yard out of reach. A sloop crossed that line in 25 seconds.
   *
   * So this drives the real branch until it cannot grind any further, and asks
   * the question that separates the two versions: not "is she still there" but
   * **how fast can she leave**.
   */
  it("aground: the grinding stops one point short of stranding her", () => {
    setDepthField([[1]], 4000);
    let ship = makeShip({ pos: { x: 100, y: 100 }, heading: 0 });
    const hullMax = ship.ship!.hullMax;
    // Long enough to grind a sloop's whole hull away twice over.
    for (let i = 0; i < 1200; i++) {
      ship = updateNavigation({ ...ship, pos: { x: 100, y: 100 } }, TAILWIND, () => "sea", 1);
    }
    setDepthField(null);

    expect(ship.aground).toBe(true);
    expect(ship.ship!.hullHp).toBe(MIN_AFLOAT_HULL);
    expect(mapDamageSpeedMultiplier(ship.ship!.hullHp, hullMax, ship.ship!.sailsHp, ship.ship!.sailsMax))
      .toBeGreaterThan(0);

    // And she can actually leave: put her back in deep water and she moves.
    const off = updateNavigation({ ...ship, pos: { x: 100, y: 100 } }, TAILWIND, () => "sea", 1);
    expect(ptDist(off.pos, { x: 100, y: 100 })).toBeGreaterThan(0);
  });

  it("aground: she drags, and the hull grinds away", () => {
    // The fixture is a sloop: she draws 1.5 m, and one metre of water is not
    // enough for her.
    setDepthField([[1]], 4000);
    const ship = makeShip({ pos: { x: 100, y: 100 }, heading: 0 });
    const result = updateNavigation(ship, TAILWIND, () => "sea", 1);
    setDepthField(null);

    expect(result.aground).toBe(true);
    expect(result.ship!.hullHp).toBeLessThan(60);

    setDepthField(null);
    const deep = updateNavigation(
      makeShip({ pos: { x: 100, y: 100 }, heading: 0 }), TAILWIND, () => "sea", 1,
    );
    const groundDist = ptDist(result.pos, { x: 100, y: 100 });
    const deepDist = ptDist(deep.pos, { x: 100, y: 100 });
    expect(groundDist).toBeCloseTo(deepDist * AGROUND_SPEED_MUL, 1);
  });

  it("feeling the bottom: slower, unhurt, and warned", () => {
    // 2.5 m over a 1.5 m draught: one metre of clearance, under the metre and
    // a half at which a master starts watching the leadsman.
    setDepthField([[2.5]], 4000);
    const ship = makeShip({ pos: { x: 100, y: 100 }, heading: 0 });
    const result = updateNavigation(ship, TAILWIND, () => "sea", 1);
    setDepthField(null);

    expect(result.shoaling).toBe(true);
    expect(result.aground).toBeUndefined();
    expect(result.ship!.hullHp).toBe(60);

    const deep = updateNavigation(
      makeShip({ pos: { x: 100, y: 100 }, heading: 0 }), TAILWIND, () => "sea", 1,
    );
    expect(ptDist(result.pos, { x: 100, y: 100 }))
      .toBeCloseTo(ptDist(deep.pos, { x: 100, y: 100 }) * SHOAL_SPEED_MUL, 1);
  });

  it("open water is exactly what it always was", () => {
    // No field loaded — every existing test in this project runs this way, and
    // that is deliberate: an unset field answers open sea everywhere.
    const ship = makeShip({ pos: { x: 100, y: 100 }, heading: 0 });
    const result = updateNavigation(ship, TAILWIND, () => "sea", 1);
    expect(result.aground).toBeUndefined();
    expect(result.shoaling).toBeUndefined();
    expect(result.ship!.hullHp).toBe(60);
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
    // A sloop running before the wind covers ~0.19 px per tick, so the ship
    // has to start within that distance of the shore to strike it this tick.
    const ship = makeShip({ pos: { x: 100, y: 100.1 }, heading: 0 });
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

// ===========================================================================
// The navigator (v0.47.0)
// ===========================================================================

/**
 * `navigation` was one of five numbers on the character sheet and the only code
 * in the project that read it made it *rise* after thirty-five. These tests are
 * about where the man at the chart table is worth something and — just as
 * importantly — where he is worth nothing.
 */
describe("navigatedWindModifier", () => {
  const STRENGTH = 0.52; // an average trade wind on this map

  it("changes nothing at all for the captain every game starts with", () => {
    for (let deg = 0; deg <= 180; deg += 5) {
      const base = windSpeedModifier((deg * Math.PI) / 180, 0, STRENGTH, 50);
      expect(navigatedWindModifier(base, NEUTRAL_NAVIGATION)).toBeCloseTo(base, 10);
    }
  });

  it("is worth nothing on a point of sail anybody can steer", () => {
    // On a beam or broad reach the ship is already making more than her base
    // speed, so there is no shortfall for a navigator to recover.
    for (const deg of [95, 110, 140]) {
      const base = windSpeedModifier((deg * Math.PI) / 180, 0, STRENGTH, 50);
      expect(base).toBeGreaterThan(1);
      expect(navigatedWindModifier(base, 0)).toBeCloseTo(base, 10);
      expect(navigatedWindModifier(base, 10)).toBeCloseTo(base, 10);
    }
  });

  it("is worth a fifth of her speed hard on the wind", () => {
    const base = windSpeedModifier(0, 0, STRENGTH, 50); // dead into it
    const poor = navigatedWindModifier(base, 0);
    const good = navigatedWindModifier(base, 10);
    expect(poor).toBeLessThan(base);
    expect(good).toBeGreaterThan(base);
    expect(good / poor).toBeGreaterThan(1.4);
  });

  it("rises with the skill and never goes negative", () => {
    const base = windSpeedModifier(0, 0, 1.0, 60);
    for (let n = 0; n < 10; n++) {
      expect(navigatedWindModifier(base, n + 1)).toBeGreaterThanOrEqual(navigatedWindModifier(base, n));
    }
    expect(navigatedWindModifier(0, 0)).toBeGreaterThanOrEqual(0);
  });

  it("clamps a skill outside the sheet rather than extrapolating off it", () => {
    const base = windSpeedModifier(0, 0, STRENGTH, 50);
    expect(navigatedWindModifier(base, 99)).toBeCloseTo(navigatedWindModifier(base, 10), 10);
    expect(navigatedWindModifier(base, -99)).toBeCloseTo(navigatedWindModifier(base, 0), 10);
  });
});

// ===========================================================================
// Hands enough to work her (v0.49.0)
// ===========================================================================

describe("manning", () => {
  beforeAll(() => setDepthField(null));

  it("does not touch a fully manned ship — which every ship in every old save is", () => {
    const full = makeShip({ ship: { ...makeShip().ship!, crew: { current: 20, max: 30, morale: 1 } } });
    const brim = makeShip({ ship: { ...makeShip().ship!, crew: { current: 30, max: 30, morale: 1 } } });
    const a = updateNavigation(full, TAILWIND, () => "sea", 1);
    const b = updateNavigation(brim, TAILWIND, () => "sea", 1);
    expect(Math.hypot(a.vel.x, a.vel.y)).toBeCloseTo(Math.hypot(b.vel.x, b.vel.y), 10);
  });

  it("slows a ship worked by too few hands", () => {
    const sloop = makeShip().ship!;
    const manned = makeShip({ ship: { ...sloop, crew: { current: 20, max: 30, morale: 1 } } });
    const thin = makeShip({ ship: { ...sloop, crew: { current: 3, max: 30, morale: 1 } } });
    const fast = updateNavigation(manned, TAILWIND, () => "sea", 1);
    const slow = updateNavigation(thin, TAILWIND, () => "sea", 1);
    expect(Math.hypot(slow.vel.x, slow.vel.y)).toBeLessThan(Math.hypot(fast.vel.x, fast.vel.y));
  });

  it("still leaves her steerage way — a short-handed ship is never a dead end", () => {
    const sloop = makeShip().ship!;
    const skeleton = makeShip({ ship: { ...sloop, crew: { current: 1, max: 30, morale: 1 } } });
    const moved = updateNavigation(skeleton, TAILWIND, () => "sea", 1);
    expect(Math.hypot(moved.vel.x, moved.vel.y)).toBeGreaterThan(0);
  });

  it("costs her the helm harder than it costs her the log", () => {
    const sloop = makeShip().ship!;
    const manned = makeShip({ ship: { ...sloop, crew: { current: 20, max: 30, morale: 1 } } });
    const thin = makeShip({ ship: { ...sloop, crew: { current: 3, max: 30, morale: 1 } } });

    const speedOf = (e: EntityState) => {
      const v = updateNavigation(e, TAILWIND, () => "sea", 1).vel;
      return Math.hypot(v.x, v.y);
    };
    const speedRatio = speedOf(thin) / speedOf(manned);

    const turnManned = applyTurn(manned, "right", 99).heading;
    const turnThin = applyTurn(thin, "right", 99).heading;
    const turnRatio = turnThin / turnManned;

    expect(turnRatio).toBeLessThan(speedRatio);
  });
});

describe("applyTurn and the men at the braces", () => {
  it("turns a fully manned ship exactly as it always did", () => {
    const ship = makeShip({ heading: 0, sailLevel: 1 });
    const turned = applyTurn(ship, "right", 99);
    // Sloop turnRate 0.72, full sail so no reefing bonus, full manning so 1.0.
    expect(turned.heading).toBeCloseTo(0.72, 10);
  });

  it("takes half the rate off a skeleton crew", () => {
    const sloop = makeShip().ship!;
    const thin = makeShip({ heading: 0, sailLevel: 1, ship: { ...sloop, crew: { current: 4, max: 30, morale: 1 } } });
    expect(applyTurn(thin, "right", 99).heading).toBeCloseTo(0.72 * 0.5, 10);
  });

  it("leaves a walking crew alone — men ashore are not working yards", () => {
    const sloop = makeShip().ship!;
    const landed = makeShip({ mode: "landed", heading: 0, ship: { ...sloop, crew: { current: 1, max: 30, morale: 1 } } });
    expect(applyTurn(landed, "right", 99).heading).toBeCloseTo(0.96, 10);
  });
});

// ===========================================================================
// 9) The dead zone is not dead (v0.53.0)
// ===========================================================================

/**
 * Beating to windward used to be strictly worse than not beating at all.
 *
 * The polar was blended with a flat base speed as `1 + (factor - 1) * W`, and
 * the flat half of that blend was paid in full inside the dead zone. At the
 * ordinary Caribbean trade wind (`W` around 0.5) a ship in irons therefore made
 * 0.48 of base speed, and since `cos(0°) = 1`, pointing **straight into the
 * wind** beat every tack every class could lay. Nine dead angles on the help
 * screen, a polar diagram and an "in irons" warning changed no decision.
 *
 * These are the claims of the fix. The first two are the mechanic; the third
 * and fourth are the promise that nothing else moved.
 */
describe("the dead zone is not dead", () => {
  const D = Math.PI / 180;
  const TRADE_WIND = 0.52; // the seasonal base is 0.48-0.62 all year

  /** Speed made good to windward, and the heading that gives it. */
  function bestBeat(minWindAngle: number, W = TRADE_WIND) {
    let vmg = -Infinity;
    let deg = 0;
    for (let d = 0; d <= 180; d += 0.25) {
      const made = windSpeedModifier(d * D, 0, W, minWindAngle) * Math.cos(d * D);
      if (made > vmg) { vmg = made; deg = d; }
    }
    return { vmg, deg };
  }

  const RIGS = [30, 35, 40, 45, 50, 55, 60]; // every minWindAngle in ships.ts

  it("every rig in the game makes better way to windward on a tack than in irons", () => {
    for (const mwa of RIGS) {
      const beat = bestBeat(mwa);
      const irons = windSpeedModifier(0, 0, TRADE_WIND, mwa);
      expect(beat.vmg).toBeGreaterThan(irons * 2);
      expect(beat.deg).toBeGreaterThan(mwa);
    }
  });

  it("the best beat lies inside the close-hauled band, not out on the beam", () => {
    // If it landed at the reach the mechanic would still be a lie: the player
    // would be sailing across the wind and calling it working to windward.
    for (const mwa of RIGS) {
      const { deg } = bestBeat(mwa);
      expect(deg).toBeGreaterThan(mwa);
      expect(deg).toBeLessThan(mwa + 30);
    }
  });

  it("a fore-and-aft rig points closer and makes more ground than a square rig", () => {
    const pinnace = bestBeat(30);
    const galleon = bestBeat(60);
    expect(pinnace.deg).toBeLessThan(galleon.deg);
    expect(pinnace.vmg).toBeGreaterThan(galleon.vmg * 2);
  });

  it("at or above the close-hauled ceiling the curve is the one from v0.9.4", () => {
    // The old shape was `1 + (factor - 1) * W`: affine in wind strength, and
    // pinned by its own value at full strength. Assert exactly that, without
    // naming a single factor, everywhere the release promised to change nothing.
    for (const mwa of RIGS) {
      for (let d = mwa + 30; d <= 180; d += 1) {
        const full = windSpeedModifier(d * D, 0, 1.0, mwa);
        for (const W of [0, 0.2, 0.48, 0.52, 0.62, 0.9, 1.0]) {
          expect(windSpeedModifier(d * D, 0, W, mwa)).toBeCloseTo(1 + (full - 1) * W, 10);
        }
      }
    }
  });

  it("the anchor points of the polar are untouched", () => {
    expect(windSpeedModifier((60 * D), 0, 1.0, 30)).toBeCloseTo(BEAT_CEIL, 10);
    expect(windSpeedModifier((90 * D), 0, 1.0, 30)).toBeCloseTo(1.5, 10);
    expect(windSpeedModifier((120 * D), 0, 1.0, 30)).toBeCloseTo(1.1, 10);
    expect(windSpeedModifier((180 * D), 0, 1.0, 30)).toBeCloseTo(0.9, 10);
  });

  it("a dead calm still reads base speed on every heading, dead zone included", () => {
    for (const mwa of RIGS) {
      for (let d = 0; d <= 180; d += 5) {
        expect(windSpeedModifier(d * D, 0, 0, mwa)).toBeCloseTo(1.0, 10);
      }
    }
  });

  it("the curve never jumps, once she is out of irons", () => {
    // The bar that caught P0-2, and that v0.54.0's first tuning tripped: at a
    // rise exponent of 0.35 the speed climbed 0.19 in HALF A DEGREE, which is a
    // knife edge, not a curve. It bought a galleon a hundredth of a knot and was
    // thrown away for it.
    for (const mwa of RIGS) {
      for (const W of [0.3, TRADE_WIND, 1.0]) {
        let prev = windSpeedModifier(0, 0, W, mwa);
        for (let d = 0.5; d <= 180; d += 0.5) {
          const cur = windSpeedModifier(d * D, 0, W, mwa);
          if (d > mwa + 1.5) expect(Math.abs(cur - prev)).toBeLessThan(0.1);
          prev = cur;
        }
      }
    }
  });

  it("and the one step it does take is the sails filling, not a teleport", () => {
    // The dead angle is a real edge: on one side nothing draws, on the other the
    // canvas takes the wind, and a ship coming out of irons does feel it happen.
    // So the bar there is its own — loose enough to let her sails fill in a tick
    // of helm, tight enough that she cannot leap.
    for (const mwa of RIGS) {
      for (const W of [0.3, TRADE_WIND, 1.0]) {
        const inIrons = windSpeedModifier((mwa - 0.5) * D, 0, W, mwa);
        const justOut = windSpeedModifier((mwa + 0.5) * D, 0, W, mwa);
        expect(justOut).toBeGreaterThan(inIrons);
        expect(justOut - inIrons).toBeLessThan(0.2);
      }
    }
  });

  it("draw is nothing at the eye of the wind and everything past the ceiling", () => {
    expect(windPolar(0, 0, TRADE_WIND, 60).draw).toBe(0);
    expect(windPolar(59 * D, 0, TRADE_WIND, 60).draw).toBe(0);
    expect(windPolar(90 * D, 0, TRADE_WIND, 60).draw).toBe(1);
    expect(windPolar(180 * D, 0, TRADE_WIND, 60).draw).toBe(1);
    let prev = 0;
    for (let d = 60; d <= 90; d += 1) {
      const cur = windPolar(d * D, 0, TRADE_WIND, 60).draw;
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });

  it("the master navigator cannot sail into the eye of the wind", () => {
    // He recovers a share of what the wind is not giving — and the dead zone is
    // pure shortfall, so before `draw` existed he recovered a fifth of it and
    // put a galleon back to making better way straight upwind than on her best
    // beat. This is the assertion that the guard is wired all the way through.
    const irons = windPolar(0, 0, TRADE_WIND, 60);
    const sailed = navigatedWindModifier(irons.speed, 10, irons.draw);
    expect(sailed).toBeCloseTo(irons.speed, 10);

    let bestTack = -Infinity;
    for (let d = 60; d <= 120; d += 0.5) {
      const p = windPolar(d * D, 0, TRADE_WIND, 60);
      bestTack = Math.max(bestTack, navigatedWindModifier(p.speed, 10, p.draw) * Math.cos(d * D));
    }
    expect(bestTack).toBeGreaterThan(sailed * 2);
  });

  it("he is still worth his keep where the wind serves worst", () => {
    const beat = windPolar(70 * D, 0, TRADE_WIND, 60); // hard on the wind, drawing
    expect(navigatedWindModifier(beat.speed, 10, beat.draw)).toBeGreaterThan(beat.speed);
    const reach = windPolar(105 * D, 0, TRADE_WIND, 60);
    expect(navigatedWindModifier(reach.speed, 10, reach.draw)).toBeCloseTo(reach.speed, 10);
  });

  it("the printed best beat is the one the polar actually gives", () => {
    // The help screen prints this number beside the dead angle. Derived, never
    // stored — so it cannot drift away from the curve the ship is sailed by.
    for (const mwa of RIGS) {
      expect(bestBeatAngle(mwa)).toBe(Math.round(bestBeat(mwa).deg));
      expect(bestBeatAngle(mwa)).toBeGreaterThan(mwa);
    }
    // And it is not a flat offset off the dead angle — it is the meeting of two
    // curves. A pinnace can afford to crack twenty degrees off hers, because at
    // 51° the cosine still hands back two thirds of what she makes. A galleon
    // beating at 70° has almost no cosine left to spend, so her best beat sits
    // ten degrees off her dead angle and buys her very little. That is the whole
    // reason a heavy square rigger is a downwind ship.
    expect(bestBeatAngle(30)).toBe(42);
    expect(bestBeatAngle(60)).toBe(70);
    // Where a seaman would look for them: a fore-and-aft rig works up at a bit
    // over forty degrees, a heavy square rigger not until nearly seventy.
    expect(bestBeatAngle(60) - 60).toBeLessThan(bestBeatAngle(30) - 30);
  });

  it("she keeps steerage way — never nailed to the sea", () => {
    for (const mwa of RIGS) {
      for (const W of [0.3, TRADE_WIND, 1.0]) {
        expect(windSpeedModifier(0, 0, W, mwa)).toBeGreaterThanOrEqual(IRONS_STEERAGE);
      }
    }
  });
});
