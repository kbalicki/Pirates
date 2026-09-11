/**
 * VillageScene — the counter that flies nobody's flag (v0.58.0).
 *
 * Deliberately not `PortScene`. A port screen is six counters, a governor, a
 * tavern bench and a market; a village is three sentences and two things a
 * captain can do, and building it on the port machinery would have meant
 * giving a village a `PortRuntimeState`, an inventory and a price table it has
 * no business owning.
 *
 * The header is the whole of the design: what they call you, and which colony
 * they live beside. Those two lines are why a captain came, and the second one
 * is what he is buying when he asks for a war party — so the town is **named**,
 * never implied.
 *
 * The screen redraws itself in place rather than through `scene.restart`. A
 * restart fires `shutdown`, and `MainMapScene` listens for that to learn the
 * village screen has closed — so restarting between two transactions would
 * tell the map the captain had left while he was still standing on the beach.
 */
import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import { t } from "../../core/i18n/index.ts";
import { txt } from "../ui/textStyle.ts";
import { CITIES } from "../../core/data/cities.ts";
import {
  villageDef, villageStanding, villageTier, tradeOffer, tradeCooldownLeft,
  barter, warPartyOffer, sendWarParty, neighbourCrown,
} from "../../core/systems/VillageSystem.ts";

type VillageAction = "trade" | "war" | "leave";

const DLG_W = 440;
const DLG_H = 310;
const PAD = 16;

export class VillageScene extends Phaser.Scene {
  private worldState!: WorldState;
  private villageKey!: string;
  private actions: { label: string; action: VillageAction; disabled?: boolean }[] = [];
  private selectedIndex = 0;
  private actionTexts: Phaser.GameObjects.Text[] = [];
  private selectionBar!: Phaser.GameObjects.Rectangle;
  private arrow!: Phaser.GameObjects.Text;
  private message = "";

  constructor() {
    super({ key: "VillageScene" });
  }

  init(data: { worldState: WorldState; villageKey: string }): void {
    this.worldState = data.worldState;
    this.villageKey = data.villageKey;
    this.message = "";
  }

  create(): void {
    if (!villageDef(this.villageKey)) { this.leave(); return; }
    this.draw();
  }

  private redraw(): void {
    this.children.removeAll(true);
    this.input.keyboard?.removeAllListeners();
    this.draw();
  }

  private draw(): void {
    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;
    const key = this.villageKey;
    const def = villageDef(key)!;

    const name = t(`village.${key}.name`);
    const people = t(`village.${key}.people`);
    const standing = villageStanding(this.worldState, key);
    const tier = villageTier(standing);
    const crown = neighbourCrown(this.worldState, key);

    this.add.rectangle(cx, cy, cam.width, cam.height, 0x000000, 0.55);
    const dlgX = cx - DLG_W / 2;
    const dlgY = cy - DLG_H / 2;
    this.add.rectangle(cx, cy, DLG_W + 6, DLG_H + 6, 0x2a2418);
    this.add.rectangle(cx, cy, DLG_W, DLG_H, 0xf4ead2);

    let y = dlgY + PAD;

    this.add.text(cx, y, name, txt(22, { bold: true, color: "#3a2f16" })).setOrigin(0.5, 0);
    y += 28;
    this.add.text(cx, y, t("village.subtitle", { people }), txt(12, { color: "#6a5a30" })).setOrigin(0.5, 0);
    y += 22;

    // The two lines a captain came for.
    this.add.text(cx, y, t("village.standing", { tier: t(`village.tier_${tier}`), value: standing }),
      txt(13, { bold: true, color: "#4a5a2a" })).setOrigin(0.5, 0);
    y += 20;
    this.add.text(cx, y, t("village.neighbour", {
      port: t(`port.${def.neighbour}.name`),
      faction: t(`faction.${crown}.name`),
    }), txt(12, { color: "#6a5a30" })).setOrigin(0.5, 0);
    y += 22;

    const divG = this.add.graphics();
    divG.lineStyle(1, 0xb8a878, 1);
    divG.lineBetween(dlgX + PAD, y, dlgX + DLG_W - PAD, y);
    y += 12;

    this.actions = this.buildActions();

    const barW = DLG_W - PAD * 2;
    this.selectionBar = this.add.rectangle(cx, y + 11, barW, 22, 0x6a5a30, 0.12);
    this.arrow = this.add.text(0, 0, "▶", txt(12, { bold: true, color: "#3a2f16" }));

    const listX = dlgX + PAD + 18;
    this.actionTexts = [];
    this.selectedIndex = this.actions.findIndex(a => !a.disabled);
    if (this.selectedIndex < 0) this.selectedIndex = this.actions.length - 1;

    for (let i = 0; i < this.actions.length; i++) {
      const act = this.actions[i];
      const color = act.disabled ? "#a89878" : "#2a2418";
      const text = this.add.text(listX, y, act.label, txt(14, { bold: !act.disabled, color }));
      if (!act.disabled) {
        text.setInteractive({ useHandCursor: true });
        text.on("pointerover", () => { this.selectedIndex = i; this.updateSelection(); });
        text.on("pointerdown", () => this.execute(act.action));
      }
      this.actionTexts.push(text);
      y += 26;
    }

    this.updateSelection();

    // The reply is drawn **under the last row**, never at a fixed y — the same
    // rule the port menu learned in v0.27.0, for the same reason: the list is
    // not always the same length. The key hint gives way when there is one.
    if (this.message) {
      y += 6;
      this.add.text(dlgX + PAD, y, this.message, {
        ...txt(12, { color: "#6a4a1a" }),
        wordWrap: { width: DLG_W - PAD * 2 },
      });
    } else {
      this.add.text(cx, dlgY + DLG_H - PAD - 2, t("village.hint"),
        txt(10, { color: "#9a8a60" })).setOrigin(0.5, 1);
    }

    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-W", () => this.move(-1));
      this.input.keyboard.on("keydown-UP", () => this.move(-1));
      this.input.keyboard.on("keydown-S", () => this.move(1));
      this.input.keyboard.on("keydown-DOWN", () => this.move(1));
      this.input.keyboard.on("keydown-ENTER", () => this.confirm());
      this.input.keyboard.on("keydown-E", () => this.confirm());
      this.input.keyboard.on("keydown-ESC", () => this.leave());
    }
  }

  /**
   * The menu, rebuilt from the world every time the screen is drawn.
   *
   * A refused offer keeps its row and says **why** it is refused, rather than
   * vanishing: an option that disappears reads as a bug, and "they do not
   * trust you that far (45/60)" is the only way a captain can learn what the
   * barter above it is actually for.
   */
  private buildActions(): { label: string; action: VillageAction; disabled?: boolean }[] {
    const w = this.worldState;
    const key = this.villageKey;
    const out: { label: string; action: VillageAction; disabled?: boolean }[] = [];

    const offer = tradeOffer(w, key);
    if (offer) {
      out.push({ label: t("village.trade", { rum: offer.rum, gold: offer.gold }), action: "trade" });
    } else {
      out.push({
        label: t("village.trade_cooldown", { days: tradeCooldownLeft(w, key) }),
        action: "trade",
        disabled: true,
      });
    }

    const war = warPartyOffer(w, key);
    if (war) {
      const portName = t(`port.${war.target}.name`);
      if (war.ready) {
        out.push({ label: t("village.war_party", { port: portName, rum: war.rum }), action: "war" });
      } else if (war.reason === "already") {
        out.push({ label: t("village.war_party_already", { port: portName }), action: "war", disabled: true });
      } else if (war.reason === "no_rum") {
        out.push({ label: t("village.war_party_no_rum", { rum: war.rum }), action: "war", disabled: true });
      } else {
        out.push({
          label: t("village.war_party_locked", { standing: war.standing, needed: war.needed }),
          action: "war",
          disabled: true,
        });
      }
    }

    out.push({ label: t("village.leave"), action: "leave" });
    return out;
  }

  private move(delta: number): void {
    let next = this.selectedIndex + delta;
    while (next >= 0 && next < this.actions.length && this.actions[next].disabled) next += delta;
    if (next >= 0 && next < this.actions.length) {
      this.selectedIndex = next;
      this.updateSelection();
    }
  }

  private confirm(): void {
    const act = this.actions[this.selectedIndex];
    if (act && !act.disabled) this.execute(act.action);
  }

  private updateSelection(): void {
    for (let i = 0; i < this.actionTexts.length; i++) {
      const text = this.actionTexts[i];
      if (this.actions[i].disabled) continue;
      text.setColor(i === this.selectedIndex ? "#000000" : "#4a4030");
      text.setFontStyle(i === this.selectedIndex ? "bold" : "");
    }
    const sel = this.actionTexts[this.selectedIndex];
    if (sel) {
      this.selectionBar.setPosition(this.selectionBar.x, sel.y + 11);
      this.arrow.setPosition(sel.x - 16, sel.y + 1);
    }
  }

  private execute(action: VillageAction): void {
    if (action === "leave") { this.leave(); return; }

    if (action === "trade") {
      const result = barter(this.worldState, this.villageKey);
      if (result.ok) {
        this.worldState = result.world;
        this.message = t("village.trade_done", { gold: result.gold });
      } else {
        this.message = result.reason === "no_rum"
          ? t("village.trade_no_rum")
          : t("village.trade_cooldown", { days: tradeCooldownLeft(this.worldState, this.villageKey) });
      }
    } else {
      const target = villageDef(this.villageKey)?.neighbour ?? "";
      const result = sendWarParty(this.worldState, this.villageKey);
      if (result.ok) {
        this.worldState = result.world;
        this.message = t("village.war_party_done", { port: t(`port.${target}.name`) || CITIES[target]?.name || target });
      }
    }

    this.registry.set("worldState", this.worldState);
    // Redrawn from the world that exists **after** the transaction, carrying
    // the line that describes the one just made — the granary lesson (v0.27.0).
    this.redraw();
  }

  private leave(): void {
    this.registry.set("worldState", this.worldState);
    this.scene.stop();
    this.scene.resume("MainMapScene");
  }
}
