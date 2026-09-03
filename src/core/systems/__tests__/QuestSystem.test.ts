import { describe, it, expect } from "vitest";
import {
  startQuest,
  findQuest,
  activeQuests,
  advanceQuests,
  questSucceeded,
  validateQuest,
  acceptQuest,
  abandonQuest,
  type QuestDef,
  type QuestRegistry,
} from "../QuestSystem.ts";
import {
  createTreasureMap,
  treasureQuest,
  digOutcome,
  digHintKey,
  activeTreasureMaps,
  tavernMapQuality,
  qualityDef,
  MAP_QUALITIES,
  WARM_MULTIPLIER,
  AMBUSH_CHANCE,
} from "../TreasureSystem.ts";
import { createRng } from "../../services/RNG.ts";
import type { WorldState } from "../../model/WorldState.ts";
import { entityId, questId } from "../../model/ids.ts";

// ===========================================================================
// QuestSystem + TreasureSystem — the first real goal in the game (v0.12.0)
// ===========================================================================

/**
 * The quest machine is deliberately tiny: stages, data triggers, effects reused
 * from the dialogue system. What these tests defend is that a quest can never
 * skip a stage on one event, never fire twice for one dig, and never be left in
 * a stage with no way out.
 */

function makeWorld(over: { day?: number; gold?: number; flags?: Record<string, boolean> } = {}): WorldState {
  const { day = 100, gold = 500, flags = {} } = over;
  return {
    version: 10,
    time: { day, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold,
      notoriety: 0,
      reputation: {},
      ranks: {},
      location: { type: "sea", pos: { x: 0, y: 0 } },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
    },
    entities: {},
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
      skills: { fencing: 5, gunnery: 5, navigation: 5, medicine: 5, charm: 5 },
      startAge: 20,
      training: 0.3,
    },
  } as WorldState;
}

const errand: QuestDef = {
  id: "errand",
  titleKey: "q.errand",
  start: "sail",
  stages: {
    sail: {
      id: "sail",
      objectiveKey: "q.sail",
      on: [{ trigger: { type: "reach_port", portId: "tortuga" }, next: "dig" }],
    },
    dig: {
      id: "dig",
      objectiveKey: "q.dig",
      on: [{
        trigger: { type: "dig_at", x: 100, y: 100, radius: 50 },
        next: "done",
        effects: [{ type: "gold", amount: 1000 }, { type: "set_flag", key: "found_it" }],
      }],
    },
    done: { id: "done", objectiveKey: "q.done", completes: true },
  },
};

const registry: QuestRegistry = { errand };

describe("log helpers", () => {
  it("accept and abandon still work on a bare log", () => {
    const log = acceptQuest([], questId("x"));
    expect(log).toHaveLength(1);
    expect(log[0].accepted).toBe(true);
    expect(abandonQuest(log, questId("x"))).toHaveLength(0);
  });
});

describe("startQuest", () => {
  it("puts the quest in the log at its starting stage", () => {
    const w = startQuest(makeWorld(), errand, { note: 1 });
    const runtime = findQuest(w, "errand")!;
    expect(runtime.stage).toBe("sail");
    expect(runtime.completed).toBe(false);
    expect(runtime.data.note).toBe(1);
    expect(runtime.data.startedDay).toBe(100);
  });

  it("refuses a duplicate rather than logging it twice", () => {
    const once = startQuest(makeWorld(), errand);
    expect(startQuest(once, errand)).toBe(once);
    expect(once.player.questLog).toHaveLength(1);
  });

  it("does not mutate the world it was handed", () => {
    const world = makeWorld();
    const before = structuredClone(world);
    startQuest(world, errand);
    expect(world).toEqual(before);
  });
});

describe("advanceQuests", () => {
  const started = () => startQuest(makeWorld(), errand);

  it("moves a quest on when its trigger matches", () => {
    const r = advanceQuests(started(), { type: "reach_port", portId: "tortuga" }, registry);
    expect(r.advanced).toEqual(["errand"]);
    expect(findQuest(r.world, "errand")!.stage).toBe("dig");
  });

  it("ignores an event no stage is waiting for", () => {
    const world = started();
    const r = advanceQuests(world, { type: "reach_port", portId: "havana" }, registry);
    expect(r.advanced).toEqual([]);
    expect(r.world).toBe(world);
  });

  it("takes at most one transition per event — no skipping ahead", () => {
    // Reaching Tortuga moves sail->dig; the same event must not also fire a dig.
    const r = advanceQuests(started(), { type: "reach_port", portId: "tortuga" }, registry);
    expect(findQuest(r.world, "errand")!.stage).toBe("dig");
    expect(findQuest(r.world, "errand")!.completed).toBe(false);
  });

  it("applies the transition's effects", () => {
    let w = advanceQuests(started(), { type: "reach_port", portId: "tortuga" }, registry).world;
    w = advanceQuests(w, { type: "dig_at", x: 110, y: 95, radius: 0 }, registry).world;
    expect(w.player.gold).toBe(1500);
    expect(w.worldFlags.found_it).toBe(true);
  });

  it("completes on a terminal stage and stops responding", () => {
    let w = advanceQuests(started(), { type: "reach_port", portId: "tortuga" }, registry).world;
    const finish = advanceQuests(w, { type: "dig_at", x: 100, y: 100, radius: 0 }, registry);
    expect(finish.completed).toEqual(["errand"]);
    expect(questSucceeded(finish.world, "errand")).toBe(true);

    const again = advanceQuests(finish.world, { type: "dig_at", x: 100, y: 100, radius: 0 }, registry);
    expect(again.advanced).toEqual([]);
    expect(again.world.player.gold).toBe(finish.world.player.gold);
  });

  it("a dig outside the radius does nothing", () => {
    const w = advanceQuests(started(), { type: "reach_port", portId: "tortuga" }, registry).world;
    const r = advanceQuests(w, { type: "dig_at", x: 400, y: 400, radius: 0 }, registry);
    expect(r.advanced).toEqual([]);
    expect(r.world.player.gold).toBe(500);
  });

  it("a flag trigger needs the flag actually set", () => {
    const flagQuest: QuestDef = {
      id: "flagged", titleKey: "q", start: "wait",
      stages: {
        wait: { id: "wait", objectiveKey: "q", on: [{ trigger: { type: "flag_set", key: "k" }, next: "end" }] },
        end: { id: "end", objectiveKey: "q", completes: true },
      },
    };
    const reg = { flagged: flagQuest };
    const unset = advanceQuests(startQuest(makeWorld(), flagQuest), { type: "flag_set", key: "k" }, reg);
    expect(unset.advanced).toEqual([]);

    const set = advanceQuests(
      startQuest(makeWorld({ flags: { k: true } }), flagQuest),
      { type: "flag_set", key: "k" }, reg,
    );
    expect(set.completed).toEqual(["flagged"]);
  });

  it("a days_passed trigger counts from when the stage was entered", () => {
    const timed: QuestDef = {
      id: "timed", titleKey: "q", start: "wait",
      stages: {
        wait: { id: "wait", objectiveKey: "q", on: [{ trigger: { type: "days_passed", days: 30 }, next: "end" }] },
        end: { id: "end", objectiveKey: "q", fails: true },
      },
    };
    const reg = { timed };
    const world = startQuest(makeWorld({ day: 100 }), timed);

    const early = advanceQuests({ ...world, time: { ...world.time, day: 120 } }, { type: "days_passed", days: 0 }, reg);
    expect(early.advanced).toEqual([]);

    const late = advanceQuests({ ...world, time: { ...world.time, day: 140 } }, { type: "days_passed", days: 0 }, reg);
    expect(late.failed).toEqual(["timed"]);
    expect(questSucceeded(late.world, "timed")).toBe(false);
  });

  it("leaves a quest whose definition is unknown alone", () => {
    const w = startQuest(makeWorld(), errand);
    const r = advanceQuests(w, { type: "reach_port", portId: "tortuga" }, {});
    expect(r.advanced).toEqual([]);
  });

  it("activeQuests lists what is still in play, with its stage", () => {
    const w = startQuest(makeWorld(), errand);
    const active = activeQuests(w, registry);
    expect(active).toHaveLength(1);
    expect(active[0].stage.objectiveKey).toBe("q.sail");

    let done = advanceQuests(w, { type: "reach_port", portId: "tortuga" }, registry).world;
    done = advanceQuests(done, { type: "dig_at", x: 100, y: 100, radius: 0 }, registry).world;
    expect(activeQuests(done, registry)).toHaveLength(0);
  });
});

describe("validateQuest", () => {
  it("passes a sound quest", () => {
    expect(validateQuest(errand)).toEqual([]);
  });

  it("catches a missing start stage", () => {
    expect(validateQuest({ ...errand, start: "ghost" }).some(p => p.includes("start stage"))).toBe(true);
  });

  it("catches a transition pointing nowhere", () => {
    const bad: QuestDef = {
      id: "x", titleKey: "q", start: "a",
      stages: { a: { id: "a", objectiveKey: "q", on: [{ trigger: { type: "flag_set", key: "k" }, next: "ghost" }] } },
    };
    expect(validateQuest(bad).some(p => p.includes("missing stage"))).toBe(true);
  });

  it("catches a dead end that is not marked terminal", () => {
    const bad: QuestDef = { id: "x", titleKey: "q", start: "a", stages: { a: { id: "a", objectiveKey: "q" } } };
    expect(validateQuest(bad).some(p => p.includes("neither terminal"))).toBe(true);
  });

  it("catches a terminal stage that still lists transitions", () => {
    const bad: QuestDef = {
      id: "x", titleKey: "q", start: "a",
      stages: { a: { id: "a", objectiveKey: "q", completes: true, on: [{ trigger: { type: "flag_set", key: "k" }, next: "a" }] } },
    };
    expect(validateQuest(bad).some(p => p.includes("terminal but still lists"))).toBe(true);
  });
});

// ===========================================================================
// Treasure maps
// ===========================================================================

describe("map qualities", () => {
  it("a better map narrows the search and costs more", () => {
    for (let i = 1; i < MAP_QUALITIES.length; i++) {
      expect(MAP_QUALITIES[i].radius).toBeLessThan(MAP_QUALITIES[i - 1].radius);
      expect(MAP_QUALITIES[i].price).toBeGreaterThan(MAP_QUALITIES[i - 1].price);
    }
  });

  it("falls back to the crudest sketch for an unknown quality", () => {
    expect(qualityDef("nonsense" as never).id).toBe("crude");
  });
});

describe("createTreasureMap", () => {
  const spot = { x: 1500, y: 900 };

  it("names a spot, a radius and a reward", () => {
    const { map } = createTreasureMap(createRng(7), spot, "fair", "tortuga");
    expect(map.spot).toEqual(spot);
    expect(map.radius).toBe(qualityDef("fair").radius);
    expect(map.reward).toBeGreaterThan(0);
    expect(map.questId.startsWith("treasure_")).toBe(true);
    expect(map.fromPort).toBe("tortuga");
  });

  it("is deterministic from the seed", () => {
    const a = createTreasureMap(createRng(99), spot, "crude", "havana").map;
    const b = createTreasureMap(createRng(99), spot, "crude", "havana").map;
    expect(a).toEqual(b);
  });

  it("advances the rng so the next map differs", () => {
    const first = createTreasureMap(createRng(5), spot, "crude", "havana");
    const second = createTreasureMap(first.rng, spot, "crude", "havana");
    expect(second.map.questId).not.toBe(first.map.questId);
  });

  it("a better chart is worth more gold", () => {
    const crude = createTreasureMap(createRng(3), spot, "crude", "p").map.reward;
    const exact = createTreasureMap(createRng(3), spot, "exact", "p").map.reward;
    expect(exact).toBeGreaterThan(crude);
  });

  it("about a quarter of maps are bait", () => {
    let ambushes = 0;
    for (let seed = 0; seed < 400; seed++) {
      if (createTreasureMap(createRng(seed), spot, "fair", "p").map.ambush) ambushes++;
    }
    const rate = ambushes / 400;
    expect(rate).toBeGreaterThan(AMBUSH_CHANCE - 0.12);
    expect(rate).toBeLessThan(AMBUSH_CHANCE + 0.12);
  });

  it("rounds the spot so saves stay tidy", () => {
    const { map } = createTreasureMap(createRng(1), { x: 10.7, y: 20.2 }, "crude", "p");
    expect(map.spot).toEqual({ x: 11, y: 20 });
  });
});

describe("digOutcome", () => {
  const map = createTreasureMap(createRng(11), { x: 1000, y: 1000 }, "fair", "p").map;

  it("finds it inside the radius, right up to the edge", () => {
    expect(digOutcome(map, { x: 1000, y: 1000 })).toBe("found");
    expect(digOutcome(map, { x: 1000 + map.radius, y: 1000 })).toBe("found");
  });

  it("says warm just outside, and cold far away", () => {
    expect(digOutcome(map, { x: 1000 + map.radius + 1, y: 1000 })).toBe("warm");
    expect(digOutcome(map, { x: 1000 + map.radius * WARM_MULTIPLIER, y: 1000 })).toBe("warm");
    expect(digOutcome(map, { x: 1000 + map.radius * WARM_MULTIPLIER + 1, y: 1000 })).toBe("cold");
  });

  it("a crude map forgives more than an exact one", () => {
    const crude = createTreasureMap(createRng(11), { x: 1000, y: 1000 }, "crude", "p").map;
    const exact = createTreasureMap(createRng(11), { x: 1000, y: 1000 }, "exact", "p").map;
    const off = { x: 1100, y: 1000 };
    expect(digOutcome(crude, off)).toBe("found");
    expect(digOutcome(exact, off)).not.toBe("found");
  });
});

describe("digHintKey", () => {
  const map = createTreasureMap(createRng(2), { x: 1000, y: 1000 }, "fair", "p").map;

  it("points back toward the chest", () => {
    expect(digHintKey(map, { x: 500, y: 1000 })).toBe("treasure.dir_e");
    expect(digHintKey(map, { x: 1500, y: 1000 })).toBe("treasure.dir_w");
    expect(digHintKey(map, { x: 1000, y: 1500 })).toBe("treasure.dir_n");
    expect(digHintKey(map, { x: 1000, y: 500 })).toBe("treasure.dir_s");
  });

  it("always returns one of the eight points", () => {
    for (let a = 0; a < 360; a += 7) {
      const rad = (a * Math.PI) / 180;
      const pos = { x: 1000 + Math.cos(rad) * 300, y: 1000 + Math.sin(rad) * 300 };
      expect(digHintKey(map, pos)).toMatch(/^treasure\.dir_(n|ne|e|se|s|sw|w|nw)$/);
    }
  });
});

describe("treasureQuest", () => {
  const honest = () => {
    let m = createTreasureMap(createRng(4), { x: 800, y: 600 }, "fair", "tortuga").map;
    m = { ...m, ambush: false };
    return m;
  };

  it("is a sound quest", () => {
    expect(validateQuest(treasureQuest(honest()))).toEqual([]);
    expect(validateQuest(treasureQuest({ ...honest(), ambush: true }))).toEqual([]);
  });

  it("digging on the spot pays out and completes", () => {
    const map = honest();
    const def = treasureQuest(map);
    const world = startQuest(makeWorld({ gold: 100 }), def, { map });
    const r = advanceQuests(world, { type: "dig_at", x: map.spot.x, y: map.spot.y, radius: 0 }, { [def.id]: def });
    expect(r.completed).toEqual([def.id]);
    expect(r.world.player.gold).toBe(100 + map.reward);
  });

  it("an ambush map pays nothing on the dig — the fight decides", () => {
    const map = { ...honest(), ambush: true };
    const def = treasureQuest(map);
    const world = startQuest(makeWorld({ gold: 100 }), def, { map });
    const r = advanceQuests(world, { type: "dig_at", x: map.spot.x, y: map.spot.y, radius: 0 }, { [def.id]: def });
    expect(r.completed).toEqual([def.id]);
    expect(r.world.player.gold).toBe(100);
    expect(r.world.eventLog.some(e => e.key === "treasure.log_ambush")).toBe(true);
  });

  it("digging in the wrong place leaves the hunt open", () => {
    const map = honest();
    const def = treasureQuest(map);
    const world = startQuest(makeWorld(), def, { map });
    const r = advanceQuests(world, { type: "dig_at", x: 5000, y: 5000, radius: 0 }, { [def.id]: def });
    expect(r.advanced).toEqual([]);
    expect(findQuest(r.world, def.id)!.completed).toBe(false);
  });
});

describe("activeTreasureMaps", () => {
  it("lists open hunts and drops finished ones", () => {
    const map = createTreasureMap(createRng(6), { x: 700, y: 700 }, "crude", "p").map;
    const def = treasureQuest({ ...map, ambush: false });
    const world = startQuest(makeWorld(), def, { map });
    expect(activeTreasureMaps(world)).toHaveLength(1);

    const done = advanceQuests(world, { type: "dig_at", x: map.spot.x, y: map.spot.y, radius: 0 }, { [def.id]: def }).world;
    expect(activeTreasureMaps(done)).toHaveLength(0);
  });

  it("ignores quests that are not treasure hunts", () => {
    const world = startQuest(makeWorld(), errand);
    expect(activeTreasureMaps(world)).toHaveLength(0);
  });
});

describe("tavernMapQuality", () => {
  it("only ever returns a real quality", () => {
    for (let seed = 0; seed < 100; seed++) {
      const { quality } = tavernMapQuality(createRng(seed), 500);
      expect(MAP_QUALITIES.map(q => q.id)).toContain(quality);
    }
  });

  it("a rich port deals in better charts than a poor one", () => {
    const count = (wealth: number) => {
      let good = 0;
      for (let seed = 0; seed < 300; seed++) {
        if (tavernMapQuality(createRng(seed), wealth).quality !== "crude") good++;
      }
      return good;
    };
    expect(count(1000)).toBeGreaterThan(count(0));
  });

  it("advances the rng", () => {
    const first = tavernMapQuality(createRng(1), 500);
    expect(first.rng.state).not.toBe(createRng(1).state);
  });
});
