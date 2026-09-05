import { describe, it, expect } from "vitest";
import {
  namedShips,
  livingNamedShips,
  namedShipById,
  seedNamedShips,
  phaseAt,
  outbound,
  boundFor,
  namedShipPos,
  laneOf,
  projectOnPath,
  materializeNamed,
  dematerializeNamed,
  writeBackNamed,
  hullOf,
  settleNamedShip,
  namedShipFateFlag,
  NAMED_SHIP_COUNT,
  PASSAGE_SPEED,
  type NamedShip,
} from "../NamedShipSystem.ts";
import {
  huntOffer,
  huntQuest,
  acceptHunt,
  activeHunts,
  huntQuestId,
  HUNT_QUEST_PREFIX,
  MAX_ACTIVE_HUNTS,
} from "../InformantSystem.ts";
import { buildQuestRegistry } from "../QuestRegistry.ts";
import { advanceQuests } from "../QuestSystem.ts";
import { CITIES } from "../../data/cities.ts";
import { SHIP_NAMES } from "../../data/shipNames.ts";
import { initPortPrices, initPortInventory } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId } from "../../model/ids.ts";
import { EN } from "../../i18n/locales/en.ts";
import { PL } from "../../i18n/locales/pl.ts";
import type { WorldState, PortRuntimeState } from "../../model/WorldState.ts";

// ===========================================================================
// NamedShipSystem — the hulls that are the same hull tomorrow (v0.32.0)
// ===========================================================================

/**
 * Everything in this game was anonymous traffic: spawned in the player's
 * horizon, forgotten behind him. "Sink the Santa Ana" needs a Santa Ana that is
 * still there after a week's sailing, and the whole design rests on two things
 * being true — she is a *record* with a derived position, and her entity is
 * written back into that record before it is ever thrown away.
 *
 * Note on geography: `LANDMASSES` is empty under vitest, so every lane's course
 * is the straight line between its ends. That is fine for everything here —
 * position along a course, projection onto it, the schedule — and it is why no
 * assertion below is about which water she is in.
 */

function makePort(key: string): PortRuntimeState {
  const b = getPortBaseline(key);
  return {
    portId: portId(key),
    factionId: CITIES[key].factionId,
    prices: initPortPrices(key),
    inventory: initPortInventory(key),
    shipyardQueue: [],
    availableCrew: 10,
    population: b.population,
    wealth: b.wealth,
    defense: b.defense,
    bonusProduces: [],
  } as PortRuntimeState;
}

function makeWorld(over: Partial<WorldState> = {}): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  for (const k of Object.keys(CITIES)) ports[k] = makePort(k);
  return {
    version: 12,
    time: { day: 100, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 7, state: 7 },
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

/** A seeded world, which is the state every test below starts from. */
function seeded(): WorldState {
  const w = makeWorld();
  return seedNamedShips(w, w.rng).world;
}

describe("seeding", () => {
  it("puts a handful of named hulls on the longest lanes", () => {
    const ships = namedShips(seeded());
    expect(ships.length).toBeGreaterThan(0);
    expect(ships.length).toBeLessThanOrEqual(NAMED_SHIP_COUNT);
  });

  it("gives each of them a name from her own crown's register", () => {
    for (const ship of namedShips(seeded())) {
      const pool = SHIP_NAMES[ship.crown] ?? [];
      expect(pool, `${ship.crown}: ${ship.name}`).toContain(ship.name);
    }
  });

  it("works both ends of a real lane", () => {
    for (const ship of namedShips(seeded())) {
      expect(CITIES[ship.from]).toBeDefined();
      expect(CITIES[ship.to]).toBeDefined();
      expect(laneOf(ship)).toBeDefined();
    }
  });

  it("scatters them round their circuits instead of sailing them on one tide", () => {
    const phases = namedShips(seeded()).map(s => s.progress);
    expect(new Set(phases.map(p => Math.round(p * 4))).size).toBeGreaterThan(1);
  });

  it("is deterministic for a seed, so a rumour about her is worth something", () => {
    const a = namedShips(seeded()).map(s => `${s.name}:${s.routeId}`);
    const b = namedShips(seeded()).map(s => `${s.name}:${s.routeId}`);
    expect(a).toEqual(b);
  });

  it("does not seed twice, and leaves a world that already has them alone", () => {
    const once = seeded();
    const twice = seedNamedShips(once, once.rng).world;
    expect(twice).toBe(once);
  });

  it("runs on an old save with no field at all, which is why there is no migration", () => {
    const old = makeWorld();
    expect(old.namedShips).toBeUndefined();
    expect(namedShips(old)).toEqual([]);
    expect(namedShips(seedNamedShips(old, old.rng).world).length).toBeGreaterThan(0);
  });
});

describe("the schedule", () => {
  const ship = (over: Partial<NamedShip> = {}): NamedShip => ({
    id: "named_x",
    name: "Santa Ana",
    crown: "spain",
    classId: "fluyt",
    routeId: "a__b",
    from: "havana",
    to: "cartagena",
    progress: 0,
    progressDay: 100,
    passageDays: 10,
    hullHp: 60,
    sailsHp: 50,
    ...over,
  });

  it("walks her out and back over two passages", () => {
    const s = ship();
    expect(phaseAt(s, 100)).toBeCloseTo(0, 5);
    expect(phaseAt(s, 105)).toBeCloseTo(0.5, 5);
    expect(phaseAt(s, 110)).toBeCloseTo(1, 5);
    expect(phaseAt(s, 115)).toBeCloseTo(1.5, 5);
  });

  it("wraps, so she keeps working the run for as long as the world lasts", () => {
    expect(phaseAt(ship(), 120)).toBeCloseTo(0, 5);
    expect(phaseAt(ship(), 1000)).toBeGreaterThanOrEqual(0);
    expect(phaseAt(ship(), 1000)).toBeLessThan(2);
  });

  it("knows which harbour she is standing towards", () => {
    const s = ship();
    expect(outbound(s, 103)).toBe(true);
    expect(boundFor(s, 103)).toBe("cartagena");
    expect(outbound(s, 113)).toBe(false);
    expect(boundFor(s, 113)).toBe("havana");
  });

  it("puts the same point of water on both legs, half a circuit apart", () => {
    const w = seeded();
    const s = namedShips(w)[0];
    const out = namedShipPos({ ...w, time: { ...w.time, day: w.time.day } }, { ...s, progress: 0.3, progressDay: w.time.day });
    const back = namedShipPos({ ...w, time: { ...w.time, day: w.time.day } }, { ...s, progress: 1.7, progressDay: w.time.day });
    expect(out).toBeDefined();
    expect(back!.x).toBeCloseTo(out!.x, 5);
    expect(back!.y).toBeCloseTo(out!.y, 5);
  });

  it("gives a longer lane a longer passage", () => {
    const ships = namedShips(seeded());
    for (const s of ships) {
      const lane = laneOf(s)!;
      expect(s.passageDays).toBeCloseTo(Math.max(2, Math.round(lane.length / PASSAGE_SPEED)), 5);
    }
  });
});

describe("projectOnPath", () => {
  const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];

  it("puts the ends at 0 and 1", () => {
    expect(projectOnPath(path, { x: 0, y: 0 })).toBeCloseTo(0, 5);
    expect(projectOnPath(path, { x: 100, y: 100 })).toBeCloseTo(1, 5);
  });

  it("finds the corner halfway along", () => {
    expect(projectOnPath(path, { x: 100, y: 0 })).toBeCloseTo(0.5, 5);
  });

  it("drops a point well off the course onto the nearest part of it", () => {
    // Chased two hundred units to seaward of her track: she resumes from where
    // she actually got to, not from where the ruler says she should be.
    expect(projectOnPath(path, { x: 50, y: -200 })).toBeCloseTo(0.25, 5);
  });
});

describe("on and off the chart", () => {
  function afloat(): { world: WorldState; ship: NamedShip } {
    const w = seeded();
    const ship = namedShips(w)[0];
    const pos = namedShipPos(w, ship)!;
    return { world: materializeNamed(w, ship, pos), ship };
  }

  it("puts her on the water carrying her own name", () => {
    const { world, ship } = afloat();
    const found = hullOf(world, ship.id);
    expect(found).toBeDefined();
    expect(found![1].ai?.namedShipId).toBe(ship.id);
    expect(found![1].ship?.factionId as unknown as string).toBe(ship.crown);
  });

  it("puts her on the water carrying the damage she already had", () => {
    const w = seeded();
    const hurt = { ...namedShips(w)[0], hullHp: 12, sailsHp: 9 };
    const world = materializeNamed(w, hurt, namedShipPos(w, hurt)!);
    const found = hullOf(world, hurt.id)!;
    expect(found[1].ship?.hullHp).toBe(12);
    expect(found[1].ship?.sailsHp).toBe(9);
  });

  it("writes her damage back into the record before she leaves", () => {
    const { world, ship } = afloat();
    const [id, entity] = hullOf(world, ship.id)!;
    const mauled: WorldState = {
      ...world,
      entities: { ...world.entities, [id]: { ...entity, ship: { ...entity.ship!, hullHp: 5, sailsHp: 3 } } },
    };
    const after = writeBackNamed(mauled, ship);
    const record = namedShipById(after, ship.id)!;
    expect(record.hullHp).toBe(5);
    expect(record.sailsHp).toBe(3);
  });

  it("writes back where she actually got to, so she does not jump on her return", () => {
    const { world, ship } = afloat();
    const lane = laneOf(ship)!;
    const [id, entity] = hullOf(world, ship.id)!;
    // Move her a long way along her own course by hand.
    const ahead = lane.path[lane.path.length - 1];
    const moved: WorldState = { ...world, entities: { ...world.entities, [id]: { ...entity, pos: ahead } } };
    const after = writeBackNamed(moved, ship);
    const record = namedShipById(after, ship.id)!;
    expect(record.progressDay).toBe(world.time.day);
    expect(record.progress).toBeGreaterThan(ship.progress);
  });

  it("takes her off again without touching the record", () => {
    const { world, ship } = afloat();
    const gone = dematerializeNamed(world, ship.id);
    expect(hullOf(gone, ship.id)).toBeUndefined();
    expect(namedShipById(gone, ship.id)).toBeDefined();
  });
});

describe("the end of her", () => {
  it("marks her sunk and stamps the flag whatever is hunting her hangs off", () => {
    const w = seeded();
    const ship = namedShips(w)[0];
    const afloat = materializeNamed(w, ship, namedShipPos(w, ship)!);
    const [, entity] = hullOf(afloat, ship.id)!;
    const after = settleNamedShip(afloat, entity, "sunk");
    expect(namedShipById(after, ship.id)!.fate).toBe("sunk");
    expect(after.worldFlags[namedShipFateFlag(ship.id)]).toBe(true);
  });

  it("does the same for a ship that struck her colours", () => {
    const w = seeded();
    const ship = namedShips(w)[0];
    const afloat = materializeNamed(w, ship, namedShipPos(w, ship)!);
    const [, entity] = hullOf(afloat, ship.id)!;
    expect(namedShipById(settleNamedShip(afloat, entity, "taken"), ship.id)!.fate).toBe("taken");
  });

  it("leaves every ordinary hull alone, which is why the call site is one line", () => {
    const w = seeded();
    const anonymous = { id: entityId("npc_1"), kind: "ship", ai: { behavior: "trader" } } as never;
    expect(settleNamedShip(w, anonymous, "sunk")).toBe(w);
    expect(settleNamedShip(w, undefined, "sunk")).toBe(w);
  });

  it("drops her out of the living list and never resurrects her", () => {
    const w = seeded();
    const ship = namedShips(w)[0];
    const afloat = materializeNamed(w, ship, namedShipPos(w, ship)!);
    const [, entity] = hullOf(afloat, ship.id)!;
    const sunk = settleNamedShip(afloat, entity, "sunk");
    expect(livingNamedShips(sunk).map(s => s.id)).not.toContain(ship.id);
    // A second settle is a no-op: she cannot be sunk twice for two rewards.
    const again = settleNamedShip(sunk, entity, "taken");
    expect(namedShipById(again, ship.id)!.fate).toBe("sunk");
  });
});

// ===========================================================================
// The informer's third commission
// ===========================================================================

describe("the hunt commission", () => {
  /** A tavern in a town of a crown none of the named ships belongs to. */
  function tavernAgainst(world: WorldState): string | undefined {
    const crowns = new Set(namedShips(world).map(s => s.crown));
    for (const ship of namedShips(world)) {
      const lane = laneOf(ship);
      if (!lane) continue;
      for (const key of Object.keys(CITIES)) {
        const crown = CITIES[key].factionId as unknown as string;
        if (crown === ship.crown || !crowns.has(ship.crown)) continue;
        const pos = namedShipPos(world, ship);
        if (!pos) continue;
        const here = CITIES[key].pos;
        if (Math.hypot(pos.x - here.x, pos.y - here.y) < 700) return key;
      }
    }
    return undefined;
  }

  it("offers somebody else's ship, never the local crown's", () => {
    const w = seeded();
    for (const key of Object.keys(CITIES)) {
      const offer = huntOffer(w, key);
      if (!offer) continue;
      expect(offer.crown, key).not.toBe(CITIES[key].factionId as unknown as string);
    }
  });

  it("finds at least one tavern in the Caribbean with a name on the table", () => {
    const w = seeded();
    const offers = Object.keys(CITIES).map(k => huntOffer(w, k)).filter(Boolean);
    expect(offers.length).toBeGreaterThan(0);
  });

  it("prices her by her tonnage", () => {
    const w = seeded();
    const offers = Object.keys(CITIES).map(k => huntOffer(w, k)).filter(Boolean);
    for (const offer of offers) {
      expect(offer!.reward).toBeGreaterThan(400);
      expect(offer!.reward).toBeLessThan(4000);
    }
  });

  it("takes the job and stops offering another", () => {
    const w = seeded();
    const key = tavernAgainst(w);
    expect(key, "no tavern within reach of a foreign named ship").toBeDefined();
    const offer = huntOffer(w, key!)!;
    expect(offer).toBeDefined();
    const after = acceptHunt(w, offer).world;
    expect(activeHunts(after)).toHaveLength(MAX_ACTIVE_HUNTS);
    expect(huntOffer(after, key!)).toBeNull();
  });

  it("refuses a ship somebody has already dealt with", () => {
    const w = seeded();
    const key = tavernAgainst(w)!;
    const offer = huntOffer(w, key)!;
    const gone: WorldState = {
      ...w,
      namedShips: namedShips(w).map(s => s.id === offer.shipId ? { ...s, fate: "sunk" as const } : s),
    };
    expect(acceptHunt(gone, offer).error).toBe("informer.already_gone");
  });

  it("pays off the flag her loss stamps", () => {
    const w = seeded();
    const key = tavernAgainst(w)!;
    const offer = huntOffer(w, key)!;
    const quest = huntQuest(offer);
    const trigger = quest.stages.hunt.on?.[0].trigger as { type: string; key: string };
    expect(trigger.type).toBe("flag_set");
    expect(trigger.key).toBe(namedShipFateFlag(offer.shipId));
  });

  it("is rebuilt from its own data on every load, clock and all", () => {
    const w = seeded();
    const key = tavernAgainst(w)!;
    const offer = huntOffer(w, key)!;
    const after = acceptHunt(w, offer).world;
    const registry = buildQuestRegistry(after);
    expect(registry[huntQuestId(offer.shipId)]).toBeDefined();
    // A definition that read today's clock would hand itself another forty days.
    const later = buildQuestRegistry({ ...after, time: { ...after.time, day: after.time.day + 300 } });
    expect(JSON.stringify(later[offer.id])).toBe(JSON.stringify(registry[offer.id]));
  });

  it("uses a quest id nothing else can collide with", () => {
    expect(huntQuestId("named_0")).toBe(HUNT_QUEST_PREFIX + "named_0");
  });
});

describe("the words for it exist in both languages", () => {
  it("has every string the tavern and the quest log print", () => {
    for (const key of [
      "informer.hunt_offer", "informer.hunt_in_hand", "informer.hunt_taken",
      "informer.hunt_hint", "informer.already_gone",
      "quest.hunt_title", "quest.hunt_find", "quest.hunt_paid", "quest.hunt_cold",
      "tavern.rumor_named",
    ]) {
      expect(EN[key], key).toBeTruthy();
      expect(PL[key], key).toBeTruthy();
    }
  });
});

describe("sinking her actually pays", () => {
  /**
   * The one thing unit-testing the pieces cannot show, and the easiest wiring
   * in this codebase to get wrong: **the quest machine only ever hears about a
   * flag when somebody hands it a `flag_set`.** `settleNamedShip` stamps the
   * flag; without an `advanceQuests` call the commission would sit there with
   * its condition met and never pay a penny.
   *
   * This walks the exact sequence `SeaBattleScene.settleNamed` runs.
   */
  it("walks the whole path from her going down to the gold arriving", () => {
    const w = seeded();
    // A tavern of a crown that is not hers.
    const key = Object.keys(CITIES).find(k => huntOffer(w, k) !== null)!;
    const offer = huntOffer(w, key)!;
    const signed = acceptHunt(w, offer).world;
    const goldBefore = signed.player.gold;

    // She is on the water, and she goes down.
    const ship = namedShipById(signed, offer.shipId)!;
    const afloat = materializeNamed(signed, ship, namedShipPos(signed, ship)!);
    const [, entity] = hullOf(afloat, ship.id)!;
    const settled = settleNamedShip(afloat, entity, "sunk");

    // The messenger.
    const advanced = advanceQuests(
      settled,
      { type: "flag_set", key: namedShipFateFlag(ship.id) },
      buildQuestRegistry(settled),
    );

    expect(advanced.advanced.length).toBeGreaterThan(0);
    expect(advanced.world.player.gold).toBe(goldBefore + offer.reward);
    expect(activeHunts(advanced.world)).toHaveLength(0);
  });

  it("costs him standing with her crown and buys him a name among the brethren", () => {
    const w = seeded();
    const key = Object.keys(CITIES).find(k => huntOffer(w, k) !== null)!;
    const offer = huntOffer(w, key)!;
    const signed = acceptHunt(w, offer).world;
    const repBefore = signed.player.reputation[offer.crown] ?? 0;
    const notorietyBefore = signed.player.notoriety;

    const ship = namedShipById(signed, offer.shipId)!;
    const afloat = materializeNamed(signed, ship, namedShipPos(signed, ship)!);
    const [, entity] = hullOf(afloat, ship.id)!;
    const settled = settleNamedShip(afloat, entity, "taken");
    const paid = advanceQuests(
      settled,
      { type: "flag_set", key: namedShipFateFlag(ship.id) },
      buildQuestRegistry(settled),
    ).world;

    expect(paid.player.reputation[offer.crown]).toBeLessThan(repBefore);
    expect(paid.player.notoriety).toBeGreaterThan(notorietyBefore);
  });

  it("pays the same for taking her as for sinking her — the house is not particular", () => {
    function run(fate: "sunk" | "taken"): number {
      const w = seeded();
      const key = Object.keys(CITIES).find(k => huntOffer(w, k) !== null)!;
      const offer = huntOffer(w, key)!;
      const signed = acceptHunt(w, offer).world;
      const ship = namedShipById(signed, offer.shipId)!;
      const afloat = materializeNamed(signed, ship, namedShipPos(signed, ship)!);
      const [, entity] = hullOf(afloat, ship.id)!;
      const settled = settleNamedShip(afloat, entity, fate);
      return advanceQuests(
        settled,
        { type: "flag_set", key: namedShipFateFlag(ship.id) },
        buildQuestRegistry(settled),
      ).world.player.gold;
    }
    expect(run("sunk")).toBe(run("taken"));
  });
});
