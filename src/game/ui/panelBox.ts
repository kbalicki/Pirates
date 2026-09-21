/**
 * panelBox — a panel is a box, and what it holds is measured against it.
 *
 * Five releases in a row found something drawn outside the frame it belongs
 * to: a button seven pixels past the panel (v0.79.0), a row scrolled under the
 * mask with nothing following it (v0.82.0), half the battle manual below the
 * border (v0.83.0), and six masts six pixels above theirs (v0.84.0). Every one
 * of those was a number worked out from a centre and an offset somebody typed,
 * with nothing anywhere comparing the result with the frame.
 *
 * The rule each of those releases named applies to one screen unless there is
 * one place to say it. This is that place.
 *
 * `scripts/audit-layout.mjs` asks the same question of the **running** game —
 * it walks every scene's Graphics command buffer and Text bounds and reports
 * what leaves its panel — so the two halves meet: a scene lays out through
 * these helpers, and the audit checks that it did.
 */

export type PanelBox = { x: number; y: number; w: number; h: number };

/** A panel from its centre, which is how every `add.rectangle` in this game is written. */
export function panelAt(cx: number, cy: number, w: number, h: number): PanelBox {
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** The usable box inside a panel, once its border and padding are taken off. */
export function insideOf(frame: PanelBox, inset: number): PanelBox {
  return {
    x: frame.x + inset,
    y: frame.y + inset,
    w: Math.max(0, frame.w - inset * 2),
    h: Math.max(0, frame.h - inset * 2),
  };
}

/**
 * How far a box reaches past its frame, on its worst side.
 *
 * Zero or less means it fits. The number is what a finding is written with:
 * "six pixels above the panel" is a fact, "it looked wrong" is not.
 */
export function outsideBy(box: PanelBox, frame: PanelBox): number {
  return Math.max(
    frame.x - box.x,
    frame.y - box.y,
    box.x + box.w - (frame.x + frame.w),
    box.y + box.h - (frame.y + frame.h),
  );
}

/** Does this box sit entirely inside that frame? */
export function fitsIn(box: PanelBox, frame: PanelBox): boolean {
  return outsideBy(box, frame) <= 0;
}
