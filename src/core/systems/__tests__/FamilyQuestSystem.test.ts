import { describe, it, expect } from "vitest";
import {
  villainFactionFor,
  candidatePorts,
  createFamilyChain,
  familyQuest,
  startFamilySearch,
  activeFamilyChain,
  currentStepIndex,
  stepAtPort,
  freeRelative,
  relativesFreed,
  FAMILY_QUEST_ID,
  FAMILY_STEP_FLAG,
  RELATIVE_ORDER,
  STEP_REWARD,
} from "../FamilyQuestSystem.ts";
import { advanceQuests, validateQuest, findQuest } from "../QuestSystem.ts";
import { buildQuestRegistry } from "../QuestRegistry.ts";
import { treasureQuest, type TreasureMap } from "../TreasureSystem.ts";
import { startQuest } from "../QuestSystem.ts";
import type { WorldState, RngState } from "../../model/WorldState.ts";
import { entityId, factionId, portId } from "../../model/ids.ts";
import { CITIES } from "../../data/cities.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";

// ===========================================================================
// FamilyQuestSystem — three towns, three relatives, one marquis
// ===========================================================================

function makeWorld(over: {
  nationality?: string;
  gold?: number;
  rng?: RngState;
  flags?: Record<string, boolean>;
  owners?: Record<string, string>;
} = {}): WorldState {
  const { nationality = "england", gold = 2000, rng = { seed: 5, state: 5 }, flags = {}, owners = {} } = over;

  const ports: WorldState["ports"] = {};
  for (const key of Object.keys(CITIES)) {
    const baseline = getPortBaseline(key);
    ports[key] = {
      portId: portId(key),
      factionId: factionId(owners[key] ?? (CITIES[key].factionId as string)),
      prices: {}, inventory: {}, shipyardQueue: [], availableCrew: 0,
      population: baseline.population, wealth: baseline.wealth,
      defense: baseline.defense, bonusProduces: [],
    };
  }

  return {
    version: 11,
    time: { day: 120, hour: 9, minute: 0, tick: 0 },
    rng,
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold,
      notoriety: 5,
      reputation: {},
      ranks: {},
      location: { type: "port", pos: { x: 0, y: 0 } },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
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
      nationality,
      skills: { fencing: 5, gunnery: 5, navigation: 5, medicine: 5, charm: 5 },
      startAge: 20,
      training: 0.5,
    },
  } as WorldState;
}

/** Start the hunt and hand back the world plus its chain. */
function started(over: Parameters<typeof makeWorld>[0] = {}) {
  const world = makeWorld(over);
  const result = startFamilySearch(world, world.rng);
  return { world: { ...result.world, rng: result.rng }, chain: activeFamilyChain(result.world)! };
}

/** Win the fight at the current step and let the machine catch up. */
function rescue(world: WorldState, index: number): WorldState {
  const freed = freeRelative(world, index);
  return advanceQuests(freed, { type: "flag_set", key: FAMILY_STEP_FLAG + index }, buildQuestRegistry(freed)).world;
}

// ── Who did it ────────────────────────────────────────────

describe("villainFactionFor", () => {
  it("is the crown that likes yours least", () => {
    expect(villainFactionFor("england")).toBe("spain");
  });

  it("turns the story around for a Spanish captain", () => {
    expect(villainFactionFor("spain")).toBe("england");
  });

  it("is never the captain's own crown", () => {
    for (const nation of ["spain", "england", "france", "netherlands"]) {
      expect(villainFactionFor(nation)).not.toBe(nation);
    }
  });

  it("is never the pirates — they hold no marquis", () => {
    for (const nation of ["spain", "england", "france", "netherlands"]) {
      expect(villainFactionFor(nation)).not.toBe("pirates");
    }
  });
});

describe("candidatePorts", () => {
  it("only lists towns that crown actually holds", () => {
    const world = makeWorld();
    for (const key of candidatePorts(world, "spain")) {
      expect(world.ports[key].factionId as string).toBe("spain");
    }
  });

  it("follows towns that have changed hands", () => {
    const world = makeWorld({ owners: { havana: "england" } });
    expect(candidatePorts(world, "spain")).not.toContain("havana");
    expect(candidatePorts(world, "england")).toContain("havana");
  });

  it("skips outposts — nobody hides a hostage in four huts", () => {
    for (const key of candidatePorts(makeWorld(), "spain")) {
      expect(CITIES[key].type).not.toBe("outpost");
    }
  });
});

// ── The chain ─────────────────────────────────────────────

describe("createFamilyChain", () => {
  it("names one town per relative", () => {
    const { chain } = createFamilyChain(makeWorld(), { seed: 1, state: 1 });
    expect(chain.steps).toHaveLength(RELATIVE_ORDER.length);
    expect(chain.steps.map(s => s.relative)).toEqual(RELATIVE_ORDER);
  });

  it("never puts two of them in the same town", () => {
    const { chain } = createFamilyChain(makeWorld(), { seed: 2, state: 2 });
    expect(new Set(chain.steps.map(s => s.portKey)).size).toBe(chain.steps.length);
  });

  it("is deterministic for the same seed", () => {
    const a = createFamilyChain(makeWorld(), { seed: 3, state: 3 }).chain;
    const b = createFamilyChain(makeWorld(), { seed: 3, state: 3 }).chain;
    expect(a).toEqual(b);
  });

  it("hides them in the villain's own towns", () => {
    const world = makeWorld();
    const { chain } = createFamilyChain(world, { seed: 4, state: 4 });
    for (const step of chain.steps) {
      expect(world.ports[step.portKey].factionId as string).toBe(chain.villainFaction);
    }
  });

  it("advances the rng", () => {
    const { rng } = createFamilyChain(makeWorld(), { seed: 6, state: 6 });
    expect(rng.state).not.toBe(6);
  });
});

describe("familyQuest", () => {
  it("is a sound quest definition", () => {
    const { chain } = createFamilyChain(makeWorld(), { seed: 7, state: 7 });
    expect(validateQuest(familyQuest(chain, "england"))).toEqual([]);
  });

  it("each step waits on its own flag", () => {
    const { chain } = createFamilyChain(makeWorld(), { seed: 8, state: 8 });
    const def = familyQuest(chain, "england");
    chain.steps.forEach((_, i) => {
      expect(def.stages["step" + i].on?.[0].trigger).toEqual({ type: "flag_set", key: FAMILY_STEP_FLAG + i });
    });
  });

  it("names the town in the objective so the log reads as a lead", () => {
    const { chain } = createFamilyChain(makeWorld(), { seed: 9, state: 9 });
    const def = familyQuest(chain, "england");
    expect(def.stages.step0.vars?.port).toBe(CITIES[chain.steps[0].portKey].name);
  });

  it("the last step pays in standing as well as gold", () => {
    const { chain } = createFamilyChain(makeWorld(), { seed: 10, state: 10 });
    const def = familyQuest(chain, "england");
    const last = def.stages["step" + (chain.steps.length - 1)];
    expect(last.on?.[0].effects?.some(e => e.type === "reputation")).toBe(true);
  });
});

// ── Starting ──────────────────────────────────────────────

describe("startFamilySearch", () => {
  it("puts the hunt in the log", () => {
    const { world } = started();
    expect(findQuest(world, FAMILY_QUEST_ID)).toBeDefined();
    expect(currentStepIndex(world)).toBe(0);
  });

  it("stores the chain in the quest's own data — no new save fields", () => {
    const { world, chain } = started();
    expect(findQuest(world, FAMILY_QUEST_ID)!.data.chain).toEqual(chain);
  });

  it("a captain has one family, so it starts once", () => {
    const { world } = started();
    expect(startFamilySearch(world, world.rng).started).toBe(false);
  });

  it("does nothing when the villain holds no towns at all", () => {
    // Every Spanish town has changed hands: there is nowhere left to search.
    const owners: Record<string, string> = {};
    for (const key of Object.keys(CITIES)) {
      if ((CITIES[key].factionId as string) === "spain") owners[key] = "pirates";
    }
    const world = makeWorld({ owners });
    expect(startFamilySearch(world, world.rng).started).toBe(false);
  });
});

// ── Following it ──────────────────────────────────────────

describe("stepAtPort", () => {
  it("recognises the town the trail points at", () => {
    const { world, chain } = started();
    expect(stepAtPort(world, chain.steps[0].portKey)?.index).toBe(0);
  });

  it("says nothing anywhere else", () => {
    const { world, chain } = started();
    const elsewhere = Object.keys(CITIES).find(k => !chain.steps.some(s => s.portKey === k))!;
    expect(stepAtPort(world, elsewhere)).toBeUndefined();
  });

  it("moves on once a relative is out", () => {
    const { world, chain } = started();
    const after = rescue(world, 0);
    expect(stepAtPort(after, chain.steps[0].portKey)).toBeUndefined();
    expect(stepAtPort(after, chain.steps[1].portKey)?.index).toBe(1);
  });

  it("says nothing at all once the family is home", () => {
    let world = started().world;
    for (let i = 0; i < RELATIVE_ORDER.length; i++) world = rescue(world, i);
    expect(currentStepIndex(world)).toBeUndefined();
  });
});

describe("the chain end to end", () => {
  it("pays for each relative and ends completed", () => {
    const { world } = started({ gold: 0 });
    let w = world;
    for (let i = 0; i < RELATIVE_ORDER.length; i++) w = rescue(w, i);

    expect(findQuest(w, FAMILY_QUEST_ID)!.completed).toBe(true);
    expect(findQuest(w, FAMILY_QUEST_ID)!.data.outcome).toBe("completed");
    expect(w.player.gold).toBe(STEP_REWARD.reduce((a, b) => a + b, 0));
  });

  it("freeing the last of them is worth standing with your own crown", () => {
    let w = started({ nationality: "france" }).world;
    for (let i = 0; i < RELATIVE_ORDER.length; i++) w = rescue(w, i);
    expect(w.player.reputation.france).toBeGreaterThan(0);
  });

  it("the same flag twice does not pay twice", () => {
    const { world } = started({ gold: 0 });
    const once = rescue(world, 0);
    const twice = rescue(once, 0);
    expect(twice.player.gold).toBe(once.player.gold);
  });

  it("a rescue out of order does not skip the trail", () => {
    const { world } = started({ gold: 0 });
    // Winning a fight the quest is not asking for changes nothing.
    const after = rescue(world, 2);
    expect(currentStepIndex(after)).toBe(0);
  });

  it("relativesFreed counts what the retirement ledger will pay for", () => {
    const { world } = started();
    expect(relativesFreed(world)).toBe(0);
    expect(relativesFreed(rescue(world, 0))).toBe(1);
  });
});

// ── The registry ──────────────────────────────────────────

describe("buildQuestRegistry", () => {
  const map: TreasureMap = {
    questId: "treasure_123456",
    spot: { x: 100, y: 200 },
    quality: "fair",
    radius: 110,
    reward: 900,
    ambush: false,
    fromPort: "port_royal",
    nearCity: "Havana",
  };

  it("is empty for a captain with nothing to do", () => {
    expect(Object.keys(buildQuestRegistry(makeWorld()))).toEqual([]);
  });

  it("rebuilds a treasure hunt from the map in its own data", () => {
    const world = startQuest(makeWorld(), treasureQuest(map), { map });
    expect(buildQuestRegistry(world)[map.questId]).toBeDefined();
  });

  it("holds both threads at once — this is why it exists", () => {
    const { world } = started();
    const both = startQuest(world, treasureQuest(map), { map });
    const registry = buildQuestRegistry(both);
    expect(registry[map.questId]).toBeDefined();
    expect(registry[FAMILY_QUEST_ID]).toBeDefined();
  });

  it("a dig advances the hunt even while the family thread is open", () => {
    const { world } = started({ gold: 0 });
    const both = startQuest(world, treasureQuest(map), { map });
    const after = advanceQuests(both, { type: "dig_at", x: 100, y: 200, radius: 0 }, buildQuestRegistry(both));
    expect(after.completed).toContain(map.questId);
    expect(after.world.player.gold).toBe(map.reward);
  });

  it("skips an entry whose data has gone missing rather than throwing", () => {
    const world = makeWorld();
    const broken: WorldState = {
      ...world,
      player: {
        ...world.player,
        questLog: [{ questId: "treasure_999" as never, stage: "search", data: {}, accepted: true, completed: false }],
      },
    };
    expect(() => buildQuestRegistry(broken)).not.toThrow();
    expect(buildQuestRegistry(broken)["treasure_999"]).toBeUndefined();
  });
});
