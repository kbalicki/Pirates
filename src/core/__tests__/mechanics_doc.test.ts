import { describe, it, expect } from "vitest";
import { SHIP_CLASSES } from "../data/ships.ts";

// ===========================================================================
// documentation/14-MECHANICS.md says what the game does. This checks it.
// ===========================================================================

/**
 * The in-game manual promised a reputation reset on a new governor from
 * v0.9.7.1 and nothing produced one for **fifty-one releases** (v0.61.0). In
 * v0.64.0 it went the other way: the manual said a famine doubles the price of
 * "food x2, water x2" and the code doubled everything on the counter, so this
 * time the prose was right and the mechanic was wrong.
 *
 * Both are the same failure — a document about a mechanic and the mechanic
 * drifting apart quietly — and `14-MECHANICS.md` is meant to be the source a
 * player-facing manual is written from, so a drift there would be printed and
 * handed to somebody.
 *
 * So the document carries its numbers in a fixed shape and this reads them
 * back out of the source:
 *
 *     | `Module.CONSTANT` | 30 | what it means |
 *
 * It parses `Module.ts` rather than importing it, because a good half of these
 * are module-private and exporting a constant purely so a test can see it
 * would be changing the code to fit the test.
 */

const DOC = Object.values(
  import.meta.glob("../../../documentation/14-MECHANICS.md", {
    query: "?raw", import: "default", eager: true,
  }) as Record<string, string>,
)[0];

const SOURCES = import.meta.glob("../**/*.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

/** Basename without extension -> source text. */
const BY_MODULE: Record<string, string> = {};
for (const [path, src] of Object.entries(SOURCES)) {
  if (path.includes("__tests__")) continue;
  const name = path.split("/").pop()!.replace(/\.ts$/, "");
  BY_MODULE[name] = src;
}

/** `| \`Module.CONST\` | value | meaning |` */
const ROW = /^\| `([A-Za-z][A-Za-z0-9_]*)\.([A-Z][A-Z0-9_]*)` \| ([^|]+?) \|/gm;

/** The document is written for humans: a minus sign is U+2212, not a hyphen. */
function num(text: string): number {
  return Number(text.trim().replace(/−/g, "-").replace(/\s/g, ""));
}

/** `const NAME = 12;` or `export const NAME = 12;`, value up to the semicolon. */
function constantIn(src: string, name: string): string | null {
  const m = src.match(new RegExp(`^(?:export )?const ${name}(?::[^=]+)? = ([^;]+);`, "m"));
  return m ? m[1].trim() : null;
}

describe("14-MECHANICS.md — every number in it is a number from the code", () => {
  it("has the document and the modules it names", () => {
    // A conclusion drawn from a search that did not run is the v0.57.0 error.
    expect(DOC, "documentation/14-MECHANICS.md not readable from the test").toBeTruthy();
    expect(Object.keys(BY_MODULE).length).toBeGreaterThan(50);
    expect(BY_MODULE["WeatherSystem"]).toBeTruthy();
    expect(BY_MODULE["EventEffectsSystem"]).toBeTruthy();
  });

  it("still states most of what it used to", () => {
    // 244 rows when this was written. The floor is a guard against a table
    // quietly disappearing in a reword, not a target: it should be moved down
    // deliberately if a section is genuinely retired.
    expect([...DOC.matchAll(ROW)].length).toBeGreaterThanOrEqual(200);
  });

  it("agrees with the source on every one of them", () => {
    const wrong: string[] = [];
    const missing: string[] = [];

    for (const m of DOC.matchAll(ROW)) {
      const [, moduleName, constName, stated] = m;
      const src = BY_MODULE[moduleName];
      if (!src) { missing.push(`${moduleName}.ts — no such module`); continue; }
      const actual = constantIn(src, constName);
      if (actual === null) { missing.push(`${moduleName}.${constName} — not a constant there`); continue; }
      const a = Number(actual);
      if (Number.isNaN(a)) { missing.push(`${moduleName}.${constName} = ${actual} — not a plain number`); continue; }
      if (num(stated) !== a) wrong.push(`${moduleName}.${constName}: doc says ${stated.trim()}, code says ${actual}`);
    }

    expect(missing, "constants the document names and the code does not have").toEqual([]);
    expect(wrong, "numbers the document gets wrong").toEqual([]);
  });
});

describe("14-MECHANICS.md — the ship table", () => {
  /**
   * The one table a player manual will copy almost verbatim, so it is checked
   * against `SHIP_CLASSES` field by field rather than by eye.
   */
  const HEADER = "| klasa | prędkość | skręt |";

  it("lists all nine classes with the right numbers", () => {
    const start = DOC.indexOf(HEADER);
    expect(start, "ship table header not found — has the table been reworded?").toBeGreaterThan(-1);
    const table = DOC.slice(start).split("\n\n")[0].split("\n").slice(2);

    const seen: string[] = [];
    const wrong: string[] = [];
    for (const line of table) {
      if (!line.startsWith("|")) continue;
      const c = line.split("|").map(s => s.trim()).filter((_, i) => i > 0);
      const key = c[0];
      const def = SHIP_CLASSES[key];
      if (!def) { wrong.push(`${key}: not a ship class`); continue; }
      seen.push(key);

      // Numbers by value, so the document may write 1.0 where the code writes
      // 1 — a table of ship statistics reads better with an even column. Text
      // fields (the rig, the crew range) still have to match exactly.
      const check = (label: string, stated: string, actual: number | string) => {
        const bad = typeof actual === "number"
          ? Number(stated.replace("°", "").trim()) !== actual
          : stated !== actual;
        if (bad) wrong.push(`${key}.${label}: doc ${stated}, code ${actual}`);
      };
      check("speedBase", c[1], def.speedBase);
      check("turnRate", c[2], def.turnRate);
      check("hullMax", c[3], def.hullMax);
      check("sailsMax", c[4], def.sailsMax);
      check("cannons", c[5], def.cannons);
      check("cargoCap", c[6], def.cargoCap);
      check("crew", c[7], `${def.crewMin}–${def.crewMax}`);
      check("buyPrice", c[8], def.buyPrice);
      check("minWindAngle", c[9], def.minWindAngle);
      check("mastHeight", c[10], def.mastHeight);
      check("rigType", c[11], def.rigType);
      check("tonnage", c[12], def.tonnage);
      check("draft", c[13], def.draft);
      check("armor", c[14], def.armor);
    }

    expect(wrong).toEqual([]);
    expect(seen.sort()).toEqual(Object.keys(SHIP_CLASSES).sort());
  });
});
