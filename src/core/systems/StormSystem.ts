/**
 * StormSystem — the squall the captain has been sailing through all along
 * (v0.38.0).
 *
 * `WeatherState.stormActive` has been in the model since the first commit.
 * `WeatherSystem` rolls for it against a seasonal table, runs it for six to
 * thirty seconds of play, adds 0.3 to the wind while it lasts, and writes it
 * into every save. **Nothing has ever read it.** Not a system, not a scene, not
 * a renderer — `grep` finds the producer and no consumer at all.
 *
 * So the storm existed as a small extra push on the polar curve and as nothing
 * else: no warning, no danger, no reason to touch the sails. That is the same
 * mistake as `crewMul` (v0.29.0) and `treaty_signed` (v0.30.0), and the third
 * time this codebase has found it. From both sides the code looked complete.
 *
 * ## What a squall is for
 *
 * A decision, and the game already had both halves of it lying about:
 * `SailSystem` has four named levels the player changes with a keystroke, and
 * `ShipRepairSystem` has jury repair at sea that mattered only after a battle.
 *
 * **Canvas is what it tears.** Rigging damage is proportional to how much sail
 * is set above `STORM_SAFE_SAIL`; at Reefed or Furled there is none at all. The
 * captain who wants to keep running before a squall pays for it in topmasts,
 * and the one who shortens sail pays for it in hours. Neither answer is free
 * and neither is wrong.
 *
 * **It costs him his eyes too.** `STORM_VISION_SHARE` cuts the spyglass, which
 * is the one thing that makes weather change how the map is played: a squall is
 * when a hunted merchantman gets past you.
 *
 * Nothing here touches an NPC. The hulls on the chart are a sample of the
 * traffic and always have been; giving each of them rigging damage would be
 * bookkeeping the player never sees, on ships that despawn behind him.
 */

import type { WorldState, WeatherState } from "../model/WorldState.ts";

/**
 * Sail a squall can be carried under without loss.
 *
 * Half — which is `SailSystem`'s "Reefed", the level that already exists and
 * that the player already knows how to reach. Choosing a number the sail UI
 * does not name would make the rule invisible.
 */
export const STORM_SAFE_SAIL = 0.5;

/**
 * Rigging torn per tick at full sail, as a share of the ship's own `sailsMax`.
 *
 * A share rather than hit points, so a squall costs a sloop and a galleon the
 * same *fraction* of their canvas. A storm runs 120-600 ticks, so a full-sail
 * captain loses roughly 5% to 24% of his rigging by riding one out — enough to
 * be worth a decision, not enough to end a voyage.
 */
export const STORM_RIG_SHARE_PER_TICK = 0.0004;

/** How much of the spyglass is left in a squall. */
export const STORM_VISION_SHARE = 0.55;

export function isStormy(weather: WeatherState): boolean {
  return weather.stormActive === true;
}

/** What the lookout can still see, as a multiplier on the spyglass. */
export function stormVisionMultiplier(weather: WeatherState): number {
  return isStormy(weather) ? STORM_VISION_SHARE : 1;
}

/**
 * Rigging lost this tick at a given sail level.
 *
 * Zero at or below `STORM_SAFE_SAIL`, and rising linearly from there so that
 * Half sail is genuinely a middle answer rather than a worse Full.
 */
export function stormRigLoss(sailLevel: number, sailsMax: number, dtTicks: number): number {
  const over = sailLevel - STORM_SAFE_SAIL;
  if (over <= 0) return 0;
  const exposure = over / (1 - STORM_SAFE_SAIL);
  return sailsMax * STORM_RIG_SHARE_PER_TICK * exposure * dtTicks;
}

/**
 * Tear the fleet's canvas for one tick of squall.
 *
 * The flagship and every consort, at the flagship's sail level: the fleet sails
 * as one everywhere else in this codebase (`fleetSpeedMultiplier`,
 * `fleetMaxMastHeight`), and a consort quietly riding out a storm under bare
 * poles while her admiral loses topmasts would be the odd thing to model.
 *
 * Returns the world untouched when there is no storm, when the captain is
 * ashore, or when he is under Reefed — which is what lets the engine call it
 * unconditionally.
 */
export function tickStormDamage(world: WorldState, dtTicks: number): WorldState {
  if (!isStormy(world.weather)) return world;

  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  if (!entity?.ship || entity.mode !== "sailing") return world;

  const loss = stormRigLoss(entity.sailLevel, entity.ship.sailsMax, dtTicks);
  if (loss <= 0) return world;

  const flagship = {
    ...entity,
    ship: { ...entity.ship, sailsHp: Math.max(0, entity.ship.sailsHp - loss) },
  };

  const fleet = world.player.fleet ?? [];
  const battered = fleet.length === 0 ? fleet : fleet.map(consort => ({
    ...consort,
    sailsHp: Math.max(0, consort.sailsHp - stormRigLoss(entity.sailLevel, consort.sailsMax, dtTicks)),
  }));

  return {
    ...world,
    entities: { ...world.entities, [shipId]: flagship },
    player: fleet.length === 0 ? world.player : { ...world.player, fleet: battered },
  };
}

/**
 * The line the HUD carries while it blows, or nothing.
 *
 * Two states rather than one, because "you are carrying too much sail" is the
 * only actionable thing a weather warning can say. A captain already reefed
 * wants to know the squall is still on him and that he is doing the right
 * thing; a captain under full sail wants to know he is paying for it.
 */
export function stormWarning(world: WorldState): { key: string; danger: boolean } | null {
  if (!isStormy(world.weather)) return null;
  const entity = world.entities[world.player.shipId as string];
  const carrying = (entity?.sailLevel ?? 0) > STORM_SAFE_SAIL && entity?.mode === "sailing";
  return carrying
    ? { key: "weather.storm_canvas", danger: true }
    : { key: "weather.storm", danger: false };
}
