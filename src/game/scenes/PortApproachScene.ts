import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import type { PortId } from "../../core/model/ids.ts";
import type { PortDef } from "../../core/data/ports.ts";
import { PORTS } from "../../core/data/ports.ts";
import { FACTIONS } from "../../core/data/factions.ts";
import { getReputationLevel } from "../../core/systems/ReputationSystem.ts";
import { generateAvailableCrew } from "../../core/systems/PortInteractionSystem.ts";
import { t } from "../../core/i18n/index.ts";
import { txt } from "../ui/textStyle.ts";

type PortAction = "enter" | "sneak" | "attack" | "leave";

// Dialog dimensions
const DLG_W = 380;
const DLG_H = 340;
const BORDER = 3;
const PAD = 14;

export class PortApproachScene extends Phaser.Scene {
  private worldState!: WorldState;
  private portId!: PortId;
  private portDef!: PortDef;
  private actions: { label: string; action: PortAction }[] = [];
  private selectedIndex = 0;
  private actionTexts: Phaser.GameObjects.Text[] = [];
  private selectionBar!: Phaser.GameObjects.Rectangle;
  private arrow!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "PortApproachScene" });
  }

  init(data: { worldState: WorldState; portId: PortId }): void {
    this.worldState = data.worldState;
    this.portId = data.portId;
    this.portDef = PORTS[this.portId as string];
  }

  create(): void {
    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    // --- Dark overlay behind dialog ---
    this.add.rectangle(cx, cy, cam.width, cam.height, 0x000000, 0.55);

    // --- White dialog frame with dark border ---
    const dlgX = cx - DLG_W / 2;
    const dlgY = cy - DLG_H / 2;

    // Outer border (dark)
    this.add.rectangle(cx, cy, DLG_W + BORDER * 2, DLG_H + BORDER * 2, 0x222222);
    // Inner white fill
    this.add.rectangle(cx, cy, DLG_W, DLG_H, 0xffffff);

    // --- Port info ---
    const portKey = this.portId as string;
    const faction = FACTIONS[this.portDef.factionId as string];
    const factionColor = faction?.color ?? 0xaaaaaa;
    const playerRep = this.worldState.player.reputation[this.portDef.factionId as string] ?? 0;
    const repLevel = getReputationLevel(playerRep);
    const isHostile = repLevel === "hostile";
    const isFort = this.portDef.type === "fort";

    let y = dlgY + PAD;

    // --- City thumbnail / harbor illustration ---
    const thumbH = 65;
    const thumbW = DLG_W - PAD * 2;
    const thumbX = dlgX + PAD;
    const thumbY = y;
    this.drawCityThumbnail(thumbX, thumbY, thumbW, thumbH, factionColor);
    y += thumbH + 12;

    // --- City name (large, bold, centered) ---
    const nameText = this.add.text(cx, y, t("port." + portKey + ".name"), txt(22, { bold: true }));
    nameText.setOrigin(0.5, 0);
    y += 28;

    // --- Faction & type line ---
    const factionHex = `#${factionColor.toString(16).padStart(6, "0")}`;
    const typeLine = `${t("port_type." + this.portDef.type)} — ${t("faction." + (this.portDef.factionId as string) + ".name")}`;
    const typeText = this.add.text(cx, y, typeLine, txt(13, { color: factionHex }));
    typeText.setOrigin(0.5, 0);
    y += 20;

    // --- Population & Wealth ---
    const infoX = dlgX + PAD + 8;
    const popLabel = t("city.pop_" + this.portDef.population);
    this.add.text(infoX, y, t("approach.population", { size: popLabel }), txt(12));
    y += 16;

    const wealthLabel = t("city.wealth_" + this.portDef.wealth);
    this.add.text(infoX, y, t("approach.wealth", { level: wealthLabel }), txt(12));
    y += 16;

    // --- Exports ---
    if (this.portDef.produces.length > 0) {
      const exportNames = this.portDef.produces.map((id) => t("item." + id + ".name")).join(", ");
      this.add.text(infoX, y, t("approach.exports", { items: exportNames }), txt(12));
      y += 16;
    }

    // --- Reputation ---
    const repColor = isHostile ? "#cc0000" : "#333333";
    this.add.text(infoX, y, t("approach.reputation", { level: t("rep." + repLevel), value: playerRep }),
      txt(12, { color: repColor }));
    y += 22;

    // --- Horizontal divider ---
    const divG = this.add.graphics();
    divG.lineStyle(1, 0x999999, 1);
    divG.lineBetween(dlgX + PAD, y, dlgX + DLG_W - PAD, y);
    y += 12;

    // --- Build action list ---
    this.actions = [];
    if (isHostile) {
      if (isFort) {
        this.actions.push({ label: t("approach.sneak"), action: "sneak" });
        this.actions.push({ label: t("approach.attack"), action: "attack" });
      } else {
        this.actions.push({ label: t("approach.sneak"), action: "sneak" });
      }
    } else {
      this.actions.push({ label: t("approach.enter"), action: "enter" });
    }
    this.actions.push({ label: t("approach.leave"), action: "leave" });

    // --- Selection highlight bar (behind selected action) ---
    const barW = DLG_W - PAD * 2;
    const barH = 22;
    this.selectionBar = this.add.rectangle(cx, y + barH / 2, barW, barH, 0x222244, 0.15);

    // --- Arrow indicator ---
    this.arrow = this.add.text(0, 0, "\u25B6", txt(12, { bold: true }));

    // --- Render action items ---
    this.actionTexts = [];
    this.selectedIndex = 0;
    const actionStartY = y;

    for (let i = 0; i < this.actions.length; i++) {
      const act = this.actions[i];
      const actionText = this.add.text(infoX + 18, actionStartY + i * 26, act.label,
        txt(14, { bold: true }));
      actionText.setInteractive({ useHandCursor: true });
      actionText.on("pointerover", () => {
        this.selectedIndex = i;
        this.updateSelection();
      });
      actionText.on("pointerdown", () => {
        this.executeAction(act.action);
      });
      this.actionTexts.push(actionText);
    }

    this.updateSelection();

    // --- Keyboard hint at bottom ---
    const hintY = dlgY + DLG_H - PAD - 4;
    const hint = this.add.text(cx, hintY, "W/S \u2014 Select   Enter \u2014 Confirm   Esc \u2014 Leave",
      txt(10, { color: "#888888" }));
    hint.setOrigin(0.5, 1);

    // --- Keyboard navigation ---
    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-W", () => this.moveSelection(-1));
      this.input.keyboard.on("keydown-UP", () => this.moveSelection(-1));
      this.input.keyboard.on("keydown-S", () => this.moveSelection(1));
      this.input.keyboard.on("keydown-DOWN", () => this.moveSelection(1));
      this.input.keyboard.on("keydown-ENTER", () => {
        const action = this.actions[this.selectedIndex]?.action;
        if (action) this.executeAction(action);
      });
      this.input.keyboard.on("keydown-E", () => {
        const action = this.actions[this.selectedIndex]?.action;
        if (action) this.executeAction(action);
      });
      this.input.keyboard.on("keydown-ESC", () => this.executeAction("leave"));
    }
  }

  /** Draw a simple pixel-art-style harbor thumbnail at the top of the dialog. */
  private drawCityThumbnail(
    x: number, y: number, w: number, h: number, factionColor: number,
  ): void {
    const g = this.add.graphics();
    const cx = x + w / 2;

    // Sky gradient (light blue → pale)
    g.fillStyle(0xaaccee, 1);
    g.fillRect(x, y, w, h * 0.55);
    g.fillStyle(0xccddee, 1);
    g.fillRect(x, y + h * 0.35, w, h * 0.2);

    // Sea (darker blue strip at bottom)
    g.fillStyle(0x4488bb, 1);
    g.fillRect(x, y + h * 0.55, w, h * 0.45);

    // Lighter wave highlights
    g.fillStyle(0x66aadd, 0.5);
    for (let wx = x + 10; wx < x + w - 20; wx += 30) {
      g.fillRect(wx, y + h * 0.65, 18, 2);
      g.fillRect(wx + 8, y + h * 0.78, 14, 2);
    }

    // Shore line (sand)
    g.fillStyle(0xd4b96a, 1);
    g.fillRect(x, y + h * 0.52, w, h * 0.06);

    if (this.portDef.type === "fort") {
      // Fort: stone walls with crenellations
      g.fillStyle(0x777777, 1);
      g.fillRect(cx - 35, y + h * 0.2, 70, h * 0.35);
      g.fillStyle(0x888888, 1);
      // Crenellations
      for (let i = -32; i <= 30; i += 8) {
        g.fillRect(cx + i, y + h * 0.15, 5, 5);
      }
      // Towers
      g.fillStyle(0x666666, 1);
      g.fillRect(cx - 38, y + h * 0.12, 10, h * 0.43);
      g.fillRect(cx + 28, y + h * 0.12, 10, h * 0.43);
      // Gate
      g.fillStyle(0x443322, 1);
      g.fillRect(cx - 5, y + h * 0.35, 10, h * 0.2);
      // Flag
      g.lineStyle(1, 0xcccccc, 1);
      g.lineBetween(cx, y + h * 0.12, cx, y + 4);
      g.fillStyle(factionColor, 1);
      g.fillTriangle(cx, y + 4, cx + 12, y + 8, cx, y + 12);
    } else if (this.portDef.type === "city") {
      // City: cluster of buildings with church spire
      // Left building
      g.fillStyle(0xc9a855, 1);
      g.fillRect(cx - 50, y + h * 0.25, 22, h * 0.3);
      g.fillStyle(0x8b4513, 1);
      g.fillTriangle(cx - 52, y + h * 0.25, cx - 26, y + h * 0.25, cx - 39, y + h * 0.15);
      // Center building (taller)
      g.fillStyle(0xb89845, 1);
      g.fillRect(cx - 18, y + h * 0.15, 26, h * 0.4);
      g.fillStyle(0x8b4513, 1);
      g.fillTriangle(cx - 20, y + h * 0.15, cx + 10, y + h * 0.15, cx - 5, y + h * 0.05);
      // Right building
      g.fillStyle(0xc9a855, 1);
      g.fillRect(cx + 16, y + h * 0.28, 24, h * 0.27);
      g.fillStyle(0x8b4513, 1);
      g.fillTriangle(cx + 14, y + h * 0.28, cx + 42, y + h * 0.28, cx + 28, y + h * 0.18);
      // Church spire
      g.fillStyle(0xd4b96a, 1);
      g.fillRect(cx - 3, y + 2, 6, h * 0.15);
      g.fillTriangle(cx - 5, y + 2, cx + 5, y + 2, cx, y - 2);
      // Windows
      g.fillStyle(0xffdd44, 0.8);
      g.fillRect(cx - 42, y + h * 0.33, 3, 3);
      g.fillRect(cx - 10, y + h * 0.25, 3, 3);
      g.fillRect(cx - 4, y + h * 0.25, 3, 3);
      g.fillRect(cx + 24, y + h * 0.35, 3, 3);
      g.fillRect(cx + 30, y + h * 0.35, 3, 3);
      // Flag
      g.lineStyle(1, 0xcccccc, 1);
      g.lineBetween(cx + 38, y + h * 0.28, cx + 38, y + h * 0.1);
      g.fillStyle(factionColor, 1);
      g.fillTriangle(cx + 38, y + h * 0.1, cx + 50, y + h * 0.14, cx + 38, y + h * 0.18);
    } else {
      // Outpost: huts with palm trees
      // Palm tree left
      g.lineStyle(2, 0x8b6b40, 1);
      g.lineBetween(cx - 40, y + h * 0.52, cx - 38, y + h * 0.15);
      g.fillStyle(0x337733, 1);
      g.fillTriangle(cx - 50, y + h * 0.18, cx - 26, y + h * 0.18, cx - 38, y + h * 0.08);
      g.fillTriangle(cx - 52, y + h * 0.22, cx - 38, y + h * 0.12, cx - 46, y + h * 0.12);
      // Hut
      g.fillStyle(0x8b7355, 1);
      g.fillRect(cx - 14, y + h * 0.35, 20, h * 0.2);
      g.fillStyle(0x556633, 1);
      g.fillTriangle(cx - 18, y + h * 0.35, cx + 10, y + h * 0.35, cx - 4, y + h * 0.2);
      // Second hut
      g.fillStyle(0x8b7355, 1);
      g.fillRect(cx + 16, y + h * 0.38, 16, h * 0.17);
      g.fillStyle(0x556633, 1);
      g.fillTriangle(cx + 12, y + h * 0.38, cx + 36, y + h * 0.38, cx + 24, y + h * 0.25);
      // Palm tree right
      g.lineStyle(2, 0x8b6b40, 1);
      g.lineBetween(cx + 42, y + h * 0.52, cx + 44, y + h * 0.2);
      g.fillStyle(0x337733, 1);
      g.fillTriangle(cx + 34, y + h * 0.22, cx + 54, y + h * 0.22, cx + 44, y + h * 0.12);
      // Dock
      g.fillStyle(0x8b6b40, 0.8);
      g.fillRect(cx - 2, y + h * 0.52, 4, h * 0.18);
      g.fillRect(cx - 10, y + h * 0.68, 20, 3);
      // Small flag
      g.lineStyle(1, 0xaaaaaa, 1);
      g.lineBetween(cx - 10, y + h * 0.38, cx - 10, y + h * 0.2);
      g.fillStyle(factionColor, 1);
      g.fillTriangle(cx - 10, y + h * 0.2, cx - 2, y + h * 0.24, cx - 10, y + h * 0.28);
    }

    // Border around thumbnail
    g.lineStyle(1, 0x888888, 1);
    g.strokeRect(x, y, w, h);
  }

  private moveSelection(delta: number): void {
    this.selectedIndex = Math.max(0, Math.min(this.actions.length - 1, this.selectedIndex + delta));
    this.updateSelection();
  }

  private updateSelection(): void {
    for (let i = 0; i < this.actionTexts.length; i++) {
      const txt = this.actionTexts[i];
      if (i === this.selectedIndex) {
        txt.setColor("#000000");
        txt.setFontStyle("bold");
      } else {
        txt.setColor("#555555");
        txt.setFontStyle("");
      }
    }

    // Move selection bar and arrow
    if (this.actionTexts[this.selectedIndex]) {
      const sel = this.actionTexts[this.selectedIndex];
      this.selectionBar.setPosition(this.selectionBar.x, sel.y + 11);
      this.arrow.setPosition(sel.x - 16, sel.y + 1);
    }
  }

  private executeAction(action: PortAction): void {
    switch (action) {
      case "enter": {
        const enterWorld = generateAvailableCrew(this.worldState, this.portId);
        this.scene.stop();
        this.scene.stop("MainMapScene");
        this.scene.start("PortScene", {
          worldState: enterWorld,
          portId: this.portId,
        });
        break;
      }

      case "sneak": {
        const playerEntity = this.worldState.entities[this.worldState.player.shipId as string];
        const morale = playerEntity?.ship?.crew.morale ?? 0.5;
        const notoriety = this.worldState.player.notoriety;
        const chance = 0.5 + morale * 0.3 - notoriety * 0.005;
        const roll = Math.random();

        if (roll < chance) {
          const sneakWorld = generateAvailableCrew(this.worldState, this.portId);
          this.scene.stop();
          this.scene.stop("MainMapScene");
          this.scene.start("PortScene", {
            worldState: sneakWorld,
            portId: this.portId,
          });
        } else {
          this.scene.stop();
          this.scene.stop("MainMapScene");
          this.scene.start("SeaBattleScene", {
            worldState: this.worldState,
            enemyId: this.portId,
          });
        }
        break;
      }

      case "attack":
        this.scene.stop();
        this.scene.stop("MainMapScene");
        this.scene.start("SeaBattleScene", {
          worldState: this.worldState,
          enemyId: this.portId,
        });
        break;

      case "leave":
        this.scene.stop();
        this.scene.resume("MainMapScene");
        break;
    }
  }
}
