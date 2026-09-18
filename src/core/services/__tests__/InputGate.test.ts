import { describe, it, expect } from "vitest";
import { createInputGate, isKeyEvent } from "../InputGate.ts";

// ===========================================================================
// One press, one action (v0.78.0)
// ===========================================================================

/**
 * v0.76.0 measured a single DOM `keydown` reaching the merchant's buy handler
 * three times with exactly one listener registered, and gated that one screen.
 * The note it left said every other screen with an action on Enter must be in
 * the same danger. Measured on the built game, it is not:
 *
 * | press | DOM keydowns | handler calls |
 * |---|---|---|
 * | `Enter` | 1 | **1** |
 * | `Shift`+`Enter` | 2 | **3** |
 * | `Ctrl`+`Enter` | 2 | **3** |
 *
 * Phaser walks its key queue twice — once immediately from `MANAGER_PROCESS`,
 * once on the frame step, and it is only emptied on `POST_STEP` — and guards
 * against that with a **single remembered event** (`prevCode`, `prevTime`,
 * `prevType`). One slot catches a lone key walked twice. It never catches an
 * alternating pair, which is exactly what holding a modifier makes.
 *
 * So the rule is not "Phaser fires handlers several times"; it is **the
 * duplicate guard remembers one event, and a modifier makes two**. The gate
 * below remembers the event object instead, which is exact.
 */

/** Stands in for a DOM `KeyboardEvent`: identity is all the gate uses. */
function press(key: string): object {
  return { key, type: "keydown" };
}

describe("a press is delivered once", () => {
  it("passes the first time and refuses the second", () => {
    const gate = createInputGate();
    const enter = press("Enter");
    expect(gate(enter, "keydown-ENTER")).toBe(true);
    expect(gate(enter, "keydown-ENTER")).toBe(false);
    expect(gate(enter, "keydown-ENTER")).toBe(false);
  });

  it("holds the alternating pair a modifier makes, which the one-slot guard did not", () => {
    // Shift, Enter, Shift, Enter, Shift, Enter — the trace off the built game.
    const gate = createInputGate();
    const shift = press("Shift");
    const enter = press("Enter");
    const delivered: string[] = [];
    for (const [event, name] of [
      [shift, "keydown-SHIFT"], [enter, "keydown-ENTER"],
      [shift, "keydown-SHIFT"], [enter, "keydown-ENTER"],
      [shift, "keydown-SHIFT"], [enter, "keydown-ENTER"],
    ] as [object, string][]) {
      if (gate(event, name)) delivered.push(name);
    }
    expect(delivered).toEqual(["keydown-SHIFT", "keydown-ENTER"]);
  });

  it("still lets a held key repeat, because the browser makes a new event each time", () => {
    const gate = createInputGate();
    expect(gate(press("ArrowDown"), "keydown-DOWN")).toBe(true);
    expect(gate(press("ArrowDown"), "keydown-DOWN")).toBe(true);
    expect(gate(press("ArrowDown"), "keydown-DOWN")).toBe(true);
  });

  it("keeps one press's names apart, so down and up are both delivered", () => {
    const gate = createInputGate();
    const enter = press("Enter");
    expect(gate(enter, "keydown-ENTER")).toBe(true);
    expect(gate(enter, "keydown")).toBe(true);
    expect(gate(enter, "keydown-ENTER")).toBe(false);
  });

  it("passes anything raised by hand, with no event to key on", () => {
    const gate = createInputGate();
    expect(gate(undefined, "keydown-ENTER")).toBe(true);
    expect(gate(undefined, "keydown-ENTER")).toBe(true);
  });

  it("keeps two gates independent, so one scene cannot swallow another's press", () => {
    const a = createInputGate();
    const b = createInputGate();
    const enter = press("Enter");
    expect(a(enter, "keydown-ENTER")).toBe(true);
    expect(b(enter, "keydown-ENTER")).toBe(true);
  });
});

describe("the gate knows which emissions are presses", () => {
  it("takes the key events and nothing else", () => {
    for (const name of ["keydown", "keyup", "keydown-ENTER", "keyup-ESC", "keydown-SHIFT"]) {
      expect(isKeyEvent(name), name).toBe(true);
    }
    for (const name of ["pointerdown", "update", "keydownsomething", "shutdown", "keyboardcapture"]) {
      expect(isKeyEvent(name), name).toBe(false);
    }
  });
});
