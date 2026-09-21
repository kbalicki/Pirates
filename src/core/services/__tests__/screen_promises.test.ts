import { describe, it, expect } from "vitest";
import { EN } from "../../i18n/locales/en.ts";

// ===========================================================================
// A promise on the screen is a claim about the code (v0.81.0)
// ===========================================================================

/**
 * v0.80.0 found three lists printing *"up/down — Select"* that had never
 * selected anything, and left a question in the handoff: could a test have
 * caught it by reading the hint lines against the key bindings?
 *
 * **Measured: no, and the measurement is the finding.** Thirty-five strings in
 * the table are hints; fourteen of them name a key. Scanned against every
 * `keydown-*` binding in the scene that draws them, **four** came back as
 * promises nothing binds, and all four are the scanner misreading English —
 * *"Enter your name, Captain"*, *"Fire L/R broadside"*. The real count of
 * unbound promises is **zero**, and has been all along: v0.80.0's three lists
 * bound their arrow keys perfectly well. The binding existed and did nothing.
 *
 * So a source scan is the wrong instrument for this family, and that is worth
 * writing down once rather than discovering twice. What a source scan **can**
 * hold is the narrower shape this release did find: a hint naming a key that
 * the scene binds **to something else**. The quartermaster's `sound.hint` has
 * promised the arrows since it was written, above a pair of bindings for `A`
 * and `D` and a comment that said *"left/right adjust volume"* — so pressing
 * an arrow turned the page instead. The comment described the intention and
 * was read as a description of the code, which is exactly v0.79.0's lesson
 * from `VillageSystem`.
 *
 * The two checks below are what is left after that measurement: the hints that
 * name a key must still name one the scene knows, and no screen may draw
 * itself from a promise that resolves after it has been left.
 */

const SCENES = import.meta.glob("../../../game/scenes/*.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

/** How a hint writes a key, against what a binding calls it. */
const TOKENS: [RegExp, string[]][] = [
  [/↑↓/, ["UP", "DOWN"]],
  [/←→|← →/, ["LEFT", "RIGHT"]],
  [/\bup\/down\b/, ["UP", "DOWN"]],
  [/\bW\/S\b/, ["W", "S"]],
  [/\bEnter\b|\bENTER\b/, ["ENTER"]],
  [/\bEsc\b|\bESC\b/, ["ESC"]],
  [/\bTab\b/, ["TAB"]],
  [/\bSPACE\b/, ["SPACE"]],
  [/\bBackspace\b/, ["BACKSPACE"]],
  [/\bDelete\b/, ["DELETE"]],
];

/**
 * A group of keys being offered: `W/S`, `Q / E / R`, `F`, each of them run up
 * against the dash or colon that introduces what it does.
 *
 * The trailing punctuation is what does the work. Without it `L` and `R` of
 * *"Fire L/R broadside"* read as keys, and so does the first word of *"Enter
 * your name, Captain"* — the two things that make a scan of this kind look
 * like it has found something when it has not.
 */
const OFFERED = /(?:^|[\s([])([A-Za-z]+(?:\s*\/\s*[A-Za-z0-9]+)*)\s*(?=[—:]|\s[—-]\s)/g;

function keysNamed(text: string): Set<string> {
  const out = new Set<string>();
  for (const [pattern, names] of TOKENS) {
    if (pattern.test(text)) for (const n of names) out.add(n);
  }
  for (const m of text.matchAll(OFFERED)) {
    for (const word of m[1].split("/")) {
      const w = word.trim();
      // One letter, or a name a binding would use. A whole word is prose.
      if (/^[A-Z]$/.test(w)) out.add(w);
      else if (/^(?:ESC|ENTER|SPACE|TAB|DELETE|BACKSPACE)$/i.test(w)) out.add(w.toUpperCase());
    }
  }
  // Modifiers are read off the event, not bound.
  out.delete("SHIFT");
  out.delete("CTRL");
  return out;
}

describe("a hint that names a key names one the scene knows", () => {
  it("promises nothing no scene binds", () => {
    const offenders: string[] = [];
    for (const [path, src] of Object.entries(SCENES)) {
      const bound = new Set([...src.matchAll(/keydown-([A-Z_]+)"/g)].map(m => m[1]));
      // A scene may read `event.key` instead of binding by name — character
      // creation does — so those spellings count as bindings too.
      for (const m of src.matchAll(/key === "(\w+)"/g)) {
        const name = m[1].replace(/^Arrow/, "").toUpperCase();
        bound.add(name === "ESCAPE" ? "ESC" : name);
      }
      if (bound.size === 0) continue;
      for (const m of src.matchAll(/t\("([\w.]+)"\)/g)) {
        const text = (EN as Record<string, string>)[m[1]];
        if (typeof text !== "string") continue;
        const named = keysNamed(text);
        if (named.size === 0) continue;
        for (const key of named) {
          if (!bound.has(key)) {
            offenders.push(`${path.replace(/^.*\/scenes\//, "")}: ${m[1]} promises ${key}`);
          }
        }
      }
    }
    expect(offenders, "a hint line is a claim about the code").toEqual([]);
  });

  it("gives the quartermaster the arrows his own hint offers", () => {
    const src = Object.entries(SCENES).find(([p]) => p.includes("OptionsMenuScene"))?.[1] ?? "";
    expect(src, "OptionsMenuScene not found").not.toBe("");
    // `sound.hint` says "use ← → keys". Until v0.81.0 the only bindings near
    // `adjustVolume` were `A` and `D`, under a comment claiming the arrows.
    expect(src).toMatch(/bindTabKey\("keydown-LEFT", \(\) => adjustVolume/);
    expect(src).toMatch(/bindTabKey\("keydown-RIGHT", \(\) => adjustVolume/);
    expect((EN as Record<string, string>)["sound.hint"]).toMatch(/←|→/);
  });
});

describe("nothing draws a screen it has already left", () => {
  it("checks it is still on the same tab before painting an awaited result", () => {
    // The save tab reads its slots out of IndexedDB and drew them when the
    // read came back, whether or not the captain was still looking at it: the
    // five slots and their hint line were painted on top of the chart. Seen on
    // a screenshot, which is the only place it could be seen — `switchTab`
    // empties the container before it draws, and it cannot empty something
    // that has not been drawn yet.
    const offenders: string[] = [];
    for (const [path, src] of Object.entries(SCENES)) {
      for (const m of src.matchAll(/\.then\(\s*\(/g)) {
        const body = src.slice(m.index!, m.index! + 400);
        const draws = /this\.(?:add|render|contentContainer)/.test(body);
        const guarded = /activeTabIndex|currentView|scene\.isActive|!==\s*tabAtRequest/.test(body);
        if (draws && !guarded) {
          offenders.push(`${path.replace(/^.*\/scenes\//, "")}:${src.slice(0, m.index!).split("\n").length}`);
        }
      }
    }
    expect(offenders, "an awaited draw must check the screen is still there").toEqual([]);
  });
});
