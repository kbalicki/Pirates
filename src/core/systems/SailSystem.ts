/**
 * SailSystem — named sail levels with timed transitions.
 *
 * Four sail levels:
 *   0 = Furled    (0.00) — sails stowed, no movement
 *   1 = Reefed    (0.33) — reduced sail, slow speed, safe in storms
 *   2 = Half Sail (0.66) — moderate sail, medium speed
 *   3 = Full Sail (1.00) — all canvas set, maximum speed
 *
 * Transitions between levels take TRANSITION_TIME_MS (3000ms real time).
 * The actual sailLevel (0..1 float) smoothly interpolates between levels.
 *
 * Usage:
 *   - W/Up key: raise sails one level
 *   - S/Down key: lower sails one level
 *   - SailSystem.update(deltaSec) called each frame to animate transition
 *   - SailSystem.getCurrentValue() returns the interpolated 0..1 float
 */

export interface SailLevelDef {
  index: number;
  value: number;
  nameKey: string;  // i18n key
  namePl: string;   // Polish fallback
  nameEn: string;   // English fallback
}

export const SAIL_LEVELS: SailLevelDef[] = [
  { index: 0, value: 0.00, nameKey: "sail.furled",    namePl: "Zwinięte",      nameEn: "Furled" },
  { index: 1, value: 0.33, nameKey: "sail.reefed",    namePl: "Zrefowane",     nameEn: "Reefed" },
  { index: 2, value: 0.50, nameKey: "sail.half",      namePl: "Połowa żagli",  nameEn: "Half Sail" },
  { index: 3, value: 1.00, nameKey: "sail.full",       namePl: "Pełne żagle",  nameEn: "Full Sail" },
];

/** Time in milliseconds to transition between adjacent sail levels. */
const TRANSITION_TIME_MS = 3000;

export class SailSystem {
  /** Target sail level index (0-3). Set by player input. */
  private targetLevel = 0;
  /** Current interpolated sail value (0..1). Transitions smoothly. */
  private currentValue = 0;
  /** Value at the start of current transition. */
  private transitionFrom = 0;
  /** Value at the end of current transition. */
  private transitionTo = 0;
  /** Elapsed transition time in ms. */
  private transitionElapsed = 0;
  /** Total transition time for current move (3s × levels jumped). */
  private transitionDuration = 0;
  /** Whether a transition is in progress. */
  private transitioning = false;

  constructor(initialLevel = 0) {
    this.targetLevel = initialLevel;
    this.currentValue = SAIL_LEVELS[initialLevel].value;
    this.transitionFrom = this.currentValue;
    this.transitionTo = this.currentValue;
  }

  /** Raise sails one level. Returns new target level index. */
  raise(): number {
    if (this.targetLevel < SAIL_LEVELS.length - 1) {
      this.startTransition(this.targetLevel + 1);
    }
    return this.targetLevel;
  }

  /** Lower sails one level. Returns new target level index. */
  lower(): number {
    if (this.targetLevel > 0) {
      this.startTransition(this.targetLevel - 1);
    }
    return this.targetLevel;
  }

  /** Set sail level directly (e.g., on embark/disembark). No transition. */
  setImmediate(levelIndex: number): void {
    this.targetLevel = Math.max(0, Math.min(SAIL_LEVELS.length - 1, levelIndex));
    this.currentValue = SAIL_LEVELS[this.targetLevel].value;
    this.transitionFrom = this.currentValue;
    this.transitionTo = this.currentValue;
    this.transitioning = false;
    this.transitionElapsed = 0;
  }

  /** Call each frame. deltaMs = frame delta in milliseconds. */
  update(deltaMs: number): void {
    if (!this.transitioning) return;

    this.transitionElapsed += deltaMs;
    const t = Math.min(1, this.transitionElapsed / this.transitionDuration);

    // Smooth ease-in-out
    const eased = t < 0.5
      ? 2 * t * t
      : 1 - Math.pow(-2 * t + 2, 2) / 2;

    this.currentValue = this.transitionFrom + (this.transitionTo - this.transitionFrom) * eased;

    if (t >= 1) {
      this.currentValue = this.transitionTo;
      this.transitioning = false;
    }
  }

  /** Current interpolated sail value (0..1 float). */
  getCurrentValue(): number {
    return this.currentValue;
  }

  /** Current target level index (0-3). */
  getTargetLevel(): number {
    return this.targetLevel;
  }

  /** Get the target level definition. */
  getTargetDef(): SailLevelDef {
    return SAIL_LEVELS[this.targetLevel];
  }

  /** Whether sails are currently transitioning. */
  isTransitioning(): boolean {
    return this.transitioning;
  }

  private startTransition(newLevel: number): void {
    const oldLevel = this.targetLevel;
    this.targetLevel = newLevel;
    this.transitionFrom = this.currentValue;
    this.transitionTo = SAIL_LEVELS[newLevel].value;
    this.transitionElapsed = 0;
    // Duration proportional to number of levels jumped
    this.transitionDuration = TRANSITION_TIME_MS * Math.abs(newLevel - oldLevel);
    this.transitioning = true;
  }
}
