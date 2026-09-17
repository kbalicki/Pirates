import { describe, it, expect } from "vitest";
import { tavernRumor, rumorsAt, flavoursAt } from "../RumorSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { ITEMS } from "../../data/items.ts";
import { initPortPrices, initPortInventory } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId, factionId } from "../../model/ids.ts";
import { EN } from "../../i18n/locales/en.ts";
import { PL } from "../../i18n/locales/pl.ts";
import { stampAlliances } from "../DiplomacySystem.ts";
import type { WorldState, PortRuntimeState, WorldEventState } from "../../model/WorldState.ts";
import { portNameKey, itemNameKeyGen } from "../../i18n/names.ts";
import { factionNameKey } from "../../i18n/names.ts";

// ===========================================================================
// RumorSystem — the tavern reports the world (v0.28.0)
// ===========================================================================

/**
 * The rumour was eight strings rotated by the day of the month: the same ghost
 * ship whether the player had spent the month blockading Havana or asleep.
 * What is worth pinning down now is that it is *true* and that it is *local* —
 * a tavern that knew about every famine in the Indies would make the choice of
 * where to drink meaningless, and one that made facts up would be worse than
 * the ghost story it replaced.
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

/** Two towns close enough to hear each other, and one far away. */
const HERE = "port_royal";
const NEAR = "tortuga";
const FAR = "bermuda";

function hungryAt(world: WorldState, portKey: string, hunger = 0.5): WorldState {
  const port = world.ports[portKey];
  const inventory = { ...port.inventory };
  for (const item of CITIES[portKey].demands) inventory[item] = 0;
  return {
    ...world,
    ports: { ...world.ports, [portKey]: { ...port, hunger, inventory } },
  };
}

describe("a quiet Caribbean", () => {
  it("still has something to say", () => {
    const rumor = tavernRumor(makeWorld(), HERE);
    expect(rumor.key).toMatch(/^tavern\.rumor_/);
  });

  it("tells one of the old stories, because nothing else is happening", () => {
    expect(rumorsAt(makeWorld(), HERE)).toEqual([]);
  });
});

describe("what the tavern knows", () => {
  it("reports a hungry town within earshot, and names what it is short of", () => {
    const world = hungryAt(makeWorld(), NEAR);
    const said = rumorsAt(world, HERE).find(r => r.key === "tavern.rumor_hunger");
    expect(said).toBeDefined();
    expect(said!.vars!.port).toBe(portNameKey(NEAR));
    // The genitive key, not the nominative: the sentence is "the town is short
    // of X" and Polish declines it (v0.68.0).
    expect(Object.keys(ITEMS).map(itemNameKeyGen)).toContain(said!.vars!.item);
  });

  it("does not gossip about the town it is standing in", () => {
    const world = hungryAt(makeWorld(), HERE);
    const said = rumorsAt(world, HERE).find(r => r.key === "tavern.rumor_hunger");
    expect(said).toBeUndefined();
  });

  it("has not heard about a famine on the other side of the sea", () => {
    const far = Math.hypot(
      CITIES[FAR].pos.x - CITIES[HERE].pos.x,
      CITIES[FAR].pos.y - CITIES[HERE].pos.y,
    );
    expect(far).toBeGreaterThan(1300);          // the fixture's premise
    const world = hungryAt(makeWorld(), FAR);
    const said = rumorsAt(world, HERE).find(
      r => r.key === "tavern.rumor_hunger" && r.vars?.port === portNameKey(FAR),
    );
    expect(said).toBeUndefined();
  });

  it("reports a cordon", () => {
    const base = makeWorld();
    const world: WorldState = {
      ...base,
      ports: { ...base.ports, [NEAR]: { ...base.ports[NEAR], blockadeDays: 30 } },
    };
    const said = rumorsAt(world, HERE).find(r => r.key === "tavern.rumor_blockade");
    expect(said?.vars?.port).toBe(portNameKey(NEAR));
  });

  it("reports a harbour that has been shut", () => {
    // The one fact the player cannot go and read for himself: a closed port's
    // own news board is behind the door he is being refused at.
    const base = makeWorld();
    const world: WorldState = {
      ...base,
      worldEvents: [{
        id: "ev_hurricane",
        type: "hurricane",
        startDay: 1,
        endDay: 999,
        ports: [NEAR],
        factions: ["france"],
        severity: 3,
        headline: "news.hurricane",
        vars: {},
      }],
    } as unknown as WorldState;
    const said = rumorsAt(world, HERE).find(r => r.key === "tavern.rumor_shut");
    expect(said?.vars?.port).toBe(portNameKey(NEAR));
  });

  it("reports a town flying no crown's colours", () => {
    const base = makeWorld();
    const world: WorldState = {
      ...base,
      ports: { ...base.ports, [NEAR]: { ...base.ports[NEAR], factionId: factionId("pirates") } },
    };
    const said = rumorsAt(world, HERE).find(r => r.key === "tavern.rumor_black_flag");
    expect(said?.vars?.port).toBe(portNameKey(NEAR));
  });

  it("reports a busy quay, but only a genuinely busy one", () => {
    const base = makeWorld();
    const quiet = rumorsAt(base, HERE).find(r => r.key === "tavern.rumor_busy_quay");
    expect(quiet).toBeUndefined();

    const world: WorldState = {
      ...base,
      ports: { ...base.ports, [NEAR]: { ...base.ports[NEAR], tradeIncome: 400 } },
    };
    const said = rumorsAt(world, HERE).find(r => r.key === "tavern.rumor_busy_quay");
    expect(said?.vars?.port).toBe(portNameKey(NEAR));
  });

  it("leads with the fact a captain can act on this afternoon", () => {
    // The ordering is the design: bread first, business last.
    const base = makeWorld();
    const world = hungryAt(
      { ...base, ports: { ...base.ports, [NEAR]: { ...base.ports[NEAR], tradeIncome: 400 } } },
      NEAR,
    );
    expect(rumorsAt(world, HERE)[0].key).toBe("tavern.rumor_hunger");
  });
});

describe("what the tavern says today", () => {
  it("says the same thing all day and something else tomorrow", () => {
    const world = hungryAt(makeWorld(), NEAR);
    const morning = tavernRumor(world, HERE);
    const evening = tavernRumor({ ...world, time: { ...world.time, hour: 23 } }, HERE);
    expect(evening).toEqual(morning);

    // Not an assertion that it *differs* — with one fact in the world it cannot
    // — but that the pick moves with the day rather than standing still.
    const many = new Set<string>();
    for (let d = 0; d < 12; d++) {
      many.add(tavernRumor({ ...world, time: { ...world.time, day: 100 + d } }, HERE).key);
    }
    expect(many.size).toBeGreaterThan(1);
  });

  it("does not have two towns chorusing the same line", () => {
    const world = hungryAt(makeWorld(), NEAR);
    const heard = new Set<string>();
    for (const key of Object.keys(CITIES)) heard.add(tavernRumor(world, key).key);
    expect(heard.size).toBeGreaterThan(1);
  });

  it("talks about the price of bread once the world is busy", () => {
    // Two real facts is the threshold at which the old stories step aside.
    const base = hungryAt(makeWorld(), NEAR);
    const world: WorldState = {
      ...base,
      ports: { ...base.ports, [NEAR]: { ...base.ports[NEAR], blockadeDays: 30 } },
    };
    const facts = new Set(rumorsAt(world, HERE).map(r => r.key));
    expect(facts.size).toBeGreaterThanOrEqual(2);
    for (let d = 0; d < 8; d++) {
      const said = tavernRumor({ ...world, time: { ...world.time, day: 100 + d } }, HERE);
      expect(facts.has(said.key)).toBe(true);
    }
  });
});

describe("every line the tavern can say", () => {
  it("exists in both locales, with every variable filled", () => {
    // The guard that matters for a rumour built out of world facts: a key that
    // is not in the locale file prints as its own name, and a variable the
    // sentence does not use prints as nothing at all. Both look like a bug in
    // the world rather than in a string table.
    const base = makeWorld();
    const busy = hungryAt(
      {
        ...base,
        ports: {
          ...base.ports,
          [NEAR]: {
            ...base.ports[NEAR],
            blockadeDays: 30,
            tradeIncome: 400,
            factionId: factionId("pirates"),
          },
        },
      },
      NEAR,
    );

    const said = rumorsAt(busy, HERE);
    expect(said.length).toBeGreaterThan(2);
    for (const rumor of said) {
      for (const [lang, locale] of [["en", EN], ["pl", PL]] as const) {
        const line = locale[rumor.key];
        expect(line, `${rumor.key} missing in ${lang}`).toBeDefined();
        for (const name of Object.keys(rumor.vars ?? {})) {
          // The form after the colon is Polish-only (v0.69.0).
          expect(line, `${rumor.key} in ${lang} ignores {{${name}}}`)
            .toMatch(new RegExp(`\{\{${name}(?::[a-z]+)?\}\}`));
        }
      }
    }
  });

  it("has the old stories in both locales too", () => {
    for (const rumor of [tavernRumor(makeWorld(), HERE)]) {
      expect(EN[rumor.key]).toBeDefined();
      expect(PL[rumor.key]).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------

/**
 * The one fact in `rumorsAt` with no geography in it (v0.55.0), so it earns
 * its place a different way: the tavern talks about the flag over its own
 * roof. A Dutch quay reports what the Dutch are doing; it does not read the
 * whole Caribbean's diplomatic post.
 */
describe("two crowns standing together", () => {
  function war(a: string, b: string, endDay = 9999): WorldEventState {
    return {
      id: `war_${a}_${b}`, type: "war_start", startDay: 1, endDay,
      ports: [], factions: [a, b], severity: 3, headline: "news.war_start", vars: {},
    };
  }

  /** Port Royal is English; Havana is Spanish, and Spain is the enemy here. */
  const allied = () => stampAlliances(makeWorld({
    worldEvents: [war("spain", "england"), war("spain", "france")],
  }));

  it("is told in a town of one of the two crowns", () => {
    const said = rumorsAt(allied(), HERE).find(r => r.key === "tavern.rumor_alliance");
    expect(said).toBeDefined();
    expect(said!.vars!.against).toBe(factionNameKey("spain"));
  });

  it("is not told in a town of the crown it is aimed at", () => {
    const spanish = Object.keys(CITIES).find(k => (CITIES[k].factionId as string) === "spain")!;
    expect(rumorsAt(allied(), spanish).some(r => r.key === "tavern.rumor_alliance")).toBe(false);
  });

  it("is not told at all while nobody shares an enemy", () => {
    const w = stampAlliances(makeWorld({ worldEvents: [war("spain", "england")] }));
    expect(rumorsAt(w, HERE).some(r => r.key === "tavern.rumor_alliance")).toBe(false);
  });

  it("repeats what was stamped, not what is true this morning", () => {
    // The alliance names the enemy that made it. That is the whole reason the
    // event exists: the tavern is retelling something that happened on a day.
    const w = allied();
    const said = rumorsAt(w, HERE).find(r => r.key === "tavern.rumor_alliance")!;
    const stamped = w.worldEvents.find(ev => ev.type === "alliance")!;
    expect(said.vars!.faction1).toBe(stamped.vars.faction1);
    expect(said.vars!.faction2).toBe(stamped.vars.faction2);
  });
});

// ---------------------------------------------------------------------------

/**
 * The eight old stories, read against the world that grew around them (v0.70.0).
 *
 * v0.28.0 replaced the rotating list of eight strings with facts, and left the
 * eight in the pool for a quiet Caribbean so the tavern would never be silent.
 * Nobody read them. Measured on a fresh world, `rumorsAt` is empty in all
 * forty-five ports, so those eight are not a fallback at all - they are the
 * entire first thing a captain ever hears in a tavern, and three of them were
 * checkably false.
 *
 * What is pinned here is the rule that replaced them: a line that says
 * something about the world is offered only when the world agrees.
 */
describe("the old stories, checked", () => {
  const near = (portKey: string) =>
    Object.keys(CITIES).filter(k => k !== portKey
      && Math.hypot(CITIES[k].pos.x - CITIES[portKey].pos.x,
                    CITIES[k].pos.y - CITIES[portKey].pos.y) <= 1300);

  const flavours = (world: WorldState, portKey = HERE) =>
    flavoursAt(world, portKey, near(portKey));
  const said = (world: WorldState, key: string, portKey = HERE) =>
    flavours(world, portKey).find(r => r.key === key);

  it("is never silent, however empty the world is", () => {
    // The property v0.28.0 wanted and the reason the eight were kept. Gating
    // them could have taken it away; the two that claim nothing are what keeps
    // it.
    const world = makeWorld();
    expect(rumorsAt(world, HERE)).toEqual([]);
    expect(flavours(world).length).toBeGreaterThan(0);
    expect(tavernRumor(world, HERE).key).toMatch(/^tavern\.rumor_/);
  });

  it("does not send a hold of sugar to the town that grows it", () => {
    // The measured one. Barbados `produces: ["sugar_cane"]`, and settled it is
    // 34th of 45 for the price of sugar - 4 gold against 27 at Port Royale -
    // so "sugar prices are sky-high in Barbados" sent a captain to the one
    // counter in the Caribbean that would pay him least.
    const world = makeWorld();
    let offered = 0;
    for (const portKey of Object.keys(CITIES)) {
      const line = said(world, "tavern.rumor_trade", portKey);
      if (!line) continue;
      offered++;
      const named = Object.keys(CITIES).find(k => portNameKey(k) === line.vars!.port);
      expect(named, `${portKey} named something that is not a port`).toBeDefined();
      expect(
        CITIES[named!].produces.includes("sugar_cane"),
        `${portKey} says sugar is cheap in ${named}, which does not grow it`,
      ).toBe(true);
    }
    // The companion assertion (v0.64.0): a sweep that reads nothing passes for
    // the wrong reason, and a line nobody is ever offered is not a fixed line.
    expect(offered).toBeGreaterThan(20);
  });

  it("says nothing about sugar where nobody grows any", () => {
    const world = makeWorld();
    const barren = Object.keys(CITIES).find(k => !near(k).some(
      n => CITIES[n].produces.includes("sugar_cane")));
    if (!barren) return;                     // no such corner of the map: fine
    expect(said(world, "tavern.rumor_trade", barren)).toBeUndefined();
  });

  it("talks about the captain in the room, not about a pirate the game has not got", () => {
    // Blackbeard appears in no other line of this codebase, and his career
    // (1716-18) begins thirty-six years after the latest era the game has.
    const unknown = makeWorld();
    expect(said(unknown, "tavern.rumor_pirates")).toBeUndefined();

    const famous = makeWorld({
      playerName: "Kidd",
      player: { ...unknown.player, notoriety: 60 },
    } as Partial<WorldState>);
    expect(said(famous, "tavern.rumor_pirates")!.vars!.name).toBe("Kidd");
  });

  it("keeps the weather to the season the event table itself rolls on", () => {
    // Read from `eventSeason`, not copied. A season kept in two places is the
    // defect v0.57.0 paid for.
    const april = makeWorld();                        // day 100 of 1690
    expect(said(april, "tavern.rumor_storm")).toBeUndefined();
    const september = makeWorld({ time: { day: 250, hour: 12, minute: 0, tick: 0 } } as never);
    expect(said(september, "tavern.rumor_storm")).toBeDefined();
  });

  it("only says two crowns are at war when this town's own flag is in one", () => {
    const peace = makeWorld();
    expect(said(peace, "tavern.rumor_war")).toBeUndefined();

    // Port Royal is English. A war Spain and France are having is not its news.
    const elsewhere = makeWorld({ worldEvents: [{
      id: "w1", type: "war_start", startDay: 1, endDay: 999,
      ports: [], factions: ["spain", "france"], severity: 3,
      headline: "news.war_start", vars: {},
    }] } as never);
    expect(said(elsewhere, "tavern.rumor_war")).toBeUndefined();

    const ours = makeWorld({ worldEvents: [{
      id: "w2", type: "war_start", startDay: 1, endDay: 999,
      ports: [], factions: ["spain", "england"], severity: 3,
      headline: "news.war_start", vars: {},
    }] } as never);
    const line = said(ours, "tavern.rumor_war")!;
    expect(line.vars!.crown).toBe(factionNameKey("england"));
    expect(line.vars!.enemy).toBe(factionNameKey("spain"));
  });

  it("only says a governor is hiring when one of them is", () => {
    // `offerFor` wants an ally's standing and a landing already at sea, so this
    // is rare - and when it fires it is the most valuable line in the pool,
    // because a defence commission is easy to sail past without ever learning
    // it existed.
    expect(said(makeWorld(), "tavern.rumor_governor")).toBeUndefined();
  });

  it("keeps the one line that claims nothing", () => {
    // A tavern needs a story as well as a noticeboard, and the ghost ship off
    // Bermuda is the only one of the eight that never said anything the world
    // could contradict.
    expect(said(makeWorld(), "tavern.rumor_ghost_ship")).toBeDefined();
  });

  it("exists in both locales, with every variable filled", () => {
    const famous = makeWorld({
      playerName: "Kidd",
      time: { day: 250, hour: 12, minute: 0, tick: 0 },
      player: { ...makeWorld().player, notoriety: 60 },
      worldEvents: [{
        id: "w2", type: "war_start", startDay: 1, endDay: 999,
        ports: [], factions: ["spain", "england"], severity: 3,
        headline: "news.war_start", vars: {},
      }],
    } as never);
    const lines = flavours(famous);
    expect(lines.length).toBeGreaterThan(4);
    for (const rumor of lines) {
      for (const [lang, locale] of [["en", EN], ["pl", PL]] as const) {
        expect(locale[rumor.key], `${rumor.key} missing in ${lang}`).toBeDefined();
        for (const name of Object.keys(rumor.vars ?? {})) {
          expect(locale[rumor.key], `${rumor.key} in ${lang} ignores {{${name}}}`)
            .toMatch(new RegExp(`\\{\\{${name}(?::[a-z]+)?\\}\\}`));
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------

/**
 * And the thing the tavern had never heard of.
 *
 * Since v0.46.0 the plate fleet is a real event with a real muster port and a
 * real course, and `rumorsAt` did not know about her - while the flavour list
 * told a made-up version of the same story through the wrong water. The most
 * valuable thing in the game did not cross the channel built to report it.
 */
describe("the plate fleet reaches the tavern", () => {
  const plate = (startDay: number, endDay: number) => makeWorld({
    worldEvents: [{
      id: "plate1", type: "treasure_fleet", startDay, endDay,
      ports: [], factions: ["spain"], severity: 2,
      headline: "news.treasure_fleet", vars: { muster: "porto_bello" },
    }],
  } as never);

  it("says she is loading, while she is still loading", () => {
    // The fortnight in harbour is what turns an interception into a plan, so
    // the two halves of her passage have to say different things.
    const world = plate(99, 120);
    const line = rumorsAt(world, "cartagena").find(r => r.key === "tavern.rumor_plate_muster");
    expect(line).toBeDefined();
    expect(line!.vars!.port).toBe(portNameKey("porto_bello"));
  });

  it("names the water she cannot avoid, once she is away", () => {
    const world = plate(80, 120);
    const line = rumorsAt(world, "cartagena").find(r => r.key === "tavern.rumor_plate_sailed");
    expect(line).toBeDefined();
    expect(line!.vars!.rendezvous).toBe(portNameKey("havana"));
  });

  it("is not news on the far side of the sea", () => {
    const world = plate(99, 120);
    const heard = rumorsAt(world, "barbados").some(r => r.key.startsWith("tavern.rumor_plate"));
    expect(heard).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("weather within earshot", () => {
  const storm = (ports: string[]) => makeWorld({
    worldEvents: [{
      id: "h1", type: "hurricane", startDay: 99, endDay: 104,
      ports, factions: [], severity: 3, headline: "news.hurricane", vars: {},
    }],
  } as never);

  it("reports a storm the captain has not been told about", () => {
    // The reason this reads `liveHurricanes` and not `knownHurricanes`: a
    // channel filtered by his own chart could never tell him anything new.
    const world = storm([NEAR]);
    expect(world.knownEventIds).toEqual([]);
    const line = rumorsAt(world, HERE).find(r => r.key.startsWith("tavern.rumor_hurricane"));
    expect(line).toBeDefined();
    expect(line!.vars!.port).toBe(portNameKey(NEAR));
  });

  it("says which way she is walking when she is walking", () => {
    const world = storm([NEAR, HERE]);
    const line = rumorsAt(world, HERE).find(r => r.key === "tavern.rumor_hurricane_bound");
    expect(line).toBeDefined();
    expect(line!.vars!.bound).toBe(portNameKey(HERE));
  });

  it("does not report weather on the other side of the Caribbean", () => {
    const world = storm([FAR]);
    const heard = rumorsAt(world, "panama").some(r => r.key.startsWith("tavern.rumor_hurricane"));
    expect(heard).toBe(false);
  });
});

// ---------------------------------------------------------------------------

/**
 * And the shape of the whole release, read off the locale tables: a line the
 * tavern says must not name something the game does not have.
 */
describe("the tavern names nothing the world has not got", () => {
  it("has no captain, harbour or passage that exists only in a string", () => {
    const INVENTED = [
      "Blackbeard", "Czarnobrod",            // no such NPC, and thirty-six years late
      "Windward Passage", "Nawietrzn",       // the plate fleet goes by the Florida Straits
    ];
    const offenders: string[] = [];
    for (const [lang, locale] of [["en", EN], ["pl", PL]] as const) {
      for (const [key, line] of Object.entries(locale)) {
        if (!key.startsWith("tavern.rumor_") || typeof line !== "string") continue;
        for (const word of INVENTED) {
          if (line.includes(word)) offenders.push(`${lang} ${key}: ${word}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("reads enough lines for that to mean something", () => {
    const count = Object.keys(EN).filter(k => k.startsWith("tavern.rumor_")).length;
    expect(count).toBeGreaterThan(15);
  });
});
