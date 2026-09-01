/**
 * Dialogue trees.
 *
 * Trees are built per context rather than declared as one frozen constant,
 * because what the other person says depends on who is standing in front of
 * them: the governor's greeting is a different line for a hostile captain than
 * for an ally, and his answers quote the faction by name. Everything that
 * varies is passed in; everything structural — which replies exist, what gates
 * them, what they do — lives here.
 *
 * The governor is the first consumer of `DialogueSystem`. Treasure-map givers
 * and the story threads in later modules will add their own builders next to
 * this one.
 */

import type { DialogueTree } from "../systems/DialogueSystem.ts";
import type { ReputationLevel } from "../systems/DialogueSystem.ts";

export type GovernorTreeContext = {
  /** Faction key of the port, e.g. "england". */
  factionKey: string;
  /** Current standing, decides the greeting line. */
  level: ReputationLevel;
  playerName: string;
  /** Already-localised faction name, for lines that quote it. */
  factionName: string;
  /** Already-localised standing name. */
  levelName: string;
  reputation: number;
  rankName: string;
  /** i18n key of the rumour the governor is willing to share today. */
  rumorKey: string;
  /** Captain's age — retirement is only offered once there is a career behind it. */
  age: number;
  /** What the career would score if he stopped today. */
  scorePreview: number;
};

/** Effect id the caller must handle: hands over the letter of marque. */
export const EFFECT_GRANT_LETTER = "grant_letter_of_marque";
/** Effect id the caller must handle: the captain hangs up his sword for good. */
export const EFFECT_RETIRE = "retire_captain";

export function governorTree(ctx: GovernorTreeContext): DialogueTree {
  const letterFlag = `letter_of_marque_${ctx.factionKey}`;

  return {
    id: `governor_${ctx.factionKey}`,
    start: "greeting",
    nodes: {
      greeting: {
        id: "greeting",
        textKey: `governor.dialogue_${ctx.level}`,
        vars: { name: ctx.playerName },
        options: [
          {
            id: "ask_letter",
            textKey: "governor.opt_ask_letter",
            when: {
              type: "all",
              of: [
                { type: "reputation", faction: ctx.factionKey, atLeast: "friendly" },
                { type: "flag", key: letterFlag, value: false },
              ],
            },
            next: "letter_offer",
          },
          {
            id: "ask_letter_denied",
            textKey: "governor.opt_ask_letter",
            when: {
              type: "all",
              of: [
                { type: "not", of: { type: "reputation", faction: ctx.factionKey, atLeast: "friendly" } },
                { type: "flag", key: letterFlag, value: false },
              ],
            },
            next: "letter_denied",
          },
          {
            id: "ask_letter_held",
            textKey: "governor.opt_ask_letter",
            when: { type: "flag", key: letterFlag, value: true },
            next: "letter_already",
          },
          { id: "ask_rumor", textKey: "governor.opt_ask_news", next: "rumor" },
          {
            id: "ask_retire",
            textKey: "governor.opt_ask_retire",
            // Offered only after a full year at sea: before that there is no
            // career to retire from and the governor has no land to give.
            when: { type: "day", min: 365 },
            next: "retire_offer",
          },
          { id: "ask_standing", textKey: "governor.opt_ask_standing", next: "standing" },
          { id: "leave", textKey: "governor.opt_leave" },
        ],
      },

      letter_offer: {
        id: "letter_offer",
        textKey: "governor.letter_available",
        options: [
          {
            id: "accept",
            textKey: "governor.letter_accept",
            effects: [{ type: "custom", id: EFFECT_GRANT_LETTER }],
            next: "letter_granted",
          },
          { id: "decline", textKey: "governor.opt_decline", next: "greeting" },
        ],
      },

      letter_granted: {
        id: "letter_granted",
        textKey: "governor.letter_granted_reply",
        vars: { faction: ctx.factionName },
        options: [{ id: "back", textKey: "governor.opt_back", next: "greeting" }],
      },

      letter_already: {
        id: "letter_already",
        textKey: "governor.letter_already",
        vars: { faction: ctx.factionName },
        options: [{ id: "back", textKey: "governor.opt_back", next: "greeting" }],
      },

      letter_denied: {
        id: "letter_denied",
        textKey: "governor.letter_denied",
        options: [{ id: "back", textKey: "governor.opt_back", next: "greeting" }],
      },

      retire_offer: {
        id: "retire_offer",
        textKey: "governor.retire_offer",
        vars: { age: ctx.age, score: ctx.scorePreview },
        options: [
          {
            id: "retire_confirm",
            textKey: "governor.opt_retire_confirm",
            effects: [{ type: "custom", id: EFFECT_RETIRE }],
          },
          { id: "retire_decline", textKey: "governor.opt_retire_decline", next: "greeting" },
        ],
      },

      rumor: {
        id: "rumor",
        textKey: ctx.rumorKey,
        options: [{ id: "back", textKey: "governor.opt_back", next: "greeting" }],
      },

      standing: {
        id: "standing",
        textKey: "governor.standing_reply",
        vars: {
          faction: ctx.factionName,
          level: ctx.levelName,
          value: ctx.reputation,
          rank: ctx.rankName,
        },
        options: [{ id: "back", textKey: "governor.opt_back", next: "greeting" }],
      },
    },
  };
}
