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
import { getPortBaseline } from "../../core/data/economyBaselines.ts";
import { portFaction } from "../../core/systems/SiegeSystem.ts";
import { blockadeDays, blockadeEffective, BLOCKADE_ONSET_DAYS } from "../../core/systems/BlockadeSystem.ts";
import { routeSupplying, laneThroughput } from "../../core/systems/TradeRouteSystem.ts";

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
    // 400 was enough while the imports were one comma-separated line; naming a
    // supplier per good (v0.22.0) pushed reputation and last-visit out of the
    // frame.
    const panelH = Math.min(470, cam.height - 40);

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

    const factionId = portFaction(this.worldState, this.portKey) as string;
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

    // ── Living-world state (numeric, updates daily) ──
    const runtime = this.worldState.ports[this.portKey];
    const baseline = getPortBaseline(this.portKey);

    const trendArrow = (cur: number, base: number): string => {
      const diff = cur - base;
      if (Math.abs(diff) < base * 0.05) return "";
      return diff > 0 ? " ↑" : " ↓";
    };
    const trendColor = (cur: number, base: number): string => {
      const diff = cur - base;
      if (Math.abs(diff) < base * 0.05) return "#ffffff";
      return diff > 0 ? "#88cc88" : "#cc8866";
    };

    const popVal = runtime?.population ?? baseline.population;
    addRow(t("approach.population", { size: "" }).replace(/[: ]+$/, ""),
      popVal.toLocaleString() + trendArrow(popVal, baseline.population),
      trendColor(popVal, baseline.population));

    const wealthVal = runtime?.wealth ?? baseline.wealth;
    const wealthColor =
      wealthVal >= 750 ? "#ccaa44" :
      wealthVal >= 450 ? "#88bb88" :
      wealthVal >= 200 ? "#aaaaaa" : "#aa6666";
    addRow(t("approach.wealth", { level: "" }).replace(/[: ]+$/, ""),
      `${wealthVal}/1000${trendArrow(wealthVal, baseline.wealth)}`, wealthColor);

    const defVal = runtime?.defense ?? baseline.defense;
    const defColor =
      defVal >= 70 ? "#88bb88" :
      defVal >= 40 ? "#aaaaaa" :
      defVal >= 20 ? "#cc8866" : "#cc4444";
    addRow(t("cityinfo.defense") ?? "Obrona",
      `${defVal}/100${trendArrow(defVal, baseline.defense)}`, defColor);

    // A cordon is the loudest thing about a town, so it goes with the numbers
    // it is wrecking rather than down with the world events (v0.22.0).
    const cordonDays = blockadeDays(this.worldState, this.portKey);
    if (cordonDays > 0) {
      addRow(
        t("cityinfo.blockade") ?? "Blokada",
        blockadeEffective(this.worldState, this.portKey)
          ? t("blockade.status", { days: cordonDays })
          : t("blockade.tightening_short", { days: cordonDays, onset: BLOCKADE_ONSET_DAYS }),
        blockadeEffective(this.worldState, this.portKey) ? "#cc4444" : "#cc8844",
      );
    }

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
      this.add.text(left, y, t("cityinfo.imports") ?? "Import", {
        ...txt(13, { color: "#888888" }),
      }).setDepth(5);
      y += 20;
      // Where each good actually comes from (v0.22.0). A good with no lane is
      // one nobody ships here — water out of a well, or an ocean import — and
      // says so by having no source named, which is the honest answer.
      for (const id of this.portDef.demands) {
        if (this.portDef.produces.includes(id)) continue;
        const lane = routeSupplying(this.portKey, id);
        const name = t("item." + id + ".name");
        const source = lane
          ? t("trade.lane_from", { port: t("port." + lane.from + ".name") })
          : "";
        const thin = lane && laneThroughput(this.worldState, lane.id) < 1;
        const line = source
          ? `${name} — ${source}${thin ? ` (${t("trade.lane_disrupted")})` : ""}`
          : name;
        this.add.text(left + 10, y, line, {
          ...txt(12, { color: thin ? "#cc8844" : "#cc8888" }),
        }).setDepth(5);
        y += 18;
      }
      y += 6;
    }

    y += 4;
    drawSep();

    // ── Active world events affecting this port ──
    const activeEvents = this.worldState.worldEvents.filter(ev => {
      if (ev.endDay < this.worldState.time.day) return false;
      if (ev.type === "war_start") return ev.factions.includes(factionId);
      return ev.ports.length === 0 || ev.ports.includes(this.portKey);
    });
    if (activeEvents.length > 0) {
      this.add.text(left, y, t("cityinfo.active_events") ?? "Aktualne wydarzenia", {
        ...txt(13, { color: "#888888" }),
      }).setDepth(5);
      y += 20;
      for (const ev of activeEvents.slice(0, 4)) {
        const sevColor = ev.severity >= 3 ? "#cc4444" : ev.severity === 2 ? "#cc8844" : "#cccc88";
        const headline = t(ev.headline, ev.vars as Record<string, string | number>);
        const trimmed = headline.length > 48 ? headline.slice(0, 47) + "…" : headline;
        this.add.text(left + 10, y, "• " + trimmed, { ...txt(11, { color: sevColor }) }).setDepth(5);
        y += 18;
      }
      y += 4;
      drawSep();
    }

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
