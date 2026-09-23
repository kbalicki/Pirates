import { describe, it, expect } from "vitest";
import { placeRows, rowsInWindow } from "../longList.ts";
import { CHANGELOG } from "../../../changelog.ts";

// ===========================================================================
// A list too long to draw (v0.94.0)
// ===========================================================================

/**
 * The quartermaster's tab drew the whole release history at once: **3 871
 * text objects, a column 55 289 px tall, 99.1 % of it off screen**, 4.2 s to
 * open against the next tab's 0.39 s, and 4.0 s for one press of Down,
 * because every cursor move rebuilds the tab.
 *
 * Found by `audit-layout.mjs` once it was given a recipe for the tab — not by
 * reading the code, where the loop that does it is four lines and every line
 * of it is correct.
 */
const rows = (heights: number[]) => heights.map((h, i) => ({ item: i, h }));

describe("stacking a column", () => {
  it("puts each row under the last and says where the column ends", () => {
    const { rows: out, bottom } = placeRows(rows([10, 20, 30]), 5);
    expect(out.map(r => r.y)).toEqual([5, 15, 35]);
    expect(bottom).toBe(65);
  });

  it("an empty column ends where it began", () => {
    expect(placeRows([], 40)).toEqual({ rows: [], bottom: 40 });
  });
});

describe("the window", () => {
  const column = placeRows(rows(Array(100).fill(10))).rows;

  it("takes the rows the window can see and no others", () => {
    const seen = rowsInWindow(column, 100, 50);
    expect(seen.map(r => r.item)).toEqual([10, 11, 12, 13, 14]);
  });

  /**
   * Half a line missing at the edge of a window reads as a bug, and it is
   * cheaper to draw the row than to explain it.
   */
  it("keeps a row straddling either edge", () => {
    const seen = rowsInWindow(column, 105, 50);
    expect(seen[0].item).toBe(10);
    expect(seen[seen.length - 1].item).toBe(15);
  });

  it("widens by the margin on both sides", () => {
    expect(rowsInWindow(column, 100, 50, 20).map(r => r.item))
      .toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it("sees nothing above the column or below it", () => {
    expect(rowsInWindow(column, -500, 100)).toEqual([]);
    expect(rowsInWindow(column, 5000, 100)).toEqual([]);
    expect(rowsInWindow([], 0, 100)).toEqual([]);
    expect(rowsInWindow(column, 0, 0)).toEqual([]);
  });

  /**
   * Rows of different heights are the case the binary search has to survive:
   * it searches on `y + h`, which rises with the index whatever the heights.
   */
  it("finds the edge with uneven rows", () => {
    // 0 at 0..5, 1 at 5..55, 2 at 55..60, 3 at 60..110, 4 at 110..115.
    const uneven = placeRows(rows([5, 50, 5, 50, 5])).rows;
    expect(rowsInWindow(uneven, 55, 10).map(r => r.item)).toEqual([2, 3]);
    expect(rowsInWindow(uneven, 54, 10).map(r => r.item)).toEqual([1, 2, 3]);
  });

  it("agrees with a plain scan, over every window", () => {
    const uneven = placeRows(rows([7, 3, 19, 1, 40, 12, 6, 6, 31, 2])).rows;
    for (let top = -20; top < 160; top += 3) {
      for (const h of [1, 17, 44]) {
        const want = uneven.filter(r => r.y + r.h > top && r.y < top + h);
        expect(rowsInWindow(uneven, top, h), `top ${top} h ${h}`).toEqual(want);
      }
    }
  });
});

describe("the release history itself", () => {
  /**
   * The measurement that started this, kept as a number rather than a story:
   * the tab's window is about 470 px, and the history alone is two orders of
   * magnitude taller than that.
   */
  const lines = CHANGELOG.flatMap(entry => [
    { item: entry.version, h: entry.changes.length === 0 ? 22 : 16 },
    ...entry.changes.map((_, i) => ({ item: entry.version, h: i === entry.changes.length - 1 ? 20 : 14 })),
  ]);
  const column = placeRows(lines, 0);

  it("is thousands of lines and tens of thousands of pixels", () => {
    expect(lines.length).toBeGreaterThan(3000);
    expect(column.bottom).toBeGreaterThan(40000);
  });

  it("puts a screenful in the window, not the history", () => {
    const WINDOW = 470;
    const drawn = rowsInWindow(column.rows, 0, WINDOW, 240);
    expect(drawn.length).toBeLessThan(80);
    // And what it draws is the top of the list, not a slice from the middle.
    expect(drawn[0]).toBe(column.rows[0]);
  });

  it("can be scrolled to the last line of the first release", () => {
    const last = column.rows[column.rows.length - 1];
    const drawn = rowsInWindow(column.rows, column.bottom - 470, 470);
    expect(drawn).toContain(last);
  });
});
