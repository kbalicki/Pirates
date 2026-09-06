import { describe, it, expect } from "vitest";
import {
  woundedFrom,
  survivalShare,
  tendSickBay,
  tendWounded,
  WOUNDED_SHARE,
  SURVIVAL_BASE,
} from "../SurgeonSystem.ts";
import type { WorldState, FleetShip } from "../../model/WorldState.ts";
import { entityId, shipClassId, factionId } from "../../model/ids.ts";

// ===========================================================================
// SurgeonSystem — medicine finally decides something (v0.47.0)
// ===========================================================================

/**
 * The thing under test is not really the arithmetic — it is that a number which
 * sat on the character sheet for the whole life of the project now changes what
 * happens to a crew. So the tests that matter are the comparisons: the same
 * fight, the same losses, two different captains.
 */

const CREW_MAX = 100;

function makeWorld(over: {
  crew?: number; wounded?: number; medicine?: number; fleet?: FleetShip[];
} = {}): WorldState {
  const { crew = 60, wounded = 0, medicine = 5, fleet = [] } = over;
  return {
    version: 12,
    time: { day: 100, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
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
          hullHp: 100, hullMax: 100,
          sailsHp: 80, sailsMax: 80,
          cannons: 20,
          cargoCap: 80,
          crew: { current: crew, max: CREW_MAX, morale: 0.8 },
          cargo: {},
          wounded,
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
      skills: { fencing: 5, gunnery: 5, navigation: 5, medicine, charm: 5 },
      // Twenty, so `effectiveSkill` hands the medicine back untouched and the
      // numbers below are the ones the constants say they are.
      startAge: 20,
      training: 0.5,
    },
  } as WorldState;
}

const shipOf = (w: WorldState) => w.entities.player_ship.ship!;

/** Empty a sick bay one day at a time. Returns who walked out of it. */
function drain(pool: number, medicine: number): { back: number; dead: number; days: number } {
  let left = pool, back = 0, dead = 0, days = 0;
  while (left > 0 && days < 500) {
    const d = tendSickBay(left, medicine);
    back += d.recovered;
    dead += d.died;
    left = d.remaining;
    days++;
  }
  return { back, dead, days };
}

describe("woundedFrom", () => {
  it("carries a fixed share of the fallen below, not all of them", () => {
    expect(woundedFrom(100)).toBe(Math.floor(100 * WOUNDED_SHARE));
    expect(woundedFrom(100)).toBeLessThan(100);
  });

  it("is nothing at all when nobody fell", () => {
    expect(woundedFrom(0)).toBe(0);
    expect(woundedFrom(-5)).toBe(0);
  });
});

describe("survivalShare", () => {
  it("is the whole difference between a surgeon and a man with a saw", () => {
    expect(survivalShare(0)).toBeCloseTo(SURVIVAL_BASE, 5);
    expect(survivalShare(10)).toBeGreaterThan(0.85);
    expect(survivalShare(10) / survivalShare(0)).toBeGreaterThan(1.9);
  });

  it("rises with the skill and never leaves 0..1", () => {
    for (let m = 0; m < 10; m++) {
      expect(survivalShare(m + 1)).toBeGreaterThan(survivalShare(m));
    }
    expect(survivalShare(-5)).toBeGreaterThanOrEqual(0);
    expect(survivalShare(99)).toBeLessThanOrEqual(1);
  });
});

describe("tendSickBay", () => {
  it("decides at least one man a day, so nobody lies below for ever", () => {
    // A thirty-percent share of three rounds to one, not to nothing.
    const day = tendSickBay(3, 5);
    expect(day.tended).toBeGreaterThanOrEqual(1);
    expect(day.remaining).toBeLessThan(3);
  });

  it("never decides more men than are lying there", () => {
    const day = tendSickBay(1, 10);
    expect(day.tended).toBe(1);
    expect(day.recovered + day.died).toBe(1);
    expect(day.remaining).toBe(0);
  });

  it("accounts for every man: back on the roll, dead, or still below", () => {
    for (const pool of [1, 3, 8, 20, 60, 120]) {
      const day = tendSickBay(pool, 7);
      expect(day.recovered + day.died + day.remaining).toBe(pool);
    }
  });

  it("is a no-op for an empty sick bay", () => {
    expect(tendSickBay(0, 10)).toEqual({ tended: 0, recovered: 0, died: 0, remaining: 0 });
  });
});

describe("a sick bay drained day by day", () => {
  /**
   * The measurement the release is built on. Of every hundred men who fall,
   * forty reach the surgeon; a captain with no medicine gets seventeen of them
   * back on the roll and one who studied it gets thirty-seven.
   */
  it("gives back roughly twice as many men to a good surgeon", () => {
    const below = woundedFrom(100);
    const poor = drain(below, 0);
    const good = drain(below, 10);
    expect(poor.back).toBeGreaterThan(10);
    expect(good.back).toBeGreaterThan(poor.back * 1.8);
    expect(good.back).toBeLessThanOrEqual(below);
  });

  it("lands close to the share the constants promise, for a big enough fight", () => {
    for (const m of [0, 5, 10]) {
      const below = 120;
      const r = drain(below, m);
      expect(r.back / below).toBeCloseTo(survivalShare(m), 1);
      expect(r.back + r.dead).toBe(below);
    }
  });

  it("clears in a fortnight or so, whoever the surgeon is", () => {
    // The pacing matters: the sick bay should empty over the passage home, not
    // over a career and not overnight.
    expect(drain(60, 0).days).toBeGreaterThan(5);
    expect(drain(60, 10).days).toBeLessThan(20);
  });
});

describe("tendWounded", () => {
  it("does nothing at all on a day with nobody below", () => {
    const w = makeWorld({ wounded: 0 });
    const r = tendWounded(w);
    expect(r.recovered).toBe(0);
    expect(r.died).toBe(0);
    expect(r.world).toBe(w);
  });

  it("puts recovered men back on the muster roll", () => {
    const before = makeWorld({ crew: 60, wounded: 20, medicine: 10 });
    const after = tendWounded(before).world;
    expect(shipOf(after).crew.current).toBeGreaterThan(60);
    expect(shipOf(after).wounded).toBeLessThan(20);
  });

  it("loses men who never get up, and they leave the sick bay too", () => {
    const before = makeWorld({ crew: 60, wounded: 20, medicine: 0 });
    const r = tendWounded(before);
    expect(r.died).toBeGreaterThan(0);
    expect(shipOf(r.world).wounded).toBeLessThan(20);
  });

  it("the same losses under two captains end as two different crews", () => {
    let poor = makeWorld({ crew: 40, wounded: woundedFrom(60), medicine: 0 });
    let good = makeWorld({ crew: 40, wounded: woundedFrom(60), medicine: 10 });
    for (let d = 0; d < 40; d++) {
      poor = tendWounded(poor).world;
      good = tendWounded(good).world;
    }
    expect(shipOf(poor).wounded).toBe(0);
    expect(shipOf(good).wounded).toBe(0);
    expect(shipOf(good).crew.current).toBeGreaterThan(shipOf(poor).crew.current);
  });

  it("puts a man who is fit back on the roll and never re-tends him", () => {
    // No berth check on purpose. The wounded came off a roll that had room for
    // them, so they cannot overfill her — and an earlier draft that clamped to
    // `crew.max` kept the overflow below, tended it again the next day, and
    // eventually killed men who had already recovered.
    let w = makeWorld({ crew: 12, wounded: 18, medicine: 10 });
    let guard = 0;
    while ((shipOf(w).wounded ?? 0) > 0 && guard++ < 200) w = tendWounded(w).world;
    expect(shipOf(w).wounded).toBe(0);
    expect(shipOf(w).crew.current).toBeGreaterThan(12 + 12);
  });

  it("makes the same rounds of a consort's sick bay", () => {
    const consort: FleetShip = {
      classId: "sloop",
      hullHp: 60, hullMax: 60,
      sailsHp: 50, sailsMax: 50,
      cannons: 8,
      crew: 20,
      wounded: 12,
    };
    const after = tendWounded(makeWorld({ wounded: 0, medicine: 10, fleet: [consort] })).world;
    const tended = (after.player.fleet ?? [])[0];
    expect(tended.wounded).toBeLessThan(12);
    expect(tended.crew!).toBeGreaterThan(20);
  });

  it("leaves a save that never had a sick bay exactly as it was", () => {
    // The `wounded` field is optional on purpose — an old save has nobody
    // below and needs no migration step to say so.
    const w = makeWorld();
    delete (w.entities.player_ship.ship as { wounded?: number }).wounded;
    const r = tendWounded(w);
    expect(r.world).toBe(w);
  });
});
