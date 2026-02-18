import Phaser from "phaser";
import { t } from "../../core/i18n/index.ts";
import { txt } from "../ui/textStyle.ts";

const DLG_W = 300;
const DLG_H = 200;
const BORDER = 3;

export class PauseMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: "PauseMenuScene" });
  }

  create(): void {
    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    // Semi-transparent overlay
    this.add.rectangle(cx, cy, cam.width, cam.height, 0x000000, 0.55);

    // White dialog frame
    this.add.rectangle(cx, cy, DLG_W + BORDER * 2, DLG_H + BORDER * 2, 0x222222);
    this.add.rectangle(cx, cy, DLG_W, DLG_H, 0xffffff);

    // Title
    this.add.text(cx, cy - 60, t("pause.title"), txt(20, { bold: true })).setOrigin(0.5);

    // Resume button
    const resumeBtn = this.add.text(cx, cy, t("pause.resume"), txt(16, { bold: true }));
    resumeBtn.setOrigin(0.5);
    resumeBtn.setInteractive({ useHandCursor: true });
    resumeBtn.on("pointerover", () => resumeBtn.setColor("#555555"));
    resumeBtn.on("pointerout", () => resumeBtn.setColor("#1a1a1a"));
    resumeBtn.on("pointerdown", () => {
      this.scene.stop();
      this.scene.resume("MainMapScene");
    });

    // Save/Load button
    const saveBtn = this.add.text(cx, cy + 36, t("pause.save_load"), txt(16, { bold: true }));
    saveBtn.setOrigin(0.5);
    saveBtn.setInteractive({ useHandCursor: true });
    saveBtn.on("pointerover", () => saveBtn.setColor("#555555"));
    saveBtn.on("pointerout", () => saveBtn.setColor("#1a1a1a"));
    saveBtn.on("pointerdown", () => {
      this.scene.stop();
      this.scene.launch("OptionsMenuScene", {
        worldState: this.registry.get("worldState"),
        initialTab: 2,
      });
    });

    // Keyboard hint
    this.add.text(cx, cy + DLG_H / 2 - 12, "Esc \u2014 Resume", txt(10, { color: "#888888" }))
      .setOrigin(0.5, 1);

    // ESC to resume
    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-ESC", () => {
        this.scene.stop();
        this.scene.resume("MainMapScene");
      });
    }
  }
}
