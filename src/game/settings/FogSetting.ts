/**
 * FogSetting — whether the chart hides what the spyglass cannot reach.
 *
 * Two questions, kept apart on purpose:
 *
 * - `isFogEnabled()` is **the player's setting**, the one the quartermaster's
 *   screen writes and the `V` key toggles;
 * - `fogOfWarActive()` is **what the chart draws**, which is the setting unless
 *   debug mode is revealing everything.
 *
 * ## Why this file exists (v0.98.0)
 *
 * `pc_debug` had four readers and they gave two different answers for an unset
 * key — which is what a fresh profile has:
 *
 * | reader | unset meant |
 * |---|---|
 * | `DebugSetting.isDebugMode()` — `=== "1"` | off |
 * | `PortMarkerRenderer.ts` — `=== "1"` | off |
 * | `OptionsMenuScene` — `raw === null ? true : …` | **on** |
 * | `MainMapScene` — `!== "0"` | **on** |
 *
 * The chart's copy ran every frame as `fogOfWarEnabled = debugMode ? false :
 * fogSetting`, so on a new install debug counted as on and **fog of war could
 * never appear at all**: the `Spyglass range` toggle wrote `pc_fog` and the
 * next frame threw it away, and `V` was undone before it was drawn — the toast
 * it printed was the whole of its visible behaviour. The only way to the
 * feature was to toggle Debug in the options, because that writes the literal
 * `"0"` that `!== "0"` needs.
 *
 * The shape is v0.97.0.0's zoom exactly: **a setting written by a screen and
 * taken back by the frame loop.** The cure is the same — the key toggles the
 * setting, the loop derives from the setting, and one function answers the
 * question for everybody.
 */

import { isDebugMode } from "./DebugSetting.ts";

const STORAGE_KEY = "pc_fog";

/** The player's setting. An unset key means off, as it does everywhere else. */
export function isFogEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setFogEnabled(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // localStorage unavailable
  }
}

/**
 * What the chart actually draws.
 *
 * Debug mode reveals the whole map, which is the point of it, so it wins over
 * the setting — but it says so rather than silently making the setting look
 * broken (`map.fog_debug`).
 */
export function fogOfWarActive(): boolean {
  return !isDebugMode() && isFogEnabled();
}
