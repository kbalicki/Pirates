import Phaser from "phaser";
import { t } from "../../core/i18n/index.ts";
import { txt } from "../ui/textStyle.ts";
import type { RetirementScore } from "../../core/systems/RetirementSystem.ts";

/**
 * RetirementScene — the ledger at the end of a career.
 *
 * The one screen in the game that looks backwards. It shows what each part of
 * the career was worth, what it adds up to, and the title the total earns —
 * then offers a new game, because there is nothing left to do with this one.
 *
 * The score itself is computed in `core/systems/RetirementSystem.ts` and handed
 * in whole; this scene does no arithmetic beyond laying the lines out.
 */
export class RetirementScene extends Phaser.Scene {
  private score!: RetirementScore;
  private captainName = "";

  constructor() {
    super({ key: "RetirementScene" });
  }

  init(data: { score: RetirementScore; captainName: string }): void {
    this.score = data.score;
    this.captainName = data.captainName;
  }

  create(): void {
    const cw = this.cameras.main.width;
    const ch = this.cameras.main.height;

    this.add.rectangle(0, 0, cw, ch, 0x0a0e18, 1).setOrigin(0);

    // Centre the ledger: heading + subheading + one row per line + rule,
    // total, title and the prompt. Measured rather than guessed so the block
    // sits in the middle whatever the number of score lines turns out to be.
    const blockHeight = 44 + 42 + this.score.lines.length * 26 + 20 + 44 + 48 + 24;
    let y = Math.max(32, (ch - blockHeight) / 2);

    this.add.text(cw / 2, y, t("retire.heading"), txt(28, { bold: true, color: "#ffdd66" }))
      .setOrigin(0.5, 0);
    y += 44;

    this.add.text(cw / 2, y, t("retire.subheading", {
      name: this.captainName,
      age: this.score.age,
      years: this.score.yearsAtSea,
    }), txt(14, { color: "#aabbcc" })).setOrigin(0.5, 0);
    y += 42;

    // Ledger: one line per source, amount on the left, points on the right.
    const tableW = Math.min(520, cw - 80);
    const x0 = cw / 2 - tableW / 2;

    for (const line of this.score.lines) {
      this.add.text(x0, y, t(line.key, { amount: line.amount }), txt(14, { color: "#dde4ee" }))
        .setOrigin(0, 0);
      this.add.text(x0 + tableW, y, String(line.points), txt(14, { color: "#dde4ee" }))
        .setOrigin(1, 0);
      y += 26;
    }

    y += 8;
    const rule = this.add.graphics();
    rule.lineStyle(1, 0x44506a, 0.9).lineBetween(x0, y, x0 + tableW, y);
    y += 12;

    this.add.text(x0, y, t("retire.total"), txt(18, { bold: true, color: "#ffdd66" })).setOrigin(0, 0);
    this.add.text(x0 + tableW, y, String(this.score.total), txt(18, { bold: true, color: "#ffdd66" }))
      .setOrigin(1, 0);
    y += 44;

    this.add.text(cw / 2, y, t(this.score.titleKey), txt(22, { bold: true, color: "#ffffff" }))
      .setOrigin(0.5, 0);
    y += 48;

    const again = this.add.text(cw / 2, y, t("retire.new_game"), txt(14, { color: "#88ccff" }))
      .setOrigin(0.5, 0);
    again.setInteractive({ useHandCursor: true });
    again.on("pointerover", () => again.setColor("#bbe4ff"));
    again.on("pointerout", () => again.setColor("#88ccff"));

    const restart = () => {
      this.registry.remove("worldState");
      this.scene.start("CharacterCreationScene");
    };
    again.on("pointerdown", restart);
    this.input.keyboard?.once("keydown-ENTER", restart);
    this.input.keyboard?.once("keydown-SPACE", restart);
  }
}
