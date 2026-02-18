/**
 * Caribbean Trade Wind Configuration
 *
 * The Caribbean has persistent easterly trade winds:
 * - Winter (Dec-Feb): NE trade winds, moderate strength
 * - Spring (Mar-May): E-ENE, strengthening
 * - Summer (Jun-Aug): E-SE, hurricane season begins, variable gusts
 * - Fall (Sep-Nov): E, peak hurricane season, strongest gusts
 *
 * windDirRad represents the direction the wind blows FROM.
 * 0 = N, PI/2 = E, PI = S, 3PI/2 = W.
 * "NE trade winds" means wind FROM the NE = PI/4 ≈ 0.785 rad.
 */

export type MonthlyWindConfig = {
  baseDirection: number;       // radians, wind-from direction
  baseStrength: number;        // 0..1
  directionVariance: number;   // max oscillation in radians
  strengthVariance: number;    // max oscillation
  stormChancePerTick: number;  // probability per tick
};

// Index 0 = January, 11 = December
export const MONTHLY_WIND: MonthlyWindConfig[] = [
  // Jan: NE trades, moderate
  { baseDirection: Math.PI * 0.25, baseStrength: 0.50, directionVariance: 0.3, strengthVariance: 0.12, stormChancePerTick: 0.000020 },
  // Feb: NE trades, moderate
  { baseDirection: Math.PI * 0.25, baseStrength: 0.48, directionVariance: 0.3, strengthVariance: 0.10, stormChancePerTick: 0.000015 },
  // Mar: ENE, strengthening
  { baseDirection: Math.PI * 0.30, baseStrength: 0.50, directionVariance: 0.25, strengthVariance: 0.10, stormChancePerTick: 0.000015 },
  // Apr: E-ENE, moderate
  { baseDirection: Math.PI * 0.38, baseStrength: 0.52, directionVariance: 0.25, strengthVariance: 0.10, stormChancePerTick: 0.000020 },
  // May: E, warming
  { baseDirection: Math.PI * 0.45, baseStrength: 0.50, directionVariance: 0.3, strengthVariance: 0.12, stormChancePerTick: 0.000030 },
  // Jun: E-ESE, hurricane season starts
  { baseDirection: Math.PI * 0.50, baseStrength: 0.55, directionVariance: 0.35, strengthVariance: 0.15, stormChancePerTick: 0.000060 },
  // Jul: ESE, hurricane season
  { baseDirection: Math.PI * 0.55, baseStrength: 0.58, directionVariance: 0.4, strengthVariance: 0.18, stormChancePerTick: 0.000080 },
  // Aug: ESE, peak hurricane
  { baseDirection: Math.PI * 0.55, baseStrength: 0.60, directionVariance: 0.4, strengthVariance: 0.20, stormChancePerTick: 0.000100 },
  // Sep: E-ESE, peak hurricane
  { baseDirection: Math.PI * 0.50, baseStrength: 0.62, directionVariance: 0.45, strengthVariance: 0.22, stormChancePerTick: 0.000120 },
  // Oct: E, hurricane winding down
  { baseDirection: Math.PI * 0.45, baseStrength: 0.55, directionVariance: 0.35, strengthVariance: 0.18, stormChancePerTick: 0.000080 },
  // Nov: ENE, late hurricane season
  { baseDirection: Math.PI * 0.35, baseStrength: 0.50, directionVariance: 0.3, strengthVariance: 0.14, stormChancePerTick: 0.000040 },
  // Dec: NE trades return
  { baseDirection: Math.PI * 0.25, baseStrength: 0.50, directionVariance: 0.3, strengthVariance: 0.12, stormChancePerTick: 0.000025 },
];

// ---- Mean-reversion tuning ----

/** How strongly wind direction reverts to seasonal base per tick. */
export const DIRECTION_REVERSION_RATE = 0.004;

/** How strongly wind strength reverts to seasonal base per tick. */
export const STRENGTH_REVERSION_RATE = 0.006;

/** Random perturbation per tick (radians). */
export const DIRECTION_NOISE_RATE = 0.003;

/** Random perturbation per tick (strength units). */
export const STRENGTH_NOISE_RATE = 0.004;

/** Interpolate between two angles handling wraparound. */
function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

/**
 * Get interpolated wind config for a given calendar date.
 * Smoothly blends between the current month and next month.
 */
export function getSeasonalWind(
  month: number,
  dayOfMonth: number,
  daysInMonthTotal: number,
): MonthlyWindConfig {
  const idx0 = (month - 1) % 12;
  const idx1 = month % 12;
  const frac = (dayOfMonth - 1) / Math.max(1, daysInMonthTotal - 1);

  const a = MONTHLY_WIND[idx0];
  const b = MONTHLY_WIND[idx1];

  return {
    baseDirection: lerpAngle(a.baseDirection, b.baseDirection, frac),
    baseStrength: a.baseStrength + (b.baseStrength - a.baseStrength) * frac,
    directionVariance: a.directionVariance + (b.directionVariance - a.directionVariance) * frac,
    strengthVariance: a.strengthVariance + (b.strengthVariance - a.strengthVariance) * frac,
    stormChancePerTick: a.stormChancePerTick + (b.stormChancePerTick - a.stormChancePerTick) * frac,
  };
}
