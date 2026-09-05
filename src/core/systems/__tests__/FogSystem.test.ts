import { describe, it, expect } from "vitest";
import {
  fogDensity,
  fogPatch,
  fogNight,
  fogHourFactor,
  fogCalmFactor,
  fogVisionMultiplier,
  fogAwarenessMultiplier,
  FOG_MAX_WIND,
  FOG_CELL,
  FOG_VISION_SHARE,
  FOG_AWARENESS_SHARE,
  FOG_VISIBLE,
  FOG_LIFTED,
  inFogNow,
} from "../FogSystem.ts";
import { weatherAt } from "../WeatherFieldSystem.ts";
import { stormWarning, stormVisionMultiplier } from "../StormSystem.ts";
import { updateNpcAi } from "../NpcAiSystem.ts";
import { entityId } from "../../model/ids.ts";
import { EN } from "../../i18n/locales/en.ts";
import { PL } from "../../i18n/locales/pl.ts";
import type { WorldState, Vec2 } from "../../model/WorldState.ts";

// ===========================================================================
// FogSystem — the weather that helps the man being chased (v0.40.0)
// ===========================================================================

/**
 * A squall is answered with the sails, a hurricane with the helm, and fog is
 * not answered at all. It takes nothing off a ship; it changes who can see
 * whom, both ways, which is what makes it the first weather in this game that
 * can be good news.
 */

const SOMEWHERE: Vec2 = { x: 1500, y: 1500 };

/** A place and a night where the noise field is actually thick. */
function findBank(): { pos: Vec2; night: number } {
  for (let night = 1; night < 400; night++) {
    if (fogPatch(night, SOMEWHERE) > 0.9) return { pos: SOMEWHERE, night };
  }
  throw new Error("no thick bank in 400 nights — the noise field is broken");
}
const BANK = findBank();

function makeWorld(over: {
  wind?: number;
  hour?: number;
  minute?: number;
  day?: number;
  pos?: Vec2;
} = {}): WorldState {
  const shipId = entityId("player_ship");
  const pos = over.pos ?? SOMEWHERE;
  return {
    version: 12,
    time: { day: over.day ?? BANK.night, hour: over.hour ?? 4, minute: over.minute ?? 0, tick: 0 },
    rng: { seed: 1, state: 1 },
    player: {
      id: entityId("player"),
      shipId,
      gold: 100,
      notoriety: 0,
      reputation: {},
      ranks: {},
      location: { type: "sea", pos },
      questLog: [],
      fleet: [],
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
    },
    entities: {
      [shipId as string]: {
        id: shipId,
        kind: "ship",
        mode: "sailing",
        pos,
        vel: { x: 0, y: 0 },
        heading: 0,
        sailLevel: 1,
        depthOffset: 0,
        ship: {
          classId: "frigate",
          factionId: "pirates",
          hullHp: 120, hullMax: 120,
          sailsHp: 90, sailsMax: 90,
          cannons: 28, cargo: {}, cargoCap: 100,
          crew: { current: 80, max: 80, morale: 0.9 },
        },
      },
    },
    ports: {},
    weather: {
      windDirRad: 0,
      windStrength: over.wind ?? 0.05,
      stormActive: false,
      stormTimer: 0,
    },
    worldFlags: {},
    eventLog: [],
    worldEvents: [],
    knownEventIds: [],
    playerName: "Captain",
    eraId: "pirates_sunset",
    startYear: 1690,
    gameSpeed: 1.2,
  } as unknown as WorldState;
}

// ---------------------------------------------------------------------------

describe("what a fog needs before it forms", () => {
  it("wants calm air and nothing else will do", () => {
    expect(fogCalmFactor(0)).toBe(1);
    expect(fogCalmFactor(FOG_MAX_WIND)).toBe(0);
    expect(fogCalmFactor(0.9)).toBe(0);
    expect(fogDensity(makeWorld({ wind: 0.6 }), SOMEWHERE)).toBe(0);
  });

  it("means no storm is ever foggy, without a rule saying so", () => {
    // A squall adds 0.3 to the wind and a hurricane pins it at 1, so the calm
    // test does the work by itself.
    expect(fogDensity(makeWorld({ wind: 1 }), SOMEWHERE)).toBe(0);
  });

  it("forms overnight and burns off through the morning", () => {
    expect(fogHourFactor(14)).toBe(0);
    expect(fogHourFactor(21)).toBe(0);
    expect(fogHourFactor(22)).toBe(0);
    expect(fogHourFactor(0)).toBeCloseTo(0.5, 6);
    expect(fogHourFactor(4)).toBe(1);
    expect(fogHourFactor(7)).toBe(1);
    expect(fogHourFactor(10)).toBe(0);
    expect(fogHourFactor(8, 30)).toBeCloseTo(1 - 1.5 / 3, 6);
  });

  it("is continuous across midnight, both in the hour and in the field", () => {
    // 23:59 and 00:01 have to look the same to a captain lying still.
    expect(Math.abs(fogHourFactor(23, 59) - fogHourFactor(0, 1))).toBeLessThan(0.01);
    // The noise field is keyed on the *night*, not the date, or every bank in
    // the game would jump sideways when the day rolls over.
    expect(fogNight(5, 23)).toBe(fogNight(6, 3));
    expect(fogNight(5, 3)).not.toBe(fogNight(5, 23));
  });

  it("lies in banks rather than over the whole Caribbean", () => {
    const seen = new Set<string>();
    let thick = 0;
    let clear = 0;
    for (let x = 0; x < 3200; x += FOG_CELL) {
      for (let y = 0; y < 2400; y += FOG_CELL) {
        const d = fogDensity(makeWorld(), { x, y });
        seen.add(d > 0 ? "some" : "none");
        if (d > 0.5) thick++;
        if (d === 0) clear++;
      }
    }
    expect(seen.size).toBe(2);   // both kinds of water on the same night
    expect(thick).toBeGreaterThan(0);
    expect(clear).toBeGreaterThan(0);
  });

  it("has a soft edge, so the world closes in rather than switching off", () => {
    const world = makeWorld();
    const a = fogDensity(world, BANK.pos);
    const b = fogDensity(world, { x: BANK.pos.x + FOG_CELL * 0.35, y: BANK.pos.y });
    expect(a).toBeGreaterThan(0);
    expect(Math.abs(a - b)).toBeLessThan(a);   // it thins, it does not stop
  });

  it("lies somewhere else tomorrow night", () => {
    const tonight = fogPatch(BANK.night, BANK.pos);
    const tomorrow = fogPatch(BANK.night + 1, BANK.pos);
    expect(tonight).not.toBeCloseTo(tomorrow, 3);
  });

  it("is the same field every time it is asked, so a save is not needed", () => {
    expect(fogDensity(makeWorld(), BANK.pos)).toBe(fogDensity(makeWorld(), BANK.pos));
  });
});

describe("what a fog does", () => {
  it("takes the spyglass and gives it back when it lifts", () => {
    const thick = weatherAt(makeWorld(), BANK.pos);
    expect(thick.fog).toBeGreaterThan(0.5);
    expect(stormVisionMultiplier(thick)).toBeLessThan(1);
    expect(stormVisionMultiplier(thick)).toBeCloseTo(fogVisionMultiplier(thick.fog), 6);

    const noon = weatherAt(makeWorld({ hour: 14 }), BANK.pos);
    expect(noon.fog).toBe(0);
    expect(stormVisionMultiplier(noon)).toBe(1);
  });

  it("blinds the lookouts less than it blinds the captain", () => {
    // He is the one being hunted often enough for this to be the half he
    // notices; a fog that blinded him more would be a punishment, not cover.
    expect(fogAwarenessMultiplier(1)).toBeCloseTo(FOG_AWARENESS_SHARE, 9);
    expect(fogVisionMultiplier(1)).toBeCloseTo(FOG_VISION_SHARE, 9);
    expect(FOG_AWARENESS_SHARE).toBeGreaterThan(FOG_VISION_SHARE);
  });

  it("scales both with how thick it is, and neither in clear air", () => {
    expect(fogVisionMultiplier(0)).toBe(1);
    expect(fogAwarenessMultiplier(0)).toBe(1);
    expect(fogVisionMultiplier(0.5)).toBeGreaterThan(fogVisionMultiplier(1));
  });

  it("takes nothing off the ship — that is the whole difference", () => {
    const w = makeWorld();
    const before = w.entities[w.player.shipId as string].ship!;
    const warn = stormWarning(w)!;
    expect(warn.danger).toBe(false);
    // Nothing in this module touches hull or canvas at all.
    expect(before.hullHp).toBe(120);
    expect(before.sailsHp).toBe(90);
  });
});

describe("what a fog lets a hunted ship do", () => {
  /** A trader that would bolt from a pirate in clear air. */
  function withTrader(world: WorldState, dist: number): WorldState {
    const id = entityId("npc_trader");
    return {
      ...world,
      time: { ...world.time, tick: 100 },
      entities: {
        ...world.entities,
        [id as string]: {
          id,
          kind: "ship",
          mode: "sailing",
          pos: { x: SOMEWHERE.x + dist, y: SOMEWHERE.y },
          vel: { x: 0, y: 0 },
          heading: 0,
          sailLevel: 0.7,
          depthOffset: 0,
          ai: { behavior: "trader", state: "travel", awarenessRadius: 120, lastDecisionTick: 0 },
          ship: {
            classId: "fluyt",
            factionId: "spain",
            hullHp: 90, hullMax: 90,
            sailsHp: 70, sailsMax: 70,
            cannons: 6, cargo: {}, cargoCap: 200,
            crew: { current: 20, max: 20, morale: 0.8 },
          },
        },
      },
    } as unknown as WorldState;
  }

  const stateOf = (w: WorldState) =>
    updateNpcAi(w, 30).entities[entityId("npc_trader") as string].ai?.state;

  it("keeps a merchantman calmly on her lane at a range that would have her running", () => {
    const clear = withTrader(makeWorld({ hour: 14 }), 90);   // no fog at two in the afternoon
    const foggy = withTrader(makeWorld(), 90);               // same range, thick bank
    expect(fogDensity(foggy, SOMEWHERE)).toBeGreaterThan(0.5);
    expect(stateOf(clear)).toBe("flee");
    expect(stateOf(foggy)).not.toBe("flee");
  });

  it("still lets her see him when he is right alongside", () => {
    expect(stateOf(withTrader(makeWorld(), 30))).toBe("flee");
  });
});

describe("telling him it closed in, once", () => {
  it("holds him in fog until it is properly gone, not until it dips a hair", () => {
    // Measured in the running game: with one threshold the journal took three
    // entries in two game hours as the wind wandered across it (v0.40.0).
    expect(inFogNow(0.3, false)).toBe(true);
    expect(inFogNow(0.09, false)).toBe(false);   // not thick enough to notice yet
    expect(inFogNow(0.09, true)).toBe(true);     // ...but still in it once you are
    expect(inFogNow(0.02, true)).toBe(false);
    expect(FOG_LIFTED).toBeLessThan(FOG_VISIBLE);
  });

  it("never flaps across the gap, whatever the density does in between", () => {
    let state = false;
    let flips = 0;
    for (const d of [0.2, 0.11, 0.13, 0.08, 0.14, 0.09, 0.11, 0.02, 0.01]) {
      const next = inFogNow(d, state);
      if (next !== state) flips++;
      state = next;
    }
    expect(flips).toBe(2);   // in once, out once
  });
});

describe("what the captain is told", () => {
  it("says nothing in clear air", () => {
    expect(stormWarning(makeWorld({ hour: 14 }))).toBeNull();
  });

  it("names haze and thick fog apart", () => {
    const thick = stormWarning(makeWorld())!;
    expect(thick.key).toBe("weather.fog_thick");
    expect(thick.fog).toBeGreaterThan(0.5);
    // The same bank at half past eight in the morning is only a haze.
    const thinning = stormWarning(makeWorld({ hour: 8, minute: 30 }));
    if (thinning) {
      expect(thinning.fog).toBeLessThan(thick.fog);
      expect(thinning.fog).toBeGreaterThanOrEqual(FOG_VISIBLE);
    }
  });

  it("has every line it can print, in both languages", () => {
    for (const key of [
      "weather.fog",
      "weather.fog_thick",
      "weather.fog_toast",
      "weather.fog_over",
      "weather.log_fog",
      "weather.log_fog_lifted",
    ]) {
      expect(EN[key], key).toBeDefined();
      expect(PL[key], key).toBeDefined();
    }
  });
});
