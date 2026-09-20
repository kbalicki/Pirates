import { describe, it, expect } from "vitest";
import {
  squadronCap, squadronStowed, squadronRoom, squadronHeld, squadronManifest,
  stowInSquadron, drawFromSquadron, detachConsort, consortCargo, stowedIn,
  spillIfDetached, consortCargoCap,
} from "../HoldSystem.ts";
import { computePrize } from "../PrizeSystem.ts";
import { executeBuy, executeSell } from "../EconomySystem.ts";
import { addToFleet } from "../FleetSystem.ts";
import { sellFleetShip, abandonFleetShip } from "../PortInteractionSystem.ts";
import { settleDefeat } from "../DefeatSystem.ts";
import { validateWorldState } from "../../services/Validation.ts";
import { CITIES } from "../../data/cities.ts";
import { ITEMS } from "../../data/items.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { initPortPrices, initPortInventory } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId, factionId, shipClassId, itemId } from "../../model/ids.ts";
import type { WorldState, PortRuntimeState, FleetShip } from "../../model/WorldState.ts";
import type { EntityState, ShipData } from "../../model/EntityState.ts";

// ===========================================================================
// The squadron has one hold (v0.77.0)
// ===========================================================================

/**
 * Two things about the hold were wrong, and they were wrong in opposite
 * directions.
 *
 * **The consorts had no hold at all.** `FleetShip` carried a hull, guns, crew,
 * morale, training and wounded, and no `cargo` field — so the shipyard's list
 * printed a merchantman's two hundred and fifty tons in its own column, the
 * captain paid four figures for her, and she added nothing whatever to what he
 * could carry. Worse at sea: `SALVAGE_TAKEN = 1` has carried the comment *"she
 * is yours, hold and all"* since v0.22.0 while `computePrize` clamped the take
 * to the flagship's room and called the rest `spilled`. Measured over the nine
 * classes, taken by the common forty-ton sloop:
 *
 * | prize | aboard | taken | in the water |
 * |---|---|---|---|
 * | fluyt, deep-laden | 162 | 40 | **122** |
 * | galleon, deep-laden | 135 | 40 | 95 |
 * | merchantman, deep-laden | 225 | 40 | **185 (82%)** |
 *
 * — 54% of every prize's cargo across all nine, thrown over the side of a hull
 * that was now his own.
 *
 * **And `ItemDef.weight` was a capacity rule that could not hold.** It had two
 * readers: the check in `executeBuy` and the counter's `roomToBuy`, which was
 * written to match it. Both compared `weight * qty` against a sum of *tons*
 * already stowed — two units in one comparison. What came out was not a limit
 * on the hold but a throttle on a single transaction: `sugar_cane` is the only
 * good weighing 2 and it is grown in **23 of the map's 45 ports**, and an empty
 * forty-ton sloop took 20 tons of it, then 10, then 5, 2, 1, 1 — six presses of
 * "everything the hold will take", ending at **39 of 40**.
 *
 * Whether to make weight real instead was a question for the numbers, and they
 * answered it. On a settled Caribbean, profit per ton of hold-space:
 * sugar **3**, tobacco 9, rum 12, cocoa 13. Sugar is already the weakest trade
 * per ton (6 against cocoa's 13); doubling its bulk makes the most-grown good
 * on the map one no captain would ever load. So the hold counts tons — one
 * unit, the one that `Validation`, `PrizeSystem` and the burgee already used —
 * and the field is gone.
 */

function makeShipData(over: Partial<ShipData> = {}): ShipData {
  return {
    classId: shipClassId("sloop"),
    factionId: factionId("england"),
    hullHp: 100, hullMax: 100,
    sailsHp: 100, sailsMax: 100,
    cannons: 8,
    cargo: {},
    cargoCap: SHIP_CLASSES.sloop.cargoCap,
    crew: { current: 30, max: 50, morale: 0.8 },
    ...over,
  };
}

function makePort(key: string): PortRuntimeState {
  const b = getPortBaseline(key);
  return {
    portId: portId(key), factionId: CITIES[key].factionId,
    prices: initPortPrices(key), inventory: initPortInventory(key),
    shipyardQueue: [], availableCrew: 10,
    population: b.population, wealth: b.wealth, defense: b.defense, bonusProduces: [],
  };
}

function makeWorld(ship: ShipData, fleet: FleetShip[] = []): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  for (const key of Object.keys(CITIES)) ports[key] = makePort(key);
  const entity: EntityState = {
    id: entityId("player_ship"), kind: "ship", mode: "sailing",
    pos: { x: 100, y: 100 }, vel: { x: 0, y: 0 },
    heading: 0, sailLevel: 0.5, depthOffset: 0, ship,
  };
  return {
    version: 13,
    time: { day: 100, hour: 12, minute: 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"), shipId: entityId("player_ship"), gold: 100000,
      notoriety: 0, reputation: {}, ranks: {},
      location: { type: "port", portId: portId("havana"), pos: { x: 100, y: 100 } },
      questLog: [], fleet, lastPlunderDay: 1, citiesCaptured: 0, courtship: {},
    },
    entities: { player_ship: entity }, ports,
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: {}, eventLog: [], worldEvents: [], knownEventIds: [],
    playerName: "Captain", eraId: "pirates_sunset", startYear: 1690, gameSpeed: 1.2,
    captain: {
      nationality: "england",
      skills: { fencing: 5, gunnery: 5, navigation: 5, medicine: 5, charm: 5 },
      startAge: 20, training: 0.3,
    },
  } as WorldState;
}

function consort(classId: string, cargo?: Record<string, number>): FleetShip {
  const cls = SHIP_CLASSES[classId];
  return {
    classId,
    hullHp: cls.hullMax, hullMax: cls.hullMax,
    sailsHp: cls.sailsMax, sailsMax: cls.sailsMax,
    cannons: cls.cannons,
    crew: Math.round(cls.crewMax * 0.8), morale: 0.8,
    ...(cargo ? { cargo } : {}),
  };
}

const STAPLE = "sugar_cane";

/** Just the hold's own invariant — the harness above is not a whole save. */
function cargoErrors(world: WorldState): string[] {
  return validateWorldState(world).filter(e => e.field.endsWith(".cargo")).map(e => e.field);
}

// ── One unit, and it is the ton ────────────────────────────────────────────

describe("the hold is counted in tons and nothing else", () => {
  it("has no weight left in the goods table to count instead", () => {
    // The table is data, and the assertion is about the shape it now has: a
    // good is a price, a legality and a category. Nothing in the game weighs.
    for (const [key, def] of Object.entries(ITEMS)) {
      expect(Object.keys(def), key).not.toContain("weight");
    }
  });

  it("lets a captain fill an empty hold with the map's staple in one press", () => {
    // Twenty tons, then ten, then five, two, one, one — and thirty-nine of
    // forty at the end of it. `sugar_cane` is grown in 23 of the 45 ports.
    const w = makeWorld(makeShipData());
    const bought = executeBuy(w, portId("havana"), itemId(STAPLE), 40);
    expect(bought.error).toBeUndefined();
    expect(squadronStowed(bought.world)).toBe(40);
    expect(squadronRoom(bought.world)).toBe(0);
  });

  it("refuses the ton that would not fit, and says why", () => {
    const w = makeWorld(makeShipData());
    const bought = executeBuy(w, portId("havana"), itemId(STAPLE), 41);
    expect(bought.error).toBe("Not enough cargo space");
    expect(squadronStowed(bought.world)).toBe(0);
  });
});

// ── The squadron's hold ────────────────────────────────────────────────────

describe("a consort is a hold", () => {
  it("counts her class's capacity into the squadron's", () => {
    const w = makeWorld(makeShipData(), [consort("merchantman")]);
    expect(squadronCap(w)).toBe(SHIP_CLASSES.sloop.cargoCap + SHIP_CLASSES.merchantman.cargoCap);
    expect(squadronRoom(w)).toBe(squadronCap(w));
  });

  it("answers an empty hold for a hull from a save written before v0.77.0", () => {
    // No migration step: the field is optional and `consortCargo` answers `{}`,
    // exactly as `crew`, `morale` and `training` did before it.
    const old = consort("brigantine");
    expect(old.cargo).toBeUndefined();
    expect(consortCargo(old)).toEqual({});
    expect(stowedIn(consortCargo(old))).toBe(0);
  });

  it("fills the flagship first and spills into the consorts after her", () => {
    const w = makeWorld(makeShipData(), [consort("merchantman")]);
    const stowed = stowInSquadron(w, { [STAPLE]: 200 });
    expect(stowed.spilled).toEqual({});
    expect(stowed.world.entities.player_ship.ship?.cargo[STAPLE]).toBe(SHIP_CLASSES.sloop.cargoCap);
    expect(consortCargo(stowed.world.player.fleet[0])[STAPLE])
      .toBe(200 - SHIP_CLASSES.sloop.cargoCap);
  });

  it("hands back what the whole squadron could not take", () => {
    const w = makeWorld(makeShipData(), [consort("pinnace")]);
    const stowed = stowInSquadron(w, { [STAPLE]: 100 });
    expect(stowedIn(stowed.stowed)).toBe(squadronCap(w));
    expect(stowed.spilled[STAPLE]).toBe(100 - squadronCap(w));
  });

  it("buys into the consort once the flagship is full", () => {
    const w = makeWorld(makeShipData(), [consort("fluyt")]);
    const bought = executeBuy(w, portId("havana"), itemId(STAPLE), 60);
    expect(bought.error).toBeUndefined();
    expect(squadronHeld(bought.world, STAPLE)).toBe(60);
    expect(consortCargo(bought.world.player.fleet[0])[STAPLE]).toBe(20);
  });

  it("sells what is stowed in a consort, not only what is under the captain's feet", () => {
    const w = makeWorld(makeShipData(), [consort("fluyt", { [STAPLE]: 30 })]);
    expect(squadronHeld(w, STAPLE)).toBe(30);
    const sold = executeSell(w, portId("havana"), itemId(STAPLE), 30);
    expect(sold.error).toBeUndefined();
    expect(squadronHeld(sold.world, STAPLE)).toBe(0);
    expect(sold.world.player.gold).toBeGreaterThan(w.player.gold);
  });

  it("empties the flagship before it touches a consort's hold", () => {
    const w = makeWorld(
      makeShipData({ cargo: { [STAPLE]: 10 } }),
      [consort("fluyt", { [STAPLE]: 30 })],
    );
    const drawn = drawFromSquadron(w, STAPLE, 15);
    expect(drawn.taken).toBe(15);
    expect(drawn.world.entities.player_ship.ship?.cargo[STAPLE]).toBeUndefined();
    expect(consortCargo(drawn.world.player.fleet[0])[STAPLE]).toBe(25);
  });

  it("names everything the squadron carries in one manifest", () => {
    const w = makeWorld(
      makeShipData({ cargo: { [STAPLE]: 10, cocoa: 4 } }),
      [consort("fluyt", { [STAPLE]: 30, rum: 2 })],
    );
    expect(squadronManifest(w)).toEqual({ [STAPLE]: 40, cocoa: 4, rum: 2 });
    expect(squadronStowed(w)).toBe(46);
  });
});

// ── She is yours, hold and all ─────────────────────────────────────────────

describe("a prize keeps what would have gone over the side", () => {
  const laden = (classId: string, tons: number): ShipData => makeShipData({
    classId: shipClassId(classId),
    cargoCap: SHIP_CLASSES[classId].cargoCap,
    cargo: { cocoa: tons },
  });

  it("still fills the flagship first when she is taken", () => {
    const prize = computePrize(laden("merchantman", 225), makeShipData(), "captured");
    expect(prize.taken.cocoa).toBe(SHIP_CLASSES.sloop.cargoCap);
    expect(prize.spilled.cocoa).toBe(225 - SHIP_CLASSES.sloop.cargoCap);
  });

  it("takes an empty consort's room across as well", () => {
    const prize = computePrize(
      laden("merchantman", 225), makeShipData(), "captured",
      SHIP_CLASSES.fluyt.cargoCap,
    );
    expect(prize.taken.cocoa).toBe(SHIP_CLASSES.sloop.cargoCap + SHIP_CLASSES.fluyt.cargoCap);
  });

  it("joins the fleet carrying the remainder rather than losing it", () => {
    // The whole point: `SALVAGE_TAKEN = 1` says she is yours, hold and all.
    const spilled = { cocoa: 185 };
    const fleet = addToFleet([], "merchantman", 0.3, { crew: 40, morale: 0.5 }, spilled);
    expect(fleet).not.toBeNull();
    expect(consortCargo(fleet![0])).toEqual(spilled);
    const w = makeWorld(makeShipData({ cargo: { cocoa: 40 } }), fleet!);
    expect(squadronHeld(w, "cocoa")).toBe(225);
    expect(cargoErrors(w)).toEqual([]);
  });

  it("leaves a hull that sank spilling as she always did", () => {
    // Nothing joins the fleet off the bottom, so the water still gets it.
    const prize = computePrize(laden("merchantman", 200), makeShipData(), "win");
    expect(stowedIn(prize.spilled)).toBeGreaterThan(0);
  });
});

// ── And a hull that leaves takes her hold with her ─────────────────────────

describe("what a consort carries goes where she goes", () => {
  it("moves into the hulls that stay, as far as they will take it", () => {
    const w = makeWorld(makeShipData(), [consort("fluyt", { cocoa: 20 })]);
    const gone = detachConsort(w, 0);
    expect(gone.lost).toEqual({});
    expect(gone.world.entities.player_ship.ship?.cargo.cocoa).toBe(20);
    expect(gone.world.player.fleet).toHaveLength(0);
  });

  it("loses what will not fit, and the journal says so", () => {
    const w = makeWorld(makeShipData({ cargo: { cocoa: 35 } }), [consort("fluyt", { cocoa: 100 })]);
    const sold = sellFleetShip(w, 0);
    expect(sold.sold).toBe(true);
    // Five tons of room in the sloop, a hundred in the hull being sold.
    expect(sold.cargoLost?.cocoa).toBe(95);
    expect(squadronHeld(sold.world, "cocoa")).toBe(40);
    expect(sold.world.eventLog.some(e => e.key === "event.escort_cargo_lost")).toBe(true);
  });

  it("says nothing about cargo when she was sailing empty", () => {
    const w = makeWorld(makeShipData(), [consort("fluyt")]);
    const sold = sellFleetShip(w, 0);
    expect(sold.cargoLost).toBeUndefined();
    expect(sold.world.eventLog.some(e => e.key === "event.escort_cargo_lost")).toBe(false);
  });

  it("takes it down with her when she is abandoned at sea", () => {
    const w = makeWorld(makeShipData({ cargo: { cocoa: 40 } }), [consort("fluyt", { cocoa: 100 })]);
    const left = abandonFleetShip(w, 0);
    expect(squadronHeld(left, "cocoa")).toBe(40);
    expect(left.eventLog.some(e => e.key === "event.escort_cargo_lost")).toBe(true);
  });

  it("does not throw the heir's own cargo out to make room for the salvage", () => {
    // The flagship goes down and the flag shifts to a consort (v0.59.0). She
    // was carrying something of her own before the boats reached her.
    const w = makeWorld(
      makeShipData({ cargo: { cocoa: 30 }, hullHp: 0, crew: { current: 20, max: 50, morale: 0.5 } }),
      [consort("fluyt", { rum: 40 })],
    );
    const beaten = settleDefeat(w, "spain", "navy");
    const cargo = beaten.world.entities.player_ship.ship?.cargo ?? {};
    expect(cargo.rum).toBe(40);
    expect(stowedIn(cargo)).toBeLessThanOrEqual(SHIP_CLASSES.fluyt.cargoCap);
  });
});

// ===========================================================================
// She sails with what is in her, and the screen says so first (v0.80.0)
// ===========================================================================

/**
 * v0.77.0 gave a consort a hold and left the two screens that dispose of her
 * saying nothing about it. `[Sell]` in the yard and `[Abandon]` in the cabin
 * were each **one unconfirmed press**, and the yard's row printed her class and
 * her hull and not one word about her cargo — the cabin's row had printed it
 * since v0.77.0, which is the screen the captain is *not* on when he sells her.
 *
 * Measured across all 81 pairings of flagship and consort, at a full squadron
 * and cocoa at its base price: what goes with her is worth **more than the yard
 * pays for the hull in every single pairing** — median four times over, worst
 * 6.3 (any flagship with a merchantman alongside: 250 tons against 800 gold).
 * A sloop with a merchantman keeps **86%** of the squadron's hold in the hull
 * being sold.
 *
 * The same measurement is why there is **no transfer screen**. Which hull
 * carries what has exactly two consequences in the whole codebase — a consort
 * leaving, and the flag shifting to her when the flagship goes down — and
 * neither is something a captain can plan around. Everything else reads the
 * squadron. So the cure is to be told and to be asked, not to be given a
 * screenful of arrows.
 */

describe("a forecast made by the rule that will do the moving", () => {
  it("names the tons the sale would cost, before the sale", () => {
    const w = makeWorld(makeShipData({ cargo: { cocoa: 35 } }), [consort("fluyt", { cocoa: 100 })]);
    // Five tons of room in the sloop, a hundred in the hull being sold.
    expect(stowedIn(spillIfDetached(w, 0))).toBe(95);
    // And it is a forecast: nothing has moved.
    expect(squadronHeld(w, "cocoa")).toBe(135);
    expect(w.player.fleet).toHaveLength(1);
  });

  it("agrees with what the sale actually does, every time", () => {
    // The screen must not answer with its own arithmetic (v0.77.0's lesson
    // from `showBattleResult`, pointing forwards instead of back).
    for (const cls of Object.keys(SHIP_CLASSES)) {
      for (const aboard of [0, 10, SHIP_CLASSES[cls].cargoCap]) {
        const w = makeWorld(makeShipData({ cargo: { cocoa: 30 } }), [consort(cls, { cocoa: aboard })]);
        const forecast = stowedIn(spillIfDetached(w, 0));
        const sold = sellFleetShip(w, 0);
        expect(stowedIn(sold.cargoLost ?? {}), `${cls} with ${aboard}t`).toBe(forecast);
      }
    }
  });

  it("forecasts nothing for a hull sailing empty", () => {
    const w = makeWorld(makeShipData(), [consort("merchantman")]);
    expect(spillIfDetached(w, 0)).toEqual({});
  });

  it("forecasts nothing when the hulls that stay can take it all", () => {
    const w = makeWorld(makeShipData(), [consort("pinnace", { cocoa: 15 })]);
    expect(spillIfDetached(w, 0)).toEqual({});
  });

  it("answers for an index that is not a hull", () => {
    const w = makeWorld(makeShipData(), [consort("fluyt", { cocoa: 100 })]);
    expect(spillIfDetached(w, 7)).toEqual({});
    expect(spillIfDetached(w, -1)).toEqual({});
  });
});

describe("the measurement that decided against a transfer screen", () => {
  it("puts the larger half of the squadron's hold in the consort, in most pairings", () => {
    // Not a rare case: across the 81 pairings the consort holds half the
    // squadron's capacity on average, and a merchantman alongside anything
    // holds 63-93% of it.
    const ids = Object.keys(SHIP_CLASSES);
    let sum = 0;
    for (const f of ids) {
      for (const c of ids) {
        sum += SHIP_CLASSES[c].cargoCap / (SHIP_CLASSES[f].cargoCap + SHIP_CLASSES[c].cargoCap);
      }
    }
    expect(sum / (ids.length * ids.length)).toBeCloseTo(0.5, 2);

    const sloopAndMerchantman =
      SHIP_CLASSES.merchantman.cargoCap / (SHIP_CLASSES.sloop.cargoCap + SHIP_CLASSES.merchantman.cargoCap);
    expect(sloopAndMerchantman).toBeGreaterThan(0.85);
  });

  it("is worth more than the yard pays for the hull, in every pairing", () => {
    // Cocoa at its base price of 20, which is the middling good of the six.
    const PER_TON = 20;
    for (const c of Object.keys(SHIP_CLASSES)) {
      const worth = SHIP_CLASSES[c].cargoCap * PER_TON;
      const yardPays = Math.floor(SHIP_CLASSES[c].buyPrice * 0.4);
      expect(worth, `${c}`).toBeGreaterThan(yardPays);
    }
  });

  it("gives a consort's hold exactly two consequences, and a screen cannot help with either", () => {
    // If a third reader of a *particular* hull's cargo ever appears, this
    // release's conclusion stops holding and the transfer screen comes back on
    // the table. Both of these are events, not decisions.
    const w = makeWorld(makeShipData({ cargo: { cocoa: 30 } }), [consort("fluyt", { rum: 40 })]);
    // 1. She leaves.
    expect(stowedIn(spillIfDetached(w, 0))).toBeGreaterThan(0);
    // 2. The flag shifts to her, and her own cargo limits the salvage.
    expect(consortCargoCap(w.player.fleet![0])).toBe(SHIP_CLASSES.fluyt.cargoCap);
    // Everything else asks the squadron, which does not care where a ton lies.
    expect(squadronHeld(w, "rum")).toBe(40);
    expect(squadronHeld(w, "cocoa")).toBe(30);
  });
});

// ── The invariant follows the cargo ────────────────────────────────────────

describe("a consort's hold is held to the same rule as the flagship's", () => {
  it("passes when she is within her class's capacity", () => {
    const w = makeWorld(makeShipData(), [consort("pinnace", { cocoa: SHIP_CLASSES.pinnace.cargoCap })]);
    expect(cargoErrors(w)).toEqual([]);
  });

  it("is caught when something has overloaded her", () => {
    const w = makeWorld(makeShipData(), [consort("pinnace", { cocoa: SHIP_CLASSES.pinnace.cargoCap + 1 })]);
    expect(cargoErrors(w)).toEqual(["player.fleet[0].cargo"]);
  });
});
