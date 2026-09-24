import { describe, it, expect } from "vitest";
import { PL } from "../locales/pl.ts";
import { EN } from "../locales/en.ts";
import { t, setLang } from "../index.ts";
import { BOARDING_RANGE } from "../../systems/BoardingSystem.ts";
import { HULL_WIDTH } from "../../systems/CombatSystem.ts";
import { DISENGAGE_RANGE_MUL } from "../../engine/CombatEngine.ts";

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

// ===========================================================================
// The HUD line for a landing he cannot see (v0.93.0)
// ===========================================================================

/**
 * `PRESENCE_RANGE` is 400 world px against a spyglass of 65 and a screen
 * 213 x 120 world px wide at the default zoom, so the town whose fate it
 * decides is off the picture at every zoom the game offers. The cordon, the
 * same kind of number, has had a HUD line since v0.22.0; this one had nothing.
 *
 * Six sentences carry it, and `MainMapScene.updateReliefHud` picks between
 * them. That choice is in the scene layer, so what can be checked here is that
 * the six exist in both languages, take their numbers as variables rather than
 * as digits, and that **the scene names exactly these six and no others** - a
 * seventh key added to one locale and not to the picker would simply never be
 * drawn.
 */
describe("the relief watch line", () => {
  const KEYS = [
    "relief.watch_reach", "relief.watch_far",
    "relief.watch_ally_reach", "relief.watch_ally_far",
    "relief.watch_today_reach", "relief.watch_today_far",
  ];

  it("exists in both languages and resolves with a port and a count", () => {
    for (const key of KEYS) {
      expect(PL[key], `PL is missing ${key}`).toBeTruthy();
      expect(EN[key], `EN is missing ${key}`).toBeTruthy();
      for (const [lang, table] of [["pl", PL], ["en", EN]] as const) {
        setLang(lang);
        const line = t(key, { port: "port.port_royal.name", days: 3 });
        expect(line, `${lang} ${key} left a placeholder`).not.toContain("{{");
        expect(line.length, `${lang} ${key} is empty`).toBeGreaterThan(20);
        expect(table[key]).not.toMatch(/\d+\s*px/i);
      }
    }
    setLang("pl");
  });

  it("counts days as a variable, with the plural the language wants", () => {
    setLang("pl");
    expect(t("relief.watch_reach", { port: "port.port_royal.name", days: 1 })).toContain("1 dzień");
    expect(t("relief.watch_reach", { port: "port.port_royal.name", days: 3 })).toContain("3 dni");
    setLang("en");
    expect(t("relief.watch_reach", { port: "port.port_royal.name", days: 1 })).toContain("1 day");
    expect(t("relief.watch_reach", { port: "port.port_royal.name", days: 5 })).toContain("5 days");
    setLang("pl");
  });

  it("is picked from by the scene, and the scene names exactly these six", () => {
    const SRC = import.meta.glob("../../../game/scenes/MainMapScene.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const src = Object.values(SRC)[0];
    expect(src, "MainMapScene was not read").toBeTruthy();
    const named = [...src.matchAll(/"(relief\.watch_[a-z_]+)"/g)].map(m => m[1]);
    expect([...new Set(named)].sort()).toEqual([...KEYS].sort());
  });
});

describe("the break-off distance the manual quotes", () => {
  /**
   * `ESC` asks the engine to break off, and the engine grants it only beyond
   * `DISENGAGE_RANGE_MUL` of the gun range; closer in, the screen answers
   * "too close". The controls page said only "ESC - disengage" until the
   * second reading (v0.98.1), while the timeout page three pages later
   * quoted the 90 % - one number, two sentences, and only one of them knew.
   */
  it("names the same share of the gun range on both pages that mention it", () => {
    const share = `${Math.round(DISENGAGE_RANGE_MUL * 100)}%`;
    for (const [lang, table] of LOCALES) {
      expect(table["battle.help_controls_body"], lang).toContain(share);
      expect(table["battle.help_timeout_body"], lang).toContain(share);
    }
  });
});
