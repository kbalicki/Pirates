import { describe, it, expect } from "vitest";
import {
  plunderStatus,
  captainShare,
  applyOverdueMorale,
  dividePlunder,
  PLUNDER_INTERVAL_DAYS,
  PLUNDER_OVERDUE_MORALE_PER_DAY,
  PLUNDER_OVERDUE_MORALE_FLOOR,
  CAPTAIN_SHARE_MIN,
  CAPTAIN_SHARE_MAX,
  CREW_REMAINING_AFTER_SHARE,
} from "../PlunderSystem.ts";
import {
  computeScore,
  retire,
  hasRetired,
  fleetValue,
  RETIRED_FLAG,
} from "../RetirementSystem.ts";
import {
  ageStage,
  ageSkillModifier,
  effectiveSkill,
  effectiveSkills,
  captainAge,
  AGE_SEASONED_FROM,
  AGE_DECLINING_FROM,
  PHYSICAL_FLOOR,
  LEARNED_CEILING,
} from "../AgingSystem.ts";
import type { WorldState } from "../../model/WorldState.ts";
import { entityId, shipClassId, factionId } from "../../model/ids.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";

// ===========================================================================
// The v0.11.0 pressure loop: an unpaid crew, an ageing captain, an ending
// ===========================================================================

/**
 * These three systems only make sense together. The crew asks for its share on
 * a clock, the sword arm slows on another, and retirement is the move that
 * ends both. The tests below check each in isolation and then the one property
 * that matters across all three: there is a right moment to stop, and both
 * stopping too early and sailing too long cost you.
 */

const CREW_MAX = 30;

function makeWorld(over: {
  gold?: number; day?: number; crew?: number; morale?: number;
  lastPlunderDay?: number; location?: "sea" | "port";
  ranks?: Record<string, number>; reputation?: Record<string, number>;
  notoriety?: number; startAge?: number; flags?: Record<string, boolean>;
  fleet?: { classId: string }[];
} = {}): WorldState {
  const {
    gold = 1000, day = 100, crew = CREW_MAX, morale = 0.8,
    lastPlunderDay = 1, location = "port", ranks = {}, reputation = {},
    notoriety = 0, startAge = 20, flags = {}, fleet = [],
  } = over;
  return {
    version: 10,
    time: { day, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold,
      notoriety,
      reputation,
      ranks,
      location: { type: location, pos: { x: 0, y: 0 } },
      questLog: [],
      fleet: fleet.map(f => {
        const cls = SHIP_CLASSES[f.classId];
        return {
          classId: f.classId,
          hullHp: cls.hullMax, hullMax: cls.hullMax,
          sailsHp: cls.sailsMax, sailsMax: cls.sailsMax,
          cannons: cls.cannons,
        };
      }),
      lastPlunderDay,
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
          hullHp: 60, hullMax: 60,
          sailsHp: 50, sailsMax: 50,
          cannons: 8,
          cargoCap: 40,
          crew: { current: crew, max: CREW_MAX, morale },
          cargo: {},
        },
      },
    },
    ports: {},
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: flags,
    eventLog: [],
    worldEvents: [],
    knownEventIds: [],
    playerName: "Barbanegra",
    eraId: "pirates_sunset",
    startYear: 1690,
    gameSpeed: 1.2,
    captain: {
      nationality: "england",
      skills: { fencing: 8, gunnery: 8, navigation: 6, medicine: 6, charm: 6 },
      startAge,
      training: 0.5,
    },
  } as WorldState;
}

const shipOf = (w: WorldState) => w.entities.player_ship.ship!;

// ── PlunderSystem ─────────────────────────────────────────

describe("plunderStatus", () => {
  it("counts from the last division", () => {
    const s = plunderStatus(makeWorld({ day: 40, lastPlunderDay: 10 }));
    expect(s.daysSince).toBe(30);
    expect(s.daysUntilDue).toBe(PLUNDER_INTERVAL_DAYS - 30);
    expect(s.overdue).toBe(false);
  });

  it("goes overdue the day after the interval runs out", () => {
    const due = makeWorld({ day: 1 + PLUNDER_INTERVAL_DAYS, lastPlunderDay: 1 });
    const late = makeWorld({ day: 2 + PLUNDER_INTERVAL_DAYS, lastPlunderDay: 1 });
    expect(plunderStatus(due).overdue).toBe(false);
    expect(plunderStatus(late).overdue).toBe(true);
    expect(plunderStatus(late).daysOverdue).toBe(1);
  });

  it("treats a save with no record as counting from day one", () => {
    const w = makeWorld({ day: 30 });
    delete (w.player as { lastPlunderDay?: number }).lastPlunderDay;
    expect(plunderStatus(w).daysSince).toBe(29);
  });
});

describe("captainShare", () => {
  it("an unknown captain takes the traditional minimum", () => {
    expect(captainShare(makeWorld())).toBeCloseTo(CAPTAIN_SHARE_MIN, 10);
  });

  it("rank and fame both argue for more", () => {
    expect(captainShare(makeWorld({ ranks: { england: 3 } }))).toBeGreaterThan(CAPTAIN_SHARE_MIN);
    expect(captainShare(makeWorld({ notoriety: 200 }))).toBeGreaterThan(CAPTAIN_SHARE_MIN);
  });

  it("never takes more than the crew would ever stand for", () => {
    const greedy = makeWorld({ ranks: { england: 9, spain: 9 }, notoriety: 100000 });
    expect(captainShare(greedy)).toBeLessThanOrEqual(CAPTAIN_SHARE_MAX);
  });

  it("ignores negative notoriety", () => {
    expect(captainShare(makeWorld({ notoriety: -500 }))).toBeCloseTo(CAPTAIN_SHARE_MIN, 10);
  });
});

describe("applyOverdueMorale", () => {
  const overdue = (over = {}) =>
    makeWorld({ day: 200, lastPlunderDay: 1, ...over });

  it("does nothing while the crew is still patient", () => {
    const world = makeWorld({ day: 30, lastPlunderDay: 1 });
    expect(applyOverdueMorale(world)).toBe(world);
  });

  it("bleeds morale once the share is late", () => {
    const world = overdue({ morale: 0.8 });
    const after = applyOverdueMorale(world);
    expect(shipOf(after).crew.morale).toBeCloseTo(0.8 - PLUNDER_OVERDUE_MORALE_PER_DAY, 10);
  });

  it("stops at the floor rather than driving the crew to zero", () => {
    let w = overdue({ morale: 1.0 });
    for (let i = 0; i < 1000; i++) w = applyOverdueMorale(w);
    expect(shipOf(w).crew.morale).toBeCloseTo(PLUNDER_OVERDUE_MORALE_FLOOR, 10);
  });

  it("an already-floored crew is left alone", () => {
    const world = overdue({ morale: PLUNDER_OVERDUE_MORALE_FLOOR });
    expect(applyOverdueMorale(world)).toBe(world);
  });

  it("takes a couple of months to become really painful", () => {
    let w = overdue({ morale: 1.0 });
    for (let i = 0; i < 60; i++) w = applyOverdueMorale(w);
    const after = shipOf(w).crew.morale;
    expect(after).toBeLessThan(0.85);
    expect(after).toBeGreaterThan(0.6);
  });

  it("does not mutate the world it was handed", () => {
    const world = overdue();
    const before = structuredClone(world);
    applyOverdueMorale(world);
    expect(world).toEqual(before);
  });
});

describe("dividePlunder", () => {
  it("splits the gold and resets the clock", () => {
    const world = makeWorld({ gold: 1000, day: 200, lastPlunderDay: 1 });
    const r = dividePlunder(world);
    expect(r.error).toBeUndefined();
    expect(r.captainKept + r.crewPaid).toBe(1000);
    expect(r.world.player.gold).toBe(r.captainKept);
    expect(r.world.player.lastPlunderDay).toBe(200);
    expect(plunderStatus(r.world).overdue).toBe(false);
  });

  it("most of the crew takes its money ashore", () => {
    const r = dividePlunder(makeWorld({ crew: CREW_MAX }));
    expect(shipOf(r.world).crew.current).toBe(Math.round(CREW_MAX * CREW_REMAINING_AFTER_SHARE));
    expect(r.crewLeft).toBeGreaterThan(0);
  });

  it("always leaves at least one hand aboard", () => {
    const r = dividePlunder(makeWorld({ crew: 1 }));
    expect(shipOf(r.world).crew.current).toBeGreaterThanOrEqual(1);
  });

  it("those who stay are content", () => {
    const r = dividePlunder(makeWorld({ morale: 0.2 }));
    expect(shipOf(r.world).crew.morale).toBe(1);
  });

  it("a famous captain keeps more of the same haul", () => {
    const unknown = dividePlunder(makeWorld({ gold: 1000 }));
    const famous = dividePlunder(makeWorld({ gold: 1000, ranks: { england: 4 }, notoriety: 300 }));
    expect(famous.captainKept).toBeGreaterThan(unknown.captainKept);
  });

  it("refuses at sea — the men want a tavern for this", () => {
    const world = makeWorld({ location: "sea" });
    const r = dividePlunder(world);
    expect(r.error).toBe("not_in_port");
    expect(r.world).toBe(world);
  });

  it("refuses an empty chest", () => {
    expect(dividePlunder(makeWorld({ gold: 0 })).error).toBe("nothing_to_divide");
  });

  it("logs the division", () => {
    const r = dividePlunder(makeWorld());
    expect(r.world.eventLog.some(e => e.key === "event.plunder_divided")).toBe(true);
  });

  it("does not mutate the world it was handed", () => {
    const world = makeWorld();
    const before = structuredClone(world);
    dividePlunder(world);
    expect(world).toEqual(before);
  });
});

// ── AgingSystem ───────────────────────────────────────────

describe("ageStage", () => {
  it("names the three stages at their boundaries", () => {
    expect(ageStage(20)).toBe("prime");
    expect(ageStage(AGE_SEASONED_FROM - 1)).toBe("prime");
    expect(ageStage(AGE_SEASONED_FROM)).toBe("seasoned");
    expect(ageStage(AGE_DECLINING_FROM - 1)).toBe("seasoned");
    expect(ageStage(AGE_DECLINING_FROM)).toBe("declining");
  });
});

describe("ageSkillModifier", () => {
  it("a captain in his prime pays nothing", () => {
    for (const skill of ["fencing", "gunnery", "navigation", "charm", "medicine"] as const) {
      expect(ageSkillModifier(28, skill)).toBe(1);
    }
  });

  it("nothing changes overnight on the seasoned boundary", () => {
    expect(ageSkillModifier(AGE_SEASONED_FROM, "fencing")).toBeCloseTo(1, 10);
    expect(ageSkillModifier(AGE_SEASONED_FROM, "charm")).toBeCloseTo(1, 10);
  });

  it("the sword arm slows and never recovers", () => {
    let prev = Infinity;
    for (let age = 30; age <= 90; age++) {
      const m = ageSkillModifier(age, "fencing");
      expect(m).toBeLessThanOrEqual(prev + 1e-12);
      prev = m;
    }
    expect(ageSkillModifier(90, "fencing")).toBeCloseTo(PHYSICAL_FLOOR, 10);
  });

  it("experience accumulates and then levels off", () => {
    let prev = -Infinity;
    for (let age = 30; age <= 90; age++) {
      const m = ageSkillModifier(age, "navigation");
      expect(m).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = m;
    }
    expect(ageSkillModifier(90, "navigation")).toBeCloseTo(LEARNED_CEILING, 10);
  });

  it("a physical skill is never worth less than the floor", () => {
    for (let age = 20; age <= 120; age++) {
      expect(ageSkillModifier(age, "gunnery")).toBeGreaterThanOrEqual(PHYSICAL_FLOOR - 1e-12);
    }
  });
});

describe("effectiveSkill", () => {
  it("reads the stored value in the prime years", () => {
    const w = makeWorld({ startAge: 20, day: 1 });
    expect(captainAge(w)).toBe(20);
    expect(effectiveSkill(w, "fencing")).toBe(8);
  });

  it("an old captain is worse with a blade and better on the charts", () => {
    const old = makeWorld({ startAge: 20, day: 365 * 40 });
    expect(captainAge(old)).toBeGreaterThanOrEqual(AGE_DECLINING_FROM);
    expect(effectiveSkill(old, "fencing")).toBeLessThan(8);
    expect(effectiveSkill(old, "navigation")).toBeGreaterThan(6);
  });

  it("never runs past the top of the skill range", () => {
    const w = makeWorld({ startAge: 20, day: 365 * 50 });
    w.captain!.skills.navigation = 10;
    expect(effectiveSkill(w, "navigation")).toBeLessThanOrEqual(10);
  });

  it("never goes negative and survives a missing captain", () => {
    const w = { ...makeWorld(), captain: undefined } as unknown as WorldState;
    expect(effectiveSkill(w, "fencing")).toBe(0);
  });

  it("effectiveSkills reports all five at once", () => {
    const skills = effectiveSkills(makeWorld());
    expect(Object.keys(skills).sort()).toEqual(["charm", "fencing", "gunnery", "medicine", "navigation"]);
  });
});

// ── RetirementSystem ──────────────────────────────────────

describe("fleetValue", () => {
  it("counts the flagship and every consort at half the yard price", () => {
    const w = makeWorld({ fleet: [{ classId: "frigate" }] });
    const expected = Math.round((SHIP_CLASSES.sloop.buyPrice + SHIP_CLASSES.frigate.buyPrice) / 2);
    expect(fleetValue(w)).toBe(expected);
  });

  it("a captain with no ship is worth nothing in hulls", () => {
    const w = makeWorld();
    delete (w.entities as Record<string, unknown>).player_ship;
    expect(fleetValue(w)).toBe(0);
  });
});

describe("computeScore", () => {
  it("scores every source and adds them up", () => {
    const score = computeScore(makeWorld({ gold: 5000, ranks: { england: 3 }, notoriety: 50 }));
    expect(score.lines).toHaveLength(6);
    expect(score.total).toBe(score.lines.reduce((s, l) => s + l.points, 0));
  });

  it("more of anything is worth more", () => {
    const base = computeScore(makeWorld()).total;
    expect(computeScore(makeWorld({ gold: 50000 })).total).toBeGreaterThan(base);
    expect(computeScore(makeWorld({ ranks: { england: 5 } })).total).toBeGreaterThan(base);
    expect(computeScore(makeWorld({ notoriety: 400 })).total).toBeGreaterThan(base);
    expect(computeScore(makeWorld({ reputation: { england: 80 } })).total).toBeGreaterThan(base);
  });

  it("hostility is not worth negative points — it just does not help", () => {
    const hated = computeScore(makeWorld({ reputation: { spain: -100 } }));
    const unknown = computeScore(makeWorld({ reputation: {} }));
    expect(hated.total).toBe(unknown.total);
  });

  it("a longer career is worth more, up to a point", () => {
    const short = computeScore(makeWorld({ day: 365 * 5 })).total;
    const good = computeScore(makeWorld({ day: 365 * 28 })).total;
    expect(good).toBeGreaterThan(short);
  });

  it("sailing far past the decline starts costing more than it earns", () => {
    const atPeak = computeScore(makeWorld({ day: 365 * 29 })).total;
    const ancient = computeScore(makeWorld({ day: 365 * 60 })).total;
    expect(ancient).toBeLessThan(atPeak);
  });

  it("the longevity term never goes negative on its own", () => {
    for (const years of [0, 1, 30, 60, 90]) {
      const line = computeScore(makeWorld({ day: 365 * years + 1 })).lines
        .find(l => l.key === "retire.line_years")!;
      expect(line.points).toBeGreaterThanOrEqual(0);
    }
  });

  it("awards a title that rises with the total", () => {
    const poor = computeScore(makeWorld({ gold: 0, day: 2 }));
    const rich = computeScore(makeWorld({ gold: 200000, ranks: { england: 5 }, notoriety: 500 }));
    expect(poor.titleKey).toBe("retire.title_pauper");
    expect(rich.titleKey).toBe("retire.title_legend");
  });

  it("is pure — scoring changes nothing", () => {
    const world = makeWorld();
    const before = structuredClone(world);
    computeScore(world);
    expect(world).toEqual(before);
  });
});

describe("retire", () => {
  it("hangs up the sword and freezes the score into the world", () => {
    const world = makeWorld({ gold: 5000 });
    const r = retire(world);
    expect(r.error).toBeUndefined();
    expect(hasRetired(r.world)).toBe(true);
    expect(r.world.player.retirementScore).toBe(r.score.total);
    expect(r.world.eventLog.some(e => e.key === "event.retired")).toBe(true);
  });

  it("refuses at sea", () => {
    const world = makeWorld({ location: "sea" });
    const r = retire(world);
    expect(r.error).toBe("not_in_port");
    expect(hasRetired(r.world)).toBe(false);
  });

  it("cannot be done twice", () => {
    const once = retire(makeWorld()).world;
    const twice = retire(once);
    expect(twice.error).toBe("already_retired");
    expect(twice.world).toBe(once);
  });

  it("hasRetired reads the flag", () => {
    expect(hasRetired(makeWorld())).toBe(false);
    expect(hasRetired(makeWorld({ flags: { [RETIRED_FLAG]: true } }))).toBe(true);
  });
});

describe("the loop as a whole", () => {
  it("there is a best moment to stop, and it is not the last one", () => {
    const at = (years: number) => computeScore(makeWorld({ day: 365 * years + 1 })).total;
    const scores = [5, 10, 20, 28, 35, 50, 70].map(at);
    const best = Math.max(...scores);
    expect(scores[0]).toBeLessThan(best);          // stopping too early costs
    expect(scores[scores.length - 1]).toBeLessThan(best); // so does sailing forever
  });

  it("an ignored crew is measurably worse before it ever mutinies", () => {
    let w = makeWorld({ day: 200, lastPlunderDay: 1, morale: 1 });
    for (let i = 0; i < 90; i++) w = applyOverdueMorale(w);
    expect(shipOf(w).crew.morale).toBeLessThan(0.7);
    // ...and dividing puts it right again.
    const divided = dividePlunder({ ...w, player: { ...w.player, gold: 500 } });
    expect(shipOf(divided.world).crew.morale).toBe(1);
  });
});
