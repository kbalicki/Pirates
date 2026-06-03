/**
 * Battle Help — H during SeaBattleScene. Documents the combat ruleset that the
 * backend simulation must honor. Treat this as the player-facing spec for any
 * gameplay change in CombatEngine / SeaBattleScene.
 */
import Phaser from "phaser";
import { txt } from "../ui/textStyle.ts";
import { t } from "../../core/i18n/index.ts";

export class BattleHelpScene extends Phaser.Scene {
  constructor() {
    super({ key: "BattleHelpScene" });
  }

  create(): void {
    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    // Dim backdrop swallows clicks so battle input is suppressed.
    const backdrop = this.add.rectangle(cx, cy, cam.width, cam.height, 0x000000, 0.78);
    backdrop.setInteractive();

    const pw = Math.min(1000, cam.width - 40);
    const ph = Math.min(740, cam.height - 40);
    this.add.rectangle(cx, cy, pw + 4, ph + 4, 0x1a1a2e).setDepth(1);
    this.add.rectangle(cx, cy, pw, ph, 0x0a0a1a, 0.97).setDepth(2);
    const border = this.add.graphics().setDepth(3);
    border.lineStyle(2, 0xc8a84e, 0.8);
    border.strokeRect(cx - pw / 2, cy - ph / 2, pw, ph);

    this.add.text(cx, cy - ph / 2 + 14, t("battle.help_title"),
      txt(22, { bold: true, color: "#c8a84e" })).setOrigin(0.5, 0).setDepth(5);

    // Content — two columns of sections
    const colW = (pw - 80) / 2;
    const leftX = cx - pw / 2 + 30;
    const rightX = cx + 10;
    const startY = cy - ph / 2 + 56;

    this.renderColumn(leftX, startY, colW, [
      ["battle.help_controls_h", "battle.help_controls_body"],
      ["battle.help_sails_h", "battle.help_sails_body"],
      ["battle.help_turn_h", "battle.help_turn_body"],
      ["battle.help_range_h", "battle.help_range_body"],
    ]);

    this.renderColumn(rightX, startY, colW, [
      ["battle.help_ammo_h", "battle.help_ammo_body"],
      ["battle.help_damage_h", "battle.help_damage_body"],
      ["battle.help_reload_h", "battle.help_reload_body"],
      ["battle.help_boarding_h", "battle.help_boarding_body"],
      ["battle.help_timeout_h", "battle.help_timeout_body"],
    ]);

    // Close hint
    this.add.text(cx, cy + ph / 2 - 14, t("battle.help_close_hint"),
      txt(11, { color: "#888888" })).setOrigin(0.5, 1).setDepth(5);

    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-H", () => this.close());
      this.input.keyboard.on("keydown-ESC", () => this.close());
      this.input.keyboard.on("keydown-SPACE", () => this.close());
    }
    backdrop.on("pointerdown", () => this.close());
  }

  private renderColumn(
    x: number,
    startY: number,
    width: number,
    sections: Array<[string, string]>,
  ): void {
    let y = startY;
    for (const [headerKey, bodyKey] of sections) {
      const header = this.add.text(x, y, t(headerKey),
        txt(13, { bold: true, color: "#ffdd88" })).setDepth(5);
      y += header.height + 4;
      const body = this.add.text(x, y, t(bodyKey),
        { ...txt(11, { color: "#cccccc" }), wordWrap: { width }, lineSpacing: 3 }).setDepth(5);
      y += body.height + 14;
    }
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume("SeaBattleScene");
  }
}
