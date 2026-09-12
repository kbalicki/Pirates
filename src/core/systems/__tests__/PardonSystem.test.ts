import { describe, it, expect } from "vitest";
import {
  newGovernorAt, pardonOffer, grantPardon, pardonStands,
  GOVERNOR_NEW_DAYS, PARDON_PER_POINT, PARDON_FLOOR,
} from "../PardonSystem.ts";
import { portAccess } from "../PortAccessSystem.ts";
import { getAggregatedEffects } from "../EventEffectsSystem.ts";
import { updateWorldEvents } from "../WorldEventSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { ITEMS } from "../../data/items.ts";
import { initPortPrices } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId, factionId } from "../../model/ids.ts";
import { EN } from "../../i18n/locales/en.ts";
import type { WorldState, PortRuntimeState, WorldEventState } from "../../model/WorldState.ts";

// ===========================================================================
// PardonSystem — a new governor does not know your name (v0.61.0)
// ===========================================================================

/**
 * The manual has carried "+50 wealth, reputation may be wiped" under *New
 * governor* since v0.9.7.1 and nothing has ever touched a reputation when a
 * governor changed. See the module header for what that cost the player and
 * why the pardon is local and asked for rather than crown-wide and automatic.
 *
 * Cartagena is Spanish, and Spain is the crown a pirate captain actually
 * manages to make hostile, so the fixture burns Spain and walks into Cartagena.
 */

const PORT = "cartagena";
const CROWN = CITIES[PORT].factionId as unknown as string;
/** Another town of the same crown: the pardon must not reach it. */
const OTHER = Object.keys(CITIES).find(
  k => k !== PORT && (CITIES[k].factionId as unknown as string) === CROWN,
) as string;

function makePort(key: string): PortRuntimeState {
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
  } as unknown as PortRuntimeState;
}

const DAY = 100;

function appointment(portKey = PORT, startDay = DAY): WorldEventState {
  return {
    id: `new_governor_${startDay}_${portKey}`,
    type: "new_governor",
    startDay,
    endDay: startDay + GOVERNOR_NEW_DAYS,
    ports: [portKey],
    factions: [CITIES[portKey].factionId as unknown as string],
    severity: 1,
    headline: "news.new_governor",
    vars: { mainPort: portKey },
  };
}

function makeWorld(rep: number, opts: {
  gold?: number; notoriety?: number; events?: WorldEventState[];
} = {}): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  for (const key of Object.keys(CITIES)) ports[key] = makePort(key);
  return {
    version: 12,
    time: { day: DAY, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: opts.gold ?? 10000,
      notoriety: opts.notoriety ?? 0,
      reputation: { [CROWN]: rep },
      ranks: {},
      location: { type: "sea", pos: { x: 0, y: 0 } },
      questLog: [], fleet: [], lastPlunderDay: 1, citiesCaptured: 0, courtship: {},
    },
    entities: {},
    ports,
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: {},
    eventLog: [],
    worldEvents: opts.events ?? [appointment()],
    knownEventIds: [],
    playerName: "Captain",
    eraId: "pirates_sunset",
    startYear: 1690,
    gameSpeed: 1.2,
  } as unknown as WorldState;
}

/** Take the offer that is on the table. */
function pardoned(world: WorldState, portKey = PORT): WorldState {
  const offer = pardonOffer(world, portKey);
  expect(offer, "nothing was on the table").not.toBeNull();
  const res = grantPardon(world, offer!);
  expect(res.error).toBeUndefined();
  return res.world;
}

// ── Who is new, and for how long ───────────────────────────────────────────

describe("newGovernorAt", () => {
  it("finds the appointment at this town", () => {
    expect(newGovernorAt(makeWorld(-80), PORT)?.type).toBe("new_governor");
  });

  it("does not find one at the town next door", () => {
    expect(newGovernorAt(makeWorld(-80), OTHER)).toBeNull();
  });

  /**
   * The reason the event stopped being an instant. At `[1, 1]` the town had it
   * off the noticeboard before a ship could carry the news anywhere, so the
   * window existed only for a captain already standing in the room.
   */
  it("is a window a captain can sail into, not a day", () => {
    expect(GOVERNOR_NEW_DAYS).toBeGreaterThanOrEqual(14);
    const w = makeWorld(-80);
    const late = { ...w, time: { ...w.time, day: DAY + GOVERNOR_NEW_DAYS } };
    expect(newGovernorAt(late, PORT)).not.toBeNull();
  });

  it("closes once the man is no longer new", () => {
    const w = makeWorld(-80);
    const late = { ...w, time: { ...w.time, day: DAY + GOVERNOR_NEW_DAYS + 1 } };
    expect(newGovernorAt(late, PORT)).toBeNull();
  });
});

// ── What is on the table ───────────────────────────────────────────────────

describe("pardonOffer", () => {
  it("is not there when nobody has just taken the residence", () => {
    expect(pardonOffer(makeWorld(-80, { events: [] }), PORT)).toBeNull();
  });

  it("is not there when the crown has nothing against him", () => {
    expect(pardonOffer(makeWorld(0), PORT)).toBeNull();
    expect(pardonOffer(makeWorld(40), PORT)).toBeNull();
  });

  it("prices the whole distance back to neutral", () => {
    const offer = pardonOffer(makeWorld(-80), PORT)!;
    expect(offer.points).toBe(80);
    expect(offer.gold).toBe(80 * PARDON_PER_POINT);
    expect(offer.crown).toBe(CROWN);
  });

  /**
   * He is not pricing the grievance, he is pricing his own risk — and how
   * loudly the Caribbean says the captain's name is a number the game keeps.
   */
  it("costs a famous captain more than an unknown one", () => {
    const quiet = pardonOffer(makeWorld(-80, { notoriety: 0 }), PORT)!;
    const loud = pardonOffer(makeWorld(-80, { notoriety: 100 }), PORT)!;
    expect(loud.gold).toBe(quiet.gold * 2);
  });

  it("is gone once the paper is written", () => {
    const w = pardoned(makeWorld(-80));
    expect(pardonOffer(w, PORT)).toBeNull();
  });
});

// ── Paying for it ──────────────────────────────────────────────────────────

describe("grantPardon", () => {
  it("takes the money and stamps the town", () => {
    const before = makeWorld(-80, { gold: 5000 });
    const after = pardoned(before);
    expect(after.player.gold).toBe(5000 - 80 * PARDON_PER_POINT);
    expect(after.ports[PORT].pardon).toEqual({ crown: CROWN, rep: -80, day: DAY });
  });

  it("refuses a purse that cannot cover it", () => {
    const w = makeWorld(-80, { gold: 10 });
    const res = grantPardon(w, pardonOffer(w, PORT)!);
    expect(res.error).toBeDefined();
    expect(res.world.ports[PORT].pardon).toBeUndefined();
  });

  it("writes a line in the journal, with names in it and not keys", () => {
    const after = pardoned(makeWorld(-80));
    const entry = after.eventLog[after.eventLog.length - 1];
    expect(entry.key).toBe("news.pardon_granted");
    expect(EN[entry.key]).toBeDefined();
    // The v0.37.0 trap: a raw faction key reaching a line a person reads.
    expect(String(entry.vars?.faction)).not.toBe(CROWN);
    expect(String(entry.vars?.port)).not.toBe(PORT);
  });

  it("leaves the crown's own opinion of him exactly where it was", () => {
    const after = pardoned(makeWorld(-80));
    expect(after.player.reputation[CROWN]).toBe(-80);
  });
});

// ── What it buys at the counter ────────────────────────────────────────────

describe("the counter afterwards", () => {
  it("turns a town that would not deal with him into one that will", () => {
    const before = makeWorld(-80);
    const shut = portAccess(before, PORT);
    expect(shut.level).toBe("hostile");
    expect(shut.crewMul).toBe(0);
    expect(shut.canCharter).toBe(false);
    expect(shut.canBuyShips).toBe(false);

    const open = portAccess(pardoned(before), PORT);
    expect(open.level).toBe("neutral");
    expect(open.crewMul).toBeGreaterThan(0);
    expect(open.canCharter).toBe(true);
    expect(open.canBuyShips).toBe(true);
    expect(open.viaPardon).toBe(true);
    // The number beside it is untouched — which is why the screen has to say
    // why the counter is behaving better than it.
    expect(open.reputation).toBe(-80);
  });

  it("lifts him to neutral and no further", () => {
    // `unfriendly` without it, `neutral` with it, and never the tier above:
    // what the paper buys is that he stops being turned away, not a friendship.
    const before = makeWorld(-25);
    expect(portAccess(before, PORT).level).toBe("unfriendly");
    expect(portAccess(pardoned(before), PORT).level).toBe("neutral");
  });

  /**
   * The whole shape of the mechanic: a town's opinion is the town's own. The
   * governor of Cartagena speaks for Cartagena.
   */
  it("reaches this town and no other town of the same crown", () => {
    const after = pardoned(makeWorld(-80));
    expect(portAccess(after, OTHER).level).toBe("hostile");
    expect(portAccess(after, OTHER).viaPardon).toBe(false);
  });

  it("is worth nothing when the town changes hands", () => {
    const after = pardoned(makeWorld(-80));
    const taken = {
      ...after,
      ports: { ...after.ports, [PORT]: { ...after.ports[PORT], factionId: factionId("england") } },
    };
    expect(portAccess(taken, PORT).viaPardon).toBe(false);
  });
});

// ── Fresh cause ────────────────────────────────────────────────────────────

describe("a pardon covers what he had done and nothing after it", () => {
  it("holds while his standing does not get worse", () => {
    const after = pardoned(makeWorld(-80));
    const same = { ...after, player: { ...after.player, reputation: { [CROWN]: -80 } } };
    expect(portAccess(same, PORT).level).toBe("neutral");
  });

  it("breaks the moment he gives the new man fresh cause", () => {
    const after = pardoned(makeWorld(-80));
    const worse = { ...after, player: { ...after.player, reputation: { [CROWN]: -81 } } };
    expect(portAccess(worse, PORT).level).toBe("hostile");
    expect(portAccess(worse, PORT).viaPardon).toBe(false);
  });

  it("stands again if he makes the fresh damage good", () => {
    const after = pardoned(makeWorld(-80));
    const worse = { ...after, player: { ...after.player, reputation: { [CROWN]: -90 } } };
    const mended = { ...worse, player: { ...worse.player, reputation: { [CROWN]: -80 } } };
    expect(portAccess(mended, PORT).level).toBe("neutral");
  });

  it("lets a later governor write a second one after that", () => {
    const first = pardoned(makeWorld(-80));
    const worse = {
      ...first,
      player: { ...first.player, reputation: { [CROWN]: -95 } },
      worldEvents: [appointment(PORT, DAY + 400)],
      time: { ...first.time, day: DAY + 400 },
    };
    const offer = pardonOffer(worse, PORT);
    expect(offer?.points).toBe(95);
  });

  it("a pardon nobody wrote is no pardon", () => {
    expect(pardonStands(undefined, CROWN, -80)).toBe(false);
  });
});

// ── The event that opens the door ──────────────────────────────────────────

describe("the appointment itself", () => {
  /**
   * The daily wealth row had to go when the event stopped being an instant:
   * `+MAX_WEALTH_DELTA` a day over a thirty-day window would have made a new
   * governor thirty times the good news he was ever meant to be. The fifty
   * gold is still paid once, as the one-shot it always was.
   */
  it("pays nothing daily, because the fifty gold was always a one-shot", () => {
    const w = makeWorld(0);
    const fx = getAggregatedEffects(w, PORT);
    expect(fx.wealthDelta).toBe(0);
    expect(fx.productionMul).toBe(1);
    expect(fx.priceMul).toBe(1);
  });

  it("still puts the town on the noticeboard the day it happens", () => {
    expect(PARDON_FLOOR).toBe(0);
    expect(newGovernorAt(makeWorld(0), PORT)?.ports).toContain(PORT);
  });

  /**
   * Against the event machine itself rather than the fixture: the template is
   * private, and what matters is what the world actually produces. Measured
   * over 20 seeds x 50 years, `new_governor` is 6% of all events and fires
   * about eight times a year, so a few years of one world is plenty to catch
   * one.
   */
  it("is rolled with the window on it by the machine that rolls it", () => {
    let w = makeWorld(0, { events: [] });
    let found: WorldEventState | undefined;
    for (let d = 0; d < 365 * 6 && !found; d++) {
      w = { ...w, time: { ...w.time, day: w.time.day + 1 } };
      w = updateWorldEvents(w);
      found = w.worldEvents.find(ev => ev.type === "new_governor");
    }
    expect(found, "six years and no governor changed").toBeDefined();
    expect(found!.endDay - found!.startDay).toBe(GOVERNOR_NEW_DAYS);
    expect(found!.ports.length).toBe(1);
  });
});
