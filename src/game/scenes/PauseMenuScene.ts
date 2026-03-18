import Phaser from "phaser";
import { t } from "../../core/i18n/index.ts";
import { txt } from "../ui/textStyle.ts";

const DLG_W = 300;
const DLG_H = 200;
const BORDER = 3;

export class PauseMenuScene extends Phaser.Scene {
  private selectedIndex = 0;
  private buttons: Phaser.GameObjects.Text[] = [];
  private arrow!: Phaser.GameObjects.Text;

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
    resumeBtn.on("pointerover", () => { this.selectedIndex = 0; this.updateSelection(); });
    resumeBtn.on("pointerout", () => this.updateSelection());
    resumeBtn.on("pointerdown", () => this.doResume());

    // Save/Load button
    const saveBtn = this.add.text(cx, cy + 36, t("pause.save_load"), txt(16, { bold: true }));
    saveBtn.setOrigin(0.5);
    saveBtn.setInteractive({ useHandCursor: true });
    saveBtn.on("pointerover", () => { this.selectedIndex = 1; this.updateSelection(); });
    saveBtn.on("pointerout", () => this.updateSelection());
    saveBtn.on("pointerdown", () => this.doSaveLoad());

    this.buttons = [resumeBtn, saveBtn];

    // Arrow marker
    this.arrow = this.add.text(0, 0, "\u25B6", txt(12, { bold: true }));
    this.selectedIndex = 0;
    this.updateSelection();

    // Keyboard hint
    this.add.text(cx, cy + DLG_H / 2 - 12,
      "\u2191\u2193 \u2014 Select   Enter \u2014 Confirm   Esc \u2014 Resume",
      txt(10, { color: "#888888" }))
      .setOrigin(0.5, 1);

    // Keyboard
    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-ESC", () => this.doResume());
      this.input.keyboard.on("keydown-UP", () => this.moveSelection(-1));
      this.input.keyboard.on("keydown-W", () => this.moveSelection(-1));
      this.input.keyboard.on("keydown-DOWN", () => this.moveSelection(1));
      this.input.keyboard.on("keydown-S", () => this.moveSelection(1));
      this.input.keyboard.on("keydown-ENTER", () => this.confirmSelection());
      this.input.keyboard.on("keydown-E", () => this.confirmSelection());
    }
  }

  private moveSelection(delta: number): void {
    this.selectedIndex = Phaser.Math.Clamp(this.selectedIndex + delta, 0, this.buttons.length - 1);
    this.updateSelection();
  }

  private updateSelection(): void {
    for (let i = 0; i < this.buttons.length; i++) {
      if (i === this.selectedIndex) {
        this.buttons[i].setColor("#000000");
        this.buttons[i].setFontStyle("bold");
      } else {
        this.buttons[i].setColor("#555555");
        this.buttons[i].setFontStyle("bold");
      }
    }
    const sel = this.buttons[this.selectedIndex];
    if (sel && this.arrow) {
      this.arrow.setPosition(sel.x - sel.width / 2 - 18, sel.y - 6);
    }
  }

  private confirmSelection(): void {
    if (this.selectedIndex === 0) this.doResume();
    else this.doSaveLoad();
  }

  private doResume(): void {
    this.scene.stop();
    this.scene.resume("MainMapScene");
  }

  private doSaveLoad(): void {
    this.scene.stop();
    this.scene.launch("OptionsMenuScene", {
      worldState: this.registry.get("worldState"),
      initialTab: 2,
    });
  }
}
