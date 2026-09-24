import { describe, it, expect, afterAll } from "vitest";
import { setLang, getLang } from "../../i18n/I18n.ts";
import { PL } from "../../i18n/locales/pl.ts";
import { plMonthsGen } from "../../i18n/plForms.ts";
import { getMonthName, formatCalendarDay, formatCalendarDate } from "../TimeSystem.ts";

// ===========================================================================
// 1 Styczeń 1680 (v0.97.0)
// ===========================================================================

/**
 * The date is the one sentence this game writes **every frame** — it is in the
 * corner of the chart from the first second of a career — and until v0.97.0 it
 * was ungrammatical in Polish and had no test of any kind.
 *
 * `time.month_names` holds the nominative, and the nominative is the form the
 * game never prints: the table has **one** reader (`getMonthName`), and every
 * sentence built on it puts a day number in front of the month, which in
 * Polish takes the genitive. *1 Styczeń 1680* is the shape of *"Zamknęli port
 * w Hawana"* from v0.69.0, in the line the player reads most often.
 *
 * It was written out three times — the HUD through `formatCalendarDate`, the
 * calendar tab, and the list of saves on the title screen — so the same wrong
 * form had to be found in three files. The calendar tab even carries a comment
 * about the **year** it had got wrong for exactly that reason (one caller
 * learned the argument, the other never did) and the copy was left standing.
 * There is one builder now, and the guard at the bottom keeps it that way.
 */

const original = getLang();
afterAll(() => setLang(original));

// ---------------------------------------------------------------------------

describe("the month takes the case the day number gives it", () => {
  it("names all twelve months in the genitive in Polish", () => {
    setLang("pl");
    expect(Array.from({ length: 12 }, (_, i) => getMonthName(i + 1, "gen"))).toEqual([
      "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
      "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
    ]);
  });

  it("keeps the nominative for a month standing on its own", () => {
    setLang("pl");
    expect(getMonthName(1)).toBe("Styczeń");
    expect(getMonthName(9)).toBe("Wrzesień");
  });

  it("has a genitive that is a different word from the nominative", () => {
    // A row copied across by mistake would read `1 Styczeń 1680` again and
    // nothing else here would notice.
    const nom = (PL["time.month_names"] as string).split(",");
    const gen = plMonthsGen();
    expect(gen).toHaveLength(12);
    expect(gen.filter((g, i) => g === nom[i]), "these months did not decline").toEqual([]);
    expect(gen.filter(g => g !== g.toLowerCase()), "a Polish month is lower case").toEqual([]);
  });

  it("ignores the case in English, which has one form", () => {
    setLang("en");
    expect(getMonthName(1, "gen")).toBe("January");
    expect(getMonthName(1)).toBe("January");
  });
});

// ---------------------------------------------------------------------------

describe("the date sentence", () => {
  it("reads as Polish on the first day of the world", () => {
    setLang("pl");
    expect(formatCalendarDay(1, 1680)).toBe("1 stycznia 1680");
  });

  it("reads as English on the same day", () => {
    setLang("en");
    expect(formatCalendarDay(1, 1680)).toBe("1 January 1680");
  });

  it("carries the world's own start year rather than the default era", () => {
    setLang("en");
    expect(formatCalendarDay(1, 1600)).toBe("1 January 1600");
    expect(formatCalendarDay(1, 1660)).toBe("1 January 1660");
  });

  it("says the same thing through a GameTime as through a day number", () => {
    setLang("pl");
    const time = { day: 200, hour: 13, minute: 5, tick: 0 };
    expect(formatCalendarDate(time, 1680)).toBe(formatCalendarDay(200, 1680));
  });

  it("puts no nominative month next to a day number, in any month", () => {
    setLang("pl");
    const nom = (PL["time.month_names"] as string).split(",");
    const bad: string[] = [];
    // One day inside each month of the first year, whatever their lengths.
    for (let day = 1; day <= 366; day += 1) {
      const line = formatCalendarDay(day, 1680);
      if (nom.some(name => line.includes(name))) bad.push(line);
    }
    expect(bad.slice(0, 5), "a nominative month with a day number").toEqual([]);
  });
});

// ---------------------------------------------------------------------------

const SOURCES = import.meta.glob("../../../{core,game,persistence}/**/*.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

describe("one place writes the date", () => {
  it("has no second copy of the sentence anywhere else", () => {
    // The shape that was written three times: a day number, a month and a year
    // stitched together in a template literal. `TimeSystem.ts` is where it
    // lives now; a fourth copy is how the wrong form survived this long.
    const copies = Object.entries(SOURCES)
      .filter(([path]) => !path.includes("TimeSystem.ts") && !path.includes("__tests__"))
      .filter(([, src]) => /\$\{[^}]*dayOfMonth\}\s*\$?\{?\s*\$\{/.test(src)
        || /\$\{[^}]*dayOfMonth\}[^`]*\$\{[^}]*year\}/.test(src))
      .map(([path]) => path);
    expect(copies, "these build the date themselves").toEqual([]);
  });

  it("is the only reader of the month table", () => {
    // `time.month_names` is the nominative. A second reader is a second place
    // that has to remember which case its sentence wants.
    const readers = Object.entries(SOURCES)
      .filter(([, src]) => src.includes('t("time.month_names")'))
      .map(([path]) => path);
    expect(readers).toHaveLength(1);
    expect(readers[0]).toContain("TimeSystem.ts");
  });
});
