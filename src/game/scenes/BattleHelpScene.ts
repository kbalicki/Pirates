/**
 * Battle Help — H during SeaBattleScene. Documents the combat ruleset that the
 * backend simulation must honor. Treat this as the player-facing spec for any
 * gameplay change in CombatEngine / SeaBattleScene.
 *
 * It is drawn in pages now, and the pages are filled by **measurement**
 * (v0.83.0). It used to be two columns with a split somebody typed — four
 * sections left, five right — and nothing measured either against the panel.
 * Measured on the running game at 1280x720: the window holds 600 px a column
 * and the right column was **1475 px** tall, so more than half of this spec —
 * the whole of reload, boarding, the timeout rule and every worked example —
 * had never been on the screen at all. No two columns could have held it; the
 * text needs three and a half.
 */
import Phaser from "phaser";
import { txt, HINT_ON_DARK } from "../ui/textStyle.ts";
import { t } from "../../core/i18n/index.ts";
import { packColumns, paginate } from "../../core/services/columnFlow.ts";
import { BOARDING_RANGE } from "../../core/systems/BoardingSystem.ts";

/** Every section of the spec, in reading order. Pages are found, not chosen. */
/**
 * Numbers the manual states, taken from the code that holds them (v0.88.0).
 *
 * Every section is translated with these, whether it asks for them or not,
 * because the alternative is a table of which key wants which variable — a
 * second copy of the same kind that put the wrong number here to begin with.
 * `battle.help_boarding_body` said the grapnel reaches thirty pixels; it has
 * reached seventy-seven since v0.86.0, when `BOARDING_RANGE` became a hull's
 * width. A number typed into a sentence is a copy nothing keeps.
 */
const MANUAL_VARS = { range: BOARDING_RANGE };

const SECTIONS: Array<[string, string]> = [
  ["battle.help_controls_h", "battle.help_controls_body"],
  ["battle.help_sails_h", "battle.help_sails_body"],
  ["battle.help_turn_h", "battle.help_turn_body"],
  ["battle.help_range_h", "battle.help_range_body"],
  ["battle.help_ammo_h", "battle.help_ammo_body"],
  ["battle.help_damage_h", "battle.help_damage_body"],
  ["battle.help_examples_h", "battle.help_examples_body"],
  ["battle.help_reload_h", "battle.help_reload_body"],
  ["battle.help_boarding_h", "battle.help_boarding_body"],
  ["battle.help_timeout_h", "battle.help_timeout_body"],
];

const COLUMNS_PER_PAGE = 2;
const GAP_AFTER_HEADER = 4;
const GAP_AFTER_SECTION = 14;

export class BattleHelpScene extends Phaser.Scene {
  /** Kept across the restart that turns a page. */
  private page = 0;

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

    const colW = (pw - 80) / 2;
    const colX = [cx - pw / 2 + 30, cx + 10];
    const startY = cy - ph / 2 + 56;
    // The last line a column may occupy: the panel's foot, less the room the
    // hint sits in. The same measurement the main manual has had since
    // v0.61.0, and the one this screen never got.
    const bottom = cy + ph / 2 - 34;

    // Draw everything once to find out how tall it is, then let the packer say
    // where it goes. Phaser has no way to measure wrapped text without making
    // it, so the sections are made where they will be read from and only their
    // *y* is decided afterwards.
    const drawn = SECTIONS.map(([headerKey, bodyKey]) => {
      const header = this.add.text(0, 0, t(headerKey),
        txt(13, { bold: true, color: "#ffdd88" })).setDepth(5).setVisible(false);
      const body = this.add.text(0, 0, t(bodyKey, MANUAL_VARS),
        { ...txt(11, { color: "#cccccc" }), wordWrap: { width: colW }, lineSpacing: 3 })
        .setDepth(5).setVisible(false);
      return { header, body };
    });

    const heights = drawn.map(s =>
      s.header.height + GAP_AFTER_HEADER + s.body.height + GAP_AFTER_SECTION);
    const columns = packColumns(heights, bottom - startY);
    const pages = paginate(columns, COLUMNS_PER_PAGE);
    this.page = Phaser.Math.Clamp(this.page, 0, Math.max(0, pages.length - 1));

    (pages[this.page] ?? []).forEach((column, columnIndex) => {
      let y = startY;
      for (const section of column) {
        const { header, body } = drawn[section];
        header.setPosition(colX[columnIndex], y).setVisible(true);
        y += header.height + GAP_AFTER_HEADER;
        body.setPosition(colX[columnIndex], y).setVisible(true);
        y += body.height + GAP_AFTER_SECTION;
      }
    });

    this.add.text(cx, cy - ph / 2 + 14,
      t("battle.help_title") + (pages.length > 1
        ? `  (${this.page + 1}/${pages.length})` : ""),
      txt(22, { bold: true, color: "#c8a84e" })).setOrigin(0.5, 0).setDepth(5);

    const hintKey = pages.length > 1 ? "battle.help_page_hint" : "battle.help_close_hint";
    this.add.text(cx, cy + ph / 2 - 14, t(hintKey),
      txt(11, { color: HINT_ON_DARK })).setOrigin(0.5, 1).setDepth(5);

    const turn = (delta: number) => {
      const next = Phaser.Math.Clamp(this.page + delta, 0, pages.length - 1);
      if (next === this.page) return;
      this.page = next;
      this.scene.restart();
    };

    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-H", () => this.close());
      this.input.keyboard.on("keydown-ESC", () => this.close());
      this.input.keyboard.on("keydown-SPACE", () => this.close());
      this.input.keyboard.on("keydown-LEFT", () => turn(-1));
      this.input.keyboard.on("keydown-RIGHT", () => turn(1));
      this.input.keyboard.on("keydown-A", () => turn(-1));
      this.input.keyboard.on("keydown-D", () => turn(1));
    }
    backdrop.on("pointerdown", () => this.close());
  }

  private close(): void {
    // The manual opens where it was left inside one battle, and at the front
    // of the next one.
    this.page = 0;
    this.scene.stop();
    this.scene.resume("SeaBattleScene");
  }
}
