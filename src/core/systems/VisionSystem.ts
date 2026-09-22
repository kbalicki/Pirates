import { SHIP_CLASSES } from "../data/ships.ts";
import { fleetMaxMastHeight } from "./FleetSystem.ts";
import { stormVisionMultiplier } from "./StormSystem.ts";
import { weatherAtPlayer } from "./WeatherFieldSystem.ts";
import type { WorldState } from "../model/WorldState.ts";

/**
 * How far the captain can see (v0.87.0).
 *
 * This is the oldest number in the game — vision has been a function of the
 * tallest mast in the squadron since the spyglass was written — and until this
 * release it lived in `src/game/render/WorldRenderer.ts`, beside the code that
 * sets a sprite's alpha. `core/` could not import it, so every module in
 * `core/` that needed to know what the captain can see **guessed in prose**:
 *
 * - `ExpeditionFleetSystem`, of `MATERIALIZE_RANGE = 620`: *"well outside any
 *   spyglass, so the fleet exists before it can be seen"* — true.
 * - `PredationSystem`, of `WITNESS_RANGE = 700`: *"How far the player has to
 *   be to see it happen and get a line in his log"* — false, and further off
 *   than the number the module next door called well outside any spyglass.
 *
 * Measured over 50 simulated days and 447 hulls run down by somebody else
 * (three flagships, four seeds, the captain lying off Havana): the journal
 * gave him a line for **243** of them and he could have seen **15**. The
 * median fight he "witnessed" happened **684** world px away — ten times the
 * best spyglass in the game, and off the screen at every one of the fourteen
 * zoom levels.
 *
 * | what | world px |
 * |---|---|
 * | pinnace, 10 m of mast | 36 |
 * | sloop, 15 m | 42 |
 * | galleon, 35 m — the best in the game | 65 |
 * | the screen's half-width at the default zoom (6×) | 107 |
 * | the screen's half-width zoomed all the way out (1.5×) | 427 |
 * | `WITNESS_RANGE`, removed in this release | 700 |
 *
 * So the number lives here now, with the systems that reason about it, and the
 * render layer imports it like everything else. A distance the player is
 * measured against belongs where the rules are.
 */

/** Vision with no mast at all: the lookout's own eye, in world px. */
export const BASE_VISION = 25;

/** World px of horizon bought by each metre of mast. */
export const RANGE_PER_METER = 1.14;

/** Vision range from a mast height: pinnace (10 m) → 36, sloop (15 m) → 42, galleon (35 m) → 65. */
export function visionRangeForMast(mastHeight: number): number {
  return BASE_VISION + mastHeight * RANGE_PER_METER;
}

/** The best spyglass any hull in the game carries. */
export function bestVisionRange(): number {
  return visionRangeForMast(
    Math.max(...Object.values(SHIP_CLASSES).map(c => c.mastHeight)),
  );
}

/**
 * What the captain can see from where he is now, weather included.
 *
 * The tallest mast in the squadron (a consort's crow's nest is his too), cut
 * down by the squall he is actually sitting in — the same circle the fog of
 * war is drawn from, so a system asking "could he see that" gets the answer
 * the screen gives him.
 */
export function playerVisionRange(world: WorldState): number {
  const ship = world.entities[world.player.shipId as string]?.ship;
  if (!ship) return BASE_VISION;
  const mast = fleetMaxMastHeight(ship.classId as string, world.player.fleet ?? []);
  return visionRangeForMast(mast) * stormVisionMultiplier(weatherAtPlayer(world));
}
