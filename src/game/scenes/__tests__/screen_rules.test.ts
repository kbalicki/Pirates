import { describe, it, expect } from "vitest";
import { getReputationLevel } from "../../../core/systems/ReputationSystem.ts";

// ===========================================================================
// A screen that restates a rule of the engine restates it wrong (v0.99.5)
// ===========================================================================

/**
 * The same shape four releases running: the battle's firing arc drawn at a
 * typed ±60° against the engine's ±30° (v0.98.3), the reload bar measured
 * against the best cadence in the game (v0.98.4), and now the town panel's
 * reputation ladder - allied above 50, friendly above 20, hostile at -50,
 * where `getReputationLevel` says 60, 20 inclusive and -60. At 50-59 it called
 * a captain "allied" whom every counter treated as friendly; at exactly 20
 * "neutral" where the governor received him.
 *
 * None of them was a wrong number in the engine. Each was a second copy on a
 * screen, which no test of the engine can see. So this reads the screens.
 */
const SCENES = import.meta.glob("../*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const src = (name: string) => Object.entries(SCENES).find(([p]) => p.endsWith(`/${name}`))?.[1] ?? "";

describe("the screens read the engine's reputation bands", () => {
  it("reads every scene", () => {
    expect(Object.keys(SCENES).length).toBeGreaterThan(15);
  });

  it("keeps no ladder of its own in any scene", () => {
    // `rep > 50 ? ... : rep > 20 ? ...` - a chain of standing thresholds.
    const ladder = /\b(rep|reputation|standing)\w*\s*[<>]=?\s*-?\d+\s*\?[^;]*\b\1\w*\s*[<>]=?\s*-?\d+\s*\?/;
    const offenders = Object.entries(SCENES).filter(([, s]) => ladder.test(s)).map(([p]) => p);
    expect(offenders).toEqual([]);
  });

  it("has the town panel ask the engine", () => {
    expect(src("CityInfoScene.ts")).toContain("getReputationLevel(rep)");
  });

  it("would have told the old panel apart from the engine", () => {
    // The three places the old ladder disagreed.
    expect(getReputationLevel(55)).toBe("friendly");
    expect(getReputationLevel(20)).toBe("friendly");
    expect(getReputationLevel(-55)).toBe("unfriendly");
  });
});

describe("the chart reads its own maximum zoom", () => {
  it("types no 12 for the top of the ladder", () => {
    const map = src("MainMapScene.ts");
    expect(map).not.toMatch(/MAX_ZOOM\s*=\s*12\b/);
    expect(map).not.toMatch(/\(\s*12\s*-\s*\d/);
  });

  it("keeps no second fade rule for grid labels that no longer live here", () => {
    const map = src("MainMapScene.ts");
    expect(map).not.toContain('getData("isGrid")');
  });
});

describe("the screens read the captain's default drill", () => {
  it("types no 0.3 for it", () => {
    // Five copies of `TRAINING_DEFAULT` sat in three scenes until v0.99.6.
    const offenders = Object.entries(SCENES).filter(([, s]) => /training \?\? 0\.3/.test(s)).map(([p]) => p);
    expect(offenders).toEqual([]);
  });
});

describe("the harbour gate and the yard read the engine (v0.99.7)", () => {
  it("rolls a sneak against the engine's chance, and never starts a battle with a town", () => {
    const approach = src("PortApproachScene.ts");
    expect(approach).toContain("sneakChance(");
    expect(approach).not.toMatch(/0\.5 \+ morale \* 0\.3/);
    // A failed sneak started SeaBattleScene against the port id - an enemy with
    // no hull. The only battle this dialog may open is none at all.
    expect(approach).not.toContain('"SeaBattleScene"');
  });

  it("prints the yard's offer from the engine", () => {
    const port = src("PortScene.ts");
    expect(port).toContain("fleetShipResale(esc.classId");
    expect(port).not.toMatch(/buyPrice \* 0\.4/);
  });

  it("colours the counter's spread by band, not by a copy of the neutral spread", () => {
    expect(src("PortScene.ts")).not.toMatch(/spread [<>] 0\.12/);
  });
});
