import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import { t, getLang, setLang } from "../../core/i18n/index.ts";
import { PORTS } from "../../core/data/ports.ts";
import { LANDMASSES } from "../../core/data/geography.ts";
import {
  dayToCalendar,
  getMonthName,
  daysInMonth,
} from "../../core/systems/TimeSystem.ts";
import { getRecentEvents } from "../../core/systems/EventLogSystem.ts";
import {
  listSaves,
  saveGame,
  loadGame,
  removeSave,
} from "../../persistence/SaveRepository.ts";
import { saveSlotId } from "../../core/model/ids.ts";
import type { SavePayload } from "../../persistence/SaveSchema.ts";
import { txt } from "../ui/textStyle.ts";

type TabId = "cabin" | "calendar" | "save" | "map";

const DLG_W = 620;
const DLG_H = 500;
const BORDER = 3;
const PAD = 18;

export class OptionsMenuScene extends Phaser.Scene {
  private worldState!: WorldState;
  private tabButtons: Phaser.GameObjects.Text[] = [];
  private contentContainer!: Phaser.GameObjects.Container;
  private dlgX = 0;
  private dlgY = 0;

  constructor() {
    super({ key: "OptionsMenuScene" });
  }

  init(data: { worldState: WorldState }): void {
    this.worldState = data.worldState;
  }

  create(): void {
    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    this.dlgX = cx - DLG_W / 2;
    this.dlgY = cy - DLG_H / 2;

    // Dark overlay
    this.add.rectangle(cx, cy, cam.width, cam.height, 0x000000, 0.55);

    // White dialog frame
    this.add.rectangle(cx, cy, DLG_W + BORDER * 2, DLG_H + BORDER * 2, 0x222222);
    this.add.rectangle(cx, cy, DLG_W, DLG_H, 0xffffff);

    let y = this.dlgY + PAD;

    // Title
    this.add.text(cx, y, t("menu.title"), txt(18, { bold: true })).setOrigin(0.5, 0);
    y += 28;

    // Tab bar
    const tabs: { id: TabId; labelKey: string }[] = [
      { id: "cabin", labelKey: "menu.tab_cabin" },
      { id: "calendar", labelKey: "menu.tab_calendar" },
      { id: "save", labelKey: "menu.tab_save" },
      { id: "map", labelKey: "menu.tab_map" },
    ];

    const tabSpacing = (DLG_W - PAD * 2) / tabs.length;
    this.tabButtons = [];

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      const tx = this.dlgX + PAD + tabSpacing * i + tabSpacing / 2;
      const btn = this.add.text(tx, y, t(tab.labelKey), txt(12, { bold: true, color: "#666666" }));
      btn.setOrigin(0.5, 0);
      btn.setInteractive({ useHandCursor: true });
      btn.on("pointerdown", () => this.switchTab(tab.id));
      this.tabButtons.push(btn);
    }
    y += 22;

    // Tab divider
    const tabDiv = this.add.graphics();
    tabDiv.lineStyle(1, 0xcccccc, 1);
    tabDiv.lineBetween(this.dlgX + PAD, y, this.dlgX + DLG_W - PAD, y);
    y += 6;

    // Content container
    this.contentContainer = this.add.container(0, y);

    // Close hint (bottom)
    this.add.text(cx, this.dlgY + DLG_H - PAD + 2,
      t("menu.close_hint"), txt(10, { color: "#888888" })).setOrigin(0.5, 1);

    // Close button
    const closeBtn = this.add.text(cx, this.dlgY + DLG_H - PAD - 14,
      t("menu.close"), txt(13, { bold: true }));
    closeBtn.setOrigin(0.5, 1);
    closeBtn.setInteractive({ useHandCursor: true });
    closeBtn.on("pointerover", () => closeBtn.setColor("#555555"));
    closeBtn.on("pointerout", () => closeBtn.setColor("#1a1a1a"));
    closeBtn.on("pointerdown", () => this.closeMenu());

    // Keyboard
    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-ESC", () => this.closeMenu());
      this.input.keyboard.on("keydown-SPACE", () => this.closeMenu());
      this.input.keyboard.on("keydown-ONE", () => this.switchTab("cabin"));
      this.input.keyboard.on("keydown-TWO", () => this.switchTab("calendar"));
      this.input.keyboard.on("keydown-THREE", () => this.switchTab("save"));
      this.input.keyboard.on("keydown-FOUR", () => this.switchTab("map"));
    }

    this.switchTab("cabin");
  }

  private switchTab(tab: TabId): void {
    const allTabs: TabId[] = ["cabin", "calendar", "save", "map"];
    for (let i = 0; i < this.tabButtons.length; i++) {
      if (allTabs[i] === tab) {
        this.tabButtons[i].setColor("#1a1a1a");
      } else {
        this.tabButtons[i].setColor("#999999");
      }
    }

    this.contentContainer.removeAll(true);

    switch (tab) {
      case "cabin": this.renderCabin(); break;
      case "calendar": this.renderCalendar(); break;
      case "save": this.renderSaveLoad(); break;
      case "map": this.renderMap(); break;
    }
  }

  // ---- Tab 1: Captain's Cabin ----

  private renderCabin(): void {
    const player = this.worldState.player;
    const playerEntity = this.worldState.entities[player.shipId as string];
    const ship = playerEntity?.ship;
    if (!ship) return;

    const x = this.dlgX + PAD + 8;
    let y = 0;

    // Crew section
    const crewTitle = this.add.text(x, y, t("cabin.crew_title"), txt(14, { bold: true }));
    this.contentContainer.add(crewTitle);
    y += 20;

    const crewText = this.add.text(x + 10, y,
      `${t("hud.crew", { current: ship.crew.current, max: ship.crew.max })}\n${t("hud.morale", { pct: Math.round(ship.crew.morale * 100) })}`,
      txt(12));
    this.contentContainer.add(crewText);
    y += 36;

    // Morale bar
    const barBg = this.add.rectangle(x + 10, y, 200, 10, 0xdddddd);
    barBg.setOrigin(0, 0.5);
    this.contentContainer.add(barBg);
    const moraleColor = ship.crew.morale > 0.5 ? 0x44aa44 : ship.crew.morale > 0.2 ? 0xbbaa44 : 0xcc4444;
    const bar = this.add.rectangle(x + 10, y, 200 * ship.crew.morale, 10, moraleColor);
    bar.setOrigin(0, 0.5);
    this.contentContainer.add(bar);
    // Bar border
    const barBorder = this.add.graphics();
    barBorder.lineStyle(1, 0x999999, 1);
    barBorder.strokeRect(x + 10, y - 5, 200, 10);
    this.contentContainer.add(barBorder);
    y += 20;

    // Cargo manifest
    const cargoTitle = this.add.text(x, y, t("cabin.cargo_title"), txt(14, { bold: true }));
    this.contentContainer.add(cargoTitle);
    y += 20;

    const totalCargo = Object.values(ship.cargo).reduce<number>((s, q) => s + q, 0);
    const cargoSummary = this.add.text(x + 10, y,
      t("hud.cargo", { current: Math.round(totalCargo), max: ship.cargoCap }), txt(12, { color: "#555555" }));
    this.contentContainer.add(cargoSummary);
    y += 18;

    const cargoEntries = Object.entries(ship.cargo).filter(([_, qty]) => qty > 0);
    if (cargoEntries.length === 0) {
      this.contentContainer.add(this.add.text(x + 10, y, t("cabin.no_cargo"), txt(11, { color: "#888888" })));
      y += 16;
    } else {
      for (const [itemKey, qty] of cargoEntries) {
        const name = t("item." + itemKey + ".name");
        this.contentContainer.add(this.add.text(x + 10, y, `${name}: ${Math.round(qty)}`, txt(11)));
        y += 16;
      }
    }
    y += 12;

    // Ship info
    const shipTitle = this.add.text(x, y, t("cabin.ships_title"), txt(14, { bold: true }));
    this.contentContainer.add(shipTitle);
    y += 20;

    const shipClassName = t("ship." + (ship.classId as string) + ".name");
    const shipInfo = this.add.text(x + 10, y,
      `1. ${shipClassName}\n` +
      `   ${t("hud.hull", { current: Math.round(ship.hullHp), max: ship.hullMax })}` +
      `  |  ${t("hud.sails", { current: Math.round(ship.sailsHp), max: ship.sailsMax })}` +
      `  |  ${t("cabin.cannons", { count: ship.cannons })}`,
      { ...txt(11), lineSpacing: 4 });
    this.contentContainer.add(shipInfo);
    y += 38;

    // Gold
    this.contentContainer.add(
      this.add.text(x, y, `${t("hud.gold")}: ${player.gold}`, txt(14, { bold: true })));
  }

  // ---- Tab 2: Calendar & Events ----

  private renderCalendar(): void {
    const cx = this.cameras.main.width / 2;
    let y = 0;

    const cal = dayToCalendar(this.worldState.time.day);
    const monthName = getMonthName(cal.month);
    const dateStr = `${cal.dayOfMonth} ${monthName} ${cal.year}`;
    const hh = String(this.worldState.time.hour).padStart(2, "0");
    const mm = String(this.worldState.time.minute).padStart(2, "0");

    const dateText = this.add.text(cx, y, dateStr, txt(16, { bold: true }));
    dateText.setOrigin(0.5, 0);
    this.contentContainer.add(dateText);
    y += 22;

    const timeText = this.add.text(cx, y, `${hh}:${mm}`, txt(13, { color: "#555555" }));
    timeText.setOrigin(0.5, 0);
    this.contentContainer.add(timeText);
    y += 24;

    // Month grid
    this.drawMonthGrid(cal, y);
    y += 120;

    // Divider
    const divider = this.add.graphics();
    divider.lineStyle(1, 0xcccccc, 1);
    divider.lineBetween(this.dlgX + PAD, y, this.dlgX + DLG_W - PAD, y);
    this.contentContainer.add(divider);
    y += 8;

    // Recent events
    this.contentContainer.add(
      this.add.text(this.dlgX + PAD + 8, y, t("calendar.recent_events"), txt(13, { bold: true })));
    y += 20;

    const events = getRecentEvents(this.worldState, 20);
    if (events.length === 0) {
      this.contentContainer.add(
        this.add.text(this.dlgX + PAD + 12, y, t("calendar.no_events"), txt(11, { color: "#888888" })));
    } else {
      const W = DLG_W - PAD * 2 - 16;
      for (const evt of [...events].reverse()) {
        const evtHH = String(evt.hour).padStart(2, "0");
        const evtMM = String(evt.minute).padStart(2, "0");
        const timePrefix = `[D${evt.day} ${evtHH}:${evtMM}]`;
        const msg = t(evt.key, evt.vars);
        const line = this.add.text(this.dlgX + PAD + 12, y, `${timePrefix} ${msg}`,
          { ...txt(10, { color: "#444444" }), wordWrap: { width: W } });
        this.contentContainer.add(line);
        y += line.height + 3;
        if (y > 290) break;
      }
    }
  }

  private drawMonthGrid(
    cal: { year: number; month: number; dayOfMonth: number },
    startY: number,
  ): void {
    const cx = this.cameras.main.width / 2;
    const CELL = 28;
    const GRID_COLS = 7;
    const startX = cx - (GRID_COLS * CELL) / 2;
    const dim = daysInMonth(cal.month, cal.year);

    const dayNames = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
    for (let c = 0; c < GRID_COLS; c++) {
      const header = this.add.text(startX + c * CELL + CELL / 2, startY,
        dayNames[c], txt(9, { bold: true, color: "#888888" }));
      header.setOrigin(0.5, 0);
      this.contentContainer.add(header);
    }

    let row = 0;
    let col = 0;
    for (let d = 1; d <= dim; d++) {
      const gx = startX + col * CELL + CELL / 2;
      const gy = startY + 14 + row * CELL;
      const isToday = d === cal.dayOfMonth;
      const color = isToday ? "#1a1a1a" : "#777777";
      const label = this.add.text(gx, gy, String(d),
        txt(11, { bold: isToday, color }));
      label.setOrigin(0.5, 0);
      this.contentContainer.add(label);

      if (isToday) {
        const hl = this.add.rectangle(gx, gy + 6, CELL - 4, CELL - 4, 0x222244, 0.12);
        hl.setOrigin(0.5, 0.5);
        this.contentContainer.add(hl);
      }

      col++;
      if (col >= GRID_COLS) { col = 0; row++; }
    }
  }

  // ---- Tab 3: Save/Load ----

  private renderSaveLoad(): void {
    const cx = this.cameras.main.width / 2;
    let y = 0;

    const title = this.add.text(cx, y, t("save.title"), txt(14, { bold: true }));
    title.setOrigin(0.5, 0);
    this.contentContainer.add(title);
    y += 26;

    listSaves().then((existingSaves) => {
      this.renderSaveSlots(existingSaves, y);
    });
  }

  private renderSaveSlots(
    existingSaves: { slotId: string; title: string; updatedAt: number }[],
    startY: number,
  ): void {
    let y = startY;
    const MAX_SLOTS = 5;
    const x = this.dlgX + PAD + 8;
    const rightX = this.dlgX + DLG_W - PAD - 8;

    for (let slotIdx = 0; slotIdx < MAX_SLOTS; slotIdx++) {
      const slotId = `slot_${slotIdx + 1}`;
      const existing = existingSaves.find((s) => (s.slotId as string) === slotId);

      let label: string;
      if (existing) {
        const date = new Date(existing.updatedAt);
        const dateStr = date.toLocaleDateString() + " " + date.toLocaleTimeString();
        label = `${t("save.slot_label", { n: String(slotIdx + 1), day: existing.title })} (${dateStr})`;
      } else {
        label = `Slot ${slotIdx + 1}: ${t("save.slot_empty")}`;
      }

      this.contentContainer.add(
        this.add.text(x, y, label, txt(12, { color: existing ? "#1a1a1a" : "#999999" })));

      // Save button
      const saveBtn = this.add.text(rightX - 140, y, t("save.btn_save"), txt(12, { bold: true, color: "#2a7a2a" }));
      saveBtn.setInteractive({ useHandCursor: true });
      saveBtn.on("pointerdown", () => this.doSave(slotId));
      this.contentContainer.add(saveBtn);

      if (existing) {
        const loadBtn = this.add.text(rightX - 80, y, t("save.btn_load"), txt(12, { bold: true, color: "#2266aa" }));
        loadBtn.setInteractive({ useHandCursor: true });
        loadBtn.on("pointerdown", () => this.doLoad(slotId));
        this.contentContainer.add(loadBtn);

        const delBtn = this.add.text(rightX - 20, y, t("save.btn_delete"), txt(12, { bold: true, color: "#aa2222" }));
        delBtn.setInteractive({ useHandCursor: true });
        delBtn.on("pointerdown", () => this.doDelete(slotId));
        this.contentContainer.add(delBtn);
      }

      y += 28;
    }

    // Language switch
    y += 16;
    this.contentContainer.add(
      this.add.text(x, y, t("lang.current"), txt(12, { color: "#555555" })));

    const langBtn = this.add.text(x, y + 20, t("lang.switch"), txt(13, { bold: true, color: "#2266aa" }));
    langBtn.setInteractive({ useHandCursor: true });
    langBtn.on("pointerdown", () => {
      const current = getLang();
      setLang(current === "en" ? "pl" : "en");
      this.scene.restart({ worldState: this.worldState });
    });
    this.contentContainer.add(langBtn);
  }

  private async doSave(slotId: string): Promise<void> {
    const payload: SavePayload = {
      meta: {
        slotId: saveSlotId(slotId),
        title: `Day ${this.worldState.time.day}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        playtimeSeconds: Math.floor(this.worldState.time.tick / 20),
        worldVersion: this.worldState.version,
      },
      world: this.worldState,
    };
    await saveGame(payload);
    this.switchTab("save");
  }

  private async doLoad(slotId: string): Promise<void> {
    const payload = await loadGame(saveSlotId(slotId));
    if (payload) {
      this.registry.set("worldState", payload.world);
      this.scene.stop();
      this.scene.stop("MainMapScene");
      this.scene.start("MainMapScene", { worldState: payload.world });
    }
  }

  private async doDelete(slotId: string): Promise<void> {
    await removeSave(saveSlotId(slotId));
    this.switchTab("save");
  }

  // ---- Tab 4: Caribbean Map ----

  private renderMap(): void {
    const CONTENT_H = DLG_H - 160;
    const MAP_PX_W = 3200;
    const MAP_PX_H = 2400;

    const scale = Math.min((DLG_W - PAD * 2 - 20) / MAP_PX_W, CONTENT_H / MAP_PX_H);
    const mapDisplayW = MAP_PX_W * scale;
    const mapDisplayH = MAP_PX_H * scale;
    const cx = this.cameras.main.width / 2;
    const offsetX = cx - mapDisplayW / 2;
    const offsetY = 4;

    // Ocean background
    const g = this.add.graphics();
    g.fillStyle(0xc8ddf0, 1);
    g.fillRect(offsetX, offsetY, mapDisplayW, mapDisplayH);
    g.lineStyle(1, 0x888888, 1);
    g.strokeRect(offsetX, offsetY, mapDisplayW, mapDisplayH);
    this.contentContainer.add(g);

    // Landmass polygons
    g.fillStyle(0x6aaa6a, 1);
    for (const lm of LANDMASSES) {
      if (lm.polygon.length < 3) continue;
      g.beginPath();
      g.moveTo(offsetX + lm.polygon[0].x * scale, offsetY + lm.polygon[0].y * scale);
      for (let i = 1; i < lm.polygon.length; i++) {
        g.lineTo(offsetX + lm.polygon[i].x * scale, offsetY + lm.polygon[i].y * scale);
      }
      g.closePath();
      g.fillPath();
    }

    // Port dots and labels
    for (const [key, port] of Object.entries(PORTS)) {
      const px = offsetX + port.pos.x * scale;
      const py = offsetY + port.pos.y * scale;

      g.fillStyle(0x1a1a1a, 1);
      g.fillCircle(px, py, 2);

      const label = this.add.text(px, py - 5, t("port." + key + ".name"), txt(7, { color: "#333333" }));
      label.setOrigin(0.5, 1);
      this.contentContainer.add(label);
    }

    // Player position
    const playerEntity = this.worldState.entities[this.worldState.player.shipId as string];
    if (playerEntity) {
      const px = offsetX + playerEntity.pos.x * scale;
      const py = offsetY + playerEntity.pos.y * scale;
      g.fillStyle(0xcc0000, 1);
      g.fillCircle(px, py, 3);
      g.lineStyle(1, 0xcc0000, 0.4);
      g.strokeCircle(px, py, 6);

      const youLabel = this.add.text(px + 8, py - 4,
        t("map.you_are_here"), txt(8, { bold: true, color: "#cc0000" }));
      this.contentContainer.add(youLabel);
    }

    // Other entities
    for (const [id, entity] of Object.entries(this.worldState.entities)) {
      if (id === (this.worldState.player.shipId as string)) continue;
      if (entity.kind !== "ship") continue;
      const ex = offsetX + entity.pos.x * scale;
      const ey = offsetY + entity.pos.y * scale;
      g.fillStyle(0x666666, 0.6);
      g.fillCircle(ex, ey, 1.5);
    }
  }

  private closeMenu(): void {
    this.scene.stop();
    this.scene.resume("MainMapScene");
  }
}
