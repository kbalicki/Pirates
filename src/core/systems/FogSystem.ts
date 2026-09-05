/**
 * FogSystem — the weather that helps the man being chased (v0.40.0).
 *
 * The third kind of weather in this game, and the first that is not a hazard.
 *
 *   - a **squall** is answered with the sails (v0.38.0);
 *   - a **hurricane** is answered with the helm (v0.39.0);
 *   - **fog is not answered at all.** It takes nothing off a ship. What it does
 *     is change *who can see whom* — and it cuts both ways, which is the whole
 *     point. Fog is a disaster when you are hunting a named merchantman and a
 *     gift when a guarda costa is two miles astern of you.
 *
 * That symmetry is the feature. Every other piece of weather in this codebase
 * is a cost; this one is a *condition*, and whether it is good or bad depends
 * entirely on what the captain is doing when it rolls in.
 *
 * ## Nothing is stored, again
 *
 * Same rule as `WeatherFieldSystem` (v0.39.0): before adding a field to the
 * save, check whether it can be derived. Fog is a pure function of things the
 * world already knows —
 *
 *   1. **calm air.** Fog does not survive a breeze. `FOG_MAX_WIND` is well
 *      below the seasonal mean, so a foggy morning needs the wind to have
 *      wandered down, which happens now and then rather than on a timetable.
 *      This is also why no storm is ever foggy and no rule was needed to say
 *      so: a squall adds 0.3 to the wind and a hurricane pins it at 1.
 *   2. **the hour.** It forms after midnight, is thickest before dawn and burns
 *      off through the morning. This is the first thing in the whole codebase
 *      to read the clock as anything but a date — see the note on `isDaytime`
 *      below.
 *   3. **where you are.** A value-noise field keyed on the *night* and the
 *      map cell, so fog lies in banks a few hundred units across rather than
 *      over the whole Caribbean at once, and lies somewhere different tomorrow.
 *
 * Multiply the three and you get a bank that a captain sails into and out of,
 * that he can sometimes see coming, and that costs the save nothing.
 *
 * ## Why night itself is *not* a mechanic here
 *
 * `isDaytime` has sat in `TimeSystem` since the first commit with no consumer,
 * and it is tempting to read that as the usual smell. It is not. A game day is
 * 1440 ticks and the map runs at 24 ticks a second, so **a day and a night take
 * sixty seconds of real play**. Making darkness cost the player his spyglass
 * would take his spyglass away for twenty seconds out of every minute, for
 * ever, with no decision attached to it. That is a metronome, not a mechanic.
 *
 * So the clock is used here only as one of three *preconditions* for fog, which
 * is rare because all three must line up. `isDaytime` stays unread on purpose.
 */

import type { WorldState, Vec2 } from "../model/WorldState.ts";
import { clamp, lerp } from "../services/Geometry.ts";

/** Above this wind there is no fog, whatever the hour. */
export const FOG_MAX_WIND = 0.35;

/** What is left of the spyglass in a thick bank. */
export const FOG_VISION_SHARE = 0.35;

/**
 * What is left of an NPC's lookout in the same bank.
 *
 * Deliberately kinder than the player's own share. He is the one being hunted
 * often enough for this to be the half he notices, and a fog that blinded him
 * more than it blinded them would make the mechanic feel like a punishment
 * rather than cover.
 */
export const FOG_AWARENESS_SHARE = 0.45;

/** Size of a fog bank, in world units. About a day's sail across. */
export const FOG_CELL = 420;

/**
 * How much of the noise field counts as fog at all.
 *
 * The raw field averages 0.5, so a floor above that leaves banks rather than a
 * permanent haze: roughly two cells in five carry anything, and only their
 * middles are thick.
 */
export const FOG_PATCH_FLOOR = 0.55;

function hash3(a: number, b: number, c: number): number {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ ((b | 0) + 0x165667b1), 0xc2b2ae35);
  h = Math.imul(h ^ ((c | 0) + 0x27d4eb2f), 0x165667b1);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Which night this moment belongs to.
 *
 * A bank that formed at 23:00 has to still be there at 01:00, and the day
 * number rolls over in between — so the field is keyed on the night, not the
 * date, or every fog in the game would jump sideways at midnight.
 */
export function fogNight(day: number, hour: number): number {
  return hour < 12 ? day : day + 1;
}

/**
 * The noise field: 0..1, smooth, patchy, different every night.
 *
 * Value noise rather than anything cleverer. What matters is that the edge of a
 * bank is soft — a captain should watch the world close in over a minute or two
 * rather than have it switch off between two frames.
 */
export function fogPatch(night: number, pos: Vec2): number {
  const gx = pos.x / FOG_CELL;
  const gy = pos.y / FOG_CELL;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = smooth(gx - x0);
  const ty = smooth(gy - y0);
  const v = (i: number, j: number) => hash3(x0 + i, y0 + j, night);
  return lerp(
    lerp(v(0, 0), v(1, 0), tx),
    lerp(v(0, 1), v(1, 1), tx),
    ty,
  );
}

/**
 * How much of the night's fog the hour allows: forms from 22:00, full from
 * 02:00 to 07:00, burnt off by 10:00.
 */
export function fogHourFactor(hour: number, minute = 0): number {
  const h = hour + minute / 60;
  if (h >= 22) return (h - 22) / 4;        // 0 at 22:00 → 0.5 by midnight
  if (h < 2) return (h + 2) / 4;           // 0.5 at midnight → 1 at 02:00
  if (h < 7) return 1;
  if (h < 10) return 1 - (h - 7) / 3;
  return 0;
}

/** How much of the wind's calm the fog needs: all of it at nought, none at `FOG_MAX_WIND`. */
export function fogCalmFactor(windStrength: number): number {
  return clamp((FOG_MAX_WIND - windStrength) / FOG_MAX_WIND, 0, 1);
}

/**
 * Fog at a place, 0..1.
 *
 * Takes the *prevailing* wind rather than the local field on purpose: fog is
 * about the state of the air over a region, and feeding it the hurricane's own
 * circling gale would be asking whether it is calm inside a storm.
 */
export function fogDensity(world: WorldState, pos: Vec2): number {
  const calm = fogCalmFactor(world.weather.windStrength);
  if (calm <= 0) return 0;
  const hour = fogHourFactor(world.time.hour, world.time.minute);
  if (hour <= 0) return 0;
  const raw = fogPatch(fogNight(world.time.day, world.time.hour), pos);
  const patch = clamp((raw - FOG_PATCH_FLOOR) / (1 - FOG_PATCH_FLOOR), 0, 1);
  return calm * hour * patch;
}

/** What the lookout can still see through it, as a multiplier on the spyglass. */
export function fogVisionMultiplier(density: number): number {
  return 1 - (1 - FOG_VISION_SHARE) * clamp(density, 0, 1);
}

/** What an NPC's own lookout can see through it. */
export function fogAwarenessMultiplier(density: number): number {
  return 1 - (1 - FOG_AWARENESS_SHARE) * clamp(density, 0, 1);
}

/** Thick enough for the captain to be told about it. */
export const FOG_VISIBLE = 0.12;

/**
 * Thin enough to call it lifted.
 *
 * Two thresholds, not one, and this is not fussiness: measured in the running
 * game, the density wanders across a single threshold as the wind wanders, and
 * the first cut wrote **three** journal entries in two game hours — fog closed
 * in, lifted, closed in again. The same shape as the blockade toasts, which
 * hang off the biting threshold rather than off zero.
 */
export const FOG_LIFTED = 0.05;

/** The flag that carries the hysteresis. `worldFlags` already exists, so no migration. */
export const FOG_FLAG = "in_fog";

/**
 * Whether the captain counts as being in fog, given where he was a moment ago.
 *
 * The engine compares this at the two ends of a tick, so entering a bank and
 * having one settle over a ship lying still are the same event.
 */
export function inFogNow(density: number, wasInFog: boolean): boolean {
  return wasInFog ? density >= FOG_LIFTED : density >= FOG_VISIBLE;
}
