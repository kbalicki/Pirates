import { describe, it, expect } from "vitest";
import { reloadProgress, newReloadSpan } from "../reloadGauge.ts";
import { effectiveReloadTicks, CANNON_COOLDOWN_TICKS } from "../../../core/systems/CombatSystem.ts";

const sources = import.meta.glob("../../scenes/SeaBattleScene.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const sceneSrc = Object.values(sources)[0] ?? "";

/** Walk one reload down tick by tick and read the bar at each step. */
function walk(reload: number): number[] {
  const span = newReloadSpan();
  const out: number[] = [];
  for (let cd = reload; cd >= 0; cd--) out.push(reloadProgress(span, "left", cd));
  return out;
}

describe("the reload bar measures the reload it is in (v0.98.4)", () => {
  it("is slower than the best cadence for the captain's own opening crew", () => {
    // Full crew, 80 % morale, 30 % training: what a new captain starts with.
    expect(effectiveReloadTicks(40, 40, 0.8, 0.3)).toBeGreaterThan(CANNON_COOLDOWN_TICKS);
  });

  it("moves from the first tick of a slow reload, not only in its last 180", () => {
    const slow = effectiveReloadTicks(10, 40, 0.1, 0);             // the worst crew
    expect(slow).toBeGreaterThan(400);
    const bar = walk(slow);
    // Old bar at a quarter of the way through: 1 - (0.75*slow)/180, clamped to 0.
    const quarter = Math.round(slow * 0.25);
    expect(bar[quarter]).toBeCloseTo(0.25, 2);
    expect(Math.max(0, 1 - (slow - quarter) / CANNON_COOLDOWN_TICKS)).toBe(0);
    // Half way through it is half full, and it is full only when ready.
    expect(bar[Math.round(slow / 2)]).toBeCloseTo(0.5, 2);
    expect(bar[bar.length - 2]).toBeLessThan(1);
    expect(bar[bar.length - 1]).toBe(1);
  });

  it("never runs backwards within a reload, and starts again after the next shot", () => {
    const span = newReloadSpan();
    let last = -1;
    for (let cd = 300; cd >= 0; cd--) {
      const p = reloadProgress(span, "left", cd);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(span.left.last).toBe(0);
    expect(reloadProgress(span, "left", 200)).toBe(0);          // fresh shot: empty
    expect(reloadProgress(span, "left", 100)).toBeCloseTo(0.5, 9);
  });

  it("empties the bar on a change of shot mid-reload", () => {
    // The engine restarts both batteries at a full reload, which is never
    // shorter than what is left: in a battle crew and morale only fall and
    // training does not move, so each reload is at least as long as the last.
    const span = newReloadSpan();
    reloadProgress(span, "left", 230);
    expect(reloadProgress(span, "left", 120)).toBeCloseTo(110 / 230, 9);
    expect(reloadProgress(span, "left", 240)).toBe(0);
    expect(reloadProgress(span, "left", 120)).toBeCloseTo(0.5, 9);
  });

  it("keeps the two batteries apart", () => {
    const span = newReloadSpan();
    reloadProgress(span, "left", 400);
    expect(reloadProgress(span, "right", 180)).toBe(0);
    expect(reloadProgress(span, "left", 200)).toBeCloseTo(0.5, 9);
  });

  it("is what the battle draws, with no typed cadence left in the scene", () => {
    expect(sceneSrc).toContain("reloadProgress(span, \"left\"");
    expect(sceneSrc).not.toMatch(/maxCd\s*=\s*180/);
  });
});
