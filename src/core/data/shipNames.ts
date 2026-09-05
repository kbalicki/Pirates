/**
 * Names for the merchantmen that have one (v0.32.0).
 *
 * Every hull in this game until now has been "a Spanish fluyt" — spawned in the
 * player's radius, despawned behind him, interchangeable with the next one. A
 * ship the informer can put a price on has to be a ship the captain can go and
 * look for, which means she has to be the same ship tomorrow, and that starts
 * with her having a name.
 *
 * Period merchant names, by the crown whose register she is on. Spanish and
 * French houses named ships for saints, the Dutch for towns and virtues, the
 * English for persons and abstractions — which is why the four lists read
 * differently, and why a name is worth a glance on the chart even before the
 * flag is.
 *
 * Not localised. A ship's name is a proper noun and the same in every language:
 * the *Zeven Provinciën* is not "the Seven Provinces" on an English chart, she
 * is the *Zeven Provinciën* spelled wrong by an English clerk.
 */

export const SHIP_NAMES: Record<string, string[]> = {
  spain: [
    "Santa Ana", "Nuestra Señora del Rosario", "San Felipe", "La Concepción",
    "Santa Clara", "San Salvador", "La Trinidad", "Santo Domingo",
    "Nuestra Señora de Atocha", "San Cristóbal",
  ],
  england: [
    "Swallow", "Golden Hind", "Providence", "Merchant Royal",
    "Adventure", "Endeavour", "Fortune", "Prosperous",
    "Charles", "Elizabeth",
  ],
  france: [
    "Sainte-Marie", "Le Griffon", "La Belle Poule", "Saint-Louis",
    "L'Espérance", "La Charente", "Le Soleil d'Or", "Notre-Dame de Grâce",
    "La Rochelle", "Le Fidèle",
  ],
  netherlands: [
    "Zeven Provinciën", "De Liefde", "Hollandia", "Vergulde Draeck",
    "Amsterdam", "Eendracht", "De Hoop", "Middelburg",
    "Gouden Leeuw", "Batavia",
  ],
  pirates: [
    "Queen Anne's Revenge", "Whydah", "Fancy", "Ranger",
    "Royal Fortune", "Black Falcon",
  ],
};

/**
 * A name from that crown's register, chosen by index rather than by dice.
 *
 * The caller holds the RNG and passes an index into it, so seeding the world's
 * named ships costs exactly one roll each and two worlds from the same seed
 * carry the same ships — which is what makes a tavern rumour about the *Santa
 * Ana* worth anything.
 */
export function shipName(crown: string, index: number): string {
  const pool = SHIP_NAMES[crown] ?? SHIP_NAMES.england;
  return pool[Math.abs(index) % pool.length];
}
