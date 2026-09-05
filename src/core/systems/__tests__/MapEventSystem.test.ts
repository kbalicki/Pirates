import { describe, it, expect } from "vitest";
import {
  knownPortEvents,
  markValence,
  MARK_MAX_PORTS,
} from "../MapEventSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { initPortPrices, initPortInventory } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId } from "../../model/ids.ts";
import { EN } from "../../i18n/locales/en.ts";
import { PL } from "../../i18n/locales/pl.ts";
import type { WorldState, PortRuntimeState, WorldEventState, WorldEventType } from "../../model/WorldState.ts";

// ===========================================================================
// MapEventSystem — the marks a captain pencils on his own chart (v0.30.0)
// ===========================================================================

/**
 * The rules worth pinning down are all about what is *left out*. A chart that
 * marks everything is not a chart, and three of the fifteen event types either
 * belong to a crown rather than a harbour or are already drawn somewhere else.
 */

function makePort(key: string, over: Partial<PortRuntimeState> = {}): PortRuntimeState {
  const baseline = getPortBaseline(key);
  return {
    portId: portId(key),
    factionId: CITIES[key].factionId,
    prices: initPortPrices(key),
    inventory: initPortInventory(key),
    shipyardQueue: [],
    availableCrew: 10,
    population: baseline.population,
    wealth: baseline.wealth,
    defense: baseline.defense,
    bonusProduces: [],
    ...over,
  };
}

function makeWorld(over: Partial<WorldState> = {}): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  for (const key of Object.keys(CITIES)) ports[key] = makePort(key);
  return {
    version: 12,
    time: { day: 100, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: 500,
      notoriety: 0,
      reputation: {},
      ranks: {},
      location: { type: "sea", pos: { x: 0, y: 0 } },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
    },
    entities: {},
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
    ...over,
  } as unknown as WorldState;
}

const HERE = "port_royal";
const THERE = "tortuga";

function event(over: Partial<WorldEventState> = {}): WorldEventState {
  return {
    id: "ev1",
    type: "famine",
    startDay: 90,
    endDay: 130,
    ports: [HERE],
    factions: ["england"],
    severity: 2,
    headline: "news.famine",
    vars: {},
    ...over,
  };
}

/** A world carrying these events, all of them already heard about. */
function heard(events: WorldEventState[], over: Partial<WorldState> = {}): WorldState {
  return makeWorld({ worldEvents: events, knownEventIds: events.map(e => e.id), ...over });
}

describe("what reaches the chart", () => {
  it("marks a town the player has been told about", () => {
    const marks = knownPortEvents(heard([event()]));
    expect(marks).toHaveLength(1);
    expect(marks[0].portKey).toBe(HERE);
    expect(marks[0].type).toBe("famine");
  });

  it("says nothing about an event nobody has mentioned to him", () => {
    const world = makeWorld({ worldEvents: [event()], knownEventIds: [] });
    expect(knownPortEvents(world)).toEqual([]);
  });

  it("drops the mark the day after the event lifts", () => {
    const lastDay = knownPortEvents(heard([event({ endDay: 100 })]));
    expect(lastDay).toHaveLength(1);
    expect(lastDay[0].daysLeft).toBe(0);
    expect(knownPortEvents(heard([event({ endDay: 99 })]))).toEqual([]);
  });

  it("counts the days down as the event runs out", () => {
    expect(knownPortEvents(heard([event({ endDay: 107 })]))[0].daysLeft).toBe(7);
  });
});

describe("what stays off the chart", () => {
  it("leaves a crown-wide decree to the flags", () => {
    const spanish = Object.keys(CITIES).filter(k => CITIES[k].factionId === "spain");
    expect(spanish.length).toBeGreaterThan(MARK_MAX_PORTS);
    const marks = knownPortEvents(heard([event({ type: "royal_decree", ports: spanish })]));
    expect(marks).toEqual([]);
  });

  it("still marks a hurricane, which covers three towns and no more", () => {
    const three = [HERE, THERE, "havana"];
    expect(three.length).toBeLessThanOrEqual(MARK_MAX_PORTS);
    const marks = knownPortEvents(heard([event({ type: "hurricane", ports: three })]));
    expect(marks.map(m => m.portKey).sort()).toEqual([...three].sort());
  });

  it("leaves a landing to the course renderer, which already draws it", () => {
    for (const type of ["reconquest", "campaign"] as WorldEventType[]) {
      expect(knownPortEvents(heard([event({ type, ports: [HERE] })]))).toEqual([]);
    }
  });

  it("has nothing to draw for a war, which is about crowns and carries no town", () => {
    for (const type of ["war_start", "war_end", "treaty_signed"] as WorldEventType[]) {
      expect(knownPortEvents(heard([event({ type, ports: [] })]))).toEqual([]);
    }
  });

  it("ignores a port key the world does not have", () => {
    expect(knownPortEvents(heard([event({ ports: ["atlantis"] })]))).toEqual([]);
  });
});

describe("one mark per town", () => {
  it("keeps the shut harbour over the gold strike, and counts what it hid", () => {
    const marks = knownPortEvents(heard([
      event({ id: "gold", type: "gold_discovery", severity: 2, endDay: 400 }),
      event({ id: "storm", type: "hurricane", severity: 3, endDay: 104 }),
    ]));
    expect(marks).toHaveLength(1);
    expect(marks[0].type).toBe("hurricane");
    expect(marks[0].closed).toBe(true);
    expect(marks[0].extra).toBe(1);
  });

  it("prefers the graver of two open events", () => {
    const marks = knownPortEvents(heard([
      event({ id: "boom", type: "trade_boom", severity: 1, endDay: 120 }),
      event({ id: "plague", type: "epidemic", severity: 3, endDay: 120 }),
    ]));
    expect(marks[0].type).toBe("epidemic");
    expect(marks[0].extra).toBe(1);
  });

  it("prefers the shorter of two equal events — the transient is the news", () => {
    const marks = knownPortEvents(heard([
      event({ id: "long", type: "gold_discovery", severity: 2, endDay: 400 }),
      event({ id: "short", type: "native_raid", severity: 2, endDay: 110 }),
    ]));
    expect(marks[0].type).toBe("native_raid");
  });

  it("marks two towns separately when one event covers both", () => {
    const marks = knownPortEvents(heard([event({ type: "harvest", ports: [HERE, THERE] })]));
    expect(marks).toHaveLength(2);
    expect(marks.every(m => m.extra === 0)).toBe(true);
  });

  it("returns the towns in a stable order, so a redraw can tell nothing moved", () => {
    const events = [event({ id: "a", ports: [THERE] }), event({ id: "b", ports: [HERE] })];
    const first = knownPortEvents(heard(events)).map(m => m.portKey);
    const second = knownPortEvents(heard([...events].reverse())).map(m => m.portKey);
    expect(first).toEqual(second);
  });
});

describe("the one question the colour answers", () => {
  it("calls a famine, a plague and a hurricane trouble", () => {
    for (const type of ["famine", "epidemic", "hurricane", "native_raid", "pirate_raid", "slave_revolt"] as WorldEventType[]) {
      expect(markValence(type)).toBe("bad");
    }
  });

  it("calls gold, a boom and a harvest an opportunity", () => {
    for (const type of ["gold_discovery", "trade_boom", "harvest", "treasure_fleet"] as WorldEventType[]) {
      expect(markValence(type)).toBe("good");
    }
  });

  it("has no opinion about a war, which the chart does not draw anyway", () => {
    expect(markValence("war_start")).toBe("neutral");
  });
});

describe("the labels exist in both languages", () => {
  const TYPES: WorldEventType[] = [
    "epidemic", "pirate_raid", "trade_boom", "slave_revolt", "hurricane",
    "treasure_fleet", "new_governor", "gold_discovery", "native_raid",
    "famine", "harvest", "royal_decree",
  ];

  it("names every event type a mark can carry", () => {
    for (const type of TYPES) {
      expect(EN["mapevent." + type]).toBeTruthy();
      expect(PL["mapevent." + type]).toBeTruthy();
    }
  });

  it("has the words the renderer adds on top of the type", () => {
    for (const key of ["mapevent.closed", "mapevent.more", "mapevent.shown", "mapevent.hidden"]) {
      expect(EN[key]).toBeTruthy();
      expect(PL[key]).toBeTruthy();
    }
  });
});
