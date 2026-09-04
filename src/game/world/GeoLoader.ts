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
 * So the parse lives here and both callers use it.
 */

import type Phaser from "phaser";
import { setLandmasses, type LandmassDef, type LandmassBbox } from "../../core/data/geography.ts";
import { buildPortWaterCache } from "../../core/systems/PortWaterPositions.ts";

export type OsmCity = { name: string; x: number; y: number };

type RawGeo = {
  landmasses: Array<{ id: string; polygon: number[][]; bbox: [number, number, number, number] }>;
  osmCities: OsmCity[];
};

/**
 * Populate `LANDMASSES` and the port water cache from the scene's JSON cache.
 *
 * Returns the OSM city list, or `null` when the JSON was never loaded — the
 * caller decides whether that is a warning or a shrug.
 */
export function loadLandmassesFromCache(scene: Phaser.Scene): OsmCity[] | null {
  if (!scene.cache.json.exists("caribbean_geo")) return null;

  const raw = scene.cache.json.get("caribbean_geo") as RawGeo;
  const parsed: LandmassDef[] = raw.landmasses.map(lm => ({
    id: lm.id,
    polygon: lm.polygon.map(([x, y]) => ({ x, y })),
    bbox: {
      minX: lm.bbox[0],
      minY: lm.bbox[1],
      maxX: lm.bbox[2],
      maxY: lm.bbox[3],
    } as LandmassBbox,
  }));

  setLandmasses(parsed);
  buildPortWaterCache(); // NPC navigation needs a water position per port
  return raw.osmCities ?? [];
}
