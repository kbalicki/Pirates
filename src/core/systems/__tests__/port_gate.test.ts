import { describe, it, expect } from "vitest";
import {
  sneakChance, SNEAK_BASE, SNEAK_PER_MORALE, SNEAK_PER_NOTORIETY,
  gateWatchFencing, settleGateFightLost, GATE_FIGHT_LOSS_SHARE,
} from "../PortAccessSystem.ts";
import { familyGuardFencing, FAMILY_GUARDS_MEN, FAMILY_GUARDS_OF } from "../FamilyQuestSystem.ts";
import { enemyFencingFor } from "../DuelSystem.ts";
import type { WorldState } from "../../model/WorldState.ts";
import { fleetShipResale, FLEET_RESALE_SHARE } from "../PortInteractionSystem.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";

/**
 * Two rules that lived on a screen until v0.99.7: the chance of slipping into
 * a hostile harbour under a false flag (`PortApproachScene`), and the yard's
 * offer for a consort (printed by `PortScene` from its own `buyPrice * 0.4`
 * beside the engine's). The first is unchanged; the second was right and is
 * now the one number.
 */
describe("slipping into a hostile harbour", () => {
  it("is the same chance the screen rolled against", () => {
    expect(sneakChance(0.8, 0)).toBeCloseTo(SNEAK_BASE + 0.8 * SNEAK_PER_MORALE, 9);
    expect(sneakChance(0.8, 0)).toBeCloseTo(0.74, 9);
    expect(sneakChance(0.8, 100)).toBeCloseTo(0.74 - 100 * SNEAK_PER_NOTORIETY, 9);
  });

  it("stays a chance", () => {
    expect(sneakChance(0, 1000)).toBe(0);
    expect(sneakChance(5, 0)).toBe(1);
  });
});

describe("the yard's offer for a consort", () => {
  it("is a share of her list price", () => {
    for (const [key, cls] of Object.entries(SHIP_CLASSES)) {
      expect(fleetShipResale(key), key).toBe(Math.floor(cls.buyPrice * FLEET_RESALE_SHARE));
    }
    expect(fleetShipResale("no_such_class")).toBe(0);
  });
});

describe("the fight with the watch at the gate (v0.99.8)", () => {
  const world = (defense: number, gold = 1000, notoriety = 0) =>
    ({ player: { gold, notoriety }, ports: { havana: { defense } } }) as unknown as WorldState;

  it("meets a better watch in a better-defended town", () => {
    expect(gateWatchFencing(world(80), "havana")).toBeGreaterThan(gateWatchFencing(world(20), "havana"));
    expect(gateWatchFencing(world(60), "havana")).toBe(enemyFencingFor(60, 100, 0));
  });

  it("meets a better watch the more famous he is", () => {
    expect(gateWatchFencing(world(50, 0, 50), "havana")).toBeGreaterThan(gateWatchFencing(world(50, 0, 0), "havana"));
  });

  it("costs a quarter of the purse when lost", () => {
    expect(GATE_FIGHT_LOSS_SHARE).toBe(0.25);
    const r = settleGateFightLost(world(50, 1003));
    expect(r.gold).toBe(250);
    expect(r.world.player.gold).toBe(753);
  });
});

describe("the marquis' men in the family thread", () => {
  it("are the thirty of forty-five the tavern screen typed", () => {
    expect(familyGuardFencing(10)).toBe(enemyFencingFor(FAMILY_GUARDS_MEN, FAMILY_GUARDS_OF, 10));
    expect([FAMILY_GUARDS_MEN, FAMILY_GUARDS_OF]).toEqual([30, 45]);
  });
});
