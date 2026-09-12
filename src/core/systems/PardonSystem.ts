/**
 * A new governor does not know your name (v0.61.0).
 *
 * ## The promise
 *
 * The help screen has carried this line since v0.9.7.1, in the table of world
 * events, under *New governor*:
 *
 *     +50 wealth, reputation may be wiped
 *
 * Fifty-one releases. The event is real — it is rolled like any other, it is
 * written into the journal, it names a town and a crown — and all it has ever
 * done is put fifty gold on that town's books. There was no code anywhere that
 * touched the captain's standing when a governor changed. The same shape as
 * `native_raid` in v0.58.0 and the plate fleet in v0.46.0: an effect the manual
 * describes and nothing produces.
 *
 * ## What it cost the player
 *
 * Standing below `neutral` is very nearly a one-way street. Measured against
 * the table in `PortAccessSystem` and the conditions in `dialogues.ts`, every
 * way a captain has of *raising* a crown's opinion of him is gated above the
 * place he needs it:
 *
 *   - a letter of marque wants `friendly` (+20), and privateering is the
 *     largest earner of standing in the game;
 *   - a defence commission wants a letter of marque or `allied`;
 *   - the governor's daughter wants +20;
 *   - the freight office — which pays in standing for a charter honoured —
 *     hands out no work at all below `neutral`.
 *
 * That leaves exactly one door, and it is a narrow one: the town granary
 * (v0.27.0), worth at most **+8** and only when that town is starving *and* the
 * captain happens to be carrying four tons of the thing it is starving for. A
 * captain at −80 with Spain needs ten perfect runs of somebody else's famine.
 *
 * So the manual was not describing decoration. It was describing the only door
 * back, and the door was never cut.
 *
 * ## Why the literal reading was rejected
 *
 * "Reputation may be wiped" read at face value means: when a governor changes,
 * roll for a reset of that crown's standing. Measured over 20 seeds × 50 years
 * of the real event machine — 365 000 days, 132 700 events — `new_governor`
 * fires **7975 times**: 6.0% of all world events, about **eight a year**, and
 * for Spain the median gap between one appointment and the next is **65 days**.
 *
 * A crown-wide automatic wipe every couple of months is not a mechanic, it is
 * an off switch for reputation. What the measurement does say is that the event
 * is frequent enough to be *found*: somewhere in the Spanish Main a new man
 * takes the residence every two months or so.
 *
 * So the pardon is local and it is asked for:
 *
 *   - **local** — it is stored on the town (`PortRuntimeState.pardon`), and it
 *     lifts that one counter. The crown still wants him hanged everywhere else.
 *     This is the same instinct as the allied lift in `PortAccessSystem`: the
 *     table already knows how to say "this town treats him better than his
 *     number, and here is why".
 *   - **asked for** — he has to hear about the appointment, sail there (median
 *     passage between two towns is 5.1 days for a sloop, p90 nine), get past
 *     the fort, and pay. A gift that arrived by itself would be invisible.
 *
 * The event's duration is the window, which is why it stopped being an instant:
 * a one-day event is on no noticeboard by the time any news of it could travel.
 */

import type { WorldState, WorldEventState, PortPardon } from "../model/WorldState.ts";
import { portFaction } from "./SiegeSystem.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { t } from "../i18n/index.ts";

/**
 * How long a governor is new.
 *
 * The whole of the window, and the reason `new_governor` is no longer a
 * one-day event. Thirty days against a p90 passage of nine is deliberately
 * generous: the captain has to *hear* about the appointment first, and a
 * noticeboard he is not standing in front of tells him nothing. A knob for a
 * playtest, not a measured constant.
 */
export const GOVERNOR_NEW_DAYS = 30;

/**
 * What a pardon lifts the captain to at that counter: `neutral`, and no more.
 *
 * A stranger, which is exactly what a man whose record has been put aside is.
 * Anything above this would have to be earned, and the ways of earning it are
 * open again the moment he is no longer turned away at the door.
 */
export const PARDON_FLOOR = 0;

/** Gold per point of standing written off. */
export const PARDON_PER_POINT = 25;

/**
 * How much the captain's own name adds to the bill, at full notoriety.
 *
 * The governor is not pricing the grievance, he is pricing his own risk, and
 * that is a question about how loudly the Caribbean says the captain's name —
 * a number the game already keeps.
 */
export const PARDON_NOTORIETY_MUL = 1.0;

export type PardonOffer = {
  portKey: string;
  /** The crown whose residence this is today. */
  crown: string;
  /** His standing with that crown right now (negative, or there is nothing to ask). */
  rep: number;
  /** Points of standing being put aside: the distance up to `PARDON_FLOOR`. */
  points: number;
  gold: number;
};

/** The appointment that is still new at this town, if there is one. */
export function newGovernorAt(world: WorldState, portKey: string): WorldEventState | null {
  const day = world.time.day;
  for (const ev of world.worldEvents) {
    if (ev.type !== "new_governor") continue;
    if (ev.endDay < day) continue;
    if (ev.ports.includes(portKey)) return ev;
  }
  return null;
}

/**
 * Does the paper written here still stand?
 *
 * Pure, and deliberately without a tick behind it. The rule is one comparison:
 * a pardon covers the record as it was on the day it was written, so the moment
 * his standing with that crown falls below where it was, he has given the new
 * governor fresh cause and the counter reads his real number again. Making good
 * that fresh damage brings it back — which is the same sentence read the other
 * way round, and cheaper than a daily sweep over forty-five towns to delete a
 * field.
 *
 * The crown is stamped with it because towns change hands: a pardon signed by
 * the Spanish governor of Cartagena is worth nothing over an English counter in
 * the same building.
 */
export function pardonStands(
  pardon: PortPardon | undefined,
  crown: string,
  reputation: number,
): boolean {
  if (!pardon) return false;
  if (pardon.crown !== crown) return false;
  return reputation >= pardon.rep;
}

/**
 * What the new governor would write off today, or nothing.
 *
 * Absent means the reply is not on the screen at all — the same discipline as
 * the granary and the defence commission. A governor with nothing to forgive
 * has nothing to say, and an option greyed out would only advertise a mechanic
 * the captain cannot reach.
 */
export function pardonOffer(world: WorldState, portKey: string): PardonOffer | null {
  const port = world.ports[portKey];
  if (!port) return null;
  if (!newGovernorAt(world, portKey)) return null;

  const crown = portFaction(world, portKey) as string;
  const rep = world.player.reputation[crown] ?? 0;
  if (rep >= PARDON_FLOOR) return null;                       // nothing to forgive
  if (pardonStands(port.pardon, crown, rep)) return null;     // already written

  const points = PARDON_FLOOR - rep;
  const notoriety = Math.max(0, Math.min(100, world.player.notoriety ?? 0));
  const gold = Math.round(
    points * PARDON_PER_POINT * (1 + PARDON_NOTORIETY_MUL * notoriety / 100),
  );
  return { portKey, crown, rep, points, gold };
}

export type PardonResult = { world: WorldState; error?: string };

/**
 * Pay for it and have it written.
 *
 * Like the granary sale and unlike every other thing a governor offers, this is
 * over before the captain leaves the room, so everything moves here.
 */
export function grantPardon(world: WorldState, offer: PardonOffer): PardonResult {
  const port = world.ports[offer.portKey];
  if (!port) return { world, error: "pardon.not_here" };
  if (world.player.gold < offer.gold) return { world, error: "pardon.no_gold" };

  // Read fresh rather than trusting the offer: the conversation is rebuilt
  // after every choice, but the purse and the standing are the world's.
  const crown = portFaction(world, offer.portKey) as string;
  const rep = world.player.reputation[crown] ?? 0;

  const pardon: PortPardon = { crown, rep, day: world.time.day };
  const paid: WorldState = {
    ...world,
    player: { ...world.player, gold: world.player.gold - offer.gold },
    ports: { ...world.ports, [offer.portKey]: { ...port, pardon } },
  };

  return {
    // Display names, not keys: a journal line is read by a person, and the raw
    // faction key reaching one of these is the v0.37.0 trap.
    world: addLogEntry(paid, "news.pardon_granted", {
      port: t("port." + offer.portKey + ".name"),
      faction: t("faction." + crown + ".name"),
    }),
  };
}
