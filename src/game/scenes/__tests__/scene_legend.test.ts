import { describe, it, expect } from "vitest";
import { PL } from "../../../core/i18n/locales/pl.ts";
import { EN } from "../../../core/i18n/locales/en.ts";
import {
  isLegend, promisedKeys, normaliseKey, legendEntries, digitRange, DIGIT_KEYS,
} from "../../../core/services/legendKeys.ts";

// ===========================================================================
// A key the screen answers to and never names (v0.84.0)
// ===========================================================================

/**
 * Five releases asked whether a hint line was true (v0.81.0), whether the row
 * it described was on the screen (v0.82.0) and whether it could be read at all
 * (v0.83.0). This one asks the question underneath: **is every key the screen
 * answers to on the screen.**
 *
 * It is askable because every legend in this game is written the same way —
 * the key, an em dash, what it does — which `core/services/legendKeys.ts`
 * reads. Measured on the running game by `scripts/audit-layout.mjs`, which
 * walks each scene's live keyboard registry; pinned here, where it costs
 * nothing to run.
 *
 * What it found:
 *
 * | | |
 * |---|---|
 * | the quartermaster's screen | 12 keys, a legend on **one tab of seven** |
 * | the number keys there | skipped the journal, off by one from the third tab |
 * | the battle screen | the one legend in a private notation, unreadable |
 * | `hud.controls` / `hud.controls_land` | a legend each, **no reader at all** |
 * | the defence screen | `SPACE` repeats the last salvo, unnamed |
 * | the spoils list | `1-4` pick a share, unnamed |
 *
 * And v0.96.0 the opposite: a range **named wider than the list**. `1-9` over a
 * governor with four answers, `1-4` over up to five spoils rows. A range that
 * depends on the rows is written `{{digits}}` and filled by `digitRange`.
 */

const SCENES = import.meta.glob("../*.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

const sceneName = (path: string): string => path.replace(/^.*\//, "").replace(/\.ts$/, "");

/** Keys a scene file binds, by any of the three ways this project binds them. */
function boundKeys(src: string): Set<string> {
  const keys = new Set<string>();
  for (const m of src.matchAll(/"keydown-([A-Z_]+)"/g)) keys.add(normaliseKey(m[1]));
  // `NUMBER_KEYS.forEach((name, i) => ... "keydown-" + name ...)` and the
  // assault screen's `["ONE", ...]` loop: the array literal is the binding.
  for (const m of src.matchAll(/"keydown-"\s*\+\s*(\w+)/g)) {
    // The shared list of number-row names: `DIGIT_KEYS.forEach((digit, i) =>
    // ... "keydown-" + digit ...)` or `const digit = DIGIT_KEYS[i]`.
    if (new RegExp(`\\b${m[1]}\\b[^;\\n]*DIGIT_KEYS|DIGIT_KEYS[^;\\n]*\\b${m[1]}\\b`).test(src)) {
      for (const word of DIGIT_KEYS) keys.add(normaliseKey(word));
      continue;
    }
    const list = new RegExp(`(?:const\\s+)?${m[1]}\\s*(?::[^=]+)?=\\s*\\[([^\\]]*)\\]`).exec(src);
    if (!list) continue;
    for (const word of list[1].matchAll(/"([A-Z_]+)"/g)) keys.add(normaliseKey(word[1]));
  }
  return keys;
}

/**
 * Every legend line a scene file draws, resolved through the Polish table.
 *
 * Any locale key the file names counts, not only the ones inside a literal
 * `t("...")`: `BattleHelpScene` picks between two hint keys with a variable,
 * and a scan that only saw `t("` reported it as a screen with no legend at
 * all. And a **single** `key — meaning` entry counts, because the duel writes
 * its six keys as two lines of three.
 */
function drawnLegends(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/"([\w.]+)"/g)) {
    const text = (PL as Record<string, string>)[m[1]];
    if (typeof text === "string" && legendEntries(text).length > 0) out.push(text);
  }
  return out;
}

/**
 * One key standing in for another, where the screen names one of the pair.
 *
 * A legend that spelled out every synonym would be unreadable — `W/S / ↑↓ —
 * Wybór   Enter / E — Zatwierdź` is worse for the captain than the thing it
 * documents. So the synonym is recorded here instead, which is the same
 * decision written down once rather than seven times.
 */
const SYNONYM: Record<string, string[]> = {
  UP: ["W"], DOWN: ["S"], LEFT: ["A"], RIGHT: ["D"],
  W: ["UP"], S: ["DOWN"], A: ["LEFT"], D: ["RIGHT"],
  E: ["ENTER"], ENTER: ["E"], DELETE: ["X"], X: ["DELETE"],
};

/**
 * Keys a scene binds on purpose without naming them, and why.
 *
 * Every line here is a decision, not a backlog: a screen that wants to add one
 * has to say what it is for.
 */
const UNNAMED: Record<string, { keys: string[]; why: string }> = {
  MainMapScene: {
    keys: ["C", "E", "G", "H", "L", "N", "T", "V", "X", "SPACE"],
    why: "The chart has no panel to put a legend on, and its keys are the whole "
      + "of `HelpScene`'s first page, which is what `H` opens.",
  },
  SeaBattleScene: {
    keys: ["ENTER", "SPACE"],
    why: "Dismissing the result banner, which is the only thing on the screen "
      + "when they are live and says so itself.",
  },
  CityAssaultScene: {
    keys: ["ENTER", "UP", "DOWN"],
    why: "The spoils phase names them; the bombard phase binds them before its "
      + "own legend is drawn.",
  },
  CityDefenseScene: {
    keys: ["ENTER"],
    why: "`defense.controls_done` names it once the battle has been decided, "
      + "which is the only moment it does anything.",
  },
  OptionsMenuScene: {
    keys: ["ENTER", "W", "S", "X", "DELETE", "L"],
    why: "Per-tab keys, named by the open tab's own line through `TAB_HINT` "
      + "rather than by the line that is on every tab.",
  },
  PortScene: {
    keys: ["Q", "E", "F", "R", "B", "ENTER", "BACKSPACE", "UP", "DOWN"],
    why: "Six counters with a legend each; a scan of the file cannot tell which "
      + "view a binding belongs to.",
  },
  RetirementScene: {
    keys: [],
    why: "Both keys are written on the button they work, which is the whole "
      + "screen's only control.",
  },
  DuelScene: {
    keys: [],
    why: "Two lines of three, and all six keys are on them.",
  },
};

describe("the legend notation", () => {
  it("reads a key out of every shape the game writes one in", () => {
    expect(promisedKeys("T — ognia do szalup    G — ognia do eskorty")).toEqual(["G", "T"]);
    expect(promisedKeys("W/S — Wybór   Enter — Zatwierdź   Esc — Odpłyń"))
      .toEqual(["ENTER", "ESC", "S", "W"]);
    expect(promisedKeys("↑↓ — Wybór")).toEqual(["DOWN", "UP"]);
    expect(promisedKeys("H / ESC / SPACJA / kliknij — zamknij"))
      .toEqual(["ESC", "H", "SPACE"]);
    expect(promisedKeys("A/← — poprzednia   1-5 — karta"))
      .toEqual(["1", "2", "3", "4", "5", "A", "LEFT"]);
  });

  it("does not read a key out of prose that happens to carry a dash", () => {
    // Every one of these was reported as a legend by the first draft, which
    // read the whole line instead of the token before the dash: the Polish
    // one-letter prepositions `w`, `i`, `z` are not keys.
    expect(promisedKeys("Twoja klinga znajduje lukę — przeciwnik ustępuje.")).toEqual([]);
    expect(promisedKeys("FORT — Twoje miasto — na redzie: Hiszpania")).toEqual([]);
    expect(promisedKeys("Bateria bierze eskortę — 14 dział mniej.")).toEqual([]);
    expect(isLegend("[ ENTER / SPACJA — zacznij kolejną karierę ]")).toBe(false);
  });

  it("refuses a legend written in a notation of its own", () => {
    // What `battle.controls` looked like until v0.84.0. Nothing can check a
    // promise written in a private form, which is why it went unchecked.
    expect(isLegend("WSAD: Żagle/Ster  |  Q/E: Ogień L/P  |  B: Abordaż")).toBe(false);
  });

  it("reads a range counted at draw time as the widest it can be drawn", () => {
    expect(promisedKeys("{{digits}} — odpowiedź   Esc — Wróć"))
      .toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "ESC"]);
  });

  it("counts a digit range from the rows, never past the number row", () => {
    // v0.96.0: `1-9 — answer` over four options promised five dead keys, and
    // `1-4` over five spoils rows left the fifth reachable only by the cursor.
    expect(digitRange(1)).toBe("1");
    expect(digitRange(4)).toBe("1-4");
    expect(digitRange(5)).toBe("1-5");
    expect(digitRange(12)).toBe("1-9");
    expect(digitRange(0)).toBe("1");
    expect(promisedKeys(`${digitRange(4)} — odpowiedź   Esc — Wróć`))
      .toEqual(["1", "2", "3", "4", "ESC"]);
    expect(promisedKeys(`${digitRange(1)} — odpowiedź   Esc — Wróć`)).toEqual(["1", "ESC"]);
  });

  it("reads a lone digit as a number unless the line names other keys", () => {
    // v0.96.0: the fourteen rows of the zoom setting are written `8 — Detale`,
    // and the audit read every one of them as a key the quartermaster's screen
    // promises. Only 8 and 9 were ever reported — 1-7 are bound as tab keys,
    // so the false promise was kept quiet by a true one on the line above.
    expect(promisedKeys(PL["settings.zoom.z8"])).toEqual([]);
    expect(promisedKeys(EN["settings.zoom.z8"])).toEqual([]);
    expect(promisedKeys("• Głód: dowieź żywność za 2–4× cenę.")).toEqual([]);
    // A digit among keys is a key, and a range always is.
    expect(promisedKeys("1 — odpowiedź   Esc — Wróć")).toEqual(["1", "ESC"]);
    expect(promisedKeys("1-5 — karta")).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("keeps the one-entry legends that are a screen's only announcement", () => {
    // The rule above must not take the door off a screen that names it once.
    expect(promisedKeys(PL["cityinfo.hint_close"])).toEqual(["ESC"]);
    expect(promisedKeys(PL["defense.controls_done"])).toEqual(["ENTER"]);
    expect(promisedKeys(PL["duel.controls_attack"])).toEqual(["E", "Q", "W"]);
  });

  it("counts an entry, not a dash", () => {
    expect(legendEntries("W/S — Wybór   Enter — Zatwierdź")).toHaveLength(2);
    expect(legendEntries("Kule na kotwicowisku: 4.9 kadłuba")).toHaveLength(0);
  });
});

describe("the two languages promise the same keys", () => {
  it("names the same keys in every legend", () => {
    const wrong: string[] = [];
    for (const [key, pl] of Object.entries(PL as Record<string, string>)) {
      if (typeof pl !== "string" || !isLegend(pl)) continue;
      const en = (EN as Record<string, string>)[key];
      if (typeof en !== "string") { wrong.push(`${key}: missing in EN`); continue; }
      const a = promisedKeys(pl).join(" ");
      const b = promisedKeys(en).join(" ");
      if (a !== b) wrong.push(`${key}: PL [${a}] vs EN [${b}]`);
    }
    expect(wrong, "a legend that promises a different keyboard per language").toEqual([]);
  });

  it("has a legend in the house notation on both sides", () => {
    const wrong: string[] = [];
    for (const [key, en] of Object.entries(EN as Record<string, string>)) {
      if (typeof en !== "string" || !isLegend(en)) continue;
      const pl = (PL as Record<string, string>)[key];
      if (typeof pl !== "string" || !isLegend(pl)) wrong.push(key);
    }
    expect(wrong, "a legend EN draws and PL does not").toEqual([]);
  });
});

describe("no key the screen answers to goes unnamed", () => {
  it("gives every scene that binds keys a legend to name them on", () => {
    const silent: string[] = [];
    for (const [path, src] of Object.entries(SCENES)) {
      const name = sceneName(path);
      if (boundKeys(src).size === 0) continue;
      if (name === "MainMapScene") continue;           // the chart, see UNNAMED
      if (drawnLegends(src).length === 0) silent.push(name);
    }
    expect(silent, "a scene with keys and no legend anywhere").toEqual([]);
  });

  it("names every bound key, or says in one line why not", () => {
    const missing: string[] = [];
    for (const [path, src] of Object.entries(SCENES)) {
      const name = sceneName(path);
      const bound = boundKeys(src);
      if (bound.size === 0) continue;
      const named = new Set<string>();
      for (const line of drawnLegends(src)) for (const k of promisedKeys(line)) named.add(k);
      const allowed = new Set(UNNAMED[name]?.keys ?? []);
      for (const key of bound) {
        if (named.has(key) || allowed.has(key)) continue;
        if ((SYNONYM[key] ?? []).some(alt => named.has(alt))) continue;
        missing.push(`${name}: ${key}`);
      }
    }
    expect(missing, "a key bound and never named").toEqual([]);
  });

  it("sees the number row bound through the shared list", () => {
    // Otherwise the guard above passes by not seeing the binding at all.
    const src = (name: string) => SCENES[Object.keys(SCENES).find(p => sceneName(p) === name)!];
    expect(boundKeys(src("PortScene")).has("9")).toBe(true);
    expect(boundKeys(src("CityAssaultScene")).has("5")).toBe(true);
  });

  it("keeps no exception for a key the scene does not bind", () => {
    // An allowance left behind after the key it covered was removed is a
    // silent hole in this guard. Every line in `UNNAMED` has to still be about
    // something.
    const stale: string[] = [];
    for (const [name, entry] of Object.entries(UNNAMED)) {
      const path = Object.keys(SCENES).find(p => sceneName(p) === name);
      expect(path, `UNNAMED names a scene that does not exist: ${name}`).toBeDefined();
      const bound = boundKeys(SCENES[path!]);
      for (const key of entry.keys) if (!bound.has(key)) stale.push(`${name}: ${key}`);
      expect(entry.why.length, `${name} has no reason written`).toBeGreaterThan(20);
    }
    expect(stale, "an allowance for a key nobody binds any more").toEqual([]);
  });
});

describe("the quartermaster's tabs", () => {
  it("gives every tab a number, in the order they are drawn", () => {
    const src = Object.entries(SCENES).find(([p]) => p.endsWith("OptionsMenuScene.ts"))?.[1] ?? "";
    const tabs = /const ALL_TABS: TabId\[\] = \[([^\]]*)\]/.exec(src);
    const numbers = /const NUMBER_KEYS = \[([^\]]*)\]/.exec(src);
    expect(tabs, "ALL_TABS not found").not.toBeNull();
    expect(numbers, "NUMBER_KEYS not found").not.toBeNull();
    const tabCount = [...tabs![1].matchAll(/"/g)].length / 2;
    const keyCount = [...numbers![1].matchAll(/"/g)].length / 2;
    // Seven tabs and six hand-written bindings, which had also drifted: `3`
    // opened the fourth tab because the journal had been left out of the list.
    expect(keyCount).toBe(tabCount);
    expect(src).toMatch(/NUMBER_KEYS\.forEach/);
  });
});
