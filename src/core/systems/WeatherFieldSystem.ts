/**
 * WeatherFieldSystem — the weather has a place on the chart (v0.39.0).
 *
 * Until now this game had **two weathers that had never been introduced**.
 *
 * One is `WeatherState`: a single wind direction and strength for the whole
 * Caribbean, plus the squall v0.38.0 finally gave a consumer. It is the same
 * off Vera Cruz as off Barbados, thirteen hundred miles away.
 *
 * The other is `hurricane` — a `WorldEventType` with a seasonal table, three
 * affected ports, a headline, a chart pin the captain can see from across the
 * map, and an economic bite ashore. It has never once touched the water. A
 * hurricane could stand over Cartagena for a week and a ship anchored in the
 * roads would feel a steady trade wind.
 *
 * This module makes them one thing. `weatherAt(world, pos)` is the weather
 * *there*, derived from the prevailing wind, from the map's own zones, and from
 * whatever storms the world has going. **Nothing new is stored**: the wind is
 * still one saved state, the hurricane is still one world event, and the field
 * between them is arithmetic.
 *
 * ## Zones stop being decoration
 *
 * `MAP_ZONES` has carried `windDirBias` and `windStrengthBias` on the trade
 * belt and the Gulf since the map was drawn, and the only thing that ever
 * reached for the table — `EncounterSystem` — reads `zone.kind` and `zone.risk`
 * and never touched the wind fields at all. The fourth producer-with-no-consumer
 * in this codebase after `crewMul`, `treaty_signed` and `stormActive`, and the
 * one that had a whole data file behind it.
 *
 * (`EncounterSystem` itself is a variant of the same illness one notch subtler:
 * `WorldEngine` *does* call it every tick, but the `Encounter` events it emits
 * have no handler anywhere — `NpcSpawnSystem` took that job over long ago. Left
 * alone because removing it would change the RNG stream. Check both sides: the
 * call site **and** the event.)
 *
 * ## The eye walks (v0.45.0)
 *
 * A hurricane used to be **three stationary circles** — one per warned town —
 * that stood still for three to seven days and then vanished. The event already
 * carried an ordered list of ports and a start and an end day; between them
 * that is a road, and nothing had ever read it as one.
 *
 * Now it is **one** eye that makes its first landfall at the town the headline
 * names and is over the last of them when the event lifts. The warnings on the
 * chart are unchanged — those towns really do get it — but the weather on the
 * water has to be **outrun**, not merely avoided, and a harbour that was safe
 * this morning is where the storm is going.
 *
 * Nothing new is stored, again. What made this possible was `pickNeighbours`
 * in `WorldEventSystem`: the "nearby" towns of a multi-port event were drawn
 * from the whole map with `Math.random`, so the three ports were three dots
 * rather than a road, and a walking eye would have teleported across the
 * Caribbean. **A derived track is only as good as the order of what it is
 * derived from.**
 *
 * Now the belt is a road: inside it the wind is pulled toward the easterly the
 * trades actually blow and held steadier than the open sea, so a passage west
 * along the north coast is genuinely faster than the same distance south of
 * Hispaniola. The player never reads a zone name; he reads the compass.
 *
 * ## A hurricane is answered with the helm, not the sails
 *
 * That is the whole distinction, and it is why a hurricane is not a bigger
 * squall:
 *
 *   - a **squall** is answered with `SailSystem` — shorten sail and it costs
 *     nothing but hours (v0.38.0);
 *   - a **hurricane** cannot be ridden out. Bare poles still lose canvas, and
 *     it takes hull as well. The only answer is to get out of the circle, and
 *     the wind itself tells you where the circle is.
 *
 * Because the wind blows **counter-clockwise around the eye** (Buys Ballot: put
 * your back to the wind in these latitudes and the low is on your left hand),
 * the compass in the corner of the screen is a bearing to the storm's centre.
 * Keep the eye on your beam and you sail out of it; run downwind and you are
 * carried around it. That is a real decision made with an instrument the player
 * has had since the first release.
 *
 * ## What it can and cannot do to a ship
 *
 * It stops at boundaries the HUD already names. A hurricane takes a hull down
 * to `FOUNDERING_THRESHOLD` and no further — **crippled, never foundering** —
 * and canvas down to the "torn" tier and no further. So the worst weather in
 * the game leaves the captain limping home with a story, and never takes the
 * game away from him at a moment he cannot fight. Same principle as
 * `STORM_SAFE_SAIL = 0.5` being exactly `SailSystem`'s "Reefed": pick the
 * threshold from a number the player can already read off a screen.
 */

import type { WorldState, WeatherState, Vec2 } from "../model/WorldState.ts";
import { CITIES } from "../data/cities.ts";
import { MAP_ZONES } from "../data/mapZones.ts";
import { normalizeHeading, headingDiff, pointInRect, vecToHeading } from "../services/Geometry.ts";
import { FOUNDERING_THRESHOLD, RIG_TIERS } from "./DamageSystem.ts";
import { fogDensity } from "./FogSystem.ts";
import { pointAlong } from "../services/Pathfinding.ts";
import { dayFraction } from "./TimeSystem.ts";

/**
 * How hard a wind zone pulls the prevailing wind toward its own bias.
 *
 * Not 1: the trades are a tendency, not a rail, and a belt that overrode the
 * season would make the seasonal wind table pointless everywhere north of
 * Jamaica.
 */
export const ZONE_WIND_PULL = 0.45;

/**
 * How far a hurricane's weather reaches from the town it is named over.
 *
 * The map is 3200 px across roughly 45° of longitude, so a pixel is about a
 * kilometre and this is a storm field some 500 km wide — which is what a
 * hurricane is. It also sits between `BLOCKADE_RADIUS` (320) and
 * `MATERIALIZE_RANGE` (620), so the circle is bigger than anything the player
 * does to a harbour and smaller than the distance between two of them: it can
 * be sailed around.
 */
export const HURRICANE_RADIUS = 260;

/** Wind strength inside the eye. There is no harder blow in the game. */
export const HURRICANE_WIND = 1;

/** Rigging torn per tick at the eye as a share of `sailsMax`, whatever the sail. */
export const HURRICANE_RIG_SHARE_PER_TICK = 0.0006;

/** Hull opened per tick at the eye as a share of `hullMax`. */
export const HURRICANE_HULL_SHARE_PER_TICK = 0.0004;

/**
 * How far down a hurricane can take a hull: the foundering line, and not past
 * it. Crippled is a state the player can read on the HUD and sail home in;
 * foundering is a countdown to drowning, and drowning a captain by weather he
 * could only run from is not a decision, it is a dice roll.
 */
export const HURRICANE_HULL_FLOOR = FOUNDERING_THRESHOLD; // 0.25

/**
 * How far down it can take canvas: the "torn" tier. Below that lies dismasted,
 * which on the map is `MAP_DISMASTED_CRAWL` — and a ship crawling at 0.15 inside
 * a storm circle 260 px in radius would never get out of it. The floor is what
 * keeps this a passage the player survives rather than a trap he sits in.
 */
export const HURRICANE_RIG_FLOOR = RIG_TIERS[1].minFrac; // 0.40

/** What the lookout can still see at the eye. */
export const HURRICANE_VISION_SHARE = 0.3;

/**
 * The weather at one place: an ordinary `WeatherState` plus how much of it is
 * hurricane.
 *
 * `hurricane` is 0 in every part of the sea a storm is not standing over, which
 * is nearly all of it nearly all the time, so every caller that does not care
 * can go on treating this as the weather it has always read.
 */
export type LocalWeather = WeatherState & {
  /** 0 outside the circle, 1 at the eye. */
  hurricane: number;
  /**
   * How thick the fog is here, 0..1 (v0.40.0).
   *
   * Independent of the storm: fog needs calm air, so the two never overlap in
   * practice, and no rule was written to keep them apart.
   */
  fog: number;
  /** Where the eye is, when there is one within reach. */
  eye?: Vec2;
  /** The town it has last passed, for a line of log. */
  eyePort?: string;
  /** The town it is standing towards, which is the half worth acting on. */
  eyeBound?: string;
};

/**
 * The road a hurricane walks: the towns it is warned over, in order (v0.45.0).
 *
 * Derived, never stored. The event already carries an ordered list of ports and
 * a start and end day; between them that is a track, and it only ever failed to
 * be one because nothing read it that way. Same shape as `progress, not
 * position` (v0.33.0) and `expeditionCourse` (v0.17.0).
 *
 * Ordered outward from the town the headline names, which `pickNeighbours`
 * guarantees: the storm makes its first landfall where it is named and moves on
 * from there.
 *
 * Straight legs, not `findSeaPath`, and that is not laziness — a hurricane
 * crosses Cuba, and bending its road round a headland would be modelling it as
 * a ship.
 */
export function hurricaneTrack(ev: { ports?: string[] }): { pos: Vec2; port: string }[] {
  const stops: { pos: Vec2; port: string }[] = [];
  for (const portKey of ev.ports ?? []) {
    const city = CITIES[portKey];
    if (city) stops.push({ pos: city.pos, port: city.name });
  }
  return stops;
}

/**
 * How far along its road a storm is today, 0..1.
 *
 * On the **fractional** day, not `time.day`. An eye that jumped three hundred
 * units at midnight would be a different storm on either side of it, and unlike
 * a squadron or a named ship this is a thing doing damage per tick to whoever
 * is standing in it.
 */
export function hurricaneProgress(world: WorldState, ev: { startDay: number; endDay: number }): number {
  const span = ev.endDay - ev.startDay;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (dayFraction(world.time) - ev.startDay) / span));
}

/**
 * Every hurricane the world has running today: **one** eye each, on its road.
 *
 * Until v0.45.0 this returned one eye per named town, so a hurricane was three
 * stationary circles that stood over three harbours for a week and then
 * vanished. It is now one circle that starts at the first town and is over the
 * last one when the event lifts — which is why the same three towns are still
 * warned, and why the danger has to be outrun rather than merely avoided.
 */
export function hurricaneEyes(
  world: WorldState,
): { pos: Vec2; port: string; bound: string }[] {
  const day = world.time.day;
  const eyes: { pos: Vec2; port: string; bound: string }[] = [];
  for (const ev of world.worldEvents ?? []) {
    if (ev.type !== "hurricane") continue;
    if (day < ev.startDay || day >= ev.endDay) continue;
    const track = hurricaneTrack(ev);
    if (track.length === 0) continue;
    const progress = hurricaneProgress(world, ev);
    const pos = pointAlong(track.map(s => s.pos), progress);
    // Which town she has passed and which she is standing towards. A storm
    // named for one harbour and already off another has to be able to say so,
    // or the toast is describing a place she left three days ago.
    const leg = Math.min(track.length - 1, Math.floor(progress * (track.length - 1)));
    eyes.push({
      pos,
      port: track[leg].port,
      bound: track[Math.min(track.length - 1, leg + 1)].port,
    });
  }
  return eyes;
}

/**
 * The storms the captain has been told about, with their road and today's eye.
 *
 * Separate from `hurricaneEyes` and it has to be: the weather is real whether
 * he has heard of it or not, and the simulation must never consult
 * `knownEventIds`. This is the chart's copy — the same discipline the town pins
 * (v0.30.0) and the reckoned mark (v0.33.0) are drawn under.
 *
 * A moving eye that is not drawn would read as unfairness rather than as
 * weather: the captain stayed well clear of the pin and the storm found him
 * anyway. Drawing the road is what turns three warnings into a schedule.
 */
export function knownHurricanes(world: WorldState): {
  id: string;
  road: Vec2[];
  eye: Vec2;
  daysLeft: number;
  port: string;
  bound: string;
}[] {
  const known = new Set(world.knownEventIds ?? []);
  const day = world.time.day;
  const out: { id: string; road: Vec2[]; eye: Vec2; daysLeft: number; port: string; bound: string }[] = [];
  for (const ev of world.worldEvents ?? []) {
    if (ev.type !== "hurricane" || !known.has(ev.id)) continue;
    if (day < ev.startDay || day >= ev.endDay) continue;
    const track = hurricaneTrack(ev);
    if (track.length === 0) continue;
    const road = track.map(s => s.pos);
    const progress = hurricaneProgress(world, ev);
    const leg = Math.min(track.length - 1, Math.floor(progress * (track.length - 1)));
    out.push({
      id: ev.id,
      road,
      eye: pointAlong(road, progress),
      daysLeft: Math.max(0, ev.endDay - day),
      port: track[leg].port,
      bound: track[Math.min(track.length - 1, leg + 1)].port,
    });
  }
  return out;
}

/**
 * How hard it is blowing at `pos`, 0..1, and which eye is doing it.
 *
 * Linear falloff. A curve would be more honest about a real storm's wind field
 * and completely invisible at this scale; what matters is that the edge is soft
 * enough that a captain gets a warning line before he gets damage.
 */
export function hurricaneAt(
  world: WorldState,
  pos: Vec2,
): { intensity: number; pos: Vec2; port: string; bound: string } | null {
  let best: { intensity: number; pos: Vec2; port: string; bound: string } | null = null;
  for (const eye of hurricaneEyes(world)) {
    const dist = Math.hypot(pos.x - eye.pos.x, pos.y - eye.pos.y);
    if (dist >= HURRICANE_RADIUS) continue;
    const intensity = 1 - dist / HURRICANE_RADIUS;
    if (!best || intensity > best.intensity) {
      best = { intensity, pos: eye.pos, port: eye.port, bound: eye.bound };
    }
  }
  return best;
}

/** Blend one heading toward another along the shorter arc. */
function pullHeading(from: number, to: number, t: number): number {
  return normalizeHeading(from + headingDiff(from, to) * t);
}

/**
 * The wind a ship at `pos` actually has on it.
 *
 * Order matters: the zones shape the prevailing wind, and the hurricane then
 * overrides whatever that came to. A storm does not negotiate with the trades.
 */
export function weatherAt(world: WorldState, pos: Vec2): LocalWeather {
  const base = world.weather;
  let windDirRad = base.windDirRad;
  let windStrength = base.windStrength;

  // --- The map's own wind zones ------------------------------------------
  for (const zone of MAP_ZONES) {
    if (zone.windDirBias === undefined && zone.windStrengthBias === undefined) continue;
    if (!pointInRect(pos, zone.rect)) continue;
    if (zone.windDirBias !== undefined) {
      windDirRad = pullHeading(windDirRad, normalizeHeading(zone.windDirBias), ZONE_WIND_PULL);
    }
    if (zone.windStrengthBias !== undefined) {
      windStrength += (zone.windStrengthBias - windStrength) * ZONE_WIND_PULL;
    }
  }

  // --- A hurricane standing over a town -----------------------------------
  const fog = fogDensity(world, pos);

  const storm = hurricaneAt(world, pos);
  if (!storm) {
    return { ...base, windDirRad, windStrength, hurricane: 0, fog };
  }

  // Counter-clockwise around the eye. `windDirRad` is the bearing the wind
  // comes *from* (a ship heading straight at it is in irons), so the eye lies
  // exactly 90° to starboard of the wind's eye — Buys Ballot, and the reason
  // the compass widget doubles as a bearing to the storm's centre.
  const toEye = vecToHeading({ x: storm.pos.x - pos.x, y: storm.pos.y - pos.y });
  const cyclonic = normalizeHeading(toEye - Math.PI / 2);

  return {
    ...base,
    windDirRad: pullHeading(windDirRad, cyclonic, storm.intensity),
    windStrength: windStrength + (HURRICANE_WIND - windStrength) * storm.intensity,
    stormActive: true,
    hurricane: storm.intensity,
    fog,
    eye: storm.pos,
    eyePort: storm.port,
    eyeBound: storm.bound,
  };
}

/** The weather where the player's own ship is, which is what the HUD draws. */
export function weatherAtPlayer(world: WorldState): LocalWeather {
  const entity = world.entities[world.player.shipId as string];
  const pos = entity?.pos ?? world.player.location.pos ?? { x: 0, y: 0 };
  return weatherAt(world, pos);
}

/**
 * Rigging lost to the hurricane itself this tick, before the squall's own
 * sail-dependent tearing is added on top.
 *
 * Independent of sail level on purpose. This is the line between the two kinds
 * of weather in the game: canvas is the answer to a squall, and there is no
 * answer to a hurricane except leaving.
 */
export function hurricaneRigLoss(intensity: number, sailsMax: number, dtTicks: number): number {
  if (intensity <= 0) return 0;
  return sailsMax * HURRICANE_RIG_SHARE_PER_TICK * intensity * dtTicks;
}

/** Hull opened this tick. */
export function hurricaneHullLoss(intensity: number, hullMax: number, dtTicks: number): number {
  if (intensity <= 0) return 0;
  return hullMax * HURRICANE_HULL_SHARE_PER_TICK * intensity * dtTicks;
}

/**
 * Take damage off a bar without pushing it past a floor it is already above.
 *
 * A ship that came into the storm already worse than the floor is left exactly
 * as she was: the weather does not heal her and does not finish her either.
 */
export function stormFloored(hp: number, max: number, loss: number, floor: number): number {
  return Math.max(Math.min(hp, max * floor), hp - loss);
}
