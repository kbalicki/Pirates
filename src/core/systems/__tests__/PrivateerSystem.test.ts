import { describe, it, expect } from "vitest";
import {
  settleHostileAct,
  letterCrowns,
  coveringPatrons,
  embarrassedPatrons,
  betrayedPatron,
  marqueFlag,
  HOSTILE_REP_TRADER,
  HOSTILE_REP_NAVY,
  BRETHREN_TRADER,
  BRETHREN_NAVY,
  PRIZE_PATRON_TRADER,
  PRIZE_PATRON_NAVY,
  UNCOVERED_PATRON,
  PRIVATEER_BRETHREN_SHARE,
} from "../PrivateerSystem.ts";
import { requestLetterOfMarque } from "../PortInteractionSystem.ts";
import { entityId, factionId } from "../../model/ids.ts";
import { EN } from "../../i18n/locales/en.ts";
import { PL } from "../../i18n/locales/pl.ts";
import type { WorldState } from "../../model/WorldState.ts";

// ===========================================================================
// PrivateerSystem — what a letter of marque is actually for (v0.37.0)
// ===========================================================================

/**
 * The letter has been in the game since the first governor's dialogue and was
 * a keepsake: two systems read it (an ally for `ReconquestSystem`, a recipient
 * for a captured town in `SiegeSystem`) and nothing else did. At sea it changed
 * nothing at all.
 *
 * What is asserted below is the shape of the job, and the first test is the
 * most important one: **with no commission, the numbers are exactly what they
 * were.** Everything else is a consequence of a piece of paper.
 */

function makeWorld(over: {
  flags?: Record<string, boolean>;
  reputation?: Record<string, number>;
  war?: [string, string];
} = {}): WorldState {
  const events = over.war
    ? [{
        id: "w1",
        type: "war_start",
        startDay: 1,
        endDay: 9999,
        factions: over.war,
        portKeys: [],
        vars: {},
      }]
    : [];
  return {
    version: 12,
    time: { day: 100, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: 500,
      notoriety: 0,
      reputation: over.reputation ?? {},
      ranks: {},
      location: { type: "sea", pos: { x: 0, y: 0 } },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
    },
    entities: {},
    ports: {},
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: over.flags ?? {},
    eventLog: [],
    worldEvents: events,
    knownEventIds: [],
    playerName: "Captain",
    eraId: "pirates_sunset",
    startYear: 1690,
    gameSpeed: 1.2,
  } as unknown as WorldState;
}

const rep = (w: WorldState, f: string) => w.player.reputation[f] ?? 0;

describe("carrying nothing", () => {
  it("costs and pays exactly what it did before there was a system", () => {
    const w = makeWorld();
    const after = settleHostileAct(w, "spain", "trader").world;
    expect(rep(after, "spain")).toBe(HOSTILE_REP_TRADER);
    expect(rep(after, "pirates")).toBe(BRETHREN_TRADER);

    const navy = settleHostileAct(w, "spain", "navy").world;
    expect(rep(navy, "spain")).toBe(HOSTILE_REP_NAVY);
    expect(rep(navy, "pirates")).toBe(BRETHREN_NAVY);
  });

  it("settles nothing at all against a pirate, who has no crown to offend", () => {
    const w = makeWorld();
    expect(settleHostileAct(w, "pirates", "pirate").world).toBe(w);
    expect(settleHostileAct(w, undefined, "trader").world).toBe(w);
    expect(settleHostileAct(w, "spain", undefined).world).toBe(w);
  });
});

describe("a commission that covers him", () => {
  const commissioned = () => makeWorld({
    flags: { [marqueFlag("england")]: true },
    war: ["england", "spain"],
  });

  it("has the patron declare the prize good", () => {
    const after = settleHostileAct(commissioned(), "spain", "trader").world;
    expect(rep(after, "england")).toBe(PRIZE_PATRON_TRADER);
    expect(rep(after, "spain")).toBe(HOSTILE_REP_TRADER);
  });

  it("pays more for a warship than for a merchantman", () => {
    const after = settleHostileAct(commissioned(), "spain", "navy").world;
    expect(rep(after, "england")).toBe(PRIZE_PATRON_NAVY);
  });

  it("halves what the brethren credit him with, because he is not one of them", () => {
    const after = settleHostileAct(commissioned(), "spain", "trader").world;
    expect(rep(after, "pirates")).toBe(Math.round(BRETHREN_TRADER * PRIVATEER_BRETHREN_SHARE));
  });

  it("says so in the log, in a name rather than a key", () => {
    const after = settleHostileAct(commissioned(), "spain", "trader").world;
    const line = after.eventLog.find(e => e.key === "privateer.log_prize");
    expect(line).toBeDefined();
    expect(line!.vars!.faction).toBe("England");
  });

  it("is only cover while the war is live", () => {
    // Same paper, no war: the patron has no quarrel with Spain today.
    const peace = makeWorld({ flags: { [marqueFlag("england")]: true } });
    expect(coveringPatrons(peace, "spain")).toEqual([]);
    expect(embarrassedPatrons(peace, "spain")).toEqual(["england"]);
  });
});

describe("a commission that does not cover him", () => {
  const peacetime = () => makeWorld({ flags: { [marqueFlag("england")]: true } });

  it("embarrasses the patron, which is what carrying the paper costs", () => {
    const after = settleHostileAct(peacetime(), "spain", "trader").world;
    expect(rep(after, "england")).toBe(UNCOVERED_PATRON);
  });

  it("leaves him the full credit with the brethren — he is behaving like one", () => {
    const after = settleHostileAct(peacetime(), "spain", "trader").world;
    expect(rep(after, "pirates")).toBe(BRETHREN_TRADER);
  });

  it("costs more than one covered prize is worth, or the letter would be free", () => {
    expect(Math.abs(UNCOVERED_PATRON)).toBeGreaterThan(PRIZE_PATRON_TRADER);
  });
});

describe("turning on his patron", () => {
  const served = () => makeWorld({ flags: { [marqueFlag("england")]: true } });

  it("tears the letter up on the spot", () => {
    const result = settleHostileAct(served(), "england", "trader");
    expect(result.revoked).toBe(true);
    expect(letterCrowns(result.world)).toEqual([]);
    expect(result.world.eventLog.some(e => e.key === "privateer.log_revoked")).toBe(true);
  });

  it("does not also embarrass him about it — the paper is already gone", () => {
    const result = settleHostileAct(served(), "england", "trader");
    expect(result.uncovered).toEqual([]);
    expect(rep(result.world, "england")).toBe(HOSTILE_REP_TRADER);
  });

  it("is the only thing in the game that revokes a commission", () => {
    const untouched = settleHostileAct(served(), "spain", "trader");
    expect(untouched.revoked).toBe(false);
    expect(letterCrowns(untouched.world)).toEqual(["england"]);
  });

  it("knows whose paper he is carrying", () => {
    expect(betrayedPatron(served(), "england")).toBe(true);
    expect(betrayedPatron(served(), "spain")).toBe(false);
  });
});

describe("the counter makes it exclusive", () => {
  it("gives up the old commission when he signs a new one", () => {
    const w = makeWorld({
      flags: { [marqueFlag("england")]: true },
      reputation: { france: 40 },
    });
    const after = requestLetterOfMarque(w, factionId("france"));
    expect(after.granted).toBe(true);
    expect(letterCrowns(after.world)).toEqual(["france"]);
    expect(after.world.eventLog.some(e => e.key === "privateer.log_given_up")).toBe(true);
  });

  it("still refuses a crown that does not think well of him", () => {
    const w = makeWorld({ reputation: { france: 5 } });
    const after = requestLetterOfMarque(w, factionId("france"));
    expect(after.granted).toBe(false);
    expect(after.error).toBe("insufficient_reputation");
  });

  it("writes a name into the log, not a key — a bug as old as the dialogue", () => {
    const w = makeWorld({ reputation: { france: 40 } });
    const after = requestLetterOfMarque(w, factionId("france"));
    const line = after.world.eventLog.find(e => e.key === "event.letter_of_marque");
    expect(line!.vars!.faction).toBe("France");
  });
});

describe("a save written before all this", () => {
  it("may carry two letters, and reads correctly instead of needing a migration", () => {
    const old = makeWorld({
      flags: { [marqueFlag("england")]: true, [marqueFlag("france")]: true },
      war: ["england", "spain"],
    });
    expect(letterCrowns(old).sort()).toEqual(["england", "france"]);
    // England covers him; France, at peace with Spain, is embarrassed.
    const result = settleHostileAct(old, "spain", "trader");
    expect(result.covered).toEqual(["england"]);
    expect(result.uncovered).toEqual(["france"]);
    expect(rep(result.world, "england")).toBe(PRIZE_PATRON_TRADER);
    expect(rep(result.world, "france")).toBe(UNCOVERED_PATRON);
    // One covering patron is enough to make him a privateer to the brethren.
    expect(rep(result.world, "pirates")).toBe(Math.round(BRETHREN_TRADER * PRIVATEER_BRETHREN_SHARE));
  });
});

describe("the lines it prints", () => {
  it("exist in both languages", () => {
    for (const key of [
      "privateer.log_prize",
      "privateer.log_uncovered",
      "privateer.log_revoked",
      "privateer.log_given_up",
      "governor.letter_available_switch",
    ]) {
      expect(EN[key], key).toBeDefined();
      expect(PL[key], key).toBeDefined();
    }
  });
});
