/**
 * How far apart two colours are, as a reader sees them.
 *
 * The game has three kinds of panel — a near-black one for the manuals and the
 * chart overlays, a parchment one for the shore screens, and white for the
 * ledgers — and the line that tells the captain which keys to press was
 * written in a grey somebody picked by eye against each. Measured (v0.83.0):
 *
 * | line | on | ratio |
 * |---|---|---|
 * | `#aaaaaa` — the captain's sheet | parchment | **1.82 : 1** |
 * | `#555555` — the town panel, the manual | `#0a0a1a` | **2.63 : 1** |
 *
 * 1.82 is very nearly invisible, and the comment sitting twenty lines above
 * the worst of them says so in as many words: *"#aaaaaa on parchment is barely
 * there"*. It was written about the line above it and the line below it kept
 * the colour — the same shape as `VillageSystem` in v0.79.0 and `sound.hint`
 * in v0.81.0, a third time.
 *
 * The formula is WCAG 2.x relative luminance. 4.5:1 is the readable floor for
 * ordinary text; the two hint colours the game uses now measure 5.8 and 5.2.
 */

/** sRGB channel to linear light. */
function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of `#rrggbb`, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`not a #rrggbb colour: ${hex}`);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Contrast ratio between two colours: 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** The floor this game holds its own hint lines to. */
export const READABLE = 4.5;
