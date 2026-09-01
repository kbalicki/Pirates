import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import type { PortId } from "../../core/model/ids.ts";
import { itemId, shipClassId } from "../../core/model/ids.ts";
import { PORTS } from "../../core/data/ports.ts";
import { FACTIONS } from "../../core/data/factions.ts";
import { ITEMS } from "../../core/data/items.ts";
import { SHIP_CLASSES } from "../../core/data/ships.ts";
import { getRankNameKey } from "../../core/data/ranks.ts";
import { executeBuy, executeSell } from "../../core/systems/EconomySystem.ts";
import {
  requestLetterOfMarque,
  recruitCrew,
  buyRoundOfDrinks,
  getRumorKey,
  repairShip,
  buyShip,
  buyShipToFleet,
  sellFleetShip,
} from "../../core/systems/PortInteractionSystem.ts";
import { canAddToFleet, fleetSize } from "../../core/systems/FleetSystem.ts";
import { getPortNews } from "../../core/systems/WorldEventSystem.ts";
import { getReputationLevel } from "../../core/systems/ReputationSystem.ts";
import {
  startDialogue,
  currentNode,
  visibleOptions,
  chooseOption,
  type DialogueRuntime,
  type DialogueTree,
} from "../../core/systems/DialogueSystem.ts";
import { governorTree, EFFECT_GRANT_LETTER, EFFECT_RETIRE } from "../../core/data/dialogues.ts";
import { captainAge } from "../../core/systems/AgingSystem.ts";
import { computeScore, retire, hasRetired } from "../../core/systems/RetirementSystem.ts";
import { dividePlunder, plunderStatus } from "../../core/systems/PlunderSystem.ts";
import { t } from "../../core/i18n/index.ts";
import { txt } from "../ui/textStyle.ts";
import { usesParchmentUI } from "../settings/AssetPack.ts";

const DLG_W = 470;
const DLG_H = 420;
const BORDER = 3;
const PAD = 16;

type PortView = "menu" | "governor" | "tavern" | "merchant" | "shipyard";

// Ships available at each shipyard level
const SHIPYARD_TIERS: Record<number, string[]> = {
  1: ["pinnace", "sloop"],
  2: ["pinnace", "sloop", "barque", "brigantine", "fluyt"],
  3: ["pinnace", "sloop", "barque", "brigantine", "fluyt", "merchantman", "frigate"],
  4: ["pinnace", "sloop", "barque", "brigantine", "fluyt", "merchantman", "frigate", "fast_galleon", "galleon"],
};

export class PortScene extends Phaser.Scene {
  private worldState!: WorldState;
  private currentPortId!: PortId;
  private currentView: PortView = "menu";

  // Layout anchors
  private cx = 0;
  private cy = 0;
  private dlgX = 0;
  private dlgY = 0;
  private infoX = 0;

  // Swappable content area
  private contentContainer!: Phaser.GameObjects.Container;
  private contentStartY = 0;

  /** One-shot line under the tavern actions, e.g. "nothing to divide". */
  private tavernMessage: string | null = null;

  /** Governor conversation in progress; rebuilt whenever the view is entered. */
  private governorDialogue: { tree: DialogueTree; runtime: DialogueRuntime } | null = null;

  // Keyboard cleanup
  private keyboardCleanup: (() => void)[] = [];

  // Arrow-selector state
  private selectedIndex = 0;
  private selectionBar: Phaser.GameObjects.Rectangle | null = null;
  private arrow: Phaser.GameObjects.Text | null = null;
  private actionTexts: Phaser.GameObjects.Text[] = [];
  private actions: { label: string; key: string }[] = [];

  constructor() {
    super({ key: "PortScene" });
  }

  private isOnFoot = false;

  init(data: { worldState: WorldState; portId: PortId; returnToView?: PortView; isOnFoot?: boolean }): void {
    this.worldState = data.worldState;
    this.currentPortId = data.portId;
    this.currentView = data.returnToView ?? "menu";
    this.isOnFoot = data.isOnFoot ?? false;
  }

  create(): void {
    const portKey = this.currentPortId as string;
    const portDef = PORTS[portKey];
    if (!portDef) return;

    const cam = this.cameras.main;
    this.cx = cam.width / 2;
    this.cy = cam.height / 2;
    this.dlgX = this.cx - DLG_W / 2;
    this.dlgY = this.cy - DLG_H / 2;
    this.infoX = this.dlgX + PAD;

    // Dark overlay
    this.add.rectangle(this.cx, this.cy, cam.width, cam.height, 0x000000, 0.55);

    // Dialog panel
    if (usesParchmentUI() && this.textures.exists("parchment_panel")) {
      const panel = this.add.image(this.cx, this.cy, "parchment_panel");
      panel.setDisplaySize(DLG_W + 40, DLG_H + 30);
      panel.setAlpha(0.95);
    } else {
      this.add.rectangle(this.cx, this.cy, DLG_W + BORDER * 2, DLG_H + BORDER * 2, 0x222222);
      this.add.rectangle(this.cx, this.cy, DLG_W, DLG_H, 0xffffff);
    }

    // --- Persistent header ---
    const faction = FACTIONS[portDef.factionId as string];
    const factionColor = faction?.color ?? 0xaaaaaa;
    const factionHex = `#${factionColor.toString(16).padStart(6, "0")}`;
    const factionKey = portDef.factionId as string;

    let y = this.dlgY + PAD;

    // Port name
    this.add.text(this.cx, y, t("port." + portKey + ".name"), txt(20, { bold: true })).setOrigin(0.5, 0);
    y += 26;

    // Faction & type
    this.add.text(
      this.cx, y,
      `${t("port_type." + portDef.type)} \u2014 ${t("faction." + factionKey + ".name")}`,
      txt(12, { color: factionHex }),
    ).setOrigin(0.5, 0);
    y += 20;

    // Player info bar
    const player = this.worldState.player;
    const playerShip = this.worldState.entities[player.shipId as string];

    this.add.text(this.infoX, y, `${t("hud.gold")}: ${player.gold}`, txt(12, { bold: true }));
    if (playerShip?.ship) {
      const totalCargo = Math.floor(Object.values(playerShip.ship.cargo).reduce<number>((s, q) => s + q, 0));
      this.add.text(this.infoX + 120, y,
        t("hud.cargo", { current: totalCargo, max: playerShip.ship.cargoCap }), txt(11));
      this.add.text(this.infoX + 270, y,
        t("hud.crew", { current: playerShip.ship.crew.current, max: playerShip.ship.crew.max }), txt(11));
    }
    y += 20;

    // Divider
    const divG = this.add.graphics();
    divG.lineStyle(1, 0x999999, 1);
    divG.lineBetween(this.dlgX + PAD, y, this.dlgX + DLG_W - PAD, y);
    y += 8;

    this.contentStartY = y;
    this.contentContainer = this.add.container(0, 0);

    // Dynamic resize — restart scene to recenter dialog
    const onResize = () => {
      this.scale.off("resize", onResize);
      this.scene.restart({
        worldState: this.worldState,
        portId: this.currentPortId,
        returnToView: this.currentView,
      });
    };
    this.scale.on("resize", onResize);

    this.switchView(this.currentView);
  }

  // ===== VIEW SWITCHING =====

  private switchView(view: PortView): void {
    this.currentView = view;
    this.contentContainer.removeAll(true);
    this.clearKeyboard();
    this.selectedIndex = 0;
    this.actionTexts = [];
    this.actions = [];
    this.selectionBar = null;
    this.arrow = null;

    switch (view) {
      case "menu": this.renderMainMenu(); break;
      case "governor": this.renderGovernor(); break;
      case "tavern": this.renderTavern(); break;
      case "merchant": this.renderMerchant(); break;
      case "shipyard": this.renderShipyard(); break;
    }
  }

  private clearKeyboard(): void {
    for (const cleanup of this.keyboardCleanup) cleanup();
    this.keyboardCleanup = [];
  }

  private bindKey(event: string, handler: () => void): void {
    if (!this.input.keyboard) return;
    this.input.keyboard.on(event, handler);
    this.keyboardCleanup.push(() => this.input.keyboard?.off(event, handler));
  }

  // ===== ARROW-SELECTOR LIST =====

  private setupActionList(
    actions: { label: string; key: string }[],
    startY: number,
    onSelect: (key: string) => void,
  ): void {
    this.actions = actions;
    this.actionTexts = [];
    this.selectedIndex = 0;

    const barW = DLG_W - PAD * 2;
    const barH = 22;

    this.selectionBar = this.add.rectangle(
      this.cx, startY + barH / 2, barW, barH, 0x222244, 0.15,
    );
    this.contentContainer.add(this.selectionBar);

    this.arrow = this.add.text(0, 0, "\u25B6", txt(12, { bold: true }));
    this.contentContainer.add(this.arrow);

    for (let i = 0; i < actions.length; i++) {
      const actionText = this.add.text(
        this.infoX + 18, startY + i * 26, actions[i].label,
        txt(14, { bold: true }),
      );
      actionText.setInteractive({ useHandCursor: true });
      actionText.on("pointerover", () => {
        this.selectedIndex = i;
        this.updateActionSelection();
      });
      actionText.on("pointerdown", () => onSelect(actions[i].key));
      this.contentContainer.add(actionText);
      this.actionTexts.push(actionText);
    }

    this.updateActionSelection();

    const moveUp = () => {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.updateActionSelection();
    };
    const moveDown = () => {
      this.selectedIndex = Math.min(actions.length - 1, this.selectedIndex + 1);
      this.updateActionSelection();
    };
    const confirm = () => {
      const action = this.actions[this.selectedIndex];
      if (action) onSelect(action.key);
    };

    this.bindKey("keydown-W", moveUp);
    this.bindKey("keydown-UP", moveUp);
    this.bindKey("keydown-S", moveDown);
    this.bindKey("keydown-DOWN", moveDown);
    this.bindKey("keydown-ENTER", confirm);
    this.bindKey("keydown-E", confirm);
  }

  private updateActionSelection(): void {
    for (let i = 0; i < this.actionTexts.length; i++) {
      if (i === this.selectedIndex) {
        this.actionTexts[i].setColor("#000000");
        this.actionTexts[i].setFontStyle("bold");
      } else {
        this.actionTexts[i].setColor("#555555");
        this.actionTexts[i].setFontStyle("");
      }
    }
    const sel = this.actionTexts[this.selectedIndex];
    if (sel && this.selectionBar) {
      this.selectionBar.setPosition(this.selectionBar.x, sel.y + 11);
    }
    if (sel && this.arrow) {
      this.arrow.setPosition(sel.x - 16, sel.y + 1);
    }
  }

  // ===== VIEW: Main Menu =====

  private renderMainMenu(): void {
    const y = this.contentStartY;

    const actions = [
      { label: t("port.visit_governor"), key: "governor" },
      { label: t("port.visit_tavern"), key: "tavern" },
      { label: t("port.visit_merchant"), key: "merchant" },
      { label: t("port.visit_shipyard"), key: "shipyard" },
      { label: this.isOnFoot ? t("port.leave_on_foot") ?? "ODEJDŹ" : t("port.set_sail"), key: "sail" },
    ];

    this.setupActionList(actions, y, (key) => {
      switch (key) {
        case "governor": this.switchView("governor"); break;
        case "tavern": this.switchView("tavern"); break;
        case "merchant": this.switchView("merchant"); break;
        case "shipyard": this.switchView("shipyard"); break;
        case "sail": this.leavePort(); break;
      }
    });

    if (this.tavernMessage) {
      const msg = this.add.text(
        this.infoX, this.dlgY + DLG_H - PAD - 46,
        this.tavernMessage,
        { ...txt(12, { color: "#8a3a3a" }), wordWrap: { width: DLG_W - PAD * 2 } },
      );
      this.contentContainer.add(msg);
      this.tavernMessage = null;
    }

    // Hint
    const hint = this.add.text(
      this.cx, this.dlgY + DLG_H - PAD - 4,
      t("port.menu_hint"),
      txt(10, { color: "#888888" }),
    );
    hint.setOrigin(0.5, 1);
    this.contentContainer.add(hint);

    this.bindKey("keydown-ESC", () => this.leavePort());
  }

  // ===== VIEW: Governor =====

  /**
   * The governor is the first consumer of `DialogueSystem` (v0.10.1). What he
   * says and what you may say back is a tree in `core/data/dialogues.ts`; this
   * method only draws the current node and turns clicks into `chooseOption`.
   *
   * The tree is rebuilt on entry rather than cached, because its lines quote
   * live state — standing, rank, today's rumour — and the conversation itself
   * can change that state mid-way.
   */
  private renderGovernor(): void {
    const portDef = PORTS[this.currentPortId as string];
    const factionKey = portDef.factionId as string;
    const rep = this.worldState.player.reputation[factionKey] ?? 0;
    const level = getReputationLevel(rep);
    const rankIndex = this.worldState.player.ranks?.[factionKey] ?? 0;

    const tree = governorTree({
      factionKey,
      level,
      playerName: this.worldState.playerName,
      factionName: t("faction." + factionKey + ".name"),
      levelName: t("rep." + level),
      reputation: rep,
      rankName: t(getRankNameKey(factionKey, rankIndex)),
      rumorKey: getRumorKey(this.worldState),
      age: captainAge(this.worldState),
      scorePreview: computeScore(this.worldState).total,
    });

    // Keep the place in the conversation across re-renders, but start fresh
    // whenever the view is entered from the port menu.
    if (!this.governorDialogue || this.governorDialogue.tree.id !== tree.id || this.governorDialogue.runtime.ended) {
      this.governorDialogue = { tree, runtime: startDialogue(tree) };
    } else {
      this.governorDialogue = { tree, runtime: this.governorDialogue.runtime };
    }

    this.drawGovernorNode();
  }

  private drawGovernorNode(): void {
    const dialogue = this.governorDialogue;
    if (!dialogue) return;

    this.contentContainer.removeAll(true);
    this.clearKeyboard();

    const node = currentNode(dialogue.tree, dialogue.runtime);
    if (!node) { this.leaveGovernor(); return; }

    let y = this.contentStartY;

    const title = this.add.text(this.cx, y, t("governor.title"), txt(16, { bold: true }));
    title.setOrigin(0.5, 0);
    this.contentContainer.add(title);
    y += 28;

    const said = this.add.text(
      this.infoX, y,
      t(node.textKey, node.vars),
      { ...txt(12, { color: "#333333" }), wordWrap: { width: DLG_W - PAD * 2 }, fontStyle: "italic" },
    );
    this.contentContainer.add(said);
    y += said.height + 18;

    const options = visibleOptions(dialogue.tree, dialogue.runtime, this.worldState);
    options.forEach((option, i) => {
      const label = this.add.text(
        this.infoX, y,
        `${i + 1}. ${t(option.textKey, option.vars)}`,
        { ...txt(13), wordWrap: { width: DLG_W - PAD * 2 } },
      );
      label.setInteractive({ useHandCursor: true });
      label.on("pointerover", () => label.setColor("#8a5a1a"));
      label.on("pointerout", () => label.setColor("#1a1a1a"));
      label.on("pointerdown", () => this.pickGovernorOption(option.id));
      this.contentContainer.add(label);

      const digit = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"][i];
      if (digit) this.bindKey("keydown-" + digit, () => this.pickGovernorOption(option.id));

      y += label.height + 8;
    });

    this.bindKey("keydown-ESC", () => this.leaveGovernor());
  }

  private pickGovernorOption(optionId: string): void {
    const dialogue = this.governorDialogue;
    if (!dialogue) return;

    const step = chooseOption(
      dialogue.tree,
      dialogue.runtime,
      this.worldState,
      optionId,
      // The dialogue system has no business knowing what a letter of marque is;
      // it fires a named custom effect and the port resolves it.
      (world, id) => {
        if (id === EFFECT_GRANT_LETTER) {
          return requestLetterOfMarque(world, PORTS[this.currentPortId as string].factionId).world;
        }
        if (id === EFFECT_RETIRE) return retire(world).world;
        return world;
      },
    );
    if (!step.taken) return;

    this.worldState = step.world;
    this.registry.set("worldState", this.worldState);
    this.governorDialogue = { tree: dialogue.tree, runtime: step.runtime };

    // Retiring ends the game rather than the conversation.
    if (hasRetired(this.worldState)) {
      this.governorDialogue = null;
      this.scene.start("RetirementScene", {
        score: computeScore(this.worldState),
        captainName: this.worldState.playerName,
      });
      return;
    }

    if (step.runtime.ended) { this.leaveGovernor(); return; }
    // Rebuild from scratch: an answer may have changed standing or a flag, and
    // the greeting node's replies are gated on exactly those.
    this.renderGovernor();
  }

  private leaveGovernor(): void {
    this.governorDialogue = null;
    this.switchView("menu");
  }

  // ===== VIEW: Tavern =====

  private renderTavern(): void {
    let y = this.contentStartY;

    const title = this.add.text(this.cx, y, t("tavern.title"), txt(16, { bold: true }));
    title.setOrigin(0.5, 0);
    this.contentContainer.add(title);
    y += 28;

    const playerShip = this.worldState.entities[this.worldState.player.shipId as string];
    const crewSpace = playerShip?.ship
      ? playerShip.ship.crew.max - playerShip.ship.crew.current
      : 0;

    const portState = this.worldState.ports[this.currentPortId as string];
    const availableCrew = portState?.availableCrew ?? 0;

    // The crew's patience is a running clock; say where it stands on the button.
    const status = plunderStatus(this.worldState);
    const plunderLabel = status.overdue
      ? t("tavern.divide_plunder_overdue", { days: status.daysOverdue })
      : t("tavern.divide_plunder", { days: status.daysUntilDue });

    const actions = [
      {
        label: t("tavern.recruit_crew")
          + ` (${t("tavern.crew_available", { count: availableCrew, berths: crewSpace })})`,
        key: "recruit",
      },
      { label: t("tavern.hear_rumors"), key: "rumors" },
      { label: t("tavern.buy_drinks", { cost: 10 }), key: "drinks" },
      { label: plunderLabel, key: "divide" },
      { label: t("tavern.back"), key: "back" },
    ];

    this.setupActionList(actions, y, (key) => {
      switch (key) {
        case "recruit": this.handleRecruit(); break;
        case "rumors": this.handleRumors(); break;
        case "drinks": this.handleDrinks(); break;
        case "divide": this.handleDividePlunder(); break;
        case "back": this.switchView("menu"); break;
      }
    });

    // Hint
    const hint = this.add.text(
      this.cx, this.dlgY + DLG_H - PAD - 4,
      t("tavern.hint"),
      txt(10, { color: "#888888" }),
    );
    hint.setOrigin(0.5, 1);
    this.contentContainer.add(hint);

    this.bindKey("keydown-ESC", () => this.switchView("menu"));
  }

  private handleRecruit(): void {
    const result = recruitCrew(this.worldState, this.currentPortId, 5);
    if (result.recruited > 0) {
      this.worldState = result.world;
      this.registry.set("worldState", this.worldState);
      this.scene.restart({ worldState: this.worldState, portId: this.currentPortId, returnToView: "tavern" as PortView });
    }
  }

  private handleRumors(): void {
    const rumorKey = getRumorKey(this.worldState);
    this.contentContainer.removeAll(true);
    this.clearKeyboard();

    let y = this.contentStartY;
    const title = this.add.text(this.cx, y, t("tavern.hear_rumors"), txt(16, { bold: true }));
    title.setOrigin(0.5, 0);
    this.contentContainer.add(title);
    y += 28;

    // World event news for this port
    const portNews = getPortNews(this.worldState, this.currentPortId as string);
    if (portNews.length > 0) {
      for (const news of portNews.slice(0, 3)) {
        const headline = t(news.headline, news.vars as Record<string, string>);
        const newsText = this.add.text(this.infoX, y, `• ${headline}`, {
          ...txt(12, { color: "#444444" }),
          wordWrap: { width: DLG_W - PAD * 2 },
        });
        this.contentContainer.add(newsText);
        y += 22;

        // Log news player hasn't seen
        const knownIds = new Set(this.worldState.knownEventIds ?? []);
        if (!knownIds.has(news.eventId)) {
          knownIds.add(news.eventId);
          this.worldState = {
            ...this.worldState,
            knownEventIds: [...knownIds],
          };
          this.registry.set("worldState", this.worldState);
        }
      }
      y += 6;
    }

    // Classic rumor
    const rumorText = this.add.text(this.infoX, y, t(rumorKey), {
      ...txt(13, { color: "#444444" }),
      wordWrap: { width: DLG_W - PAD * 2 },
      fontStyle: "italic",
    });
    this.contentContainer.add(rumorText);

    const backBtn = this.add.text(
      this.infoX, this.dlgY + DLG_H - PAD - 30,
      t("tavern.back"),
      txt(13, { bold: true }),
    );
    backBtn.setInteractive({ useHandCursor: true });
    backBtn.on("pointerover", () => backBtn.setColor("#555555"));
    backBtn.on("pointerout", () => backBtn.setColor("#1a1a1a"));
    backBtn.on("pointerdown", () => this.switchView("tavern"));
    this.contentContainer.add(backBtn);

    this.bindKey("keydown-ESC", () => this.switchView("tavern"));
    this.bindKey("keydown-ENTER", () => this.switchView("tavern"));
  }

  /**
   * Divide the plunder. Costs most of the gold and most of the crew — paid men
   * go ashore to spend it — and resets the clock the crew grumbles against.
   * The scene is restarted so every view redraws against the new world.
   */
  private handleDividePlunder(): void {
    const result = dividePlunder(this.worldState);
    if (result.error) {
      this.tavernMessage = t("tavern.divide_failed_" + result.error);
      this.switchView("tavern");
      return;
    }
    this.worldState = result.world;
    this.registry.set("worldState", this.worldState);
    this.scene.restart({
      worldState: this.worldState,
      portId: this.currentPortId,
      returnToView: "tavern" as PortView,
    });
  }

  private handleDrinks(): void {
    const result = buyRoundOfDrinks(this.worldState);
    if (result.boosted) {
      this.worldState = result.world;
      this.registry.set("worldState", this.worldState);
      this.scene.restart({ worldState: this.worldState, portId: this.currentPortId, returnToView: "tavern" as PortView });
    }
  }

  // ===== VIEW: Merchant =====

  private renderMerchant(): void {
    const portKey = this.currentPortId as string;
    const portState = this.worldState.ports[portKey];
    const playerShip = this.worldState.entities[this.worldState.player.shipId as string];
    let y = this.contentStartY;

    // Trade goods header
    const tradeHeader = this.add.text(this.infoX, y, t("port.trade_goods"), txt(13, { bold: true }));
    this.contentContainer.add(tradeHeader);
    y += 20;

    // Table header
    const colName = this.infoX;
    const colPrice = this.infoX + 130;
    const colStock = this.infoX + 200;
    const colOwn = this.infoX + 275;
    const colBuy = this.infoX + 340;
    const colSell = this.infoX + 390;

    this.contentContainer.add(this.add.text(colName, y, "Item", txt(10, { bold: true, color: "#666666" })));
    this.contentContainer.add(this.add.text(colPrice, y, "Price", txt(10, { bold: true, color: "#666666" })));
    this.contentContainer.add(this.add.text(colStock, y, "Stock", txt(10, { bold: true, color: "#666666" })));
    this.contentContainer.add(this.add.text(colOwn, y, "Own", txt(10, { bold: true, color: "#666666" })));
    y += 16;

    // Table rows with keyboard navigation
    const itemKeys = Object.keys(ITEMS);
    const barW = DLG_W - PAD * 2;

    // Selection bar
    const selBar = this.add.rectangle(
      this.cx, y + 11, barW, 20, 0x222244, 0.15,
    );
    this.contentContainer.add(selBar);

    const arrow = this.add.text(0, 0, "\u25B6", txt(10, { bold: true }));
    this.contentContainer.add(arrow);

    for (let ri = 0; ri < itemKeys.length; ri++) {
      const key = itemKeys[ri];
      const item = ITEMS[key];
      const price = portState?.prices[key] ?? item.basePrice;
      const stock = portState?.inventory[key] ?? 0;
      const owned = playerShip?.ship?.cargo[key] ?? 0;
      const isFocused = ri === this.selectedIndex;
      const rowColor = isFocused ? "#000000" : "#1a1a1a";

      this.contentContainer.add(this.add.text(colName, y, t("item." + key + ".name"), txt(12, { color: rowColor, bold: isFocused })));
      this.contentContainer.add(this.add.text(colPrice, y, t("port.price", { price }), txt(12, { bold: true, color: rowColor })));
      this.contentContainer.add(this.add.text(colStock, y, String(stock), txt(12, { color: "#555555" })));
      this.contentContainer.add(
        this.add.text(colOwn, y, String(Math.floor(owned)),
          txt(12, { color: owned > 0 ? rowColor : "#999999" })),
      );

      // Buy button
      const buyBtn = this.add.text(colBuy, y, t("port.buy"), txt(12, { bold: true, color: "#2a7a2a" }));
      buyBtn.setInteractive({ useHandCursor: true });
      buyBtn.on("pointerover", () => { this.selectedIndex = ri; this.switchView("merchant"); });
      buyBtn.on("pointerdown", () => this.handleBuy(key));
      this.contentContainer.add(buyBtn);

      // Sell button
      const sellBtn = this.add.text(colSell, y, t("port.sell"), txt(12, { bold: true, color: "#8b4513" }));
      sellBtn.setInteractive({ useHandCursor: true });
      sellBtn.on("pointerover", () => { this.selectedIndex = ri; this.switchView("merchant"); });
      sellBtn.on("pointerdown", () => this.handleSell(key));
      this.contentContainer.add(sellBtn);

      if (isFocused) {
        selBar.setPosition(this.cx, y + 8);
        arrow.setPosition(colName - 14, y + 1);
      }

      y += 22;
    }

    // Hint
    const hint = this.add.text(
      this.cx, this.dlgY + DLG_H - PAD - 4,
      "\u2191\u2193 \u2014 Select   Enter \u2014 Buy   Backspace \u2014 Sell   Esc \u2014 Back",
      txt(10, { color: "#888888" }),
    );
    hint.setOrigin(0.5, 1);
    this.contentContainer.add(hint);

    // Back button
    const backBtn = this.add.text(
      this.infoX, this.dlgY + DLG_H - PAD - 30,
      t("governor.back"),
      txt(13, { bold: true }),
    );
    backBtn.setInteractive({ useHandCursor: true });
    backBtn.on("pointerover", () => backBtn.setColor("#555555"));
    backBtn.on("pointerout", () => backBtn.setColor("#1a1a1a"));
    backBtn.on("pointerdown", () => this.switchView("menu"));
    this.contentContainer.add(backBtn);

    // Keyboard navigation
    const moveUp = () => {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
        this.switchView("merchant");
      }
    };
    const moveDown = () => {
      if (this.selectedIndex < itemKeys.length - 1) {
        this.selectedIndex++;
        this.switchView("merchant");
      }
    };
    const buySelected = () => {
      const key = itemKeys[this.selectedIndex];
      if (key) this.handleBuy(key);
    };
    const sellSelected = () => {
      const key = itemKeys[this.selectedIndex];
      if (key) this.handleSell(key);
    };

    this.bindKey("keydown-UP", moveUp);
    this.bindKey("keydown-W", moveUp);
    this.bindKey("keydown-DOWN", moveDown);
    this.bindKey("keydown-ENTER", buySelected);
    this.bindKey("keydown-E", buySelected);
    this.bindKey("keydown-BACKSPACE", sellSelected);
    this.bindKey("keydown-Q", sellSelected);
    this.bindKey("keydown-ESC", () => this.switchView("menu"));
  }

  // ===== VIEW: Shipyard =====

  private renderShipyard(): void {
    const portKey = this.currentPortId as string;
    const portDef = PORTS[portKey];
    const playerShip = this.worldState.entities[this.worldState.player.shipId as string];
    let y = this.contentStartY;

    // Title
    const title = this.add.text(this.cx, y, t("shipyard.title"), txt(16, { bold: true }));
    title.setOrigin(0.5, 0);
    this.contentContainer.add(title);
    y += 28;

    // Repair section
    const hasDamage = playerShip?.ship
      ? (playerShip.ship.hullMax - playerShip.ship.hullHp) > 0
      : false;

    if (playerShip?.ship) {
      const damage = playerShip.ship.hullMax - playerShip.ship.hullHp;
      if (damage > 0) {
        const repairCost = damage * 2;
        const repairLabel = t("shipyard.repair", { damage, cost: repairCost });
        const repairBtn = this.add.text(this.infoX, y, repairLabel,
          txt(13, { bold: true, color: "#2266aa" }));
        repairBtn.setInteractive({ useHandCursor: true });
        repairBtn.on("pointerover", () => repairBtn.setColor("#4488cc"));
        repairBtn.on("pointerout", () => repairBtn.setColor("#2266aa"));
        repairBtn.on("pointerdown", () => this.handleShipyardRepair());
        this.contentContainer.add(repairBtn);
      } else {
        const noDamage = this.add.text(this.infoX, y, t("shipyard.no_damage"),
          txt(12, { color: "#999999" }));
        this.contentContainer.add(noDamage);
      }
      y += 22;
    }

    y += 4;

    // Divider
    const divG = this.add.graphics();
    divG.lineStyle(1, 0x999999, 1);
    divG.lineBetween(this.dlgX + PAD, y, this.dlgX + DLG_W - PAD, y);
    this.contentContainer.add(divG);
    y += 8;

    // Ships for sale header
    const header = this.add.text(this.infoX, y, t("shipyard.ships_for_sale"), txt(13, { bold: true }));
    this.contentContainer.add(header);
    y += 18;

    // Column headers
    const colName = this.infoX;
    const colSpeed = this.infoX + 100;
    const colHull = this.infoX + 145;
    const colCannons = this.infoX + 190;
    const colCargo = this.infoX + 235;
    const colCrew = this.infoX + 280;
    const colPrice = this.infoX + 345;

    this.contentContainer.add(this.add.text(colName, y, t("shipyard.col_name"), txt(10, { bold: true, color: "#666666" })));
    this.contentContainer.add(this.add.text(colSpeed, y, t("shipyard.col_speed"), txt(10, { bold: true, color: "#666666" })));
    this.contentContainer.add(this.add.text(colHull, y, t("shipyard.col_hull"), txt(10, { bold: true, color: "#666666" })));
    this.contentContainer.add(this.add.text(colCannons, y, t("shipyard.col_cannons"), txt(10, { bold: true, color: "#666666" })));
    this.contentContainer.add(this.add.text(colCargo, y, t("shipyard.col_cargo"), txt(10, { bold: true, color: "#666666" })));
    this.contentContainer.add(this.add.text(colCrew, y, t("shipyard.col_crew"), txt(10, { bold: true, color: "#666666" })));
    this.contentContainer.add(this.add.text(colPrice, y, t("shipyard.col_price"), txt(10, { bold: true, color: "#666666" })));
    y += 16;

    // Ship rows filtered by shipyard level
    const shipyardLevel = portDef.shipyardLevel;
    const currentClassId = playerShip?.ship?.classId as string;
    const availableShips = SHIPYARD_TIERS[shipyardLevel] ?? SHIPYARD_TIERS[1];
    const barW = DLG_W - PAD * 2;

    // Selection bar
    const selBar = this.add.rectangle(
      this.cx, y + 8, barW, 18, 0x222244, 0.15,
    );
    this.contentContainer.add(selBar);

    const arrow = this.add.text(0, 0, "\u25B6", txt(9, { bold: true }));
    this.contentContainer.add(arrow);

    for (let si = 0; si < availableShips.length; si++) {
      const classKey = availableShips[si];
      const cls = SHIP_CLASSES[classKey];
      if (!cls) continue;

      const isCurrent = classKey === currentClassId;
      const isFocused = si === this.selectedIndex;
      const color = isFocused ? "#000000" : isCurrent ? "#2a7a2a" : "#1a1a1a";
      const nameLabel = isCurrent
        ? `${t("ship." + classKey + ".name")} ${t("shipyard.current")}`
        : t("ship." + classKey + ".name");

      this.contentContainer.add(this.add.text(colName, y, nameLabel, txt(11, { color, bold: isFocused })));
      this.contentContainer.add(this.add.text(colSpeed, y, String(cls.speedBase), txt(11, { color: "#555555" })));
      this.contentContainer.add(this.add.text(colHull, y, String(cls.hullMax), txt(11, { color: "#555555" })));
      this.contentContainer.add(this.add.text(colCannons, y, String(cls.cannons), txt(11, { color: "#555555" })));
      this.contentContainer.add(this.add.text(colCargo, y, String(cls.cargoCap), txt(11, { color: "#555555" })));
      this.contentContainer.add(this.add.text(colCrew, y, `${cls.crewMin}-${cls.crewMax}`, txt(11, { color: "#555555" })));
      this.contentContainer.add(this.add.text(colPrice, y, t("port.price", { price: cls.buyPrice }), txt(11, { bold: true })));

      if (!isCurrent) {
        const canAfford = this.worldState.player.gold >= cls.buyPrice;
        const buyBtnColor = canAfford ? "#2a7a2a" : "#999999";
        const buyBtn = this.add.text(colPrice + 55, y, t("shipyard.buy"), txt(11, { bold: true, color: buyBtnColor }));
        if (canAfford) {
          buyBtn.setInteractive({ useHandCursor: true });
          buyBtn.on("pointerover", () => { this.selectedIndex = si; this.switchView("shipyard"); });
          buyBtn.on("pointerdown", () => this.handleBuyShip(classKey));
        }
        this.contentContainer.add(buyBtn);

        // Add to Fleet button (if fleet not full)
        if (canAddToFleet(this.worldState.player) && canAfford) {
          const fleetBtn = this.add.text(colPrice + 100, y, t("fleet.add_to_fleet"), txt(10, { bold: true, color: "#2255aa" }));
          fleetBtn.setInteractive({ useHandCursor: true });
          fleetBtn.on("pointerdown", () => this.handleBuyToFleet(classKey));
          this.contentContainer.add(fleetBtn);
        }
      }

      if (isFocused) {
        selBar.setPosition(this.cx, y + 8);
        arrow.setPosition(colName - 14, y + 1);
      }

      y += 20;
    }

    // Fleet section — show escort ships with sell buttons
    const fleet = this.worldState.player.fleet ?? [];
    if (fleet.length > 0) {
      y += 10;
      this.contentContainer.add(this.add.text(colName, y, t("fleet.title") + ` (${fleetSize(this.worldState.player)}/3)`, txt(12, { bold: true, color: "#336699" })));
      y += 18;
      for (let fi = 0; fi < fleet.length; fi++) {
        const esc = fleet[fi];
        const escCls = SHIP_CLASSES[esc.classId];
        if (!escCls) continue;
        const hullPct = Math.round((esc.hullHp / esc.hullMax) * 100);
        const sellPrice = Math.floor(escCls.buyPrice * 0.4);
        this.contentContainer.add(this.add.text(colName, y, `${t("fleet.escort")}: ${escCls.name}`, txt(11, { color: "#336699" })));
        this.contentContainer.add(this.add.text(colHull, y, `${hullPct}%`, txt(11, { color: hullPct > 50 ? "#555555" : "#aa3333" })));
        const sellBtn = this.add.text(colPrice, y, `${t("fleet.sell")} (${sellPrice}g)`, txt(10, { bold: true, color: "#aa3333" }));
        sellBtn.setInteractive({ useHandCursor: true });
        const fleetIdx = fi;
        sellBtn.on("pointerdown", () => this.handleSellFleetShip(fleetIdx));
        this.contentContainer.add(sellBtn);
        y += 18;
      }
    }

    // Hint
    const hint = this.add.text(
      this.cx, this.dlgY + DLG_H - PAD - 4,
      "\u2191\u2193 \u2014 Select   Enter \u2014 Buy   R \u2014 Repair   Esc \u2014 Back",
      txt(10, { color: "#888888" }),
    );
    hint.setOrigin(0.5, 1);
    this.contentContainer.add(hint);

    // Back button
    const backBtn = this.add.text(
      this.infoX, this.dlgY + DLG_H - PAD - 30,
      t("governor.back"),
      txt(13, { bold: true }),
    );
    backBtn.setInteractive({ useHandCursor: true });
    backBtn.on("pointerover", () => backBtn.setColor("#555555"));
    backBtn.on("pointerout", () => backBtn.setColor("#1a1a1a"));
    backBtn.on("pointerdown", () => this.switchView("menu"));
    this.contentContainer.add(backBtn);

    // Keyboard navigation
    const moveUp = () => {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
        this.switchView("shipyard");
      }
    };
    const moveDown = () => {
      if (this.selectedIndex < availableShips.length - 1) {
        this.selectedIndex++;
        this.switchView("shipyard");
      }
    };
    const buySelected = () => {
      const classKey = availableShips[this.selectedIndex];
      if (classKey && classKey !== currentClassId) {
        this.handleBuyShip(classKey);
      }
    };

    this.bindKey("keydown-UP", moveUp);
    this.bindKey("keydown-W", moveUp);
    this.bindKey("keydown-DOWN", moveDown);
    this.bindKey("keydown-ENTER", buySelected);
    this.bindKey("keydown-B", buySelected);
    if (hasDamage) {
      this.bindKey("keydown-R", () => this.handleShipyardRepair());
    }
    this.bindKey("keydown-ESC", () => this.switchView("menu"));
  }

  private handleShipyardRepair(): void {
    const result = repairShip(this.worldState);
    if (result.repaired > 0) {
      this.worldState = result.world;
      this.registry.set("worldState", this.worldState);
      this.scene.restart({ worldState: this.worldState, portId: this.currentPortId, returnToView: "shipyard" as PortView });
    }
  }

  private handleBuyShip(classKey: string): void {
    const result = buyShip(this.worldState, shipClassId(classKey));
    if (result.bought) {
      this.worldState = result.world;
      this.registry.set("worldState", this.worldState);
      this.scene.restart({ worldState: this.worldState, portId: this.currentPortId, returnToView: "shipyard" as PortView });
    }
  }

  private handleBuyToFleet(classKey: string): void {
    const result = buyShipToFleet(this.worldState, shipClassId(classKey));
    if (result.bought) {
      this.worldState = result.world;
      this.registry.set("worldState", this.worldState);
      this.scene.restart({ worldState: this.worldState, portId: this.currentPortId, returnToView: "shipyard" as PortView });
    }
  }

  private handleSellFleetShip(fleetIndex: number): void {
    const result = sellFleetShip(this.worldState, fleetIndex);
    if (result.sold) {
      this.worldState = result.world;
      this.registry.set("worldState", this.worldState);
      this.scene.restart({ worldState: this.worldState, portId: this.currentPortId, returnToView: "shipyard" as PortView });
    }
  }

  // ===== Trade/Leave handlers =====

  private handleBuy(itemKey: string): void {
    const result = executeBuy(this.worldState, this.currentPortId, itemId(itemKey), 1);
    if (!result.error) {
      this.worldState = result.world;
      this.registry.set("worldState", this.worldState);
      this.scene.restart({ worldState: this.worldState, portId: this.currentPortId, returnToView: "merchant" as PortView });
    }
  }

  private handleSell(itemKey: string): void {
    const result = executeSell(this.worldState, this.currentPortId, itemId(itemKey), 1);
    if (!result.error) {
      this.worldState = result.world;
      this.registry.set("worldState", this.worldState);
      this.scene.restart({ worldState: this.worldState, portId: this.currentPortId, returnToView: "merchant" as PortView });
    }
  }

  private leavePort(): void {
    const portDef = PORTS[this.currentPortId as string];
    const shipId = this.worldState.player.shipId as string;
    const entity = this.worldState.entities[shipId];

    if (this.isOnFoot) {
      // On foot: return to map at port position, still in landed mode
      // Preserve anchorPos (where ship is parked) so it stays visible
      const portPos = portDef?.pos ?? this.worldState.player.location.pos;
      const updatedEntities = entity
        ? {
            ...this.worldState.entities,
            [shipId]: {
              ...entity,
              pos: portPos,
              vel: { x: 0, y: 0 },
              sailLevel: 0,
              mode: "landed" as const,
              // Keep anchorPos from original landing (ship stays where it was parked)
              anchorPos: entity.anchorPos,
            },
          }
        : this.worldState.entities;

      this.worldState = {
        ...this.worldState,
        player: {
          ...this.worldState.player,
          location: { type: "sea" as const, pos: portPos },
        },
        entities: updatedEntities,
      };
    } else {
      // From ship: spawn in water south of port
      const offset = portDef ? portDef.dockRadius + 50 : 100;
      const portPos = this.worldState.player.location.pos;
      const seaPos = { x: portPos.x, y: portPos.y + offset };

      const updatedEntities = entity
        ? { ...this.worldState.entities, [shipId]: { ...entity, pos: seaPos, vel: { x: 0, y: 0 }, sailLevel: 0, mode: "sailing" as const } }
        : this.worldState.entities;

      this.worldState = {
        ...this.worldState,
        player: {
          ...this.worldState.player,
          location: { type: "sea", pos: seaPos },
        },
        entities: updatedEntities,
      };
    }

    this.registry.set("worldState", this.worldState);
    this.scene.start("MainMapScene", { worldState: this.worldState });
  }
}
