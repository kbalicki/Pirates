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
import { txt, PIRATE_ICONS_FONT, TEXT_RES } from "../ui/textStyle.ts";
import { getAssetPack, setAssetPack, PACK_LIST, usesParchmentUI } from "../settings/AssetPack.ts";
import type { AssetPackId } from "../settings/AssetPack.ts";
import { getZoomLevel, setZoomLevel, ZOOM_VALUES } from "../settings/ZoomSetting.ts";
import type { ZoomLevel } from "../settings/ZoomSetting.ts";
import { FACTIONS } from "../../core/data/factions.ts";
import { getSoundLevel, setSoundLevel, SOUND_MIN, SOUND_MAX, type SoundChannel } from "../settings/SoundSettings.ts";
import { abandonFleetShip } from "../../core/systems/PortInteractionSystem.ts";
import { SKILL_IDS, SKILL_MAX, calculateAge } from "../../core/model/CaptainState.ts";
import { CHANGELOG } from "../../changelog.ts";

type TabId = "cabin" | "captain" | "calendar" | "settings" | "save" | "map";

const ALL_TABS: TabId[] = ["cabin", "captain", "calendar", "settings", "save", "map"];
const DLG_W = 672;
const DLG_H = 528;
const BORDER = 3;
const PAD = 14;

export class OptionsMenuScene extends Phaser.Scene {
  private worldState!: WorldState;
  private tabButtons: Phaser.GameObjects.Text[] = [];
  private contentContainer!: Phaser.GameObjects.Container;
  private dlgX = 0;
  private dlgY = 0;
  private contentBaseY = 0;
  private contentH = 0;

  // Keyboard navigation state
  private activeTabIndex = 0;
  private selectedItemIndex = 0;
  private tabKeyCleanup: (() => void)[] = [];

  // Save/Load slot data cache for keyboard actions
  private saveSlotData: { slotId: string; hasData: boolean }[] = [];

  constructor() {
    super({ key: "OptionsMenuScene" });
  }

  init(data: { worldState: WorldState; initialTab?: number }): void {
    this.worldState = data.worldState;
    if (data.initialTab !== undefined) {
      this.activeTabIndex = data.initialTab;
    }
  }

  create(): void {
    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    this.dlgX = cx - DLG_W / 2;
    this.dlgY = cy - DLG_H / 2;

    // Dark overlay
    this.add.rectangle(cx, cy, cam.width, cam.height, 0x000000, 0.55);

    // Dialog frame
    if (usesParchmentUI() && this.textures.exists("parchment_panel")) {
      const panel = this.add.image(cx, cy, "parchment_panel");
      panel.setDisplaySize(DLG_W + 40, DLG_H + 30);
      panel.setAlpha(0.95);
    } else {
      this.add.rectangle(cx, cy, DLG_W + BORDER * 2, DLG_H + BORDER * 2, 0x222222);
      this.add.rectangle(cx, cy, DLG_W, DLG_H, 0xffffff);
    }

    let y = this.dlgY + PAD;

    // Title
    this.add.text(cx, y, t("menu.title"), txt(18, { bold: true })).setOrigin(0.5, 0);
    y += 28;

    // Tab bar
    const tabs: { id: TabId; labelKey: string }[] = [
      { id: "cabin", labelKey: "menu.tab_cabin" },
      { id: "captain", labelKey: "menu.tab_captain" },
      { id: "calendar", labelKey: "menu.tab_calendar" },
      { id: "settings", labelKey: "menu.tab_settings" },
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

    // Content container with scroll mask
    this.contentBaseY = y;
    this.contentH = this.dlgY + DLG_H - PAD - 30 - y; // space above close button
    this.contentContainer = this.add.container(0, y);

    const maskShape = this.make.graphics({ x: 0, y: 0 });
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(this.dlgX, y, DLG_W, this.contentH);
    this.contentContainer.setMask(new Phaser.Display.Masks.GeometryMask(this, maskShape));

    // Scroll with mouse wheel
    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _gos: unknown, _dx: number, _dy: number, dz: number) => {
      this.scrollContent(dz > 0 ? 20 : -20);
    });

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

    // Global keyboard bindings
    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-ESC", () => this.closeMenu());
      this.input.keyboard.on("keydown-SPACE", () => this.closeMenu());
      this.input.keyboard.on("keydown-ONE", () => this.switchTab("cabin"));
      this.input.keyboard.on("keydown-TWO", () => this.switchTab("captain"));
      this.input.keyboard.on("keydown-THREE", () => this.switchTab("calendar"));
      this.input.keyboard.on("keydown-FOUR", () => this.switchTab("settings"));
      this.input.keyboard.on("keydown-FIVE", () => this.switchTab("save"));
      this.input.keyboard.on("keydown-SIX", () => this.switchTab("map"));

      // Left/Right arrow for tab switching
      this.input.keyboard.on("keydown-LEFT", () => {
        if (this.activeTabIndex > 0) {
          this.switchTab(ALL_TABS[this.activeTabIndex - 1]);
        }
      });
      this.input.keyboard.on("keydown-RIGHT", () => {
        if (this.activeTabIndex < ALL_TABS.length - 1) {
          this.switchTab(ALL_TABS[this.activeTabIndex + 1]);
        }
      });

      // PageUp / PageDown for scrolling
      this.input.keyboard.on("keydown-PAGE_UP", () => this.scrollContent(-100));
      this.input.keyboard.on("keydown-PAGE_DOWN", () => this.scrollContent(100));
    }

    // Dynamic resize — restart scene to recenter dialog
    const onResize = () => {
      this.scale.off("resize", onResize);
      this.scene.restart({ worldState: this.worldState });
    };
    this.scale.on("resize", onResize);

    this.switchTab(ALL_TABS[this.activeTabIndex]);
  }

  private scrollContent(amount: number): void {
    const newY = this.contentContainer.y - amount;
    const minY = this.contentBaseY - Math.max(0, this.getContentHeight() - this.contentH);
    this.contentContainer.y = Phaser.Math.Clamp(newY, minY, this.contentBaseY);
  }

  private clearTabKeyboard(): void {
    for (const cleanup of this.tabKeyCleanup) cleanup();
    this.tabKeyCleanup = [];
  }

  private bindTabKey(event: string, handler: () => void): void {
    if (!this.input.keyboard) return;
    this.input.keyboard.on(event, handler);
    this.tabKeyCleanup.push(() => this.input.keyboard?.off(event, handler));
  }

  private switchTab(tab: TabId): void {
    this.activeTabIndex = ALL_TABS.indexOf(tab);
    this.selectedItemIndex = 0;
    this.clearTabKeyboard();

    for (let i = 0; i < this.tabButtons.length; i++) {
      if (ALL_TABS[i] === tab) {
        this.tabButtons[i].setColor("#1a1a1a");
      } else {
        this.tabButtons[i].setColor("#999999");
      }
    }

    this.contentContainer.removeAll(true);
    this.contentContainer.y = this.contentBaseY;

    switch (tab) {
      case "cabin": this.renderCabin(); break;
      case "captain": this.renderCaptain(); break;
      case "calendar": this.renderCalendar(); break;
      case "save": this.renderSave(); break;
      case "map": this.renderMap(); break;
      case "settings": this.renderSettings(); break;
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
      `1. ${shipClassName} (${t("fleet.flagship")})\n` +
      `   ${t("hud.hull", { current: Math.round(ship.hullHp), max: ship.hullMax })}` +
      `  |  ${t("hud.sails", { current: Math.round(ship.sailsHp), max: ship.sailsMax })}` +
      `  |  ${t("cabin.cannons", { count: ship.cannons })}`,
      { ...txt(11), lineSpacing: 4 });
    this.contentContainer.add(shipInfo);
    y += 38;

    // Fleet ships — show with abandon button (at-sea action; sell is in shipyard)
    const fleet = player.fleet ?? [];
    if (fleet.length > 0) {
      for (let i = 0; i < fleet.length; i++) {
        const fs = fleet[i];
        const fsClassName = t("ship." + fs.classId + ".name");
        const fsInfo = this.add.text(x + 10, y,
          `${i + 2}. ${fsClassName}\n` +
          `   ${t("hud.hull", { current: Math.round(fs.hullHp), max: fs.hullMax })}` +
          `  |  ${t("hud.sails", { current: Math.round(fs.sailsHp), max: fs.sailsMax })}` +
          `  |  ${t("cabin.cannons", { count: fs.cannons })}`,
          { ...txt(11), lineSpacing: 4 });
        this.contentContainer.add(fsInfo);

        const fsIdx = i;
        const abandonBtn = this.add.text(x + 320, y, t("fleet.abandon"),
          txt(11, { bold: true, color: "#aa3333" }));
        abandonBtn.setInteractive({ useHandCursor: true });
        abandonBtn.on("pointerdown", () => this.doAbandonFleet(fsIdx));
        this.contentContainer.add(abandonBtn);

        y += 38;
      }
    }

    // Gold
    this.contentContainer.add(
      this.add.text(x, y, `${t("hud.gold")}: ${player.gold}`, txt(14, { bold: true })));
  }

  /** Apply newly-changed volume to live sources without leaving the menu. */
  private applyVolumeLive(ch: SoundChannel): void {
    if (ch === "wind") {
      const main = this.scene.get("MainMapScene") as Phaser.Scene & { applyWindVolume?: () => void };
      main?.applyWindVolume?.();
    }
    // music: re-applied next time a track starts (rare during a paused menu)
    // seagulls: applied at next cry interval (≤30s)
  }

  private doAbandonFleet(index: number): void {
    this.worldState = abandonFleetShip(this.worldState, index);
    this.registry.set("worldState", this.worldState);
    this.switchTab("cabin");
  }

  // ---- Tab 2: Captain ----

  private renderCaptain(): void {
    const captain = this.worldState.captain;
    const player = this.worldState.player;
    const x = this.dlgX + PAD + 8;
    let y = 0;

    // Captain name
    this.contentContainer.add(
      this.add.text(x, y, t("captain.name_label", { name: this.worldState.playerName }),
        txt(15, { bold: true })));
    y += 24;

    // Age
    const age = calculateAge(this.worldState.time.day, captain.startAge);
    this.contentContainer.add(
      this.add.text(x, y, t("captain.age_label", { age }), txt(12)));
    y += 18;

    // Experience (notoriety)
    this.contentContainer.add(
      this.add.text(x, y, t("captain.experience_label", { value: player.notoriety }), txt(12)));
    y += 18;

    // Nationality
    const nationName = t("faction." + captain.nationality + ".name");
    this.contentContainer.add(
      this.add.text(x, y, t("captain.nationality_label", { nation: nationName }), txt(12)));
    y += 26;

    // Skills
    this.contentContainer.add(
      this.add.text(x, y, t("captain.skills_title"), txt(13, { bold: true })));
    y += 20;

    for (const skillId of SKILL_IDS) {
      const val = captain.skills[skillId];
      const name = t("skill." + skillId);

      // Skill name
      this.contentContainer.add(
        this.add.text(x + 10, y, `${name}:`, txt(11)));

      // Bar
      const barX = x + 120;
      const barW = 100;
      const barH = 10;
      const barBg = this.add.rectangle(barX, y + 5, barW, barH, 0xdddddd);
      barBg.setOrigin(0, 0.5);
      this.contentContainer.add(barBg);

      const fillW = (val / SKILL_MAX) * barW;
      const fillColor = val >= 8 ? 0x44aa44 : val >= 5 ? 0x88aa44 : 0xbbaa44;
      const barFill = this.add.rectangle(barX, y + 5, fillW, barH, fillColor);
      barFill.setOrigin(0, 0.5);
      this.contentContainer.add(barFill);

      const barBorder = this.add.graphics();
      barBorder.lineStyle(1, 0x999999, 1);
      barBorder.strokeRect(barX, y, barW, barH);
      this.contentContainer.add(barBorder);

      // Value
      this.contentContainer.add(
        this.add.text(barX + barW + 8, y, String(val), txt(11, { bold: true })));

      y += 18;
    }
    y += 12;

    // Ranks
    this.contentContainer.add(
      this.add.text(x, y, t("captain.ranks_title"), txt(13, { bold: true })));
    y += 20;

    for (const fKey of Object.keys(FACTIONS)) {
      const rankIdx = player.ranks[fKey] ?? 0;
      const rankName = t("rank." + fKey + "." + rankIdx);
      const factionName = t("faction." + fKey + ".name");
      this.contentContainer.add(
        this.add.text(x + 10, y, `${factionName}: ${rankName}`, txt(11)));
      y += 16;
    }
  }

  // ---- Tab 3: Calendar & Events ----

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

  // ---- Save Tab (dedicated) ----

  private renderSave(): void {
    const cx = this.cameras.main.width / 2;
    let y = 0;

    const saveTitle = this.add.text(cx, y, t("save.title"), txt(13, { bold: true }));
    saveTitle.setOrigin(0.5, 0);
    this.contentContainer.add(saveTitle);
    y += 22;

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

    this.saveSlotData = [];
    const slotBars: Phaser.GameObjects.Rectangle[] = [];

    for (let slotIdx = 0; slotIdx < MAX_SLOTS; slotIdx++) {
      const slotId = `slot_${slotIdx + 1}`;
      const existing = existingSaves.find((s) => (s.slotId as string) === slotId);
      this.saveSlotData.push({ slotId, hasData: !!existing });

      const isFocused = slotIdx === this.selectedItemIndex;

      // Selection bar
      const barW = DLG_W - PAD * 2;
      const selBar = this.add.rectangle(this.dlgX + PAD + barW / 2, y + 10, barW, 24,
        0x222244, isFocused ? 0.15 : 0);
      this.contentContainer.add(selBar);
      slotBars.push(selBar);

      let label: string;
      if (existing) {
        const date = new Date(existing.updatedAt);
        const dateStr = date.toLocaleDateString() + " " + date.toLocaleTimeString();
        label = `${t("save.slot_label", { n: String(slotIdx + 1), day: existing.title })} (${dateStr})`;
      } else {
        label = `Slot ${slotIdx + 1}: ${t("save.slot_empty")}`;
      }

      const marker = isFocused ? "\u25B6 " : "  ";
      this.contentContainer.add(
        this.add.text(x, y, marker + label, txt(12, {
          color: isFocused ? "#000000" : (existing ? "#1a1a1a" : "#999999"),
          bold: isFocused,
        })));

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

      y += 24;
    }

    // Keyboard hint for save/load
    const hint = this.add.text(this.cameras.main.width / 2, y + 8,
      "\u2191\u2193 \u2014 Select slot   Enter \u2014 Save   L \u2014 Load   Delete/X \u2014 Remove",
      txt(10, { color: "#888888" }));
    hint.setOrigin(0.5, 0);
    this.contentContainer.add(hint);
    y += 28;

    // --- Divider ---
    y += 6;
    const div2 = this.add.graphics();
    div2.lineStyle(1, 0xcccccc, 1);
    div2.lineBetween(this.dlgX + PAD, y, this.dlgX + DLG_W - PAD, y);
    this.contentContainer.add(div2);
    y += 10;

    // --- Language switch ---
    this.contentContainer.add(
      this.add.text(x, y, t("lang.current"), txt(12, { color: "#555555" })));

    // Keyboard for save/load navigation
    const currentTab = ALL_TABS[this.activeTabIndex];
    const moveUp = () => {
      if (this.selectedItemIndex > 0) {
        this.selectedItemIndex--;
        this.switchTab(currentTab);
      }
    };
    const moveDown = () => {
      if (this.selectedItemIndex < MAX_SLOTS - 1) {
        this.selectedItemIndex++;
        this.switchTab(currentTab);
      }
    };
    const doSaveSelected = () => {
      const slot = this.saveSlotData[this.selectedItemIndex];
      if (slot) this.doSave(slot.slotId);
    };
    const doLoadSelected = () => {
      const slot = this.saveSlotData[this.selectedItemIndex];
      if (slot?.hasData) this.doLoad(slot.slotId);
    };
    const doDeleteSelected = () => {
      const slot = this.saveSlotData[this.selectedItemIndex];
      if (slot?.hasData) this.doDelete(slot.slotId);
    };

    this.bindTabKey("keydown-UP", moveUp);
    this.bindTabKey("keydown-W", moveUp);
    this.bindTabKey("keydown-DOWN", moveDown);
    this.bindTabKey("keydown-S", moveDown);
    this.bindTabKey("keydown-ENTER", doSaveSelected);
    this.bindTabKey("keydown-L", doLoadSelected);
    this.bindTabKey("keydown-DELETE", doDeleteSelected);
    this.bindTabKey("keydown-X", doDeleteSelected);
  }

  // ---- Tab 5: Settings (Quartermaster) ----

  private renderSettings(): void {
    const x = this.dlgX + PAD + 8;
    const cx = this.cameras.main.width / 2;
    let y = 0;

    const title = this.add.text(cx, y, t("settings.title"), txt(14, { bold: true }));
    title.setOrigin(0.5, 0);
    this.contentContainer.add(title);
    y += 32;

    // Build list of focusable settings items
    // 0 = Speed, 1 = Sound, 2..2+PACK_LIST.length-1 = packs, then zooms, then language
    const settingsItems: { type: string; y: number }[] = [];

    // Game Speed toggle
    const speedIdx = settingsItems.length;
    settingsItems.push({ type: "speed", y });
    const iSpeedFocused = this.selectedItemIndex === speedIdx;
    const speedValue = this.worldState.gameSpeed ?? 1.2;
    const speedName = speedValue >= 2.0 ? t("speed.fast") : speedValue <= 0.8 ? t("speed.slow") : t("speed.normal");
    const speedMarker = iSpeedFocused ? "\u25B6 " : "";
    const speedLabel = this.add.text(x, y,
      speedMarker + t("speed.label", { speed: speedName }),
      txt(12, { bold: true, color: iSpeedFocused ? "#000000" : "#2266aa" }));
    speedLabel.setInteractive({ useHandCursor: true });
    speedLabel.on("pointerdown", () => this.cycleSpeed());
    this.contentContainer.add(speedLabel);
    y += 22;

    // Sound toggle
    const soundIdx = settingsItems.length;
    settingsItems.push({ type: "sound", y });
    const iSoundFocused = this.selectedItemIndex === soundIdx;
    const isMuted = this.sound.mute;
    const soundMarker = iSoundFocused ? "\u25B6 " : "";
    const soundLabel = this.add.text(x, y,
      soundMarker + (isMuted ? t("sound.off") : t("sound.on")),
      txt(12, { bold: true, color: iSoundFocused ? "#000000" : (isMuted ? "#aa4444" : "#2266aa") }));
    soundLabel.setInteractive({ useHandCursor: true });
    soundLabel.on("pointerdown", () => {
      this.sound.mute = !this.sound.mute;
      this.switchTab("settings");
    });
    this.contentContainer.add(soundLabel);
    y += 24;

    // Volume sliders: wind, seagulls, music (0-10)
    this.contentContainer.add(
      this.add.text(x, y, t("sound.section_title"), txt(12, { bold: true, color: "#555555" })));
    y += 20;

    const channels: { id: SoundChannel; labelKey: string }[] = [
      { id: "wind", labelKey: "sound.wind" },
      { id: "seagulls", labelKey: "sound.seagulls" },
      { id: "music", labelKey: "sound.music" },
    ];

    for (const ch of channels) {
      const volIdx = settingsItems.length;
      settingsItems.push({ type: "vol:" + ch.id, y });
      const isVolFocused = this.selectedItemIndex === volIdx;
      const lvl = getSoundLevel(ch.id);

      const labelMarker = isVolFocused ? "▶ " : "  ";
      const chLabel = this.add.text(x + 4, y, labelMarker + t(ch.labelKey),
        txt(11, { bold: isVolFocused, color: isVolFocused ? "#000000" : "#1a1a1a" }));
      this.contentContainer.add(chLabel);

      // [-] button
      const minus = this.add.text(x + 100, y, "[-]",
        txt(12, { bold: true, color: lvl > SOUND_MIN ? "#2266aa" : "#bbbbbb" }));
      if (lvl > SOUND_MIN) {
        minus.setInteractive({ useHandCursor: true });
        minus.on("pointerdown", () => {
          setSoundLevel(ch.id, lvl - 1);
          this.applyVolumeLive(ch.id);
          this.switchTab("settings");
        });
      }
      this.contentContainer.add(minus);

      // Value bar: 10 segments
      const barX = x + 130;
      const barY = y + 7;
      const segW = 10;
      const segH = 10;
      for (let i = 0; i < SOUND_MAX; i++) {
        const filled = i < lvl;
        const seg = this.add.rectangle(barX + i * (segW + 2), barY, segW, segH,
          filled ? 0x44aa44 : 0xdddddd);
        seg.setOrigin(0, 0.5);
        this.contentContainer.add(seg);
        const border = this.add.graphics();
        border.lineStyle(1, 0x999999, 1);
        border.strokeRect(barX + i * (segW + 2), barY - segH / 2, segW, segH);
        this.contentContainer.add(border);
      }

      // [+] button
      const plus = this.add.text(barX + SOUND_MAX * (segW + 2) + 6, y, "[+]",
        txt(12, { bold: true, color: lvl < SOUND_MAX ? "#2266aa" : "#bbbbbb" }));
      if (lvl < SOUND_MAX) {
        plus.setInteractive({ useHandCursor: true });
        plus.on("pointerdown", () => {
          setSoundLevel(ch.id, lvl + 1);
          this.applyVolumeLive(ch.id);
          this.switchTab("settings");
        });
      }
      this.contentContainer.add(plus);

      // Numeric value
      const numText = this.add.text(barX + SOUND_MAX * (segW + 2) + 38, y, String(lvl),
        txt(11, { bold: true, color: "#555555" }));
      this.contentContainer.add(numText);

      y += 22;
    }

    this.contentContainer.add(
      this.add.text(x + 10, y, t("sound.hint"), txt(10, { color: "#888888" })));
    y += 22;

    // Visual Style (asset pack) — numbered radio list
    this.contentContainer.add(
      this.add.text(x, y, t("settings.style_label"), txt(13, { bold: true })));
    y += 22;

    const currentPack = getAssetPack();
    for (const packId of PACK_LIST) {
      const packIdx = settingsItems.length;
      settingsItems.push({ type: "pack:" + packId, y });
      const isActive = packId === currentPack;
      const isItemFocused = this.selectedItemIndex === packIdx;
      const marker = isActive ? "\u25b8 " : isItemFocused ? "\u25B6 " : "  ";
      const color = isItemFocused ? "#000000" : isActive ? "#1a1a1a" : "#888888";
      const label = marker + t("settings.pack." + packId);
      const packBtn = this.add.text(x + 10, y, label, txt(12, { bold: isActive || isItemFocused, color }));
      if (!isActive) {
        packBtn.setInteractive({ useHandCursor: true });
        packBtn.on("pointerdown", () => {
          setAssetPack(packId);
          this.switchTab("settings");
        });
      }
      this.contentContainer.add(packBtn);
      y += 20;
    }

    const hint = this.add.text(x + 10, y, t("settings.style_hint"), txt(10, { color: "#888888" }));
    this.contentContainer.add(hint);
    y += 32;

    // Zoom (Spyglass)
    this.contentContainer.add(
      this.add.text(x, y, t("settings.zoom_label"), txt(13, { bold: true })));
    y += 22;

    const zoomLevels: ZoomLevel[] = ["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8", "z9", "z10", "z11", "z12", "z13", "z14"];
    const currentZoom = getZoomLevel();

    for (const level of zoomLevels) {
      const zoomIdx = settingsItems.length;
      settingsItems.push({ type: "zoom:" + level, y });
      const isActive = level === currentZoom;
      const isItemFocused = this.selectedItemIndex === zoomIdx;
      const label = isActive
        ? `\u25B8 ${t("settings.zoom." + level)}`
        : isItemFocused
          ? `\u25B6 ${t("settings.zoom." + level)}`
          : `  ${t("settings.zoom." + level)}`;
      const color = isItemFocused ? "#000000" : isActive ? "#1a1a1a" : "#888888";
      const zoomBtn = this.add.text(x + 10, y, label, txt(12, { bold: isActive || isItemFocused, color }));
      if (!isActive) {
        zoomBtn.setInteractive({ useHandCursor: true });
        zoomBtn.on("pointerdown", () => {
          setZoomLevel(level);
          const mainScene = this.scene.get("MainMapScene");
          if (mainScene) {
            mainScene.cameras.main.setZoom(ZOOM_VALUES[level]);
          }
          this.switchTab("settings");
        });
      }
      this.contentContainer.add(zoomBtn);
      y += 20;
    }

    const zoomHint = this.add.text(x + 10, y, t("settings.zoom_hint"), txt(10, { color: "#888888" }));
    this.contentContainer.add(zoomHint);
    y += 32;

    // Debug mode toggle
    this.contentContainer.add(
      this.add.text(x, y, "Debug", txt(13, { bold: true })));
    y += 22;

    settingsItems.push({ type: "debug", y });
    const debugRaw = localStorage.getItem("pc_debug");
    const debugOn = debugRaw === null ? true : debugRaw === "1";
    const debugLabel = debugOn ? "\u25B8 Debug: ON" : "  Debug: OFF";
    const debugColor = debugOn ? "#cc4444" : "#888888";
    const debugBtn = this.add.text(x + 10, y, debugLabel, txt(12, { bold: debugOn, color: debugColor }));
    debugBtn.setInteractive({ useHandCursor: true });
    debugBtn.on("pointerdown", () => {
      localStorage.setItem("pc_debug", debugOn ? "0" : "1");
      this.switchTab("settings");
    });
    this.contentContainer.add(debugBtn);
    y += 28;

    // Fog of War (spyglass range) toggle
    settingsItems.push({ type: "fog", y });
    const fogOn = localStorage.getItem("pc_fog") === "1";
    const fogLabel = fogOn ? "\u25B8 Spyglass range: ON" : "  Spyglass range: OFF";
    const fogColor = fogOn ? "#2266aa" : "#888888";
    const fogBtn = this.add.text(x + 10, y, fogLabel, txt(12, { bold: fogOn, color: fogColor }));
    fogBtn.setInteractive({ useHandCursor: true });
    fogBtn.on("pointerdown", () => {
      localStorage.setItem("pc_fog", fogOn ? "0" : "1");
      this.switchTab("settings");
    });
    this.contentContainer.add(fogBtn);
    y += 32;

    // Language
    const langIdx = settingsItems.length;
    settingsItems.push({ type: "lang", y });
    const isLangFocused = this.selectedItemIndex === langIdx;
    this.contentContainer.add(
      this.add.text(x, y, t("lang.current"), txt(13, { bold: true })));
    y += 22;

    const langMarker = isLangFocused ? "\u25B6 " : "";
    const langBtn = this.add.text(x + 10, y, langMarker + t("lang.switch"),
      txt(13, { bold: true, color: isLangFocused ? "#000000" : "#2266aa" }));
    langBtn.setInteractive({ useHandCursor: true });
    langBtn.on("pointerdown", () => {
      const current = getLang();
      setLang(current === "en" ? "pl" : "en");
      this.scene.restart({ worldState: this.worldState });
    });
    this.contentContainer.add(langBtn);
    y += 32;

    // Changelog with pirate icon decorations
    const iconLeft = this.add.text(cx - 80, y - 2, "A", {
      fontFamily: PIRATE_ICONS_FONT, fontSize: "28px", color: "#3a2a1a", resolution: TEXT_RES,
    });
    iconLeft.setOrigin(0.5, 0);
    this.contentContainer.add(iconLeft);

    this.contentContainer.add(
      this.add.text(cx, y, t("changelog.title"), txt(13, { bold: true })).setOrigin(0.5, 0));

    const iconRight = this.add.text(cx + 80, y - 2, "A", {
      fontFamily: PIRATE_ICONS_FONT, fontSize: "28px", color: "#3a2a1a", resolution: TEXT_RES,
    });
    iconRight.setOrigin(0.5, 0);
    this.contentContainer.add(iconRight);
    y += 32;

    // Pirate icon sampler — each letter = different pirate symbol
    const sampleRow = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const sampler = this.add.text(x, y, sampleRow, {
      fontFamily: PIRATE_ICONS_FONT, fontSize: "18px", color: "#555555", resolution: TEXT_RES,
      wordWrap: { width: DLG_W - PAD * 2 - 16 },
    });
    this.contentContainer.add(sampler);
    y += sampler.height + 8;

    // Label each char for identification
    const labelRow = sampleRow.split("").join(" ");
    const labels = this.add.text(x, y, labelRow, txt(7, { color: "#999999" }));
    this.contentContainer.add(labels);
    y += labels.height + 12;

    for (const entry of CHANGELOG) {
      const header = t("changelog.version", { version: entry.version, date: entry.date });
      this.contentContainer.add(
        this.add.text(x + 4, y, header, txt(11, { bold: true, color: "#333333" })));
      y += 16;

      for (const change of entry.changes) {
        this.contentContainer.add(
          this.add.text(x + 14, y, `\u2022 ${change}`, txt(10, { color: "#555555" })));
        y += 14;
      }
      y += 6;
    }

    // Keyboard hint for settings
    const settingsHint = this.add.text(cx, this.contentH - 4,
      "\u2191\u2193 \u2014 Navigate   Enter \u2014 Toggle/Select",
      txt(10, { color: "#888888" }));
    settingsHint.setOrigin(0.5, 1);
    this.contentContainer.add(settingsHint);

    // Keyboard navigation for settings
    const maxIdx = settingsItems.length - 1;
    const moveUp = () => {
      if (this.selectedItemIndex > 0) {
        this.selectedItemIndex--;
        this.switchTab("settings");
      }
    };
    const moveDown = () => {
      if (this.selectedItemIndex < maxIdx) {
        this.selectedItemIndex++;
        this.switchTab("settings");
      }
    };
    const confirmSetting = () => {
      const item = settingsItems[this.selectedItemIndex];
      if (!item) return;
      if (item.type === "speed") {
        this.cycleSpeed();
      } else if (item.type === "sound") {
        this.sound.mute = !this.sound.mute;
        this.switchTab("settings");
      } else if (item.type.startsWith("pack:")) {
        const packId = item.type.split(":")[1] as AssetPackId;
        setAssetPack(packId);
        this.switchTab("settings");
      } else if (item.type.startsWith("zoom:")) {
        const level = item.type.split(":")[1] as ZoomLevel;
        setZoomLevel(level);
        const mainScene = this.scene.get("MainMapScene");
        if (mainScene) {
          mainScene.cameras.main.setZoom(ZOOM_VALUES[level]);
        }
        this.switchTab("settings");
      } else if (item.type === "fog") {
        const isFogOn = localStorage.getItem("pc_fog") === "1";
        localStorage.setItem("pc_fog", isFogOn ? "0" : "1");
        this.switchTab("settings");
      } else if (item.type === "debug") {
        const debugRawKb = localStorage.getItem("pc_debug");
        const isOn = debugRawKb === null ? true : debugRawKb === "1";
        localStorage.setItem("pc_debug", isOn ? "0" : "1");
        this.switchTab("settings");
      } else if (item.type.startsWith("vol:")) {
        const ch = item.type.split(":")[1] as SoundChannel;
        const cur = getSoundLevel(ch);
        const next = cur >= SOUND_MAX ? SOUND_MIN : cur + 1;
        setSoundLevel(ch, next);
        this.switchTab("settings");
      } else if (item.type === "lang") {
        const current = getLang();
        setLang(current === "en" ? "pl" : "en");
        this.scene.restart({ worldState: this.worldState });
      }
    };

    const adjustVolume = (delta: number) => {
      const item = settingsItems[this.selectedItemIndex];
      if (!item || !item.type.startsWith("vol:")) return;
      const ch = item.type.split(":")[1] as SoundChannel;
      setSoundLevel(ch, getSoundLevel(ch) + delta);
      this.applyVolumeLive(ch);
      this.switchTab("settings");
    };

    this.bindTabKey("keydown-UP", moveUp);
    this.bindTabKey("keydown-W", moveUp);
    this.bindTabKey("keydown-DOWN", moveDown);
    this.bindTabKey("keydown-S", moveDown);
    this.bindTabKey("keydown-ENTER", confirmSetting);
    // ← / → adjust volume when a vol: item is focused (Settings tab only)
    this.bindTabKey("keydown-A", () => adjustVolume(-1));
    this.bindTabKey("keydown-D", () => adjustVolume(1));
  }

  private cycleSpeed(): void {
    const speedValue = this.worldState.gameSpeed ?? 1.2;
    if (speedValue >= 2.0) {
      this.worldState = { ...this.worldState, gameSpeed: 0.6 };
    } else if (speedValue <= 0.8) {
      this.worldState = { ...this.worldState, gameSpeed: 1.2 };
    } else {
      this.worldState = { ...this.worldState, gameSpeed: 2.4 };
    }
    this.registry.set("worldState", this.worldState);
    this.switchTab("settings");
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
    this.switchTab(ALL_TABS[this.activeTabIndex]);
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
    this.switchTab(ALL_TABS[this.activeTabIndex]);
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

  private getContentHeight(): number {
    let maxY = 0;
    this.contentContainer.each((child: Phaser.GameObjects.GameObject) => {
      const go = child as unknown as { getBounds?: () => Phaser.Geom.Rectangle };
      if (go.getBounds) {
        const b = go.getBounds();
        const localBottom = b.y + b.height - this.contentBaseY;
        if (localBottom > maxY) maxY = localBottom;
      }
    });
    return maxY + 10;
  }

  private closeMenu(): void {
    this.scene.stop();
    this.scene.resume("MainMapScene");
  }
}
