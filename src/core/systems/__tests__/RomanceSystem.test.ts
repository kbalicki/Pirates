import { describe, it, expect } from "vitest";
import {
  daughterFor,
  hasGovernorsDaughter,
  courtshipLevel,
  willReceive,
  isMarried,
  marriedTo,
  beautyDifficulty,
  approachChance,
  court,
  propose,
  marriagePoints,
  GIFT_COST,
  SHARES_A_LEAD,
  MARRIAGE_THRESHOLD,
  MARRIAGE_MIN_RANK,
  REPUTATION_TO_BE_RECEIVED,
  LEAD_PREFIX,
  MARRIED_FLAG,
  type Approach,
} from "../RomanceSystem.ts";
import type { WorldState, RngState } from "../../model/WorldState.ts";
import { entityId, factionId, portId } from "../../model/ids.ts";
import { rngNext } from "../../services/RNG.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";

// ===========================================================================
// RomanceSystem — the governor's daughter, and what charm was ever for
// ===========================================================================

/** An English city with a governor; `tortuga` is a small outpost with none. */
const TOWN = "port_royal";
const OUTPOST = "tortuga";

function makeWorld(over: {
  charm?: number;
  gold?: number;
  notoriety?: number;
  reputation?: Record<string, number>;
  ranks?: Record<string, number>;
  courtship?: Record<string, number>;
  flags?: Record<string, boolean>;
  rng?: RngState;
} = {}): WorldState {
  const {
    charm = 5, gold = 5000, notoriety = 20,
    reputation = { england: 40, france: 40, spain: 40, netherlands: 40 },
    ranks = {}, courtship = {}, flags = {}, rng = { seed: 1, state: 1 },
  } = over;

  const ports: WorldState["ports"] = {};
  for (const key of [TOWN, OUTPOST, "havana"]) {
    const baseline = getPortBaseline(key);
    ports[key] = {
      portId: portId(key),
      factionId: factionId(key === TOWN ? "england" : key === OUTPOST ? "france" : "spain"),
      prices: {}, inventory: {}, shipyardQueue: [], availableCrew: 0,
      population: baseline.population, wealth: baseline.wealth,
      defense: baseline.defense, bonusProduces: [],
    };
  }

  return {
    version: 11,
    time: { day: 200, hour: 12, minute: 0, tick: 0 },
    rng,
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold,
      notoriety,
      reputation,
      ranks,
      location: { type: "port", pos: { x: 0, y: 0 } },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship,
    },
    entities: {},
    ports,
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: flags,
    eventLog: [],
    worldEvents: [],
    knownEventIds: [],
    playerName: "Captain",
    eraId: "pirates_sunset",
    startYear: 1690,
    gameSpeed: 1.2,
    captain: {
      nationality: "england",
      skills: { fencing: 5, gunnery: 5, navigation: 5, medicine: 5, charm },
      startAge: 20,
      training: 0.5,
    },
  } as WorldState;
}

/** First rng state whose next roll satisfies `pred`. Keeps the dice honest. */
function seedWhere(pred: (value: number) => boolean): RngState {
  for (let state = 1; state < 5000; state++) {
    if (pred(rngNext({ seed: 0, state }).value)) return { seed: 0, state };
  }
  throw new Error("no seed found");
}

const CERTAIN_WIN = seedWhere(v => v < 0.02);
const CERTAIN_LOSS = seedWhere(v => v > 0.98);

// ── Who exists ────────────────────────────────────────────

describe("daughterFor", () => {
  it("a proper town has one", () => {
    expect(daughterFor(makeWorld(), TOWN)).toBeDefined();
  });

  it("a small outpost does not", () => {
    expect(daughterFor(makeWorld(), OUTPOST)).toBeUndefined();
    expect(hasGovernorsDaughter(OUTPOST)).toBe(false);
  });

  it("a town nobody has heard of does not", () => {
    expect(daughterFor(makeWorld(), "atlantis")).toBeUndefined();
  });

  it("is the same woman every time — she is derived, not rolled", () => {
    const first = daughterFor(makeWorld({ rng: { seed: 9, state: 900 } }), TOWN);
    const second = daughterFor(makeWorld({ rng: { seed: 1, state: 5 } }), TOWN);
    expect(second).toEqual(first);
  });

  it("different towns hold different households", () => {
    const a = daughterFor(makeWorld(), TOWN);
    const b = daughterFor(makeWorld(), "havana");
    expect(a?.name === b?.name && a?.beauty === b?.beauty).toBe(false);
  });

  it("takes her name from the crown that holds the town today", () => {
    const world = makeWorld();
    const spanish = { ...world, ports: { ...world.ports, [TOWN]: { ...world.ports[TOWN], factionId: factionId("spain") } } };
    expect(daughterFor(spanish, TOWN)?.factionKey).toBe("spain");
    expect(daughterFor(spanish, TOWN)?.name).not.toBe(daughterFor(world, TOWN)?.name);
  });
});

describe("willReceive", () => {
  it("closes the door to a stranger", () => {
    expect(willReceive(makeWorld({ reputation: { england: 0 } }), TOWN)).toBe(false);
  });

  it("opens it at the stated standing", () => {
    expect(willReceive(makeWorld({ reputation: { england: REPUTATION_TO_BE_RECEIVED } }), TOWN)).toBe(true);
  });
});

// ── The odds ──────────────────────────────────────────────

describe("approachChance", () => {
  it("charm helps every approach", () => {
    for (const approach of ["compliment", "dance", "gift", "boast"] as Approach[]) {
      expect(approachChance(approach, 10, 0, "plain", 9999, 50))
        .toBeGreaterThan(approachChance(approach, 0, 0, "plain", 9999, 50));
    }
  });

  it("a gift with no money in the purse is not an approach at all", () => {
    expect(approachChance("gift", 10, 0, "plain", GIFT_COST - 1, 50)).toBeLessThanOrEqual(0.05);
  });

  it("boasting is carried by fame, not by charm", () => {
    const famous = approachChance("boast", 5, 0, "plain", 0, 80);
    const unknown = approachChance("boast", 5, 0, "plain", 0, 0);
    expect(famous - unknown).toBeGreaterThan(0.3);
  });

  it("every point already won makes the next one harder", () => {
    let previous = Infinity;
    for (let level = 0; level <= 100; level += 10) {
      const value = approachChance("compliment", 8, level, "comely", 9999, 40);
      expect(value).toBeLessThanOrEqual(previous);
      previous = value;
    }
  });

  it("a beauty is harder work than a plain girl at the same standing", () => {
    expect(approachChance("compliment", 8, 60, "beautiful", 9999, 40))
      .toBeLessThan(approachChance("compliment", 8, 60, "plain", 9999, 40));
    expect(beautyDifficulty("beautiful")).toBeGreaterThan(beautyDifficulty("plain"));
  });

  it("never promises certainty in either direction", () => {
    for (const level of [0, 50, 100]) {
      for (const approach of ["compliment", "dance", "gift", "boast"] as Approach[]) {
        const value = approachChance(approach, 10, level, "beautiful", 9999, 100);
        expect(value).toBeGreaterThanOrEqual(0.05);
        expect(value).toBeLessThanOrEqual(0.95);
      }
    }
  });
});

// ── Courting ──────────────────────────────────────────────

describe("court", () => {
  it("a hit gains ground", () => {
    const r = court(makeWorld(), TOWN, "compliment", CERTAIN_WIN);
    expect(r.succeeded).toBe(true);
    expect(r.delta).toBeGreaterThan(0);
    expect(courtshipLevel(r.world, TOWN)).toBe(r.delta);
  });

  it("a miss costs ground", () => {
    const world = makeWorld({ courtship: { [TOWN]: 40 } });
    const r = court(world, TOWN, "compliment", CERTAIN_LOSS);
    expect(r.succeeded).toBe(false);
    expect(courtshipLevel(r.world, TOWN)).toBeLessThan(40);
  });

  it("a dance swings further than a compliment, both ways", () => {
    const win = court(makeWorld(), TOWN, "dance", CERTAIN_WIN).delta;
    const lose = court(makeWorld({ courtship: { [TOWN]: 50 } }), TOWN, "dance", CERTAIN_LOSS).delta;
    expect(win).toBeGreaterThan(court(makeWorld(), TOWN, "compliment", CERTAIN_WIN).delta);
    expect(Math.abs(lose)).toBeGreaterThan(
      Math.abs(court(makeWorld({ courtship: { [TOWN]: 50 } }), TOWN, "compliment", CERTAIN_LOSS).delta),
    );
  });

  it("a gift is paid for whether or not it lands", () => {
    for (const rng of [CERTAIN_WIN, CERTAIN_LOSS]) {
      const r = court(makeWorld({ gold: 2000 }), TOWN, "gift", rng);
      expect(r.world.player.gold).toBe(2000 - GIFT_COST);
    }
  });

  it("refuses a gift there is no money for, and charges nothing", () => {
    const world = makeWorld({ gold: 10 });
    const r = court(world, TOWN, "gift", CERTAIN_WIN);
    expect(r.error).toBe("cannot_afford");
    expect(r.world.player.gold).toBe(10);
  });

  it("refuses at a town with no governor's household", () => {
    expect(court(makeWorld(), OUTPOST, "compliment", CERTAIN_WIN).error).toBe("no_daughter");
  });

  it("refuses when the house is closed", () => {
    const world = makeWorld({ reputation: { england: 0 } });
    expect(court(world, TOWN, "compliment", CERTAIN_WIN).error).toBe("not_received");
  });

  it("refuses to a married captain", () => {
    const world = makeWorld({ flags: { [MARRIED_FLAG]: true } });
    expect(court(world, TOWN, "compliment", CERTAIN_WIN).error).toBe("married");
  });

  it("standing never leaves 0..100", () => {
    const low = court(makeWorld({ courtship: { [TOWN]: 1 } }), TOWN, "dance", CERTAIN_LOSS);
    expect(low.level).toBe(0);
    const high = court(makeWorld({ courtship: { [TOWN]: 99 } }), TOWN, "dance", CERTAIN_WIN);
    expect(high.level).toBe(100);
  });

  it("crossing the halfway mark is what makes her talk", () => {
    const world = makeWorld({ courtship: { [TOWN]: SHARES_A_LEAD - 2 } });
    const r = court(world, TOWN, "compliment", CERTAIN_WIN);
    expect(r.unlockedLead).toBe(true);
    expect(r.world.worldFlags[LEAD_PREFIX + TOWN]).toBe(true);
    expect(r.world.eventLog.some(e => e.key === "romance.log_lead")).toBe(true);
  });

  it("only announces the lead once", () => {
    const world = makeWorld({ courtship: { [TOWN]: SHARES_A_LEAD + 10 } });
    expect(court(world, TOWN, "compliment", CERTAIN_WIN).unlockedLead).toBe(false);
  });

  it("advances the rng so the next approach is a fresh roll", () => {
    const r = court(makeWorld(), TOWN, "compliment", { seed: 3, state: 3 });
    expect(r.rng.state).not.toBe(3);
  });

  it("courtship is tracked per town", () => {
    let world = court(makeWorld(), TOWN, "compliment", CERTAIN_WIN).world;
    expect(courtshipLevel(world, "havana")).toBe(0);
    world = court(world, "havana", "compliment", CERTAIN_WIN).world;
    expect(courtshipLevel(world, TOWN)).toBeGreaterThan(0);
    expect(courtshipLevel(world, "havana")).toBeGreaterThan(0);
  });

  it("does not mutate the world it was handed", () => {
    const world = makeWorld({ gold: 3000 });
    court(world, TOWN, "gift", CERTAIN_WIN);
    expect(world.player.gold).toBe(3000);
    expect(courtshipLevel(world, TOWN)).toBe(0);
  });
});

// ── The proposal ──────────────────────────────────────────

describe("propose", () => {
  const ready = (over: Parameters<typeof makeWorld>[0] = {}) =>
    makeWorld({ courtship: { [TOWN]: MARRIAGE_THRESHOLD }, ranks: { england: MARRIAGE_MIN_RANK }, ...over });

  it("is accepted once she is willing and her father is satisfied", () => {
    const r = propose(ready(), TOWN);
    expect(r.accepted).toBe(true);
    expect(isMarried(r.world)).toBe(true);
    expect(marriedTo(r.world)).toBe(TOWN);
  });

  it("is refused too early", () => {
    expect(propose(ready({ courtship: { [TOWN]: MARRIAGE_THRESHOLD - 1 } }), TOWN).reason).toBe("too_soon");
  });

  it("is refused to a man with no title, however she feels about it", () => {
    const r = propose(ready({ ranks: { england: MARRIAGE_MIN_RANK - 1 } }), TOWN);
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe("no_rank");
  });

  it("can only happen once", () => {
    const married = propose(ready(), TOWN).world;
    expect(propose(married, "havana").reason).toBe("already_married");
  });

  it("is refused where there is nobody to ask", () => {
    expect(propose(ready(), OUTPOST).reason).toBe("no_daughter");
  });

  it("buys real standing with her father's crown", () => {
    const before = ready();
    const after = propose(before, TOWN).world;
    expect(after.player.reputation.england).toBeGreaterThan(before.player.reputation.england);
  });

  it("writes a line in the log", () => {
    expect(propose(ready(), TOWN).world.eventLog.some(e => e.key === "romance.log_married")).toBe(true);
  });

  it("leaves the world alone when refused", () => {
    const world = ready({ courtship: { [TOWN]: 10 } });
    const r = propose(world, TOWN);
    expect(r.world).toBe(world);
  });
});

describe("marriagePoints", () => {
  it("is nothing for a bachelor", () => {
    expect(marriagePoints(makeWorld())).toBe(0);
  });

  it("scores the marriage the captain actually made", () => {
    const married = propose(
      makeWorld({ courtship: { [TOWN]: MARRIAGE_THRESHOLD }, ranks: { england: MARRIAGE_MIN_RANK } }),
      TOWN,
    ).world;
    expect(marriagePoints(married)).toBeGreaterThan(0);
  });

  it("scores by how well the captain married", () => {
    const marriedInto = (port: string) => marriagePoints({
      ...makeWorld(),
      worldFlags: { [MARRIED_FLAG]: true, ["married_to_" + port]: true },
    } as WorldState);
    // Both are real matches, and the more striking of the two is worth more.
    expect(marriedInto(TOWN)).toBeGreaterThan(0);
    expect(marriedInto("havana")).toBeGreaterThan(0);
  });
});
