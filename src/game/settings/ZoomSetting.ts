/**
 * Camera zoom levels — 10 levels from overview to maximum detail.
 * Default: "z8" (3rd from closest).
 *
 * z1  → 0.5x   (full map overview)
 * z2  → 0.75x
 * z3  → 1.0x
 * z4  → 1.5x
 * z5  → 2.25x
 * z6  → 3.0x
 * z7  → 4.0x
 * z8  → 5.0x   (default)
 * z9  → 6.5x
 * z10 → 8.0x   (maximum detail)
 */

const STORAGE_KEY = "pc_zoom_level";
const VALID_LEVELS = ["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8", "z9", "z10"] as const;
export type ZoomLevel = (typeof VALID_LEVELS)[number];

export const ZOOM_VALUES: Record<ZoomLevel, number> = {
  z1: 0.5,
  z2: 0.75,
  z3: 1.0,
  z4: 1.5,
  z5: 2.25,
  z6: 3.0,
  z7: 4.0,
  z8: 5.0,
  z9: 6.5,
  z10: 8.0,
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

export function setZoomLevel(level: ZoomLevel): void {
  currentLevel = level;
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch {
    // localStorage unavailable
  }
}
