import { describe, it, expect } from "vitest";
import { PL } from "../../i18n/locales/pl.ts";
import { EN } from "../../i18n/locales/en.ts";
import { HELP_WORLD_TOPICS } from "../../data/helpTopics.ts";

/**
 * The world's clock runs on the chart and nowhere else (v0.99.0).
 *
 * Measured in v0.98.1: a port visit, a battle, an assault, a defence and every
 * overlay cost no game time, because `MainMapScene` owns the one
 * `WorldEngine` and the engine owns the one `advanceTime`. Every deadline in
 * days - contracts, orders, the lease, the plunder share, expeditions,
 * governors, the economy tick - therefore counts days on the chart. The user
 * made that the rule (2026-09-25), so the manual says it and this pins the
 * two facts it rests on: which code moves the clock, and which scene runs it.
 */
const core = import.meta.glob("../../**/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const game = import.meta.glob("../../../game/**/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const prod = (m: Record<string, string>) => Object.entries(m).filter(([p]) => !p.includes("__tests__"));

describe("the world's clock", () => {
  it("is moved by one function, called from the engine alone", () => {
    const callers = prod(core).filter(([, s]) => /\badvanceTime\(/.test(s)).map(([p]) => p.split("/").pop());
    expect(callers.sort()).toEqual(["TimeSystem.ts", "WorldEngine.ts"]);
  });

  it("is built by the chart and by no other screen", () => {
    const builders = prod(game).filter(([, s]) => /new\s+WorldEngine\s*\(/.test(s)).map(([p]) => p.split("/").pop());
    expect(builders).toEqual(["MainMapScene.ts"]);
  });

  it("is not wound forward by any screen, except one debug flag", () => {
    // `?plate=` puts the convoy a third of the way down her passage.
    const ALLOWED = ["PreloadScene.ts"];
    const writers = prod(game)
      .filter(([, s]) => /time:\s*\{\s*\.\.\.[\w.]*time,\s*day:/.test(s))
      .map(([p]) => p.split("/").pop()!);
    expect(writers.filter(f => !ALLOWED.includes(f))).toEqual([]);
  });

  it("is a rule the manual states, in both languages", () => {
    // Beside the eras, which is where the manual talks about the calendar.
    expect(HELP_WORLD_TOPICS).toContain("eras");
    expect(PL["help.world_eras_b"]).toMatch(/tylko na mapie/);
    expect(EN["help.world_eras_b"]).toMatch(/only on the chart/);
  });
});
