/**
 * How many of them there are, said correctly.
 *
 * v0.69.0 gave the port and the crown their cases and left this open, and it
 * has been on the list since v0.68.0 with the design already written out. The
 * defect is one line long and it is everywhere: the Polish string says
 * `{{count}} ton`, which is right for five and wrong for one and for two.
 *
 * ## Why this is not a rounding-error of a problem
 *
 * Measured over the code that produces these numbers, not over the strings:
 *
 * - `SurgeonSystem.tendSickBay` takes 30% of the sick bay a day, never fewer
 *   than one, so a bay that is draining ends every time on ones. **55.5%** of
 *   the "N men back on the muster roll" lines the game can write say **one**,
 *   and 49.9% of the ones about men who died.
 * - `CrewConsumptionSystem` computes starvation deaths as
 *   `max(1, floor(crew * rate))`, so one is not merely reachable, it is built
 *   in: **67.1%** of the toasts it can print say one.
 * - `VillageSystem` pays 2, 3, 4 or 5 tons of gold for the rum. Polish wants
 *   "2 tony" and "5 ton", so **three of its four possible sentences** were
 *   ungrammatical.
 *
 * The most common value of the number was the one value the sentence could
 * not say.
 *
 * ## The shape
 *
 * `{{days}} {{days:day}}` — the same placeholder grammar `{{port:acc}}` uses
 * (v0.69.0), with the *count* as the variable and the *noun* as the form. The
 * English table answers it too, which is the difference from `plForms`: "1
 * days out" is as wrong as "1 dni", and v0.72.0 had to give the last two days
 * of a passage sentences of their own to dodge exactly this.
 *
 * ## What it does not do
 *
 * **Case.** The forms below are the counting register — what follows a bare
 * digit — and a sentence that wants the noun somewhere else in the grammar
 * needs its own entry (`soldier_ins`, `soldier_dat`) rather than a second
 * mechanism. Three sentences need that; a case × number table for all ten
 * nouns would be thirty rows to serve three.
 *
 * **Agreement on the verb or the participle.** Measured in v0.81.0 and
 * **decided against a mechanism**, which is the answer this note was waiting
 * for since v0.74.0.
 *
 * Polish makes a numeral phrase take three shapes: `1 działo zostało zbite`,
 * `3 działa zostały zbite`, `5 dział zostało zbitych`. A variable cannot carry
 * that; the sentence would have to choose a variant. So the question is how
 * many sentences actually need one.
 *
 * **Three, out of eighty-nine.** The sweep is in two halves and the second one
 * is what makes the answer small:
 *
 *   - **Eighty-nine** Polish strings print a counted noun.
 *   - Of those, the ones whose noun is **masculine-personal** (`man`, `hand`,
 *     `soldier`, `member`, `wounded`) take the genitive from two upwards, and
 *     the verb stays third-person singular at one, at three and at five. Forty
 *     eight sentences, none of which has a problem.
 *   - Of the remaining fifty-three, almost every one is a **fragment** - `- 5
 *     dni`, `jeszcze 3 dni`, `za 6 ton` - or has a verb belonging to something
 *     else in the sentence (`Bateria otwiera ogień:`, `Tutejszy kupiec ma`).
 *     Counted: twenty-seven distinct words stand in front of a counted
 *     non-personal noun in this table, and all but one of them are a
 *     preposition, a punctuation mark or an imperative.
 *
 * The three that needed it are reworded so the **count is never the subject**
 * of a verb: the cargo goes with her, and how much it is follows the colon.
 * `plural_agreement.test.ts` renders them at one, three and five.
 *
 * Two of the three were written **the day before this measurement**, in
 * v0.80.0, and were wrong in **English as well** ("1 ton go with her"). That
 * is the finding worth carrying: this is not a historical defect being cleaned
 * up, it is one still being introduced, and it is invisible to a parity test
 * because both columns say it wrong.
 *
 * **The rule, for whoever writes the next sentence:** a count may be an
 * object, an apposition or a bare reading. It may not be a subject. If the
 * sentence wants to say that something happened to N of a thing, name the
 * thing and put N after a colon.
 */

import type { Lang } from "./types.ts";

/**
 * Polish counts in three: one, a few, and a heap of them.
 *
 * `few` is 2-4, and famously *not* 12-14 — the teens take the heap form, and
 * then 22-24 go back to `few`. English has two categories and reads `few` as
 * `many`, which is why the table below lets a language leave `few` out.
 */
export type PluralCategory = "one" | "few" | "many";

export type PluralNoun = { one: string; few?: string; many: string };

/**
 * Which of the three a number takes in Polish.
 *
 * Non-integers fall to `many`: Polish actually wants the genitive **singular**
 * there ("1,5 tony"), but nothing in this game prints a fractional count into
 * a sentence, and inventing a fourth category to serve nobody is how a table
 * grows rows that are never read.
 */
export function plCategory(n: number): PluralCategory {
  const abs = Math.abs(n);
  if (!Number.isInteger(abs)) return "many";
  if (abs === 1) return "one";
  const last = abs % 10;
  const teen = abs % 100;
  if (last >= 2 && last <= 4 && !(teen >= 12 && teen <= 14)) return "few";
  return "many";
}

/**
 * The nouns a count is ever printed next to, and how they bend.
 *
 * Read the Polish column as the counting register: *1 żołnierz, 2 żołnierzy,
 * 5 żołnierzy*. Masculine-personal nouns take the genitive from two upwards
 * ("dwóch żołnierzy"), so for those only the `one` form differs and the
 * change is small and safe. `działo` and `tona` are the ones where all three
 * differ, and they are the ones where the old text was wrong at two as well
 * as at one.
 *
 * `man` and `hand` are the same word in Polish and two different words in
 * English, which is exactly the reason the noun is named by the sentence
 * rather than derived from the variable.
 */
const NOUNS: Record<Lang, Record<string, PluralNoun>> = {
  pl: {
    day: { one: "dzień", few: "dni", many: "dni" },
    // `od pięciu dni` but `od jednego dnia`: one sentence wants the
    // genitive, and a second entry is cheaper than a case dimension.
    day_gen: { one: "dnia", few: "dni", many: "dni" },
    soldier: { one: "żołnierz", few: "żołnierzy", many: "żołnierzy" },
    soldier_ins: { one: "żołnierzem", few: "żołnierzami", many: "żołnierzami" },
    soldier_dat: { one: "żołnierzowi", few: "żołnierzom", many: "żołnierzom" },
    man: { one: "człowiek", few: "ludzi", many: "ludzi" },
    hand: { one: "człowiek", few: "ludzi", many: "ludzi" },
    gun: { one: "działo", few: "działa", many: "dział" },
    ton: { one: "tona", few: "tony", many: "ton" },
    // "Kupiono jedną tonę": the counter's own line wants the accusative,
    // and the counting register cannot supply it.
    ton_acc: { one: "tonę", few: "tony", many: "ton" },
    wounded: { one: "ranny", few: "rannych", many: "rannych" },
    member: { one: "członek załogi", few: "członków załogi", many: "członków załogi" },
    point: { one: "punkt", few: "punkty", many: "punktów" },
  },
  en: {
    day: { one: "day", many: "days" },
    day_gen: { one: "day", many: "days" },
    soldier: { one: "soldier", many: "soldiers" },
    soldier_ins: { one: "soldier", many: "soldiers" },
    soldier_dat: { one: "soldier", many: "soldiers" },
    man: { one: "man", many: "men" },
    hand: { one: "hand", many: "hands" },
    gun: { one: "gun", many: "guns" },
    ton: { one: "ton", many: "tons" },
    ton_acc: { one: "ton", many: "tons" },
    wounded: { one: "wounded man", many: "wounded" },
    member: { one: "crew member", many: "crew members" },
    point: { one: "point", many: "points" },
  },
};

/** Is this the name of a noun rather than of a grammatical case? */
export function isPluralNoun(id: string): boolean {
  return NOUNS.en[id] !== undefined;
}

/** Every noun the tables know, for the tests that hold the two columns level. */
export function pluralNounIds(): string[] {
  return Object.keys(NOUNS.en);
}

/**
 * The form of `id` that goes with `n`, or nothing if `id` names no noun.
 *
 * Nothing rather than a guess: `t()` falls through to the case machinery on a
 * miss, and a noun table that answered for `{{port:acc}}` would silently eat
 * every declension in the game.
 */
export function nounForm(lang: Lang, id: string, n: number): string | undefined {
  const row = NOUNS[lang]?.[id] ?? NOUNS.en[id];
  if (!row) return undefined;
  const category = lang === "pl" ? plCategory(n) : (Math.abs(n) === 1 ? "one" : "many");
  if (category === "one") return row.one;
  if (category === "few") return row.few ?? row.many;
  return row.many;
}
