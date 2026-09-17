import { t, hasKey } from "./I18n.ts";

/**
 * The one place that turns an id into the key its name is written under.
 *
 * Until v0.63.0 the data tables carried a second, English-only copy of every
 * name the locale tables already held — `CITIES[x].name`, `FACTIONS[x].name`,
 * `ITEMS[x].name`, `ShipClassDef.name` — and core systems built `vars` out of
 * that copy for text the player reads: event headlines, journal lines, quest
 * objectives, contract descriptions. A Polish player read *"Dekret krolewski
 * Spain zmienia taryfy w koloniach"*.
 *
 * The hard part was never the call sites. `vars` are **stamped into the event
 * and saved** (the rule from v0.43.0: a fact is stamped at the event, not
 * recomputed from today's world), so translating at the stamp freezes an old
 * save into the language it was written in, and nothing a later language
 * switch does can reach it.
 *
 * So the stamp carries the **key**, and `t()` resolves a name-shaped key when
 * it substitutes a `{{var}}`. That is the honest reading of the v0.43.0 rule:
 * a town's name is not a fact that changes, the town is — the key **is** the
 * fact and the name was only ever a rendering of it. One change point instead
 * of every headline renderer, no migration, and a save written before this
 * release degrades exactly to what it shows today (its stamped English text is
 * not key-shaped, so it passes through untouched).
 *
 * The fallback is deliberate: an id the locale tables do not know comes back
 * as the id itself, which is what `TABLE[x]?.name ?? x` did before.
 */
function nameKey(prefix: string, id: string): string {
  const key = `${prefix}.${id}.name`;
  return hasKey(key) ? key : id;
}

/** Key for a town's name — stamp this into `vars`, never the name itself. */
export function portNameKey(portKey: string): string {
  return nameKey("port", portKey);
}

/** Key for a crown's name. */
export function factionNameKey(factionKey: string): string {
  return nameKey("faction", factionKey);
}

/** Key for a good's name. */
export function itemNameKey(itemId: string): string {
  return nameKey("item", itemId);
}

/**
 * The form a quantity takes: "twenty tons of sugar", never "twenty tons of
 * Sugar Cane" (v0.68.0).
 *
 * Twenty sentences in the game stitch a number and an item name together - the
 * governor's granary, the freight office, the informer's relief run, the
 * rumours - and every one printed the nominative, capitalised, in the middle of
 * a phrase that wanted the genitive. Polish needs a real second form; English
 * needs the lower case. Falls back to the plain name, so a good with no `.gen`
 * key is never worse off than it is today.
 */
export function itemNameKeyGen(itemId: string): string {
  const key = `item.${itemId}.gen`;
  return hasKey(key) ? key : itemNameKey(itemId);
}

/** Key for a ship class's name. */
export function shipNameKey(classId: string): string {
  return nameKey("ship", classId);
}

/**
 * The name itself, for a screen drawing it right now.
 *
 * Only for text that is not stored. Anything that goes into `vars` takes the
 * key, or it will be read back in the wrong language.
 */
export function portName(portKey: string): string {
  return t(portNameKey(portKey));
}

/** @see portName */
export function factionName(factionKey: string): string {
  return t(factionNameKey(factionKey));
}

/** @see portName */
export function itemName(itemId: string): string {
  return t(itemNameKey(itemId));
}

/** The genitive, for a screen drawing a quantity right now. @see itemNameKeyGen */
export function itemNameGen(itemId: string): string {
  return t(itemNameKeyGen(itemId));
}

/** @see portName */
export function shipClassName(classId: string): string {
  return t(shipNameKey(classId));
}
