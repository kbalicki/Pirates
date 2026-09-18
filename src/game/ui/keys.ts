import type Phaser from "phaser";
import { createInputGate, isKeyEvent } from "../../core/services/InputGate.ts";

/**
 * Make every key binding in a scene fire once per press (v0.78.0).
 *
 * The whole reasoning, and the trace it came from, is in
 * `core/services/InputGate.ts`. The short of it: Phaser walks its key queue
 * twice and guards against that with one remembered event, so a press with a
 * modifier held reaches every handler three times. The merchant's counter met
 * it first (Shift for ten, Ctrl for the lot) and answered with a frame-wide
 * flag of its own; this is the same answer put where all seventy-eight
 * bindings in the game can have it, instead of each screen finding out.
 *
 * Wrapping `emit` rather than each listener is deliberate: a screen keeps
 * binding keys the way it always did, and a screen written next year gets this
 * without knowing it exists.
 */
const installed = new WeakSet<object>();

export function onePressOneAction(scene: Phaser.Scene): void {
  const keyboard = scene.input?.keyboard;
  if (!keyboard || installed.has(keyboard)) return;
  installed.add(keyboard);

  const gate = createInputGate();
  const emitter = keyboard as unknown as {
    emit: (name: string | symbol, ...args: unknown[]) => boolean;
  };
  const emit = emitter.emit.bind(emitter);

  emitter.emit = (name: string | symbol, ...args: unknown[]): boolean => {
    if (typeof name === "string" && isKeyEvent(name)) {
      const event = args[0];
      if (event && typeof event === "object" && !gate(event as object, name)) return false;
    }
    return emit(name, ...args);
  };
}
