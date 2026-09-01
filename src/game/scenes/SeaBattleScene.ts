import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import type { CombatState, CombatEvent } from "../../core/model/CombatState.ts";
import type { CombatCommand } from "../../core/model/Commands.ts";
import type { EntityId } from "../../core/model/ids.ts";
import { CombatEngine } from "../../core/engine/CombatEngine.ts";
import { FxManager } from "../render/FxManager.ts";
import { headingToDir8 } from "../../core/services/Geometry.ts";
import { DIR8_TO_FRAME } from "../render/WorldRenderer.ts";
import { t } from "../../core/i18n/index.ts";
import { txt } from "../ui/textStyle.ts";
import { addLogEntry } from "../../core/systems/EventLogSystem.ts";
import { AMMO_DEFS, AMMO_ORDER, type AmmoType } from "../../core/data/ammo.ts";
import type { AiArchetype } from "../../core/engine/CombatEngine.ts";
import { changeReputation } from "../../core/systems/ReputationSystem.ts";
import { addToFleet, canAddToFleet } from "../../core/systems/FleetSystem.ts";
import { SHIP_CLASSES } from "../../core/data/ships.ts";
import type { CombatEntityState } from "../../core/model/CombatState.ts";
import type { ShipClassId, FactionId } from "../../core/model/ids.ts";
import { windSpeedModifier } from "../../core/systems/WeatherSystem.ts";
import {
  hullCondition,
  rigCondition,
  hullTier,
  rigTier,
  damageSpeedMultiplier,
  cargoSurvivingSinking,
} from "../../core/systems/DamageSystem.ts";

const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;
/** How long a hull takes to go under once its hull hits zero (v0.9.9). */
const SINK_DURATION_MS = 1400;

export class SeaBattleScene extends Phaser.Scene {
  private worldState!: WorldState;
  private combatState!: CombatState;
  private combatEngine!: CombatEngine;
  private fxManager!: FxManager;
  private tickAccumulator = 0;
  private commandBuffer: CombatCommand[] = [];

  private playerSprite!: Phaser.GameObjects.Sprite;
  private enemySprite!: Phaser.GameObjects.Sprite;
  private playerCrewText!: Phaser.GameObjects.Text;
  private enemyCrewText!: Phaser.GameObjects.Text;
  private allyCrewTexts: Record<string, Phaser.GameObjects.Text> = {};
  private battleOver = false;
  // Phase A visual additions
  private windArrow!: Phaser.GameObjects.Graphics;
  private playerHullBar!: Phaser.GameObjects.Graphics;
  private playerSailBar!: Phaser.GameObjects.Graphics;
  private enemyHullBar!: Phaser.GameObjects.Graphics;
  private enemySailBar!: Phaser.GameObjects.Graphics;
  private playerLabel!: Phaser.GameObjects.Text;
  private enemyLabel!: Phaser.GameObjects.Text;
  // Anchor offset: arena coords are centered into the camera view
  private arenaOriginX = 0;
  private arenaOriginY = 0;
  private currentAmmo: AmmoType = "round";
  private ammoButtonsText: Phaser.GameObjects.Text[] = [];
  /** Allied fleet sprites + bars keyed by entity id. */
  private allySprites: Record<string, Phaser.GameObjects.Sprite> = {};
  /** Ships whose sinking animation has already been started, by entity id. */
  private sinkingSprites = new Set<string>();
  private allyBars: Record<string, { hull: Phaser.GameObjects.Graphics; sail: Phaser.GameObjects.Graphics }> = {};
  /** True when launched via ?battle URL param — uses random corner spawns. */
  private testMode = false;
  /** Battle sail level: 0=Furled (Złożone), 1=Battle (Bojowe), 2=Full (Pełne). Default Battle. */
  private battleSailLevel: 0 | 1 | 2 = 1;
  /** Indicator showing player cannon range (drawn each tick). */
  private rangeCircle!: Phaser.GameObjects.Graphics;
  /** Reload-progress indicators per ship (drawn each tick). */
  private reloadBars: Record<string, Phaser.GameObjects.Graphics> = {};
  /** Far-distance timeout: ms spent at "very far" distance; after 60s shows countdown 60s. */
  private farDistanceMs = 0;
  private countdownMs = 0;
  private timeoutText!: Phaser.GameObjects.Text;
  /** Top-right status HUD: ammo / sails / speed / cannons */
  private statusText!: Phaser.GameObjects.Text;
  /** Enemy cannon count label, drawn under enemy ship next to crew */
  private enemyCannonsText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "SeaBattleScene" });
  }

  /** Build CombatEntityState entries for each fleet ship. Positioned in a column behind flagship. */
  private spawnFleetAllies(playerPos: { x: number; y: number }, playerHeading: number): Record<string, CombatEntityState> {
    const result: Record<string, CombatEntityState> = {};
    const fleet = this.worldState.player.fleet ?? [];
    // Offset each ally slightly behind the player (opposite of heading), staggered left/right.
    const backX = -Math.sin(playerHeading);
    const backY = Math.cos(playerHeading);
    const sideX = Math.cos(playerHeading);
    const sideY = Math.sin(playerHeading);
    for (let i = 0; i < fleet.length; i++) {
      const fs = fleet[i];
      const cls = SHIP_CLASSES[fs.classId];
      const id = ("ally_" + i) as unknown as EntityId;
      const dBack = 60 + i * 40;
      const dSide = (i % 2 === 0 ? -50 : 50);
      result[id as string] = {
        id,
        kind: "ship",
        pos: { x: playerPos.x + backX * dBack + sideX * dSide, y: playerPos.y + backY * dBack + sideY * dSide },
        vel: { x: 0, y: 0 },
        heading: playerHeading,
        sailLevel: 0.5,
        ship: {
          classId: fs.classId as unknown as ShipClassId,
          factionId: "player" as unknown as FactionId,
          hullHp: fs.hullHp,
          hullMax: fs.hullMax,
          sailsHp: fs.sailsHp,
          sailsMax: fs.sailsMax,
          cannons: fs.cannons,
          crew: { current: cls?.crewMax ?? 10, max: cls?.crewMax ?? 10, morale: 0.8 },
          cooldown: { left: 0, right: 0 },
          ammoType: "round",
        },
      };
    }
    return result;
  }

  init(data: { worldState: WorldState; enemyId: EntityId; testMode?: boolean }): void {
    this.worldState = data.worldState;
    this.testMode = data.testMode === true;

    // Build combat state from world entities
    const playerId = this.worldState.player.shipId;
    const playerEntity = this.worldState.entities[playerId as string];
    const enemyEntity = this.worldState.entities[data.enemyId as string];

    const screenW = this.scale.width;
    const screenH = this.scale.height;
    // Arena is 3x the screen — player can sail around; camera follows them.
    const w = screenW * 3;
    const h = screenH * 3;

    // Cannon range — modest fraction of the screen so combat feels tactical, not blanket.
    const cannonRange = screenW * 0.25;

    // Player always spawns at arena center (camera follows them, so they're visually centered)
    let playerPos = { x: w * 0.5, y: h * 0.5 };
    let enemyPos = { x: w * 0.5 + 200, y: h * 0.5 };
    if (this.testMode) {
      // ?battle=1 test mode: enemy spawns in a random screen corner relative to player.
      // Offsets are well within the visible viewport so the enemy is on-screen at start.
      const offsets = [
        { x: -screenW * 0.30, y: -screenH * 0.25 },
        { x:  screenW * 0.30, y: -screenH * 0.25 },
        { x: -screenW * 0.30, y:  screenH * 0.25 },
        { x:  screenW * 0.30, y:  screenH * 0.25 },
      ];
      const off = offsets[Math.floor(Math.random() * 4)];
      enemyPos = { x: playerPos.x + off.x, y: playerPos.y + off.y };
    } else if (playerEntity && enemyEntity) {
      // Map-relative: preserve bearing & distance from the world-map encounter,
      // scaled up so combat has room to maneuver.
      const BATTLE_SCALE = 8;
      const dx = (enemyEntity.pos.x - playerEntity.pos.x) * BATTLE_SCALE;
      const dy = (enemyEntity.pos.y - playerEntity.pos.y) * BATTLE_SCALE;
      const len = Math.sqrt(dx * dx + dy * dy);
      const MIN_DIST = 120;
      const MAX_DIST = cannonRange * 1.1; // just beyond cannon range — close to engage
      const scaledLen = Math.max(MIN_DIST, Math.min(MAX_DIST, len));
      const nx = len > 0 ? dx / len : 1;
      const ny = len > 0 ? dy / len : 0;
      enemyPos = {
        x: playerPos.x + nx * scaledLen,
        y: playerPos.y + ny * scaledLen,
      };
    }

    // Both ships face each other so initial broadsides are usable
    const angleE = Math.atan2(enemyPos.x - playerPos.x, -(enemyPos.y - playerPos.y));
    const playerHeading = angleE + Math.PI / 2; // broadside-on (enemy on right)
    const enemyHeading = angleE - Math.PI / 2;

    // Wind: inherit from world map at battle start; randomize for ?battle=1 testing
    const windDirRad = this.testMode
      ? Math.random() * Math.PI * 2
      : this.worldState.weather.windDirRad;
    const windStrength = this.testMode
      ? 0.3 + Math.random() * 0.6 // 0.3..0.9
      : this.worldState.weather.windStrength;

    this.combatState = {
      version: 1,
      time: { tick: 0 },
      cannonRange,
      arena: { width: w, height: h },
      wind: {
        dirRad: windDirRad,
        strength: windStrength,
      },
      playerShipId: playerId,
      enemyShipId: data.enemyId,
      entities: {
        [playerId as string]: {
          id: playerId,
          kind: "ship",
          pos: { x: playerPos.x, y: playerPos.y },
          vel: { x: 0, y: 0 },
          heading: playerHeading,
          sailLevel: 0.5, // start at "Battle" sail level
          ship: playerEntity?.ship ? {
            classId: playerEntity.ship.classId,
            factionId: playerEntity.ship.factionId,
            hullHp: playerEntity.ship.hullHp,
            hullMax: playerEntity.ship.hullMax,
            sailsHp: playerEntity.ship.sailsHp,
            sailsMax: playerEntity.ship.sailsMax,
            cannons: playerEntity.ship.cannons,
            crew: { ...playerEntity.ship.crew },
            cooldown: { left: 0, right: 0 },
            ammoType: "round",
          } : undefined,
        },
        [data.enemyId as string]: {
          id: data.enemyId,
          kind: "ship",
          pos: { x: enemyPos.x, y: enemyPos.y },
          vel: { x: 0, y: 0 },
          heading: enemyHeading,
          sailLevel: 0.5,
          ship: enemyEntity?.ship ? {
            classId: enemyEntity.ship.classId,
            factionId: enemyEntity.ship.factionId,
            hullHp: enemyEntity.ship.hullHp,
            hullMax: enemyEntity.ship.hullMax,
            sailsHp: enemyEntity.ship.sailsHp,
            sailsMax: enemyEntity.ship.sailsMax,
            cannons: enemyEntity.ship.cannons,
            crew: { ...enemyEntity.ship.crew },
            cooldown: { left: 0, right: 0 },
          } : undefined,
        },
        // Phase D: player fleet ships fight as allies (positioned behind flagship)
        ...this.spawnFleetAllies(playerPos, playerHeading),
      },
      events: [],
    };
  }

  create(): void {
    this.combatEngine = new CombatEngine();
    this.fxManager = new FxManager(this);
    this.battleOver = false;
    this.currentAmmo = "round";
    this.battleSailLevel = 1; // Battle sails by default — matches initial sailLevel 0.5 in init

    // Map NPC behavior → AI archetype (Phase B)
    const enemyEntity = this.worldState.entities[this.combatState.enemyShipId as string];
    const behavior = enemyEntity?.ai?.behavior;
    let archetype: AiArchetype = "aggressive";
    if (behavior === "trader") archetype = "defensive";
    else if (behavior === "navy" || behavior === "pirate_hunter") archetype = "tactical";
    this.combatEngine.setArchetype(archetype);

    // Reload speed depends on crew training. Player uses captain's current value;
    // NPC enemies default to 0.5 (decent professional crew).
    const playerTraining = this.worldState.captain?.training ?? 0.5;
    this.combatEngine.setPlayerTraining(playerTraining);
    this.combatEngine.setEnemyTraining(0.5);

    const cam = this.cameras.main;
    // Arena coordinates ARE world coordinates; camera will follow the player.
    this.arenaOriginX = 0;
    this.arenaOriginY = 0;
    cam.setBounds(0, 0, this.combatState.arena.width, this.combatState.arena.height);
    cam.setBackgroundColor("#06182d");

    // Wave background painted across the FULL arena so player can sail far without seeing edge.
    const wavesGfx = this.add.graphics();
    wavesGfx.lineStyle(1, 0x2a5a88, 0.3);
    const aw = this.combatState.arena.width;
    const ah = this.combatState.arena.height;
    for (let yy = 0; yy < ah; yy += 40) {
      wavesGfx.beginPath();
      const yOff = (yy * 13) % 80;
      for (let xx = 0; xx < aw; xx += 12) {
        const dy = Math.sin((xx + yOff) * 0.04) * 3;
        if (xx === 0) wavesGfx.moveTo(xx, yy + dy);
        else wavesGfx.lineTo(xx, yy + dy);
      }
      wavesGfx.strokePath();
    }
    wavesGfx.setDepth(-100);

    // Ships at native positions (arenaOrigin = 0) — 3x smaller per user request
    const playerEnt = this.combatState.entities[this.combatState.playerShipId as string];
    const enemyEnt = this.combatState.entities[this.combatState.enemyShipId as string];
    this.playerSprite = this.add.sprite(playerEnt?.pos.x ?? 200, playerEnt?.pos.y ?? 300, "sailship", 0).setScale(0.3);
    this.enemySprite = this.add.sprite(enemyEnt?.pos.x ?? 600, enemyEnt?.pos.y ?? 300, "sailship", 0).setScale(0.3);
    this.playerSprite.setDepth(50);
    this.enemySprite.setDepth(50);

    // Camera follows player so they appear fixed at screen center
    cam.startFollow(this.playerSprite, true, 1, 1);

    // Cannon range indicator — faint circle around player
    this.rangeCircle = this.add.graphics().setDepth(20);

    // Reload progress bars per ship
    this.reloadBars[this.combatState.playerShipId as string] = this.add.graphics().setDepth(62);
    this.reloadBars[this.combatState.enemyShipId as string] = this.add.graphics().setDepth(62);

    // Crew + cannon labels under each ship — centered, slightly bigger so they're obvious
    this.playerCrewText = this.add.text(0, 0, "",
      txt(11, { bold: true, color: "#cce8ff" })).setOrigin(0.5, 0.5).setDepth(63);
    this.enemyCrewText = this.add.text(0, 0, "",
      txt(11, { bold: true, color: "#ffd0d0" })).setOrigin(0.5, 0.5).setDepth(63);

    // Ship labels
    this.playerLabel = this.add.text(0, 0, t("battle.your_ship"),
      txt(11, { bold: true, color: "#88ddff" }))
      .setOrigin(0.5, 1).setDepth(60);
    this.enemyLabel = this.add.text(0, 0, t("battle.enemy"),
      txt(11, { bold: true, color: "#ff8888" }))
      .setOrigin(0.5, 1).setDepth(60);

    // HP/sail bars per ship (drawn each tick)
    this.playerHullBar = this.add.graphics().setDepth(60);
    this.playerSailBar = this.add.graphics().setDepth(60);
    this.enemyHullBar = this.add.graphics().setDepth(60);
    this.enemySailBar = this.add.graphics().setDepth(60);

    // Phase D: allied fleet sprites (3x smaller)
    for (const [id, entity] of Object.entries(this.combatState.entities)) {
      if (!id.startsWith("ally_")) continue;
      const sprite = this.add.sprite(entity.pos.x, entity.pos.y, "sailship", 0).setScale(0.23);
      sprite.setDepth(45);
      sprite.setTint(0x99ddff); // tint allies blueish
      this.allySprites[id] = sprite;
      this.allyBars[id] = {
        hull: this.add.graphics().setDepth(60),
        sail: this.add.graphics().setDepth(60),
      };
      this.reloadBars[id] = this.add.graphics().setDepth(62);
      this.allyCrewTexts[id] = this.add.text(0, 0, "",
        txt(10, { color: "#cce8ff" })).setOrigin(0.5, 0.5).setDepth(63);
    }

    // Wind indicator (top-left)
    this.windArrow = this.add.graphics().setDepth(9000).setScrollFactor(0);
    this.drawWindIndicator();

    // Timeout countdown text (center-top, only visible during far-distance countdown)
    this.timeoutText = this.add.text(cam.width / 2, 18, "",
      txt(18, { bold: true, color: "#ff6666" }))
      .setOrigin(0.5, 0).setDepth(9000).setScrollFactor(0)
      .setVisible(false);

    // Status HUD (top-right): ammo / sails / speed / cannons
    this.statusText = this.add.text(cam.width - 14, 14, "", {
      ...txt(13, { color: "#eeeecc" }),
      align: "right",
      backgroundColor: "#00000066",
      padding: { x: 8, y: 6 },
    }).setOrigin(1, 0).setDepth(9000).setScrollFactor(0);

    // Enemy cannons label (drawn next to enemy ship in update)
    this.enemyCannonsText = this.add.text(0, 0, "",
      txt(10, { color: "#ffd0d0" })).setOrigin(0, 0.5).setDepth(63);

    // Controls info — single thin line bottom-center
    this.add.text(cam.width / 2, cam.height - 14,
      t("battle.controls"),
      txt(10, { color: "#888888" }),
    ).setOrigin(0.5, 1).setScrollFactor(0).setDepth(9000);

    // Ammo selector buttons (Phase B)
    this.buildAmmoButtons();

    // Keyboard
    if (this.input.keyboard) {
      const SAIL_VALUES = [0.0, 0.5, 1.0] as const;
      this.input.keyboard.on("keydown-W", () => {
        // Cycle UP: Furled → Battle → Full
        this.battleSailLevel = Math.min(2, this.battleSailLevel + 1) as 0 | 1 | 2;
        this.commandBuffer.push({ type: "SetSailLevel", value: SAIL_VALUES[this.battleSailLevel] });
      });
      this.input.keyboard.on("keydown-S", () => {
        // Cycle DOWN: Full → Battle → Furled
        this.battleSailLevel = Math.max(0, this.battleSailLevel - 1) as 0 | 1 | 2;
        this.commandBuffer.push({ type: "SetSailLevel", value: SAIL_VALUES[this.battleSailLevel] });
      });
      this.input.keyboard.on("keydown-A", () => {
        this.commandBuffer.push({ type: "Turn", dir: "left", amount: 0.04 });
      });
      this.input.keyboard.on("keydown-D", () => {
        this.commandBuffer.push({ type: "Turn", dir: "right", amount: 0.04 });
      });
      this.input.keyboard.on("keydown-Q", () => {
        this.commandBuffer.push({ type: "FireCannons", side: "left" });
      });
      this.input.keyboard.on("keydown-E", () => {
        this.commandBuffer.push({ type: "FireCannons", side: "right" });
      });
      this.input.keyboard.on("keydown-ONE", () => this.setAmmo("round"));
      this.input.keyboard.on("keydown-TWO", () => this.setAmmo("chain"));
      this.input.keyboard.on("keydown-THREE", () => this.setAmmo("grape"));
      this.input.keyboard.on("keydown-B", () => {
        // Phase C: actual boarding logic; here we just queue the command
        this.commandBuffer.push({ type: "AttemptBoarding" });
      });
      this.input.keyboard.on("keydown-H", () => {
        if (this.scene.isActive("BattleHelpScene")) return;
        this.scene.pause();
        this.scene.launch("BattleHelpScene");
      });
      this.input.keyboard.on("keydown-ESC", () => {
        this.commandBuffer.push({ type: "AttemptDisengage" });
      });
    }
  }

  private setAmmo(a: AmmoType): void {
    this.currentAmmo = a;
    this.commandBuffer.push({ type: "SetAmmo", ammo: a });
    this.refreshAmmoButtons();
  }

  private buildAmmoButtons(): void {
    const cam = this.cameras.main;
    const y = cam.height - 100;
    const startX = cam.width / 2 - 180;
    this.ammoButtonsText = [];
    AMMO_ORDER.forEach((a, i) => {
      const def = AMMO_DEFS[a];
      const label = `[${i + 1}] ${t(def.nameKey)}`;
      const txtObj = this.add.text(startX + i * 130, y, label,
        txt(13, { bold: a === this.currentAmmo, color: a === this.currentAmmo ? "#ffeeaa" : "#aaaaaa" }))
        .setScrollFactor(0).setDepth(9000);
      txtObj.setInteractive({ useHandCursor: true });
      txtObj.on("pointerdown", () => this.setAmmo(a));
      this.ammoButtonsText.push(txtObj);
    });
  }

  private refreshAmmoButtons(): void {
    this.ammoButtonsText.forEach((textObj, i) => {
      const a = AMMO_ORDER[i];
      const isActive = a === this.currentAmmo;
      textObj.setColor(isActive ? "#ffeeaa" : "#aaaaaa");
      textObj.setFontStyle(isActive ? "bold" : "");
    });
  }

  update(_time: number, delta: number): void {
    if (this.battleOver) return;

    this.tickAccumulator += delta;

    while (this.tickAccumulator >= TICK_MS) {
      this.tickAccumulator -= TICK_MS;

      const commands = [...this.commandBuffer];
      this.commandBuffer = [];

      const result = this.combatEngine.apply(this.combatState, commands, 1);
      this.combatState = result.state;

      // Handle events
      for (const event of result.events) {
        this.handleCombatEvent(event);
      }
    }

    // Update sprites
    const playerEntity = this.combatState.entities[this.combatState.playerShipId as string];
    const enemyEntity = this.combatState.entities[this.combatState.enemyShipId as string];
    const ax = this.arenaOriginX;
    const ay = this.arenaOriginY;

    if (playerEntity) {
      const sx = ax + playerEntity.pos.x;
      const sy = ay + playerEntity.pos.y;
      if (playerEntity.ship && playerEntity.ship.hullHp <= 0) {
        this.playSinking(this.playerSprite, "player");
      } else {
        this.playerSprite.setPosition(sx, sy);
        this.playerSprite.setFrame(DIR8_TO_FRAME[headingToDir8(playerEntity.heading)]);
      }
      this.playerLabel.setPosition(sx, sy - 26);
      this.drawBars(this.playerHullBar, this.playerSailBar, sx, sy + 22, playerEntity.ship);
      this.maybeDamageSmoke(sx, sy, playerEntity.ship);
      this.drawReload(this.reloadBars[this.combatState.playerShipId as string], sx, sy + 38, playerEntity.ship);
      // Crew + cannons + morale label centered under bars — explicit so meaning is obvious
      const pShip = playerEntity.ship;
      if (pShip) {
        const moralePct = Math.round(pShip.crew.morale * 100);
        const moraleColor = pShip.crew.morale > 0.5 ? "#88dd88" : pShip.crew.morale > 0.2 ? "#ddbb55" : "#dd5555";
        this.playerCrewText.setText(
          `${t("battle.dmg_crew")}: ${pShip.crew.current}/${pShip.crew.max}   ${t("battle.hud_cannons")}: ${pShip.cannons}   ${t("battle.hud_morale")}: ${moralePct}%`,
        );
        this.playerCrewText.setColor(moraleColor);
        this.playerCrewText.setPosition(sx, sy + 50);
      }
      // Range arcs (port + starboard) around player, oriented to ship heading
      this.drawRangeCircle(sx, sy, playerEntity.heading);
      // Status HUD top-right
      this.updateStatusHud(playerEntity);
    }
    if (enemyEntity) {
      const sx = ax + enemyEntity.pos.x;
      const sy = ay + enemyEntity.pos.y;
      if (enemyEntity.ship && enemyEntity.ship.hullHp <= 0) {
        this.playSinking(this.enemySprite, "enemy");
      } else {
        this.enemySprite.setPosition(sx, sy);
        this.enemySprite.setFrame(DIR8_TO_FRAME[headingToDir8(enemyEntity.heading)]);
      }
      this.enemyLabel.setPosition(sx, sy - 26);
      this.drawBars(this.enemyHullBar, this.enemySailBar, sx, sy + 22, enemyEntity.ship);
      this.maybeDamageSmoke(sx, sy, enemyEntity.ship);
      this.drawReload(this.reloadBars[this.combatState.enemyShipId as string], sx, sy + 38, enemyEntity.ship);
      const eShip = enemyEntity.ship;
      if (eShip) {
        const eMoralePct = Math.round(eShip.crew.morale * 100);
        this.enemyCrewText.setText(
          `${t("battle.dmg_crew")}: ${eShip.crew.current}/${eShip.crew.max}   ${t("battle.hud_cannons")}: ${eShip.cannons}   ${t("battle.hud_morale")}: ${eMoralePct}%`,
        );
        this.enemyCrewText.setPosition(sx, sy + 50);
      }
      // enemyCannonsText is unused now — keep hidden
      this.enemyCannonsText.setVisible(false);
    }

    // Update ally sprites
    for (const [id, sprite] of Object.entries(this.allySprites)) {
      const ent = this.combatState.entities[id];
      if (!ent) { sprite.setVisible(false); continue; }
      const sx = ax + ent.pos.x;
      const sy = ay + ent.pos.y;
      if (ent.ship && ent.ship.hullHp <= 0) {
        this.playSinking(sprite, id);
      } else {
        sprite.setPosition(sx, sy);
        sprite.setFrame(DIR8_TO_FRAME[headingToDir8(ent.heading)]);
      }
      const bars = this.allyBars[id];
      if (bars) this.drawBars(bars.hull, bars.sail, sx, sy + 18, ent.ship);
      const rb = this.reloadBars[id];
      if (rb) this.drawReload(rb, sx, sy + 30, ent.ship);
      const cT = this.allyCrewTexts[id];
      const aShip = ent.ship;
      if (cT && aShip) {
        cT.setText(`${t("battle.dmg_crew")}: ${aShip.crew.current}/${aShip.crew.max}   ${t("battle.hud_cannons")}: ${aShip.cannons}`);
        cT.setPosition(sx, sy + 42);
      }
    }

    // Far-distance timeout logic (#4)
    if (playerEntity && enemyEntity) {
      const dx = enemyEntity.pos.x - playerEntity.pos.x;
      const dy = enemyEntity.pos.y - playerEntity.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // "Very far" = beyond 90% of cannon range
      const farThreshold = this.combatState.cannonRange * 0.9;
      if (dist > farThreshold) {
        this.farDistanceMs += delta;
      } else {
        // Reset both timers if combat re-engages (under the threshold)
        this.farDistanceMs = 0;
        this.countdownMs = 0;
        this.timeoutText.setVisible(false);
      }

      const PHASE1_MS = 60000; // 60s far → start countdown
      const PHASE2_MS = 60000; // another 60s → auto-end
      if (this.farDistanceMs >= PHASE1_MS) {
        this.countdownMs += delta;
        const left = Math.max(0, Math.ceil((PHASE2_MS - this.countdownMs) / 1000));
        this.timeoutText.setText(t("battle.timeout_countdown", { sec: String(left) }));
        this.timeoutText.setVisible(true);
        if (this.countdownMs >= PHASE2_MS) {
          // Auto-disengage — both ships return to map
          this.battleOver = true;
          this.showBattleResult("disengaged");
        }
      }
    }

  }

  private drawBars(
    hullG: Phaser.GameObjects.Graphics,
    sailG: Phaser.GameObjects.Graphics,
    cx: number, topY: number,
    ship: { hullHp: number; hullMax: number; sailsHp: number; sailsMax: number } | undefined,
  ): void {
    hullG.clear();
    sailG.clear();
    if (!ship) return;
    const W = 60;
    const H = 6;
    // Hull (red)
    const hullPct = ship.hullMax > 0 ? Math.max(0, ship.hullHp / ship.hullMax) : 0;
    hullG.fillStyle(0x222222, 0.7).fillRect(cx - W / 2, topY, W, H);
    hullG.fillStyle(hullPct > 0.5 ? 0x44cc44 : hullPct > 0.25 ? 0xddcc44 : 0xcc3333, 1)
      .fillRect(cx - W / 2, topY, W * hullPct, H);
    hullG.lineStyle(1, 0x000000, 0.8).strokeRect(cx - W / 2, topY, W, H);
    // Sails (cyan)
    const sailPct = ship.sailsMax > 0 ? Math.max(0, ship.sailsHp / ship.sailsMax) : 0;
    sailG.fillStyle(0x222222, 0.7).fillRect(cx - W / 2, topY + H + 2, W, H);
    sailG.fillStyle(0x88ccff, 1).fillRect(cx - W / 2, topY + H + 2, W * sailPct, H);
    sailG.lineStyle(1, 0x000000, 0.8).strokeRect(cx - W / 2, topY + H + 2, W, H);
  }

  /** Refresh the top-right status HUD: ammo / sails / speed / cannons. */
  private updateStatusHud(playerEntity: CombatEntityState): void {
    if (!playerEntity.ship) return;
    const ammoLabel = t(AMMO_DEFS[playerEntity.ship.ammoType ?? "round"].nameKey);
    const sailLabels = ["battle.sail_furled", "battle.sail_battle", "battle.sail_full"];
    const sailLabel = t(sailLabels[this.battleSailLevel]);
    const cls = SHIP_CLASSES[playerEntity.ship.classId as string];
    let knots = 0;
    if (cls) {
      // Same formula as the world map: speedBase * sailLevel * windMod * sailsMod * 32 = display kn
      // (peak wind = 1.5 → max kn = speedBase * 48; e.g. brigantine 0.229 → 11 kn)
      const damageMod = damageSpeedMultiplier(
        playerEntity.ship.hullHp, playerEntity.ship.hullMax,
        playerEntity.ship.sailsHp, playerEntity.ship.sailsMax,
      );
      const windMod = this.estimateWindMod(playerEntity.heading);
      knots = cls.speedBase * playerEntity.sailLevel * windMod * damageMod * 32;
    }
    const cannons = playerEntity.ship.cannons ?? 0;
    const training = Math.round((this.worldState.captain?.training ?? 0.3) * 100);
    this.statusText.setText(
      `${t("battle.hud_ammo")}: ${ammoLabel}\n` +
      `${t("battle.hud_sails")}: ${sailLabel}\n` +
      `${t("battle.hud_speed")}: ${knots.toFixed(1)} kn\n` +
      `${t("battle.hud_cannons")}: ${cannons}\n` +
      `${t("battle.hud_training")}: ${training}%\n` +
      `${t("battle.hud_condition")}: ${this.conditionLabel(playerEntity.ship)}`,
    );
  }

  /**
   * Wind modifier for the speed readout. Calls the same `windSpeedModifier` the
   * engine steers by — this used to be a hand-copied duplicate of the curve,
   * which silently kept the pre-v0.9.8.2 discontinuity after the engine was
   * fixed, so the HUD and the ship disagreed.
   */
  private estimateWindMod(heading: number): number {
    const minWindAngle = SHIP_CLASSES[
      this.combatState.entities[this.worldState.player.shipId as string]?.ship?.classId as string
    ]?.minWindAngle ?? 30;
    return windSpeedModifier(heading, this.combatState.wind.dirRad, this.combatState.wind.strength, minWindAngle);
  }

  /** Faint dashed arcs showing port + starboard firing zones (no fore/aft dead-zone). */
  private drawRangeCircle(cx: number, cy: number, heading: number): void {
    this.rangeCircle.clear();
    const r = this.combatState.cannonRange;
    this.rangeCircle.lineStyle(1.2, 0xffeeaa, 0.28);
    // Starboard arc: centered at Phaser-angle `heading`. Port: centered at `heading + π`.
    // ±60° from broadside = 120° per side; matches the broadside firing arc.
    const HALF_ARC = Math.PI / 3;
    const drawArc = (centerA: number) => {
      const startA = centerA - HALF_ARC;
      const endA = centerA + HALF_ARC;
      const segments = 24;
      // Dashed: skip every other segment
      for (let i = 0; i < segments; i += 2) {
        const a1 = startA + (i / segments) * (endA - startA);
        const a2 = startA + ((i + 1) / segments) * (endA - startA);
        this.rangeCircle.lineBetween(
          cx + r * Math.cos(a1), cy + r * Math.sin(a1),
          cx + r * Math.cos(a2), cy + r * Math.sin(a2),
        );
      }
    };
    drawArc(heading);              // starboard (right side of ship)
    drawArc(heading + Math.PI);    // port (left side of ship)
  }

  /** Two short bars for left/right cannon reload progress, color-coded port/starboard.
   *  Port (left, Q) = red while loading → bright yellow when ready.
   *  Starboard (right, E) = green while loading → bright yellow when ready. */
  private drawReload(
    g: Phaser.GameObjects.Graphics | undefined,
    cx: number, topY: number,
    ship: { cooldown: { left: number; right: number } } | undefined,
  ): void {
    if (!g) return;
    g.clear();
    if (!ship) return;
    const W = 30;
    const H = 5;
    const GAP = 6;
    const maxCd = 180;
    const lProg = 1 - Math.max(0, Math.min(1, ship.cooldown.left / maxCd));
    const rProg = 1 - Math.max(0, Math.min(1, ship.cooldown.right / maxCd));

    // PORT (left / Q) — red while loading, yellow when ready
    const lx = cx - W - GAP / 2;
    g.fillStyle(0x222222, 0.75).fillRect(lx, topY, W, H);
    g.fillStyle(lProg >= 1 ? 0xffee44 : 0xcc4444, 1).fillRect(lx, topY, W * lProg, H);
    g.lineStyle(1, 0xff7777, 0.9).strokeRect(lx, topY, W, H);

    // STARBOARD (right / E) — green while loading, yellow when ready
    const rx = cx + GAP / 2;
    g.fillStyle(0x222222, 0.75).fillRect(rx, topY, W, H);
    g.fillStyle(rProg >= 1 ? 0xffee44 : 0x44aa44, 1).fillRect(rx, topY, W * rProg, H);
    g.lineStyle(1, 0x77dd77, 0.9).strokeRect(rx, topY, W, H);
  }

  /**
   * Damage stage for the HUD: hull condition, plus the rig once the canvas is
   * torn enough to matter. A dismasted ship says so loudly — that is the
   * difference between "slow" and "cannot leave".
   */
  private conditionLabel(ship: { hullHp: number; hullMax: number; sailsHp: number; sailsMax: number }): string {
    const hull = t(hullTier(ship.hullHp, ship.hullMax).nameKey);
    if (rigCondition(ship.sailsHp, ship.sailsMax) === "full") return hull;
    return `${hull} / ${t(rigTier(ship.sailsHp, ship.sailsMax).nameKey)}`;
  }

  /**
   * Staged damage FX (v0.9.9). A crippled hull smokes; a foundering one burns
   * and smokes twice as hard. Nothing is drawn above the "crippled" stage — the
   * bars already say that much, and constant smoke would read as critical.
   */
  private maybeDamageSmoke(
    sx: number, sy: number,
    ship: { hullHp: number; hullMax: number } | undefined,
  ): void {
    if (!ship) return;
    const stage = hullCondition(ship.hullHp, ship.hullMax);
    if (stage !== "crippled" && stage !== "foundering") return;
    const foundering = stage === "foundering";

    // Rate-limit via random sampling: ~6 puffs/s crippled, ~12/s foundering.
    if (Math.random() > (foundering ? 0.2 : 0.1)) return;

    const puff = this.add.circle(
      sx + (Math.random() - 0.5) * 14, sy - 14,
      (foundering ? 7 : 6) + Math.random() * 4,
      foundering ? 0x2a2a2a : 0x444444,
      foundering ? 0.7 : 0.6,
    );
    puff.setDepth(70);
    this.tweens.add({
      targets: puff,
      y: sy - (foundering ? 62 : 50),
      alpha: 0,
      scale: foundering ? 2.6 : 2.0,
      duration: foundering ? 1500 : 1200,
      onComplete: () => puff.destroy(),
    });

    // Fire only once the ship is going down, and only on some puffs.
    if (!foundering || Math.random() > 0.5) return;
    const flame = this.add.circle(
      sx + (Math.random() - 0.5) * 10, sy - 6,
      3 + Math.random() * 3,
      Math.random() > 0.5 ? 0xff8822 : 0xffcc33, 0.9,
    );
    flame.setDepth(71);
    this.tweens.add({
      targets: flame,
      y: sy - 20,
      alpha: 0,
      scale: 0.4,
      duration: 400,
      onComplete: () => flame.destroy(),
    });
  }

  /**
   * Sinking animation: the hull settles, slews as it goes, and leaves a ring of
   * disturbed water. Played once per ship — `sinkingSprites` keeps the tick loop
   * from restarting it every frame while the result banner is up.
   */
  private playSinking(sprite: Phaser.GameObjects.Sprite, key: string): void {
    if (this.sinkingSprites.has(key)) return;
    this.sinkingSprites.add(key);

    const ring = this.add.circle(sprite.x, sprite.y, 10, 0xffffff, 0);
    ring.setStrokeStyle(2, 0xcce6ff, 0.8).setDepth(60);
    this.tweens.add({
      targets: ring,
      radius: 46,
      alpha: 0,
      duration: SINK_DURATION_MS,
      onComplete: () => ring.destroy(),
    });

    this.tweens.add({
      targets: sprite,
      scale: sprite.scale * 0.45,
      alpha: 0,
      angle: sprite.angle + (Math.random() > 0.5 ? 28 : -28),
      duration: SINK_DURATION_MS,
      ease: "Quad.easeIn",
    });
  }

  /** Animated cannonball traveling from shooter to target with slight parabolic arc.
   * Triggers hit-or-splash FX on arrival. Cannonballs cannot travel further than the
   * effective cannon range — beyond it they fall in the sea with a splash. */
  private spawnCannonball(from: { x: number; y: number }, to: { x: number; y: number }, hit: boolean): void {
    const range = this.combatState.cannonRange;
    // Initial aim: hit goes exactly to target, miss offsets to a nearby splash
    let tx = hit ? to.x : to.x + (Math.random() - 0.5) * 70;
    let ty = hit ? to.y : to.y + (Math.random() - 0.5) * 70;
    // Clamp landing point to cannon range — anything past the boundary falls in the sea
    let dx = tx - from.x;
    let dy = ty - from.y;
    let d = Math.sqrt(dx * dx + dy * dy);
    if (d > range) {
      tx = from.x + (dx / d) * range;
      ty = from.y + (dy / d) * range;
      hit = false; // overshot — water splash, no damage VFX
      dx = tx - from.x;
      dy = ty - from.y;
      d = range;
    }
    const len = d;
    // Travel time: ~1.5 ms per arena px, clamped to feel snappy at any range
    const duration = Math.max(200, Math.min(900, len * 1.5));

    const ball = this.add.circle(from.x, from.y, 3, 0x111111, 1);
    ball.setStrokeStyle(1, 0x664400);
    ball.setDepth(85);

    // Parabolic arc — peak height ~6% of travel distance
    const peakH = Math.max(8, len * 0.06);
    const dummy = { t: 0 };
    this.tweens.add({
      targets: dummy,
      t: 1,
      duration,
      onUpdate: () => {
        const t = dummy.t;
        ball.x = from.x + dx * t;
        ball.y = from.y + dy * t - peakH * Math.sin(Math.PI * t);
      },
      onComplete: () => {
        ball.destroy();
        if (hit) {
          this.fxManager.spawnHit({ x: tx, y: ty });
          this.cameras.main.shake(80, 0.003);
        } else {
          // Water splash at miss point + "MISS" floater
          this.spawnWaterSplash({ x: tx, y: ty });
        }
      },
    });
  }

  /** Floating damage text above a ship: 2 s lifetime, floats upward, fades out.
   *  yOffset stacks multiple floaters from the same hit. */
  private spawnDamageFloater(
    pos: { x: number; y: number },
    text: string,
    color = "#ff8888",
    yOffset = 0,
  ): void {
    const startY = pos.y - 22 + yOffset;
    const txtObj = this.add.text(pos.x, startY, text,
      { ...txt(13, { bold: true, color }), stroke: "#000000", strokeThickness: 2 })
      .setOrigin(0.5, 1).setDepth(95);
    this.tweens.add({
      targets: txtObj,
      y: startY - 40,
      alpha: 0,
      duration: 2000,
      onComplete: () => txtObj.destroy(),
    });
  }

  /** Water splash effect for a missed shot. */
  private spawnWaterSplash(pos: { x: number; y: number }): void {
    for (let i = 0; i < 4; i++) {
      const c = this.add.circle(pos.x, pos.y, 4, 0xaaccee, 0.8);
      c.setDepth(82);
      const ang = (i / 4) * Math.PI * 2;
      this.tweens.add({
        targets: c,
        x: pos.x + Math.cos(ang) * 16,
        y: pos.y + Math.sin(ang) * 16,
        alpha: 0,
        scale: 0.3,
        duration: 350,
        onComplete: () => c.destroy(),
      });
    }
  }

  /** Big white-gray smoke cloud at firing position, slowly drifts up. */
  private spawnBigSmoke(pos: { x: number; y: number }): void {
    for (let i = 0; i < 3; i++) {
      const c = this.add.circle(
        pos.x + (Math.random() - 0.5) * 18,
        pos.y + (Math.random() - 0.5) * 12,
        18 + Math.random() * 8,
        0xdddddd,
        0.85,
      );
      c.setDepth(80);
      this.tweens.add({
        targets: c,
        y: c.y - 50,
        alpha: 0,
        scale: 2.5,
        duration: 1200,
        delay: i * 60,
        onComplete: () => c.destroy(),
      });
    }
  }

  /** Brief bright muzzle flash at firing position. */
  private flashFireMuzzle(pos: { x: number; y: number }): void {
    const flash = this.add.circle(pos.x, pos.y, 24, 0xffee66, 1);
    flash.setDepth(85);
    this.tweens.add({
      targets: flash,
      scale: 2.2,
      alpha: 0,
      duration: 200,
      onComplete: () => flash.destroy(),
    });
  }

  private drawWindIndicator(): void {
    this.windArrow.clear();
    const cx = 60;
    const cy = 60;
    const r = 32;
    // dial
    this.windArrow.fillStyle(0x000000, 0.4).fillCircle(cx, cy, r + 4);
    this.windArrow.lineStyle(1, 0x88aacc, 0.8).strokeCircle(cx, cy, r);
    // wind arrow — points TO direction it's blowing
    const wd = this.combatState.wind.dirRad;
    const ax = cx + Math.sin(wd) * (r - 4);
    const ay = cy - Math.cos(wd) * (r - 4);
    this.windArrow.lineStyle(2, 0xffeeaa, 1).lineBetween(cx, cy, ax, ay);
    this.windArrow.fillStyle(0xffeeaa, 1).fillCircle(ax, ay, 3);
    // strength label
    const label = `Wind ${Math.round(this.combatState.wind.strength * 100)}%`;
    this.add.text(cx, cy + r + 8, label, txt(10, { color: "#cceeff" }))
      .setOrigin(0.5, 0).setDepth(9000).setScrollFactor(0);
  }

  private handleCombatEvent(event: CombatEvent): void {
    switch (event.type) {
      case "FxHit": {
        // Translate combat-coords to screen-coords for FX
        const screenPos = { x: this.arenaOriginX + event.pos.x, y: this.arenaOriginY + event.pos.y };
        this.fxManager.spawnHit(screenPos);
        this.cameras.main.shake(80, 0.003);
        break;
      }
      case "CannonFired": {
        const fromPos = event.fromPos ?? this.combatState.entities[event.shipId as string]?.pos;
        const targetPos = event.targetPos ?? (
          event.shipId === this.combatState.enemyShipId
            ? this.combatState.entities[this.combatState.playerShipId as string]?.pos
            : this.combatState.entities[this.combatState.enemyShipId as string]?.pos
        );
        if (fromPos) {
          this.spawnBigSmoke(fromPos);
          this.flashFireMuzzle(fromPos);
          if (targetPos) {
            this.spawnCannonball(fromPos, targetPos, event.hit ?? false);
          }
        }
        break;
      }
      case "ShipDamaged": {
        // Separate floaters per damage type, stacked vertically, distinct colors:
        //   hull (red)  /  sails (cyan)  /  crew (orange).  Each lives 2 s.
        // Sub-1 damage is rendered as a fraction (e.g. "-0.7 hull") so the player
        // still sees something happened — important for chain-shot from far away.
        const fmt = (v: number) => Math.abs(v) >= 1 ? String(Math.round(v)) : v.toFixed(1);
        const ent = this.combatState.entities[event.shipId as string];
        if (ent) {
          let yOffset = 0;
          if (event.hullDelta && Math.abs(event.hullDelta) >= 0.1) {
            this.spawnDamageFloater(ent.pos, `${fmt(event.hullDelta)} ${t("battle.dmg_hull")}`, "#ff6666", yOffset);
            yOffset -= 16;
          }
          if (event.sailsDelta && Math.abs(event.sailsDelta) >= 0.1) {
            this.spawnDamageFloater(ent.pos, `${fmt(event.sailsDelta)} ${t("battle.dmg_sails")}`, "#88ddff", yOffset);
            yOffset -= 16;
          }
          if (event.crewDelta && event.crewDelta !== 0) {
            this.spawnDamageFloater(ent.pos, `${event.crewDelta} ${t("battle.dmg_crew")}`, "#ffbb44", yOffset);
          }
        }
        break;
      }
      case "Surrender":
        // Brief on-screen banner before BattleEnded triggers
        this.add.text(this.cameras.main.width / 2, 60, t("battle.surrender"),
          txt(18, { bold: true, color: "#ffee88" }))
          .setOrigin(0.5, 0).setDepth(10000);
        break;
      case "BoardingRejected": {
        const msg = event.reason === "too_far" ? t("battle.cannot_board") : t("battle.enemy_too_strong");
        this.add.text(this.cameras.main.width / 2, 100, msg,
          txt(13, { bold: true, color: "#ff8888" }))
          .setOrigin(0.5, 0).setDepth(10000)
          .setAlpha(1);
        // fade out after 2s
        this.time.delayedCall(2000, () => {});
        break;
      }
      case "BoardingResolved":
        this.add.text(this.cameras.main.width / 2, 100,
          event.captured ? t("battle.boarding_won") : t("battle.boarding_lost"),
          txt(16, { bold: true, color: event.captured ? "#ffee88" : "#ff8888" }))
          .setOrigin(0.5, 0).setDepth(10000);
        break;
      case "BattleEnded": {
        this.battleOver = true;
        // Let a hull finish going under before the banner covers the screen.
        const sinking = event.outcome === "win" || event.outcome === "lose";
        if (sinking) {
          this.time.delayedCall(SINK_DURATION_MS, () => this.showBattleResult(event.outcome));
        } else {
          this.showBattleResult(event.outcome);
        }
        break;
      }
    }
  }

  private showBattleResult(outcome: "win" | "lose" | "disengaged" | "surrender" | "captured"): void {
    const messages: Record<string, string> = {
      win: t("battle.victory"),
      lose: t("battle.defeat"),
      disengaged: t("battle.disengaged"),
      surrender: t("battle.surrender"),
      captured: t("battle.captured"),
    };

    const text = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      messages[outcome] ?? "Battle Over",
      { ...txt(24, { color: "#ffdd44" }), backgroundColor: "#000000cc", padding: { x: 20, y: 12 } },
    );
    text.setOrigin(0.5);
    text.setDepth(10000);

    // Loot summary on win / surrender
    if (outcome === "win") {
      const loot = 50 + Math.floor(Math.random() * 100); // 50-150 gold sunk
      this.add.text(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2 + 30,
        `+ ${loot} ${t("hud.gold")}`,
        { ...txt(16, { color: "#ffee88" }) },
      ).setOrigin(0.5).setDepth(10000);
      this.pendingLoot = loot;
    } else if (outcome === "surrender") {
      const loot = 80 + Math.floor(Math.random() * 120);
      this.add.text(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2 + 30,
        `+ ${loot} ${t("hud.gold")}`,
        { ...txt(16, { color: "#ffee88" }) },
      ).setOrigin(0.5).setDepth(10000);
      this.pendingLoot = loot;
    } else if (outcome === "captured") {
      const loot = 150 + Math.floor(Math.random() * 150); // capture = best payout
      this.add.text(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2 + 30,
        `+ ${loot} ${t("hud.gold")} + ${t("battle.capture_note")}`,
        { ...txt(14, { color: "#ffee88" }) },
      ).setOrigin(0.5).setDepth(10000);
      this.pendingLoot = loot;
    }

    const continueText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2 + 60,
      t("battle.continue"),
      txt(14, { color: "#aaaaaa" }),
    );
    continueText.setOrigin(0.5);
    continueText.setDepth(10000);

    const finish = () => {
      const updatedWorld = this.applyBattleOutcomeToWorld(outcome);
      this.registry.set("worldState", updatedWorld);
      this.scene.start("MainMapScene", { worldState: updatedWorld });
    };

    this.input.once("pointerdown", finish);
    if (this.input.keyboard) {
      this.input.keyboard.once("keydown-ENTER", finish);
      this.input.keyboard.once("keydown-SPACE", finish);
      this.input.keyboard.once("keydown-ESC", finish);
    }
  }

  private pendingLoot = 0;

  /**
   * Take the final combat state and push relevant changes back to the world:
   * - Player ship hull/sails/crew take damage proportional to combat losses
   * - Enemy entity removed if sunk (win)
   * - Player gold increased by loot (win)
   * - Adds an event log entry for the outcome
   */
  private applyBattleOutcomeToWorld(
    outcome: "win" | "lose" | "disengaged" | "surrender" | "captured",
  ): WorldState {
    let w = this.worldState;
    const playerId = w.player.shipId as string;
    const enemyId = this.combatState.enemyShipId as string;
    const playerCombat = this.combatState.entities[playerId];
    const playerEntity = w.entities[playerId];

    // Sync player ship damage back
    if (playerEntity?.ship && playerCombat?.ship) {
      const cs = playerCombat.ship;
      w = {
        ...w,
        entities: {
          ...w.entities,
          [playerId]: {
            ...playerEntity,
            ship: {
              ...playerEntity.ship,
              hullHp: Math.max(0, cs.hullHp),
              sailsHp: Math.max(0, cs.sailsHp),
              crew: { ...playerEntity.ship.crew, current: cs.crew.current, morale: cs.crew.morale },
            },
          },
        },
      };
    }

    // Phase D: sync ally damage back to player.fleet[]; drop sunk fleet ships
    const fleet = w.player.fleet ?? [];
    if (fleet.length > 0) {
      const updatedFleet = fleet
        .map((fs, i) => {
          const ally = this.combatState.entities["ally_" + i];
          if (!ally?.ship) return fs;
          return {
            ...fs,
            hullHp: Math.max(0, ally.ship.hullHp),
            sailsHp: Math.max(0, ally.ship.sailsHp),
          };
        })
        .filter(fs => fs.hullHp > 0);
      w = { ...w, player: { ...w.player, fleet: updatedFleet } };
    }

    // Reputation impact (Phase C) — attacking trader/navy hurts that faction, gives pirate cred.
    // Win, surrender, captured ALL count as a hostile act; lose/disengaged do too if you fired.
    const enemyWorldEntity = this.worldState.entities[enemyId];
    const enemyFaction = enemyWorldEntity?.ship?.factionId as string | undefined;
    const enemyBehavior = enemyWorldEntity?.ai?.behavior;
    if (enemyFaction && enemyBehavior && enemyBehavior !== "pirate") {
      const repPenalty = enemyBehavior === "navy" ? -20 : -10;
      const piratesBoost = enemyBehavior === "navy" ? 12 : 6;
      w = {
        ...w,
        player: {
          ...w.player,
          reputation: changeReputation(changeReputation(
            w.player.reputation, enemyFaction, repPenalty), "pirates", piratesBoost),
        },
      };
    }

    if (outcome === "win" || outcome === "surrender") {
      // Remove enemy entity and grant loot
      const { [enemyId]: _, ...remaining } = w.entities;
      w = {
        ...w,
        entities: remaining,
        player: { ...w.player, gold: w.player.gold + this.pendingLoot },
      };
      w = addLogEntry(w, "battle.log_won", { gold: this.pendingLoot });
    } else if (outcome === "captured") {
      // Loot + add ship to fleet if slot available
      const { [enemyId]: _captured, ...remaining } = w.entities;
      let player = { ...w.player, gold: w.player.gold + this.pendingLoot };
      if (enemyWorldEntity?.ship && canAddToFleet(player)) {
        const newFleet = addToFleet(player.fleet ?? [], enemyWorldEntity.ship.classId as string);
        if (newFleet) {
          player = { ...player, fleet: newFleet };
          w = addLogEntry({ ...w, entities: remaining, player }, "battle.log_captured", { gold: this.pendingLoot });
        } else {
          w = addLogEntry({ ...w, entities: remaining, player }, "battle.log_won", { gold: this.pendingLoot });
        }
      } else {
        w = addLogEntry({ ...w, entities: remaining, player }, "battle.log_won", { gold: this.pendingLoot });
      }
    } else if (outcome === "lose") {
      // The hold goes down with the ship (v0.9.9). A crew that still has hands
      // to work the boats saves a little more than one that has been shot to
      // pieces — see `cargoSurvivingSinking`.
      const sunkShip = w.entities[playerId]?.ship;
      if (sunkShip) {
        const crewFrac = sunkShip.crew.max > 0 ? sunkShip.crew.current / sunkShip.crew.max : 0;
        const kept = cargoSurvivingSinking(crewFrac);
        const salvaged: Record<string, number> = {};
        for (const [item, qty] of Object.entries(sunkShip.cargo ?? {})) {
          const left = Math.floor(qty * kept);
          if (left > 0) salvaged[item] = left;
        }
        w = {
          ...w,
          entities: {
            ...w.entities,
            [playerId]: { ...w.entities[playerId], ship: { ...sunkShip, cargo: salvaged } },
          },
        };
      }
      w = addLogEntry(w, "battle.log_lost", {});
    } else {
      w = addLogEntry(w, "battle.log_fled", {});
    }

    // Captain's crew gains training on victorious outcomes.
    if ((outcome === "win" || outcome === "surrender" || outcome === "captured") && w.captain) {
      const prev = w.captain.training ?? 0.3;
      w = { ...w, captain: { ...w.captain, training: Math.min(1, prev + 0.02) } };
    }

    return w;
  }
}
