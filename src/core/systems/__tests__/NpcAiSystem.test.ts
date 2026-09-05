import { describe, it, expect } from "vitest";
import { updateNpcAi, bestVmgHeading, looksDangerous } from "../NpcAiSystem.ts";
import { windSpeedModifier } from "../WeatherSystem.ts";
import { entityId, portId } from "../../model/ids.ts";
import { CITIES } from "../../data/cities.ts";
import type { WorldState } from "../../model/WorldState.ts";
import type { EntityState } from "../../model/EntityState.ts";

// ===========================================================================
// NpcAiSystem — anonymous traffic runs too (v0.36.0)
// ===========================================================================

/**
 * v0.35.0 gave the running to the six hulls that have names, because they were
 * the ones with a reason to fear a particular captain. Everything else went on
 * steering at its destination while a black flag came down on it, which made
 * the Caribbean read as though nobody had heard of him.
 *
 * Two things are asserted here and the second matters as much as the first:
 * a dangerous captain is run from, and an **honest one is not**. The predicate
 * is shared with the named ships (`looksDangerous`) precisely so that the water
 * never shows a fluyt bolting past a merchantman that had not noticed.
 */

const HOME = Object.keys(CITIES)[0];
const AWAY = Object.keys(CITIES)[1];

function ship(over: Partial<EntityState> = {}): EntityState {
  return {
    id: entityId("npc"),
    kind: "ship",
    mode: "sailing",
    pos: { x: 1000, y: 1000 },
    vel: { x: 0, y: 0 },
    heading: 0,
    sailLevel: 0.6,
    depthOffset: 0,
    ship: {
      classId: "fluyt",
      factionId: "spain",
      hullHp: 90, hullMax: 90, sailsHp: 60, sailsMax: 60,
      cannons: 12, cargo: { sugar: 20 }, cargoCap: 200,
      crew: { current: 20, max: 30, morale: 0.7 },
    },
    ai: {
      behavior: "trader",
      state: "travel",
      targetPortId: portId(AWAY),
      aggression: 0.05,
      awarenessRadius: 120,
    },
    ...over,
  } as EntityState;
}

function player(faction: string, at = { x: 1060, y: 1000 }): EntityState {
  return {
    ...ship({ pos: at }),
    id: entityId("player_ship"),
    ai: undefined,
    ship: { ...ship().ship!, classId: "sloop", factionId: faction },
  } as EntityState;
}

function world(over: {
  faction?: string;
  notoriety?: number;
  reputation?: Record<string, number>;
  playerAt?: { x: number; y: number };
  npc?: EntityState;
} = {}): WorldState {
  const npc = over.npc ?? ship();
  const me = player(over.faction ?? "england", over.playerAt);
  return {
    version: 12,
    time: { day: 10, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 3, state: 3 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: 100,
      notoriety: over.notoriety ?? 0,
      reputation: over.reputation ?? {},
      ranks: {},
      location: { type: "sea", pos: me.pos },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
    },
    entities: { [me.id as string]: me, [npc.id as string]: npc },
    ports: {},
    weather: { windDirRad: 1.2, windStrength: 0.6, stormActive: false, stormTimer: 0 },
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

/** Enough ticks that the hull's staggered AI slot has come round. */
function runAi(w: WorldState, ticks = 45): WorldState {
  let out = w;
  for (let i = 0; i < ticks; i++) {
    out = updateNpcAi({ ...out, time: { ...out.time, tick: out.time.tick + 1 } }, 1);
  }
  return out;
}

function npcOf(w: WorldState): EntityState {
  return Object.values(w.entities).find(e => e.ai?.behavior === "trader")!;
}

describe("who a merchant runs from", () => {
  it("does not run from an honest captain, which is the whole safety of this", () => {
    const after = runAi(world({ faction: "england" }));
    expect(npcOf(after).ai?.state).toBe("travel");
    expect(npcOf(after).sailLevel).toBe(0.6);
  });

  it("runs from a black flag", () => {
    expect(npcOf(runAi(world({ faction: "pirates" }))).ai?.state).toBe("flee");
  });

  it("runs from a name, which is what notoriety has never cost before", () => {
    expect(npcOf(runAi(world({ notoriety: 80 }))).ai?.state).toBe("flee");
    expect(npcOf(runAi(world({ notoriety: 10 }))).ai?.state).toBe("travel");
  });

  it("runs from a captain her own crown has come to hate", () => {
    expect(npcOf(runAi(world({ reputation: { spain: -70 } }))).ai?.state).toBe("flee");
    // ...and not from one another crown hates.
    expect(npcOf(runAi(world({ reputation: { france: -70 } }))).ai?.state).toBe("travel");
  });

  it("does not notice him at all beyond her own horizon", () => {
    const far = world({ faction: "pirates", playerAt: { x: 4000, y: 4000 } });
    expect(npcOf(runAi(far)).ai?.state).toBe("travel");
  });

  it("answers the same question the named hulls ask", () => {
    const w = world({ faction: "pirates" });
    const me = w.entities[w.player.shipId as string];
    expect(looksDangerous(w, me, "spain")).toBe(true);
    expect(looksDangerous(world(), world().entities[world().player.shipId as string], "spain")).toBe(false);
  });
});

describe("how she runs", () => {
  it("crowds on everything she has and takes the best point of sail", () => {
    const w = world({ faction: "pirates" });
    const after = runAi(w);
    const her = npcOf(after);
    expect(her.sailLevel).toBe(1);

    // Her heading is the best speed made good away from him, which is not the
    // same thing as pointing away from him.
    const me = after.entities[after.player.shipId as string];
    const away = Math.atan2(her.pos.x - me.pos.x, -(her.pos.y - me.pos.y));
    const made = (h: number) => windSpeedModifier(h, after.weather.windDirRad, after.weather.windStrength, 55) * Math.cos(h - away);
    expect(made(her.heading)).toBeGreaterThanOrEqual(made(away) - 1e-9);
  });

  it("never changes where she was going, because her hold is owed to a warehouse", () => {
    // Diverting her would land somebody else's cargo in the wrong town — the
    // one thing that separates her from a named ship, which runs *to* a port.
    const after = runAi(world({ faction: "pirates" }));
    expect(npcOf(after).ai?.targetPortId as unknown as string).toBe(AWAY);
  });

  it("picks the voyage up when he falls astern", () => {
    const fleeing = runAi(world({ faction: "pirates" }));
    expect(npcOf(fleeing).ai?.state).toBe("flee");

    const gone: WorldState = {
      ...fleeing,
      entities: {
        ...fleeing.entities,
        [fleeing.player.shipId as string]: player("england", { x: 4000, y: 4000 }),
      },
    };
    const after = runAi(gone);
    expect(npcOf(after).ai?.state).toBe("travel");
    expect(npcOf(after).sailLevel).toBe(0.7);
    expect(npcOf(after).ai?.targetPortId as unknown as string).toBe(AWAY);
  });

  it("leaves a warship alone: only the merchant service runs", () => {
    const warship = { ...ship(), ai: { ...ship().ai!, behavior: "navy" as const } };
    const after = runAi(world({ faction: "pirates", npc: warship }));
    const found = Object.values(after.entities).find(e => e.ai?.behavior === "navy")!;
    expect(found.ai?.state).not.toBe("flee");
  });
});

describe("the wind decides it", () => {
  it("hands back a heading she can actually sail", () => {
    // A square rig with a sixty-degree dead zone asked to make good dead to
    // windward has to come back with something that moves her.
    const upwind = bestVmgHeading(0, 0, 1, 60);
    expect(windSpeedModifier(upwind, 0, 1, 60)).toBeGreaterThan(0);
  });

  it("agrees with the bearing when there is no wind to argue with", () => {
    expect(Math.abs(bestVmgHeading(2.0, 0, 0, 30) - 2.0)).toBeLessThan(Math.PI / 18 + 1e-9);
  });
});

describe("HOME is a real port key", () => {
  it("so the fixture is not quietly testing nothing", () => {
    expect(CITIES[HOME]).toBeDefined();
    expect(CITIES[AWAY]).toBeDefined();
  });
});
