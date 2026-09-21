/**
 * Where a cursor goes when the screen under it is rebuilt, and where the
 * window goes when the cursor leaves it.
 *
 * Two rules, both learned on the running game rather than by reading it, and
 * both about the same thing: **the screen owes the captain the row he is
 * standing on**. v0.80.0 found three lists whose cursor never moved because a
 * redraw put it back on row zero. v0.82.0 found the other half of it — a
 * cursor that moves perfectly well and a window that does not follow, which is
 * the same list, navigated blind.
 *
 * They live here, out of the scenes, because the arithmetic is the whole of
 * the rule and a scene cannot be built without Phaser.
 */

export interface MenuRow<T> {
  action: T;
  disabled?: boolean;
}

/**
 * The row a rebuilt menu should put its cursor on.
 *
 * On the way in there is nothing to remember, so the answer is *the first row
 * he can actually use* — which is right, and was the only rule the village
 * screen had.
 *
 * Afterwards it is wrong, and dangerously so. Every transaction in the village
 * redraws the whole screen, and a successful barter puts its own row on a
 * cooldown; the first usable row then becomes **send a war party against the
 * neighbouring town**. The captain who had just pressed Enter to trade was
 * left with the cursor on a raid, one press away (v0.82.0).
 *
 * So he keeps his row. If what he just did closed that row, he falls to the
 * **last** one, which by convention is the way out and is the only row that
 * cannot do anything to the world. A menu never answers a transaction by
 * offering a different transaction.
 *
 * @param rows     the menu as it now stands
 * @param previous the action the cursor was on, or null on the first draw
 */
export function restoreCursor<T>(rows: MenuRow<T>[], previous: T | null): number {
  if (rows.length === 0) return 0;
  const last = rows.length - 1;

  if (previous !== null) {
    const idx = rows.findIndex(r => r.action === previous);
    if (idx >= 0) return rows[idx].disabled ? last : idx;
  }

  const first = rows.findIndex(r => !r.disabled);
  return first < 0 ? last : first;
}

/**
 * Where a scrolling container has to sit for one row to be inside the window.
 *
 * All four numbers are in the same space as the container's own position: a
 * row drawn at local `rowY` appears at `offset + rowY`.
 *
 * Returns the current offset unchanged when the row is already in view, so a
 * caller can tell that nothing needs to move. The result is **not** clamped to
 * the content — that needs the drawn height, which only the scene knows.
 */
export function offsetRevealing(
  offset: number,
  rowY: number,
  rowH: number,
  winTop: number,
  winH: number,
  margin = 8,
): number {
  const top = offset + rowY;
  const bottom = top + rowH;
  if (top < winTop + margin) return winTop + margin - rowY;
  if (bottom > winTop + winH - margin) return winTop + winH - margin - rowY - rowH;
  return offset;
}
