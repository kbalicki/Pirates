import Phaser from "phaser";
import { txt } from "../ui/textStyle.ts";

// Placeholder for Phase 7 save/load system
export class SaveLoadScene extends Phaser.Scene {
  constructor() {
    super({ key: "SaveLoadScene" });
  }

  create(): void {
    const cam = this.cameras.main;
    const cx = cam.width / 2;

    this.cameras.main.setBackgroundColor("#1a1a2e");

    this.add.text(cx, 40, "SAVE / LOAD",
      txt(24, { color: "#ffffff" }),
    ).setOrigin(0.5);

    this.add.text(cx, 100, "Save/Load system coming in Phase 7",
      txt(14, { color: "#888888" }),
    ).setOrigin(0.5);

    this.add.text(cx, cam.height - 40, "[ BACK ]",
      txt(18, { color: "#ff8844" }),
    ).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        this.scene.start("MainMapScene");
      });

    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-ESC", () => {
        this.scene.start("MainMapScene");
      });
    }
  }
}
