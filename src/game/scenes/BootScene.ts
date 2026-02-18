import Phaser from "phaser";
import { initLang } from "../../core/i18n/index.ts";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    // Nothing to preload in boot - just config
  }

  create(): void {
    initLang();
    this.scene.start("PreloadScene");
  }
}
