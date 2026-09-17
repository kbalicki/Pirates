import { describe, it, expect } from "vitest";
import { liveNews } from "../NewsPhaseSystem.ts";
import { plateNews, PLATE_MUSTER_SHARE, PLATE_RENDEZVOUS, MUSTER_PORTS } from "../TreasureFleetSystem.ts";
import { expeditionFromEvent } from "../ReconquestSystem.ts";
import { getPortNews } from "../WorldEventSystem.ts";
import { portNameKey } from "../../i18n/names.ts";
import { t, setLang } from "../../i18n/index.ts";
import { EN } from "../../i18n/locales/en.ts";
import { PL } from "../../i18n/locales/pl.ts";
import type { WorldState, WorldEventState } from "../../model/WorldState.ts";

// ===========================================================================
// v0.72.0 — the noticeboard could not change its mind
//
// Three events on the board have phases, and the sentence printed on them was
// stamped on the day the event broke. Measured before the fix: the landing
// clock wrong on 93.1% of board-days, "preparing to sail" false on 72.3% of
// the plate fleet's, and the storm's eye past the town it names on 56% of its.
// ===========================================================================

/** Just enough world for the readers under test: a day and an event list. */
function worldAt(day: number, events: WorldEventState[] = []): WorldState {
  return {
    time: { day, hour: 12, minute: 0, tick: 0 },
    worldEvents: events,
    knownEventIds: events.map(e => e.id),
    ports: {},
  } as unknown as WorldState;
}

// ── The landing clock ──────────────────────────────────────

function campaign(startDay: number, sailDays: number): WorldEventState {
  return {
    id: "campaign_port_royal_100",
    type: "campaign",
    startDay,
    endDay: startDay + sailDays,
    ports: ["port_royal"],
    factions: ["spain", "england"],
    severity: 3,
    headline: "news.campaign",
    vars: {
      port: portNameKey("port_royal"),
      faction: "faction.spain.name",
      holder: "faction.england.name",
      soldiers: 600,
      guns: 150,
      days: sailDays,
    },
  };
}

describe("the days-out number counts down", () => {
  it("says what was stamped on the day the squadron sails", () => {
    const ev = campaign(100, 18);
    expect(liveNews(worldAt(100), ev).vars.days).toBe(18);
  });

  it("says one on the eve of the landing, not eighteen", () => {
    const ev = campaign(100, 18);
    const live = liveNews(worldAt(117), ev);
    expect(live.vars.days).toBe(1);
    // And says it in words, because "1 days out" is wrong in English and
    // "1 dni drogi" is wrong in Polish, and a counted clock reaches one every
    // time where a frozen one never did.
    expect(live.headline).toBe("news.landing_tomorrow");
  });

  it("counts down every single day of the passage", () => {
    const ev = campaign(100, 12);
    const seen = [];
    for (let d = 100; d < 112; d++) seen.push(liveNews(worldAt(d), ev).vars.days);
    expect(seen).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it("never prints a bare 1 or 0 next to a plural noun", () => {
    const ev = campaign(100, 12);
    for (let d = 100; d <= 112; d++) {
      const live = liveNews(worldAt(d), ev);
      const days = Number(live.vars.days);
      if (days > 1) expect(live.headline).toBe("news.campaign");
      else expect(live.headline).toBe(days === 1 ? "news.landing_tomorrow" : "news.landing_today");
    }
  });

  it("stops being a countdown on the day the men come ashore", () => {
    const ev = campaign(100, 18);
    const live = liveNews(worldAt(118), ev);
    expect(live.headline).toBe("news.landing_today");
  });

  it("never counts below zero if the board is read late", () => {
    const ev = campaign(100, 18);
    expect(liveNews(worldAt(140), ev).vars.days).toBe(0);
  });

  it("does the same for a relief squadron", () => {
    const ev = { ...campaign(100, 10), type: "reconquest" as const, headline: "news.reconquest" };
    expect(liveNews(worldAt(106), ev).vars.days).toBe(4);
  });

  it("keeps the soldiers the ledger wrote, and only touches the clock", () => {
    // `ExpeditionFleetSystem.writeBackLedger` rewrites `vars.soldiers` as hulls
    // are sunk. That number was always live; the clock beside it was not.
    const ev = campaign(100, 18);
    const sunk = { ...ev, vars: { ...ev.vars, soldiers: 210 } };
    const live = liveNews(worldAt(110), sunk);
    expect(live.vars.soldiers).toBe(210);
    expect(live.vars.days).toBe(8);
  });

  it("does NOT write the countdown back into the event", () => {
    // `expeditionFromEvent` reads `vars.days` back as the expedition's
    // `sailDays`. A countdown stamped into the event would shorten the voyage
    // every time somebody looked at a noticeboard.
    const ev = campaign(100, 18);
    liveNews(worldAt(117), ev);
    expect(ev.vars.days).toBe(18);
    expect(expeditionFromEvent(ev).sailDays).toBe(18);
  });
});

// ── The plate fleet ────────────────────────────────────────

function plate(startDay: number, span: number, muster = MUSTER_PORTS[0]): WorldEventState {
  return {
    id: `treasure_fleet_${startDay}_${muster}`,
    type: "treasure_fleet",
    startDay,
    endDay: startDay + span,
    ports: [muster],
    factions: ["spain"],
    severity: 2,
    headline: "news.treasure_fleet",
    vars: {
      mainPort: muster,
      muster,
      port: portNameKey(muster),
      faction: "faction.spain.name",
      duration: span,
    },
  };
}

describe("the plate fleet stops preparing to sail once she has sailed", () => {
  it("is still loading on the morning the news breaks", () => {
    expect(liveNews(worldAt(100), plate(100, 20)).headline).toBe("news.treasure_fleet");
  });

  it("has sailed by the time the muster share is up", () => {
    const ev = plate(100, 20);
    const sailed = Math.ceil(100 + 20 * PLATE_MUSTER_SHARE);
    expect(liveNews(worldAt(sailed), ev).headline).toBe("news.treasure_fleet_sailed");
  });

  it("names the harbour she left and the one she is making for", () => {
    const ev = plate(100, 20);
    const live = liveNews(worldAt(118), ev);
    expect(live.vars.port).toBe(portNameKey(MUSTER_PORTS[0]));
    expect(live.vars.rendezvous).toBe(portNameKey(PLATE_RENDEZVOUS));
  });

  it("is at sea for most of the event, which is why this was worth fixing", () => {
    // Measured over all four muster ports and every duration the table rolls:
    // 72.3% of her board-days. Assert the shape, not the exact percentage.
    let alongside = 0, total = 0;
    for (const muster of MUSTER_PORTS) {
      for (let span = 14; span <= 21; span++) {
        const ev = plate(100, span, muster);
        for (let d = 100; d <= 100 + span; d++) {
          total++;
          if (liveNews(worldAt(d), ev).headline === "news.treasure_fleet") alongside++;
        }
      }
    }
    expect(alongside / total).toBeLessThan(0.35);
    expect(alongside / total).toBeGreaterThan(0.2);
  });

  it("is decided in one place, and the hull she materializes from uses it", () => {
    const ev = plate(100, 20);
    expect(plateNews(worldAt(118), ev)).toEqual(liveNews(worldAt(118), ev));
  });
});

// ── The storm ──────────────────────────────────────────────

const ROAD = ["cartagena", "santa_marta", "rio_de_la_hacha"];

function storm(startDay: number, span: number): WorldEventState {
  return {
    id: "hurricane_100_cartagena",
    type: "hurricane",
    startDay,
    endDay: startDay + span,
    ports: ROAD,
    factions: ["spain"],
    severity: 3,
    headline: "news.hurricane",
    vars: { mainPort: ROAD[0], port: portNameKey(ROAD[0]), faction: "faction.spain.name" },
  };
}

describe("the storm walks, and the board walks with it", () => {
  it("names the landfall while the eye is still on it", () => {
    const ev = storm(100, 6);
    const w = worldAt(100, [ev]);
    expect(liveNews(w, ev).headline).toBe("news.hurricane");
    expect(liveNews(w, ev).vars.port).toBe(portNameKey(ROAD[0]));
  });

  it("says where it has got to once the eye has moved on", () => {
    const ev = storm(100, 6);
    const live = liveNews(worldAt(103, [ev]), ev);
    expect(live.headline).toBe("news.hurricane_bound");
    expect(live.vars.port).not.toBe(portNameKey(ROAD[0]));
    expect(live.vars.bound).toBeTruthy();
  });

  it("keeps naming the eye's town right up to the end of the storm", () => {
    const ev = storm(100, 6);
    const live = liveNews(worldAt(105, [ev]), ev);
    expect(live.headline).toBe("news.hurricane_bound");
    expect(live.vars.port).toBe(portNameKey(ROAD[1]));
    expect(live.vars.bound).toBe(portNameKey(ROAD[2]));
  });

  it("says nothing new about a storm that landed on one town and stayed", () => {
    // `pickNeighbours` answers fewer towns than it was asked for round an
    // isolated harbour - a hurricane over Bermuda has nowhere else to go - so
    // its eye never leaves the town the headline names.
    const ev = { ...storm(100, 6), ports: ["bermuda"],
      vars: { mainPort: "bermuda", port: portNameKey("bermuda"), faction: "faction.england.name" } };
    expect(liveNews(worldAt(103, [ev]), ev).headline).toBe("news.hurricane");
  });

  it("falls back to the stamped line for a storm the world no longer has", () => {
    const ev = storm(100, 6);
    expect(liveNews(worldAt(103, []), ev).headline).toBe("news.hurricane");
  });
});

// ── The board itself ───────────────────────────────────────

describe("what the tavern board actually prints", () => {
  it("carries the live sentence, not the stamped one", () => {
    const ev = campaign(100, 18);
    const w = { ...worldAt(117, [ev]), ports: { port_royal: { factionId: "england" } } } as unknown as WorldState;
    const board = getPortNews(w, "port_royal");
    expect(board).toHaveLength(1);
    expect(board[0].vars.days).toBe(1);
  });

  it("freezes a ship's copy on the day she picked it up", () => {
    // Which is the right answer for a ship that has been at sea a week: she
    // repeats what she was told, and `dayHeard` says when.
    const ev = campaign(100, 18);
    const w = { ...worldAt(110, [ev]), ports: { port_royal: { factionId: "england" } } } as unknown as WorldState;
    const carried = getPortNews(w, "port_royal")[0];
    expect(carried.vars.days).toBe(8);
    expect(carried.dayHeard).toBe(110);
  });
});

// ── The sentences ──────────────────────────────────────────

describe("the four new lines say something in both languages", () => {
  const KEYS = [
    "news.landing_today",
    "news.landing_tomorrow",
    "news.treasure_fleet_sailed",
    "news.hurricane_bound",
  ];

  it("exists in English and in Polish", () => {
    for (const k of KEYS) {
      expect(EN[k], k).toBeTruthy();
      expect(PL[k], k).toBeTruthy();
    }
  });

  it("puts the Polish port in a case, not in the nominative (v0.69.0)", () => {
    setLang("pl");
    try {
      const bound = t("news.hurricane_bound", {
        port: portNameKey("havana"), bound: portNameKey("cartagena"),
      });
      expect(bound).toContain("Hawan");
      expect(bound).not.toContain("Hawana");
      expect(bound).toContain("Kartageny");
    } finally {
      setLang("en");
    }
  });

  it("names the second port in the storm line, or the line is pointless", () => {
    expect(EN["news.hurricane_bound"]).toContain("{{bound}}");
    expect(PL["news.hurricane_bound"]).toContain("{{bound");
  });
});

// ── The guard ──────────────────────────────────────────────

describe("nothing may render a stamped headline again", () => {
  const SOURCES = import.meta.glob("../../../**/*.ts", {
    query: "?raw", import: "default", eager: true,
  }) as Record<string, string>;

  /**
   * Everything in `src`, less the tests and the two modules that are allowed
   * to answer with the stamped sentence because they are the ones deciding
   * that today is the phase it describes.
   */
  const OWNERS = ["NewsPhaseSystem.ts", "TreasureFleetSystem.ts"];
  const FILES = Object.entries(SOURCES).filter(([path]) =>
    !path.includes("__tests__") && !path.includes(".test.")
    && !OWNERS.some(o => path.endsWith(o)));

  it("reads the files that could break it", () => {
    expect(FILES.length).toBeGreaterThan(150);
    const names = FILES.map(([p]) => p);
    expect(names.some(p => p.endsWith("CityInfoScene.ts"))).toBe(true);
    expect(names.some(p => p.endsWith("WorldEventSystem.ts"))).toBe(true);
  });

  it("finds nobody copying an event's own headline onto a screen or a ship", () => {
    // Both shapes of the v0.72.0 bug: rendering `ev.headline` directly, and
    // copying it into a `NewsItem` a hull carries. Either one skips the phase.
    // `expect(` ends in `t(`, so the call form needs a non-letter in front.
    const COPY = /(?:[^A-Za-z]t\(\s*|headline:\s*)(?:ev|event)\.headline\b/;
    const offenders = FILES
      .filter(([, src]) => COPY.test(src))
      .map(([p]) => p.split("/").pop());
    expect(offenders).toEqual([]);
  });
});
