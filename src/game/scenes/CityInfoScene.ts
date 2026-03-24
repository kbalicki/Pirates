/**
 * City Info Panel — lightweight overlay showing city data.
 * Triggered by clicking a city on the map. Pauses MainMapScene.
 * All labels use i18n system — no hardcoded language strings.
 */
import Phaser from "phaser";
import { PORTS, type PortDef } from "../../core/data/ports.ts";
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

    // Backdrop — click to dismiss
    const backdrop = this.add.rectangle(cx, cy, cam.width, cam.height, 0x000000, 0.5);
    backdrop.setInteractive();
    backdrop.on("pointerdown", () => this.closePanel());

    // Panel sizing
    const panelW = Math.min(380, cam.width - 40);
    const panelH = Math.min(400, cam.height - 40);

    this.add.rectangle(cx, cy, panelW + 4, panelH + 4, 0x1a1a2e).setDepth(1);
    const panel = this.add.rectangle(cx, cy, panelW, panelH, 0x0a0a1a, 0.95).setDepth(2);
    panel.setInteractive();

    const border = this.add.graphics().setDepth(3);
    border.lineStyle(2, 0xc8a84e, 0.8);
    border.strokeRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH);

    const left = cx - panelW / 2 + 20;
    const right = cx + panelW / 2 - 20;
    let y = cy - panelH / 2 + 20;
    const sepG = this.add.graphics().setDepth(4);

    const drawSep = () => { sepG.lineStyle(1, 0x444444, 0.6); sepG.lineBetween(left, y, right, y); y += 10; };
    const addRow = (label: string, value: string, valueColor = "#ffffff") => {
      this.add.text(left, y, label, { ...txt(13, { color: "#888888" }) }).setDepth(5);
      this.add.text(right, y, value, { ...txt(13, { color: valueColor }) }).setOrigin(1, 0).setDepth(5);
      y += 22;
    };

    const factionId = this.portDef.factionId as string;
    const factionName = t("faction." + factionId + ".name");

    // ── City name ──
    this.add.text(cx, y, t("port." + this.portKey + ".name"), {
      ...txt(22, { bold: true, color: "#c8a84e" }),
    }).setOrigin(0.5, 0).setDepth(5);
    y += 30;

    // Faction name
    this.add.text(cx, y, factionName, {
      ...txt(14, { color: "#aaaaaa" }),
    }).setOrigin(0.5, 0).setDepth(5);
    y += 24;

    drawSep();

    // ── Basic info ──
    addRow(t("approach.population", { size: "" }).replace(/[: ]+$/, ""),
      t("city.pop_" + this.portDef.population));

    const wealthColors: Record<string, string> = { poor: "#aa6666", modest: "#aaaaaa", prosperous: "#88bb88", wealthy: "#ccaa44" };
    addRow(t("approach.wealth", { level: "" }).replace(/[: ]+$/, ""),
      t("city.wealth_" + this.portDef.wealth), wealthColors[this.portDef.wealth] ?? "#ffffff");

    // Fort info
    if (this.portDef.type === "fort") {
      addRow(t("cityinfo.type") ?? "Typ", t("cityinfo.fort") ?? "Fort obronny", "#cc8844");
    }

    // Shipyard — what can be built
    const shipyardLabels = [
      t("cityinfo.shipyard_1") ?? "Slupy",
      t("cityinfo.shipyard_2") ?? "Brygantyny",
      t("cityinfo.shipyard_3") ?? "Fregaty",
      t("cityinfo.shipyard_4") ?? "Galeony",
    ];
    const slIdx = Math.min(this.portDef.shipyardLevel, 4) - 1;
    addRow(t("cityinfo.shipyard") ?? "Stocznia",
      shipyardLabels[slIdx] ?? "—", "#6688cc");

    y += 4;
    drawSep();

    // ── Trade ──
    if (this.portDef.produces.length > 0) {
      const items = this.portDef.produces.map(id => t("item." + id + ".name")).join(", ");
      this.add.text(left, y, t("cityinfo.exports") ?? "Eksport", {
        ...txt(13, { color: "#888888" }),
      }).setDepth(5);
      y += 20;
      this.add.text(left + 10, y, items, { ...txt(12, { color: "#88cc88" }) }).setDepth(5);
      y += 22;
    }

    if (this.portDef.demands.length > 0) {
      const items = this.portDef.demands.map(id => t("item." + id + ".name")).join(", ");
      this.add.text(left, y, t("cityinfo.imports") ?? "Import", {
        ...txt(13, { color: "#888888" }),
      }).setDepth(5);
      y += 20;
      this.add.text(left + 10, y, items, { ...txt(12, { color: "#cc8888" }) }).setDepth(5);
      y += 22;
    }

    y += 4;
    drawSep();

    // ── Reputation ──
    const rep = this.worldState.player.reputation?.[factionId] ?? 0;
    const repLevel = rep > 50 ? "allied" : rep > 20 ? "friendly" : rep > -20 ? "neutral" : rep > -50 ? "unfriendly" : "hostile";
    const repColor = rep > 50 ? "#44cc44" : rep > 20 ? "#88cc88" : rep > -20 ? "#cccccc" : rep > -50 ? "#cc8844" : "#cc4444";
    addRow(t("cityinfo.reputation") ?? "Reputacja",
      `${t("rep." + repLevel)} (${rep})`, repColor);

    // ── Last visit ──
    const lastVisit = (this.worldState as Record<string, unknown>).portVisits as Record<string, number> | undefined;
    const visitDay = lastVisit?.[this.portKey];
    const visitText = visitDay ? `${t("cityinfo.day") ?? "Dzień"} ${visitDay}` : t("cityinfo.never_visited") ?? "Nigdy";
    addRow(t("cityinfo.last_visit") ?? "Ostatnia wizyta", visitText, "#888888");

    // ── Close hint ──
    this.add.text(cx, cy + panelH / 2 - 16, "ESC", {
      ...txt(10, { color: "#555555" }),
    }).setOrigin(0.5, 1).setDepth(5);

    this.input.keyboard?.on("keydown-ESC", () => this.closePanel());
    this.scale.on("resize", () => this.closePanel());
  }

  private closePanel(): void {
    this.scene.resume("MainMapScene");
    this.scene.stop();
  }
}
