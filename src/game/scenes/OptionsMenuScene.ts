import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import { t, getLang, setLang } from "../../core/i18n/index.ts";
import { PORTS } from "../../core/data/ports.ts";
import { LANDMASSES } from "../../core/data/geography.ts";
import {
  dayToCalendar,
  formatCalendarDay,
  daysInMonth,
  clockHHMM,
} from "../../core/systems/TimeSystem.ts";
import { getRecentEvents } from "../../core/systems/EventLogSystem.ts";
import {
  listSaves,
  saveGame,
  loadGame,
  removeSave,
} from "../../persistence/SaveRepository.ts";
import { saveSlotId } from "../../core/model/ids.ts";
import { saveTitleDay, type SavePayload } from "../../persistence/SaveSchema.ts";
import { txt, PIRATE_ICONS_FONT, TEXT_RES, HINT_ON_LIGHT } from "../ui/textStyle.ts";
import { getAssetPack, setAssetPack, PACK_LIST, usesParchmentUI } from "../settings/AssetPack.ts";
import type { AssetPackId } from "../settings/AssetPack.ts";
import { getZoomLevel, setZoomLevel } from "../settings/ZoomSetting.ts";
import { isDebugMode, setDebugMode } from "../settings/DebugSetting.ts";
import { isFogEnabled, setFogEnabled } from "../settings/FogSetting.ts";
import type { ZoomLevel } from "../settings/ZoomSetting.ts";
import { FACTIONS } from "../../core/data/factions.ts";
import { CROWNS, enemiesOf, coBelligerentAgainst, alliedSince } from "../../core/systems/DiplomacySystem.ts";
import { getSoundLevel, setSoundLevel, SOUND_MIN, SOUND_MAX, type SoundChannel } from "../settings/SoundSettings.ts";
import { abandonFleetShip } from "../../core/systems/PortInteractionSystem.ts";
import { consortCrew, consortCrewMax, consortMorale, consortTraining, fleetManning } from "../../core/systems/FleetSystem.ts";
import {
  squadronStowed, squadronCap, squadronManifest, stowedIn, consortCargo, consortCargoCap,
  spillIfDetached,
} from "../../core/systems/HoldSystem.ts";
import { manningTier, workingMinimum } from "../../core/systems/CrewSystem.ts";
import { activeQuests } from "../../core/systems/QuestSystem.ts";
import { buildQuestRegistry } from "../../core/systems/QuestRegistry.ts";
import { SKILL_IDS, SKILL_MAX, calculateAge } from "../../core/model/CaptainState.ts";
import { CHANGELOG } from "../../changelog.ts";
import { offsetRevealing } from "../../core/services/menuCursor.ts";
import { placeRows, rowsInWindow, type PlacedRow } from "../../core/services/longList.ts";
import { placeLabels, slotBox } from "../../core/services/labelPlacement.ts";

type TabId = "cabin" | "captain" | "journal" | "calendar" | "settings" | "save" | "map";

/** One drawn line of the release history, without the object that draws it. */
type ChangelogLine = { text: string; dx: number; size: number; bold: boolean; color: string };

/**
 * How far past the window the release history is drawn, so a notch of scroll
 * does not have to rebuild the slice. `scrollContent` moves 100 px at a time.
 */
const CHANGELOG_MARGIN = 240;

/**
 * How much two names on the chart may share before it counts as an overlap.
 *
 * The same 9 px `audit-layout.mjs` allows, and for the same reason: Dancing
 * Script's box carries about six pixels of slack over its glyphs, so two lines
 * that touch as boxes do not touch as ink. Placing against a smaller number
 * would move names that are already readable.
 */
const LABEL_OVERLAP = 9;

const ALL_TABS: TabId[] = ["cabin", "captain", "journal", "calendar", "settings", "save", "map"];

/** Phaser's names for the number row, in the order the tabs are drawn. */
const NUMBER_KEYS = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN"];

/**
 * What the open tab does with the keyboard, one line per tab.
 *
 * Until v0.84.0 this was `tab === "settings" ? t("options.hint") : ""` — a
 * legend on one tab of seven, on the screen that answers to more keys than any
 * other in the game. The keys that work on **every** tab (the numbers, the
 * arrows, PgUp/PgDn, Esc) are named once, on `menu.close_hint`, which is drawn
 * below this line and does not change.
 */
const TAB_HINT: Partial<Record<TabId, string>> = {
  cabin: "cabin.fleet_keys",
  settings: "options.hint",
  save: "save.hint",   // and `save.hint_empty`, see `tabHintFor`
};
const DLG_W = 672;
const DLG_H = 528;
const BORDER = 3;
const PAD = 14;

/**
 * The two glyphs a radio row can carry, in one column.
 *
 * `\u25b8` says *this is the setting in force*, `\u25B6` says *this is where the
 * cursor is*, and the row that was both printed only the first -- so walking
 * the cursor down the fourteen zoom levels made it vanish for exactly one
 * row, the one the captain was most likely looking for (v0.82.0). Both now,
 * in the same two character widths as before.
 */
function rowMarker(focused: boolean, active: boolean): string {
  if (focused && active) return "\u25B6\u25b8";
  if (focused) return "\u25B6 ";
  if (active) return "\u25b8 ";
  return "  ";
}

export class OptionsMenuScene extends Phaser.Scene {
  private worldState!: WorldState;
  private tabButtons: Phaser.GameObjects.Text[] = [];
  private contentContainer!: Phaser.GameObjects.Container;
  private dlgX = 0;
  private dlgY = 0;
  private contentBaseY = 0;
  private contentH = 0;

  /**
   * The release history, laid out and not drawn.
   *
   * It used to be drawn in full: **3 871 text objects, a column 55 289 px
   * tall, 99.1 % of it outside the screen.** The tab took **4.2 s** to open
   * where the next tab takes 0.39 s, and since every cursor move rebuilds the
   * tab, one press of Down on *Game speed* cost **4.0 s**. Now `syncChangelog`
   * draws the window and `changelogBottom` tells `getContentHeight` about the
   * part that is not there — without it the scroll floor is computed from the
   * drawn objects and the list can only be scrolled as far as it already has.
   */
  private changelogRows: PlacedRow<ChangelogLine>[] = [];
  private changelogDrawn: Phaser.GameObjects.Text[] = [];
  private changelogBottom = 0;
  private changelogX = 0;
  /** The window top the drawn slice was chosen for, or null when none is. */
  private changelogAt: number | null = null;
  /** Footer line saying what the open tab does with the keyboard. */
  private tabHint!: Phaser.GameObjects.Text;

  // Keyboard navigation state
  private activeTabIndex = 0;
  private selectedItemIndex = 0;
  private tabKeyCleanup: (() => void)[] = [];

  // Save/Load slot data cache for keyboard actions
  private saveSlotData: { slotId: string; hasData: boolean }[] = [];

  /**
   * The consort the captain has asked to put over the side, waiting on a
   * second press. Only ever set when something would go down with her.
   */
  private pendingAbandonIndex: number | null = null;

  /**
   * The tab showing wants the left and right arrows for itself this frame.
   *
   * Set while a volume row is focused on the settings tab; cleared by
   * `switchTab` so no tab can hold them after it stops being drawn.
   */
  private arrowsClaimed = false;

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
      { id: "journal", labelKey: "menu.tab_journal" },
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
      t("menu.close_hint"), txt(10, { color: HINT_ON_LIGHT })).setOrigin(0.5, 1);

    // What the open tab does with the keyboard. It used to be drawn *inside*
    // the scrolling container at its bottom edge, which put it on top of the
    // last two rows of the zoom list and would now ride up and down with the
    // scroll, so it shares the close button's line from the left instead
    // (v0.84.0).
    //
    // The button used to be centred, which left the hint 269 px of a 672 px
    // dialog — and the save tab's hint, which names five keys, is 480 px wide
    // and was drawn straight over `[ ZAMKNIJ ]` (v0.94.0). The button is at
    // the right margin now and the hint has the rest of the line. No wording
    // fixes this: shortening the hint to fit 269 px means dropping a key the
    // screen answers to.
    this.tabHint = this.add.text(this.dlgX + PAD + 8, this.dlgY + DLG_H - PAD - 14,
      "", txt(10, { color: HINT_ON_LIGHT }));
    this.tabHint.setOrigin(0, 1);

    // Close button
    const closeBtn = this.add.text(this.dlgX + DLG_W - PAD - 8, this.dlgY + DLG_H - PAD - 14,
      t("menu.close"), txt(13, { bold: true }));
    closeBtn.setOrigin(1, 1);
    closeBtn.setInteractive({ useHandCursor: true });
    closeBtn.on("pointerover", () => closeBtn.setColor("#555555"));
    closeBtn.on("pointerout", () => closeBtn.setColor("#1a1a1a"));
    closeBtn.on("pointerdown", () => this.closeMenu());

    // Global keyboard bindings
    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-ESC", () => this.closeMenu());
      this.input.keyboard.on("keydown-SPACE", () => this.closeMenu());
      // The number keys read `ALL_TABS`, which is the list the tab bar itself
      // is drawn from (v0.84.0). They used to be six lines naming tabs by hand
      // against a list of seven, and the hand-written copy had drifted: there
      // was no key for the journal at all, and from the third tab on every
      // number opened the tab **after** the one it named — `3` on a bar whose
      // third tab reads *Dziennik* opened *Kalendarz*. The same shape as the
      // HUD's two tables of row positions in v0.82.0, and found the same way:
      // by asking the running scene which keys it answers to.
      NUMBER_KEYS.forEach((name, i) => {
        const tab = ALL_TABS[i];
        if (tab) this.input.keyboard?.on("keydown-" + name, () => this.switchTab(tab));
      });

      // Left/Right arrow for tab switching -- unless the tab showing has asked
      // for them. The quartermaster's volume rows had, in a comment, since
      // they were written: *"left/right adjust volume when a vol: item is
      // focused"*, above a pair of bindings for `A` and `D`. `sound.hint` has
      // promised the arrows all along, and pressing one moved the captain to
      // the next tab (v0.81.0). Two listeners on one key cannot stop each
      // other, so the question is asked here instead.
      this.input.keyboard.on("keydown-LEFT", () => {
        if (this.arrowsClaimed) return;
        if (this.activeTabIndex > 0) {
          this.switchTab(ALL_TABS[this.activeTabIndex - 1]);
        }
      });
      this.input.keyboard.on("keydown-RIGHT", () => {
        if (this.arrowsClaimed) return;
        if (this.activeTabIndex < ALL_TABS.length - 1) {
          this.switchTab(ALL_TABS[this.activeTabIndex + 1]);
        }
      });

      // PageUp / PageDown move a page, less an overlap so the reader keeps a
      // line of what he was on. They used to move a flat 100 px against a
      // window of 470, which on the quartermaster's tab — 55 289 px of it,
      // nearly all release history — was **549 presses** to reach the end.
      // It is 119 now, which is still a lot, and that is about the screen
      // rather than about the key.
      const page = () => Math.max(100, this.contentH - 40);
      this.input.keyboard.on("keydown-PAGE_UP", () => this.scrollContent(-page()));
      this.input.keyboard.on("keydown-PAGE_DOWN", () => this.scrollContent(page()));
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
    this.syncChangelog();
  }

  /**
   * Draw the slice of the release history the window can see, and no more.
   *
   * `force` is for the first draw after a layout, when there is nothing drawn
   * and the remembered window is meaningless. Otherwise the slice is left
   * alone until the scroll has eaten into the margin, so a notch of the wheel
   * usually costs nothing at all.
   */
  private syncChangelog(force = false): void {
    if (this.changelogRows.length === 0) return;
    const top = this.contentBaseY - this.contentContainer.y;
    if (!force && this.changelogAt !== null
      && Math.abs(top - this.changelogAt) < CHANGELOG_MARGIN / 2) return;
    this.changelogAt = top;

    for (const drawn of this.changelogDrawn) drawn.destroy();
    this.changelogDrawn = [];

    for (const row of rowsInWindow(this.changelogRows, top, this.contentH, CHANGELOG_MARGIN)) {
      const line = row.item;
      const obj = this.add.text(this.changelogX + line.dx, row.y, line.text,
        txt(line.size, { bold: line.bold, color: line.color }));
      this.contentContainer.add(obj);
      this.changelogDrawn.push(obj);
    }
  }

  private clearTabKeyboard(): void {
    for (const cleanup of this.tabKeyCleanup) cleanup();
    this.tabKeyCleanup = [];
  }

  /**
   * The open tab's own line of keys.
   *
   * The cabin's two are gated on there being a consort to move the cursor over
   * — the list is one row long without one, and a legend that names a key
   * nothing binds is the defect v0.81.0 removed from the other end of this
   * screen. The save tab's follows the slot under the cursor; everything else
   * is the same line every time the tab is open.
   */
  private tabHintFor(tab: TabId): string {
    if (tab === "cabin") {
      return (this.worldState.player.fleet ?? []).length > 0 ? t("cabin.fleet_keys") : "";
    }
    // `L` and `Delete/X` act only on a slot that holds a game, so a fresh
    // captain -- five empty slots -- was promised two keys that did nothing
    // (v0.96.0). The line follows the slot under the cursor.
    if (tab === "save") {
      return t(this.saveSlotData[this.selectedItemIndex]?.hasData ? "save.hint" : "save.hint_empty");
    }
    const key = TAB_HINT[tab];
    return key ? t(key) : "";
  }

  private bindTabKey(event: string, handler: () => void): void {
    if (!this.input.keyboard) return;
    this.input.keyboard.on(event, handler);
    this.tabKeyCleanup.push(() => this.input.keyboard?.off(event, handler));
  }

  /**
   * Redrawing the tab the captain is already on never moves his cursor.
   *
   * The same defect as `PortScene.switchView`, in a second scene and found the
   * same way (v0.80.0): the save slots and the quartermaster's settings move
   * their cursor by incrementing `selectedItemIndex` and redrawing the tab,
   * and the redraw put it straight back on the first row. Verified on the
   * running game: two presses of Down on the settings tab leave the arrow on
   * *Game speed*, which is where it started.
   *
   * Leaving the tab still starts the next one at the top, which is right.
   *
   * The scroll position follows the same rule for the same reason (v0.82.0):
   * every cursor move redraws the tab, so snapping the container back to the
   * top on a redraw meant the captain could scroll the settings list down and
   * lose it again on his next press of Down.
   */
  private switchTab(tab: TabId): void {
    const sameTab = ALL_TABS[this.activeTabIndex] === tab;
    const keptScroll = sameTab ? this.contentContainer.y : this.contentBaseY;
    this.activeTabIndex = ALL_TABS.indexOf(tab);
    this.arrowsClaimed = false;
    if (!sameTab) this.selectedItemIndex = 0;
    this.clearTabKeyboard();

    for (let i = 0; i < this.tabButtons.length; i++) {
      if (ALL_TABS[i] === tab) {
        this.tabButtons[i].setColor("#1a1a1a");
      } else {
        this.tabButtons[i].setColor("#999999");
      }
    }

    this.contentContainer.removeAll(true);
    // `removeAll(true)` has already destroyed the drawn slice; what is left is
    // the plan, and a stale plan would have `getContentHeight` answering about
    // a tab that is no longer showing.
    this.changelogRows = [];
    this.changelogDrawn = [];
    this.changelogBottom = 0;
    this.changelogAt = null;
    this.contentContainer.y = keptScroll;
    this.tabHint.setText(this.tabHintFor(tab));

    switch (tab) {
      case "cabin": this.renderCabin(); break;
      case "captain": this.renderCaptain(); break;
      case "journal": this.renderJournal(); break;
      case "calendar": this.renderCalendar(); break;
      case "save": this.renderSave(); break;
      case "map": this.renderMap(); break;
      case "settings": this.renderSettings(); break;
    }
  }

  /**
   * The captain's own list of what he has agreed to do.
   *
   * `activeQuests` has existed since v0.12.0 and was called from nowhere: the
   * treasure hunts, the family thread and now the governor's defence commission
   * all lived entirely in the log lines they printed as they moved. That was
   * survivable while every quest was a place to dig; a commission with a
   * deadline that the player cannot look up is a promise he cannot keep.
   */
  private renderJournal(): void {
    const x = this.dlgX + PAD;
    let y = 0;

    const open = activeQuests(this.worldState, buildQuestRegistry(this.worldState));
    if (open.length === 0) {
      this.contentContainer.add(
        this.add.text(x, y, t("journal.empty"), txt(12, { color: "#666666" })),
      );
      return;
    }

    for (const { def, stage } of open) {
      const title = this.add.text(x, y, t(def.titleKey, stage.vars), txt(13, { bold: true }));
      this.contentContainer.add(title);
      y += title.height + 2;

      const line = this.add.text(x + 12, y, t(stage.objectiveKey, stage.vars),
        { ...txt(11, { color: "#444444" }), wordWrap: { width: DLG_W - PAD * 2 - 12 } });
      this.contentContainer.add(line);
      y += line.height + 12;
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

    // The sick bay is drawn only on the days there is one (v0.47.0). It is
    // the only place the men off the roll but still aboard can be seen, and
    // without it a crew climbing back on its own over the fortnight after a
    // fight would read as a bug rather than as the surgeon.
    const below = Math.round(ship.wounded ?? 0);
    const crewText = this.add.text(x + 10, y,
      `${t("hud.crew", { current: ship.crew.current, max: ship.crew.max })}\n${t("hud.morale", { pct: Math.round(ship.crew.morale * 100) })}`
      + (below > 0 ? `\n${t("cabin.wounded", { count: below })}` : ""),
      txt(12));
    this.contentContainer.add(crewText);
    // Measured, not counted. The block was two lines and the next element sat
    // at a hardcoded +36 — which already grazed the second line and buried the
    // third the day there was one. Caught on a screenshot, as these always are.
    y += crewText.height + 10;

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
    y += 16;

    // Training bar — crew experience under this captain's command (0..1).
    const training = Math.max(0, Math.min(1, this.worldState.captain?.training ?? 0.3));
    const trainingLabel = this.add.text(x + 10, y,
      t("cabin.training", { pct: Math.round(training * 100) }),
      txt(12));
    this.contentContainer.add(trainingLabel);
    // Same measured gap as above. 16 px was less than a line of this font, so
    // the bar has been drawn across the label it belongs to since v0.21.0.
    y += trainingLabel.height + 6;
    const tBg = this.add.rectangle(x + 10, y, 200, 10, 0xdddddd);
    tBg.setOrigin(0, 0.5);
    this.contentContainer.add(tBg);
    const trainColor = training > 0.66 ? 0x66aa66 : training > 0.33 ? 0xbb9966 : 0xcc6666;
    const tBar = this.add.rectangle(x + 10, y, 200 * training, 10, trainColor);
    tBar.setOrigin(0, 0.5);
    this.contentContainer.add(tBar);
    const tBorder = this.add.graphics();
    tBorder.lineStyle(1, 0x999999, 1);
    tBorder.strokeRect(x + 10, y - 5, 200, 10);
    this.contentContainer.add(tBorder);
    y += 16;

    // Cargo manifest
    const cargoTitle = this.add.text(x, y, t("cabin.cargo_title"), txt(14, { bold: true }));
    this.contentContainer.add(cargoTitle);
    y += 20;

    // The whole squadron's hold (v0.77.0) — the consorts carry cargo now, and
    // a manifest that named only the flagship's would be short by a hull.
    const cargoSummary = this.add.text(x + 10, y,
      t("hud.cargo", {
        current: Math.round(squadronStowed(this.worldState)),
        max: squadronCap(this.worldState),
      }), txt(12, { color: "#555555" }));
    this.contentContainer.add(cargoSummary);
    y += 18;

    const cargoEntries = Object.entries(squadronManifest(this.worldState)).filter(([_, qty]) => qty > 0);
    if (cargoEntries.length === 0) {
      this.contentContainer.add(this.add.text(x + 10, y, t("cabin.no_cargo"), txt(11, { color: "#888888" })));
      y += 16;
    } else {
      // Two columns. The manifest is one of three lists on this tab whose
      // length is a fact about the game rather than about the layout, and with
      // six goods aboard and two consorts astern the block ran off the bottom
      // of the panel and under `[ CLOSE ]` (v0.80.0). Seven goods exist, so
      // four rows is the most this can ever be.
      const rows = Math.ceil(cargoEntries.length / 2);
      for (let i = 0; i < cargoEntries.length; i++) {
        const [itemKey, qty] = cargoEntries[i];
        const name = t("item." + itemKey + ".name");
        this.contentContainer.add(this.add.text(
          x + 10 + (i < rows ? 0 : 200), y + (i % rows) * 16,
          `${name}: ${Math.round(qty)}`, txt(11)));
      }
      y += rows * 16;
    }
    y += 12;

    // Ship info
    const shipTitle = this.add.text(x, y, t("cabin.ships_title"), txt(14, { bold: true }));
    this.contentContainer.add(shipTitle);
    y += 20;

    const shipClassName = t("ship." + (ship.classId as string) + ".name");
    // What it takes to work her, against what she has (v0.49.0). `crewMin` was
    // printed in the shipyard's column and on the help screen and read by
    // nothing that sailed; this is the line that makes it a fact about *this*
    // ship rather than a fact about her class.
    const flagTier = manningTier(ship.crew.current, ship.classId as string);
    const shipInfo = this.add.text(x + 10, y,
      `1. ${shipClassName} (${t("fleet.flagship")})\n` +
      `   ${t("hud.hull", { current: Math.round(ship.hullHp), max: ship.hullMax })}` +
      `  |  ${t("hud.sails", { current: Math.round(ship.sailsHp), max: ship.sailsMax })}` +
      `  |  ${t("cabin.cannons", { count: ship.cannons })}` +
      `  |  ${t("cabin.hands", { men: Math.round(ship.crew.current), need: workingMinimum(ship.classId as string) })}` +
      (flagTier.id === "full" ? "" : `  ${t(flagTier.nameKey)}`),
      { ...txt(11), lineSpacing: 4 });
    this.contentContainer.add(shipInfo);
    y += 38;

    // Fleet ships — show with abandon button (at-sea action; sell is in shipyard)
    const fleet = player.fleet ?? [];
    const captainTraining = this.worldState.captain?.training ?? 0.3;
    if (fleet.length > 0) {
      for (let i = 0; i < fleet.length; i++) {
        const fs = fleet[i];
        const fsClassName = t("ship." + fs.classId + ".name");
        const fsInfo = this.add.text(x + 10, y,
          `${i + 2}. ${fsClassName}\n` +
          `   ${t("hud.hull", { current: Math.round(fs.hullHp), max: fs.hullMax })}` +
          `  |  ${t("hud.sails", { current: Math.round(fs.sailsHp), max: fs.sailsMax })}` +
          `  |  ${t("cabin.cannons", { count: fs.cannons })}` +
          `  |  ${t("hud.crew", { current: consortCrew(fs), max: consortCrewMax(fs) })}` +
          (manningTier(consortCrew(fs), fs.classId).id === "full"
            ? ""
            : `  ${t(manningTier(consortCrew(fs), fs.classId).nameKey)}`) +
          // Second line. v0.77.0 put the hold on the end of a row that was
          // already the full width of the panel, and the last reading was
          // being drawn on the map behind it -- the same defect as the
          // shipyard's button in v0.79.0, in a string instead of a position.
          `
   ${t("hud.cargo", { current: Math.round(stowedIn(consortCargo(fs))), max: consortCargoCap(fs) })}` +
          `  |  ${t("hud.morale", { pct: Math.round(consortMorale(fs) * 100) })}` +
          `  |  ${t("cabin.training", { pct: Math.round(consortTraining(fs, captainTraining) * 100) })}` +
          ((fs.wounded ?? 0) > 0 ? `  |  ${t("cabin.wounded", { count: Math.round(fs.wounded ?? 0) })}` : ""),
          { ...txt(11), lineSpacing: 4 });
        this.contentContainer.add(fsInfo);

        const fsIdx = i;
        const armed = this.pendingAbandonIndex === i;
        const focused = this.selectedItemIndex === i;
        if (focused) {
          this.contentContainer.add(this.add.text(x - 2, y, "▶", txt(10, { bold: true })));
        }
        const abandonBtn = this.add.text(x + 320, y,
          armed ? t("fleet.abandon_confirm") : t("fleet.abandon"),
          txt(11, { bold: true, color: "#aa3333" }));
        abandonBtn.setInteractive({ useHandCursor: true });
        abandonBtn.on("pointerdown", () => this.askAbandonFleet(fsIdx));
        this.contentContainer.add(abandonBtn);

        y += 56;
      }

      if (this.pendingAbandonIndex !== null) {
        // Its own line, full width: the sentence does not fit in the button,
        // and a label that runs off the panel is the defect v0.79.0 removed
        // from the screen next door.
        this.contentContainer.add(this.add.text(x + 10, y,
          t("fleet.abandon_warning", {
            tons: Math.round(stowedIn(spillIfDetached(this.worldState, this.pendingAbandonIndex))),
          }),
          txt(11, { bold: true, color: "#aa3333" })));
        y += 18;
      }

      // Keyboard. `[Abandon]` was a mouse button and nothing else — the last
      // transaction in the game with no key behind it after v0.79.0 gave the
      // shipyard its `F`, and the one that throws cargo into the sea.
      const cabinTab = ALL_TABS[this.activeTabIndex];
      this.bindTabKey("keydown-UP", () => {
        if (this.selectedItemIndex > 0) { this.selectedItemIndex--; this.switchTab(cabinTab); }
      });
      this.bindTabKey("keydown-DOWN", () => {
        if (this.selectedItemIndex < fleet.length - 1) {
          this.selectedItemIndex++;
          this.switchTab(cabinTab);
        }
      });
      this.bindTabKey("keydown-X", () => this.askAbandonFleet(this.selectedItemIndex));



      // One line for the whole squadron (v0.49.0): a captain with three hulls
      // and one ship's worth of people should be able to read that off a
      // single row rather than adding up three.
      const squadron = fleetManning(ship.classId as string, ship.crew.current, fleet);
      const squadronLine = this.add.text(x + 10, y,
        t("cabin.fleet_hands", { men: squadron.men, need: squadron.min }),
        txt(11, { color: squadron.short ? "#aa3333" : "#666666" }));
      this.contentContainer.add(squadronLine);
      // The squadron's two keys are named on the hint line at the foot of the
      // panel (v0.84.0), with every other key this screen answers to. They used
      // to be drawn here, inside the scrolling container — so they rode up out
      // of sight with the list they describe — in a grey nobody had measured.
      y += squadronLine.height + 6;
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

  /**
   * Put a hull over the side — after asking, if anything goes down with her.
   *
   * Same rule and same reason as the yard's `[Sell]` (v0.80.0): a consort has
   * carried cargo since v0.77.0, this was one unconfirmed click, and what she
   * is holding is the larger half of a squadron's hold in most pairings. An
   * empty hull still goes on the first press — a confirmation that fires when
   * nothing is at stake teaches the captain to press through it.
   */
  private askAbandonFleet(index: number): void {
    const goesDown = stowedIn(spillIfDetached(this.worldState, index));
    if (goesDown <= 0 || this.pendingAbandonIndex === index) {
      this.pendingAbandonIndex = null;
      this.doAbandonFleet(index);
      return;
    }
    this.pendingAbandonIndex = index;
    this.selectedItemIndex = index;
    this.switchTab("cabin");
  }

  private doAbandonFleet(index: number): void {
    this.pendingAbandonIndex = null;
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

    y = this.renderCrowns(x, y + 12);
  }

  /**
   * What the crowns are doing to each other, on the page where the captain
   * already reads what they think of him.
   *
   * Until v0.51.0 a war was only ever a line in the log: `getActiveWars` had
   * been exported since the event layer was written and called from nowhere, so
   * a captain who was at sea on the morning England declared could not find out
   * that she had. It matters at the counter now — his patron's letter covers a
   * prize taken from his patron's enemy and embarrasses him with anyone else —
   * so the state of the crowns has to be somewhere he can look it up, and this
   * is where standing already lives.
   *
   * The second line is the alliance the game did not have a word for: two
   * crowns fighting the same third crown. Whether it holds is still read off
   * today's wars and disappears with them — but since v0.55.0 the day it began
   * is stamped in an `alliance` event, so the line can say how long it has
   * stood. That is the half of it a computation could never answer.
   */
  private renderCrowns(x: number, startY: number): number {
    let y = startY;
    this.contentContainer.add(
      this.add.text(x, y, t("captain.crowns_title"), txt(13, { bold: true })));
    y += 20;

    const name = (key: string) => t("faction." + key + ".name");
    let said = false;

    for (const crown of CROWNS) {
      const foes = enemiesOf(this.worldState, crown);
      const friends = CROWNS.filter(
        other => other !== crown && coBelligerentAgainst(this.worldState, crown, other).length > 0,
      );
      if (foes.length === 0 && friends.length === 0) continue;
      said = true;

      const parts: string[] = [];
      if (foes.length > 0) parts.push(t("captain.at_war", { enemies: foes.map(name).join(", ") }));
      if (friends.length > 0) {
        const since = (other: string) => {
          const day = alliedSince(this.worldState, crown, other);
          return day === undefined
            ? name(other)
            : `${name(other)} (${Math.max(0, this.worldState.time.day - day)}d)`;
        };
        parts.push(t("captain.allied_with", { allies: friends.map(since).join(", ") }));
      }

      const line = this.add.text(
        x + 10, y, `${name(crown)}: ${parts.join(" · ")}`,
        { ...txt(11, { color: foes.length > 0 ? "#8a3a3a" : "#3a5a8a" }),
          wordWrap: { width: DLG_W - PAD * 2 - 20 } },
      );
      this.contentContainer.add(line);
      y += line.height + 2;
    }

    if (!said) {
      this.contentContainer.add(
        this.add.text(x + 10, y, t("captain.crowns_peace"), txt(11, { color: "#666666" })));
      y += 16;
    }

    return y;
  }

  // ---- Tab 3: Calendar & Events ----

  private renderCalendar(): void {
    const cx = this.cameras.main.width / 2;
    let y = 0;

    // With the world's own start year, since v0.63.0. Without it the helper
    // falls back to DEFAULT_START_YEAR, so this tab printed 1690 in FIVE of the
    // six eras while the HUD two inches away printed the right one - the same
    // shape as every other second reading this project has found: one caller
    // passes the argument and the other never learned it existed.
    const cal = dayToCalendar(this.worldState.time.day, this.worldState.startYear);
    const dateStr = formatCalendarDay(this.worldState.time.day, this.worldState.startYear);
    const { hh, mm } = clockHHMM(this.worldState.time);

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
        const stamp = clockHHMM(evt);
        const timePrefix = `[D${evt.day} ${stamp.hh}:${stamp.mm}]`;
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

    // Hardcoded English until v0.63.0, in a screen every other line of which
    // goes through t(). It survived because no_hardcoded_text.test.ts looks for
    // POLISH letters in a literal: the one language it cannot see is the one
    // the build defaults to.
    const dayNames = ["mo", "tu", "we", "th", "fr", "sa", "su"].map(d => t("calendar.day_" + d));
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

    // The slot list comes out of IndexedDB, so it arrives after this method
    // has returned -- and by then the captain may have pressed the right arrow
    // and be looking at another tab. `switchTab` empties the container before
    // it draws, but it cannot empty something that has not been drawn yet, so
    // the slots were painted **over** whatever tab was open when the read came
    // back. Seen on the screen: the five save slots and their hint line
    // standing on top of the chart (v0.81.0).
    const tabAtRequest = ALL_TABS[this.activeTabIndex];
    listSaves().then((existingSaves) => {
      if (ALL_TABS[this.activeTabIndex] !== tabAtRequest) return;
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
        label = `${t("save.slot_label", { n: String(slotIdx + 1), day: String(saveTitleDay(existing.title)) })} (${dateStr})`;
      } else {
        label = `Slot ${slotIdx + 1}: ${t("save.slot_empty")}`;
      }

      const marker = isFocused ? "\u25B6 " : "  ";
      this.contentContainer.add(
        this.add.text(x, y, marker + label, txt(12, {
          color: isFocused ? "#000000" : (existing ? "#1a1a1a" : "#999999"),
          bold: isFocused,
        })));

      // The buttons are laid from the right edge inward, each by its measured
      // width, in the same three columns whether the slot is full or empty.
      // They stood at fixed offsets of 140, 80 and 20 px, which fitted `[Del]`
      // and put `[Usuń]` over the panel's border (v0.96.0).
      const buttons: { key: string; color: string; act: () => void; live: boolean }[] = [
        { key: "save.btn_save", color: "#2a7a2a", act: () => this.doSave(slotId), live: true },
        { key: "save.btn_load", color: "#2266aa", act: () => this.doLoad(slotId), live: !!existing },
        { key: "save.btn_delete", color: "#aa2222", act: () => this.doDelete(slotId), live: !!existing },
      ];
      let btnRight = rightX;
      for (let b = buttons.length - 1; b >= 0; b--) {
        const btn = this.add.text(btnRight, y, t(buttons[b].key), txt(12, { bold: true, color: buttons[b].color }));
        btn.setOrigin(1, 0);
        btnRight -= btn.width + 10;
        if (!buttons[b].live) { btn.destroy(); continue; }
        btn.setInteractive({ useHandCursor: true });
        btn.on("pointerdown", buttons[b].act);
        this.contentContainer.add(btn);
      }

      y += 24;
    }

    // The keys are named once, on the tab's own line at the foot of the
    // panel. Until v0.96.0 the same legend was drawn a second time here, under
    // the slots -- two copies of one promise, and the one at the foot was
    // unconditional. It follows the focused slot now, and the slots have only
    // just been read, so the line is written again.
    this.tabHint.setText(this.tabHintFor("save"));
    y += 8;

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
      this.add.text(x + 10, y, t("sound.hint"), txt(10, { color: HINT_ON_LIGHT })));
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
      const marker = rowMarker(isItemFocused, isActive);
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

    const hint = this.add.text(x + 10, y, t("settings.style_hint"), txt(10, { color: HINT_ON_LIGHT }));
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
      const label = rowMarker(isItemFocused, isActive) + t("settings.zoom." + level);
      const color = isItemFocused ? "#000000" : isActive ? "#1a1a1a" : "#888888";
      const zoomBtn = this.add.text(x + 10, y, label, txt(12, { bold: isActive || isItemFocused, color }));
      if (!isActive) {
        zoomBtn.setInteractive({ useHandCursor: true });
        // No poke at the chart's camera: `CameraController.update()` reads the
        // setting every frame since v0.97.0. The poke used to be undone by it.
        zoomBtn.on("pointerdown", () => {
          setZoomLevel(level);
          this.switchTab("settings");
        });
      }
      this.contentContainer.add(zoomBtn);
      y += 20;
    }

    const zoomHint = this.add.text(x + 10, y, t("settings.zoom_hint"), txt(10, { color: HINT_ON_LIGHT }));
    this.contentContainer.add(zoomHint);
    y += 32;

    // Debug mode toggle
    this.contentContainer.add(
      this.add.text(x, y, t("settings.debug"), txt(13, { bold: true })));
    y += 22;

    // Through `isDebugMode()` since v0.98.0. This row read the key itself and
    // took an unset one for ON, so a fresh install showed `Debug: ON` in red
    // while the module that owns the switch said off \u2014 and the chart, reading
    // it a fourth way, turned the fog of war off for good on the strength of it.
    settingsItems.push({ type: "debug", y });
    const debugOn = isDebugMode();
    const debugLabel = (debugOn ? "\u25B8 " : "  ")
      + `${t("settings.debug")}: ${t(debugOn ? "settings.on" : "settings.off")}`;
    const debugColor = debugOn ? "#cc4444" : "#888888";
    const debugBtn = this.add.text(x + 10, y, debugLabel, txt(12, { bold: debugOn, color: debugColor }));
    debugBtn.setInteractive({ useHandCursor: true });
    debugBtn.on("pointerdown", () => {
      setDebugMode(!debugOn);
      this.switchTab("settings");
    });
    this.contentContainer.add(debugBtn);
    y += 28;

    // Fog of War (spyglass range) toggle
    settingsItems.push({ type: "fog", y });
    const fogOn = isFogEnabled();
    const fogLabel = (fogOn ? "\u25B8 " : "  ")
      + `${t("settings.fog_label")}: ${t(fogOn ? "settings.on" : "settings.off")}`;
    const fogColor = fogOn ? "#2266aa" : "#888888";
    const fogBtn = this.add.text(x + 10, y, fogLabel, txt(12, { bold: fogOn, color: fogColor }));
    fogBtn.setInteractive({ useHandCursor: true });
    fogBtn.on("pointerdown", () => {
      setFogEnabled(!fogOn);
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

    // Pirate icon sampler — each letter = different pirate symbol, with the
    // letter under it so a glyph can be named.
    //
    // Broken into rows by hand. `wordWrap` was asked to hold it to the dialog
    // and could not: the alphabet is one word, and Phaser wraps on spaces. It
    // was drawn **865 px wide inside a 470 px window** — 215 px past the right
    // edge of the screen, in a container that only scrolls down, so nothing
    // could ever bring the tail of it back (v0.94.0).
    const SAMPLER_PER_ROW = 13;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    for (let i = 0; i < alphabet.length; i += SAMPLER_PER_ROW) {
      const chunk = alphabet.slice(i, i + SAMPLER_PER_ROW);
      const sampler = this.add.text(x, y, chunk.split("").join("  "), {
        fontFamily: PIRATE_ICONS_FONT, fontSize: "18px", color: "#555555", resolution: TEXT_RES,
      });
      this.contentContainer.add(sampler);
      y += sampler.height + 2;

      const labels = this.add.text(x, y, chunk.split("").join("     "), txt(7, { color: "#999999" }));
      this.contentContainer.add(labels);
      y += labels.height + 8;
    }
    y += 4;

    // 115 entries and 3 708 lines of them. Laid out here and drawn a window at
    // a time: the arithmetic is in `core/services/longList.ts`, where it can be
    // checked, and the reason is in the field declaration above.
    const lines: Array<{ item: ChangelogLine; h: number }> = [];
    for (const entry of CHANGELOG) {
      const header = t("changelog.version", { version: entry.version, date: entry.date });
      lines.push({
        // The gap after an entry rides on its last line, so an entry with no
        // changes at all still leaves it behind.
        h: entry.changes.length === 0 ? 22 : 16,
        item: { text: header, dx: 4, size: 11, bold: true, color: "#333333" },
      });
      entry.changes.forEach((change, i) => {
        lines.push({
          h: i === entry.changes.length - 1 ? 20 : 14,
          item: { text: `\u2022 ${change}`, dx: 14, size: 10, bold: false, color: "#555555" },
        });
      });
    }
    const placed = placeRows(lines, y);
    this.changelogRows = placed.rows;
    this.changelogBottom = placed.bottom;
    this.changelogX = x;
    this.syncChangelog(true);

    // The list is longer than the window, so the window follows the cursor.
    // Drawn last, because the row positions are only known once the whole tab
    // has been laid out.
    const focusedRow = settingsItems[this.selectedItemIndex];
    if (focusedRow) this.revealRow(focusedRow.y);

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
        this.switchTab("settings");
      } else if (item.type === "fog") {
        // The keyboard path kept its own copy of both readings, and its debug
        // one disagreed with `isDebugMode()` in the same way (v0.98.0).
        setFogEnabled(!isFogEnabled());
        this.switchTab("settings");
      } else if (item.type === "debug") {
        setDebugMode(!isDebugMode());
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
    // The arrows, which is what `sound.hint` has always said, and `A`/`D`
    // beside them because that is what was bound instead. The claim is what
    // keeps the arrow from also turning the page: see `create()`.
    const focused = settingsItems[this.selectedItemIndex];
    this.arrowsClaimed = !!focused?.type.startsWith("vol:");
    this.bindTabKey("keydown-LEFT", () => adjustVolume(-1));
    this.bindTabKey("keydown-RIGHT", () => adjustVolume(1));
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

    // Port dots and labels.
    //
    // Every name used to sit directly above its dot, which on a chart at 0.153
    // of scale put **seven pairs of them on top of each other** and hung
    // Barbados 3 px over the eastern edge — eight of forty-five names
    // unreadable, with nothing wrong in the four lines that drew them
    // (v0.94.0). Where a crowded name goes is arithmetic, and it lives in
    // `core/services/labelPlacement.ts` where it can be checked.
    const drawn = Object.entries(PORTS).map(([key, port]) => {
      const text = this.add.text(0, 0, t("port." + key + ".name"), txt(7, { color: "#333333" }));
      text.setOrigin(0.5, 0.5);
      return { text, x: offsetX + port.pos.x * scale, y: offsetY + port.pos.y * scale };
    });
    const slots = placeLabels(
      drawn.map(d => ({ x: d.x, y: d.y, w: d.text.width, h: d.text.height })),
      LABEL_OVERLAP,
      { x: offsetX, y: offsetY, w: mapDisplayW, h: mapDisplayH },
    );
    drawn.forEach((d, i) => {
      g.fillStyle(0x1a1a1a, 1);
      g.fillCircle(d.x, d.y, 2);
      const box = slotBox({ x: d.x, y: d.y, w: d.text.width, h: d.text.height }, slots[i]);
      d.text.setPosition(box.x + box.w / 2, box.y + box.h / 2);
      this.contentContainer.add(d.text);
    });

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

  /**
   * How tall the drawn tab is, in the container's own coordinates.
   *
   * `getBounds()` answers in world coordinates, so it already carries whatever
   * the container has been scrolled by. Subtracting `contentBaseY` — the
   * container's *unscrolled* position — was therefore only correct on the
   * first measurement: every notch of scroll made the content measure shorter
   * by exactly as much as the captain had scrolled, and `scrollContent`'s
   * floor rose to meet him. The settings tab ends in the whole changelog and
   * could not be scrolled to the end of it (v0.82.0).
   */
  private getContentHeight(): number {
    let maxY = 0;
    this.contentContainer.each((child: Phaser.GameObjects.GameObject) => {
      const go = child as unknown as { getBounds?: () => Phaser.Geom.Rectangle };
      if (go.getBounds) {
        const b = go.getBounds();
        const localBottom = b.y + b.height - this.contentContainer.y;
        if (localBottom > maxY) maxY = localBottom;
      }
    });
    // The release history is only drawn a window at a time, so the drawn
    // objects say nothing about where the tab ends. Without this the scroll
    // floor would follow the slice and the captain could never reach the
    // bottom — the v0.82.0 defect back in a new shape.
    return Math.max(maxY, this.changelogBottom) + 10;
  }

  /**
   * Bring the focused row into the window.
   *
   * A cursor that moves and a window that does not is a list the captain
   * navigates blind: the settings tab is twenty-five rows long, the window
   * holds seventeen, and ten presses of Down put the marker somewhere below
   * the mask with nothing on the screen to say where. Seen on a screenshot —
   * the same way as v0.80.0's cursor and v0.81.0's arrows (v0.82.0).
   *
   * `rowY` is the row's own y inside the container, as the render loop
   * recorded it.
   */
  private revealRow(rowY: number, rowH = 24): void {
    const wanted = offsetRevealing(
      this.contentContainer.y, rowY, rowH, this.contentBaseY, this.contentH);
    if (wanted === this.contentContainer.y) return;

    const minY = this.contentBaseY - Math.max(0, this.getContentHeight() - this.contentH);
    this.contentContainer.y = Phaser.Math.Clamp(wanted, minY, this.contentBaseY);
    this.syncChangelog();
  }

  private closeMenu(): void {
    this.scene.stop();
    this.scene.resume("MainMapScene");
  }
}
