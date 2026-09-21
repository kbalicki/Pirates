import { describe, it, expect } from "vitest";

// ===========================================================================
// A line placed in two places is placed wrong in one of them (v0.82.0)
// ===========================================================================

/**
 * The seven lines under the compass — sails, speed, windward, drift, squadron,
 * blockade, weather — were positioned once where they are made and again where
 * the window is resized, and the two copies had drifted apart. The weather
 * warning stood at `sailY + 104` on the way in and at `sailY + 72` after a
 * resize: four pixels under the squadron line, and *above* the blockade line
 * its own comment says it sits below. Resize the window in a squall and the
 * warning is drawn on top of the fleet.
 *
 * Nothing in the game could catch that, because both numbers are perfectly
 * valid and only their disagreement is the defect. So this reads the source
 * and holds the two to one table.
 */

const OVERLAY = import.meta.glob("../../../game/scenes/UIOverlayScene.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

const SRC = Object.values(OVERLAY)[0] ?? "";

describe("the stack under the compass is written down once", () => {
  it("has a table of rows at all", () => {
    expect(SRC, "UIOverlayScene not found").not.toBe("");
    expect(SRC).toMatch(/const HUD_ROW = \{/);
  });

  it("orders the rows top to bottom with no two on the same line", () => {
    const table = SRC.slice(SRC.indexOf("const HUD_ROW = {"));
    const rows = [...table.slice(0, table.indexOf("}")).matchAll(/(\w+): (\d+),/g)]
      .map(m => ({ name: m[1], y: Number(m[2]) }));
    expect(rows.length).toBeGreaterThanOrEqual(7);
    // The blockade line is documented as sitting under the squadron line and
    // the weather warning under the blockade line. That is the order.
    const names = rows.map(r => r.name);
    expect(names.indexOf("blockade")).toBeGreaterThan(names.indexOf("fleet"));
    expect(names.indexOf("storm")).toBeGreaterThan(names.indexOf("blockade"));
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].y, `${rows[i].name} is not below ${rows[i - 1].name}`)
        .toBeGreaterThan(rows[i - 1].y);
    }
    // Room for the tallest line drawn there (13px + stroke).
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].y - rows[i - 1].y).toBeGreaterThanOrEqual(16);
    }
  });

  it("places every one of them through the table, in both places", () => {
    // Anything still carrying its own arithmetic is a second copy waiting to
    // drift from the first.
    const strays = [...SRC.matchAll(/sailY \+ (\d+)/g)].map(m => m[0]);
    expect(strays, "a HUD row placed by hand").toEqual([]);

    const placements = [...SRC.matchAll(/(?:cam\.width|width) - MARGIN, sailY([^,)]*)/g)]
      .map(m => m[1].trim());
    expect(placements.length).toBeGreaterThanOrEqual(14);
    for (const p of placements) {
      expect(p, "a HUD row placed off the table").toMatch(/^\+ HUD_ROW\.\w+$/);
    }
  });
});
