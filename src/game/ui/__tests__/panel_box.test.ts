import { describe, it, expect } from "vitest";
import { panelAt, insideOf, outsideBy, fitsIn } from "../panelBox.ts";

// ===========================================================================
// A panel is a box, and what it holds is measured against it (v0.84.0)
// ===========================================================================

/**
 * The arithmetic behind five releases of the same finding. Each of those was a
 * number worked out from a centre and an offset somebody typed, with nothing
 * comparing the result with the frame:
 *
 * | release | what was outside | by |
 * |---|---|---|
 * | v0.79.0 | a button on the cabin tab | 7 px |
 * | v0.83.0 | the right column of the battle manual | 875 px |
 * | v0.84.0 | the squadron's masts on the defence screen | 6 px |
 *
 * The defence screen's numbers are the worked case below, because they are the
 * ones this release measured: a panel 108 tall centred at 262, and a
 * silhouette laid out from `centre - 60`.
 */

describe("a panel from its centre", () => {
  it("is the box every add.rectangle in this game draws", () => {
    expect(panelAt(640, 262, 700, 108)).toEqual({ x: 290, y: 208, w: 700, h: 108 });
  });

  it("gives back the room inside its border", () => {
    expect(insideOf(panelAt(640, 262, 700, 108), 6))
      .toEqual({ x: 296, y: 214, w: 688, h: 96 });
  });

  it("never gives back a negative box", () => {
    const tiny = insideOf({ x: 0, y: 0, w: 10, h: 4 }, 40);
    expect(tiny.w).toBe(0);
    expect(tiny.h).toBe(0);
  });
});

describe("how far a thing reaches past its frame", () => {
  const panel = panelAt(640, 262, 700, 108);   // y 208 .. 316

  it("measures the defence screen's masts at six pixels", () => {
    // A mast drawn from `centre - 60` in a panel whose half-height is 54.
    const mast = { x: 842, y: 202, w: 14, h: 20 };
    expect(outsideBy(mast, panel)).toBe(6);
    expect(fitsIn(mast, panel)).toBe(false);
  });

  it("measures the same mast at zero once it is laid out from the panel", () => {
    const horizon = panel.y + 6;
    const fixed = { x: 842, y: horizon, w: 14, h: 20 };
    expect(outsideBy(fixed, panel)).toBeLessThanOrEqual(0);
    expect(fitsIn(fixed, panel)).toBe(true);
  });

  it("answers with the worst side, not the first one it finds", () => {
    const wide = { x: 200, y: 300, w: 900, h: 40 };
    // 90 off the left, 110 off the right, 24 below: the right side wins.
    expect(outsideBy(wide, panel)).toBe(110);
  });

  it("reads a box fully inside as a negative number, so slack is measurable", () => {
    expect(outsideBy({ x: 400, y: 240, w: 100, h: 20 }, panel)).toBe(-32);
  });
});
