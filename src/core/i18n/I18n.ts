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

export function initLang(): void {
  try {
    const stored = localStorage.getItem("pc_lang");
    if (stored === "en" || stored === "pl") {
      currentLang = stored;
    }
  } catch {
    /* ignore */
  }
}

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
      str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
    }
  }
  return str;
}
