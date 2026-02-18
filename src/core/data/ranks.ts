import type { FactionId } from "../model/ids.ts";
import { factionId } from "../model/ids.ts";

export type RankDef = {
  index: number;
  nameKey: string; // i18n key
};

export type FactionRanks = {
  factionId: FactionId;
  ranks: RankDef[];
};

/**
 * Ranks per faction, from lowest (index 0 = no rank) to highest.
 * Based on Sid Meier's Pirates! rank system.
 */
export const FACTION_RANKS: Record<string, FactionRanks> = {
  spain: {
    factionId: factionId("spain"),
    ranks: [
      { index: 0, nameKey: "rank.spain.0" },
      { index: 1, nameKey: "rank.spain.1" },
      { index: 2, nameKey: "rank.spain.2" },
      { index: 3, nameKey: "rank.spain.3" },
      { index: 4, nameKey: "rank.spain.4" },
      { index: 5, nameKey: "rank.spain.5" },
    ],
  },
  england: {
    factionId: factionId("england"),
    ranks: [
      { index: 0, nameKey: "rank.england.0" },
      { index: 1, nameKey: "rank.england.1" },
      { index: 2, nameKey: "rank.england.2" },
      { index: 3, nameKey: "rank.england.3" },
      { index: 4, nameKey: "rank.england.4" },
      { index: 5, nameKey: "rank.england.5" },
    ],
  },
  france: {
    factionId: factionId("france"),
    ranks: [
      { index: 0, nameKey: "rank.france.0" },
      { index: 1, nameKey: "rank.france.1" },
      { index: 2, nameKey: "rank.france.2" },
      { index: 3, nameKey: "rank.france.3" },
      { index: 4, nameKey: "rank.france.4" },
      { index: 5, nameKey: "rank.france.5" },
    ],
  },
  netherlands: {
    factionId: factionId("netherlands"),
    ranks: [
      { index: 0, nameKey: "rank.netherlands.0" },
      { index: 1, nameKey: "rank.netherlands.1" },
      { index: 2, nameKey: "rank.netherlands.2" },
      { index: 3, nameKey: "rank.netherlands.3" },
      { index: 4, nameKey: "rank.netherlands.4" },
      { index: 5, nameKey: "rank.netherlands.5" },
    ],
  },
  pirates: {
    factionId: factionId("pirates"),
    ranks: [
      { index: 0, nameKey: "rank.pirates.0" },
      { index: 1, nameKey: "rank.pirates.1" },
      { index: 2, nameKey: "rank.pirates.2" },
      { index: 3, nameKey: "rank.pirates.3" },
      { index: 4, nameKey: "rank.pirates.4" },
      { index: 5, nameKey: "rank.pirates.5" },
    ],
  },
};

/**
 * Get the i18n key for a player's rank with a faction.
 */
export function getRankNameKey(factionKey: string, rankIndex: number): string {
  const factionRanks = FACTION_RANKS[factionKey];
  if (!factionRanks) return "rank.unknown";
  const rank = factionRanks.ranks[rankIndex];
  return rank?.nameKey ?? factionRanks.ranks[0].nameKey;
}
