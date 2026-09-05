import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import type { PortId } from "../../core/model/ids.ts";
import { itemId, shipClassId } from "../../core/model/ids.ts";
import { PORTS } from "../../core/data/ports.ts";
import { portFaction, portChangedHands, garrisonFor } from "../../core/systems/SiegeSystem.ts";
import {
  garrisonAt,
  garrisonCapacity,
  maxStationable,
  stationMen,
  activeExpeditionFor,
  daysUntilRelief,
  defenceStrength,
  attackStrength,
  holdOdds,
} from "../../core/systems/ReconquestSystem.ts";
import { FACTIONS } from "../../core/data/factions.ts";
import { ITEMS } from "../../core/data/items.ts";
import { SHIP_CLASSES } from "../../core/data/ships.ts";
import { getRankNameKey } from "../../core/data/ranks.ts";
import { executeBuy, executeSell } from "../../core/systems/EconomySystem.ts";
import {
  requestLetterOfMarque,
  recruitCrew,
  buyRoundOfDrinks,
  repairShip,
  repairableDamage,
  buyShip,
  buyShipToFleet,
  sellFleetShip,
} from "../../core/systems/PortInteractionSystem.ts";
import { canAddToFleet, fleetSize } from "../../core/systems/FleetSystem.ts";
import { getPortNews } from "../../core/systems/WorldEventSystem.ts";
import { getReputationLevel } from "../../core/systems/ReputationSystem.ts";
import { portAccess } from "../../core/systems/PortAccessSystem.ts";
import { playerBuyPrice, playerSellPrice } from "../../core/systems/EconomySystem.ts";
import {
  repairRate,
  grainOffer,
  sellGrain,
  type GrainOffer,
} from "../../core/systems/PortInteractionSystem.ts";
import {
  startDialogue,
  currentNode,
  visibleOptions,
  chooseOption,
  type DialogueRuntime,
  type DialogueTree,
} from "../../core/systems/DialogueSystem.ts";
import {
  governorTree,
  EFFECT_GRANT_LETTER,
  EFFECT_RETIRE,
  EFFECT_VISIT_DAUGHTER,
  EFFECT_ACCEPT_DEFENSE,
  EFFECT_SELL_GRAIN,
} from "../../core/data/dialogues.ts";
import { offerFor, acceptDefenseContract, type DefenseContract } from "../../core/systems/DefenseContractSystem.ts";
import {
  daughterFor,
  courtshipLevel,
  willReceive,
  isMarried,
  court,
  propose,
  approachChance,
  GIFT_COST,
  MARRIAGE_THRESHOLD,
  MARRIAGE_MIN_RANK,
  SHARES_A_LEAD,
  type Approach,
} from "../../core/systems/RomanceSystem.ts";
import {
  startFamilySearch,
  stepAtPort,
  freeRelative,
  activeFamilyChain,
  INFORMER_PRICE,
} from "../../core/systems/FamilyQuestSystem.ts";
import { buildQuestRegistry } from "../../core/systems/QuestRegistry.ts";
import {
  cargoOffers,
  activeCharters,
  acceptCharter,
  deliverCharter,
  canDeliver,
  cargoDeliveredFlag,
  holdRoom,
  type CargoContract,
} from "../../core/systems/CargoContractSystem.ts";
import { disruptions } from "../../core/systems/TradeRouteSystem.ts";
import { blockadeEffective } from "../../core/systems/BlockadeSystem.ts";
import { tavernRumor } from "../../core/systems/RumorSystem.ts";
import { reroutedOnto, townHunger, townIsHungry } from "../../core/systems/EconomyTickSystem.ts";
import { advanceQuests } from "../../core/systems/QuestSystem.ts";
import { reportNamedShip } from "../../core/systems/NamedShipSystem.ts";
import {
  raidOffer, acceptRaid, activeRaids, raidProgress, raidVictim,
  reliefOffer, acceptRelief, activeRelief, canLandRelief, landRelief,
  huntOffer, acceptHunt, activeHunts,
  reliefLandedFlag, type ReliefCommission,
} from "../../core/systems/InformantSystem.ts";
import {
  isHomePort,
  careen,
  holdFree,
} from "../../core/systems/HomePortSystem.ts";
import {
  goodsAshore,
  storageUsed,
  storageFree,
  storageCap,
  hasStorage,
  canRent,
  rentFor,
  rentStorehouse,
  daysLeft,
  storeAt,
  withdrawAt,
  LEASE_DAYS,
} from "../../core/systems/StorehouseSystem.ts";
import { effectiveSkill } from "../../core/systems/AgingSystem.ts";
import { enemyFencingFor } from "../../core/systems/DuelSystem.ts";
import { captainAge } from "../../core/systems/AgingSystem.ts";
import { computeScore, retire, hasRetired } from "../../core/systems/RetirementSystem.ts";
import { dividePlunder, plunderStatus } from "../../core/systems/PlunderSystem.ts";
import { startQuest } from "../../core/systems/QuestSystem.ts";
import {
  createTreasureMap,
  pickBurialSpot,
  tavernMapQuality,
  treasureQuest,
  qualityDef,
  activeTreasureMaps,
} from "../../core/systems/TreasureSystem.ts";
import { CITIES } from "../../core/data/cities.ts";
import { rngNextInt } from "../../core/services/RNG.ts";
import { t } from "../../core/i18n/index.ts";
import { txt } from "../ui/textStyle.ts";
import { usesParchmentUI } from "../settings/AssetPack.ts";

const DLG_W = 470;
const DLG_H = 420;
const BORDER = 3;
const PAD = 16;

type PortView = "menu" | "governor" | "tavern" | "merchant" | "shipyard" | "daughter" | "garrison" | "warehouse" | "charter";

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

  /** What the governor would buy out of the hold, held across the conversation. */
  private pendingGrainOffer: GrainOffer | null = null;

  /** The sale that has just gone through, so the reply can describe it. */
  private lastGrainSale: GrainOffer | null = null;

  /** The header's purse, kept so a sale inside a conversation can update it. */
  private goldText: Phaser.GameObjects.Text | null = null;

  /** The informer's relief order as drawn this pass, for the same reason. */
  private reliefOnOffer: ReliefCommission | null = null;

  /** The informer's job as it was drawn this pass, so accepting takes that one. */
  private raidOnOffer: import("../../core/systems/InformantSystem.ts").RaidCommission | null = null;
  /** The named ship on the table this pass, for the same reason. */
  private huntOnOffer: import("../../core/systems/InformantSystem.ts").HuntCommission | null = null;
  /** Governor conversation in progress; rebuilt whenever the view is entered. */
  private governorDialogue: { tree: DialogueTree; runtime: DialogueRuntime } | null = null;

  /** Set by the governor's `visit_daughter` effect; consumed on the next redraw. */
  private pendingDaughterVisit = false;
  /** True for the first `create()` after walking in, false on every return. */
  private justArrived = false;
  /** The commission on the table this conversation, if the governor has one. */
  private pendingDefenseOffer: DefenseContract | undefined;
  /** One line of narration under the courtship menu. */
  private courtshipMessage: string | null = null;
  private garrisonMessage: string | null = null;

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
    // `returnToView` means we are coming back from the shipyard or the duel
    // screen, not walking through the gate. Only the walk counts as arriving.
    this.justArrived = data.returnToView === undefined;
  }

  create(): void {
    const portKey = this.currentPortId as string;
    const portDef = PORTS[portKey];
    if (!portDef) return;

    if (this.justArrived) {
      this.justArrived = false;
      this.announceArrival(portKey);
    }

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
    // Whoever holds the town today, which is not necessarily who founded it.
    const factionKey = portFaction(this.worldState, portKey) as string;
    const faction = FACTIONS[factionKey];
    const factionColor = faction?.color ?? 0xaaaaaa;
    const factionHex = `#${factionColor.toString(16).padStart(6, "0")}`;

    let y = this.dlgY + PAD;

    // Port name
    this.add.text(this.cx, y, t("port." + portKey + ".name"), txt(20, { bold: true })).setOrigin(0.5, 0);
    y += 26;

    // Faction & type, and — since v0.24.0 — what that flag thinks of him.
    // It belongs in the header rather than on each counter because it is one
    // fact that decides five different things inside; the player should read
    // it once on the way in and know what kind of afternoon he is having.
    const access = portAccess(this.worldState, portKey);
    const repHex = access.level === "hostile" ? "#aa2222"
      : access.level === "unfriendly" ? "#996633"
      : access.level === "allied" ? "#227722"
      : factionHex;
    this.add.text(
      this.cx, y,
      `${t("port_type." + portDef.type)} \u2014 ${t("faction." + factionKey + ".name")}`,
      txt(12, { color: factionHex }),
    ).setOrigin(0.5, 0);
    y += 16;
    this.add.text(
      this.cx, y,
      t("port.standing", { level: t("rep." + access.level), value: access.reputation }),
      txt(11, { color: repHex, bold: access.level === "hostile" }),
    ).setOrigin(0.5, 0);
    y += 18;

    // Player info bar
    const player = this.worldState.player;
    const playerShip = this.worldState.entities[player.shipId as string];

    // Held: the governor's granary moves gold without leaving the view, and a
    // header drawn once in `create` went on reporting the purse the captain had
    // walked in with.
    this.goldText = this.add.text(this.infoX, y, `${t("hud.gold")}: ${player.gold}`, txt(12, { bold: true }));
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
      case "daughter": this.renderDaughter(); break;
      case "garrison": this.renderGarrison(); break;
      case "warehouse": this.renderWarehouse(); break;
      case "charter": this.renderCharter(); break;
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
    let y = this.contentStartY;

    // What the town had to eat yesterday, when the answer is "not enough"
    // (v0.27.0). It goes above the doors rather than inside one of them
    // because it decides what is behind three of them at once: the merchant's
    // prices, the tavern's recruiting pool, and whether the governor has
    // anything civil to say.
    const portKeyHere = this.currentPortId as string;
    if (townIsHungry(this.worldState, portKeyHere)) {
      const line = this.add.text(
        this.infoX, y,
        t("port.hungry", { pct: Math.round(townHunger(this.worldState, portKeyHere) * 100) }),
        { ...txt(11, { color: "#996633" }), wordWrap: { width: DLG_W - PAD * 2 } },
      );
      this.contentContainer.add(line);
      y += line.height + 6;
    }

    const actions = [
      { label: t("port.visit_governor"), key: "governor" },
      { label: t("port.visit_tavern"), key: "tavern" },
      { label: t("port.visit_merchant"), key: "merchant" },
      {
        label: portAccess(this.worldState, this.currentPortId as string).canCharter
          ? t("port.visit_charter")
          : t("port.visit_charter") + "  " + t("port.closed_to_you"),
        key: "charter",
      },
      { label: t("port.visit_shipyard"), key: "shipyard" },
    ];

    // A town that changed hands has a garrison to man, and it is the only thing
    // standing between the player and the squadron the old crown will send.
    if (portChangedHands(this.worldState, this.currentPortId as string)) {
      actions.push({ label: t("port.garrison"), key: "garrison" });
    }

    // Somewhere to put cargo down. The family storehouse in the town he
    // married into (free, and only while her father still holds it), a shed he
    // is already renting here, or the offer of one (v0.24.0). `isHomePort` is
    // still the whole gate on the *family's* store: a colony that has changed
    // hands has a different owner in the warehouse.
    const here = this.currentPortId as string;
    if (hasStorage(this.worldState, here) || canRent(this.worldState, here)) {
      actions.push({
        label: hasStorage(this.worldState, here)
          ? t("port.warehouse")
          : t("port.rent_warehouse", { gold: rentFor(this.worldState, here) }),
        key: "warehouse",
      });
    }

    actions.push({
      label: this.isOnFoot ? t("port.leave_on_foot") ?? "ODEJDŹ" : t("port.set_sail"),
      key: "sail",
    });

    this.setupActionList(actions, y, (key) => {
      switch (key) {
        case "governor": this.switchView("governor"); break;
        case "tavern": this.switchView("tavern"); break;
        case "merchant": this.switchView("merchant"); break;
        case "charter": this.selectedIndex = 0; this.switchView("charter"); break;
        case "shipyard": this.switchView("shipyard"); break;
        case "garrison": this.switchView("garrison"); break;
        case "warehouse": this.selectedIndex = 0; this.switchView("warehouse"); break;
        case "sail": this.leavePort(); break;
      }
    });

    // The reply takes the last line of the frame when there is one, and the
    // hint stands down for it: with nine entries in the list there is room for
    // exactly one of them, and a keyboard hint the player has read a hundred
    // times is the one worth losing.
    const spoke = this.tavernMessage !== null;
    if (this.tavernMessage) {
      // Under the last line of the list, not at a fixed height. The tavern grew
      // a ninth and tenth entry in v0.26.0 and the reply landed on top of
      // [ BACK TO PORT ]; the hint line is the floor it must not reach.
      const below = y + actions.length * 26 + 6;
      const msg = this.add.text(
        this.infoX, Math.min(Math.max(below, this.dlgY + DLG_H - PAD - 58), this.dlgY + DLG_H - PAD - 34),
        this.tavernMessage,
        { ...txt(12, { color: "#8a3a3a" }), wordWrap: { width: DLG_W - PAD * 2 } },
      );
      this.contentContainer.add(msg);
      this.tavernMessage = null;
    }

    // Hint
    if (!spoke) {
      const hint = this.add.text(
        this.cx, this.dlgY + DLG_H - PAD - 4,
        t("port.menu_hint"),
        txt(10, { color: "#888888" }),
      );
      hint.setOrigin(0.5, 1);
      this.contentContainer.add(hint);
    }

    this.bindKey("keydown-ESC", () => this.leavePort());
  }

  /**
   * Tell the quest machine the captain has arrived.
   *
   * `reach_port` has been a supported trigger since v0.12.0 and, until v0.17.0,
   * nothing anywhere emitted it — treasure hunts run on `dig_at` and the family
   * thread on `flag_set`. The governor's defence commission is the first chain
   * whose middle stage is simply "be there", so this is where the hook finally
   * gets connected. It fires on the way in only: coming back from the shipyard
   * is not arriving.
   */
  private announceArrival(portKey: string): void {
    const result = advanceQuests(
      this.worldState,
      { type: "reach_port", portId: portKey },
      buildQuestRegistry(this.worldState),
    );
    if (result.advanced.length === 0) return;
    this.worldState = result.world;
    this.registry.set("worldState", this.worldState);
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
    const factionKey = portFaction(this.worldState, this.currentPortId as string) as string;
    const rep = this.worldState.player.reputation[factionKey] ?? 0;
    const level = getReputationLevel(rep);
    const rankIndex = this.worldState.player.ranks?.[factionKey] ?? 0;

    // Held for the length of the conversation: the tree only carries what the
    // offer *says*, and the effect that signs it needs the offer itself.
    const offer = offerFor(this.worldState, this.currentPortId as string);
    this.pendingDefenseOffer = offer;

    // The same discipline for the granary: the tree carries what the offer
    // *says*, and the effect that lands the cargo needs the offer itself.
    const grain = grainOffer(this.worldState, this.currentPortId as string);
    this.pendingGrainOffer = grain;

    // The governor repeats what the town is repeating (v0.28.0).
    const rumor = tavernRumor(this.worldState, this.currentPortId as string);

    const tree = governorTree({
      factionKey,
      level,
      playerName: this.worldState.playerName,
      factionName: t("faction." + factionKey + ".name"),
      levelName: t("rep." + level),
      reputation: rep,
      rankName: t(getRankNameKey(factionKey, rankIndex)),
      rumorKey: rumor.key,
      rumorVars: rumor.vars,
      age: captainAge(this.worldState),
      scorePreview: computeScore(this.worldState).total,
      daughterName: willReceive(this.worldState, this.currentPortId as string)
        ? daughterFor(this.worldState, this.currentPortId as string)?.name
        : undefined,
      married: isMarried(this.worldState),
      grainSold: this.lastGrainSale ? {
        itemName: t("item." + this.lastGrainSale.item + ".name"),
        qty: this.lastGrainSale.qty,
        gold: this.lastGrainSale.gold,
      } : undefined,
      grainOffer: grain ? {
        itemName: t("item." + grain.item + ".name"),
        qty: grain.qty,
        gold: grain.gold,
        reputation: grain.reputation,
      } : undefined,
      defenseOffer: offer && {
        portName: t("port." + offer.portKey + ".name"),
        enemyName: t("faction." + offer.claimant + ".name"),
        soldiers: offer.soldiers,
        days: Math.max(0, offer.arrivalDay - this.worldState.time.day),
        reward: offer.reward,
      },
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
          return requestLetterOfMarque(world, portFaction(world, this.currentPortId as string)).world;
        }
        if (id === EFFECT_RETIRE) return retire(world).world;
        if (id === EFFECT_VISIT_DAUGHTER) { this.pendingDaughterVisit = true; return world; }
        if (id === EFFECT_SELL_GRAIN) {
          if (!this.pendingGrainOffer) return world;
          this.lastGrainSale = this.pendingGrainOffer;
          return sellGrain(world, this.pendingGrainOffer).world;
        }
        if (id === EFFECT_ACCEPT_DEFENSE) {
          return this.pendingDefenseOffer
            ? acceptDefenseContract(world, { ...this.pendingDefenseOffer, acceptedDay: world.time.day })
            : world;
        }
        return world;
      },
    );
    if (!step.taken) return;

    this.worldState = step.world;
    this.registry.set("worldState", this.worldState);
    this.goldText?.setText(`${t("hud.gold")}: ${this.worldState.player.gold}`);
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

    // The drawing room is a view of its own, not a node: see EFFECT_VISIT_DAUGHTER.
    if (this.pendingDaughterVisit) {
      this.pendingDaughterVisit = false;
      this.governorDialogue = null;
      this.switchView("daughter");
      return;
    }

    if (step.runtime.ended) { this.leaveGovernor(); return; }
    // Rebuild from scratch: an answer may have changed standing or a flag, and
    // the greeting node's replies are gated on exactly those.
    this.renderGovernor();
  }

  private leaveGovernor(): void {
    this.governorDialogue = null;
    this.lastGrainSale = null;
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

    // One map on offer per port per day; a wealthier port deals in better charts.
    const port = this.worldState.ports[this.currentPortId as string];
    const offerSeed = { seed: 0, state: this.worldState.time.day * 7919 + (this.currentPortId as string).length * 31 };
    const offered = tavernMapQuality(offerSeed, port?.wealth ?? 0).quality;
    const offeredDef = qualityDef(offered);
    const mapLabel = t("tavern.buy_map", {
      quality: t(offeredDef.nameKey),
      price: offeredDef.price,
    });

    const willing = portAccess(this.worldState, this.currentPortId as string).crewMul > 0;
    const actions = [
      {
        label: willing
          ? t("tavern.recruit_crew")
            + ` (${t("tavern.crew_available", { count: availableCrew, berths: crewSpace })})`
          : t("tavern.recruit_crew") + "  " + t("tavern.nobody_signs"),
        key: "recruit",
      },
      { label: t("tavern.hear_rumors"), key: "rumors" },
      { label: t("tavern.buy_drinks", { cost: 10 }), key: "drinks" },
      { label: mapLabel, key: "buy_map" },
      { label: plunderLabel, key: "divide" },
    ];

    // The informer's job, or the one already in hand (v0.25.0). Above the
    // family thread because it is the only line in here that expires.
    const raid = activeRaids(this.worldState)[0];
    if (raid) {
      const done = Math.round(raidProgress(this.worldState, raid) * 100);
      const left = raid.days - (this.worldState.time.day - raid.acceptedDay);
      actions.push({
        label: t("informer.in_hand", { from: raid.fromName, port: raid.toName, done, days: Math.max(0, left) }),
        key: "raid_status",
      });
    } else {
      const offer = raidOffer(this.worldState, this.currentPortId as string);
      if (offer) {
        this.raidOnOffer = offer;
        actions.push({
          label: t("informer.offer", {
            from: offer.fromName, port: offer.toName, gold: offer.reward,
          }),
          key: "raid_take",
        });
      }
    }

    // His other line of work (v0.26.0): a town three hundred miles away that
    // cannot get what it eats, and a house that will pay for a hold of it. The
    // deliver line only appears where it can be acted on, which is the town
    // itself — the same shape the charter uses at the far end of a passage.
    const relief = activeRelief(this.worldState)[0];
    if (relief) {
      const itemName = t("item." + relief.item + ".name");
      if (canLandRelief(this.worldState, relief)) {
        actions.push({
          label: t("informer.relief_land", { qty: relief.qty, item: itemName, gold: relief.reward }),
          key: "relief_land",
        });
      } else {
        const left = relief.days - (this.worldState.time.day - relief.acceptedDay);
        actions.push({
          label: t("informer.relief_in_hand", {
            qty: relief.qty, item: itemName, port: relief.portName, days: Math.max(0, left),
          }),
          key: "relief_status",
        });
      }
    } else {
      const order = reliefOffer(this.worldState, this.currentPortId as string);
      if (order) {
        this.reliefOnOffer = order;
        actions.push({
          label: t("informer.relief_offer", {
            qty: order.qty, item: t("item." + order.item + ".name"),
            port: order.portName, gold: order.reward,
          }),
          key: "relief_take",
        });
      }
    }

    // And his third line (v0.32.0): one named hull, on a known run. A status
    // line rather than a progress one — there is no partial credit for half
    // sinking a ship, so the only number worth printing is the days left.
    const hunt = activeHunts(this.worldState)[0];
    if (hunt) {
      const left = hunt.days - (this.worldState.time.day - hunt.acceptedDay);
      actions.push({
        label: t("informer.hunt_in_hand", {
          ship: hunt.shipName, from: hunt.fromName, port: hunt.toName,
          days: Math.max(0, left),
        }),
        key: "hunt_status",
      });
    } else {
      const chase = huntOffer(this.worldState, this.currentPortId as string);
      if (chase) {
        this.huntOnOffer = chase;
        actions.push({
          label: t("informer.hunt_offer", { ship: chase.shipName, gold: chase.reward }),
          key: "hunt_take",
        });
      }
    }

    // The family thread lives in the tavern: an informer sells the first name,
    // and the town the trail currently points at offers the fight itself.
    const here = stepAtPort(this.worldState, this.currentPortId as string);
    if (here) {
      actions.push({ label: t("family.strike_" + here.step.relative), key: "family_strike" });
    } else if (!activeFamilyChain(this.worldState)) {
      actions.push({ label: t("family.ask_informer", { price: INFORMER_PRICE }), key: "family_ask" });
    }

    actions.push({ label: t("tavern.back"), key: "back" });

    this.setupActionList(actions, y, (key) => {
      switch (key) {
        case "recruit": this.handleRecruit(); break;
        case "rumors": this.handleRumors(); break;
        case "drinks": this.handleDrinks(); break;
        case "buy_map": this.handleBuyTreasureMap(); break;
        case "divide": this.handleDividePlunder(); break;
        case "raid_take": this.handleTakeRaid(); break;
        case "raid_status": this.tavernMessage = t("informer.status_hint"); this.switchView("tavern"); break;
        case "relief_take": this.handleTakeRelief(); break;
        case "relief_land": this.handleLandRelief(); break;
        case "relief_status": this.tavernMessage = t("informer.relief_hint"); this.switchView("tavern"); break;
        case "hunt_take": this.handleTakeHunt(); break;
        case "hunt_status": {
          const h = activeHunts(this.worldState)[0];
          this.tavernMessage = h
            ? t("informer.hunt_hint", { from: h.fromName, port: h.toName })
            : "";
          this.switchView("tavern");
          break;
        }
        case "family_ask": this.handleAskAboutFamily(); break;
        case "family_strike": this.handleFamilyStrike(); break;
        case "back": this.switchView("menu"); break;
      }
    });

    // What the last action in here had to say. Only the port menu drew this
    // before, so every tavern reply — the map you just bought, the price you
    // could not meet — was written and then thrown away unseen.
    const spoke = this.tavernMessage !== null;
    if (this.tavernMessage) {
      // Under the last line of the list, not at a fixed height. The tavern grew
      // a ninth entry in v0.26.0 and the reply landed on top of [ BACK TO PORT ];
      // the hint line is the floor it must not reach.
      const below = y + actions.length * 26 + 6;
      const msg = this.add.text(
        this.infoX,
        Math.min(Math.max(below, this.dlgY + DLG_H - PAD - 58), this.dlgY + DLG_H - PAD - 34),
        this.tavernMessage,
        { ...txt(12, { color: "#6a4a1a" }), wordWrap: { width: DLG_W - PAD * 2 } },
      );
      this.contentContainer.add(msg);
      this.tavernMessage = null;
    }

    // Hint — but only if the list has left it any floor to stand on.
    //
    // The tavern was nine entries at its worst until v0.32.0, and the informer's
    // third commission makes ten: with all three of his lines on the table at
    // once [ BACK TO PORT ] lands on top of the hint. The hint is the thing that
    // gives way — it says the same three keys every screen in this game says,
    // and a row the player cannot read is a row that may as well not be there.
    const listBottom = y + actions.length * 26;
    const hintTop = this.dlgY + DLG_H - PAD - 16;
    if (!spoke && listBottom < hintTop) {
      const hint = this.add.text(
        this.cx, this.dlgY + DLG_H - PAD - 4,
        t("tavern.hint"),
        txt(10, { color: "#888888" }),
      );
      hint.setOrigin(0.5, 1);
      this.contentContainer.add(hint);
    }

    this.bindKey("keydown-ESC", () => this.switchView("menu"));
  }

  /**
   * Take the informer's job.
   *
   * Nothing changes hands here: the commission is a promise about a lane, and
   * the money only moves when `tickRaidCommissions` sees the run go quiet. The
   * offer is held from the render pass rather than recomputed, so the job the
   * captain agreed to is the job on the screen even if the day rolls under him.
   */
  private handleTakeRaid(): void {
    const offer = this.raidOnOffer;
    if (!offer) return;
    const result = acceptRaid(this.worldState, offer);
    if (result.error) {
      this.tavernMessage = t(result.error);
      this.switchView("tavern");
      return;
    }
    this.worldState = result.world;
    this.registry.set("worldState", this.worldState);
    this.tavernMessage = t("informer.taken", {
      from: offer.fromName, port: offer.toName, days: offer.days, crown: raidVictim(offer),
    });
    this.scene.restart({ worldState: this.worldState, portId: this.currentPortId, returnToView: "tavern" as PortView });
  }

  /**
   * Take the relief order (v0.26.0).
   *
   * Nothing is loaded and nothing is advanced: unlike a charter, the house has
   * no cargo to give him. What he has agreed to is a price for goods he does
   * not own yet, which is the whole difference between the two contracts.
   */
  /**
   * Take the hunt. Nothing changes hands until she is on the bottom or struck;
   * the message repeats her run, because that is the only thing the captain
   * actually has to work with.
   */
  private handleTakeHunt(): void {
    const chase = this.huntOnOffer;
    if (!chase) return;
    const result = acceptHunt(this.worldState, chase);
    if (result.error) {
      this.tavernMessage = t(result.error);
      this.switchView("tavern");
      return;
    }
    this.worldState = result.world;
    this.registry.set("worldState", this.worldState);
    this.tavernMessage = t("informer.hunt_taken", {
      from: chase.fromName, port: chase.toName, gold: chase.reward,
    });
    this.scene.restart({ worldState: this.worldState, portId: this.currentPortId, returnToView: "tavern" as PortView });
  }

  private handleTakeRelief(): void {
    const order = this.reliefOnOffer;
    if (!order) return;
    const result = acceptRelief(this.worldState, order);
    if (result.error) {
      this.tavernMessage = t(result.error);
      this.switchView("tavern");
      return;
    }
    this.worldState = result.world;
    this.registry.set("worldState", this.worldState);
    this.tavernMessage = t("informer.relief_taken", {
      qty: order.qty, item: t("item." + order.item + ".name"), port: order.portName,
    });
    this.scene.restart({ worldState: this.worldState, portId: this.currentPortId, returnToView: "tavern" as PortView });
  }

  /**
   * Land it. `landRelief` moves the goods and stamps the flag; the gold and the
   * standing come out of `advanceQuests`, as they do for a charter — paying
   * here as well would pay twice.
   */
  private handleLandRelief(): void {
    const order = activeRelief(this.worldState)[0];
    if (!order) return;
    const result = landRelief(this.worldState, order);
    if (result.error) {
      this.tavernMessage = t(result.error);
      this.switchView("tavern");
      return;
    }
    const advanced = advanceQuests(
      result.world,
      { type: "flag_set", key: reliefLandedFlag(order) },
      buildQuestRegistry(result.world),
    );
    this.worldState = advanced.world;
    this.registry.set("worldState", this.worldState);
    this.tavernMessage = t("informer.relief_landed", { gold: order.reward, port: order.portName });
    this.scene.restart({ worldState: this.worldState, portId: this.currentPortId, returnToView: "tavern" as PortView });
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
    const rumor = tavernRumor(this.worldState, this.currentPortId as string);
    // Hearing where a named hull was is the one rumour worth writing down, and
    // this is the moment he hears it (v0.33.0). Same shape as the event news
    // below: the tavern is where the chart gets filled in.
    const heardOf = rumor.vars?.shipId;
    if (typeof heardOf === "string") {
      this.worldState = reportNamedShip(this.worldState, heardOf);
      this.registry.set("worldState", this.worldState);
    }
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
    const rumorText = this.add.text(this.infoX, y, t(rumor.key, rumor.vars), {
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
   * Buy the map the tavern is offering today.
   *
   * The chest is buried near a city chosen from the world rng, so the same save
   * always sells the same hunt. The spot comes from the city's own position
   * rather than the terrain grid — only `MainMapScene` has that — and the
   * search radius is far wider than the offset, so the area always covers
   * ground the player can stand on.
   */
  private handleBuyTreasureMap(): void {
    const port = this.worldState.ports[this.currentPortId as string];
    const offerSeed = { seed: 0, state: this.worldState.time.day * 7919 + (this.currentPortId as string).length * 31 };
    const quality = tavernMapQuality(offerSeed, port?.wealth ?? 0).quality;
    const price = qualityDef(quality).price;

    if (this.worldState.player.gold < price) {
      this.tavernMessage = t("tavern.map_too_expensive", { price });
      this.switchView("tavern");
      return;
    }
    if (activeTreasureMaps(this.worldState).length >= 3) {
      this.tavernMessage = t("tavern.map_too_many");
      this.switchView("tavern");
      return;
    }

    const cityKeys = Object.keys(CITIES);
    const pick = rngNextInt(this.worldState.rng, 0, cityKeys.length - 1);
    const cityKey = cityKeys[pick.value];
    const burial = pickBurialSpot(pick.state, CITIES[cityKey].pos);
    const created = createTreasureMap(
      burial.rng, burial.spot, quality, this.currentPortId as string, CITIES[cityKey].name,
    );

    let world = {
      ...this.worldState,
      rng: created.rng,
      player: { ...this.worldState.player, gold: this.worldState.player.gold - price },
    };
    world = startQuest(world, treasureQuest(created.map), { map: created.map });

    this.worldState = world;
    this.registry.set("worldState", this.worldState);
    this.tavernMessage = t("tavern.map_bought", { city: CITIES[cityKey].name });
    this.switchView("tavern");
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


  // ===== VIEW: The governor's daughter =====

  /**
   * The drawing room.
   *
   * Courtship is a menu rather than a dialogue tree because every reply here is
   * a dice roll — see `EFFECT_VISIT_DAUGHTER` in `core/data/dialogues.ts` for
   * why that does not belong in `DialogueEffect`. The odds are shown next to
   * each approach on purpose: the interesting decision is which of the
   * captain's advantages to spend, and hiding the numbers would turn that into
   * guesswork.
   */
  // ===== VIEW: Garrison =====

  /**
   * Manning a town you took.
   *
   * The whole screen is one number the player controls — men on the walls —
   * and the two numbers it moves: how long until a squadron arrives, and the
   * odds the town holds when it does. `ReconquestSystem` owns both; this only
   * asks it and draws the answer.
   *
   * The odds line names the town's chances with and without the fleet standing
   * in the roads, because those are the two plans available: leave enough men,
   * or be here yourself.
   */
  private renderGarrison(): void {
    const portKey = this.currentPortId as string;
    let y = this.contentStartY;

    const title = this.add.text(
      this.cx, y,
      t("garrison.title", { port: t("port." + portKey + ".name") }),
      txt(16, { bold: true }),
    );
    title.setOrigin(0.5, 0);
    this.contentContainer.add(title);
    y += 26;

    const stationed = garrisonAt(this.worldState, portKey);
    const cap = garrisonCapacity(portKey);
    const aboard = this.worldState.entities[this.worldState.player.shipId as string]?.ship?.crew.current ?? 0;
    const underArms = garrisonFor(this.worldState, portKey).soldiers;

    for (const line of [
      t("garrison.stationed", { men: stationed, cap }),
      t("garrison.militia", { men: underArms }),
      t("garrison.aboard", { men: aboard }),
    ]) {
      const text = this.add.text(this.infoX, y, line, txt(12, { color: "#555555" }));
      this.contentContainer.add(text);
      y += 18;
    }
    y += 6;

    // What is coming, if anything is.
    const incoming = activeExpeditionFor(this.worldState, portKey);
    const threat = incoming
      ? t("garrison.threat_soon", {
          faction: String(incoming.vars.faction ?? ""),
          days: daysUntilRelief(this.worldState, portKey) ?? 0,
          soldiers: Number(incoming.vars.soldiers) || 0,
        })
      : t("garrison.threat_none");
    const threatText = this.add.text(this.infoX, y, threat, {
      ...txt(12, { color: incoming ? "#8a3a3a" : "#777777" }),
      wordWrap: { width: DLG_W - PAD * 2 },
    });
    this.contentContainer.add(threatText);
    y += threatText.height + 8;

    // Odds against whatever is actually at sea; against a typical squadron for
    // this town when nothing is, so the number means something before the news.
    const expected = incoming
      ? attackStrength({
          soldiers: Number(incoming.vars.soldiers) || 0,
          guns: Number(incoming.vars.guns) || 0,
          sailDays: 0,
        })
      : attackStrength({ soldiers: garrisonCapacity(portKey) / 2, guns: garrisonCapacity(portKey) / 8, sailDays: 0 });
    const withFleet = Math.round(holdOdds(defenceStrength(this.worldState, portKey, true), expected) * 100);
    const alone = Math.round(holdOdds(defenceStrength(this.worldState, portKey, false), expected) * 100);
    const oddsText = this.add.text(
      this.infoX, y,
      t("garrison.odds_here", { pct: withFleet, alone }),
      txt(12, { color: "#555555" }),
    );
    this.contentContainer.add(oddsText);
    y += 22;

    if (this.garrisonMessage) {
      const msg = this.add.text(this.infoX, y, this.garrisonMessage, {
        ...txt(12, { color: "#6a4a1a" }),
        wordWrap: { width: DLG_W - PAD * 2 },
        fontStyle: "italic",
      });
      this.contentContainer.add(msg);
      y += msg.height + 8;
      this.garrisonMessage = null;
    }

    const spare = maxStationable(this.worldState, portKey);
    const actions: { label: string; key: string }[] = [];
    // Three sizes rather than a slider: the decision is "a squad, a company or
    // most of the crew", and a slider would only add keystrokes to it.
    for (const men of [10, 25, 50]) {
      if (spare >= men) actions.push({ label: t("garrison.leave", { men }), key: "leave_" + men });
    }
    if (spare > 0 && spare < 10) actions.push({ label: t("garrison.leave", { men: spare }), key: "leave_" + spare });
    for (const men of [10, 25, 50]) {
      if (stationed >= men) actions.push({ label: t("garrison.take", { men }), key: "take_" + men });
    }
    if (stationed > 0 && stationed < 10) actions.push({ label: t("garrison.take", { men: stationed }), key: "take_" + stationed });
    if (actions.length === 0) {
      const none = this.add.text(this.infoX, y, t("garrison.no_men"), txt(12, { color: "#777777" }));
      this.contentContainer.add(none);
      y += 20;
    }
    actions.push({ label: t("garrison.back"), key: "back" });

    this.setupActionList(actions, y, (key) => {
      if (key === "back") { this.switchView("menu"); return; }
      const [dir, sizeStr] = key.split("_");
      const men = Number(sizeStr) * (dir === "leave" ? 1 : -1);
      const before = garrisonAt(this.worldState, portKey);
      this.worldState = stationMen(this.worldState, portKey, men);
      const moved = garrisonAt(this.worldState, portKey) - before;
      this.garrisonMessage = moved >= 0
        ? t("garrison.left", { men: moved })
        : t("garrison.taken", { men: -moved });
      this.registry.set("worldState", this.worldState);
      this.switchView("garrison");
    });

    this.bindKey("keydown-ESC", () => this.switchView("menu"));
  }

  private renderDaughter(): void {
    const portKey = this.currentPortId as string;
    const daughter = daughterFor(this.worldState, portKey);
    if (!daughter) { this.switchView("governor"); return; }

    let y = this.contentStartY;

    const title = this.add.text(this.cx, y, t("romance.title", { name: daughter.name }), txt(16, { bold: true }));
    title.setOrigin(0.5, 0);
    this.contentContainer.add(title);
    y += 26;

    const level = courtshipLevel(this.worldState, portKey);
    const desc = this.add.text(
      this.infoX, y,
      t("romance.beauty_" + daughter.beauty) + "   " + t("romance.standing", { value: level }),
      txt(12, { color: "#555555" }),
    );
    this.contentContainer.add(desc);
    y += 20;

    if (this.courtshipMessage) {
      const msg = this.add.text(this.infoX, y, this.courtshipMessage, {
        ...txt(12, { color: "#6a4a1a" }),
        wordWrap: { width: DLG_W - PAD * 2 },
        fontStyle: "italic",
      });
      this.contentContainer.add(msg);
      y += msg.height + 10;
      this.courtshipMessage = null;
    }

    const charm = effectiveSkill(this.worldState, "charm");
    const odds = (approach: Approach) => Math.round(approachChance(
      approach, charm, level, daughter.beauty,
      this.worldState.player.gold, this.worldState.player.notoriety,
    ) * 100);

    const actions: { label: string; key: string }[] = [
      { label: t("romance.opt_compliment", { pct: odds("compliment") }), key: "compliment" },
      { label: t("romance.opt_dance", { pct: odds("dance") }), key: "dance" },
      { label: t("romance.opt_gift", { pct: odds("gift"), cost: GIFT_COST }), key: "gift" },
      { label: t("romance.opt_boast", { pct: odds("boast") }), key: "boast" },
    ];

    const rank = this.worldState.player.ranks?.[daughter.factionKey] ?? 0;
    if (level >= MARRIAGE_THRESHOLD) {
      actions.push(rank >= MARRIAGE_MIN_RANK
        ? { label: t("romance.opt_propose"), key: "propose" }
        : { label: t("romance.opt_propose_blocked", { rank: MARRIAGE_MIN_RANK }), key: "blocked" });
    } else if (level >= SHARES_A_LEAD) {
      const hint = this.add.text(this.infoX, y, t("romance.hint_marriage", { need: MARRIAGE_THRESHOLD }),
        txt(11, { color: "#777777" }));
      this.contentContainer.add(hint);
      y += 18;
    }
    actions.push({ label: t("romance.opt_leave"), key: "back" });

    this.setupActionList(actions, y, (key) => {
      if (key === "back") { this.switchView("governor"); return; }
      if (key === "blocked") { this.courtshipMessage = t("romance.needs_rank"); this.switchView("daughter"); return; }
      if (key === "propose") { this.handlePropose(); return; }
      this.handleCourt(key as Approach);
    });

    const hint = this.add.text(this.cx, this.dlgY + DLG_H - PAD - 4, t("tavern.hint"),
      txt(10, { color: "#888888" }));
    hint.setOrigin(0.5, 1);
    this.contentContainer.add(hint);

    this.bindKey("keydown-ESC", () => this.switchView("governor"));
  }

  private handleCourt(approach: Approach): void {
    const portKey = this.currentPortId as string;
    const result = court(this.worldState, portKey, approach, this.worldState.rng);
    if (result.error) {
      this.courtshipMessage = t("romance.failed_" + result.error);
      this.switchView("daughter");
      return;
    }

    this.worldState = { ...result.world, rng: result.rng };
    this.registry.set("worldState", this.worldState);

    this.courtshipMessage = t((result.succeeded ? "romance.win_" : "romance.lose_") + approach)
      + "  " + t("romance.delta", { delta: result.delta > 0 ? "+" + result.delta : String(result.delta) });

    // Crossing the halfway mark is where the family thread can start for free:
    // she repeats what her father says at dinner, and one of the names is a
    // marquis nobody in the family talks about.
    if (result.unlockedLead) {
      const started = startFamilySearch(this.worldState, this.worldState.rng);
      this.worldState = { ...started.world, rng: started.rng };
      this.registry.set("worldState", this.worldState);
      if (started.started) this.courtshipMessage += "  " + t("family.lead_from_daughter");
    }

    this.switchView("daughter");
  }

  private handlePropose(): void {
    const result = propose(this.worldState, this.currentPortId as string);
    if (!result.accepted) {
      this.courtshipMessage = t("romance.propose_" + (result.reason ?? "too_soon"));
      this.switchView("daughter");
      return;
    }
    this.worldState = result.world;
    this.registry.set("worldState", this.worldState);
    this.courtshipMessage = t("romance.propose_accepted");
    this.switchView("daughter");
  }

  // ===== The family thread =====

  /**
   * Buy the first name off an informer.
   *
   * The same `startFamilySearch` the governor's daughter can trigger for free —
   * this is the paid door, for a captain with no interest in courting anybody.
   * Refuses quietly if the hunt is already under way.
   */
  private handleAskAboutFamily(): void {
    if (this.worldState.player.gold < INFORMER_PRICE) {
      this.tavernMessage = t("family.informer_too_expensive", { price: INFORMER_PRICE });
      this.switchView("tavern");
      return;
    }
    const paid: WorldState = {
      ...this.worldState,
      player: { ...this.worldState.player, gold: this.worldState.player.gold - INFORMER_PRICE },
    };
    const started = startFamilySearch(paid, paid.rng);
    if (!started.started) {
      this.tavernMessage = t("family.informer_nothing");
      this.switchView("tavern");
      return;
    }
    this.worldState = { ...started.world, rng: started.rng };
    this.registry.set("worldState", this.worldState);

    const chain = activeFamilyChain(this.worldState);
    const first = chain?.steps[0];
    this.tavernMessage = first
      ? t("family.informer_told", { port: CITIES[first.portKey]?.name ?? first.portKey })
      : t("family.informer_nothing");
    this.switchView("tavern");
  }

  /**
   * Storm the house they are held in.
   *
   * The fight is a duel like every other personal fight in this game. Winning
   * sets the step flag; `advanceQuests` picks it up and pays. Losing costs
   * nothing but the walk back — the marquis' men have every reason to keep a
   * captain worth ransoming alive, and a dead end here would strand the thread.
   */
  private handleFamilyStrike(): void {
    const here = stepAtPort(this.worldState, this.currentPortId as string);
    if (!here) { this.switchView("tavern"); return; }

    this.scene.pause();
    this.scene.launch("DuelScene", {
      playerFencing: effectiveSkill(this.worldState, "fencing"),
      enemyFencing: enemyFencingFor(30, 45, this.worldState.player.notoriety ?? 0),
      seed: this.worldState.time.day * 131 + here.index * 17,
      onFinish: (playerWon: boolean) => {
        this.scene.resume();
        if (!playerWon) {
          this.tavernMessage = t("family.strike_lost");
          this.switchView("tavern");
          return;
        }
        const freed = freeRelative(this.worldState, here.index);
        const advanced = advanceQuests(
          freed,
          { type: "flag_set", key: "family_step_" + here.index },
          buildQuestRegistry(freed),
        );
        this.worldState = advanced.world;
        this.registry.set("worldState", this.worldState);
        this.tavernMessage = t("family.strike_won_" + here.step.relative);
        this.scene.restart({
          worldState: this.worldState,
          portId: this.currentPortId,
          returnToView: "tavern" as PortView,
        });
      },
    });
  }

  // ===== VIEW: Merchant =====

  // ===== VIEW: The family storehouse =====

  /**
   * Goods left ashore at the town the captain married into.
   *
   * A separate view rather than a column in the merchant's table, because the
   * two are different transactions: the merchant turns cargo into money at a
   * price that moves, and this turns cargo into cargo-that-is-somewhere-else.
   * Sharing a screen would invite reading the storehouse as a second market.
   *
   * Ten tons a keystroke, both ways, clamped by whichever side runs out first.
   */
  private renderWarehouse(): void {
    const portKey = this.currentPortId as string;
    const ship = this.worldState.entities[this.worldState.player.shipId as string]?.ship;
    let y = this.contentStartY;

    const title = this.add.text(this.infoX, y,
      t("warehouse.title", { port: t("port." + portKey + ".name") }), txt(13, { bold: true }));
    this.contentContainer.add(title);
    y += 20;

    // Nothing here yet — the screen is the landlord's offer instead (v0.24.0).
    if (!hasStorage(this.worldState, portKey)) {
      this.renderRentOffer(portKey, y);
      return;
    }

    const used = storageUsed(this.worldState, portKey);
    this.contentContainer.add(this.add.text(this.infoX, y,
      t("warehouse.capacity", {
        used,
        cap: storageCap(this.worldState, portKey),
        hold: holdFree(this.worldState),
      }),
      txt(11, { color: "#555555" })));
    y += 16;

    // A rented shed runs on a clock and the clock is the whole cost of the
    // feature, so it is on the screen, in red when it is nearly out.
    const left = daysLeft(this.worldState, portKey);
    if (!isHomePort(this.worldState, portKey)) {
      const renew = this.add.text(this.infoX, y,
        t("warehouse.lease_days", { days: left, gold: rentFor(this.worldState, portKey) }),
        txt(11, { color: left <= 5 ? "#aa3333" : "#555555", bold: left <= 5 }));
      renew.setInteractive({ useHandCursor: true });
      renew.on("pointerdown", () => this.handleRentStorehouse());
      this.contentContainer.add(renew);
    }
    y += 22;

    const colName = this.infoX;
    const colAboard = this.infoX + 150;
    const colAshore = this.infoX + 230;
    const colStore = this.infoX + 300;
    const colTake = this.infoX + 372;

    this.contentContainer.add(this.add.text(colName, y, t("warehouse.col_item"), txt(10, { bold: true, color: "#666666" })));
    this.contentContainer.add(this.add.text(colAboard, y, t("warehouse.col_aboard"), txt(10, { bold: true, color: "#666666" })));
    this.contentContainer.add(this.add.text(colAshore, y, t("warehouse.col_ashore"), txt(10, { bold: true, color: "#666666" })));
    y += 16;

    const store = goodsAshore(this.worldState, portKey);
    const rows = Object.keys(ITEMS).filter(
      key => (ship?.cargo?.[key] ?? 0) > 0 || (store[key] ?? 0) > 0,
    );

    if (rows.length === 0) {
      this.contentContainer.add(this.add.text(this.infoX, y, t("warehouse.empty"), txt(12, { color: "#888888" })));
      y += 22;
    }

    // Keep the cursor on a row that still exists: moving the last of a good
    // one way or the other takes its row off the list.
    if (this.selectedIndex >= rows.length) this.selectedIndex = Math.max(0, rows.length - 1);

    for (let ri = 0; ri < rows.length; ri++) {
      const key = rows[ri];
      const aboard = ship?.cargo?.[key] ?? 0;
      const ashore = store[key] ?? 0;

      if (ri === this.selectedIndex) {
        this.contentContainer.add(
          this.add.rectangle(this.cx, y + 8, DLG_W - PAD * 2, 20, 0x222244, 0.15));
        this.contentContainer.add(this.add.text(colName - 14, y, "\u25B6", txt(10, { bold: true })));
      }

      this.contentContainer.add(this.add.text(colName, y, t("item." + key + ".name"), txt(11)));
      this.contentContainer.add(this.add.text(colAboard, y, String(aboard), txt(11, { color: "#555555" })));
      this.contentContainer.add(this.add.text(colAshore, y, String(ashore), txt(11, { color: "#555555" })));

      if (aboard > 0 && storageFree(this.worldState, portKey) > 0) {
        const btn = this.add.text(colStore, y, t("warehouse.store"), txt(10, { bold: true, color: "#2266aa" }));
        btn.setInteractive({ useHandCursor: true });
        btn.on("pointerdown", () => this.moveGoods(key, 10, true));
        this.contentContainer.add(btn);
      }
      if (ashore > 0 && holdFree(this.worldState) > 0) {
        const btn = this.add.text(colTake, y, t("warehouse.take"), txt(10, { bold: true, color: "#2266aa" }));
        btn.setInteractive({ useHandCursor: true });
        btn.on("pointerdown", () => this.moveGoods(key, 10, false));
        this.contentContainer.add(btn);
      }
      y += 20;
    }

    const hint = this.add.text(
      this.cx, this.dlgY + DLG_H - PAD - 4, t("warehouse.hint"), txt(10, { color: "#888888" }));
    hint.setOrigin(0.5, 1);
    this.contentContainer.add(hint);

    const backBtn = this.add.text(
      this.infoX, this.dlgY + DLG_H - PAD - 48, t("governor.back"), txt(13, { bold: true }));
    backBtn.setInteractive({ useHandCursor: true });
    backBtn.on("pointerdown", () => this.switchView("menu"));
    this.contentContainer.add(backBtn);

    // The same keys the merchant uses, so the two screens do not need learning
    // separately: W/S to pick a row, Q to send it ashore, E to bring it back.
    const move = (delta: number) => {
      const next = this.selectedIndex + delta;
      if (next < 0 || next >= rows.length) return;
      this.selectedIndex = next;
      this.switchView("warehouse");
    };
    this.bindKey("keydown-UP", () => move(-1));
    this.bindKey("keydown-W", () => move(-1));
    this.bindKey("keydown-DOWN", () => move(1));
    this.bindKey("keydown-S", () => move(1));
    this.bindKey("keydown-Q", () => { const k = rows[this.selectedIndex]; if (k) this.moveGoods(k, 10, true); });
    this.bindKey("keydown-E", () => { const k = rows[this.selectedIndex]; if (k) this.moveGoods(k, 10, false); });
    this.bindKey("keydown-ESC", () => this.switchView("menu"));
  }

  private moveGoods(itemId: string, qty: number, ashore: boolean): void {
    const portKey = this.currentPortId as string;
    const result = ashore
      ? storeAt(this.worldState, portKey, itemId, qty)
      : withdrawAt(this.worldState, portKey, itemId, qty);
    if (result.moved <= 0) return;
    this.worldState = result.world;
    this.registry.set("worldState", this.worldState);
    this.switchView("warehouse");
  }

  /**
   * The landlord's offer, when the captain has nowhere to put anything down.
   *
   * Deliberately the same screen rather than a separate view: "rent a shed"
   * and "use the shed" are one place in the town, and a menu entry that led
   * somewhere different depending on state would be worse than one that leads
   * to the same room with a different man standing in it.
   */
  private renderRentOffer(portKey: string, top: number): void {
    let y = top;
    const cost = rentFor(this.worldState, portKey);
    const cap = storageCap(this.worldState, portKey);

    this.contentContainer.add(this.add.text(
      this.infoX, y,
      t("warehouse.offer", { cap, gold: cost, days: LEASE_DAYS }),
      { ...txt(12), wordWrap: { width: DLG_W - PAD * 2 } },
    ));
    y += 46;

    this.contentContainer.add(this.add.text(
      this.infoX, y, t("warehouse.offer_note"),
      { ...txt(11, { color: "#666666" }), wordWrap: { width: DLG_W - PAD * 2 } },
    ));
    y += 62;

    const afford = this.worldState.player.gold >= cost;
    this.setupActionList(
      [
        { label: afford ? t("warehouse.take_lease", { gold: cost }) : t("warehouse.cannot_afford"), key: "rent" },
        { label: t("governor.back"), key: "back" },
      ],
      y,
      (key) => {
        if (key === "rent" && afford) this.handleRentStorehouse();
        else this.switchView("menu");
      },
    );
  }

  private handleRentStorehouse(): void {
    const result = rentStorehouse(this.worldState, this.currentPortId as string);
    if (!result.rented) return;
    this.worldState = result.world;
    this.registry.set("worldState", this.worldState);
    this.scene.restart({
      worldState: this.worldState,
      portId: this.currentPortId,
      returnToView: "warehouse" as PortView,
    });
  }

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
    this.contentContainer.add(this.add.text(colPrice, y, t("port.col_buy_sell"), txt(10, { bold: true, color: "#666666" })));
    this.contentContainer.add(this.add.text(colStock, y, "Stock", txt(10, { bold: true, color: "#666666" })));
    this.contentContainer.add(this.add.text(colOwn, y, "Own", txt(10, { bold: true, color: "#666666" })));
    y += 16;

    // Table rows with keyboard navigation
    // Every ordinary good, whether he has any or not — that is what makes this
    // a market rather than a shelf. A rare good only where something put it
    // there: gold appears on the counter of a town that has struck it and
    // nowhere else (v0.29.0).
    const itemKeys = Object.keys(ITEMS).filter(key => {
      if (!ITEMS[key].rare) return true;
      // Where it is struck, where some of it is standing on the quay — and
      // where the captain has it in his hold, or he could carry gold across
      // the Caribbean and find no counter that would take it off him.
      return (portState?.bonusProduces.includes(key) ?? false)
        || (portState?.inventory[key] ?? 0) > 0
        || (playerShip?.ship?.cargo[key] ?? 0) > 0;
    });
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
      // Two numbers now, not one: what the counter asks and what it offers.
      // The spread between them is his standing, and printing both is the only
      // way he can see it without doing arithmetic (v0.24.0).
      const ask = playerBuyPrice(this.worldState, portKey, key);
      const bid = playerSellPrice(this.worldState, portKey, key);
      const stock = portState?.inventory[key] ?? 0;
      const owned = playerShip?.ship?.cargo[key] ?? 0;
      const isFocused = ri === this.selectedIndex;
      const rowColor = isFocused ? "#000000" : "#1a1a1a";

      this.contentContainer.add(this.add.text(colName, y, t("item." + key + ".name"), txt(12, { color: rowColor, bold: isFocused })));
      this.contentContainer.add(this.add.text(colPrice, y, `${ask} / ${bid}`, txt(12, { bold: true, color: rowColor })));
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

    // And what that did to the town's table (v0.27.0). Above the covering line
    // because it is the consequence and the covering line is the cause.
    if (townIsHungry(this.worldState, portKey)) {
      this.contentContainer.add(this.add.text(
        this.infoX, this.dlgY + DLG_H - PAD - 80,
        t("port.hungry", { pct: Math.round(townHunger(this.worldState, portKey) * 100) }),
        { ...txt(11, { color: "#aa3333" }), wordWrap: { width: DLG_W - PAD * 2 } },
      ));
    }

    // Why the shelves are bare and the prices doubled, when they are (v0.26.0).
    // A lane delivery leaves a real warehouse now, so a town covering a shut-in
    // rival's runs is genuinely short of its own crop — and that is a fact
    // about a harbour three hundred miles away which the player has no other
    // way of reading off this screen.
    const covering = reroutedOnto(this.worldState, portKey);
    if (covering.length > 0) {
      this.contentContainer.add(this.add.text(
        this.infoX, this.dlgY + DLG_H - PAD - 64,
        t("port.covering", {
          items: covering
            .slice(0, 2)
            .map(c => `${t("item." + c.item + ".name")} ${c.tons} t/d`)
            .join(", "),
        }),
        txt(11, { color: "#996633" }),
      ));
    }

    // What his standing is costing him at this counter, in plain percent. The
    // number that matters is the round trip — the gap between the two columns
    // above — because that is what he loses on every barrel he handles twice.
    const access = portAccess(this.worldState, portKey);
    const wide = access.spread > 0.12;
    this.contentContainer.add(this.add.text(
      this.infoX, this.dlgY + DLG_H - PAD - 48,
      t("port.spread", {
        level: t("rep." + access.level),
        pct: Math.round(access.spread * 200),
      }),
      txt(11, { color: wide ? "#aa3333" : access.spread < 0.12 ? "#227722" : "#666666" }),
    ));

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

  // ===== VIEW: Charter (freight) =====

  /**
   * The freight office (v0.23.0).
   *
   * Two lists in one screen, because they are two halves of one job: what this
   * town wants carried, and what the captain is already carrying for somebody
   * else. A charter he is standing at the far end of shows a *deliver* line
   * instead of a destination, which is the only place the hold gets emptied.
   *
   * The fee is printed with the reason for it — danger money, a cordon to run —
   * because a number that quietly triples is a number the player will not
   * trust. He should be able to see what he is being paid for.
   */
  private renderCharter(): void {
    const portKey = this.currentPortId as string;
    let y = this.contentStartY;

    const title = this.add.text(this.cx, y, t("charter.title"), txt(16, { bold: true }));
    title.setOrigin(0.5, 0);
    this.contentContainer.add(title);
    y += 26;

    const room = holdRoom(this.worldState);
    this.contentContainer.add(
      this.add.text(this.infoX, y, t("charter.hold_room", { room }), txt(11, { color: "#666666" })),
    );
    y += 18;

    const held = activeCharters(this.worldState);
    const offers = cargoOffers(this.worldState, portKey);
    const actions: { label: string; key: string }[] = [];

    if (held.length > 0) {
      this.contentContainer.add(
        this.add.text(this.infoX, y, t("charter.carrying"), txt(12, { bold: true, color: "#444444" })),
      );
      y += 18;
      for (const contract of held) {
        const item = t("item." + contract.item + ".name");
        if (canDeliver(this.worldState, contract)) {
          actions.push({
            label: t("charter.deliver", { qty: contract.qty, item, gold: contract.reward }),
            key: "deliver:" + contract.id,
          });
        } else {
          this.contentContainer.add(this.add.text(
            this.infoX + 8, y,
            t("charter.en_route", { qty: contract.qty, item, port: contract.toName, gold: contract.reward }),
            txt(11, { color: "#666666" }),
          ));
          y += 16;
        }
      }
      y += 6;
    }

    this.contentContainer.add(
      this.add.text(this.infoX, y, t("charter.on_offer"), txt(12, { bold: true, color: "#444444" })),
    );
    y += 12;

    if (offers.length === 0) {
      // "Nothing today" and "not to you" are different answers and the player
      // is owed the second one (v0.24.0) — otherwise a closed book looks like
      // a quiet week and he never learns what his standing cost him.
      const shut = !portAccess(this.worldState, portKey).canCharter;
      this.contentContainer.add(
        this.add.text(
          this.infoX + 8, y + 14,
          shut ? t("charter.refused") : t("charter.nothing"),
          txt(11, { color: shut ? "#aa3333" : "#886655" }),
        ),
      );
      y += 20;
    }

    for (const offer of offers) {
      const item = t("item." + offer.item + ".name");
      let note = "";
      if (blockadeEffective(this.worldState, offer.to)) note = "  [" + t("charter.note_blockade") + "]";
      else if ((disruptions(this.worldState)[offer.from + "__" + offer.to]?.severity ?? 0) > 0) {
        note = "  [" + t("charter.note_danger") + "]";
      }
      actions.push({
        label: t("charter.offer", {
          qty: offer.qty, item, port: offer.toName, gold: offer.reward, days: offer.days,
        }) + note,
        key: "take:" + offer.id,
      });
    }

    actions.push({ label: t("governor.back"), key: "back" });

    this.setupActionList(actions, y + 8, (key) => {
      if (key === "back") { this.switchView("menu"); return; }
      if (key.startsWith("take:")) {
        const offer = offers.find(o => o.id === key.slice(5));
        if (offer) this.handleTakeCharter(offer);
        return;
      }
      if (key.startsWith("deliver:")) {
        const contract = held.find(c => c.id === key.slice(8));
        if (contract) this.handleDeliverCharter(contract);
      }
    });

    if (this.tavernMessage) {
      this.contentContainer.add(this.add.text(
        this.infoX, this.dlgY + DLG_H - PAD - 26, this.tavernMessage,
        txt(12, { color: "#884422" }),
      ));
    }

    this.bindKey("keydown-ESC", () => this.switchView("menu"));
  }

  private handleTakeCharter(offer: CargoContract): void {
    const result = acceptCharter(this.worldState, offer);
    if (result.error) {
      this.tavernMessage = t(result.error);
      this.switchView("charter");
      return;
    }
    this.worldState = result.world;
    this.registry.set("worldState", this.worldState);
    this.tavernMessage = t("charter.taken", {
      qty: offer.qty,
      item: t("item." + offer.item + ".name"),
      port: offer.toName,
    });
    this.selectedIndex = 0;
    this.switchView("charter");
  }

  /**
   * Hand the cargo over and let the quest machine pay for it.
   *
   * `deliverCharter` only moves goods and stamps the flag; the gold, the
   * standing and the log line all come out of `advanceQuests`, which is the
   * same division of labour the defence commission uses. Paying here as well
   * would pay twice.
   */
  private handleDeliverCharter(contract: CargoContract): void {
    const result = deliverCharter(this.worldState, contract);
    if (result.error) {
      this.tavernMessage = t(result.error);
      this.switchView("charter");
      return;
    }
    const advanced = advanceQuests(
      result.world,
      { type: "flag_set", key: cargoDeliveredFlag(contract) },
      buildQuestRegistry(result.world),
    );
    this.worldState = advanced.world;
    this.registry.set("worldState", this.worldState);
    this.tavernMessage = t("charter.delivered", { gold: contract.reward });
    this.selectedIndex = 0;
    this.switchView("charter");
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
      const home = isHomePort(this.worldState, this.currentPortId as string);
      const damage = repairableDamage(this.worldState);
      if (damage > 0) {
        // The yard's rate carries the town's opinion since v0.24.0 — double for
        // an enemy, a shilling off for an ally — so the quoted bill has to ask
        // the same function the work will be charged at.
        const repairCost = home ? 0 : Math.round(damage * repairRate(this.worldState, this.currentPortId));
        const repairLabel = home
          ? t("shipyard.careen", { damage })
          : t("shipyard.repair", { damage, cost: repairCost });
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
    const yardWelcome = portAccess(this.worldState, portKey).canBuyShips;
    const header = this.add.text(
      this.infoX, y,
      yardWelcome ? t("shipyard.ships_for_sale") : t("shipyard.no_hulls_for_you"),
      txt(13, { bold: true, color: yardWelcome ? "#1a1a1a" : "#aa3333" }),
    );
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
        const welcome = portAccess(this.worldState, portKey).canBuyShips;
        const canAfford = welcome && this.worldState.player.gold >= cls.buyPrice;
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
    // In the family's yard the work is done on her father's account, and it
    // covers the rig and the consorts as well as the flagship.
    let result: { world: WorldState; repaired: number };
    if (isHomePort(this.worldState, this.currentPortId as string)) {
      const careened = careen(this.worldState);
      result = { world: careened.world, repaired: careened.restored };
    } else {
      result = repairShip(this.worldState, this.currentPortId);
    }
    if (result.repaired > 0) {
      this.worldState = result.world;
      this.registry.set("worldState", this.worldState);
      this.scene.restart({ worldState: this.worldState, portId: this.currentPortId, returnToView: "shipyard" as PortView });
    }
  }

  private handleBuyShip(classKey: string): void {
    const result = buyShip(this.worldState, shipClassId(classKey), this.currentPortId);
    if (result.bought) {
      this.worldState = result.world;
      this.registry.set("worldState", this.worldState);
      this.scene.restart({ worldState: this.worldState, portId: this.currentPortId, returnToView: "shipyard" as PortView });
    }
  }

  private handleBuyToFleet(classKey: string): void {
    const result = buyShipToFleet(this.worldState, shipClassId(classKey), this.currentPortId);
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
