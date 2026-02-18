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

const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;

export class SeaBattleScene extends Phaser.Scene {
  private worldState!: WorldState;
  private combatState!: CombatState;
  private combatEngine!: CombatEngine;
  private fxManager!: FxManager;
  private tickAccumulator = 0;
  private commandBuffer: CombatCommand[] = [];

  private playerSprite!: Phaser.GameObjects.Sprite;
  private enemySprite!: Phaser.GameObjects.Sprite;
  private hudText!: Phaser.GameObjects.Text;
  private battleOver = false;

  constructor() {
    super({ key: "SeaBattleScene" });
  }

  init(data: { worldState: WorldState; enemyId: EntityId }): void {
    this.worldState = data.worldState;

    // Build combat state from world entities
    const playerId = this.worldState.player.shipId;
    const playerEntity = this.worldState.entities[playerId as string];
    const enemyEntity = this.worldState.entities[data.enemyId as string];

    this.combatState = {
      version: 1,
      time: { tick: 0 },
      arena: { width: 800, height: 600 },
      wind: {
        dirRad: this.worldState.weather.windDirRad,
        strength: this.worldState.weather.windStrength,
      },
      playerShipId: playerId,
      enemyShipId: data.enemyId,
      entities: {
        [playerId as string]: {
          id: playerId,
          kind: "ship",
          pos: { x: 200, y: 300 },
          vel: { x: 0, y: 0 },
          heading: playerEntity?.heading ?? 0,
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
          } : undefined,
        },
        [data.enemyId as string]: {
          id: data.enemyId,
          kind: "ship",
          pos: { x: 600, y: 300 },
          vel: { x: 0, y: 0 },
          heading: enemyEntity?.heading ?? Math.PI,
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
      },
      events: [],
    };
  }

  create(): void {
    this.combatEngine = new CombatEngine();
    this.fxManager = new FxManager(this);
    this.battleOver = false;

    // Background
    this.cameras.main.setBackgroundColor("#0a2244");

    // Sea background
    const bg = this.add.graphics();
    bg.fillStyle(0x0a3366, 1);
    bg.fillRect(0, 0, this.combatState.arena.width, this.combatState.arena.height);

    // Ships (both use sailship spritesheet, half scale)
    this.playerSprite = this.add.sprite(200, 300, "sailship", 0).setScale(0.5);
    this.enemySprite = this.add.sprite(600, 300, "sailship", 0).setScale(0.5);

    // HUD
    this.hudText = this.add.text(10, 10, "", {
      ...txt(14, { color: "#ffffff" }),
      backgroundColor: "#00000088",
      padding: { x: 8, y: 4 },
    });
    this.hudText.setScrollFactor(0);
    this.hudText.setDepth(9000);

    // Controls info
    this.add.text(10, this.cameras.main.height - 30,
      t("battle.controls"),
      txt(12, { color: "#888888" }),
    ).setScrollFactor(0).setDepth(9000);

    // Keyboard
    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-W", () => {
        this.commandBuffer.push({ type: "SetSailLevel", value: 1 });
      });
      this.input.keyboard.on("keydown-S", () => {
        this.commandBuffer.push({ type: "SetSailLevel", value: 0 });
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
      this.input.keyboard.on("keydown-ESC", () => {
        this.commandBuffer.push({ type: "AttemptDisengage" });
      });
    }
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

    if (playerEntity) {
      this.playerSprite.setPosition(playerEntity.pos.x, playerEntity.pos.y);
      this.playerSprite.setFrame(DIR8_TO_FRAME[headingToDir8(playerEntity.heading)]);
    }
    if (enemyEntity) {
      this.enemySprite.setPosition(enemyEntity.pos.x, enemyEntity.pos.y);
      this.enemySprite.setFrame(DIR8_TO_FRAME[headingToDir8(enemyEntity.heading)]);
    }

    // HUD
    const pShip = playerEntity?.ship;
    const eShip = enemyEntity?.ship;
    this.hudText.setText(
      `${t("battle.your_ship")} — ${t("hud.hull", { current: Math.round(pShip?.hullHp ?? 0), max: pShip?.hullMax ?? 0 })}  ${t("hud.sails", { current: Math.round(pShip?.sailsHp ?? 0), max: pShip?.sailsMax ?? 0 })}  L:${Math.round(pShip?.cooldown.left ?? 0)} R:${Math.round(pShip?.cooldown.right ?? 0)}\n` +
      `${t("battle.enemy")}     — ${t("hud.hull", { current: Math.round(eShip?.hullHp ?? 0), max: eShip?.hullMax ?? 0 })}  ${t("hud.sails", { current: Math.round(eShip?.sailsHp ?? 0), max: eShip?.sailsMax ?? 0 })}`,
    );
  }

  private handleCombatEvent(event: CombatEvent): void {
    switch (event.type) {
      case "FxHit":
        this.fxManager.spawnHit(event.pos);
        this.cameras.main.shake(80, 0.003);
        break;
      case "CannonFired":
        this.fxManager.spawnSmoke(
          this.combatState.entities[event.shipId as string]?.pos ?? { x: 0, y: 0 },
        );
        break;
      case "BattleEnded":
        this.battleOver = true;
        this.showBattleResult(event.outcome);
        break;
    }
  }

  private showBattleResult(outcome: "win" | "lose" | "disengaged"): void {
    const messages: Record<string, string> = {
      win: t("battle.victory"),
      lose: t("battle.defeat"),
      disengaged: t("battle.disengaged"),
    };

    const text = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      messages[outcome] ?? "Battle Over",
      { ...txt(24, { color: "#ffdd44" }), backgroundColor: "#000000cc", padding: { x: 20, y: 12 } },
    );
    text.setOrigin(0.5);
    text.setDepth(10000);

    const continueText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2 + 50,
      t("battle.continue"),
      txt(14, { color: "#aaaaaa" }),
    );
    continueText.setOrigin(0.5);
    continueText.setDepth(10000);

    this.input.once("pointerdown", () => {
      // TODO: Apply battle results to world state (loot, damage, etc.)
      this.scene.start("MainMapScene", { worldState: this.worldState });
    });
  }
}
