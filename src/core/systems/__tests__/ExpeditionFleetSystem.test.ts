import { describe, it, expect } from "vitest";
import {
  originPortFor,
  expeditionProgress,
  expeditionPos,
  withinReach,
  planHulls,
  hullsOf,
  materialize,
  dematerialize,
  syncLedger,
  scatterExpedition,
  tickExpeditionFleets,
  MATERIALIZE_RANGE,
  SOLDIERS_PER_TRANSPORT,
  GUNS_PER_ESCORT,
  MAX_EXPEDITION_HULLS,
  EXPEDITION_INTERVAL_TICKS,
  AFLOAT_VAR,
} from "../ExpeditionFleetSystem.ts";
import { RELIEF_COOLDOWN_DAYS } from "../ReconquestSystem.ts";
import { CAMPAIGN_COOLDOWN_DAYS } from "../CrownCampaignSystem.ts";
import type { WorldState, PortRuntimeState, WorldEventState, Vec2 } from "../../model/WorldState.ts";
import { entityId, shipClassId, factionId, portId } from "../../model/ids.ts";
import { CITIES } from "../../data/cities.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";

// ===========================================================================
// ExpeditionFleetSystem — the invasion the player can meet at sea
// ===========================================================================
//
// Until v0.17.0 an expedition was a headline and an arrival date with nothing
// in between. These tests hold down the two things that make the middle real:
// the split of one landing into hulls that add back up to it exactly, and the
// ledger that survives a squadron going on and off the chart.

/** A pirate-held Spanish fort, and the crown's own harbour up the coast. */
const TARGET = "cartagena";
const NEIGHBOUR = "porto_bello";

function makePort(portKey: string, over: Partial<PortRuntimeState> = {}): PortRuntimeState {
  const baseline = getPortBaseline(portKey);
  return {
    portId: portId(portKey),
    factionId: CITIES[portKey].factionId,
    prices: {},
    inventory: {},
    shipyardQueue: [],
    availableCrew: 0,
    population: baseline.population,
    wealth: baseline.wealth,
    defense: baseline.defense,
    bonusProduces: [],
    ...over,
  };
}

function reconquestEvent(over: Partial<WorldEventState> = {}): WorldEventState {
  return {
    id: "reconquest_cartagena_100",
    type: "reconquest",
    startDay: 100,
    endDay: 110,
    ports: [TARGET],
    factions: ["spain", "pirates"],
    severity: 3,
    headline: "news.reconquest",
    vars: { port: "Cartagena", faction: "Spain", holder: "Pirates", soldiers: 160, guns: 40, days: 10 },
    ...over,
  };
}

function makeWorld(over: {
  day?: number;
  tick?: number;
  pos?: Vec2;
  inPort?: string;
  ports?: Record<string, PortRuntimeState>;
  worldEvents?: WorldEventState[];
  entities?: WorldState["entities"];
} = {}): WorldState {
  const { day = 105, tick = 0, pos = { x: 0, y: 0 } } = over;
  const cls = SHIP_CLASSES.frigate;

  const ports: Record<string, PortRuntimeState> = over.ports ?? {
    [TARGET]: makePort(TARGET, { factionId: factionId("pirates"), capturedDay: 60 }),
    [NEIGHBOUR]: makePort(NEIGHBOUR),
  };

  return {
    version: 12,
    time: { day, hour: 12, minute: 0, tick },
    rng: { seed: 9, state: 9 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: 1000,
      notoriety: 10,
      reputation: {},
      ranks: {},
      location: over.inPort
        ? { type: "port", portId: portId(over.inPort), pos }
        : { type: "sea", pos },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
      citiesCaptured: 1,
      courtship: {},
    },
    entities: {
      player_ship: {
        id: entityId("player_ship"),
        kind: "ship",
        mode: "sailing",
        depthOffset: 0,
        pos,
        vel: { x: 0, y: 0 },
        heading: 0,
        sailLevel: 0.6,
        ship: {
          classId: shipClassId("frigate"),
          factionId: factionId("england"),
          hullHp: cls.hullMax,
          hullMax: cls.hullMax,
          sailsHp: cls.sailsMax,
          sailsMax: cls.sailsMax,
          cannons: cls.cannons,
          cargo: {},
          cargoCap: cls.cargoCap,
          crew: { current: cls.crewMax, max: cls.crewMax, morale: 0.8 },
        },
      },
      ...(over.entities ?? {}),
    },
    ports,
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: {},
    eventLog: [],
    worldEvents: over.worldEvents ?? [reconquestEvent()],
    knownEventIds: [],
    playerName: "Test",
    eraId: "1660",
    startYear: 1660,
    gameSpeed: 1.2,
    captain: {
      name: "Test",
      nationality: "england",
      birthYear: 1640,
      startAge: 20,
      skills: { fencing: 5, gunnery: 5, navigation: 5, charm: 5, medicine: 5 },
      training: 0.5,
    },
  } as WorldState;
}

// ── Where it is ───────────────────────────────────────────

describe("originPortFor — which harbour the squadron sailed from", () => {
  it("picks the nearest colony the sending crown actually holds", () => {
    const w = makeWorld();
    const origin = originPortFor(w, reconquestEvent())!;
    // `portFaction` answers from the static map for any port with no runtime
    // entry, so every Spanish town in `CITIES` counts as held here. What the
    // function has to get right is that the nearest of them wins.
    expect(CITIES[origin].factionId as unknown as string).toBe("spain");
    const target = CITIES[TARGET].pos;
    const d = (k: string) =>
      (CITIES[k].pos.x - target.x) ** 2 + (CITIES[k].pos.y - target.y) ** 2;
    for (const key of Object.keys(CITIES)) {
      if (key === TARGET) continue;
      if ((CITIES[key].factionId as unknown as string) !== "spain") continue;
      expect(d(origin)).toBeLessThanOrEqual(d(key));
    }
  });

  it("prefers a town the crown holds today over one it merely founded", () => {
    // Every Spanish town nearer than Porto Bello is in other hands, so the
    // squadron has to come from further up the coast.
    const target = CITIES[TARGET].pos;
    const d = (k: string) =>
      (CITIES[k].pos.x - target.x) ** 2 + (CITIES[k].pos.y - target.y) ** 2;
    const ports: Record<string, PortRuntimeState> = {
      [TARGET]: makePort(TARGET, { factionId: factionId("pirates"), capturedDay: 60 }),
    };
    for (const key of Object.keys(CITIES)) {
      if (key === TARGET || key === NEIGHBOUR) continue;
      if ((CITIES[key].factionId as unknown as string) !== "spain") continue;
      if (d(key) < d(NEIGHBOUR)) ports[key] = makePort(key, { factionId: factionId("england") });
    }
    expect(originPortFor(makeWorld({ ports }), reconquestEvent())).toBe(NEIGHBOUR);
  });

  it("falls back on a colony the crown founded when it holds nothing", () => {
    const w = makeWorld({
      ports: {
        [TARGET]: makePort(TARGET, { factionId: factionId("pirates") }),
        [NEIGHBOUR]: makePort(NEIGHBOUR, { factionId: factionId("england") }),
      },
    });
    // Every Spanish port is in other hands, but Spain still founded them, so
    // there is a bearing to sail from rather than no expedition at all.
    const origin = originPortFor(w, reconquestEvent());
    expect(origin).toBeDefined();
    expect(CITIES[origin!].factionId as unknown as string).toBe("spain");
  });

  it("has no route for a target that is not a town", () => {
    const w = makeWorld();
    expect(originPortFor(w, reconquestEvent({ ports: ["nowhere"] }))).toBeUndefined();
  });
});

describe("expeditionProgress / expeditionPos — walking the passage by the day", () => {
  it("is at the harbour it sailed from on the day it sailed", () => {
    const w = makeWorld({ day: 100 });
    expect(expeditionProgress(w, reconquestEvent())).toBe(0);
    const origin = originPortFor(w, reconquestEvent())!;
    expect(expeditionPos(w, reconquestEvent())).toEqual(CITIES[origin].pos);
  });

  it("is off the target on the day it arrives", () => {
    const w = makeWorld({ day: 110 });
    expect(expeditionProgress(w, reconquestEvent())).toBe(1);
    expect(expeditionPos(w, reconquestEvent())).toEqual(CITIES[TARGET].pos);
  });

  it("is halfway across on the middle day", () => {
    const w = makeWorld({ day: 105 });
    expect(expeditionProgress(w, reconquestEvent())).toBeCloseTo(0.5, 6);
  });

  it("never runs past either end of the passage", () => {
    expect(expeditionProgress(makeWorld({ day: 50 }), reconquestEvent())).toBe(0);
    expect(expeditionProgress(makeWorld({ day: 400 }), reconquestEvent())).toBe(1);
  });

  it("treats a zero-day passage as already arrived", () => {
    const w = makeWorld({ day: 100 });
    expect(expeditionProgress(w, reconquestEvent({ endDay: 100 }))).toBe(1);
  });
});

describe("withinReach — when the squadron is on the chart at all", () => {
  const here = { x: 1500, y: 1500 };

  it("is in reach at the position itself", () => {
    expect(withinReach(makeWorld({ pos: here }), here)).toBe(true);
  });

  it("is out of reach past the radius", () => {
    const far = { x: here.x + MATERIALIZE_RANGE + 10, y: here.y };
    expect(withinReach(makeWorld({ pos: far }), here)).toBe(false);
  });

  it("is never in reach from inside a port — you cannot fight at sea from a quay", () => {
    expect(withinReach(makeWorld({ pos: here, inPort: TARGET }), here)).toBe(false);
  });
});

// ── Splitting the landing ─────────────────────────────────

describe("planHulls — one landing divided into ships", () => {
  it("puts every soldier in transports and every gun in escorts", () => {
    const plans = planHulls(160, 40);
    const transports = plans.filter(p => p.role === "transport");
    const escorts = plans.filter(p => p.role === "escort");
    expect(transports.every(p => p.guns === 0)).toBe(true);
    expect(escorts.every(p => p.soldiers === 0)).toBe(true);
  });

  it("adds back up to exactly what sailed", () => {
    for (const [men, guns] of [[160, 40], [37, 3], [999, 250], [1, 1]] as const) {
      const plans = planHulls(men, guns);
      expect(plans.reduce((s, p) => s + p.soldiers, 0)).toBe(men);
      expect(plans.reduce((s, p) => s + p.guns, 0)).toBe(guns);
    }
  });

  it("uses one transport for a small landing and two for a large one", () => {
    expect(planHulls(SOLDIERS_PER_TRANSPORT - 10, 10).filter(p => p.role === "transport"))
      .toHaveLength(1);
    expect(planHulls(SOLDIERS_PER_TRANSPORT * 2, 10).filter(p => p.role === "transport"))
      .toHaveLength(2);
  });

  it("uses one escort for a light battery and two for a heavy one", () => {
    expect(planHulls(50, GUNS_PER_ESCORT - 5).filter(p => p.role === "escort")).toHaveLength(1);
    expect(planHulls(50, GUNS_PER_ESCORT * 2).filter(p => p.role === "escort")).toHaveLength(2);
  });

  it("never puts more than four hulls in the water", () => {
    expect(planHulls(5000, 5000).length).toBeLessThanOrEqual(MAX_EXPEDITION_HULLS);
  });

  it("gives a bigger load a bigger hull", () => {
    const small = planHulls(20, 0)[0];
    const large = planHulls(400, 0)[0];
    expect(small.classId).not.toBe(large.classId);
    // Tonnage, not hold space: a galleon carries fewer barrels than a fluyt and
    // far more men, which is exactly the distinction being made here.
    expect(SHIP_CLASSES[large.classId].tonnage)
      .toBeGreaterThan(SHIP_CLASSES[small.classId].tonnage);
  });

  it("sends nothing at all for a landing with neither men nor guns", () => {
    expect(planHulls(0, 0)).toEqual([]);
  });

  it("sends transports and no escort when there are no guns", () => {
    const plans = planHulls(80, 0);
    expect(plans.every(p => p.role === "transport")).toBe(true);
  });
});

// ── On and off the chart ──────────────────────────────────

describe("materialize / dematerialize", () => {
  const at = { x: 1497, y: 1603 };

  it("puts hulls in the water carrying the whole landing between them", () => {
    const w = makeWorld();
    const ev = reconquestEvent();
    const out = materialize(w, ev, at, w.rng).world;
    const hulls = hullsOf(out, ev.id);
    expect(hulls.length).toBeGreaterThan(1);
    expect(hulls.reduce((s, [, e]) => s + (e.ai!.expedition!.soldiers), 0)).toBe(160);
    expect(hulls.reduce((s, [, e]) => s + (e.ai!.expedition!.guns), 0)).toBe(40);
  });

  it("flies the sending crown's flag, not the town's", () => {
    const w = makeWorld();
    const out = materialize(w, reconquestEvent(), at, w.rng).world;
    for (const [, e] of hullsOf(out, "reconquest_cartagena_100")) {
      expect(e.ship!.factionId as unknown as string).toBe("spain");
    }
  });

  it("makes the escorts warships that will close and the transports ones that will not", () => {
    const w = makeWorld();
    const out = materialize(w, reconquestEvent(), at, w.rng).world;
    const hulls = hullsOf(out, "reconquest_cartagena_100").map(([, e]) => e.ai!);
    const escorts = hulls.filter(a => a.expedition!.guns > 0);
    const transports = hulls.filter(a => a.expedition!.soldiers > 0);
    expect(escorts.every(a => a.behavior === "navy" && a.aggression > 0.5)).toBe(true);
    expect(transports.every(a => a.behavior === "trader" && a.aggression < 0.2)).toBe(true);
  });

  it("heads them at the town they are going to", () => {
    const w = makeWorld();
    const out = materialize(w, reconquestEvent(), at, w.rng).world;
    for (const [, e] of hullsOf(out, "reconquest_cartagena_100")) {
      expect(e.ai!.targetPortId as unknown as string).toBe(TARGET);
    }
  });

  it("puts nothing in the water for a landing with nobody in it", () => {
    const w = makeWorld();
    const ev = reconquestEvent({ vars: { soldiers: 0, guns: 0 } });
    expect(hullsOf(materialize(w, ev, at, w.rng).world, ev.id)).toHaveLength(0);
  });

  it("takes only its own hulls off the chart", () => {
    const w = makeWorld();
    const ev = reconquestEvent();
    const withShips = materialize(w, ev, at, w.rng).world;
    const cleared = dematerialize(withShips, ev.id);
    expect(hullsOf(cleared, ev.id)).toHaveLength(0);
    expect(cleared.entities.player_ship).toBeDefined();
  });

  it("hands back the same world when there was nothing to remove", () => {
    const w = makeWorld();
    expect(dematerialize(w, "nothing")).toBe(w);
  });
});

// ── The ledger ────────────────────────────────────────────

describe("syncLedger — the landing is whatever got through", () => {
  const at = { x: 1497, y: 1603 };

  it("leaves the event alone while every hull is afloat", () => {
    const w = makeWorld();
    const ev = reconquestEvent();
    const withShips = materialize(w, ev, at, w.rng).world;
    expect(syncLedger(withShips, ev)).toBe(withShips);
  });

  it("takes a sunk transport's soldiers out of the landing for good", () => {
    const w = makeWorld();
    const ev = reconquestEvent();
    let withShips = materialize(w, ev, at, w.rng).world;

    const [id, hull] = hullsOf(withShips, ev.id).find(([, e]) => e.ai!.expedition!.soldiers > 0)!;
    const carried = hull.ai!.expedition!.soldiers;
    const entities = { ...withShips.entities };
    delete entities[id];
    withShips = { ...withShips, entities };

    const after = syncLedger(withShips, ev);
    expect(Number(after.worldEvents[0].vars.soldiers)).toBe(160 - carried);
  });

  it("says so in the log when a transport goes down", () => {
    const w = makeWorld();
    const ev = reconquestEvent();
    let withShips = materialize(w, ev, at, w.rng).world;
    const [id] = hullsOf(withShips, ev.id).find(([, e]) => e.ai!.expedition!.soldiers > 0)!;
    const entities = { ...withShips.entities };
    delete entities[id];
    withShips = { ...withShips, entities };

    const after = syncLedger(withShips, ev);
    expect(after.eventLog.some(e => e.key === "expedition.log_transport")).toBe(true);
  });

  it("takes a sunk escort's guns out of the covering fire", () => {
    const w = makeWorld();
    const ev = reconquestEvent();
    let withShips = materialize(w, ev, at, w.rng).world;
    const [id, hull] = hullsOf(withShips, ev.id).find(([, e]) => e.ai!.expedition!.guns > 0)!;
    const carried = hull.ai!.expedition!.guns;
    const entities = { ...withShips.entities };
    delete entities[id];
    withShips = { ...withShips, entities };

    const after = syncLedger(withShips, ev);
    expect(Number(after.worldEvents[0].vars.guns)).toBe(40 - carried);
    // Guns are not men: the log line about soldiers going down does not fire.
    expect(after.eventLog.some(e => e.key === "expedition.log_transport")).toBe(false);
  });
});

describe("scatterExpedition — breaking one buys the town a season", () => {
  it("strikes the event and every hull left of it", () => {
    const w = makeWorld();
    const ev = reconquestEvent();
    const withShips = materialize(w, ev, { x: 1497, y: 1603 }, w.rng).world;
    const out = scatterExpedition(withShips, ev).world;
    expect(out.worldEvents).toHaveLength(0);
    expect(hullsOf(out, ev.id)).toHaveLength(0);
  });

  it("gives a relief squadron's target the relief cooling-off period", () => {
    const w = makeWorld();
    const out = scatterExpedition(w, reconquestEvent()).world;
    expect(out.ports[TARGET].nextReliefDay).toBe(w.time.day + RELIEF_COOLDOWN_DAYS);
    expect(out.ports[TARGET].nextCampaignDay).toBeUndefined();
  });

  it("gives a crown campaign's target the campaign cooling-off period instead", () => {
    const w = makeWorld();
    const ev = reconquestEvent({ id: "campaign_cartagena_100", type: "campaign" });
    const out = scatterExpedition({ ...w, worldEvents: [ev] }, ev).world;
    expect(out.ports[TARGET].nextCampaignDay).toBe(w.time.day + CAMPAIGN_COOLDOWN_DAYS);
    expect(out.ports[TARGET].nextReliefDay).toBeUndefined();
  });

  it("is worth something to a captain's name", () => {
    const w = makeWorld();
    expect(scatterExpedition(w, reconquestEvent()).world.player.notoriety)
      .toBeGreaterThan(w.player.notoriety);
  });

  it("says so in the log and on the screen", () => {
    const out = scatterExpedition(makeWorld(), reconquestEvent());
    expect(out.world.eventLog.some(e => e.key === "expedition.log_scattered")).toBe(true);
    expect(out.events).toHaveLength(1);
  });
});

// ── The tick ──────────────────────────────────────────────

describe("tickExpeditionFleets", () => {
  /**
   * One frame's worth of clock at 60 fps and normal speed.
   *
   * Deliberately fractional: the interval gate used to be `tick % N === 0`,
   * which on this clock is never true, and the whole module was dead in the
   * running game while its unit tests passed on integer ticks. Every call here
   * goes through the same arithmetic the engine does.
   */
  const DT = 0.4;

  /** Halfway along Porto Bello → Cartagena, which the probe says is open water. */
  function nearWorld(over: Parameters<typeof makeWorld>[0] = {}): WorldState {
    const w = makeWorld({ ...over, tick: over.tick ?? EXPEDITION_INTERVAL_TICKS });
    const pos = expeditionPos(w, w.worldEvents[0])!;
    return {
      ...w,
      player: { ...w.player, location: { ...w.player.location, pos } },
      entities: { ...w.entities, player_ship: { ...w.entities.player_ship, pos } },
    };
  }

  it("does nothing between reconciliations", () => {
    // Mid-bucket: this frame did not cross a multiple of the interval.
    const w = nearWorld({ tick: EXPEDITION_INTERVAL_TICKS + 1 });
    expect(tickExpeditionFleets(w, DT).world).toBe(w);
  });

  it("still fires on a fractional clock, which is the only kind the engine has", () => {
    // The frame that steps 39.8 → 40.2 crosses the boundary; `% 40 === 0` never
    // would, and that is exactly how this module shipped dead before the fix.
    const w = nearWorld({ tick: EXPEDITION_INTERVAL_TICKS + 0.2 });
    expect(hullsOf(tickExpeditionFleets(w, DT).world, "reconquest_cartagena_100").length)
      .toBeGreaterThan(0);
  });

  it("puts the squadron on the chart when the player comes up on it", () => {
    const out = tickExpeditionFleets(nearWorld(), DT).world;
    expect(hullsOf(out, "reconquest_cartagena_100").length).toBeGreaterThan(0);
    expect(out.worldEvents[0].vars[AFLOAT_VAR]).toBe(1);
  });

  it("leaves it alone while the player is over the horizon", () => {
    const w = makeWorld({ pos: { x: 100, y: 100 } });
    const out = tickExpeditionFleets({ ...w, time: { ...w.time, tick: EXPEDITION_INTERVAL_TICKS } }, DT).world;
    expect(hullsOf(out, "reconquest_cartagena_100")).toHaveLength(0);
    expect(out.worldEvents[0].vars[AFLOAT_VAR]).toBeUndefined();
  });

  it("takes it off the chart again when he leaves, and remembers the damage", () => {
    let w = tickExpeditionFleets(nearWorld(), DT).world;

    // Sink a transport, then sail out of sight.
    const [id, hull] = hullsOf(w, "reconquest_cartagena_100")
      .find(([, e]) => e.ai!.expedition!.soldiers > 0)!;
    const carried = hull.ai!.expedition!.soldiers;
    const entities = { ...w.entities };
    delete entities[id];
    w = {
      ...w,
      entities: { ...entities, player_ship: { ...w.entities.player_ship, pos: { x: 100, y: 100 } } },
      player: { ...w.player, location: { type: "sea", pos: { x: 100, y: 100 } } },
    };

    const out = tickExpeditionFleets(w, DT).world;
    expect(hullsOf(out, "reconquest_cartagena_100")).toHaveLength(0);
    expect(out.worldEvents[0].vars[AFLOAT_VAR]).toBeUndefined();
    expect(Number(out.worldEvents[0].vars.soldiers)).toBe(160 - carried);
  });

  it("brings back the smaller squadron the player left behind", () => {
    let w = tickExpeditionFleets(nearWorld(), DT).world;
    const [id] = hullsOf(w, "reconquest_cartagena_100")
      .find(([, e]) => e.ai!.expedition!.guns > 0)!;
    const entities = { ...w.entities };
    delete entities[id];
    w = { ...w, entities };

    // Away and back again.
    const away = { x: 100, y: 100 };
    w = tickExpeditionFleets({
      ...w,
      entities: { ...w.entities, player_ship: { ...w.entities.player_ship, pos: away } },
      player: { ...w.player, location: { type: "sea", pos: away } },
    }, DT).world;

    const back = expeditionPos(w, w.worldEvents[0])!;
    const out = tickExpeditionFleets({
      ...w,
      entities: { ...w.entities, player_ship: { ...w.entities.player_ship, pos: back } },
      player: { ...w.player, location: { type: "sea", pos: back } },
    }, DT).world;

    const guns = hullsOf(out, "reconquest_cartagena_100")
      .reduce((s, [, e]) => s + e.ai!.expedition!.guns, 0);
    expect(guns).toBe(Number(out.worldEvents[0].vars.guns));
    expect(guns).toBeLessThan(40);
  });

  it("strikes the expedition once there is nobody left to put ashore", () => {
    let w = tickExpeditionFleets(nearWorld(), DT).world;

    // Every transport on the bottom; the escorts are guarding an empty sea.
    const entities = { ...w.entities };
    for (const [id, e] of hullsOf(w, "reconquest_cartagena_100")) {
      if (e.ai!.expedition!.soldiers > 0) delete entities[id];
    }
    w = { ...w, entities };

    const out = tickExpeditionFleets(w, DT);
    expect(out.world.worldEvents).toHaveLength(0);
    expect(hullsOf(out.world, "reconquest_cartagena_100")).toHaveLength(0);
    expect(out.events.length).toBeGreaterThan(0);
  });

  it("sweeps up hulls whose expedition has already landed and been settled", () => {
    const w = tickExpeditionFleets(nearWorld(), DT).world;
    // `tickReconquest` drops the event on the day change; the ships must not
    // sail on as a squadron nobody is sending anywhere.
    const orphaned = { ...w, worldEvents: [] };
    const out = tickExpeditionFleets(orphaned, DT).world;
    expect(hullsOf(out, "reconquest_cartagena_100")).toHaveLength(0);
  });

  it("does not mutate the world it was handed", () => {
    const w = nearWorld();
    const before = Object.keys(w.entities).length;
    tickExpeditionFleets(w, DT);
    expect(Object.keys(w.entities)).toHaveLength(before);
    expect(w.worldEvents[0].vars[AFLOAT_VAR]).toBeUndefined();
  });
});
