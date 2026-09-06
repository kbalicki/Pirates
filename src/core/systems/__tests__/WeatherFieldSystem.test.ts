import { describe, it, expect } from "vitest";
import {
  weatherAt,
  weatherAtPlayer,
  hurricaneAt,
  hurricaneEyes,
  hurricaneTrack,
  hurricaneProgress,
  knownHurricanes,
  hurricaneRigLoss,
  hurricaneHullLoss,
  stormFloored,
  ZONE_WIND_PULL,
  HURRICANE_RADIUS,
  HURRICANE_WIND,
  HURRICANE_HULL_FLOOR,
  HURRICANE_RIG_FLOOR,
  HURRICANE_VISION_SHARE,
} from "../WeatherFieldSystem.ts";
import { tickStormDamage, stormWarning, stormVisionMultiplier, STORM_VISION_SHARE, STORM_SAFE_SAIL } from "../StormSystem.ts";
import { MAP_ZONES } from "../../data/mapZones.ts";
import { CITIES } from "../../data/cities.ts";
import { FOUNDERING_THRESHOLD, RIG_TIERS, hullCondition, rigCondition } from "../DamageSystem.ts";
import { headingDiff, normalizeHeading, vecToHeading } from "../../services/Geometry.ts";
import { entityId } from "../../model/ids.ts";
import { EN } from "../../i18n/locales/en.ts";
import { PL } from "../../i18n/locales/pl.ts";
import type { WorldState, Vec2, WorldEventState } from "../../model/WorldState.ts";

// ===========================================================================
// WeatherFieldSystem — the weather has a place on the chart (v0.39.0)
// ===========================================================================

/**
 * Two weathers that had never been introduced: one global wind for the whole
 * Caribbean, and a `hurricane` world event with a chart pin, a headline and an
 * economic bite that never once touched the water it stood over.
 *
 * What is asserted here is the join. The map's own wind zones finally steer
 * something; a hurricane is a real blow with a centre the compass points at;
 * and it is answered with the helm rather than the sails, because it stops at
 * boundaries the HUD already names instead of at nothing.
 */

const CARTAGENA = CITIES.cartagena.pos;
const TRADE_BELT = MAP_ZONES.find(z => z.zoneId === "trade_winds_north")!;
/** Well inside the trade belt, which is the one zone with a wind bias. */
const IN_THE_BELT: Vec2 = { x: TRADE_BELT.rect.x + 600, y: TRADE_BELT.rect.y + 250 };
/** Open sea: no zone, no storm. */
const NOWHERE: Vec2 = { x: 1500, y: 1500 };

function makeWorld(over: {
  pos?: Vec2;
  sail?: number;
  mode?: "sailing" | "landed";
  hullHp?: number;
  sailsHp?: number;
  day?: number;
  events?: Partial<WorldEventState>[];
  fleet?: { hullHp: number; hullMax: number; sailsHp: number; sailsMax: number }[];
  wind?: { dir: number; strength: number };
} = {}): WorldState {
  const shipId = entityId("player_ship");
  const pos = over.pos ?? NOWHERE;
  return {
    version: 12,
    time: { day: over.day ?? 10, hour: 12, minute: 0, tick: 0 },
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
      fleet: (over.fleet ?? []).map(f => ({
        classId: "sloop",
        hullHp: f.hullHp, hullMax: f.hullMax,
        sailsHp: f.sailsHp, sailsMax: f.sailsMax,
        cannons: 8, crew: 30,
      })),
      lastPlunderDay: 1,
      citiesCaptured: 0,
      courtship: {},
    },
    entities: {
      [shipId as string]: {
        id: shipId,
        kind: "ship",
        mode: over.mode ?? "sailing",
        pos,
        vel: { x: 0, y: 0 },
        heading: 0,
        sailLevel: over.sail ?? 1,
        depthOffset: 0,
        ship: {
          classId: "frigate",
          factionId: "england",
          hullHp: over.hullHp ?? 120, hullMax: 120,
          sailsHp: over.sailsHp ?? 90, sailsMax: 90,
          cannons: 28, cargo: {}, cargoCap: 100,
          crew: { current: 80, max: 80, morale: 0.9 },
        },
      },
    },
    ports: {},
    weather: {
      windDirRad: over.wind?.dir ?? 0,
      windStrength: over.wind?.strength ?? 0.4,
      stormActive: false,
      stormTimer: 0,
    },
    worldFlags: {},
    eventLog: [],
    worldEvents: (over.events ?? []).map((e, i) => ({
      id: `ev_${i}`,
      type: "hurricane",
      startDay: 1,
      endDay: 100,
      ports: ["cartagena"],
      factions: [],
      severity: 3,
      headline: "news.hurricane",
      vars: {},
      ...e,
    })) as WorldEventState[],
    knownEventIds: [],
    playerName: "Captain",
    eraId: "pirates_sunset",
    startYear: 1690,
    gameSpeed: 1.2,
  } as unknown as WorldState;
}

const blowing = (over: Parameters<typeof makeWorld>[0] = {}) =>
  makeWorld({ pos: CARTAGENA, events: [{}], ...over });

const rig = (w: WorldState) => w.entities[w.player.shipId as string].ship!.sailsHp;
const hull = (w: WorldState) => w.entities[w.player.shipId as string].ship!.hullHp;

// ---------------------------------------------------------------------------

describe("the open sea is still the open sea", () => {
  it("hands back the prevailing wind where there is no zone and no storm", () => {
    const w = makeWorld({ wind: { dir: 1.2, strength: 0.4 } });
    const here = weatherAt(w, NOWHERE);
    expect(here.windDirRad).toBe(1.2);
    expect(here.windStrength).toBe(0.4);
    expect(here.hurricane).toBe(0);
    expect(here.stormActive).toBe(false);
  });

  it("is the weather under the player's own keel when nobody says where", () => {
    const w = makeWorld({ pos: IN_THE_BELT });
    expect(weatherAtPlayer(w)).toEqual(weatherAt(w, IN_THE_BELT));
  });
});

describe("the map's wind zones finally steer something", () => {
  // `windDirBias` and `windStrengthBias` have been on the trade belt and the
  // Gulf since the map was drawn, and the only thing that read the table was
  // `EncounterSystem.checkEncounters`, which nothing calls. The fourth
  // producer-with-no-consumer in this codebase (v0.39.0).
  it("pulls the wind toward the trades inside the belt", () => {
    const w = makeWorld({ wind: { dir: 0, strength: 0.2 } });
    const here = weatherAt(w, IN_THE_BELT);
    const wanted = normalizeHeading(TRADE_BELT.windDirBias!);
    expect(here.windDirRad).toBeCloseTo(
      normalizeHeading(headingDiff(0, wanted) * ZONE_WIND_PULL), 6,
    );
    expect(here.windStrength).toBeCloseTo(0.2 + (TRADE_BELT.windStrengthBias! - 0.2) * ZONE_WIND_PULL, 6);
  });

  it("holds the belt steadier than the open sea in a calm", () => {
    const w = makeWorld({ wind: { dir: 0, strength: 0.1 } });
    expect(weatherAt(w, IN_THE_BELT).windStrength)
      .toBeGreaterThan(weatherAt(w, NOWHERE).windStrength);
  });

  it("is a tendency, not a rail — the season is still in the answer", () => {
    const a = weatherAt(makeWorld({ wind: { dir: 0, strength: 0.4 } }), IN_THE_BELT);
    const b = weatherAt(makeWorld({ wind: { dir: 2, strength: 0.4 } }), IN_THE_BELT);
    expect(a.windDirRad).not.toBeCloseTo(b.windDirRad, 3);
    expect(ZONE_WIND_PULL).toBeLessThan(1);
  });

  it("leaves the sea outside every zone exactly as the season left it", () => {
    const w = makeWorld({ wind: { dir: 2.5, strength: 0.33 } });
    expect(weatherAt(w, NOWHERE).windDirRad).toBe(2.5);
    expect(weatherAt(w, NOWHERE).windStrength).toBe(0.33);
  });
});

describe("a hurricane is on the water now, not only in the news", () => {
  it("knows nothing of a hurricane that has not begun or has blown out", () => {
    expect(hurricaneEyes(makeWorld({ day: 10, events: [{ startDay: 20, endDay: 30 }] }))).toEqual([]);
    expect(hurricaneEyes(makeWorld({ day: 40, events: [{ startDay: 20, endDay: 30 }] }))).toEqual([]);
    expect(hurricaneEyes(makeWorld({ day: 25, events: [{ startDay: 20, endDay: 30 }] }))).toHaveLength(1);
  });

  it("ignores every other kind of world event", () => {
    expect(hurricaneEyes(makeWorld({ events: [{ type: "epidemic" }] }))).toEqual([]);
  });

  it("blows hardest at the eye and not at all past the edge", () => {
    const w = blowing();
    expect(hurricaneAt(w, CARTAGENA)!.intensity).toBeCloseTo(1, 6);
    expect(hurricaneAt(w, { x: CARTAGENA.x + HURRICANE_RADIUS / 2, y: CARTAGENA.y })!.intensity)
      .toBeCloseTo(0.5, 6);
    expect(hurricaneAt(w, { x: CARTAGENA.x + HURRICANE_RADIUS, y: CARTAGENA.y })).toBeNull();
    expect(hurricaneAt(w, NOWHERE)).toBeNull();
  });

  it("takes the nearer of two storms when their circles overlap", () => {
    const w = makeWorld({
      pos: CARTAGENA,
      events: [{ ports: ["cartagena"] }, { ports: ["santa_marta"] }],
    });
    expect(hurricaneAt(w, CARTAGENA)!.port).toBe(CITIES.cartagena.name);
  });

  it("is a storm on the water, whatever the season was doing", () => {
    const here = weatherAt(blowing(), { x: CARTAGENA.x + 30, y: CARTAGENA.y });
    expect(here.stormActive).toBe(true);
    expect(here.hurricane).toBeGreaterThan(0.8);
    expect(here.windStrength).toBeGreaterThan(0.9);
    expect(here.windStrength).toBeLessThanOrEqual(HURRICANE_WIND);
  });

  it("puts the eye ninety degrees to starboard of the wind — Buys Ballot", () => {
    // The reason the compass widget doubles as a bearing to the storm's centre.
    // Back to the wind in these latitudes and the low is on your left hand.
    for (const off of [{ x: 3, y: 0 }, { x: 0, y: 3 }, { x: -2, y: -2 }]) {
      const at = { x: CARTAGENA.x + off.x, y: CARTAGENA.y + off.y };
      const here = weatherAt(blowing(), at);
      const toEye = vecToHeading({ x: CARTAGENA.x - at.x, y: CARTAGENA.y - at.y });
      expect(headingDiff(here.windDirRad, toEye)).toBeCloseTo(Math.PI / 2, 1);
    }
  });

  it("hands the storm's town over for the line of log", () => {
    expect(weatherAt(blowing(), CARTAGENA).eyePort).toBe(CITIES.cartagena.name);
    expect(weatherAt(blowing(), NOWHERE).eyePort).toBeUndefined();
  });
});

// ===========================================================================
// The eye walks (v0.45.0)
// ===========================================================================

/**
 * A hurricane used to be three stationary circles that stood over three
 * harbours for a week. The event already carried an ordered list of ports and
 * a start and an end day; between them that is a road, and nothing read it as
 * one.
 */
describe("the eye walks its road", () => {
  /** Three towns strung west along the Main, which is what a storm crosses. */
  const ROAD = ["cartagena", "santa_marta", "rio_de_la_hacha"].filter(k => CITIES[k]);
  const walking = (over: Parameters<typeof makeWorld>[0] = {}) => makeWorld({
    events: [{ ports: ROAD, startDay: 10, endDay: 20 }],
    day: 10,
    ...over,
  });
  const at = (w: WorldState, day: number, hour = 0) =>
    hurricaneEyes({ ...w, time: { ...w.time, day, hour, minute: 0 } })[0];

  it("has three towns on its road and exactly one eye", () => {
    const w = walking();
    expect(ROAD.length).toBe(3);
    expect(hurricaneTrack(w.worldEvents[0])).toHaveLength(3);
    // The whole of the change in one assertion: before v0.45.0 this was three.
    expect(hurricaneEyes(w)).toHaveLength(1);
  });

  it("makes its first landfall where the headline names it and ends over the last town", () => {
    const w = walking();
    const first = CITIES[ROAD[0]].pos;
    const last = CITIES[ROAD[2]].pos;
    expect(at(w, 10).pos.x).toBeCloseTo(first.x, 3);
    expect(at(w, 10).pos.y).toBeCloseTo(first.y, 3);
    const end = at(w, 19, 23).pos;
    expect(Math.hypot(end.x - last.x, end.y - last.y)).toBeLessThan(5);
  });

  it("moves inside a single day, because it is doing damage every tick", () => {
    // `time.day` is an integer. An eye reading it would teleport at midnight
    // and be a different storm on either side — which for a squadron nobody can
    // see is harmless and for this is not.
    const w = walking();
    const dawn = at(w, 14, 0).pos;
    const dusk = at(w, 14, 12).pos;
    expect(Math.hypot(dusk.x - dawn.x, dusk.y - dawn.y)).toBeGreaterThan(0);
  });

  it("only ever goes forward along the road", () => {
    const w = walking();
    let last = 0;
    for (let d = 10; d < 20; d++) {
      const p = hurricaneProgress({ ...w, time: { ...w.time, day: d } }, w.worldEvents[0]);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(last).toBeGreaterThan(0.8);
  });

  it("says which town it has passed and which it is standing towards", () => {
    const w = walking();
    const early = at(w, 10);
    expect(early.port).toBe(CITIES[ROAD[0]].name);
    expect(early.bound).toBe(CITIES[ROAD[1]].name);
  });

  it("a storm with nowhere to go names itself twice, and the HUD checks for it", () => {
    // Bermuda is the one port on this map with no neighbour within reach, so a
    // storm there is a single stationary circle — the old behaviour, correctly.
    const w = makeWorld({ events: [{ ports: ["cartagena"], startDay: 10, endDay: 20 }], day: 12 });
    const eye = hurricaneEyes(w)[0];
    expect(eye.port).toBe(eye.bound);
  });

  it("catches a ship that never moved off a town at the far end of a long road", () => {
    // The point of the release, stated as a ship's week: lying off the far end
    // of the road she is clear when it makes landfall and buried by the time it
    // lifts, without either of them having moved a yard toward the other.
    const long = ["vera_cruz", "havana"];
    const far = CITIES[long[1]].pos;
    const w = makeWorld({
      pos: far,
      events: [{ ports: long, startDay: 10, endDay: 20 }],
      day: 10,
    });
    expect(hurricaneAt({ ...w, time: { ...w.time, day: 10 } }, far)).toBeNull();
    const late = hurricaneAt({ ...w, time: { ...w.time, day: 19, hour: 12 } }, far);
    expect(late).not.toBeNull();
    expect(late!.intensity).toBeGreaterThan(0.5);
  });

  it("sits on all of a tight cluster instead, and that is the honest answer", () => {
    // Half the roads this map can produce are shorter than one storm radius —
    // Cartagena to Río de la Hacha is two hundred units and the circle is two
    // hundred and sixty. A storm crossing a huddle of towns covers the lot for
    // its whole life, and pretending otherwise would be a mechanic the geography
    // does not support. It moves; it does not always move *away*.
    const road = [CITIES[ROAD[0]].pos, CITIES[ROAD[2]].pos];
    expect(Math.hypot(road[1].x - road[0].x, road[1].y - road[0].y))
      .toBeLessThan(HURRICANE_RADIUS);
    const w = walking({ pos: CITIES[ROAD[2]].pos });
    for (const day of [10, 14, 19]) {
      expect(hurricaneAt({ ...w, time: { ...w.time, day } }, CITIES[ROAD[2]].pos)).not.toBeNull();
    }
  });

  it("blows on a captain who has never heard of it, and is drawn only for one who has", () => {
    // The chart carries what he was told; the weather does not consult him.
    const w = walking({ day: 14 });
    expect(hurricaneEyes(w)).toHaveLength(1);
    expect(knownHurricanes(w)).toHaveLength(0);
    expect(knownHurricanes({ ...w, knownEventIds: ["ev_0"] })).toHaveLength(1);
  });

  it("hands the chart the road it will actually walk", () => {
    const w = { ...walking({ day: 14 }), knownEventIds: ["ev_0"] } as WorldState;
    const drawn = knownHurricanes(w)[0];
    expect(drawn.road).toHaveLength(3);
    expect(drawn.road[0]).toEqual(CITIES[ROAD[0]].pos);
    expect(drawn.daysLeft).toBe(6);
    const eye = hurricaneEyes(w)[0];
    expect(drawn.eye.x).toBeCloseTo(eye.pos.x, 6);
  });
});

describe("what a hurricane does to a ship", () => {
  it("takes canvas whatever the sail, which a squall never does", () => {
    // The whole distinction between the two: a squall is answered with
    // `SailSystem`, a hurricane only with the helm.
    const reefed = tickStormDamage(blowing({ sail: STORM_SAFE_SAIL }), 100);
    expect(rig(reefed)).toBeLessThan(90);
    const furled = tickStormDamage(blowing({ sail: 0 }), 100);
    expect(rig(furled)).toBeLessThan(90);
  });

  it("still costs more under full sail than under bare poles", () => {
    expect(rig(tickStormDamage(blowing({ sail: 1 }), 100)))
      .toBeLessThan(rig(tickStormDamage(blowing({ sail: 0 }), 100)));
  });

  it("opens the hull too, which no squall does", () => {
    expect(hull(tickStormDamage(blowing(), 100))).toBeLessThan(120);
    // A plain squall, by contrast, leaves the hull alone.
    const squall = makeWorld();
    const squally = { ...squall, weather: { ...squall.weather, stormActive: true, stormTimer: 400 } };
    expect(hull(tickStormDamage(squally, 100))).toBe(120);
  });

  it("cripples her and never founders her", () => {
    const wrecked = tickStormDamage(blowing(), 1_000_000);
    expect(hull(wrecked)).toBeCloseTo(120 * HURRICANE_HULL_FLOOR, 6);
    expect(HURRICANE_HULL_FLOOR).toBe(FOUNDERING_THRESHOLD);
    expect(hullCondition(hull(wrecked), 120)).toBe("crippled");
  });

  it("tears her canvas to the torn tier and no further, so she can still sail out", () => {
    // Below "torn" lies dismasted, which on the map is a 0.15 crawl — and a
    // ship crawling inside a circle 260 units in radius would never leave it.
    const wrecked = tickStormDamage(blowing({ sail: 0 }), 1_000_000);
    expect(rig(wrecked)).toBeCloseTo(90 * HURRICANE_RIG_FLOOR, 6);
    expect(HURRICANE_RIG_FLOOR).toBe(RIG_TIERS[1].minFrac);
    expect(rigCondition(rig(wrecked), 90)).toBe("torn");
  });

  it("leaves a ship that came in worse than the floor exactly as she was", () => {
    const w = blowing({ sail: 0, hullHp: 12, sailsHp: 9 });
    const after = tickStormDamage(w, 100);
    expect(hull(after)).toBe(12);
    expect(rig(after)).toBe(9);
  });

  it("stops at the torn tier even under full sail, so the helm stays an answer", () => {
    // Found on screen, not in a test: with the floor covering only the
    // hurricane's own share, a frigate under full sail went through "torn" and
    // on toward dismasted — a 0.15 crawl inside a circle she then could not
    // leave. The floor covers both losses inside a hurricane (v0.39.0).
    const wrecked = tickStormDamage(blowing({ sail: 1 }), 1_000_000);
    expect(rig(wrecked)).toBeCloseTo(90 * HURRICANE_RIG_FLOOR, 6);
    expect(rigCondition(rig(wrecked), 90)).toBe("torn");
  });

  it("still lets a plain squall shred canvas past that floor", () => {
    // The floors belong to the hurricane's own damage. A plain squall under
    // full sail can take the rigging to nothing, exactly as in v0.38.0.
    const squall = makeWorld({ sail: 1 });
    const squally = { ...squall, weather: { ...squall.weather, stormActive: true, stormTimer: 400 } };
    expect(rig(tickStormDamage(squally, 1_000_000))).toBe(0);
  });

  it("batters the consorts on the same terms", () => {
    const w = blowing({ sail: 1, fleet: [{ hullHp: 60, hullMax: 60, sailsHp: 40, sailsMax: 40 }] });
    const consort = tickStormDamage(w, 100).player.fleet![0];
    expect(consort.sailsHp).toBeLessThan(40);
    expect(consort.hullHp).toBeLessThan(60);
  });

  it("leaves a captain who is ashore alone", () => {
    const ashore = blowing({ mode: "landed" });
    expect(tickStormDamage(ashore, 100)).toBe(ashore);
  });

  it("scales with how deep into the circle she is", () => {
    expect(hurricaneRigLoss(1, 90, 100)).toBeCloseTo(hurricaneRigLoss(0.5, 90, 100) * 2, 9);
    expect(hurricaneHullLoss(0, 120, 100)).toBe(0);
    expect(hurricaneRigLoss(0, 90, 100)).toBe(0);
  });

  it("floors a bar without ever healing it", () => {
    expect(stormFloored(100, 100, 50, 0.25)).toBe(50);
    expect(stormFloored(30, 100, 50, 0.25)).toBe(25);
    expect(stormFloored(10, 100, 50, 0.25)).toBe(10);
  });
});

describe("what the captain is told", () => {
  it("closes the spyglass further than a squall, in proportion", () => {
    const edge = weatherAt(blowing(), { x: CARTAGENA.x + HURRICANE_RADIUS * 0.9, y: CARTAGENA.y });
    const eye = weatherAt(blowing(), CARTAGENA);
    expect(stormVisionMultiplier(eye)).toBeCloseTo(HURRICANE_VISION_SHARE, 6);
    expect(stormVisionMultiplier(eye)).toBeLessThan(stormVisionMultiplier(edge));
    expect(stormVisionMultiplier(edge)).toBeLessThanOrEqual(STORM_VISION_SHARE);
    expect(HURRICANE_VISION_SHARE).toBeLessThan(STORM_VISION_SHARE);
  });

  it("says hurricane rather than squall, at any sail", () => {
    for (const sail of [0, STORM_SAFE_SAIL, 1]) {
      expect(stormWarning(blowing({ sail }))).toMatchObject({
        key: "weather.hurricane", danger: true,
      });
    }
  });

  it("reports how deep in she is, which is what the wash is drawn from", () => {
    const near = stormWarning(blowing())!;
    const far = stormWarning(blowing({ pos: { x: CARTAGENA.x + HURRICANE_RADIUS * 0.8, y: CARTAGENA.y } }))!;
    expect(near.severity).toBeGreaterThan(far.severity);
    expect(far.severity).toBeGreaterThan(0);
  });

  it("does not order a captain ashore to claw off", () => {
    // `tickStormDamage` leaves a landing party alone, so "she is taking hull as
    // well as canvas" would be the HUD lying to him.
    expect(stormWarning(blowing({ mode: "landed" }))).toMatchObject({
      key: "weather.storm", danger: false,
    });
  });

  it("says nothing at all once she is clear of the circle", () => {
    expect(stormWarning(blowing({ pos: NOWHERE }))).toBeNull();
  });

  it("has every line it can print, in both languages", () => {
    for (const key of [
      "weather.hurricane",
      "weather.hurricane_toast",
      "weather.hurricane_over",
      "weather.log_hurricane",
      "weather.log_hurricane_passed",
      // v0.45.0 — a storm that is going somewhere, and the chart saying so.
      "weather.hurricane_toast_bound",
      "weather.log_hurricane_bound",
      "weather.chart_storm",
      "weather.chart_storm_bound",
    ]) {
      expect(EN[key], key).toBeDefined();
      expect(PL[key], key).toBeDefined();
    }
  });
});
