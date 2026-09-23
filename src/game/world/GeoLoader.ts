/**
 * GeoLoader — turning the preloaded `caribbean_geo.json` into a live coastline.
 *
 * `LANDMASSES` starts empty and everything geographic is a no-op until this
 * runs: water tests pass everywhere, `getPortWaterPos` answers the town's own
 * land position, and `Pathfinding` returns straight lines. That was fine while
 * `MainMapScene.create()` was the only place that needed land, but a debug
 * world built in `PreloadScene` needs it too — a captain placed "off the
 * harbour" before the coastline exists is placed on the quay.
 *
 * So the cache read lives here and both callers use it. The parse itself moved
 * to `core/data/geography.ts` in v0.91.0, for the reason written there.
 */

import type Phaser from "phaser";
import { setLandmasses, landmassesFromRaw, type RawGeo } from "../../core/data/geography.ts";
import { buildPortWaterCache } from "../../core/systems/PortWaterPositions.ts";

export type OsmCity = { name: string; x: number; y: number };

/**
 * Populate `LANDMASSES` and the port water cache from the scene's JSON cache.
 *
 * Returns the OSM city list, or `null` when the JSON was never loaded — the
 * caller decides whether that is a warning or a shrug.
 */
export function loadLandmassesFromCache(scene: Phaser.Scene): OsmCity[] | null {
  if (!scene.cache.json.exists("caribbean_geo")) return null;

  const raw = scene.cache.json.get("caribbean_geo") as RawGeo;
  // The translation itself is `landmassesFromRaw` in `core/data/geography.ts`
  // (v0.91.0). It used to be written out here, which made this scene-layer
  // file the only code in the project that knew the format the coastline
  // ships in - so nothing in `core/`, and therefore no test, could load it.
  setLandmasses(landmassesFromRaw(raw));
  buildPortWaterCache(); // NPC navigation needs a water position per port
  return (raw.osmCities as OsmCity[] | undefined) ?? [];
}
