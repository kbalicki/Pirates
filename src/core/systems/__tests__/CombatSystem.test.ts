import { describe, it, expect } from "vitest";
import {
  effectiveReloadTicks,
  CANNON_COOLDOWN_TICKS,
  CANNON_DAMAGE_HULL,
  CANNON_DAMAGE_SAILS,
  CANNON_DAMAGE_CREW,
} from "../CombatSystem.ts";

// ===========================================================================
// effectiveReloadTicks — broadside cadence (v0.9.8.0)
// ===========================================================================

/**
 * Base cadence is 9 s (180 ticks at 20 ticks/s). Three independent factors
 * slow it down, each contributing a multiplier:
 *
 *   crewMul     0.70 .. 1.00   ramp over crew fraction 20% .. 100%
 *   moraleMul   0.80 .. 1.00
 *   trainingMul 0.75 .. 1.00
 *
 * ticks = 180 / (crewMul × moraleMul × trainingMul), so the worst case is
 * 180 / 0.42 ≈ 429 ticks ≈ 21 s and the best case is exactly 180.
 */
describe("effectiveReloadTicks", () => {
  const perfect = () => effectiveReloadTicks(30, 30, 1.0, 1.0);
  const worst = () => effectiveReloadTicks(0, 30, 0, 0);

  it("a full, brave, veteran crew reloads at the base cadence", () => {
    expect(perfect()).toBe(CANNON_COOLDOWN_TICKS);
  });

  it("the worst crew imaginable is slower but never stalls", () => {
    expect(worst()).toBeGreaterThan(perfect());
    expect(worst()).toBeLessThan(CANNON_COOLDOWN_TICKS * 3);
    expect(Number.isFinite(worst())).toBe(true);
  });

  it("each factor on its own slows the guns down", () => {
    expect(effectiveReloadTicks(6, 30, 1.0, 1.0)).toBeGreaterThan(perfect()); // crew
    expect(effectiveReloadTicks(30, 30, 0.0, 1.0)).toBeGreaterThan(perfect()); // morale
    expect(effectiveReloadTicks(30, 30, 1.0, 0.0)).toBeGreaterThan(perfect()); // training
  });

  it("crew below 20% is already at the floor — losing more hands costs nothing", () => {
    const atFloor = effectiveReloadTicks(6, 30, 1.0, 1.0); // exactly 20%
    expect(effectiveReloadTicks(3, 30, 1.0, 1.0)).toBe(atFloor);
    expect(effectiveReloadTicks(0, 30, 1.0, 1.0)).toBe(atFloor);
  });

  it("reload time falls monotonically as the crew grows", () => {
    let prev = Infinity;
    for (let crew = 0; crew <= 30; crew++) {
      const ticks = effectiveReloadTicks(crew, 30, 0.8, 0.5);
      expect(ticks).toBeLessThanOrEqual(prev);
      prev = ticks;
    }
  });

  it("reload time falls monotonically as morale and training rise", () => {
    let prevMorale = Infinity;
    let prevTraining = Infinity;
    for (let i = 0; i <= 10; i++) {
      const m = effectiveReloadTicks(30, 30, i / 10, 0.5);
      const t = effectiveReloadTicks(30, 30, 0.5, i / 10);
      expect(m).toBeLessThanOrEqual(prevMorale);
      expect(t).toBeLessThanOrEqual(prevTraining);
      prevMorale = m;
      prevTraining = t;
    }
  });

  it("clamps out-of-range morale and training instead of going haywire", () => {
    expect(effectiveReloadTicks(30, 30, 5, 5)).toBe(perfect());
    expect(effectiveReloadTicks(30, 30, -3, -3)).toBe(effectiveReloadTicks(30, 30, 0, 0));
  });

  it("survives a zero crewMax without dividing by zero", () => {
    const ticks = effectiveReloadTicks(0, 0, 1, 1);
    expect(Number.isFinite(ticks)).toBe(true);
    expect(ticks).toBeGreaterThan(0);
  });

  it("returns whole ticks — the combat loop counts integers", () => {
    for (const crew of [0, 7, 13, 30]) {
      for (const morale of [0, 0.37, 1]) {
        expect(Number.isInteger(effectiveReloadTicks(crew, 30, morale, 0.42))).toBe(true);
      }
    }
  });

  it("the documented worst case is about 21 s, not minutes", () => {
    // 180 / (0.70 × 0.80 × 0.75) = 428.6 ticks = 21.4 s at 20 ticks/s
    expect(worst() / 20).toBeGreaterThan(15);
    expect(worst() / 20).toBeLessThan(25);
  });
});

describe("damage constants", () => {
  it("hull, sails and crew damage are all positive and ordered as tuned", () => {
    expect(CANNON_DAMAGE_HULL).toBeGreaterThan(0);
    expect(CANNON_DAMAGE_SAILS).toBeGreaterThan(0);
    expect(CANNON_DAMAGE_CREW).toBeGreaterThan(0);
    // Grape shot aside, a broadside kills more men than it opens planks.
    expect(CANNON_DAMAGE_CREW).toBeGreaterThan(CANNON_DAMAGE_HULL);
  });
});
