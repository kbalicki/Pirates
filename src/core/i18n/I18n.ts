import type { Lang, LocaleData } from "./types.ts";
import { EN } from "./locales/en.ts";
import { PL } from "./locales/pl.ts";

const LOCALES: Record<Lang, LocaleData> = { en: EN, pl: PL };

let currentLang: Lang = "en";

export function setLang(lang: Lang): void {
  currentLang = lang;
  try {
    localStorage.setItem("pc_lang", lang);
  } catch {
    /* ignore */
  }
}

export function getLang(): Lang {
  return currentLang;
}

/**
 * Pick the language for this session: what he chose last time, else his
 * browser's, else English.
 *
 * The browser half is new in v0.60.0, and it is the other half of the same
 * defect as the untranslated manual. `currentLang` opens on `"en"` and nothing
 * ever asked the reader, so a Polish player got an English game until he found
 * the toggle in Options — while the one screen that was hardcoded Polish
 * (`HelpScene`, 147 strings, no `t()` at all) looked correct to the Polish
 * author and wrong to everybody else. The game did not know who was reading it.
 *
 * A stored choice always wins: this only decides the first load.
 */
export function initLang(): void {
  currentLang = pickLang();
}

/**
 * Decides, rather than nudging: it returns a language for every input, so
 * calling it twice with the same browser gives the same answer whatever the
 * session did in between. An earlier draft only *upgraded* to Polish and left
 * the current value alone otherwise, which made it untestable and would have
 * left a language switch half-applied if it were ever called again.
 */
function pickLang(): Lang {
  try {
    const stored = localStorage.getItem("pc_lang");
    if (stored === "en" || stored === "pl") return stored;
  } catch {
    /* no storage: a private window, or not a browser at all */
  }
  try {
    // Guarded because this file is reachable from tests and from anything
    // running outside a browser, where there is no navigator to ask.
    const nav = typeof navigator === "undefined" ? undefined : navigator;
    const tags = nav?.languages?.length ? nav.languages : [nav?.language ?? ""];
    if (tags.some(tag => typeof tag === "string" && tag.toLowerCase().startsWith("pl"))) {
      return "pl";
    }
  } catch {
    /* ignore */
  }
  return "en";
}

/**
 * Is this string a key the locale tables actually carry?
 *
 * English is the canonical column: `locale_parity.test.ts` keeps the two
 * tables holding the same key set, so asking one is asking both, and asking
 * the English one keeps the answer independent of who is reading the game.
 */
export function hasKey(key: string): boolean {
  return LOCALES["en"]?.[key] !== undefined;
}

/**
 * A `vars` value shaped like the key a name is written under.
 *
 * Core stamps these into saved events instead of the name itself (v0.63.0 —
 * see `names.ts` for why), so the substitution below has to resolve one more
 * step. The shape is narrow on purpose: four known prefixes and the literal
 * `.name` tail, so a captain's daughter, a ship's given name or anything else
 * a var carries can never be mistaken for a key. A save written before that
 * release holds plain English text, which does not match, and prints exactly
 * as it printed then.
 */
const NAME_KEY = /^(?:port|faction|item|ship)\.[a-z0-9_]+\.name$/;

/**
 * Primary translation function.
 * Usage: t("hud.gold") → "Gold" or "Złoto"
 * With interpolation: t("hud.crew", { current: 20, max: 30 })
 *   where locale has: "hud.crew": "Crew: {{current}}/{{max}}"
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  let str = LOCALES[currentLang]?.[key] ?? LOCALES["en"]?.[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      const value = typeof v === "string" && NAME_KEY.test(v) ? t(v) : String(v);
      str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), value);
    }
  }
  return str;
}
