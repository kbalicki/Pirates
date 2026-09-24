/**
 * The wars this Caribbean was born into.
 *
 * Ten real wars, with the months they broke out and the months they ended.
 * They used to live inside `WorldEventSystem`, and moved here in v0.51.0 when
 * `DiplomacySystem` needed to read them too and a system importing a system
 * that imported it back was the wrong shape for a table of dates. It is data,
 * and it belongs beside the crowns that fought them.
 *
 * **These are outbreaks, not eighty-year descriptions.** See
 * `project_wars_and_warbite`: a war's row says when it started and when it
 * ended, and everything in between is the world's business, not the table's.
 *
 * Read the gaps as carefully as the entries. Between the Franco-Dutch war
 * (ends September 1678) and the Nine Years' War (begins May 1689) there is
 * nothing at all, and the default era starts in 1680 — which is why
 * `DiplomacySystem` exists.
 */

export type HistoricalWar = {
  id: string;
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
  factions: [string, string];
  headline: string;
  // There was an `endHeadline` here, set to "news.war_end" on every row and
  // read by nothing: the peace is written by `checkHistoricalWars` with the
  // key in hand (removed v0.97.1).
};

export const HISTORICAL_WARS: HistoricalWar[] = [
  {
    id: "eighty_years_war",
    startYear: 1568, startMonth: 5,
    endYear: 1648, endMonth: 1,
    factions: ["spain", "netherlands"],
    headline: "news.war_start",
  },
  {
    id: "anglo_spanish_war_1",
    startYear: 1585, startMonth: 8,
    endYear: 1604, endMonth: 8,
    factions: ["spain", "england"],
    headline: "news.war_start",
  },
  {
    id: "anglo_spanish_war_2",
    startYear: 1625, startMonth: 3,
    endYear: 1630, endMonth: 11,
    factions: ["spain", "england"],
    headline: "news.war_start",
  },
  {
    id: "anglo_french_war",
    startYear: 1627, startMonth: 6,
    endYear: 1629, endMonth: 4,
    factions: ["england", "france"],
    headline: "news.war_start",
  },
  {
    id: "franco_spanish_war",
    startYear: 1635, startMonth: 5,
    endYear: 1659, endMonth: 11,
    factions: ["france", "spain"],
    headline: "news.war_start",
  },
  {
    id: "first_anglo_dutch_war",
    startYear: 1652, startMonth: 7,
    endYear: 1654, endMonth: 4,
    factions: ["england", "netherlands"],
    headline: "news.war_start",
  },
  {
    id: "second_anglo_dutch_war",
    startYear: 1665, startMonth: 3,
    endYear: 1667, endMonth: 7,
    factions: ["england", "netherlands"],
    headline: "news.war_start",
  },
  {
    id: "war_of_devolution",
    startYear: 1667, startMonth: 5,
    endYear: 1668, endMonth: 5,
    factions: ["france", "spain"],
    headline: "news.war_start",
  },
  {
    id: "franco_dutch_war",
    startYear: 1672, startMonth: 4,
    endYear: 1678, endMonth: 9,
    factions: ["france", "netherlands"],
    headline: "news.war_start",
  },
  {
    id: "nine_years_war",
    startYear: 1689, startMonth: 5,
    endYear: 1697, endMonth: 9,
    factions: ["france", "england"],
    headline: "news.war_start",
  },
];
