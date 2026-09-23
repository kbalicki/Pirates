/**
 * Caribbean landmass polygon definitions for map rendering and collision.
 *
 * Coordinates use Mercator projection matching cities.ts:
 *   x = (lon - (-100)) / 45 * 3200
 *   y = (mercY(35) - mercY(lat)) / (mercY(35) - mercY(7)) * 2400
 *
 * At runtime, LANDMASSES is populated from the loaded caribbean_geo.json.
 * A small fallback set is provided for tests and SSR.
 */

import type { Vec2 } from "../model/WorldState.ts";

export type LandmassBbox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type LandmassDef = {
  id: string;
  polygon: Vec2[];
  bbox?: LandmassBbox;
};

/**
 * Mutable array of landmass definitions.
 * Populated at startup from caribbean_geo.json via setLandmasses().
 * Starts empty — fallback polygons are only used if JSON fails to load.
 */
export const LANDMASSES: LandmassDef[] = [];

/**
 * Replace LANDMASSES contents with real geo data loaded from JSON.
 * Mutates the existing array in-place so all importers see the update.
 */
export function setLandmasses(data: LandmassDef[]): void {
  LANDMASSES.length = 0;
  LANDMASSES.push(...data);
  generation++;
}

/**
 * Bumped every time `setLandmasses` runs.
 *
 * Anything that precomputes over the coastline — the sea grid in
 * `Pathfinding.ts`, the trade lanes derived from it — caches its work and has
 * to know when the map underneath it changed. Counting the swaps is cheaper
 * and more honest than comparing polygon arrays, and it catches the one case
 * that actually happens: an empty `LANDMASSES` (tests, boot) being filled in
 * once the GeoJSON arrives.
 */
let generation = 0;

export function landmassGeneration(): number {
  return generation;
}

/**
 * The shape `public/data/caribbean_geo.json` actually ships in.
 *
 * It is **not** `LandmassDef`: a vertex on disk is a two-element array and a
 * bbox is four numbers, because that file is generated and a thousand `{"x":
 * …, "y": …}` pairs would treble it. Nothing wrong with that — what was wrong
 * was where the translation lived.
 */
export type RawGeo = {
  landmasses: Array<{ id: string; polygon: number[][]; bbox: [number, number, number, number] }>;
  osmCities?: Array<{ name: string; x: number; y: number }>;
};

/**
 * Turn the file on disk into the coastline the rules reason about (v0.91.0).
 *
 * This lived in `src/game/world/GeoLoader.ts` until this release, in among the
 * Phaser cache read, and it was the only code in the project that understood
 * the format. `core/` cannot import from `src/game/`, so **no test could load
 * the real Caribbean** — every geography assertion in the repo ran against
 * `getFallbackLandmasses()`, which is four islands and 66 vertices against the
 * real 102 and 2 485, and **1.4 % land against 24.6 %**.
 *
 * What that cost, measured: 15 of 45 port anchorages sit somewhere else under
 * the two coastlines, by a median of 16 px and as much as 89 (Santiago) — and
 * **7 of the anchorages the tests use are on dry land in the real Caribbean**
 * (Santiago, Panamá, Cumaná, Gran Granada, Antigua, Belize, Petit-Goâve).
 *
 * The shape of the data is a fact about the data. It belongs here, next to the
 * type it produces, and the scene layer is left with the one thing that is
 * genuinely its own: asking Phaser's cache for the file.
 */
export function landmassesFromRaw(raw: RawGeo): LandmassDef[] {
  return raw.landmasses.map(lm => ({
    id: lm.id,
    polygon: lm.polygon.map(([x, y]) => ({ x, y })),
    bbox: { minX: lm.bbox[0], minY: lm.bbox[1], maxX: lm.bbox[2], maxY: lm.bbox[3] },
  }));
}

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + ((lat * Math.PI) / 180) / 2));
const Y_TOP = mercY(35);
const Y_BOT = mercY(7);

/** Convert lon/lat to game pixels (same formula as cities.ts geoToMap). */
function g(lon: number, lat: number): Vec2 {
  return {
    x: Math.round(((lon - (-100)) / 45) * 3200),
    y: Math.round(((Y_TOP - mercY(lat)) / (Y_TOP - Y_BOT)) * 2400),
  };
}

/** Compute bbox from a polygon. */
function computeBbox(polygon: Vec2[]): LandmassBbox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Minimal fallback landmasses for tests / offline use.
 * Only major islands — enough to verify core mechanics.
 */
export function getFallbackLandmasses(): LandmassDef[] {
  const defs: Omit<LandmassDef, "bbox">[] = [
    {
      id: "cuba",
      polygon: [
        g(-84.9, 21.9), g(-84.3, 22.7), g(-83.5, 23.1), g(-82.4, 23.2),
        g(-81.5, 23.1), g(-80.5, 22.8), g(-79.8, 22.4), g(-79.0, 22.0),
        g(-78.0, 21.7), g(-77.5, 21.0), g(-76.2, 20.5), g(-75.5, 20.5),
        g(-75.0, 20.4), g(-74.1, 20.5),
        g(-73.8, 20.1), g(-73.8, 19.6),
        g(-74.1, 19.4), g(-75.0, 19.3), g(-75.5, 19.4), g(-76.2, 19.5),
        g(-77.0, 20.0), g(-78.5, 21.0), g(-79.8, 21.8), g(-81.0, 22.2),
        g(-82.0, 22.5), g(-83.2, 22.5), g(-84.0, 22.2), g(-84.8, 21.6),
      ],
    },
    {
      id: "hispaniola",
      polygon: [
        g(-73.0, 19.8), g(-73.6, 20.1), g(-72.6, 20.1), g(-72.3, 19.5),
        g(-71.7, 19.8), g(-71.0, 19.7), g(-70.0, 19.8), g(-69.5, 19.6),
        g(-68.4, 18.6), g(-68.3, 18.2),
        g(-69.0, 18.2), g(-69.9, 18.5),
        g(-70.5, 18.3), g(-71.0, 18.2), g(-71.6, 18.3), g(-72.0, 18.4),
        g(-72.8, 18.4), g(-73.4, 18.2),
        g(-74.4, 18.4), g(-74.0, 18.8), g(-73.2, 18.9), g(-73.0, 19.3),
      ],
    },
    {
      id: "jamaica",
      polygon: [
        g(-78.4, 18.5), g(-77.8, 18.5), g(-77.0, 18.3), g(-76.3, 18.0),
        g(-76.2, 17.8), g(-76.8, 17.7), g(-77.5, 17.8), g(-78.0, 18.0),
        g(-78.4, 18.2),
      ],
    },
    {
      id: "puerto_rico",
      polygon: [
        g(-67.2, 18.7), g(-66.5, 18.7), g(-65.8, 18.3), g(-65.6, 18.0),
        g(-66.0, 17.9), g(-66.8, 17.9), g(-67.2, 18.2),
      ],
    },
  ];

  return defs.map((d) => ({
    ...d,
    bbox: computeBbox(d.polygon),
  }));
}
