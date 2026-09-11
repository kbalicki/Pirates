/**
 * Native villages — the people the world has been raiding colonies for since
 * v0.9.7, finally given somewhere to live.
 *
 * `native_raid` has been a world event from the first economy release: a
 * headline ("Indigenous raid on {{port}}"), a one-shot that takes forty points
 * of a town's defence and fifteen percent of its people, and a hand-written
 * whitelist of eleven frontier towns it is allowed to fall on. Every part of
 * that worked. What the map never had was **anybody doing it** — the same
 * shape as the buccaneers of v0.50.0 and the plate fleet of v0.46.0: a
 * consequence with no cause anywhere in the world, and nothing a captain could
 * touch. The help screen has told the player for twenty releases that a native
 * raid is *an opportunity for a pirate*, and he has never had a way to ask for
 * one.
 *
 * ## Where they are
 *
 * Eight coasts, each a real place where a people held their ground through the
 * whole period the game covers: the Chontal of Tabasco, the Maya of Champotón,
 * the Miskito of the Mosquito Shore, the Guna of Darién, the Wayuu of the
 * Guajira, the Warao of the Orinoco delta, the Kalinago of Dominica — who kept
 * the island out of European hands into the eighteenth century — and the
 * Calusa of the south-west Florida coast.
 *
 * ## Why these are direct pixels and not `geoToMap`
 *
 * Three constraints, all of them measured against the real coastline rather
 * than eyeballed, and every one of them a way the first draft was wrong:
 *
 *   1. **Inside a landmass polygon.** `snapToCoast` — the same search that
 *      places the forty-five towns — returns a position unchanged when it is
 *      already on land, so a village sited on land is drawn *exactly* where
 *      this table says, and the neighbour measured in the tests is the
 *      neighbour a war party marches on. Four of the first nine sites landed
 *      in the water and would have been moved by the grid to somewhere nobody
 *      had checked.
 *   2. **No more than six units inland.** The first Warao site was in the
 *      delta proper, **thirty-three units from open water** — further than any
 *      ship can be hailed from, so the village existed and could not be
 *      reached. Every one of these is between one and six units from the sea.
 *   3. **At least sixty-five units from the nearest town.** Hailing range is
 *      fifty and a town's is six, so a captain standing off a colony can never
 *      be inside a village's range as well. The tightest is Dominica at
 *      sixty-six from Martinique, and it cannot be improved: the island sits
 *      between Martinique and Guadeloupe with sixty-odd units either side. The
 *      Tairona site under the Sierra Nevada was **twenty-six** from Santa Marta
 *      and had to be cut for this — that stretch of coast has two towns
 *      ninety-five units apart and there is no room between them.
 *
 * `neighbour` is the colony each one looks down on — the nearest town on the
 * chart, **measured, not invented**, and guarded by a test so that moving a
 * village or a city cannot quietly leave a war party marching on the wrong
 * place. Six of the eight neighbour a real city; two neighbour an outpost,
 * where a raid is worth far less (an outpost sits at fifteen points of defence
 * and minus forty buys nothing that was not already nothing).
 *
 * There is no `factionId` here on purpose. A village is the first place on this
 * chart that flies nobody's flag, and that is the whole of what makes it
 * different from the forty-five towns beside it.
 */

import type { Vec2 } from "../model/WorldState.ts";

export type VillageDef = {
  /** Stable key. Also the i18n stem: `village.<id>.name` / `.people`. */
  id: string;
  /** Where they are. On land, within six units of open water — see above. */
  pos: Vec2;
  /**
   * The colony they live beside — the nearest town on the chart, measured.
   *
   * This is who a war party falls on, and it is why the village is worth
   * sailing to at all.
   */
  neighbour: string;
};

export const VILLAGES: Record<string, VillageDef> = {
  // Chontal Maya of Tabasco, on the Grijalva below the Spanish town.
  cimatan: { id: "cimatan", pos: { x: 440, y: 1482 }, neighbour: "villa_hermosa" },
  // Maya of Champotón, on the coast the conquistadors called the Bay of the
  // Bad Fight because they lost one there.
  champoton: { id: "champoton", pos: { x: 647, y: 1417 }, neighbour: "campeche" },
  // The Mosquito Shore — never Spanish, and the buccaneers' own recruiting
  // ground for pilots and turtlers.
  miskito: { id: "miskito", pos: { x: 1166, y: 1927 }, neighbour: "gran_granada" },
  // Guna of Darién, astride the isthmus the silver crosses.
  darien: { id: "darien", pos: { x: 1600, y: 2264 }, neighbour: "panama" },
  // Wayuu of the Guajira peninsula, who were never conquered and traded
  // pearls, salt and contraband with whoever sailed in.
  guajira: { id: "guajira", pos: { x: 2041, y: 1971 }, neighbour: "rio_de_la_hacha" },
  // Warao of the Orinoco delta — the canoe people, in country no army could
  // march through. Sited on the Gulf of Paria shore rather than in the delta
  // itself, which is thirty-three units from navigable water.
  warao: { id: "warao", pos: { x: 2695, y: 2168 }, neighbour: "trinidad" },
  // Kalinago of Waitukubuli — Dominica — which held out against every crown
  // in the Lesser Antilles.
  waitukubuli: { id: "waitukubuli", pos: { x: 2748, y: 1723 }, neighbour: "martinique" },
  // Calusa of the south-west Florida coast, in the emptiest quarter of the
  // chart: the nearest colony is a hundred and sixty-five units away.
  calusa: { id: "calusa", pos: { x: 1288, y: 787 }, neighbour: "florida_keys" },
};

/** Every village, in a stable order. */
export function villageList(): VillageDef[] {
  return Object.values(VILLAGES);
}
