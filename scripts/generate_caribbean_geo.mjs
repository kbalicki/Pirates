#!/usr/bin/env node
/**
 * Generate Caribbean geography data from Natural Earth 1:50m land polygons
 * and Overpass API city/town data.
 *
 * Output: public/data/caribbean_geo.json
 *
 * Usage: node scripts/generate_caribbean_geo.mjs
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Turf.js for geo processing ──
import * as turf from "@turf/turf";

// ── Constants ──
const BBOX = [-100, 7, -55, 35]; // [west, south, east, north]
const MAP_W = 3200;
const MAP_H = 2400;
const SIMPLIFY_TOLERANCE = 0.01; // degrees (~1km) — finer detail for small islands
const MIN_AREA_SQ_DEG = 0.00005; // keep very small islands (Bermuda, Santa Catalina, etc.)

// Natural Earth 1:50m land polygons (GeoJSON from GitHub)
const NE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson";

// ── Mercator projection ──
function mercY(lat) {
  return Math.log(Math.tan(Math.PI / 4 + ((lat * Math.PI) / 180) / 2));
}

const Y_TOP = mercY(35);
const Y_BOT = mercY(7);

function geoToPixel(lon, lat) {
  return {
    x: Math.round(((lon - -100) / 45) * MAP_W),
    y: Math.round(((Y_TOP - mercY(lat)) / (Y_TOP - Y_BOT)) * MAP_H),
  };
}

// ── Fetch with retry ──
async function fetchJSON(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`  Fetching ${url.substring(0, 80)}...`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return await res.json();
    } catch (err) {
      console.warn(`  Attempt ${i + 1} failed: ${err.message}`);
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

// ── Step 1: Fetch & clip Natural Earth data ──
async function fetchLandPolygons() {
  console.log("Step 1: Fetching Natural Earth 1:50m land polygons...");
  const geojson = await fetchJSON(NE_URL);
  console.log(`  Got ${geojson.features.length} features total`);

  // Clip to Caribbean bbox
  const bboxPoly = turf.bboxPolygon(BBOX);
  const clipped = [];

  for (const feature of geojson.features) {
    try {
      const intersection = turf.intersect(
        turf.featureCollection([feature, bboxPoly]),
      );
      if (intersection) {
        clipped.push(intersection);
      }
    } catch {
      // Some features may fail intersection (topology issues) — skip
    }
  }

  console.log(`  ${clipped.length} features after bbox clip`);
  return clipped;
}

// ── Step 2: Simplify & filter ──
function simplifyAndFilter(features) {
  console.log("Step 2: Simplifying and filtering...");
  const result = [];

  for (const feature of features) {
    // Simplify
    const simplified = turf.simplify(feature, {
      tolerance: SIMPLIFY_TOLERANCE,
      highQuality: true,
    });

    // Handle MultiPolygon → individual Polygons
    const geom = simplified.geometry;
    const polygons =
      geom.type === "MultiPolygon"
        ? geom.coordinates.map((coords) =>
            turf.polygon(coords),
          )
        : [simplified];

    for (const poly of polygons) {
      const area = turf.area(poly) / 1e6; // km²
      // MIN_AREA_SQ_DEG is ~0.001 deg² ≈ ~12 km² at equator
      const areaDeg = turf.area(poly) / (111320 * 111320);
      if (areaDeg < MIN_AREA_SQ_DEG) continue;
      result.push(poly);
    }
  }

  console.log(`  ${result.length} polygons after simplification/filtering`);
  return result;
}

// ── Step 3: Convert to game coordinates ──
function convertToGameCoords(polygons) {
  console.log("Step 3: Converting to game pixel coordinates...");
  const landmasses = [];

  for (let i = 0; i < polygons.length; i++) {
    const poly = polygons[i];
    const coords = poly.geometry.coordinates[0]; // outer ring

    const pixels = coords.map(([lon, lat]) => {
      const p = geoToPixel(lon, lat);
      return [p.x, p.y];
    });

    // Compute bbox
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const [x, y] of pixels) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    landmasses.push({
      id: `land_${i}`,
      polygon: pixels,
      bbox: [
        Math.floor(minX),
        Math.floor(minY),
        Math.ceil(maxX),
        Math.ceil(maxY),
      ],
    });
  }

  // ── Add synthetic polygons for tiny gameplay islands missing from Natural Earth ──
  const syntheticIslands = [
    {
      id: "santa_catalina_synth",
      // Isla de Providencia (Old Providence) — 81.37°W, 13.38°N, ~7km across
      lonLat: [
        [-81.42, 13.42], [-81.34, 13.42], [-81.32, 13.38],
        [-81.34, 13.34], [-81.42, 13.34], [-81.44, 13.38],
      ],
    },
  ];

  for (const island of syntheticIslands) {
    const pixels = island.lonLat.map(([lon, lat]) => {
      const p = geoToPixel(lon, lat);
      return [p.x, p.y];
    });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of pixels) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    landmasses.push({
      id: island.id,
      polygon: pixels,
      bbox: [Math.floor(minX), Math.floor(minY), Math.ceil(maxX), Math.ceil(maxY)],
    });
    console.log(`  Added synthetic island: ${island.id}`);
  }

  // Sort by area (largest first) for better collision performance
  landmasses.sort((a, b) => {
    const areaA = (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]);
    const areaB = (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]);
    return areaB - areaA;
  });

  const totalVerts = landmasses.reduce((s, lm) => s + lm.polygon.length, 0);
  console.log(`  ${landmasses.length} landmasses, ${totalVerts} total vertices`);
  return landmasses;
}

// ── Step 4: Fetch OSM cities ──
// Split the large bbox into sub-regions to avoid Overpass API timeouts
async function fetchOSMCities() {
  console.log("Step 4: Fetching Caribbean cities from Overpass API...");

  // Split bbox into 4 sub-regions to avoid query size issues
  const midLon = (BBOX[0] + BBOX[2]) / 2; // -77.5
  const midLat = (BBOX[1] + BBOX[3]) / 2; // 21
  const subBoxes = [
    [BBOX[1], BBOX[0], midLat, midLon],     // SW
    [BBOX[1], midLon, midLat, BBOX[2]],      // SE
    [midLat, BBOX[0], BBOX[3], midLon],      // NW
    [midLat, midLon, BBOX[3], BBOX[2]],      // NE
  ];

  const allElements = [];

  for (let i = 0; i < subBoxes.length; i++) {
    const [s, w, n, e] = subBoxes[i];
    const query = `[out:json][timeout:30];node["place"~"city|town"](${s},${w},${n},${e});out body;`;
    try {
      console.log(`  Sub-query ${i + 1}/4: (${s},${w},${n},${e})...`);
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
      });
      const text = await res.text();
      const data = JSON.parse(text);
      console.log(`    Got ${data.elements.length} elements`);
      allElements.push(...data.elements);
      // Small delay between queries to be polite
      if (i < subBoxes.length - 1) await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.warn(`    Sub-query ${i + 1} failed: ${err.message}`);
    }
  }

  // Deduplicate by node ID
  const seen = new Set();
  const cities = allElements
    .filter((el) => {
      if (!el.tags?.name || seen.has(el.id)) return false;
      seen.add(el.id);
      return true;
    })
    .map((el) => {
      const p = geoToPixel(el.lon, el.lat);
      return { name: el.tags.name, x: p.x, y: p.y };
    })
    .filter((c) => c.x >= 0 && c.x <= MAP_W && c.y >= 0 && c.y <= MAP_H);

  console.log(`  ${cities.length} unique cities within map bounds`);
  return cities;
}

// ── Main ──
async function main() {
  console.log("=== Caribbean Geography Generator ===\n");

  const features = await fetchLandPolygons();
  const simplified = simplifyAndFilter(features);
  const landmasses = convertToGameCoords(simplified);
  const osmCities = await fetchOSMCities();

  const output = { landmasses, osmCities };
  const json = JSON.stringify(output);

  // Ensure output directory exists
  const outDir = join(ROOT, "public", "data");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "caribbean_geo.json");
  writeFileSync(outPath, json, "utf-8");

  const sizeKB = (Buffer.byteLength(json, "utf-8") / 1024).toFixed(1);
  console.log(`\nDone! Written to ${outPath}`);
  console.log(`  File size: ${sizeKB} KB`);
  console.log(`  Landmasses: ${landmasses.length}`);
  console.log(`  OSM cities: ${osmCities.length}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
