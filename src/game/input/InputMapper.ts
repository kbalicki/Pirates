import Phaser from "phaser";
import { CommandQueue } from "./CommandQueue.ts";
import type { SailSystem } from "../../core/systems/SailSystem.ts";

const TURN_AMOUNT = 0.12; // radians per tick while held

export class InputMapper {
  private scene: Phaser.Scene;
  private queue: CommandQueue;
  private sailSystem: SailSystem;
  private keys: {
    W: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    UP: Phaser.Input.Keyboard.Key;
    DOWN: Phaser.Input.Keyboard.Key;
    LEFT: Phaser.Input.Keyboard.Key;
    RIGHT: Phaser.Input.Keyboard.Key;
  } | null = null;

  /** When true, movement uses hold-to-walk instead of sail level. */
  private landed = false;

  constructor(scene: Phaser.Scene, queue: CommandQueue, sailSystem: SailSystem) {
    this.scene = scene;
    this.queue = queue;
    this.sailSystem = sailSystem;

    if (scene.input.keyboard) {
      this.keys = {
        W: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        S: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        A: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        D: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        UP: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
        DOWN: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
        LEFT: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
        RIGHT: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      };
    }
  }

  update(): void {
    if (!this.keys) return;

    if (this.landed) {
      // ---- LANDED MODE: directional walking ----
      let dx = 0, dy = 0;
      if (this.keys.W.isDown || this.keys.UP.isDown) dy -= 1;
      if (this.keys.S.isDown || this.keys.DOWN.isDown) dy += 1;
      if (this.keys.A.isDown || this.keys.LEFT.isDown) dx -= 1;
      if (this.keys.D.isDown || this.keys.RIGHT.isDown) dx += 1;

      if (dx !== 0 || dy !== 0) {
        const heading = Math.atan2(dx, -dy);
        this.queue.push({ type: "SetHeading", heading });
        this.queue.push({ type: "SetSailLevel", value: 1 });
      } else {
        this.queue.push({ type: "SetSailLevel", value: 0 });
      }
    } else {
      // ---- SAILING MODE: named sail levels via SailSystem ----
      if (Phaser.Input.Keyboard.JustDown(this.keys.W) || Phaser.Input.Keyboard.JustDown(this.keys.UP)) {
        this.sailSystem.raise();
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.S) || Phaser.Input.Keyboard.JustDown(this.keys.DOWN)) {
        this.sailSystem.lower();
      }

      // SailSystem.getCurrentValue() pushed as command by MainMapScene each frame

      // A / Left: turn left (held)
      if (this.keys.A.isDown || this.keys.LEFT.isDown) {
        this.queue.push({ type: "Turn", dir: "left", amount: TURN_AMOUNT });
      }
      // D / Right: turn right (held)
      if (this.keys.D.isDown || this.keys.RIGHT.isDown) {
        this.queue.push({ type: "Turn", dir: "right", amount: TURN_AMOUNT });
      }
    }
  }

  setLandedMode(landed: boolean): void {
    if (this.landed !== landed) {
      this.landed = landed;
      if (landed) {
        this.sailSystem.setImmediate(0);
      }
    }
  }

  setSailLevel(_level: number): void {
    // Deprecated — SailSystem handles levels now
  }

  destroy(): void {
    if (this.keys && this.scene.input.keyboard) {
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.UP);
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    }
  }
}
