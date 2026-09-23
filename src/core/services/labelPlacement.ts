/**
 * Where a name goes when the name beside it is already there.
 *
 * The world chart on the quartermaster's map tab draws all 45 towns at 0.153
 * of the chart's scale and puts every name **directly above its dot**, one
 * rule for every town. Measured on the running screen: **seven pairs of names
 * overlap** — Santiago over Puerto Príncipe, Antigua over both Nevis and
 * Montserrat, Petit-Goâve over Léogane — and Barbados, the easternmost town,
 * hangs its name 3 px over the edge of the chart. Eight of forty-five names
 * are unreadable, and the code that draws them has no defect in it at all: one
 * anchor, one offset, no arithmetic to get wrong.
 *
 * This is the arithmetic that was missing. A label takes the first place that
 * is free, in a fixed order, and the order is the whole of the design: above
 * is what a reader expects, below is the next most natural, and the two sides
 * are a last resort because a name beside a dot reads as belonging to the dot
 * next door.
 *
 * Greedy and stable rather than optimal: the map is drawn in `Object.entries`
 * order and will be drawn in that order again, so the same town keeps the same
 * place between one opening of the tab and the next. A solver that found two
 * fewer collisions and moved four names each time would be a worse chart.
 */

export interface LabelAnchor {
  /** Where the thing being named is. */
  x: number;
  y: number;
  /** How big the name is, once drawn. */
  w: number;
  h: number;
}

export interface LabelSlot {
  /** Offset of the label's centre from the anchor. */
  dx: number;
  dy: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The four places a name may go, best first.
 *
 * `dy` is measured to the label's centre, so `above` lifts it by half its own
 * height plus the gap. The caller supplies the height, which is why these are
 * multipliers and a gap rather than four fixed numbers.
 */
export const LABEL_SLOTS: ReadonlyArray<{ dx: number; dy: number; gapX: number; gapY: number }> = [
  { dx: 0, dy: -0.5, gapX: 0, gapY: -5 },   // above
  { dx: 0, dy: 0.5, gapX: 0, gapY: 5 },     // below
  { dx: 0.5, dy: 0, gapX: 6, gapY: 0 },     // right
  { dx: -0.5, dy: 0, gapX: -6, gapY: 0 },   // left
];

/** The box a label occupies if it takes this slot. */
export function slotBox(anchor: LabelAnchor, slot: number): Box {
  const s = LABEL_SLOTS[slot] ?? LABEL_SLOTS[0];
  const cx = anchor.x + s.dx * anchor.w + s.gapX;
  const cy = anchor.y + s.dy * anchor.h + s.gapY;
  return { x: cx - anchor.w / 2, y: cy - anchor.h / 2, w: anchor.w, h: anchor.h };
}

const hits = (a: Box, b: Box, min: number): boolean =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > min
  && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > min;

const inside = (box: Box, bounds: Box | null): boolean =>
  !bounds || (box.x >= bounds.x && box.y >= bounds.y
    && box.x + box.w <= bounds.x + bounds.w && box.y + box.h <= bounds.y + bounds.h);

/**
 * A slot for every anchor, in the order they were given.
 *
 * A label that fits nowhere keeps the first slot: a chart that drops a name
 * because it was crowded is worse than one that overlaps, and the caller can
 * see which those are by asking `slotBox` again.
 *
 * @param min how much two boxes may share before it counts — the same slack
 *   the screen audit allows, because the two have to agree about what an
 *   overlap is or the guard checks a different thing from the tool.
 * @param bounds the chart the names have to stay on, or null for no edge.
 */
export function placeLabels(
  anchors: LabelAnchor[],
  min = 0,
  bounds: Box | null = null,
): number[] {
  const taken: Box[] = [];
  const out: number[] = [];
  for (const anchor of anchors) {
    let chosen = -1;
    for (let slot = 0; slot < LABEL_SLOTS.length; slot++) {
      const box = slotBox(anchor, slot);
      if (!inside(box, bounds)) continue;
      if (taken.some(t => hits(box, t, min))) continue;
      chosen = slot;
      break;
    }
    // Nowhere free: it keeps the place a reader looks first, and stays in the
    // way of whatever is already there rather than being dropped.
    if (chosen < 0) chosen = 0;
    out.push(chosen);
    taken.push(slotBox(anchor, chosen));
  }
  return out;
}
