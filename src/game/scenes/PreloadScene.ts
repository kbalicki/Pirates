import Phaser from "phaser";
import { txt } from "../ui/textStyle.ts";

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: "PreloadScene" });
  }

  preload(): void {
    // Show loading bar
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(width / 2 - 160, height / 2 - 15, 320, 30);

    const loadingText = this.add.text(width / 2, height / 2 - 40, "Loading...",
      txt(18, { color: "#ffffff" }),
    );
    loadingText.setOrigin(0.5);

    this.load.on("progress", (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0x44aa88, 1);
      progressBar.fillRect(width / 2 - 155, height / 2 - 10, 310 * value, 20);
    });

    this.load.on("complete", () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
    });

    // Load all game assets
    this.loadAssets();
  }

  private loadAssets(): void {
    // Sail ship spritesheet (8 directions, 4×2 grid, 96×64 per frame)
    this.load.spritesheet("sailship", "assets/sprites/sailship.png", {
      frameWidth: 96,
      frameHeight: 64,
    });

    // Pirate tilepack (384x320, 12×10 grid of 32×32 tiles)
    this.load.spritesheet("tilepack", "assets/tiles/tilepack.png", {
      frameWidth: 32,
      frameHeight: 32,
    });

    // Animated water spritesheet (40 frames, 128x128 each, 8 cols × 5 rows)
    this.load.spritesheet("water_anim", "assets/tiles/water_anim.png", {
      frameWidth: 128,
      frameHeight: 128,
    });

    // Pirate theme music
    this.load.audio("pirate_theme", "assets/audio/pirate_theme.mp3");
  }

  create(): void {
    this.scene.start("CharacterCreationScene");
  }
}
