import Phaser from "phaser";
import { ERAS, DEFAULT_ERA } from "../../core/data/eras.ts";
import { createNewWorldState } from "../GameApp.ts";
import { t } from "../../core/i18n/index.ts";
import { TEXT_RES } from "../ui/textStyle.ts";

const ERA_KEYS = Object.keys(ERAS);
const MAX_NAME_LENGTH = 20;

export class CharacterCreationScene extends Phaser.Scene {
  private playerName = "Captain";
  private selectedEraIndex = ERA_KEYS.indexOf(DEFAULT_ERA);
  private cursorVisible = true;


  // UI elements
  private nameText!: Phaser.GameObjects.Text;
  private eraTexts: Phaser.GameObjects.Text[] = [];
  private confirmText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "CharacterCreationScene" });
  }

  create(): void {
    const { width } = this.cameras.main;
    const cx = width / 2;

    // Background
    this.cameras.main.setBackgroundColor("#0a0a1a");

    // Play pirate theme music once (no loop)
    if (this.cache.audio.exists("pirate_theme")) {
      if (this.sound.locked) {
        this.sound.once("unlocked", () => {
          this.sound.play("pirate_theme", { loop: false, volume: 0.6 });
        });
      } else {
        this.sound.play("pirate_theme", { loop: false, volume: 0.6 });
      }
    }

    // Title
    this.add.text(cx, 40, t("creation.title"), {
      fontSize: "28px",
      fontFamily: "monospace",
      color: "#d4a44a",
      fontStyle: "bold",
      resolution: TEXT_RES,
    }).setOrigin(0.5);

    // Decorative line
    this.add.text(cx, 70, "━".repeat(30), {
      fontSize: "12px",
      fontFamily: "monospace",
      color: "#5a5a5a",
      resolution: TEXT_RES,
    }).setOrigin(0.5);

    // --- Name Input ---
    this.add.text(cx, 110, t("creation.name_label"), {
      fontSize: "14px",
      fontFamily: "monospace",
      color: "#88bbaa",
      resolution: TEXT_RES,
    }).setOrigin(0.5);

    this.nameText = this.add.text(cx, 140, "", {
      fontSize: "18px",
      fontFamily: "monospace",
      color: "#ffffff",
      backgroundColor: "#1a1a2e",
      padding: { x: 12, y: 6 },
      resolution: TEXT_RES,
    }).setOrigin(0.5);

    this.updateNameDisplay();

    // Blink cursor
    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        this.cursorVisible = !this.cursorVisible;
        this.updateNameDisplay();
      },
    });

    // --- Era Selection ---
    this.add.text(cx, 190, t("creation.era_label"), {
      fontSize: "14px",
      fontFamily: "monospace",
      color: "#88bbaa",
      resolution: TEXT_RES,
    }).setOrigin(0.5);

    const eraStartY = 220;
    const eraSpacing = 36;

    this.eraTexts = ERA_KEYS.map((key, i) => {
      const era = ERAS[key];
      const label = `${t("era." + key + ".name")}  (${era.startYear})`;
      const txt = this.add.text(cx, eraStartY + i * eraSpacing, label, {
        fontSize: "13px",
        fontFamily: "monospace",
        color: "#aaaaaa",
        resolution: TEXT_RES,
      }).setOrigin(0.5);

      // Clickable
      txt.setInteractive({ useHandCursor: true });
      txt.on("pointerdown", () => {
        this.selectedEraIndex = i;
        this.updateEraHighlight();
      });

      return txt;
    });

    // Era description
    this.add.text(cx, eraStartY + ERA_KEYS.length * eraSpacing + 8, t("creation.era_hint"), {
      fontSize: "10px",
      fontFamily: "monospace",
      color: "#555555",
      resolution: TEXT_RES,
    }).setOrigin(0.5);

    this.updateEraHighlight();

    // --- Confirm Button ---
    const confirmY = eraStartY + ERA_KEYS.length * eraSpacing + 45;
    this.confirmText = this.add.text(cx, confirmY, t("creation.confirm"), {
      fontSize: "16px",
      fontFamily: "monospace",
      color: "#d4a44a",
      fontStyle: "bold",
      resolution: TEXT_RES,
    }).setOrigin(0.5);

    this.confirmText.setInteractive({ useHandCursor: true });
    this.confirmText.on("pointerover", () => this.confirmText.setColor("#ffdd77"));
    this.confirmText.on("pointerout", () => this.confirmText.setColor("#d4a44a"));
    this.confirmText.on("pointerdown", () => this.startGame());

    // --- Keyboard Input ---
    this.input.keyboard!.on("keydown", (event: KeyboardEvent) => {
      this.handleKey(event);
    });
  }

  private handleKey(event: KeyboardEvent): void {
    const key = event.key;

    // Era navigation (arrows only — W/S go to name input)
    if (key === "ArrowUp") {
      this.selectedEraIndex = (this.selectedEraIndex - 1 + ERA_KEYS.length) % ERA_KEYS.length;
      this.updateEraHighlight();
      return;
    }
    if (key === "ArrowDown") {
      this.selectedEraIndex = (this.selectedEraIndex + 1) % ERA_KEYS.length;
      this.updateEraHighlight();
      return;
    }

    // Confirm
    if (key === "Enter") {
      this.startGame();
      return;
    }

    // Name editing
    if (key === "Backspace") {
      this.playerName = this.playerName.slice(0, -1);
      this.updateNameDisplay();
      return;
    }

    // Only allow printable characters
    if (key.length === 1 && this.playerName.length < MAX_NAME_LENGTH) {
      this.playerName += key;
      this.updateNameDisplay();
    }
  }

  private updateNameDisplay(): void {
    const cursor = this.cursorVisible ? "▌" : " ";
    this.nameText.setText(this.playerName + cursor);
  }

  private updateEraHighlight(): void {
    this.eraTexts.forEach((txt, i) => {
      if (i === this.selectedEraIndex) {
        txt.setColor("#ffffff");
        const era = ERAS[ERA_KEYS[i]];
        txt.setText(`▸ ${t("era." + ERA_KEYS[i] + ".name")}  (${era.startYear})`);
      } else {
        txt.setColor("#777777");
        const era = ERAS[ERA_KEYS[i]];
        txt.setText(`  ${t("era." + ERA_KEYS[i] + ".name")}  (${era.startYear})`);
      }
    });
  }

  private startGame(): void {
    const name = this.playerName.trim() || "Captain";
    const eraKey = ERA_KEYS[this.selectedEraIndex];
    const era = ERAS[eraKey];

    const worldState = createNewWorldState(
      Date.now(),
      name,
      eraKey,
      era.startYear,
    );
    this.registry.set("worldState", worldState);
    this.scene.start("MainMapScene");
  }
}
