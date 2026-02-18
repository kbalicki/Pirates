import Phaser from "phaser";
import { txt } from "../ui/textStyle.ts";

// Placeholder for Phase 8 dialogue system
export class DialogueScene extends Phaser.Scene {
  constructor() {
    super({ key: "DialogueScene" });
  }

  create(): void {
    this.add.text(400, 300, "Dialogue Scene (TODO)",
      txt(20, { color: "#ffffff" }),
    ).setOrigin(0.5);
  }
}
