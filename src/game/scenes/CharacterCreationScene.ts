import Phaser from "phaser";
import { ERAS, DEFAULT_ERA } from "../../core/data/eras.ts";
import { FACTIONS } from "../../core/data/factions.ts";
import { createNewWorldState } from "../GameApp.ts";
import { t } from "../../core/i18n/index.ts";
import { UI_FONT, TEXT_RES, txt } from "../ui/textStyle.ts";
import { APP_VERSION } from "../../version.ts";
import type { MusicManager } from "../audio/MusicManager.ts";
import { listSaves, loadGame } from "../../persistence/SaveRepository.ts";
import { saveSlotId } from "../../core/model/ids.ts";
import {
  dayToCalendar,
  getMonthName,
} from "../../core/systems/TimeSystem.ts";
import {
  SKILL_IDS,
  SKILL_DEFAULT,
  SKILL_MIN,
  SKILL_MAX,
  SKILL_BONUS_POINTS,
  createDefaultSkills,
} from "../../core/model/CaptainState.ts";
import type { CaptainSkills } from "../../core/model/CaptainState.ts";

const ERA_KEYS = Object.keys(ERAS);
const FACTION_KEYS = Object.keys(FACTIONS).filter(k => k !== "pirates");
const MAX_NAME_LENGTH = 20;

const PANEL_W = 480;
const PANEL_PAD = 24;
const BORDER = 3;

type FocusArea = "nationality" | "skills" | "buttons";

type StepData = {
  step?: 1 | 2;
  playerName?: string;
  selectedEraIndex?: number;
  nationality?: string;
  skills?: CaptainSkills;
  focusArea?: FocusArea;
  focusIndex?: number;
};

export class CharacterCreationScene extends Phaser.Scene {
  private step: 1 | 2 = 1;
  private playerName = "Incognito";
  private selectedEraIndex = ERA_KEYS.indexOf(DEFAULT_ERA);
  private cursorVisible = true;

  // Step 2 state
  private nationality = "england";
  private skills: CaptainSkills = createDefaultSkills();
  private bonusPointsUsed = 0;
  private focusArea: FocusArea = "nationality";
  private focusIndex = 0;

  // UI elements
  private nameText!: Phaser.GameObjects.Text;
  private eraTexts: Phaser.GameObjects.Text[] = [];
  private confirmText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "CharacterCreationScene" });
  }

  init(data?: StepData): void {
    if (data) {
      this.step = data.step ?? 1;
      if (data.playerName !== undefined) this.playerName = data.playerName;
      if (data.selectedEraIndex !== undefined) this.selectedEraIndex = data.selectedEraIndex;
      if (data.nationality !== undefined) this.nationality = data.nationality;
      if (data.skills !== undefined) {
        this.skills = { ...data.skills };
      } else {
        this.skills = createDefaultSkills();
      }
      this.bonusPointsUsed = this.calcBonusUsed();
      if (data.focusArea !== undefined) this.focusArea = data.focusArea;
      if (data.focusIndex !== undefined) this.focusIndex = data.focusIndex;
    }
  }

  private calcBonusUsed(): number {
    let used = 0;
    for (const id of SKILL_IDS) {
      used += this.skills[id] - SKILL_DEFAULT;
    }
    return used;
  }

  create(): void {
    if (this.step === 1) {
      this.createStep1();
    } else {
      this.createStep2();
    }
  }

  // ===================== STEP 1 =====================

  private createStep1(): void {
    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    this.addBackground(cx, cy, cam);

    // Version label
    this.add.text(cam.width - 6, cam.height - 4, `v${APP_VERSION}`, txt(16, { color: "#cccccc" }))
      .setOrigin(1, 1).setDepth(10);

    this.playMusic();

    // --- Calculate panel height dynamically ---
    const eraSpacing = 34;
    const panelContentH =
      50 +  // top margin
      26 +  // name label
      34 +  // name input
      16 +  // gap
      26 +  // era label
      ERA_KEYS.length * eraSpacing +
      20 +  // era hint
      20 +  // extra margin before button
      36 +  // confirm button
      36 +  // extra margin before load section
      34 +  // load section divider + title
      26 +  // buffer for load slots
      100;  // load slots area
    const PANEL_H = Math.min(panelContentH, cam.height - 40);
    const panelY = cy - PANEL_H / 2;

    // Title — above panel, halfway between panel top and browser top
    const titleY = panelY / 2;
    this.add.text(cx, titleY, t("creation.title"), {
      fontSize: "39px", fontFamily: UI_FONT, color: "#f5e6c8", fontStyle: "bold", resolution: TEXT_RES,
      stroke: "#1a0a00", strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setDepth(10);

    // Panel background
    this.drawPanel(cx, cy, PANEL_W, PANEL_H);

    let y = panelY + PANEL_PAD + 50;

    // Name Input
    this.add.text(cx, y, t("creation.name_label"), {
      fontSize: "16px", fontFamily: UI_FONT, color: "#555555", resolution: TEXT_RES,
    }).setOrigin(0.5, 0).setDepth(10);
    y += 26;

    this.nameText = this.add.text(cx, y, "", {
      fontSize: "18px", fontFamily: UI_FONT, color: "#1a1a1a",
      padding: { x: 12, y: 5 }, resolution: TEXT_RES,
    }).setOrigin(0.5, 0).setDepth(10);
    y += 34;

    this.updateNameDisplay();

    // Blink cursor
    this.time.addEvent({
      delay: 500, loop: true,
      callback: () => { this.cursorVisible = !this.cursorVisible; this.updateNameDisplay(); },
    });

    y += 16;

    // Era Selection
    this.add.text(cx, y, t("creation.era_label"), {
      fontSize: "16px", fontFamily: UI_FONT, color: "#555555", resolution: TEXT_RES,
    }).setOrigin(0.5, 0).setDepth(10);
    y += 26;

    const eraStartY = y;
    this.eraTexts = ERA_KEYS.map((key, i) => {
      const era = ERAS[key];
      const label = `${t("era." + key + ".name")}  (${era.startYear})`;
      const etxt = this.add.text(cx, eraStartY + i * eraSpacing, label, {
        fontSize: "14px", fontFamily: UI_FONT, color: "#888888", resolution: TEXT_RES,
      }).setOrigin(0.5, 0).setDepth(10);
      etxt.setInteractive({ useHandCursor: true });
      etxt.on("pointerdown", () => { this.selectedEraIndex = i; this.updateEraHighlight(); });
      return etxt;
    });
    y = eraStartY + ERA_KEYS.length * eraSpacing;

    // Era hint
    this.add.text(cx, y, t("creation.era_hint"), {
      fontSize: "12px", fontFamily: UI_FONT, color: "#aaaaaa", resolution: TEXT_RES,
    }).setOrigin(0.5, 0).setDepth(10);
    y += 20;

    this.updateEraHighlight();

    // Extra margin before button
    y += 20;

    // Confirm Button — "LET'S BEGIN" / "ZACZYNAJMY"
    this.confirmText = this.add.text(cx, y, t("creation.confirm"), {
      fontSize: "18px", fontFamily: UI_FONT, color: "#8b6914", fontStyle: "bold", resolution: TEXT_RES,
    }).setOrigin(0.5, 0).setDepth(10);
    this.confirmText.setInteractive({ useHandCursor: true });
    this.confirmText.on("pointerover", () => this.confirmText.setColor("#c49a20"));
    this.confirmText.on("pointerout", () => this.confirmText.setColor("#8b6914"));
    this.confirmText.on("pointerdown", () => this.goToStep2());
    y += 36;

    // Extra margin before Load section
    y += 36;

    // Load Game Section
    this.renderLoadSection(cx, y);

    // Dynamic resize
    const onResize = () => {
      this.scale.off("resize", onResize);
      this.scene.restart({ step: 1, playerName: this.playerName, selectedEraIndex: this.selectedEraIndex });
    };
    this.scale.on("resize", onResize);

    // Keyboard Input
    this.input.keyboard!.on("keydown", (event: KeyboardEvent) => this.handleKeyStep1(event));
  }

  // ===================== STEP 2 =====================

  private createStep2(): void {
    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    this.addBackground(cx, cy, cam);

    // Panel height for step 2
    const PANEL_H = Math.min(560, cam.height - 40);
    const panelY = cy - PANEL_H / 2;

    // Title — above panel, halfway between panel top and browser top
    const titleY = panelY / 2;
    this.add.text(cx, titleY, t("creation.step2_title"), {
      fontSize: "32px", fontFamily: UI_FONT, color: "#f5e6c8", fontStyle: "bold", resolution: TEXT_RES,
      stroke: "#1a0a00", strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setDepth(10);

    this.drawPanel(cx, cy, PANEL_W, PANEL_H);

    let y = panelY + PANEL_PAD + 40;

    // --- Nationality Selection ---
    this.add.text(cx, y, t("creation.nationality_label"), {
      fontSize: "16px", fontFamily: UI_FONT, color: "#555555", resolution: TEXT_RES,
    }).setOrigin(0.5, 0).setDepth(10);
    y += 26;

    for (let fi = 0; fi < FACTION_KEYS.length; fi++) {
      const fKey = FACTION_KEYS[fi];
      const isSelected = fKey === this.nationality;
      const isFocused = this.focusArea === "nationality" && this.focusIndex === fi;
      const marker = isSelected ? "\u25b8 " : isFocused ? "\u25b9 " : "  ";
      const color = isFocused ? "#0044aa" : isSelected ? "#1a1a1a" : "#777777";
      const label = marker + t("faction." + fKey + ".name");

      const fText = this.add.text(cx, y, label, {
        fontSize: "16px", fontFamily: UI_FONT, color, fontStyle: (isSelected || isFocused) ? "bold" : undefined, resolution: TEXT_RES,
      }).setOrigin(0.5, 0).setDepth(10);
      fText.setInteractive({ useHandCursor: true });
      fText.on("pointerdown", () => {
        this.nationality = fKey;
        this.focusArea = "nationality";
        this.focusIndex = fi;
        this.scene.restart(this.getStepData());
      });
      y += 28;
    }

    y += 10;

    // --- Skills Allocation ---
    this.add.text(cx, y, t("creation.skills_label"), {
      fontSize: "16px", fontFamily: UI_FONT, color: "#555555", resolution: TEXT_RES,
    }).setOrigin(0.5, 0).setDepth(10);
    y += 26;

    const remaining = SKILL_BONUS_POINTS - this.bonusPointsUsed;
    this.add.text(cx, y, t("creation.points_remaining", { pts: remaining }), {
      fontSize: "14px", fontFamily: UI_FONT,
      color: remaining === 0 ? "#44aa44" : "#cc6600",
      fontStyle: "bold", resolution: TEXT_RES,
    }).setOrigin(0.5, 0).setDepth(10);
    y += 26;

    const leftX = cx - PANEL_W / 2 + PANEL_PAD + 36;

    for (let si = 0; si < SKILL_IDS.length; si++) {
      const skillId = SKILL_IDS[si];
      const val = this.skills[skillId];
      const skillName = t("skill." + skillId);
      const isSkillFocused = this.focusArea === "skills" && this.focusIndex === si;

      // [-] button
      const minusBtn = this.add.text(leftX, y, "[-]", {
        fontSize: "16px", fontFamily: UI_FONT,
        color: val > SKILL_MIN ? "#cc4444" : "#cccccc",
        fontStyle: "bold", resolution: TEXT_RES,
      }).setOrigin(0, 0).setDepth(10);
      if (val > SKILL_MIN) {
        minusBtn.setInteractive({ useHandCursor: true });
        minusBtn.on("pointerdown", () => {
          this.skills[skillId]--;
          this.bonusPointsUsed = this.calcBonusUsed();
          this.focusArea = "skills";
          this.focusIndex = si;
          this.scene.restart(this.getStepData());
        });
      }

      // Skill name + value
      const skillColor = isSkillFocused ? "#0044aa" : "#1a1a1a";
      const skillMarker = isSkillFocused ? "\u25b8 " : "";
      this.add.text(leftX + 50, y, `${skillMarker}${skillName}: ${val}`, {
        fontSize: "16px", fontFamily: UI_FONT, color: skillColor,
        fontStyle: isSkillFocused ? "bold" : undefined, resolution: TEXT_RES,
      }).setOrigin(0, 0).setDepth(10);

      // [+] button
      const canIncrease = val < SKILL_MAX && remaining > 0;
      const plusBtn = this.add.text(leftX + 260, y, "[+]", {
        fontSize: "16px", fontFamily: UI_FONT,
        color: canIncrease ? "#44aa44" : "#cccccc",
        fontStyle: "bold", resolution: TEXT_RES,
      }).setOrigin(0, 0).setDepth(10);
      if (canIncrease) {
        plusBtn.setInteractive({ useHandCursor: true });
        plusBtn.on("pointerdown", () => {
          this.skills[skillId]++;
          this.bonusPointsUsed = this.calcBonusUsed();
          this.focusArea = "skills";
          this.focusIndex = si;
          this.scene.restart(this.getStepData());
        });
      }

      y += 30;
    }

    // Hint
    this.add.text(cx, y, t("creation.skill_hint"), {
      fontSize: "12px", fontFamily: UI_FONT, color: "#aaaaaa", resolution: TEXT_RES,
    }).setOrigin(0.5, 0).setDepth(10);
    y += 26;

    // --- Buttons ---
    const backFocused = this.focusArea === "buttons" && this.focusIndex === 0;
    const sailFocused = this.focusArea === "buttons" && this.focusIndex === 1;

    // BACK
    const backColor = backFocused ? "#0044aa" : "#888888";
    const backLabel = (backFocused ? "\u25b8 " : "") + t("creation.back");
    const backBtn = this.add.text(cx - 70, y, backLabel, {
      fontSize: "17px", fontFamily: UI_FONT, color: backColor, fontStyle: "bold", resolution: TEXT_RES,
    }).setOrigin(0.5, 0).setDepth(10);
    backBtn.setInteractive({ useHandCursor: true });
    backBtn.on("pointerover", () => backBtn.setColor("#555555"));
    backBtn.on("pointerout", () => backBtn.setColor(backFocused ? "#0044aa" : "#888888"));
    backBtn.on("pointerdown", () => this.goToStep1());

    // SET SAIL — disabled until all bonus points are allocated
    const canStart = remaining === 0;
    const sailBaseColor = canStart ? (sailFocused ? "#0044aa" : "#8b6914") : "#cccccc";
    const sailLabel = (sailFocused ? "\u25b8 " : "") + t("creation.start_game");
    const sailBtn = this.add.text(cx + 70, y, sailLabel, {
      fontSize: "17px", fontFamily: UI_FONT, color: sailBaseColor, fontStyle: "bold", resolution: TEXT_RES,
    }).setOrigin(0.5, 0).setDepth(10);
    if (canStart) {
      sailBtn.setInteractive({ useHandCursor: true });
      sailBtn.on("pointerover", () => sailBtn.setColor("#c49a20"));
      sailBtn.on("pointerout", () => sailBtn.setColor(sailFocused ? "#0044aa" : "#8b6914"));
      sailBtn.on("pointerdown", () => this.startGame());
    }

    // Keyboard hint
    this.add.text(cx, y + 34,
      "Tab \u2014 Next block   \u2191\u2193 \u2014 Navigate   \u2190\u2192 \u2014 Adjust skill   Enter \u2014 Select   Esc \u2014 Back",
      { fontSize: "10px", fontFamily: UI_FONT, color: "#aaaaaa", resolution: TEXT_RES },
    ).setOrigin(0.5, 0).setDepth(10);

    // Dynamic resize
    const onResize = () => {
      this.scale.off("resize", onResize);
      this.scene.restart(this.getStepData());
    };
    this.scale.on("resize", onResize);

    // Keyboard
    this.input.keyboard!.on("keydown", (event: KeyboardEvent) => this.handleKeyStep2(event));
  }

  // ===================== SHARED HELPERS =====================

  private drawPanel(cx: number, cy: number, w: number, h: number): void {
    if (this.textures.exists("parchment_panel")) {
      const panel = this.add.image(cx, cy, "parchment_panel");
      panel.setDisplaySize(w + 40, h + 30);
      panel.setDepth(5);
      panel.setAlpha(0.95);
    } else {
      this.add.rectangle(cx, cy, w + BORDER * 2, h + BORDER * 2, 0x1a1a2e).setDepth(5);
      this.add.rectangle(cx, cy, w, h, 0xffffff, 0.95).setDepth(5);
    }
  }

  private addBackground(cx: number, cy: number, cam: Phaser.Cameras.Scene2D.Camera): void {
    if (this.textures.exists("start_bg")) {
      const bg = this.add.image(cx, cy, "start_bg");
      const texFrame = this.textures.getFrame("start_bg");
      const scaleX = cam.width / texFrame.width;
      const scaleY = cam.height / texFrame.height;
      bg.setScale(Math.max(scaleX, scaleY));
      bg.setDepth(0);
      this.add.rectangle(cx, cy, cam.width, cam.height, 0x000000, 0.25).setDepth(1);
    } else {
      this.cameras.main.setBackgroundColor("#0a0a1a");
    }
  }

  private playMusic(): void {
    // Try MusicManager first (upstream approach)
    const music = this.registry.get("musicManager") as MusicManager | undefined;
    if (music) {
      music.play("menu", 0.6);
      return;
    }

    // Fallback: direct sound playback
    if (!this.cache.audio.exists("pirate_theme")) return;

    const existing = this.sound.get("pirate_theme");
    if (existing && existing.isPlaying) return; // already playing

    if (this.sound.locked) {
      this.sound.once("unlocked", () => {
        this.sound.play("pirate_theme", { loop: false, volume: 0.6 });
      });
    } else {
      this.sound.play("pirate_theme", { loop: false, volume: 0.6 });
    }
  }

  private getStepData(): StepData {
    return {
      step: this.step,
      playerName: this.playerName,
      selectedEraIndex: this.selectedEraIndex,
      nationality: this.nationality,
      skills: { ...this.skills },
      focusArea: this.focusArea,
      focusIndex: this.focusIndex,
    };
  }

  private goToStep2(): void {
    this.step = 2;
    this.scene.restart(this.getStepData());
  }

  private goToStep1(): void {
    this.step = 1;
    this.scene.restart(this.getStepData());
  }

  // ---- Step 1 helpers ----

  private async renderLoadSection(cx: number, startY: number): Promise<void> {
    this.add.text(cx, startY, "\u2500".repeat(36), {
      fontSize: "13px", fontFamily: UI_FONT, color: "#bbbbbb", resolution: TEXT_RES,
    }).setOrigin(0.5, 0).setDepth(10);

    this.add.text(cx, startY + 18, t("creation.load_game"), {
      fontSize: "16px", fontFamily: UI_FONT, color: "#555555", fontStyle: "bold", resolution: TEXT_RES,
    }).setOrigin(0.5, 0).setDepth(10);

    const saves = await listSaves();
    let y = startY + 42;

    if (saves.length === 0) {
      this.add.text(cx, y, t("creation.no_saves"), {
        fontSize: "13px", fontFamily: UI_FONT, color: "#999999", resolution: TEXT_RES,
      }).setOrigin(0.5, 0).setDepth(10);
      return;
    }

    for (const save of saves) {
      const cal = dayToCalendar(parseInt(save.title.replace("Day ", ""), 10) || 1);
      const dateStr = `${cal.dayOfMonth} ${getMonthName(cal.month)} ${cal.year}`;
      const realDate = new Date(save.updatedAt);
      const realStr = realDate.toLocaleDateString();
      const label = `${save.title} — ${dateStr}  (${realStr})`;

      const slotText = this.add.text(cx, y, label, txt(13, { color: "#666666" }));
      slotText.setOrigin(0.5, 0).setDepth(10);
      slotText.setInteractive({ useHandCursor: true });
      slotText.on("pointerover", () => slotText.setColor("#1a1a1a"));
      slotText.on("pointerout", () => slotText.setColor("#666666"));
      slotText.on("pointerdown", () => this.doLoad(save.slotId as string));
      y += 23;
    }
  }

  private async doLoad(slotId: string): Promise<void> {
    const payload = await loadGame(saveSlotId(slotId));
    if (payload) {
      const music = this.registry.get("musicManager") as MusicManager | undefined;
      if (music) music.stop();
      this.registry.set("worldState", payload.world);
      this.scene.start("MainMapScene", { worldState: payload.world });
    }
  }

  private handleKeyStep1(event: KeyboardEvent): void {
    const key = event.key;
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
    if (key === "Enter") {
      this.goToStep2();
      return;
    }
    if (key === "Backspace") {
      this.playerName = this.playerName.slice(0, -1);
      this.updateNameDisplay();
      return;
    }
    if (key.length === 1 && this.playerName.length < MAX_NAME_LENGTH) {
      this.playerName += key;
      this.updateNameDisplay();
    }
  }

  private handleKeyStep2(event: KeyboardEvent): void {
    const key = event.key;
    if (key === "Escape") {
      this.goToStep1();
      return;
    }

    const areaOrder: FocusArea[] = ["nationality", "skills", "buttons"];
    const areaIdx = areaOrder.indexOf(this.focusArea);
    const maxForArea = (area: FocusArea): number => {
      if (area === "nationality") return FACTION_KEYS.length - 1;
      if (area === "skills") return SKILL_IDS.length - 1;
      return 1; // buttons: Back(0), Set Sail(1)
    };

    // Tab / Shift+Tab: move between blocks
    if (key === "Tab") {
      event.preventDefault();
      if (event.shiftKey) {
        if (areaIdx > 0) {
          this.focusArea = areaOrder[areaIdx - 1];
          this.focusIndex = 0;
        }
      } else {
        if (areaIdx < areaOrder.length - 1) {
          this.focusArea = areaOrder[areaIdx + 1];
          this.focusIndex = 0;
        }
      }
      this.scene.restart(this.getStepData());
      return;
    }

    // Up/Down navigation within block
    if (key === "ArrowUp") {
      if (this.focusIndex > 0) {
        this.focusIndex--;
      } else if (areaIdx > 0) {
        // Move to previous block, last item
        this.focusArea = areaOrder[areaIdx - 1];
        this.focusIndex = maxForArea(this.focusArea);
      }
      this.scene.restart(this.getStepData());
      return;
    }
    if (key === "ArrowDown") {
      if (this.focusIndex < maxForArea(this.focusArea)) {
        this.focusIndex++;
      } else if (areaIdx < areaOrder.length - 1) {
        // Move to next block, first item
        this.focusArea = areaOrder[areaIdx + 1];
        this.focusIndex = 0;
      }
      this.scene.restart(this.getStepData());
      return;
    }

    // Left/Right or -/+ for skills
    if (this.focusArea === "skills") {
      const skillId = SKILL_IDS[this.focusIndex];
      if (key === "ArrowLeft" || key === "-") {
        if (this.skills[skillId] > SKILL_MIN) {
          this.skills[skillId]--;
          this.bonusPointsUsed = this.calcBonusUsed();
          this.scene.restart(this.getStepData());
        }
        return;
      }
      if (key === "ArrowRight" || key === "+" || key === "=") {
        const remaining = SKILL_BONUS_POINTS - this.bonusPointsUsed;
        if (this.skills[skillId] < SKILL_MAX && remaining > 0) {
          this.skills[skillId]++;
          this.bonusPointsUsed = this.calcBonusUsed();
          this.scene.restart(this.getStepData());
        }
        return;
      }
    }

    // Left/Right for buttons block
    if (this.focusArea === "buttons") {
      if (key === "ArrowLeft") {
        this.focusIndex = 0;
        this.scene.restart(this.getStepData());
        return;
      }
      if (key === "ArrowRight") {
        this.focusIndex = 1;
        this.scene.restart(this.getStepData());
        return;
      }
    }

    // Enter/Space: confirm
    if (key === "Enter" || key === " ") {
      if (this.focusArea === "nationality") {
        this.nationality = FACTION_KEYS[this.focusIndex];
        this.scene.restart(this.getStepData());
      } else if (this.focusArea === "buttons") {
        if (this.focusIndex === 0) {
          this.goToStep1();
        } else {
          const remaining = SKILL_BONUS_POINTS - this.bonusPointsUsed;
          if (remaining === 0) this.startGame();
        }
      }
      return;
    }
  }

  private updateNameDisplay(): void {
    const cursor = this.cursorVisible ? "\u258c" : " ";
    this.nameText.setText(this.playerName + cursor);
  }

  private updateEraHighlight(): void {
    this.eraTexts.forEach((etxt, i) => {
      const era = ERAS[ERA_KEYS[i]];
      if (i === this.selectedEraIndex) {
        etxt.setColor("#1a1a1a");
        etxt.setText(`\u25b8 ${t("era." + ERA_KEYS[i] + ".name")}  (${era.startYear})`);
      } else {
        etxt.setColor("#777777");
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
      {
        nationality: this.nationality,
        skills: { ...this.skills },
      },
    );

    const music = this.registry.get("musicManager") as MusicManager | undefined;
    if (music) music.stop();
    this.registry.set("worldState", worldState);
    this.scene.start("MainMapScene");
  }
}
