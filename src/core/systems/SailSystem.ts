/**
 * SailSystem — named sail levels with timed transitions.
 *
 * Four sail levels:
 *   0 = Furled    (0.00) — sails stowed, no movement
 *   1 = Reefed    (0.33) — reduced sail, slow speed, safe in storms
 *   2 = Half Sail (0.50) — moderate sail, medium speed
 *   3 = Full Sail (1.00) — all canvas set, maximum speed
 *
 * Each level of change takes TRANSITION_TIME_MS of real time, counted from
 * where the canvas actually is — not from the last order. Ordering two levels
 * at once therefore takes twice as long, and reversing halfway through costs
 * only the half already set. The tracked position is a fractional level; the
 * 0..1 value the ship moves on is interpolated from the table above, so the
 * uneven spacing between levels is preserved during a change.
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
const TRANSITION_TIME_MS = 2000;

/** Interpolate the 0..1 canvas value for a fractional level index. */
function valueAtLevel(level: number): number {
  const clamped = Math.max(0, Math.min(SAIL_LEVELS.length - 1, level));
  const lo = Math.floor(clamped);
  const hi = Math.min(SAIL_LEVELS.length - 1, lo + 1);
  return SAIL_LEVELS[lo].value + (SAIL_LEVELS[hi].value - SAIL_LEVELS[lo].value) * (clamped - lo);
}

export class SailSystem {
  /** Target sail level index (0-3). Set by player input. */
  private targetLevel = 0;
  /** Where the canvas actually is, as a fractional level index. */
  private currentLevel = 0;
  /** Current interpolated sail value (0..1), derived from currentLevel. */
  private currentValue = 0;
  /** Fractional level the running transition started from. */
  private transitionFromLevel = 0;
  /** Elapsed transition time in ms. */
  private transitionElapsed = 0;
  /** Total transition time for the running move (2 s x levels still to travel). */
  private transitionDuration = 0;
  /** Whether a transition is in progress. */
  private transitioning = false;

  constructor(initialLevel = 0) {
    this.setImmediate(initialLevel);
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
    this.targetLevel = Math.max(0, Math.min(SAIL_LEVELS.length - 1, Math.round(levelIndex)));
    this.settleAtTarget();
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

    this.currentLevel = this.transitionFromLevel + (this.targetLevel - this.transitionFromLevel) * eased;
    this.currentValue = valueAtLevel(this.currentLevel);

    if (t >= 1) this.settleAtTarget();
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
    this.targetLevel = newLevel;
    this.transitionFromLevel = this.currentLevel;
    this.transitionElapsed = 0;
    // Counted from where the canvas is, not from the previous order: a second
    // key press mid-change adds a full level of work instead of coming free.
    this.transitionDuration = TRANSITION_TIME_MS * Math.abs(newLevel - this.currentLevel);
    if (this.transitionDuration <= 0) {
      this.settleAtTarget();
      return;
    }
    this.transitioning = true;
  }

  private settleAtTarget(): void {
    this.currentLevel = this.targetLevel;
    this.currentValue = SAIL_LEVELS[this.targetLevel].value;
    this.transitionFromLevel = this.currentLevel;
    this.transitionElapsed = 0;
    this.transitionDuration = 0;
    this.transitioning = false;
  }
}
