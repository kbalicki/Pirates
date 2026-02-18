/**
 * Historical eras from Sid Meier's Pirates! (1987).
 * Each era sets the starting year for the game calendar.
 *
 * NOTE: Per-era city configurations (faction ownership changes,
 * city existence per era) are planned for a future update.
 * For now all cities use the default configuration regardless of era.
 */

export type EraDef = {
  id: string;
  startYear: number;
};

export const ERAS: Record<string, EraDef> = {
  silver_empire: { id: "silver_empire", startYear: 1560 },
  merchants_smugglers: { id: "merchants_smugglers", startYear: 1600 },
  new_colonists: { id: "new_colonists", startYear: 1620 },
  war_for_profit: { id: "war_for_profit", startYear: 1640 },
  buccaneer_heroes: { id: "buccaneer_heroes", startYear: 1660 },
  pirates_sunset: { id: "pirates_sunset", startYear: 1680 },
};

export const DEFAULT_ERA = "pirates_sunset";
