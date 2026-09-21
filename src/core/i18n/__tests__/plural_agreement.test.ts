import { describe, it, expect, afterAll } from "vitest";
import { t, setLang, getLang } from "../I18n.ts";
import { PL } from "../locales/pl.ts";
import { EN } from "../locales/en.ts";
import { pluralNounIds } from "../plurals.ts";

// ===========================================================================
// A count is never the subject of a verb (v0.81.0)
// ===========================================================================

/**
 * The open half of v0.74.0, measured and closed **without** a mechanism.
 *
 * Polish gives a numeral phrase three shapes — *1 działo zostało zbite*,
 * *3 działa zostały zbite*, *5 dział zostało zbitych* — and a variable cannot
 * carry that: the sentence has to choose a variant. The question was never
 * whether the machinery could be built, it was how many sentences need it.
 *
 * **Three, out of eighty-nine.** Forty-eight of the eighty-nine count a
 * masculine-personal noun, which takes the genitive from two upwards and
 * leaves the verb third-person singular at one, three and five. Of the other
 * fifty-three, all but one are fragments or have a verb belonging to something
 * else in the sentence. A mechanism to serve three sentences is more expensive
 * than three rewordings, and that is the result, not a compromise.
 *
 * Two of the three were written the **day before** this was measured, in
 * v0.80.0, and were wrong in English too — *"1 ton go with her"*. The locale
 * parity tests cannot see that, because both columns say it wrong; the same
 * shape v0.79.0 found in `PredationSystem`.
 *
 * So the rule is written down instead: **a count may be an object, an
 * apposition or a bare reading, and never a subject.** These are the three
 * sentences it was written for, rendered at one, at three and at five, in both
 * languages.
 */

const original = getLang();
afterAll(() => setLang(original as "en" | "pl"));

describe("the three sentences where a count used to be the subject", () => {
  const atEach = (key: string, vars: (n: number) => Record<string, string | number>) =>
    [1, 3, 5].map(n => t(key, vars(n)));

  it("selling a consort names the cargo, not the tonnage, as what goes", () => {
    setLang("pl");
    const pl = atEach("fleet.sell_warning", n => ({ tons: n }));
    expect(pl[0]).toContain("Odejdzie z nią ładunek: 1 tona");
    expect(pl[1]).toContain("Odejdzie z nią ładunek: 3 tony");
    expect(pl[2]).toContain("Odejdzie z nią ładunek: 5 ton");
    // One verb, three counts: that is the whole point of the rewording.
    for (const line of pl) expect(line).toContain("Odejdzie");

    setLang("en");
    const en = atEach("fleet.sell_warning", n => ({ tons: n }));
    expect(en[0]).toContain("Her cargo goes with her: 1 ton");
    expect(en[1]).toContain("3 tons");
    // "1 ton go with her" was the English half of the same defect.
    for (const line of en) expect(line).toContain("goes with her");
  });

  it("abandoning one says the same thing the same way", () => {
    setLang("pl");
    const pl = atEach("fleet.abandon_warning", n => ({ tons: n }));
    expect(pl[0]).toContain("ładunek: 1 tona");
    expect(pl[1]).toContain("ładunek: 3 tony");
    expect(pl[2]).toContain("ładunek: 5 ton");
    for (const line of pl) expect(line).toContain("Pójdzie z nią na dno");
  });

  it("an overdue division reads its delay off a colon", () => {
    // Was "Czekają {{days}} {{days:day}}" — right at three, wrong at one and
    // at five, where Polish wants "Czeka".
    setLang("pl");
    const pl = atEach("tavern.divide_plunder_overdue", n => ({ leave: 4, days: n }));
    expect(pl[0]).toContain("Zwłoka: 1 dzień");
    expect(pl[1]).toContain("Zwłoka: 3 dni");
    expect(pl[2]).toContain("Zwłoka: 5 dni");
    for (const line of pl) expect(line).not.toContain("Czekaj");
  });
});

describe("no sentence puts a plural verb straight after a count", () => {
  /**
   * The narrow half of the rule, and the half a test can actually hold: in
   * English a counted noun followed by a bare plural verb is wrong at one, and
   * there is no form of the noun that rescues it.
   *
   * Polish needs a clause to be read, not a regex, so it is not checked here —
   * the three sentences above are pinned instead, and the rule lives in
   * `plurals.ts` where the next author will find it.
   */
  it("in English", () => {
    const PLURAL_VERB = /\{\{\w+\}\}\s+\{\{\w+:\w+\}\}\s+(?:are|were|go|come|have|remain|stand|fall|do|make|take)\b/;
    const offenders = Object.entries(EN as Record<string, string>)
      .filter(([, v]) => typeof v === "string" && PLURAL_VERB.test(v))
      .map(([k]) => k);
    expect(offenders, "name the thing and put the count after a colon").toEqual([]);
  });

  it("and the noun table both columns read is still level", () => {
    // `nounForm` falls back to the English row, so a noun missing from one
    // column would silently answer in the other language.
    for (const id of pluralNounIds()) {
      expect((PL as Record<string, unknown>)[`__noun_${id}`], id).toBeUndefined();
    }
    expect(pluralNounIds().length).toBeGreaterThan(0);
  });
});
