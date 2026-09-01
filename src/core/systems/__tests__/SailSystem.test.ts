import { describe, it, expect } from "vitest";
import { SailSystem, SAIL_LEVELS } from "../SailSystem.ts";

// ===========================================================================
// SailSystem — four named sail levels with timed transitions
// ===========================================================================

/**
 * The system tracks two things that deliberately disagree during a change of
 * canvas: the *target* level (what the captain ordered, changes instantly) and
 * the *current value* (how much sail is actually set, eases over 2 s per level
 * jumped). Movement reads the current value, the HUD reads the target.
 */

const STEP_MS = 2000; // one level of transition

/** Run the transition to completion in realistic frame slices. */
function settle(sails: SailSystem, ms = STEP_MS * 4) {
  for (let elapsed = 0; elapsed < ms; elapsed += 16) sails.update(16);
}

describe("sail level table", () => {
  it("has four levels, indexed in order", () => {
    expect(SAIL_LEVELS).toHaveLength(4);
    SAIL_LEVELS.forEach((lvl, i) => expect(lvl.index).toBe(i));
  });

  it("runs from furled to full canvas, monotonically", () => {
    expect(SAIL_LEVELS[0].value).toBe(0);
    expect(SAIL_LEVELS[SAIL_LEVELS.length - 1].value).toBe(1);
    for (let i = 1; i < SAIL_LEVELS.length; i++) {
      expect(SAIL_LEVELS[i].value).toBeGreaterThan(SAIL_LEVELS[i - 1].value);
    }
  });

  it("carries both a translation key and a fallback name in each language", () => {
    for (const lvl of SAIL_LEVELS) {
      expect(lvl.nameKey).toMatch(/^sail\./);
      expect(lvl.namePl.length).toBeGreaterThan(0);
      expect(lvl.nameEn.length).toBeGreaterThan(0);
    }
  });
});

describe("construction", () => {
  it("starts furled by default", () => {
    const sails = new SailSystem();
    expect(sails.getTargetLevel()).toBe(0);
    expect(sails.getCurrentValue()).toBe(0);
    expect(sails.isTransitioning()).toBe(false);
  });

  it("can start at any level, already settled", () => {
    const sails = new SailSystem(2);
    expect(sails.getTargetLevel()).toBe(2);
    expect(sails.getCurrentValue()).toBe(SAIL_LEVELS[2].value);
    expect(sails.isTransitioning()).toBe(false);
  });
});

describe("raise / lower", () => {
  it("raising moves the order up one level and starts a transition", () => {
    const sails = new SailSystem(0);
    expect(sails.raise()).toBe(1);
    expect(sails.isTransitioning()).toBe(true);
    expect(sails.getTargetDef().index).toBe(1);
  });

  it("the ordered level changes at once, the canvas does not", () => {
    const sails = new SailSystem(0);
    sails.raise();
    expect(sails.getTargetLevel()).toBe(1);
    expect(sails.getCurrentValue()).toBe(0);
  });

  it("cannot raise past full sail", () => {
    const sails = new SailSystem(3);
    expect(sails.raise()).toBe(3);
    expect(sails.isTransitioning()).toBe(false);
  });

  it("cannot lower below furled", () => {
    const sails = new SailSystem(0);
    expect(sails.lower()).toBe(0);
    expect(sails.isTransitioning()).toBe(false);
  });

  it("reaches the ordered value once the transition runs out", () => {
    const sails = new SailSystem(0);
    sails.raise();
    settle(sails);
    expect(sails.getCurrentValue()).toBe(SAIL_LEVELS[1].value);
    expect(sails.isTransitioning()).toBe(false);
  });

  it("climbs monotonically while setting more canvas", () => {
    const sails = new SailSystem(0);
    sails.raise();
    let prev = sails.getCurrentValue();
    for (let t = 0; t < STEP_MS; t += 50) {
      sails.update(50);
      expect(sails.getCurrentValue()).toBeGreaterThanOrEqual(prev);
      prev = sails.getCurrentValue();
    }
  });

  it("falls monotonically while taking canvas in", () => {
    const sails = new SailSystem(3);
    sails.lower();
    let prev = sails.getCurrentValue();
    for (let t = 0; t < STEP_MS; t += 50) {
      sails.update(50);
      expect(sails.getCurrentValue()).toBeLessThanOrEqual(prev);
      prev = sails.getCurrentValue();
    }
  });

  it("never overshoots the level it is heading for", () => {
    const sails = new SailSystem(0);
    sails.raise();
    for (let t = 0; t < STEP_MS * 2; t += 33) {
      sails.update(33);
      expect(sails.getCurrentValue()).toBeLessThanOrEqual(SAIL_LEVELS[1].value + 1e-9);
      expect(sails.getCurrentValue()).toBeGreaterThanOrEqual(0);
    }
  });

  it("a two-level order takes twice as long as a one-level order", () => {
    const one = new SailSystem(0);
    one.raise();
    for (let t = 0; t < STEP_MS - 100; t += 100) one.update(100);
    expect(one.isTransitioning()).toBe(true);
    one.update(200);
    expect(one.isTransitioning()).toBe(false);

    const two = new SailSystem(0);
    two.raise();
    two.raise(); // ordered straight to level 2 before the first move finished
    for (let t = 0; t < STEP_MS * 2 - 100; t += 100) two.update(100);
    expect(two.isTransitioning()).toBe(true);
    two.update(200);
    expect(two.isTransitioning()).toBe(false);
    expect(two.getCurrentValue()).toBe(SAIL_LEVELS[2].value);
  });

  it("spamming the key does not set canvas for free", () => {
    // Regression: the duration used to be measured from the previous *order*,
    // so tapping W three times went furled -> full in one 2 s step instead of
    // three. Sail level modulates turn rate in battle, so that was worth money.
    const spammed = new SailSystem(0);
    spammed.raise();
    spammed.raise();
    spammed.raise();
    for (let t = 0; t < STEP_MS * 3 - 200; t += 100) spammed.update(100);
    expect(spammed.isTransitioning()).toBe(true);
    spammed.update(400);
    expect(spammed.getCurrentValue()).toBe(1);
  });

  it("an order reversed mid-change starts from wherever the canvas is now", () => {
    const sails = new SailSystem(0);
    sails.raise();
    for (let t = 0; t < STEP_MS / 2; t += 50) sails.update(50);
    const mid = sails.getCurrentValue();
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(SAIL_LEVELS[1].value);

    sails.lower();
    settle(sails);
    expect(sails.getTargetLevel()).toBe(0);
    expect(sails.getCurrentValue()).toBe(0);
  });
});

describe("setImmediate", () => {
  it("snaps to a level with no transition — used on embark and disembark", () => {
    const sails = new SailSystem(0);
    sails.setImmediate(3);
    expect(sails.getTargetLevel()).toBe(3);
    expect(sails.getCurrentValue()).toBe(1);
    expect(sails.isTransitioning()).toBe(false);
  });

  it("cancels a transition in progress", () => {
    const sails = new SailSystem(0);
    sails.raise();
    sails.setImmediate(0);
    expect(sails.isTransitioning()).toBe(false);
    expect(sails.getCurrentValue()).toBe(0);
  });

  it("clamps a level outside the table instead of reading past its end", () => {
    const sails = new SailSystem(1);
    sails.setImmediate(99);
    expect(sails.getTargetLevel()).toBe(SAIL_LEVELS.length - 1);
    sails.setImmediate(-5);
    expect(sails.getTargetLevel()).toBe(0);
  });
});

describe("update", () => {
  it("is a no-op when nothing was ordered", () => {
    const sails = new SailSystem(2);
    sails.update(5000);
    expect(sails.getCurrentValue()).toBe(SAIL_LEVELS[2].value);
  });

  it("survives a single huge frame delta after a stall", () => {
    const sails = new SailSystem(0);
    sails.raise();
    sails.update(60_000);
    expect(sails.getCurrentValue()).toBe(SAIL_LEVELS[1].value);
    expect(sails.isTransitioning()).toBe(false);
  });

  it("a zero delta neither advances nor breaks the transition", () => {
    const sails = new SailSystem(0);
    sails.raise();
    sails.update(0);
    expect(sails.getCurrentValue()).toBe(0);
    expect(sails.isTransitioning()).toBe(true);
  });
});
