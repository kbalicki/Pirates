import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { t, setLang, getLang, hasKey } from "../I18n.ts";
import { portNameKey, factionNameKey, itemNameKey, shipNameKey, portName } from "../names.ts";
import { CITIES } from "../../data/cities.ts";
import { FACTIONS } from "../../data/factions.ts";
import { ITEMS } from "../../data/items.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { seedInitialEvents } from "../../systems/WorldEventSystem.ts";
import { initPortPrices, initPortInventory } from "../../data/prices.ts";
import { getPortBaseline } from "../../data/economyBaselines.ts";
import { portId, entityId } from "../../model/ids.ts";
import type { WorldState, PortRuntimeState } from "../../model/WorldState.ts";

/**
 * v0.63.0 — the release where a name stopped being a second copy.
 *
 * The defect was visible on a screenshot of the Polish build: *"Dekret
 * krolewski **Spain** zmienia taryfy w koloniach"*. Core built `vars` out of
 * `FACTIONS[x].name`, an English-only field sitting beside the locale tables
 * that already held every one of those names in both languages.
 */

/** The smallest world the event machine will run on. */
function makeWorld(seed: number): WorldState {
  const ports: Record<string, PortRuntimeState> = {};
  for (const key of Object.keys(CITIES)) {
    const baseline = getPortBaseline(key);
    ports[key] = {
      portId: portId(key),
      factionId: CITIES[key].factionId,
      prices: initPortPrices(key),
      inventory: initPortInventory(key),
      shipyardQueue: [],
      availableCrew: 10,
      population: baseline.population,
      wealth: baseline.wealth,
      defense: baseline.defense,
      bonusProduces: [],
    };
  }
  return {
    version: 12,
    time: { day: 1, hour: 12, minute: 0, tick: 0 },
    rng: { seed, state: seed },
    player: {
      id: entityId("player"), shipId: entityId("player_ship"), gold: 500,
      notoriety: 0, reputation: {}, ranks: {},
      location: { type: "sea", pos: { x: 0, y: 0 } },
      questLog: [], fleet: [], lastPlunderDay: 1, citiesCaptured: 0, courtship: {},
    },
    entities: {}, ports,
    weather: { windDirRad: 0, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: {}, eventLog: [], worldEvents: [], knownEventIds: [],
    playerName: "Captain", eraId: "pirates_sunset", startYear: 1690, gameSpeed: 1.2,
  } as unknown as WorldState;
}

let saved: string;

beforeEach(() => {
  saved = getLang();
});

afterEach(() => {
  setLang(saved as "en" | "pl");
});

describe("name keys — one copy of every name", () => {
  it("gives a key the locale tables actually carry, for every town, crown, good and class", () => {
    for (const key of Object.keys(CITIES)) expect(hasKey(portNameKey(key)), key).toBe(true);
    for (const key of Object.keys(FACTIONS)) expect(hasKey(factionNameKey(key)), key).toBe(true);
    for (const key of Object.keys(ITEMS)) expect(hasKey(itemNameKey(key)), key).toBe(true);
    for (const key of Object.keys(SHIP_CLASSES)) expect(hasKey(shipNameKey(key)), key).toBe(true);
  });

  it("falls back to the id itself for something the tables have never heard of", () => {
    // What `TABLE[x]?.name ?? x` did. The point is that a screen never shows
    // `port.atlantis.name` — an unknown id prints as the id, as it always did.
    expect(portNameKey("atlantis")).toBe("atlantis");
    expect(factionNameKey("prussia")).toBe("prussia");
    expect(portName("atlantis")).toBe("atlantis");
  });

  it("reads in the reader's language, not the author's", () => {
    setLang("en");
    expect(portName("havana")).toBe("Havana");
    setLang("pl");
    expect(portName("havana")).toBe("Hawana");
  });
});

describe("t() resolving a name key inside a var", () => {
  it("substitutes the name, not the key", () => {
    setLang("pl");
    const line = t("news.royal_decree", { faction: factionNameKey("spain") });
    // Genitive since v0.69.0 - the headline says "a decree *of* Spain", and the
    // Polish sentence asks for the form with `{{faction:gen}}`.
    expect(line).toContain("Hiszpanii");
    expect(line).not.toContain("faction.spain.name");
    expect(line).not.toContain("Spain");
  });

  it("switches an already-stamped event into the other language", () => {
    // The whole reason the stamp carries a key. A save holds `vars` written on
    // the day the event happened (the v0.43.0 rule), so stamping the rendered
    // name froze the journal into whatever language it was written in.
    const vars = { faction: factionNameKey("england") };
    setLang("en");
    expect(t("news.royal_decree", vars)).toContain("England");
    setLang("pl");
    expect(t("news.royal_decree", vars)).toContain("Anglii");
  });

  it("leaves a var that is not a name key exactly as it was", () => {
    // A save written before v0.63.0 carries the English text itself. It must
    // print as it printed then — no worse, and above all not as a raw key.
    setLang("pl");
    expect(t("news.royal_decree", { faction: "Spain" })).toContain("Spain");
    // And nothing that merely looks close is touched: a ship, a daughter, a
    // free-text label all keep their own words.
    expect(t("hud.gold", {})).toBe(t("hud.gold"));
    expect(t("news.royal_decree", { faction: "port.havana" })).toContain("port.havana");
    expect(t("news.royal_decree", { faction: "faction.spain.nickname" }))
      .toContain("faction.spain.nickname");
  });

  it("does not mistake a number for anything", () => {
    expect(t("news.royal_decree", { faction: 7 })).toContain("7");
  });
});

describe("the world's own text, read in Polish", () => {
  const ENGLISH_CROWNS = ["Spain", "England", "France", "Netherlands"];

  it("opens without an English crown or town in any headline", () => {
    setLang("pl");
    const world = seedInitialEvents(makeWorld(4242));
    expect(world.worldEvents.length).toBeGreaterThan(0);
    for (const ev of world.worldEvents) {
      const line = t(ev.headline, ev.vars as Record<string, string | number>);
      for (const crown of ENGLISH_CROWNS) {
        expect(line, `${ev.id}: ${line}`).not.toContain(crown);
      }
      // And no key leaked through in place of a word.
      expect(line, `${ev.id}: ${line}`).not.toMatch(/\b(?:port|faction|item|ship)\.[a-z0-9_]+\.name\b/);
      expect(line, `${ev.id}: ${line}`).not.toMatch(/\{\{\w+\}\}/);
    }
  });
});
