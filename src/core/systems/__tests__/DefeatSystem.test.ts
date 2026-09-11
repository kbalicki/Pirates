import { describe, it, expect } from "vitest";
import {
  settleDefeat,
  heirToTheFlag,
  nearestPort,
  DEFEAT_SURVIVOR_SHARE,
  RANSOM_SHARE,
  CASTAWAY_CLASS,
  CASTAWAY_PRICE,
} from "../DefeatSystem.ts";
import { mapDamageSpeedMultiplier, MIN_AFLOAT_HULL, cargoSurvivingSinking } from "../DamageSystem.ts";
import { AGROUND_HULL_PER_TICK } from "../../services/SeaDepth.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { PORTS } from "../../data/ports.ts";
import type { WorldState, FleetShip } from "../../model/WorldState.ts";
import { entityId, shipClassId, factionId } from "../../model/ids.ts";

// ===========================================================================
// DefeatSystem — losing the ship you were standing on (v0.59.0)
// ===========================================================================

/**
 * These tests exist because of one number: a hull at zero made `0.00` on the
 * world map and a hull at one made `0.45`. Everything below is either about
 * keeping a hull the map still carries off that number, or about what the
 * captain has once the hull is genuinely gone.
 *
 * Note the shape of the assertions. "Is he still afloat" is not a regression
 * assertion — he always has *a* ship. What separates the old code from the new
 * is **how fast that ship moves**, which town he is in, and how much of the
 * purse is left, so those are what is measured.
 */

const FLAG = "galleon";

function makeWorld(over: {
  crew?: number;
  gold?: number;
  fleet?: FleetShip[];
  cargo?: Record<string, number>;
  pos?: { x: number; y: number };
} = {}): WorldState {
  const cls = SHIP_CLASSES[FLAG];
  const {
    crew = 80, gold = 4000, fleet = [], cargo = {},
    pos = { x: 1646, y: 1511 }, // off Port Royal
  } = over;
  return {
    version: 12,
    time: { day: 200, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold,
      notoriety: 0,
      reputation: {},
      ranks: {},
      location: { type: "sea", pos },
      questLog: [],
      fleet,
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
    },
    entities: {
      player_ship: {
        id: entityId("player_ship"),
        kind: "ship",
        mode: "sailing",
        depthOffset: 0,
        pos,
        vel: { x: 1, y: 1 },
        heading: 0,
        sailLevel: 1,
        ship: {
          classId: shipClassId(FLAG),
          factionId: factionId("england"),
          hullHp: 0,
          hullMax: cls.hullMax,
          sailsHp: cls.sailsMax * 0.5,
          sailsMax: cls.sailsMax,
          cannons: cls.cannons,
          cargo,
          cargoCap: cls.cargoCap,
          crew: { current: crew, max: cls.crewMax, morale: 0.6 },
          wounded: 12,
        },
      },
    },
    ports: {},
    weather: { windDirRad: 0, windStrength: 1, stormActive: false },
    worldEvents: [],
    eventLog: [],
    knownEventIds: [],
    namedShips: {},
    startYear: 1680,
  } as unknown as WorldState;
}

function consort(classId: string, over: Partial<FleetShip> = {}): FleetShip {
  const cls = SHIP_CLASSES[classId];
  return {
    classId,
    hullHp: cls.hullMax,
    hullMax: cls.hullMax,
    sailsHp: cls.sailsMax,
    sailsMax: cls.sailsMax,
    cannons: cls.cannons,
    crew: Math.round(cls.crewMax * 0.6),
    morale: 0.8,
    ...over,
  };
}

// ── The bug itself ────────────────────────────────────────

describe("the hull the map is handed", () => {
  /**
   * The whole release in one assertion. Before v0.59.0 the map got back the
   * hull that had just sunk — `hullHp: 0` — and `mapDamageSpeedMultiplier`
   * answers a true zero for that, at every sail and in every wind.
   */
  it("can still be moved, which the sunk one could not", () => {
    const before = makeWorld();
    const wreck = before.entities.player_ship.ship!;
    expect(mapDamageSpeedMultiplier(wreck.hullHp, wreck.hullMax, wreck.sailsHp, wreck.sailsMax))
      .toBe(0);

    const after = settleDefeat(before).world.entities.player_ship.ship!;
    expect(after.hullHp).toBeGreaterThan(0);
    expect(mapDamageSpeedMultiplier(after.hullHp, after.hullMax, after.sailsHp, after.sailsMax))
      .toBeGreaterThan(0.5);
  });

  it("is never the hull that went down", () => {
    const w = settleDefeat(makeWorld()).world;
    expect(w.entities.player_ship.ship!.classId as string).not.toBe(FLAG);
  });

  /** The helm is cleared too, or the new hull sails off on a dead man's orders. */
  it("is not still carrying the sunk ship's way and canvas", () => {
    const e = settleDefeat(makeWorld()).world.entities.player_ship;
    expect(e.vel).toEqual({ x: 0, y: 0 });
    expect(e.sailLevel).toBe(0);
  });
});

// ── The flag shifts ───────────────────────────────────────

describe("a captain who sailed in company", () => {
  it("moves his flag to the biggest hull still afloat, not the first one", () => {
    const fleet = [consort("brigantine"), consort("frigate"), consort("sloop")];
    const res = settleDefeat(makeWorld({ fleet }));
    expect(res.fate.kind).toBe("flag_shifted");
    expect(res.world.entities.player_ship.ship!.classId as string).toBe("frigate");
  });

  it("will not shift it to a hull that has already sunk", () => {
    const fleet = [consort("galleon", { hullHp: 0 }), consort("sloop")];
    expect(heirToTheFlag(fleet)).toBe(1);
    const res = settleDefeat(makeWorld({ fleet }));
    expect(res.world.entities.player_ship.ship!.classId as string).toBe("sloop");
  });

  it("loses exactly the one hull, and the rest of the squadron stays", () => {
    const fleet = [consort("brigantine"), consort("frigate"), consort("sloop")];
    const res = settleDefeat(makeWorld({ fleet }));
    expect(res.world.player.fleet.map(f => f.classId)).toEqual(["brigantine", "sloop"]);
  });

  it("brings half his men across, and no more than she has berths for", () => {
    const fleet = [consort("sloop", { crew: 2 })];
    const res = settleDefeat(makeWorld({ crew: 200, fleet }));
    const sloop = SHIP_CLASSES.sloop;
    // 200 on the roll would be 100 survivors; a sloop's berths are the limit.
    expect(Math.floor(200 * DEFEAT_SURVIVOR_SHARE)).toBeGreaterThan(sloop.crewMax);
    expect(res.world.entities.player_ship.ship!.crew.current).toBe(sloop.crewMax);
    // And what is reported is what came over the side, not her whole muster.
    expect(res.fate.kind === "flag_shifted" && res.fate.survivors).toBe(sloop.crewMax - 2);
  });

  it("keeps the purse — nobody ransoms a captain who sailed away", () => {
    const res = settleDefeat(makeWorld({ gold: 4000, fleet: [consort("sloop")] }));
    expect(res.world.player.gold).toBe(4000);
  });

  /** The v0.37.0 trap: what goes into `vars` is printed, so it is a name. */
  it("writes a ship's name into the log, not a translation key", () => {
    const res = settleDefeat(makeWorld({ fleet: [consort("frigate")] }));
    const entry = res.world.eventLog.find(e => e.key === "defeat.log_flag_shifted");
    expect(String(entry?.vars?.ship)).not.toContain("ship.");
  });
});

// ── He is put ashore ──────────────────────────────────────

describe("a captain who sailed alone", () => {
  /**
   * The two landings have to be *different towns* from the same spot, or the
   * test proves nothing about who beat him. Off Port Royal, a rover leaves him
   * at Port Royal; a Spanish man-of-war carries him to her own nearest colony.
   */
  it("is landed by a king's ship in that king's nearest town", () => {
    const rover = settleDefeat(makeWorld(), "spain", "pirate").fate;
    const navy = settleDefeat(makeWorld(), "spain", "navy").fate;
    expect(rover.kind === "put_ashore" && rover.portKey).toBe("port_royal");
    expect(navy.kind === "put_ashore" && navy.prisoner).toBe(true);
    expect(navy.kind === "put_ashore" && PORTS[navy.portKey].factionId as string).toBe("spain");
    expect(navy.kind === "put_ashore" && navy.portKey).not.toBe("port_royal");
  });

  it("is left where the boats fetched up when nobody official beat him", () => {
    const fate = settleDefeat(makeWorld(), "spain", "trader").fate;
    expect(fate.kind === "put_ashore" && fate.prisoner).toBe(false);
    expect(fate.kind === "put_ashore" && fate.portKey).toBe("port_royal");
  });

  it("pays half the purse in ransom and the yard's price out of the rest", () => {
    const res = settleDefeat(makeWorld({ gold: 4000 }));
    expect(res.world.player.gold).toBe(4000 - 4000 * RANSOM_SHARE - CASTAWAY_PRICE);
  });

  it("still gets a hull when the purse will not cover one", () => {
    const res = settleDefeat(makeWorld({ gold: 10 }));
    expect(res.world.player.gold).toBe(0);
    expect(res.world.entities.player_ship.ship!.classId as string).toBe(CASTAWAY_CLASS);
  });

  it("is put on the water at the town he was landed at, not where she sank", () => {
    const res = settleDefeat(makeWorld({ pos: { x: 1646, y: 1511 } }), "spain", "navy");
    const fate = res.fate;
    expect(fate.kind).toBe("put_ashore");
    const port = fate.kind === "put_ashore" ? PORTS[fate.portKey] : undefined;
    const at = res.world.entities.player_ship.pos;
    expect(Math.hypot(at.x - port!.pos.x, at.y - port!.pos.y)).toBeLessThan(200);
    expect(res.world.player.location.pos).toEqual(at);
  });

  it("lands with the men who reached a boat and nobody from the sick bay", () => {
    const res = settleDefeat(makeWorld({ crew: 12 }));
    const ship = res.world.entities.player_ship.ship!;
    expect(ship.crew.current).toBe(Math.floor(12 * DEFEAT_SURVIVOR_SHARE));
    expect(ship.wounded).toBe(0);
  });

  /**
   * The printed number has to be the number he has. Eighty men off a galleon
   * is forty survivors and a pinnace has fifteen berths: the first draft of
   * the result screen promised him forty and handed him fifteen.
   */
  it("reports the men aboard, not the men who reached a boat", () => {
    const res = settleDefeat(makeWorld({ crew: 80 }));
    const berths = SHIP_CLASSES[CASTAWAY_CLASS].crewMax;
    expect(Math.floor(80 * DEFEAT_SURVIVOR_SHARE)).toBeGreaterThan(berths);
    expect(res.fate.kind === "put_ashore" && res.fate.survivors).toBe(berths);
    expect(res.world.entities.player_ship.ship!.crew.current).toBe(berths);
  });

  it("carries off only what the boats held, and only what the pinnace will take", () => {
    const galleonHold = SHIP_CLASSES[FLAG].cargoCap;
    const res = settleDefeat(makeWorld({ crew: 80, cargo: { sugar_cane: galleonHold } }));
    const ship = res.world.entities.player_ship.ship!;
    const kept = cargoSurvivingSinking(80 / SHIP_CLASSES[FLAG].crewMax);
    const wanted = Math.floor(galleonHold * kept);
    const pinnaceHold = SHIP_CLASSES[CASTAWAY_CLASS].cargoCap;
    expect(wanted).toBeGreaterThan(pinnaceHold);
    expect(ship.cargo.sugar_cane).toBe(pinnaceHold);
  });

  it("has no squadron left to sail with", () => {
    const res = settleDefeat(makeWorld({ fleet: [consort("sloop", { hullHp: 0 })] }));
    expect(res.fate.kind).toBe("put_ashore");
    expect(res.world.player.fleet).toEqual([]);
  });
});

// ── The floor the two grinders stop at ────────────────────

describe("the hull floor", () => {
  /**
   * The sandbank measurement, as an assertion. 0.12 hull a tick at 20 ticks a
   * second is 2.4 a second: a sloop left touching is at zero in 25 seconds and
   * a galleon in 75. What must not happen is the zero.
   */
  it("is what the bottom grinds towards, never through", () => {
    for (const cls of Object.values(SHIP_CLASSES)) {
      const ticks = Math.ceil(cls.hullMax / AGROUND_HULL_PER_TICK) + 200;
      let hull = cls.hullMax;
      for (let i = 0; i < ticks; i++) {
        hull = Math.max(Math.min(MIN_AFLOAT_HULL, hull), hull - AGROUND_HULL_PER_TICK);
      }
      expect(hull, cls.id as string).toBe(MIN_AFLOAT_HULL);
      expect(mapDamageSpeedMultiplier(hull, cls.hullMax, cls.sailsMax, cls.sailsMax))
        .toBeGreaterThan(0);
    }
  });

  it("is one point, which is the whole difference measured", () => {
    const cls = SHIP_CLASSES.sloop;
    expect(mapDamageSpeedMultiplier(0, cls.hullMax, cls.sailsMax, cls.sailsMax)).toBe(0);
    expect(mapDamageSpeedMultiplier(MIN_AFLOAT_HULL, cls.hullMax, cls.sailsMax, cls.sailsMax))
      .toBeCloseTo(0.45, 5);
  });
});

// ── Housekeeping ──────────────────────────────────────────

describe("settleDefeat", () => {
  it("does not mutate the world it was handed", () => {
    const w = makeWorld({ fleet: [consort("sloop")] });
    const snapshot = JSON.stringify(w);
    settleDefeat(w, "spain", "navy");
    expect(JSON.stringify(w)).toBe(snapshot);
  });

  it("keeps the player's ship under the same entity id", () => {
    const w = makeWorld();
    const after = settleDefeat(w).world;
    expect(Object.keys(after.entities)).toEqual(Object.keys(w.entities));
    expect(after.entities[after.player.shipId as string]).toBeDefined();
  });

  it("falls back to any town when the victor's crown holds none", () => {
    expect(nearestPort(makeWorld(), { x: 1646, y: 1511 }, "nobody")).toBe("port_royal");
  });
});
