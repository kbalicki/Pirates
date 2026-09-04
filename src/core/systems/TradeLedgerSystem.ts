/**
 * The trade ledger — money follows goods.
 *
 * v0.23.0 made cargo physically travel: a trader loads out of one warehouse
 * and lands her hold in another, the daily tick supplies what a town cannot
 * grow, and the player carries freight for a fee. What none of it did was
 * *pay for anything*. Goods moved and nobody's purse changed. A port's wealth
 * was a function of production, shortage and a pull toward its baseline, and a
 * town at the hub of six shipping lanes was worth exactly as much as an
 * identical town at the end of none.
 *
 * This module is the missing half, and it has one rule:
 *
 *   **Wherever goods move, money moves with them, in the opposite direction.**
 *
 * Which gives two settlements, and only two:
 *
 *   - **A lane delivery**, settled once a day by `EconomyTickSystem`. The
 *     exporter is paid for the cargo at his own quayside price. The importer's
 *     merchants sell it on at the local price and keep part of the difference.
 *     Both ends gain, which is not a fudge — it is the entire reason trade
 *     exists: a barrel of cocoa is worth more where nobody grows it. Cut the
 *     lane and neither payment happens, so a blockade or a season of commerce
 *     raiding costs both towns money without a line of extra bookkeeping.
 *   - **The player's own trade**, settled at the counter. He is the outside
 *     party: gold he pays over goes into the town, gold the town pays him
 *     comes out of it. No margin, because he keeps it himself. Dump two
 *     hundred tons on a fishing village and it is measurably poorer for it.
 *
 * ## Where the ledger deliberately does *not* sit
 *
 * On the hulls. A trader docking in front of the player lands her cargo and
 * moves the local market — that much is real and visible — but she settles no
 * money, because the lane she belongs to has already been paid for in full by
 * the daily tick. The ships on the chart are a *sample* of the trade, not the
 * whole of it; paying them too would count every voyage twice and, worse,
 * would quietly enrich whichever town the player happened to be anchored off.
 *
 * ## Why a ledger and not a direct write
 *
 * Port wealth is a small integer on a 0..1000 scale and a day's honest trade
 * is worth a fraction of a point of it. Written straight to `wealth` every
 * settlement would round to nothing and the whole loop would be invisible. So
 * settlements accrue in gold on `PortRuntimeState.tradeBalance`, and the daily
 * tick converts the day's total once, at `GOLD_PER_WEALTH`, and files it in
 * `tradeIncome` where the port screen can show it. Both fields are optional:
 * a save written before this release simply has no ledger, which is true of it.
 */

import type { WorldState, PortRuntimeState } from "../model/WorldState.ts";
import { ITEMS } from "../data/items.ts";

/**
 * Gold of turnover that moves one point of a port's wealth.
 *
 * Measured, not guessed. Left undisturbed for four hundred days, the busiest
 * quay in the Caribbean — Port Royale, where a dozen lanes end — clears about
 * a hundred gold a day, and the quietest outposts clear nothing at all. At
 * this rate that puts Port Royale some fifty points above its baseline once
 * the daily pull toward baseline balances the income, and leaves a town at the
 * end of no lane exactly where it was. Fifty points on a scale where a
 * prosperous colony sits at 600 is the size this ought to be: worth having,
 * worth cutting, and not so large that trade overwhelms everything else the
 * economy does.
 *
 * The player deals in far bigger sums than the towns do — a hold of sugar is
 * twenty days of a colony's entire commerce — and that asymmetry is on
 * purpose. He *should* be able to move a small market. `MAX_TRADE_WEALTH_PER_DAY`
 * is what stops him moving it off the table.
 */
export const GOLD_PER_WEALTH = 200;

/**
 * Most wealth one day's trading may move, in either direction.
 *
 * A guard rail, not a mechanic. Prices now slide as a hold is sold (see
 * `PricingSystem`), so dumping cargo self-limits long before this bites; this
 * exists so that no single afternoon at the counter — and no arithmetic
 * accident, an event stacking price multipliers, a save with an absurd
 * warehouse — can wipe or moon a town outright.
 */
export const MAX_TRADE_WEALTH_PER_DAY = 6;

/**
 * The importer's cut, as a share of the margin between the two quays.
 *
 * Less than all of it because the shipper takes his freight out of the middle,
 * and the shipper is not modelled — he is the hull on the map, and what he
 * earns leaves the ledger the same way a wage does.
 */
const IMPORTER_MARGIN_SHARE = 0.5;

/**
 * Ceiling on the margin, as a multiple of what the cargo cost at the far end.
 *
 * A starving town quotes triple, and without this a blockade would make the
 * blockaded town's merchants rich on the trickle that still got through —
 * the model congratulating them for the famine.
 */
const MAX_MARGIN_RATIO = 1.0;

/** What a parcel of goods is worth at one port's posted prices. */
export function cargoValue(
  port: PortRuntimeState | undefined,
  cargo: Record<string, number>,
): number {
  if (!port) return 0;
  let total = 0;
  for (const [item, qty] of Object.entries(cargo)) {
    if (qty <= 0) continue;
    const price = port.prices[item] ?? ITEMS[item]?.basePrice ?? 0;
    total += price * qty;
  }
  return Math.round(total);
}

/** Add (or, negative, take) gold to a port's ledger for the day. */
export function creditTrade(port: PortRuntimeState, gold: number): PortRuntimeState {
  if (!gold) return port;
  return { ...port, tradeBalance: (port.tradeBalance ?? 0) + gold };
}

/**
 * What a delivery is worth to each end of the lane.
 *
 * `paid` is what the cargo cost on the exporter's quay; `soldFor` is what it
 * fetches on the importer's. The exporter gets the first number, the importer
 * gets a share of the difference, and neither gets anything if the cargo did
 * not arrive — which is the whole of commerce raiding's effect on the books.
 */
export function deliveryValue(
  paid: number,
  soldFor: number,
): { paid: number; margin: number } {
  const gross = Math.max(0, soldFor - paid);
  const margin = Math.round(Math.min(gross, paid * MAX_MARGIN_RATIO) * IMPORTER_MARGIN_SHARE);
  return { paid: Math.max(0, Math.round(paid)), margin };
}

/** Yesterday's turnover through a port's quay, in gold. Zero on an old save. */
export function tradeIncome(world: WorldState, portKey: string): number {
  return world.ports[portKey]?.tradeIncome ?? 0;
}

/**
 * Turn a day's ledger into wealth.
 *
 * Called once per port per day from `EconomyTickSystem`, which owns the wealth
 * number and does the clamping. Returns the wealth delta; wiping the ledger is
 * the caller's business, because it is already rebuilding the port record.
 */
export function settleDailyLedger(gold: number): number {
  const delta = gold / GOLD_PER_WEALTH;
  return Math.max(-MAX_TRADE_WEALTH_PER_DAY, Math.min(MAX_TRADE_WEALTH_PER_DAY, delta));
}
