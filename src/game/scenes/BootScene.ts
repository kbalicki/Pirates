import Phaser from "phaser";
import { initLang } from "../../core/i18n/index.ts";
import { initAssetPack } from "../settings/AssetPack.ts";
import { initZoomSetting } from "../settings/ZoomSetting.ts";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    // Nothing to preload in boot - just config
  }

  create(): void {
    initLang();
    initAssetPack();
    initZoomSetting();
    this.scene.start("PreloadScene");
  }
}
