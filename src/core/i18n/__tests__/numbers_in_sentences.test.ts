import { describe, it, expect } from "vitest";
import { PL } from "../locales/pl.ts";
import { EN } from "../locales/en.ts";
import { t, setLang } from "../index.ts";
import { BOARDING_RANGE } from "../../systems/BoardingSystem.ts";
import { HULL_WIDTH } from "../../systems/CombatSystem.ts";

// ===========================================================================
// A number typed into a sentence is a copy nothing keeps (v0.88.0)
// ===========================================================================

/**
 * Found by pressing `B` in a battle and reading what came back:
 *
 *   *"Podpłyń bliżej (≤30 px), aby abordażować."*
 *
 * The grapnel has reached **77** since v0.86.0, when `BOARDING_RANGE` became
 * `HULL_WIDTH` — a grapnel is thrown from alongside, so its reach is a hull's
 * width. The constant moved and the two sentences that quote it did not,
 * because a sentence is not code and nothing reads it.
 *
 * Both sweeps this repo owns walked past it. The source sweeps ask whether a
 * key is bound and whether a bound key is named; the constants sweep
 * (v0.87.0) reads `src/`, and a locale file is `src/` — but `30 px` inside a
 * string literal is not a constant declaration, so it is invisible to it.
 * `scripts/probe-keys.mjs` found it by pressing the key.
 *
 * Measured across both locales: **31 sentences carry a number**, and the
 * numbers are otherwise right — the town's daily production, the raid's
 * −15 % / −150 / −40, the broadside's nine seconds, a galleon's thirty-six
 * guns, the sixty-second countdown. Four were wrong, and all four were this
 * one number.
 *
 * So the rule is narrow and enforceable: **a distance in pixels is never
 * written into a sentence.** It arrives as a variable or it is not stated.
 */

const LOCALES: Array<[string, Record<string, string>]> = [["pl", PL], ["en", EN]];

describe("a distance is never typed into a sentence", () => {
  it("has no bare pixel figure in any locale string", () => {
    const offenders: string[] = [];
    for (const [lang, table] of LOCALES) {
      for (const [key, text] of Object.entries(table)) {
        if (typeof text !== "string") continue;
        // `{{range}} px` is the shape that cannot drift. A digit before `px`
        // is the shape that did.
        if (/\d+\s*px/i.test(text)) offenders.push(`${lang}:${key} — ${text.slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("states the grapnel's reach, and states the one the code holds", () => {
    for (const lang of ["pl", "en"] as const) {
      setLang(lang);
      const refused = t("battle.cannot_board", { range: BOARDING_RANGE });
      expect(refused, lang).toContain(String(BOARDING_RANGE));
      expect(refused, lang).not.toContain("{{");

      const manual = t("battle.help_boarding_body", { range: BOARDING_RANGE });
      expect(manual, lang).toContain(String(BOARDING_RANGE));
      expect(manual, lang).not.toContain("{{");
    }
    setLang("pl");
  });

  it("keeps that reach a hull's width, which is why it is not 30", () => {
    expect(BOARDING_RANGE).toBe(HULL_WIDTH);
    expect(BOARDING_RANGE).not.toBe(30);
  });

  it("is asked for by both screens that print it", () => {
    const sources = import.meta.glob("../../../game/scenes/{SeaBattleScene,BattleHelpScene}.ts", {
      query: "?raw", import: "default", eager: true,
    }) as Record<string, string>;
    expect(Object.keys(sources)).toHaveLength(2);
    for (const [path, src] of Object.entries(sources)) {
      expect(src, path).toContain("BOARDING_RANGE");
    }
  });
});

/**
 * The sentences that legitimately carry a number, counted.
 *
 * Not a ban: *"the fastest point of sailing (150% of her base speed)"* is
 * prose about a curve, and writing it as a variable would make it unreadable
 * without making it truer. The count is a tripwire — if it climbs, somebody
 * has typed another constant into another sentence, and the release that does
 * it should have to say so.
 */
describe("how many sentences carry a number at all", () => {
  it("counts them, so a new one has to be noticed", () => {
    const carrying: string[] = [];
    for (const [lang, table] of LOCALES) {
      for (const [key, text] of Object.entries(table)) {
        if (typeof text !== "string") continue;
        const withoutVars = text.replace(/\{\{[^}]*\}\}/g, "");
        if (/\d+\s*(%|px|ton|dni|days?|zł|gold)\b/i.test(withoutVars)) carrying.push(`${lang}:${key}`);
      }
    }
    // 31 when this was written: 16 Polish, 15 English.
    expect(carrying.length, carrying.join(", ")).toBeLessThanOrEqual(31);
  });
});
