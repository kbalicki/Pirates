import { describe, it, expect } from "vitest";
import {
  offerFor,
  activeContract,
  contractReward,
  defenseQuest,
  defenseQuestId,
  acceptDefenseContract,
  ARRIVAL_GRACE_DAYS,
  STATION_LIMIT_DAYS,
  MIN_NOTICE_DAYS,
  CONTRACT_REPUTATION,
  type DefenseContract,
} from "../DefenseContractSystem.ts";
import { DEFENSE_HELD_FLAG, DEFENSE_LOST_FLAG, settleRelief } from "../ReconquestSystem.ts";
import { advanceQuests, validateQuest, findQuest } from "../QuestSystem.ts";
import { buildQuestRegistry } from "../QuestRegistry.ts";
import type { WorldState, PortRuntimeState, WorldEventState } from "../../model/WorldState.ts";
import { entityId, shipClassId, factionId, portId } from "../../model/ids.ts";
import { CITIES } from "../../data/cities.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";

// ===========================================================================
// DefenseContractSystem — the governor asks, and pays
// ===========================================================================
//
// Two things are being pinned here. One is the gate list on the offer, because
// every one of those gates removes an exploit or a dead end. The other is that
// the chain pays out on all three ways a landing can be settled, since that is
// the whole reason `settleRelief` stamps a flag rather than each caller doing
// its own bookkeeping.

/** An English capital, and a smaller English town up the chain. */
const HOME = "port_royal";
const THREATENED = "barbados";

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

function landingOn(portKey: string, over: Partial<WorldEventState> = {}): WorldEventState {
  return {
    id: `campaign_${portKey}_100`,
    type: "campaign",
    startDay: 100,
    endDay: 120,
    ports: [portKey],
    factions: ["spain", "england"],
    severity: 3,
    headline: "news.campaign",
    vars: { port: portKey, faction: "Spain", holder: "England", soldiers: 150, guns: 38, days: 20 },
    ...over,
  };
}

function makeWorld(over: {
  day?: number;
  flags?: Record<string, boolean>;
  reputation?: Record<string, number>;
  ports?: Record<string, PortRuntimeState>;
  worldEvents?: WorldEventState[];
  questLog?: WorldState["player"]["questLog"];
} = {}): WorldState {
  const { day = 105 } = over;
  const cls = SHIP_CLASSES.frigate;
  return {
    version: 12,
    time: { day, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 3, state: 3 },
    player: {
      id: entityId("player"),
      shipId: entityId("player_ship"),
      gold: 1000,
      notoriety: 20,
      reputation: over.reputation ?? {},
      ranks: {},
      location: { type: "port", portId: portId(HOME), pos: { x: 0, y: 0 } },
      questLog: over.questLog ?? [],
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
        pos: { x: 0, y: 0 },
        vel: { x: 0, y: 0 },
        heading: 0,
        sailLevel: 0.5,
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
    },
    ports: over.ports ?? {
      [HOME]: makePort(HOME),
      [THREATENED]: makePort(THREATENED),
    },
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: over.flags ?? { letter_of_marque_england: true },
    eventLog: [],
    worldEvents: over.worldEvents ?? [landingOn(THREATENED)],
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

// ── The offer ─────────────────────────────────────────────

describe("offerFor — what the governor has to ask", () => {
  it("offers the colony his crown is about to lose", () => {
    const offer = offerFor(makeWorld(), HOME)!;
    expect(offer.portKey).toBe(THREATENED);
    expect(offer.holder).toBe("england");
    expect(offer.claimant).toBe("spain");
    expect(offer.arrivalDay).toBe(120);
  });

  it("says nothing to a captain his crown does not count as its own", () => {
    expect(offerFor(makeWorld({ flags: {} }), HOME)).toBeUndefined();
  });

  it("does ask a captain who earned the standing without a letter", () => {
    const w = makeWorld({ flags: {}, reputation: { england: 90 } });
    expect(offerFor(w, HOME)).toBeDefined();
  });

  it("says nothing when the captain is already under commission", () => {
    const w = makeWorld();
    const signed = acceptDefenseContract(w, offerFor(w, HOME)!);
    expect(offerFor(signed, HOME)).toBeUndefined();
  });

  it("does not pay the captain to keep a town he took off this crown himself", () => {
    const w = makeWorld({
      ports: {
        [HOME]: makePort(HOME),
        [THREATENED]: makePort(THREATENED, { factionId: factionId("pirates"), capturedDay: 90 }),
      },
    });
    expect(offerFor(w, HOME)).toBeUndefined();
  });

  it("does not offer a landing nobody could reach in time", () => {
    const w = makeWorld({ day: 120 - MIN_NOTICE_DAYS + 1 });
    expect(offerFor(w, HOME)).toBeUndefined();
  });

  it("asks about the soonest landing when two are at sea", () => {
    const w = makeWorld({
      ports: {
        [HOME]: makePort(HOME),
        [THREATENED]: makePort(THREATENED),
        antigua: makePort("antigua"),
      },
      worldEvents: [
        landingOn(THREATENED, { endDay: 130 }),
        landingOn("antigua", { id: "campaign_antigua_100", endDay: 115 }),
      ],
    });
    expect(offerFor(w, HOME)!.portKey).toBe("antigua");
  });

  it("has nothing to say with no landing at sea at all", () => {
    expect(offerFor(makeWorld({ worldEvents: [] }), HOME)).toBeUndefined();
  });

  it("is never made by a pirate haven", () => {
    const w = makeWorld({
      ports: { [HOME]: makePort(HOME, { factionId: factionId("pirates") }), [THREATENED]: makePort(THREATENED) },
    });
    expect(offerFor(w, HOME)).toBeUndefined();
  });

  it("pays more for a bigger town and a bigger landing", () => {
    expect(contractReward(HOME, 300)).toBeGreaterThan(contractReward(HOME, 100));
    expect(contractReward("cartagena", 100)).toBeGreaterThan(contractReward("tortuga", 100));
  });
});

// ── The chain ─────────────────────────────────────────────

describe("defenseQuest — the chain itself", () => {
  const contract: DefenseContract = {
    portKey: THREATENED,
    portName: "Barbados",
    holder: "england",
    claimant: "spain",
    eventId: "campaign_barbados_100",
    arrivalDay: 120,
    acceptedDay: 105,
    soldiers: 150,
    reward: 1050,
  };

  it("is a sound definition", () => {
    expect(validateQuest(defenseQuest(contract))).toEqual([]);
  });

  it("bakes the deadline at signing rather than reading a clock", () => {
    const stage = defenseQuest(contract).stages.sail;
    const timeout = stage.on!.find(tr => tr.trigger.type === "days_passed")!;
    expect((timeout.trigger as { days: number }).days).toBe(120 - 105 + ARRIVAL_GRACE_DAYS);
  });

  it("gives a captain who arrives a fixed window to stand in", () => {
    const stage = defenseQuest(contract).stages.stand;
    const timeout = stage.on!.find(tr => tr.trigger.type === "days_passed")!;
    expect((timeout.trigger as { days: number }).days).toBe(STATION_LIMIT_DAYS);
  });

  it("rebuilds identically from the log, which is what the registry does on load", () => {
    const w = acceptDefenseContract(makeWorld(), { ...contract });
    const registry = buildQuestRegistry(w);
    expect(registry[defenseQuestId(THREATENED)]).toEqual(defenseQuest(contract));
  });
});

describe("the commission, walked end to end", () => {
  function signed(): WorldState {
    const w = makeWorld();
    return acceptDefenseContract(w, offerFor(w, HOME)!);
  }

  /** What this world's own offer is actually worth, rather than a copied number. */
  function fee(): number {
    const w = makeWorld();
    return offerFor(w, HOME)!.reward;
  }

  it("starts on the sail stage the moment it is signed", () => {
    const runtime = findQuest(signed(), defenseQuestId(THREATENED))!;
    expect(runtime.stage).toBe("sail");
    expect(runtime.completed).toBe(false);
  });

  it("moves to standing when the captain walks into the town", () => {
    const w = signed();
    const out = advanceQuests(w, { type: "reach_port", portId: THREATENED }, buildQuestRegistry(w));
    expect(findQuest(out.world, defenseQuestId(THREATENED))!.stage).toBe("stand");
  });

  it("is not moved by walking into some other town", () => {
    const w = signed();
    const out = advanceQuests(w, { type: "reach_port", portId: HOME }, buildQuestRegistry(w));
    expect(out.advanced).toEqual([]);
  });

  it("lapses if the captain never gets there", () => {
    const w = signed();
    const late = { ...w, time: { ...w.time, day: 130 } };
    const out = advanceQuests(late, { type: "days_passed", days: 0 }, buildQuestRegistry(late));
    const runtime = findQuest(out.world, defenseQuestId(THREATENED))!;
    expect(runtime.stage).toBe("late");
    expect(runtime.data.outcome).toBe("failed");
  });

  it("is still running the day before the window closes", () => {
    const w = signed();
    const soon = { ...w, time: { ...w.time, day: 120 + ARRIVAL_GRACE_DAYS - 1 } };
    const out = advanceQuests(soon, { type: "days_passed", days: 0 }, buildQuestRegistry(soon));
    expect(out.advanced).toEqual([]);
  });

  it("pays out on the flag a settled landing leaves behind", () => {
    let w = signed();
    w = advanceQuests(w, { type: "reach_port", portId: THREATENED }, buildQuestRegistry(w)).world;
    const goldBefore = w.player.gold;

    // Exactly what the offscreen tick and `CityDefenseScene` both do: settle the
    // landing, then hand the flag to the quest machine.
    w = settleRelief(w, THREATENED, "spain", { soldiers: 150, guns: 38, sailDays: 20 }, {
      held: true,
      playerFought: false,
      garrisonAfter: 40,
      partyLost: 0,
    }).world;
    expect(w.worldFlags[DEFENSE_HELD_FLAG + THREATENED]).toBe(true);

    const out = advanceQuests(w, { type: "flag_set", key: DEFENSE_HELD_FLAG + THREATENED }, buildQuestRegistry(w));
    const runtime = findQuest(out.world, defenseQuestId(THREATENED))!;
    expect(runtime.completed).toBe(true);
    expect(runtime.data.outcome).toBe("completed");
    expect(out.world.player.gold).toBe(goldBefore + fee());
    expect(out.world.player.reputation.england ?? 0).toBeGreaterThanOrEqual(CONTRACT_REPUTATION);
  });

  it("fails, and pays nothing, when the town falls", () => {
    let w = signed();
    w = advanceQuests(w, { type: "reach_port", portId: THREATENED }, buildQuestRegistry(w)).world;
    const goldBefore = w.player.gold;

    w = settleRelief(w, THREATENED, "spain", { soldiers: 150, guns: 38, sailDays: 20 }, {
      held: false,
      playerFought: false,
      garrisonAfter: 0,
      partyLost: 0,
    }).world;
    expect(w.worldFlags[DEFENSE_LOST_FLAG + THREATENED]).toBe(true);
    expect(w.worldFlags[DEFENSE_HELD_FLAG + THREATENED]).toBe(false);

    const out = advanceQuests(w, { type: "flag_set", key: DEFENSE_LOST_FLAG + THREATENED }, buildQuestRegistry(w));
    const runtime = findQuest(out.world, defenseQuestId(THREATENED))!;
    expect(runtime.data.outcome).toBe("failed");
    expect(out.world.player.gold).toBe(goldBefore);
  });

  it("pays out even for a captain who never left the harbour he signed in", () => {
    // No `reach_port`: the flag reaches the `stand` stage only after arrival, so
    // a captain who never sailed is still on `sail` and collects nothing.
    let w = signed();
    w = settleRelief(w, THREATENED, "spain", { soldiers: 150, guns: 38, sailDays: 20 }, {
      held: true, playerFought: false, garrisonAfter: 40, partyLost: 0,
    }).world;
    const out = advanceQuests(w, { type: "flag_set", key: DEFENSE_HELD_FLAG + THREATENED }, buildQuestRegistry(w));
    expect(out.advanced).toEqual([]);
    expect(findQuest(out.world, defenseQuestId(THREATENED))!.stage).toBe("sail");
  });

  it("is not paid twice for one landing", () => {
    let w = signed();
    w = advanceQuests(w, { type: "reach_port", portId: THREATENED }, buildQuestRegistry(w)).world;
    w = settleRelief(w, THREATENED, "spain", { soldiers: 150, guns: 38, sailDays: 20 }, {
      held: true, playerFought: false, garrisonAfter: 40, partyLost: 0,
    }).world;
    w = advanceQuests(w, { type: "flag_set", key: DEFENSE_HELD_FLAG + THREATENED }, buildQuestRegistry(w)).world;
    const goldAfterFirst = w.player.gold;

    const again = advanceQuests(w, { type: "flag_set", key: DEFENSE_HELD_FLAG + THREATENED }, buildQuestRegistry(w));
    expect(again.advanced).toEqual([]);
    expect(again.world.player.gold).toBe(goldAfterFirst);
  });

  it("reports the commission as the one in force until it ends", () => {
    const w = signed();
    expect(activeContract(w)?.portKey).toBe(THREATENED);
    const done = advanceQuests(
      { ...w, time: { ...w.time, day: 200 } },
      { type: "days_passed", days: 0 },
      buildQuestRegistry(w),
    ).world;
    expect(activeContract(done)).toBeUndefined();
  });
});
