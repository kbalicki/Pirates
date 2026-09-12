/**
 * Help overlay — the game's manual. H from the map, ESC or H to close.
 *
 * ## Why every string here goes through `t()` (v0.60.0)
 *
 * It did not until v0.60.0. This file put **147 strings** on the screen and
 * called `t()` **zero** times — the whole manual was hardcoded Polish, in a
 * build whose default language is English (`I18n.ts` opens on `"en"` and
 * nothing ever read the browser's). Its sibling `BattleHelpScene` was written
 * the other way round, every line a `battle.help_*` key, which is why the fight
 * had a manual in both languages and the world did not.
 *
 * The reason it survived fourteen releases is worth keeping: the author reads
 * Polish, so the one screen that was *not* translated looked right to him and
 * every screen that *was* looked like the odd one out. A locale table cannot
 * catch this — `keys.test.ts` checks that the two tables match each other, and
 * two matching tables say nothing about a scene that asks neither of them. The
 * test that catches it reads **this source file** and fails on a Polish letter
 * inside a string literal.
 *
 * So: no literal prose below. Key labels (`W / ↑`, `SPACE`) and numbers pulled
 * from the ship table are not prose and stay as they are.
 */
import Phaser from "phaser";
import { SHIP_CLASSES, type ShipClassDef } from "../../core/data/ships.ts";
import { visionRangeForMast } from "../render/WorldRenderer.ts";
import { bestBeatAngle } from "../../core/systems/WeatherSystem.ts";
import { t } from "../../core/i18n/index.ts";
import { txt } from "../ui/textStyle.ts";
import {
  HELP_SAILING_TOPICS, HELP_WORLD_TOPICS, HELP_EVENT_ROWS, HELP_SEVERITY_COLOUR,
} from "../../core/data/helpTopics.ts";

type HelpSection = "controls" | "ships" | "sailing" | "world" | "economy";

/** One row of the controls list: the key itself, and what it does. */
const CONTROLS: Array<[string, string]> = [
  ["W / ↑", "help.ctrl_sails_up"],
  ["S / ↓", "help.ctrl_sails_down"],
  ["A / ←", "help.ctrl_turn_left"],
  ["D / →", "help.ctrl_turn_right"],
  ["E", "help.ctrl_enter_port"],
  ["L", "help.ctrl_land"],
  ["X", "help.ctrl_dig"],
  ["SPACE", "help.ctrl_options"],
  ["H", "help.ctrl_help"],
  ["T", "help.ctrl_lanes"],
  ["C", "help.ctrl_currents"],
  // The chart marks have been toggled with N since v0.30.0 and the manual has
  // never said so. It matters more since v0.61.0: a new governor's appointment
  // is a mark on the chart, and it is how a captain finds the town in time.
  ["N", "help.ctrl_marks"],
  ["G", "help.ctrl_grid"],
  ["V", "help.ctrl_vision"],
  ["Scroll", "help.ctrl_zoom"],
];

/** The ship table's column heads, in the order the columns are drawn. */
const SHIP_COLUMNS = [
  "help.ships_col_name", "help.ships_col_knots", "help.ships_col_turn",
  "help.ships_col_hull", "help.ships_col_sails", "help.ships_col_guns",
  "help.ships_col_cargo", "help.ships_col_crew", "help.ships_col_deadbeat",
  "help.ships_col_glass", "help.ships_col_tons", "help.ships_col_rig",
];

export class HelpScene extends Phaser.Scene {
  private currentSection: HelpSection = "controls";

  constructor() {
    super({ key: "HelpScene" });
  }

  create(): void {
    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    // Backdrop
    const backdrop = this.add.rectangle(cx, cy, cam.width, cam.height, 0x000000, 0.7);
    backdrop.setInteractive();

    // Panel — fill most of screen
    const pw = Math.min(900, cam.width - 40);
    const ph = Math.min(700, cam.height - 40);
    this.add.rectangle(cx, cy, pw + 4, ph + 4, 0x1a1a2e).setDepth(1);
    this.add.rectangle(cx, cy, pw, ph, 0x0a0a1a, 0.97).setDepth(2);
    const border = this.add.graphics().setDepth(3);
    border.lineStyle(2, 0xc8a84e, 0.8);
    border.strokeRect(cx - pw / 2, cy - ph / 2, pw, ph);

    // Title
    this.add.text(cx, cy - ph / 2 + 14, t("help.title"), {
      ...txt(20, { bold: true, color: "#c8a84e" }),
    }).setOrigin(0.5, 0).setDepth(5);

    // Tab buttons
    const tabs: { label: string; key: HelpSection }[] = [
      { label: t("help.tab_controls"), key: "controls" },
      { label: t("help.tab_ships"), key: "ships" },
      { label: t("help.tab_sailing"), key: "sailing" },
      { label: t("help.tab_world"), key: "world" },
      { label: t("help.tab_economy"), key: "economy" },
    ];
    const tabY = cy - ph / 2 + 50;
    const tabW = (pw - 60) / tabs.length;
    tabs.forEach((tab, i) => {
      const tx = cx - pw / 2 + 30 + i * tabW + tabW / 2;
      const isActive = tab.key === this.currentSection;
      const bg = this.add.rectangle(tx, tabY, tabW - 8, 28, isActive ? 0x334455 : 0x1a1a2e).setDepth(4);
      bg.setStrokeStyle(1, isActive ? 0xc8a84e : 0x333333);
      bg.setInteractive();
      bg.on("pointerdown", () => {
        this.currentSection = tab.key;
        this.scene.restart();
      });
      this.add.text(tx, tabY, tab.label, {
        ...txt(14, { bold: isActive, color: isActive ? "#ffdd88" : "#888888" }),
      }).setOrigin(0.5, 0.5).setDepth(5);
    });

    // Content area
    const contentY = tabY + 24;
    const contentH = ph - 100;
    const left = cx - pw / 2 + 24;
    const right = cx + pw / 2 - 24;
    // The last line a column may occupy: the panel's foot, less the room the
    // close hint sits in. The topic lists are measured against it (v0.61.0).
    const contentBottom = cy + ph / 2 - 26;

    switch (this.currentSection) {
      case "controls": this.renderControls(left, contentY, right); break;
      case "ships": this.renderShips(left, contentY, right, contentH); break;
      case "sailing": this.renderSailing(left, contentY, right, contentBottom); break;
      case "world": this.renderWorld(left, contentY, right, contentBottom); break;
      case "economy": this.renderEconomy(left, contentY, right); break;
    }

    // Close hint
    this.add.text(cx, cy + ph / 2 - 14, t("help.close_hint"), {
      ...txt(10, { color: "#555555" }),
    }).setOrigin(0.5, 1).setDepth(5);

    this.input.keyboard?.on("keydown-ESC", () => this.close());
    this.input.keyboard?.on("keydown-H", () => this.close());
  }

  private close(): void {
    this.scene.resume("MainMapScene");
    this.scene.stop();
  }

  private renderControls(left: number, y: number, _right: number): void {
    y += 10;
    const lines: Array<[string, string]> = [
      ...CONTROLS,
      // The one row whose "key" is a sentence rather than a keycap.
      [t("help.ctrl_click_key"), "help.ctrl_click_city"],
    ];
    for (const [key, descKey] of lines) {
      this.add.text(left, y, key, { ...txt(15, { bold: true, color: "#ffdd88" }) }).setDepth(5);
      this.add.text(left + 140, y, t(descKey), { ...txt(14, { color: "#cccccc" }) }).setDepth(5);
      y += 26;
    }
  }

  private renderShips(left: number, y: number, right: number, contentH: number): void {
    y += 8;
    // Header — max knots = speedBase × peakWindMod(1.5) × displayMultiplier(32)
    const cols = [0, 105, 160, 215, 265, 310, 365, 425, 500, 565, 630, 710];
    SHIP_COLUMNS.forEach((key, i) => {
      this.add.text(left + cols[i], y, t(key), { ...txt(10, { bold: true, color: "#888888" }) }).setDepth(5);
    });
    y += 20;

    // Separator
    const g = this.add.graphics().setDepth(4);
    g.lineStyle(1, 0x444444, 0.5);
    g.lineBetween(left, y, right, y);
    y += 4;

    // Ship rows
    for (const ship of Object.values(SHIP_CLASSES) as ShipClassDef[]) {
      if (y > contentH + 80) break;
      const maxKnots = (ship.speedBase * 1.5 * 32).toFixed(0);
      const vision = Math.round(visionRangeForMast(ship.mastHeight));
      // The class's own name comes from the locale like everywhere else — the
      // shipyard and the fleet tab have read `ship.<id>.name` since v0.31.0.
      this.add.text(left + cols[0], y, t(`ship.${ship.id}.name`), { ...txt(11, { bold: true, color: "#ffdd88" }) }).setDepth(5);
      this.add.text(left + cols[1], y, `${maxKnots}`, { ...txt(11, { color: "#88cc88" }) }).setDepth(5);
      this.add.text(left + cols[2], y, `${(ship.turnRate * 100).toFixed(0)}°`, { ...txt(11, { color: "#88bbee" }) }).setDepth(5);
      this.add.text(left + cols[3], y, `${ship.hullMax}`, { ...txt(11, { color: "#cccccc" }) }).setDepth(5);
      this.add.text(left + cols[4], y, `${ship.sailsMax}`, { ...txt(11, { color: "#cccccc" }) }).setDepth(5);
      this.add.text(left + cols[5], y, `${ship.cannons}`, { ...txt(11, { color: "#cc8888" }) }).setDepth(5);
      this.add.text(left + cols[6], y, `${ship.cargoCap}t`, { ...txt(11, { color: "#ccaa66" }) }).setDepth(5);
      this.add.text(left + cols[7], y, `${ship.crewMin}-${ship.crewMax}`, { ...txt(11, { color: "#cccccc" }) }).setDepth(5);
      // Dead angle and the best beat: what she may not do, and what she should.
      this.add.text(left + cols[8], y, `${ship.minWindAngle}/${bestBeatAngle(ship.minWindAngle)}°`, { ...txt(11, { color: "#ee8844" }) }).setDepth(5);
      this.add.text(left + cols[9], y, `${vision}`, { ...txt(11, { color: "#66ccff" }) }).setDepth(5);
      this.add.text(left + cols[10], y, `${ship.tonnage}t`, { ...txt(11, { color: "#aaaaaa" }) }).setDepth(5);
      // "Fore-and-aft" / "Mixed" / "Square" are the table's own words; slugged
      // so the locale key is stable if somebody retypes the hyphen.
      const rig = ship.rigType.toLowerCase().replace(/[^a-z]+/g, "_");
      this.add.text(left + cols[11], y, t(`help.rig_${rig}`), { ...txt(11, { color: "#aaaaaa" }) }).setDepth(5);
      y += 22;
    }
  }

  /**
   * A list of headed paragraphs, in two columns — the shape the sailing and
   * world tabs use.
   *
   * The advance is the paragraph's **measured** height, not a flat 22 px
   * (v0.60.0). The flat number was right only for a body that fitted on one
   * line, and several of them never did: the currents paragraph runs to three,
   * so for as long as this screen has existed it has been printing the next
   * heading on top of its own last line, and the World tab ran off the bottom
   * of the panel entirely. Nothing but looking at it could catch that — which
   * is the same lesson as the battle banner in v0.59.0.
   *
   * Two columns because fifteen topics do not fit in one at any line height.
   * A topic that would run past the foot of the panel starts the second
   * column; if both fill, the overflow is visible rather than silently clipped,
   * and that is the signal to split the tab rather than to shrink the type.
   */
  private renderTopics(
    left: number, right: number, top: number, bottom: number, stems: readonly string[],
  ): void {
    const colGap = 24;
    const colW = (right - left - colGap) / 2;

    // Measure first, then place. Phaser only knows how tall a wrapped
    // paragraph is once it exists, and where the second column should start
    // depends on the total — so everything is drawn in the left column, added
    // up, and the back half is moved across. Balancing rather than filling:
    // filling put seven topics in the first column and eight in the second,
    // and the second ran off the foot of the panel.
    const blocks = stems.map(stem => {
      const head = this.add.text(left, 0, t(`help.${stem}_h`),
        { ...txt(13, { bold: true, color: "#ffdd88" }) }).setDepth(5);
      const body = this.add.text(left + 12, 0, t(`help.${stem}_b`),
        { ...txt(11, { color: "#aaaaaa" }), wordWrap: { width: colW - 12 } }).setDepth(5);
      return { head, body, h: 0 };
    });

    /**
     * Where to cut, measured rather than guessed.
     *
     * The first version stopped at the block that crossed the halfway mark and
     * put it in the **left** column, which systematically overloads the left:
     * one long paragraph added to a topic there pushed the last block off the
     * foot of the panel while the right column still had eighty pixels of air.
     * So try both sides of the crossing and keep the shorter tall column.
     */
    const cut = (heights: number[]): { split: number; tallest: number } => {
      const total = heights.reduce((n, h) => n + h, 0);
      let running = 0;
      for (let i = 0; i < heights.length; i++) {
        running += heights[i];
        if (running >= total / 2) {
          const withIt = Math.max(running, total - running);
          const withoutIt = Math.max(running - heights[i], total - running + heights[i]);
          return withoutIt < withIt
            ? { split: i, tallest: withoutIt }
            : { split: i + 1, tallest: withIt };
        }
      }
      return { split: heights.length, tallest: total };
    };

    // And how much air between topics. Ten pixels is what it should be; the
    // World tab in Polish is over its budget at ten and used to run its last
    // line through the panel border, because a manual that never fitted was
    // v0.60.0's whole complaint and the fix only balanced, it never *measured*
    // against the panel. Tighten the gap rather than drop a paragraph.
    const avail = bottom - (top + 10);
    let gap = 10;
    let plan = cut(blocks.map(b => 18 + b.body.height + gap));
    for (const candidate of [8, 6, 4, 2]) {
      if (plan.tallest <= avail) break;
      gap = candidate;
      plan = cut(blocks.map(b => 18 + b.body.height + gap));
    }
    blocks.forEach(b => { b.h = 18 + b.body.height + gap; });
    const split = plan.split;

    let y = top + 10;
    blocks.forEach((b, i) => {
      if (i === split) y = top + 10;
      const x = i < split ? left : left + colW + colGap;
      b.head.setPosition(x, y);
      b.body.setPosition(x + 12, y + 18);
      y += b.h;
    });
  }

  private renderSailing(left: number, y: number, right: number, bottom: number): void {
    this.renderTopics(left, right, y, bottom, HELP_SAILING_TOPICS.map(s => `sail_${s}`));
  }

  private renderWorld(left: number, y: number, right: number, bottom: number): void {
    this.renderTopics(left, right, y, bottom, HELP_WORLD_TOPICS.map(s => `world_${s}`));
  }

  private renderEconomy(left: number, y: number, right: number): void {
    const colW = (right - left - 20) / 2;
    const colA = left;
    const colB = left + colW + 20;
    y += 8;

    // ── Header ─────────────────────────────────────────────
    this.add.text((left + right) / 2, y, t("help.econ_intro"),
      { ...txt(12, { color: "#cccccc" }) }).setOrigin(0.5, 0).setDepth(5);
    y += 22;

    // ── Two-column layout ──────────────────────────────────
    let yA = y;
    let yB = y;

    const heading = (col: number, yPos: number, key: string): number => {
      this.add.text(col, yPos, t(key), { ...txt(13, { bold: true, color: "#c8a84e" }) }).setDepth(5);
      return yPos + 20;
    };
    const para = (col: number, yPos: number, key: string, color = "#aaaaaa"): number => {
      const text = t(key);
      this.add.text(col, yPos, text, {
        ...txt(11, { color }),
        wordWrap: { width: colW },
      }).setDepth(5);
      // Rough height estimate — count newlines + soft wrap by ~70 chars
      const lines = text.split("\n").reduce((n, ln) => n + Math.max(1, Math.ceil(ln.length / 70)), 0);
      return yPos + 14 * lines + 4;
    };
    const eventRow = (col: number, yPos: number, stem: string, sevColor: string): number => {
      this.add.text(col, yPos, "•", { ...txt(11, { color: sevColor }) }).setDepth(5);
      this.add.text(col + 10, yPos, t(`help.event_${stem}`), { ...txt(11, { bold: true, color: "#ffdd88" }) }).setDepth(5);
      this.add.text(col + 110, yPos, t(`help.event_${stem}_fx`), { ...txt(11, { color: "#aaaaaa" }) }).setDepth(5);
      return yPos + 16;
    };

    // ─── COLUMN A — state model ────────────────────────────
    yA = heading(colA, yA, "help.econ_city_h");
    yA = para(colA, yA, "help.econ_city_b1");
    yA = para(colA, yA, "help.econ_city_b2");

    yA += 6;
    yA = heading(colA, yA, "help.econ_prices_h");
    yA = para(colA, yA, "help.econ_prices_b1");
    yA = para(colA, yA, "help.econ_prices_b2");

    yA += 6;
    yA = heading(colA, yA, "help.econ_wealth_h");
    yA = para(colA, yA, "help.econ_wealth_b");

    yA += 6;
    yA = heading(colA, yA, "help.econ_war_h");
    yA = para(colA, yA, "help.econ_war_b1");
    yA = para(colA, yA, "help.econ_war_b2");

    // ─── COLUMN B — events table ───────────────────────────
    yB = heading(colB, yB, "help.econ_events_h");
    for (const [stem, severity] of HELP_EVENT_ROWS) {
      yB = eventRow(colB, yB, stem, HELP_SEVERITY_COLOUR[severity]);
    }

    yB += 6;
    yB = heading(colB, yB, "help.econ_can_h");
    yB = para(colB, yB, "help.econ_can_b");
  }
}
