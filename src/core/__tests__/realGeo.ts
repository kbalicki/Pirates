/**
 * The coastline the game actually runs on, for tests (v0.91.0).
 *
 * Not a fixture and not a copy: this reads the same
 * `public/data/caribbean_geo.json` the build ships and hands it to the same
 * `landmassesFromRaw` the scene layer calls. A second copy of the Caribbean
 * would drift, and a drifting map is worse than no map.
 *
 * Until v0.91.0 there was no way to do this at all. The parse lived in
 * `src/game/world/GeoLoader.ts`, which `core/` cannot import, so every
 * geography assertion in the repo ran against `getFallbackLandmasses()` —
 * **four islands and 66 vertices against the real 102 and 2 485, 1.4 % land
 * against 24.6 %**, and seven port anchorages that stand on dry land in the
 * Caribbean the player sails.
 *
 * Reading a file is not something `core/` may do, which is why this sits in
 * `__tests__` and is imported by name rather than exported from the module it
 * belongs to. It has no `.test.ts` suffix, so vitest does not collect it.
 *
 * The file arrives through Vite's `?raw`, not `node:fs`: this project has no
 * `@types/node`, and `tsc --noEmit` is part of the gate.
 */
import geoRaw from "../../../public/data/caribbean_geo.json?raw";
import { landmassesFromRaw, type LandmassDef, type RawGeo } from "../data/geography.ts";

/** Parsed once: 102 polygons is not much, but 84 test files is. */
let cached: LandmassDef[] | null = null;

export function loadRealLandmasses(): LandmassDef[] {
  if (!cached) {
    cached = landmassesFromRaw(JSON.parse(geoRaw) as RawGeo);
  }
  // A fresh array each call: `setLandmasses` mutates in place, and a caller
  // that sorted it would sort the cache.
  return [...cached];
}
