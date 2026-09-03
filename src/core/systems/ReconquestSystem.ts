/**
 * ReconquestSystem — the crown comes back for the town you took.
 *
 * v0.13.0 let the player storm a town and change the flag over it. Nothing
 * ever changed it back, so the largest mechanic in the game had only half a
 * loop: a conquest that could never be lost is a trophy, not a holding. This
 * module is the other half.
 *
 * ## The shape of it
 *
 *   1. A town changes hands. `capturePort` stamps `capturedDay` on it and the
 *      dispossessed crown starts counting.
 *   2. After a grace period, every day is a roll: does a relief squadron sail?
 *      The roll leans on how much the crown has left, how badly it wants this
 *      particular town, and whether it is already fighting someone else.
 *   3. When it sails it becomes an ordinary `WorldEventState`, which means it
 *      travels the existing news plumbing — taverns across the crown's
 *      territory, and NPC captains who carry gossip to the open sea. The player
 *      hears the squadron is coming days before it arrives. That warning is the
 *      whole point: it is a summons.
 *   4. On the day it arrives the assault is resolved offscreen against whatever
 *      is defending the town, and the flag either holds or goes back up.
 *
 * ## What the player can actually do about it
 *
 * Two levers, and they are deliberately different in kind.
 *
 * **Station men.** Crew left ashore count as soldiers at face value in
 * `garrisonFor`. This is the answer for a town you cannot be at, and it costs
 * exactly what it looks like it costs: the men are off your deck until you come
 * back for them.
 *
 * **Be there.** A fleet standing off the harbour when the squadron arrives
 * throws its landing party into the defence, and a frigate's crew ashore
 * outweighs anything a sacked town has left. This is the answer for a town you
 * care enough about to sail back to.
 *
 * The town itself is deliberately *not* a lever. A place that changed hands
 * recovers only toward `heldDefenseCeiling` rather than its old royal baseline
 * — nobody is paying for a garrison any more — so waiting is not a strategy.
 *
 * ## Why the odds are sharpened
 *
 * A single fair roll on `defence / (attack + defence)` would throw away a town
 * held for a season on one unlucky number. `RESOLVE_SHARPNESS` raises both
 * sides to a power before comparing, which leaves a close fight a coin flip and
 * makes a lopsided one behave like the arithmetic says it should.
 *
 * Everything here is pure and seeded from `RngState`, like the rest of `core/`.
 */

import type { WorldState, RngState, WorldEventState, PortRuntimeState } from "../model/WorldState.ts";
import type { WorldEvent } from "../model/Events.ts";
import { factionId as makeFactionId } from "../model/ids.ts";
import { CITIES, type CitySize } from "../data/cities.ts";
import { FACTIONS } from "../data/factions.ts";
import { getPortBaseline } from "../data/economyBaselines.ts";
import { rngNext, rngNextFloat, rngNextInt } from "../services/RNG.ts";
import { t } from "../i18n/index.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { getReputationLevel } from "./ReputationSystem.ts";
import {
  portFaction,
  portChangedHands,
  garrisonFor,
  attackForceFor,
  writeBackForce,
  landingParty,
  SIZE_SOLDIERS,
  TYPE_WALL_CAP,
  SHIP_KEEPERS,
  type AttackForce,
} from "./SiegeSystem.ts";

// ── Constants ─────────────────────────────────────────────

/** Days after a town falls before any squadron can be fitted out for it. */
export const RELIEF_GRACE_DAYS = 12;
/** Days a beaten crown waits before trying again. */
export const RELIEF_COOLDOWN_DAYS = 45;
/** Daily chance of a squadron sailing, before every modifier below. */
export const RELIEF_DAILY_BASE = 0.06;
/** Days the squadron is at sea, and the warning the player gets. */
export const RELIEF_SAIL_DAYS: [number, number] = [6, 14];

/**
 * How much a crown wants each kind of town back.
 *
 * A capital is a wound; a fishing village is an inconvenience. This is the same
 * axis `SIZE_SOLDIERS` uses, so a town that is expensive to hold is also a town
 * they come for often — the two curves pull in the same direction on purpose.
 */
export const SIZE_PRIORITY: Record<CitySize, number> = {
  small: 0.6,
  medium: 0.9,
  large: 1.2,
  capital: 1.5,
};

/** Royal regulars against militia and pirates. They are better men. */
export const ROYAL_QUALITY = 1.15;
/** A crown already at war has its ships somewhere else. */
export const AT_WAR_PENALTY = 0.5;
/** The expedition doubles in size over this many days of the town being lost. */
export const ESCALATION_DAYS = 180;
/** Men a garrison loses each day to desertion and fever. */
export const GARRISON_DECAY = 0.004;
/**
 * Exponent applied to both sides before the odds are taken.
 *
 * 1.0 would be a fair roll on relative strength, which throws away a season's
 * work on one bad number. 1.8 leaves an even fight even and makes a two-to-one
 * advantage behave like two to one.
 */
export const RESOLVE_SHARPNESS = 1.8;
/** How far from the town the player's fleet still counts as present, in world px. */
export const PRESENCE_RANGE = 400;
/** A landing party fighting off boats on ground it does not know. */
export const PRESENCE_PENALTY = 0.7;
/** Gold in the wrecked transports, per soldier of a broken expedition. */
export const WRECK_GOLD_PER_SOLDIER = 3;
/** What a town that changed hands can rebuild on its own, as a share of baseline. */
export const HELD_DEFENSE_SHARE = 0.45;

/**
 * Flag prefixes stamped by `settleRelief` for every landing it settles.
 *
 * Kept here rather than in `DefenseContractSystem` because this is the module
 * that writes them, and a flag whose name lives somewhere other than its writer
 * is a flag that quietly stops matching.
 */
export const DEFENSE_HELD_FLAG = "defense_held_";
export const DEFENSE_LOST_FLAG = "defense_lost_";

const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));

// ── What a town that changed hands can rebuild ────────────

/**
 * True when this town is the player's own conquest.
 *
 * A taken town flies the black flag only while the player kept it for the
 * brethren; sacking it leaves the old colours up and handing it to a sponsor
 * gives it to that crown. So "pirate-held" is the same thing as "held by the
 * player" everywhere in this module, and it is the only ownership the player
 * has a stake in defending.
 */
export function playerHolds(world: WorldState, portKey: string): boolean {
  return (portFaction(world, portKey) as string) === "pirates" && portChangedHands(world, portKey);
}

/**
 * The `defense` value `EconomyTickSystem` pulls a port toward.
 *
 * A town under a crown recovers toward the royal baseline: somebody in Madrid
 * or Whitehall pays for the walls, the powder and the men, and that stays true
 * when the crown paying is not the one that founded the place — v0.16.0 lets
 * crowns take towns off each other, and a conquered colony gets a governor and
 * a garrison budget like any other.
 *
 * A town under the black flag has none of that, and its people will only raise
 * so much militia for whoever is holding the fort this month. Without that cap
 * the garrison lever would be pointless — the town would defend itself back to
 * full strength in a season and there would be nothing for the player to decide.
 */
export function heldDefenseCeiling(world: WorldState, portKey: string): number {
  const baseline = getPortBaseline(portKey).defense;
  return playerHolds(world, portKey) ? Math.round(baseline * HELD_DEFENSE_SHARE) : baseline;
}

// ── Stationing men ────────────────────────────────────────

/**
 * Men a town can usefully hold.
 *
 * Twice what the place keeps under arms at full defence: enough to make a small
 * outpost genuinely safe, never enough to turn a village into a fortress.
 */
export function garrisonCapacity(portKey: string): number {
  const def = CITIES[portKey];
  if (!def) return 0;
  return SIZE_SOLDIERS[def.population] * 2;
}

/** Men currently stationed in a town. */
export function garrisonAt(world: WorldState, portKey: string): number {
  return Math.max(0, Math.round(world.ports[portKey]?.garrison ?? 0));
}

/** The most men the player could station here right now, given the crew aboard. */
export function maxStationable(world: WorldState, portKey: string): number {
  const flagship = world.entities[world.player.shipId as string]?.ship;
  const spare = Math.max(0, (flagship?.crew.current ?? 0) - SHIP_KEEPERS);
  const room = Math.max(0, garrisonCapacity(portKey) - garrisonAt(world, portKey));
  return Math.min(spare, room);
}

/**
 * Move men between the flagship's berths and the town's walls.
 *
 * Positive `men` puts them ashore, negative takes them back. Both directions
 * are clamped to what is actually available, so a caller may pass an optimistic
 * number and read the real one back off the returned world.
 */
export function stationMen(world: WorldState, portKey: string, men: number): WorldState {
  const port = world.ports[portKey];
  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  if (!port || !entity?.ship) return world;

  const stationed = garrisonAt(world, portKey);
  const moved = men >= 0
    ? Math.min(Math.round(men), maxStationable(world, portKey))
    : -Math.min(Math.round(-men), stationed, Math.max(0, entity.ship.crew.max - entity.ship.crew.current));
  if (moved === 0) return world;

  return {
    ...world,
    ports: { ...world.ports, [portKey]: { ...port, garrison: stationed + moved } },
    entities: {
      ...world.entities,
      [shipId]: {
        ...entity,
        ship: {
          ...entity.ship,
          crew: { ...entity.ship.crew, current: entity.ship.crew.current - moved },
        },
      },
    },
  };
}

// ── Will they sail? ───────────────────────────────────────

/** True while this crown has a war on its hands somewhere. */
function crownAtWar(world: WorldState, faction: string): boolean {
  return world.worldEvents.some(
    ev => ev.type === "war_start" && ev.endDay >= world.time.day && ev.factions.includes(faction),
  );
}

/**
 * How much of its own empire a crown still holds, 0..1-and-a-bit.
 *
 * A crown stripped of half its colonies cannot fit out the squadron it could
 * have sent in better years, and one with nothing left cannot sail at all.
 */
export function crownStrength(world: WorldState, faction: string): number {
  let started = 0;
  let held = 0;
  for (const key of Object.keys(CITIES)) {
    if ((CITIES[key].factionId as string) === faction) started++;
    if ((portFaction(world, key) as string) === faction) held++;
  }
  if (started === 0) return 0;
  return held / started;
}

/** The crown that started with this town, and therefore wants it back. */
export function claimantFor(portKey: string): string | undefined {
  return CITIES[portKey]?.factionId as string | undefined;
}

/**
 * Any landing already at sea for this town, if there is one.
 *
 * Covers a crown's campaign as well as a relief squadron (v0.16.0): a colony
 * with two expeditions converging on it would have them fight the town one
 * after the other on the same morning, which reads as a bug however correct the
 * arithmetic is. First one to sail owns the target.
 */
export function activeExpeditionFor(world: WorldState, portKey: string): WorldEventState | undefined {
  return world.worldEvents.find(
    ev => (ev.type === "reconquest" || ev.type === "campaign") && ev.ports[0] === portKey,
  );
}

/** Every landing currently at sea, whoever is sending it. */
export function expeditionsInFlight(world: WorldState): WorldEventState[] {
  return world.worldEvents.filter(ev => ev.type === "reconquest" || ev.type === "campaign");
}

/** Days until the squadron for this town is off the harbour, if one is coming. */
export function daysUntilRelief(world: WorldState, portKey: string): number | undefined {
  const ev = activeExpeditionFor(world, portKey);
  return ev ? Math.max(0, ev.endDay - world.time.day) : undefined;
}

/** The chance, today, that a relief squadron sails for this town. */
export function reliefChance(world: WorldState, portKey: string): number {
  if (!portChangedHands(world, portKey)) return 0;
  const claimant = claimantFor(portKey);
  if (!claimant) return 0;
  if (activeExpeditionFor(world, portKey)) return 0;

  const port = world.ports[portKey];
  const earliest = port?.nextReliefDay
    ?? ((port?.capturedDay ?? world.time.day) + RELIEF_GRACE_DAYS);
  if (world.time.day < earliest) return 0;

  const strength = crownStrength(world, claimant);
  if (strength <= 0) return 0; // no harbour left to sail from

  return RELIEF_DAILY_BASE
    * SIZE_PRIORITY[CITIES[portKey].population]
    * clamp(0.3, 1.2, 0.3 + strength * 0.9)
    * (crownAtWar(world, claimant) ? AT_WAR_PENALTY : 1);
}

// ── The expedition ────────────────────────────────────────

export type Expedition = {
  soldiers: number;
  guns: number;
  sailDays: number;
};

/**
 * What the crown puts to sea.
 *
 * Scaled by the size of the town, by how much empire the crown has left to draw
 * on, and by how long the place has been in other hands — a town lost six
 * months ago is an embarrassment, and they send twice what they sent first.
 */
export function expeditionFor(
  world: WorldState,
  portKey: string,
  rng: RngState,
): { expedition: Expedition; rng: RngState } {
  const def = CITIES[portKey];
  const claimant = claimantFor(portKey) ?? "spain";
  const port = world.ports[portKey];
  const daysLost = Math.max(0, world.time.day - (port?.capturedDay ?? world.time.day));
  const escalation = 1 + Math.min(1, daysLost / ESCALATION_DAYS);
  // Capped at 1.0 rather than above it: a crown at full strength sends the
  // expedition the town's size calls for, and a stripped one sends less. Letting
  // it climb past 1 made a freshly sacked large town unholdable no matter how
  // many men were left in it, which is the one outcome that empties the
  // "keep it for the brethren" ending of meaning.
  const strength = clamp(0.5, 1.0, 0.4 + crownStrength(world, claimant) * 0.6);

  const sizeRoll = rngNextFloat(rng, 0.8, 1.3);
  const soldiers = Math.max(
    20,
    Math.round(SIZE_SOLDIERS[def.population] * sizeRoll.value * escalation * strength),
  );
  const sailRoll = rngNextInt(sizeRoll.state, RELIEF_SAIL_DAYS[0], RELIEF_SAIL_DAYS[1]);

  return {
    expedition: { soldiers, guns: Math.max(4, Math.round(soldiers / 4)), sailDays: sailRoll.value },
    rng: sailRoll.state,
  };
}

/**
 * Put a squadron to sea for a town.
 *
 * The event lists every port the claimant still holds, not just the target:
 * the fleet is fitting out in *their* harbours, so that is where the talk is.
 * `EventEffectsSystem` deliberately gives the type no per-port effect, which is
 * what makes that safe — this is a fleet at sea, not a condition in a town.
 */
export function launchExpedition(
  world: WorldState,
  portKey: string,
  rng: RngState,
): { world: WorldState; event: WorldEventState; rng: RngState } {
  const { expedition, rng: next } = expeditionFor(world, portKey, rng);
  const claimant = claimantFor(portKey) ?? "spain";
  const holder = portFaction(world, portKey) as string;

  const vars: Record<string, string | number> = {
    port: CITIES[portKey]?.name ?? portKey,
    faction: FACTIONS[claimant]?.name ?? claimant,
    holder: FACTIONS[holder]?.name ?? holder,
    soldiers: expedition.soldiers,
    guns: expedition.guns,
    days: expedition.sailDays,
  };

  const event: WorldEventState = {
    id: `reconquest_${portKey}_${world.time.day}`,
    type: "reconquest",
    startDay: world.time.day,
    endDay: world.time.day + expedition.sailDays,
    ports: [
      portKey,
      ...Object.keys(CITIES).filter(
        k => k !== portKey && (portFaction(world, k) as string) === claimant,
      ),
    ],
    factions: [claimant, holder],
    severity: 3,
    headline: "news.reconquest",
    vars,
  };

  let w: WorldState = { ...world, worldEvents: [...world.worldEvents, event] };
  w = addLogEntry(w, "news.reconquest", vars);
  return { world: w, event, rng: next };
}

// ── The defence ───────────────────────────────────────────

/** True when the player's fleet is close enough to throw men into the defence. */
export function playerPresentAt(world: WorldState, portKey: string): boolean {
  const def = CITIES[portKey];
  if (!def) return false;
  if (world.player.location.type === "port") {
    return (world.player.location.portId as string | undefined) === portKey;
  }
  const pos = world.player.location.pos;
  const dx = pos.x - def.pos.x;
  const dy = pos.y - def.pos.y;
  return dx * dx + dy * dy <= PRESENCE_RANGE * PRESENCE_RANGE;
}

/**
 * What the player's own men are worth ashore.
 *
 * Same shape as the attack term in `assaultStrengths` — men, morale, the
 * captain's sword, drill — because it is the same landing party doing the same
 * work from the other side of the beach, less a penalty for fighting off boats.
 */
export function fleetDefenceContribution(world: WorldState): number {
  const force = attackForceFor(world);
  const men = landingParty(force);
  if (men <= 0) return 0;
  return Math.round(
    men
    * (0.6 + clamp(0, 1, force.morale) * 0.6)
    * (1 + force.fencing / 14)
    * (0.85 + clamp(0, 1, force.training) * 0.3)
    * PRESENCE_PENALTY,
  );
}

/**
 * What stands in the squadron's way.
 *
 * Militia and stationed men behind whatever the walls are worth, with the shore
 * guns swung inland. The wall term is measured against what this kind of place
 * could mount rather than against its own current state — an offscreen assault
 * has no bombardment phase to knock a ratio down, so the ratio has to be
 * absolute or a town with three courses of rubble would count as fully walled.
 */
export function defenceStrength(world: WorldState, portKey: string, playerPresent: boolean): number {
  const def = CITIES[portKey];
  if (!def) return 0;
  const fort = garrisonFor(world, portKey);
  const wallFactor = 0.5 + clamp(0, 1, fort.walls / TYPE_WALL_CAP[def.type]) * 0.8;
  const gunFactor = 1 + fort.guns * 0.02;
  const town = fort.soldiers * wallFactor * gunFactor;
  return Math.round(town + (playerPresent ? fleetDefenceContribution(world) : 0));
}

/** What the squadron brings ashore. */
export function attackStrength(expedition: Expedition): number {
  return Math.round(expedition.soldiers * ROYAL_QUALITY * (1 + expedition.guns * 0.01));
}

/**
 * Odds the town holds.
 *
 * See `RESOLVE_SHARPNESS`: both sides are raised to a power before the ratio is
 * taken, so a close fight stays a coin flip and a lopsided one stops pretending
 * to be one.
 */
export function holdOdds(defence: number, attack: number): number {
  if (defence <= 0) return 0;
  if (attack <= 0) return 1;
  const d = Math.pow(defence, RESOLVE_SHARPNESS);
  const a = Math.pow(attack, RESOLVE_SHARPNESS);
  return d / (d + a);
}

// ── Resolution ────────────────────────────────────────────

export type ReliefResult = {
  world: WorldState;
  events: WorldEvent[];
  portKey: string;
  /** True when the town changed hands back to the crown that lost it. */
  townLost: boolean;
  playerPresent: boolean;
  defence: number;
  attack: number;
  /** Stationed men who did not survive the day. */
  garrisonLost: number;
  /** Gold out of the wrecked transports, only if the player was there. */
  gold: number;
};

/**
 * True when the player's own conquest is under attack and the player is there.
 *
 * Being nearby is not, on its own, joining in. Since v0.16.0 crowns also march
 * on each other's colonies, and a captain who happens to be beating up the
 * coast when a French expedition lands on a Spanish town has no business in
 * that fight — nor should he collect the wrecked transports. Standing in a
 * defence that is not yours is a decision, and it is taken in
 * `CityDefenseScene`, not by proximity.
 */
export function playerDefends(world: WorldState, portKey: string): boolean {
  return playerHolds(world, portKey) && playerPresentAt(world, portKey);
}

/** Everything a settlement needs that the arithmetic has already decided. */
export type ReliefSettlement = {
  held: boolean;
  /** True when the player's men stood in the defence and share in what follows. */
  playerFought: boolean;
  /** Stationed men still on the walls when it was over. */
  garrisonAfter: number;
  /** Men of the player's landing party who did not come back, if it fought. */
  partyLost: number;
  /**
   * The fleet before and after, when a battle was actually played out.
   *
   * Absent for an offscreen resolution, where the only cost is `partyLost`.
   */
  force?: { initial: AttackForce; final: AttackForce };
};

/**
 * Write down who holds the town after a landing, and what it cost.
 *
 * Split out of `resolveRelief` in v0.16.0 because there are now three ways a
 * landing can be decided — a squadron the player never saw, a campaign between
 * two crowns, and a battle fought round by round in `CityDefenseScene` — and
 * all three have to leave the world in exactly the same shape. Only the
 * arithmetic is allowed to differ; the bookkeeping is not.
 */
export function settleRelief(
  world: WorldState,
  portKey: string,
  claimant: string,
  expedition: Expedition,
  s: ReliefSettlement,
): { world: WorldState; events: WorldEvent[]; gold: number } {
  const port = world.ports[portKey];
  let w = world;
  const events: WorldEvent[] = [];
  let gold = 0;

  if (port) {
    const baseline = getPortBaseline(portKey);
    const updated: PortRuntimeState = s.held
      ? {
          ...port,
          garrison: Math.max(0, Math.round(s.garrisonAfter)),
          // The walls took another battering holding them off.
          defense: Math.max(0, Math.round(port.defense * 0.85)),
          nextReliefDay: world.time.day + RELIEF_COOLDOWN_DAYS,
        }
      : {
          ...port,
          factionId: makeFactionId(claimant),
          garrison: 0,
          // They hold it again, but they have not rebuilt it.
          defense: Math.max(0, Math.round(baseline.defense * 0.5)),
          // A town back under the flag it was founded with has no clock running
          // against it. One taken by a *different* crown — which v0.16.0 makes
          // possible — starts the same countdown a player's conquest does.
          capturedDay: (CITIES[portKey]?.factionId as string) === claimant ? undefined : world.time.day,
          nextReliefDay: undefined,
        };
    w = { ...w, ports: { ...w.ports, [portKey]: updated } };
  }

  const vars = {
    port: CITIES[portKey]?.name ?? portKey,
    faction: FACTIONS[claimant]?.name ?? claimant,
    soldiers: expedition.soldiers,
  };

  // The outcome as a world flag, both ways round, on every one of the three
  // paths into this function (v0.17.0). `QuestSystem` has no idea what a
  // landing is and `CityDefenseScene` has no idea what a quest is; the flag is
  // the whole of the joint, exactly as `family_step_N` is between the family
  // thread and the duel screen. Both are written every time so a second
  // contract for the same town is judged on this landing and not the last one.
  w = {
    ...w,
    worldFlags: {
      ...w.worldFlags,
      [`${DEFENSE_HELD_FLAG}${portKey}`]: s.held,
      [`${DEFENSE_LOST_FLAG}${portKey}`]: !s.held,
    },
  };

  if (s.held) {
    gold = s.playerFought ? Math.round(expedition.soldiers * WRECK_GOLD_PER_SOLDIER) : 0;
    w = {
      ...w,
      player: {
        ...w.player,
        gold: w.player.gold + gold,
        notoriety: w.player.notoriety + (s.playerFought ? 8 : 4),
      },
    };
    w = addLogEntry(w, s.playerFought ? "reconquest.log_held_present" : "reconquest.log_held", vars);
    events.push({ type: "Toast", message: t("reconquest.toast_held", vars) });
  } else {
    w = addLogEntry(w, "reconquest.log_lost", vars);
    events.push({ type: "Toast", message: t("reconquest.toast_lost", vars) });
  }

  // What the fight cost the ships. A played-out battle hands over the whole
  // before-and-after, because its hulls were under the fort's guns for real
  // rounds; an offscreen one only knows how many men are missing.
  if (s.force) {
    w = writeBackForce(w, s.force.initial, s.force.final, s.partyLost);
  } else if (s.partyLost > 0) {
    const initial = attackForceFor(w);
    w = writeBackForce(w, initial, { ...initial, crew: Math.max(0, initial.crew - s.partyLost) });
  }

  return { world: w, events, gold };
}

/** Pull an `Expedition` back out of the event that carried it across the map. */
export function expeditionFromEvent(event: WorldEventState): Expedition {
  return {
    soldiers: Number(event.vars.soldiers) || 0,
    guns: Number(event.vars.guns) || 0,
    sailDays: Number(event.vars.days) || 0,
  };
}

/**
 * Fight the landing and write down who holds the town afterwards.
 *
 * Losses are a share of each side's own numbers, scaled by how close the fight
 * was: a walkover costs the winner almost nothing and the loser almost
 * everything, an even fight bleeds both. Same reasoning as `resolveAssault`,
 * where sharing one casualty pool made being outnumbered count twice.
 */
export function resolveRelief(
  world: WorldState,
  event: WorldEventState,
  rng: RngState,
): { result: ReliefResult; rng: RngState } {
  const portKey = event.ports[0];
  const claimant = event.factions[0];
  const expedition = expeditionFromEvent(event);

  const playerPresent = playerDefends(world, portKey);
  const defence = defenceStrength(world, portKey, playerPresent);
  const attack = attackStrength(expedition);
  const pHold = holdOdds(defence, attack);

  const roll = rngNext(rng);
  const held = roll.value < pHold;

  // 0 when one side never had a chance, 1 when it was anyone's town.
  const closeness = 1 - Math.abs(pHold - 0.5) * 2;
  const loserLoss = 0.55 + closeness * 0.35;
  const winnerLoss = 0.10 + closeness * 0.35;
  const townLossFrac = held ? winnerLoss : loserLoss;

  const stationed = garrisonAt(world, portKey);
  const garrisonLost = Math.min(stationed, Math.round(stationed * townLossFrac));

  // Being there means bleeding for it. Half the wave's loss rate, because the
  // landing party is fighting alongside a garrison rather than alone.
  const partyLost = playerPresent
    ? Math.round(landingParty(attackForceFor(world)) * townLossFrac * 0.5)
    : 0;

  // The squadron is gone either way — it is not a standing force that sails home.
  const cleared: WorldState = {
    ...world,
    worldEvents: world.worldEvents.filter(ev => ev.id !== event.id),
  };

  const settled = settleRelief(cleared, portKey, claimant, expedition, {
    held,
    playerFought: playerPresent,
    garrisonAfter: stationed - garrisonLost,
    partyLost,
  });

  return {
    result: {
      world: settled.world,
      events: settled.events,
      portKey,
      townLost: !held,
      playerPresent,
      defence,
      attack,
      garrisonLost,
      gold: settled.gold,
    },
    rng: roll.state,
  };
}

// ── Daily tick ────────────────────────────────────────────

export type ReconquestTick = {
  world: WorldState;
  events: WorldEvent[];
  /** Ports whose flag changed today, for the map to repaint. */
  ownersChanged: string[];
  /**
   * Ports whose landing was settled today, held or lost.
   *
   * `settleRelief` stamps `defense_held_`/`defense_lost_` for each of them; this
   * is the list the engine turns into `flag_set` quest events, so a defence
   * commission is paid out by a battle the player never watched.
   */
  settled: string[];
  /**
   * A landing the player is standing in the middle of.
   *
   * Handed up unresolved: the world has already dropped the event, but nothing
   * has been written about the town. `CityDefenseScene` fights it out and calls
   * `settleRelief` itself. Only one landing is playable in a day — a second one
   * on the same morning is resolved offscreen, because there is only one
   * captain and he can only be in one harbour.
   */
  playable?: PendingDefense;
};

/** A landing that has arrived somewhere the player can do something about it. */
export type PendingDefense = {
  portKey: string;
  /** The crown whose men are in the boats. */
  claimant: string;
  /** Who the walls answer to this morning. */
  holder: string;
  expedition: Expedition;
  /** True when the town being defended is somebody else's. */
  allied: boolean;
};

/**
 * True when the player would be welcome on this crown's walls.
 *
 * A letter of marque is the explicit version — you are their privateer, and
 * their colony is your business. Standing as "allied" on the reputation scale
 * is the earned version. Anything less and the militia would as soon shoot at
 * the boats as the ones coming ashore.
 */
export function alliedWith(world: WorldState, faction: string): boolean {
  if (faction === "pirates") return false;
  if (world.worldFlags[`letter_of_marque_${faction}`] === true) return true;
  return getReputationLevel(world.player.reputation[faction] ?? 0) === "allied";
}

/**
 * Whether this landing is something the player gets to fight, and for whom.
 *
 * Two ways in, and the second one is the reason `allied` exists: your own town,
 * or a town belonging to a crown that counts you as one of its own. Everything
 * else resolves offscreen however close the player happens to be drifting.
 */
export function pendingDefenseFor(world: WorldState, event: WorldEventState): PendingDefense | undefined {
  const portKey = event.ports[0];
  if (!CITIES[portKey]) return undefined;
  if (!playerPresentAt(world, portKey)) return undefined;

  const holder = portFaction(world, portKey) as string;
  const claimant = event.factions[0];
  const own = playerHolds(world, portKey);
  if (!own && !alliedWith(world, holder)) return undefined;

  return { portKey, claimant, holder, expedition: expeditionFromEvent(event), allied: !own };
}

/**
 * Once per game day, before `updateWorldEvents`.
 *
 * Order matters: `expireEvents` there drops anything whose `endDay` has passed,
 * and a squadron that arrives and is quietly deleted instead of fighting would
 * be the worst possible bug in this module — silent, and only visible as towns
 * that are never attacked.
 */
export function tickReconquest(world: WorldState): ReconquestTick {
  let w = world;
  let rng = w.rng;
  const events: WorldEvent[] = [];
  const ownersChanged: string[] = [];
  const settled: string[] = [];
  let playable: PendingDefense | undefined;

  // 1. Garrisons bleed men whether or not anyone is shooting at them.
  const decayed: Record<string, PortRuntimeState> = {};
  let anyDecay = false;
  for (const [key, port] of Object.entries(w.ports)) {
    const men = Math.round(port.garrison ?? 0);
    if (men <= 0) continue;
    const left = Math.max(0, men - Math.max(1, Math.round(men * GARRISON_DECAY)));
    if (left !== men) {
      decayed[key] = { ...port, garrison: left };
      anyDecay = true;
    }
  }
  if (anyDecay) w = { ...w, ports: { ...w.ports, ...decayed } };

  // 2. Squadrons that have finished their passage fight for their town.
  for (const ev of expeditionsInFlight(w)) {
    if (ev.endDay > w.time.day) continue;

    // A landing the player is standing in comes back up unresolved. The event
    // is dropped here all the same: it has arrived, and leaving it in the world
    // would have `expireEvents` delete it on the next day change — which, for
    // the one landing the player was told to sail back for, would look exactly
    // like the squadron turning around and going home.
    const pending = !playable ? pendingDefenseFor(w, ev) : undefined;
    if (pending) {
      playable = pending;
      w = { ...w, worldEvents: w.worldEvents.filter(e => e.id !== ev.id) };
      continue;
    }

    const { result, rng: next } = resolveRelief(w, ev, rng);
    w = result.world;
    rng = next;
    events.push(...result.events);
    settled.push(result.portKey);
    if (result.townLost) ownersChanged.push(result.portKey);
  }

  // 3. Roll for new squadrons.
  for (const portKey of Object.keys(w.ports)) {
    // Not for the town whose landing is being fought right now. Dropping the
    // arrived event leaves that port looking unthreatened again, and the roll
    // would happily fit out a second squadron for a battle already in progress
    // — which the scene would then settle around, leaving a ghost expedition at
    // sea for a town it had just decided the fate of.
    if (playable && portKey === playable.portKey) continue;
    const chance = reliefChance(w, portKey);
    if (chance <= 0) continue;
    const roll = rngNext(rng);
    rng = roll.state;
    if (roll.value >= chance) continue;
    const launched = launchExpedition(w, portKey, rng);
    w = launched.world;
    rng = launched.rng;
    events.push({
      type: "Toast",
      message: t("reconquest.toast_sailing", launched.event.vars),
    });
  }

  return { world: { ...w, rng }, events, ownersChanged, settled, playable };
}
