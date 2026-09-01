/**
 * DamageSystem — condition tiers for hull and rigging.
 *
 * Before v0.9.9 damage was a single linear number: hull scaled turn rate, sails
 * scaled speed, and a ship fought exactly the same at 99 % as at 26 %. The only
 * threshold in the game was "hull ≤ 0 → sunk". This module turns both bars into
 * named stages the player can read off the HUD and feel under the tiller.
 *
 * Hull (fraction of hullMax):
 *   ≥ 0.75  sound      full speed, no visible damage
 *   ≥ 0.50  leaking    water below decks — slower, pumps manned
 *   ≥ 0.25  crippled   heavy damage — much slower, smoke and fire
 *   >  0     foundering going down: takes water every tick until it sinks
 *   = 0      sunk
 *
 * Rigging (fraction of sailsMax):
 *   ≥ 0.75  full       all canvas draws
 *   ≥ 0.40  torn       holed sails spill wind
 *   ≥ 0.10  tattered   barely drawing
 *   >  0     dismasted  a spar is down — the ship drifts, no canvas answers
 *
 * Every threshold is a fraction so it works for a 30-hull pinnace and a
 * 180-hull galleon alike. The multipliers are deliberately coarse: the point is
 * that crossing a stage is *felt*, not that the curve is smooth.
 */

export type HullCondition = "sound" | "leaking" | "crippled" | "foundering" | "sunk";
export type RigCondition = "full" | "torn" | "tattered" | "dismasted";

export type HullTier = {
  id: HullCondition;
  /** Lowest hull fraction that still counts as this tier. */
  minFrac: number;
  /** Multiplier on speed through the water. */
  speedMul: number;
  /** Multiplier on turn rate. */
  turnMul: number;
  nameKey: string;
};

export type RigTier = {
  id: RigCondition;
  minFrac: number;
  /** Multiplier on the drive the canvas produces. */
  speedMul: number;
  nameKey: string;
};

/** Ordered worst-first is easier to read, but lookup wants best-first. */
export const HULL_TIERS: HullTier[] = [
  { id: "sound",      minFrac: 0.75, speedMul: 1.00, turnMul: 1.00, nameKey: "damage.hull.sound" },
  { id: "leaking",    minFrac: 0.50, speedMul: 0.88, turnMul: 0.85, nameKey: "damage.hull.leaking" },
  { id: "crippled",   minFrac: 0.25, speedMul: 0.70, turnMul: 0.65, nameKey: "damage.hull.crippled" },
  { id: "foundering", minFrac: 0.00, speedMul: 0.45, turnMul: 0.45, nameKey: "damage.hull.foundering" },
];

export const RIG_TIERS: RigTier[] = [
  { id: "full",      minFrac: 0.75, speedMul: 1.00, nameKey: "damage.rig.full" },
  { id: "torn",      minFrac: 0.40, speedMul: 0.75, nameKey: "damage.rig.torn" },
  { id: "tattered",  minFrac: 0.10, speedMul: 0.45, nameKey: "damage.rig.tattered" },
  { id: "dismasted", minFrac: 0.00, speedMul: 0.00, nameKey: "damage.rig.dismasted" },
];

/**
 * Hull lost per tick once a ship is foundering, as a fraction of hullMax.
 * At 20 ticks/s this drowns a ship from 25 % in roughly 25 seconds — long
 * enough to try to break off, short enough that the battle resolves.
 */
export const FOUNDERING_HULL_LOSS_PER_TICK = 0.0005;

/** Below this fraction of hull the ship is taking water it cannot pump out. */
export const FOUNDERING_THRESHOLD = HULL_TIERS[2].minFrac; // 0.25

function fraction(hp: number, max: number): number {
  if (!(max > 0)) return 0;
  return Math.max(0, Math.min(1, hp / max));
}

/** Hull condition tier. A hull at exactly 0 is `sunk`, not `foundering`. */
export function hullCondition(hullHp: number, hullMax: number): HullCondition {
  if (hullHp <= 0) return "sunk";
  const frac = fraction(hullHp, hullMax);
  for (const tier of HULL_TIERS) {
    if (frac >= tier.minFrac) return tier.id;
  }
  return "foundering";
}

/** Rigging condition tier. Sails at exactly 0 are `dismasted`. */
export function rigCondition(sailsHp: number, sailsMax: number): RigCondition {
  const frac = fraction(sailsHp, sailsMax);
  for (const tier of RIG_TIERS) {
    if (frac >= tier.minFrac) return tier.id;
  }
  return "dismasted";
}

export function hullTier(hullHp: number, hullMax: number): HullTier {
  const id = hullCondition(hullHp, hullMax);
  if (id === "sunk") return { ...HULL_TIERS[3], speedMul: 0, turnMul: 0 };
  return HULL_TIERS.find(t => t.id === id) ?? HULL_TIERS[3];
}

export function rigTier(sailsHp: number, sailsMax: number): RigTier {
  const id = rigCondition(sailsHp, sailsMax);
  return RIG_TIERS.find(t => t.id === id) ?? RIG_TIERS[3];
}

/**
 * Combined multiplier on speed through the water.
 *
 * Hull and rig stack: a crippled hull under torn canvas is slower than either
 * alone. A dismasted ship returns 0 — it drifts with the current, whatever the
 * helm orders.
 */
export function damageSpeedMultiplier(
  hullHp: number, hullMax: number,
  sailsHp: number, sailsMax: number,
): number {
  return hullTier(hullHp, hullMax).speedMul * rigTier(sailsHp, sailsMax).speedMul;
}

/**
 * Speed multiplier on the world map.
 *
 * Same tiers as in battle with one exception: a dismasted ship still crawls.
 * In a battle a drifting hulk is fine — the fight ends and something happens to
 * it. On the open map a true zero would strand the player forever, because
 * repairs only exist in port and you need way on the ship to reach one. So the
 * crew jury-rigs a spar and limps: slow enough to hurt, never a dead end.
 */
export const MAP_DISMASTED_CRAWL = 0.15;

export function mapDamageSpeedMultiplier(
  hullHp: number, hullMax: number,
  sailsHp: number, sailsMax: number,
): number {
  const hull = hullTier(hullHp, hullMax).speedMul;
  const rig = rigTier(sailsHp, sailsMax).speedMul;
  return hull * Math.max(MAP_DISMASTED_CRAWL, rig);
}

/** Multiplier on turn rate. Rigging does not steer, so only the hull counts. */
export function damageTurnMultiplier(hullHp: number, hullMax: number): number {
  return hullTier(hullHp, hullMax).turnMul;
}

/** True while a ship is below the foundering threshold but still afloat. */
export function isFoundering(hullHp: number, hullMax: number): boolean {
  return hullCondition(hullHp, hullMax) === "foundering";
}

/** True once a ship answers no canvas at all. */
export function isDismasted(sailsHp: number, sailsMax: number): boolean {
  return rigCondition(sailsHp, sailsMax) === "dismasted";
}

/**
 * Hull left after `dtTicks` of taking water. Ships above the threshold are
 * untouched; a foundering ship loses hull until it reaches 0 and sinks.
 */
export function applyFlooding(hullHp: number, hullMax: number, dtTicks: number): number {
  if (!isFoundering(hullHp, hullMax)) return hullHp;
  const loss = hullMax * FOUNDERING_HULL_LOSS_PER_TICK * Math.max(0, dtTicks);
  return Math.max(0, hullHp - loss);
}

/**
 * How much of the hold survives a sinking, as a fraction kept.
 * A ship that goes down takes most of its cargo with it; a crew that gets the
 * boats away saves a little more.
 */
export function cargoSurvivingSinking(crewFraction: number): number {
  const crew = Math.max(0, Math.min(1, crewFraction));
  return 0.10 + 0.20 * crew;
}

/** Visual severity 0..1 for smoke/fire FX. 0 = pristine, 1 = about to go down. */
export function damageVisualSeverity(hullHp: number, hullMax: number): number {
  return 1 - fraction(hullHp, hullMax);
}
