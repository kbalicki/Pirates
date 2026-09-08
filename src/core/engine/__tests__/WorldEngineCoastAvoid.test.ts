import { describe, it, expect } from "vitest";
import { WorldEngine } from "../WorldEngine.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { CITIES } from "../../data/cities.ts";
import { ITEMS } from "../../data/items.ts";
import { initPortPrices } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId, factionId, shipClassId } from "../../model/ids.ts";
import type { WorldState, PortRuntimeState } from "../../model/WorldState.ts";

// ===========================================================================
// WorldEngine — working off a shore (v0.53.0.1)
// ===========================================================================

/**
 * Reported from play: an NPC sailing north from Jamaica to Cuba touched the
 * Cuban shore, turned ninety degrees east and left "as if she had turbo".
 *
 * The turn was right — `findOpenSeaHeading` is meant to put her along the coast
 * — but the coast-avoidance branch in `WorldEngine` moved her at a hardcoded
 * `1.5` world units per tick, written in v0.8.4.1 and untouched for forty-five
 * releases. `speedBase` runs from 0.104 to 0.250, so that is **four times what
 * the fastest hull in the game makes at her best point of sail**, and nine and
 * a half times a merchantman's own cruise. Over the sixty ticks of the cooldown
 * it is ninety world units — and the whole Jamaica-to-Cuba passage is 165.
 *
 * The constant existed for a reason: working off a shore has to be
 * deterministic, or a hull pinned on a lee shore would grind along it for ever
 * — which is a live risk since v0.53.0 made the dead zone cost something. So
 * the fix is not to delete the branch but to make it sail her own hull.
 */

const GOOD = Object.keys(ITEMS)[0];

function makePort(key: string): PortRuntimeState {
  const baseline = getPortBaseline(key);
  const stocked: Record<string, number> = {};
  for (const item of Object.keys(ITEMS)) stocked[item] = 10;
  return {
    portId: portId(key),
    factionId: CITIES[key].factionId,
    prices: initPortPrices(key),
    inventory: stocked,
    shipyardQueue: [],
    availableCrew: 10,
    population: baseline.population,
    wealth: baseline.wealth,
    defense: baseline.defense,
    bonusProduces: [],
  };
}

function makeWorld(classId: string, tick: number): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  for (const key of Object.keys(CITIES)) ports[key] = makePort(key);
  const hull = {
    classId: shipClassId(classId),
    factionId: factionId("spain"),
    hullHp: 100, hullMax: 100,
    sailsHp: 100, sailsMax: 100,
    cannons: 10,
    cargo: { [GOOD]: 10 },
    cargoCap: 400,
    crew: { current: 60, max: 60, morale: 0.9 },
  };
  return {
    version: 13,
    time: { day: 10, hour: 12, minute: 0, tick },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: 1000,
      notoriety: 0,
      reputation: {},
      ranks: {},
      location: { type: "sea", pos: { x: 1000, y: 1000 } },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
    },
    entities: {
      player_ship: {
        id: entityId("player_ship"),
        kind: "ship", mode: "sailing",
        pos: { x: 1000, y: 1000 }, vel: { x: 0, y: 0 },
        heading: 0, sailLevel: 0, depthOffset: 0,
        ship: { ...hull, factionId: factionId("england") },
      },
      // Fresh off the beach: the cooldown starts on the tick she touched.
      npc: {
        id: entityId("npc"),
        kind: "ship", mode: "sailing",
        pos: { x: 1600, y: 1450 }, vel: { x: 0, y: 0 },
        heading: Math.PI / 2, // due east, as reported
        sailLevel: 1, depthOffset: 0,
        ship: hull,
        ai: {
          behavior: "trader", state: "travel",
          targetPortId: portId("havana"),
          aggression: 0.05, awarenessRadius: 120,
        },
        coastAvoidTick: tick,
      },
    },
    ports,
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
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

/** All sea, so nothing beaches her: this is about the speed, not the coastline. */
const engine = new WorldEngine(() => "sea");

/** World units she covers per tick while working off a shore. */
function escapeSpeed(classId: string, dtTicks = 4): number {
  const world = makeWorld(classId, 100);
  const from = { ...world.entities.npc.pos };
  const after = engine.apply(world, [], dtTicks).state;
  const to = after.entities.npc.pos;
  return Math.hypot(to.x - from.x, to.y - from.y) / dtTicks;
}

describe("working off a shore", () => {
  const CLASSES = Object.keys(SHIP_CLASSES);

  it("she is still moved — the cooldown is not a full stop", () => {
    for (const classId of CLASSES) {
      expect(escapeSpeed(classId)).toBeGreaterThan(0);
    }
  });

  it("no hull escapes faster than she could ever sail", () => {
    // `speedBase` is her way through the water at full canvas before the wind
    // is applied, and the polar tops out at 1.5. Nothing on this branch may
    // beat that, at any tick length.
    for (const classId of CLASSES) {
      const ceiling = SHIP_CLASSES[classId].speedBase * 1.5;
      for (const dt of [1, 4, 12]) {
        expect(escapeSpeed(classId, dt)).toBeLessThanOrEqual(ceiling + 1e-9);
      }
    }
  });

  it("she escapes on her own legs, not on somebody else's", () => {
    // The bug in one line: every class moved at exactly 1.5, so a merchantman
    // and a frigate left the beach at the same speed and both of them flew.
    const speeds = CLASSES.map((c) => escapeSpeed(c));
    expect(new Set(speeds.map((s) => s.toFixed(4))).size).toBeGreaterThan(1);
    for (const classId of CLASSES) {
      expect(escapeSpeed(classId)).toBeCloseTo(SHIP_CLASSES[classId].speedBase, 6);
    }
  });

  it("the whole cooldown no longer covers half the Jamaica-Cuba passage", () => {
    // Port Royal (1646,1511) to Havana's coast (1620,1348) is 165 units. The
    // cooldown is 60 ticks; at 1.5 it carried her 90 of them in three seconds
    // of real time, which is what the report described.
    const COOLDOWN_TICKS = 60;
    const PASSAGE = Math.hypot(1646 - 1620, 1511 - 1348);
    for (const classId of CLASSES) {
      const covered = escapeSpeed(classId) * COOLDOWN_TICKS;
      expect(covered).toBeLessThan(PASSAGE * 0.12);
    }
  });
});
