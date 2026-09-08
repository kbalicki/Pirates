import { describe, it, expect } from "vitest";
import { updateNpcAi, bestVmgHeading, layOrTack, looksDangerous } from "../NpcAiSystem.ts";
import { windSpeedModifier, IRONS_STEERAGE } from "../WeatherSystem.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { normalizeHeading } from "../../services/Geometry.ts";
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
    expect(windSpeedModifier(upwind, 0, 1, 60)).toBeGreaterThan(IRONS_STEERAGE);
  });

  it("tacks in an ordinary trade wind, not only in a gale (v0.53.0)", () => {
    // The claim above held at full strength and nowhere near the water. At the
    // seasonal wind the old polar paid a ship in irons 0.48 of base speed, so
    // this same call handed back the bearing itself — dead into the wind — for
    // every rig in the game. The captain was told to tack by the help screen
    // and the traffic around him never did.
    for (const mwa of [30, 45, 60]) {
      const h = bestVmgHeading(0, 0, 0.52, mwa);
      const off = Math.abs(normalizeHeading(h)) * (180 / Math.PI);
      expect(Math.min(off, 360 - off)).toBeGreaterThanOrEqual(mwa);
    }
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

// ===========================================================================
// Working to windward (v0.53.0.2)
// ===========================================================================

/**
 * Two things reported from play, one release after the dead zone started to
 * cost something:
 *
 *   • NPC ships walking a few lengths one way and a few lengths back, for ever,
 *     in open water — "bouncing off an invisible wall";
 *   • traffic that simply stopped where its next mark lay upwind.
 *
 * Both are the same hole. `updatePortToPort` steers the bow at the mark and had
 * never needed to know about the wind, because before v0.53.0 a bearing dead to
 * windward was worth 0.48 of base speed. It is now worth `IRONS_STEERAGE` —
 * a thirteenth of the current she is floating in — so she is a cork, and the
 * bearing to the mark walks about as the water carries her.
 *
 * The naive repair is worse in a way the player can see: the two tacks either
 * side of the bearing score within a hair of each other, so re-deciding every
 * tick changes her heading **every tick**. Measured on a 600-unit leg: 4000
 * changes in 4000 ticks. Hence `TACK_HOLD_SHARE`.
 */
describe("working to windward", () => {
  const TRADE = 0.52;
  const toward = (from: { x: number; y: number }, to: { x: number; y: number }) =>
    Math.atan2(to.x - from.x, -(to.y - from.y));

  /** A hull sailing 600 units dead upwind, with the water setting her across. */
  function voyage(classId: string, steer: "at_mark" | "naive" | "hold", cross: number) {
    const cls = SHIP_CLASSES[classId];
    const mwa = cls.minWindAngle;
    const mark = { x: 0, y: -600 };
    let pos = { x: 0, y: 0 };
    let heading = toward(pos, mark);
    let tacks = 0;
    for (let i = 0; i < 4000; i++) {
      const wanted = toward(pos, mark);
      const next = steer === "at_mark" ? wanted
        : steer === "naive" ? bestVmgHeading(wanted, 0, TRADE, mwa)
        : layOrTack(heading, wanted, 0, TRADE, mwa);
      if (Math.abs(next - heading) > (20 * Math.PI) / 180) tacks++;
      heading = next;
      const spd = cls.speedBase * 0.7 * windSpeedModifier(heading, 0, TRADE, mwa);
      pos = { x: pos.x + Math.sin(heading) * spd + cross, y: pos.y - Math.cos(heading) * spd };
      if (Math.hypot(mark.x - pos.x, mark.y - pos.y) < 20) break;
    }
    return { closed: 600 - Math.hypot(mark.x - pos.x, mark.y - pos.y), tacks };
  }

  const HULLS = ["fluyt", "merchantman", "frigate", "sloop"];

  it("pointing at a mark dead upwind carries her BACKWARDS in a current", () => {
    // This is the bug as the player saw it, kept as the thing being fixed.
    for (const h of HULLS) expect(voyage(h, "at_mark", 0.06).closed).toBeLessThan(0);
  });

  it("she works up to it instead, and gets there", () => {
    for (const h of HULLS) {
      expect(voyage(h, "hold", 0.06).closed).toBeGreaterThan(20);
      expect(voyage(h, "hold", 0).closed).toBeGreaterThan(voyage(h, "at_mark", 0).closed * 1.3);
    }
  });

  it("and she stands on: no ship goes about more than twenty times a voyage", () => {
    // Without the hold she goes about on every tick of the leg. That is the
    // "invisible wall" — a few lengths one way, a few lengths back, for ever.
    for (const h of HULLS) {
      expect(voyage(h, "naive", 0).tacks).toBeGreaterThan(3000);
      expect(voyage(h, "hold", 0).tacks).toBeLessThan(20);
    }
  });

  it("holding a tack costs her nothing worth having", () => {
    for (const h of HULLS) {
      const held = voyage(h, "hold", 0).closed;
      const naive = voyage(h, "naive", 0).closed;
      expect(held).toBeGreaterThan(naive * 0.97);
    }
  });

  it("a bearing she can lay is still steered straight at, exactly as before", () => {
    // The release promised that everything outside the dead zone is untouched.
    for (const mwa of [30, 40, 50, 60]) {
      for (let deg = mwa + 1; deg <= 180; deg += 1) {
        const wanted = (deg * Math.PI) / 180;
        expect(layOrTack(0, wanted, 0, TRADE, mwa)).toBe(wanted);
      }
    }
  });
});
