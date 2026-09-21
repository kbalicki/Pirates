/**
 * How a stack of sections is broken into columns that actually fit.
 *
 * The battle manual was two columns with a hardcoded split — four sections on
 * the left, five on the right — and nothing anywhere measured either against
 * the panel. Measured on the running game at 1280x720: the window holds
 * **600 px** per column and the right column was **1475 px** tall. More than
 * half the combat spec had never been on the screen, including the whole of
 * the worked examples and the reload rules (v0.83.0).
 *
 * No arrangement of two columns could hold it — the text needs three and a
 * half — so the manual gets pages, and the pages are filled by measurement
 * rather than by a number somebody typed.
 */

/**
 * Pack sections, **in order**, into columns of at most `limit`.
 *
 * Greedy and order-preserving: a section goes in the current column if it
 * still fits, otherwise it starts the next one. A section taller than a whole
 * column goes into a column of its own and the one after it starts afresh —
 * that is the honest answer to text that cannot fit anywhere, and it keeps the
 * overflow to the one section that causes it instead of pushing everything
 * after it off the bottom too.
 *
 * @param heights drawn height of each section, in order
 * @param limit   how tall one column may be
 * @returns one array of section indices per column; never empty for a
 *          non-empty input, and every index appears exactly once
 */
export function packColumns(heights: number[], limit: number): number[][] {
  const columns: number[][] = [];
  let current: number[] = [];
  let used = 0;

  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    if (current.length > 0 && used + h > limit) {
      columns.push(current);
      current = [];
      used = 0;
    }
    current.push(i);
    used += h;
    // A section that on its own passes the limit cannot share with the next.
    if (used > limit) {
      columns.push(current);
      current = [];
      used = 0;
    }
  }
  if (current.length > 0) columns.push(current);
  return columns;
}

/**
 * Group those columns into pages of `perPage` columns each.
 *
 * Kept separate from the packing because the two answer different questions:
 * how much text fits beside itself, and how many of those the panel is wide
 * enough to show at once.
 */
export function paginate<T>(columns: T[], perPage: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < columns.length; i += perPage) {
    pages.push(columns.slice(i, i + perPage));
  }
  return pages;
}
