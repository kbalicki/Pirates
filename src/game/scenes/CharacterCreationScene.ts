import Phaser from "phaser";
import { ERAS, DEFAULT_ERA } from "../../core/data/eras.ts";
import { createNewWorldState } from "../GameApp.ts";
import { t } from "../../core/i18n/index.ts";
import { TEXT_RES } from "../ui/textStyle.ts";
import { txt } from "../ui/textStyle.ts";
import { APP_VERSION } from "../../version.ts";
import { listSaves, loadGame } from "../../persistence/SaveRepository.ts";
import { saveSlotId } from "../../core/model/ids.ts";
import {
  dayToCalendar,
  getMonthName,
} from "../../core/systems/TimeSystem.ts";

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

    // Version label — bottom-right
    const cam = this.cameras.main;
    this.add.text(cam.width - 6, cam.height - 4, `v${APP_VERSION}`, txt(12, { color: "#444444" }))
      .setOrigin(1, 1);

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
    this.add.text(cx, 20, t("creation.title"), {
      fontSize: "22px",
      fontFamily: "monospace",
      color: "#d4a44a",
      fontStyle: "bold",
      resolution: TEXT_RES,
    }).setOrigin(0.5);

    // Decorative line
    this.add.text(cx, 44, "━".repeat(30), {
      fontSize: "10px",
      fontFamily: "monospace",
      color: "#5a5a5a",
      resolution: TEXT_RES,
    }).setOrigin(0.5);

    // --- Name Input ---
    this.add.text(cx, 62, t("creation.name_label"), {
      fontSize: "12px",
      fontFamily: "monospace",
      color: "#88bbaa",
      resolution: TEXT_RES,
    }).setOrigin(0.5);

    this.nameText = this.add.text(cx, 82, "", {
      fontSize: "14px",
      fontFamily: "monospace",
      color: "#ffffff",
      backgroundColor: "#1a1a2e",
      padding: { x: 10, y: 4 },
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
    this.add.text(cx, 110, t("creation.era_label"), {
      fontSize: "12px",
      fontFamily: "monospace",
      color: "#88bbaa",
      resolution: TEXT_RES,
    }).setOrigin(0.5);

    const eraStartY = 130;
    const eraSpacing = 28;

    this.eraTexts = ERA_KEYS.map((key, i) => {
      const era = ERAS[key];
      const label = `${t("era." + key + ".name")}  (${era.startYear})`;
      const etxt = this.add.text(cx, eraStartY + i * eraSpacing, label, {
        fontSize: "11px",
        fontFamily: "monospace",
        color: "#aaaaaa",
        resolution: TEXT_RES,
      }).setOrigin(0.5);

      // Clickable
      etxt.setInteractive({ useHandCursor: true });
      etxt.on("pointerdown", () => {
        this.selectedEraIndex = i;
        this.updateEraHighlight();
      });

      return etxt;
    });

    // Era description
    this.add.text(cx, eraStartY + ERA_KEYS.length * eraSpacing + 4, t("creation.era_hint"), {
      fontSize: "9px",
      fontFamily: "monospace",
      color: "#555555",
      resolution: TEXT_RES,
    }).setOrigin(0.5);

    this.updateEraHighlight();

    // --- Confirm Button ---
    const confirmY = eraStartY + ERA_KEYS.length * eraSpacing + 28;
    this.confirmText = this.add.text(cx, confirmY, t("creation.confirm"), {
      fontSize: "13px",
      fontFamily: "monospace",
      color: "#d4a44a",
      fontStyle: "bold",
      resolution: TEXT_RES,
    }).setOrigin(0.5);

    this.confirmText.setInteractive({ useHandCursor: true });
    this.confirmText.on("pointerover", () => this.confirmText.setColor("#ffdd77"));
    this.confirmText.on("pointerout", () => this.confirmText.setColor("#d4a44a"));
    this.confirmText.on("pointerdown", () => this.startGame());

    // --- Load Game Section ---
    const loadY = confirmY + 30;
    this.renderLoadSection(cx, loadY);

    // --- Keyboard Input ---
    this.input.keyboard!.on("keydown", (event: KeyboardEvent) => {
      this.handleKey(event);
    });
  }

  private async renderLoadSection(cx: number, startY: number): Promise<void> {
    // Divider
    this.add.text(cx, startY, "━".repeat(30), {
      fontSize: "10px",
      fontFamily: "monospace",
      color: "#5a5a5a",
      resolution: TEXT_RES,
    }).setOrigin(0.5);

    // Load game title
    this.add.text(cx, startY + 16, t("creation.load_game"), {
      fontSize: "12px",
      fontFamily: "monospace",
      color: "#88bbaa",
      fontStyle: "bold",
      resolution: TEXT_RES,
    }).setOrigin(0.5);

    const saves = await listSaves();
    let y = startY + 34;

    if (saves.length === 0) {
      this.add.text(cx, y, t("creation.no_saves"), {
        fontSize: "10px",
        fontFamily: "monospace",
        color: "#666666",
        resolution: TEXT_RES,
      }).setOrigin(0.5);
      return;
    }

    for (const save of saves) {
      const cal = dayToCalendar(parseInt(save.title.replace("Day ", ""), 10) || 1);
      const dateStr = `${cal.dayOfMonth} ${getMonthName(cal.month)} ${cal.year}`;
      const realDate = new Date(save.updatedAt);
      const realStr = realDate.toLocaleDateString();
      const label = `${save.title} — ${dateStr}  (${realStr})`;

      const slotText = this.add.text(cx, y, label, txt(10, { color: "#aaaaaa" }));
      slotText.setOrigin(0.5);
      slotText.setInteractive({ useHandCursor: true });
      slotText.on("pointerover", () => slotText.setColor("#ffffff"));
      slotText.on("pointerout", () => slotText.setColor("#aaaaaa"));
      slotText.on("pointerdown", () => this.doLoad(save.slotId as string));
      y += 18;
    }
  }

  private async doLoad(slotId: string): Promise<void> {
    const payload = await loadGame(saveSlotId(slotId));
    if (payload) {
      this.sound.stopAll();
      this.registry.set("worldState", payload.world);
      this.scene.start("MainMapScene", { worldState: payload.world });
    }
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
    const cursor = this.cursorVisible ? "\u258c" : " ";
    this.nameText.setText(this.playerName + cursor);
  }

  private updateEraHighlight(): void {
    this.eraTexts.forEach((etxt, i) => {
      if (i === this.selectedEraIndex) {
        etxt.setColor("#ffffff");
        const era = ERAS[ERA_KEYS[i]];
        etxt.setText(`\u25b8 ${t("era." + ERA_KEYS[i] + ".name")}  (${era.startYear})`);
      } else {
        etxt.setColor("#777777");
        const era = ERAS[ERA_KEYS[i]];
        etxt.setText(`  ${t("era." + ERA_KEYS[i] + ".name")}  (${era.startYear})`);
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

    this.sound.stopAll();
    this.registry.set("worldState", worldState);
    this.scene.start("MainMapScene");
  }
}
