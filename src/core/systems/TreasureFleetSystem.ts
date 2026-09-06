/**
 * TreasureFleetSystem — the plate fleet sails (v0.46.0).
 *
 * `treasure_fleet` has been a `WorldEventType` since v0.9.7. It had a template,
 * a weight, a fourteen-to-twenty-one day life, a headline in two languages that
 * says **"Spanish treasure fleet preparing to sail from {{port}}"**, a name on
 * the chart pin, and a daily half-point of wealth for every Spanish colony at
 * once.
 *
 * It had never sailed. For nineteen releases the most famous thing in the
 * Caribbean was a line on a noticeboard.
 *
 * This is the same illness the codebase keeps finding — a noun living in two
 * layers that have never been introduced — and it is the fifth time the cure
 * has been the same: the event already carries everything the sea needs, so
 * nothing new is stored.
 *
 * ## The route is not invented, it is read off the map
 *
 * Silver from Peru crossed the isthmus to **Puerto Bello** and **Nombre de
 * Dios**; silver from Mexico shipped out of **Vera Cruz**; both convoys
 * rendezvoused at **Havana** and went home together through the Florida
 * Straits. That is history, and it is also exactly what this map's own current
 * table says a square-rigged ship should do — `florida` (0.083 ENE) is the
 * strongest set in the game and `gulf_stream` (0.075 NNE) runs off the top of
 * the chart from the mouth of the Straits.
 *
 * So the course is `findSeaPath(muster → Havana → the Atlantic, currentAt)`:
 * the same current-aware passage the trade has used since v0.42.0 and the crown
 * since v0.43.0. Nobody had to write down why Spain sailed that way; the water
 * was already there.
 *
 * ## She is in harbour first, because the headline says so
 *
 * `PLATE_MUSTER_SHARE` of the event is spent loading. The news reaches the
 * player as "preparing to sail from Puerto Bello" and for those days that is
 * literally true — she is not on the water and cannot be met. That is the
 * fortnight's warning that turns an interception into a plan: he knows where
 * she starts, he knows she must pass Havana, and he knows roughly when.
 *
 * ## Which two hulls are worth boarding is already answered
 *
 * Four hulls sail: two galleons deep in treasure and two fast galleons that
 * carry nothing but guns. The player does not need a new instrument to tell
 * them apart, because `WorldRenderer.syncCargoBurgee` has flown a gold pennant
 * over a ship laden past half her hold since v0.25.0, and it only reads inside
 * `CARGO_READ_SHARE` of his spyglass. Closing to find out which is which is a
 * decision he already knows how to make.
 *
 * Nor is the prize a special case: `gold` has been an ordinary rare good since
 * v0.29.0, `computePrize` takes cargo best-value-first up to the room in his
 * hold, and `PricingSystem` has priced every ton against the shed it lands in
 * since v0.24.0. A hundred tons of silver dumped on one counter craters that
 * counter. Emptying the hold before the fight and spreading the sale afterwards
 * are both consequences of machinery that was already running.
 *
 * ## Write back before you remove
 *
 * The rule the other two owned squadrons run on, and it is not optional here.
 * The convoy is built from a plan rather than from a record, so without it a
 * captain who mauled a galleon and broke off would find her whole when he
 * closed again — and one who **sank** her would find her afloat. `HULLS_VAR`
 * holds what is left, is stamped on every despawn, and once stamped it is
 * authoritative: a hull index missing from it is not coming back.
 *
 * ## And Spain feels it
 *
 * `vars.plundered` counts the treasure hulls that never got home, and
 * `EventEffectsSystem` scales the event's wealth by what is left. Taking the
 * plate fleet is the largest thing a captain can do to a crown without laying
 * siege to a city — every Spanish colony on the map is poorer for it, for as
 * long as the sailing lasts.
 */

import type { WorldState, WorldEventState, RngState, Vec2 } from "../model/WorldState.ts";
import type { WorldEvent } from "../model/Events.ts";
import type { EntityState } from "../model/EntityState.ts";
import type { PortId } from "../model/ids.ts";
import { entityId, factionId as makeFactionId } from "../model/ids.ts";
import { CITIES } from "../data/cities.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { findSeaPath, pointAlong } from "../services/Pathfinding.ts";
import { normalizeHeading } from "../services/Geometry.ts";
import { currentAt } from "./CurrentSystem.ts";
import { getPortWaterPos } from "./PortWaterPositions.ts";
import { dayFraction, tickBoundaryCrossed } from "./TimeSystem.ts";
import { rngNextFloat } from "../services/RNG.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { t } from "../i18n/index.ts";
import {
  nearestWater,
  withinReach,
  MATERIALIZE_RANGE,
  EXPEDITION_INTERVAL_TICKS,
} from "./ExpeditionFleetSystem.ts";

/**
 * The harbours a plate fleet musters in.
 *
 * The two ends of the Spanish silver: Vera Cruz for New Spain, and the isthmus
 * ports for Peru. Cartagena is on the list because the Tierra Firme galleons
 * wintered there and because a fleet that always started in the same two
 * corners of the map would be a fixture rather than an event.
 */
export const MUSTER_PORTS = ["vera_cruz", "porto_bello", "nombre_de_dios", "cartagena"];

/** Where the convoys join, and the one waypoint every captain in the Caribbean knows. */
export const PLATE_RENDEZVOUS = "havana";

/**
 * Where she leaves the chart for Spain: north out of the Florida Straits.
 *
 * Not a town — the Atlantic. Chosen inside the `gulf_stream` band's northern
 * end so the last leg of the passage rides the set that made the route worth
 * sailing in the first place.
 */
export const PLATE_EXIT: Vec2 = { x: 1660, y: 120 };

/**
 * How much of the event is spent loading before she puts to sea.
 *
 * Three tenths of fourteen to twenty-one days is four to six days alongside,
 * which is the warning the player gets. The headline has always said
 * "preparing to sail"; this is the release where that stopped being decoration.
 */
export const PLATE_MUSTER_SHARE = 0.3;

/** Treasure hulls, and the escorts that are there to make him work for them. */
export const PLATE_TREASURE_HULLS = 2;
export const PLATE_ESCORT_HULLS = 2;
export const TREASURE_CLASS = "galleon";
export const ESCORT_CLASS = "fast_galleon";

/** Abeam spacing when the convoy comes on the chart, in world units. */
const HULL_SPACING = 70;

/**
 * What a treasure galleon has in her hold, per hull.
 *
 * Mostly bullion, and then the colonial produce that went home in the same
 * bottoms. The mix matters: `computePrize` takes the best-paying cargo first,
 * so a captain with a small hold takes the silver and leaves the cocoa, which
 * is the decision a real one would make, and it happens without a line of code
 * about treasure anywhere in the prize system.
 *
 * 150 tons is a galleon's whole hold. At `ITEMS.gold.basePrice` 80 that is
 * about eight thousand a hull before the market has an opinion — and the market
 * will have one, because `PricingSystem` has quoted against the shed since
 * v0.24.0 and ninety tons of silver on one counter is not worth ninety times
 * the first ton.
 */
export const TREASURE_MANIFEST: Record<string, number> = {
  gold: 90,
  cocoa: 40,
  tobacco: 20,
};

/** `WorldEventState.vars` key counting treasure hulls that never got home. */
export const PLUNDERED_VAR = "plundered";

/**
 * `WorldEventState.vars` key holding what is left of the convoy.
 *
 * `"<index>:<hull>:<rig>"` per surviving hull, comma separated — and it is
 * **written on every despawn**, so a record that exists is authoritative: a
 * hull index missing from it is a hull that is not coming back.
 *
 * This is the rule `ExpeditionFleetSystem` and `NamedShipSystem` both run on
 * (write back before you remove) and it is not optional here either. Without
 * it a captain who mauled a galleon, broke off and closed again would find her
 * whole — and a captain who *sank* one would find her afloat, because
 * `materializePlate` builds the convoy from the plan rather than from what is
 * left of it.
 *
 * Absent means the convoy has never been met and all four sail.
 */
export const HULLS_VAR = "hulls";

export type PlateHullState = { idx: number; hull: number; rig: number };

/** What is left of her, or nothing at all if nobody has ever come near her. */
export function hullStates(event: WorldEventState): PlateHullState[] | undefined {
  const raw = event.vars?.[HULLS_VAR];
  if (typeof raw !== "string") return undefined;
  if (raw === "") return [];
  const out: PlateHullState[] = [];
  for (const part of raw.split(",")) {
    const [i, h, r] = part.split(":").map(Number);
    if (!Number.isFinite(i)) continue;
    out.push({
      idx: i,
      hull: Number.isFinite(h) ? Math.max(0, Math.min(1, h)) : 1,
      rig: Number.isFinite(r) ? Math.max(0, Math.min(1, r)) : 1,
    });
  }
  return out;
}

/** Stamp what is still afloat into the event, before any of it leaves the chart. */
export function writeBackPlate(world: WorldState, eventId: string): WorldState {
  const afloat = plateHullsOf(world, eventId);
  const record = afloat
    .map(([id, e]) => {
      const idx = Number(String(id).split("_").pop());
      const ship = e.ship;
      const hull = ship ? ship.hullHp / Math.max(1, ship.hullMax) : 1;
      const rig = ship ? ship.sailsHp / Math.max(1, ship.sailsMax) : 1;
      return { idx, hull, rig };
    })
    .filter(h => Number.isFinite(h.idx))
    .sort((a, b) => a.idx - b.idx)
    .map(h => `${h.idx}:${h.hull.toFixed(3)}:${h.rig.toFixed(3)}`)
    .join(",");

  return {
    ...world,
    worldEvents: (world.worldEvents ?? []).map(ev => ev.id !== eventId ? ev : {
      ...ev,
      vars: { ...ev.vars, [HULLS_VAR]: record },
    }),
  };
}

/** Every plate fleet the world has running, sailed or still loading. */
export function plateFleets(world: WorldState): WorldEventState[] {
  const day = world.time.day;
  return (world.worldEvents ?? []).filter(
    ev => ev.type === "treasure_fleet" && day >= ev.startDay && day < ev.endDay,
  );
}

/**
 * The harbour she is loading in.
 *
 * Read from the stamp first, exactly like `originPortFor` since v0.43.0: a fact
 * about an event belongs to the day the event happened, and deriving it from
 * today's world rewrites history. The fallback is for saves written before this
 * release, whose treasure fleets have no muster port at all — those quietly
 * never sail, which is the world they were saved in.
 */
export function musterPortFor(event: WorldEventState): string | undefined {
  const stamped = event.vars?.muster;
  if (typeof stamped === "string" && CITIES[stamped]) return stamped;
  return undefined;
}

/**
 * Her course: out of the muster harbour, round to Havana, then away north.
 *
 * Two `findSeaPath` legs joined, both riding the water. The join is not
 * cosmetic — the leg from Puerto Bello to Havana crosses the Caribbean Current
 * on the beam and the leg from Havana crosses the strongest set on the map dead
 * astern, so the second half of the passage is much faster than the first, and
 * that is exactly the shape of the historical voyage.
 */
export function plateCourse(event: WorldEventState): Vec2[] | undefined {
  const musterKey = musterPortFor(event);
  if (!musterKey) return undefined;
  const from = getPortWaterPos(musterKey);
  const via = getPortWaterPos(PLATE_RENDEZVOUS);
  if (!from || !via) return undefined;

  const inbound = findSeaPath(from, via, currentAt) ?? [from, via];
  const outbound = findSeaPath(via, PLATE_EXIT, currentAt) ?? [via, PLATE_EXIT];
  // Drop the duplicated rendezvous so `pointAlong` does not stall on a zero leg.
  return [...inbound, ...outbound.slice(1)];
}

/**
 * How far along her passage she is today, 0..1 — and 0 for as long as she is
 * still loading.
 *
 * On the fractional day, for the reason `WeatherFieldSystem` needs one: a
 * convoy the player is trying to intercept must not jump a day's run at
 * midnight while he is standing across her course.
 */
export function plateProgress(world: WorldState, event: WorldEventState): number {
  const span = event.endDay - event.startDay;
  if (span <= 0) return 0;
  const sailedFrom = event.startDay + span * PLATE_MUSTER_SHARE;
  const passage = event.endDay - sailedFrom;
  if (passage <= 0) return 0;
  const elapsed = dayFraction(world.time) - sailedFrom;
  return Math.max(0, Math.min(1, elapsed / passage));
}

/** True while she is still alongside and has not put to sea. */
export function stillMustering(world: WorldState, event: WorldEventState): boolean {
  const span = event.endDay - event.startDay;
  if (span <= 0) return false;
  return dayFraction(world.time) < event.startDay + span * PLATE_MUSTER_SHARE;
}

/** Where she is today, or nothing while she is still in harbour. */
export function platePos(world: WorldState, event: WorldEventState): Vec2 | undefined {
  if (stillMustering(world, event)) return undefined;
  const course = plateCourse(event);
  if (!course || course.length === 0) return undefined;
  return pointAlong(course, plateProgress(world, event));
}

/** Treasure hulls of this fleet that never reached Spain. */
export function plunderedCount(event: WorldEventState): number {
  const n = Number(event.vars?.[PLUNDERED_VAR] ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(PLATE_TREASURE_HULLS, n)) : 0;
}

/**
 * How much of the sailing got home, 0..1 — what Spain actually gains by it.
 *
 * Read by `EventEffectsSystem` the same way a war's `warBite` is: the table
 * describes the event going as intended, and something the player did to it
 * scales that down. Taking both treasure hulls turns the richest fortnight of
 * the Spanish year into nothing at all, for every colony on the map at once.
 */
export function plateShareHome(event: WorldEventState): number {
  return Math.max(0, 1 - plunderedCount(event) / PLATE_TREASURE_HULLS);
}

/** Record that one of her treasure hulls is not going home. */
export function settlePlatePrize(world: WorldState, entity: EntityState | undefined): WorldState {
  const mark = entity?.ai?.plateFleetId;
  if (!mark || !entity?.ai?.plateTreasure) return world;
  return {
    ...world,
    worldEvents: (world.worldEvents ?? []).map(ev => ev.id !== mark ? ev : {
      ...ev,
      vars: { ...ev.vars, [PLUNDERED_VAR]: plunderedCount(ev) + 1 },
    }),
  };
}

/** This fleet's hulls that are on the chart right now. */
export function plateHullsOf(world: WorldState, eventId: string): [string, EntityState][] {
  return Object.entries(world.entities)
    .filter(([, e]) => e.ai?.plateFleetId === eventId);
}

/**
 * Put the convoy on the water in line abreast across her course.
 *
 * All or nothing, for the reason `ExpeditionFleetSystem.materialize` is: a hull
 * that could not find water would not be "missing from the chart", it would be
 * treasure written out of the world without a shot fired.
 */
export function materializePlate(
  world: WorldState,
  event: WorldEventState,
  pos: Vec2,
  rng: RngState,
): { world: WorldState; rng: RngState } {
  const course = plateCourse(event);
  if (!course) return { world, rng };

  // Her bearing is the leg she is on, not the bearing of the whole voyage.
  const ahead = pointAlong(course, Math.min(1, plateProgress(world, event) + 0.02));
  const heading = normalizeHeading(Math.atan2(ahead.x - pos.x, -(ahead.y - pos.y)));
  const sideX = Math.cos(heading);
  const sideY = Math.sin(heading);

  // The convoy as she sailed...
  const full = [
    ...Array.from({ length: PLATE_TREASURE_HULLS }, (_, i) => ({ idx: i, classId: TREASURE_CLASS, treasure: true, hull: 1, rig: 1 })),
    ...Array.from({ length: PLATE_ESCORT_HULLS }, (_, i) => ({ idx: PLATE_TREASURE_HULLS + i, classId: ESCORT_CLASS, treasure: false, hull: 1, rig: 1 })),
  ];
  // ...and as the captain last left her. A record that exists is authoritative:
  // what is not in it is on the bottom or under his own flag.
  const left = hullStates(event);
  const plans = left === undefined
    ? full
    : left.flatMap(st => {
      const base = full.find(f => f.idx === st.idx);
      return base ? [{ ...base, hull: st.hull, rig: st.rig }] : [];
    });
  if (plans.length === 0) return { world, rng };

  let entities = { ...world.entities };
  let r = rng;
  let placed = 0;

  plans.forEach((plan, i) => {
    const cls = SHIP_CLASSES[plan.classId];
    if (!cls) return;
    const offset = (i - (plans.length - 1) / 2) * HULL_SPACING;
    const at = nearestWater({ x: pos.x + sideX * offset, y: pos.y + sideY * offset });
    if (!at) return;
    placed++;

    const sail = rngNextFloat(r, 0.7, 0.9);
    r = sail.state;

    const id = entityId(`plate_${event.id}_${plan.idx}`);
    entities = {
      ...entities,
      [id as string]: {
        id,
        kind: "ship",
        mode: "sailing",
        pos: at,
        vel: { x: 0, y: 0 },
        heading,
        sailLevel: sail.value,
        depthOffset: 0,
        ship: {
          classId: cls.id,
          factionId: makeFactionId("spain"),
          // Whatever he left her at, not whatever she sailed at.
          hullHp: cls.hullMax * plan.hull,
          hullMax: cls.hullMax,
          sailsHp: cls.sailsMax * plan.rig,
          sailsMax: cls.sailsMax,
          cannons: cls.cannons,
          // The whole point of her, and the reason she flies a gold burgee.
          cargo: plan.treasure ? { ...TREASURE_MANIFEST } : {},
          cargoCap: cls.cargoCap,
          crew: {
            current: Math.round(cls.crewMax * 0.9),
            // A crown's own flota, not a hired hull: these people are paid and
            // they know what is under the hatches.
            max: cls.crewMax,
            morale: 0.85,
          },
        },
        ai: {
          // The escorts are the *Armada de la Guardia* and will close on
          // anybody who closes on the convoy; a treasure galleon runs, and
          // `looksDangerous` (v0.36.0) already tells her when to start.
          behavior: plan.treasure ? "trader" : "navy",
          state: "travel",
          targetPortId: PLATE_RENDEZVOUS as unknown as PortId,
          aggression: plan.treasure ? 0.1 : 0.9,
          awarenessRadius: plan.treasure ? 200 : 300,
          news: [{
            eventId: event.id,
            headline: event.headline,
            vars: event.vars,
            dayHeard: world.time.day,
            sourcePort: musterPortFor(event) ?? PLATE_RENDEZVOUS,
          }],
          plateFleetId: event.id,
          plateTreasure: plan.treasure,
        },
      },
    };
  });

  if (placed !== plans.length) return { world, rng };
  return { world: { ...world, entities }, rng: r };
}

/** Take this fleet's hulls off the chart. Settle any losses first, always. */
export function dematerializePlate(world: WorldState, eventId: string): WorldState {
  const entities = { ...world.entities };
  let removed = false;
  for (const [id] of plateHullsOf(world, eventId)) {
    delete entities[id];
    removed = true;
  }
  return removed ? { ...world, entities } : world;
}

/**
 * Reconcile every plate fleet with what is on the chart.
 *
 * Same cadence and the same order as the expedition hulls: what is afloat and
 * out of reach comes off, what is in reach and not yet afloat goes on.
 *
 * A treasure hull that has left the chart has **not** got away with anything —
 * she is simply somewhere the player is not. Only `settlePlatePrize`, called
 * from the battle, marks one as lost, so a convoy the captain broke off from is
 * remembered as intact rather than plundered.
 */
export function tickTreasureFleets(
  world: WorldState,
  dtTicks: number,
): { world: WorldState; events: WorldEvent[] } {
  const tick = world.time.tick;
  const events: WorldEvent[] = [];
  if (!tickBoundaryCrossed(tick - dtTicks, tick, EXPEDITION_INTERVAL_TICKS)) return { world, events };

  let w = world;
  let rng = w.rng;

  for (const event of plateFleets(w)) {
    const afloat = plateHullsOf(w, event.id).length > 0;
    const at = platePos(w, event);

    if (!at) {
      // Still loading, or her course could not be built at all.
      if (afloat) w = dematerializePlate(writeBackPlate(w, event.id), event.id);
      continue;
    }

    const near = withinReach(w, at);
    if (afloat && !near) {
      // Write back *then* remove — the order is the whole safety of the model.
      w = dematerializePlate(writeBackPlate(w, event.id), event.id);
    } else if (!afloat && near) {
      const put = materializePlate(w, event, at, rng);
      if (put.world !== w) {
        // Raising her is the moment the fortnight of news becomes a decision,
        // and it must not be something the player has to notice for himself
        // among four sails on a crowded chart.
        const near = nearestTownName(at);
        w = addLogEntry(put.world, "plate.log_sighted", { port: near });
        events.push({ type: "Toast", message: t("plate.toast_sighted") });
      }
      rng = put.rng;
    }
  }

  // Anything that has expired leaves, whether the player is looking or not.
  const live = new Set(plateFleets(w).map(ev => ev.id));
  for (const [, e] of Object.entries(w.entities)) {
    const mark = e.ai?.plateFleetId;
    if (mark && !live.has(mark)) w = dematerializePlate(w, mark);
  }

  return { world: rng === w.rng ? w : { ...w, rng }, events };
}

/** The town a position is closest to, for a line of log that reads like a place. */
function nearestTownName(pos: Vec2): string {
  let best = "";
  let bestDist = Infinity;
  for (const city of Object.values(CITIES)) {
    const d = Math.hypot(city.pos.x - pos.x, city.pos.y - pos.y);
    if (d < bestDist) { bestDist = d; best = city.name; }
  }
  return best;
}

/** How far off she can be seen from — the same horizon everything else uses. */
export const PLATE_MATERIALIZE_RANGE = MATERIALIZE_RANGE;
