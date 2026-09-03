/**
 * ExpeditionFleetSystem — the invasion gets hulls.
 *
 * Since v0.15.0 a crown coming back for a town, and since v0.16.0 a crown
 * taking one off a rival, have both been a `WorldEventState` at sea: a headline
 * in every tavern, a countdown, and then a landing resolved by arithmetic. What
 * there was never anything of, in between, was a *fleet*. The player could hear
 * that four hundred Spanish soldiers were twelve days out of Havana and could
 * do exactly nothing about it except be standing on the wall when they arrived.
 *
 * That is a strange shape for a pirate game. The one thing a captain in these
 * waters could actually do about an invasion was meet it at sea.
 *
 * ## What this module does
 *
 * The event stays the source of truth. It knows how many soldiers and guns are
 * coming and what day they arrive; nothing here changes that. What this adds is
 * that while the player is near the expedition's position on the chart, the
 * event is given **hulls** — two to four ordinary NPC ships, tagged with
 * `ai.expedition`, each carrying a written-down share of the landing.
 *
 *   transports  carry the soldiers, and nothing else
 *   escorts     carry the guns, and will come at anyone who closes
 *
 * Every tick the event's `soldiers` and `guns` are recomputed as the sum of
 * what is still afloat. Sinking a transport takes its men out of the landing
 * for good; sinking the escorts costs the landing its covering fire and leaves
 * the transports naked. When the last of them is gone — or when there is nobody
 * left to put ashore — the expedition is struck from the world and the target
 * gets its cooling-off period, exactly as if the landing had been fought and
 * thrown back.
 *
 * ## Why the ledger is recomputed rather than decremented
 *
 * A decrement needs to know *why* a hull is missing, and there are two reasons:
 * the player sank it, or this module despawned it because the player sailed
 * away. Recomputing the total from what is still afloat, every tick, before
 * anything is removed, does not need to tell those apart — and it cannot drift.
 * The one rule that makes it work is that the write-back happens *before* a
 * deliberate despawn, never after.
 *
 * ## Why they can pop in and out
 *
 * Ships appear when the player comes within `MATERIALIZE_RANGE` and are taken
 * off the chart again when he leaves it. That is the same fiction every other
 * NPC in this game runs on (`NpcSpawnSystem` despawns at 900), and the numbers
 * survive the round trip because the ledger lives in the event. A squadron the
 * player mauled and then left is a smaller squadron when he comes back.
 *
 * Pure and seeded from `RngState`, like the rest of `core/`.
 */

import type { WorldState, RngState, Vec2, WorldEventState } from "../model/WorldState.ts";
import type { EntityState } from "../model/EntityState.ts";
import type { WorldEvent } from "../model/Events.ts";
import type { PortId } from "../model/ids.ts";
import { entityId, factionId as makeFactionId } from "../model/ids.ts";
import { CITIES } from "../data/cities.ts";
import { FACTIONS } from "../data/factions.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { LANDMASSES } from "../data/geography.ts";
import { pointInLandmass, normalizeHeading } from "../services/Geometry.ts";
import { rngNextFloat } from "../services/RNG.ts";
import { t } from "../i18n/index.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { tickBoundaryCrossed } from "./TimeSystem.ts";
import { portFaction } from "./SiegeSystem.ts";
import {
  expeditionsInFlight,
  expeditionFromEvent,
  RELIEF_COOLDOWN_DAYS,
} from "./ReconquestSystem.ts";
import { CAMPAIGN_COOLDOWN_DAYS } from "./CrownCampaignSystem.ts";

// ── Constants ─────────────────────────────────────────────

/** Ticks between reconciliations. Roughly two a second at 20 ticks/s. */
export const EXPEDITION_INTERVAL_TICKS = 40;

/**
 * How close the player has to be for the squadron to be on the chart.
 *
 * Comfortably inside `NpcSpawnSystem`'s 900-unit despawn radius, which is what
 * keeps the generic sweeper from quietly deleting a squadron between two of
 * this module's own passes. It is also well outside any spyglass, so the fleet
 * exists before it can be seen — sailing up on it is a search, not a spawn.
 */
export const MATERIALIZE_RANGE = 620;

/** Soldiers one transport will carry before a second is needed. */
export const SOLDIERS_PER_TRANSPORT = 90;
/** Guns one escort will carry before a second is needed. */
export const GUNS_PER_ESCORT = 26;
/** Hulls an expedition is ever split into, escorts and transports together. */
export const MAX_EXPEDITION_HULLS = 4;

/** Spacing between hulls in the line, in world units. */
const HULL_SPACING = 42;

/**
 * Marker on the event saying its hulls are on the chart right now.
 *
 * Kept in `vars` rather than in a field of its own for the same reason
 * `nextCampaignDay` was made optional in v0.16.0: `WorldEventState.vars` is
 * already a free-form bag that every save carries, so nothing here needs a
 * migration step, and a step that does nothing is noise in a chain that has to
 * be maintained anyway.
 */
export const AFLOAT_VAR = "afloat";

/** Transport classes, smallest first — picked by how many men are aboard. */
const TRANSPORT_CLASSES = ["fluyt", "merchantman", "galleon"];
/** Escort classes, lightest first — picked by how many guns it is covering. */
const ESCORT_CLASSES = ["brigantine", "frigate", "fast_galleon"];

const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));

// ── Where the fleet is ────────────────────────────────────

function isWater(pos: Vec2): boolean {
  if (pos.x < 5 || pos.y < 5 || pos.x > 3195 || pos.y > 2395) return false;
  for (const lm of LANDMASSES) {
    if (pointInLandmass(pos, lm)) return false;
  }
  return true;
}

/** How far a hull may be nudged off its ideal station to find open water. */
export const WATER_SEARCH_RADIUS = 140;

/**
 * The nearest bit of open sea to a point, or nothing within reach of it.
 *
 * The route from a harbour to a town is a straight line, and in this archipelago
 * a straight line between two ports very often runs across the coast it follows
 * — Santa Marta to Cartagena is inland for most of its length. Rejecting those
 * positions outright, which is what the first cut of this module did, meant the
 * squadron for the single most commonly attacked town in the game never
 * appeared at all. It has to be nudged to water instead, exactly as
 * `NpcSpawnSystem.findWaterNearPort` nudges a departing trader off its quay.
 */
export function nearestWater(pos: Vec2): Vec2 | undefined {
  if (isWater(pos)) return pos;
  for (let r = 20; r <= WATER_SEARCH_RADIUS; r += 20) {
    for (let a = 0; a < 16; a++) {
      const angle = (a / 16) * Math.PI * 2;
      const at = { x: pos.x + Math.cos(angle) * r, y: pos.y + Math.sin(angle) * r };
      if (isWater(at)) return at;
    }
  }
  return undefined;
}

/**
 * The harbour this expedition is understood to have sailed from.
 *
 * Nearest colony the sending crown actually holds, and failing that the nearest
 * one it founded — a crown stripped of every port in the Caribbean still has a
 * home station, and the squadron has to come from *some* bearing. Derived
 * rather than written into the event on purpose: `launchExpedition` and
 * `launchCampaign` predate this module and stay unaware of it, so an expedition
 * already at sea in an old save gets a route the same way a new one does.
 */
export function originPortFor(world: WorldState, event: WorldEventState): string | undefined {
  const targetKey = event.ports[0];
  const target = CITIES[targetKey];
  const claimant = event.factions[0];
  if (!target || !claimant) return undefined;

  let held: string | undefined;
  let heldDist = Infinity;
  let founded: string | undefined;
  let foundedDist = Infinity;

  for (const [key, def] of Object.entries(CITIES)) {
    if (key === targetKey) continue;
    const dx = def.pos.x - target.pos.x;
    const dy = def.pos.y - target.pos.y;
    const d2 = dx * dx + dy * dy;
    if ((portFaction(world, key) as string) === claimant && d2 < heldDist) {
      held = key;
      heldDist = d2;
    }
    if ((def.factionId as unknown as string) === claimant && d2 < foundedDist) {
      founded = key;
      foundedDist = d2;
    }
  }
  return held ?? founded;
}

/** How far along its passage the expedition is, 0 at sailing and 1 on arrival. */
export function expeditionProgress(world: WorldState, event: WorldEventState): number {
  const span = event.endDay - event.startDay;
  if (span <= 0) return 1;
  return clamp(0, 1, (world.time.day - event.startDay) / span);
}

/**
 * Where the squadron is today.
 *
 * A straight line from the harbour it sailed from to the town it is going to,
 * walked by the day. There is no pathfinding in this game (`Pathfinding.ts` is
 * still a hook), so the line may cut a headland — which is why nothing is put
 * on the chart unless the point it lands on is water.
 */
export function expeditionPos(world: WorldState, event: WorldEventState): Vec2 | undefined {
  const target = CITIES[event.ports[0]];
  if (!target) return undefined;
  const originKey = originPortFor(world, event);
  const origin = originKey ? CITIES[originKey] : undefined;
  if (!origin) return undefined;

  const p = expeditionProgress(world, event);
  return {
    x: origin.pos.x + (target.pos.x - origin.pos.x) * p,
    y: origin.pos.y + (target.pos.y - origin.pos.y) * p,
  };
}

/** True when the player is close enough for the squadron to be on the chart. */
export function withinReach(world: WorldState, pos: Vec2): boolean {
  if (world.player.location.type === "port") return false;
  const player = world.entities[world.player.shipId as string]?.pos ?? world.player.location.pos;
  const dx = player.x - pos.x;
  const dy = player.y - pos.y;
  return dx * dx + dy * dy <= MATERIALIZE_RANGE * MATERIALIZE_RANGE;
}

// ── Splitting a landing into hulls ────────────────────────

export type HullPlan = {
  role: "transport" | "escort";
  classId: string;
  soldiers: number;
  guns: number;
};

/**
 * How this landing is loaded.
 *
 * Transports carry every soldier and no guns; escorts carry every gun and no
 * soldiers. That division is the whole tactical content of the interception:
 * going for the transports takes men out of the landing and going for the
 * escorts takes its covering fire away, and the escorts are the ones that will
 * come out to meet you. It is the same shape as the choice `CityDefenseScene`
 * puts on the other side of the same landing, from the other end of the beach.
 *
 * Remainders go to the first hull of each kind rather than being spread, so the
 * numbers always add back up to the event exactly.
 */
export function planHulls(soldiers: number, guns: number): HullPlan[] {
  const men = Math.max(0, Math.round(soldiers));
  const cannon = Math.max(0, Math.round(guns));

  let transports = men > 0 ? clamp(1, 2, Math.ceil(men / SOLDIERS_PER_TRANSPORT)) : 0;
  let escorts = cannon > 0 ? clamp(1, 2, Math.ceil(cannon / GUNS_PER_ESCORT)) : 0;
  // An expedition with no men and no guns is not an expedition.
  if (transports + escorts === 0) return [];
  while (transports + escorts > MAX_EXPEDITION_HULLS) {
    if (escorts > 1) escorts--;
    else if (transports > 1) transports--;
    else break;
  }

  const plans: HullPlan[] = [];

  const perTransport = transports > 0 ? Math.floor(men / transports) : 0;
  for (let i = 0; i < transports; i++) {
    const carried = i === 0 ? men - perTransport * (transports - 1) : perTransport;
    plans.push({
      role: "transport",
      classId: classFor(TRANSPORT_CLASSES, carried, SOLDIERS_PER_TRANSPORT),
      soldiers: carried,
      guns: 0,
    });
  }

  const perEscort = escorts > 0 ? Math.floor(cannon / escorts) : 0;
  for (let i = 0; i < escorts; i++) {
    const carried = i === 0 ? cannon - perEscort * (escorts - 1) : perEscort;
    plans.push({
      role: "escort",
      classId: classFor(ESCORT_CLASSES, carried, GUNS_PER_ESCORT),
      soldiers: 0,
      guns: carried,
    });
  }

  return plans;
}

/** Bigger loads get bigger hulls, off a short list rather than a formula. */
function classFor(classes: string[], load: number, perHull: number): string {
  const step = clamp(0, classes.length - 1, Math.floor(load / Math.max(1, perHull * 0.6)));
  return classes[step];
}

// ── Putting them on the chart ─────────────────────────────

/** Every hull currently afloat for this expedition. */
export function hullsOf(world: WorldState, eventId: string): [string, EntityState][] {
  return Object.entries(world.entities).filter(
    ([, e]) => e.ai?.expedition?.eventId === eventId,
  );
}

/**
 * Build the hulls for one expedition and drop them into the world.
 *
 * They are laid out in a line across the course rather than in a column, so a
 * captain who comes up on them sees a squadron and not a single sail — and so
 * the transports are never simply hidden behind the escorts.
 */
export function materialize(
  world: WorldState,
  event: WorldEventState,
  pos: Vec2,
  rng: RngState,
): { world: WorldState; rng: RngState } {
  const expedition = expeditionFromEvent(event);
  const plans = planHulls(expedition.soldiers, expedition.guns);
  if (plans.length === 0) return { world, rng };

  const target = CITIES[event.ports[0]];
  if (!target) return { world, rng };

  const heading = normalizeHeading(Math.atan2(target.pos.x - pos.x, -(target.pos.y - pos.y)));
  // Abeam of the course: the line spreads across it, not along it.
  const sideX = Math.cos(heading);
  const sideY = Math.sin(heading);

  const claimant = event.factions[0];
  let entities = { ...world.entities };
  let r = rng;
  // All or nothing. `syncLedger` reads the landing's strength back off the
  // hulls that are afloat, so a hull that failed to find water would not be
  // "missing from the chart" — it would be men written out of the invasion
  // without a shot being fired.
  let placed = 0;

  plans.forEach((plan, i) => {
    const cls = SHIP_CLASSES[plan.classId];
    if (!cls) return;
    const offset = (i - (plans.length - 1) / 2) * HULL_SPACING;
    const at = nearestWater({ x: pos.x + sideX * offset, y: pos.y + sideY * offset });
    if (!at) return;
    placed++;

    const sail = rngNextFloat(r, 0.6, 0.85);
    r = sail.state;

    const id = entityId(`exp_${event.id}_${i}`);
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
          factionId: makeFactionId(claimant),
          hullHp: cls.hullMax,
          hullMax: cls.hullMax,
          sailsHp: cls.sailsMax,
          sailsMax: cls.sailsMax,
          cannons: cls.cannons,
          cargo: {},
          cargoCap: cls.cargoCap,
          crew: {
            // A transport is packed with soldiers on top of her own people;
            // that is why boarding one is a bad idea and sinking it is not.
            current: Math.round(cls.crewMax * (plan.role === "transport" ? 0.95 : 0.85)),
            max: cls.crewMax,
            morale: 0.75,
          },
        },
        ai: {
          // Escorts are a warship's business and will close on anyone who
          // closes on them; a transport keeps station and runs for the beach.
          behavior: plan.role === "escort" ? "navy" : "trader",
          state: "travel",
          targetPortId: event.ports[0] as unknown as PortId,
          aggression: plan.role === "escort" ? 0.8 : 0.05,
          awarenessRadius: plan.role === "escort" ? 260 : 140,
          // They carry one piece of news, and it is their own orders. Hailing a
          // strange sail and being told where it is going is how a captain
          // finds out he has run into the invasion rather than a convoy.
          news: [{
            eventId: event.id,
            headline: event.headline,
            vars: event.vars,
            dayHeard: world.time.day,
            sourcePort: event.ports[0],
          }],
          expedition: { eventId: event.id, soldiers: plan.soldiers, guns: plan.guns },
        },
      },
    };
  });

  if (placed !== plans.length) return { world, rng };
  return { world: { ...world, entities }, rng: r };
}

/** Take this expedition's hulls off the chart, leaving the event untouched. */
export function dematerialize(world: WorldState, eventId: string): WorldState {
  const entities = { ...world.entities };
  let removed = false;
  for (const [id] of hullsOf(world, eventId)) {
    delete entities[id];
    removed = true;
  }
  return removed ? { ...world, entities } : world;
}

// ── The ledger ────────────────────────────────────────────

/**
 * Write what is still afloat back into the event.
 *
 * Called before anything is removed from the chart, which is the single rule
 * that makes recomputation safe — see the module header.
 */
export function syncLedger(world: WorldState, event: WorldEventState): WorldState {
  let soldiers = 0;
  let guns = 0;
  for (const [, e] of hullsOf(world, event.id)) {
    soldiers += e.ai?.expedition?.soldiers ?? 0;
    guns += e.ai?.expedition?.guns ?? 0;
  }
  const before = Number(event.vars.soldiers) || 0;
  if (soldiers === before && guns === (Number(event.vars.guns) || 0)) return world;

  let w: WorldState = {
    ...world,
    worldEvents: world.worldEvents.map(ev =>
      ev.id === event.id
        ? { ...ev, vars: { ...ev.vars, soldiers: Math.round(soldiers), guns: Math.round(guns) } }
        : ev,
    ),
  };

  // A drop while the squadron is on the chart can only mean one thing: a hull
  // went down with what it was carrying. The deliberate despawn writes the
  // ledger *before* it removes anything, so it never reaches this branch.
  const lost = before - soldiers;
  if (lost > 0) w = addLogEntry(w, "expedition.log_transport", { men: Math.round(lost) });

  return w;
}

/**
 * Strike a broken expedition from the world.
 *
 * The target gets the same cooling-off period it would have got from throwing
 * the landing back on the beach, because from the crown's side that is what
 * happened: the fleet it fitted out is not coming back. Without it the next
 * daily roll would simply order another one, and breaking a squadron at sea
 * would buy the player nothing at all.
 */
export function scatterExpedition(
  world: WorldState,
  event: WorldEventState,
): { world: WorldState; events: WorldEvent[] } {
  const portKey = event.ports[0];
  const claimant = event.factions[0];
  const vars = {
    port: CITIES[portKey]?.name ?? portKey,
    faction: FACTIONS[claimant]?.name ?? claimant,
  };

  let w: WorldState = {
    ...dematerialize(world, event.id),
    worldEvents: world.worldEvents.filter(ev => ev.id !== event.id),
    player: { ...world.player, notoriety: world.player.notoriety + 10 },
  };

  const port = w.ports[portKey];
  if (port) {
    const cooldown = event.type === "campaign" ? CAMPAIGN_COOLDOWN_DAYS : RELIEF_COOLDOWN_DAYS;
    w = {
      ...w,
      ports: {
        ...w.ports,
        [portKey]: event.type === "campaign"
          ? { ...port, nextCampaignDay: w.time.day + cooldown }
          : { ...port, nextReliefDay: w.time.day + cooldown },
      },
    };
  }

  w = addLogEntry(w, "expedition.log_scattered", vars);
  return { world: w, events: [{ type: "Toast", message: t("expedition.toast_scattered", vars) }] };
}

// ── The tick ──────────────────────────────────────────────

export type ExpeditionFleetTick = {
  world: WorldState;
  events: WorldEvent[];
};

/**
 * Reconcile every expedition at sea with what is on the chart.
 *
 * Order inside one expedition is fixed and matters:
 *
 *   1. write the ledger back from what is afloat
 *   2. decide whether it is still an expedition at all
 *   3. put hulls on the chart, or take them off
 *
 * Doing (3) before (1) would lose whatever the player had just done to it.
 */
export function tickExpeditionFleets(world: WorldState, dtTicks: number): ExpeditionFleetTick {
  const tick = world.time.tick;
  if (!tickBoundaryCrossed(tick - dtTicks, tick, EXPEDITION_INTERVAL_TICKS)) {
    return { world, events: [] };
  }

  let w = world;
  let rng = w.rng;
  const events: WorldEvent[] = [];

  // Hulls left behind by an expedition that has already arrived and been
  // resolved. `tickReconquest` drops the event on the day change; without this
  // its ships would sail on as a ghost squadron nobody is sending anywhere.
  const live = new Set(expeditionsInFlight(w).map(ev => ev.id));
  for (const [id, e] of Object.entries(w.entities)) {
    const owner = e.ai?.expedition?.eventId;
    if (owner && !live.has(owner)) {
      const entities = { ...w.entities };
      delete entities[id];
      w = { ...w, entities };
    }
  }

  for (const event of expeditionsInFlight(w)) {
    const afloat = w.entities && hullsOf(w, event.id).length > 0;
    const marked = event.vars[AFLOAT_VAR] === 1;

    if (afloat) {
      w = syncLedger(w, event);
    }

    const current = w.worldEvents.find(ev => ev.id === event.id);
    if (!current) continue;

    // Nothing left to put ashore. Either every hull is on the bottom, or the
    // transports are and the escorts are guarding an empty sea.
    if (marked && Number(current.vars.soldiers) <= 0) {
      const out = scatterExpedition(w, current);
      w = out.world;
      events.push(...out.events);
      continue;
    }

    const ideal = expeditionPos(w, current);
    if (!ideal) continue;
    // Reach is measured against the route, station-keeping against the water:
    // a squadron whose plotted position is a mile inland is still in the
    // offing, it is just anchored a little differently than the ruler says.
    const pos = nearestWater(ideal);
    const near = withinReach(w, ideal) && pos !== undefined;

    if (near && !afloat && pos) {
      const spawned = materialize(w, current, pos, rng);
      // A squadron whose hulls all landed on rock this pass is simply not on
      // the chart yet; it will be tried again next tick, from a new position.
      if (hullsOf(spawned.world, current.id).length > 0) {
        w = markAfloat(spawned.world, current.id, true);
        rng = spawned.rng;
      }
    } else if (!near && afloat) {
      w = markAfloat(dematerialize(w, current.id), current.id, false);
    }
  }

  return { world: { ...w, rng }, events };
}

function markAfloat(world: WorldState, eventId: string, afloat: boolean): WorldState {
  return {
    ...world,
    worldEvents: world.worldEvents.map(ev => {
      if (ev.id !== eventId) return ev;
      const vars = { ...ev.vars };
      if (afloat) vars[AFLOAT_VAR] = 1;
      else delete vars[AFLOAT_VAR];
      return { ...ev, vars };
    }),
  };
}
