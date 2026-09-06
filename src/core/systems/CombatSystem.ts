/**
 * Combat constants and formulas shared by CombatEngine and SeaBattleScene.
 * Reload cadence, cannon range and per-cannon damage all live here so the
 * numbers can be tuned in one place.
 */

export const CANNON_COOLDOWN_TICKS = 180; // 9 seconds at 20 ticks/sec — best-case broadside cadence

/**
 * Effective reload time in ticks.
 *
 * Three factors slow down the base 9-second cadence:
 *   • crew shortage   — fewer hands on the guns
 *   • low morale      — frightened gunners are slow
 *   • low training    — green crews fumble powder & ramming
 *
 * Each factor contributes a 0.7..1.0 multiplier; total is at worst 0.7³≈0.343,
 * so the slowest a battered, terrified, untrained crew can reload is ~26 s.
 * A pristine, brave, veteran crew clears in the full 9 s.
 *
 * Formula:
 *   crewFrac    = clamp((crew/max - 0.2) / 0.8, 0, 1)   // ramp 20%..100%
 *   crewMul     = 0.70 + 0.30 × crewFrac
 *   moraleMul   = 0.80 + 0.20 × morale
 *   trainingMul = 0.75 + 0.25 × training
 *   ticks       = CANNON_COOLDOWN_TICKS / (crewMul × moraleMul × trainingMul)
 */
export function effectiveReloadTicks(
  crewCurrent: number,
  crewMax: number,
  morale: number,
  training: number,
): number {
  const crewFrac = Math.max(0, Math.min(1, (crewCurrent / Math.max(1, crewMax) - 0.2) / 0.8));
  const crewMul = 0.70 + 0.30 * crewFrac;
  const moraleMul = 0.80 + 0.20 * Math.max(0, Math.min(1, morale));
  const trainingMul = 0.75 + 0.25 * Math.max(0, Math.min(1, training));
  const totalMul = crewMul * moraleMul * trainingMul;
  return Math.round(CANNON_COOLDOWN_TICKS / Math.max(0.2, totalMul));
}
/** Fallback range when state.cannonRange is missing; real value computed per-battle as arena.width/2. */
export const CANNON_RANGE = 480;

/**
 * Per-cannon damage constants — scaled up by the number of cannons firing in the broadside
 * (shipCannons / 2), the ammo multipliers, distance-falloff and the target's armor.
 *
 * Final formula:
 *   shotsInBroadside = floor(shooter.cannons / 2)
 *   distFactor       = (1 − dRatio)^1.5        // quadratic falloff
 *   if dRatio < 0.15  distFactor *= 1.6        // point-blank bonus
 *   accuracy         = max(0.15, 1 − 0.7·dRatio)  // miss chance
 *
 *   hullDelta   = -CANNON_DAMAGE_HULL  · shots · ammo.hullMul  · distFactor · (1 − target.armor)
 *   sailsDelta  = -CANNON_DAMAGE_SAILS · shots · ammo.sailsMul · distFactor · (1 − target.armor)
 *   crewDelta   = -round(CANNON_DAMAGE_CREW · shots · ammo.crewMul · distFactor · (1 − target.armor·0.3))
 *
 * Examples (point-blank, hit):
 *   Galleon (18 guns) × round shot → Sloop (60 hull, armor 0.10):  18·0.7·1.0·1.6·0.90 ≈ 18.1 hull
 *   Sloop  (4 guns)   × round shot → Galleon (180 hull, armor 0.50): 4·0.7·1.0·1.6·0.50 ≈ 2.24 hull
 *   1 gun × round @ far (distFactor 0.05) vs Galleon armor 0.50:    1·0.7·1.0·0.05·0.50 ≈ 0.018 hull (≈ 0)
 */
// All three base damages bumped × 5 vs prior tuning to shorten battles (user request).
export const CANNON_DAMAGE_HULL = 3.5;
export const CANNON_DAMAGE_SAILS = 3.0;
export const CANNON_DAMAGE_CREW = 4.5;

// ── The gun captain ───────────────────────────────────────

/**
 * The gunnery a ship fights at when nobody has said otherwise.
 *
 * Every NPC hull, and every save made before v0.47.0, fires at exactly the
 * accuracy the game has always used — the multiplier below is 1.0 here. Only a
 * captain who put points into his guns, or spent them elsewhere, shoots
 * differently.
 */
export const NEUTRAL_GUNNERY = 5;

/**
 * Chance a broadside finds its mark, given range and the captain's gunnery.
 *
 * The distance term is the one the engine has used since v0.9.0 and is
 * unchanged: dead certain alongside, falling away to a fifth at extreme range.
 * What is new is who is laying the guns. `gunnery` was read by exactly one
 * thing in the whole game — `bombardAccuracy` in `SiegeSystem`, which is to
 * say a captain's gunnery decided how he shelled a fort and had **nothing** to
 * do with how he fought a ship.
 *
 * The multiplier runs 0.85 at gunnery 0 to 1.15 at gunnery 10, so a gunner
 * lands about 35 % more of his broadsides than a duffer and a battle between
 * them is roughly a quarter shorter. Round shot at half range: 0.552 hit
 * chance for gunnery 0, 0.650 for 5, 0.747 for 10.
 */
export function gunneryAccuracy(dRatio: number, gunnery: number = NEUTRAL_GUNNERY): number {
  const base = Math.max(0.15, 1 - 0.7 * dRatio);
  const g = Math.max(0, Math.min(10, gunnery));
  return Math.max(0, Math.min(1, base * (0.85 + 0.03 * g)));
}
