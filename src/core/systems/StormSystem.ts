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
 *
 * ## And then a squall stopped being the only weather (v0.39.0)
 *
 * Everything here now reads `weatherAt` rather than the one saved global wind,
 * so a storm has a *place*. That brings in the second kind: a `hurricane` world
 * event, which had a chart pin and a headline and had never touched the water.
 *
 * The two are different in kind, not in degree, and this module is where that
 * shows:
 *
 *   - a **squall** is answered with the sails. Reefed is free, and it can tear
 *     canvas to nothing if he insists on carrying it.
 *   - a **hurricane** is answered with the helm. Bare poles still lose canvas,
 *     it opens the hull as well, and it stops only at `HURRICANE_RIG_FLOOR` and
 *     `HURRICANE_HULL_FLOOR` — so it always leaves a ship that can be sailed
 *     out of the circle, which is the only answer there is.
 */

import type { WorldState, WeatherState } from "../model/WorldState.ts";
import {
  weatherAtPlayer,
  hurricaneRigLoss,
  hurricaneHullLoss,
  stormFloored,
  HURRICANE_HULL_FLOOR,
  HURRICANE_RIG_FLOOR,
  HURRICANE_VISION_SHARE,
  type LocalWeather,
} from "./WeatherFieldSystem.ts";

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

/**
 * Weather as any caller may hand it over: the saved global state, or the local
 * field `weatherAt` derives from it (v0.39.0). A plain `WeatherState` simply
 * has no hurricane in it, which is true of nearly all of the sea nearly all of
 * the time.
 */
type AnyWeather = WeatherState & { hurricane?: number };

export function isStormy(weather: AnyWeather): boolean {
  return weather.stormActive === true;
}

/**
 * What the lookout can still see, as a multiplier on the spyglass.
 *
 * A hurricane closes it down further than a squall, in proportion to how deep
 * into the circle the ship is — so the edge of one is a haze and the middle of
 * one is blind.
 */
export function stormVisionMultiplier(weather: AnyWeather): number {
  const eye = weather.hurricane ?? 0;
  if (eye > 0) {
    return Math.min(
      isStormy(weather) ? STORM_VISION_SHARE : 1,
      1 - (1 - HURRICANE_VISION_SHARE) * eye,
    );
  }
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
 * Tear the fleet's canvas for one tick of weather — and open her seams, if it
 * is a hurricane.
 *
 * The flagship and every consort, at the flagship's sail level: the fleet sails
 * as one everywhere else in this codebase (`fleetSpeedMultiplier`,
 * `fleetMaxMastHeight`), and a consort quietly riding out a storm under bare
 * poles while her admiral loses topmasts would be the odd thing to model.
 *
 * The weather it reads is the weather **where the ship is** (v0.39.0), not the
 * one saved global wind — so a hurricane standing over Cartagena is felt off
 * Cartagena and nowhere else.
 *
 * Two losses, and they are different in kind:
 *
 *   - the **squall** part depends on sail and is zero at Reefed, and can tear
 *     canvas to nothing, exactly as it has since v0.38.0;
 *   - the **hurricane** part ignores the sail entirely and takes hull as well,
 *     because there is no answer to one but leaving — but it stops at
 *     `HURRICANE_RIG_FLOOR` and `HURRICANE_HULL_FLOOR`, so it always leaves a
 *     ship that can be sailed home.
 *
 * Returns the world untouched when there is no storm, when the captain is
 * ashore, or when a mere squall finds him already reefed — which is what lets
 * the engine call it unconditionally.
 */
export function tickStormDamage(world: WorldState, dtTicks: number): WorldState {
  const local: LocalWeather = weatherAtPlayer(world);
  if (!isStormy(local)) return world;

  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  if (!entity?.ship || entity.mode !== "sailing") return world;

  const eye = local.hurricane;
  const squall = (sailsMax: number) => stormRigLoss(entity.sailLevel, sailsMax, dtTicks);
  const gale = (sailsMax: number) => hurricaneRigLoss(eye, sailsMax, dtTicks);
  const seams = (hullMax: number) => hurricaneHullLoss(eye, hullMax, dtTicks);

  const ship = entity.ship;
  if (squall(ship.sailsMax) + gale(ship.sailsMax) + seams(ship.hullMax) <= 0) return world;

  /**
   * Canvas. Inside a hurricane the floor covers **both** losses, not only the
   * hurricane's own: measured on screen, a frigate carrying full sail in one
   * went through the "torn" line and on toward dismasted, which on the map is a
   * 0.15 crawl inside a circle 260 units in radius. That is a captain sitting
   * out a storm he cannot leave, and the whole design says the helm is the
   * answer — so it has to stay an answer he can still give. A plain squall
   * keeps its v0.38.0 teeth and can shred canvas to nothing.
   */
  const canvas = (hp: number, max: number) => (eye > 0
    ? stormFloored(hp, max, squall(max) + gale(max), HURRICANE_RIG_FLOOR)
    : Math.max(0, hp - squall(max)));
  const hull = (hp: number, max: number) => stormFloored(hp, max, seams(max), HURRICANE_HULL_FLOOR);

  const flagship = {
    ...entity,
    ship: {
      ...ship,
      sailsHp: canvas(ship.sailsHp, ship.sailsMax),
      hullHp: hull(ship.hullHp, ship.hullMax),
    },
  };

  const fleet = world.player.fleet ?? [];
  const battered = fleet.length === 0 ? fleet : fleet.map(consort => ({
    ...consort,
    sailsHp: canvas(consort.sailsHp, consort.sailsMax),
    hullHp: hull(consort.hullHp, consort.hullMax),
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
 * Three states rather than one. A captain already reefed wants to know the
 * squall is still on him and that he is doing the right thing; a captain under
 * full sail wants to know he is paying for it; and a captain inside a hurricane
 * wants to know that neither of those answers is the one he needs (v0.39.0) —
 * that the sails will not save him and the helm might.
 *
 * `severity` is how deep into a hurricane he is, 0 for a plain squall, and it
 * is what the map's wash is drawn from.
 */
export function stormWarning(world: WorldState): { key: string; danger: boolean; severity: number } | null {
  const local = weatherAtPlayer(world);
  if (!isStormy(local)) return null;
  const entity = world.entities[world.player.shipId as string];
  const carrying = (entity?.sailLevel ?? 0) > STORM_SAFE_SAIL && entity?.mode === "sailing";
  // "Claw off" is an order to a ship. A captain ashore with his boats on the
  // beach takes no damage from any of this (`tickStormDamage` leaves him alone),
  // so telling him his hull is going would be the HUD lying to him.
  if (local.hurricane > 0 && entity?.mode === "sailing") {
    return { key: "weather.hurricane", danger: true, severity: local.hurricane };
  }
  return carrying
    ? { key: "weather.storm_canvas", danger: true, severity: 0 }
    : { key: "weather.storm", danger: false, severity: 0 };
}
