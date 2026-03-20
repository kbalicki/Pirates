import Phaser from "phaser";
import type { PortDef } from "../../core/data/ports.ts";
import { FACTIONS } from "../../core/data/factions.ts";

/**
 * Draws a city/fort icon for a port on the map.
 * Uses AI-generated sprite if available, otherwise falls back to procedural drawing.
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

/** Large city: walled Caribbean town with church spire, multiple buildings, palm trees */
export function drawCityLarge(g: Phaser.GameObjects.Graphics, x: number, y: number, _flagColor: number): void {
  // Ground/plaza
  g.fillStyle(0xc4a46a, 0.5);
  g.fillCircle(x, y + 2, 16);

  // City wall (low stone)
  g.fillStyle(0x8a7a5a, 0.8);
  g.fillRoundedRect(x - 20, y + 1, 40, 3, 1);

  // Left house (colonial style)
  g.fillStyle(0xe8d5a8, 1); // cream walls
  g.fillRect(x - 16, y - 9, 9, 11);
  g.fillStyle(0xcc5533, 1); // terracotta roof
  g.fillRect(x - 17, y - 11, 11, 3);
  g.fillStyle(0xaa4422, 1);
  g.fillRect(x - 17, y - 11, 11, 1);

  // Central building (town hall / governor's mansion — tallest)
  g.fillStyle(0xf0e0c0, 1);
  g.fillRect(x - 5, y - 14, 11, 16);
  g.fillStyle(0xcc5533, 1);
  g.fillRect(x - 6, y - 16, 13, 3);
  g.fillStyle(0xaa4422, 1);
  g.fillRect(x - 6, y - 16, 13, 1);
  // Balcony
  g.fillStyle(0x8b7355, 1);
  g.fillRect(x - 4, y - 8, 9, 1);

  // Right house
  g.fillStyle(0xe0cca0, 1);
  g.fillRect(x + 8, y - 7, 8, 9);
  g.fillStyle(0xcc5533, 1);
  g.fillRect(x + 7, y - 9, 10, 3);
  g.fillStyle(0xaa4422, 1);
  g.fillRect(x + 7, y - 9, 10, 1);

  // Church spire
  g.fillStyle(0xd4c090, 1);
  g.fillRect(x - 1, y - 24, 3, 8);
  g.fillStyle(0xcc5533, 1);
  g.fillRect(x - 2, y - 26, 5, 3);
  // Cross
  g.lineStyle(1, 0xffdd44, 0.9);
  g.lineBetween(x + 0.5, y - 26, x + 0.5, y - 29);
  g.lineBetween(x - 1, y - 28, x + 2, y - 28);

  // Palm tree (left)
  g.lineStyle(2, 0x6b5030, 1);
  g.lineBetween(x - 19, y + 2, x - 18, y - 8);
  g.fillStyle(0x2d7a2d, 0.8);
  g.fillCircle(x - 18, y - 10, 4);
  g.fillCircle(x - 21, y - 8, 3);
  g.fillCircle(x - 15, y - 9, 3);

  // Windows (warm light)
  g.fillStyle(0xffdd44, 0.7);
  g.fillRect(x - 14, y - 7, 2, 2);
  g.fillRect(x - 14, y - 3, 2, 2);
  g.fillRect(x - 3, y - 12, 2, 2);
  g.fillRect(x + 2, y - 12, 2, 2);
  g.fillRect(x - 3, y - 6, 2, 2);
  g.fillRect(x + 2, y - 6, 2, 2);
  g.fillRect(x + 10, y - 5, 2, 2);
  g.fillRect(x + 10, y - 1, 2, 2);

  // Doors
  g.fillStyle(0x443322, 1);
  g.fillRect(x, y - 2, 2, 4);

  // Flag pole
  g.lineStyle(1, 0xdddddd, 0.9);
  g.lineBetween(x + 16, y - 7, x + 16, y - 18);
}

/** Medium city: 2 colonial buildings with red roofs, small church */
export function drawCityMedium(g: Phaser.GameObjects.Graphics, x: number, y: number, _flagColor: number): void {
  // Ground
  g.fillStyle(0xc4a46a, 0.4);
  g.fillCircle(x, y + 1, 10);

  // Left building
  g.fillStyle(0xe8d5a8, 1);
  g.fillRect(x - 10, y - 5, 7, 8);
  g.fillStyle(0xcc5533, 1);
  g.fillRect(x - 11, y - 7, 9, 3);
  g.fillStyle(0xaa4422, 1);
  g.fillRect(x - 11, y - 7, 9, 1);

  // Central building (taller)
  g.fillStyle(0xf0e0c0, 1);
  g.fillRect(x - 2, y - 9, 7, 12);
  g.fillStyle(0xcc5533, 1);
  g.fillRect(x - 3, y - 11, 9, 3);
  g.fillStyle(0xaa4422, 1);
  g.fillRect(x - 3, y - 11, 9, 1);

  // Small bell tower
  g.fillStyle(0xd4c090, 1);
  g.fillRect(x + 1, y - 15, 2, 4);
  g.fillStyle(0xcc5533, 1);
  g.fillRect(x, y - 16, 4, 2);

  // Right small structure
  g.fillStyle(0xe0cca0, 1);
  g.fillRect(x + 6, y - 3, 5, 6);
  g.fillStyle(0xcc5533, 1);
  g.fillRect(x + 5, y - 5, 7, 3);
  g.fillStyle(0xaa4422, 1);
  g.fillRect(x + 5, y - 5, 7, 1);

  // Windows
  g.fillStyle(0xffdd44, 0.7);
  g.fillRect(x - 8, y - 3, 2, 2);
  g.fillRect(x, y - 7, 2, 2);
  g.fillRect(x, y - 3, 2, 2);
  g.fillRect(x + 8, y - 1, 1, 1);

  // Door
  g.fillStyle(0x443322, 1);
  g.fillRect(x + 1, y + 0, 2, 3);

  // Flag pole
  g.lineStyle(1, 0xdddddd, 0.8);
  g.lineBetween(x + 11, y - 3, x + 11, y - 12);
}

/** Small settlement: thatched huts, palm tree, fishing village feel */
export function drawCitySmall(g: Phaser.GameObjects.Graphics, x: number, y: number, _flagColor: number): void {
  // Sandy ground
  g.fillStyle(0xc4a46a, 0.3);
  g.fillCircle(x, y + 1, 6);

  // Main hut (wooden walls, thatched roof)
  g.fillStyle(0x8b7355, 1);
  g.fillRect(x - 4, y - 2, 5, 5);
  g.fillStyle(0x667744, 1); // palm leaf roof
  g.fillRect(x - 5, y - 4, 7, 3);
  g.fillStyle(0x556633, 1);
  g.fillRect(x - 5, y - 4, 7, 1);

  // Second hut
  g.fillStyle(0x8b7355, 1);
  g.fillRect(x + 3, y - 1, 4, 4);
  g.fillStyle(0x667744, 1);
  g.fillRect(x + 2, y - 3, 6, 3);
  g.fillStyle(0x556633, 1);
  g.fillRect(x + 2, y - 3, 6, 1);

  // Small palm tree
  g.lineStyle(1, 0x6b5030, 1);
  g.lineBetween(x - 7, y + 2, x - 6, y - 4);
  g.fillStyle(0x2d7a2d, 0.7);
  g.fillCircle(x - 6, y - 5, 2.5);
  g.fillCircle(x - 8, y - 4, 2);

  // Tiny window
  g.fillStyle(0xffdd44, 0.5);
  g.fillRect(x - 2, y, 1, 1);

  // Small flag pole
  g.lineStyle(1, 0xaaaaaa, 0.8);
  g.lineBetween(x + 7, y - 1, x + 7, y - 8);
}

/** Fort: stone walls with towers, scales by population */
export function drawFort(g: Phaser.GameObjects.Graphics, x: number, y: number, _flagColor: number, pop: string): void {
  const big = pop === "large" || pop === "capital" || pop === "medium";
  const s = big ? 1.2 : 1.0;

  // Main wall
  g.fillStyle(0x777777, 1);
  g.fillRect(x - 9 * s, y - 7 * s, 18 * s, 14 * s);

  // Corner towers
  g.fillStyle(0x666666, 1);
  g.fillRect(x - 11 * s, y - 9 * s, 5 * s, 5 * s);
  g.fillRect(x + 6 * s, y - 9 * s, 5 * s, 5 * s);
  g.fillRect(x - 11 * s, y + 4 * s, 5 * s, 5 * s);
  g.fillRect(x + 6 * s, y + 4 * s, 5 * s, 5 * s);

  // Battlements
  g.fillStyle(0x888888, 1);
  for (let i = -10 * s; i <= 8 * s; i += 3 * s) {
    g.fillRect(x + i, y - 11 * s, 2 * s, 2 * s);
  }

  // Gate
  g.fillStyle(0x443322, 1);
  g.fillRect(x - 2 * s, y + 2 * s, 4 * s, 5 * s);

  // Gate arch
  g.lineStyle(1, 0x555555, 0.8);
  g.strokeRect(x - 2 * s, y + 2 * s, 4 * s, 5 * s);

  // Flag pole — flag sprite added separately in drawPortMarkers
  g.lineStyle(1, 0xdddddd, 0.9);
  g.lineBetween(x - 9 * s, y - 9 * s, x - 9 * s, y - 16 * s);

  if (big) {
    // Extra detail for larger forts: cannon positions
    g.fillStyle(0x333333, 1);
    g.fillCircle(x - 8 * s, y - 6 * s, 1.5);
    g.fillCircle(x + 8 * s, y - 6 * s, 1.5);
    g.fillCircle(x - 8 * s, y + 6 * s, 1.5);
    g.fillCircle(x + 8 * s, y + 6 * s, 1.5);
  }
}
