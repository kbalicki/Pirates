/**
 * CityDefenseSystem — the other end of a landing.
 *
 * v0.15.0 gave the crown a way to come back for a town the player took, and
 * resolved the landing offscreen: a toast, a log line, a flag that had already
 * changed by the time the player read about it. That was the right shape for a
 * town the player could not be at, and the wrong one for a town he had sailed
 * three days to defend. It left one place in the game where being there in
 * person bought the player a message instead of a battle.
 *
 * This module is `SiegeSystem` seen from the beach. The same fort, the same
 * walls, the same waves of men — except the player is behind the guns now, and
 * the thing standing off the harbour belongs to somebody else.
 *
 * ## The one decision, and why it is the right one
 *
 * The bombardment is the whole game here, and it is a targeting decision:
 *
 *   **At the transports.** Every hit is soldiers who never reach the sand. It
 *   does nothing about the shot coming back, so the walls come down while you
 *   do it, and the men who *do* land, land against a breach.
 *
 *   **At the gun ships.** Every hit is a gun that stops firing at your walls —
 *   and, because the escort lies between the battery and the boats, a gun that
 *   stops screening the transports.
 *
 * That second clause is what makes this a decision rather than a formality.
 * Going straight at the boats with the escort untouched wastes most of the
 * shot (`ESCORT_COVER`); clearing the escort first opens them up but costs
 * rounds of wall you will want back when the men are on the sand. Both routes
 * feed the same closing arithmetic — soldiers and quality against garrison and
 * wall — from opposite ends, and which one is right depends on whether the
 * expedition is mostly men or mostly guns.
 *
 * ## The second decision, which costs something either way
 *
 * `landMen` takes the fleet's landing party off the decks and puts it on the
 * walls. Those men are the single biggest number on the defending side — and
 * they are also the men working the ships' guns, so the broadside supporting
 * the shore battery drops in proportion. Commit early and the walls are
 * crowded but the harbour goes quiet; commit late and you may not get to.
 *
 * If the town falls, most of them do not come back.
 *
 * ## What is deliberately not here
 *
 * No manoeuvre, no ship positions, no firing arcs. `SeaBattleScene` is where
 * the game does that, and it does it against one hull at a time. A relief
 * squadron is six or eight sail and a thousand men; simulating it that way
 * would be a different game and a worse one. What the player is actually
 * deciding is a number, so the screen shows him numbers.
 *
 * Pure and seeded from `RngState`, like the rest of `core/`.
 */

import type { WorldState, RngState } from "../model/WorldState.ts";
import type { WorldEvent } from "../model/Events.ts";
import { CITIES } from "../data/cities.ts";
import { rngNext } from "../services/RNG.ts";
import { changeReputation } from "./ReputationSystem.ts";
import {
  garrisonFor,
  attackForceFor,
  landingParty,
  fortAccuracy,
  bombardAccuracy,
  TYPE_WALL_CAP,
  FORT_SHOT_HULL,
  FORT_SHOT_CREW,
  FLEET_BREAK_HULL,
  MAX_WAVES,
  WAVE_INTENSITY,
  DEFENDER_ROUT,
  ATTACKER_ROUT,
  type FortState,
  type AttackForce,
} from "./SiegeSystem.ts";
import {
  attackStrength,
  settleRelief,
  garrisonAt,
  type Expedition,
  type PendingDefense,
} from "./ReconquestSystem.ts";

// ── Constants ─────────────────────────────────────────────

/** How well a royal squadron shoots at a fixed target from a moving deck. */
export const SQUADRON_ACCURACY = 0.45;
/** Share of a squadron hit that goes into the masonry. */
export const SQ_HIT_TO_WALLS = 0.40;
/** Share of a squadron hit that dismounts a shore gun. */
export const SQ_HIT_TO_GUNS = 0.12;
/** Soldiers drowned per shore hit that finds a transport, with the boats exposed. */
export const SHOT_TO_SOLDIERS = 1.6;
/**
 * How much of the shot at the boats an intact escort takes for them.
 *
 * Without this the module had no game in it. Firing on the transports was
 * strictly better every round — it went straight at the number that decides the
 * beach — so the escort was scenery and the targeting choice was not a choice.
 *
 * Now the escort is a screen: with its guns unfought it soaks most of what is
 * aimed past it, and the only way to the boats is to spend rounds silencing it
 * while the walls come down. That is the shape the whole module wanted — you
 * cannot have both the wall and the empty boats, and which one you go for
 * depends on whether the expedition is mostly men or mostly guns.
 */
export const ESCORT_COVER = 0.65;
/** Squadron guns silenced per shore hit that finds an escort. */
export const SHOT_TO_SQUADRON_GUNS = 0.30;
/**
 * Share of the squadron's fire that answers the ships instead of the walls.
 *
 * A fleet lying in the roads is the nearer and more dangerous target, so it
 * draws shot the town would otherwise be taking. This is the hidden half of
 * keeping the ships in the fight: they are shooting *and* soaking.
 */
export const FLEET_FIRE_SHARE = 0.30;
/** Walls, as a share of what this kind of place can mount, that invite a landing. */
export const LANDING_TRIGGER_WALLS = 0.40;
/** Rounds a squadron will trade before it lands whatever the walls look like. */
export const SQUADRON_PATIENCE = 8;
/** Share of a landing party that gets back to the boats from a town that fell. */
export const ROUTED_PARTY_SURVIVAL = 0.30;
/** Reputation the crown whose landing you broke takes off you. */
export const DEFENCE_CLAIMANT_REP = -15;
/** Reputation a crown pays for a colony you saved that was never yours. */
export const ALLY_DEFENCE_REP = 25;

const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));

// ── State ─────────────────────────────────────────────────

export type SquadronState = {
  soldiers: number;
  soldiersMax: number;
  guns: number;
  gunsMax: number;
};

/** Where the shore battery is putting its shot this round. */
export type DefenseTarget = "transports" | "escorts";

export type DefensePhase = "bombard" | "assault" | "over";

export type DefenseState = {
  portKey: string;
  /** The crown in the boats. */
  claimant: string;
  /** Who the walls answer to. */
  holder: string;
  /** True when the town is not the player's own. */
  allied: boolean;
  fort: FortState;
  squadron: SquadronState;
  force: AttackForce;
  /** Men the player had stationed here before any of this started. */
  stationed: number;
  /** Men taken off the ships and put on the walls this battle. */
  landed: number;
  /** False once the fleet has been driven off or has cut its cables. */
  fleetEngaged: boolean;
  round: number;
  phase: DefensePhase;
};

export function squadronFor(expedition: Expedition): SquadronState {
  return {
    soldiers: Math.max(0, Math.round(expedition.soldiers)),
    soldiersMax: Math.max(1, Math.round(expedition.soldiers)),
    guns: Math.max(0, Math.round(expedition.guns)),
    gunsMax: Math.max(1, Math.round(expedition.guns)),
  };
}

export function createDefense(world: WorldState, pending: PendingDefense): DefenseState {
  const force = attackForceFor(world);
  return {
    portKey: pending.portKey,
    claimant: pending.claimant,
    holder: pending.holder,
    allied: pending.allied,
    fort: garrisonFor(world, pending.portKey),
    squadron: squadronFor(pending.expedition),
    force,
    stationed: garrisonAt(world, pending.portKey),
    landed: 0,
    // A fleet with no hull left never was in this fight.
    fleetEngaged: force.hullHp > force.hullMax * FLEET_BREAK_HULL && force.crew >= 5,
    round: 0,
    phase: "bombard",
  };
}

/** The expedition as it stands now, for handing back to `settleRelief`. */
export function expeditionOf(state: DefenseState): Expedition {
  return { soldiers: state.squadron.soldiers, guns: state.squadron.guns, sailDays: 0 };
}

// ── The guns ──────────────────────────────────────────────

/**
 * Guns the player's ships can still work, given how many hands are left aboard.
 *
 * Landing the party is not free twice over: the men on the walls are the men
 * who were serving the broadside, and the harbour gets quieter for exactly as
 * long as they are ashore.
 */
export function fleetGuns(state: DefenseState, crewStart: number): number {
  if (!state.fleetEngaged) return 0;
  const manned = crewStart > 0 ? clamp(0, 1, state.force.crew / crewStart) : 0;
  return Math.round(state.force.cannons * manned);
}

/**
 * How much of a shot aimed at the boats actually reaches them, 0..1.
 *
 * All of it once the escort is silenced, barely a third of it while the escort
 * is intact and lying between the battery and the transports.
 */
export function transportExposure(state: DefenseState): number {
  const escort = state.squadron.gunsMax > 0
    ? clamp(0, 1, state.squadron.guns / state.squadron.gunsMax)
    : 0;
  return 1 - ESCORT_COVER * escort;
}

/** Everything on the defender's side that is pointed at the water. */
export function shoreHits(state: DefenseState, crewStart: number, swing: number): number {
  const fromFort = state.fort.guns * fortAccuracy(state.fort.walls, state.fort.wallsMax);
  const fromFleet = fleetGuns(state, crewStart)
    * bombardAccuracy(state.force.gunnery, state.force.training);
  return (fromFort + fromFleet) * swing;
}

export type DefenseRound = {
  state: DefenseState;
  rng: RngState;
  /** Soldiers who went into the water with their boat. */
  soldiersDrowned: number;
  /** Squadron guns put out of action. */
  squadronGunsSilenced: number;
  /** What the squadron did to the town. */
  wallsBreached: number;
  fortGunsLost: number;
  /** What the squadron did to the ships standing in the roads. */
  hullLost: number;
  crewLost: number;
  /** True when the ships have had enough and stand out to sea. */
  fleetDriven: boolean;
  /** True when the boats are in the water and the bombardment is over. */
  landing: boolean;
  /** True when there is nobody left aboard the squadron to land. */
  squadronBroken: boolean;
};

/**
 * One exchange, with the shore choosing where to put its shot.
 *
 * Both sides fire at once, exactly as in `bombardRound` — silencing the last
 * escort still costs the town that escort's final broadside. The squadron
 * decides on its own when it has waited long enough, which is the pressure:
 * the player does not get to keep firing until the harbour is clear.
 */
export function defenseRound(
  state: DefenseState,
  target: DefenseTarget,
  rng: RngState,
  crewStart: number,
): DefenseRound {
  const shoreRoll = rngNext(rng);
  const sqRoll = rngNext(shoreRoll.state);

  // ── The shore fires ────────────────────────────────────
  const hits = shoreHits(state, crewStart, 0.75 + shoreRoll.value * 0.5);
  const soldiersDrowned = target === "transports"
    ? Math.min(state.squadron.soldiers, Math.round(hits * SHOT_TO_SOLDIERS * transportExposure(state)))
    : 0;
  const squadronGunsSilenced = target === "escorts"
    ? Math.min(state.squadron.guns, Math.round(hits * SHOT_TO_SQUADRON_GUNS))
    : 0;

  // ── The squadron answers with the guns it had at the start of the round ──
  const sqHits = state.squadron.guns * SQUADRON_ACCURACY * (0.75 + sqRoll.value * 0.5);
  const atShips = state.fleetEngaged ? FLEET_FIRE_SHARE : 0;
  const atTown = sqHits * (1 - atShips);

  const wallsBreached = Math.min(state.fort.walls, atTown * SQ_HIT_TO_WALLS);
  const fortGunsLost = Math.min(state.fort.guns, atTown * SQ_HIT_TO_GUNS);
  const hullLost = Math.min(state.force.hullHp, sqHits * atShips * FORT_SHOT_HULL);
  const crewLost = Math.min(state.force.crew, Math.round(sqHits * atShips * FORT_SHOT_CREW));

  const fort: FortState = {
    ...state.fort,
    walls: Math.max(0, Math.round((state.fort.walls - wallsBreached) * 10) / 10),
    guns: Math.max(0, Math.round(state.fort.guns - fortGunsLost)),
  };
  const squadron: SquadronState = {
    ...state.squadron,
    soldiers: Math.max(0, state.squadron.soldiers - soldiersDrowned),
    guns: Math.max(0, state.squadron.guns - squadronGunsSilenced),
  };
  const force: AttackForce = {
    ...state.force,
    hullHp: Math.max(0, Math.round((state.force.hullHp - hullLost) * 10) / 10),
    crew: Math.max(0, state.force.crew - crewLost),
  };

  // Same threshold the attacking fleet breaks at in a siege: below a fifth of
  // its hull there is nothing keeping the guns out of the water.
  const fleetDriven = state.fleetEngaged
    && (force.hullHp <= force.hullMax * FLEET_BREAK_HULL || force.crew < 5);

  const round = state.round + 1;
  const squadronBroken = squadron.soldiers <= 0;
  const landing = !squadronBroken && (
    fort.walls <= fort.wallsMax * LANDING_TRIGGER_WALLS
    || squadron.guns <= 0
    || round >= SQUADRON_PATIENCE
  );

  return {
    state: {
      ...state,
      fort,
      squadron,
      force,
      fleetEngaged: state.fleetEngaged && !fleetDriven,
      round,
      phase: squadronBroken ? "over" : landing ? "assault" : "bombard",
    },
    rng: sqRoll.state,
    soldiersDrowned,
    squadronGunsSilenced,
    wallsBreached: Math.round(wallsBreached * 10) / 10,
    fortGunsLost: Math.round(fortGunsLost * 10) / 10,
    hullLost: Math.round(hullLost * 10) / 10,
    crewLost,
    fleetDriven,
    landing,
    squadronBroken,
  };
}

// ── Putting the ships' men on the walls ───────────────────

/** Men the fleet could still put ashore, if any. */
export function landableMen(state: DefenseState): number {
  if (state.landed > 0 || !state.fleetEngaged) return 0;
  return landingParty(state.force);
}

/**
 * Move the landing party from the decks to the walls.
 *
 * One-way and one-shot. The men count as garrison at face value — the same
 * face value stationed crew get in `garrisonFor` — and they stop working the
 * ships' guns the moment they are in the boats.
 */
export function landMen(state: DefenseState): DefenseState {
  const men = landableMen(state);
  if (men <= 0) return state;
  return {
    ...state,
    fort: {
      ...state.fort,
      soldiers: state.fort.soldiers + men,
      soldiersMax: Math.max(state.fort.soldiersMax, state.fort.soldiers + men),
    },
    force: { ...state.force, crew: Math.max(0, state.force.crew - men) },
    landed: men,
  };
}

// ── The beach ─────────────────────────────────────────────

/**
 * What the town is worth when the boats ground.
 *
 * Deliberately the same shape as `assaultStrengths` and `defenceStrength`: the
 * garrison behind whatever the walls are still worth, with the surviving shore
 * guns sweeping the sand. A place with its curtain intact is worth up to 2.5x
 * the same men standing in a breach, which is the entire argument for having
 * spent the bombardment on the escorts rather than the boats.
 */
export function townStrength(state: DefenseState): number {
  const def = CITIES[state.portKey];
  const cap = def ? TYPE_WALL_CAP[def.type] : state.fort.wallsMax;
  const wallFactor = 0.5 + clamp(0, 1, state.fort.walls / Math.max(1, cap)) * 0.8;
  const gunFactor = 1 + state.fort.guns * 0.02;
  return Math.round(state.fort.soldiers * wallFactor * gunFactor);
}

/** Odds the town holds, as they stand this round. */
export function defenseOdds(state: DefenseState): number {
  const town = townStrength(state);
  const landing = attackStrength(expeditionOf(state));
  if (landing <= 0) return 1;
  if (town <= 0) return 0;
  // No sharpening here, unlike the offscreen roll: this fight is fought wave by
  // wave, and the attrition already does what `RESOLVE_SHARPNESS` was standing
  // in for. Sharpening on top would count the same advantage twice.
  return town / (town + landing);
}

export type DefenseWave = {
  townLosses: number;
  landingLosses: number;
  townLeft: number;
  landingLeft: number;
};

export type DefenseAssault = {
  held: boolean;
  waves: DefenseWave[];
  townLosses: number;
  landingLosses: number;
  /** Defenders still on their feet when it was over. */
  townLeft: number;
  rng: RngState;
};

/**
 * Fight the landing wave by wave.
 *
 * `resolveAssault` with the roles swapped: each side loses a share of its own
 * numbers weighted by who is winning, and the first side past its rout
 * threshold breaks. The thresholds are the siege's own — a garrison breaks at
 * a third down, a landing party re-embarks at not quite half — because they
 * describe the men, not which end of the beach they are standing on.
 */
export function resolveDefenseAssault(state: DefenseState, rng: RngState): DefenseAssault {
  const townPower = townStrength(state);
  const landingPower = attackStrength(expeditionOf(state));

  let town = state.fort.soldiers;
  let landing = state.squadron.soldiers;
  const townStart = town;
  const landingStart = landing;

  const waves: DefenseWave[] = [];
  let rngState = rng;
  let held = false;

  const total = townPower + landingPower;
  const townShare = total > 0 ? townPower / total : 0;

  for (let i = 0; i < MAX_WAVES && town > 0 && landing > 0; i++) {
    const roll = rngNext(rngState);
    rngState = roll.state;
    const swing = clamp(0, 1, townShare * (0.75 + roll.value * 0.5));

    const landingLosses = Math.min(landing, Math.max(1, Math.round(landing * WAVE_INTENSITY * swing * 2)));
    const townLosses = Math.min(town, Math.max(1, Math.round(town * WAVE_INTENSITY * (1 - swing) * 2)));

    town -= townLosses;
    landing -= landingLosses;
    waves.push({ townLosses, landingLosses, townLeft: town, landingLeft: landing });

    if (landing <= landingStart * ATTACKER_ROUT) { held = true; break; }
    if (town <= townStart * DEFENDER_ROUT) { held = false; break; }
  }

  // Running the waves out with men still on the walls is a repulse: the tide
  // turns and what is left of the landing party goes back to the boats.
  if (landing <= 0) held = true;
  else if (town <= 0) held = false;
  else if (waves.length >= MAX_WAVES) held = true;

  return {
    held,
    waves,
    townLosses: townStart - town,
    landingLosses: landingStart - landing,
    townLeft: town,
    rng: rngState,
  };
}

// ── Writing it down ───────────────────────────────────────

export type DefenseOutcome = {
  world: WorldState;
  events: WorldEvent[];
  gold: number;
  held: boolean;
};

/**
 * Split the town's casualties back onto the three kinds of men holding it.
 *
 * The fort fights as one number, but it is militia the player never recruited,
 * men he stationed here weeks ago and men he put ashore this morning. Only the
 * last two are his, and they have to come back out separately — the garrison
 * stays in the port, the landing party goes back aboard.
 */
export function splitTownLosses(
  state: DefenseState,
  townLeft: number,
  held: boolean,
): { garrisonAfter: number; partySurvivors: number } {
  if (!held) {
    // A town that fell keeps nobody. What is left of the landing party swims
    // for the boats; the men on the walls are dead or in irons.
    return { garrisonAfter: 0, partySurvivors: Math.round(state.landed * ROUTED_PARTY_SURVIVAL) };
  }
  const before = Math.max(1, state.fort.soldiers);
  const survival = clamp(0, 1, townLeft / before);
  return {
    garrisonAfter: Math.round(state.stationed * survival),
    partySurvivors: Math.round(state.landed * survival),
  };
}

/**
 * Apply a fought-out defence to the world.
 *
 * Hands the bookkeeping to `settleRelief` so a battle the player watched and a
 * battle he only read about leave the save in the same shape. What this adds is
 * the part that only exists when he was there: the men going back aboard, and
 * the politics of having stood on somebody's wall.
 */
export function applyDefenseOutcome(
  world: WorldState,
  state: DefenseState,
  initialForce: AttackForce,
  held: boolean,
  townLeft: number,
): DefenseOutcome {
  const { garrisonAfter, partySurvivors } = splitTownLosses(state, townLeft, held);

  const settled = settleRelief(world, state.portKey, state.claimant, expeditionOf(state), {
    held,
    playerFought: true,
    garrisonAfter,
    partyLost: 0,
    force: {
      initial: initialForce,
      // The survivors of the landing party climb back aboard, so they are not
      // casualties — `force.crew` had them deducted the moment they went ashore.
      final: { ...state.force, crew: state.force.crew + partySurvivors },
    },
  });

  let reputation = changeReputation(
    settled.world.player.reputation, state.claimant, DEFENCE_CLAIMANT_REP,
  );
  if (state.allied && held) {
    reputation = changeReputation(reputation, state.holder, ALLY_DEFENCE_REP);
  }

  return {
    world: { ...settled.world, player: { ...settled.world.player, reputation } },
    events: settled.events,
    gold: settled.gold,
    held,
  };
}

/**
 * The player cuts his cables and leaves the town to it.
 *
 * The fort fights on without him — militia and whatever he had stationed here —
 * and the odds are the ones he was looking at when he decided to go, minus
 * everything he was contributing. Withdrawing is not neutral: the ships that
 * sail away were part of the defence.
 */
export function abandonDefense(
  world: WorldState,
  state: DefenseState,
  initialForce: AttackForce,
  rng: RngState,
): { outcome: DefenseOutcome; rng: RngState } {
  const alone: DefenseState = { ...state, fleetEngaged: false };
  const town = townStrength(alone);
  const landing = attackStrength(expeditionOf(alone));
  const pHold = landing <= 0 ? 1 : town / (town + landing);

  const roll = rngNext(rng);
  const held = roll.value < pHold;

  const settled = settleRelief(world, state.portKey, state.claimant, expeditionOf(state), {
    held,
    // He was not in it. No gold from the transports, no line about holding the
    // place in person — the town did that.
    playerFought: false,
    garrisonAfter: held ? Math.round(state.stationed * 0.5) : 0,
    partyLost: 0,
    force: { initial: initialForce, final: state.force },
  });

  return {
    outcome: { world: settled.world, events: settled.events, gold: 0, held },
    rng: roll.state,
  };
}
