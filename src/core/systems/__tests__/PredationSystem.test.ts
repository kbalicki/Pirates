import { describe, it, expect } from "vitest";
import {
  PREY_AGGRESSION_FLOOR,
  PREY_ODDS,
  PREY_STRIKE_RANGE,
  DEFENCE_FLOOR,
  preyKind,
  holdTons,
  fightingWeight,
  defenceWeight,
  wantsPrey,
  pickPrey,
  resolveHunt,
  runPredation,
} from "../PredationSystem.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { entityId, factionId, shipClassId } from "../../model/ids.ts";
import type { EntityState } from "../../model/EntityState.ts";
import type { WorldState } from "../../model/WorldState.ts";

// ===========================================================================
// Helpers
// ===========================================================================

function ship(
  id: string,
  over: {
    behavior?: string;
    crown?: string;
    classId?: string;
    aggression?: number;
    cargo?: Record<string, number>;
    pos?: { x: number; y: number };
    mode?: "sailing" | "landed";
    awarenessRadius?: number;
    target?: string;
  } = {},
): EntityState {
  const classId = over.classId ?? "brigantine";
  const cls = SHIP_CLASSES[classId];
  return {
    id: entityId(id),
    kind: "ship",
    mode: over.mode ?? "sailing",
    pos: over.pos ?? { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    heading: 0,
    sailLevel: 1,
    depthOffset: 0,
    ship: {
      classId: shipClassId(classId),
      factionId: factionId(over.crown ?? "spain"),
      hullHp: cls.hullMax, hullMax: cls.hullMax,
      sailsHp: cls.sailsMax, sailsMax: cls.sailsMax,
      cannons: cls.cannons,
      cargo: over.cargo ?? {},
      cargoCap: cls.cargoCap,
      crew: { current: Math.round(cls.crewMax * 0.7), max: cls.crewMax, morale: 0.7 },
    },
    ai: {
      behavior: (over.behavior ?? "trader") as never,
      state: "travel",
      aggression: over.aggression ?? 0.5,
      awarenessRadius: over.awarenessRadius ?? 250,
      ...(over.target ? { targetEntityId: entityId(over.target) } : {}),
    },
  };
}

function world(entities: EntityState[], tick = 60): WorldState {
  const map: Record<string, EntityState> = { player_ship: ship("player_ship", { crown: "england" }) };
  for (const e of entities) map[e.id as string] = e;
  return {
    version: 12,
    time: { day: 10, hour: 12, minute: 0, tick },
    rng: { seed: 7, state: 7 },
    player: {
      id: entityId("player_ship"), shipId: entityId("player_ship"), gold: 0, notoriety: 0,
      reputation: {}, ranks: {}, location: { type: "sea", pos: { x: 5000, y: 5000 } },
      questLog: [], fleet: [], lastPlunderDay: 1, citiesCaptured: 0, courtship: {},
    },
    entities: map,
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

// ===========================================================================

describe("what one hull wants with another", () => {
  it("sends a rover after a laden merchantman and nothing else", () => {
    expect(preyKind("pirate", "pirates", "trader", "spain")).toBe("plunder");
    expect(preyKind("pirate", "pirates", "navy", "spain")).toBeNull();
    expect(preyKind("pirate", "pirates", "pirate_hunter", "england")).toBeNull();
  });

  it("never sets a rover on one of her own", () => {
    expect(preyKind("pirate", "pirates", "trader", "pirates")).toBeNull();
  });

  it("sends a man-of-war and a hunter after rovers, and nobody else", () => {
    expect(preyKind("navy", "spain", "trader", "pirates")).toBe("police");
    expect(preyKind("pirate_hunter", "england", "trader", "pirates")).toBe("police");
    expect(preyKind("navy", "spain", "trader", "france")).toBeNull();
  });

  it("leaves a merchantman with no quarrel at all", () => {
    expect(preyKind("trader", "spain", "trader", "england")).toBeNull();
    expect(preyKind("trader", "spain", "trader", "pirates")).toBeNull();
  });
});

describe("the three gates", () => {
  const rover = () => ship("rover", { behavior: "pirate", crown: "pirates", classId: "sloop", aggression: 0.8 });
  const prize = () => ship("prize", { behavior: "trader", crown: "spain", classId: "fluyt", aggression: 0.05, cargo: { sugar_cane: 20 } });

  it("takes a laden merchantman", () => {
    expect(wantsPrey(rover(), "pirates", prize(), "spain")).toBe("plunder");
  });

  it("lets an empty one go — the hold is what she is out for", () => {
    const empty = ship("empty", { behavior: "trader", crown: "spain", classId: "fluyt", aggression: 0.05 });
    expect(holdTons(empty)).toBe(0);
    expect(wantsPrey(rover(), "pirates", empty, "spain")).toBeNull();
  });

  it("refuses a hull with no stomach for it, however good the target", () => {
    const timid = ship("timid", { behavior: "pirate", crown: "pirates", classId: "sloop", aggression: PREY_AGGRESSION_FLOOR - 0.01 });
    expect(wantsPrey(timid, "pirates", prize(), "spain")).toBeNull();
  });

  it("refuses odds she does not like", () => {
    const tiny = ship("tiny", { behavior: "pirate", crown: "pirates", classId: "pinnace", aggression: 0.9 });
    const bigNavy = ship("big", { behavior: "trader", crown: "pirates", classId: "galleon", aggression: 1 });
    // Weight, not class: the galleon under a black flag is police-able but far
    // too heavy for a pinnace.
    expect(fightingWeight(tiny)).toBeLessThan(defenceWeight(bigNavy) * PREY_ODDS);
    expect(wantsPrey(tiny, "pirates", bigNavy, "pirates")).toBeNull();
  });

  it("leaves a ship that is not sailing alone", () => {
    const beached = { ...prize(), mode: "landed" as const };
    expect(wantsPrey(rover(), "pirates", beached, "spain")).toBeNull();
  });
});

describe("what a ship is worth in a fight she did not want", () => {
  it("discounts a merchantman heavily and a man-of-war barely", () => {
    const merch = ship("m", { behavior: "trader", classId: "merchantman", aggression: 0.05 });
    const navy = ship("n", { behavior: "navy", classId: "frigate", aggression: 0.7 });
    expect(defenceWeight(merch) / fightingWeight(merch)).toBeCloseTo(DEFENCE_FLOOR + (1 - DEFENCE_FLOOR) * 0.05, 6);
    expect(defenceWeight(navy) / fightingWeight(navy)).toBeCloseTo(DEFENCE_FLOOR + (1 - DEFENCE_FLOOR) * 0.7, 6);
  });

  it("is what lets a rover take something bigger than herself", () => {
    // The measured failure this exists to fix: without the discount a pinnace
    // weighs 7 against a merchantman's 18 and no hunt was ever allowed.
    const rover = ship("r", { behavior: "pirate", crown: "pirates", classId: "sloop", aggression: 0.8 });
    const merch = ship("m", { behavior: "trader", classId: "merchantman", aggression: 0.05, cargo: { rum: 30 } });
    expect(fightingWeight(rover)).toBeLessThan(fightingWeight(merch));
    expect(wantsPrey(rover, "pirates", merch, "spain")).toBe("plunder");
  });

  it("never falls below the floor, however meek she is", () => {
    const meek = ship("m", { behavior: "trader", classId: "merchantman", aggression: 0 });
    expect(defenceWeight(meek)).toBeCloseTo(fightingWeight(meek) * DEFENCE_FLOOR, 6);
  });
});

describe("picking a quarry", () => {
  const crownOf = (e: EntityState) => e.ship!.factionId as string;

  it("takes the nearest one she wants", () => {
    const rover = ship("rover", { behavior: "pirate", crown: "pirates", classId: "brigantine", aggression: 0.9 });
    const far = ship("far", { behavior: "trader", crown: "spain", classId: "fluyt", aggression: 0.05, cargo: { rum: 5 }, pos: { x: 200, y: 0 } });
    const near = ship("near", { behavior: "trader", crown: "spain", classId: "fluyt", aggression: 0.05, cargo: { rum: 5 }, pos: { x: 90, y: 0 } });
    const choice = pickPrey("rover", rover, [["far", far], ["near", near]], crownOf, 250);
    expect(choice?.id).toBe("near");
    expect(choice?.kind).toBe("plunder");
  });

  it("does not look past her own reach", () => {
    const rover = ship("rover", { behavior: "pirate", crown: "pirates", classId: "brigantine", aggression: 0.9 });
    const far = ship("far", { behavior: "trader", crown: "spain", classId: "fluyt", aggression: 0.05, cargo: { rum: 5 }, pos: { x: 400, y: 0 } });
    expect(pickPrey("rover", rover, [["far", far]], crownOf, 250)).toBeNull();
  });

  it("never picks herself", () => {
    const rover = ship("rover", { behavior: "pirate", crown: "pirates", aggression: 0.9, cargo: { rum: 5 } });
    expect(pickPrey("rover", rover, [["rover", rover]], crownOf, 250)).toBeNull();
  });
});

describe("settling a hunt", () => {
  const rover = ship("rover", { behavior: "pirate", crown: "pirates", classId: "frigate", aggression: 0.9 });
  const prize = ship("prize", { behavior: "trader", crown: "spain", classId: "fluyt", aggression: 0.05, cargo: { rum: 12 } });

  it("gives it to the heavier ship on a low roll", () => {
    const out = resolveHunt("rover", rover, "prize", prize, "plunder", 0);
    expect(out.loserId).toBe("prize");
    expect(out.taken).toBe(true);
    expect(out.spoils).toEqual({ rum: 12 });
  });

  it("lets the underdog win on a high roll", () => {
    const out = resolveHunt("rover", rover, "prize", prize, "plunder", 0.999);
    expect(out.loserId).toBe("rover");
    expect(out.taken).toBe(false);
  });

  it("sinks rather than takes when it is police work", () => {
    const out = resolveHunt("rover", rover, "prize", prize, "police", 0);
    expect(out.loserId).toBe("prize");
    expect(out.taken).toBe(false);
    expect(out.spoils).toEqual({});
  });

  it("is deterministic in the roll, so a save replays the same", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
      expect(resolveHunt("rover", rover, "prize", prize, "plunder", r))
        .toEqual(resolveHunt("rover", rover, "prize", prize, "plunder", r));
    }
  });
});

describe("runPredation", () => {
  it("gives a rover a quarry and writes it where the AI can steer by it", () => {
    const rover = ship("rover", { behavior: "pirate", crown: "pirates", classId: "brigantine", aggression: 0.9 });
    const prize = ship("prize", { behavior: "trader", crown: "spain", classId: "fluyt", aggression: 0.05, cargo: { rum: 8 }, pos: { x: 100, y: 0 } });
    const out = runPredation(world([rover, prize]), 60);
    expect(out.entities.rover.ai!.targetEntityId).toBe("prize");
    expect(out.entities.rover.ai!.state).toBe("chase");
  });

  it("takes the loser off the water once they are alongside", () => {
    const rover = ship("rover", { behavior: "pirate", crown: "pirates", classId: "frigate", aggression: 0.9, target: "prize" });
    const prize = ship("prize", { behavior: "trader", crown: "spain", classId: "fluyt", aggression: 0.05, cargo: { rum: 8 }, pos: { x: PREY_STRIKE_RANGE - 4, y: 0 } });
    const out = runPredation(world([rover, prize]), 60);
    const afloat = Object.keys(out.entities).filter(k => k !== "player_ship");
    expect(afloat.length).toBe(1);
  });

  it("moves the hold across when a rover keeps her prize", () => {
    const rover = ship("rover", { behavior: "pirate", crown: "pirates", classId: "galleon", aggression: 0.9, target: "prize" });
    const prize = ship("prize", { behavior: "trader", crown: "spain", classId: "pinnace", aggression: 0.05, cargo: { rum: 8 }, pos: { x: 5, y: 0 } });
    const out = runPredation(world([rover, prize]), 60);
    if (out.entities.rover) {
      expect(out.entities.rover.ship!.cargo.rum).toBe(8);
      expect(out.entities.rover.ai!.targetEntityId).toBeUndefined();
    }
  });

  it("does nothing at all between its intervals", () => {
    const rover = ship("rover", { behavior: "pirate", crown: "pirates", classId: "brigantine", aggression: 0.9 });
    const prize = ship("prize", { behavior: "trader", crown: "spain", classId: "fluyt", aggression: 0.05, cargo: { rum: 8 }, pos: { x: 100, y: 0 } });
    const w = world([rover, prize], 17);
    expect(runPredation(w, 1)).toBe(w);
  });

  it("leaves a named hull and her escort to their own system", () => {
    const rover = ship("rover", { behavior: "pirate", crown: "pirates", classId: "brigantine", aggression: 0.9 });
    rover.ai!.namedShipId = "named_1";
    const prize = ship("prize", { behavior: "trader", crown: "spain", classId: "fluyt", aggression: 0.05, cargo: { rum: 8 }, pos: { x: 100, y: 0 } });
    const out = runPredation(world([rover, prize]), 60);
    expect(out.entities.rover.ai!.targetEntityId).toBeUndefined();
  });

  it("gives up a quarry that has drawn out of reach", () => {
    const rover = ship("rover", { behavior: "pirate", crown: "pirates", classId: "brigantine", aggression: 0.9, target: "prize", awarenessRadius: 100 });
    const prize = ship("prize", { behavior: "trader", crown: "spain", classId: "fluyt", aggression: 0.05, cargo: { rum: 8 }, pos: { x: 900, y: 0 } });
    const out = runPredation(world([rover, prize]), 60);
    expect(out.entities.rover.ai!.targetEntityId).toBeUndefined();
    expect(out.entities.prize).toBeDefined();
  });

  it("is quiet in a sea with nobody worth chasing", () => {
    const a = ship("a", { behavior: "trader", crown: "spain", cargo: { rum: 8 } });
    const b = ship("b", { behavior: "trader", crown: "england", cargo: { rum: 8 }, pos: { x: 40, y: 0 } });
    const w = world([a, b]);
    const out = runPredation(w, 60);
    expect(Object.keys(out.entities).length).toBe(Object.keys(w.entities).length);
    expect(out.entities.a.ai!.targetEntityId).toBeUndefined();
  });
});
