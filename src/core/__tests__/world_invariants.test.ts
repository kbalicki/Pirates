import { describe, it, expect } from "vitest";
import { validateWorldState } from "../services/Validation.ts";
import { WorldEngine } from "../engine/WorldEngine.ts";
import { sellGrain } from "../systems/PortInteractionSystem.ts";
import { CITIES } from "../data/cities.ts";
import { initPortPrices, initPortInventory } from "../data/prices.ts";
import { getPortBaseline } from "../data/economyBaselines.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { portId, entityId, factionId } from "../model/ids.ts";
import type { WorldState, PortRuntimeState } from "../model/WorldState.ts";

// ===========================================================================
// The invariants the project wrote down and never checked (v0.68.0)
// ===========================================================================

/**
 * `src/core/services/Validation.ts` has been in the repository since the
 * **initial commit** and `validateWorldState` has never been called by
 * anything: not by the save loader, not by the engine, not by a test. Eight
 * invariants the project believed in — the player's ship exists and is a ship,
 * a port location names a real port, cargo fits the hold, hull and rigging sit
 * inside their maxima, sail level is a fraction, no NaN has got into a
 * position, and standing stays inside -100..100 — written down and then left
 * to nobody.
 *
 * "An export with no reader is a hypothesis" (v0.56.0). This file is where the
 * hypothesis gets tested, and one of the eight was false.
 */

function makePort(key: string): PortRuntimeState {
  const b = getPortBaseline(key);
  return {
    portId: portId(key), factionId: CITIES[key].factionId,
    prices: initPortPrices(key), inventory: initPortInventory(key),
    shipyardQueue: [], availableCrew: 10,
    population: b.population, wealth: b.wealth, defense: b.defense,
    bonusProduces: [],
  } as unknown as PortRuntimeState;
}

function makeWorld(over: Partial<WorldState> = {}): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  for (const key of Object.keys(CITIES)) ports[key] = makePort(key);
  const cls = SHIP_CLASSES["merchantman"];
  return {
    version: 12, time: { day: 100, hour: 12, minute: 0, tick: 0 }, rng: { seed: 7, state: 7 },
    player: {
      id: entityId("player"), shipId: entityId("player_ship"), gold: 500, notoriety: 0,
      reputation: { spain: 99 }, ranks: {}, location: { type: "sea", pos: { x: 1400, y: 1000 } },
      questLog: [], fleet: [], lastPlunderDay: 1, citiesCaptured: 0, courtship: {},
    },
    entities: {
      player: {
        id: entityId("player"), kind: "player", pos: { x: 1400, y: 1000 },
        heading: 0, vel: { x: 0, y: 0 }, sailLevel: 0, mode: "sailing",
      },
      player_ship: {
        id: entityId("player_ship"), kind: "ship", pos: { x: 1400, y: 1000 }, heading: 0,
        vel: { x: 0, y: 0 }, sailLevel: 0.5, mode: "sailing",
        ship: {
          classId: "merchantman", factionId: factionId("england"),
          hullHp: cls.hullMax, hullMax: cls.hullMax,
          sailsHp: cls.sailsMax, sailsMax: cls.sailsMax,
          cannons: cls.cannons, cargo: { food: 60 }, cargoCap: cls.cargoCap,
          crew: { current: 30, max: cls.crewMax, morale: 0.8 },
        },
      },
    },
    ports,
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: {}, eventLog: [], worldEvents: [], knownEventIds: [],
    playerName: "C", eraId: "pirates_sunset", startYear: 1690, gameSpeed: 1.2,
    captain: {
      nationality: "england",
      skills: { fencing: 5, gunnery: 5, navigation: 5, medicine: 5, charm: 5 },
      startAge: 20, training: 0.3,
    },
    ...over,
  } as unknown as WorldState;
}

describe("validateWorldState — run at last", () => {
  it("holds for a world the engine has been sailing for a month", () => {
    let world = makeWorld();
    // Sea everywhere: this is about the state the systems write, not geography.
    const engine = new WorldEngine(() => "sea" as never);
    expect(validateWorldState(world)).toEqual([]);
    for (let i = 0; i < 40000; i++) {
      world = engine.apply(world, [], 1).state as WorldState;
      // Cheap every tick would double the run time; four times through a month
      // is enough to catch a state that only appears after a day boundary.
      if (i % 10000 === 0) expect(validateWorldState(world), `tick ${i}`).toEqual([]);
    }
    expect(validateWorldState(world), `day ${world.time.day}`).toEqual([]);
  });

  it("holds when a beloved captain keeps relieving famines", () => {
    // The one that was false. `sellGrain` wrote `player.reputation` directly
    // instead of going through `changeReputation`, so the only route back from
    // a bad standing was also the only one that could carry a captain past the
    // top of the scale: 99 -> 105 -> 111 -> 117, and the governor's own screen
    // printing "allied (117)".
    let world = makeWorld();
    const offer = { portKey: "havana", item: "food", qty: 20, gold: 150, reputation: 6 };
    for (let i = 0; i < 3; i++) {
      world = sellGrain(world, offer as never).world;
      // Put the hold and the shortage back for the next run through.
      world = {
        ...world,
        entities: {
          ...world.entities,
          player_ship: {
            ...world.entities["player_ship"],
            ship: { ...world.entities["player_ship"].ship!, cargo: { food: 60 } },
          },
        },
      };
    }
    expect(world.player.reputation["spain"]).toBe(100);
    expect(validateWorldState(world)).toEqual([]);
  });
});

/**
 * And the rule that keeps it true, read off the source rather than the state:
 * standing is clamped in exactly one place, so every writer has to go through
 * it. The same shape as the `.priceMul` check of v0.64.0 — the only kind of
 * test that can see a line which never runs in the path under test.
 */
describe("every hand that moves standing goes through changeReputation", () => {
  const SOURCES = import.meta.glob("../../**/*.ts", {
    query: "?raw", import: "default", eager: true,
  }) as Record<string, string>;

  /**
   * Everything under `src`, less the module that owns the clamp, the tests,
   * and the two places that *set* a standing rather than change one:
   * `GameApp` builds the opening table, and `PreloadScene` stamps the literal
   * a debug world is about (`?pardon=` wants exactly -80, not -80 clamped).
   */
  const FILES = Object.entries(SOURCES).filter(([path]) =>
    !path.includes("__tests__")
    && !path.endsWith("ReputationSystem.ts")
    && !path.endsWith("GameApp.ts")
    && !path.endsWith("PreloadScene.ts"));

  it("reads the files that could break it", () => {
    // The companion assertion the `.priceMul` check of v0.64.0 taught us to
    // write: a sweep that reads nothing passes for the wrong reason.
    expect(FILES.length).toBeGreaterThan(80);
    const names = FILES.map(([p]) => p);
    expect(names.some(p => p.endsWith("PortInteractionSystem.ts"))).toBe(true);
    expect(names.some(p => p.endsWith("BlockadeSystem.ts"))).toBe(true);
  });

  it("finds no raw write to player.reputation outside ReputationSystem", () => {
    // A write looks like `reputation: { ...x.reputation, [key]: something }`,
    // or an assignment into the map. Reads (`reputation[key] ?? 0`) are fine
    // and are everywhere.
    const RAW_WRITE = /\breputation\s*:\s*\{[\s\S]{0,200}?\[[^\]]+\]\s*:/;
    const ASSIGN = /\breputation\[[^\]]+\]\s*(?:\+=|-=|=[^=])/;
    const offenders = FILES
      .filter(([, src]) => RAW_WRITE.test(src) || ASSIGN.test(src))
      .map(([path]) => path);
    expect(offenders, "these write standing without the clamp").toEqual([]);
  });
});
