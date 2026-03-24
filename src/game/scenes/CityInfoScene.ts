/**
 * City Info Panel — lightweight overlay showing city data.
 * Triggered by clicking a city on the map. Pauses MainMapScene.
 * Dismissed by ESC, clicking outside, or clicking the close button.
 */
import Phaser from "phaser";
import { PORTS, type PortDef } from "../../core/data/ports.ts";
import { FACTIONS } from "../../core/data/factions.ts";
import type { WorldState } from "../../core/model/WorldState.ts";
import { t } from "../../core/i18n/index.ts";
import { txt } from "../ui/textStyle.ts";

export class CityInfoScene extends Phaser.Scene {
  private portKey!: string;
  private portDef!: PortDef;
  private worldState!: WorldState;

  constructor() {
    super({ key: "CityInfoScene" });
  }

  init(data: { portKey: string; worldState: WorldState }): void {
    this.portKey = data.portKey;
    this.portDef = PORTS[this.portKey];
    this.worldState = data.worldState;
  }

  create(): void {
    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    // Semi-transparent backdrop — click to dismiss
    const backdrop = this.add.rectangle(cx, cy, cam.width, cam.height, 0x000000, 0.5);
    backdrop.setInteractive();
    backdrop.on("pointerdown", () => this.closePanel());

    // Panel
    const panelW = Math.min(420, cam.width - 40);
    const panelH = Math.min(380, cam.height - 40);
    const panelX = cx;
    const panelY = cy;

    // Panel background
    this.add.rectangle(panelX, panelY, panelW + 4, panelH + 4, 0x1a1a2e).setDepth(1);
    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x0a0a1a, 0.95).setDepth(2);
    panel.setInteractive(); // prevent click-through to backdrop

    // Border
    const border = this.add.graphics();
    border.setDepth(3);
    border.lineStyle(2, 0xc8a84e, 0.8);
    border.strokeRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH);

    // Content
    const left = panelX - panelW / 2 + 20;
    let y = panelY - panelH / 2 + 20;

    const factionId = this.portDef.factionId as string;
    const factionDef = FACTIONS[factionId];
    const factionName = factionDef?.name ?? factionId;

    // City name (large, gold)
    const cityName = t("port." + this.portKey + ".name");
    this.add.text(panelX, y, cityName, {
      ...txt(22, { bold: true, color: "#c8a84e" }),
    }).setOrigin(0.5, 0).setDepth(5);
    y += 32;

    // Faction + type
    const typeStr = this.portDef.type === "fort" ? "Fort" : this.portDef.type === "outpost" ? "Outpost" : "City";
    this.add.text(panelX, y, `${typeStr} — ${factionName}`, {
      ...txt(14, { color: "#aaaaaa" }),
    }).setOrigin(0.5, 0).setDepth(5);
    y += 24;

    // Separator
    const sepG = this.add.graphics().setDepth(4);
    sepG.lineStyle(1, 0x444444, 0.6);
    sepG.lineBetween(left, y, left + panelW - 40, y);
    y += 12;

    // Info rows
    const addRow = (label: string, value: string, valueColor = "#ffffff") => {
      this.add.text(left, y, label, { ...txt(13, { color: "#888888" }) }).setDepth(5);
      this.add.text(left + panelW - 40, y, value, {
        ...txt(13, { color: valueColor }),
      }).setOrigin(1, 0).setDepth(5);
      y += 22;
    };

    // Population
    const popLabels: Record<string, string> = { small: "Small", medium: "Medium", large: "Large", capital: "Capital" };
    addRow("Population", popLabels[this.portDef.population] ?? this.portDef.population);

    // Wealth
    const wealthColors: Record<string, string> = { poor: "#aa6666", modest: "#aaaaaa", prosperous: "#88bb88", wealthy: "#ccaa44" };
    const wealthLabels: Record<string, string> = { poor: "Poor", modest: "Modest", prosperous: "Prosperous", wealthy: "Wealthy" };
    addRow("Wealth", wealthLabels[this.portDef.wealth] ?? this.portDef.wealth, wealthColors[this.portDef.wealth] ?? "#ffffff");

    // Market level
    addRow("Market", "★".repeat(this.portDef.marketLevel) + "☆".repeat(5 - this.portDef.marketLevel), "#ccaa44");

    // Shipyard level
    addRow("Shipyard", "★".repeat(this.portDef.shipyardLevel) + "☆".repeat(4 - this.portDef.shipyardLevel), "#6688cc");

    y += 6;
    sepG.lineBetween(left, y, left + panelW - 40, y);
    y += 12;

    // Produces
    if (this.portDef.produces.length > 0) {
      const items = this.portDef.produces.map(id => t("item." + id + ".name")).join(", ");
      this.add.text(left, y, "Exports", { ...txt(13, { color: "#888888" }) }).setDepth(5);
      y += 20;
      this.add.text(left + 10, y, items, { ...txt(12, { color: "#88cc88" }) }).setDepth(5);
      y += 22;
    }

    // Demands
    if (this.portDef.demands.length > 0) {
      const items = this.portDef.demands.map(id => t("item." + id + ".name")).join(", ");
      this.add.text(left, y, "Imports", { ...txt(13, { color: "#888888" }) }).setDepth(5);
      y += 20;
      this.add.text(left + 10, y, items, { ...txt(12, { color: "#cc8888" }) }).setDepth(5);
      y += 22;
    }

    // Player reputation with this faction
    y += 6;
    sepG.lineBetween(left, y, left + panelW - 40, y);
    y += 12;
    const rep = this.worldState.player.reputation?.[factionId] ?? 0;
    const repLabel = rep > 50 ? "Allied" : rep > 20 ? "Friendly" : rep > -20 ? "Neutral" : rep > -50 ? "Hostile" : "At War";
    const repColor = rep > 50 ? "#44cc44" : rep > 20 ? "#88cc88" : rep > -20 ? "#cccccc" : rep > -50 ? "#cc8844" : "#cc4444";
    addRow("Your Reputation", `${repLabel} (${rep})`, repColor);

    // Close hint
    this.add.text(panelX, panelY + panelH / 2 - 16, "ESC or click outside to close", {
      ...txt(10, { color: "#666666" }),
    }).setOrigin(0.5, 1).setDepth(5);

    // ESC to close
    this.input.keyboard?.on("keydown-ESC", () => this.closePanel());

    // Resize handler
    this.scale.on("resize", () => {
      this.closePanel();
    });
  }

  private closePanel(): void {
    this.scene.resume("MainMapScene");
    this.scene.stop();
  }
}
