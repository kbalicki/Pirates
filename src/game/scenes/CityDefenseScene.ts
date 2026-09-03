import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import { PORTS } from "../../core/data/ports.ts";
import { FACTIONS } from "../../core/data/factions.ts";
import { t } from "../../core/i18n/index.ts";
import { txt } from "../ui/textStyle.ts";
import type { AttackForce } from "../../core/systems/SiegeSystem.ts";
import type { PendingDefense } from "../../core/systems/ReconquestSystem.ts";
import {
  createDefense,
  defenseRound,
  resolveDefenseAssault,
  defenseOdds,
  landableMen,
  landMen,
  fleetGuns,
  applyDefenseOutcome,
  abandonDefense,
  type DefenseState,
  type DefenseTarget,
} from "../../core/systems/CityDefenseSystem.ts";

/**
 * CityDefenseScene — `CityAssaultScene` with the player on the other side.
 *
 * Same shape on purpose: three bars, a running log, a keyboard. A player who
 * has stormed a town once already knows how to read this screen, and the
 * symmetry is the point — the fort that cost him eight rounds of hull is the
 * fort he is standing in now.
 *
 * The arithmetic is all in `core/systems/CityDefenseSystem.ts`. What this file
 * owns is the pacing: a round per keypress while the squadron is standing in,
 * then a wave a second once the boats are in the water, because the outcome is
 * already decided by then and what is left is the telling of it.
 *
 *   bombard   T fires on the boats, G on the escorts, L mans the walls,
 *             ESC cuts the cables and leaves the town to it
 *   assault   plays itself out
 *   done      Enter, and back to the map
 *
 * There is no "one more round" available at the end: the squadron decides when
 * it has waited long enough, and that is the pressure the screen is built
 * around.
 */
export class CityDefenseScene extends Phaser.Scene {
  private worldState!: WorldState;
  private pending!: PendingDefense;
  private state!: DefenseState;
  /** The fleet as it stood before the first shot, for splitting the bill. */
  private initialForce!: AttackForce;
  /** Hands aboard at the start, the divisor for how well the ships still shoot. */
  private crewStart = 1;
  private phase: "bombard" | "assault" | "done" | "closed" = "bombard";
  private busy = false;
  private lastTarget: DefenseTarget = "transports";
  /**
   * Men on the walls the moment the boats grounded.
   *
   * The wave loop writes casualties straight into `this.state` so the bars keep
   * telling the truth while they play out, which leaves nothing to divide the
   * survivors against afterwards. `splitTownLosses` needs the before and the
   * after, so the before is kept here.
   */
  private soldiersAtLanding = 0;

  private log: string[] = [];
  private logText!: Phaser.GameObjects.Text;
  private squadronText!: Phaser.GameObjects.Text;
  private fortText!: Phaser.GameObjects.Text;
  private fleetText!: Phaser.GameObjects.Text;
  private oddsText!: Phaser.GameObjects.Text;
  private controlsText!: Phaser.GameObjects.Text;
  private sceneGfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: "CityDefenseScene" });
  }

  init(data: { worldState: WorldState; pending: PendingDefense }): void {
    this.worldState = data.worldState;
    this.pending = data.pending;
    this.state = createDefense(this.worldState, this.pending);
    this.initialForce = this.state.force;
    this.crewStart = Math.max(1, this.state.force.crew);
    this.phase = "bombard";
    this.busy = false;
    this.lastTarget = "transports";
    this.soldiersAtLanding = 0;
    this.log = [];
  }

  create(): void {
    // The map's fixed overlay — compass, date, sail readout — is a separate
    // always-on scene, and a `scene.start` from inside `MainMapScene.update`
    // does not reliably take it down with the map. Left running it draws a
    // wind rose over a land battle. Restarting the map relaunches it.
    if (this.scene.isActive("UIOverlayScene")) this.scene.stop("UIOverlayScene");

    const cw = this.cameras.main.width;
    const ch = this.cameras.main.height;
    const def = PORTS[this.state.portKey];
    const claimantColor = FACTIONS[this.state.claimant]?.color ?? 0xaaaaaa;

    this.cameras.main.setBackgroundColor("#0a1420");
    this.add.rectangle(0, 0, cw, ch, 0x0a1420, 1).setOrigin(0).setDepth(0);

    this.add.text(cw / 2, 24, t("defense.title", { port: t("port." + this.state.portKey + ".name") }),
      txt(24, { bold: true, color: "#ffdd66" })).setOrigin(0.5, 0).setDepth(2);

    const subtitle = this.state.allied
      ? t("defense.sub_ally", {
          holder: t("faction." + this.state.holder + ".name"),
          faction: t("faction." + this.state.claimant + ".name"),
        })
      : t("defense.sub_own", { faction: t("faction." + this.state.claimant + ".name") });
    this.add.text(cw / 2, 58, `${t("port_type." + def.type)} — ${subtitle}`,
      txt(13, { color: `#${claimantColor.toString(16).padStart(6, "0")}` }))
      .setOrigin(0.5, 0).setDepth(2);

    // The squadron offshore and the wall it is shooting at, drawn once and
    // redrawn as either of them comes apart.
    this.sceneGfx = this.add.graphics().setDepth(1);

    this.panel(cw / 2, 152, 700, 78);
    this.squadronText = this.add.text(cw / 2 - 330, 126, "", txt(14, { color: "#ffcccc" })).setDepth(2);

    this.panel(cw / 2, 262, 700, 108);
    this.fortText = this.add.text(cw / 2 - 330, 220, "", txt(14, { color: "#ccffcc" })).setDepth(2);

    this.panel(cw / 2, 372, 700, 86);
    this.fleetText = this.add.text(cw / 2 - 330, 340, "", txt(14, { color: "#cce0ff" })).setDepth(2);

    this.oddsText = this.add.text(cw / 2, 424, "", txt(13, { color: "#ffdd99" }))
      .setOrigin(0.5, 0).setDepth(2);

    this.panel(cw / 2, ch - 150, 700, 150);
    this.logText = this.add.text(cw / 2 - 330, ch - 220, "", txt(12, { color: "#c8d2dc" })).setDepth(2);

    this.controlsText = this.add.text(cw / 2, ch - 48, "", txt(13, { color: "#99aabb" }))
      .setOrigin(0.5, 0).setDepth(2);

    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-T", () => this.onFire("transports"));
      this.input.keyboard.on("keydown-G", () => this.onFire("escorts"));
      this.input.keyboard.on("keydown-SPACE", () => this.onFire(this.lastTarget));
      this.input.keyboard.on("keydown-L", () => this.onLand());
      this.input.keyboard.on("keydown-ESC", () => this.onAbandon());
      this.input.keyboard.on("keydown-ENTER", () => this.onConfirm());
    }

    this.pushLog(t("defense.log_open", {
      soldiers: this.state.squadron.soldiers,
      guns: this.state.squadron.guns,
      walls: Math.round(this.state.fort.walls),
    }));
    this.redraw();
  }

  private panel(cx: number, cy: number, w: number, h: number): void {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x0d1a2a, 0.96).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 10);
    g.lineStyle(1, 0x2b3a52, 0.9).strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 10);
  }

  // ── The bombardment ─────────────────────────────────────

  private onFire(target: DefenseTarget): void {
    if (this.phase !== "bombard" || this.busy) return;
    this.lastTarget = target;

    const round = defenseRound(this.state, target, this.worldState.rng, this.crewStart);
    this.state = round.state;
    this.worldState = { ...this.worldState, rng: round.rng };

    if (target === "transports") {
      this.pushLog(round.soldiersDrowned > 0
        ? t("defense.log_transports", { men: round.soldiersDrowned })
        : t("defense.log_shore_silent"));
    } else {
      this.pushLog(round.squadronGunsSilenced > 0
        ? t("defense.log_escorts", { guns: round.squadronGunsSilenced })
        : t("defense.log_shore_silent"));
    }

    this.pushLog(t("defense.log_squadron_fire", {
      walls: round.wallsBreached.toFixed(1),
      guns: round.fortGunsLost.toFixed(1),
    }));
    if (round.hullLost > 0 || round.crewLost > 0) {
      this.pushLog(t("defense.log_fleet_hit", {
        hull: round.hullLost.toFixed(1),
        crew: round.crewLost,
      }));
    }
    if (round.fleetDriven) this.pushLog(t("defense.log_fleet_driven"));

    // Nothing left in the transports is a win without a beach: the expedition
    // is over before it grounds a single boat.
    if (round.squadronBroken) {
      // Lock the keyboard here and not only in `settle`: the outcome is on a
      // delay so the last line can be read, and without the lock the player
      // could fire two more rounds into an expedition that no longer exists.
      this.busy = true;
      this.pushLog(t("defense.log_squadron_broken"));
      this.redraw();
      this.soldiersAtLanding = this.state.fort.soldiers;
      this.time.delayedCall(1200, () => this.settle(true, this.state.fort.soldiers));
      return;
    }

    if (round.landing) {
      this.startAssault();
      return;
    }
    this.redraw();
  }

  // ── Manning the walls ───────────────────────────────────

  private onLand(): void {
    if (this.phase !== "bombard" || this.busy) return;
    const men = landableMen(this.state);
    if (men <= 0) {
      this.pushLog(t("defense.log_no_men"));
      this.redraw();
      return;
    }
    this.state = landMen(this.state);
    this.pushLog(t("defense.log_landed", { men }));
    this.redraw();
  }

  // ── Cutting and running ─────────────────────────────────

  private onAbandon(): void {
    if (this.phase !== "bombard" || this.busy) return;
    this.phase = "assault";
    this.busy = true;
    this.pushLog(t("defense.log_abandon"));

    const { outcome, rng } = abandonDefense(
      this.worldState, this.state, this.initialForce, this.worldState.rng,
    );
    this.worldState = { ...outcome.world, rng };
    this.pushLog(outcome.held ? t("defense.log_held") : t("defense.log_lost", {
      port: t("port." + this.state.portKey + ".name"),
    }));
    this.phase = "done";
    this.redraw();
    this.time.delayedCall(2000, () => this.finish());
  }

  // ── The beach ───────────────────────────────────────────

  private startAssault(): void {
    this.phase = "assault";
    this.busy = true;
    this.soldiersAtLanding = this.state.fort.soldiers;
    this.pushLog(t("defense.log_boats", { men: this.state.squadron.soldiers }));

    const result = resolveDefenseAssault(this.state, this.worldState.rng);
    this.worldState = { ...this.worldState, rng: result.rng };
    // Fold the casualties into the state as the waves are told, so the readouts
    // keep telling the truth and `applyDefenseOutcome` sees the same numbers.
    this.state = {
      ...this.state,
      phase: "assault",
      fort: { ...this.state.fort, soldiers: Math.max(0, this.state.fort.soldiers - result.townLosses) },
      squadron: {
        ...this.state.squadron,
        soldiers: Math.max(0, this.state.squadron.soldiers - result.landingLosses),
      },
    };

    result.waves.forEach((wave, i) => {
      this.time.delayedCall(700 * (i + 1), () => {
        this.pushLog(t("defense.log_wave", {
          n: i + 1,
          ours: wave.townLosses,
          theirs: wave.landingLosses,
          left: wave.townLeft,
        }));
        this.redraw();
      });
    });

    this.time.delayedCall(700 * (result.waves.length + 1), () => {
      this.pushLog(result.held
        ? t("defense.log_held")
        : t("defense.log_lost", { port: t("port." + this.state.portKey + ".name") }));
      this.redraw();
      this.time.delayedCall(1000, () => this.settle(result.held, result.townLeft));
    });
    this.redraw();
  }

  // ── Endings ─────────────────────────────────────────────

  private settle(held: boolean, townLeft: number): void {
    if (this.phase === "done" || this.phase === "closed") return;
    // `splitTownLosses` divides the survivors against the men who were on the
    // walls when the boats grounded, so it gets that snapshot rather than the
    // state the wave loop has already whittled down.
    const outcome = applyDefenseOutcome(
      this.worldState,
      { ...this.state, fort: { ...this.state.fort, soldiers: this.soldiersAtLanding } },
      this.initialForce,
      held,
      townLeft,
    );
    this.worldState = outcome.world;
    if (outcome.gold > 0) this.pushLog(t("defense.log_gold", { gold: outcome.gold }));
    if (held && this.state.allied) {
      this.pushLog(t("defense.log_ally_reward", {
        faction: t("faction." + this.state.holder + ".name"),
      }));
    }
    this.phase = "done";
    this.redraw();
  }

  private onConfirm(): void {
    if (this.phase !== "done") return;
    this.finish();
  }

  private finish(): void {
    if (this.phase === "closed") return;
    this.phase = "closed";
    this.registry.set("worldState", this.worldState);
    this.scene.start("MainMapScene", { worldState: this.worldState });
  }

  // ── Drawing ─────────────────────────────────────────────

  private pushLog(line: string): void {
    this.log.push(line);
    if (this.log.length > 6) this.log.shift();
  }

  private redraw(): void {
    const cw = this.cameras.main.width;
    const { fort, squadron, force } = this.state;

    this.squadronText.setText([
      t("defense.squadron_soldiers", { now: squadron.soldiers, max: squadron.soldiersMax }),
      t("defense.squadron_guns", { now: squadron.guns, max: squadron.gunsMax }),
    ].join("\n"));

    this.fortText.setText([
      t("siege.fort_walls", { now: Math.round(fort.walls), max: Math.round(fort.wallsMax) }),
      t("siege.fort_guns", { now: fort.guns, max: fort.gunsMax }),
      t("siege.fort_soldiers", { n: fort.soldiers }),
    ].join("\n"));

    this.fleetText.setText([
      t("siege.fleet_hull", { now: Math.round(force.hullHp), max: Math.round(force.hullMax) }),
      // Guns the ships can actually work, not guns they own: landing the party
      // takes the men off those guns, and a readout that ignored that would
      // hide the whole cost of the decision.
      t("siege.fleet_crew", { now: force.crew, guns: fleetGuns(this.state, this.crewStart) }),
    ].join("\n"));

    this.drawScene(cw / 2 + 275, 262);
    this.drawBar(cw / 2 + 20, 132, squadron.soldiers / Math.max(1, squadron.soldiersMax), 0xcc7744);
    this.drawBar(cw / 2 + 20, 152, squadron.guns / Math.max(1, squadron.gunsMax), 0xcc5544);
    this.drawBar(cw / 2 + 20, 228, fort.walls / Math.max(1, fort.wallsMax), 0xbb8855);
    this.drawBar(cw / 2 + 20, 248, fort.guns / Math.max(1, fort.gunsMax), 0x66aa77);
    this.drawBar(cw / 2 + 20, 268, fort.soldiers / Math.max(1, fort.soldiersMax), 0x88cc88);
    this.drawBar(cw / 2 + 20, 350, force.hullHp / Math.max(1, force.hullMax), 0x4488cc);
    this.drawBar(cw / 2 + 20, 370, force.crew / Math.max(1, force.crewMax), 0x6688cc);

    this.oddsText.setText(this.phase === "bombard"
      ? t("defense.odds", {
          pct: Math.round(defenseOdds(this.state) * 100),
          soldiers: squadron.soldiers,
        })
      : "");

    this.logText.setText(this.log.join("\n"));

    if (this.phase === "bombard") {
      const men = landableMen(this.state);
      this.controlsText.setText(men > 0
        ? t("defense.controls", { men })
        : t("defense.controls_committed"));
    } else if (this.phase === "done") {
      this.controlsText.setText(t("defense.controls_done"));
    } else {
      this.controlsText.setText("");
    }
  }

  /**
   * The wall in the foreground and the squadron standing in behind it.
   *
   * Mirror of `CityAssaultScene.drawFort`: crenellations disappear as the walls
   * come down, and here the hulls offshore thin out as the escort is silenced —
   * so the silhouette alone says which way the exchange is going.
   */
  private drawScene(x: number, y: number): void {
    const { fort, squadron } = this.state;
    const intact = Math.max(0, Math.min(1, fort.walls / Math.max(1, fort.wallsMax)));
    const g = this.sceneGfx;
    g.clear();

    // Sails on the horizon, one per handful of surviving escort guns.
    const sails = Math.min(6, Math.max(squadron.soldiers > 0 ? 1 : 0, Math.ceil(squadron.guns / 6)));
    g.fillStyle(0xd8d8d0, 0.9);
    for (let i = 0; i < sails; i++) {
      const sx = x - 66 + i * 24;
      g.fillTriangle(sx, y - 60, sx - 7, y - 40, sx + 7, y - 40);
    }
    g.fillStyle(0x3a3a34, 0.9);
    for (let i = 0; i < sails; i++) {
      g.fillRect(x - 66 + (i * 24) - 9, y - 40, 18, 5);
    }

    const w = 120;
    const h = 48;
    const top = y - h / 2 + 16;
    g.fillStyle(0x6a6a62, 0.95).fillRect(x - w / 2, top, w, h);
    const merlons = 8;
    g.fillStyle(0x7d7d73, 0.95);
    for (let i = 0; i < Math.round(merlons * intact); i++) {
      g.fillRect(x - w / 2 + 4 + i * 14, top - 8, 9, 9);
    }
    g.fillStyle(0x141414, 0.9);
    const ports = Math.min(6, Math.ceil(fort.guns / 5));
    for (let i = 0; i < ports; i++) {
      g.fillRect(x - w / 2 + 10 + i * 18, top + 20, 10, 9);
    }
    g.lineStyle(1, 0x2b3a52, 0.9).strokeRect(x - w / 2, top, w, h);
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
