import { describe, it, expect, afterAll } from "vitest";
import { t, setLang, getLang } from "../I18n.ts";
import {
  NAME_PREFIXES, portNameKey, factionNameKey, itemNameKey, shipNameKey, villageNameKey,
} from "../names.ts";
import { plDeclinedKeys } from "../plForms.ts";
import { EN } from "../locales/en.ts";
import { PL } from "../locales/pl.ts";
import { VILLAGES } from "../../data/villages.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";

// ===========================================================================
// A name stamped into a save is a key, never a word (v0.79.0)
// ===========================================================================

/**
 * v0.63.0 moved the resolution of a name into `t()`: a system stamps
 * `port.havana.name` into a journal entry's `vars` and the substitution turns
 * it into a word in whoever's language is reading. The rule has one moving
 * part, `NAME_KEY` in `I18n.ts`, and one way to get it wrong — a family of
 * names that pattern does not list.
 *
 * `village` was that family for four releases. `VillageSystem` carried a
 * comment explaining, correctly, that a raw key would reach the journal as
 * "village.darien.name", and baked the finished word to avoid it; the comment
 * described the symptom of the missing prefix and was read as a rule. A
 * journal written in English and read in Polish still said *Darien* where the
 * sentence wanted *Darienie*, and nothing could decline it.
 *
 * Two checks here, and they fail for different reasons. The first reads the
 * **source of every system** for the shape of the mistake — a translation call
 * inside something that goes into a save — so a new one cannot be added
 * quietly. The second holds `NAME_PREFIXES` against what `t()` will actually
 * resolve, so a sixth family cannot be half-added.
 */

const original = getLang();
afterAll(() => setLang(original as "en" | "pl"));

const SOURCES = import.meta.glob("../../../{core,game}/**/*.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

/** The body of every `addLogEntry(...)` call in a file, parens balanced. */
function logCalls(src: string): { line: number; body: string }[] {
  const out: { line: number; body: string }[] = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  for (const m of code.matchAll(/addLogEntry\(/g)) {
    let depth = 0;
    let end = code.length;
    for (let i = m.index! + m[0].length - 1; i < code.length; i++) {
      if (code[i] === "(") depth++;
      else if (code[i] === ")" && --depth === 0) { end = i; break; }
    }
    out.push({ line: code.slice(0, m.index!).split("\n").length, body: code.slice(m.index!, end) });
  }
  return out;
}

describe("nothing that goes into a save carries a finished word", () => {
  it("never calls t() inside a journal entry's vars", () => {
    // The one shape that cannot be right. `vars` is written to the save and
    // rendered whenever the log is read, so a word resolved here is a word in
    // the author's language for the life of that career — and, since v0.69.0,
    // a word no Polish sentence can decline.
    const offenders: string[] = [];
    for (const [path, src] of Object.entries(SOURCES)) {
      if (path.includes("__tests__")) continue;
      for (const call of logCalls(src)) {
        const brace = call.body.indexOf("{");
        if (brace >= 0 && /\bt\(/.test(call.body.slice(brace))) {
          offenders.push(`${path.replace(/^.*\/src\//, "")}:${call.line}`);
        }
      }
    }
    expect(offenders, "stamp the key and let t() resolve it").toEqual([]);
  });

  it("stamps no bare faction id where a sentence prints a crown", () => {
    // `PredationSystem` stamped `entity.ship.factionId` straight into two
    // journal entries, so the line read "A england man-of-war has run down a
    // rover" — wrong in **both** languages, which is why the locale tests,
    // which only ever compare the two columns, could not see it.
    const offenders: string[] = [];
    for (const [path, src] of Object.entries(SOURCES)) {
      if (path.includes("__tests__")) continue;
      for (const call of logCalls(src)) {
        for (const v of call.body.matchAll(/\b(?:faction|hunter|prey|owner|crown)\s*:\s*([^,\n}]+)/g)) {
          const expr = v[1].trim();
          if (!/NameKey|NAME|\bkey\b|\bname\b/i.test(expr)) {
            offenders.push(`${path.replace(/^.*\/src\//, "")}:${call.line} — ${expr}`);
          }
        }
      }
    }
    expect(offenders, "a crown reaches the journal through factionNameKey").toEqual([]);
  });
});

describe("every family of names resolves", () => {
  it("has a working key helper for each prefix t() knows", () => {
    // Both halves of the change in one place: a helper whose prefix `NAME_KEY`
    // does not carry prints the key itself, and a prefix with no helper is a
    // pattern nobody feeds.
    const sample: Record<string, string> = {
      port: portNameKey("havana"),
      faction: factionNameKey("spain"),
      item: itemNameKey("sugar_cane"),
      ship: shipNameKey("sloop"),
      village: villageNameKey("darien"),
    };
    expect(Object.keys(sample).sort()).toEqual([...NAME_PREFIXES].sort());
    setLang("en");
    for (const [prefix, key] of Object.entries(sample)) {
      expect(key, prefix).toMatch(/^[a-z]+\.[a-z0-9_]+\.name$/);
      expect(t("news.royal_decree", { faction: key }), prefix).not.toContain(key);
    }
  });

  it("reads a village out of a save in the reader's language", () => {
    // The entry `barter()` writes. Stamped once, read in both columns.
    const vars = { village: villageNameKey("darien"), rum: 6, gold: 3 };
    setLang("en");
    expect(t("village.log_trade", vars)).toContain("Darien");
    setLang("pl");
    const pl = t("village.log_trade", vars);
    expect(pl).toContain("w Darienie");
    expect(pl).not.toContain("village.darien.name");
  });
});

describe("the Polish forms cover the two families that joined in v0.79.0", () => {
  it("has a row for every village", () => {
    const known = new Set(plDeclinedKeys("village"));
    expect(Object.keys(VILLAGES).filter(k => !known.has(k))).toEqual([]);
  });

  it("has a row for every ship class", () => {
    const known = new Set(plDeclinedKeys("ship"));
    expect(Object.keys(SHIP_CLASSES).filter(k => !known.has(k))).toEqual([]);
  });

  it("claims nothing the game does not have", () => {
    expect(plDeclinedKeys("village").filter(k => !VILLAGES[k])).toEqual([]);
    expect(plDeclinedKeys("ship").filter(k => !SHIP_CLASSES[k])).toEqual([]);
  });

  it("puts the three feminine classes into the accusative", () => {
    // Six Polish sentences say "na {{ship:acc}}", "Sprzedano {{ship:acc}}".
    // Six of the nine names are masculine inanimate, where the accusative is
    // the nominative — which is why this was invisible until a frigate sank.
    setLang("pl");
    const line = (cls: string) => t("event.sold_escort", { ship: shipNameKey(cls), price: 900 });
    expect(line("frigate")).toContain("Sprzedano Fregatę");
    expect(line("barque")).toContain("Sprzedano Barkę");
    expect(line("brigantine")).toContain("Sprzedano Brygantynę");
    expect(line("galleon")).toContain("Sprzedano Galeon");
  });
});

describe("a sum of money is a word, not a name", () => {
  /**
   * Thirty-seven English sentences and thirteen Polish ones wrote a money
   * amount as `{{gold}} Gold` / `{{gold}} Złoto` — the capitalised **name of
   * the good** standing where a unit belongs, which is v0.68.0's defect in the
   * one place that defect could not be seen: the word was written into the
   * sentence as a literal instead of passed as `{{item}}`.
   *
   * Measured before the sweep: English had it right in 32 sentences and wrong
   * in 37, Polish right in 33 and wrong in 13. The right ones were the recent
   * releases; nobody had been back over the old ones.
   */
  const money = (table: Record<string, string>, re: RegExp) =>
    Object.entries(table).filter(([, v]) => re.test(v)).map(([k]) => k);

  it("never capitalises the coin after a number", () => {
    expect(money(EN as Record<string, string>, /\{\{[a-z]+\}\} Gold/)).toEqual([]);
    expect(money(PL as Record<string, string>, /\{\{[a-z]+\}\} Złoto/)).toEqual([]);
  });

  it("says it in Polish the way Polish says it", () => {
    // The genitive, which is what the thirty-three correct sentences already
    // used: "za 120 złota", never "za 120 Złoto".
    setLang("pl");
    expect(t("event.repaired", { gold: 120 })).toContain("120 złota");
    setLang("en");
    expect(t("event.repaired", { gold: 120 })).toContain("120 gold");
  });
});
