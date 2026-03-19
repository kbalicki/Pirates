/**
 * Camera zoom levels — 12 levels from overview to maximum detail.
 * Default: "z8" (5th from closest).
 */

const STORAGE_KEY = "pc_zoom_level";
const VALID_LEVELS = ["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8", "z9", "z10", "z11", "z12", "z13", "z14"] as const;
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
  z11: 10.0,
  z12: 13.0,
  z13: 16.0,
  z14: 20.0,
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
