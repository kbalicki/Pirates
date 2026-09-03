/**
 * SiegeSystem — taking a town away from the crown that owns it.
 *
 * Until v0.13.0 the "ATAK" reply in `PortApproachScene` started a sea battle
 * against the port id, which resolves to no entity at all: the player fought a
 * ghost with no hull and no guns. Ports had a `defense` number that world
 * events pushed around and nothing ever read. This module is what both of those
 * were waiting for.
 *
 * ## Three steps, and only the middle one is not a decision
 *
 *   1. Bombardment  — you trade broadsides with the shore battery. Interactive:
 *                     every round is a choice to press on or break off.
 *   2. Assault      — the landing is auto-resolved. A tactical land battle is a
 *                     different game and this is not it; what the player controls
 *                     is *when* to land, not where each man walks.
 *   3. Spoils       — a taken town is handed to a sponsor, kept for the
 *                     brethren, or simply sacked and left burning.
 *
 * ## Why bombardment first
 *
 * The assault odds are dominated by `walls` and by how many shore guns still
 * bear on the beach. Landing straight away against an intact fort is a
 * slaughter; the bombardment is the price you pay in hull to change the
 * arithmetic on the sand. That is the tension of the module: your hull has a
 * bottom, and so does their powder.
 *
 * ## The fleet finally matters ashore
 *
 * Guns and landing parties are counted across the whole fleet, not just the
 * flagship — three hulls means three broadsides a round and three crews on the
 * beach. This is the first mechanic that pays for the second and third ship
 * with something other than cargo space.
 *
 * Everything here is pure and seeded from `RngState`, so a test can pin exact
 * casualties and the same save fights the same siege twice.
 */

import type { WorldState, RngState, PortRuntimeState } from "../model/WorldState.ts";
import type { FactionId } from "../model/ids.ts";
import { factionId as makeFactionId } from "../model/ids.ts";
import { CITIES, type CitySize } from "../data/cities.ts";
import { FACTIONS } from "../data/factions.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { getPortBaseline } from "../data/economyBaselines.ts";
import { rngNext } from "../services/RNG.ts";
import { changeReputation } from "./ReputationSystem.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { effectiveSkill } from "./AgingSystem.ts";

// ── Who owns a port right now ─────────────────────────────

/**
 * The faction that holds this port today.
 *
 * `CityDef.factionId` is the 1680 starting map and never changes;
 * `PortRuntimeState.factionId` is who holds it now. Everything that draws a
 * flag, prices a cargo or decides whether the guns open up must read this, or
 * a town the player took last month still flies Spanish colours.
 */
export function portFaction(world: WorldState, portKey: string): FactionId {
  return world.ports[portKey]?.factionId ?? CITIES[portKey]?.factionId ?? makeFactionId("spain");
}

/** True when this port is not held by whoever started with it. */
export function portChangedHands(world: WorldState, portKey: string): boolean {
  const original = CITIES[portKey]?.factionId as string | undefined;
  return original !== undefined && (portFaction(world, portKey) as string) !== original;
}

// ── The garrison ──────────────────────────────────────────

/** Soldiers a town of each size keeps under arms at full defence. */
export const SIZE_SOLDIERS: Record<CitySize, number> = {
  small: 25,
  medium: 55,
  large: 100,
  capital: 160,
};

/** Shore guns each kind of settlement can mount at full defence. */
export const TYPE_GUNS: Record<"city" | "fort" | "outpost", number> = {
  outpost: 4,
  city: 12,
  fort: 26,
};

/** However well defended, an outpost has no curtain wall to hide behind. */
export const TYPE_WALL_CAP: Record<"city" | "fort" | "outpost", number> = {
  outpost: 35,
  city: 70,
  fort: 100,
};

export type FortState = {
  /** Serviceable shore guns. They shoot back, and they are what you knock down. */
  guns: number;
  gunsMax: number;
  /** Wall integrity 0..100. Low walls make the beach cheap. */
  walls: number;
  wallsMax: number;
  /** Soldiers behind the walls. Bombardment barely touches them — walls do. */
  soldiers: number;
  soldiersMax: number;
};

/**
 * What stands between the player and the treasury.
 *
 * Guns and walls come from what kind of place it is and how much `defense` it
 * still has; soldiers come from its size, scaled by how many people are
 * actually left. A town gutted by plague or famine is measurably easier to take
 * than the same town at baseline — the living-world numbers finally decide
 * something the player can feel.
 *
 * Men the player stationed here (v0.15.0) stand with the militia and are
 * counted at face value: they are the only part of a taken town's defence that
 * does not come out of `defense`, which is exactly why they are the lever.
 */
export function garrisonFor(world: WorldState, portKey: string): FortState {
  const def = CITIES[portKey];
  if (!def) return { guns: 0, gunsMax: 0, walls: 0, wallsMax: 1, soldiers: 0, soldiersMax: 1 };

  const port = world.ports[portKey];
  const baseline = getPortBaseline(portKey);
  const defense = Math.max(0, Math.min(100, port?.defense ?? baseline.defense));
  const popFactor = Math.max(0.4, Math.min(1.3, (port?.population ?? baseline.population) / baseline.population));

  const guns = Math.round(TYPE_GUNS[def.type] * (0.3 + (defense / 100) * 0.7));
  const walls = Math.round(Math.min(TYPE_WALL_CAP[def.type], defense));
  const stationed = Math.max(0, Math.round(port?.garrison ?? 0));
  const soldiers = Math.round(SIZE_SOLDIERS[def.population] * (0.35 + (defense / 100) * 0.65) * popFactor)
    + stationed;

  return {
    guns, gunsMax: Math.max(1, guns),
    walls, wallsMax: Math.max(1, walls),
    soldiers, soldiersMax: Math.max(1, soldiers),
  };
}

// ── The attacking force ───────────────────────────────────

export type AttackForce = {
  /** Guns that can be brought to bear each round, flagship plus consorts. */
  cannons: number;
  hullHp: number;
  hullMax: number;
  /** Men aboard, across the whole fleet. */
  crew: number;
  crewMax: number;
  morale: number;
  /** Captain's effective gunnery, after age. */
  gunnery: number;
  /** Captain's effective fencing, after age. */
  fencing: number;
  training: number;
};

/** Crew a consort is assumed to carry: most of its berths, but not all. */
export const FLEET_CREW_FRACTION = 0.8;

export function attackForceFor(world: WorldState): AttackForce {
  const flagship = world.entities[world.player.shipId as string]?.ship;
  let cannons = flagship?.cannons ?? 0;
  let hullHp = flagship?.hullHp ?? 0;
  let hullMax = flagship?.hullMax ?? 1;
  let crew = flagship?.crew.current ?? 0;
  let crewMax = flagship?.crew.max ?? 1;

  for (const consort of world.player.fleet ?? []) {
    const cls = SHIP_CLASSES[consort.classId];
    cannons += consort.cannons;
    hullHp += consort.hullHp;
    hullMax += consort.hullMax;
    crew += Math.round((cls?.crewMax ?? 0) * FLEET_CREW_FRACTION);
    crewMax += cls?.crewMax ?? 0;
  }

  return {
    cannons,
    hullHp,
    hullMax: Math.max(1, hullMax),
    crew,
    crewMax: Math.max(1, crewMax),
    morale: flagship?.crew.morale ?? 0.5,
    gunnery: effectiveSkill(world, "gunnery"),
    fencing: effectiveSkill(world, "fencing"),
    training: world.captain?.training ?? 0.5,
  };
}

// ── Siege state ───────────────────────────────────────────

export type SiegePhase = "bombard" | "assault" | "over";

export type SiegeState = {
  portKey: string;
  fort: FortState;
  force: AttackForce;
  round: number;
  phase: SiegePhase;
};

export function createSiege(world: WorldState, portKey: string): SiegeState {
  return {
    portKey,
    fort: garrisonFor(world, portKey),
    force: attackForceFor(world),
    round: 0,
    phase: "bombard",
  };
}

// ── Bombardment ───────────────────────────────────────────

/** Share of a hit that goes into the masonry rather than the gun crews. */
export const HIT_TO_WALLS = 0.35;
/** Share of a hit that dismounts a gun. */
export const HIT_TO_GUNS = 0.12;
/** Hull damage per shot from the shore that reaches a ship. */
export const FORT_SHOT_HULL = 0.9;
/** Men lost per shot from the shore that reaches a ship. */
export const FORT_SHOT_CREW = 0.2;

/** Hull fraction below which the fleet must break off. */
export const FLEET_BREAK_HULL = 0.2;

/**
 * How well the fleet shoots: skill and drill, never certainty.
 *
 *   gunnery 0, green crew   →  0.35
 *   gunnery 10, drilled     →  0.85
 */
export function bombardAccuracy(gunnery: number, training: number): number {
  return 0.35 + (Math.max(0, Math.min(10, gunnery)) / 10) * 0.35 + Math.max(0, Math.min(1, training)) * 0.15;
}

/**
 * How well the shore battery shoots back.
 *
 * Intact walls are not just cover — they are a stable gun platform and a
 * rangefinder the gunners have used every day of their service. Knock them
 * down and the return fire gets noticeably worse, which is the second reason to
 * spend shot on the masonry rather than only on the embrasures.
 */
export function fortAccuracy(walls: number, wallsMax: number): number {
  const intact = wallsMax > 0 ? Math.max(0, Math.min(1, walls / wallsMax)) : 0;
  return 0.30 + intact * 0.25;
}

export type BombardRound = {
  state: SiegeState;
  rng: RngState;
  /** What the fleet did to the fort this round. */
  gunsSilenced: number;
  wallsBreached: number;
  /** What the fort did back. */
  hullLost: number;
  crewLost: number;
  /** True when the ships can no longer keep station — hull or crew gone. */
  fleetBroken: boolean;
};

/**
 * One exchange of broadsides.
 *
 * Both sides fire at once, so silencing the last gun still costs you that
 * gun's final salvo. There is no way to take a fort for free.
 */
export function bombardRound(state: SiegeState, rng: RngState): BombardRound {
  const fleetRoll = rngNext(rng);
  const fortRoll = rngNext(fleetRoll.state);

  const accuracy = bombardAccuracy(state.force.gunnery, state.force.training);
  // 0.75..1.25 — powder, smoke and a moving deck.
  const fleetHits = state.force.cannons * accuracy * (0.75 + fleetRoll.value * 0.5);

  const wallsBreached = Math.min(state.fort.walls, fleetHits * HIT_TO_WALLS);
  const gunsSilenced = Math.min(state.fort.guns, fleetHits * HIT_TO_GUNS);

  // The fort answers with the guns it had at the start of the round.
  const fortHits = state.fort.guns * fortAccuracy(state.fort.walls, state.fort.wallsMax)
    * (0.7 + fortRoll.value * 0.6);
  const hullLost = Math.min(state.force.hullHp, fortHits * FORT_SHOT_HULL);
  const crewLost = Math.min(state.force.crew, Math.round(fortHits * FORT_SHOT_CREW));

  const fort: FortState = {
    ...state.fort,
    walls: Math.max(0, Math.round((state.fort.walls - wallsBreached) * 10) / 10),
    guns: Math.max(0, Math.round(state.fort.guns - gunsSilenced)),
  };
  const force: AttackForce = {
    ...state.force,
    hullHp: Math.max(0, Math.round((state.force.hullHp - hullLost) * 10) / 10),
    crew: Math.max(0, state.force.crew - crewLost),
  };

  // Below a fifth of the fleet's hull there is nothing left to keep the guns
  // out of the water; below five hands, nobody to work them.
  const fleetBroken = force.hullHp <= force.hullMax * FLEET_BREAK_HULL || force.crew < 5;

  return {
    state: { ...state, fort, force, round: state.round + 1, phase: fleetBroken ? "over" : "bombard" },
    rng: fortRoll.state,
    gunsSilenced: Math.round(gunsSilenced * 10) / 10,
    wallsBreached: Math.round(wallsBreached * 10) / 10,
    hullLost: Math.round(hullLost * 10) / 10,
    crewLost,
    fleetBroken,
  };
}

// ── The landing ───────────────────────────────────────────

/** Fraction of the men that go ashore; the rest keep the ships off the rocks. */
export const LANDING_FRACTION = 0.85;
/** Hands that stay aboard whatever the landing party wants. */
export const SHIP_KEEPERS = 5;

export function landingParty(force: AttackForce): number {
  return Math.max(0, Math.min(force.crew - SHIP_KEEPERS, Math.round(force.crew * LANDING_FRACTION)));
}

/**
 * Strength of the two sides on the beach.
 *
 *   attackers  men × morale × the captain's sword × drill
 *   defenders  soldiers × what is left of the walls × the town's own resolve
 *
 * The `walls` term is the one the bombardment moves, and it is worth up to
 * 0.8× the defenders' whole strength. That is the payoff for every round spent
 * under the guns.
 */
export function assaultStrengths(state: SiegeState, defense: number): { attack: number; defence: number } {
  const men = landingParty(state.force);
  const attack = men
    * (0.6 + Math.max(0, Math.min(1, state.force.morale)) * 0.6)
    * (1 + state.force.fencing / 14)
    * (0.85 + Math.max(0, Math.min(1, state.force.training)) * 0.3);

  // A garrison behind an intact curtain is worth two and a half times the same
  // garrison standing in a breach. This is the whole reason to spend hull on
  // the walls before spending men on the beach.
  const wallFactor = 0.5 + (state.fort.wallsMax > 0 ? state.fort.walls / state.fort.wallsMax : 0) * 0.8;
  // Surviving shore guns are swung inland and sweep the beach.
  const gunFactor = 1 + state.fort.guns * 0.02;
  const defence = state.fort.soldiers * wallFactor * gunFactor * (1 + Math.max(0, defense) / 250);

  return { attack: Math.round(attack), defence: Math.round(defence) };
}

/** Odds the landing carries the town, before a shot is fired. */
export function assaultOdds(state: SiegeState, defense: number): number {
  const { attack, defence } = assaultStrengths(state, defense);
  if (attack + defence <= 0) return 0;
  return attack / (attack + defence);
}

export type AssaultWave = {
  attackerLosses: number;
  defenderLosses: number;
  attackersLeft: number;
  defendersLeft: number;
};

export type AssaultResult = {
  captured: boolean;
  waves: AssaultWave[];
  /** Men who never came back aboard. */
  attackerLosses: number;
  defenderLosses: number;
  /** Survivors of the landing party. */
  attackersLeft: number;
  rng: RngState;
};

/** Defenders break once this much of the garrison is down. */
export const DEFENDER_ROUT = 0.35;
/** The landing party re-embarks once this much of it is down. */
export const ATTACKER_ROUT = 0.45;
/** Waves before the assault is called off whatever the state of it. */
export const MAX_WAVES = 6;
/**
 * Share of its own strength a side burns through in one wave, at even odds.
 *
 * Each side's losses are a fraction of *itself*, not of a shared pool. Sharing
 * a pool looked reasonable and was wrong: it made the smaller force hit its
 * rout threshold first even when it was the stronger one, so being outnumbered
 * counted twice — once in `assaultStrengths` and again in the attrition.
 */
export const WAVE_INTENSITY = 0.18;

/**
 * Auto-resolve the landing.
 *
 * Waves of mutual attrition rather than one dice roll, for two reasons: the
 * scene has something to narrate a line at a time, and a marginal assault
 * produces a marginal result — you can take a town and lose two thirds of your
 * crew doing it, which is a different outcome from taking it cleanly.
 */
export function resolveAssault(state: SiegeState, defense: number, rng: RngState): AssaultResult {
  const { attack, defence } = assaultStrengths(state, defense);
  let attackers = landingParty(state.force);
  let defenders = state.fort.soldiers;
  const attackersStart = attackers;
  const defendersStart = defenders;

  const waves: AssaultWave[] = [];
  let rngState = rng;
  let captured = false;

  const total = attack + defence;
  const attackShare = total > 0 ? attack / total : 0;

  for (let i = 0; i < MAX_WAVES && attackers > 0 && defenders > 0; i++) {
    const roll = rngNext(rngState);
    rngState = roll.state;
    // ±25% swing on the balance of a wave: a bad wave can cost a good assault,
    // but it cannot reverse one.
    const swing = Math.max(0, Math.min(1, attackShare * (0.75 + roll.value * 0.5)));

    // Each side loses a share of its own numbers, weighted by who is winning
    // the wave. The ×2 keeps an even fight at `WAVE_INTENSITY` a side.
    const defenderLosses = Math.min(defenders, Math.max(1, Math.round(defenders * WAVE_INTENSITY * swing * 2)));
    const attackerLosses = Math.min(attackers, Math.max(1, Math.round(attackers * WAVE_INTENSITY * (1 - swing) * 2)));

    attackers -= attackerLosses;
    defenders -= defenderLosses;
    waves.push({ attackerLosses, defenderLosses, attackersLeft: attackers, defendersLeft: defenders });

    if (defenders <= defendersStart * DEFENDER_ROUT) { captured = true; break; }
    if (attackers <= attackersStart * ATTACKER_ROUT) { captured = false; break; }
  }

  // Running out of waves with the defenders still standing is a repulse: the
  // landing party goes back to the boats before the tide turns.
  if (defenders <= 0) captured = true;

  return {
    captured,
    waves,
    attackerLosses: attackersStart - attackers,
    defenderLosses: defendersStart - defenders,
    attackersLeft: attackers,
    rng: rngState,
  };
}

// ── Writing the damage back into the fleet ────────────────

/**
 * Push what the siege cost back onto the ships that paid it.
 *
 * The siege works on a pooled `AttackForce`, because a broadside is a broadside
 * whichever deck it comes off. Getting out of the siege means splitting the
 * bill again: hull damage in proportion to how much hull each ship brought,
 * crew losses in proportion to how many men each ship brought.
 *
 * `FleetShip` has no crew field — a consort's complement is notional, derived
 * from its class — so a consort's share of the casualties is felt in the next
 * siege (it recomputes from the class) and nowhere else. Only the flagship's
 * losses persist, which is the same simplification `FleetSystem` already makes
 * everywhere else.
 */
export function writeBackForce(
  world: WorldState,
  initial: AttackForce,
  final: AttackForce,
  extraCrewLost = 0,
): WorldState {
  const hullLost = Math.max(0, initial.hullHp - final.hullHp);
  const crewLost = Math.max(0, initial.crew - final.crew) + Math.max(0, extraCrewLost);

  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  if (!entity?.ship) return world;

  const flagHullShare = initial.hullMax > 0 ? entity.ship.hullMax / initial.hullMax : 1;
  const flagCrewShare = initial.crew > 0 ? entity.ship.crew.current / initial.crew : 1;

  const hullHp = Math.max(0, Math.round((entity.ship.hullHp - hullLost * flagHullShare) * 10) / 10);
  const crew = Math.max(0, Math.round(entity.ship.crew.current - crewLost * flagCrewShare));

  const fleet = (world.player.fleet ?? []).map(consort => {
    const share = initial.hullMax > 0 ? consort.hullMax / initial.hullMax : 0;
    return { ...consort, hullHp: Math.max(0, Math.round((consort.hullHp - hullLost * share) * 10) / 10) };
  });

  return {
    ...world,
    player: { ...world.player, fleet },
    entities: {
      ...world.entities,
      [shipId]: {
        ...entity,
        ship: { ...entity.ship, hullHp, crew: { ...entity.ship.crew, current: crew } },
      },
    },
  };
}

// ── Spoils ────────────────────────────────────────────────

export type SpoilsChoice =
  /** Sack it and sail. The old flag stays up over the ashes. */
  | "plunder"
  /** Hand it to a crown that commissioned you. Rank and standing follow. */
  | "sponsor"
  /** Keep it for the brotherhood. */
  | "brethren";

/** What the treasury and the warehouses are worth if the town is stripped. */
export function lootValue(port: PortRuntimeState | undefined, portKey: string): number {
  const baseline = getPortBaseline(portKey);
  const wealth = port?.wealth ?? baseline.wealth;
  const population = port?.population ?? baseline.population;
  return Math.round(wealth * 3 + population * 0.05);
}

/** Share of the loot each ending actually gets into the hold. */
export const SPOILS_SHARE: Record<SpoilsChoice, number> = {
  plunder: 1.0,
  sponsor: 0.5,
  brethren: 0.7,
};

export type CaptureResult = {
  world: WorldState;
  gold: number;
  /** Who flies the flag afterwards. */
  newOwner: FactionId;
};

/**
 * Apply the fall of a town.
 *
 * Every ending burns the same amount of town — the difference is who holds the
 * ruin afterwards and who is angry about it. Sacking pays best and leaves the
 * defenders' crown merely furious; handing the place to a sponsor pays half and
 * buys rank; keeping it for the brethren pays well and makes an enemy of
 * everyone with a governor.
 */
export function capturePort(
  world: WorldState,
  portKey: string,
  choice: SpoilsChoice,
  sponsor?: string,
): CaptureResult {
  const port = world.ports[portKey];
  const oldOwner = portFaction(world, portKey) as string;
  const gold = Math.round(lootValue(port, portKey) * SPOILS_SHARE[choice]);

  const newOwnerKey =
    choice === "sponsor" && sponsor ? sponsor
    : choice === "brethren" ? "pirates"
    : oldOwner;

  // A sacked town keeps almost no garrison, loses most of its money and some
  // of its people. `EconomyTickSystem` will pull it back toward baseline over
  // months, which is the intended shape: taking a town matters, and it does not
  // matter forever.
  const changedHands = newOwnerKey !== oldOwner;
  const sacked: PortRuntimeState | undefined = port ? {
    ...port,
    factionId: makeFactionId(newOwnerKey),
    // The dispossessed crown starts counting today. Sacking a town without
    // taking it leaves the flag alone, so it starts no clock either.
    ...(changedHands
      ? { capturedDay: world.time.day, garrison: 0, nextReliefDay: undefined }
      : {}),
    defense: Math.max(0, Math.round(port.defense * 0.15)),
    wealth: Math.max(0, Math.round(port.wealth * (choice === "sponsor" ? 0.6 : 0.35))),
    population: Math.max(0, Math.round(port.population * 0.85)),
  } : undefined;

  let reputation = world.player.reputation;
  reputation = changeReputation(reputation, oldOwner, choice === "sponsor" ? -35 : -30);
  if (choice === "brethren") reputation = changeReputation(reputation, "pirates", 20);
  if (choice === "plunder") reputation = changeReputation(reputation, "pirates", 10);
  if (choice === "sponsor" && sponsor) {
    reputation = changeReputation(reputation, sponsor, 25);
    // Every other crown notices that a captain now takes cities for a rival.
    for (const other of ["spain", "england", "france", "netherlands"]) {
      if (other !== sponsor && other !== oldOwner) reputation = changeReputation(reputation, other, -5);
    }
  }

  const ranks = { ...world.player.ranks };
  if (choice === "sponsor" && sponsor) {
    ranks[sponsor] = Math.min(5, (ranks[sponsor] ?? 0) + 1);
  }

  const notoriety = world.player.notoriety
    + (choice === "brethren" ? 12 : choice === "plunder" ? 8 : 5);

  let next: WorldState = {
    ...world,
    ports: sacked ? { ...world.ports, [portKey]: sacked } : world.ports,
    player: {
      ...world.player,
      gold: world.player.gold + gold,
      reputation,
      ranks,
      notoriety,
      citiesCaptured: (world.player.citiesCaptured ?? 0) + 1,
    },
  };

  // Log lines interpolate their vars verbatim, so hand them the display names
  // rather than the internal keys — "Cartagena", not "cartagena".
  next = addLogEntry(next, "siege.log_captured", {
    port: CITIES[portKey]?.name ?? portKey,
    gold,
    owner: FACTIONS[newOwnerKey]?.name ?? newOwnerKey,
  });

  return { world: next, gold, newOwner: makeFactionId(newOwnerKey) };
}

/**
 * A landing that failed. The town keeps its flag; the crown keeps the grudge.
 *
 * Crew and hull losses are written into the ship by the caller — what this adds
 * is the political cost, which lands whether you won or lost: the crown whose
 * town you tried to burn heard about it either way.
 */
export function repulsedAtPort(world: WorldState, portKey: string): WorldState {
  const owner = portFaction(world, portKey) as string;
  const next: WorldState = {
    ...world,
    player: {
      ...world.player,
      reputation: changeReputation(world.player.reputation, owner, -15),
    },
  };
  return addLogEntry(next, "siege.log_repulsed", { port: CITIES[portKey]?.name ?? portKey });
}

/** Crowns the player holds a letter of marque from, and could hand a town to. */
export function availableSponsors(world: WorldState, portKey: string): string[] {
  const owner = portFaction(world, portKey) as string;
  return ["spain", "england", "france", "netherlands"].filter(
    f => f !== owner && world.worldFlags[`letter_of_marque_${f}`] === true,
  );
}
