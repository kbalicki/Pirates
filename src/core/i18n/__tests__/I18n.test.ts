import { describe, it, expect, afterEach, vi } from "vitest";
import { initLang, setLang, getLang, t } from "../I18n.ts";

// ===========================================================================
// Which language the game opens in (v0.60.0)
// ===========================================================================

/**
 * `currentLang` opened on `"en"` and nothing ever asked the reader, so a Polish
 * player got an English game until he found the toggle in Options — while the
 * one screen that was hardcoded Polish looked correct to the author and wrong
 * to everybody else. Both halves of that are the same defect: the game did not
 * know who was reading it.
 *
 * The rule these tests pin: a stored choice always wins, the browser decides
 * the first load, and English is what is left.
 */

type Store = Record<string, string>;

/**
 * `vi.stubGlobal`, not assignment: in Node `globalThis.navigator` is a
 * getter-only property and `g.navigator = undefined` throws.
 */
function stub(stored: Store, languages: string[] | null): void {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k in stored ? stored[k] : null),
    setItem: (k: string, v: string) => { stored[k] = v; },
  });
  vi.stubGlobal("navigator", languages
    ? { languages, language: languages[0] ?? "" }
    : undefined);
}

afterEach(() => {
  vi.unstubAllGlobals();
  setLang("en");
});

describe("initLang", () => {
  it("takes the stored choice over the browser", () => {
    stub({ pc_lang: "en" }, ["pl-PL", "pl"]);
    initLang();
    expect(getLang()).toBe("en");
  });

  it("takes the stored choice the other way round too", () => {
    stub({ pc_lang: "pl" }, ["en-GB"]);
    initLang();
    expect(getLang()).toBe("pl");
  });

  it("follows the browser on a first load", () => {
    stub({}, ["pl-PL", "en-US"]);
    initLang();
    expect(getLang()).toBe("pl");
  });

  it("reads past the first tag, because a browser lists several", () => {
    stub({}, ["en-GB", "pl"]);
    initLang();
    expect(getLang()).toBe("pl");
  });

  it("stays English for a browser that asks for neither", () => {
    stub({}, ["de-DE", "fr"]);
    initLang();
    expect(getLang()).toBe("en");
  });

  /** It runs in tests and anywhere else without a browser around it. */
  it("survives having no navigator and no storage at all", () => {
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("navigator", undefined);
    setLang("pl");
    expect(() => initLang()).not.toThrow();
    expect(getLang()).toBe("en");
  });
});

describe("t", () => {
  /**
   * The contract every `t("x") ?? "fallback"` in this codebase was written
   * against, and none of them had: a missing key comes back as the key, never
   * as null. Nineteen unreachable Polish fallbacks were deleted in v0.60.0.
   */
  it("returns the key itself when nothing translates it", () => {
    expect(t("no.such.key.anywhere")).toBe("no.such.key.anywhere");
  });

  it("falls back to English for a key only English has", () => {
    setLang("pl");
    expect(t("help.title")).not.toBe("help.title");
  });
});
