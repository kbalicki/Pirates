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
  /** Her name, when this town has a governor's daughter at home. */
  daughterName?: string;
  /** True once the captain is married; the reply disappears for good. */
  married: boolean;
  /**
   * A colony of this crown with a landing bearing down on it, when the crown
   * counts the captain as one of its own and he is not already under contract.
   *
   * Absent means the reply is not there at all — a governor with nothing under
   * threat has nothing to ask, and an option that greys out would only advertise
   * a mechanic the player cannot reach.
   */
  defenseOffer?: {
    portName: string;
    enemyName: string;
    soldiers: number;
    days: number;
    reward: number;
  };
  /**
   * What the governor would buy out of the hold, when his town is short and the
   * captain happens to be carrying the answer (v0.27.0).
   *
   * Absent means the reply is not on the screen at all. A governor with full
   * granaries has nothing to ask, and a captain in ballast has nothing to sell;
   * an option that greyed out would only advertise a mechanic he cannot reach.
   */
  grainOffer?: {
    itemName: string;
    qty: number;
    gold: number;
    reputation: number;
  };
  /**
   * The sale that has just gone through, for the reply that confirms it.
   *
   * Separate from `grainOffer` because the offer is recomputed the instant the
   * cargo lands, and by then it describes the *next* shelf that needs filling —
   * so a confirmation built from it told the captain he had landed something he
   * had not. Caught by looking at the screen, not by a test.
   */
  grainSold?: {
    itemName: string;
    qty: number;
    gold: number;
  };
};

/** Effect id the caller must handle: hands over the letter of marque. */
export const EFFECT_GRANT_LETTER = "grant_letter_of_marque";
/** Effect id the caller must handle: the captain hangs up his sword for good. */
export const EFFECT_RETIRE = "retire_captain";
/**
 * Effect id the caller must handle: show the captain into the drawing room.
 *
 * The courtship itself is not a tree. Every approach is a dice roll against
 * charm, gold or notoriety, and `DialogueEffect` is deliberately a closed
 * vocabulary of deterministic changes — encoding a skill check in it would
 * mean inventing a whole second language inside the dialogue data. So the
 * governor's tree does one thing: it opens the door, and the port scene takes
 * it from there.
 */
export const EFFECT_VISIT_DAUGHTER = "visit_daughter";
/**
 * Effect id the caller must handle: the captain takes the defence commission.
 *
 * Same reason as the drawing room — the tree can say what is being asked and
 * what it pays, but the thing it starts is a quest instance with a deadline
 * baked into it, and `DialogueEffect` is a closed vocabulary of deterministic
 * changes on purpose. The port scene knows which offer was on the table.
 */
export const EFFECT_ACCEPT_DEFENSE = "accept_defense_contract";
/**
 * Effect id the caller must handle: the hold is emptied into the town granary.
 *
 * Unlike every other custom effect in this tree, what it starts is over
 * immediately — gold, standing and the goods all move at once, because nothing
 * about a spot sale is a promise. It is a custom effect all the same, since
 * `DialogueEffect` cannot move cargo and the port scene is what holds the offer.
 */
export const EFFECT_SELL_GRAIN = "sell_grain_to_granary";

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
          {
            id: "ask_daughter",
            textKey: "governor.opt_ask_daughter",
            vars: { name: ctx.daughterName ?? "" },
            // Hidden entirely for a town with no governor's household, and for
            // a captain who already has a wife. Reputation is checked by the
            // caller, which is what actually knows whether the door opens.
            when: ctx.daughterName && !ctx.married
              ? { type: "reputation", faction: ctx.factionKey, min: 20 }
              : { type: "flag", key: "__never__" },
            effects: [{ type: "custom", id: EFFECT_VISIT_DAUGHTER }],
          },
          {
            id: "ask_defense",
            textKey: "governor.opt_ask_defense",
            vars: { port: ctx.defenseOffer?.portName ?? "" },
            // Built by the caller or not at all: whether a landing is coming
            // and whether this crown would have the captain on its wall are
            // both questions the port scene can answer and a condition cannot.
            when: ctx.defenseOffer ? undefined : { type: "flag", key: "__never__" },
            next: "defense_offer",
          },
          {
            id: "ask_grain",
            textKey: "governor.opt_sell_grain",
            vars: {
              item: ctx.grainOffer?.itemName ?? "",
              qty: ctx.grainOffer?.qty ?? 0,
            },
            // Built by the caller or not at all, like the defence commission:
            // whether the town is short and whether the hold has the answer are
            // both questions the port scene can answer and a condition cannot.
            when: ctx.grainOffer ? undefined : { type: "flag", key: "__never__" },
            next: "grain_offer",
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

      grain_offer: {
        id: "grain_offer",
        textKey: "governor.grain_offer",
        vars: {
          item: ctx.grainOffer?.itemName ?? "",
          qty: ctx.grainOffer?.qty ?? 0,
          gold: ctx.grainOffer?.gold ?? 0,
          rep: ctx.grainOffer?.reputation ?? 0,
        },
        options: [
          {
            id: "grain_accept",
            textKey: "governor.opt_grain_accept",
            effects: [{ type: "custom", id: EFFECT_SELL_GRAIN }],
            next: "grain_landed",
          },
          { id: "grain_decline", textKey: "governor.opt_decline", next: "greeting" },
        ],
      },

      grain_landed: {
        id: "grain_landed",
        textKey: "governor.grain_landed",
        vars: {
          item: ctx.grainSold?.itemName ?? ctx.grainOffer?.itemName ?? "",
          qty: ctx.grainSold?.qty ?? ctx.grainOffer?.qty ?? 0,
          gold: ctx.grainSold?.gold ?? ctx.grainOffer?.gold ?? 0,
        },
        options: [{ id: "back", textKey: "governor.opt_back", next: "greeting" }],
      },

      defense_offer: {
        id: "defense_offer",
        textKey: "governor.defense_offer",
        vars: {
          port: ctx.defenseOffer?.portName ?? "",
          enemy: ctx.defenseOffer?.enemyName ?? "",
          soldiers: ctx.defenseOffer?.soldiers ?? 0,
          days: ctx.defenseOffer?.days ?? 0,
          gold: ctx.defenseOffer?.reward ?? 0,
        },
        options: [
          {
            id: "defense_accept",
            textKey: "governor.opt_defense_accept",
            effects: [{ type: "custom", id: EFFECT_ACCEPT_DEFENSE }],
            next: "defense_accepted",
          },
          { id: "defense_decline", textKey: "governor.opt_decline", next: "greeting" },
        ],
      },

      defense_accepted: {
        id: "defense_accepted",
        textKey: "governor.defense_accepted",
        vars: { port: ctx.defenseOffer?.portName ?? "" },
        options: [{ id: "back", textKey: "governor.opt_back", next: "greeting" }],
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
