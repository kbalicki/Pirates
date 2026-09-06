import { describe, it, expect } from "vitest";
import {
  currentAt,
  currentSpeed,
  currentShare,
  currentBandAt,
  currentUnderPlayer,
} from "../CurrentSystem.ts";
import { CURRENTS, CURRENT_FEATHER, distToRect } from "../../data/currents.ts";
import { updateNavigation } from "../NavigationSystem.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { vecToHeading, headingDiff, vec2Length } from "../../services/Geometry.ts";
import { entityId } from "../../model/ids.ts";
import { EN } from "../../i18n/locales/en.ts";
import { PL } from "../../i18n/locales/pl.ts";
import type { EntityState } from "../../model/EntityState.ts";
import type { WorldState, Vec2, WeatherState } from "../../model/WorldState.ts";

// ===========================================================================
// CurrentSystem — the sea moves, and the same way every day (v0.41.0)
// ===========================================================================

/**
 * The TODO left one question open: does a current *set* the ship, or only
 * change her speed over ground? It sets her — the alternative is the same
 * number with the interesting half (being carried sideways) thrown away. What
 * it must never touch is the helm.
 */

const band = (id: string) => CURRENTS.find(c => c.id === id)!;
const centreOf = (id: string): Vec2 => {
  const r = band(id).rect;
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};
/** Far from every band on the chart. */
const OPEN_SEA: Vec2 = { x: 2900, y: 500 };

const calm: WeatherState = {
  windDirRad: 0, windStrength: 0, stormActive: false, stormTimer: 0,
};
const allWater = () => "sea" as const;

function ship(pos: Vec2, heading = 0, sailLevel = 1): EntityState {
  return {
    id: entityId("s"),
    kind: "ship",
    mode: "sailing",
    pos,
    vel: { x: 0, y: 0 },
    heading,
    sailLevel,
    depthOffset: 0,
    ship: {
      classId: "frigate",
      factionId: "england",
      hullHp: 120, hullMax: 120,
      sailsHp: 90, sailsMax: 90,
      cannons: 28, cargo: {}, cargoCap: 100,
      crew: { current: 80, max: 80, morale: 0.9 },
    },
  } as unknown as EntityState;
}

// ---------------------------------------------------------------------------

describe("where the water goes", () => {
  it("is still on the open sea, away from every band", () => {
    expect(currentAt(OPEN_SEA)).toEqual({ x: 0, y: 0 });
    expect(currentSpeed(OPEN_SEA)).toBe(0);
    expect(currentBandAt(OPEN_SEA)).toBeNull();
  });

  it("runs the way each band is named for, and not the other way", () => {
    // The convention bug this guards against would be invisible: a map wrong by
    // 180 degrees everywhere still looks like a map.
    for (const def of CURRENTS) {
      const c = currentAt(centreOf(def.id));
      const heading = vecToHeading(c);
      expect(Math.abs(headingDiff(heading, def.flowsToward)), def.id).toBeLessThan(0.5);
    }
  });

  it("carries a ship west along the Spanish Main and north through the Straits", () => {
    expect(currentAt(centreOf("caribbean")).x).toBeLessThan(0);      // westward
    expect(currentAt(centreOf("florida")).x).toBeGreaterThan(0);     // east...
    expect(currentAt(centreOf("florida")).y).toBeLessThan(0);        // ...and north
    expect(currentAt(centreOf("yucatan")).y).toBeLessThan(0);        // north
  });

  it("makes the Straits of Florida the strongest water on the chart", () => {
    const straits = currentSpeed(centreOf("florida"));
    for (const def of CURRENTS) {
      if (def.id === "florida") continue;
      expect(currentSpeed(centreOf(def.id)), def.id).toBeLessThanOrEqual(straits);
    }
    // ...and still only a third of what a fast frigate makes under full sail,
    // so it is a thing to allow for rather than a thing that sails the ship.
    expect(straits).toBeLessThan(SHIP_CLASSES.frigate.speedBase * 0.5);
    expect(straits).toBeGreaterThan(0);
  });

  it("has a soft edge, so nothing is shoved sideways crossing a line", () => {
    const r = band("florida").rect;
    const inside = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    const edge = { x: r.x + r.w / 2, y: r.y - 1 };
    const feathered = { x: r.x + r.w / 2, y: r.y - CURRENT_FEATHER / 2 };
    const outside = { x: r.x + r.w / 2, y: r.y - CURRENT_FEATHER - 5 };

    expect(currentShare(inside, band("florida"))).toBe(1);
    expect(currentShare(edge, band("florida"))).toBeGreaterThan(0.98);
    expect(currentShare(feathered, band("florida"))).toBeCloseTo(0.5, 1);
    expect(currentShare(outside, band("florida"))).toBe(0);
  });

  it("adds where two bands meet instead of one of them winning", () => {
    // A junction has to be a turn, not a seam.
    const r = band("yucatan").rect;
    const junction = { x: r.x + r.w / 2, y: r.y + 20 };
    const overlapping = CURRENTS.filter(d => currentShare(junction, d) > 0);
    if (overlapping.length > 1) {
      const sum = currentAt(junction);
      const strongest = overlapping.reduce((a, b) => (b.strength > a.strength ? b : a));
      expect(vecToHeading(sum)).not.toBeCloseTo(strongest.flowsToward, 3);
    }
    expect(distToRect(junction, r)).toBe(0);
  });

  it("answers the same thing every time, so nothing about it is saved", () => {
    expect(currentAt(centreOf("caribbean"))).toEqual(currentAt(centreOf("caribbean")));
  });
});

describe("what it does to a ship", () => {
  it("moves her without touching her helm", () => {
    const at = centreOf("florida");
    const before = ship(at, Math.PI);   // heading due south, straight against it
    const after = updateNavigation(before, calm, allWater, 10, 1, currentAt(at));
    expect(after.heading).toBe(before.heading);
    expect(after.pos).not.toEqual(before.pos);
  });

  it("sets a ship lying under bare poles — a current is not a wind", () => {
    const at = centreOf("florida");
    const drifting = ship(at, 0, 0);
    const after = updateNavigation(drifting, calm, allWater, 100, 1, currentAt(at));
    expect(after.pos.x).toBeGreaterThan(at.x);
    expect(after.pos.y).toBeLessThan(at.y);
    // Bare poles and no wind: every bit of that is the sea.
    expect(vec2Length(after.vel!)).toBeCloseTo(currentSpeed(at), 6);
  });

  it("makes the same passage faster one way than the other", () => {
    const at = centreOf("caribbean");
    const set = currentAt(at);
    const west = updateNavigation(ship(at, Math.PI * 1.5), calm, allWater, 100, 1, set);
    const east = updateNavigation(ship(at, Math.PI * 0.5), calm, allWater, 100, 1, set);
    expect(vec2Length(west.vel!)).toBeGreaterThan(vec2Length(east.vel!));
  });

  it("leaves the open sea exactly as it was before this release", () => {
    const before = ship(OPEN_SEA, 1);
    const withCurrent = updateNavigation(before, calm, allWater, 10, 1, currentAt(OPEN_SEA));
    const without = updateNavigation(before, calm, allWater, 10);
    expect(withCurrent.pos).toEqual(without.pos);
  });
});

describe("who is being set", () => {
  function world(pos: Vec2, mode: "sailing" | "landed"): WorldState {
    const shipId = entityId("player_ship");
    return {
      player: { shipId, location: { type: "sea", pos } },
      entities: { [shipId as string]: { ...ship(pos), mode } },
    } as unknown as WorldState;
  }

  it("carries a ship at sea", () => {
    const at = centreOf("gulf_stream");
    expect(currentUnderPlayer(world(at, "sailing"))).toEqual(currentAt(at));
  });

  it("leaves a captain who is ashore where he is", () => {
    expect(currentUnderPlayer(world(centreOf("gulf_stream"), "landed"))).toEqual({ x: 0, y: 0 });
  });
});

describe("what the chart calls it", () => {
  it("names the band a ship is in", () => {
    expect(currentBandAt(centreOf("florida"))!.id).toBe("florida");
    expect(currentBandAt(centreOf("caribbean"))!.id).toBe("caribbean");
  });

  it("has a name for every band, in both languages", () => {
    for (const def of CURRENTS) {
      expect(EN[def.nameKey], def.id).toBeDefined();
      expect(PL[def.nameKey], def.id).toBeDefined();
    }
    for (const key of ["currents.shown", "currents.hidden"]) {
      expect(EN[key], key).toBeDefined();
      expect(PL[key], key).toBeDefined();
    }
  });

  it("gives every band a distinct id", () => {
    expect(new Set(CURRENTS.map(c => c.id)).size).toBe(CURRENTS.length);
  });
});
