import Phaser from "phaser";
import { PORTS } from "../../core/data/ports.ts";

/* ── Seeded PRNG (same algorithm as palm engine) ── */
function rng(seed: number): () => number {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
    s ^= s >>> 16;
    return (s >>> 0) / 0x100000000;
  };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/* ── Palm type definitions ── */
interface PalmType {
  nF: [number, number];
  lLen: [number, number];
  lW: [number, number];
  lean: number;
  tH: [number, number];
}

const PALM_TYPES: PalmType[] = [
  { nF: [9, 12], lLen: [0.80, 1.05], lW: [0.16, 0.20], lean: 0.30, tH: [1.1, 1.6] },   // coconut
  { nF: [13, 20], lLen: [0.50, 0.70], lW: [0.20, 0.26], lean: 0.14, tH: [0.5, 0.85] },  // bush
  { nF: [10, 15], lLen: [0.68, 0.92], lW: [0.16, 0.21], lean: 0.22, tH: [0.85, 1.2] },  // fan
];

const YS_BASE = 0.72;

/* ── Build a single palm sprite on an offscreen canvas ── */
interface PalmSprite {
  canvas: HTMLCanvasElement;
  ax: number;
  ay: number;
}

function buildSprite(typeIdx: number, seed: number, scale: number): PalmSprite {
  const tp = PALM_TYPES[typeIdx];
  const r = rng(seed);

  const YS = YS_BASE * (0.68 + r() * 0.42);

  const crownR = (13 + r() * 5) * scale;
  const nF = tp.nF[0] + Math.floor(r() * (tp.nF[1] - tp.nF[0] + 1));
  const leanAng = r() * Math.PI * 2;
  const leanAmt = r() * tp.lean * crownR;
  const tHmul = lerp(tp.tH[0], tp.tH[1], r()) * lerp(0.65, 0.75, r());
  const tH = crownR * tHmul;
  const tW = (2.0 + r() * 1.4) * scale;

  const pad = crownR * 1.4;
  const cw = Math.ceil(pad * 2 + Math.abs(leanAmt) * 2 + 6);
  const ch = Math.ceil(tH + pad * 2 + 6);
  const ax = Math.floor(cw / 2);
  const ay = ch - Math.floor(pad * 0.35);

  const oc = document.createElement("canvas");
  oc.width = cw;
  oc.height = ch;
  const c = oc.getContext("2d")!;

  const crX = ax + Math.cos(leanAng) * leanAmt;
  const crY = ay - tH;

  const curviness = r() < 0.75 ? r() * 0.35 : 0.55 + r() * 0.45;
  const bendX = (r() - 0.5) * tH * (0.3 + curviness * 1.4);
  const bendY = (r() - 0.5) * tH * (0.08 + curviness * 0.35);
  const cpT = 0.3 + r() * 0.45;
  const cpX = lerp(ax, crX, cpT) + bendX;
  const cpY = lerp(ay, crY, cpT) + bendY;

  // Shadow
  c.save();
  c.globalAlpha = 0.45;
  c.fillStyle = "#040d01";
  c.beginPath();
  c.ellipse(
    ax + Math.cos(leanAng) * leanAmt * 0.1,
    ay + tW * 0.4,
    tW * 1.8,
    tW * 0.55,
    0,
    0,
    Math.PI * 2,
  );
  c.fill();
  c.restore();

  // Trunk
  const drawTrunk = (col: string, lw: number, ox: number) => {
    c.beginPath();
    c.moveTo(ax + ox, ay);
    c.quadraticCurveTo(cpX + ox, cpY, crX + ox, crY);
    c.strokeStyle = col;
    c.lineWidth = lw;
    c.lineCap = "round";
    c.stroke();
  };
  drawTrunk("#1e0c04", tW * 1.45, 0);
  drawTrunk("#6a3c14", tW * 1.00, 0);
  drawTrunk("#9a5a22", tW * 0.52, 0);
  drawTrunk("#c07030", tW * 0.16, -tW * 0.32);

  // Trunk rings
  const ringCount = Math.floor(tH / (8 * scale));
  for (let ri = 1; ri <= ringCount; ri++) {
    const t2 = ri / (ringCount + 1);
    const bx = (1 - t2) * (1 - t2) * ax + 2 * (1 - t2) * t2 * cpX + t2 * t2 * crX;
    const by = (1 - t2) * (1 - t2) * ay + 2 * (1 - t2) * t2 * cpY + t2 * t2 * crY;
    const dtx = 2 * (1 - t2) * (cpX - ax) + 2 * t2 * (crX - cpX);
    const dty = 2 * (1 - t2) * (cpY - ay) + 2 * t2 * (crY - cpY);
    const len2 = Math.sqrt(dtx * dtx + dty * dty) || 1;
    const nx = -dty / len2;
    const ny = dtx / len2;
    const hw = tW * 0.48;
    c.beginPath();
    c.moveTo(bx + nx * hw, by + ny * hw);
    c.lineTo(bx - nx * hw, by - ny * hw);
    c.strokeStyle = "rgba(0,0,0,0.22)";
    c.lineWidth = 0.9 * scale;
    c.stroke();
  }

  // Fronds
  const baseRot = r() * Math.PI * 2;
  interface Frond {
    angle: number;
    len: number;
    maxW: number;
    droop: number;
    curl: number;
    lightness: number;
  }
  const fronds: Frond[] = [];
  for (let i = 0; i < nF; i++) {
    const baseA = baseRot + (i / nF) * Math.PI * 2;
    const jitter = (r() - 0.5) * ((Math.PI * 2) / nF) * 0.42;
    const angle = baseA + jitter;
    const len = crownR * lerp(tp.lLen[0], tp.lLen[1], r());
    const maxW = len * lerp(tp.lW[0], tp.lW[1], r());
    const droop = len * YS * (0.08 + r() * 0.18);
    const curl = (r() - 0.5) * len * 0.10;
    const lightness = 0.5 + 0.5 * Math.cos(angle - Math.PI * 1.3);
    fronds.push({ angle, len, maxW, droop, curl, lightness });
  }
  fronds.sort((a, b) => Math.sin(a.angle) - Math.sin(b.angle));

  const STEPS = 12;
  for (const fr of fronds) {
    const { angle, len: fLen, maxW, droop, curl, lightness } = fr;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle) * YS;
    const pc = Math.cos(angle + Math.PI / 2);
    const ps = Math.sin(angle + Math.PI / 2) * YS;
    const back = Math.sin(angle) < -0.1;
    const gBase = back ? 88 : 128 + Math.floor(lightness * 30);
    const rBase = back ? 32 : 46 + Math.floor(lightness * 18);
    const bBase = back ? 14 : 20 + Math.floor(lightness * 8);
    const fillC = `rgb(${rBase},${gBase},${bBase})`;
    const shadeC = `rgb(${Math.floor(rBase * 0.58)},${Math.floor(gBase * 0.58)},${Math.floor(bBase * 0.58)})`;

    const outline = () => {
      c.beginPath();
      for (let i = 0; i <= STEPS; i++) {
        const t3 = i / STEPS;
        const d = t3 * fLen;
        const w = maxW * Math.sin(t3 * Math.PI * 0.92 + 0.06) * 0.5;
        const sag = t3 * t3 * droop;
        const cu = t3 * t3 * curl;
        if (i === 0) {
          c.moveTo(crX + ca * d + pc * (w + cu), crY + sa * d + ps * (w + cu) + sag);
        } else {
          c.lineTo(crX + ca * d + pc * (w + cu), crY + sa * d + ps * (w + cu) + sag);
        }
      }
      c.lineTo(crX + ca * fLen * 1.04 + pc * curl, crY + sa * fLen * 1.04 + droop * 1.04);
      for (let i = STEPS; i >= 0; i--) {
        const t3 = i / STEPS;
        const d = t3 * fLen;
        const w = maxW * Math.sin(t3 * Math.PI * 0.92 + 0.06) * 0.5;
        const sag = t3 * t3 * droop;
        const cu = t3 * t3 * curl;
        c.lineTo(crX + ca * d - pc * (w - cu * 0.2), crY + sa * d - ps * (w - cu * 0.2) + sag);
      }
      c.closePath();
    };

    outline();
    c.fillStyle = shadeC;
    c.fill();
    outline();
    c.save();
    c.clip();
    c.fillStyle = fillC;
    c.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const t3 = i / STEPS;
      const d = t3 * fLen;
      const sag = t3 * t3 * droop;
      const cu = t3 * t3 * curl;
      const bigW = maxW * 4;
      if (i === 0) {
        c.moveTo(crX + ca * d + pc * (bigW + cu), crY + sa * d + ps * (bigW + cu) + sag);
      } else {
        c.lineTo(crX + ca * d + pc * (bigW + cu), crY + sa * d + ps * (bigW + cu) + sag);
      }
    }
    for (let i = STEPS; i >= 0; i--) {
      const t3 = i / STEPS;
      const d = t3 * fLen;
      const sag = t3 * t3 * droop;
      const cu = t3 * t3 * curl;
      c.lineTo(crX + ca * d + pc * cu * 0.1, crY + sa * d + sag);
    }
    c.closePath();
    c.fill();
    c.restore();
  }

  return { canvas: oc, ax, ay };
}

/* ── Build cache of N unique palm sprites ── */
function buildPalmSprites(count: number, scale: number): PalmSprite[] {
  const sprites: PalmSprite[] = [];
  for (let i = 0; i < count; i++) {
    sprites.push(buildSprite(i % 3, i * 811 + 5555, scale));
  }
  return sprites;
}

/* ── Palm placement data ── */
interface PlacedPalm {
  image: Phaser.GameObjects.Image;
  worldX: number;
  worldY: number;
  baseScale: number;
}

const CELL = 32;
const MAX_PALMS = 3000;
const PALM_DEPTH_BASE = -800; // Between land (-900) and other overlays
const PORT_EXCLUSION_PX = 15;

export class PalmRenderer {
  private scene: Phaser.Scene;
  private palms: PlacedPalm[] = [];
  private sprites: PalmSprite[] = [];
  private coastDist: number[][];
  private gridRows: number;
  private gridCols: number;

  constructor(scene: Phaser.Scene, landGrid: boolean[][]) {
    this.scene = scene;
    this.gridRows = landGrid.length;
    this.gridCols = landGrid[0]?.length ?? 0;

    // 1. Build cached palm sprites and register as Phaser textures
    this.sprites = buildPalmSprites(27, 0.7);
    for (let i = 0; i < this.sprites.length; i++) {
      const key = `palm_gen_${i}`;
      if (scene.textures.exists(key)) {
        scene.textures.remove(key);
      }
      const tex = scene.textures.addCanvas(key, this.sprites[i].canvas);
      // LINEAR filtering for smooth scaling
      if (tex) {
        tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    }

    // 2. Build coastDist grid via BFS from water cells
    this.coastDist = this.buildCoastDistGrid(landGrid);

    // 3. Collect port positions for exclusion
    const portPositions: { x: number; y: number }[] = [];
    for (const port of Object.values(PORTS)) {
      portPositions.push(port.pos);
    }

    // 4. Place palms on land cells
    const placementRng = rng(42424242);
    let totalPlaced = 0;

    for (let r = 0; r < this.gridRows && totalPlaced < MAX_PALMS; r++) {
      for (let c = 0; c < this.gridCols && totalPlaced < MAX_PALMS; c++) {
        if (!landGrid[r][c]) continue;

        const dist = this.coastDist[r][c];

        // Density: more palms near coast, fewer inland
        let density: number;
        if (dist <= 1) {
          density = 3 + Math.floor(placementRng() * 3); // 3-5
        } else if (dist <= 3) {
          density = 2 + Math.floor(placementRng() * 3); // 2-4
        } else if (dist <= 5) {
          density = 1 + Math.floor(placementRng() * 2); // 1-2
        } else {
          // Inland: sparse, sometimes skip entirely
          density = placementRng() < 0.4 ? 1 : 0;
        }

        for (let p = 0; p < density && totalPlaced < MAX_PALMS; p++) {
          const px = c * CELL + placementRng() * CELL;
          const py = r * CELL + placementRng() * CELL;

          // Check port exclusion
          let tooCloseToPort = false;
          for (const pp of portPositions) {
            const dx = px - pp.x;
            const dy = py - pp.y;
            if (dx * dx + dy * dy < PORT_EXCLUSION_PX * PORT_EXCLUSION_PX) {
              tooCloseToPort = true;
              break;
            }
          }
          if (tooCloseToPort) continue;

          // Palm type: weighted by coast distance
          let typeIdx: number;
          if (dist <= 2) {
            // Near coast: mostly coconut (0), some fan (2)
            const roll = placementRng();
            typeIdx = roll < 0.55 ? 0 : roll < 0.85 ? 2 : 1;
          } else if (dist <= 5) {
            // Mid: mixed
            const roll = placementRng();
            typeIdx = roll < 0.35 ? 0 : roll < 0.65 ? 2 : 1;
          } else {
            // Inland: mostly bush (1)
            const roll = placementRng();
            typeIdx = roll < 0.15 ? 0 : roll < 0.40 ? 2 : 1;
          }

          // Sprite index: pick from matching type range (9 per type)
          const baseIdx = typeIdx * 9;
          const spriteIdx = baseIdx + Math.floor(placementRng() * 9);

          // Scale: 0.4-0.8 random
          const baseScale = 0.4 + placementRng() * 0.4;

          const sprite = this.sprites[spriteIdx];
          const key = `palm_gen_${spriteIdx}`;
          const img = scene.add.image(px, py, key);

          // Set origin from anchor point (ax, ay are pixel offsets in the sprite)
          img.setOrigin(sprite.ax / sprite.canvas.width, sprite.ay / sprite.canvas.height);

          // Depth sort: use Y coordinate so palms further down render on top
          // Base depth between land and other overlays
          img.setDepth(PALM_DEPTH_BASE + py / 2400);

          img.setScale(baseScale);

          this.palms.push({ image: img, worldX: px, worldY: py, baseScale });
          totalPlaced++;
        }
      }
    }
  }

  update(): void {
    const cam = this.scene.cameras.main;
    const zoom = cam.zoom;

    // Hidden below zoom 2
    if (zoom < 2) {
      for (const palm of this.palms) {
        if (palm.image.visible) palm.image.setVisible(false);
      }
      return;
    }

    // Scale factor: full size at zoom 6+, smaller at lower zoom
    const zoomT = Math.min(1, Math.max(0, (zoom - 2) / (6 - 2)));
    const scaleMul = 0.3 + zoomT * 0.7; // 0.3 at zoom 2, 1.0 at zoom 6+

    // Camera viewport in world coordinates (with margin for culling)
    const margin = 80;
    const viewLeft = cam.scrollX - margin / zoom;
    const viewRight = cam.scrollX + cam.width / zoom + margin / zoom;
    const viewTop = cam.scrollY - margin / zoom;
    const viewBottom = cam.scrollY + cam.height / zoom + margin / zoom;

    for (const palm of this.palms) {
      // Cull distant palms
      if (
        palm.worldX < viewLeft ||
        palm.worldX > viewRight ||
        palm.worldY < viewTop ||
        palm.worldY > viewBottom
      ) {
        if (palm.image.visible) palm.image.setVisible(false);
        continue;
      }

      if (!palm.image.visible) palm.image.setVisible(true);
      palm.image.setScale(palm.baseScale * scaleMul);
    }
  }

  destroy(): void {
    for (const palm of this.palms) {
      palm.image.destroy();
    }
    this.palms = [];
  }

  /** BFS from water cells to compute distance-to-coast for land cells. */
  private buildCoastDistGrid(landGrid: boolean[][]): number[][] {
    const dist: number[][] = [];
    for (let r = 0; r < this.gridRows; r++) {
      dist[r] = new Array(this.gridCols).fill(999);
    }

    // Seed BFS from land cells adjacent to water (coastDist = 0 means water)
    // We want distance from coast ON LAND, so:
    // - Water cells get 999 (unused)
    // - Land cells adjacent to water get 1
    // - Deeper inland cells get higher values
    const queue: [number, number][] = [];

    // First pass: find coastal land cells (land cells adjacent to at least one water cell)
    for (let r = 0; r < this.gridRows; r++) {
      for (let c = 0; c < this.gridCols; c++) {
        if (!landGrid[r][c]) {
          dist[r][c] = 0; // water
          continue;
        }
        // Check if this land cell is adjacent to water
        let nearWater = false;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= this.gridRows || nc < 0 || nc >= this.gridCols) {
            nearWater = true; // map edge counts as water
            break;
          }
          if (!landGrid[nr][nc]) {
            nearWater = true;
            break;
          }
        }
        if (nearWater) {
          dist[r][c] = 1;
          queue.push([r, c]);
        }
      }
    }

    // BFS to propagate distance inland
    let head = 0;
    while (head < queue.length) {
      const [cr, cc] = queue[head++];
      const nd = dist[cr][cc] + 1;
      if (nd > 20) continue; // limit BFS depth
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nr = cr + dr;
        const nc = cc + dc;
        if (
          nr >= 0 &&
          nr < this.gridRows &&
          nc >= 0 &&
          nc < this.gridCols &&
          landGrid[nr][nc] &&
          dist[nr][nc] > nd
        ) {
          dist[nr][nc] = nd;
          queue.push([nr, nc]);
        }
      }
    }

    return dist;
  }
}
