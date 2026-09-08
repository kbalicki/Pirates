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
 * The polar diagram, and the crawl a ship keeps when she has no drive at all.
 *
 * `BEAT_CEIL` is where the close-hauled band hands over to the reach: the
 * hinge of the whole curve, and the line above which v0.53.0 changed nothing.
 */
export const BEAT_CEIL = 0.4;

/** Bare steerage way. A ship caught in irons is never nailed to the sea. */
export const IRONS_STEERAGE = 0.05;

/**
 * Realistic wind speed modifier based on a sailing polar diagram.
 *
 * Wind angle (degrees from wind), for the default 30° dead zone:
 *   0-30°    DEAD ZONE ("in irons")   — 0, can't sail into wind
 *   30-60°   Close hauled (beating)   — 0 → 0.4, rising steeply off the edge
 *   60-120°  Beam / broad reach       — 0.4 → 1.5 → 1.1, fastest point of sail
 *   120-180° Running (downwind)       — 1.1 → 0.9, good but not best
 *
 * The reach branch hands over to the running branch at exactly 1.1, so the
 * curve is continuous over the whole 0-180° range (see TODO.md P0-2).
 *
 * ## The dead zone was not dead (v0.53.0)
 *
 * The last line used to read `1.0 + (factor - 1.0) * windStrength`, which is a
 * blend: `(1-W)` of a flat base speed plus `W` of the polar. The `(1-W)` term
 * is a playability fudge — it is what keeps a ship moving in light air — and it
 * was paid out **in full inside the dead zone**, where no sail draws at all.
 *
 * Measured at the ordinary trade wind (W≈0.5), that fudge left a ship in irons
 * at 0.48 of base speed; and because `cos(0°) = 1`, sailing **straight into the
 * wind** gave every one of the nine classes its best speed made good to
 * windward — 0.480 against 0.344 for the best beat a pinnace could lay. Working
 * to windward was strictly worse than not working at all, so the polar diagram,
 * the nine dead angles printed on the help screen and the "in irons" warning on
 * the map changed no decision the player could make.
 *
 * The fix is to pay the light-air fudge in proportion to how much sail can
 * actually draw (`draw`, 0 at the eye of the wind and 1 from the close-hauled
 * ceiling outwards), and to let the flat base speed back in only as the wind
 * itself dies — `calm` — so a dead calm still reads exactly 1.0 on every
 * heading, as it always has.
 *
 * Two properties hold by construction and are asserted:
 *   • at or above `BEAT_CEIL` the returned number is **bit-identical** to the
 *     old one, at every wind strength. Beam reach, running, chases, gunnery
 *     ranges and every passage time measured in fifteen releases are untouched;
 *   • `windStrength = 0` returns 1.0 everywhere, dead zone included.
 *
 * The close-hauled band also rises as `sqrt` rather than linearly. A linear
 * ramp put a square rigger's best beat at 75°, where `cos` has almost nothing
 * left to give; the square-root ramp — sails fill quickly once she falls off
 * the wind, then flatten — puts it at 51° for a pinnace and 70° for a galleon,
 * which is where a seaman would look for it.
 *
 * Returns 0..~1.5 multiplied by windStrength. No wind = base speed (1.0).
 */
export function windSpeedModifier(
  shipHeading: HeadingRad,
  windDirRad: HeadingRad,
  windStrength: number,
  minWindAngle = 30, // ship-specific dead zone in degrees
): number {
  return windPolar(shipHeading, windDirRad, windStrength, minWindAngle).speed;
}

/**
 * The polar, and how much of her canvas is drawing while she sails it.
 *
 * `draw` is the second number every caller needs and none of them had: it is
 * what tells the navigator's bonus that there is nothing to recover at the eye
 * of the wind. Callers that only want the speed keep using
 * `windSpeedModifier`, which is this function with the second field dropped.
 */
export function windPolar(
  shipHeading: HeadingRad,
  windDirRad: HeadingRad,
  windStrength: number,
  minWindAngle = 30, // ship-specific dead zone in degrees
): { speed: number; draw: number } {
  const angleDiff = Math.abs(normalizeHeading(shipHeading - windDirRad));
  const windAngle = angleDiff > Math.PI ? TWO_PI - angleDiff : angleDiff;
  const deg = windAngle * (180 / Math.PI);

  let factor: number;
  if (deg < minWindAngle) {
    // Dead zone: can't sail into wind (ship-specific angle)
    factor = 0;
  } else if (deg < minWindAngle + 30) {
    // Close hauled: 0→0.4 off the dead-zone edge, steeply at first
    factor = Math.sqrt((deg - minWindAngle) / 30) * BEAT_CEIL;
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

  // How much canvas is drawing: nothing at the eye of the wind, everything from
  // the close-hauled ceiling outwards.
  const draw = Math.min(1, factor / BEAT_CEIL);

  // The light-air term. `calm` is what the unmodelled world — oars, sweeps,
  // luck, a tide — hands back as the wind itself dies, so `windStrength = 0`
  // still reads 1.0 on every heading. It falls away as a cube: by the ordinary
  // trade wind there is almost nothing of it left to collect in the dead zone.
  const calm = (1 - windStrength) ** 3;
  const light = (1 - windStrength) * (draw + (1 - draw) * calm);

  // At or above BEAT_CEIL, draw is 1 and this is exactly `1 + (factor-1) * W`.
  return {
    speed: Math.max(IRONS_STEERAGE, light + windStrength * factor),
    draw,
  };
}

/**
 * The wind the Caribbean actually blows, for anything that has to name one.
 *
 * `MONTHLY_WIND` sits between 0.48 and 0.62 all year, so this is the middle of
 * the seasonal band rather than a round number picked to be tidy.
 */
export const TRADE_WIND_REF = 0.52;

/**
 * How far off the wind this rig makes her best ground to windward (v0.53.0).
 *
 * Derived by walking her own polar, not written down anywhere: the moment the
 * curve changes, this number changes with it and cannot go stale. It is what
 * the help screen prints beside the dead angle, because a dead angle on its own
 * tells the captain what he may not do and nothing about what he should.
 *
 * Measured at `TRADE_WIND_REF`. In a stiffer breeze the best beat walks a few
 * degrees further off the wind, which is true of real ships too.
 */
export function bestBeatAngle(minWindAngle = 30, windStrength = TRADE_WIND_REF): number {
  let best = -Infinity;
  let deg = minWindAngle;
  for (let d = minWindAngle; d <= 120; d += 0.25) {
    const rad = (d * Math.PI) / 180;
    const made = windSpeedModifier(rad, 0, windStrength, minWindAngle) * Math.cos(rad);
    if (made > best) { best = made; deg = d; }
  }
  return Math.round(deg);
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
 * `draw` is the guard added in v0.53.0. The shortfall is measured against base
 * speed, and the dead zone is pure shortfall — so before this parameter existed
 * a master navigator recovered a fifth of it and put a galleon back to making
 * better way straight into the eye of the wind than on her best beat. He can
 * trim what is drawing and pick the tack; he cannot make canvas draw aback.
 *
 * That is the whole design. Anybody can steer a ship that is already flying;
 * the man who knows his trade is the one who gets her to windward. Measured on
 * a 600-unit passage dead to windward in an average trade wind: 4.43 days for
 * navigation 0, 3.47 for 5, 2.85 for 10 — and 1.53 days for every one of them
 * on a broad reach.
 */
export function navigatedWindModifier(
  windMod: number,
  navigation: number,
  /**
   * How much canvas is drawing, from `windPolar`. Defaults to 1, which is how
   * every caller behaved before v0.53.0 — so a caller that does not know about
   * the dead zone is not silently given a different ship.
   */
  draw = 1,
): number {
  const shortfall = Math.max(0, 1 - windMod) * Math.max(0, Math.min(1, draw));
  if (shortfall <= 0) return windMod;
  const skill = Math.max(0, Math.min(10, navigation)) - NEUTRAL_NAVIGATION;
  return Math.max(0, windMod + skill * NAVIGATOR_GAIN * shortfall);
}
