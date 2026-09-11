import Phaser from "phaser";
import { initLang, setLang } from "../../core/i18n/index.ts";
import { initAssetPack } from "../settings/AssetPack.ts";
import { initZoomSetting } from "../settings/ZoomSetting.ts";
import { initSoundSettings } from "../settings/SoundSettings.ts";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    // Nothing to preload in boot - just config
  }

  create(): void {
    // `?lang=en|pl` — the language, before anything has drawn a word of text
    // (v0.60.0). It has to be here rather than in `PreloadScene` with the rest
    // of the debug params, because `initLang` runs one line below and every
    // scene after this reads whatever it decided. Stored like the toggle in
    // Options, so a headless run and a real one see the same thing.
    const lang = new URLSearchParams(window.location.search).get("lang");
    if (lang === "en" || lang === "pl") setLang(lang);
    initLang();
    initAssetPack();
    initZoomSetting();
    initSoundSettings();
    this.scene.start("PreloadScene");
  }
}
