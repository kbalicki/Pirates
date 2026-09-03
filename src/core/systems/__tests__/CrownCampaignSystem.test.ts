import { describe, it, expect } from "vitest";
import {
  warPairs,
  campaignsInFlight,
  campaignTargets,
  targetWeight,
  campaignChance,
  pickTarget,
  launchCampaign,
  tickCampaigns,
  CAMPAIGN_DAILY_BASE,
  CAMPAIGN_COOLDOWN_DAYS,
  CAMPAIGN_DEFENSE_CEILING,
  CAMPAIGN_SAIL_DAYS,
  MAX_CAMPAIGNS_IN_FLIGHT,
} from "../CrownCampaignSystem.ts";
import { resolveRelief } from "../ReconquestSystem.ts";
import { portFaction } from "../SiegeSystem.ts";
import type { WorldState, PortRuntimeState, WorldEventState } from "../../model/WorldState.ts";
import { entityId, shipClassId, factionId, portId } from "../../model/ids.ts";
import { CITIES } from "../../data/cities.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";

// ===========================================================================
// CrownCampaignSystem — the wars finally move flags
// ===========================================================================

/** Two English colonies and a Spanish fort, which is enough for every branch. */
const ENGLISH = "port_royal";
const ENGLISH_WEAK = "nassau";
const SPANISH = "cartagena";

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

function war(a: string, b: string, over: Partial<WorldEventState> = {}): WorldEventState {
  return {
    id: `war_${a}_${b}`,
    type: "war_start",
    startDay: 1,
    endDay: 9999,
    ports: [],
    factions: [a, b],
    severity: 3,
    headline: "news.war_start",
    vars: {},
    ...over,
  };
}

function makeWorld(over: {
  ports?: Record<string, PortRuntimeState>;
  worldEvents?: WorldEventState[];
  day?: number;
  rngState?: number;
} = {}): WorldState {
  const cls = SHIP_CLASSES.sloop;
  const pos = { x: 0, y: 0 };
  return {
    version: 12,
    time: { day: over.day ?? 300, hour: 12, minute: 0, tick: 0 },
    rng: { seed: over.rngState ?? 3, state: over.rngState ?? 3 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: 500,
      notoriety: 0,
      reputation: {},
      ranks: {},
      location: { type: "sea", pos },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
      citiesCaptured: 0,
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
        sailLevel: 0.5,
        ship: {
          classId: shipClassId("sloop"),
          factionId: factionId("england"),
          hullHp: cls.hullMax, hullMax: cls.hullMax,
          sailsHp: cls.sailsMax, sailsMax: cls.sailsMax,
          cannons: cls.cannons,
          cargoCap: cls.cargoCap,
          crew: { current: cls.crewMax, max: cls.crewMax, morale: 0.7 },
          cargo: {},
        },
      },
    },
    ports: over.ports ?? {
      [ENGLISH]: makePort(ENGLISH, { defense: 40 }),
      [ENGLISH_WEAK]: makePort(ENGLISH_WEAK, { defense: 8 }),
      [SPANISH]: makePort(SPANISH, { defense: 50 }),
    },
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: {},
    eventLog: [],
    worldEvents: over.worldEvents ?? [war("spain", "england")],
    knownEventIds: [],
    playerName: "Captain",
    eraId: "pirates_sunset",
    startYear: 1690,
    gameSpeed: 1.2,
    captain: {
      nationality: "england",
      skills: { fencing: 5, gunnery: 5, navigation: 5, medicine: 5, charm: 5 },
      startAge: 20,
      training: 0.5,
    },
  } as WorldState;
}

// ---------------------------------------------------------------------------

describe("reading the wars off the board", () => {
  it("gives every war both ways round, because the event names no aggressor", () => {
    const pairs = warPairs(makeWorld());
    expect(pairs).toContainEqual({ attacker: "spain", defender: "england" });
    expect(pairs).toContainEqual({ attacker: "england", defender: "spain" });
  });

  it("ignores a war that has already been signed away", () => {
    const world = makeWorld({ worldEvents: [war("spain", "england", { endDay: 100 })] });
    expect(warPairs(world)).toEqual([]);
  });

  it("ignores everything that is not a war", () => {
    const world = makeWorld({
      worldEvents: [{
        id: "boom", type: "trade_boom", startDay: 1, endDay: 9999,
        ports: [ENGLISH], factions: ["england"], severity: 1,
        headline: "news.trade_boom", vars: {},
      }],
    });
    expect(warPairs(world)).toEqual([]);
  });
});

describe("choosing a colony", () => {
  const spainOnEngland = { attacker: "spain", defender: "england" };

  it("lists only colonies the other crown actually holds today", () => {
    const targets = campaignTargets(makeWorld(), spainOnEngland);
    expect(targets).toContain(ENGLISH);
    expect(targets).toContain(ENGLISH_WEAK);
    expect(targets).not.toContain(SPANISH);
  });

  it("follows the runtime flag, not the map of 1680", () => {
    const world = makeWorld({
      ports: {
        [SPANISH]: makePort(SPANISH, { factionId: factionId("england"), defense: 20 }),
        [ENGLISH]: makePort(ENGLISH, { defense: 40 }),
      },
    });
    expect(campaignTargets(world, spainOnEngland)).toContain(SPANISH);
  });

  it("leaves a well-walled colony alone", () => {
    const world = makeWorld({
      ports: { [ENGLISH]: makePort(ENGLISH, { defense: CAMPAIGN_DEFENSE_CEILING + 5 }) },
    });
    expect(campaignTargets(world, spainOnEngland)).toEqual([]);
  });

  it("leaves a colony alone while it is cooling off", () => {
    const world = makeWorld({
      ports: { [ENGLISH]: makePort(ENGLISH, { defense: 20, nextCampaignDay: 500 }) },
    });
    expect(campaignTargets(world, spainOnEngland)).toEqual([]);
  });

  it("leaves a colony alone while something is already at sea for it", () => {
    const world = makeWorld({
      ports: { [ENGLISH]: makePort(ENGLISH, { defense: 20 }) },
      worldEvents: [
        war("spain", "england"),
        {
          id: "campaign_existing", type: "campaign", startDay: 290, endDay: 320,
          ports: [ENGLISH], factions: ["france", "england"], severity: 3,
          headline: "news.campaign", vars: { soldiers: 100, guns: 25, days: 30 },
        },
      ],
    });
    expect(campaignTargets(world, spainOnEngland)).toEqual([]);
  });

  it("wants the weak one more than the strong one", () => {
    const world = makeWorld();
    expect(targetWeight(world, ENGLISH_WEAK)).toBeGreaterThan(targetWeight(world, ENGLISH));
  });

  it("picks something from its own target list, deterministically", () => {
    const world = makeWorld();
    const a = pickTarget(world, spainOnEngland, { seed: 9, state: 9 });
    const b = pickTarget(world, spainOnEngland, { seed: 9, state: 9 });
    expect(a.portKey).toBe(b.portKey);
    expect(campaignTargets(world, spainOnEngland)).toContain(a.portKey!);
  });

  it("picks nothing at all when there is nothing to pick", () => {
    const world = makeWorld({ ports: { [SPANISH]: makePort(SPANISH) } });
    expect(pickTarget(world, spainOnEngland, world.rng).portKey).toBeUndefined();
  });
});

describe("whether anyone sails", () => {
  const spainOnEngland = { attacker: "spain", defender: "england" };

  it("is nothing without a target", () => {
    const world = makeWorld({ ports: { [SPANISH]: makePort(SPANISH) } });
    expect(campaignChance(world, spainOnEngland)).toBe(0);
  });

  it("is nothing once the seas are already full of expeditions", () => {
    const inFlight: WorldEventState[] = [];
    for (let i = 0; i < MAX_CAMPAIGNS_IN_FLIGHT; i++) {
      inFlight.push({
        id: `campaign_${i}`, type: "campaign", startDay: 290, endDay: 320,
        ports: ["belize"], factions: ["france", "england"], severity: 3,
        headline: "news.campaign", vars: {},
      });
    }
    const world = makeWorld({ worldEvents: [war("spain", "england"), ...inFlight] });
    expect(campaignChance(world, spainOnEngland)).toBe(0);
  });

  it("is a small daily number, well under the rate the player raids at", () => {
    const chance = campaignChance(makeWorld(), spainOnEngland);
    expect(chance).toBeGreaterThan(0);
    expect(chance).toBeLessThan(CAMPAIGN_DAILY_BASE * 2);
  });

  it("is nothing for a crown with no harbour left to sail from", () => {
    // Every Spanish colony in other hands: no fleet, no expedition.
    const ports: Record<string, PortRuntimeState> = { [ENGLISH]: makePort(ENGLISH, { defense: 20 }) };
    for (const key of Object.keys(CITIES)) {
      if ((CITIES[key].factionId as unknown as string) === "spain") {
        ports[key] = makePort(key, { factionId: factionId("england") });
      }
    }
    expect(campaignChance(makeWorld({ ports }), spainOnEngland)).toBe(0);
  });
});

describe("fitting out", () => {
  const spainOnEngland = { attacker: "spain", defender: "england" };

  it("writes an event the landing plumbing already knows how to read", () => {
    const world = makeWorld();
    const { event } = launchCampaign(world, spainOnEngland, ENGLISH, world.rng);
    expect(event.type).toBe("campaign");
    expect(event.ports[0]).toBe(ENGLISH);
    expect(event.factions).toEqual(["spain", "england"]);
    expect(Number(event.vars.soldiers)).toBeGreaterThan(0);
    expect(Number(event.vars.guns)).toBeGreaterThan(0);
    const days = Number(event.vars.days);
    expect(days).toBeGreaterThanOrEqual(CAMPAIGN_SAIL_DAYS[0]);
    expect(days).toBeLessThanOrEqual(CAMPAIGN_SAIL_DAYS[1]);
    expect(event.endDay).toBe(world.time.day + days);
  });

  it("puts the news in both empires' harbours, so it can reach the player", () => {
    const world = makeWorld();
    const { event } = launchCampaign(world, spainOnEngland, ENGLISH, world.rng);
    expect(event.ports).toContain(ENGLISH_WEAK);
    expect(event.ports).toContain(SPANISH);
  });

  it("stamps the cooling-off period the moment it sails, not when it lands", () => {
    const world = makeWorld();
    const out = launchCampaign(world, spainOnEngland, ENGLISH, world.rng);
    expect(out.world.ports[ENGLISH].nextCampaignDay).toBe(world.time.day + CAMPAIGN_COOLDOWN_DAYS);
  });

  it("writes a line in the log the taverns can repeat", () => {
    const world = makeWorld();
    const out = launchCampaign(world, spainOnEngland, ENGLISH, world.rng);
    expect(out.world.eventLog.some(e => e.key === "news.campaign")).toBe(true);
  });

  it("sends more against a capital than against an outpost", () => {
    const world = makeWorld({
      ports: {
        [ENGLISH]: makePort(ENGLISH, { defense: 20 }),
        nevis: makePort("nevis", { defense: 20 }),
      },
    });
    const big = launchCampaign(world, spainOnEngland, ENGLISH, { seed: 2, state: 2 });
    const small = launchCampaign(world, spainOnEngland, "nevis", { seed: 2, state: 2 });
    expect(Number(big.event.vars.soldiers)).toBeGreaterThan(Number(small.event.vars.soldiers));
  });

  it("is the same expedition twice from the same seed", () => {
    const world = makeWorld();
    const a = launchCampaign(world, spainOnEngland, ENGLISH, { seed: 6, state: 6 });
    const b = launchCampaign(world, spainOnEngland, ENGLISH, { seed: 6, state: 6 });
    expect(a.event.vars).toEqual(b.event.vars);
  });
});

describe("the daily tick", () => {
  it("does nothing at all in peacetime", () => {
    const world = makeWorld({ worldEvents: [] });
    const tick = tickCampaigns(world);
    expect(campaignsInFlight(tick.world)).toEqual([]);
    expect(tick.events).toEqual([]);
  });

  it("eventually puts something to sea over a long enough war", () => {
    let world = makeWorld();
    let launched = 0;
    for (let day = 0; day < 400 && launched === 0; day++) {
      world = { ...world, time: { ...world.time, day: 300 + day } };
      const tick = tickCampaigns(world);
      world = tick.world;
      launched = campaignsInFlight(world).length;
    }
    expect(launched).toBeGreaterThan(0);
  });

  it("never puts more to sea than the cap allows", () => {
    let world = makeWorld();
    for (let day = 0; day < 600; day++) {
      world = { ...world, time: { ...world.time, day: 300 + day } };
      world = tickCampaigns(world).world;
      expect(campaignsInFlight(world).length).toBeLessThanOrEqual(MAX_CAMPAIGNS_IN_FLIGHT);
    }
  });

  it("moves the rng on, so two days running are not the same day twice", () => {
    const world = makeWorld();
    expect(tickCampaigns(world).world.rng).not.toEqual(world.rng);
  });
});

describe("a campaign that arrives", () => {
  const arriving: WorldEventState = {
    id: "campaign_arrived",
    type: "campaign",
    startDay: 280,
    endDay: 300,
    ports: [ENGLISH],
    factions: ["spain", "england"],
    severity: 3,
    headline: "news.campaign",
    vars: { port: "Port Royale", faction: "Spain", soldiers: 900, guns: 220, days: 20 },
  };

  it("is fought by the same code a relief squadron is, and takes the town", () => {
    const world = makeWorld({
      ports: { [ENGLISH]: makePort(ENGLISH, { defense: 2, garrison: 0 }) },
      worldEvents: [war("spain", "england"), arriving],
    });
    const { result } = resolveRelief(world, arriving, world.rng);
    expect(result.townLost).toBe(true);
    expect(portFaction(result.world, ENGLISH) as unknown as string).toBe("spain");
  });

  it("starts the clock against the new owner, because Spain never founded the place", () => {
    const world = makeWorld({
      ports: { [ENGLISH]: makePort(ENGLISH, { defense: 2, garrison: 0 }) },
      worldEvents: [war("spain", "england"), arriving],
    });
    const { result } = resolveRelief(world, arriving, world.rng);
    expect(result.world.ports[ENGLISH].capturedDay).toBe(world.time.day);
  });

  it("does not count the player into a defence that is none of his business", () => {
    const world = makeWorld({
      ports: { [ENGLISH]: makePort(ENGLISH, { defense: 30, garrison: 0 }) },
      worldEvents: [war("spain", "england"), arriving],
    });
    const atTheHarbour = {
      ...world,
      player: { ...world.player, location: { type: "sea" as const, pos: { ...CITIES[ENGLISH].pos } } },
    };
    const { result } = resolveRelief(atTheHarbour, arriving, atTheHarbour.rng);
    expect(result.playerPresent).toBe(false);
    expect(result.gold).toBe(0);
  });

  it("clears itself out of the world whichever way it goes", () => {
    const world = makeWorld({
      ports: { [ENGLISH]: makePort(ENGLISH, { defense: 30, garrison: 0 }) },
      worldEvents: [war("spain", "england"), arriving],
    });
    const { result } = resolveRelief(world, arriving, world.rng);
    expect(campaignsInFlight(result.world)).toEqual([]);
  });
});
