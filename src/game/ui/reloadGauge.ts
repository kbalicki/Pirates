/**
 * How full a battery's reload bar is (v0.98.4).
 *
 * The bar under each hull divided the cooldown left by a typed `180` —
 * `CANNON_COOLDOWN_TICKS`, the **best** cadence there is. The real reload is
 * `effectiveReloadTicks`, 180 for a full, brave, veteran crew and more
 * for a battered, frightened, green one (~430); the captain starts at 30 % training,
 * so his own first broadside takes ~230. Against 180 the bar sat empty for
 * the first part of every reload and then filled in exactly nine seconds, so
 * it showed every crew in the game reloading like the best one — the one
 * thing it is there to tell him.
 *
 * The ship carries only the ticks left, not the ticks it started from, and
 * the hull is the saved `ShipState`, so the span is remembered here. A
 * cooldown that goes **up** between two frames is a new reload - a shot, or
 * a change of ammunition, which throws away what was in the barrels and
 * starts both batteries again (the manual promises the bars empty then) - and
 * its first value is the span. A new reload is never shorter than what was
 * left of the old one: in a battle crew and morale only fall.
 */
export interface Gauge { span: number; last: number }

export interface ReloadSpan { left: Gauge; right: Gauge }

export type Battery = keyof ReloadSpan;

export function newReloadSpan(): ReloadSpan {
  return { left: { span: 0, last: 0 }, right: { span: 0, last: 0 } };
}

/** Remember this frame's cooldown and say how far through its reload it is. */
export function reloadProgress(state: ReloadSpan, side: Battery, cooldown: number): number {
  const g = state[side];
  if (cooldown > g.last) g.span = cooldown;
  g.last = Math.max(0, cooldown);
  if (cooldown <= 0 || g.span <= 0) return 1;
  return 1 - cooldown / g.span;
}
