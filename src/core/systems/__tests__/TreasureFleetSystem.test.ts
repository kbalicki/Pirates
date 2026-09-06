import { describe, it, expect } from "vitest";
import {
  plateFleets,
  musterPortFor,
  plateCourse,
  plateProgress,
  stillMustering,
  platePos,
  plateHullsOf,
  materializePlate,
  dematerializePlate,
  writeBackPlate,
  hullStates,
  settlePlatePrize,
  plunderedCount,
  plateShareHome,
  tickTreasureFleets,
  MUSTER_PORTS,
  PLATE_RENDEZVOUS,
  PLATE_EXIT,
  PLATE_MUSTER_SHARE,
  PLATE_TREASURE_HULLS,
  PLATE_ESCORT_HULLS,
  TREASURE_MANIFEST,
} from "../TreasureFleetSystem.ts";
import { getAggregatedEffects } from "../EventEffectsSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { ITEMS } from "../../data/items.ts";
import { PORTS } from "../../data/ports.ts";
import { entityId } from "../../model/ids.ts";
import { EN } from "../../i18n/locales/en.ts";
import { PL } from "../../i18n/locales/pl.ts";
import type { WorldState, WorldEventState, Vec2 } from "../../model/WorldState.ts";

// ===========================================================================
// The plate fleet sails (v0.46.0)
// ===========================================================================

/**
 * `treasure_fleet` had a template, a headline in two languages, a chart pin and
 * a daily half-point of wealth for every Spanish colony — for nineteen releases,
 * without ever putting a hull on the water. What is asserted here is that it
 * now sails the route the map itself implies, that she is worth taking, that
 * taking her is felt ashore, and that a hull the captain sank stays sunk.
 */

const MUSTER = "porto_bello";
const START = 100;
const END = 117;

function plateEvent(over: Partial<WorldEventState> = {}): WorldEventState {
  return {
    id: "plate_1",
    type: "treasure_fleet",
    startDay: START,
    endDay: END,
    ports: [],
    factions: ["spain"],
    severity: 2,
    headline: "news.treasure_fleet",
    vars: { muster: MUSTER, port: CITIES[MUSTER].name },
    ...over,
  } as WorldEventState;
}

function makeWorld(over: {
  day?: number;
  hour?: number;
  pos?: Vec2;
  events?: WorldEventState[];
} = {}): WorldState {
  const shipId = entityId("player_ship");
  const pos = over.pos ?? { x: 40, y: 40 };
  const ports: Record<string, unknown> = {};
  for (const key of Object.keys(PORTS)) {
    ports[key] = {
      factionId: PORTS[key].factionId,
      population: 1000, wealth: 300, defense: 40, garrison: 0,
      inventory: {}, prices: {}, bonusProduces: [], tradeBalance: 0,
    };
  }
  return {
    version: 12,
    time: { day: over.day ?? START, hour: over.hour ?? 12, minute: 0, tick: 0 },
    rng: { seed: 5, state: 5 },
    player: {
      id: entityId("player"),
      shipId,
      gold: 500, notoriety: 0, reputation: {}, ranks: {},
      location: { type: "sea", pos },
      questLog: [], fleet: [], lastPlunderDay: 1, citiesCaptured: 0, courtship: {},
    },
    entities: {
      [shipId as string]: {
        id: shipId, kind: "ship", mode: "sailing", pos, vel: { x: 0, y: 0 },
        heading: 0, sailLevel: 1, depthOffset: 0,
        ship: {
          classId: "frigate", factionId: "england",
          hullHp: 120, hullMax: 120, sailsHp: 90, sailsMax: 90,
          cannons: 28, cargo: {}, cargoCap: 80,
          crew: { current: 80, max: 80, morale: 0.9 },
        },
      },
    },
    ports,
    weather: { windDirRad: 0, windStrength: 0.4, stormActive: false, stormTimer: 0 },
    worldFlags: {}, eventLog: [],
    worldEvents: over.events ?? [plateEvent()],
    knownEventIds: [],
    playerName: "Captain", eraId: "pirates_sunset", startYear: 1690, gameSpeed: 1.2,
  } as unknown as WorldState;
}

/** A day far enough into the event that she is at sea. */
const SAILING_DAY = START + Math.ceil((END - START) * PLATE_MUSTER_SHARE) + 2;

describe("the route is read off the map, not invented", () => {
  it("musters only where the silver actually is", () => {
    for (const key of MUSTER_PORTS) {
      expect(CITIES[key], key).toBeDefined();
      expect(CITIES[key].factionId as unknown as string, key).toBe("spain");
    }
  });

  it("goes by way of Havana, whichever harbour she sailed from", () => {
    const via = CITIES[PLATE_RENDEZVOUS].pos;
    for (const muster of MUSTER_PORTS) {
      const course = plateCourse(plateEvent({ vars: { muster } }));
      expect(course, muster).toBeDefined();
      const nearest = Math.min(...course!.map(p => Math.hypot(p.x - via.x, p.y - via.y)));
      // Close enough to be the rendezvous rather than a coincidence of the
      // coastline: the leg is built through Havana's own water position.
      expect(nearest, muster).toBeLessThan(120);
    }
  });

  it("ends in the Atlantic and not in a harbour", () => {
    const course = plateCourse(plateEvent())!;
    const end = course[course.length - 1];
    expect(end.x).toBeCloseTo(PLATE_EXIT.x, 3);
    expect(end.y).toBeCloseTo(PLATE_EXIT.y, 3);
  });

  it("never sails at all for a save written before this release", () => {
    // A treasure fleet already running in a v0.45.0 save has no muster port
    // stamped, and deriving one from today's world would be inventing a voyage
    // that never happened. It stays what it was: a headline.
    const legacy = plateEvent({ vars: { port: "Puerto Bello" } });
    expect(musterPortFor(legacy)).toBeUndefined();
    expect(plateCourse(legacy)).toBeUndefined();
    expect(platePos(makeWorld({ day: SAILING_DAY, events: [legacy] }), legacy)).toBeUndefined();
  });
});

describe("preparing to sail means preparing to sail", () => {
  it("is in harbour for the first days, and cannot be met there", () => {
    const w = makeWorld({ day: START + 1 });
    const ev = w.worldEvents[0];
    expect(stillMustering(w, ev)).toBe(true);
    expect(platePos(w, ev)).toBeUndefined();
  });

  it("is on the water once the loading days are up", () => {
    const w = makeWorld({ day: SAILING_DAY });
    const ev = w.worldEvents[0];
    expect(stillMustering(w, ev)).toBe(false);
    expect(platePos(w, ev)).toBeDefined();
  });

  it("only ever goes forward, and is at the exit when the sailing ends", () => {
    const ev = plateEvent();
    let last = -1;
    for (let d = START; d < END; d++) {
      const p = plateProgress(makeWorld({ day: d, events: [ev] }), ev);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(plateProgress(makeWorld({ day: END - 1, hour: 23, events: [ev] }), ev))
      .toBeGreaterThan(0.95);
  });

  it("moves inside a single day, so a convoy cannot jump a passage at midnight", () => {
    const ev = plateEvent();
    const dawn = platePos(makeWorld({ day: SAILING_DAY, hour: 0, events: [ev] }), ev)!;
    const dusk = platePos(makeWorld({ day: SAILING_DAY, hour: 12, events: [ev] }), ev)!;
    expect(Math.hypot(dusk.x - dawn.x, dusk.y - dawn.y)).toBeGreaterThan(0);
  });
});

describe("four hulls, and only two of them worth boarding", () => {
  const afloat = () => {
    const w = makeWorld({ day: SAILING_DAY });
    const ev = w.worldEvents[0];
    const at = platePos(w, ev)!;
    return { ...materializePlate(w, ev, at, w.rng), ev, at };
  };

  it("puts the whole convoy on the water or none of it", () => {
    const { world, ev } = afloat();
    expect(plateHullsOf(world, ev.id)).toHaveLength(PLATE_TREASURE_HULLS + PLATE_ESCORT_HULLS);
  });

  it("loads the silver into the treasure hulls and nothing into the escorts", () => {
    const { world, ev } = afloat();
    const hulls = plateHullsOf(world, ev.id);
    const laden = hulls.filter(([, e]) => e.ai?.plateTreasure);
    const guns = hulls.filter(([, e]) => !e.ai?.plateTreasure);
    expect(laden).toHaveLength(PLATE_TREASURE_HULLS);
    expect(guns).toHaveLength(PLATE_ESCORT_HULLS);
    for (const [, e] of laden) expect(e.ship!.cargo).toEqual(TREASURE_MANIFEST);
    for (const [, e] of guns) expect(e.ship!.cargo).toEqual({});
  });

  it("flies the burgee that already tells them apart", () => {
    // `syncCargoBurgee` has shown a gold pennant over a hull laden past half
    // her hold since v0.25.0. The treasure galleons are past it and the escorts
    // are empty, so the player needed no new instrument for this release.
    const { world, ev } = afloat();
    for (const [, e] of plateHullsOf(world, ev.id)) {
      const tons = Object.values(e.ship!.cargo).reduce((a, b) => a + b, 0);
      const fill = tons / e.ship!.cargoCap;
      expect(e.ai?.plateTreasure ? fill : 1 - fill).toBeGreaterThan(0.5);
    }
  });

  it("is worth about eight thousand a hull before the market has an opinion", () => {
    const value = Object.entries(TREASURE_MANIFEST)
      .reduce((sum, [k, q]) => sum + q * (ITEMS[k]?.basePrice ?? 0), 0);
    expect(value).toBeGreaterThan(7000);
    expect(value).toBeLessThan(10000);
  });

  it("sails under Spanish colours, so taking her is an act against a crown", () => {
    const { world, ev } = afloat();
    for (const [, e] of plateHullsOf(world, ev.id)) {
      expect(e.ship!.factionId as unknown as string).toBe("spain");
    }
  });
});

describe("write back before you remove", () => {
  function mauled() {
    const w = makeWorld({ day: SAILING_DAY });
    const ev = w.worldEvents[0];
    const put = materializePlate(w, ev, platePos(w, ev)!, w.rng);
    const hulls = plateHullsOf(put.world, ev.id);
    // Beat one about, and sink another outright.
    const [hurtId, hurt] = hulls[0];
    const [goneId] = hulls[3];
    const entities = { ...put.world.entities };
    entities[hurtId] = { ...hurt, ship: { ...hurt.ship!, hullHp: hurt.ship!.hullMax * 0.4 } };
    delete entities[goneId];
    return { world: { ...put.world, entities }, ev };
  }

  it("remembers what he did to her", () => {
    const { world, ev } = mauled();
    const after = writeBackPlate(world, ev.id);
    const record = hullStates(after.worldEvents[0])!;
    expect(record).toHaveLength(3);
    expect(record.find(h => h.idx === 0)!.hull).toBeCloseTo(0.4, 2);
  });

  it("does not bring back a hull he sank", () => {
    const { world, ev } = mauled();
    const stamped = dematerializePlate(writeBackPlate(world, ev.id), ev.id);
    expect(plateHullsOf(stamped, ev.id)).toHaveLength(0);

    const back = materializePlate(stamped, stamped.worldEvents[0], platePos(stamped, stamped.worldEvents[0])!, stamped.rng);
    const hulls = plateHullsOf(back.world, ev.id);
    expect(hulls).toHaveLength(3);
    // And she is still hurt.
    const hurt = hulls.find(([id]) => id.endsWith("_0"))!;
    expect(hurt[1].ship!.hullHp / hurt[1].ship!.hullMax).toBeCloseTo(0.4, 2);
  });

  it("reads a convoy nobody has ever met as all four, fresh", () => {
    expect(hullStates(plateEvent())).toBeUndefined();
  });
});

describe("Spain only gains what got home", () => {
  it("counts a treasure hull the captain took, and not an escort he sank", () => {
    const w = makeWorld({ day: SAILING_DAY });
    const ev = w.worldEvents[0];
    const put = materializePlate(w, ev, platePos(w, ev)!, w.rng);
    const hulls = plateHullsOf(put.world, ev.id);
    const treasure = hulls.find(([, e]) => e.ai?.plateTreasure)![1];
    const escort = hulls.find(([, e]) => !e.ai?.plateTreasure)![1];

    expect(plunderedCount(settlePlatePrize(put.world, escort).worldEvents[0])).toBe(0);
    expect(plunderedCount(settlePlatePrize(put.world, treasure).worldEvents[0])).toBe(1);
  });

  it("thins the wealth of every Spanish colony by what never arrived", () => {
    const spanish = Object.keys(PORTS).find(k => (PORTS[k].factionId as unknown as string) === "spain")!;
    const whole = makeWorld({ day: SAILING_DAY });
    const gain = getAggregatedEffects(whole, spanish).wealthDelta;
    expect(gain).toBeGreaterThan(0);

    const half = makeWorld({ day: SAILING_DAY, events: [plateEvent({ vars: { muster: MUSTER, plundered: 1 } })] });
    expect(getAggregatedEffects(half, spanish).wealthDelta).toBeCloseTo(gain / 2, 6);

    const none = makeWorld({ day: SAILING_DAY, events: [plateEvent({ vars: { muster: MUSTER, plundered: 2 } })] });
    expect(getAggregatedEffects(none, spanish).wealthDelta).toBeCloseTo(0, 6);
    expect(plateShareHome(none.worldEvents[0])).toBe(0);
  });

  it("cannot be driven past nothing by sinking the escorts as well", () => {
    expect(plateShareHome(plateEvent({ vars: { muster: MUSTER, plundered: 9 } }))).toBe(0);
  });
});

describe("the tick", () => {
  it("does nothing at all to a world with no plate fleet in it", () => {
    const w = makeWorld({ day: SAILING_DAY, events: [] });
    const after = tickTreasureFleets({ ...w, time: { ...w.time, tick: 40 } }, 40);
    expect(after.world.entities).toBe(w.entities);
    expect(after.events).toHaveLength(0);
  });

  it("leaves her off the chart while the player is nowhere near", () => {
    const w = makeWorld({ day: SAILING_DAY, pos: { x: 40, y: 40 } });
    const after = tickTreasureFleets({ ...w, time: { ...w.time, tick: 40 } }, 40);
    expect(plateHullsOf(after.world, "plate_1")).toHaveLength(0);
  });

  it("raises her when he closes, and says so", () => {
    const dry = makeWorld({ day: SAILING_DAY });
    const at = platePos(dry, dry.worldEvents[0])!;
    const w = makeWorld({ day: SAILING_DAY, pos: at });
    const after = tickTreasureFleets({ ...w, time: { ...w.time, tick: 40 } }, 40);
    expect(plateHullsOf(after.world, "plate_1"))
      .toHaveLength(PLATE_TREASURE_HULLS + PLATE_ESCORT_HULLS);
    expect(after.events.some(e => e.type === "Toast")).toBe(true);
  });

  it("takes her off again when the sailing is over", () => {
    const dry = makeWorld({ day: SAILING_DAY });
    const at = platePos(dry, dry.worldEvents[0])!;
    const w = makeWorld({ day: SAILING_DAY, pos: at });
    const afloat = tickTreasureFleets({ ...w, time: { ...w.time, tick: 40 } }, 40).world;
    expect(plateHullsOf(afloat, "plate_1").length).toBeGreaterThan(0);

    const over = { ...afloat, time: { ...afloat.time, day: END + 1, tick: 80 } };
    expect(plateFleets(over)).toHaveLength(0);
    expect(plateHullsOf(tickTreasureFleets(over, 40).world, "plate_1")).toHaveLength(0);
  });
});

describe("the words for it exist in both languages", () => {
  it("has every line the chart and the log can print", () => {
    for (const key of [
      "news.treasure_fleet", "mapevent.treasure_fleet",
      "plate.course_label", "plate.log_sighted", "plate.toast_sighted",
    ]) {
      expect(EN[key], key).toBeTruthy();
      expect(PL[key], key).toBeTruthy();
    }
  });
});
