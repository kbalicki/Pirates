import { describe, it, expect } from "vitest";
import {
  startDialogue,
  currentNode,
  visibleOptions,
  chooseOption,
  evaluateCondition,
  applyEffect,
  validateTree,
  type DialogueTree,
  type DialogueCondition,
} from "../DialogueSystem.ts";
import { governorTree, EFFECT_GRANT_LETTER, EFFECT_RETIRE } from "../../data/dialogues.ts";
import type { WorldState } from "../../model/WorldState.ts";
import { entityId } from "../../model/ids.ts";

// ===========================================================================
// DialogueSystem — data-driven conversations (v0.10.1)
// ===========================================================================

/**
 * The two rules worth defending here: a gated reply must never fire because
 * the caller rendered a stale option list, and no conversation may ever leave
 * the player in a dialog box with nothing to click. Everything else is
 * bookkeeping.
 */

function makeWorld(over: {
  gold?: number; reputation?: Record<string, number>; flags?: Record<string, boolean>;
  fencing?: number; day?: number;
} = {}): WorldState {
  const { gold = 500, reputation = {}, flags = {}, fencing = 5, day = 100 } = over;
  return {
    version: 10,
    time: { day, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold,
      notoriety: 0,
      reputation,
      ranks: {},
      location: { type: "port", pos: { x: 0, y: 0 } },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
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
      skills: { fencing, gunnery: 5, navigation: 5, medicine: 5, charm: 5 },
      startAge: 20,
      training: 0.3,
    },
  } as WorldState;
}

const tree: DialogueTree = {
  id: "test",
  start: "a",
  nodes: {
    a: {
      id: "a",
      textKey: "t.a",
      options: [
        { id: "rich", textKey: "t.rich", when: { type: "gold", min: 1000 }, next: "b" },
        { id: "pay", textKey: "t.pay", effects: [{ type: "gold", amount: -100 }], next: "b" },
        { id: "bye", textKey: "t.bye" },
      ],
    },
    b: {
      id: "b",
      textKey: "t.b",
      options: [{ id: "back", textKey: "t.back", next: "a" }],
    },
  },
};

describe("evaluateCondition", () => {
  it("reads world flags, including the absent case", () => {
    const w = makeWorld({ flags: { has_map: true } });
    expect(evaluateCondition({ type: "flag", key: "has_map" }, w)).toBe(true);
    expect(evaluateCondition({ type: "flag", key: "has_map", value: false }, w)).toBe(false);
    expect(evaluateCondition({ type: "flag", key: "never_set", value: false }, w)).toBe(true);
  });

  it("compares reputation by score and by named level", () => {
    const w = makeWorld({ reputation: { england: 25 } });
    expect(evaluateCondition({ type: "reputation", faction: "england", min: 20 }, w)).toBe(true);
    expect(evaluateCondition({ type: "reputation", faction: "england", min: 40 }, w)).toBe(false);
    expect(evaluateCondition({ type: "reputation", faction: "england", atLeast: "friendly" }, w)).toBe(true);
    expect(evaluateCondition({ type: "reputation", faction: "england", atLeast: "allied" }, w)).toBe(false);
    expect(evaluateCondition({ type: "reputation", faction: "spain", atLeast: "friendly" }, w)).toBe(false);
  });

  it("compares gold, skill and day", () => {
    const w = makeWorld({ gold: 300, fencing: 8, day: 50 });
    expect(evaluateCondition({ type: "gold", min: 200 }, w)).toBe(true);
    expect(evaluateCondition({ type: "gold", max: 200 }, w)).toBe(false);
    expect(evaluateCondition({ type: "skill", skill: "fencing", min: 8 }, w)).toBe(true);
    expect(evaluateCondition({ type: "skill", skill: "fencing", min: 9 }, w)).toBe(false);
    expect(evaluateCondition({ type: "day", min: 40, max: 60 }, w)).toBe(true);
  });

  it("combines conditions with not / all / any", () => {
    const w = makeWorld({ gold: 100 });
    const rich: DialogueCondition = { type: "gold", min: 1000 };
    const poor: DialogueCondition = { type: "gold", max: 200 };
    expect(evaluateCondition({ type: "not", of: rich }, w)).toBe(true);
    expect(evaluateCondition({ type: "all", of: [poor, { type: "not", of: rich }] }, w)).toBe(true);
    expect(evaluateCondition({ type: "all", of: [poor, rich] }, w)).toBe(false);
    expect(evaluateCondition({ type: "any", of: [poor, rich] }, w)).toBe(true);
  });

  it("treats a missing captain as skill zero rather than crashing", () => {
    const w = { ...makeWorld(), captain: undefined } as unknown as WorldState;
    expect(evaluateCondition({ type: "skill", skill: "fencing", min: 1 }, w)).toBe(false);
  });
});

describe("applyEffect", () => {
  it("sets and clears flags", () => {
    const w = applyEffect({ type: "set_flag", key: "met_governor" }, makeWorld());
    expect(w.worldFlags.met_governor).toBe(true);
    expect(applyEffect({ type: "set_flag", key: "met_governor", value: false }, w).worldFlags.met_governor).toBe(false);
  });

  it("moves gold but never below nothing", () => {
    expect(applyEffect({ type: "gold", amount: 250 }, makeWorld({ gold: 100 })).player.gold).toBe(350);
    expect(applyEffect({ type: "gold", amount: -999 }, makeWorld({ gold: 100 })).player.gold).toBe(0);
  });

  it("moves reputation", () => {
    const w = applyEffect({ type: "reputation", faction: "england", amount: 10 }, makeWorld());
    expect(w.player.reputation.england).toBe(10);
  });

  it("writes to the event log", () => {
    const w = applyEffect({ type: "log", key: "event.test", vars: { n: 1 } }, makeWorld());
    expect(w.eventLog.some(e => e.key === "event.test")).toBe(true);
  });

  it("routes custom effects to the handler", () => {
    const w = applyEffect({ type: "custom", id: "grant" }, makeWorld(),
      (world, id) => ({ ...world, worldFlags: { ...world.worldFlags, [id]: true } }));
    expect(w.worldFlags.grant).toBe(true);
  });

  it("ignores a custom effect nobody handles instead of crashing", () => {
    const world = makeWorld();
    expect(applyEffect({ type: "custom", id: "unknown" }, world)).toBe(world);
  });

  it("does not mutate the world it was handed", () => {
    const world = makeWorld();
    const before = structuredClone(world);
    applyEffect({ type: "gold", amount: -50 }, world);
    applyEffect({ type: "set_flag", key: "x" }, world);
    expect(world).toEqual(before);
  });
});

describe("runtime", () => {
  it("starts at the tree's start node", () => {
    const r = startDialogue(tree);
    expect(r.nodeId).toBe("a");
    expect(r.ended).toBe(false);
    expect(currentNode(tree, r)?.textKey).toBe("t.a");
  });

  it("hides replies whose condition does not hold", () => {
    const poor = visibleOptions(tree, startDialogue(tree), makeWorld({ gold: 10 }));
    expect(poor.map(o => o.id)).toEqual(["pay", "bye"]);
    const rich = visibleOptions(tree, startDialogue(tree), makeWorld({ gold: 5000 }));
    expect(rich.map(o => o.id)).toEqual(["rich", "pay", "bye"]);
  });

  it("applies a reply's effects and moves on", () => {
    const step = chooseOption(tree, startDialogue(tree), makeWorld({ gold: 500 }), "pay");
    expect(step.taken).toBe(true);
    expect(step.world.player.gold).toBe(400);
    expect(step.runtime.nodeId).toBe("b");
    expect(step.runtime.history).toEqual(["pay"]);
  });

  it("refuses a reply that is not currently visible — and changes nothing", () => {
    const world = makeWorld({ gold: 10 });
    const step = chooseOption(tree, startDialogue(tree), world, "rich");
    expect(step.taken).toBe(false);
    expect(step.world).toBe(world);
    expect(step.runtime.nodeId).toBe("a");
  });

  it("refuses an id that does not exist at all", () => {
    expect(chooseOption(tree, startDialogue(tree), makeWorld(), "nonsense").taken).toBe(false);
  });

  it("a reply with no next ends the conversation", () => {
    const step = chooseOption(tree, startDialogue(tree), makeWorld(), "bye");
    expect(step.runtime.ended).toBe(true);
    expect(visibleOptions(tree, step.runtime, makeWorld())).toEqual([]);
  });

  it("a reply pointing at a missing node ends rather than stranding the player", () => {
    const broken: DialogueTree = {
      id: "broken", start: "a",
      nodes: { a: { id: "a", textKey: "t", options: [{ id: "go", textKey: "t", next: "nowhere" }] } },
    };
    const step = chooseOption(broken, startDialogue(broken), makeWorld(), "go");
    expect(step.taken).toBe(true);
    expect(step.runtime.ended).toBe(true);
  });

  it("an ended conversation accepts nothing further", () => {
    const ended = chooseOption(tree, startDialogue(tree), makeWorld(), "bye");
    const again = chooseOption(tree, ended.runtime, ended.world, "pay");
    expect(again.taken).toBe(false);
    expect(again.world).toBe(ended.world);
  });

  it("remembers what was said, in order", () => {
    let r = startDialogue(tree);
    let w = makeWorld();
    for (const id of ["pay", "back", "pay"]) {
      const step = chooseOption(tree, r, w, id);
      r = step.runtime; w = step.world;
    }
    expect(r.history).toEqual(["pay", "back", "pay"]);
    expect(w.player.gold).toBe(300);
  });
});

describe("validateTree", () => {
  it("passes a sound tree", () => {
    expect(validateTree(tree)).toEqual([]);
  });

  it("catches a missing start node", () => {
    const bad = { ...tree, start: "ghost" };
    expect(validateTree(bad).some(p => p.includes("start node"))).toBe(true);
  });

  it("catches a reply pointing nowhere", () => {
    const bad: DialogueTree = {
      id: "x", start: "a",
      nodes: { a: { id: "a", textKey: "t", options: [{ id: "go", textKey: "t", next: "ghost" }] } },
    };
    expect(validateTree(bad).some(p => p.includes("missing node"))).toBe(true);
  });

  it("catches a node with no replies at all", () => {
    const bad: DialogueTree = { id: "x", start: "a", nodes: { a: { id: "a", textKey: "t", options: [] } } };
    expect(validateTree(bad).some(p => p.includes("no options"))).toBe(true);
  });

  it("catches a node where every reply is gated", () => {
    const bad: DialogueTree = {
      id: "x", start: "a",
      nodes: { a: { id: "a", textKey: "t", options: [
        { id: "only", textKey: "t", when: { type: "gold", min: 1_000_000 } },
      ] } },
    };
    expect(validateTree(bad).some(p => p.includes("no unconditional option"))).toBe(true);
  });

  it("catches duplicate reply ids and a mismatched node key", () => {
    const bad: DialogueTree = {
      id: "x", start: "a",
      nodes: { a: { id: "b", textKey: "t", options: [
        { id: "dup", textKey: "t" }, { id: "dup", textKey: "t" },
      ] } },
    };
    const problems = validateTree(bad);
    expect(problems.some(p => p.includes("mismatched id"))).toBe(true);
    expect(problems.some(p => p.includes("two options"))).toBe(true);
  });
});

// ===========================================================================
// The governor — the system's first real consumer
// ===========================================================================

const govCtx = {
  factionKey: "england",
  level: "neutral" as const,
  playerName: "Barbanegra",
  factionName: "England",
  levelName: "Neutral",
  reputation: 0,
  rankName: "None",
  rumorKey: "rumor.storm",
  age: 34,
  scorePreview: 2500,
};

describe("governorTree", () => {
  it("is a sound tree at every standing", () => {
    for (const level of ["hostile", "unfriendly", "neutral", "friendly", "allied"] as const) {
      expect(validateTree(governorTree({ ...govCtx, level })), "level " + level).toEqual([]);
    }
  });

  it("greets differently depending on how you stand", () => {
    const hostile = governorTree({ ...govCtx, level: "hostile" });
    const allied = governorTree({ ...govCtx, level: "allied" });
    expect(hostile.nodes.greeting.textKey).toBe("governor.dialogue_hostile");
    expect(allied.nodes.greeting.textKey).toBe("governor.dialogue_allied");
  });

  it("offers the letter only to a friend who does not hold one", () => {
    const t = governorTree(govCtx);
    const ask = (world: WorldState) =>
      visibleOptions(t, startDialogue(t), world).map(o => o.id);

    expect(ask(makeWorld({ reputation: { england: 0 } }))).toContain("ask_letter_denied");
    expect(ask(makeWorld({ reputation: { england: 40 } }))).toContain("ask_letter");
    expect(ask(makeWorld({ reputation: { england: 40 }, flags: { letter_of_marque_england: true } })))
      .toContain("ask_letter_held");
  });

  it("shows exactly one letter reply at a time, whatever the state", () => {
    const t = governorTree(govCtx);
    for (const rep of [-50, 0, 25, 60]) {
      for (const held of [false, true]) {
        const world = makeWorld({
          reputation: { england: rep },
          flags: held ? { letter_of_marque_england: true } : {},
        });
        const letterOptions = visibleOptions(t, startDialogue(t), world)
          .filter(o => o.id.startsWith("ask_letter"));
        expect(letterOptions).toHaveLength(1);
      }
    }
  });

  it("accepting the letter fires the custom effect the port resolves", () => {
    const t = governorTree(govCtx);
    const world = makeWorld({ reputation: { england: 40 } });
    const toOffer = chooseOption(t, startDialogue(t), world, "ask_letter");
    expect(toOffer.runtime.nodeId).toBe("letter_offer");

    let handled = "";
    const accepted = chooseOption(t, toOffer.runtime, toOffer.world, "accept",
      (w, id) => { handled = id; return { ...w, worldFlags: { ...w.worldFlags, letter_of_marque_england: true } }; });

    expect(handled).toBe(EFFECT_GRANT_LETTER);
    expect(accepted.world.worldFlags.letter_of_marque_england).toBe(true);
    expect(accepted.runtime.nodeId).toBe("letter_granted");
  });

  it("every branch can get back to the greeting or out", () => {
    const t = governorTree(govCtx);
    const world = makeWorld({ reputation: { england: 40 } });
    for (const branch of ["ask_letter", "ask_rumor", "ask_standing"]) {
      const step = chooseOption(t, startDialogue(t), world, branch);
      const replies = visibleOptions(t, step.runtime, step.world);
      expect(replies.length, branch).toBeGreaterThan(0);
    }
  });

  it("offers retirement only after a full year at sea", () => {
    const t = governorTree(govCtx);
    const ids = (day: number) => visibleOptions(t, startDialogue(t), makeWorld({ day })).map(o => o.id);
    expect(ids(100)).not.toContain("ask_retire");
    expect(ids(400)).toContain("ask_retire");
  });

  it("confirming retirement fires the custom effect and ends the conversation", () => {
    const t = governorTree(govCtx);
    const world = makeWorld({ day: 400 });
    const offer = chooseOption(t, startDialogue(t), world, "ask_retire");
    expect(offer.runtime.nodeId).toBe("retire_offer");

    let handled = "";
    const done = chooseOption(t, offer.runtime, offer.world, "retire_confirm",
      (w, id) => { handled = id; return w; });
    expect(handled).toBe(EFFECT_RETIRE);
    expect(done.runtime.ended).toBe(true);
  });

  it("declining retirement goes back to the greeting, unchanged", () => {
    const t = governorTree(govCtx);
    const world = makeWorld({ day: 400 });
    const offer = chooseOption(t, startDialogue(t), world, "ask_retire");
    const back = chooseOption(t, offer.runtime, offer.world, "retire_decline");
    expect(back.runtime.nodeId).toBe("greeting");
    expect(back.runtime.ended).toBe(false);
  });

  it("taking your leave ends it", () => {
    const t = governorTree(govCtx);
    expect(chooseOption(t, startDialogue(t), makeWorld(), "leave").runtime.ended).toBe(true);
  });
});
