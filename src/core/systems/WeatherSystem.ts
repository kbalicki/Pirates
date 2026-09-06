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
  // Clamped at nought, because it was not: once a squall ended, the timer went
  // on being decremented every tick for the life of the save and reached five
  // figures below zero (v0.38.0). Nothing read it, so nothing broke — which is
  // exactly why it sat there.
  let stormTimer = Math.max(0, weather.stormTimer - dtTicks);

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
 * Wind angle (degrees from wind), for the default 30° dead zone:
 *   0-30°    DEAD ZONE ("in irons")   — 0, can't sail into wind
 *   30-60°   Close hauled (beating)   — 0 → 0.4, slow upwind work
 *   60-120°  Beam / broad reach       — 0.4 → 1.5 → 1.1, fastest point of sail
 *   120-180° Running (downwind)       — 1.1 → 0.9, good but not best
 *
 * The reach branch hands over to the running branch at exactly 1.1, so the
 * curve is continuous over the whole 0-180° range (see TODO.md P0-2).
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
    // Beam reach to broad reach: 0.4 → 1.5 → 1.1, peak halfway across the band.
    // Two quarter-sine arcs: the first rises to the peak, the second falls to
    // 1.1 so the branch ends exactly where the running branch starts. A single
    // half sine returned to 0.4 at 120° and made the ship jump 2.75× over two
    // degrees of heading.
    const reachStart = minWindAngle + 30;
    const peakDeg = (reachStart + 120) / 2;
    if (deg <= peakDeg) {
      const t = (deg - reachStart) / (peakDeg - reachStart); // 0→1
      factor = 0.4 + 1.1 * Math.sin((t * Math.PI) / 2); // 0.4→1.5
    } else {
      const t = (deg - peakDeg) / (120 - peakDeg); // 0→1
      factor = 1.1 + 0.4 * Math.cos((t * Math.PI) / 2); // 1.5→1.1
    }
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

// ── The navigator ─────────────────────────────────────────

/**
 * The skill value at which a captain sails exactly as every captain sailed
 * before v0.47.0.
 *
 * Character creation starts each of the five skills here, so centring the
 * bonus on it means the arithmetic of every existing battle, passage and NPC
 * is untouched: only a captain who spent points, or refused to, sails
 * differently. A hook that changed the average case would have quietly
 * rebalanced fifteen releases of measured numbers.
 */
export const NEUTRAL_NAVIGATION = 5;

/** How much of the wind's shortfall a single point of navigation recovers. */
export const NAVIGATOR_GAIN = 0.04;

/**
 * The navigator's share of the day's work (v0.47.0).
 *
 * `navigation` was one of five numbers on the character sheet and, until this
 * function existed, the only code in the game that read it was `AgingSystem`,
 * which made it *rise* after thirty-five — a reward for nothing.
 *
 * The bonus is scaled by how badly the wind is serving: `shortfall` is what
 * the ship is losing against her own base speed, so
 *
 *   • hard on the wind (modifier 0.48) a good navigator is worth a fifth more;
 *   • on a beam reach (modifier 1.26) he is worth **nothing at all**.
 *
 * That is the whole design. Anybody can steer a ship that is already flying;
 * the man who knows his trade is the one who gets her to windward. Measured on
 * a 600-unit passage dead to windward in an average trade wind: 4.43 days for
 * navigation 0, 3.47 for 5, 2.85 for 10 — and 1.53 days for every one of them
 * on a broad reach.
 */
export function navigatedWindModifier(windMod: number, navigation: number): number {
  const shortfall = Math.max(0, 1 - windMod);
  if (shortfall <= 0) return windMod;
  const skill = Math.max(0, Math.min(10, navigation)) - NEUTRAL_NAVIGATION;
  return Math.max(0, windMod + skill * NAVIGATOR_GAIN * shortfall);
}
