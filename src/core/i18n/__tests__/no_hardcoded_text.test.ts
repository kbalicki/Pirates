import { describe, it, expect } from "vitest";
import { EN } from "../locales/en.ts";
import { PL } from "../locales/pl.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import {
  HELP_SAILING_TOPICS, HELP_WORLD_TOPICS, HELP_EVENT_ROWS,
} from "../../data/helpTopics.ts";

// ===========================================================================
// The language the game is written in, versus the one it speaks (v0.60.0)
// ===========================================================================

/**
 * `keys.test.ts` checks that the two locale tables match each other. Two
 * matching tables say **nothing** about a scene that asks neither of them, and
 * that is exactly what happened: `HelpScene` put 147 strings on the screen and
 * called `t()` zero times, so the whole manual was Polish in a build whose
 * default language is English. Fourteen releases, every locale test green.
 *
 * It survived because the author reads Polish: the one screen that was *not*
 * translated is the one that looked right to him.
 *
 * So this test does not read the locales. It reads the **source of every scene
 * and renderer** and fails on a Polish letter inside a string literal. It is
 * the only check in the project that can see a string which never reaches the
 * translation layer at all.
 */

const ALL = import.meta.glob("../../../game/**/*.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

/**
 * The scenes, not the tests that read them.
 *
 * `scene_legend.test.ts` (v0.84.0) quotes Polish hint lines on purpose — it
 * exists to check how they are written — and a sweep that counts those as
 * untranslated screen text is measuring itself.
 */
const SOURCES = Object.fromEntries(
  Object.entries(ALL).filter(([path]) => !path.includes("/__tests__/")),
) as Record<string, string>;

/** Letters that exist in Polish and not in English. */
const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

/**
 * String literals, near enough. Template literals with `${}` in them are
 * skipped: a Polish letter cannot hide in the expression part, and the static
 * part is caught by the same scan of the file.
 */
const LITERAL = /"([^"\n\\]*)"|'([^'\n\\]*)'|`([^`\n$\\]*)`/g;

function polishLiterals(src: string): string[] {
  const out: string[] = [];
  // Comments are prose about the code, not text the player sees. Polish is
  // fine there — half the documentation of this project is Polish.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  let m: RegExpExecArray | null;
  LITERAL.lastIndex = 0;
  while ((m = LITERAL.exec(code)) !== null) {
    const s = m[1] ?? m[2] ?? m[3] ?? "";
    if (POLISH.test(s)) out.push(s);
  }
  return out;
}

/**
 * A literal handed straight to `add.text` — the third argument, the one the
 * player reads.
 *
 * The sweep above only knows how to see **Polish**, which is the language its
 * author would notice. Seventeen screens' worth of **English** was therefore
 * invisible to it: seven key-hint lines (character creation, the save slots,
 * the options list, the port approach, the merchant, the shipyard, the
 * encounter), three column headers on the merchant's counter, "Calm" on both
 * compasses, "Loading...", "Debug", "ESC" and "zoom: ?".
 *
 * That is v0.60.0's own lesson turned round: the untranslated screen is the
 * one that looks right to whoever is checking. A test that looks for Polish
 * letters is a test that can only find a screen written in Polish.
 */
const DRAWN = /\badd\.text\(\s*[^,]+,\s*[^,]+,\s*("((?:[^"\n\\]|\\.)*)"|'((?:[^'\n\\]|\\.)*)')/g;

describe("no screen is left in the language the code is written in", () => {
  it("hands `add.text` no English words of its own", () => {
    const offenders: string[] = [];
    for (const [path, src] of Object.entries(SOURCES)) {
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      DRAWN.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = DRAWN.exec(code)) !== null) {
        const literal = m[2] ?? m[3] ?? "";
        // Words, not glyphs: an arrow, a bullet or a dash is not a language.
        if (/[A-Za-z]{3}/.test(literal)) {
          offenders.push(`${path.replace(/^.*\/game\//, "game/")}: ${literal.slice(0, 60)}`);
        }
      }
    }
    // Seventeen before v0.76.0.
    expect(offenders).toEqual([]);
  });
});

describe("no scene speaks one language on its own", () => {
  it("has no Polish string literal anywhere under src/game", () => {
    expect(Object.keys(SOURCES).length, "the glob found no sources").toBeGreaterThan(20);

    const offenders: string[] = [];
    for (const [path, src] of Object.entries(SOURCES)) {
      for (const s of polishLiterals(src)) {
        offenders.push(`${path.replace(/^.*\/game\//, "game/")}: ${s.slice(0, 60)}`);
      }
    }
    // Measured before the fix: 92 in HelpScene alone, plus three "fallbacks"
    // in scenes that were otherwise fully translated.
    expect(offenders).toEqual([]);
  });

  /**
   * `t()` never returns null or undefined — a missing key comes back as the
   * key itself. Every `t("x") ?? "y"` in this codebase was therefore an
   * unreachable branch holding an unmaintained Polish string; there were
   * nineteen of them.
   */
  it("has no unreachable `t(...) ?? fallback`", () => {
    const offenders: string[] = [];
    for (const [path, src] of Object.entries(SOURCES)) {
      // The lookbehind matters: `params.get("era") ?? ""` ends in `t("era") ??`
      // and is perfectly legitimate — `URLSearchParams.get` really does return
      // null. A first pass without it rewrote four of those and broke the build.
      const m = src.match(/(?<![A-Za-z0-9_$.])t\("[A-Za-z0-9_.]+"\)\s*\?\?/g);
      if (m) offenders.push(`${path.replace(/^.*\/game\//, "game/")}: ${m.length}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("the manual's own keys", () => {
  function bothHave(keys: string[], label: string): void {
    expect(keys.filter(k => !(k in EN)), `${label} missing from en.ts`).toEqual([]);
    expect(keys.filter(k => !(k in PL)), `${label} missing from pl.ts`).toEqual([]);
  }

  it("has a heading and a body for every sailing topic", () => {
    bothHave(
      HELP_SAILING_TOPICS.flatMap(s => [`help.sail_${s}_h`, `help.sail_${s}_b`]),
      "help.sail_<topic>",
    );
  });

  it("has a heading and a body for every world topic", () => {
    bothHave(
      HELP_WORLD_TOPICS.flatMap(s => [`help.world_${s}_h`, `help.world_${s}_b`]),
      "help.world_<topic>",
    );
  });

  it("names every event in the economy table and what it does", () => {
    bothHave(
      HELP_EVENT_ROWS.flatMap(([s]) => [`help.event_${s}`, `help.event_${s}_fx`]),
      "help.event_<type>",
    );
  });

  /**
   * The rig column is keyed off a slug made from the ship table's own words,
   * so a tenth class with a new rig would print `help.rig_lateen` at the
   * player unless somebody wrote the string first.
   */
  it("names every rig in the ship table", () => {
    const rigs = new Set(
      Object.values(SHIP_CLASSES).map(c => c.rigType.toLowerCase().replace(/[^a-z]+/g, "_")),
    );
    bothHave([...rigs].map(r => `help.rig_${r}`), "help.rig_<rig>");
  });
});

// ===========================================================================
// The second reading of the calendar (v0.63.0)
// ===========================================================================

/**
 * `dayToCalendar(day, startYear?)` falls back to `DEFAULT_START_YEAR` when the
 * second argument is left off, and the SPACE menu's Calendar tab left it off:
 * it printed **1690** in five of the six eras while the HUD two inches away
 * printed the right year from the same world.
 *
 * The defect is not reachable from a locale table or from any unit test of the
 * helper, because the helper is correct — the caller is not. So it is checked
 * where it lives, in the source, next to the other check of this shape.
 */
describe("dayToCalendar is never asked without the world's start year", () => {
  const CORE_SOURCES = import.meta.glob("../../**/*.ts", {
    query: "?raw", import: "default", eager: true,
  }) as Record<string, string>;
  const ALL = { ...SOURCES, ...CORE_SOURCES };

  it("passes startYear at every call site", () => {
    const offenders: string[] = [];
    for (const [path, src] of Object.entries(ALL)) {
      if (path.includes("__tests__") || path.includes("TimeSystem.ts")) continue;
      for (const m of src.matchAll(/dayToCalendar\(([^)]*)\)/g)) {
        if (!m[1].includes(",")) offenders.push(`${path}: dayToCalendar(${m[1]})`);
      }
    }
    // `CharacterCreationScene` reads a day out of a save *title* on the load
    // list, where no world is open to ask. It is the one place the default is
    // the only answer available, and it is listed here rather than excused.
    expect(offenders.filter(o => !o.includes("CharacterCreationScene"))).toEqual([]);
  });
});

// ===========================================================================
// And the doors the guard above does not look at (v0.78.0)
// ===========================================================================

/**
 * The sweeps above read **quoted literals**: the Polish one reads every
 * literal in a file, the English one reads the third argument of `add.text`.
 * Two other doors onto the same screen were open, and both had text behind
 * them:
 *
 *   - a **template literal**, which the Polish sweep skips by design ("a
 *     Polish letter cannot hide in the expression part") and the English sweep
 *     never looked at: `Wind ${n}%` on the sea-battle screen, in English, in a
 *     Polish game;
 *   - **`setText`**, which is how a held label is refreshed and therefore how
 *     most numbers reach the player: `Flota: ${n}/3` in the map overlay,
 *     Polish this time, hardcoded, and so unable to turn English;
 *   - and `${knots} kn` in both compasses, drawn straight past the
 *     `hud.wind_knots` key that v0.76.0 had already written for them.
 *
 * The same lesson a third time, and the useful form of it is this: **a guard
 * sees one shape, and the text does not care which shape carried it.**
 */
const DRAWN_TEMPLATE = /(?:\badd\.text\(\s*[^,]+,\s*[^,]+,\s*|\.setText\(\s*)`([^`]*)`/g;

describe("no screen draws words through a template either", () => {
  it("hands `add.text` and `setText` no words of their own", () => {
    const offenders: string[] = [];
    for (const [path, src] of Object.entries(SOURCES)) {
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      DRAWN_TEMPLATE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = DRAWN_TEMPLATE.exec(code)) !== null) {
        // The `${...}` holes are values, not language. What is left is prose.
        const words = m[1].replace(/\$\{[^}]*\}/g, " ");
        // A unit the whole world writes the same way is not a language: a
        // degree sign, a percent, a slash. Two letters running are.
        if (/[A-Za-ząćęłńóśźż]{2}/.test(words)) {
          offenders.push(`${path.replace(/^.*\/game\//, "game/")}: ${m[1].slice(0, 60)}`);
        }
      }
    }
    // Four before v0.78.0.
    expect(offenders).toEqual([]);
  });
});

// ===========================================================================
// A toast is a screen too (v0.97.2)
// ===========================================================================

/**
 * Every sweep above reads `src/game`. The engine in `src/core` does not draw,
 * but it **writes** what is drawn: a `Toast` event carries its message ready
 * made, and `WorldRenderer` puts it on the chart as it stands. Landing and
 * re-embarking said *"Crew has gone ashore."* and *"Crew has returned to
 * ship."* in English in the Polish game — beside `event.disembarked` and
 * `event.embarked`, the keys for exactly those sentences, written into the log
 * two lines above.
 */
describe("the engine hands the screen no words of its own", () => {
  const CORE_SOURCES = import.meta.glob("../../**/*.ts", {
    query: "?raw", import: "default", eager: true,
  }) as Record<string, string>;

  it("builds every toast message through t()", () => {
    const offenders: string[] = [];
    for (const [path, src] of Object.entries(CORE_SOURCES)) {
      if (path.includes("__tests__")) continue;
      for (const m of src.matchAll(/type:\s*"Toast",\s*message:\s*(["'`])/g)) {
        offenders.push(`${path}: Toast with a ${m[1]}literal${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
