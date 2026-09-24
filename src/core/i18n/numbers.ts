/**
 * numbers — a number written the way the reader's language writes it (v0.97.0).
 *
 * Polish puts a **comma** where English puts a point: *8,3 w.*, not *8.3 w.*
 * The game wrote the point everywhere, because `toFixed` does, so every
 * fractional number the player has ever read on the chart — her speed through
 * the water, her leeway, the guns dismounted by a broadside, the latitude of
 * the port under the cursor — has been in English even in the Polish build.
 *
 * The game's own manual already knows: `help.ctrl_zoom` says *"Zmień zoom
 * (1,5×–12×)"* and `help.event_harvest_fx` says *"×0,6"*, three lines above
 * `help.event_trade_boom_fx` saying *"×1.5"*. Two sentences of the same table,
 * about the same kind of number, disagreeing.
 *
 * This is the same shape as v0.69.0's ports in the nominative and v0.74.0's
 * numerals: **a form that English does not have, so the code never grew a
 * place to keep it.** The place is here. It is deliberately not
 * `Intl.NumberFormat` — that would also group thousands (*8 300* against the
 * game's own *8300*) and there is exactly one rule to apply.
 */

import { getLang } from "./I18n.ts";

/** The character this language puts between the whole part and the rest. */
export function decimalSeparator(): string {
  return getLang() === "pl" ? "," : ".";
}

/**
 * A number at a fixed number of decimals, in the reader's language.
 *
 * `fmtNum(8.25, 1)` → `"8.3"` in English, `"8,3"` in Polish. Use it wherever a
 * `toFixed` result is going to be read by a person; `calendarDate.test.ts`'s
 * sibling guard in `numbers.test.ts` fails a scene that calls `toFixed`
 * straight into a drawn string.
 */
export function fmtNum(value: number, decimals = 1): string {
  return value.toFixed(decimals).replace(".", decimalSeparator());
}

/**
 * A number with its decimals dropped when there are none to show.
 *
 * The zoom indicator is the caller: the fourteen steps are 1.5, 2, 2.5, 3, 3.5,
 * 4, 5 … 12, and *"2×"* reads better than *"2.0×"* while *"1,5×"* has to keep
 * its half. Rounding them to whole numbers, which is what the indicator did
 * until v0.97.0, gave **eleven different readings for fourteen settings**: the
 * three widest pairs (1.5/2, 2.5/3, 3.5/4) printed the same number, so the
 * first press of the zoom-out key at the wide end changed the picture and not
 * the number under it.
 */
export function fmtTrim(value: number, decimals = 1): string {
  const fixed = fmtNum(value, decimals);
  const sep = decimalSeparator();
  if (!fixed.includes(sep)) return fixed;
  return fixed.replace(new RegExp(`\\${sep}?0+$`), "");
}
