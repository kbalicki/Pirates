/**
 * What the manual has to say, as a list of key stems (v0.60.0).
 *
 * The prose lives in the locale tables and the layout lives in `HelpScene`;
 * this is the contents page, and it is here rather than in the scene for one
 * reason: a test that wants to check the manual has a Polish paragraph for
 * every English one must not have to import Phaser to find out what the
 * paragraphs are.
 *
 * Add a topic here and `no_hardcoded_text.test.ts` will demand
 * `help.<stem>_h` and `help.<stem>_b` in **both** locales before it goes green
 * — which is the whole point. The screen this file describes spent fourteen
 * releases in one language because nothing connected its contents to the
 * table of strings.
 */

/** The Sailing tab, in the order a captain needs to learn it. */
export const HELP_SAILING_TOPICS = [
  "wind", "deadzone", "closehauled", "beam", "running",
  "levels", "manning", "prizecrew", "rig", "glass",
] as const;

/** The World tab: the map, the towns, and everything that moves between them. */
export const HELP_WORLD_TOPICS = [
  "caribbean", "eras", "ports", "trade", "reputation", "economy", "drill",
  "expeditions", "currents", "lanes", "blockade", "flags", "informant",
  "blackflag", "defense",
] as const;

/** Severity band for a row of the world-event table — just a colour. */
export type HelpSeverity = "red" | "amber" | "yellow";

/**
 * The world-event table in the Economy tab, worst first within each band.
 *
 * `native_raid` is the one a captain can ask for himself since v0.58.0, which
 * is why its line in "what you can do" has a second half.
 */
export const HELP_EVENT_ROWS: Array<[string, HelpSeverity]> = [
  ["gold", "amber"],
  ["native_raid", "amber"],
  ["epidemic", "amber"],
  ["pirate_raid", "yellow"],
  ["hurricane", "red"],
  ["trade_boom", "yellow"],
  ["slave_revolt", "amber"],
  ["famine", "amber"],
  ["harvest", "yellow"],
  ["decree", "yellow"],
  ["governor", "yellow"],
  ["treasure_fleet", "amber"],
  ["war", "red"],
];

export const HELP_SEVERITY_COLOUR: Record<HelpSeverity, string> = {
  red: "#cc4444",
  amber: "#cc8844",
  yellow: "#cccc88",
};
