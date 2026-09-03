import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import type { PortId } from "../../core/model/ids.ts";
import { PORTS } from "../../core/data/ports.ts";
import { FACTIONS } from "../../core/data/factions.ts";
import { t } from "../../core/i18n/index.ts";
import { txt } from "../ui/textStyle.ts";
import {
  createSiege,
  bombardRound,
  resolveAssault,
  assaultOdds,
  landingParty,
  capturePort,
  repulsedAtPort,
  availableSponsors,
  writeBackForce,
  lootValue,
  portFaction,
  type SiegeState,
  type AttackForce,
  type SpoilsChoice,
} from "../../core/systems/SiegeSystem.ts";

/**
 * CityAssaultScene — the fort, the beach, and what is left of the town.
 *
 * All the arithmetic lives in `core/systems/SiegeSystem.ts`; this scene draws
 * three bars, a running log and a keyboard. It is deliberately a text-and-bars
 * screen rather than a second battle simulation: the decision the player is
 * making — one more broadside, or land now — is a number decision, and dressing
 * it up as a real-time fight would hide the number without adding a choice.
 *
 * Three screens in one scene, because they are one continuous action:
 *
 *   bombard   SPACE fires a broadside, L lands the men, ESC breaks off
 *   assault   plays itself out, one wave a second
 *   spoils    what to do with a town that no longer has a garrison
 *
 * Losses are pooled across the fleet during the siege and split back onto the
 * individual hulls once — see `writeBackForce` — so a consort can be shot to
 * pieces holding station off a fort.
 */
export class CityAssaultScene extends Phaser.Scene {
  private worldState!: WorldState;
  private portKey!: string;
  private siege!: SiegeState;
  /** The force as it stood before the first shot, for splitting the bill later. */
  private initialForce!: AttackForce;
  private phase: "bombard" | "assault" | "spoils" | "done" = "bombard";
  private busy = false;

  private log: string[] = [];
  private logText!: Phaser.GameObjects.Text;
  private fortText!: Phaser.GameObjects.Text;
  private fleetText!: Phaser.GameObjects.Text;
  private oddsText!: Phaser.GameObjects.Text;
  private controlsText!: Phaser.GameObjects.Text;
  private fortGfx!: Phaser.GameObjects.Graphics;

  /** Spoils menu, once the town has fallen. */
  private spoils: { label: string; choice: SpoilsChoice; sponsor?: string }[] = [];
  private spoilsTexts: Phaser.GameObjects.Text[] = [];
  private selectedIndex = 0;

  constructor() {
    super({ key: "CityAssaultScene" });
  }

  init(data: { worldState: WorldState; portId: PortId }): void {
    this.worldState = data.worldState;
    this.portKey = data.portId as string;
    this.siege = createSiege(this.worldState, this.portKey);
    this.initialForce = this.siege.force;
    this.phase = "bombard";
    this.busy = false;
    this.log = [];
    this.spoils = [];
    this.spoilsTexts = [];
    this.selectedIndex = 0;
  }

  create(): void {
    const cw = this.cameras.main.width;
    const ch = this.cameras.main.height;
    const def = PORTS[this.portKey];
    const ownerKey = portFaction(this.worldState, this.portKey) as string;
    const ownerColor = FACTIONS[ownerKey]?.color ?? 0xaaaaaa;

    this.cameras.main.setBackgroundColor("#0a1420");
    this.add.rectangle(0, 0, cw, ch, 0x0a1420, 1).setOrigin(0).setDepth(0);

    this.add.text(cw / 2, 24, t("siege.title", { port: t("port." + this.portKey + ".name") }),
      txt(24, { bold: true, color: "#ffdd66" })).setOrigin(0.5, 0).setDepth(2);

    this.add.text(cw / 2, 58,
      `${t("port_type." + def.type)} — ${t("faction." + ownerKey + ".name")}`,
      txt(13, { color: `#${ownerColor.toString(16).padStart(6, "0")}` }))
      .setOrigin(0.5, 0).setDepth(2);

    // The fort itself, drawn once and re-tinted as the walls come down.
    this.fortGfx = this.add.graphics().setDepth(1);

    this.panel(cw / 2, 210, 700, 120);
    this.fortText = this.add.text(cw / 2 - 330, 162, "", txt(14, { color: "#ffcccc" })).setDepth(2);

    this.panel(cw / 2, 340, 700, 92);
    this.fleetText = this.add.text(cw / 2 - 330, 306, "", txt(14, { color: "#cce0ff" })).setDepth(2);

    this.oddsText = this.add.text(cw / 2, 396, "", txt(13, { color: "#ffdd99" }))
      .setOrigin(0.5, 0).setDepth(2);

    this.panel(cw / 2, ch - 150, 700, 150);
    this.logText = this.add.text(cw / 2 - 330, ch - 220, "", txt(12, { color: "#c8d2dc" })).setDepth(2);

    this.controlsText = this.add.text(cw / 2, ch - 48, "", txt(13, { color: "#99aabb" }))
      .setOrigin(0.5, 0).setDepth(2);

    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-SPACE", () => this.onFire());
      this.input.keyboard.on("keydown-L", () => this.onLand());
      this.input.keyboard.on("keydown-ESC", () => this.onWithdraw());
      this.input.keyboard.on("keydown-ENTER", () => this.onConfirm());
      this.input.keyboard.on("keydown-W", () => this.moveSelection(-1));
      this.input.keyboard.on("keydown-UP", () => this.moveSelection(-1));
      this.input.keyboard.on("keydown-S", () => this.moveSelection(1));
      this.input.keyboard.on("keydown-DOWN", () => this.moveSelection(1));
      for (let i = 1; i <= 4; i++) {
        const digit = ["ONE", "TWO", "THREE", "FOUR"][i - 1];
        this.input.keyboard.on("keydown-" + digit, () => this.pickSpoils(i - 1));
      }
    }

    this.pushLog(t("siege.log_open", { guns: this.siege.fort.guns, soldiers: this.siege.fort.soldiers }));
    this.redraw();
  }

  private panel(cx: number, cy: number, w: number, h: number): void {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x0d1a2a, 0.96).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 10);
    g.lineStyle(1, 0x2b3a52, 0.9).strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 10);
  }

  // ── Bombardment ─────────────────────────────────────────

  private onFire(): void {
    if (this.phase === "spoils") { this.onConfirm(); return; }
    if (this.phase !== "bombard" || this.busy) return;

    if (this.siege.fort.guns <= 0 && this.siege.fort.walls <= 0) {
      // There is nothing left to knock down. Say so rather than reporting a
      // broadside that dismounted 0.0 guns and took 0.0 of wall.
      this.pushLog(t("siege.log_nothing_left"));
      this.redraw();
      return;
    }

    const result = bombardRound(this.siege, this.worldState.rng);
    this.siege = result.state;
    this.worldState = { ...this.worldState, rng: result.rng };

    this.pushLog(t("siege.log_broadside", {
      guns: result.gunsSilenced.toFixed(1),
      walls: result.wallsBreached.toFixed(1),
    }));
    if (result.hullLost > 0 || result.crewLost > 0) {
      this.pushLog(t("siege.log_return_fire", {
        hull: result.hullLost.toFixed(1),
        crew: result.crewLost,
      }));
    } else {
      this.pushLog(t("siege.log_guns_silent"));
    }

    if (result.fleetBroken) {
      this.pushLog(t("siege.log_fleet_broken"));
      this.redraw();
      this.time.delayedCall(1400, () => this.finishRepulsed());
      return;
    }
    this.redraw();
  }

  private onWithdraw(): void {
    if (this.phase === "assault" || this.phase === "done") return;
    if (this.phase === "spoils") return;
    // Breaking off before landing is not an attack on the town — the guns were
    // exchanged, but nobody set foot ashore, so the crown is merely annoyed.
    this.finish(writeBackForce(this.worldState, this.initialForce, this.siege.force));
  }

  // ── The landing ─────────────────────────────────────────

  private onLand(): void {
    if (this.phase !== "bombard" || this.busy) return;
    const men = landingParty(this.siege.force);
    if (men <= 0) {
      this.pushLog(t("siege.log_no_men"));
      this.redraw();
      return;
    }

    this.phase = "assault";
    this.busy = true;
    this.pushLog(t("siege.log_landing", { men }));

    const defense = this.worldState.ports[this.portKey]?.defense ?? 0;
    const result = resolveAssault(this.siege, defense, this.worldState.rng);
    this.worldState = { ...this.worldState, rng: result.rng };
    // Fold the casualties into the siege state so the two readouts keep telling
    // the truth while the waves play out — and so `writeBackForce` sees them:
    // the beach losses are part of the force's own history, not an extra bill.
    this.siege = {
      ...this.siege,
      phase: "assault",
      fort: { ...this.siege.fort, soldiers: Math.max(0, this.siege.fort.soldiers - result.defenderLosses) },
      force: { ...this.siege.force, crew: Math.max(0, this.siege.force.crew - result.attackerLosses) },
    };

    // One wave a second, so the auto-resolve reads as a fight rather than a
    // verdict. The outcome is already decided — this is the telling of it.
    result.waves.forEach((wave, i) => {
      this.time.delayedCall(700 * (i + 1), () => {
        this.pushLog(t("siege.log_wave", {
          n: i + 1,
          ours: wave.attackerLosses,
          theirs: wave.defenderLosses,
          left: wave.attackersLeft,
        }));
        this.redraw();
      });
    });

    this.time.delayedCall(700 * (result.waves.length + 1), () => {
      if (result.captured) {
        this.pushLog(t("siege.log_town_taken"));
        this.openSpoils();
      } else {
        this.pushLog(t("siege.log_thrown_back", { lost: result.attackerLosses }));
        this.redraw();
        this.time.delayedCall(1400, () => this.finishRepulsed());
      }
    });
    this.redraw();
  }

  // ── Spoils ──────────────────────────────────────────────

  private openSpoils(): void {
    this.phase = "spoils";
    this.busy = false;
    this.selectedIndex = 0;

    // Only the closing lines stay: the menu shares the panel with them.
    this.log = this.log.slice(-3);

    const loot = lootValue(this.worldState.ports[this.portKey], this.portKey);
    this.spoils = [
      { label: t("siege.spoils_plunder", { gold: loot }), choice: "plunder" },
      { label: t("siege.spoils_brethren", { gold: Math.round(loot * 0.7) }), choice: "brethren" },
    ];
    for (const sponsor of availableSponsors(this.worldState, this.portKey)) {
      this.spoils.push({
        label: t("siege.spoils_sponsor", {
          faction: t("faction." + sponsor + ".name"),
          gold: Math.round(loot * 0.5),
        }),
        choice: "sponsor",
        sponsor,
      });
    }

    this.redraw();
  }

  private moveSelection(delta: number): void {
    if (this.phase !== "spoils") return;
    this.selectedIndex = Math.max(0, Math.min(this.spoils.length - 1, this.selectedIndex + delta));
    this.redraw();
  }

  private onConfirm(): void {
    if (this.phase !== "spoils") return;
    this.pickSpoils(this.selectedIndex);
  }

  private pickSpoils(index: number): void {
    if (this.phase !== "spoils") return;
    const pick = this.spoils[index];
    if (!pick) return;

    this.phase = "done";
    // Ship losses first, then the town: `capturePort` writes a log line and the
    // log lives on the world, so the order matters for what the player reads.
    const damaged = writeBackForce(this.worldState, this.initialForce, this.siege.force);
    const result = capturePort(damaged, this.portKey, pick.choice, pick.sponsor);

    this.pushLog(t("siege.log_spoils", { gold: result.gold }));
    this.redraw();
    this.time.delayedCall(1600, () => this.finish(result.world));
  }

  // ── Endings ─────────────────────────────────────────────

  private finishRepulsed(): void {
    if (this.phase === "done") return;
    this.phase = "done";
    const damaged = writeBackForce(this.worldState, this.initialForce, this.siege.force);
    this.finish(repulsedAtPort(damaged, this.portKey));
  }

  private finish(world: WorldState): void {
    this.registry.set("worldState", world);
    this.scene.start("MainMapScene", { worldState: world });
  }

  // ── Drawing ─────────────────────────────────────────────

  private pushLog(line: string): void {
    this.log.push(line);
    if (this.log.length > 6) this.log.shift();
  }

  private redraw(): void {
    const cw = this.cameras.main.width;
    const fort = this.siege.fort;
    const force = this.siege.force;

    this.fortText.setText([
      t("siege.fort_guns", { now: fort.guns, max: fort.gunsMax }),
      t("siege.fort_walls", { now: Math.round(fort.walls), max: Math.round(fort.wallsMax) }),
      t("siege.fort_soldiers", { n: fort.soldiers }),
    ].join("\n"));

    this.fleetText.setText([
      t("siege.fleet_hull", { now: Math.round(force.hullHp), max: Math.round(force.hullMax) }),
      t("siege.fleet_crew", { now: force.crew, guns: force.cannons }),
    ].join("\n"));

    // Bars sit between the readout and the fort silhouette; the silhouette is
    // pushed to the right edge of the panel so the two never overlap.
    this.drawFort(cw / 2 + 275, 210);
    this.drawBar(cw / 2 + 20, 176, fort.walls / Math.max(1, fort.wallsMax), 0xbb8855);
    this.drawBar(cw / 2 + 20, 196, fort.guns / Math.max(1, fort.gunsMax), 0xcc5544);
    this.drawBar(cw / 2 + 20, 318, force.hullHp / Math.max(1, force.hullMax), 0x4488cc);
    this.drawBar(cw / 2 + 20, 338, force.crew / Math.max(1, force.crewMax), 0x66aa77);

    const defense = this.worldState.ports[this.portKey]?.defense ?? 0;
    const odds = Math.round(assaultOdds(this.siege, defense) * 100);
    this.oddsText.setText(this.phase === "bombard"
      ? t("siege.odds", { pct: odds, men: landingParty(force) })
      : "");

    this.logText.setText(this.log.join("\n"));

    for (const text of this.spoilsTexts) text.destroy();
    this.spoilsTexts = [];

    if (this.phase === "spoils") {
      this.controlsText.setText(t("siege.controls_spoils"));
      // Under the last lines of narration, inside the same panel.
      const startY = this.logText.y + this.log.length * 19 + 10;
      this.spoils.forEach((entry, i) => {
        const selected = i === this.selectedIndex;
        const label = this.add.text(
          cw / 2 - 320, startY + i * 24,
          `${selected ? "▶ " : "   "}${i + 1}. ${entry.label}`,
          txt(14, { bold: selected, color: selected ? "#ffdd66" : "#c8d2dc" }),
        ).setDepth(3);
        label.setInteractive({ useHandCursor: true });
        label.on("pointerdown", () => this.pickSpoils(i));
        this.spoilsTexts.push(label);
      });
    } else if (this.phase === "bombard") {
      this.controlsText.setText(t("siege.controls_bombard"));
    } else {
      this.controlsText.setText("");
    }
  }

  /** A curtain wall that visibly loses its crenellations as it is breached. */
  private drawFort(x: number, y: number): void {
    const fort = this.siege.fort;
    const intact = Math.max(0, Math.min(1, fort.walls / Math.max(1, fort.wallsMax)));
    const g = this.fortGfx;
    g.clear();

    const w = 120;
    const h = 66;
    g.fillStyle(0x6a6a62, 0.95).fillRect(x - w / 2, y - h / 2, w, h);
    // Crenellations disappear left to right as the walls come down, so the
    // silhouette alone tells the player how far the bombardment has got.
    const merlons = 8;
    g.fillStyle(0x7d7d73, 0.95);
    for (let i = 0; i < Math.round(merlons * intact); i++) {
      g.fillRect(x - w / 2 + 4 + i * 14, y - h / 2 - 8, 9, 9);
    }
    // Gun embrasures, one per pair of serviceable guns.
    g.fillStyle(0x141414, 0.9);
    const ports = Math.min(6, Math.ceil(fort.guns / 5));
    for (let i = 0; i < ports; i++) {
      g.fillRect(x - w / 2 + 10 + i * 18, y - 6, 10, 9);
    }
    g.lineStyle(1, 0x2b3a52, 0.9).strokeRect(x - w / 2, y - h / 2, w, h);
  }

  private drawBar(x: number, y: number, frac: number, color: number): void {
    const key = `bar_${x}_${y}`;
    let g = this.data.get(key) as Phaser.GameObjects.Graphics | undefined;
    if (!g) {
      g = this.add.graphics().setDepth(2);
      this.data.set(key, g);
    }
    const W = 150;
    const H = 10;
    const f = Math.max(0, Math.min(1, frac));
    g.clear();
    g.fillStyle(0x1a2030, 0.9).fillRect(x, y, W, H);
    g.fillStyle(color, 0.9).fillRect(x, y, W * f, H);
    g.lineStyle(1, 0x000000, 0.8).strokeRect(x, y, W, H);
  }
}
