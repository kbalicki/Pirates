import { describe, it, expect } from "vitest";
import { EN } from "../locales/en.ts";
import { PL } from "../locales/pl.ts";
import { CITIES } from "../../data/cities.ts";
import { ITEMS } from "../../data/items.ts";
import { FACTIONS } from "../../data/factions.ts";
import { ERAS } from "../../data/eras.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";
import { FACTION_RANKS } from "../../data/ranks.ts";
import type { WorldEventType } from "../../model/WorldState.ts";

// ===========================================================================
// The keys nobody writes out — built at runtime from the data (v0.31.0)
// ===========================================================================

/**
 * `t()` does not throw on a key it has never heard of; it puts the key itself
 * on the screen. Every check that could catch that is therefore a *screen*, and
 * this release cost two of them: a `{{faction1}}` printed raw on a tavern
 * noticeboard, and a fifty-two-year-old war announced as "War declared!".
 *
 * A key written out in full is safe — a reader sees it next to the string. The
 * dangerous ones are built from data at the call site:
 *
 *     t("port." + portKey + ".name")
 *     t("item." + id + ".name")
 *     t("mapevent." + mark.type)
 *
 * Nothing connects the table of ports to the table of strings, so adding the
 * forty-sixth town, the tenth ship class or a new item is a silent way to print
 * `port.tortuga_nueva.name` across the Caribbean. These tests are that
 * connection: one per family of runtime-built key, checked against the data the
 * call site actually iterates.
 */

function bothHave(keys: string[], label: string): void {
  const missingEn = keys.filter(k => !(k in EN));
  const missingPl = keys.filter(k => !(k in PL));
  expect(missingEn, `${label} missing from en.ts`).toEqual([]);
  expect(missingPl, `${label} missing from pl.ts`).toEqual([]);
}

describe("keys the game builds from its own data", () => {
  it("names every town on the map (PortMarkerRenderer, PortScene, and six more)", () => {
    bothHave(Object.keys(CITIES).map(k => `port.${k}.name`), "port.<key>.name");
  });

  it("names every tradeable good (merchant's counter, hold, CityInfoScene)", () => {
    bothHave(Object.keys(ITEMS).map(k => `item.${k}.name`), "item.<id>.name");
  });

  it("names every crown (flags, sieges, character creation)", () => {
    bothHave(Object.keys(FACTIONS).map(k => `faction.${k}.name`), "faction.<id>.name");
  });

  it("names every ship class (shipyard, fleet tab, encounter)", () => {
    bothHave(Object.keys(SHIP_CLASSES).map(k => `ship.${k}.name`), "ship.<classId>.name");
  });

  it("names every era on the character screen", () => {
    bothHave(Object.keys(ERAS).map(k => `era.${k}.name`), "era.<id>.name");
  });

  it("names every rank of every crown", () => {
    const keys = Object.entries(FACTION_RANKS)
      .flatMap(([faction, def]) => def.ranks.map((_, i) => `rank.${faction}.${i}`));
    expect(keys.length).toBeGreaterThan(20);
    bothHave(keys, "rank.<faction>.<n>");
  });

  it("names every town type, size and wealth band shown on the approach", () => {
    bothHave([...new Set(Object.values(CITIES).map(c => c.type))].map(t => `port_type.${t}`), "port_type.<type>");
    bothHave([...new Set(Object.values(CITIES).map(c => c.population))].map(p => `city.pop_${p}`), "city.pop_<size>");
    bothHave(["poor", "modest", "prosperous", "wealthy"].map(w => `city.wealth_${w}`), "city.wealth_<band>");
  });

  it("names every zoom level and asset pack in the options menu", () => {
    bothHave(Array.from({ length: 14 }, (_, i) => `settings.zoom.z${i + 1}`), "settings.zoom.<level>");
    bothHave(["basic", "buccaneer", "corsair"].map(p => `settings.pack.${p}`), "settings.pack.<pack>");
  });

  it("names every reputation level", () => {
    bothHave(["hostile", "unfriendly", "neutral", "friendly", "allied"].map(l => `rep.${l}`), "rep.<level>");
  });

  it("names every world event a chart mark can carry (v0.30.0)", () => {
    // The five types `MapEventSystem` excludes are about crowns, not towns, and
    // never reach the renderer — see NOT_A_TOWN_MARK there.
    const marked: WorldEventType[] = [
      "epidemic", "pirate_raid", "trade_boom", "slave_revolt", "hurricane",
      "treasure_fleet", "new_governor", "gold_discovery", "native_raid",
      "famine", "harvest", "royal_decree",
    ];
    bothHave(marked.map(t => `mapevent.${t}`), "mapevent.<type>");
  });
});

describe("the two locales are the same table", () => {
  it("has no key in one language and not the other", () => {
    expect(Object.keys(EN).filter(k => !(k in PL)), "in EN, not in PL").toEqual([]);
    expect(Object.keys(PL).filter(k => !(k in EN)), "in PL, not in EN").toEqual([]);
  });

  it("interpolates the same variables in both", () => {
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort();
    const mismatched = Object.keys(EN).filter(k => {
      const a = vars(EN[k]), b = vars(PL[k] ?? "");
      return a.join(",") !== b.join(",");
    });
    // A variable present in one language and not the other is a placeholder
    // that prints raw for exactly half the players.
    expect(mismatched, "keys whose {{vars}} differ between en and pl").toEqual([]);
  });
});
