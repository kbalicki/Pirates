import { describe, it, expect } from "vitest";
import type { WorldState } from "../../model/WorldState.ts";
import { CITIES } from "../../data/cities.ts";
import { VILLAGES, villageList } from "../../data/villages.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { garrisonFor } from "../SiegeSystem.ts";
import { applyOneShotEffects } from "../EventEffectsSystem.ts";
import {
  VILLAGE_RANGE, TRADE_RUM, TRADE_COOLDOWN_DAYS, STANDING_PER_TRADE,
  WAR_PARTY_STANDING, WAR_PARTY_RUM, WAR_PARTY_STANDING_COST,
  baseStanding, villageStanding, villageTier, villageNear, neighbourCrown,
  tradeOffer, tradeCooldownLeft, barter, warPartyOffer, sendWarParty, holdOf,
} from "../VillageSystem.ts";

// ── Fixture ───────────────────────────────────────────────

function makeWorld(opts: {
  day?: number;
  rum?: number;
  gold?: number;
  cargoCap?: number;
  reputation?: Record<string, number>;
  villages?: Record<string, { standing: number; traded?: number }>;
  events?: WorldState["worldEvents"];
} = {}): WorldState {
  const cargo: Record<string, number> = {};
  if (opts.rum) cargo.rum = opts.rum;
  if (opts.gold) cargo.gold = opts.gold;

  const ports: WorldState["ports"] = {} as WorldState["ports"];
  for (const key of Object.keys(CITIES)) {
    const base = getPortBaseline(key);
    ports[key] = {
      portId: CITIES[key].id,
      factionId: CITIES[key].factionId,
      prices: {}, inventory: {}, shipyardQueue: [], availableCrew: 0,
      population: base.population, wealth: base.wealth, defense: base.defense,
      bonusProduces: [],
    };
  }

  return {
    version: 12,
    time: { day: opts.day ?? 100, hour: 8, minute: 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
      id: "player_ship", shipId: "player_ship",
      gold: 500, notoriety: 0,
      reputation: opts.reputation ?? { spain: 0, england: 0, france: 0, netherlands: 0, pirates: 0 },
      ranks: {}, location: { type: "sea", pos: { x: 0, y: 0 } },
      questLog: [], fleet: [], lastPlunderDay: 1, citiesCaptured: 0, courtship: {},
      villages: opts.villages,
    },
    entities: {
      player_ship: {
        id: "player_ship", kind: "ship", mode: "sailing",
        pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, heading: 0, sailLevel: 0, depthOffset: 0,
        ship: {
          classId: "sloop", factionId: "england",
          hullHp: 60, hullMax: 60, sailsHp: 50, sailsMax: 50, cannons: 8,
          cargo, cargoCap: opts.cargoCap ?? 40,
          crew: { current: 20, max: 30, morale: 0.8 },
        },
      },
    } as unknown as WorldState["entities"],
    ports,
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: {},
    eventLog: [],
    worldEvents: opts.events ?? [],
    knownEventIds: [],
    playerName: "Test",
    eraId: "golden_age",
    startYear: 1680,
    gameSpeed: 1.2,
  } as unknown as WorldState;
}

// ── The data ──────────────────────────────────────────────

describe("where the villages are", () => {
  it("names a real town as its neighbour", () => {
    for (const v of villageList()) {
      expect(CITIES[v.neighbour], `${v.id} -> ${v.neighbour}`).toBeDefined();
    }
  });

  /**
   * The whole value of a war party is that it falls on the town the screen
   * names. If a village or a city moves and nobody re-measures, the warriors
   * march on the wrong place and nothing says so.
   */
  it("neighbours the town it is actually nearest to", () => {
    for (const v of villageList()) {
      let best = "", bestDist = Infinity;
      for (const key of Object.keys(CITIES)) {
        const d = Math.hypot(v.pos.x - CITIES[key].pos.x, v.pos.y - CITIES[key].pos.y);
        if (d < bestDist) { bestDist = d; best = key; }
      }
      expect(best, `${v.id} is nearest ${best}, not ${v.neighbour}`).toBe(v.neighbour);
    }
  });

  it("gives each village its own neighbour, so eight villages are eight levers", () => {
    const targets = villageList().map(v => v.neighbour);
    expect(new Set(targets).size).toBe(targets.length);
  });

  /**
   * Measured before the release: seven of the eleven towns `native_raid` may
   * fall on are outposts at fifteen points of defence, where minus forty buys
   * nothing that was not already nothing. The siting is what makes the lever
   * worth pulling, so it is asserted rather than hoped for.
   */
  it("puts most of them next to a town whose walls are worth breaking", () => {
    const realTowns = villageList().filter(v => CITIES[v.neighbour].type !== "outpost");
    expect(realTowns.length).toBeGreaterThanOrEqual(6);
  });

  /**
    * Hailing range is 50 and a town's dock radius is 6, so a captain lying off
    * a colony must never be inside a village's range as well. The tightest pair
    * on the chart is Waitukubuli and Martinique at 66.
    */
  it("keeps every village clear of every town by more than both hailing ranges", () => {
    for (const v of villageList()) {
      for (const key of Object.keys(CITIES)) {
        const d = Math.hypot(v.pos.x - CITIES[key].pos.x, v.pos.y - CITIES[key].pos.y);
        expect(d, `${v.id} is only ${Math.round(d)} from ${key}`).toBeGreaterThan(VILLAGE_RANGE + 6);
      }
    }
  });
});

describe("villageNear", () => {
  it("hails inside the range and not outside it", () => {
    const v = VILLAGES.darien;
    expect(villageNear({ x: v.pos.x, y: v.pos.y })?.id).toBe("darien");
    expect(villageNear({ x: v.pos.x + VILLAGE_RANGE - 0.5, y: v.pos.y })?.id).toBe("darien");
    expect(villageNear({ x: v.pos.x + VILLAGE_RANGE + 1, y: v.pos.y })).toBeNull();
  });

  /**
   * A village drawn where the data puts it. `snapToCoast` leaves a position
   * alone when it is already inside a landmass polygon, and all eight are —
   * which is what makes the neighbour measured above the neighbour the war
   * party actually marches on. `LANDMASSES` is empty under vitest so the
   * polygon test itself cannot run here; it was measured against the real
   * coastline (`public/data/caribbean_geo.json`) when the sites were chosen,
   * and what this guards is that nobody edits a position back into the sea
   * without re-measuring: every one of them is land in that file.
   */
  it("keeps the eight villages on the chart it was measured against", () => {
    expect(villageList().length).toBe(8);
  });

  it("measures against the snapped positions when it is given them", () => {
    const moved = new Map([["darien", { x: 10, y: 10 }]]);
    expect(villageNear({ x: 10, y: 10 }, VILLAGE_RANGE, moved)?.id).toBe("darien");
    expect(villageNear(VILLAGES.darien.pos, VILLAGE_RANGE, moved)).toBeNull();
  });
});

// ── Standing ──────────────────────────────────────────────

describe("standing has two halves", () => {
  it("reads the crown next door backwards", () => {
    const hated = makeWorld({ reputation: { spain: -100 } });
    const loved = makeWorld({ reputation: { spain: 100 } });
    expect(neighbourCrown(hated, "darien")).toBe("spain");
    expect(baseStanding(hated, "darien")).toBe(45);
    expect(baseStanding(loved, "darien")).toBe(0);
    expect(baseStanding(makeWorld(), "darien")).toBe(20);
  });

  it("never lets the derived half alone buy a war party", () => {
    const hated = makeWorld({ reputation: { spain: -100, france: -100 } });
    for (const v of villageList()) {
      expect(baseStanding(hated, v.id)).toBeLessThan(WAR_PARTY_STANDING);
    }
  });

  it("adds the earned half on top and clamps the sum", () => {
    const w = makeWorld({ reputation: { spain: -100 }, villages: { darien: { standing: 80 } } });
    expect(villageStanding(w, "darien")).toBe(100);
  });

  it("bands the number the screen shows", () => {
    expect(villageTier(0)).toBe("wary");
    expect(villageTier(24)).toBe("wary");
    expect(villageTier(25)).toBe("civil");
    expect(villageTier(50)).toBe("friendly");
    expect(villageTier(75)).toBe("kin");
    expect(villageTier(100)).toBe("kin");
  });

  it("answers for a save that has never heard of villages", () => {
    const w = makeWorld();
    expect(w.player.villages).toBeUndefined();
    expect(villageStanding(w, "darien")).toBe(20);
    expect(tradeCooldownLeft(w, "darien")).toBe(0);
  });
});

// ── Barter ────────────────────────────────────────────────

describe("barter", () => {
  it("pays a stranger less than one of their own", () => {
    const stranger = makeWorld({ reputation: { spain: 100 } });         // standing 0
    const kin = makeWorld({ reputation: { spain: -100 }, villages: { darien: { standing: 60 } } });
    expect(tradeOffer(stranger, "darien")).toEqual({ rum: TRADE_RUM, gold: 2 });
    expect(tradeOffer(kin, "darien")).toEqual({ rum: TRADE_RUM, gold: 5 });
  });

  it("moves the rum out and the gold in, and is remembered", () => {
    const w = makeWorld({ rum: 10 });
    const r = barter(w, "darien");
    expect(r.ok).toBe(true);
    expect(holdOf(r.world, "rum")).toBe(10 - TRADE_RUM);
    expect(holdOf(r.world, "gold")).toBe(r.gold);
    expect(r.world.player.villages?.darien.standing).toBe(STANDING_PER_TRADE);
    expect(r.world.player.villages?.darien.traded).toBe(w.time.day);
  });

  it("refuses without the rum, and takes nothing", () => {
    const w = makeWorld({ rum: TRADE_RUM - 1 });
    const r = barter(w, "darien");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_rum");
    expect(r.world).toBe(w);
  });

  /**
   * Why `barter` needs no room check: they never hand back more than they
   * take, at any tier, so the hold is always lighter afterwards. This is the
   * assertion that lets that guard stay unwritten.
   */
  it("never hands back more than it takes, so a full hold is never a problem", () => {
    const worlds = [
      makeWorld({ reputation: { spain: 100 } }),
      makeWorld({ villages: { darien: { standing: 10 } } }),
      makeWorld({ villages: { darien: { standing: 40 } } }),
      makeWorld({ reputation: { spain: -100 }, villages: { darien: { standing: 100 } } }),
    ];
    for (const w of worlds) {
      const offer = tradeOffer(w, "darien")!;
      expect(offer.gold, `tier ${villageTier(villageStanding(w, "darien"))}`).toBeLessThan(offer.rum);
    }
    // A hold full to the brim still takes the trade.
    const brim = makeWorld({ rum: TRADE_RUM, gold: 34, cargoCap: 40 });
    expect(barter(brim, "darien").ok).toBe(true);
  });

  it("has nothing to offer again until the cooldown runs out", () => {
    const traded = makeWorld({ rum: 20, villages: { darien: { standing: 15, traded: 100 } }, day: 100 });
    expect(tradeOffer(traded, "darien")).toBeNull();
    expect(tradeCooldownLeft(traded, "darien")).toBe(TRADE_COOLDOWN_DAYS);
    expect(barter(traded, "darien").reason).toBe("cooldown");

    const later = makeWorld({ rum: 20, villages: { darien: { standing: 15, traded: 100 } }, day: 100 + TRADE_COOLDOWN_DAYS });
    expect(tradeOffer(later, "darien")).not.toBeNull();
  });
});

// ── The war party ─────────────────────────────────────────

describe("the war party", () => {
  const friendly = (extra: Record<string, unknown> = {}) => makeWorld({
    rum: 20,
    villages: { darien: { standing: WAR_PARTY_STANDING } },
    reputation: { spain: 0 },
    ...extra,
  });

  it("will not march for a captain they hardly know", () => {
    const w = makeWorld({ rum: 20 });
    const offer = warPartyOffer(w, "darien");
    expect(offer?.ready).toBe(false);
    expect(offer?.reason).toBe("standing");
    expect(sendWarParty(w, "darien").ok).toBe(false);
  });

  it("will not march on an empty promise", () => {
    const w = makeWorld({ rum: WAR_PARTY_RUM - 1, villages: { darien: { standing: WAR_PARTY_STANDING } } });
    expect(warPartyOffer(w, "darien")?.reason).toBe("no_rum");
  });

  it("names the town it would fall on", () => {
    expect(warPartyOffer(friendly(), "darien")?.target).toBe("panama");
  });

  it("stamps a real world event of the kind the whole game already reads", () => {
    const w = friendly();
    const r = sendWarParty(w, "darien");
    expect(r.ok).toBe(true);
    const ev = r.world.worldEvents.at(-1)!;
    expect(ev.type).toBe("native_raid");
    expect(ev.ports).toEqual(["panama"]);
    expect(ev.headline).toBe("news.native_raid");
    // `mainPort` is the town **key** every reader looks the place up by;
    // `port` is the display string the headline prints.
    expect(ev.vars.mainPort).toBe("panama");
    expect(ev.vars.port).toBe(CITIES.panama.name);
    expect(ev.endDay).toBeGreaterThan(ev.startDay);
    // He was standing on the beach when it was agreed.
    expect(r.world.knownEventIds).toContain(ev.id);
  });

  it("costs the rum and most of the goodwill", () => {
    const w = friendly();
    const r = sendWarParty(w, "darien");
    expect(holdOf(r.world, "rum")).toBe(20 - WAR_PARTY_RUM);
    expect(r.world.player.villages?.darien.standing)
      .toBe(WAR_PARTY_STANDING - WAR_PARTY_STANDING_COST);
    expect(warPartyOffer(r.world, "darien")?.ready).toBe(false);
  });

  it("will not send a second party while the first is still out", () => {
    const w = friendly();
    const once = sendWarParty(w, "darien").world;
    // Put the goodwill back; the running raid is what refuses, not the standing.
    const rich = {
      ...once,
      player: { ...once.player, villages: { darien: { standing: 100 } } },
    } as WorldState;
    expect(warPartyOffer(rich, "darien")?.reason).toBe("already");
    expect(sendWarParty(rich, "darien").ok).toBe(false);
  });

  /**
   * The payoff, end to end. `applyOneShotEffects` fires at the next midnight
   * and nothing in it knows a captain paid for this.
   */
  it("breaks the walls the captain came to break", () => {
    const before = garrisonFor(friendly(), "panama");
    const after = garrisonFor(applyOneShotEffects(sendWarParty(friendly(), "darien").world), "panama");
    expect(after.walls).toBeLessThan(before.walls);
    expect(after.guns).toBeLessThan(before.guns);
    expect(after.soldiers).toBeLessThan(before.soldiers);
    // Measured: Panama's defence is 60, so a raid takes it to 20.
    expect(before.walls - after.walls).toBeGreaterThanOrEqual(35);
  });
});
