import Phaser from "phaser";
import { t } from "../../core/i18n/index.ts";
import { txt, HINT_ON_DARK } from "../ui/textStyle.ts";
import { createRng } from "../../core/services/RNG.ts";
import {
  createDuel,
  duelStep,
  DUEL_MAX_STAMINA,
  DUEL_WIN_ADVANTAGE,
  DUEL_TIRED_THRESHOLD,
  type DuelAction,
  type DuelState,
} from "../../core/systems/DuelSystem.ts";

/** Where a duel is fought, which decides what the screen calls it. */
export type DuelSetting = "deck" | "gate" | "dig" | "house";

/** Title, subtitle and victory line for each setting. */
export const DUEL_TEXT: Record<DuelSetting, { title: string; subtitle: string; won: string }> = {
  deck: { title: "duel.title", subtitle: "duel.subtitle", won: "duel.won" },
  gate: { title: "duel.title_gate", subtitle: "duel.subtitle_gate", won: "duel.won_gate" },
  dig: { title: "duel.title_dig", subtitle: "duel.subtitle_dig", won: "duel.won_dig" },
  house: { title: "duel.title_house", subtitle: "duel.subtitle_house", won: "duel.won_house" },
};

/**
 * DuelScene — every personal fight in the game, settled with steel.
 *
 * A boarding (the captains, on a deck), the watch at a town gate, the men at a
 * baited dig and the marquis' guards (`DuelSetting`, v0.99.9). First written
 * for the boarding: launched over a paused `SeaBattleScene` when one is accepted. All the
 * rules live in `core/systems/DuelSystem.ts`; this scene only draws the state
 * and turns keys into actions, so the fight can be tested without Phaser.
 *
 * Controls mirror the sail controls the player already knows: the number keys
 * pick a line, and the two verbs are on separate rows.
 *
 *   Q / W / E   attack high / middle / low
 *   A / S / D   guard  high / middle / low
 *
 * The deck between the two captains is one bar. Push it to your end and the
 * other man is over the rail.
 */
export class DuelScene extends Phaser.Scene {
  private duel!: DuelState;
  private lastAction: DuelAction | null = null;
  private resolved = false;

  private groundBar!: Phaser.GameObjects.Graphics;
  private playerStaminaBar!: Phaser.GameObjects.Graphics;
  private enemyStaminaBar!: Phaser.GameObjects.Graphics;
  private narrationText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private playerBlade!: Phaser.GameObjects.Graphics;
  private enemyBlade!: Phaser.GameObjects.Graphics;

  /** Told to the caller when the duel ends. */
  private onFinish?: (playerWon: boolean) => void;
  /**
   * Where the blades are drawn (v0.99.9). The screen called every fight "A
   * Duel of Captains", told him to drive the man "to the rail" and cheered
   * "He yields the deck!" - true of a boarding, and said just the same to the
   * watch at a town gate, the men at a baited dig and the marquis' guards.
   */
  private setting: DuelSetting = "deck";
  /** The chart's overlay was hidden for the fight and is to come back. */
  private hidOverlay = false;

  constructor() {
    super({ key: "DuelScene" });
  }

  init(data: {
    playerFencing: number;
    enemyFencing: number;
    seed?: number;
    onFinish?: (playerWon: boolean) => void;
    setting?: DuelSetting;
  }): void {
    this.setting = data.setting ?? "deck";
    this.duel = createDuel(data.playerFencing, data.enemyFencing, createRng(data.seed ?? Date.now()));
    this.lastAction = null;
    this.resolved = false;
    this.onFinish = data.onFinish;
  }

  create(): void {
    const cw = this.cameras.main.width;
    const ch = this.cameras.main.height;

    // Dim the battle behind so the duel reads as a separate moment. The two
    // ships stay faintly visible on purpose — you are fighting on their decks —
    // but the duel needs solid ground of its own, or the battle HUD and the
    // ammo row show through the text and both become unreadable.
    this.add.rectangle(0, 0, cw, ch, 0x0a0a16, 0.92).setOrigin(0).setDepth(0);
    this.panel(cw / 2, ch / 2 - 6, 640, 250);
    this.panel(cw / 2, ch - 66, 640, 104);

    // The chart's own overlay - compass, date, the map's hints - is a separate
    // always-on scene and drew over a fight launched from the chart or a town's
    // gate. Hidden for the duel, given back when it ends.
    if (this.scene.isActive("UIOverlayScene")) {
      this.scene.setVisible(false, "UIOverlayScene");
      this.hidOverlay = true;
      // On shutdown rather than only at the verdict: however the scene is
      // stopped, the chart gets its overlay back.
      this.events.once("shutdown", () => {
        if (this.hidOverlay) this.scene.setVisible(true, "UIOverlayScene");
        this.hidOverlay = false;
      });
    }

    this.add.text(cw / 2, 40, t(DUEL_TEXT[this.setting].title), txt(26, { bold: true, color: "#ffdd66" }))
      .setOrigin(0.5, 0).setDepth(1);

    this.add.text(cw / 2, 78, t(DUEL_TEXT[this.setting].subtitle), txt(13, { color: "#aabbcc" }))
      .setOrigin(0.5, 0).setDepth(1);

    // The deck: player's end on the left, enemy's on the right.
    this.groundBar = this.add.graphics().setDepth(1);
    this.playerBlade = this.add.graphics().setDepth(2);
    this.enemyBlade = this.add.graphics().setDepth(2);

    this.add.text(cw / 2 - 260, ch / 2 - 52, t("duel.you"), txt(14, { color: "#88ccff" }))
      .setOrigin(0.5).setDepth(1);
    this.add.text(cw / 2 + 260, ch / 2 - 52, t("duel.foe"), txt(14, { color: "#ff9999" }))
      .setOrigin(0.5).setDepth(1);

    this.playerStaminaBar = this.add.graphics().setDepth(1);
    this.enemyStaminaBar = this.add.graphics().setDepth(1);

    this.narrationText = this.add.text(cw / 2, ch / 2 + 70, t("duel.engage"),
      txt(16, { color: "#eeeeee" })).setOrigin(0.5).setDepth(1);

    this.roundText = this.add.text(cw / 2, ch / 2 + 100, "", txt(12, { color: "#889099" }))
      .setOrigin(0.5).setDepth(1);

    this.add.text(cw / 2, ch - 96, t("duel.controls_attack"), txt(14, { color: "#ffcc88" }))
      .setOrigin(0.5).setDepth(1);
    this.add.text(cw / 2, ch - 68, t("duel.controls_parry"), txt(14, { color: "#88ddcc" }))
      .setOrigin(0.5).setDepth(1);
    this.add.text(cw / 2, ch - 34, t("duel.controls_hint"), txt(12, { color: HINT_ON_DARK }))
      .setOrigin(0.5).setDepth(1);

    const bind: Record<string, DuelAction> = {
      "keydown-Q": "attack_high",
      "keydown-W": "attack_mid",
      "keydown-E": "attack_low",
      "keydown-A": "parry_high",
      "keydown-S": "parry_mid",
      "keydown-D": "parry_low",
    };
    if (this.input.keyboard) {
      for (const [key, action] of Object.entries(bind)) {
        this.input.keyboard.on(key, () => this.play(action));
      }
    }

    this.redraw();
  }

  /** Solid backing so battle-scene text underneath cannot bleed into the duel. */
  private panel(cx: number, cy: number, w: number, h: number): void {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x0d1420, 0.96).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 10);
    g.lineStyle(1, 0x2b3a52, 0.9).strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 10);
  }

  /** One exchange, then redraw. Ignored once the duel is decided. */
  private play(action: DuelAction): void {
    if (this.resolved || this.duel.outcome !== "ongoing") return;

    const exchange = duelStep(this.duel, action, this.lastAction);
    this.duel = exchange.state;
    this.lastAction = action;

    this.narrationText.setText(t(exchange.resultKey));
    this.narrationText.setColor(
      exchange.gainedBy === "player" ? "#88dd88"
      : exchange.gainedBy === "enemy" ? "#dd7777"
      : "#dddddd",
    );

    this.flashBlade(action, exchange.gainedBy);
    this.redraw();

    if (this.duel.outcome !== "ongoing") this.finish();
  }

  /** A short stroke from whichever side won the exchange. */
  private flashBlade(action: DuelAction, gainedBy: "player" | "enemy" | "none"): void {
    const cw = this.cameras.main.width;
    const ch = this.cameras.main.height;
    const lineY = { high: ch / 2 - 26, mid: ch / 2, low: ch / 2 + 26 };
    const y = lineY[action.slice(action.indexOf("_") + 1) as "high" | "mid" | "low"];
    const g = gainedBy === "enemy" ? this.enemyBlade : this.playerBlade;
    const fromX = gainedBy === "enemy" ? cw / 2 + 210 : cw / 2 - 210;
    const toX = gainedBy === "enemy" ? cw / 2 + 90 : cw / 2 - 90;

    g.clear();
    g.lineStyle(3, gainedBy === "enemy" ? 0xff8877 : 0xdde8ff, 0.95);
    g.lineBetween(fromX, y, toX, y);
    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 260,
      onComplete: () => { g.clear(); g.setAlpha(1); },
    });
  }

  private redraw(): void {
    const cw = this.cameras.main.width;
    const ch = this.cameras.main.height;

    // Ground bar: -DUEL_WIN_ADVANTAGE on the left, +DUEL_WIN_ADVANTAGE on the right.
    const W = 460;
    const H = 18;
    const x0 = cw / 2 - W / 2;
    const y0 = ch / 2 - H / 2;
    const frac = (this.duel.advantage + DUEL_WIN_ADVANTAGE) / (DUEL_WIN_ADVANTAGE * 2);

    this.groundBar.clear();
    this.groundBar.fillStyle(0x1a2030, 0.9).fillRect(x0, y0, W, H);
    this.groundBar.fillStyle(0x3a6ea5, 0.85).fillRect(x0, y0, W * frac, H);
    this.groundBar.lineStyle(1, 0x000000, 0.8).strokeRect(x0, y0, W, H);
    // Centre mark, so "level" is readable at a glance.
    this.groundBar.lineStyle(1, 0x66779a, 0.9).lineBetween(cw / 2, y0 - 4, cw / 2, y0 + H + 4);

    this.drawStamina(this.playerStaminaBar, cw / 2 - 290, ch / 2 - 32, this.duel.player.stamina, 0x88ccff);
    this.drawStamina(this.enemyStaminaBar, cw / 2 + 230, ch / 2 - 32, this.duel.enemy.stamina, 0xff9999);

    const tired = this.duel.player.stamina < DUEL_TIRED_THRESHOLD ? "  " + t("duel.winded") : "";
    this.roundText.setText(t("duel.round", { n: this.duel.round }) + tired);
  }

  private drawStamina(g: Phaser.GameObjects.Graphics, x: number, y: number, stamina: number, color: number): void {
    const W = 60;
    const H = 8;
    const frac = Math.max(0, Math.min(1, stamina / DUEL_MAX_STAMINA));
    g.clear();
    g.fillStyle(0x222833, 0.9).fillRect(x, y, W, H);
    g.fillStyle(color, 0.9).fillRect(x, y, W * frac, H);
    g.lineStyle(1, 0x000000, 0.8).strokeRect(x, y, W, H);
  }

  private finish(): void {
    if (this.resolved) return;
    this.resolved = true;

    const won = this.duel.outcome === "player_win";
    const cw = this.cameras.main.width;
    const ch = this.cameras.main.height;

    this.add.text(cw / 2, ch / 2 - 100, won ? t(DUEL_TEXT[this.setting].won) : t("duel.lost"),
      { ...txt(24, { bold: true, color: won ? "#ffdd44" : "#ff8888" }),
        backgroundColor: "#000000cc", padding: { x: 18, y: 10 } })
      .setOrigin(0.5).setDepth(10);

    // Let the last stroke land before handing control back.
    this.time.delayedCall(1200, () => {
      const done = this.onFinish;
      this.scene.stop();
      done?.(won);
    });
  }
}
