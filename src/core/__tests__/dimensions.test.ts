import { describe, it, expect } from "vitest";
import {
  BASE_VISION, RANGE_PER_METER, visionRangeForMast, bestVisionRange, playerVisionRange,
} from "../systems/VisionSystem.ts";
import { runPredation } from "../systems/PredationSystem.ts";
import { MATERIALIZE_RANGE } from "../systems/ExpeditionFleetSystem.ts";
import { HAIL_RANGE, ENCOUNTER_RANGE } from "../systems/NpcNewsSystem.ts";
import { CANNON_RANGE_ARENA_DIVISOR, cannonRangeFor } from "../systems/CombatSystem.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { entityId, factionId, shipClassId } from "../model/ids.ts";
import type { WorldState } from "../model/WorldState.ts";
import type { EntityState } from "../model/EntityState.ts";

// ===========================================================================
// Two numbers for one thing (v0.87.0)
// ===========================================================================

/**
 * The shape three releases running have found by hand: one quantity, two
 * numbers, standing in different files with a comment claiming they agree.
 * v0.84.0 in the tab digits, v0.85.0 in the disengage threshold, v0.86.0 in
 * the grapnel's reach. `scripts/sweep-constants.mjs` is the sweep that lists
 * them all at once, grouped by the dimension their own names declare; this
 * file is what the sweep found, written down so it cannot come back.
 *
 * Two of the three were the same defect underneath: **a number the rules
 * depend on, written in the layer that draws.** `core/` cannot import from
 * `src/game/`, so a module that needs one can only describe it in prose — and
 * prose drifts silently, because nothing reads it.
 */

const SRC = import.meta.glob("../../{core,game}/**/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
// Vite hands these back relative to this file, so a `core/` path has had that
// segment normalised away and only `game/` survives. A filter that silently
// matched nothing would make every loop below pass without reading a line, so
// the counts are asserted first — v0.56.0's rule, applied to the harness.
const isGame = (p: string) => p.includes("game/");
const isTest = (p: string) => p.includes("__tests__") || p.endsWith(".test.ts");
const GAME = Object.entries(SRC).filter(([p]) => isGame(p) && !isTest(p));
const CORE = Object.entries(SRC).filter(([p]) => !isGame(p) && !isTest(p));

describe("the sweep reads what it says it reads", () => {
  it("has both layers in hand", () => {
    expect(GAME.length).toBeGreaterThan(30);
    expect(CORE.length).toBeGreaterThan(100);
  });
});

// ── The spyglass ───────────────────────────────────────────────────────────

describe("how far the captain can see is a rule, so it lives with the rules", () => {
  it("is defined once, in core", () => {
    // It was in `src/game/render/WorldRenderer.ts`, beside the code that sets a
    // sprite's alpha, for the whole life of the project.
    const owners = Object.entries(SRC)
      .filter(([p, src]) => !isTest(p) && /export function visionRangeForMast/.test(src))
      .map(([p]) => p);
    expect(owners).toHaveLength(1);
    expect(owners[0]).toContain("systems/VisionSystem.ts");
    expect(isGame(owners[0] as string)).toBe(false);
  });

  it("is the only definition of the two numbers it is made of", () => {
    for (const [path, src] of [...GAME, ...CORE]) {
      if (path.includes("VisionSystem.ts")) continue;
      expect(src, path).not.toMatch(/const\s+BASE_VISION\s*=/);
      expect(src, path).not.toMatch(/const\s+RANGE_PER_METER\s*=/);
    }
  });

  it("answers the mast heights the ship table actually holds", () => {
    expect(visionRangeForMast(SHIP_CLASSES.pinnace.mastHeight)).toBeCloseTo(36.4, 1);
    expect(visionRangeForMast(SHIP_CLASSES.sloop.mastHeight)).toBeCloseTo(42.1, 1);
    expect(visionRangeForMast(SHIP_CLASSES.galleon.mastHeight)).toBeCloseTo(64.9, 1);
    expect(bestVisionRange()).toBeCloseTo(64.9, 1);
    expect(BASE_VISION + 0 * RANGE_PER_METER).toBe(BASE_VISION);
  });

  it("keeps every range a scene may not own out of the scenes", () => {
    // A radius or a cell can be decoration — gulls circle a port, a renderer
    // walks a grid. A *range* is a rule: it decides what happens. None may be
    // written where `core/` cannot read it.
    for (const [path, src] of GAME) {
      const named = src.match(/const\s+[A-Z][A-Z0-9_]*_RANGE\s*(?::\s*number)?\s*=\s*-?\d/g) ?? [];
      expect(named, path).toEqual([]);
    }
  });
});

// ── What he is told he saw ─────────────────────────────────────────────────

function hull(id: string, over: { behavior?: string; crown?: string; pos?: { x: number; y: number }; target?: string } = {}): EntityState {
  const cls = SHIP_CLASSES.brigantine;
  return {
    id: entityId(id), kind: "ship", mode: "sailing",
    pos: over.pos ?? { x: 0, y: 0 }, vel: { x: 0, y: 0 },
    heading: 0, sailLevel: 1, depthOffset: 0,
    ship: {
      classId: shipClassId("brigantine"), factionId: factionId(over.crown ?? "spain"),
      hullHp: cls.hullMax, hullMax: cls.hullMax,
      sailsHp: cls.sailsMax, sailsMax: cls.sailsMax,
      cannons: cls.cannons, cargo: { sugar_cane: 20 }, cargoCap: cls.cargoCap,
      crew: { current: 30, max: cls.crewMax, morale: 0.7 },
    },
    ai: {
      behavior: (over.behavior ?? "trader") as never,
      state: "travel", aggression: 0.9, awarenessRadius: 250,
      ...(over.target ? { targetEntityId: entityId(over.target) } : {}),
    },
  } as EntityState;
}

function fightAt(away: number): WorldState {
  const rover = hull("rover", { behavior: "pirate", crown: "pirates", pos: { x: away, y: 0 }, target: "prize" });
  // Alongside each other (inside `PREY_STRIKE_RANGE`) and both this far off,
  // so "how far away was it" has one answer.
  const prize = hull("prize", { behavior: "trader", crown: "spain", pos: { x: away, y: 1 } });
  const player = hull("player_ship", { crown: "england", pos: { x: 0, y: 0 } });
  return {
    version: 12, time: { day: 10, hour: 12, minute: 0, tick: 60 }, rng: { seed: 7, state: 7 },
    player: {
      id: entityId("player_ship"), shipId: entityId("player_ship"), gold: 0, notoriety: 0,
      reputation: {}, ranks: {}, location: { type: "sea", pos: { x: 0, y: 0 } },
      questLog: [], fleet: [], lastPlunderDay: 1, citiesCaptured: 0, courtship: {},
    },
    entities: { player_ship: player, rover, prize },
    ports: {},
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: {}, eventLog: [], worldEvents: [], knownEventIds: [],
    playerName: "T", eraId: "pirates_sunset", startYear: 1680, gameSpeed: 1.2,
    captain: {
      name: "T", nationality: "england", birthYear: 1650, startAge: 20,
      skills: { fencing: 5, gunnery: 5, navigation: 5, charm: 5, medicine: 5 }, training: 0.5,
    },
  } as WorldState;
}

const witnessed = (w: WorldState) =>
  w.eventLog.some(e => e.key === "event.npc_plundered" || e.key === "event.npc_policed");

describe("the journal says he watched it, so he has to have watched it", () => {
  it("writes the line for a fight inside his own sight", () => {
    const out = runPredation(fightAt(20), 60);
    expect(Object.keys(out.entities)).toHaveLength(2);   // one hull taken
    expect(witnessed(out)).toBe(true);
  });

  it("says nothing about one past the horizon", () => {
    // 684 px was the MEDIAN distance of a fight the journal reported before
    // this release: ten times the best spyglass in the game, drawn at alpha
    // zero, off the screen at all fourteen zoom levels. 243 lines in 50
    // simulated days, of which he could have seen 15.
    const out = runPredation(fightAt(684), 60);
    expect(Object.keys(out.entities)).toHaveLength(2);   // it still happens
    expect(witnessed(out)).toBe(false);
  });

  it("draws the line at his own masthead and not at a constant", () => {
    const w = fightAt(50);
    const reach = playerVisionRange(w);
    expect(reach).toBeCloseTo(visionRangeForMast(SHIP_CLASSES.brigantine.mastHeight), 5);
    expect(witnessed(runPredation(fightAt(Math.floor(reach) - 2), 60))).toBe(true);
    expect(witnessed(runPredation(fightAt(Math.ceil(reach) + 2), 60))).toBe(false);
  });

  it("leaves no constant anywhere standing in for the player's eye", () => {
    // The prose may name what it replaced — that is how the finding stays
    // readable. What may not come back is a number.
    for (const [path, src] of [...CORE, ...GAME]) {
      expect(src, path).not.toMatch(/const\s+WITNESS_RANGE\s*=/);
    }
  });
});

// ── Claims a comment makes, now checkable ──────────────────────────────────

describe("the sentences core/ wrote about distances it could not see", () => {
  it("keeps an expedition materialising outside any spyglass, as its comment says", () => {
    // "well outside any spyglass, so the fleet exists before it can be seen"
    expect(MATERIALIZE_RANGE).toBeGreaterThan(bestVisionRange());
  });

  it("hails from further off than it goes alongside, and both from inside sight", () => {
    // "Wider than ENCOUNTER_RANGE on purpose: a hail happens before you are
    // close enough to talk." Both must be inside the *worst* spyglass, or a
    // ship would call across to one the captain cannot see.
    expect(HAIL_RANGE).toBeGreaterThan(ENCOUNTER_RANGE);
    expect(HAIL_RANGE).toBeLessThan(visionRangeForMast(SHIP_CLASSES.pinnace.mastHeight));
  });
});

// ── The gun's reach ────────────────────────────────────────────────────────

describe("a broadside carries one distance, written in one place", () => {
  it("is a twelfth of the arena, which is a quarter of a screen", () => {
    expect(CANNON_RANGE_ARENA_DIVISOR).toBe(12);
    expect(cannonRangeFor(1280 * 3)).toBe(1280 * 0.25);   // what the scene wrote
    expect(cannonRangeFor(1280 * 3)).toBe(320);
  });

  it("is not computed again by the scene that opens the battle", () => {
    const scene = Object.entries(SRC).find(([p]) => p.endsWith("SeaBattleScene.ts"))?.[1] ?? "";
    expect(scene).toContain("cannonRangeFor(");
    expect(scene).not.toMatch(/screenW \* 0\.25/);
  });

  it("keeps no fallback that could stand in for it", () => {
    // `CANNON_RANGE = 480` could never fire — the field is required — and was
    // printed in the manual as the reach of a gun for eighty releases.
    for (const [path, src] of [...CORE, ...GAME]) {
      expect(src, path).not.toMatch(/const\s+CANNON_RANGE\s*=/);
      expect(src, path).not.toMatch(/cannonRange \?\?/);
    }
  });

  it("no longer claims to be half the arena anywhere in core", () => {
    // The old sentence stood in two files and the mechanics document, and was
    // out by six times in all three.
    for (const [path, src] of CORE) {
      expect(src, path).not.toMatch(/arena\.width\s*\/\s*2/);
      expect(src, path).not.toMatch(/half of arena\.width/);
    }
  });
});
