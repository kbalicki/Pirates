import { describe, it, expect } from "vitest";
import { packColumns, paginate } from "../columnFlow.ts";

// ===========================================================================
// A column has a bottom, and somebody has to measure against it (v0.83.0)
// ===========================================================================

/**
 * The battle manual — the player-facing spec for the whole combat model — was
 * drawn as two columns with a split somebody typed: four sections on the left,
 * five on the right, and nothing anywhere measured either against the panel.
 *
 * Measured on the running game at 1280x720: the panel gives **600 px** to a
 * column and the right one was **1475 px** tall. More than half of that spec
 * had never been on the screen — all of reload, boarding, the timeout rule and
 * every worked example were drawn past the bottom border, on top of the sea.
 * No arrangement of two columns could have held it; the text needs three and a
 * half. So the manual gets pages, and the pages are found by measurement.
 *
 * `HelpScene` learned the same thing in v0.61.0 and measured its topic lists
 * against a `contentBottom`. This screen never got it, which is the shape worth
 * naming: **a rule applied on one screen is not a rule**.
 */

describe("sections are packed into columns that fit", () => {
  it("keeps the reading order", () => {
    const columns = packColumns([100, 100, 100, 100, 100], 250);
    expect(columns.flat()).toEqual([0, 1, 2, 3, 4]);
  });

  it("loses nothing and repeats nothing", () => {
    const heights = [80, 210, 40, 305, 95, 150, 60];
    const flat = packColumns(heights, 300).flat();
    expect([...flat].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("never lets a column pass the limit unless one section already does", () => {
    const heights = [120, 180, 90, 200, 140];
    for (const column of packColumns(heights, 300)) {
      const total = column.reduce((sum, i) => sum + heights[i], 0);
      if (column.length > 1) expect(total).toBeLessThanOrEqual(300);
    }
  });

  it("gives a section taller than the column a column of its own", () => {
    // The damage model measured 643 px against a 600 px window before it was
    // split in two. Text that cannot fit anywhere has to start somewhere, and
    // the answer is that it takes the overflow alone rather than pushing
    // everything after it off the bottom as well.
    const columns = packColumns([100, 900, 100], 600);
    expect(columns).toEqual([[0], [1], [2]]);
  });

  it("puts the whole battle manual inside its panel", () => {
    // The ten sections as they measured at 1280x720, after the damage model
    // was split from its worked examples, against the 600 px the panel gives
    // a column.
    const MEASURED = [173, 78, 135, 135, 122, 450, 240, 496, 230, 78];
    const columns = packColumns(MEASURED, 600);
    for (const column of columns) {
      expect(column.reduce((sum, i) => sum + MEASURED[i], 0)).toBeLessThanOrEqual(600);
    }
    // Two columns to a page, and it has to be a number of pages a captain in
    // the middle of a fight will actually turn.
    expect(paginate(columns, 2).length).toBeLessThanOrEqual(3);
  });

  it("answers an empty manual with no columns at all", () => {
    expect(packColumns([], 600)).toEqual([]);
    expect(paginate([], 2)).toEqual([]);
  });
});

describe("columns are dealt into pages", () => {
  it("fills each page before starting the next", () => {
    expect(paginate([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("leaves a single column as one page", () => {
    expect(paginate(["a"], 2)).toEqual([["a"]]);
  });
});

// ---------------------------------------------------------------------------
// The scene, read as source.
// ---------------------------------------------------------------------------

const SCENES = import.meta.glob("../../../game/scenes/*.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

function scene(name: string): string {
  for (const [path, src] of Object.entries(SCENES)) {
    if (path.includes(name)) return src;
  }
  return "";
}

describe("the battle manual measures itself against the panel", () => {
  it("does not deal its sections out by a number somebody typed", () => {
    const src = scene("BattleHelpScene");
    expect(src, "BattleHelpScene not found").not.toBe("");
    expect(src).toMatch(/packColumns\(/);
    // One list, in reading order — not two lists with the split baked in.
    expect(src).toMatch(/const SECTIONS: Array<\[string, string\]> = \[/);
    expect((src.match(/renderColumn\(/g) ?? []).length).toBe(0);
  });

  it("knows where the bottom of the panel is", () => {
    const src = scene("BattleHelpScene");
    expect(src).toMatch(/const bottom = cy \+ ph \/ 2/);
    expect(src).toMatch(/packColumns\(heights, bottom - startY\)/);
  });

  it("names every section of the spec exactly once", () => {
    const src = scene("BattleHelpScene");
    const keys = [...src.matchAll(/"(battle\.help_\w+_body)"/g)].map(m => m[1]);
    expect(new Set(keys).size).toBe(keys.length);
    // A section dropped from the list is a section nobody can read, and that
    // is exactly what this screen has been doing by accident.
    expect(keys).toContain("battle.help_examples_body");
    expect(keys).toContain("battle.help_timeout_body");
    expect(keys.length).toBe(10);
  });
});
