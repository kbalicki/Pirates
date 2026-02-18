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

// Calculate wind effect on a ship given its heading
// Returns a speed multiplier (0.3 = beating into wind, 1.5 = running with wind)
export function windSpeedModifier(shipHeading: HeadingRad, windDirRad: HeadingRad, windStrength: number): number {
  // Angle between ship heading and wind direction
  const angleDiff = Math.abs(normalizeHeading(shipHeading - windDirRad));
  // 0 = heading directly into wind, PI = running with wind
  const windAngle = angleDiff > Math.PI ? TWO_PI - angleDiff : angleDiff;

  // Sailing into wind: slow. With wind: fast. Cross-wind: moderate.
  // Cosine curve: cos(0) = 1 (into wind), cos(PI) = -1 (with wind)
  // We want: into wind → 0.3, beam reach → 1.0, running → 1.3
  const factor = 0.8 - 0.5 * Math.cos(windAngle);

  // Scale by wind strength (no wind = everything is base speed)
  return 1.0 + (factor - 1.0) * windStrength;
}
