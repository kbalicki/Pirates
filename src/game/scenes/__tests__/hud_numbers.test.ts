import { describe, it, expect, afterAll } from "vitest";
import { setLang, getLang } from "../../../core/i18n/I18n.ts";
import { t } from "../../../core/i18n/index.ts";
import { fmtNum, fmtTrim, decimalSeparator } from "../../../core/i18n/numbers.ts";
import { ZOOM_VALUES } from "../../settings/ZoomSetting.ts";

// ===========================================================================
// The numbers on the chart were written in English (v0.97.0)
// ===========================================================================

/**
 * Polish puts a comma where English puts a point, and `toFixed` puts a point.
 * So every fractional number the player has ever read — her speed through the
 * water, her leeway, the guns a broadside dismounted, the latitude under the
 * cursor — said *8.3* in a Polish build that should have said *8,3*.
 *
 * The game's own manual already knew: `help.ctrl_zoom` writes *1,5×–12×* and
 * `help.event_harvest_fx` writes *×0,6*, three lines above
 * `help.event_trade_boom_fx` writing *×1.5*. One table, one kind of number,
 * two spellings — which is the tell this project keeps finding: a rule applied
 * in one place is not a rule.
 *
 * The zoom indicator is the same defect with a number instead of a separator.
 */

const original = getLang();
afterAll(() => setLang(original));

// ---------------------------------------------------------------------------

describe("a number is spelled the way its reader spells it", () => {
  it("separates the decimals with a comma in Polish", () => {
    setLang("pl");
    expect(decimalSeparator()).toBe(",");
    expect(fmtNum(8.25)).toBe("8,3");
    expect(fmtNum(0.5)).toBe("0,5");
    expect(fmtNum(-12.34, 2)).toBe("-12,34");
  });

  it("separates them with a point in English", () => {
    setLang("en");
    expect(decimalSeparator()).toBe(".");
    expect(fmtNum(8.25)).toBe("8.3");
    expect(fmtNum(-12.34, 2)).toBe("-12.34");
  });

  it("groups no thousands, because the game does not", () => {
    // `Intl.NumberFormat` would write `8 300` next to the gold counter's 8300.
    setLang("pl");
    expect(fmtNum(8300, 0)).toBe("8300");
    setLang("en");
    expect(fmtNum(8300, 0)).toBe("8300");
  });

  it("drops decimals that say nothing, and keeps the ones that do", () => {
    setLang("pl");
    expect(fmtTrim(2)).toBe("2");
    expect(fmtTrim(1.5)).toBe("1,5");
    expect(fmtTrim(12)).toBe("12");
    setLang("en");
    expect(fmtTrim(1.5)).toBe("1.5");
    expect(fmtTrim(2)).toBe("2");
  });

  it("writes the speed on the HUD in Polish", () => {
    setLang("pl");
    expect(t("hud.knots", { knots: fmtNum(8.25) })).toBe("8,3 w.");
  });
});

// ---------------------------------------------------------------------------

describe("the zoom indicator can tell the settings apart", () => {
  const values = Object.values(ZOOM_VALUES);

  it("has fourteen steps to report", () => {
    expect(values).toHaveLength(14);
  });

  it("gave only eleven readings for them until v0.97.0", () => {
    // The old line: `t("hud.zoom", { level: Math.round(zoom) })`. 1.5 and 2
    // both read `2`, 2.5 and 3 both read `3`, 3.5 and 4 both read `4` — so at
    // the wide end of the chart the first press of the zoom key moved the
    // picture and not the number under it. And `1×`, which the comment beside
    // it promised, could not be printed at all: the widest step is 1.5.
    const rounded = new Set(values.map(v => String(Math.round(v))));
    expect(rounded.size).toBe(11);
    expect(rounded.has("1")).toBe(false);
  });

  it("reads differently at every step now", () => {
    setLang("pl");
    const shown = values.map(v => fmtTrim(v));
    expect(new Set(shown).size).toBe(values.length);
    expect(shown[0]).toBe("1,5");
    expect(shown[values.length - 1]).toBe("12");
  });

  it("agrees with the range the manual states", () => {
    setLang("pl");
    expect(t("help.ctrl_zoom")).toContain(`${fmtTrim(values[0])}×`);
    expect(t("help.ctrl_zoom")).toContain(`${fmtTrim(values[values.length - 1])}×`);
  });
});

// ---------------------------------------------------------------------------

const GAME_SOURCES = import.meta.glob("../../**/*.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

const PL_LOCALE = import.meta.glob("../../../core/i18n/locales/pl.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

/**
 * Where a decimal point is still allowed to stand, and why.
 *
 * The three battle manual bodies are blocks of **formula**, not prose — they
 * print `(1 − dRatio)^1.5` and a table of ammunition multipliers beside pipes
 * and arithmetic. A comma there would be read as a list separator by the same
 * eye that reads the formula, so they keep the point on purpose, in both
 * languages, the way the code they describe is written.
 */
const POINT_ALLOWED: Record<string, string> = {
  "battle.help_turn_body": "a formula block: `× wiatr × kara_żagli`, hull factors as code writes them",
  "battle.help_damage_body": "the damage formula and the ammunition table, in code notation",
  "battle.help_reload_body": "the reload formula and its multipliers, in code notation",
};

describe("nothing spells a number for the other language", () => {
  it("routes every fractional number through the formatter", () => {
    // `toFixed(0)` has no separator to get wrong and is left alone.
    const offenders = Object.entries(GAME_SOURCES)
      .filter(([path]) => !path.includes("__tests__"))
      .flatMap(([path, src]) => src.split("\n")
        .map((line, i) => ({ path, line, n: i + 1 }))
        .filter(row => /\.toFixed\([1-9]\)/.test(row.line))
        .filter(row => !row.line.includes("console.log"))
        .map(row => `${row.path}:${row.n}`));
    expect(offenders, "these write a decimal point whatever the language").toEqual([]);
  });

  it("keeps no English decimal in a Polish sentence", () => {
    const src = Object.values(PL_LOCALE)[0] ?? "";
    const bad: string[] = [];
    for (const line of src.split("\n")) {
      const key = /^\s*"([a-z0-9_.]+)":/.exec(line)?.[1];
      if (!key || key in POINT_ALLOWED) continue;
      // A digit, a point, a digit — inside the quoted value, not in a version
      // number in a comment.
      if (/[0-9]\.[0-9]/.test(line.replace(/^\s*"[a-z0-9_.]+":\s*/, ""))) bad.push(key);
    }
    expect(bad, "these Polish lines spell a decimal the English way").toEqual([]);
  });

  it("keeps every allowance about a line that still exists", () => {
    const src = Object.values(PL_LOCALE)[0] ?? "";
    const stale = Object.keys(POINT_ALLOWED).filter(key => !src.includes(`"${key}"`));
    expect(stale, "an allowance for a line that is gone").toEqual([]);
  });
});
