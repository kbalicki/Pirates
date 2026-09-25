import { describe, it, expect } from "vitest";
import { getReputationLevel } from "../ReputationSystem.ts";
import { FACTIONS, OWN_CROWN_START_BONUS } from "../../data/factions.ts";
import { BRETHREN_TRADER } from "../PrivateerSystem.ts";

const sources = import.meta.glob("../../../game/GameApp.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const appSrc = Object.values(sources)[0] ?? "";

/**
 * A starting standing is not a threshold (v0.99.0).
 *
 * The captain's own crown opened at 20 and the pirates at -20, the exact
 * lines where "friendly" and "unfriendly" begin, so the first point of a
 * career moved a band: in 12 of 84 measured starts one trader of an ally
 * taken turned his own crown neutral and shut the governor's door. The user
 * moved both off the line (2026-09-25).
 */
describe("the standing a captain starts with", () => {
  it("is friendly at home with a margin one mistake does not spend", () => {
    for (const [key, f] of Object.entries(FACTIONS)) {
      if (key === "pirates") continue;
      const start = f.defaultReputation + OWN_CROWN_START_BONUS;
      expect(getReputationLevel(start), key).toBe("friendly");
      expect(getReputationLevel(start - 1), key).toBe("friendly");
    }
  });

  it("keeps the pirates wary, and one merchant taken still opens the haven", () => {
    const start = FACTIONS.pirates.defaultReputation;
    expect(getReputationLevel(start)).toBe("unfriendly");
    expect(getReputationLevel(start + 1)).toBe("unfriendly");
    // The brethren's credit for a trader taken: the haven turns neutral, as before.
    expect(getReputationLevel(start + BRETHREN_TRADER)).toBe("neutral");
  });

  it("sits on no band edge for any crown", () => {
    for (const [key, f] of Object.entries(FACTIONS)) {
      const home = f.defaultReputation + (key === "pirates" ? 0 : OWN_CROWN_START_BONUS);
      for (const r of [f.defaultReputation, home]) {
        expect(getReputationLevel(r - 1), `${key} ${r}`).toBe(getReputationLevel(r));
        expect(getReputationLevel(r + 1), `${key} ${r}`).toBe(getReputationLevel(r));
      }
    }
  });

  it("is what a new game hands out", () => {
    expect(appSrc).toContain("+= OWN_CROWN_START_BONUS");
  });
});
