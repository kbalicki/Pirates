import { describe, it, expect } from "vitest";
import { tavernRumor, rumorsAt } from "../RumorSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { ITEMS } from "../../data/items.ts";
import { initPortPrices, initPortInventory } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId, factionId } from "../../model/ids.ts";
import { EN } from "../../i18n/locales/en.ts";
import { PL } from "../../i18n/locales/pl.ts";
import type { WorldState, PortRuntimeState } from "../../model/WorldState.ts";

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
    expect(said!.vars!.port).toBe(CITIES[NEAR].name);
    expect(Object.values(ITEMS).map(i => i.name)).toContain(said!.vars!.item);
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
      r => r.key === "tavern.rumor_hunger" && r.vars?.port === CITIES[FAR].name,
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
    expect(said?.vars?.port).toBe(CITIES[NEAR].name);
  });

  it("reports a town flying no crown's colours", () => {
    const base = makeWorld();
    const world: WorldState = {
      ...base,
      ports: { ...base.ports, [NEAR]: { ...base.ports[NEAR], factionId: factionId("pirates") } },
    };
    const said = rumorsAt(world, HERE).find(r => r.key === "tavern.rumor_black_flag");
    expect(said?.vars?.port).toBe(CITIES[NEAR].name);
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
    expect(said?.vars?.port).toBe(CITIES[NEAR].name);
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
          expect(line, `${rumor.key} in ${lang} ignores {{${name}}}`).toContain(`{{${name}}}`);
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
