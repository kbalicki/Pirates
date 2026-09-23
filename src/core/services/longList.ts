/**
 * A list too long to draw, laid out in full and drawn in slices.
 *
 * The quartermaster's tab ends in the whole release history. Drawn the obvious
 * way — one `Text` per line, all of them, every time the tab is laid out — it
 * came to **3 871 text objects in a column 55 289 px tall**, of which **3 836
 * (99.1 %) were outside the screen**. The tab took **4.2 s to open** against
 * the next tab's 0.39 s, and because every cursor move rebuilds the tab, one
 * press of Down on *Game speed* cost **4.0 s**.
 *
 * Nothing about that is visible from the code: each line is one cheap
 * `add.text`, and the loop that makes them is four lines long. It is only
 * visible if you count what a screen actually holds.
 *
 * The rule here is the arithmetic of drawing the slice and nothing else: where
 * every row would sit if they were all drawn, and which of them the window can
 * see. Both are pure, both are the sort of thing that is wrong by one row at
 * the edges, and neither needs Phaser to be checked.
 */

/** A row with its place in the column, in the column's own coordinates. */
export interface PlacedRow<T> {
  /** Top of the row, measured from the top of the column. */
  y: number;
  /** How tall the row is, including whatever gap follows it. */
  h: number;
  item: T;
}

/**
 * Stack rows down a column, each one under the last.
 *
 * `bottom` is where the column ends — the one number a scrolling container
 * needs about the part of itself it has not drawn. Without it the scroll floor
 * is computed from the drawn objects, and a windowed list can only be scrolled
 * as far as it has already been scrolled.
 */
export function placeRows<T>(
  items: Array<{ item: T; h: number }>,
  startY = 0,
): { rows: Array<PlacedRow<T>>; bottom: number } {
  const rows: Array<PlacedRow<T>> = [];
  let y = startY;
  for (const entry of items) {
    rows.push({ y, h: entry.h, item: entry.item });
    y += entry.h;
  }
  return { rows, bottom: y };
}

/**
 * The rows a window of `height` starting at `top` can see.
 *
 * A row counts as seen when any part of it is inside the window, so a row
 * straddling either edge is drawn — half a line of text missing at the top of
 * a window reads as a bug, and it is cheaper to draw it than to explain it.
 *
 * `margin` widens the window on both sides. A caller that redraws the slice
 * only when the scroll has moved a notch wants a little drawn beyond the edge;
 * a caller that redraws every notch can leave it at zero.
 *
 * Binary search, not a filter: the whole point of this module is that the list
 * is long, and a linear scan over every row on every notch of scroll would put
 * the cost straight back where it was found.
 */
export function rowsInWindow<T>(
  rows: Array<PlacedRow<T>>,
  top: number,
  height: number,
  margin = 0,
): Array<PlacedRow<T>> {
  if (rows.length === 0 || height <= 0) return [];
  const from = top - margin;
  const to = top + height + margin;

  // First row whose bottom is past the top of the window. Rows are stacked, so
  // `y + h` rises with the index and can be searched.
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].y + rows[mid].h <= from) lo = mid + 1;
    else hi = mid;
  }

  const out: Array<PlacedRow<T>> = [];
  for (let i = lo; i < rows.length && rows[i].y < to; i++) out.push(rows[i]);
  return out;
}
