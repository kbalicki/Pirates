import { describe, it, expect } from "vitest";
import {
  isStormy,
  stormVisionMultiplier,
  stormRigLoss,
  tickStormDamage,
  stormWarning,
  STORM_SAFE_SAIL,
  STORM_VISION_SHARE,
  STORM_RIG_SHARE_PER_TICK,
} from "../StormSystem.ts";
import { updateWeather } from "../WeatherSystem.ts";
import { entityId } from "../../model/ids.ts";
import { EN } from "../../i18n/locales/en.ts";
import { PL } from "../../i18n/locales/pl.ts";
import type { WorldState } from "../../model/WorldState.ts";

// ===========================================================================
// StormSystem — the squall that was there all along (v0.38.0)
// ===========================================================================

/**
 * `WeatherState.stormActive` has been rolled, timed, given +0.3 of wind and
 * written into every save since the first commit, and **nothing read it**. The
 * third time this codebase has found a producer with no consumer, after
 * `crewMul` and `treaty_signed`.
 *
 * What is asserted here is the decision it buys: canvas is what a squall tears,
 * Reefed is free, and the answer costs hours instead of topmasts.
 */

function makeWorld(over: {
  storm?: boolean;
  sail?: number;
  mode?: "sailing" | "landed";
  fleet?: { sailsHp: number; sailsMax: number }[];
} = {}): WorldState {
  const shipId = entityId("player_ship");
  return {
    version: 12,
    time: { day: 10, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"),
      shipId,
      gold: 100,
      notoriety: 0,
      reputation: {},
      ranks: {},
      location: { type: "sea", pos: { x: 0, y: 0 } },
      questLog: [],
      fleet: (over.fleet ?? []).map((f, i) => ({
        classId: "sloop",
        hullHp: 100, hullMax: 100,
        sailsHp: f.sailsHp, sailsMax: f.sailsMax,
        cannons: 8, crew: 30,
        __i: i,
      })),
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
    },
    entities: {
      [shipId as string]: {
        id: shipId,
        kind: "ship",
        mode: over.mode ?? "sailing",
        pos: { x: 0, y: 0 },
        vel: { x: 0, y: 0 },
        heading: 0,
        sailLevel: over.sail ?? 1,
        depthOffset: 0,
        ship: {
          classId: "frigate",
          factionId: "england",
          hullHp: 120, hullMax: 120,
          sailsHp: 90, sailsMax: 90,
          cannons: 28, cargo: {}, cargoCap: 100,
          crew: { current: 80, max: 80, morale: 0.9 },
        },
      },
    },
    ports: {},
    weather: {
      windDirRad: 0,
      windStrength: 0.5,
      stormActive: over.storm ?? false,
      stormTimer: over.storm ? 400 : 0,
    },
    worldFlags: {},
    eventLog: [],
    worldEvents: [],
    knownEventIds: [],
    playerName: "Captain",
    eraId: "pirates_sunset",
    startYear: 1690,
    gameSpeed: 1.2,
  } as unknown as WorldState;
}

const rig = (w: WorldState) => w.entities[w.player.shipId as string].ship!.sailsHp;

describe("what a squall takes", () => {
  it("tears nothing at all in fair weather, whatever canvas is set", () => {
    const w = makeWorld({ storm: false, sail: 1 });
    expect(tickStormDamage(w, 100)).toBe(w);
  });

  it("tears nothing at Reefed, which is the whole of the answer", () => {
    const w = makeWorld({ storm: true, sail: STORM_SAFE_SAIL });
    expect(tickStormDamage(w, 100)).toBe(w);
    expect(stormRigLoss(STORM_SAFE_SAIL, 90, 100)).toBe(0);
    expect(stormRigLoss(0, 90, 100)).toBe(0);
  });

  it("tears most at full sail and half as much at Half", () => {
    const full = stormRigLoss(1, 90, 100);
    const half = stormRigLoss(0.75, 90, 100);
    expect(full).toBeCloseTo(90 * STORM_RIG_SHARE_PER_TICK * 100, 6);
    expect(half).toBeCloseTo(full / 2, 6);
  });

  it("costs a sloop and a galleon the same share of their canvas", () => {
    expect(stormRigLoss(1, 60, 100) / 60).toBeCloseTo(stormRigLoss(1, 200, 100) / 200, 9);
  });

  it("takes it out of the ship when he rides one out under full sail", () => {
    const w = makeWorld({ storm: true, sail: 1 });
    const after = tickStormDamage(w, 100);
    expect(rig(after)).toBeLessThan(rig(w));
    expect(rig(after)).toBeCloseTo(90 - stormRigLoss(1, 90, 100), 6);
  });

  it("never tears past bare poles", () => {
    const w = makeWorld({ storm: true, sail: 1 });
    const after = tickStormDamage(w, 100000);
    expect(rig(after)).toBe(0);
  });

  it("leaves a captain who is ashore alone", () => {
    const w = makeWorld({ storm: true, sail: 1, mode: "landed" });
    expect(tickStormDamage(w, 100)).toBe(w);
  });

  it("tears the consorts' canvas too, at the flagship's sail level", () => {
    const w = makeWorld({ storm: true, sail: 1, fleet: [{ sailsHp: 60, sailsMax: 60 }] });
    const after = tickStormDamage(w, 100);
    const consort = after.player.fleet![0];
    expect(consort.sailsHp).toBeCloseTo(60 - stormRigLoss(1, 60, 100), 6);
    // ...and by the same share as the flagship, because the fleet sails as one.
    expect((60 - consort.sailsHp) / 60).toBeCloseTo((90 - rig(after)) / 90, 9);
  });

  it("leaves the consorts alone when the flagship is reefed", () => {
    const w = makeWorld({ storm: true, sail: 0.5, fleet: [{ sailsHp: 60, sailsMax: 60 }] });
    expect(tickStormDamage(w, 100).player.fleet![0].sailsHp).toBe(60);
  });
});

describe("what a squall hides", () => {
  it("cuts the spyglass, which is what makes weather change the map", () => {
    expect(stormVisionMultiplier(makeWorld({ storm: true }).weather)).toBe(STORM_VISION_SHARE);
    expect(stormVisionMultiplier(makeWorld({ storm: false }).weather)).toBe(1);
    expect(STORM_VISION_SHARE).toBeLessThan(1);
  });

  it("knows whether it is blowing at all", () => {
    expect(isStormy(makeWorld({ storm: true }).weather)).toBe(true);
    expect(isStormy(makeWorld({ storm: false }).weather)).toBe(false);
  });
});

describe("the timer that ran away", () => {
  it("stops at nought instead of counting down for the life of the save", () => {
    // It did not. Once a squall ended, `stormTimer` went on being decremented
    // every tick and reached five figures below zero — invisible precisely
    // because nothing read it (v0.38.0).
    const calm = { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 };
    let weather = calm;
    let rng = { seed: 5, state: 5 };
    for (let i = 0; i < 200; i++) {
      const step = updateWeather(weather, rng, 10, 1, 1, 31);
      weather = step.weather;
      rng = step.rng;
      expect(weather.stormTimer).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("what the screen says about it", () => {
  it("says nothing in fair weather", () => {
    expect(stormWarning(makeWorld({ storm: false, sail: 1 }))).toBeNull();
  });

  it("warns when he is carrying too much, and only then", () => {
    expect(stormWarning(makeWorld({ storm: true, sail: 1 }))).toEqual({
      key: "weather.storm_canvas", danger: true, severity: 0, fog: 0,
    });
    expect(stormWarning(makeWorld({ storm: true, sail: STORM_SAFE_SAIL }))).toEqual({
      key: "weather.storm", danger: false, severity: 0, fog: 0,
    });
  });

  it("tells a captain who has already reefed that he is doing the right thing", () => {
    // Not silence: he needs to know the squall is still on him, or shaking out
    // sail again looks free.
    expect(stormWarning(makeWorld({ storm: true, sail: 0 }))!.danger).toBe(false);
  });

  it("has every line it can print, in both languages", () => {
    for (const key of [
      "weather.storm",
      "weather.storm_canvas",
      "weather.storm_toast",
      "weather.storm_over",
      "weather.log_storm",
      "weather.log_storm_passed",
    ]) {
      expect(EN[key], key).toBeDefined();
      expect(PL[key], key).toBeDefined();
    }
  });
});
