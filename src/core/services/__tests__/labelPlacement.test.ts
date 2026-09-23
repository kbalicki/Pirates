import { describe, it, expect } from "vitest";
import { placeLabels, slotBox, LABEL_SLOTS, type LabelAnchor } from "../labelPlacement.ts";
import { PORTS } from "../../data/ports.ts";

// ===========================================================================
// Where a name goes when the name beside it is already there (v0.94.0)
// ===========================================================================

/**
 * The world chart on the quartermaster's map tab drew all 45 towns at 0.153 of
 * scale and put every name directly above its dot. Measured on the running
 * screen: **seven pairs of names overlapping** and Barbados hanging 3 px off
 * the eastern edge — eight of forty-five unreadable, with nothing wrong in the
 * four lines that drew them.
 *
 * The numbers below are the chart's own: `renderMap` fits 3200 × 2400 world px
 * into the dialog, which comes out at 0.15333.
 */
const SCALE = 368 / 2400;
const OFFSET_X = 640 - (3200 * SCALE) / 2;
const OFFSET_Y = 4;
/** The same 9 px `audit-layout.mjs` allows before it calls two boxes a clash. */
const MIN = 9;

/** Roughly what the chart's 7 px labels measure, so the test is about a chart. */
const anchorsFromChart = (): LabelAnchor[] => Object.entries(PORTS).map(([, port]) => ({
  x: OFFSET_X + port.pos.x * SCALE,
  y: OFFSET_Y + port.pos.y * SCALE,
  w: 30,
  h: 10,
}));

const overlaps = (a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }, min: number) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > min
  && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > min;

describe("one label", () => {
  const anchor: LabelAnchor = { x: 100, y: 100, w: 40, h: 10 };

  it("goes above the dot when nothing is in the way", () => {
    expect(placeLabels([anchor])).toEqual([0]);
    const box = slotBox(anchor, 0);
    expect(box.y + box.h).toBeLessThan(anchor.y);
    expect(box.x + box.w / 2).toBeCloseTo(anchor.x, 6);
  });

  it("has four places and they are all different", () => {
    const boxes = LABEL_SLOTS.map((_, i) => slotBox(anchor, i));
    const seen = new Set(boxes.map(b => `${b.x},${b.y}`));
    expect(seen.size).toBe(LABEL_SLOTS.length);
  });

  it("keeps the first place when it fits nowhere, rather than being dropped", () => {
    // A box smaller than the label, so no slot is inside it.
    const slots = placeLabels([anchor], MIN, { x: 99, y: 99, w: 2, h: 2 });
    expect(slots).toEqual([0]);
  });
});

describe("labels beside each other", () => {
  it("moves the second one when the first has the place", () => {
    const a: LabelAnchor = { x: 100, y: 100, w: 40, h: 10 };
    const b: LabelAnchor = { x: 104, y: 100, w: 40, h: 10 };
    const slots = placeLabels([a, b], MIN);
    expect(slots[0]).toBe(0);
    expect(slots[1]).not.toBe(0);
    expect(overlaps(slotBox(a, slots[0]), slotBox(b, slots[1]), MIN)).toBe(false);
  });

  it("gives the same answer twice, so a chart does not shuffle on redraw", () => {
    const anchors = anchorsFromChart();
    expect(placeLabels(anchors, MIN)).toEqual(placeLabels(anchors, MIN));
  });

  it("leaves a name alone when it was never crowded", () => {
    const anchors: LabelAnchor[] = [
      { x: 0, y: 0, w: 20, h: 10 },
      { x: 500, y: 300, w: 20, h: 10 },
    ];
    expect(placeLabels(anchors, MIN)).toEqual([0, 0]);
  });
});

describe("the world chart", () => {
  const anchors = anchorsFromChart();
  const bounds = { x: OFFSET_X, y: OFFSET_Y, w: 3200 * SCALE, h: 2400 * SCALE };

  it("had seven pairs on top of each other before anything was placed", () => {
    let clashes = 0;
    for (let i = 0; i < anchors.length; i++) {
      for (let j = i + 1; j < anchors.length; j++) {
        if (overlaps(slotBox(anchors[i], 0), slotBox(anchors[j], 0), MIN)) clashes++;
      }
    }
    expect(clashes).toBeGreaterThanOrEqual(5);
  });

  it("has none once they are placed", () => {
    const slots = placeLabels(anchors, MIN, bounds);
    const boxes = slots.map((s, i) => slotBox(anchors[i], s));
    const clashes: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (overlaps(boxes[i], boxes[j], MIN)) clashes.push(`${i}x${j}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("keeps every name on the chart", () => {
    const slots = placeLabels(anchors, MIN, bounds);
    const off = slots.map((s, i) => slotBox(anchors[i], s))
      .filter(b => b.x < bounds.x || b.x + b.w > bounds.x + bounds.w
        || b.y < bounds.y || b.y + b.h > bounds.y + bounds.h);
    expect(off).toEqual([]);
  });

  /**
   * Above is what a reader expects, and a chart that moved every name to be
   * clever would be a worse chart than one that moved the few that had to.
   */
  it("moves only the names that had to move", () => {
    const slots = placeLabels(anchors, MIN, bounds);
    const moved = slots.filter(s => s !== 0).length;
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(anchors.length / 3);
  });
});
