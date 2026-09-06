/**
 * SurgeonSystem — the men who fell are not all dead yet (v0.47.0).
 *
 * `medicine` has been one of the five numbers on the character sheet since the
 * game had a character sheet. Until this file existed, the only code in the
 * project that read it was `AgingSystem`, which made it *rise* after
 * thirty-five — a reward, carefully modelled, for nothing at all. Every man who
 * fell in a boarding, on a beach or under a broadside was struck off the muster
 * roll the same instant and never came back.
 *
 * So this is the carpenter's opposite number. `ShipRepairSystem` mends the hull
 * a little every day at sea and never enough; the surgeon does the same for the
 * crew, on the same daily clock, and the skill decides **who lives**, not how
 * fast the work goes.
 *
 * The shape of it:
 *
 *   1. A fight ends. `woundedFrom()` says how many of the fallen were carried
 *      below rather than over the side — a fixed share, because that is the
 *      nature of shot and not of the surgeon.
 *   2. They are **off** the muster roll while they are there. `crew.current`
 *      has already lost them, so nothing that counts hands sees a wounded man
 *      as a working one: he does not reload a gun, board a ship or mend a
 *      spar.
 *   3. Each day the surgeon works through part of the sick bay. Some go back
 *      on the roll and some are sewn into their hammocks, and `medicine` is
 *      the whole difference between the two.
 *
 * Of every hundred men who fall, a captain with no medicine gets eighteen back
 * and one who studied it gets thirty-six — which is a second frigate's worth of
 * crew over a career, found in a number that was already on his sheet.
 *
 * Pure. No Phaser, no RNG: the sick bay must not reshuffle the world's dice,
 * for the same reason `generateAvailableCrew` rolls them either way (v0.24.0).
 */

import type { WorldState } from "../model/WorldState.ts";
import type { FleetShip } from "../model/WorldState.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { effectiveSkill } from "./AgingSystem.ts";
import { consortCrew } from "./FleetSystem.ts";

/**
 * Share of the men who fall in a fight who are carried below alive.
 *
 * A constant, and deliberately so: whether a round shot kills a man outright or
 * takes his arm off is not a thing the ship's surgeon has any say in. What he
 * has a say in is what happens to the ones who reach his table.
 */
export const WOUNDED_SHARE = 0.40;

/** Share of the sick bay the surgeon works through in a day. */
export const TEND_SHARE = 0.30;

/** Share of the wounded who live, at medicine 0. */
export const SURVIVAL_BASE = 0.45;
/** Extra share who live, per point of medicine. */
export const SURVIVAL_PER_SKILL = 0.046;

/**
 * How many of the fallen are still alive when the smoke clears.
 *
 * Called at the moment a fight is written back into the world, with the men the
 * ship actually lost. Wounded are **not** added back to `crew.current`: they
 * are below, and the roll is right without them.
 */
export function woundedFrom(fallen: number): number {
  if (!(fallen > 0)) return 0;
  return Math.floor(fallen * WOUNDED_SHARE);
}

/**
 * Share of a sick bay that will eventually walk out of it, 0..1.
 *
 * 0.45 at medicine 0, 0.68 at the 5 every captain starts with, 0.91 at 10.
 * Half a crew of amputations and fevers against nine in ten back on their feet
 * is the difference between a surgeon and a man with a saw.
 */
export function survivalShare(medicine: number): number {
  const m = Math.max(0, Math.min(10, medicine));
  return Math.max(0, Math.min(1, SURVIVAL_BASE + SURVIVAL_PER_SKILL * m));
}

export type SickBayDay = {
  /** Men decided today — back on the roll or sewn up, one or the other. */
  tended: number;
  /** Of those, the ones fit for duty. */
  recovered: number;
  /** Of those, the ones who did not make it. */
  died: number;
  /** Men still below when the day ends. */
  remaining: number;
};

/**
 * One day's rounds over a single sick bay.
 *
 * At least one man is decided a day, so nobody lies below for the rest of the
 * campaign because a thirty-percent share of three rounds down to nothing.
 */
export function tendSickBay(wounded: number, medicine: number): SickBayDay {
  const pool = Math.max(0, Math.floor(wounded));
  if (pool <= 0) return { tended: 0, recovered: 0, died: 0, remaining: 0 };

  const tended = Math.min(pool, Math.max(1, Math.round(pool * TEND_SHARE)));
  const recovered = Math.round(tended * survivalShare(medicine));
  const died = tended - recovered;
  return { tended, recovered, died, remaining: pool - tended };
}

export type SurgeonResult = {
  world: WorldState;
  /** Men back on the muster roll across the whole squadron today. */
  recovered: number;
  /** Men lost of their wounds today. */
  died: number;
};

/**
 * The surgeon's daily rounds over the flagship and every consort.
 *
 * A no-op — and no log line — on a day when there is nobody below, which is
 * most days. Called from the day change in `WorldEngine`, right after the
 * carpenter, because the two are the same idea applied to the two things a
 * ship is made of.
 */
export function tendWounded(world: WorldState): SurgeonResult {
  const medicine = effectiveSkill(world, "medicine");

  let recovered = 0;
  let died = 0;

  // ── Flagship ──
  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  const ship = entity?.ship;
  let entities = world.entities;

  if (ship && (ship.wounded ?? 0) > 0) {
    const day = tendSickBay(ship.wounded ?? 0, medicine);
    // No berth check, deliberately. These men never left the ship: they came
    // off the roll when they fell and the roll had room for them before that,
    // so putting them back cannot overfill her. An earlier draft clamped to
    // `crew.max` and kept the overflow in the sick bay — where it was tended
    // again the next day and eventually died of its wounds. A man who is fit
    // is fit.
    recovered += day.recovered;
    died += day.died;
    entities = {
      ...entities,
      [shipId]: {
        ...entity,
        ship: {
          ...ship,
          wounded: day.remaining,
          crew: { ...ship.crew, current: ship.crew.current + day.recovered },
        },
      },
    };
  }

  // ── Consorts ──
  const fleet = world.player.fleet ?? [];
  let fleetChanged = false;
  const tendedFleet: FleetShip[] = fleet.map(consort => {
    const below = consort.wounded ?? 0;
    if (below <= 0) return consort;
    const day = tendSickBay(below, medicine);
    fleetChanged = true;
    recovered += day.recovered;
    died += day.died;
    return {
      ...consort,
      wounded: day.remaining,
      crew: consortCrew(consort) + day.recovered,
    };
  });

  if (recovered === 0 && died === 0) return { world, recovered: 0, died: 0 };

  const tendedWorld: WorldState = {
    ...world,
    entities,
    player: fleetChanged ? { ...world.player, fleet: tendedFleet } : world.player,
  };

  // Only worth a line in the log when men actually changed state.
  const logged = recovered > 0
    ? addLogEntry(tendedWorld, "event.wounded_recovered", { count: recovered })
    : (died > 0 ? addLogEntry(tendedWorld, "event.wounded_died", { count: died }) : tendedWorld);

  return { world: logged, recovered, died };
}
