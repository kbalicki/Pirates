/**
 * Camera zoom level setting — persisted in localStorage.
 *
 * "far"    → 0.75x  (zoomed out, see more of the map)
 * "normal" → 2.25x  (default)
 * "close"  → 3.375x (zoomed in, 50% closer)
 */

const STORAGE_KEY = "pc_zoom_level";
const VALID_LEVELS = ["far", "normal", "close"] as const;
export type ZoomLevel = (typeof VALID_LEVELS)[number];

export const ZOOM_VALUES: Record<ZoomLevel, number> = {
  far: 0.75,
  normal: 2.25,
  close: 3.375,
};

let currentLevel: ZoomLevel = "normal";

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
