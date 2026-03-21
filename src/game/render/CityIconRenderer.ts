import Phaser from "phaser";
import type { PortDef } from "../../core/data/ports.ts";
import { FACTIONS } from "../../core/data/factions.ts";

/**
 * City/fort icons — 3/4 top-down view (bird's eye, ~60° angle).
 * You see ROOFS as the dominant element, thin wall edges at bottom,
 * cast shadows to the right. 17th-century Caribbean colonial style.
 */
export function drawCityIcon(
  scene: Phaser.Scene,
  g: Phaser.GameObjects.Graphics,
  port: PortDef,
): void {
  const x = port.pos.x;
  const y = port.pos.y;
  const factionDef = FACTIONS[port.factionId as string];
  const flagColor = factionDef?.color ?? 0xaaaaaa;
  const pop = port.population;

  if (port.type !== "fort") {
    let spriteKey: string | null = null;
    if ((pop === "large" || pop === "capital") && scene.textures.exists("city_large")) spriteKey = "city_large";
    else if (pop === "medium" && scene.textures.exists("city_medium")) spriteKey = "city_medium";
    else if (scene.textures.exists("city_small")) spriteKey = "city_small";
    if (spriteKey) {
      const cityImg = scene.add.image(x, y, spriteKey);
      cityImg.setDepth(500);
      // Scale so city is ~12 world pixels at large, ~9 medium, ~6 small
      const texW = scene.textures.getFrame(spriteKey).width || 1024;
      const targetSize = pop === "large" || pop === "capital" ? 24 : pop === "medium" ? 16 : 10;
      cityImg.setScale(targetSize / texW);
      return;
    }
  }

  if (port.type === "fort") drawFort(g, x, y, flagColor, pop);
  else if (pop === "large" || pop === "capital") drawCityLarge(g, x, y, flagColor);
  else if (pop === "medium") drawCityMedium(g, x, y, flagColor);
  else drawCitySmall(g, x, y, flagColor);
}

/* ── Isometric-ish building helper ──
 * Draws a building seen from above: roof is main element,
 * thin south wall edge visible, shadow cast right+down.
 *
 *   bx,by = top-left corner of roof footprint
 *   w = width, d = depth (north-south), h = wall height visible
 */
function isoBuilding(
  g: Phaser.GameObjects.Graphics,
  bx: number, by: number,
  w: number, d: number, h: number,
  roofColor: number, wallColor: number,
): void {
  // Cast shadow (right + down)
  g.fillStyle(0x000000, 0.2);
  g.fillRect(bx + 1, by + d, w, h + 0.5);
  g.fillRect(bx + w, by + 1, 1, d + h);

  // South wall (thin edge at bottom of building)
  g.fillStyle(wallColor, 1);
  g.fillRect(bx, by + d, w, h);

  // Roof (main visible element from above)
  g.fillStyle(roofColor, 1);
  g.fillRect(bx - 0.5, by, w + 1, d);

  // Roof ridge (darker line in center)
  g.fillStyle(0x000000, 0.15);
  g.fillRect(bx, by + d * 0.45, w, 0.6);
}

function isoTower(
  g: Phaser.GameObjects.Graphics,
  cx: number, cy: number,
  radius: number, h: number,
  roofColor: number, wallColor: number,
): void {
  // Shadow
  g.fillStyle(0x000000, 0.2);
  g.fillCircle(cx + 0.8, cy + h + 0.5, radius);

  // Wall (visible as a ring at the bottom)
  g.fillStyle(wallColor, 1);
  g.fillCircle(cx, cy + h * 0.5, radius);

  // Roof top (circle seen from above)
  g.fillStyle(roofColor, 1);
  g.fillCircle(cx, cy, radius);

  // Highlight on roof
  g.fillStyle(0xffffff, 0.1);
  g.fillCircle(cx - radius * 0.2, cy - radius * 0.2, radius * 0.5);
}

function palmTopDown(g: Phaser.GameObjects.Graphics, cx: number, cy: number, size: number): void {
  // From above: dark trunk dot in center, green fronds radiating out
  g.fillStyle(0x1d6a1d, 0.8);
  // Frond lobes (4-5 circles around center)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - 0.3;
    g.fillCircle(cx + Math.cos(a) * size * 0.7, cy + Math.sin(a) * size * 0.6, size * 0.5);
  }
  // Darker center fronds
  g.fillStyle(0x155a15, 0.7);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    g.fillCircle(cx + Math.cos(a) * size * 0.3, cy + Math.sin(a) * size * 0.3, size * 0.35);
  }
  // Trunk center
  g.fillStyle(0x6b5030, 1);
  g.fillCircle(cx, cy, size * 0.15);
}

/* ── Large city: colonial port town from above ── */

export function drawCityLarge(g: Phaser.GameObjects.Graphics, x: number, y: number, _flagColor: number): void {
  // Ground/plaza (sandy area)
  g.fillStyle(0xc4a46a, 0.35);
  g.fillCircle(x, y, 8);

  // Street (darker sand)
  g.fillStyle(0xa08855, 0.3);
  g.fillRect(x - 8, y - 0.5, 16, 1);

  // Buildings — arranged around plaza, roofs seen from above
  // Left: large colonial mansion
  isoBuilding(g, x - 8, y - 5, 5, 4, 1.5, 0xbb4422, 0xe8d5a8);
  // Center-left: two-story house
  isoBuilding(g, x - 3, y - 6, 4, 3, 2, 0xaa3318, 0xf0e0c0);
  // Center: cathedral (wider, taller walls)
  isoBuilding(g, x + 1, y - 7, 5, 5, 2.5, 0x993315, 0xf0e0c0);
  // Cathedral bell tower (circular, rises above)
  isoTower(g, x + 3.5, y - 5, 1.5, 3, 0x882210, 0xd8c890);
  // Cross on top of tower
  g.lineStyle(0.6, 0xffdd44, 0.9);
  g.lineBetween(x + 3.5, y - 9, x + 3.5, y - 10);
  g.lineBetween(x + 3, y - 9.5, x + 4, y - 9.5);

  // Right: merchant house
  isoBuilding(g, x + 5, y - 4, 3, 3, 1.5, 0xcc5533, 0xe0cca0);
  // South: warehouse near harbor
  isoBuilding(g, x - 6, y + 2, 4, 2.5, 1, 0xbb4422, 0xd4c098);
  // South-right: small shop
  isoBuilding(g, x + 3, y + 2, 3, 2, 1, 0xcc5533, 0xe0cca0);

  // Harbor wall (stone quay at south edge)
  g.fillStyle(0x7a6a4a, 0.6);
  g.fillRect(x - 9, y + 5, 18, 1);

  // Palm trees (top-down: green rosettes)
  palmTopDown(g, x - 9, y - 2, 2);
  palmTopDown(g, x + 9, y + 1, 1.8);

  // Flag pole
  g.lineStyle(0.6, 0xcccccc, 0.9);
  g.lineBetween(x + 7, y - 3, x + 7, y - 7);
}

/* ── Medium city: colonial trading post ── */

export function drawCityMedium(g: Phaser.GameObjects.Graphics, x: number, y: number, _flagColor: number): void {
  // Ground
  g.fillStyle(0xc4a46a, 0.3);
  g.fillCircle(x, y, 5);

  // Church/town hall (center, largest)
  isoBuilding(g, x - 2, y - 5, 4, 3.5, 2, 0xaa3318, 0xf0e0c0);
  // Small bell tower
  isoTower(g, x + 0.5, y - 4, 1, 2, 0x882210, 0xd8c890);

  // Left house
  isoBuilding(g, x - 5, y - 2, 3, 2.5, 1.2, 0xcc5533, 0xe8d5a8);

  // Right house
  isoBuilding(g, x + 2, y - 2, 3, 2.5, 1.2, 0xbb4422, 0xe0cca0);

  // South: small building
  isoBuilding(g, x - 2, y + 1.5, 3, 2, 1, 0xcc5533, 0xd4c098);

  // Palm tree
  palmTopDown(g, x - 6, y + 1, 1.6);

  // Flag pole
  g.lineStyle(0.6, 0xcccccc, 0.8);
  g.lineBetween(x + 5, y - 2, x + 5, y - 5);
}

/* ── Small city: fishing village ── */

export function drawCitySmall(g: Phaser.GameObjects.Graphics, x: number, y: number, _flagColor: number): void {
  // Sandy ground
  g.fillStyle(0xc4a46a, 0.2);
  g.fillCircle(x, y, 3);

  // Main hut — round thatched roof seen from above
  g.fillStyle(0x000000, 0.15);
  g.fillCircle(x + 0.5, y + 1, 2); // shadow
  g.fillStyle(0x667744, 1);
  g.fillCircle(x, y, 2); // thatched roof
  g.fillStyle(0x556633, 0.6);
  g.fillCircle(x, y, 1.2); // center ridge
  g.fillStyle(0x6b5030, 0.8);
  g.fillCircle(x, y, 0.3); // smoke hole

  // Second smaller hut
  g.fillStyle(0x000000, 0.12);
  g.fillCircle(x + 3.3, y + 0.8, 1.2);
  g.fillStyle(0x667744, 1);
  g.fillCircle(x + 3, y, 1.3);
  g.fillStyle(0x556633, 0.5);
  g.fillCircle(x + 3, y, 0.7);

  // Small dock (planks extending south)
  g.fillStyle(0x7a6040, 0.7);
  g.fillRect(x + 1, y + 2.5, 0.6, 2);
  g.fillRect(x + 2.2, y + 2.5, 0.6, 2);
  g.fillRect(x + 0.5, y + 3.5, 3, 0.4);

  // Palm tree
  palmTopDown(g, x - 3, y - 1, 1.4);

  // Flag pole
  g.lineStyle(0.5, 0xaaaaaa, 0.7);
  g.lineBetween(x + 4, y - 1, x + 4, y - 3);
}

/* ── Fort: star-fort from above ── */

export function drawFort(g: Phaser.GameObjects.Graphics, x: number, y: number, _flagColor: number, pop: string): void {
  const big = pop === "large" || pop === "capital" || pop === "medium";
  const s = big ? 1.3 : 1.0;

  // Shadow
  g.fillStyle(0x000000, 0.2);
  g.fillRect(x - 2.5 * s + 1, y - 2.5 * s + 1, 5 * s, 5 * s);

  // Main courtyard (from above: square stone area)
  g.fillStyle(0x888877, 1);
  g.fillRect(x - 2.5 * s, y - 2.5 * s, 5 * s, 5 * s);

  // Walls (darker border)
  g.lineStyle(1.2 * s, 0x666655, 1);
  g.strokeRect(x - 2.5 * s, y - 2.5 * s, 5 * s, 5 * s);

  // Corner bastions (triangular, pointing outward — star-fort from above)
  g.fillStyle(0x777766, 1);
  const b = 2.2 * s;
  // NW bastion
  g.fillTriangle(x - 2.5 * s, y - 2.5 * s, x - 2.5 * s - b, y - 2.5 * s + 1.5 * s, x - 2.5 * s + 1.5 * s, y - 2.5 * s);
  // NE bastion
  g.fillTriangle(x + 2.5 * s, y - 2.5 * s, x + 2.5 * s + b, y - 2.5 * s + 1.5 * s, x + 2.5 * s - 1.5 * s, y - 2.5 * s);
  // SE bastion
  g.fillTriangle(x + 2.5 * s, y + 2.5 * s, x + 2.5 * s + b, y + 2.5 * s - 1.5 * s, x + 2.5 * s - 1.5 * s, y + 2.5 * s);
  // SW bastion
  g.fillTriangle(x - 2.5 * s, y + 2.5 * s, x - 2.5 * s - b, y + 2.5 * s - 1.5 * s, x - 2.5 * s + 1.5 * s, y + 2.5 * s);

  // Inner courtyard
  g.fillStyle(0x999988, 0.5);
  g.fillRect(x - 1.2 * s, y - 1.2 * s, 2.4 * s, 2.4 * s);

  // Gate (south wall opening)
  g.fillStyle(0x443322, 1);
  g.fillRect(x - 0.5 * s, y + 2 * s, 1 * s, 1 * s);

  // Flag pole
  g.lineStyle(0.6, 0xdddddd, 0.9);
  g.lineBetween(x, y - 1 * s, x, y - 4.5 * s);

  if (big) {
    // Cannon positions (dark dots on bastions)
    g.fillStyle(0x333333, 1);
    g.fillCircle(x - 2.5 * s - b * 0.4, y - 2.5 * s + 1 * s, 0.7);
    g.fillCircle(x + 2.5 * s + b * 0.4, y - 2.5 * s + 1 * s, 0.7);
    g.fillCircle(x + 2.5 * s + b * 0.4, y + 2.5 * s - 1 * s, 0.7);
    g.fillCircle(x - 2.5 * s - b * 0.4, y + 2.5 * s - 1 * s, 0.7);
  }
}
