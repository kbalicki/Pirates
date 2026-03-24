import Phaser from "phaser";

/**
 * Generate procedural flag textures for each faction.
 * Call once during scene creation so flag sprites can reference the generated keys.
 */
export function generateFlagTextures(scene: Phaser.Scene): void {
  const W = 16, H = 12;

  // England: St George's Cross (red cross on white)
  {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1); g.fillRect(0, 0, W, H);
    g.fillStyle(0xcc0000, 1);
    g.fillRect(0, 5, W, 2);  // horizontal
    g.fillRect(7, 0, 2, H);  // vertical
    g.generateTexture("flag_england", W, H);
    g.destroy();
  }

  // Spain: Cross of Burgundy (red diagonal X on white, XVII century)
  {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1); g.fillRect(0, 0, W, H);
    g.lineStyle(2, 0xcc0000, 1);
    g.beginPath();
    g.moveTo(1, 1); g.lineTo(W - 1, H - 1);
    g.strokePath();
    g.beginPath();
    g.moveTo(W - 1, 1); g.lineTo(1, H - 1);
    g.strokePath();
    // Thicken with second pass slightly offset
    g.lineStyle(1, 0xaa0000, 0.6);
    g.beginPath();
    g.moveTo(2, 0); g.lineTo(W, H - 2);
    g.strokePath();
    g.beginPath();
    g.moveTo(W - 2, 0); g.lineTo(0, H - 2);
    g.strokePath();
    g.generateTexture("flag_spain", W, H);
    g.destroy();
  }

  // France: Fleur-de-lis (gold lily on blue, pre-revolution)
  {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x224488, 1); g.fillRect(0, 0, W, H);
    // Simplified fleur-de-lis: central stem + side petals
    g.fillStyle(0xffd700, 1);
    g.fillRect(7, 2, 2, 8);  // central stem
    g.fillRect(5, 3, 6, 2);  // cross bar
    // Top petals
    g.fillRect(4, 2, 2, 3);
    g.fillRect(10, 2, 2, 3);
    // Bottom flare
    g.fillRect(5, 8, 2, 2);
    g.fillRect(9, 8, 2, 2);
    g.generateTexture("flag_france", W, H);
    g.destroy();
  }

  // Netherlands: Prinsenvlag (orange-white-blue, XVII century)
  {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xff7700, 1); g.fillRect(0, 0, W, 4);   // orange
    g.fillStyle(0xffffff, 1); g.fillRect(0, 4, W, 4);   // white
    g.fillStyle(0x2255aa, 1); g.fillRect(0, 8, W, 4);   // blue
    g.generateTexture("flag_netherlands", W, H);
    g.destroy();
  }

  // Pirates: Jolly Roger (white skull on black)
  {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x111111, 1); g.fillRect(0, 0, W, H);
    // Skull (simplified)
    g.fillStyle(0xffffff, 1);
    g.fillRect(5, 2, 6, 5);   // skull body
    g.fillRect(6, 1, 4, 1);   // top of skull
    // Eyes
    g.fillStyle(0x111111, 1);
    g.fillRect(6, 3, 2, 2);
    g.fillRect(9, 3, 2, 2);
    // Crossbones
    g.lineStyle(1, 0xffffff, 0.9);
    g.beginPath();
    g.moveTo(3, 8); g.lineTo(13, 11);
    g.strokePath();
    g.beginPath();
    g.moveTo(13, 8); g.lineTo(3, 11);
    g.strokePath();
    g.generateTexture("flag_pirates", W, H);
    g.destroy();
  }
}

/** Generate a simple 4-direction crew party spritesheet (24x16 per frame, 4 frames). */
export function generateCrewTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists("crew_party")) return;
  const FW = 24, FH = 16;
  const g = scene.make.graphics({ x: 0, y: 0 });

  // 4 frames side by side: S, W, E, N (each 24x16)
  for (let f = 0; f < 4; f++) {
    const ox = f * FW;
    // 5 small pirate figures in a group (was 3)
    for (let p = 0; p < 5; p++) {
      const px = ox + 1 + p * 4 + (p >= 3 ? 1 : 0);
      const py = 4 + (p % 2 === 1 ? -2 : 0);

      // Body — varied colors
      const bodyColors = [0x8b4513, 0xcc3333, 0x2244aa, 0x448844, 0x886644];
      g.fillStyle(bodyColors[p], 1);
      g.fillRect(px, py + 4, 3, 5);

      // Head
      g.fillStyle(0xddbb88, 1);
      g.fillRect(px, py + 1, 3, 3);

      // Hat
      g.fillStyle(0x222222, 1);
      g.fillRect(px - 1, py, 5, 2);

      // Legs (direction-dependent offset)
      g.fillStyle(0x444444, 1);
      if (f === 0) { // S — walking down
        g.fillRect(px, py + 9, 1, 3);
        g.fillRect(px + 2, py + 9, 1, 3);
      } else if (f === 3) { // N — walking up
        g.fillRect(px, py + 9, 1, 2);
        g.fillRect(px + 2, py + 9, 1, 2);
      } else { // W/E — side view
        g.fillRect(px, py + 9, 1, 3);
        g.fillRect(px + 1, py + 9, 1, 2);
      }

      // Weapon (cutlass or musket — first and last figures)
      if (p === 0 || p === 4) {
        g.fillStyle(0xcccccc, 1);
        g.fillRect(px + 3, py + 5, 1, 4);
      }
    }
  }

  g.generateTexture("crew_party", FW * 4, FH);
  g.destroy();

  // Register as spritesheet (4 direction frames, 24x16 each)
  const tex = scene.textures.get("crew_party");
  tex.add(0, 0, 0, 0, FW, FH);        // S
  tex.add(1, 0, FW, 0, FW, FH);       // W
  tex.add(2, 0, FW * 2, 0, FW, FH);   // E
  tex.add(3, 0, FW * 3, 0, FW, FH);   // N
}
