/**
 * Ship Encounter Scene — triggered when player approaches an NPC ship.
 * Shows ship info (class, faction, flag) and actions: News, Attack, Sail Away.
 * Modeled after Sid Meier's Pirates! encounter system.
 */
import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import type { EntityState } from "../../core/model/EntityState.ts";
import { SHIP_CLASSES } from "../../core/data/ships.ts";
import { FACTIONS } from "../../core/data/factions.ts";
import { t } from "../../core/i18n/index.ts";
import { txt } from "../ui/textStyle.ts";
import { addLogEntry } from "../../core/systems/EventLogSystem.ts";

type EncounterAction = "news" | "attack" | "leave";

const DLG_W = 380;
const DLG_H = 300;
const PAD = 14;

export class ShipEncounterScene extends Phaser.Scene {
  private worldState!: WorldState;
  private npcEntity!: EntityState;
  private actions: { label: string; action: EncounterAction; disabled?: boolean }[] = [];
  private selectedIndex = 0;
  private actionTexts: Phaser.GameObjects.Text[] = [];
  private selectionBar!: Phaser.GameObjects.Rectangle;
  private arrow!: Phaser.GameObjects.Text;
  private showingNews = false;

  constructor() {
    super({ key: "ShipEncounterScene" });
  }

  init(data: { worldState: WorldState; npcEntityId: string }): void {
    this.worldState = data.worldState;
    this.npcEntity = data.worldState.entities[data.npcEntityId];
    this.showingNews = false;
  }

  create(): void {
    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    if (!this.npcEntity?.ship || !this.npcEntity.ai) {
      this.executeAction("leave");
      return;
    }

    const shipClass = SHIP_CLASSES[this.npcEntity.ship.classId as string];
    const faction = FACTIONS[this.npcEntity.ship.factionId as string];
    const behavior = this.npcEntity.ai.behavior;
    const factionColor = faction?.color ?? 0xaaaaaa;
    const factionHex = `#${factionColor.toString(16).padStart(6, "0")}`;
    const isFriendly = behavior === "trader" || behavior === "navy" || behavior === "escort";

    // Dark overlay
    this.add.rectangle(cx, cy, cam.width, cam.height, 0x000000, 0.55);

    // Dialog
    const dlgX = cx - DLG_W / 2;
    const dlgY = cy - DLG_H / 2;
    this.add.rectangle(cx, cy, DLG_W + 6, DLG_H + 6, 0x222222);
    this.add.rectangle(cx, cy, DLG_W, DLG_H, 0xffffff);

    let y = dlgY + PAD;

    // Ship thumbnail
    const thumbH = 55;
    this.drawShipThumbnail(dlgX + PAD, y, DLG_W - PAD * 2, thumbH, factionColor);
    y += thumbH + 10;

    // Ship class name
    const shipName = shipClass?.name ?? "Unknown Ship";
    this.add.text(cx, y, shipName, txt(20, { bold: true })).setOrigin(0.5, 0);
    y += 26;

    // Faction & behavior
    const factionName = t("faction." + (this.npcEntity.ship.factionId as string) + ".name");
    const behaviorName = t("encounter.behavior_" + behavior);
    this.add.text(cx, y, `${behaviorName} — ${factionName}`, txt(13, { color: factionHex })).setOrigin(0.5, 0);
    y += 20;

    // Ship stats line
    const cannons = this.npcEntity.ship.cannons;
    const crew = this.npcEntity.ship.crew.current;
    const hull = Math.round((this.npcEntity.ship.hullHp / this.npcEntity.ship.hullMax) * 100);
    this.add.text(cx, y, `${t("encounter.cannons")}: ${cannons}   ${t("encounter.crew")}: ${crew}   ${t("encounter.hull")}: ${hull}%`,
      txt(11, { color: "#666666" })).setOrigin(0.5, 0);
    y += 18;

    // Divider
    const divG = this.add.graphics();
    divG.lineStyle(1, 0x999999, 1);
    divG.lineBetween(dlgX + PAD, y, dlgX + DLG_W - PAD, y);
    y += 12;

    // Actions
    this.actions = [];
    if (isFriendly) {
      const hasNews = (this.npcEntity.ai.news?.length ?? 0) > 0;
      this.actions.push({
        label: hasNews ? t("encounter.ask_news") : t("encounter.no_news"),
        action: "news",
        disabled: !hasNews,
      });
    }
    this.actions.push({
      label: t("encounter.attack"),
      action: "attack",
    });
    this.actions.push({
      label: t("encounter.sail_away"),
      action: "leave",
    });

    // Selection bar
    const barW = DLG_W - PAD * 2;
    this.selectionBar = this.add.rectangle(cx, y + 11, barW, 22, 0x222244, 0.15);
    this.arrow = this.add.text(0, 0, "\u25B6", txt(12, { bold: true }));

    const infoX = dlgX + PAD + 18;
    this.actionTexts = [];
    this.selectedIndex = 0;

    for (let i = 0; i < this.actions.length; i++) {
      const act = this.actions[i];
      const color = act.disabled ? "#bbbbbb" : "#1a1a1a";
      const label = act.disabled && act.action === "attack"
        ? `${act.label} (${t("encounter.not_available")})`
        : act.label;
      const actionText = this.add.text(infoX, y, label, txt(14, { bold: !act.disabled, color }));

      if (!act.disabled) {
        actionText.setInteractive({ useHandCursor: true });
        actionText.on("pointerover", () => { this.selectedIndex = i; this.updateSelection(); });
        actionText.on("pointerdown", () => this.executeAction(act.action));
      }
      this.actionTexts.push(actionText);
      y += 26;
    }

    this.updateSelection();

    // Hint
    this.add.text(cx, dlgY + DLG_H - PAD - 4,
      "W/S — Select   Enter — Confirm   Esc — Sail Away",
      txt(10, { color: "#888888" })).setOrigin(0.5, 1);

    // Keyboard
    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-W", () => this.moveSelection(-1));
      this.input.keyboard.on("keydown-UP", () => this.moveSelection(-1));
      this.input.keyboard.on("keydown-S", () => this.moveSelection(1));
      this.input.keyboard.on("keydown-DOWN", () => this.moveSelection(1));
      this.input.keyboard.on("keydown-ENTER", () => {
        const act = this.actions[this.selectedIndex];
        if (act && !act.disabled) this.executeAction(act.action);
      });
      this.input.keyboard.on("keydown-E", () => {
        const act = this.actions[this.selectedIndex];
        if (act && !act.disabled) this.executeAction(act.action);
      });
      this.input.keyboard.on("keydown-ESC", () => this.executeAction("leave"));
    }
  }

  private drawShipThumbnail(x: number, y: number, w: number, h: number, factionColor: number): void {
    const g = this.add.graphics();
    const cx = x + w / 2;

    // Sea
    g.fillStyle(0x1a4a6a, 1);
    g.fillRect(x, y, w, h);

    // Waves
    g.fillStyle(0x2a6a9a, 0.5);
    for (let wx = x + 8; wx < x + w - 15; wx += 25) {
      g.fillRect(wx, y + h * 0.65, 15, 2);
      g.fillRect(wx + 6, y + h * 0.8, 12, 2);
    }

    // Ship hull
    g.fillStyle(0x8b6b40, 1);
    g.fillRect(cx - 30, y + h * 0.35, 60, h * 0.25);
    // Bow
    g.fillTriangle(cx + 30, y + h * 0.35, cx + 45, y + h * 0.45, cx + 30, y + h * 0.6);
    // Stern
    g.fillStyle(0x7a5a30, 1);
    g.fillRect(cx - 32, y + h * 0.3, 5, h * 0.35);

    // Mast
    g.lineStyle(2, 0x6b5530, 1);
    g.lineBetween(cx - 10, y + h * 0.35, cx - 10, y + h * 0.05);
    g.lineBetween(cx + 10, y + h * 0.35, cx + 10, y + h * 0.1);

    // Sails
    g.fillStyle(0xeeeecc, 0.9);
    g.fillRect(cx - 22, y + h * 0.08, 24, h * 0.25);
    g.fillRect(cx, y + h * 0.12, 20, h * 0.2);

    // Flag
    g.fillStyle(factionColor, 1);
    g.fillTriangle(cx - 10, y + h * 0.05, cx - 10, y + h * 0.15, cx - 22, y + h * 0.1);

    // Border
    g.lineStyle(1, 0x888888, 1);
    g.strokeRect(x, y, w, h);
  }

  private moveSelection(delta: number): void {
    let next = this.selectedIndex + delta;
    // Skip disabled items
    while (next >= 0 && next < this.actions.length && this.actions[next].disabled) {
      next += delta;
    }
    if (next >= 0 && next < this.actions.length) {
      this.selectedIndex = next;
      this.updateSelection();
    }
  }

  private updateSelection(): void {
    for (let i = 0; i < this.actionTexts.length; i++) {
      const t = this.actionTexts[i];
      const act = this.actions[i];
      if (act.disabled) continue;
      if (i === this.selectedIndex) {
        t.setColor("#000000");
        t.setFontStyle("bold");
      } else {
        t.setColor("#555555");
        t.setFontStyle("");
      }
    }
    if (this.actionTexts[this.selectedIndex]) {
      const sel = this.actionTexts[this.selectedIndex];
      this.selectionBar.setPosition(this.selectionBar.x, sel.y + 11);
      this.arrow.setPosition(sel.x - 16, sel.y + 1);
    }
  }

  private executeAction(action: EncounterAction): void {
    switch (action) {
      case "news":
        if (!this.showingNews) {
          this.showingNews = true;
          this.showNewsScreen();
        }
        break;
      case "attack":
        // Launch sea battle scene with the current encountered NPC
        this.scene.stop();
        this.scene.start("SeaBattleScene", {
          worldState: this.worldState,
          enemyId: this.npcEntity.id,
        });
        break;
      case "leave":
        this.scene.stop();
        this.scene.resume("MainMapScene");
        break;
    }
  }

  private showNewsScreen(): void {
    const news = this.npcEntity.ai?.news ?? [];
    if (news.length === 0) return;

    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    // Clear and rebuild
    this.children.removeAll(true);

    // Dark overlay
    this.add.rectangle(cx, cy, cam.width, cam.height, 0x000000, 0.55);

    // Dialog
    const newsH = Math.min(350, 100 + news.length * 30);
    const dlgY = cy - newsH / 2;
    this.add.rectangle(cx, cy, DLG_W + 6, newsH + 6, 0x222222);
    this.add.rectangle(cx, cy, DLG_W, newsH, 0xffffff);

    let y = dlgY + PAD;

    // Title
    this.add.text(cx, y, t("encounter.news_title"), txt(16, { bold: true })).setOrigin(0.5, 0);
    y += 28;

    // News items
    const knownIds = new Set(this.worldState.knownEventIds ?? []);
    for (const item of news.slice(0, 5)) {
      const headline = t(item.headline, item.vars as Record<string, string>);
      this.add.text(cx - DLG_W / 2 + PAD + 8, y, `• ${headline}`, {
        ...txt(12, { color: "#333333" }),
        wordWrap: { width: DLG_W - PAD * 2 - 16 },
      });
      y += 26;

      // Mark as known + log
      if (!knownIds.has(item.eventId)) {
        knownIds.add(item.eventId);
        this.worldState = addLogEntry(this.worldState, item.headline, item.vars);
      }
    }

    // Update known IDs
    this.worldState = { ...this.worldState, knownEventIds: [...knownIds] };
    this.registry.set("worldState", this.worldState);

    y += 10;

    // OK button
    const okBtn = this.add.text(cx, y, t("encounter.ok"), txt(14, { bold: true }));
    okBtn.setOrigin(0.5, 0);
    okBtn.setInteractive({ useHandCursor: true });
    okBtn.on("pointerdown", () => {
      this.scene.stop();
      this.scene.resume("MainMapScene");
    });

    // Hint
    this.add.text(cx, dlgY + newsH - PAD - 4,
      "Enter / Esc — OK",
      txt(10, { color: "#888888" })).setOrigin(0.5, 1);

    // Keyboard
    if (this.input.keyboard) {
      this.input.keyboard.removeAllListeners();
      this.input.keyboard.on("keydown-ENTER", () => {
        this.scene.stop();
        this.scene.resume("MainMapScene");
      });
      this.input.keyboard.on("keydown-ESC", () => {
        this.scene.stop();
        this.scene.resume("MainMapScene");
      });
    }
  }
}
