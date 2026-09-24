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
 * The three floors are **not** the same number, which is why the old note here
 * saying 0.7³≈0.343 and "~26 s" was wrong twice over: crew bottoms out at 0.70,
 * morale at 0.80 and training at 0.75, so the worst product is 0.42 and the
 * slowest a battered, terrified, untrained crew can reload is **~21 s**.
 * A pristine, brave, veteran crew clears in the full 9 s. (Audited v0.65.0;
 * `battle.help_reload_body` said ~24 s and has been corrected to match.)
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
/**
 * How far a broadside carries, in arena pixels (v0.87.0).
 *
 * Three numbers described this one distance and no two of them agreed. The
 * constant said **480**, under a comment sending the reader to a per-battle
 * value it described as the arena's own half; `CombatState.cannonRange`'s doc
 * line said the same thing in the same words; and `14-MECHANICS.md` printed
 * both.
 * The arena is three screens across — 3840 px from a 1280 px screen — so half
 * of it is **1920**. What `SeaBattleScene` actually wrote was `screenW * 0.25`:
 * **320**, a *twelfth* of the arena. The comment was out by six times, the
 * fallback by half again, and the fallback could never fire anyway, because
 * `cannonRange` is a required field.
 *
 * So the arena owns the number and the scene asks for it. A gun carries a
 * quarter of a screen, and the arena is three screens wide.
 */
export const CANNON_RANGE_ARENA_DIVISOR = 12;

/**
 * What a broadside carries in an arena this wide — 320 px in the 3840 px arena
 * the game builds from a 1280 px screen.
 *
 * There is no fallback constant any more. `CombatState.cannonRange` is a
 * required field, so the `?? CANNON_RANGE` beside all three of its readers
 * could never fire; what the dead 480 did instead was get printed in the
 * manual as the reach of a gun.
 */
export function cannonRangeFor(arenaWidth: number): number {
  return arenaWidth / CANNON_RANGE_ARENA_DIVISOR;
}

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
 * Examples (point-blank, hit). These used 0.7 as the base until v0.65.0 — the
 * figure from before the ×5 bump noted below — so every one of them was a fifth
 * of the real number while the line under them said the bump had happened:
 *   Galleon (18 guns) × round shot → Sloop (60 hull, armor 0.12):  18·3.5·1.0·1.6·0.88 ≈ 88.7 hull (one broadside sinks her)
 *   Sloop  (4 guns)   × round shot → Galleon (180 hull, armor 0.60): 4·3.5·1.0·1.6·0.40 ≈ 8.96 hull
 *   1 gun × round @ far (distFactor 0.05) vs Galleon armor 0.60:    1·3.5·1.0·0.05·0.40 ≈ 0.07 hull (≈ 0)
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

/**
 * A drawn hull, in arena pixels: a 256 px sprite at scale 0.3.
 *
 * Two things are measured against it and they used to disagree. The helm the
 * engine steers will not close inside it, because two ships nearer than that
 * are drawn one through the other. And a grapnel is thrown from **alongside**,
 * which is this distance and not the 30 px `BOARDING_RANGE` held before
 * v0.86.0 — a number no ship in the game could ever reach, not even the AI
 * whose own comment said it was closing "to grapple" at 40.
 */
export const HULL_WIDTH = 77;

/**
 * Cosine of the bow/stern dead zone: a target within ±60° of the ship's own
 * heading (or of her stern) lies where no broadside gun can be trained.
 */
export const BROADSIDE_ARC_COS = 0.5;

/**
 * The same rule seen from the beam: how far either side of square a broadside
 * can be trained, in radians. A target at `φ` off the beam is `90° − φ` off
 * the bow, so it bears while `sin φ <= BROADSIDE_ARC_COS` — **±30°** today.
 *
 * The arena drew its dashed firing arcs at ±60° off the beam until v0.98.3.0,
 * a hand-typed `Math.PI / 3` that read the dead zone's half-width as the
 * arc's: half of every drawn arc was water where `Q`/`E` did nothing at all.
 * Anything that draws or describes the arc reads this number.
 */
export const BROADSIDE_HALF_ARC = Math.asin(BROADSIDE_ARC_COS);

/**
 * Which battery bears on a target, or `null` when it lies in the dead zone.
 *
 * Before v0.85.0 this rule was written twice. The captain's guns obeyed it in
 * `CombatEngine.applyFire` — arc and side both, a broadside silently refused
 * from the bow. The enemy's guns obeyed a **copy** in `runEnemyAI` that had
 * neither: she fired from any angle, and always from her left battery, because
 * her helm was hard-wired to keep the player there. One rule, one reader now.
 */
export function bearingSide(
  heading: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
): "left" | "right" | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d === 0) return null;
  const fwdDot = (dx * Math.sin(heading) + dy * -Math.cos(heading)) / d;
  if (Math.abs(fwdDot) > BROADSIDE_ARC_COS) return null;
  const rightDot = (dx * Math.cos(heading) + dy * Math.sin(heading)) / d;
  return rightDot >= 0 ? "right" : "left";
}
