/**
 * CurrentSystem — the sea moves, and it moves the same way every day (v0.41.0).
 *
 * The last piece of module G's weather, and the only one that is not weather at
 * all: a current does not come and go. It is a fact about the map, like a reef
 * or a headland, and it is the fact that gave these waters their shape.
 *
 * ## The question the TODO left open
 *
 * *"Does a current set the ship, or only change her speed over ground?"*
 *
 * **It sets her.** A current is a velocity added to the ship's own, independent
 * of where her head is pointing; the alternative — projecting it onto the
 * heading — is the same number with the interesting half thrown away, because
 * the interesting half is being carried sideways.
 *
 * The worry attached to that question was that being set would be irritating.
 * It is not, because of what this deliberately does *not* touch: **the helm.**
 * The heading is never altered, nothing fights the player's steering, and the
 * ship answers exactly as she did before. What changes is where she ends up,
 * and the answer to that is to allow for it — which is what navigating is.
 *
 * ## It is already visible, twice over
 *
 * The speed readout on the HUD reads `vel`, and `vel` is now speed **over the
 * ground**: ride the Straits of Florida and the number goes up without touching
 * a sail. And the bands are drawn on the chart under `C`, because a mechanic
 * whose only evidence is that your reckoning was wrong is a bug as far as the
 * player is concerned.
 *
 * ## Bands, feathered
 *
 * `CURRENTS` is a handful of rectangles. Each one has a soft edge
 * (`CURRENT_FEATHER`) so nothing shoves a ship sideways the instant she crosses
 * a line, and where two bands overlap their vectors simply add — which is what
 * makes the corner of the Yucatán Channel a turn rather than a switch.
 *
 * Nothing here is stored, for the third release running: the set at a point is
 * a function of the point.
 */

import type { WorldState, Vec2 } from "../model/WorldState.ts";
import { CURRENTS, CURRENT_FEATHER, distToRect, type CurrentDef } from "../data/currents.ts";
import { headingToVec, vec2Length } from "../services/Geometry.ts";

/** How much of a band's strength reaches a point: all of it inside, fading out. */
export function currentShare(pos: Vec2, def: CurrentDef): number {
  const d = distToRect(pos, def.rect);
  if (d <= 0) return 1;
  if (d >= CURRENT_FEATHER) return 0;
  return 1 - d / CURRENT_FEATHER;
}

/**
 * The set at a point, as a velocity in world units per tick.
 *
 * Overlapping bands add as vectors rather than fighting for priority: two
 * currents meeting really do make one current going somewhere between them, and
 * the alternative — the strongest wins — would put a hard seam down the middle
 * of every junction on the chart.
 */
export function currentAt(pos: Vec2): Vec2 {
  let x = 0;
  let y = 0;
  for (const def of CURRENTS) {
    const share = currentShare(pos, def);
    if (share <= 0) continue;
    const dir = headingToVec(def.flowsToward);
    x += dir.x * def.strength * share;
    y += dir.y * def.strength * share;
  }
  return { x, y };
}

/** How fast the water is going at a point, in world units per tick. */
export function currentSpeed(pos: Vec2): number {
  return vec2Length(currentAt(pos));
}

/**
 * The strongest band a point is in, or nothing — for the one line of chart
 * label that says which water this is.
 */
export function currentBandAt(pos: Vec2): CurrentDef | null {
  let best: CurrentDef | null = null;
  let bestPull = 0;
  for (const def of CURRENTS) {
    const pull = currentShare(pos, def) * def.strength;
    if (pull > bestPull) { bestPull = pull; best = def; }
  }
  return best;
}

/**
 * The set under the player's own keel, which is what the HUD asks about.
 *
 * A landed captain is not being set anywhere: his ship is at anchor and he is
 * ashore. Everything afloat drifts, however, including a ship lying under bare
 * poles — that is the difference between a current and a wind, and it is why
 * furling sail is not the same as stopping.
 */
export function currentUnderPlayer(world: WorldState): Vec2 {
  const entity = world.entities[world.player.shipId as string];
  if (!entity || entity.mode !== "sailing") return { x: 0, y: 0 };
  return currentAt(entity.pos);
}
