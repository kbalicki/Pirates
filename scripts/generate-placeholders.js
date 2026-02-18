// Generate placeholder spritesheet PNGs for development
// Run: node scripts/generate-placeholders.js

import { writeFileSync, mkdirSync } from "fs";
import { deflateSync } from "zlib";

// CRC32 table
const crc32Table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crc32Table[i] = c;
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type);
  const crcData = Buffer.concat([typeBuffer, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([len, typeBuffer, data, crcBuf]);
}

function createPNG(width, height, pixelData) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdrChunk = makeChunk("IHDR", ihdrData);

  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = pixelData[srcIdx];
      rawData[dstIdx + 1] = pixelData[srcIdx + 1];
      rawData[dstIdx + 2] = pixelData[srcIdx + 2];
      rawData[dstIdx + 3] = pixelData[srcIdx + 3];
    }
  }

  const compressed = deflateSync(rawData);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function setPixel(pixels, totalW, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= totalW || y >= 32) return;
  const idx = (y * totalW + x) * 4;
  if (idx >= 0 && idx < pixels.length - 3) {
    pixels[idx] = r;
    pixels[idx + 1] = g;
    pixels[idx + 2] = b;
    pixels[idx + 3] = a;
  }
}

function drawShip(pixels, totalW, frameX, frameY, frameW, frameH, color, direction) {
  const cx = frameX + Math.floor(frameW / 2);
  const cy = frameY + Math.floor(frameH / 2);

  const angles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, (5 * Math.PI) / 4, (3 * Math.PI) / 2, (7 * Math.PI) / 4];
  const angle = angles[direction];
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  // Hull outline
  const hullPoints = [
    { x: 0, y: -12 },
    { x: -3, y: -8 },
    { x: -5, y: 0 },
    { x: -4, y: 6 },
    { x: -2, y: 8 },
    { x: 0, y: 9 },
    { x: 2, y: 8 },
    { x: 4, y: 6 },
    { x: 5, y: 0 },
    { x: 3, y: -8 },
  ];

  // Draw hull filled
  for (let iy = -12; iy <= 9; iy++) {
    for (let ix = -6; ix <= 6; ix++) {
      // Simple inside test: check if point is roughly inside hull shape
      const absX = Math.abs(ix);
      let maxWidth;
      if (iy < -8) maxWidth = 3 * (1 - (Math.abs(iy) - 8) / 4);
      else if (iy < 0) maxWidth = 5;
      else if (iy < 6) maxWidth = 5 - iy * 0.3;
      else maxWidth = 3 - (iy - 6) * 0.8;

      if (absX <= maxWidth) {
        const rx = Math.round(cx + ix * cosA - iy * sinA);
        const ry = Math.round(cy + ix * sinA + iy * cosA);
        setPixel(pixels, totalW, rx, ry, color[0], color[1], color[2], 255);
      }
    }
  }

  // Hull outline (darker)
  const dark = [Math.floor(color[0] * 0.5), Math.floor(color[1] * 0.5), Math.floor(color[2] * 0.5)];
  for (const pt of hullPoints) {
    const rx = Math.round(cx + pt.x * cosA - pt.y * sinA);
    const ry = Math.round(cy + pt.x * sinA + pt.y * cosA);
    setPixel(pixels, totalW, rx, ry, dark[0], dark[1], dark[2], 255);
  }

  // Mast (line perpendicular to heading)
  for (let i = -4; i <= 4; i++) {
    const mx = Math.round(cx + i * cosA);
    const my = Math.round(cy + i * sinA);
    setPixel(pixels, totalW, mx, my, 240, 230, 200, 220);
  }
}

function generateShipSpritesheet(color) {
  const frameW = 32;
  const frameH = 32;
  const totalW = frameW * 8;
  const totalH = frameH;
  const pixels = new Uint8Array(totalW * totalH * 4);

  for (let dir = 0; dir < 8; dir++) {
    drawShip(pixels, totalW, dir * frameW, 0, frameW, frameH, color, dir);
  }

  return { pixels, width: totalW, height: totalH };
}

// Main
mkdirSync("assets/sprites", { recursive: true });
mkdirSync("assets/tiles", { recursive: true });
mkdirSync("assets/maps", { recursive: true });

// Player ship - blue/white
const playerSheet = generateShipSpritesheet([100, 150, 255]);
writeFileSync("assets/sprites/ship_player.png",
  createPNG(playerSheet.width, playerSheet.height, playerSheet.pixels));
console.log("Created assets/sprites/ship_player.png");

// Enemy ship - red
const enemySheet = generateShipSpritesheet([220, 60, 60]);
writeFileSync("assets/sprites/ship_enemy.png",
  createPNG(enemySheet.width, enemySheet.height, enemySheet.pixels));
console.log("Created assets/sprites/ship_enemy.png");

// Sea tile (16x16)
const seaPixels = new Uint8Array(16 * 16 * 4);
for (let i = 0; i < 16 * 16; i++) {
  seaPixels[i * 4] = 10;
  seaPixels[i * 4 + 1] = 51;
  seaPixels[i * 4 + 2] = 102;
  seaPixels[i * 4 + 3] = 255;
}
writeFileSync("assets/tiles/sea.png", createPNG(16, 16, seaPixels));
console.log("Created assets/tiles/sea.png");

// Land tile (16x16)
const landPixels = new Uint8Array(16 * 16 * 4);
for (let i = 0; i < 16 * 16; i++) {
  landPixels[i * 4] = 68;
  landPixels[i * 4 + 1] = 170;
  landPixels[i * 4 + 2] = 68;
  landPixels[i * 4 + 3] = 255;
}
writeFileSync("assets/tiles/land.png", createPNG(16, 16, landPixels));
console.log("Created assets/tiles/land.png");

console.log("All placeholder assets generated!");
