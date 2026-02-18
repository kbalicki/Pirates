import Phaser from "phaser";
import { CommandQueue } from "./CommandQueue.ts";

const SAIL_STEP = 0.34; // sail level change per key press (~3 presses to max)
const TURN_AMOUNT = 0.04; // radians per tick while held

export class InputMapper {
  private scene: Phaser.Scene;
  private queue: CommandQueue;
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

  private currentSailLevel = 0;

  constructor(scene: Phaser.Scene, queue: CommandQueue) {
    this.scene = scene;
    this.queue = queue;

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

    // W / Up: increase sail level
    if (Phaser.Input.Keyboard.JustDown(this.keys.W) || Phaser.Input.Keyboard.JustDown(this.keys.UP)) {
      this.currentSailLevel = Math.min(1, this.currentSailLevel + SAIL_STEP);
      this.queue.push({ type: "SetSailLevel", value: this.currentSailLevel });
    }

    // S / Down: decrease sail level
    if (Phaser.Input.Keyboard.JustDown(this.keys.S) || Phaser.Input.Keyboard.JustDown(this.keys.DOWN)) {
      this.currentSailLevel = Math.max(0, this.currentSailLevel - SAIL_STEP);
      this.queue.push({ type: "SetSailLevel", value: this.currentSailLevel });
    }

    // A / Left: turn left (held)
    if (this.keys.A.isDown || this.keys.LEFT.isDown) {
      this.queue.push({ type: "Turn", dir: "left", amount: TURN_AMOUNT });
    }

    // D / Right: turn right (held)
    if (this.keys.D.isDown || this.keys.RIGHT.isDown) {
      this.queue.push({ type: "Turn", dir: "right", amount: TURN_AMOUNT });
    }
  }

  setSailLevel(level: number): void {
    this.currentSailLevel = level;
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
