/**
 * One press, one action (v0.78.0).
 *
 * v0.76.0 measured a single DOM `keydown` reaching the merchant's buy handler
 * **three times**, one to two milliseconds apart, with `listenerCount` reporting
 * exactly one listener, and gated that one screen with a frame-wide flag. The
 * note it left said the same thing must be happening on every other screen with
 * an action on Enter. It is not, and the measurement says why.
 *
 * A plain press arrives **once**. A press with a modifier held arrives
 * **three times**. Traced on the built game:
 *
 * ```
 * DOM  Shift  t=8603.7          -> keydown-SHIFT  t=8603.7
 * DOM  Enter  t=8604.8          -> keydown-ENTER  t=8604.8
 *                                  keydown-SHIFT  t=8603.7   (again)
 *                                  keydown-ENTER  t=8604.8   (again)
 *                                  keydown-SHIFT  t=8603.7   (again)
 *                                  keydown-ENTER  t=8604.8   (again)
 * ```
 *
 * Two things in Phaser meet. `KeyboardManager.onKeyDown` pushes the event onto
 * a queue **and** emits `MANAGER_PROCESS`, so the queue is walked once
 * immediately and again on the frame step; it is only emptied on `POST_STEP`.
 * And `KeyboardPlugin.update` guards against that with a **single slot** —
 * `prevCode`, `prevTime`, `prevType` — which catches a lone key walked twice
 * and never catches an alternating pair, because after Shift the slot no longer
 * holds Enter and after Enter it no longer holds Shift.
 *
 * So the defect is not "Phaser fires handlers several times". It is: **the
 * duplicate guard remembers one event, and a modifier makes two.** Which is
 * also why the shipyard, the recruiter and the division of plunder were never
 * at risk — they bind no modified key.
 *
 * The gate here remembers the event **object**, not a code and a timestamp, so
 * it is exact: the same DOM event delivered twice under the same name is
 * delivered once. A held key still repeats, because the browser makes a new
 * event for every repeat.
 */

export type InputGate = (event: object | undefined, name: string) => boolean;

/**
 * A gate that passes each (event, name) pair exactly once.
 *
 * Returns `true` when the caller should deliver, `false` when this pair has
 * already been delivered. An absent event is always passed: something raised it
 * by hand and there is nothing to key on.
 *
 * The map is weak, so an event object the browser has finished with takes its
 * entry with it and nothing has to be swept.
 */
export function createInputGate(): InputGate {
  const seen = new WeakMap<object, Set<string>>();
  return (event, name) => {
    if (!event) return true;
    let names = seen.get(event);
    if (!names) {
      names = new Set<string>();
      seen.set(event, names);
    }
    if (names.has(name)) return false;
    names.add(name);
    return true;
  };
}

/** Whether an emitted event name is a key press this gate is for. */
export function isKeyEvent(name: string): boolean {
  return name === "keydown" || name === "keyup"
    || name.startsWith("keydown-") || name.startsWith("keyup-");
}
