/**
 * Cannon ammunition types — Sid Meier's Pirates! inspired.
 *
 *   round shot  → hull damage (sink the enemy)
 *   chain shot  → sail damage (slow the enemy down)
 *   grape shot  → crew damage (soften for boarding); shorter range
 *
 * Damage multipliers are applied to the base CANNON_DAMAGE_* constants.
 */

export type AmmoType = "round" | "chain" | "grape";

export interface AmmoDef {
  type: AmmoType;
  nameKey: string;          // i18n key
  hullMul: number;          // multiplier for hull damage
  sailsMul: number;         // multiplier for sails damage
  crewMul: number;          // crew kills per hit (absolute)
  rangeMul: number;         // effective range multiplier (1 = full CANNON_RANGE)
}

export const AMMO_DEFS: Record<AmmoType, AmmoDef> = {
  round: {
    type: "round",
    nameKey: "ammo.round",
    hullMul: 1.0,
    sailsMul: 0.55,   // round balls also punch through rigging when they pass
    crewMul: 0.40,    // splinter casualties — significant at close range
    rangeMul: 1.0,
  },
  chain: {
    type: "chain",
    nameKey: "ammo.chain",
    hullMul: 0.15,
    sailsMul: 4.5,    // chain shot rips rigging — +50% over previous tuning
    crewMul: 0.10,    // whipping ropes hurt some crew
    rangeMul: 0.9,
  },
  grape: {
    type: "grape",
    nameKey: "ammo.grape",
    hullMul: 0.10,
    sailsMul: 0.0,
    crewMul: 1.30,    // anti-personnel main job — clears decks, +50% over previous
    rangeMul: 0.5,    // short range
  },
};

export const AMMO_ORDER: AmmoType[] = ["round", "chain", "grape"];
