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
  getGovernorDialogueKey,
  recruitCrew,
  buyRoundOfDrinks,
  getRumorKey,
  repairShip,
  buyShip,
} from "../../core/systems/PortInteractionSystem.ts";
import { getReputationLevel } from "../../core/systems/ReputationSystem.ts";
import { t } from "../../core/i18n/index.ts";
import { txt } from "../ui/textStyle.ts";

const DLG_W = 520;
const DLG_H = 480;
const BORDER = 3;
const PAD = 20;

type PortView = "menu" | "governor" | "tavern" | "merchant" | "shipyard";

// Ships available at each shipyard level
const SHIPYARD_TIERS: Record<number, string[]> = {
  1: ["sloop"],
  2: ["sloop", "brigantine", "merchantman"],
  3: ["sloop", "brigantine", "merchantman", "frigate"],
  4: ["sloop", "brigantine", "merchantman", "frigate", "galleon"],
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

  init(data: { worldState: WorldState; portId: PortId; returnToView?: PortView }): void {
    this.worldState = data.worldState;
    this.currentPortId = data.portId;
    this.currentView = data.returnToView ?? "menu";
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

    // White dialog frame
    this.add.rectangle(this.cx, this.cy, DLG_W + BORDER * 2, DLG_H + BORDER * 2, 0x222222);
    this.add.rectangle(this.cx, this.cy, DLG_W, DLG_H, 0xffffff);

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

    this.add.text(this.infoX, y, `${t("hud.gold")}: ${player.gold}`, txt(13, { bold: true }));
    if (playerShip?.ship) {
      const totalCargo = Math.floor(Object.values(playerShip.ship.cargo).reduce<number>((s, q) => s + q, 0));
      this.add.text(this.infoX + 140, y,
        t("hud.cargo", { current: totalCargo, max: playerShip.ship.cargoCap }), txt(12));
      this.add.text(this.infoX + 300, y,
        t("hud.crew", { current: playerShip.ship.crew.current, max: playerShip.ship.crew.max }), txt(12));
    }
    y += 20;

    // Divider
    const divG = this.add.graphics();
    divG.lineStyle(1, 0x999999, 1);
    divG.lineBetween(this.dlgX + PAD, y, this.dlgX + DLG_W - PAD, y);
    y += 8;

    this.contentStartY = y;
    this.contentContainer = this.add.container(0, 0);

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
      { label: t("port.set_sail"), key: "sail" },
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

  private renderGovernor(): void {
    const portDef = PORTS[this.currentPortId as string];
    const factionKey = portDef.factionId as string;
    const rep = this.worldState.player.reputation[factionKey] ?? 0;
    const level = getReputationLevel(rep);
    let y = this.contentStartY;

    // Title
    const title = this.add.text(this.cx, y, t("governor.title"), txt(16, { bold: true }));
    title.setOrigin(0.5, 0);
    this.contentContainer.add(title);
    y += 28;

    // Dialogue
    const dialogueKey = getGovernorDialogueKey(this.worldState, portDef.factionId);
    const dialogue = this.add.text(
      this.infoX, y,
      t(dialogueKey, { name: this.worldState.playerName }),
      { ...txt(12, { color: "#333333" }), wordWrap: { width: DLG_W - PAD * 2 }, fontStyle: "italic" },
    );
    this.contentContainer.add(dialogue);
    y += dialogue.height + 16;

    // Reputation
    const repText = this.add.text(
      this.infoX, y,
      t("governor.reputation_label", {
        faction: t("faction." + factionKey + ".name"),
        level: t("rep." + level),
        value: rep,
      }),
      txt(12),
    );
    this.contentContainer.add(repText);
    y += 20;

    // Rank
    const rankIndex = this.worldState.player.ranks?.[factionKey] ?? 0;
    const rankNameKey = getRankNameKey(factionKey, rankIndex);
    const rankText = this.add.text(
      this.infoX, y,
      t("rank.label", { rank: t(rankNameKey) }),
      txt(12),
    );
    this.contentContainer.add(rankText);
    y += 24;

    // Letter of marque
    const flagKey = `letter_of_marque_${factionKey}`;
    const hasLetter = this.worldState.worldFlags[flagKey] === true;

    if (hasLetter) {
      const alreadyText = this.add.text(
        this.infoX, y,
        t("governor.letter_already", { faction: t("faction." + factionKey + ".name") }),
        txt(12, { color: "#2a7a2a" }),
      );
      this.contentContainer.add(alreadyText);
    } else if (level === "friendly" || level === "allied") {
      const offerText = this.add.text(this.infoX, y, t("governor.letter_available"), txt(12, { bold: true }));
      this.contentContainer.add(offerText);
      y += 22;

      const acceptBtn = this.add.text(
        this.infoX, y,
        t("governor.letter_accept"),
        txt(13, { bold: true, color: "#2a7a2a" }),
      );
      acceptBtn.setInteractive({ useHandCursor: true });
      acceptBtn.on("pointerover", () => acceptBtn.setColor("#44bb44"));
      acceptBtn.on("pointerout", () => acceptBtn.setColor("#2a7a2a"));
      acceptBtn.on("pointerdown", () => {
        const result = requestLetterOfMarque(this.worldState, portDef.factionId);
        if (result.granted) {
          this.worldState = result.world;
          this.registry.set("worldState", this.worldState);
          this.scene.restart({ worldState: this.worldState, portId: this.currentPortId, returnToView: "governor" as PortView });
        }
      });
      this.contentContainer.add(acceptBtn);
    } else {
      const deniedText = this.add.text(
        this.infoX, y,
        t("governor.letter_denied"),
        txt(12, { color: "#888888" }),
      );
      this.contentContainer.add(deniedText);
    }

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

    this.bindKey("keydown-ESC", () => this.switchView("menu"));
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

    const actions = [
      {
        label: t("tavern.recruit_crew", { cost: 5 })
          + ` (${t("tavern.crew_available", { count: availableCrew, berths: crewSpace })})`,
        key: "recruit",
      },
      { label: t("tavern.hear_rumors"), key: "rumors" },
      { label: t("tavern.buy_drinks", { cost: 10 }), key: "drinks" },
      { label: t("tavern.back"), key: "back" },
    ];

    this.setupActionList(actions, y, (key) => {
      switch (key) {
        case "recruit": this.handleRecruit(); break;
        case "rumors": this.handleRumors(); break;
        case "drinks": this.handleDrinks(); break;
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
    const colPrice = this.infoX + 150;
    const colStock = this.infoX + 220;
    const colOwn = this.infoX + 310;
    const colBuy = this.infoX + 380;
    const colSell = this.infoX + 430;

    this.contentContainer.add(this.add.text(colName, y, "Item", txt(10, { bold: true, color: "#666666" })));
    this.contentContainer.add(this.add.text(colPrice, y, "Price", txt(10, { bold: true, color: "#666666" })));
    this.contentContainer.add(this.add.text(colStock, y, "Stock", txt(10, { bold: true, color: "#666666" })));
    this.contentContainer.add(this.add.text(colOwn, y, "Own", txt(10, { bold: true, color: "#666666" })));
    y += 16;

    // Table rows
    for (const [key] of Object.entries(ITEMS)) {
      const item = ITEMS[key];
      const price = portState?.prices[key] ?? item.basePrice;
      const stock = portState?.inventory[key] ?? 0;
      const owned = playerShip?.ship?.cargo[key] ?? 0;

      this.contentContainer.add(this.add.text(colName, y, t("item." + key + ".name"), txt(12)));
      this.contentContainer.add(this.add.text(colPrice, y, t("port.price", { price }), txt(12, { bold: true })));
      this.contentContainer.add(this.add.text(colStock, y, String(stock), txt(12, { color: "#555555" })));
      this.contentContainer.add(
        this.add.text(colOwn, y, String(Math.floor(owned)),
          txt(12, { color: owned > 0 ? "#1a1a1a" : "#999999" })),
      );

      // Buy button
      const buyBtn = this.add.text(colBuy, y, t("port.buy"), txt(12, { bold: true, color: "#2a7a2a" }));
      buyBtn.setInteractive({ useHandCursor: true });
      buyBtn.on("pointerover", () => buyBtn.setColor("#44bb44"));
      buyBtn.on("pointerout", () => buyBtn.setColor("#2a7a2a"));
      buyBtn.on("pointerdown", () => this.handleBuy(key));
      this.contentContainer.add(buyBtn);

      // Sell button
      const sellBtn = this.add.text(colSell, y, t("port.sell"), txt(12, { bold: true, color: "#8b4513" }));
      sellBtn.setInteractive({ useHandCursor: true });
      sellBtn.on("pointerover", () => sellBtn.setColor("#cc7733"));
      sellBtn.on("pointerout", () => sellBtn.setColor("#8b4513"));
      sellBtn.on("pointerdown", () => this.handleSell(key));
      this.contentContainer.add(sellBtn);

      y += 22;
    }

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
    const colSpeed = this.infoX + 110;
    const colHull = this.infoX + 160;
    const colCannons = this.infoX + 210;
    const colCargo = this.infoX + 260;
    const colCrew = this.infoX + 310;
    const colPrice = this.infoX + 380;

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

    for (const classKey of availableShips) {
      const cls = SHIP_CLASSES[classKey];
      if (!cls) continue;

      const isCurrent = classKey === currentClassId;
      const color = isCurrent ? "#2a7a2a" : "#1a1a1a";
      const nameLabel = isCurrent
        ? `${t("ship." + classKey + ".name")} ${t("shipyard.current")}`
        : t("ship." + classKey + ".name");

      this.contentContainer.add(this.add.text(colName, y, nameLabel, txt(11, { color })));
      this.contentContainer.add(this.add.text(colSpeed, y, String(cls.speedBase), txt(11, { color: "#555555" })));
      this.contentContainer.add(this.add.text(colHull, y, String(cls.hullMax), txt(11, { color: "#555555" })));
      this.contentContainer.add(this.add.text(colCannons, y, String(cls.cannons), txt(11, { color: "#555555" })));
      this.contentContainer.add(this.add.text(colCargo, y, String(cls.cargoCap), txt(11, { color: "#555555" })));
      this.contentContainer.add(this.add.text(colCrew, y, `${cls.crewMin}-${cls.crewMax}`, txt(11, { color: "#555555" })));
      this.contentContainer.add(this.add.text(colPrice, y, `${cls.buyPrice}g`, txt(11, { bold: true })));

      if (!isCurrent) {
        const canAfford = this.worldState.player.gold >= cls.buyPrice;
        const buyBtnColor = canAfford ? "#2a7a2a" : "#999999";
        const buyBtn = this.add.text(colPrice + 55, y, t("shipyard.buy"), txt(11, { bold: true, color: buyBtnColor }));
        if (canAfford) {
          buyBtn.setInteractive({ useHandCursor: true });
          buyBtn.on("pointerover", () => buyBtn.setColor("#44bb44"));
          buyBtn.on("pointerout", () => buyBtn.setColor("#2a7a2a"));
          buyBtn.on("pointerdown", () => this.handleBuyShip(classKey));
        }
        this.contentContainer.add(buyBtn);
      }

      y += 20;
    }

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
    this.worldState = {
      ...this.worldState,
      player: {
        ...this.worldState.player,
        location: { type: "sea", pos: this.worldState.player.location.pos },
      },
    };
    this.registry.set("worldState", this.worldState);
    this.scene.start("MainMapScene", { worldState: this.worldState });
  }
}
