import { describe, it, expect, afterAll } from "vitest";
import { t, setLang, getLang } from "../I18n.ts";
import { plCategory, nounForm, isPluralNoun, pluralNounIds } from "../plurals.ts";
import { isPlForm } from "../plForms.ts";
import { EN } from "../locales/en.ts";
import { PL } from "../locales/pl.ts";
import { portNameKey, factionNameKey } from "../names.ts";

// ===========================================================================
// One day, two days, five days (v0.74.0)
// ===========================================================================

/**
 * Eighty-five Polish sentences and sixty-nine English ones put a count next to
 * a noun and left the noun in one shape. `{{count}} ton` is right for five and
 * wrong for one and for two; `{{count}} days` is right for five and wrong for
 * one. v0.72.0 had to give the last two days of a passage sentences of their
 * own to get round exactly this.
 *
 * It is not a corner case. Measured over the code that produces the numbers:
 * `tendSickBay` never tends fewer than one man, so **55.5%** of the lines it
 * can write say one; `CrewConsumptionSystem` computes starvation deaths as
 * `max(1, ...)`, so **67.1%** of its toasts say one; and the village pays 2, 3,
 * 4 or 5 tons of gold, so **three of its four sentences** were ungrammatical.
 */

const original = getLang();
afterAll(() => setLang(original));

const pl = (key: string, vars: Record<string, string | number>) => {
  setLang("pl");
  const out = t(key, vars);
  setLang(original);
  return out;
};
const en = (key: string, vars: Record<string, string | number>) => {
  setLang("en");
  const out = t(key, vars);
  setLang(original);
  return out;
};

describe("Polish counts in three", () => {
  it("knows one from a few from a heap", () => {
    expect(plCategory(1)).toBe("one");
    expect(plCategory(2)).toBe("few");
    expect(plCategory(4)).toBe("few");
    expect(plCategory(5)).toBe("many");
    expect(plCategory(21)).toBe("many");
    expect(plCategory(22)).toBe("few");
    expect(plCategory(0)).toBe("many");
  });

  it("sends the teens to the heap, which is the rule everybody gets wrong", () => {
    // 12, 13 and 14 end in 2, 3 and 4 and take the heap form anyway; 112 does
    // too, and 122 goes back to the few.
    for (const n of [12, 13, 14, 112, 113, 114]) expect(plCategory(n), String(n)).toBe("many");
    for (const n of [22, 23, 24, 122]) expect(plCategory(n), String(n)).toBe("few");
  });

  it("bends the noun to match", () => {
    expect(nounForm("pl", "ton", 1)).toBe("tona");
    expect(nounForm("pl", "ton", 2)).toBe("tony");
    expect(nounForm("pl", "ton", 5)).toBe("ton");
    expect(nounForm("pl", "gun", 1)).toBe("działo");
    expect(nounForm("pl", "gun", 3)).toBe("działa");
    expect(nounForm("pl", "gun", 11)).toBe("dział");
    expect(nounForm("pl", "day", 1)).toBe("dzień");
    expect(nounForm("pl", "day", 3)).toBe("dni");
  });

  it("gives English the two it has", () => {
    expect(nounForm("en", "day", 1)).toBe("day");
    expect(nounForm("en", "day", 2)).toBe("days");
    expect(nounForm("en", "man", 1)).toBe("man");
    expect(nounForm("en", "man", 9)).toBe("men");
    // English has no `few`, so the Polish middle category falls through to the
    // plural rather than to nothing.
    expect(nounForm("en", "ton", 3)).toBe("tons");
  });

  it("answers nothing for a case, so the declension machinery still gets it", () => {
    expect(nounForm("pl", "acc", 3)).toBeUndefined();
    expect(nounForm("pl", "in", 1)).toBeUndefined();
    expect(isPluralNoun("acc")).toBe(false);
    expect(isPluralNoun("day")).toBe(true);
  });

  it("keeps the two namespaces apart", () => {
    // `{{port:acc}}` and `{{days:day}}` go through the same placeholder, so a
    // name in both tables would be answered by whichever was asked first.
    const clash = pluralNounIds().filter(id => isPlForm(id));
    expect(clash, "ids that are both a noun and a grammatical case").toEqual([]);
  });

  it("carries the same nouns in both languages", () => {
    for (const id of pluralNounIds()) {
      expect(nounForm("pl", id, 1), id).toBeTruthy();
      expect(nounForm("en", id, 1), id).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------

describe("no sentence stitches a count to a noun that cannot bend", () => {
  /** The literals the old strings were wrong with, in both languages. */
  const BARE: Record<"pl" | "en", string[]> = {
    pl: ["dni", "dzień", "żołnierzy", "żołnierzami", "żołnierzom",
      "ludzi", "człowiek", "dział", "działa", "działo", "ton", "tony", "tona",
      "rannych", "członków", "punktów", "punkty"],
    en: ["days", "day", "soldiers", "soldier", "men", "hands", "guns", "gun",
      "tons", "ton", "points", "point"],
  };

  const AFTER = /\{\{[A-Za-z_][A-Za-z0-9_]*\}\} ([A-Za-ząćęłńóśźż]+)/g;

  /**
   * The one sentence that is right with a bare noun, and why.
   *
   * "2 z 3 dzial potrzebnych": after `z` Polish wants the genitive plural
   * whatever the number is, so bending the noun to the count would break the
   * line the mechanical pass was meant to fix. One allowance with a reason
   * beats a rule that is wrong for one sentence in ninety.
   */
  const ALLOWED = new Set(["blockade.need_guns"]);

  function offenders(table: Record<string, string>, words: string[]): string[] {
    const out: string[] = [];
    for (const [key, line] of Object.entries(table)) {
      if (typeof line !== "string" || ALLOWED.has(key)) continue;
      for (const m of line.matchAll(AFTER)) {
        if (words.includes(m[1])) out.push(`${key}: "${m[1]}"`);
      }
    }
    return out;
  }

  it("reads both whole tables", () => {
    // A sweep that reads nothing passes for the wrong reason (v0.64.0).
    expect(Object.keys(PL).length).toBeGreaterThan(900);
    expect(Object.keys(EN).length).toBeGreaterThan(900);
  });

  it("finds none in Polish", () => {
    expect(offenders(PL as Record<string, string>, BARE.pl)).toEqual([]);
  });

  it("finds none in English", () => {
    expect(offenders(EN as Record<string, string>, BARE.en)).toEqual([]);
  });

  it("agrees with the number it stands next to, not with its neighbour", () => {
    // The English relief line came out of the mechanical pass reading
    // `{{soldiers}} {{faction}} {{faction:soldier}}`: the noun would have bent
    // to the name of a crown. Every noun form has to name the variable that
    // carries its count.
    const wrong: string[] = [];
    for (const [table, name] of [[PL, "pl"], [EN, "en"]] as const) {
      for (const [key, line] of Object.entries(table)) {
        if (typeof line !== "string") continue;
        for (const m of line.matchAll(/\{\{(\w+):([a-z_]+)\}\}/g)) {
          if (!isPluralNoun(m[2])) continue;
          if (!line.includes(`{{${m[1]}}}`)) wrong.push(`${name} ${key}: ${m[0]}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe("the sentences that were wrong, rendered", () => {
  it("pays the village in tons that bend", () => {
    // 2, 3, 4 or 5 tons of gold, and three of the four were ungrammatical.
    expect(pl("village.trade_done", { gold: 2 })).toContain("2 tony złota");
    expect(pl("village.trade_done", { gold: 3 })).toContain("3 tony złota");
    expect(pl("village.trade_done", { gold: 5 })).toContain("5 ton złota");
    expect(pl("village.trade", { rum: 6, gold: 2 })).toContain("6 ton rumu");
    expect(pl("village.trade", { rum: 6, gold: 2 })).toContain("2 tony złota");
  });

  it("brings one man out of the sick bay without saying `1 rannych`", () => {
    expect(pl("event.wounded_recovered", { count: 1 })).toContain("1 ranny");
    expect(pl("event.wounded_recovered", { count: 3 })).toContain("3 rannych");
    expect(en("event.wounded_recovered", { count: 1 })).toContain("1 wounded man");
    expect(en("event.wounded_recovered", { count: 3 })).toContain("3 wounded");
  });

  it("buries one man of want without saying `1 członków`", () => {
    expect(pl("event.crew_died", { count: 1 })).toContain("1 członek załogi");
    expect(pl("event.crew_died", { count: 5 })).toContain("5 członków załogi");
    expect(en("event.crew_died", { count: 1 })).toContain("1 crew member");
    expect(en("event.crew_died", { count: 2 })).toContain("2 crew members");
  });

  it("counts a storm down to its last day", () => {
    expect(pl("weather.chart_storm", { days: 1 })).toContain("1 dzień");
    expect(pl("weather.chart_storm", { days: 2 })).toContain("2 dni");
    expect(pl("tavern.rumor_hurricane_bound", {
      port: portNameKey("havana"), bound: portNameKey("tortuga"), days: 1,
    })).toContain("1 dzień");
  });

  it("uses the genitive where the preposition asks for it", () => {
    // `od pięciu dni` but `od jednego dnia` — the one sentence that needed a
    // second entry rather than a second mechanism.
    const line = (days: number) => pl("crown.allied_since", {
      faction: factionNameKey("england"), against: factionNameKey("spain"), days,
    });
    expect(line(1)).toContain("od 1 dnia");
    expect(line(3)).toContain("od 3 dni");
    expect(line(10)).toContain("od 10 dni");
  });

  it("does not bend a gun that stands after `z`", () => {
    // "2 z 3 dział" — after `z` the genitive plural is right for every number,
    // so this is the one sentence the mechanical pass had to leave alone.
    expect(pl("blockade.need_guns", { guns: 2, required: 3 }))
      .toBe("2 z 3 dział potrzebnych, by zamknąć ten port");
  });

  it("still says the English sentence in English", () => {
    expect(en("news.reconquest", {
      faction: factionNameKey("spain"), port: portNameKey("havana"), soldiers: 1, days: 1,
    })).toBe("Spain is coming to retake Havana — 1 soldier, 1 day out.");
  });
});
