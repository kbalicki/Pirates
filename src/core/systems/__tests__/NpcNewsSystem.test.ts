import { describe, it, expect } from "vitest";
import {
  checkNpcNewsExchange, takeNpcNews, freshNews, HAIL_RANGE, HAIL_ITEMS,
} from "../NpcNewsSystem.ts";
import { entityId, shipClassId, factionId } from "../../model/ids.ts";
import type { WorldState } from "../../model/WorldState.ts";
import type { EntityState, NewsItem } from "../../model/EntityState.ts";

// ===========================================================================
// NpcNewsSystem — what she shouts, and what you have to close with her for
// ===========================================================================

/**
 * Two channels carried the same news and the wrong one ran first. The hail at
 * thirty units took three items — a whole board, measured at 2.36 on average —
 * silently, and the encounter screen at eighteen was left redisplaying what the
 * player had been handed a moment earlier by a rule nothing announced.
 *
 * So these tests are mostly about **which channel gives what**, and about the
 * one flag that makes the split hold: without `hailed`, a check that runs once
 * a second hands over item two, then three, and the one-item rule is worth
 * nothing at all.
 */

function makeNews(n: number): NewsItem[] {
  return Array.from({ length: n }, (_, i) => ({
    eventId: `ev_${i}`,
    headline: "news.epidemic",
    vars: { port: "Havana" },
    dayHeard: 1,
    sourcePort: "havana",
  }));
}

function makeShip(id: string, x: number, over: Partial<EntityState["ai"]> = {}): EntityState {
  return {
    id: entityId(id),
    kind: "ship",
    mode: "sailing",
    pos: { x, y: 0 },
    vel: { x: 0, y: 0 },
    heading: 0,
    sailLevel: 0.5,
    depthOffset: 0,
    ship: {
      classId: shipClassId("sloop"), factionId: factionId("england"),
      hullHp: 60, hullMax: 100, sailsHp: 60, sailsMax: 100,
      cannons: 6, cargo: {}, cargoCap: 100,
      crew: { current: 10, max: 40, morale: 0.8 },
    },
    ai: {
      behavior: "trader", state: "travel",
      aggression: 0.2, awarenessRadius: 120,
      news: makeNews(3),
      ...over,
    },
  } as unknown as EntityState;
}

function makeWorld(npcs: EntityState[], playerMode = "sailing"): WorldState {
  const entities: Record<string, EntityState> = {
    player_ship: {
      id: entityId("player_ship"), kind: "ship", mode: playerMode,
      pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, heading: 0,
      sailLevel: 0.5, depthOffset: 0,
      ship: {
        classId: shipClassId("sloop"), factionId: factionId("england"),
        hullHp: 100, hullMax: 100, sailsHp: 100, sailsMax: 100,
        cannons: 6, cargo: {}, cargoCap: 100,
        crew: { current: 20, max: 40, morale: 0.8 },
      },
    } as unknown as EntityState,
  };
  for (const n of npcs) entities[n.id as string] = n;
  return {
    version: 12,
    time: { day: 10, hour: 12, minute: 0, tick: 200 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"), shipId: entityId("player_ship"), gold: 100,
      notoriety: 0, reputation: {}, ranks: {},
      location: { type: "sea", pos: { x: 0, y: 0 } },
      questLog: [], fleet: [], lastPlunderDay: 1, citiesCaptured: 0, courtship: {},
    },
    entities, ports: {},
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: {}, eventLog: [], worldEvents: [], knownEventIds: [],
    playerName: "Captain", eraId: "pirates_sunset", startYear: 1690, gameSpeed: 1.2,
  } as unknown as WorldState;
}

// ── The hail ───────────────────────────────────────────────────────────────

describe("a hail across the water", () => {
  it("is worth one item, not her whole board", () => {
    const res = checkNpcNewsExchange(makeWorld([makeShip("npc1", 20)]));
    expect(res.newNews.length).toBe(HAIL_ITEMS);
    expect(HAIL_ITEMS).toBe(1);
    expect(res.world.knownEventIds).toHaveLength(1);
  });

  /**
   * The one she shouts is the top of her board. `getPortNews` has sorted boards
   * by reach since v0.57.0, so the top item is the one that concerns her own
   * town most — which is what a man calls across a hundred yards of sea.
   */
  it("shouts the top of her board", () => {
    const res = checkNpcNewsExchange(makeWorld([makeShip("npc1", 20)]));
    expect(res.newNews[0].eventId).toBe("ev_0");
  });

  it("says so, so the chart does not grow marks in silence", () => {
    const res = checkNpcNewsExchange(makeWorld([makeShip("npc1", 20)]));
    // The engine turns a non-empty `newNews` into the `npc_news` event the
    // renderer finally has a `case` for; the journal line is written here.
    expect(res.newNews.length).toBeGreaterThan(0);
    expect(res.world.eventLog).toHaveLength(1);
    expect(res.world.eventLog[0].key).toBe("news.epidemic");
  });

  /**
   * The whole reason `hailed` exists. The check runs once a second, and without
   * the flag a captain sailing quietly alongside collected item two, then item
   * three, and the one-item rule bought nothing.
   */
  it("happens once per ship, however long he sails beside her", () => {
    let w = makeWorld([makeShip("npc1", 20)]);
    const first = checkNpcNewsExchange(w);
    w = first.world;
    expect(first.newNews).toHaveLength(1);
    for (let i = 0; i < 5; i++) {
      const again = checkNpcNewsExchange(w);
      expect(again.newNews).toHaveLength(0);
      w = again.world;
    }
    expect(w.knownEventIds).toHaveLength(1);
    expect(w.entities.npc1.ai?.hailed).toBe(true);
  });

  it("does not reach past hailing distance", () => {
    const res = checkNpcNewsExchange(makeWorld([makeShip("npc1", HAIL_RANGE + 1)]));
    expect(res.newNews).toHaveLength(0);
    expect(res.world.entities.npc1.ai?.hailed).toBeUndefined();
  });

  it("carries at exactly hailing distance", () => {
    const res = checkNpcNewsExchange(makeWorld([makeShip("npc1", HAIL_RANGE)]));
    expect(res.newNews).toHaveLength(1);
  });

  it("is not something a pirate does", () => {
    const res = checkNpcNewsExchange(makeWorld([makeShip("npc1", 20, { behavior: "pirate" })]));
    expect(res.newNews).toHaveLength(0);
  });

  it("needs the captain at sea, not ashore or in port", () => {
    const res = checkNpcNewsExchange(makeWorld([makeShip("npc1", 20)], "docked"));
    expect(res.newNews).toHaveLength(0);
  });

  it("two ships in range shout one thing each, and never the same thing", () => {
    const a = makeShip("npc1", 10);
    const b = makeShip("npc2", 20);
    const res = checkNpcNewsExchange(makeWorld([a, b]));
    expect(res.newNews).toHaveLength(2);
    expect(new Set(res.newNews.map(n => n.eventId)).size).toBe(2);
  });

  it("marks a ship with nothing new to say, so she is not asked again", () => {
    const w = makeWorld([makeShip("npc1", 20, { news: [] })]);
    const res = checkNpcNewsExchange(w);
    expect(res.newNews).toHaveLength(0);
    expect(res.world.entities.npc1.ai?.hailed).toBe(true);
  });

  it("leaves the world alone when there is nobody within hail", () => {
    const w = makeWorld([makeShip("npc1", 500)]);
    expect(checkNpcNewsExchange(w).world).toBe(w);
  });
});

// ── Going alongside ────────────────────────────────────────────────────────

describe("going alongside", () => {
  it("buys everything the hail left on her board", () => {
    const hailed = checkNpcNewsExchange(makeWorld([makeShip("npc1", 20)])).world;
    expect(hailed.knownEventIds).toHaveLength(1);

    const taken = takeNpcNews(hailed, "npc1");
    expect(taken.newNews.map(n => n.eventId)).toEqual(["ev_1", "ev_2"]);
    expect(taken.world.knownEventIds).toHaveLength(3);
    // One journal line per item, both channels the same way.
    expect(taken.world.eventLog).toHaveLength(3);
  });

  it("has nothing left to give the second time he asks", () => {
    const once = takeNpcNews(makeWorld([makeShip("npc1", 20)]), "npc1");
    expect(once.newNews).toHaveLength(3);
    expect(takeNpcNews(once.world, "npc1").newNews).toHaveLength(0);
  });

  /**
   * What the reply's label reads. It used to read `news.length > 0`, which was
   * true of every trader afloat, so "Ask for news" was offered by a ship whose
   * whole board the player had already been handed.
   */
  it("tells him honestly when she has nothing he has not heard", () => {
    const emptied = takeNpcNews(makeWorld([makeShip("npc1", 20)]), "npc1").world;
    expect(freshNews(emptied, "npc1")).toHaveLength(0);
    expect(freshNews(makeWorld([makeShip("npc1", 20)]), "npc1")).toHaveLength(3);
  });

  it("is unmoved by a ship that is not there", () => {
    const w = makeWorld([]);
    expect(takeNpcNews(w, "nobody").world).toBe(w);
  });
});
