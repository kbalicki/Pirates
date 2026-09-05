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
  escortCount,
  escortsOf,
  reportNamedShip,
  namedReports,
  livingReports,
  reckonedPos,
  reportedLane,
  harryNamedShip,
  harryCount,
  answerHarrying,
  layingOver,
  lyingAt,
  arrivalDay,
  tickNamedShips,
  boltFor,
  makeShelter,
  SHELTER_RANGE,
  SHELTER_LAYOVER,
  ESCORT_MAX,
  LAYOVER_PER_SCARE,
  LAYOVER_MAX,
  REROUTE_AFTER_SCARES,
  REPORT_LIFE_DAYS,
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
import { tradeRoutes } from "../TradeRouteSystem.ts";
import { updateNpcAi, bestVmgHeading } from "../NpcAiSystem.ts";
import { windSpeedModifier } from "../WeatherSystem.ts";
import { getPortWaterPos } from "../PortWaterPositions.ts";
import { rumorsAt } from "../RumorSystem.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
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
    escorts: 0,
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

  it("prices her by her tonnage and by what sails with her", () => {
    const w = seeded();
    const offers = Object.keys(CITIES).map(k => huntOffer(w, k)).filter(Boolean);
    expect(offers.length).toBeGreaterThan(0);
    for (const offer of offers) {
      expect(offer!.reward).toBeGreaterThan(400);
      const ship = namedShipById(w, offer!.shipId)!;
      const tonnage = SHIP_CLASSES[ship.classId]!.tonnage;
      // The convoy is what the house is really paying to get past: the same
      // tonnage with two escorts is worth twice the same tonnage alone.
      const alone = 400 + 3.2 * tonnage;
      expect(offer!.reward).toBeCloseTo(alone * (1 + 0.5 * escortCount(ship)), 0);
      expect(offer!.escorts).toBe(escortCount(ship));
    }
  });

  it("pays more for a ship in company than for the same ship alone", () => {
    const w = seeded();
    const key = Object.keys(CITIES).find(k => huntOffer(w, k) !== null)!;
    const offer = huntOffer(w, key)!;
    // Only her in the world, or `huntOffer` picks whichever ship pays best and
    // stripping one changes which ship that is.
    const her = namedShips(w).filter(s => s.id === offer.shipId);
    const withConvoy = huntOffer({ ...w, namedShips: her }, key)!;
    const alone = huntOffer({ ...w, namedShips: her.map(s => ({ ...s, escorts: 0 })) }, key)!;
    expect(alone.escorts).toBe(0);
    if (withConvoy.escorts > 0) expect(withConvoy.reward).toBeGreaterThan(alone.reward);
    else expect(withConvoy.reward).toBe(alone.reward);
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

// ===========================================================================
// What he has been told, and what sails with her (v0.33.0)
// ===========================================================================

describe("sightings", () => {
  /**
   * A report is a *memory of a moment*, not her position, and the whole
   * interest of a hunt is the arithmetic between the moment and today. If the
   * chart ever drew her live, an interception would become following an arrow.
   */
  it("writes down the phase she was at on the day he was told", () => {
    const w = seeded();
    const ship = namedShips(w)[0];
    const after = reportNamedShip(w, ship.id);
    const report = namedReports(after)[ship.id];
    expect(report.day).toBe(w.time.day);
    expect(report.progress).toBeCloseTo(phaseAt(ship, w.time.day), 5);
  });

  it("agrees with her exactly while nothing has interfered with her", () => {
    const w = seeded();
    const ship = namedShips(w)[0];
    const told = reportNamedShip(w, ship.id);
    for (const later of [0, 3, 9]) {
      const day = { ...told, time: { ...told.time, day: told.time.day + later } };
      const reckoned = reckonedPos(day, ship, namedReports(told)[ship.id])!;
      const truth = namedShipPos(day, ship)!;
      expect(reckoned.x, `day +${later}`).toBeCloseTo(truth.x, 3);
      expect(reckoned.y, `day +${later}`).toBeCloseTo(truth.y, 3);
    }
  });

  it("goes stale, because at three weeks she could be anywhere on the circuit", () => {
    const w = seeded();
    const ship = namedShips(w)[0];
    const told = reportNamedShip(w, ship.id);
    const fresh = { ...told, time: { ...told.time, day: told.time.day + REPORT_LIFE_DAYS } };
    const stale = { ...told, time: { ...told.time, day: told.time.day + REPORT_LIFE_DAYS + 1 } };
    expect(livingReports(fresh).map(r => r.ship.id)).toContain(ship.id);
    expect(livingReports(stale).map(r => r.ship.id)).not.toContain(ship.id);
  });

  it("is dropped when she is, so no mark stands over a ship on the bottom", () => {
    const w = seeded();
    const ship = namedShips(w)[0];
    const told = reportNamedShip(w, ship.id);
    const afloat = materializeNamed(told, ship, namedShipPos(told, ship)!);
    const [, entity] = hullOf(afloat, ship.id)!;
    const sunk = settleNamedShip(afloat, entity, "sunk");
    expect(namedReports(sunk)[ship.id]).toBeUndefined();
    expect(livingReports(sunk)).toEqual([]);
  });

  it("says nothing about a ship nobody has mentioned", () => {
    expect(livingReports(seeded())).toEqual([]);
  });

  it("comes with the commission, because the informer is selling her schedule", () => {
    const w = seeded();
    const key = Object.keys(CITIES).find(k => huntOffer(w, k) !== null)!;
    const offer = huntOffer(w, key)!;
    const signed = acceptHunt(w, offer).world;
    expect(namedReports(signed)[offer.shipId]).toBeDefined();
  });

  it("carries her id in the rumour, so reading it can write it down", () => {
    const w = seeded();
    // A day on which some tavern has her departure to report.
    let found: { key: string; vars: Record<string, string | number> } | null = null;
    outer: for (let d = 0; d < 40 && !found; d++) {
      const day = { ...w, time: { ...w.time, day: w.time.day + d } };
      for (const key of Object.keys(CITIES)) {
        const said = rumorsAt(day, key).find(r => r.key === "tavern.rumor_named");
        if (said?.vars) { found = { key, vars: said.vars }; break outer; }
      }
    }
    expect(found, "no tavern reported a named ship inside forty days").not.toBeNull();
    expect(typeof found!.vars.shipId).toBe("string");
    expect(namedShipById(w, found!.vars.shipId as string)).toBeDefined();
  });
});

describe("the convoy", () => {
  it("gives the richest hulls company and the cheapest none", () => {
    const w = seeded();
    for (const ship of namedShips(w)) {
      if (ship.classId === "fluyt") expect(escortCount(ship)).toBe(0);
      if (ship.classId === "galleon") expect(escortCount(ship)).toBe(2);
      if (ship.classId === "merchantman") expect(escortCount(ship)).toBe(1);
    }
  });

  it("reads a v0.32.0 save with no convoys as sailing alone", () => {
    const ship = { ...namedShips(seeded())[0] };
    delete (ship as { escorts?: number }).escorts;
    expect(escortCount(ship)).toBe(0);
  });

  it("puts her escorts on the water with her, under her crown", () => {
    const w = seeded();
    const ship = namedShips(w).find(s => escortCount(s) > 0);
    expect(ship, "no seeded ship carries a convoy").toBeDefined();
    const afloat = materializeNamed(w, ship!, namedShipPos(w, ship!)!);
    const escorts = escortsOf(afloat, ship!.id);
    expect(escorts).toHaveLength(escortCount(ship!));
    for (const [, e] of escorts) {
      expect(e.ship?.factionId as unknown as string).toBe(ship!.crown);
      // A warship on convoy duty, not a trader: it closes on whoever closes.
      expect(e.ai?.behavior).toBe("navy");
    }
  });

  it("counts what is left rather than subtracting what was lost", () => {
    const w = seeded();
    const ship = namedShips(w).find(s => escortCount(s) > 1)!;
    const afloat = materializeNamed(w, ship, namedShipPos(w, ship)!);
    // Sink one of them, the way a battle does: the entity simply stops existing.
    const [firstId] = escortsOf(afloat, ship.id)[0];
    const entities = { ...afloat.entities };
    delete entities[firstId];
    const after = writeBackNamed({ ...afloat, entities }, ship);
    expect(escortCount(namedShipById(after, ship.id)!)).toBe(escortCount(ship) - 1);
  });

  it("takes the whole convoy off the chart with her", () => {
    const w = seeded();
    const ship = namedShips(w).find(s => escortCount(s) > 0)!;
    const afloat = materializeNamed(w, ship, namedShipPos(w, ship)!);
    const gone = dematerializeNamed(afloat, ship.id);
    expect(hullOf(gone, ship.id)).toBeUndefined();
    expect(escortsOf(gone, ship.id)).toEqual([]);
  });
});

// ===========================================================================
// She finds out (v0.34.0)
// ===========================================================================

/**
 * Through v0.33.0 nothing that happened to her changed anything about her. A
 * captain who fought her convoy and broke off found her a week later exactly
 * where his chart said, which quietly made the reckoning a tracker after all:
 * the world contained nothing capable of contradicting it.
 *
 * Everything below is about one thing being true — a fight she survives is
 * remembered, and she answers it **in harbour**, out of the player's sight —
 * and one thing staying true: a world nobody is hunting in ticks exactly as it
 * did before, because the harbour call does nothing at all to an untroubled
 * record.
 */

/** A hull on the water carrying a name, the way a battle sees one. */
function hullFor(shipId: string) {
  return {
    id: entityId("h"),
    kind: "ship" as const,
    mode: "sailing" as const,
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    heading: 0,
    sailLevel: 1,
    depthOffset: 0,
    ai: { behavior: "trader" as const, state: "travel" as const, namedShipId: shipId },
  };
}

function escortFor(shipId: string) {
  const e = hullFor(shipId);
  return { ...e, ai: { ...e.ai, namedShipId: undefined, namedEscortOf: shipId } };
}

describe("a fight she lives through", () => {
  it("is remembered when the player breaks off", () => {
    const w = seeded();
    const ship = namedShips(w)[0];
    const after = harryNamedShip(w, hullFor(ship.id) as never, true);
    expect(harryCount(namedShipById(after, ship.id)!)).toBe(1);
  });

  it("counts nothing off her own hull when she did not live through it", () => {
    // The bottom is `settleNamedShip`'s business; the two are exclusive.
    const w = seeded();
    const ship = namedShips(w)[0];
    expect(harryNamedShip(w, hullFor(ship.id) as never, false)).toBe(w);
  });

  it("counts off one of her escorts whoever won", () => {
    const w = seeded();
    const ship = namedShips(w).find(s => escortCount(s) > 0)!;
    const won = harryNamedShip(w, escortFor(ship.id) as never, false);
    expect(harryCount(namedShipById(won, ship.id)!)).toBe(1);
  });

  it("leaves a world with an anonymous hull in it exactly as it was", () => {
    const w = seeded();
    const anonymous = { ...hullFor("x"), ai: { behavior: "trader" as const, state: "travel" as const } };
    expect(harryNamedShip(w, anonymous as never, true)).toBe(w);
    expect(harryNamedShip(w, undefined, true)).toBe(w);
  });

  it("reads a v0.33.0 record, which has no such field, as untroubled", () => {
    const ship = { ...namedShips(seeded())[0] };
    delete (ship as { harried?: number }).harried;
    expect(harryCount(ship)).toBe(0);
  });
});

describe("lying alongside", () => {
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
    escorts: 0,
    ...over,
  });

  it("stops her clock while her sailing day is still ahead", () => {
    const held = ship({ progress: 1, progressDay: 106 });
    expect(layingOver(held, 103)).toBe(true);
    expect(phaseAt(held, 103)).toBeCloseTo(1, 5);
    expect(phaseAt(held, 106)).toBeCloseTo(1, 5);
    // ...and starts it again on the day, not before and not twice.
    expect(phaseAt(held, 111)).toBeCloseTo(1.5, 5);
  });

  it("says which harbour she is lying in, and nothing when she is at sea", () => {
    expect(lyingAt(ship({ progress: 1, progressDay: 106 }), 103)).toBe("cartagena");
    expect(lyingAt(ship({ progress: 0, progressDay: 106 }), 103)).toBe("havana");
    expect(lyingAt(ship(), 103)).toBeUndefined();
  });

  it("puts her arrival at the end of the leg she is on", () => {
    expect(arrivalDay(ship())).toBeCloseTo(110, 5);
    expect(arrivalDay(ship({ progress: 0.5 }))).toBeCloseTo(105, 5);
    expect(arrivalDay(ship({ progress: 1.25 }))).toBeCloseTo(107.5, 5);
  });
});

describe("what she does about it", () => {
  function quarry(over: Partial<NamedShip> = {}): { world: WorldState; ship: NamedShip } {
    const w = seeded();
    const base = namedShips(w)[0];
    return { world: w, ship: { ...base, ...over } };
  }

  it("does nothing whatever to a ship nobody has troubled", () => {
    const { world, ship } = quarry();
    const answered = answerHarrying(ship, 110, world.rng);
    expect(answered.ship).toBe(ship);
    expect(answered.rng).toBe(world.rng);
  });

  it("sails late, by two days for every scare she is carrying", () => {
    const { world, ship } = quarry({ progress: 0.4, harried: 1 });
    const one = answerHarrying(ship, 110, world.rng).ship;
    expect(one.progressDay).toBeCloseTo(110 + LAYOVER_PER_SCARE, 5);
    expect(layingOver(one, 110)).toBe(true);

    const three = answerHarrying({ ...ship, harried: 3 }, 110, world.rng).ship;
    expect(three.progressDay).toBeCloseTo(110 + 3 * LAYOVER_PER_SCARE, 5);
  });

  it("will not lie alongside for ever, whatever he does to her", () => {
    const { world, ship } = quarry({ harried: 40 });
    const answered = answerHarrying(ship, 110, world.rng).ship;
    expect(answered.progressDay - 110).toBeCloseTo(LAYOVER_MAX, 5);
  });

  it("resumes from the harbour she actually made, not from the one she left", () => {
    const { world, ship } = quarry({ progress: 0.6, harried: 1 });
    expect(answerHarrying(ship, 110, world.rng).ship.progress).toBeCloseTo(1, 5);
    const home = answerHarrying({ ...ship, progress: 1.6 }, 110, world.rng).ship;
    expect(home.progress).toBeCloseTo(0, 5);
  });

  it("takes on a consort, up to the ceiling and no further", () => {
    const { world, ship } = quarry({ escorts: 0, harried: 1 });
    expect(escortCount(answerHarrying(ship, 110, world.rng).ship)).toBe(1);
    const full = answerHarrying({ ...ship, escorts: ESCORT_MAX }, 110, world.rng).ship;
    expect(escortCount(full)).toBe(ESCORT_MAX);
  });

  it("spends the scares, so answering twice costs him a second engagement", () => {
    const { world, ship } = quarry({ harried: 2 });
    expect(harryCount(answerHarrying(ship, 110, world.rng).ship)).toBe(0);
  });

  it("keeps her run after one scare and changes it after two", () => {
    // Out of a harbour that has somewhere else to send her — most do, and the
    // ones that do not keep her, which reads correctly.
    const w = seeded();
    const ship = namedShips(w).find(s =>
      tradeRoutes().some(r => r.from === s.to && r.id !== s.routeId))!;
    expect(ship, "no seeded ship makes a port with a second lane out of it").toBeDefined();

    const once = answerHarrying({ ...ship, progress: 0.9, harried: 1 }, 110, w.rng).ship;
    expect(once.routeId).toBe(ship.routeId);

    const twice = answerHarrying({ ...ship, progress: 0.9, harried: REROUTE_AFTER_SCARES }, 110, w.rng).ship;
    expect(twice.routeId).not.toBe(ship.routeId);
    // A new lane is walked from its own beginning, and its beginning is the
    // harbour she is lying in.
    expect(twice.from).toBe(ship.to);
    expect(twice.progress).toBeCloseTo(0, 5);
    expect(laneOf(twice)).toBeDefined();
    expect(twice.passageDays).toBeGreaterThanOrEqual(2);
  });
});

describe("the harbour call, on the tick", () => {
  /** One crossing of the named-ship interval, which is what the engine does. */
  function beat(world: WorldState): WorldState {
    return tickNamedShips({ ...world, time: { ...world.time, tick: 40 } }, 1).world;
  }

  it("leaves a world nobody is hunting in exactly where v0.33.0 left it", () => {
    const w = seeded();
    const before = JSON.stringify(namedShips(w));
    expect(JSON.stringify(namedShips(beat(w)))).toBe(before);
  });

  it("ties her up when she makes harbour with a fight behind her", () => {
    const w = seeded();
    const ship = namedShips(w)[0];
    const scared = { ...ship, progress: 0, progressDay: w.time.day - ship.passageDays, harried: 1 };
    const after = beat({ ...w, namedShips: namedShips(w).map(s => s.id === ship.id ? scared : s) });

    const now = namedShipById(after, ship.id)!;
    expect(layingOver(now, after.time.day)).toBe(true);
    expect(harryCount(now)).toBe(0);
    expect(escortCount(now)).toBe(escortCount(ship) + (escortCount(ship) < ESCORT_MAX ? 1 : 0));
  });

  it("does not put a ship that is alongside on the water, however close he is", () => {
    const w = seeded();
    const ship = namedShips(w)[0];
    const at = namedShipPos(w, ship)!;
    const held = { ...ship, progress: 1, progressDay: w.time.day + 4 };
    const after = beat({
      ...w,
      namedShips: namedShips(w).map(s => s.id === ship.id ? held : s),
      player: { ...w.player, location: { type: "sea", pos: { ...at } } },
    } as WorldState);
    expect(hullOf(after, ship.id)).toBeUndefined();
  });
});

describe("the chart is allowed to be wrong", () => {
  it("remembers which run the report was about", () => {
    const w = seeded();
    const ship = namedShips(w)[0];
    const told = reportNamedShip(w, ship.id);
    const report = namedReports(told)[ship.id];
    expect(report.routeId).toBe(ship.routeId);
    expect(report.passageDays).toBe(ship.passageDays);
  });

  it("goes on drawing the run he was told about after she has changed hers", () => {
    const w = seeded();
    const ship = namedShips(w).find(s =>
      tradeRoutes().some(r => r.from === s.to && r.id !== s.routeId))!;
    const told = reportNamedShip(w, ship.id);
    const report = namedReports(told)[ship.id];

    const moved = answerHarrying({ ...ship, progress: 0.9, harried: REROUTE_AFTER_SCARES }, w.time.day, w.rng).ship;
    expect(reportedLane(moved, report)!.id).toBe(ship.routeId);
    expect(reportedLane(moved, report)!.id).not.toBe(laneOf(moved)!.id);
  });

  it("falls back on her present run for a v0.33.0 report, which is what it meant", () => {
    const w = seeded();
    const ship = namedShips(w)[0];
    expect(reportedLane(ship, { day: w.time.day, progress: 0.2 })!.id).toBe(ship.routeId);
  });

  it("does not walk the mark out of a harbour she is still tied up in", () => {
    const w = seeded();
    const ship = namedShips(w)[0];
    const held = { ...ship, progress: 1, progressDay: w.time.day + 5 };
    const told = reportNamedShip({ ...w, namedShips: [held] }, ship.id);
    const report = namedReports(told)[ship.id];
    expect(report.holdUntil).toBeCloseTo(w.time.day + 5, 5);

    const twoDaysOn = { ...told, time: { ...told.time, day: w.time.day + 2 } };
    const then = reckonedPos(twoDaysOn, held, report)!;
    const now = reckonedPos(told, held, report)!;
    expect(then.x).toBeCloseTo(now.x, 5);
    expect(then.y).toBeCloseTo(now.y, 5);
  });
});

describe("the tavern is the counter-play", () => {
  it("says she is still lying there, and carries her id so it can be written down", () => {
    const w = seeded();
    const ship = namedShips(w)[0];
    const held = { ...ship, progress: 1, progressDay: w.time.day + 4 };
    const world = { ...w, namedShips: namedShips(w).map(s => s.id === ship.id ? held : s) };

    const said = rumorsAt(world, ship.to);
    const line = said.find(r => r.key === "tavern.rumor_named_held");
    expect(line, "the town she is lying in says nothing about her").toBeDefined();
    expect(line!.vars!.shipId).toBe(ship.id);
    // ...and does not also claim she has just sailed.
    expect(said.some(r => r.key === "tavern.rumor_named")).toBe(false);
  });

  it("has that line in both languages", () => {
    expect(EN["tavern.rumor_named_held"]).toBeDefined();
    expect(PL["tavern.rumor_named_held"]).toBeDefined();
  });
});

// ===========================================================================
// She runs (v0.35.0)
// ===========================================================================

/**
 * v0.34.0 gave her an answer she could only give in harbour. Met at sea she
 * still stood on, straight at whatever was closing, because a named
 * merchantman is a `trader` hull and a trader steers at its destination.
 *
 * Two things are under test here and they are different in kind. One is
 * arithmetic — `bestVmgHeading` is the whole chase and either it beats steering
 * straight at the harbour or the mechanic is decoration. The other is
 * bookkeeping — she runs for one of her **own two ends**, so a chase can never
 * leave her record out of step with her, and getting in stamps an arrival her
 * schedule already knew about.
 */

/** The player's own hull, as the AI sees it. */
function playerHull(pos: { x: number; y: number }, faction = "england") {
  return {
    id: entityId("player_ship"),
    kind: "ship" as const,
    mode: "sailing" as const,
    pos,
    vel: { x: 0, y: 0 },
    heading: 0,
    sailLevel: 1,
    depthOffset: 0,
    ship: {
      classId: "sloop",
      factionId: faction,
      hullHp: 100, hullMax: 100, sailsHp: 60, sailsMax: 60,
      cannons: 8, cargo: {}, cargoCap: 40,
      crew: { current: 40, max: 60, morale: 0.8 },
    },
  };
}

/** Enough ticks that every hull's staggered AI slot has come round. */
function runAi(world: WorldState, ticks = 45): WorldState {
  let w = world;
  for (let i = 0; i < ticks; i++) {
    w = updateNpcAi({ ...w, time: { ...w.time, tick: w.time.tick + 1 } }, 1);
  }
  return w;
}

/** Her afloat, the player where you put him, and nothing else in the way. */
function chase(over: { faction?: string; harried?: number; playerAt?: { x: number; y: number } } = {}) {
  const w = seeded();
  const ship = { ...namedShips(w)[0], harried: over.harried ?? 0 };
  const at = namedShipPos(w, ship)!;
  const playerAt = over.playerAt ?? { x: at.x + 60, y: at.y + 60 };
  const withShip = materializeNamed(
    { ...w, namedShips: namedShips(w).map(x => x.id === ship.id ? ship : x) },
    ship,
    at,
  );
  const world: WorldState = {
    ...withShip,
    player: { ...withShip.player, location: { type: "sea", pos: playerAt } },
    entities: {
      ...withShip.entities,
      [withShip.player.shipId as string]: playerHull(playerAt, over.faction ?? "england") as never,
    },
  };
  return { world, ship, at };
}

describe("the best point of sail", () => {
  const N = 0;                    // wind from/along -y in this model's terms
  const E = Math.PI / 2;

  it("steers straight at it when there is no wind to think about", () => {
    // Strength 0 flattens the polar to 1.0 everywhere, so the only term left is
    // how much of the heading points where she wants: the bearing itself.
    const want = 1.1;
    const got = bestVmgHeading(want, N, 0, 30);
    expect(Math.abs(got - want)).toBeLessThan(Math.PI / 18 + 1e-9);
  });

  it("never points a square rig into her own dead zone", () => {
    // Asked for a bearing dead to windward with a 60° dead zone, she has to
    // come back with something she can actually sail.
    const got = bestVmgHeading(N, N, 1, 60);
    const off = Math.abs(Math.atan2(Math.sin(got - N), Math.cos(got - N))) * (180 / Math.PI);
    expect(off).toBeGreaterThanOrEqual(60);
    expect(windSpeedModifier(got, N, 1, 60)).toBeGreaterThan(0);
  });

  it("beats steering straight at the harbour, which is the whole mechanic", () => {
    for (const dead of [30, 55, 60]) {
      for (const want of [0, 0.7, 2.2, 4.4]) {
        const got = bestVmgHeading(want, E, 1, dead);
        const madeGood = (h: number) => windSpeedModifier(h, E, 1, dead) * Math.cos(h - want);
        expect(madeGood(got), `dead ${dead}, bearing ${want}`).toBeGreaterThanOrEqual(madeGood(want) - 1e-9);
      }
    }
  });

  it("still returns a heading when every course loses ground", () => {
    expect(Number.isFinite(bestVmgHeading(N, N, 1, 179))).toBe(true);
  });
});

describe("which way she bolts", () => {
  it("runs for the end she has the better head start to", () => {
    const w = seeded();
    const ship = namedShips(w)[0];
    const lane = laneOf(ship)!;
    const from = lane.path[0];
    const to = lane.path[lane.path.length - 1];

    // Sitting on top of the `from` end with him far away past `to`.
    expect(boltFor(ship, from, { x: to.x, y: to.y })).toBe("from");
    expect(boltFor(ship, to, { x: from.x, y: from.y })).toBe("to");
  });

  it("is pushed onto the long passage by a player who cuts off the near one", () => {
    const w = seeded();
    const ship = namedShips(w)[0];
    const lane = laneOf(ship)!;
    const from = lane.path[0];
    const to = lane.path[lane.path.length - 1];
    // Just short of `to`, but he is sitting in the mouth of it.
    const her = { x: to.x + (from.x - to.x) * 0.15, y: to.y + (from.y - to.y) * 0.15 };
    expect(boltFor(ship, her, to)).toBe("from");
  });

  it("says nothing when her lane has gone out of the network", () => {
    const ship = { ...namedShips(seeded())[0], routeId: "nowhere__nowhere" };
    expect(boltFor(ship, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeUndefined();
  });
});

describe("getting in", () => {
  it("stamps the arrival at the end she actually ran for", () => {
    const w = seeded();
    const ship = namedShips(w)[0];
    expect(makeShelter(w, ship, "to", w.rng).world.namedShips!.find(s => s.id === ship.id)!.progress)
      .toBeCloseTo(1, 5);
    expect(makeShelter(w, ship, "from", w.rng).world.namedShips!.find(s => s.id === ship.id)!.progress)
      .toBeCloseTo(0, 5);
  });

  it("keeps her in for a couple of days, without teaching her anything", () => {
    const w = seeded();
    const ship = namedShips(w)[0];
    const after = makeShelter(w, ship, "to", w.rng).world;
    const now = namedShipById(after, ship.id)!;
    expect(now.progressDay).toBeCloseTo(w.time.day + SHELTER_LAYOVER, 5);
    expect(layingOver(now, w.time.day)).toBe(true);
    // A chase she won is not a scare: no consort, no new run.
    expect(escortCount(now)).toBe(escortCount(ship));
    expect(now.routeId).toBe(ship.routeId);
  });

  it("answers the scares she was already carrying, at the right harbour", () => {
    const w = seeded();
    const ship = { ...namedShips(w)[0], harried: 1, escorts: 0 };
    const after = makeShelter(w, ship, "to", w.rng).world;
    const now = namedShipById(after, ship.id)!;
    expect(now.progress).toBeCloseTo(1, 5);           // `to`, not flipped to `from`
    expect(now.progressDay).toBeCloseTo(w.time.day + LAYOVER_PER_SCARE, 5);
    expect(escortCount(now)).toBe(1);
    expect(harryCount(now)).toBe(0);
  });

  it("takes her and her convoy off the chart", () => {
    const w = seeded();
    const ship = namedShips(w).find(s => escortCount(s) > 0)!;
    const afloat = materializeNamed(w, ship, namedShipPos(w, ship)!);
    const after = makeShelter(afloat, ship, "to", afloat.rng).world;
    expect(hullOf(after, ship.id)).toBeUndefined();
    expect(escortsOf(after, ship.id)).toEqual([]);
  });
});

describe("she runs", () => {
  it("bolts from a pirate, under everything she has, for one of her own ends", () => {
    const { world, ship } = chase({ faction: "pirates" });
    const after = runAi(world);
    const hull = hullOf(after, ship.id)!;
    expect(hull[1].ai?.state).toBe("flee");
    expect(hull[1].sailLevel).toBe(1);
    expect([ship.from, ship.to]).toContain(hull[1].ai?.targetPortId as unknown as string);
  });

  it("stands on for an honest captain she has never been shot at by", () => {
    const { world, ship } = chase({ faction: "england" });
    const after = runAi(world);
    expect(hullOf(after, ship.id)![1].ai?.state).not.toBe("flee");
  });

  it("runs from anybody once somebody has put a shot into her", () => {
    const { world, ship } = chase({ faction: "england", harried: 1 });
    const after = runAi(world);
    expect(hullOf(after, ship.id)![1].ai?.state).toBe("flee");
  });

  it("holds the refuge she picked instead of dithering between her two", () => {
    const { world, ship, at } = chase({ faction: "pirates" });
    const first = runAi(world);
    const chosen = hullOf(first, ship.id)![1].ai?.targetPortId as unknown as string;

    // He crosses to her other quarter; she is already committed.
    const moved: WorldState = {
      ...first,
      entities: {
        ...first.entities,
        [first.player.shipId as string]: playerHull({ x: at.x - 400, y: at.y - 400 }, "pirates") as never,
      },
    };
    expect(hullOf(runAi(moved), ship.id)![1].ai?.targetPortId as unknown as string).toBe(chosen);
  });

  it("picks her passage back up when he falls astern", () => {
    const { world, ship } = chase({ faction: "pirates" });
    const fleeing = runAi(world);
    expect(hullOf(fleeing, ship.id)![1].ai?.state).toBe("flee");

    const gone: WorldState = {
      ...fleeing,
      entities: {
        ...fleeing.entities,
        [fleeing.player.shipId as string]: playerHull({ x: 20, y: 20 }, "england") as never,
      },
    };
    const after = runAi(gone);
    expect(hullOf(after, ship.id)![1].ai?.state).toBe("travel");
    expect(hullOf(after, ship.id)![1].sailLevel).toBe(0.75);
  });

  it("is dispatched on her name, before the behaviour switch", () => {
    // v0.35.0 asserted here that anonymous traffic did NOT notice. v0.36.0 gave
    // the running to every merchant (`NpcAiSystem.test.ts`), so what is left to
    // hold is the dispatch itself: a hull with a name goes to her own handler
    // and comes out fleeing, while the same world's nameless trader is answered
    // by the trader handler and comes out fleeing too — from the same predicate.
    const w = seeded();
    const at = { x: 1000, y: 1000 };
    const anon = entityId("anon");
    const world: WorldState = {
      ...w,
      player: { ...w.player, location: { type: "sea", pos: at } },
      entities: {
        [w.player.shipId as string]: playerHull(at, "pirates") as never,
        [anon as string]: {
          ...playerHull({ x: at.x + 40, y: at.y }, "spain"),
          id: anon,
          ai: { behavior: "trader", state: "travel", aggression: 0.05, awarenessRadius: 200 },
        } as never,
      },
    };
    expect(runAi(world).entities[anon as string].ai?.state).toBe("flee");
  });
});

describe("her escorts", () => {
  it("turn back on him the moment she runs, whatever his standing is", () => {
    const w = seeded();
    const ship = { ...namedShips(w).find(s => escortCount(s) > 0)!, harried: 1 };
    const at = namedShipPos(w, ship)!;
    const playerAt = { x: at.x + 60, y: at.y + 60 };
    const afloat = materializeNamed(
      { ...w, namedShips: namedShips(w).map(x => x.id === ship.id ? ship : x) },
      ship, at,
    );
    const world: WorldState = {
      ...afloat,
      player: { ...afloat.player, location: { type: "sea", pos: playerAt } },
      entities: {
        ...afloat.entities,
        // Friendly: without the convoy rule these would ignore him entirely.
        [afloat.player.shipId as string]: playerHull(playerAt, "england") as never,
      },
    };
    const after = runAi(world);
    expect(hullOf(after, ship.id)![1].ai?.state).toBe("flee");
    for (const [, e] of escortsOf(after, ship.id)) expect(e.ai?.state).toBe("chase");
  });
});

describe("the chase ends at the harbour mouth", () => {
  /** One crossing of the named-ship interval. */
  function beat(world: WorldState) {
    return tickNamedShips({ ...world, time: { ...world.time, tick: 40 } }, 1);
  }

  /** Her afloat, fleeing for `end`, standing `gap` units off its water. */
  function bolting(end: "from" | "to", gap: number) {
    const w = seeded();
    const ship = namedShips(w)[0];
    const port = end === "to" ? ship.to : ship.from;
    const haven = getPortWaterPos(port);
    const afloat = materializeNamed(w, ship, namedShipPos(w, ship)!);
    const [id, hull] = hullOf(afloat, ship.id)!;
    return {
      ship,
      port,
      world: {
        ...afloat,
        entities: {
          ...afloat.entities,
          [id]: {
            ...hull,
            pos: { x: haven.x + gap, y: haven.y },
            ai: { ...hull.ai!, state: "flee" as const, targetPortId: port as never },
          },
        },
      } as WorldState,
    };
  }

  it("lets her go when she gets under the guns, and says so", () => {
    const { world, ship, port } = bolting("to", SHELTER_RANGE - 10);
    const beaten = beat(world);
    expect(hullOf(beaten.world, ship.id)).toBeUndefined();
    const now = namedShipById(beaten.world, ship.id)!;
    expect(now.progress).toBeCloseTo(1, 5);
    expect(layingOver(now, beaten.world.time.day)).toBe(true);
    // A ship that simply vanished off his bow reads as a bug, not an escape.
    expect(beaten.events.some(e => e.type === "Toast")).toBe(true);
    expect(beaten.world.eventLog.some(e => e.key === "named.log_escaped")).toBe(true);
    expect(CITIES[port]).toBeDefined();
  });

  it("does not let her go from outside it", () => {
    const { world, ship } = bolting("to", SHELTER_RANGE + 400);
    const beaten = beat(world);
    expect(namedShipById(beaten.world, ship.id)!.progress).not.toBeCloseTo(1, 5);
    expect(beaten.events).toEqual([]);
  });

  it("has that line in both languages", () => {
    expect(EN["named.escaped"]).toBeDefined();
    expect(PL["named.escaped"]).toBeDefined();
    expect(EN["named.log_escaped"]).toBeDefined();
    expect(PL["named.log_escaped"]).toBeDefined();
  });
});
