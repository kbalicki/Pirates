import type Phaser from "phaser";

/** Default font stack used across all game UI. */
export const UI_FONT = "'Dancing Script', cursive";

/** Pirate icon font — each letter renders as a pirate symbol (ship, skull, etc.) */
export const PIRATE_ICONS_FONT = "'Pirates', sans-serif";

/** Text resolution — accounts for device pixel ratio so text stays crisp. */
export const TEXT_RES = Math.max(2, Math.ceil(window.devicePixelRatio ?? 1));

/**
 * Build a Phaser TextStyle with crisp rendering.
 */
export function txt(
  size: number,
  opts?: { bold?: boolean; color?: string },
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: UI_FONT,
    fontSize: `${Math.round(size * 1.3)}px`,
    color: opts?.color ?? "#1a1a1a",
    fontStyle: opts?.bold ? "bold" : undefined,
    resolution: TEXT_RES,
  };
}

/**
 * The three panels this game draws on, and the one colour a hint line may be
 * written in on each.
 *
 * Every hint used to carry its own grey, chosen by eye. Measured in v0.83.0:
 * `#aaaaaa` on parchment is **1.82 : 1** and `#555555` on the dark panel is
 * **2.63 : 1** — the first is very nearly invisible, and the second is the
 * line that tells a captain how to turn the page of his battle manual. The two
 * below clear 4.5 : 1 against every panel they are used on, which
 * `hint_contrast.test.ts` measures rather than trusts.
 */
export const PANEL_DARK = "#0a0a1a";
export const PANEL_PARCHMENT = "#efe3c4";
export const PANEL_WHITE = "#ffffff";

/** Hint colour for the near-black panels: manuals, town panel, battle. */
export const HINT_ON_DARK = "#9a8a6a";

/** Hint colour for parchment and white panels: shore screens, ledgers. */
export const HINT_ON_LIGHT = "#6a5a42";
