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
  activeAlliances,
  allianceBetween,
  alliedSince,
  stampAlliances,
  historicalWarPending,
  CROWNS,
  WAR_RELATION,
  CO_BELLIGERENT,
  HOSTILITY_FLOOR,
  PEACE_GRACE_DAYS,
  WAR_MIN_YEARS,
  WAR_MAX_YEARS,
  TREATY_DAYS,
  noticeTier,
  noticedBy,
  rippleReputation,
  NOTICE_TIERS,
  ACT_TRADER,
  ACT_NAVY,
  ACT_CITY,
  ACT_SERVICE,
} from "../DiplomacySystem.ts";
import { seedHistoricalWars, updateWorldEvents } from "../WorldEventSystem.ts";
import { coveringPatrons, marqueFlag, HOSTILE_REP_TRADER, PRIZE_PATRON_TRADER, PRIZE_PATRON_NAVY } from "../PrivateerSystem.ts";
import { changeReputation, getReputationLevel } from "../ReputationSystem.ts";
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


// ── The enemy of my enemy (v0.52.0) ──────────────────────

/**
 * Reputation was a vector of four independent numbers: every hand that moved it
 * named one crown. Six traders make Spain hostile and the other three sit at
 * **exactly zero for the rest of the career** unless the captain goes and serves
 * them. A year of burning Spanish shipping bought nothing in Port Royale, in a
 * world whose own data puts England at −30 with Spain.
 */
describe("what the other crowns make of it", () => {
  it("reads a relation into one of four named tiers", () => {
    expect(noticeTier(-70).id).toBe("enemy");
    expect(noticeTier(-60).id).toBe("enemy");
    expect(noticeTier(-30).id).toBe("rival");
    expect(noticeTier(-15).id).toBe("rival");
    expect(noticeTier(-10).id).toBe("indifferent");
    expect(noticeTier(0).id).toBe("indifferent");
    expect(noticeTier(10).id).toBe("indifferent");
    expect(noticeTier(20).id).toBe("ally");
    expect(noticeTier(35).id).toBe("ally");
  });

  it("keeps the tiers in order, so a reader can check the table at a glance", () => {
    const per = NOTICE_TIERS.map(t => t.perAct);
    for (let i = 1; i < per.length; i++) expect(per[i]).toBeLessThan(per[i - 1]);
    expect(NOTICE_TIERS.find(t => t.id === "indifferent")!.perAct).toBe(0);
  });

  it("thanks a crown for a prize taken off one it quarrels with", () => {
    const w = makeWorld();
    // England is at -30 with Spain: a rival.
    expect(noticedBy(w, "england", "spain", ACT_TRADER)).toBeGreaterThan(0);
    expect(noticedBy(w, "england", "spain", ACT_NAVY))
      .toBeGreaterThan(noticedBy(w, "england", "spain", ACT_TRADER));
  });

  it("pays a crown at war with the victim more than one that merely dislikes her", () => {
    const peace = makeWorld();
    const atWar = makeWorld({ events: [war("england", "spain")] });
    expect(noticedBy(atWar, "england", "spain", ACT_TRADER))
      .toBeGreaterThan(noticedBy(peace, "england", "spain", ACT_TRADER));
  });

  it("leaves an indifferent crown indifferent — the matrix has to mean something", () => {
    const w = makeWorld();
    // The Dutch are only at -10 with Spain, and France is at 0 with the Dutch.
    expect(noticedBy(w, "netherlands", "spain", ACT_TRADER)).toBe(0);
    expect(noticedBy(w, "france", "netherlands", ACT_TRADER)).toBe(0);
  });

  it("costs the captain with a crown standing beside his victim", () => {
    const allied = makeWorld({
      events: [war("england", "spain", 9999, "w1"), war("netherlands", "spain", 9999, "w2")],
    });
    expect(relationBetween(allied, "netherlands", "england")).toBeGreaterThanOrEqual(20);
    expect(noticedBy(allied, "netherlands", "england", ACT_TRADER)).toBeLessThan(0);
    // With no shared war they are at +10 and simply do not care.
    expect(noticedBy(makeWorld(), "netherlands", "england", ACT_TRADER)).toBe(0);
  });

  it("never scores a crown against itself", () => {
    const w = makeWorld({ events: [war("england", "spain")] });
    for (const c of CROWNS) expect(noticedBy(w, c, c, ACT_CITY)).toBe(0);
  });

  it("never pays the brethren, who are already paid for the same act", () => {
    // A pirate is not a crown; his relations run -80 to -40 with everybody, and
    // `settleHostileAct` already credits him. CROWNS is the observer set.
    const w = makeWorld();
    const { reputation } = rippleReputation(w, {}, "spain", ACT_TRADER);
    expect(reputation["pirates"]).toBeUndefined();
  });

  it("does nothing at all when the victim is not a crown", () => {
    const w = makeWorld();
    const { reputation, crossed } = rippleReputation(w, { england: 5 }, "pirates", ACT_TRADER);
    expect(reputation).toEqual({ england: 5 });
    expect(crossed).toEqual([]);
  });

  it("skips the crowns the caller has already settled with", () => {
    const w = makeWorld({ events: [war("england", "spain")] });
    const open = rippleReputation(w, {}, "spain", ACT_TRADER);
    const held = rippleReputation(w, {}, "spain", ACT_TRADER, ["england"]);
    expect(open.reputation["england"]).toBeGreaterThan(0);
    expect(held.reputation["england"]).toBeUndefined();
  });

  it("reports the bands it crossed, and only those", () => {
    const w = makeWorld({ events: [war("england", "spain")] });
    // England sits one point below friendly; one prize carries her over.
    const near = rippleReputation(w, { england: 19, france: 0 }, "spain", ACT_TRADER);
    expect(near.crossed.map(c => c.faction)).toEqual(["england"]);
    expect(near.crossed[0].from).toBe("neutral");
    expect(near.crossed[0].to).toBe("friendly");
    // Well inside a band, nothing is reported.
    const mid = rippleReputation(w, { england: 0, france: 0 }, "spain", ACT_TRADER);
    expect(mid.crossed).toEqual([]);
  });

  it("a service is the same table with the sign turned round", () => {
    const w = makeWorld({ events: [war("france", "england")] });
    // Taking a town FOR England: France, at war with her, minds.
    expect(noticedBy(w, "france", "england", ACT_SERVICE)).toBeLessThan(0);
    // And a crown standing with England is pleased by it.
    const allied = makeWorld({
      events: [war("england", "spain", 9999, "w1"), war("netherlands", "spain", 9999, "w2")],
    });
    expect(noticedBy(allied, "netherlands", "england", ACT_SERVICE)).toBeGreaterThan(0);
  });
});

describe("a career, measured", () => {
  const prizes = (w: WorldState, victim: string, n: number) => {
    let rep: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      rep = changeReputation(rep, victim, HOSTILE_REP_TRADER);
      rep = rippleReputation(w, rep, victim, ACT_TRADER).reputation;
    }
    return rep;
  };

  it("lets a captain who never served England be welcome there", () => {
    // The defect: before this, twenty Spanish prizes left England at exactly 0.
    const w = makeWorld();
    const rep = prizes(w, "spain", 20);
    expect(getReputationLevel(rep["spain"])).toBe("hostile");
    expect(getReputationLevel(rep["england"])).toBe("friendly");
    expect(getReputationLevel(rep["france"])).toBe("friendly");
    // The Dutch barely mind Spain, so they are unmoved — as the data says.
    expect(rep["netherlands"] ?? 0).toBe(0);
  });

  it("is worth more while that crown is actually at war with the victim", () => {
    const peace = prizes(makeWorld(), "spain", 20);
    const inWar = prizes(makeWorld({ events: [war("england", "spain")] }), "spain", 20);
    expect(inWar["england"]).toBeGreaterThan(peace["england"]);
  });

  it("keeps the letter of marque the better deal, which is the whole risk here", () => {
    // v0.51.0 made a commission mean something. A ripple large enough to fix
    // the rounding on the quiet relations was measured at +4 a prize against
    // the patron's +5, and was thrown away for exactly this reason.
    const w = makeWorld({ events: [war("england", "spain")] });
    const ripple = noticedBy(w, "england", "spain", ACT_TRADER);
    expect(ripple).toBeGreaterThan(0);
    expect(PRIZE_PATRON_TRADER).toBeGreaterThanOrEqual(ripple * 2);
    expect(PRIZE_PATRON_NAVY).toBeGreaterThanOrEqual(noticedBy(w, "england", "spain", ACT_NAVY) * 2);
  });

  it("does not let an indiscriminate robber launder himself clean", () => {
    const w = makeWorld();
    let rep: Record<string, number> = {};
    for (let i = 0; i < 20; i++) {
      const victim = CROWNS[i % CROWNS.length];
      rep = changeReputation(rep, victim, HOSTILE_REP_TRADER);
      rep = rippleReputation(w, rep, victim, ACT_TRADER).reputation;
    }
    for (const c of CROWNS) {
      expect(rep[c], c).toBeLessThan(0);
    }
  });

  it("moves nothing at all in a career that harms nobody", () => {
    const w = makeWorld();
    const { reputation, crossed } = rippleReputation(w, { england: 30 }, "spain", 0);
    expect(reputation).toEqual({ england: 30 });
    expect(crossed).toEqual([]);
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
    for (const key of ["captain.crowns_title", "captain.at_war", "captain.allied_with", "captain.crowns_peace",
                       "diplomacy.log_warmed", "diplomacy.log_soured"]) {
      expect(EN[key], `EN ${key}`).toBeTruthy();
      expect(PL[key], `PL ${key}`).toBeTruthy();
    }
  });

  it("spells the placeholders the way t() actually substitutes them", () => {
    // Written after the screen said `at war with {enemies}` in as many words.
    // `t()` replaces `{{name}}` and leaves a single brace alone, so a string
    // with one is not a wrong translation — it is a placeholder that never
    // fires, and no assertion about the key existing can see it.
    const holders: Record<string, string[]> = {
      "captain.at_war": ["enemies"],
      "captain.allied_with": ["allies"],
      "diplomacy.log_warmed": ["faction", "victim"],
      "diplomacy.log_soured": ["faction", "victim"],
    };
    for (const [key, varNames] of Object.entries(holders)) {
      const vars = Object.fromEntries(varNames.map(v => [v, "Spain"]));
      for (const [tag, loc] of [["EN", EN], ["PL", PL]] as const) {
        for (const varName of varNames) {
          expect(loc[key], `${tag} ${key}`).toContain(`{{${varName}}}`);
        }
        expect(t(key, vars), `${tag} ${key} substituted`).not.toContain("{");
      }
    }
  });
});

// ===========================================================================
// The alliance has a day it began (v0.55.0)
// ===========================================================================

/**
 * `areAllied` was exported in v0.51.0 and read by **nobody** for four
 * releases. Measured over 150 game-years, two crowns share an enemy on 28.8%
 * of days in episodes averaging sixteen months — a quarter of the calendar
 * that no news board, no NPC and no tavern could mention, because a fact that
 * is only ever computed has no day it happened on.
 *
 * What follows tests the split: the *state* is still derived and still asks
 * today's wars, and only the *beginning* is stamped.
 */
describe("the alliance is a thing that happened", () => {
  it("stamps nothing while nobody shares an enemy", () => {
    const w = stampAlliances(makeWorld({ events: [war("spain", "england")] }));
    expect(activeAlliances(w)).toEqual([]);
    expect(alliedSince(w, "france", "netherlands")).toBeUndefined();
  });

  it("stamps the day two crowns first stand against the same third", () => {
    const w = stampAlliances(makeWorld({
      day: 400,
      events: [war("spain", "england"), war("spain", "france")],
    }));
    const ev = allianceBetween(w, "england", "france");
    expect(ev).toBeDefined();
    expect(ev!.type).toBe("alliance");
    expect(ev!.startDay).toBe(400);
    expect(alliedSince(w, "france", "england")).toBe(400);
    // The pair, and not the enemy that made them a pair.
    expect(ev!.factions.sort()).toEqual(["england", "france"]);
    expect(ev!.vars.againstId).toBe("spain");
  });

  it("is news everywhere, because it is about crowns and not about a harbour", () => {
    const w = stampAlliances(makeWorld({
      events: [war("spain", "england"), war("spain", "france")],
    }));
    // Same convention as `war_start`: an empty `ports` reaches every town's
    // board through `getPortNews`.
    expect(allianceBetween(w, "england", "france")!.ports).toEqual([]);
  });

  it("tells the log about it once, not once a day", () => {
    let w = stampAlliances(makeWorld({
      day: 400,
      events: [war("spain", "england"), war("spain", "france")],
    }));
    const after = w.eventLog.filter(e => e.key === "news.alliance").length;
    expect(after).toBe(1);
    for (let d = 401; d < 420; d++) {
      w = stampAlliances({ ...w, time: { ...w.time, day: d } });
    }
    expect(w.eventLog.filter(e => e.key === "news.alliance").length).toBe(1);
    expect(activeAlliances(w)).toHaveLength(1);
  });

  it("keeps itself ahead of the expiry sweep for as long as it holds", () => {
    let w = stampAlliances(makeWorld({
      day: 400,
      events: [war("spain", "england"), war("spain", "france")],
    }));
    const first = allianceBetween(w, "england", "france")!.endDay;
    w = stampAlliances({ ...w, time: { ...w.time, day: 500 } });
    const later = allianceBetween(w, "england", "france")!;
    expect(later.endDay).toBeGreaterThan(first);
    expect(later.endDay).toBeGreaterThan(500);
    expect(later.startDay).toBe(400);      // the stamp does not move
  });

  it("lapses the day the shared war does, and says so", () => {
    let w = stampAlliances(makeWorld({
      day: 400,
      events: [war("spain", "england"), war("spain", "france", 410)],
    }));
    expect(activeAlliances(w)).toHaveLength(1);

    // Day 411: the Franco-Spanish war is over, so the two are allies about
    // nothing. `endDay` goes behind today, which is what `expireEvents` reads.
    w = stampAlliances({ ...w, time: { ...w.time, day: 411 } });
    expect(activeAlliances(w)).toEqual([]);
    expect(w.eventLog.some(e => e.key === "news.alliance_end")).toBe(true);
  });

  it("re-stamps when the war that made it ends and another shared one runs on", () => {
    // Allies against Spain first, then — the Spanish war having ended — allies
    // against the Dutch. Same two crowns, different understanding, and the
    // news board should not go on naming Spain.
    let w = stampAlliances(makeWorld({
      day: 400,
      events: [
        war("spain", "england", 410, "war_sp_en"),
        war("spain", "france", 410, "war_sp_fr"),
        war("netherlands", "england", 9999, "war_nl_en"),
        war("netherlands", "france", 9999, "war_nl_fr"),
      ],
    }));
    expect(allianceBetween(w, "england", "france")!.vars.againstId).toBe("spain");

    w = stampAlliances({ ...w, time: { ...w.time, day: 411 } });
    const now = allianceBetween(w, "england", "france");
    expect(now).toBeDefined();
    expect(now!.vars.againstId).toBe("netherlands");
    expect(now!.startDay).toBe(411);       // a new understanding, a new day
    expect(w.eventLog.some(e => e.key === "news.alliance_end")).toBe(true);
  });

  it("holds while the world runs a year of its own wars", () => {
    // Through `updateWorldEvents`, so `expireEvents` gets its say: an alliance
    // that quietly vanished from the boards would be the v0.30.0 bug again.
    let w = makeWorld({
      day: 400,
      events: [war("spain", "england"), war("spain", "france")],
    });
    for (let d = 401; d <= 400 + 365; d++) {
      w = { ...w, time: { ...w.time, day: d } };
      w = updateWorldEvents(w);
      if (enemiesOf(w, "england").includes("spain") && enemiesOf(w, "france").includes("spain")) {
        expect(allianceBetween(w, "england", "france"), `day ${d}`).toBeDefined();
      }
    }
  });

  it("says the same thing in both locales, with every placeholder firing", () => {
    const holders: Record<string, string[]> = {
      "news.alliance": ["faction1", "faction2", "against"],
      "news.alliance_end": ["faction1", "faction2", "against"],
      "tavern.rumor_alliance": ["faction1", "faction2", "against"],
    };
    for (const [key, varNames] of Object.entries(holders)) {
      const vars = Object.fromEntries(varNames.map(v => [v, "Spain"]));
      for (const [tag, loc] of [["EN", EN], ["PL", PL]] as const) {
        for (const varName of varNames) {
          expect(loc[key], `${tag} ${key}`).toContain(`{{${varName}}}`);
        }
        expect(t(key, vars), `${tag} ${key} substituted`).not.toContain("{");
      }
    }
  });
});
