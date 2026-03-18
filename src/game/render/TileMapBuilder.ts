/**
 * Generates a tile-based Caribbean map from landmass polygons
 * using the pirate tilepack blob tiles.
 *
 * Tilepack blob encoding (non-standard, verified by pixel analysis):
 *
 * Cardinals (can appear alone — set directly from spatial neighbors):
 *   E  = 2   (east edge)
 *   W  = 8   (west edge)
 *   NE = 16  (northeast diagonal)
 *   SW = 64  (southwest diagonal)
 *
 * Corners (require both adjacent cardinals to be set):
 *   N  = 1   (north edge)     requires E(2)  AND W(8)
 *   S  = 4   (south edge)     requires E(2)  AND NE(16)
 *   SE = 32  (southeast diag) requires W(8)  AND SW(64)
 *   NW = 128 (northwest diag) requires NE(16) AND SW(64)
 */
import Phaser from "phaser";
import { LANDMASSES } from "../../core/data/geography.ts";
import { pointInLandmass, pointInPolygon } from "../../core/services/Geometry.ts";
import { getAssetPack } from "../settings/AssetPack.ts";

const TS = 32;
const MAP_W = 3200;
const MAP_H = 2400;
const COLS = MAP_W / TS; // 100
const ROWS = MAP_H / TS; // 75

// Tilepack blob bit values (spatial direction → bit value)
const TP_E = 2, TP_W = 8, TP_NE = 16, TP_SW = 64;
const TP_N = 1, TP_S = 4, TP_SE = 32, TP_NW = 128;

// Frame indices in the spritesheet (0-based).
// coast_ls_blob: blobMask → spritesheet frame index
const COAST: Record<number, number> = {
  0:51, 2:52, 8:53, 10:54, 11:55, 16:56, 18:57, 22:58,
  24:59, 26:60, 27:61, 30:62, 31:63, 64:64, 66:65, 72:66,
  74:67, 75:68, 80:69, 82:70, 86:71, 88:72, 90:73, 91:74,
  94:75, 95:76, 104:77, 106:78, 107:79, 110:80, 111:81,
  120:82, 122:83, 123:84, 126:85, 127:86, 208:87, 210:88,
  214:89, 216:90, 218:91, 219:92, 222:93, 223:94, 248:95,
  254:96, 255:97,
};

// Palm/vegetation decoration frame indices (palms_1 through palms_4)
const PALMS = [101, 102, 103, 104];
// Mixed decoration frames (hills, hills+palms, rocks, palms)
const DECOR_ALL = [98, 99, 100, 101, 102, 103, 104];

// ──────────────────────────────────────────────────────────
// Step 1: Multi-point land classification
// ──────────────────────────────────────────────────────────

/** Test if a world-pixel is inside any landmass. */
function isLand(px: number, py: number): boolean {
  const pt = { x: px, y: py };
  return LANDMASSES.some(lm => pointInLandmass(pt, lm));
}

/**
 * Classify each cell by sampling 9 points (3×3 grid) and requiring
 * a threshold of hits. This smooths jagged polygon→grid edges.
 */
function classifyGrid(): boolean[][] {
  const grid: boolean[][] = [];
  const THRESHOLD = 4; // out of 9 samples
  const offsets = [-0.3, 0, 0.3]; // sample at 30%/50%/70% of cell

  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      const cx = c * TS + TS / 2;
      const cy = r * TS + TS / 2;
      let hits = 0;
      for (const dy of offsets) {
        for (const dx of offsets) {
          if (isLand(cx + dx * TS, cy + dy * TS)) hits++;
        }
      }
      grid[r][c] = hits >= THRESHOLD;
    }
  }
  return grid;
}

// ──────────────────────────────────────────────────────────
// Step 2: Cellular automata smoothing
// ──────────────────────────────────────────────────────────

/** Count how many of the 8 neighbors are land. */
function countNeighbors(grid: boolean[][], c: number, r: number): number {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && grid[rr][cc]) {
        count++;
      }
    }
  }
  return count;
}

/**
 * One pass of cellular automata smoothing:
 * - Water cell with ≥ birthThreshold land neighbors → land
 * - Land cell with < surviveThreshold land neighbors → water
 */
function smoothPass(grid: boolean[][], birthThreshold: number, surviveThreshold: number): boolean[][] {
  const next: boolean[][] = [];
  for (let r = 0; r < ROWS; r++) {
    next[r] = [];
    for (let c = 0; c < COLS; c++) {
      const n = countNeighbors(grid, c, r);
      if (grid[r][c]) {
        next[r][c] = n >= surviveThreshold;
      } else {
        next[r][c] = n >= birthThreshold;
      }
    }
  }
  return next;
}

// ──────────────────────────────────────────────────────────
// Step 3: Remove small clusters (flood fill)
// ──────────────────────────────────────────────────────────

/**
 * Find all connected components of a given type and remove those
 * smaller than minSize by flipping them.
 */
function removeSmallClusters(grid: boolean[][], targetValue: boolean, minSize: number): void {
  const visited: boolean[][] = [];
  for (let r = 0; r < ROWS; r++) {
    visited[r] = new Array(COLS).fill(false);
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (visited[r][c] || grid[r][c] !== targetValue) continue;

      // Flood fill to find cluster
      const cluster: [number, number][] = [];
      const stack: [number, number][] = [[r, c]];
      visited[r][c] = true;

      while (stack.length > 0) {
        const [cr, cc] = stack.pop()!;
        cluster.push([cr, cc]);

        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
          const nr = cr + dr, nc = cc + dc;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS &&
              !visited[nr][nc] && grid[nr][nc] === targetValue) {
            visited[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }

      // Flip small clusters
      if (cluster.length < minSize) {
        for (const [cr, cc] of cluster) {
          grid[cr][cc] = !targetValue;
        }
      }
    }
  }
}

// ──────────────────────────────────────────────────────────
// Blob mask computation
// ──────────────────────────────────────────────────────────

/** Compute reduced 47-value blob mask using the tilepack's encoding. */
function blobMask(
  grid: boolean[][], c: number, r: number, fallback: boolean,
): number {
  const at = (cc: number, rr: number) =>
    cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS ? fallback : grid[rr][cc];

  const n  = at(c, r - 1);
  const ne = at(c + 1, r - 1);
  const e  = at(c + 1, r);
  const se = at(c + 1, r + 1);
  const s  = at(c, r + 1);
  const sw = at(c - 1, r + 1);
  const w  = at(c - 1, r);
  const nw = at(c - 1, r - 1);

  // Cardinals: set independently
  let m = 0;
  if (e)  m |= TP_E;
  if (w)  m |= TP_W;
  if (ne) m |= TP_NE;
  if (sw) m |= TP_SW;

  // Corners: require both adjacent cardinals
  if (n  && (m & TP_E)  && (m & TP_W))  m |= TP_N;
  if (s  && (m & TP_E)  && (m & TP_NE)) m |= TP_S;
  if (se && (m & TP_W)  && (m & TP_SW)) m |= TP_SE;
  if (nw && (m & TP_NE) && (m & TP_SW)) m |= TP_NW;
  return m;
}

// ──────────────────────────────────────────────────────────
// Main entry point
// ──────────────────────────────────────────────────────────

/**
 * Compute Manhattan distance from each cell to the nearest water tile.
 * Only computes up to maxDist; cells farther get maxDist.
 */
function computeCoastDistance(land: boolean[][], maxDist: number): number[][] {
  const dist: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    dist[r] = new Array(COLS).fill(maxDist);
  }

  // BFS from all water cells
  const queue: [number, number][] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!land[r][c]) {
        dist[r][c] = 0;
        queue.push([r, c]);
      }
    }
  }

  let head = 0;
  while (head < queue.length) {
    const [cr, cc] = queue[head++];
    const nd = dist[cr][cc] + 1;
    if (nd > maxDist) continue;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nr = cr + dr;
      const nc = cc + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && dist[nr][nc] > nd) {
        dist[nr][nc] = nd;
        queue.push([nr, nc]);
      }
    }
  }
  return dist;
}

/**
 * Build the tile-based map. Returns the landGrid for terrain queries.
 */
export function buildTileMap(scene: Phaser.Scene): boolean[][] {
  // --- 1. Multi-point classification ---
  let land = classifyGrid();

  // --- 2. Cellular automata smoothing (2 passes) ---
  // Pass 1: gentle — fill tiny holes, remove specks
  land = smoothPass(land, 6, 3);
  // Pass 2: same parameters for further refinement
  land = smoothPass(land, 6, 3);

  // --- 3. Remove small isolated clusters ---
  // Remove land clusters < 4 tiles (tiny island specks)
  removeSmallClusters(land, true, 4);
  // Fill water holes < 4 tiles (pinholes inside landmasses)
  removeSmallClusters(land, false, 4);

  // --- 4. Render the map visually ---
  const usePolygonMap = getAssetPack() === "buccaneer";

  if (usePolygonMap) {
    renderPolygonContours(scene);
  } else {
    renderBlobTileMap(scene, land);
  }

  return land;
}

// ──────────────────────────────────────────────────────────
// Polygon contour rendering (generated pack)
// ──────────────────────────────────────────────────────────

function renderPolygonContours(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.setDepth(-500);

  // Beach ring: thick sandy stroke behind the green fill
  for (const lm of LANDMASSES) {
    if (lm.polygon.length < 3) continue;
    g.lineStyle(10, 0xd4be8a, 0.5);
    g.beginPath();
    g.moveTo(lm.polygon[0].x, lm.polygon[0].y);
    for (let i = 1; i < lm.polygon.length; i++) {
      g.lineTo(lm.polygon[i].x, lm.polygon[i].y);
    }
    g.closePath();
    g.strokePath();
  }

  // Land fill: green interior
  for (const lm of LANDMASSES) {
    if (lm.polygon.length < 3) continue;
    g.fillStyle(0x5a8a4a, 1);
    g.beginPath();
    g.moveTo(lm.polygon[0].x, lm.polygon[0].y);
    for (let i = 1; i < lm.polygon.length; i++) {
      g.lineTo(lm.polygon[i].x, lm.polygon[i].y);
    }
    g.closePath();
    g.fillPath();
  }

  // Subtle interior shading — slightly darker patches for depth
  let seed = 77777;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const lm of LANDMASSES) {
    if (lm.polygon.length < 3) continue;
    // Compute bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of lm.polygon) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    // Scatter a few dark green patches inside the polygon
    const area = (maxX - minX) * (maxY - minY);
    const patches = Math.min(40, Math.floor(area / 3000));
    for (let i = 0; i < patches; i++) {
      const px = minX + rnd() * (maxX - minX);
      const py = minY + rnd() * (maxY - minY);
      if (!pointInPolygon({ x: px, y: py }, lm.polygon)) continue;
      g.fillStyle(0x4a7a3a, 0.3 + rnd() * 0.3);
      g.fillCircle(px, py, 4 + rnd() * 12);
    }
  }

  // Coastline outline: dark border
  for (const lm of LANDMASSES) {
    if (lm.polygon.length < 3) continue;
    g.lineStyle(2, 0x3a5a2a, 0.8);
    g.beginPath();
    g.moveTo(lm.polygon[0].x, lm.polygon[0].y);
    for (let i = 1; i < lm.polygon.length; i++) {
      g.lineTo(lm.polygon[i].x, lm.polygon[i].y);
    }
    g.closePath();
    g.strokePath();
  }
}

// ──────────────────────────────────────────────────────────
// Blob tile rendering (classic pack)
// ──────────────────────────────────────────────────────────

function renderBlobTileMap(scene: Phaser.Scene, land: boolean[][]): void {
  const map = scene.make.tilemap({
    tileWidth: TS, tileHeight: TS, width: COLS, height: ROWS,
  });
  const ts = map.addTilesetImage("tilepack", "tilepack", TS, TS, 0, 0, 1);
  if (!ts) throw new Error("Failed to add tilepack tileset");

  const gid = (frame: number) => frame + 1;

  // No sea fill — let caribbean_bg.png show through as dark navy water

  // Layer 2: Land + coastline
  const landLayer = map.createBlankLayer("land", ts)!;
  landLayer.setDepth(-500);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!land[r][c]) continue;
      const m = blobMask(land, c, r, false);
      const frame = COAST[m];
      if (frame !== undefined) {
        landLayer.putTileAt(gid(frame), c, r);
      }
    }
  }

  // Land decorations
  const coastDist = computeCoastDistance(land, 3);
  const decorLayer = map.createBlankLayer("decor", ts)!;
  decorLayer.setDepth(-400);

  let seed = 54321;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!land[r][c]) continue;

      const d = coastDist[r][c];
      let chance: number;
      let pool: number[];

      if (d <= 1) {
        chance = 0.60;
        pool = PALMS;
      } else if (d === 2) {
        chance = 0.45;
        pool = rnd() < 0.7 ? PALMS : DECOR_ALL;
      } else {
        chance = 0.25;
        pool = DECOR_ALL;
      }

      if (rnd() < chance) {
        const idx = pool[Math.floor(rnd() * pool.length)];
        decorLayer.putTileAt(gid(idx), c, r);
      }
    }
  }
}
