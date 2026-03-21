import Phaser from "phaser";
import type { PortDef } from "../../core/data/ports.ts";
import { FACTIONS } from "../../core/data/factions.ts";

/**
 * Draws a city/fort icon for a port on the map.
 * 17th-century Caribbean colonial style with 3 sizes.
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

  // Try AI-generated city sprite first (not for forts)
  if (port.type !== "fort") {
    let spriteKey: string | null = null;
    if ((pop === "large" || pop === "capital") && scene.textures.exists("city_large")) {
      spriteKey = "city_large";
    } else if (pop === "medium" && scene.textures.exists("city_medium")) {
      spriteKey = "city_medium";
    } else if (scene.textures.exists("city_small")) {
      spriteKey = "city_small";
    }

    if (spriteKey) {
      const cityImg = scene.add.image(x, y, spriteKey);
      cityImg.setDepth(500);
      const scale = pop === "large" || pop === "capital" ? 0.8 : pop === "medium" ? 0.65 : 0.5;
      cityImg.setScale(scale);
      return;
    }
  }

  // Fallback: procedural drawing
  if (port.type === "fort") {
    drawFort(g, x, y, flagColor, pop);
  } else if (pop === "large" || pop === "capital") {
    drawCityLarge(g, x, y, flagColor);
  } else if (pop === "medium") {
    drawCityMedium(g, x, y, flagColor);
  } else {
    drawCitySmall(g, x, y, flagColor);
  }
}

/* ── helpers ── */

function roof(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, color: number): void {
  // Triangular terracotta roof
  g.fillStyle(color, 1);
  g.fillTriangle(x - 1, y, x + w + 1, y, x + w / 2, y - Math.max(2, w * 0.5));
}

function window(g: Phaser.GameObjects.Graphics, x: number, y: number, lit = true): void {
  g.fillStyle(lit ? 0xffdd44 : 0x332211, lit ? 0.7 : 0.8);
  g.fillRect(x, y, 1, 1);
}

function palmTree(g: Phaser.GameObjects.Graphics, x: number, y: number, h: number): void {
  // Curved trunk
  g.lineStyle(0.8, 0x6b5030, 1);
  g.lineBetween(x, y, x + 0.5, y - h);
  // Crown — multiple green dots
  g.fillStyle(0x2d8a2d, 0.85);
  g.fillCircle(x + 0.5, y - h, 1.2);
  g.fillCircle(x - 0.5, y - h + 0.3, 1);
  g.fillCircle(x + 1.5, y - h + 0.3, 1);
  g.fillStyle(0x1d6a1d, 0.7);
  g.fillCircle(x + 0.5, y - h - 0.5, 0.8);
}

/* ── Large city: colonial port town ── */

export function drawCityLarge(g: Phaser.GameObjects.Graphics, x: number, y: number, _flagColor: number): void {
  // Sandy plaza ground
  g.fillStyle(0xc4a46a, 0.4);
  g.fillCircle(x, y + 2, 7);

  // Low harbor wall (stone quay)
  g.fillStyle(0x7a6a4a, 0.7);
  g.fillRoundedRect(x - 8, y + 3, 16, 1.5, 0.5);

  // Left building: 2-story colonial with balcony
  g.fillStyle(0xe8d5a8, 1);
  g.fillRect(x - 7, y - 3, 4, 6);
  g.fillStyle(0xd4c098, 1);
  g.fillRect(x - 7, y - 1, 4, 0.5); // balcony floor
  g.fillStyle(0x8b6b45, 1);
  g.fillRect(x - 7, y - 1.5, 4, 0.5); // balcony railing
  roof(g, x - 7, y - 3, 4, 0xbb4422);
  window(g, x - 6, y - 2);
  window(g, x - 5, y - 2);
  window(g, x - 6, y);
  window(g, x - 5, y);

  // Central cathedral — tallest building
  g.fillStyle(0xf0e0c0, 1);
  g.fillRect(x - 2, y - 5, 5, 8);
  g.fillStyle(0xe8d0a8, 1);
  g.fillRect(x - 2, y - 2, 5, 0.5); // cornice
  roof(g, x - 2, y - 5, 5, 0xaa3318);
  // Bell tower / spire
  g.fillStyle(0xd8c890, 1);
  g.fillRect(x, y - 8, 2, 3);
  roof(g, x, y - 8, 2, 0xaa3318);
  // Cross
  g.lineStyle(0.7, 0xffdd44, 0.9);
  g.lineBetween(x + 1, y - 9.5, x + 1, y - 10.5);
  g.lineBetween(x + 0.3, y - 10, x + 1.7, y - 10);
  // Cathedral windows (arched)
  window(g, x - 1, y - 4);
  window(g, x + 1, y - 4);
  window(g, x - 1, y - 1);
  window(g, x + 1, y - 1);
  window(g, x + 2, y - 1);
  // Grand door
  g.fillStyle(0x3a2211, 1);
  g.fillRect(x, y + 1, 2, 2);
  g.lineStyle(0.5, 0x554433, 0.7);
  g.strokeCircle(x + 1, y + 1, 1); // arch above door

  // Right building: merchant house
  g.fillStyle(0xe0cca0, 1);
  g.fillRect(x + 4, y - 2, 3, 5);
  roof(g, x + 4, y - 2, 3, 0xcc5533);
  window(g, x + 5, y - 1);
  window(g, x + 5, y + 1);
  g.fillStyle(0x3a2211, 1);
  g.fillRect(x + 5, y + 2, 1, 1);

  // Far-right small house
  g.fillStyle(0xd8c498, 1);
  g.fillRect(x + 7, y - 1, 2, 3);
  roof(g, x + 7, y - 1, 2, 0xbb4422);
  window(g, x + 8, y);

  // Palm trees
  palmTree(g, x - 9, y + 2, 5);
  palmTree(g, x + 10, y + 1, 4);

  // Flag pole
  g.lineStyle(0.7, 0xcccccc, 0.9);
  g.lineBetween(x + 7, y - 2, x + 7, y - 6);
}

/* ── Medium city: colonial trading post ── */

export function drawCityMedium(g: Phaser.GameObjects.Graphics, x: number, y: number, _flagColor: number): void {
  // Ground
  g.fillStyle(0xc4a46a, 0.35);
  g.fillCircle(x, y + 1, 4.5);

  // Left building: colonial house
  g.fillStyle(0xe8d5a8, 1);
  g.fillRect(x - 4, y - 2, 3, 4);
  roof(g, x - 4, y - 2, 3, 0xcc5533);
  window(g, x - 3, y - 1);
  window(g, x - 3, y + 0.5);

  // Center: church/town hall (taller)
  g.fillStyle(0xf0e0c0, 1);
  g.fillRect(x - 1, y - 3, 3, 5);
  roof(g, x - 1, y - 3, 3, 0xaa3318);
  // Small bell tower
  g.fillStyle(0xd4c090, 1);
  g.fillRect(x, y - 5, 1.5, 2);
  roof(g, x, y - 5, 1.5, 0xaa3318);
  window(g, x, y - 2);
  window(g, x + 1, y - 2);
  window(g, x, y);
  // Door
  g.fillStyle(0x3a2211, 1);
  g.fillRect(x + 0.5, y + 1, 1, 1);

  // Right: smaller building
  g.fillStyle(0xe0cca0, 1);
  g.fillRect(x + 3, y - 1, 2, 3);
  roof(g, x + 3, y - 1, 2, 0xcc5533);
  window(g, x + 4, y);

  // Palm tree
  palmTree(g, x - 6, y + 1, 4);

  // Flag pole
  g.lineStyle(0.7, 0xcccccc, 0.8);
  g.lineBetween(x + 5, y - 1, x + 5, y - 4);
}

/* ── Small city: Caribbean fishing village ── */

export function drawCitySmall(g: Phaser.GameObjects.Graphics, x: number, y: number, _flagColor: number): void {
  // Sandy ground
  g.fillStyle(0xc4a46a, 0.25);
  g.fillCircle(x, y + 1, 3);

  // Main hut — wooden walls, palm-leaf roof
  g.fillStyle(0x8b7355, 1);
  g.fillRect(x - 2, y - 1, 2.5, 2.5);
  // Thatched roof (irregular triangle)
  g.fillStyle(0x667744, 1);
  g.fillTriangle(x - 2.5, y - 1, x + 1, y - 1, x - 0.5, y - 3);
  g.fillStyle(0x556633, 0.8);
  g.fillTriangle(x - 2.5, y - 1, x + 1, y - 1, x - 0.5, y - 2.5);

  // Second smaller hut
  g.fillStyle(0x8b7355, 1);
  g.fillRect(x + 1.5, y, 1.5, 1.5);
  g.fillStyle(0x667744, 1);
  g.fillTriangle(x + 1, y, x + 3.5, y, x + 2.2, y - 1.5);

  // Tiny window glow
  window(g, x - 1, y, true);

  // Palm tree
  palmTree(g, x - 3.5, y + 1, 3.5);

  // Small dock (2 planks into water)
  g.lineStyle(0.6, 0x7a6040, 0.7);
  g.lineBetween(x + 2, y + 2, x + 4, y + 2);
  g.lineBetween(x + 2.5, y + 1.5, x + 2.5, y + 2.5);
  g.lineBetween(x + 3.5, y + 1.5, x + 3.5, y + 2.5);

  // Flag pole
  g.lineStyle(0.6, 0xaaaaaa, 0.7);
  g.lineBetween(x + 3, y - 1, x + 3, y - 3);
}

/* ── Fort: stone star-fort ── */

export function drawFort(g: Phaser.GameObjects.Graphics, x: number, y: number, _flagColor: number, pop: string): void {
  const big = pop === "large" || pop === "capital" || pop === "medium";
  const s = big ? 1.3 : 1.0;

  // Main wall
  g.fillStyle(0x777777, 1);
  g.fillRect(x - 3 * s, y - 2 * s, 6 * s, 4 * s);

  // Corner bastions (diamond-shaped for star-fort look)
  g.fillStyle(0x666666, 1);
  const bs = 1.8 * s;
  // Top-left bastion
  g.fillTriangle(x - 3 * s, y - 2 * s, x - 3 * s - bs, y - 0.5 * s, x - 3 * s, y + 1 * s);
  // Top-right bastion
  g.fillTriangle(x + 3 * s, y - 2 * s, x + 3 * s + bs, y - 0.5 * s, x + 3 * s, y + 1 * s);
  // Bottom-left bastion
  g.fillTriangle(x - 3 * s, y - 1 * s, x - 3 * s - bs, y + 0.5 * s, x - 3 * s, y + 2 * s);
  // Bottom-right bastion
  g.fillTriangle(x + 3 * s, y - 1 * s, x + 3 * s + bs, y + 0.5 * s, x + 3 * s, y + 2 * s);

  // Inner courtyard
  g.fillStyle(0x999988, 0.6);
  g.fillRect(x - 1.5 * s, y - 0.5 * s, 3 * s, 2 * s);

  // Battlements (top wall)
  g.fillStyle(0x888888, 1);
  for (let i = -2.5; i <= 2.5; i += 1.2) {
    g.fillRect(x + i * s, y - 2.8 * s, 0.6 * s, 0.8 * s);
  }

  // Gate
  g.fillStyle(0x443322, 1);
  g.fillRect(x - 0.5 * s, y + 1.5 * s, 1 * s, 1 * s);

  // Flag pole
  g.lineStyle(0.7, 0xdddddd, 0.9);
  g.lineBetween(x, y - 2 * s, x, y - 5 * s);

  if (big) {
    // Cannon positions on bastions
    g.fillStyle(0x333333, 1);
    g.fillCircle(x - 3 * s - bs * 0.5, y - 0.5 * s, 0.8);
    g.fillCircle(x + 3 * s + bs * 0.5, y - 0.5 * s, 0.8);
    g.fillCircle(x - 3 * s - bs * 0.5, y + 0.5 * s, 0.8);
    g.fillCircle(x + 3 * s + bs * 0.5, y + 0.5 * s, 0.8);
  }
}
