import { describe, it, expect } from "vitest";
import { sneakChance, SNEAK_BASE, SNEAK_PER_MORALE, SNEAK_PER_NOTORIETY } from "../PortAccessSystem.ts";
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
