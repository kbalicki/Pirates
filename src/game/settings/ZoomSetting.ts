/**
 * Camera zoom levels — fourteen steps from 1.5x (the whole chart) to 12x.
 * Default: "z8" (6x, the seventh step from the closest).
 *
 * **This is the ladder.** Until v0.97.0 there were three: these fourteen steps
 * on the quartermaster's screen, twelve whole numbers under the mouse wheel
 * (`Math.round`, floor 1 — wider than this table's widest), and eleven
 * readings on the indicator that reported them. They are one now, and
 * `getZoomValue()` is the only thing the camera aims at.
 */

const STORAGE_KEY = "pc_zoom_level";
const VALID_LEVELS = ["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8", "z9", "z10", "z11", "z12", "z13", "z14"] as const;
export type ZoomLevel = (typeof VALID_LEVELS)[number];

export const ZOOM_VALUES: Record<ZoomLevel, number> = {
  z1: 1.5,
  z2: 2.0,
  z3: 2.5,
  z4: 3.0,
  z5: 3.5,
  z6: 4.0,
  z7: 5.0,
  z8: 6.0,
  z9: 7.0,
  z10: 8.0,
  z11: 9.0,
  z12: 10.0,
  z13: 11.0,
  z14: 12.0,
};

let currentLevel: ZoomLevel = "z8";

export function initZoomSetting(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (VALID_LEVELS as readonly string[]).includes(stored)) {
      currentLevel = stored as ZoomLevel;
    }
  } catch {
    // localStorage unavailable
  }
}

export function getZoomLevel(): ZoomLevel {
  return currentLevel;
}

export function getZoomValue(): number {
  return ZOOM_VALUES[currentLevel];
}

/** Every step, widest first. The chart moves along this and nothing else. */
export const ZOOM_LEVELS: readonly ZoomLevel[] = VALID_LEVELS;

/** The widest and closest the chart goes — what the manual states, once. */
export const ZOOM_MIN_VALUE = ZOOM_VALUES[VALID_LEVELS[0]];
export const ZOOM_MAX_VALUE = ZOOM_VALUES[VALID_LEVELS[VALID_LEVELS.length - 1]];

/**
 * One step closer (`+1`) or wider (`-1`), stopping at the ends.
 *
 * The mouse wheel used to round the current magnification and add one, which
 * meant it walked whole numbers: from the widest setting (1.5) a single click
 * went to 3 or to 1, so the six half-steps below 4 could not be reached with
 * the wheel at all and 1 — not a setting — could. It also never wrote the
 * level down, so the quartermaster's screen went on showing the old row.
 */
export function stepZoomLevel(dir: 1 | -1): ZoomLevel {
  const i = VALID_LEVELS.indexOf(currentLevel);
  const next = Math.max(0, Math.min(VALID_LEVELS.length - 1, i + dir));
  setZoomLevel(VALID_LEVELS[next]);
  return VALID_LEVELS[next];
}

export function setZoomLevel(level: ZoomLevel): void {
  currentLevel = level;
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch {
    // localStorage unavailable
  }
}
