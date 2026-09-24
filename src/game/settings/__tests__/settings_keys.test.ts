import { describe, it, expect, beforeEach } from "vitest";
import { isDebugMode, setDebugMode } from "../DebugSetting.ts";
import { isFogEnabled, setFogEnabled, fogOfWarActive } from "../FogSetting.ts";

// ===========================================================================
// One switch, four readers, two answers (v0.98.0)
// ===========================================================================

/**
 * `pc_debug` was read in four places and they did not agree about the case
 * that matters — **an unset key, which is what a fresh profile has**:
 *
 * | reader | unset meant |
 * |---|---|
 * | `DebugSetting.isDebugMode()` — `=== "1"` | off |
 * | `PortMarkerRenderer` — `=== "1"` | off |
 * | `OptionsMenuScene` — `raw === null ? true : …` | **on** |
 * | `MainMapScene` — `!== "0"` | **on** |
 *
 * The chart's copy ran every frame as `fogOfWarEnabled = debugMode ? false :
 * fogSetting`, so on a new install debug counted as on and **fog of war could
 * never appear at all**. The `Spyglass range` toggle wrote `pc_fog` and the
 * next frame threw it away; `V` was undone before it was drawn, so the toast
 * it printed — in English, which is how the key was found at all — was the
 * whole of its visible behaviour. The only route to the feature was to toggle
 * Debug in the options, because that writes the literal `"0"` that `!== "0"`
 * needs.
 *
 * It is v0.97.0.0's zoom again: a setting written by a screen and taken back
 * by the frame loop. The cure is the same — one module owns the key, the key
 * toggles the **setting**, and the loop derives from it.
 */

/**
 * A `localStorage` that starts out as a fresh profile does: empty.
 *
 * Node has none, and both modules wrap their access in try/catch, so without
 * this the whole file would pass by storing nothing and reading `false` — a
 * green suite that proves the opposite of what it says.
 */
const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
});

beforeEach(() => localStorage.clear());

describe("an unset key means off", () => {
  it("says debug is off on a fresh profile", () => {
    expect(localStorage.getItem("pc_debug")).toBeNull();
    expect(isDebugMode()).toBe(false);
  });

  it("says the fog setting is off on a fresh profile", () => {
    expect(isFogEnabled()).toBe(false);
  });

  it("lets the chart draw fog on a fresh profile once it is asked for", () => {
    // The whole defect in one line: this was false whatever the player did.
    setFogEnabled(true);
    expect(fogOfWarActive()).toBe(true);
  });
});

describe("the setting survives being set", () => {
  it("round-trips both ways", () => {
    setFogEnabled(true);
    expect(isFogEnabled()).toBe(true);
    setFogEnabled(false);
    expect(isFogEnabled()).toBe(false);
    setDebugMode(true);
    expect(isDebugMode()).toBe(true);
    setDebugMode(false);
    expect(isDebugMode()).toBe(false);
  });

  it("writes only the two spellings its readers know", () => {
    setDebugMode(true);
    expect(localStorage.getItem("pc_debug")).toBe("1");
    setDebugMode(false);
    expect(localStorage.getItem("pc_debug")).toBe("0");
  });
});

describe("debug reveals the map, and says so", () => {
  it("wins over the setting", () => {
    setFogEnabled(true);
    setDebugMode(true);
    expect(isFogEnabled()).toBe(true);        // what he asked for
    expect(fogOfWarActive()).toBe(false);     // what he gets
  });

  it("leaves the setting alone while it wins", () => {
    // So that turning debug off gives him back the fog he asked for, rather
    // than a setting something else has quietly overwritten.
    setFogEnabled(true);
    setDebugMode(true);
    setDebugMode(false);
    expect(fogOfWarActive()).toBe(true);
  });
});

// ---------------------------------------------------------------------------

const GAME = import.meta.glob("../../**/*.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

const prod = Object.entries(GAME).filter(([p]) => !p.includes("__tests__"));

describe("one module owns each stored switch", () => {
  it("reads the whole of src/game", () => {
    expect(prod.length).toBeGreaterThan(40);
    expect(prod.some(([p]) => p.endsWith("/MainMapScene.ts"))).toBe(true);
  });

  for (const [key, owner] of [["pc_debug", "DebugSetting.ts"], ["pc_fog", "FogSetting.ts"]] as const) {
    it(`touches ${key} only in ${owner}`, () => {
      const elsewhere = prod
        .filter(([p]) => !p.endsWith(`/${owner}`))
        .filter(([, s]) => new RegExp(`localStorage\\.(get|set)Item\\(\\s*["']${key}["']`).test(s))
        .map(([p]) => p);
      expect(elsewhere, `these read or write ${key} behind ${owner}'s back`).toEqual([]);
    });
  }

  it("keeps the chart deriving rather than being written", () => {
    // `V` used to assign `worldRenderer.fogOfWarEnabled` directly, which the
    // next frame overwrote. Only the derivation may assign it now.
    const chart = prod.find(([p]) => p.endsWith("/MainMapScene.ts"))![1];
    const writes = chart.split("\n").filter(l => /fogOfWarEnabled\s*=/.test(l));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("fogOfWarActive()");
  });
});
