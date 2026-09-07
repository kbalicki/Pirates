import { describe, it, expect } from "vitest";
import {
  updateDiplomacy,
  relationBetween,
  areAllied,
  enemiesOf,
  coBelligerentAgainst,
  hostilityFactor,
  crownPairs,
  dynamicWarId,
  historicalWarPending,
  CROWNS,
  WAR_RELATION,
  CO_BELLIGERENT,
  HOSTILITY_FLOOR,
  PEACE_GRACE_DAYS,
  WAR_MIN_YEARS,
  WAR_MAX_YEARS,
  TREATY_DAYS,
} from "../DiplomacySystem.ts";
import { seedHistoricalWars, updateWorldEvents } from "../WorldEventSystem.ts";
import { coveringPatrons, marqueFlag } from "../PrivateerSystem.ts";
import { FACTIONS } from "../../data/factions.ts";
import { HISTORICAL_WARS } from "../../data/wars.ts";
import { entityId } from "../../model/ids.ts";
import { t } from "../../i18n/I18n.ts";
import { EN } from "../../i18n/locales/en.ts";
import { PL } from "../../i18n/locales/pl.ts";
import type { WorldState, WorldEventState } from "../../model/WorldState.ts";

// ===========================================================================
// DiplomacySystem — the crowns fall out on their own (v0.51.0)
// ===========================================================================

/**
 * The measurement this file exists because of: the default era begins in 1680,
 * the historical table has no war between September 1678 and May 1689, and no
 * random event has ever been of type `war_start`. Seven per cent of the first
 * ten in-game years — fifty-seven hours of play before any crown was at war
 * with any other, and six systems downstream of a war doing nothing at all.
 *
 * The first test below is the one that matters most: **it is the defect**, and
 * it is written against the table rather than against this module, so it goes
 * on being true whatever the dice do.
 */

function makeWorld(over: { startYear?: number; seed?: number; day?: number; events?: WorldEventState[]; flags?: Record<string, boolean> } = {}): WorldState {
  return {
    version: 12,
    time: { day: over.day ?? 1, hour: 12, minute: 0, tick: 0 },
    rng: { seed: over.seed ?? 1, state: over.seed ?? 1 },
    player: {
      id: entityId("player"), shipId: entityId("player_ship"), gold: 500, notoriety: 0,
      reputation: {}, ranks: {}, location: { type: "sea", pos: { x: 0, y: 0 } },
      questLog: [], fleet: [], lastPlunderDay: 1, citiesCaptured: 0, courtship: {},
    },
    entities: {}, ports: {},
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: over.flags ?? {}, eventLog: [], worldEvents: over.events ?? [], knownEventIds: [],
    playerName: "Captain", eraId: "pirates_sunset", startYear: over.startYear ?? 1680, gameSpeed: 1.2,
  } as unknown as WorldState;
}

function war(a: string, b: string, endDay = 9999, id = `war_${a}_${b}`): WorldEventState {
  return {
    id, type: "war_start", startDay: 1, endDay,
    ports: [], factions: [a, b], severity: 3,
    headline: "news.war_start", vars: {},
  };
}

function liveWars(w: WorldState): WorldEventState[] {
  return w.worldEvents.filter(ev => ev.type === "war_start" && ev.endDay >= w.time.day);
}

function step(w: WorldState, days: number): WorldState {
  let out = w;
  const target = w.time.day + days;
  for (let d = w.time.day + 1; d <= target; d++) {
    out = { ...out, time: { ...out.time, day: d } };
    out = updateWorldEvents(out);
  }
  return out;
}

// ── The defect ───────────────────────────────────────────

describe("the peace the default era is born into", () => {
  it("has no historical war in it at all, for nine years", () => {
    // 1680 sits in the gap between the Franco-Dutch war and the Nine Years' War.
    const t = 1680 * 12 + 1;
    const live = HISTORICAL_WARS.filter(
      x => x.startYear * 12 + x.startMonth <= t && t < x.endYear * 12 + x.endMonth,
    );
    expect(live).toHaveLength(0);

    const next = HISTORICAL_WARS
      .map(x => x.startYear * 12 + x.startMonth)
      .filter(s => s > t)
      .sort((a, b) => a - b)[0];
    expect((next - t) / 12).toBeGreaterThan(9);
  });

  it("left a letter of marque covering nothing, which is why this module exists", () => {
    // A commissioned captain in 1680, before any dynamic war: his patron is at
    // war with nobody, so no prize he takes is ever a covered one.
    const w = makeWorld({ flags: { [marqueFlag("england")]: true } });
    for (const victim of CROWNS.filter(c => c !== "england")) {
      expect(coveringPatrons(w, victim)).toEqual([]);
    }

    // With a war on, the same paper covers the same prize.
    const atWar = makeWorld({ flags: { [marqueFlag("england")]: true }, events: [war("england", "spain")] });
    expect(coveringPatrons(atWar, "spain")).toEqual(["england"]);
  });
});

// ── Relations, live ──────────────────────────────────────

describe("what two crowns think of each other today", () => {
  it("is the static matrix when nothing is happening", () => {
    const w = makeWorld();
    expect(relationBetween(w, "spain", "england")).toBe(FACTIONS.spain.relations.england);
    expect(relationBetween(w, "england", "netherlands")).toBe(10);
    expect(relationBetween(w, "france", "netherlands")).toBe(0);
  });

  it("is symmetric wherever the data is", () => {
    const w = makeWorld();
    for (const [a, b] of crownPairs()) {
      expect(relationBetween(w, a, b)).toBe(relationBetween(w, b, a));
    }
  });

  it("drops to the war floor while they fight, whatever they thought before", () => {
    // The one friendly pair in the game, at war.
    const w = makeWorld({ events: [war("england", "netherlands")] });
    expect(relationBetween(w, "england", "netherlands")).toBe(WAR_RELATION);
    // And a pair that already disliked each other is not made *better* by it.
    const w2 = makeWorld({ events: [war("spain", "england")] });
    expect(relationBetween(w2, "spain", "england")).toBe(WAR_RELATION);
  });

  it("lifts a pair that shares an enemy — which is the only alliance this world has", () => {
    const w = makeWorld({
      events: [war("england", "spain", 9999, "w1"), war("netherlands", "spain", 9999, "w2")],
    });
    expect(coBelligerentAgainst(w, "england", "netherlands")).toEqual(["spain"]);
    expect(relationBetween(w, "england", "netherlands")).toBe(10 + CO_BELLIGERENT);
    expect(areAllied(w, "england", "netherlands")).toBe(true);
    // France is in none of it.
    expect(areAllied(w, "france", "england")).toBe(false);
  });

  it("counts a second shared enemy, and stops there", () => {
    const w = makeWorld({
      events: [
        war("england", "spain", 9999, "w1"), war("netherlands", "spain", 9999, "w2"),
        war("england", "france", 9999, "w3"), war("netherlands", "france", 9999, "w4"),
      ],
    });
    expect(coBelligerentAgainst(w, "england", "netherlands").sort()).toEqual(["france", "spain"]);
    expect(relationBetween(w, "england", "netherlands")).toBe(10 + CO_BELLIGERENT * 2);
  });

  it("puts a live war above a shared enemy, because they are shooting at each other", () => {
    // England and the Netherlands both fight Spain, and each other. The war wins.
    const w = makeWorld({
      events: [
        war("england", "spain", 9999, "w1"),
        war("netherlands", "spain", 9999, "w2"),
        war("england", "netherlands", 9999, "w3"),
      ],
    });
    expect(coBelligerentAgainst(w, "england", "netherlands")).toEqual(["spain"]);
    expect(relationBetween(w, "england", "netherlands")).toBe(WAR_RELATION);
  });

  it("forgets a war the day after it ends", () => {
    const w = makeWorld({ day: 200, events: [war("england", "spain", 199)] });
    expect(enemiesOf(w, "england")).toEqual([]);
    expect(relationBetween(w, "england", "spain")).toBe(-30);
  });
});

// ── The odds ─────────────────────────────────────────────

describe("how ready a pair is to fall out", () => {
  it("never falls to zero, because the friendly pairs fought real wars", () => {
    expect(hostilityFactor(10)).toBeCloseTo(HOSTILITY_FLOOR, 5);
    expect(hostilityFactor(100)).toBeCloseTo(HOSTILITY_FLOOR, 5);
    expect(hostilityFactor(35)).toBeCloseTo(HOSTILITY_FLOOR, 5);
  });

  it("rises as the relation worsens, and stops at one", () => {
    expect(hostilityFactor(-30)).toBeCloseTo(1, 5);
    expect(hostilityFactor(-70)).toBeCloseTo(1, 5);
    expect(hostilityFactor(0)).toBeGreaterThan(hostilityFactor(10));
    expect(hostilityFactor(-20)).toBeGreaterThan(hostilityFactor(0));
  });

  it("makes an alliance worth something: allies are the least likely to turn", () => {
    const allied = makeWorld({
      events: [war("england", "spain", 9999, "w1"), war("netherlands", "spain", 9999, "w2")],
    });
    const apart = makeWorld();
    expect(hostilityFactor(relationBetween(allied, "england", "netherlands")))
      .toBeLessThanOrEqual(hostilityFactor(relationBetween(apart, "england", "netherlands")));
  });

  it("offers every pair of crowns and no crown itself", () => {
    const pairs = crownPairs();
    expect(pairs).toHaveLength(6);
    for (const [a, b] of pairs) expect(a).not.toBe(b);
    expect(new Set(pairs.map(p => p.join("/"))).size).toBe(6);
  });
});

// ── Declaring ────────────────────────────────────────────

describe("declaring a war nobody wrote on the calendar", () => {
  it("leaves the first season alone", () => {
    let w = makeWorld({ seed: 5 });
    for (let d = 2; d <= PEACE_GRACE_DAYS; d++) {
      w = { ...w, time: { ...w.time, day: d } };
      w = updateDiplomacy(w);
    }
    expect(liveWars(w)).toHaveLength(0);
  });

  it("eventually declares one, and it is an ordinary war_start event", () => {
    let w = makeWorld({ seed: 3 });
    w = step(w, 4 * 365);
    const dyn = w.worldEvents.filter(ev => ev.id.startsWith("war_dyn_"));
    const log = w.eventLog.filter(e => e.key === "news.war_start");
    expect(dyn.length + log.length).toBeGreaterThan(0);

    // Whatever it declared, the shape is the historical table's shape.
    for (const ev of w.worldEvents.filter(e => e.type === "war_start")) {
      expect(ev.factions).toHaveLength(2);
      expect(ev.severity).toBe(3);
      expect(ev.ports).toEqual([]);
      expect(ev.endDay).toBeGreaterThan(ev.startDay);
    }
  });

  it("runs a declared war for between the stated years", () => {
    let w = makeWorld({ seed: 9 });
    w = step(w, 6 * 365);
    const dyn = w.worldEvents.filter(ev => ev.id.startsWith("war_dyn_") && ev.type === "war_start");
    for (const ev of dyn) {
      const years = (ev.endDay - ev.startDay) / 365;
      expect(years).toBeGreaterThanOrEqual(WAR_MIN_YEARS - 0.01);
      expect(years).toBeLessThanOrEqual(WAR_MAX_YEARS + 0.01);
    }
  });

  it("never declares a second war on a pair already fighting", () => {
    let w = makeWorld({ day: PEACE_GRACE_DAYS + 1, events: [war("spain", "england")] });
    for (let i = 0; i < 500; i++) {
      w = { ...w, time: { ...w.time, day: w.time.day + 1 } };
      w = updateDiplomacy(w);
    }
    const pairs = liveWars(w).map(ev => ev.factions.slice().sort().join("/"));
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("stands aside for a war the calendar is about to start itself", () => {
    // Two years before the Nine Years' War, France and England are due.
    const w = makeWorld({ startYear: 1688, day: 200 });
    expect(historicalWarPending(w, "france", "england", 730)).toBe(true);
    expect(historicalWarPending(w, "spain", "france", 730)).toBe(false);

    let run = makeWorld({ startYear: 1688, day: PEACE_GRACE_DAYS + 1, seed: 11 });
    for (let i = 0; i < 400; i++) {
      run = { ...run, time: { ...run.time, day: run.time.day + 1 } };
      run = updateDiplomacy(run);
    }
    expect(run.worldEvents.some(ev => ev.id === dynamicWarId("france", "england"))).toBe(false);
  });

  it("is deterministic: the same seed writes the same history", () => {
    const a = step(makeWorld({ seed: 42 }), 3 * 365);
    const b = step(makeWorld({ seed: 42 }), 3 * 365);
    expect(a.worldEvents.map(e => `${e.id}:${e.startDay}:${e.endDay}`))
      .toEqual(b.worldEvents.map(e => `${e.id}:${e.startDay}:${e.endDay}`));
  });

  it("adds no field to the world: a save from before this release still reads", () => {
    const w = makeWorld();
    expect(w.version).toBe(12);
    const after = step(w, 400);
    expect(after.version).toBe(12);
    expect(Object.keys(after).sort()).toEqual(Object.keys(w).sort());
  });
});

// ── Concluding ───────────────────────────────────────────

describe("the peace that ends one", () => {
  it("becomes a treaty rather than simply vanishing", () => {
    // The bug v0.30.0 was written to fix: an expired war is news nobody printed.
    let w = makeWorld({ day: 500, events: [war("spain", "england", 499, dynamicWarId("spain", "england"))] });
    w = { ...w, time: { ...w.time, day: 501 } };
    w = updateDiplomacy(w);
    const treaty = w.worldEvents.find(ev => ev.type === "treaty_signed");
    expect(treaty).toBeDefined();
    expect(treaty!.factions.sort()).toEqual(["england", "spain"]);
    expect(treaty!.endDay - treaty!.startDay).toBe(TREATY_DAYS);
    expect(w.worldEvents.some(ev => ev.id === dynamicWarId("spain", "england"))).toBe(false);
    expect(w.eventLog.some(e => e.key === "news.war_end")).toBe(true);
  });

  it("puts the treaty on the towns of both crowns, so a tavern can print it", () => {
    let w = makeWorld({ day: 500, events: [war("spain", "england", 499, dynamicWarId("spain", "england"))] });
    w = { ...w, time: { ...w.time, day: 501 } };
    w = updateDiplomacy(w);
    const treaty = w.worldEvents.find(ev => ev.type === "treaty_signed")!;
    expect(treaty.ports.length).toBeGreaterThan(0);
  });

  it("leaves a historical war to the calendar that owns it", () => {
    let w = makeWorld({ day: 500, events: [war("spain", "netherlands", 499, "war_eighty_years_war")] });
    w = { ...w, time: { ...w.time, day: 501 } };
    w = updateDiplomacy(w);
    expect(w.worldEvents.some(ev => ev.type === "treaty_signed" && ev.id.startsWith("treaty_dyn_"))).toBe(false);
  });
});

// ── The measured shape ───────────────────────────────────

describe("the shape of a century, measured", () => {
  it("puts the default era on the footing the real one had", () => {
    // The ten historical wars cover 79% of the years 1560-1700 and average 1.13
    // wars running at once. A peacetime era should land in the same country —
    // not in permanent world war, which the first tuning of this file was.
    const days = 25 * 365;
    let atWar = 0, sumWars = 0, samples = 0, threePlus = 0;
    for (const seed of [1, 2, 3, 4]) {
      let w = seedHistoricalWars(makeWorld({ seed }));
      for (let d = 2; d <= days; d++) {
        w = { ...w, time: { ...w.time, day: d } };
        w = updateWorldEvents(w);
        const n = liveWars(w).length;
        samples++;
        if (n > 0) atWar++;
        if (n >= 3) threePlus++;
        sumWars += n;
      }
    }
    const pct = atWar / samples;
    const avg = sumWars / samples;
    expect(pct).toBeGreaterThan(0.55);
    expect(pct).toBeLessThan(0.92);
    expect(avg).toBeGreaterThan(0.7);
    expect(avg).toBeLessThan(1.8);
    // Six pairs exist; three at once should stay a rarity, not the weather.
    expect(threePlus / samples).toBeLessThan(0.2);
  });

  it("an era born into a war is not made quieter by any of this", () => {
    let w = seedHistoricalWars(makeWorld({ startYear: 1600, seed: 2 }));
    expect(liveWars(w).length).toBeGreaterThan(0);
    w = step(w, 3 * 365);
    expect(liveWars(w).length).toBeGreaterThan(0);
  });

  it("gives the letter of marque something to cover, which it never had in 1680", () => {
    // Not tied to one crown or one seed: run each world until the Caribbean has
    // a war in it, then check that a commission from one of the belligerents
    // covers a prize taken from the other. In 1680 without this module the loop
    // below never finds a war at all, which is the whole point.
    let worldsWithAWar = 0;
    for (const seed of [3, 4, 5, 6, 7, 8]) {
      let w = seedHistoricalWars(makeWorld({ seed }));
      let found: string[] | null = null;
      for (let d = 2; d <= 10 * 365 && !found; d++) {
        w = { ...w, time: { ...w.time, day: d } };
        w = updateWorldEvents(w);
        const live = liveWars(w);
        if (live.length > 0) found = live[0].factions;
      }
      if (!found) continue;
      worldsWithAWar++;

      const [patron, victim] = found;
      const commissioned = { ...w, worldFlags: { ...w.worldFlags, [marqueFlag(patron)]: true } };
      expect(coveringPatrons(commissioned, victim)).toEqual([patron]);
    }
    expect(worldsWithAWar).toBe(6);
  });
});

// ── The strings ──────────────────────────────────────────

describe("what the player is told", () => {
  it("reuses the keys a war has always had, in both locales", () => {
    for (const key of ["news.war_start", "news.war_end", "news.treaty_signed"]) {
      expect(EN[key], `EN ${key}`).toBeTruthy();
      expect(PL[key], `PL ${key}`).toBeTruthy();
    }
  });

  it("names the crowns and the state of them on the captain's own page", () => {
    for (const key of ["captain.crowns_title", "captain.at_war", "captain.allied_with", "captain.crowns_peace"]) {
      expect(EN[key], `EN ${key}`).toBeTruthy();
      expect(PL[key], `PL ${key}`).toBeTruthy();
    }
  });

  it("spells the placeholders the way t() actually substitutes them", () => {
    // Written after the screen said `at war with {enemies}` in as many words.
    // `t()` replaces `{{name}}` and leaves a single brace alone, so a string
    // with one is not a wrong translation — it is a placeholder that never
    // fires, and no assertion about the key existing can see it.
    const holders: Record<string, string> = {
      "captain.at_war": "enemies",
      "captain.allied_with": "allies",
    };
    for (const [key, varName] of Object.entries(holders)) {
      for (const [tag, loc] of [["EN", EN], ["PL", PL]] as const) {
        expect(loc[key], `${tag} ${key}`).toContain(`{{${varName}}}`);
        expect(t(key, { [varName]: "Spain" }), `${tag} ${key} substituted`).not.toContain("{");
      }
    }
  });
});
