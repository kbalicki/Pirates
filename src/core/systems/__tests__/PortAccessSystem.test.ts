import { describe, it, expect } from "vitest";
import { portAccess, buyPrice, sellPrice } from "../PortAccessSystem.ts";
import { marqueFlag, patronBehind, alliesOfPatrons, coveringPatrons } from "../PrivateerSystem.ts";
import { generateAvailableCrew, recruitCrew, repairRate, buyShip, buyShipToFleet } from "../PortInteractionSystem.ts";
import { cargoOffers } from "../CargoContractSystem.ts";
import { executeBuy, executeSell, playerBuyPrice, playerSellPrice } from "../EconomySystem.ts";
import { CITIES } from "../../data/cities.ts";
import { ITEMS } from "../../data/items.ts";
import { initPortPrices } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId, factionId, shipClassId, itemId } from "../../model/ids.ts";
import type { WorldState, PortRuntimeState } from "../../model/WorldState.ts";
import type { EntityState } from "../../model/EntityState.ts";

// ===========================================================================
// PortAccessSystem — reputation, finally, at the quay
// ===========================================================================

/**
 * The gap this closes: for eleven releases the game recorded what every crown
 * thought of the player and then let him walk into any town and be served
 * identically. These tests are mostly about the *shape* of the table — that
 * hostile is worse than unfriendly is worse than neutral in every column — and
 * about the four counters actually asking it.
 *
 * Port Royale is English, so the fixture moves English standing about and
 * checks what changes inside its walls.
 */

const PORT = "port_royal";
const CROWN = CITIES[PORT].factionId as unknown as string;

function makePort(key: string, over: Partial<PortRuntimeState> = {}): PortRuntimeState {
  const baseline = getPortBaseline(key);
  const stocked: Record<string, number> = {};
  for (const item of Object.keys(ITEMS)) stocked[item] = 200;
  return {
    portId: portId(key),
    factionId: CITIES[key].factionId,
    prices: initPortPrices(key),
    inventory: stocked,
    shipyardQueue: [],
    availableCrew: 20,
    population: baseline.population,
    wealth: baseline.wealth,
    defense: baseline.defense,
    bonusProduces: [],
    ...over,
  };
}

function makeShip(): EntityState {
  return {
    id: entityId("player_ship"),
    kind: "ship",
    mode: "sailing",
    pos: { x: 100, y: 100 },
    vel: { x: 0, y: 0 },
    heading: 0,
    sailLevel: 0.5,
    depthOffset: 0,
    ship: {
      classId: shipClassId("sloop"),
      factionId: factionId("england"),
      hullHp: 60, hullMax: 100,
      sailsHp: 60, sailsMax: 100,
      cannons: 6,
      cargo: {},
      cargoCap: 300,
      crew: { current: 10, max: 40, morale: 0.8 },
    },
  };
}

function makeWorld(rep = 0): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  for (const key of Object.keys(CITIES)) ports[key] = makePort(key);
  return {
    version: 13,
    time: { day: 100, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: 500000,
      notoriety: 0,
      reputation: { [CROWN]: rep },
      ranks: {},
      location: { type: "sea", pos: { x: 100, y: 100 } },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
    },
    entities: { player_ship: makeShip() },
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
  } as unknown as WorldState;
}

const HOSTILE = -80;
const UNFRIENDLY = -40;
const NEUTRAL = 0;
const FRIENDLY = 40;
const ALLIED = 80;

// ── The table ──────────────────────────────────────────────────────────────

describe("portAccess", () => {
  it("reads the flag flying today, not the one on the 1680 map", () => {
    const w = makeWorld();
    // Hand the town to Spain and English standing stops being the one that
    // matters. `portFaction` is the only correct owner read in the codebase
    // and this module must be using it.
    const taken = {
      ...w,
      ports: { ...w.ports, [PORT]: { ...w.ports[PORT], factionId: factionId("spain") } },
    };
    expect(portAccess(taken, PORT).faction).toBe("spain");
  });

  it("gets better in every column as standing rises", () => {
    const tiers = [HOSTILE, UNFRIENDLY, NEUTRAL, FRIENDLY, ALLIED].map(r => portAccess(makeWorld(r), PORT));
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].spread).toBeLessThanOrEqual(tiers[i - 1].spread);
      expect(tiers[i].crewMul).toBeGreaterThanOrEqual(tiers[i - 1].crewMul);
      expect(tiers[i].serviceMul).toBeLessThanOrEqual(tiers[i - 1].serviceMul);
    }
  });

  it("shuts the freight office below neutral and the yard below unfriendly", () => {
    expect(portAccess(makeWorld(HOSTILE), PORT).canCharter).toBe(false);
    expect(portAccess(makeWorld(UNFRIENDLY), PORT).canCharter).toBe(false);
    expect(portAccess(makeWorld(NEUTRAL), PORT).canCharter).toBe(true);

    expect(portAccess(makeWorld(HOSTILE), PORT).canBuyShips).toBe(false);
    expect(portAccess(makeWorld(UNFRIENDLY), PORT).canBuyShips).toBe(true);
  });

  it("a captain nobody has heard of is neutral everywhere", () => {
    const w = makeWorld();
    delete (w.player.reputation as Record<string, number>)[CROWN];
    expect(portAccess(w, PORT).level).toBe("neutral");
    expect(portAccess(w, PORT).serviceMul).toBe(1);
  });
});

describe("buyPrice / sellPrice", () => {
  it("quotes a bid under the posted price and an ask over it", () => {
    const neutral = portAccess(makeWorld(NEUTRAL), PORT);
    expect(buyPrice(100, neutral)).toBeGreaterThan(100);
    expect(sellPrice(100, neutral)).toBeLessThan(100);
  });

  it("never offers more than it asks — at any standing, at any price", () => {
    // The money printer this design exists to rule out: a friendly town once
    // asked 14 for sugar and offered 16, so a captain could stand at the
    // counter buying and selling the same barrel until he owned the sea.
    for (const rep of [HOSTILE, UNFRIENDLY, NEUTRAL, FRIENDLY, ALLIED]) {
      const access = portAccess(makeWorld(rep), PORT);
      for (let posted = 1; posted <= 400; posted++) {
        expect(sellPrice(posted, access)).toBeLessThanOrEqual(buyPrice(posted, access));
      }
    }
  });

  it("an enemy pays a wider spread than an ally in both directions", () => {
    const hostile = portAccess(makeWorld(HOSTILE), PORT);
    const allied = portAccess(makeWorld(ALLIED), PORT);
    expect(buyPrice(100, hostile)).toBeGreaterThan(buyPrice(100, allied));
    expect(sellPrice(100, hostile)).toBeLessThan(sellPrice(100, allied));
  });

  it("never quotes nothing, however extreme the standing", () => {
    expect(buyPrice(1, portAccess(makeWorld(ALLIED), PORT))).toBeGreaterThanOrEqual(1);
    expect(sellPrice(1, portAccess(makeWorld(HOSTILE), PORT))).toBeGreaterThanOrEqual(1);
  });
});

// ── The counters ───────────────────────────────────────────────────────────

describe("the merchant", () => {
  const item = CITIES[PORT].produces[0];

  it("charges an enemy more and an ally less for the same goods", () => {
    expect(playerBuyPrice(makeWorld(HOSTILE), PORT, item))
      .toBeGreaterThan(playerBuyPrice(makeWorld(ALLIED), PORT, item));
  });

  it("and pays an enemy less for them", () => {
    expect(playerSellPrice(makeWorld(HOSTILE), PORT, item))
      .toBeLessThan(playerSellPrice(makeWorld(ALLIED), PORT, item));
  });

  it("still deals with an enemy — he is a merchant", () => {
    const out = executeBuy(makeWorld(HOSTILE), portId(PORT), itemId(item), 5);
    expect(out.error).toBeUndefined();
  });

  it("takes the ask out of the purse, not the posted price", () => {
    const w = makeWorld(HOSTILE);
    const out = executeBuy(w, portId(PORT), itemId(item), 4);
    const spent = w.player.gold - out.world.player.gold;
    expect(spent).toBe(playerBuyPrice(w, PORT, item) * 4);
    expect(spent).toBeGreaterThan((w.ports[PORT].prices[item] ?? 0) * 4);
  });

  it("a barrel bought and sold back on the spot is a loss, at every standing", () => {
    for (const rep of [HOSTILE, UNFRIENDLY, NEUTRAL, FRIENDLY, ALLIED]) {
      const w = makeWorld(rep);
      const bought = executeBuy(w, portId(PORT), itemId(item), 20).world;
      const back = executeSell(bought, portId(PORT), itemId(item), 20).world;
      expect(back.player.gold).toBeLessThanOrEqual(w.player.gold);
    }
  });

  it("and pays the marked-down price for a sale", () => {
    const bought = executeBuy(makeWorld(HOSTILE), portId(PORT), itemId(item), 10).world;
    const out = executeSell(bought, portId(PORT), itemId(item), 10);
    const earned = out.world.player.gold - bought.player.gold;
    expect(earned).toBe(playerSellPrice(bought, PORT, item) * 10);
  });
});

describe("the tavern", () => {
  it("nobody signs on with a captain the town hates", () => {
    expect(generateAvailableCrew(makeWorld(HOSTILE), portId(PORT)).ports[PORT].availableCrew).toBe(0);
  });

  it("and the recruit itself refuses even if a pool was left lying around", () => {
    const w = makeWorld(HOSTILE);
    w.ports[PORT] = { ...w.ports[PORT], availableCrew: 20 };
    const out = recruitCrew(w, portId(PORT), 5);
    expect(out.recruited).toBe(0);
    expect(out.error).toBe("no_crew_available");
  });

  it("an allied town musters more men than a neutral one", () => {
    const allied = generateAvailableCrew(makeWorld(ALLIED), portId(PORT)).ports[PORT].availableCrew;
    const neutral = generateAvailableCrew(makeWorld(NEUTRAL), portId(PORT)).ports[PORT].availableCrew;
    expect(allied).toBeGreaterThan(neutral);
  });

  it("advances the world's RNG the same way whatever his standing", () => {
    // A reputation must not silently reshuffle every other random thing in the
    // game, so the roll happens either way and only its result is scaled.
    const a = generateAvailableCrew(makeWorld(HOSTILE), portId(PORT)).rng;
    const b = generateAvailableCrew(makeWorld(ALLIED), portId(PORT)).rng;
    expect(a).toEqual(b);
  });
});

describe("the freight office", () => {
  it("has work for a neutral captain", () => {
    expect(cargoOffers(makeWorld(NEUTRAL), PORT).length).toBeGreaterThan(0);
  });

  it("has none for one his own crown has a price on", () => {
    expect(cargoOffers(makeWorld(UNFRIENDLY), PORT)).toEqual([]);
    expect(cargoOffers(makeWorld(HOSTILE), PORT)).toEqual([]);
  });
});

describe("the shipyard", () => {
  it("charges an enemy double and an ally a discount for the same work", () => {
    const hostile = repairRate(makeWorld(HOSTILE), portId(PORT));
    const neutral = repairRate(makeWorld(NEUTRAL), portId(PORT));
    const allied = repairRate(makeWorld(ALLIED), portId(PORT));
    expect(hostile).toBeGreaterThan(neutral);
    expect(allied).toBeLessThan(neutral);
  });

  it("quotes the standing rate when nobody names a port", () => {
    expect(repairRate(makeWorld(HOSTILE))).toBe(repairRate(makeWorld(ALLIED)));
  });

  it("will not sell a hull to a man it is at war with", () => {
    expect(buyShip(makeWorld(HOSTILE), shipClassId("frigate"), portId(PORT)).error).toBe("not_welcome");
    expect(buyShipToFleet(makeWorld(HOSTILE), shipClassId("frigate"), portId(PORT)).error).toBe("not_welcome");
  });

  it("but sells to an unfriendly one, who is merely disliked", () => {
    expect(buyShip(makeWorld(UNFRIENDLY), shipClassId("frigate"), portId(PORT)).bought).toBe(true);
  });

  it("leaves callers that name no port alone", () => {
    expect(buyShip(makeWorld(HOSTILE), shipClassId("frigate")).bought).toBe(true);
  });
});

// ===========================================================================
// The friend of a friend (v0.56.0)
// ===========================================================================

/**
 * v0.55.0 made an alliance a thing in the world — stamped, on the news boards,
 * repeated in the taverns — and it decided nothing the captain could touch.
 * This is the counter finally reading it: a commissioned captain in the
 * harbour of a crown fighting the same war stops being served as a stranger.
 *
 * Measured: a commissioned captain has an ally on **18.8% of days**, and while
 * it holds it reaches **14.5 of the 45 towns** on the chart.
 *
 * The guard is the whole design and most of these tests are about it.
 */
describe("a commission read by the crown next to the one that issued it", () => {
  const FRENCH = Object.keys(CITIES).find(
    k => (CITIES[k].factionId as unknown as string) === "france",
  ) as string;

  function war(a: string, b: string) {
    return {
      id: `war_${a}_${b}`, type: "war_start" as const, startDay: 1, endDay: 9999,
      ports: [], factions: [a, b], severity: 3 as const,
      headline: "news.war_start", vars: {},
    };
  }

  /** England and France both at war with Spain; the captain carries English paper. */
  function commissioned(over: { rep?: number; letter?: string; wars?: unknown[] } = {}): WorldState {
    const base = makeWorld();
    return {
      ...base,
      player: {
        ...base.player,
        reputation: { ...base.player.reputation, france: over.rep ?? 0 },
      },
      worldFlags: over.letter === "none" ? {} : { [marqueFlag(over.letter ?? "england")]: true },
      worldEvents: (over.wars ?? [war("spain", "england"), war("spain", "france")]) as never,
    } as WorldState;
  }

  it("names the patron standing with this crown, and nobody else", () => {
    const w = commissioned();
    expect(patronBehind(w, "france")).toBe("england");
    // Not his own patron: the paper is already English in an English port.
    expect(patronBehind(w, "england")).toBeUndefined();
    // Not the crown they are both fighting.
    expect(patronBehind(w, "spain")).toBeUndefined();
    expect(alliesOfPatrons(w)).toEqual(["france"]);
  });

  it("lifts the counter one tier, and says why", () => {
    const access = portAccess(commissioned(), FRENCH);
    expect(access.level).toBe("friendly");
    expect(access.viaAlly).toBe(true);
    // The table is what moved, not a special case beside it.
    expect(access.spread).toBe(0.08);
    expect(access.crewMul).toBe(1.25);
    expect(access.serviceMul).toBe(0.9);
  });

  it("does nothing for a captain carrying no paper at all", () => {
    const access = portAccess(commissioned({ letter: "none" }), FRENCH);
    expect(access.level).toBe("neutral");
    expect(access.viaAlly).toBe(false);
  });

  it("does nothing once the shared war is over", () => {
    const access = portAccess(commissioned({ wars: [war("spain", "england")] }), FRENCH);
    expect(access.level).toBe("neutral");
    expect(access.viaAlly).toBe(false);
  });

  it("is no amnesty: a town with its own grievance is unmoved", () => {
    // The guard. An alliance between ministers does not settle what this
    // colony has against this captain — he burnt its shipping himself.
    for (const rep of [UNFRIENDLY, HOSTILE]) {
      const access = portAccess(commissioned({ rep }), FRENCH);
      expect(access.viaAlly, `rep ${rep}`).toBe(false);
      expect(access.level).toBe(rep === HOSTILE ? "hostile" : "unfriendly");
    }
  });

  it("cannot lift a captain past the top of the ladder", () => {
    const access = portAccess(commissioned({ rep: ALLIED }), FRENCH);
    expect(access.level).toBe("allied");
    expect(access.spread).toBe(0.05);
  });

  it("lifts a friendly captain to allied, and that is the last rung", () => {
    const access = portAccess(commissioned({ rep: FRIENDLY }), FRENCH);
    expect(access.level).toBe("allied");
    expect(access.viaAlly).toBe(true);
  });

  it("leaves the commission itself alone — an alliance is not a second letter", () => {
    // The deliberate non-change, pinned. A prize taken from a crown the ALLY is
    // fighting but the patron is not stays uncovered: "which crown do I serve"
    // is the question the letter exists to ask.
    const w = commissioned({ wars: [war("netherlands", "france"), war("spain", "england"), war("spain", "france")] });
    expect(patronBehind(w, "france")).toBe("england");
    expect(coveringPatrons(w, "netherlands")).toEqual([]);
    expect(coveringPatrons(w, "spain")).toEqual(["england"]);
  });
});
