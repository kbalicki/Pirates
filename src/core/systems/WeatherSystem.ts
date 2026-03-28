import type { WeatherState, HeadingRad } from "../model/WorldState.ts";
import type { RngState } from "../model/WorldState.ts";
import { rngNextFloat, rngNext } from "../services/RNG.ts";
import { normalizeHeading, TWO_PI } from "../services/Geometry.ts";
import {
  getSeasonalWind,
  DIRECTION_REVERSION_RATE,
  STRENGTH_REVERSION_RATE,
  DIRECTION_NOISE_RATE,
  STRENGTH_NOISE_RATE,
} from "../data/wind.ts";

/**
 * Update weather with season-aware, mean-reverting wind.
 */
export function updateWeather(
  weather: WeatherState,
  rng: RngState,
  dtTicks: number,
  month: number = 1,
  dayOfMonth: number = 1,
  daysInMonth: number = 31,
): { weather: WeatherState; rng: RngState } {
  let currentRng = rng;

  // Get seasonal target
  const seasonal = getSeasonalWind(month, dayOfMonth, daysInMonth);

  // --- Direction: mean-reverting with noise ---
  let dirDiff = seasonal.baseDirection - weather.windDirRad;
  while (dirDiff > Math.PI) dirDiff -= TWO_PI;
  while (dirDiff < -Math.PI) dirDiff += TWO_PI;

  const dirReversion = dirDiff * DIRECTION_REVERSION_RATE * dtTicks;

  const { value: dirNoise, state: rng1 } = rngNextFloat(
    currentRng, -DIRECTION_NOISE_RATE, DIRECTION_NOISE_RATE,
  );
  currentRng = rng1;

  const newDir = normalizeHeading(
    weather.windDirRad + dirReversion + dirNoise * dtTicks,
  );

  // --- Strength: mean-reverting with noise ---
  const strDiff = seasonal.baseStrength - weather.windStrength;
  const strReversion = strDiff * STRENGTH_REVERSION_RATE * dtTicks;

  const { value: strNoise, state: rng2 } = rngNextFloat(
    currentRng, -STRENGTH_NOISE_RATE, STRENGTH_NOISE_RATE,
  );
  currentRng = rng2;

  let newStrength = Math.max(
    0,
    Math.min(1, weather.windStrength + strReversion + strNoise * dtTicks),
  );

  // --- Storm logic: season-aware ---
  let stormActive = weather.stormActive;
  let stormTimer = weather.stormTimer - dtTicks;

  if (stormActive && stormTimer <= 0) {
    stormActive = false;
    stormTimer = 0;
  } else if (!stormActive) {
    const { value: stormRoll, state: rng3 } = rngNext(currentRng);
    currentRng = rng3;

    if (stormRoll < seasonal.stormChancePerTick * dtTicks) {
      stormActive = true;
      const { value: dur, state: rng4 } = rngNextFloat(currentRng, 120, 600);
      currentRng = rng4;
      stormTimer = Math.round(dur);
    }
  }

  if (stormActive) {
    newStrength = Math.min(1, newStrength + 0.3);
  }

  return {
    weather: {
      windDirRad: newDir,
      windStrength: newStrength,
      stormActive,
      stormTimer,
    },
    rng: currentRng,
  };
}

/**
 * Realistic wind speed modifier based on sailing polar diagram.
 *
 * Wind angle (degrees from wind):
 *   0-30°   DEAD ZONE ("in irons") — speed = 0, can't sail into wind
 *   30-60°  Close hauled (beating)  — 0.2–0.5× slow upwind work
 *   60-120° Beam reach / broad reach — 0.9–1.2× fastest point of sail
 *   120-180° Running (downwind)      — 0.9–1.1× good but not best
 *
 * Returns 0..~1.5 multiplied by windStrength. No wind = base speed (1.0).
 */
export function windSpeedModifier(
  shipHeading: HeadingRad,
  windDirRad: HeadingRad,
  windStrength: number,
  minWindAngle = 30, // ship-specific dead zone in degrees
): number {
  const angleDiff = Math.abs(normalizeHeading(shipHeading - windDirRad));
  const windAngle = angleDiff > Math.PI ? TWO_PI - angleDiff : angleDiff;
  const deg = windAngle * (180 / Math.PI);

  let factor: number;
  if (deg < minWindAngle) {
    // Dead zone: can't sail into wind (ship-specific angle)
    factor = 0;
  } else if (deg < minWindAngle + 30) {
    // Close hauled: 0→0.4 slow transition from dead zone edge
    factor = ((deg - minWindAngle) / 30) * 0.4;
  } else if (deg < 120) {
    // Beam reach to broad reach: 0.4→1.5→1.1 (peak at ~90°)
    const reachStart = minWindAngle + 30;
    const t = (deg - reachStart) / (120 - reachStart);
    factor = 0.4 + 1.1 * Math.sin(t * Math.PI);
  } else {
    // Running: 1.1→0.9 (good but not peak)
    const t = (deg - 120) / 60; // 0→1
    factor = 1.1 - t * 0.2; // 1.1→0.9
  }

  // Scale by wind strength (no wind = base speed 1.0)
  return 1.0 + (factor - 1.0) * windStrength;
}

/** Check if ship heading is in the dead zone. */
export function isInIrons(shipHeading: HeadingRad, windDirRad: HeadingRad, minWindAngle = 30): boolean {
  const angleDiff = Math.abs(normalizeHeading(shipHeading - windDirRad));
  const windAngle = angleDiff > Math.PI ? TWO_PI - angleDiff : angleDiff;
  return windAngle * (180 / Math.PI) < minWindAngle;
}
