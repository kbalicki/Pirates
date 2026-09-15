import { describe, it, expect } from "vitest";
import { SHIP_CLASSES } from "../data/ships.ts";
import { CITIES } from "../data/cities.ts";
import { AMMO_DEFS } from "../data/ammo.ts";
import { MANNING_TIERS } from "../systems/CrewSystem.ts";
import { HULL_TIERS, RIG_TIERS } from "../systems/DamageSystem.ts";
import { SAIL_LEVELS } from "../systems/SailSystem.ts";
import { getReputationLevel } from "../systems/ReputationSystem.ts";
import { PL } from "../i18n/locales/pl.ts";

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


// ===========================================================================
// The structural tables (v0.65.0)
// ===========================================================================

/**
 * Until this release only the scalar constants and the ship table were checked.
 * Everything else — the reputation tiers, manning, damage, rigging, ammunition,
 * sail levels and all forty-five ports — was transcribed by hand, which is the
 * state the ship table was in before somebody checked it, and the state the
 * in-game manual was in for fifty-one releases.
 */

/** The rows of the markdown table whose header line is `header`. */
function rowsAfter(header: string): string[][] {
  const start = DOC.indexOf(header);
  expect(start, `table not found: ${header}`).toBeGreaterThan(-1);
  return DOC.slice(start).split("\n\n")[0].split("\n").slice(2)
    .filter(line => line.startsWith("|"))
    .map(line => line.split("|").map(c => c.trim()).slice(1, -1));
}

/** "×1.25", "**×4.5**", "75%", "≤ −60" -> a number. */
function cell(text: string): number {
  return Number(text.replace(/\*\*/g, "").replace(/[×%]/g, "")
    .replace(/−/g, "-").replace(/[≤≥<>]/g, "").trim());
}

describe("14-MECHANICS.md — the tables that are not constants", () => {
  it("the four sail levels", () => {
    const rows = rowsAfter("| poziom | wartość płótna |");
    expect(rows.length).toBe(SAIL_LEVELS.length);
    rows.forEach((r, i) => expect(cell(r[1]), `sail ${i}`).toBe(SAIL_LEVELS[i].value));
  });

  it("the four hull tiers", () => {
    const rows = rowsAfter("| kadłub | od | prędkość | skręt |");
    expect(rows.map(r => r[0])).toEqual(HULL_TIERS.map(t => t.id));
    rows.forEach((r, i) => {
      expect(cell(r[1]) / 100, `hull ${i} minFrac`).toBeCloseTo(HULL_TIERS[i].minFrac, 10);
      expect(cell(r[2]), `hull ${i} speed`).toBe(HULL_TIERS[i].speedMul);
      expect(cell(r[3]), `hull ${i} turn`).toBe(HULL_TIERS[i].turnMul);
    });
  });

  it("the four rigging tiers", () => {
    const rows = rowsAfter("| takielunek | od | prędkość |");
    expect(rows.map(r => r[0])).toEqual(RIG_TIERS.map(t => t.id));
    rows.forEach((r, i) => {
      expect(cell(r[1]) / 100, `rig ${i} minFrac`).toBeCloseTo(RIG_TIERS[i].minFrac, 10);
      expect(cell(r[2]), `rig ${i} speed`).toBe(RIG_TIERS[i].speedMul);
    });
  });

  it("the four manning tiers", () => {
    const rows = rowsAfter("| obsada | od ilu × `crewMin` | prędkość | skręt | czas zmiany żagli |");
    expect(rows.map(r => r[0])).toEqual(MANNING_TIERS.map(t => t.id));
    rows.forEach((r, i) => {
      expect(cell(r[1]), `manning ${i} minFrac`).toBe(MANNING_TIERS[i].minFrac);
      expect(cell(r[2]), `manning ${i} speed`).toBe(MANNING_TIERS[i].speedMul);
      expect(cell(r[3]), `manning ${i} turn`).toBe(MANNING_TIERS[i].turnMul);
      expect(cell(r[4]), `manning ${i} handling`).toBe(MANNING_TIERS[i].handlingMul);
    });
  });

  it("the three kinds of shot", () => {
    const rows = rowsAfter("| typ | kadłub | żagle | załoga | zasięg |");
    const order = ["round", "chain", "grape"] as const;
    expect(rows.length).toBe(order.length);
    rows.forEach((r, i) => {
      const def = AMMO_DEFS[order[i]];
      expect(r[0].startsWith(order[i]), `ammo row ${i} is ${r[0]}`).toBe(true);
      expect(cell(r[1]), `${order[i]} hull`).toBe(def.hullMul);
      expect(cell(r[2]), `${order[i]} sails`).toBe(def.sailsMul);
      expect(cell(r[3]), `${order[i]} crew`).toBe(def.crewMul);
      expect(cell(r[4]), `${order[i]} range`).toBe(def.rangeMul);
    });
  });

  it("the five reputation tiers, and the thresholds they start at", () => {
    const rows = rowsAfter("| próg | zakres | spread | werbunek | fracht | magazyn | kadłuby | usługi |");
    // `TIERS` is module-private, so the numbers come out of the source.
    const src = BY_MODULE["PortAccessSystem"];
    const wrong: string[] = [];
    for (const r of rows) {
      const level = r[0];
      const line = src.match(new RegExp(`^  ${level}:\\s*\\{([^}]*)\\}`, "m"));
      if (!line) { wrong.push(`${level}: no such tier`); continue; }
      const field = (name: string) => {
        const m = line[1].match(new RegExp(`${name}: ([^,}]+)`));
        return m ? m[1].trim() : "";
      };
      if (cell(r[2]) !== Number(field("spread"))) wrong.push(`${level}.spread: doc ${r[2]}, code ${field("spread")}`);
      if (cell(r[3]) !== Number(field("crewMul"))) wrong.push(`${level}.crewMul: doc ${r[3]}, code ${field("crewMul")}`);
      if (cell(r[7]) !== Number(field("serviceMul"))) wrong.push(`${level}.serviceMul: doc ${r[7]}, code ${field("serviceMul")}`);
      const yes = (t: string) => t.replace(/\*\*/g, "") === "tak";
      if (yes(r[4]) !== (field("canCharter") === "true")) wrong.push(`${level}.canCharter`);
      if (yes(r[5]) !== (field("canRentStore") === "true")) wrong.push(`${level}.canRentStore`);
      if (yes(r[6]) !== (field("canBuyShips") === "true")) wrong.push(`${level}.canBuyShips`);
      // Both ends of the range the row claims really land in that tier, and
      // the point just outside each end does not. That is the assertion the
      // reputation table needed and did not have: not "is there a threshold"
      // but "is THIS the threshold".
      const [lo, hi] = r[1].split("…").map(cell);
      expect(getReputationLevel(lo), `${level} at its floor ${lo}`).toBe(level);
      expect(getReputationLevel(hi), `${level} at its ceiling ${hi}`).toBe(level);
      if (lo > -100) expect(getReputationLevel(lo - 1), `${lo - 1} should be below ${level}`).not.toBe(level);
      if (hi < 100) expect(getReputationLevel(hi + 1), `${hi + 1} should be above ${level}`).not.toBe(level);
    }
    expect(wrong).toEqual([]);
  });
});

describe("14-MECHANICS.md — the forty-five ports", () => {
  const CROWN: Record<string, string> = {
    spain: "Hiszpania", england: "Anglia", france: "Francja", netherlands: "Holandia",
  };
  const TYPE: Record<string, string> = { city: "miasto", fort: "forteca", outpost: "przystań" };

  it("names every port once, with its crown, levels and goods", () => {
    const rows = rowsAfter("| klucz | nazwa | korona | typ | rynek | stocznia | produkuje | potrzebuje |");
    const wrong: string[] = [];
    const seen: string[] = [];

    for (const r of rows) {
      const key = r[0].replace(/`/g, "");
      const def = CITIES[key];
      if (!def) { wrong.push(`${key}: not a port`); continue; }
      seen.push(key);
      const eq = (label: string, stated: string, actual: string) => {
        if (stated !== actual) wrong.push(`${key}.${label}: doc "${stated}", code "${actual}"`);
      };
      eq("nazwa", r[1], PL[`port.${key}.name`] ?? "?");
      eq("korona", r[2], CROWN[def.factionId as unknown as string] ?? "?");
      eq("typ", r[3], TYPE[def.type] ?? "?");
      eq("rynek", r[4], String(def.marketLevel));
      eq("stocznia", r[5], String(def.shipyardLevel));
      eq("produkuje", r[6], def.produces.join(" "));
      eq("potrzebuje", r[7], def.demands.join(" "));
    }

    expect(wrong).toEqual([]);
    expect(seen.sort()).toEqual(Object.keys(CITIES).sort());
    expect(seen.length).toBe(45);
  });
});
