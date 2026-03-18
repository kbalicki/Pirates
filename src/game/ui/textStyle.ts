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
