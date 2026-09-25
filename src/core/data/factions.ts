import { factionId } from "../model/ids.ts";
import type { FactionId } from "../model/ids.ts";

export type FactionDef = {
  id: FactionId;
  color: number; // hex color for UI
  defaultReputation: number; // starting rep for new game
  relations: Record<string, number>; // factionId -> relation (-100..100)
};

/**
 * What a new captain's own crown thinks of him on the first day (v0.99.0).
 *
 * It was 20, which is exactly where "friendly" begins (`getReputationLevel`),
 * so the first -1 of his career - measured, 12 of 84 starts: one trader of an
 * ALLY of his crown taken - dropped him to neutral, shut the governor's door
 * (`REPUTATION_TO_BE_RECEIVED` 20) and took the letter of marque off the
 * table. The user moved it off the line (2026-09-25): 25 is friendly with a
 * margin a first mistake does not spend.
 */
export const OWN_CROWN_START_BONUS = 25;

export const FACTION_SPAIN = factionId("spain");
export const FACTION_ENGLAND = factionId("england");
export const FACTION_FRANCE = factionId("france");
export const FACTION_NETHERLANDS = factionId("netherlands");
export const FACTION_PIRATES = factionId("pirates");

export const FACTIONS: Record<string, FactionDef> = {
  spain: {
    id: FACTION_SPAIN,
    color: 0xcc0000,
    defaultReputation: 0,
    relations: {
      england: -30,
      france: -20,
      netherlands: -10,
      pirates: -80,
    },
  },
  england: {
    id: FACTION_ENGLAND,
    color: 0x0044cc,
    defaultReputation: 0,
    relations: {
      spain: -30,
      france: -10,
      netherlands: 10,
      pirates: -60,
    },
  },
  france: {
    id: FACTION_FRANCE,
    color: 0x2244aa,
    defaultReputation: 0,
    relations: {
      spain: -20,
      england: -10,
      netherlands: 0,
      pirates: -50,
    },
  },
  netherlands: {
    id: FACTION_NETHERLANDS,
    color: 0xff8800,
    defaultReputation: 0,
    relations: {
      spain: -10,
      england: 10,
      france: 0,
      pirates: -40,
    },
  },
  pirates: {
    id: FACTION_PIRATES,
    color: 0x333333,
    // -25, not -20 (v0.99.0): -20 sat on the "unfriendly" line exactly. The
    // first merchant taken (+6) still brings the haven round to neutral (-19).
    defaultReputation: -25,
    relations: {
      spain: -80,
      england: -60,
      france: -50,
      netherlands: -40,
    },
  },
};
