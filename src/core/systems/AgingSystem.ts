/**
 * AgingSystem — the captain gets older, and it starts to matter.
 *
 * `calculateAge()` has existed since v0.5.6 and did exactly one thing: print a
 * number in the cabin screen. Nothing in the game read it. This module turns
 * age into the second half of the pressure `PlunderSystem` starts: a career
 * has a shape, and the shape is not flat.
 *
 * ## Three stages
 *
 *   20-35  prime      no modifier at all
 *   35-50  seasoned   the sword arm slows, the tongue and the charts sharpen
 *   50+    declining  physical skills fall away in earnest
 *
 * Which skills move in which direction is the whole point. `fencing` and
 * `gunnery` are the body; `navigation`, `charm` and `medicine` are experience.
 * A captain who starts at 20 and sails for thirty years ends up worse in a
 * duel and better at everything that happens off the blade — which is the
 * argument for retiring while the retiring is good.
 *
 * Modifiers are multipliers on the *effective* skill at the point of use, not
 * edits to the stored profile. The captain's sheet keeps showing what he
 * learned; the world applies what he can still do.
 */

import type { WorldState } from "../model/WorldState.ts";
import type { SkillId } from "../model/CaptainState.ts";
import { calculateAge, SKILL_MAX } from "../model/CaptainState.ts";

export type AgeStage = "prime" | "seasoned" | "declining";

export const AGE_SEASONED_FROM = 35;
export const AGE_DECLINING_FROM = 50;

/** Skills that live in the body and fade. */
const PHYSICAL: SkillId[] = ["fencing", "gunnery"];
/** Skills that are experience and grow. */
const LEARNED: SkillId[] = ["navigation", "charm", "medicine"];

/** Worst multiplier a physical skill can fall to, however old the captain gets. */
export const PHYSICAL_FLOOR = 0.55;
/** Best multiplier experience can add. */
export const LEARNED_CEILING = 1.30;

export function ageStage(age: number): AgeStage {
  if (age >= AGE_DECLINING_FROM) return "declining";
  if (age >= AGE_SEASONED_FROM) return "seasoned";
  return "prime";
}

export function captainAge(world: WorldState): number {
  return calculateAge(world.time.day, world.captain?.startAge ?? 20);
}

/**
 * Multiplier applied to one skill at this age.
 *
 * The curves are linear inside each stage and continuous across the
 * boundaries, so nothing changes overnight on a birthday: at 35 both curves
 * are still exactly 1.0, and they diverge from there.
 */
export function ageSkillModifier(age: number, skill: SkillId): number {
  if (age < AGE_SEASONED_FROM) return 1;

  if (PHYSICAL.includes(skill)) {
    if (age < AGE_DECLINING_FROM) {
      // 35 -> 50: a gentle slide to 0.85
      const t = (age - AGE_SEASONED_FROM) / (AGE_DECLINING_FROM - AGE_SEASONED_FROM);
      return 1 - 0.15 * t;
    }
    // 50 -> 70: from 0.85 down to the floor
    const t = Math.min(1, (age - AGE_DECLINING_FROM) / 20);
    return Math.max(PHYSICAL_FLOOR, 0.85 - (0.85 - PHYSICAL_FLOOR) * t);
  }

  if (LEARNED.includes(skill)) {
    // 35 -> 60: experience accumulates, then levels off
    const t = Math.min(1, (age - AGE_SEASONED_FROM) / 25);
    return 1 + (LEARNED_CEILING - 1) * t;
  }

  return 1;
}

/**
 * The skill value the world should actually use: what the captain learned,
 * scaled by what his years have done to it, clamped to the normal 0..SKILL_MAX
 * range so nothing downstream has to guard against a 13.
 */
export function effectiveSkill(world: WorldState, skill: SkillId): number {
  const base = world.captain?.skills?.[skill] ?? 0;
  const scaled = base * ageSkillModifier(captainAge(world), skill);
  return Math.max(0, Math.min(SKILL_MAX, scaled));
}

/** All five effective skills at once, for the cabin sheet. */
export function effectiveSkills(world: WorldState): Record<SkillId, number> {
  return {
    fencing: effectiveSkill(world, "fencing"),
    gunnery: effectiveSkill(world, "gunnery"),
    navigation: effectiveSkill(world, "navigation"),
    medicine: effectiveSkill(world, "medicine"),
    charm: effectiveSkill(world, "charm"),
  };
}
