import { describe, it, expect, afterAll } from "vitest";
import { t, setLang, getLang } from "../I18n.ts";
import { plNameForm, plPhraseFallback, plDeclinedKeys, isPlForm } from "../plForms.ts";
import { EN } from "../locales/en.ts";
import { PL } from "../locales/pl.ts";
import { CITIES } from "../../data/cities.ts";
import { FACTIONS } from "../../data/factions.ts";
import { portNameKey, factionNameKey } from "../names.ts";

// ===========================================================================
// Polish has seven cases, and the game knew one (v0.69.0)
// ===========================================================================

/**
 * Sixty-seven Polish sentences named a port and dropped the **nominative** into
 * the hole whatever the phrase wanted: *"Zamknęli port w Hawana"*, *"Przybito
 * do Kartagena"*, *"Huragan pod Martynika"*. The same defect v0.68.0 found in
 * the twenty sentences that stitch a number to a cargo, in the place where it
 * shows up in nearly every line the game writes.
 *
 * Two kinds of check here, and they catch different things. The first reads the
 * **locale table** for the shape that was wrong — a Polish preposition standing
 * in front of a bare port variable — so a sentence written next year fails the
 * moment it is added. The second renders the sentences that were fixed and
 * pins what they now say, so a table that quietly loses a form is caught too.
 */

const original = getLang();
afterAll(() => setLang(original));

// ---------------------------------------------------------------------------

describe("the declension table covers the world", () => {
  it("has a row for every port on the map", () => {
    // Without this the phrase forms fall back to a guessed `w`/`do`/`z`, which
    // is right for a town on the main and wrong for every island.
    const known = new Set(plDeclinedKeys("port"));
    const missing = Object.keys(CITIES).filter(key => !known.has(key));
    expect(missing, "these ports have no Polish forms").toEqual([]);
  });

  it("has a row for every crown", () => {
    const known = new Set(plDeclinedKeys("faction"));
    const missing = Object.keys(FACTIONS).filter(key => !known.has(key));
    expect(missing, "these crowns have no Polish forms").toEqual([]);
  });

  it("claims no port the map does not have", () => {
    const strays = plDeclinedKeys("port").filter(key => !CITIES[key]);
    expect(strays).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe("a town is in, an island is on", () => {
  const form = (key: string, f: string) =>
    plNameForm("port", key, PL[`port.${key}.name`] as string, f);

  it("puts a town in and takes you to it", () => {
    expect(form("havana", "in")).toBe("w Hawanie");
    expect(form("havana", "to")).toBe("do Hawany");
    expect(form("havana", "from")).toBe("z Hawany");
    expect(form("cartagena", "to")).toBe("do Kartageny");
    expect(form("cartagena", "ins")).toBe("Kartageną");
  });

  it("puts an island on and takes you onto it", () => {
    // The reason a second table of forms was not enough on its own: the
    // preposition is a fact about the place, not about the sentence.
    expect(form("martinique", "in")).toBe("na Martynice");
    expect(form("martinique", "to")).toBe("na Martynikę");
    expect(form("tortuga", "in")).toBe("na Tortudze");
    expect(form("barbados", "in")).toBe("na Barbadosie");
    expect(form("bermuda", "in")).toBe("na Bermudach");
    expect(form("bermuda", "from")).toBe("z Bermudów");
  });

  it("leaves a name Polish does not decline exactly as it is", () => {
    // Thirty of the forty-five. The only thing the table says about them is
    // which preposition they take.
    expect(form("santo_domingo", "in")).toBe("w Santo Domingo");
    expect(form("santo_domingo", "to")).toBe("do Santo Domingo");
    expect(form("st_kitts", "in")).toBe("na St. Kitts");
    expect(form("curacao", "to")).toBe("na Curaçao");
  });

  it("declines the crowns without a preposition, because a crown is not a place", () => {
    const crown = (key: string, f: string) =>
      plNameForm("faction", key, PL[`faction.${key}.name`] as string, f);
    expect(crown("spain", "ins")).toBe("Hiszpanią");
    expect(crown("spain", "gen")).toBe("Hiszpanii");
    expect(crown("england", "acc")).toBe("Anglię");
    expect(crown("pirates", "dat")).toBe("Piratom");
  });

  it("answers nothing for a form it does not know, so the caller can fall back", () => {
    expect(plNameForm("port", "havana", "Hawana", "vocative")).toBeUndefined();
    expect(plNameForm("item", "food", "Jedzenie", "gen")).toBeUndefined();
    expect(plNameForm("port", "atlantis", "Atlantyda", "in")).toBeUndefined();
    expect(isPlForm("gen")).toBe(true);
    expect(isPlForm("nope")).toBe(false);
  });

  it("still writes a preposition when it cannot decline the name", () => {
    // The one guess this file makes, and the reason a missed call site degrades
    // to what the sentence said before v0.69.0 instead of losing a word.
    expect(plPhraseFallback("in", "Hawana")).toBe("w Hawana");
    expect(plPhraseFallback("to", "Hawana")).toBe("do Hawana");
    expect(plPhraseFallback("acc", "Hawana")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

/**
 * The shape that was wrong, read off the locale table itself.
 *
 * This is the check that outlives the sixty-seven: it does not care which
 * sentences exist today, only that none of them puts a Polish preposition in
 * front of a variable that carries a place or a crown. A line added next year
 * with `w {{port}}` in it fails here.
 */
describe("no Polish sentence leaves a name bare after a preposition", () => {
  /** Variables that are known to carry a `port.*.name` or `faction.*.name`. */
  const NAMED_VARS = [
    "port", "city", "bound", "other", "faction", "victim", "crown", "patron",
  ];
  const PREPOSITIONS = ["w", "we", "z", "ze", "do", "pod", "na", "od", "przez", "ku", "nad"];

  const offenders: string[] = [];
  for (const [key, line] of Object.entries(PL)) {
    if (typeof line !== "string") continue;
    for (const v of NAMED_VARS) {
      for (const prep of PREPOSITIONS) {
        if (new RegExp(`(^|[\\s(,.;:!?"„”])${prep}\\s+\\{\\{${v}\\}\\}`).test(line)) {
          offenders.push(`${key}: "${prep} {{${v}}}"`);
        }
      }
    }
  }

  it("reads the whole table", () => {
    // The companion assertion: a sweep that reads nothing passes for the wrong
    // reason (v0.64.0).
    expect(Object.keys(PL).length).toBeGreaterThan(900);
  });

  it("finds none", () => {
    expect(offenders).toEqual([]);
  });

  it("asks only for forms the table can build", () => {
    const bad: string[] = [];
    for (const [key, line] of Object.entries(PL)) {
      if (typeof line !== "string") continue;
      for (const m of line.matchAll(/\{\{[A-Za-z_][A-Za-z0-9_]*:([a-z]+)\}\}/g)) {
        if (!isPlForm(m[1])) bad.push(`${key}: :${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("leaves English alone", () => {
    // English has one form and one preposition; the whole mechanism is Polish.
    const marked = Object.entries(EN)
      .filter(([, line]) => typeof line === "string" && /\{\{\w+:[a-z]+\}\}/.test(line))
      .map(([key]) => key);
    expect(marked).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

/**
 * And what the fixed sentences actually say now, end to end through `t()`.
 *
 * Rendered, not inspected: the string, the table and the substitution all have
 * to agree, and only the rendered line can show that they do.
 */
describe("the sentences that were wrong", () => {
  const pl = (key: string, vars: Record<string, string | number>) => {
    setLang("pl");
    const out = t(key, vars);
    setLang("en");
    return out;
  };

  it("says where a thing happened", () => {
    expect(pl("news.famine", { port: portNameKey("havana") }))
      .toContain("w Hawanie");
    expect(pl("news.famine", { port: portNameKey("martinique") }))
      .toContain("na Martynice");
    expect(pl("warehouse.title", { port: portNameKey("tortuga") }))
      .toBe("Magazyn na Tortudze");
  });

  it("says where a ship is going and where she came from", () => {
    expect(pl("event.arrived", { port: portNameKey("cartagena") }))
      .toBe("Przybito do Kartageny");
    expect(pl("event.departed", { port: portNameKey("barbados") }))
      .toBe("Wypłynięto z Barbadosu");
    expect(pl("event.arrived", { port: portNameKey("guadeloupe") }))
      .toBe("Przybito na Gwadelupę");
  });

  it("says what is being attacked", () => {
    expect(pl("siege.title", { port: portNameKey("panama") })).toBe("Szturm na Panamę");
    expect(pl("siege.title", { port: portNameKey("st_kitts") })).toBe("Szturm na St. Kitts");
  });

  it("says what the weather is standing over", () => {
    expect(pl("weather.log_hurricane", { port: portNameKey("bermuda") }))
      .toContain("pod Bermudami");
    expect(pl("weather.log_hurricane_bound", {
      port: portNameKey("havana"), bound: portNameKey("santiago"),
    })).toContain("pod Hawaną, idzie na Santiago");
  });

  it("says whose letter it is", () => {
    expect(pl("event.letter_of_marque", { faction: factionNameKey("spain") }))
      .toContain("od Hiszpanii");
    expect(pl("governor.reputation_label", {
      faction: factionNameKey("england"), level: "sojusznik", value: 80,
    })).toContain("z Anglią");
  });

  it("still reads correctly when the variable is not a key at all", () => {
    // A save written before v0.69.0, or a caller that resolved the name too
    // early: the preposition has to survive.
    expect(pl("news.famine", { port: "Hawana" })).toContain("w Hawana");
    expect(pl("event.arrived", { port: "Hawana" })).toBe("Przybito do Hawana");
  });

  it("leaves the English sentence exactly as it was", () => {
    setLang("en");
    expect(t("event.arrived", { port: portNameKey("cartagena") })).toBe("Arrived at Cartagena");
    expect(t("siege.title", { port: portNameKey("panama") })).toBe("Assault on Panama");
  });
});

// ---------------------------------------------------------------------------

describe("every sentence still fills every hole", () => {
  it("renders the whole Polish table for a declining port without leaving a placeholder", () => {
    setLang("pl");
    const vars: Record<string, string | number> = {
      port: portNameKey("martinique"), city: portNameKey("havana"),
      bound: portNameKey("tortuga"), other: portNameKey("barbados"),
      from: portNameKey("cartagena"), to: portNameKey("panama"),
      faction: factionNameKey("spain"), victim: factionNameKey("england"),
      crown: factionNameKey("france"), patron: factionNameKey("netherlands"),
      against: factionNameKey("spain"), owner: factionNameKey("spain"),
      faction1: factionNameKey("spain"), faction2: factionNameKey("england"),
      holder: factionNameKey("france"), ally: factionNameKey("netherlands"),
      enemy: factionNameKey("spain"), target: portNameKey("havana"),
      rendezvous: portNameKey("havana"),
    };
    const left: string[] = [];
    for (const key of Object.keys(PL)) {
      const out = t(key, vars);
      // A form that survived substitution means a placeholder the renderer
      // could not read - which prints on the screen exactly as it is written.
      if (/\{\{\w+:[a-z]+\}\}/.test(out)) left.push(key);
      // And a name key that reached the screen raw (v0.63.0's defect).
      if (/\b(?:port|faction)\.[a-z0-9_]+\.name\b/.test(out)) left.push(key + " (raw key)");
    }
    setLang("en");
    expect(left).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

/**
 * And the rule that keeps all of it true, read off the source.
 *
 * `t("siege.title", { port: t("port." + key + ".name") })` was the shape that
 * made the screen say *"Szturm na Hawana"* while the string table and the
 * declension table were both already right: a name resolved at the call site
 * is a finished word, and a finished word cannot be put into a case. v0.63.0
 * asked for the key rather than the name so a saved journal could change
 * language; v0.69.0 needs it so a sentence can change case. Same rule, second
 * reason, and this is the check that enforces it - the `.priceMul` shape of
 * v0.64.0, the only kind of test that can see a line no path under test runs.
 */
describe("a name handed to a sentence is a key, never a finished word", () => {
  const SOURCES = import.meta.glob("../../../**/*.ts", {
    query: "?raw", import: "default", eager: true,
  }) as Record<string, string>;

  const FILES = Object.entries(SOURCES).filter(([path]) => !path.includes("__tests__"));

  it("reads the files that could break it", () => {
    expect(FILES.length).toBeGreaterThan(150);
    const names = FILES.map(([p]) => p);
    expect(names.some(p => p.endsWith("CityAssaultScene.ts"))).toBe(true);
    expect(names.some(p => p.endsWith("PortScene.ts"))).toBe(true);
  });

  it("finds no resolved port or crown name passed as a variable", () => {
    // `port: t("port." + key + ".name")` and its template-literal twin. A bare
    // `t("port." + key + ".name")` drawn on its own is fine and is everywhere -
    // what is forbidden is handing one to another string as a variable.
    const RESOLVED =
      /:\s*t\(\s*(?:"(?:port|faction)\."\s*\+|`(?:port|faction)\.\$\{)/;
    const offenders = FILES
      .filter(([, src]) => RESOLVED.test(src))
      .map(([path]) => path);
    expect(offenders, "these hand a finished name to a sentence").toEqual([]);
  });
});
