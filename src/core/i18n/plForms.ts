/**
 * Polish has seven cases, and the game knew one (v0.69.0).
 *
 * Every sentence in `pl.ts` that names a port dropped the **nominative** into
 * the hole, whatever the phrase around it wanted: *"Zamknęli port w Hawana"*,
 * *"Przybito do Kartagena"*, *"Huragan pod Martynika"*. Sixty-seven of them.
 * It is the same defect v0.68.0 found in the twenty sentences that stitch a
 * number to a cargo — *"Mam na pokładzie 10 Jedzenie"* — and the fix there was
 * a second stored form, `item.<id>.gen`. This is that fix carried to the place
 * where it actually hurts, because a port name is in nearly every line the game
 * writes about the world.
 *
 * ## The preposition belongs to the port, not to the sentence
 *
 * A second-form table alone would not have been enough. Polish puts a town
 * **in** and an island **on**: *w Hawanie* but *na Martynice*, *do Kartageny*
 * but *na Barbados*. The English string carries one preposition for every port
 * because English has one; the Polish string cannot. So the three forms a
 * preposition governs — `in`, `to`, `from` — are stored here **with their
 * preposition**, and the Polish sentence writes `{{port:in}}` where it used to
 * write `w {{port}}`. The English sentence is untouched and keeps its own
 * `in {{port}}`: the two locales stopped having to agree about grammar, which
 * is the point.
 *
 * ## Most of these names do not decline at all
 *
 * Thirty of the forty-five are Spanish or English names Polish leaves alone —
 * *Santo Domingo*, *Vera Cruz*, *Nassau*, *St. Kitts* — and for those the only
 * thing this table has to say is whether they take `w` or `na`. A port with no
 * row here is a town whose name does not move, which is why the defaults fall
 * back to the nominative rather than trying to guess an ending. Fifteen do
 * decline, and those are written out in full: a morphology engine would have to
 * know that *Tortuga* becomes *Tortudze* and *Martynika* becomes *Martynice*,
 * and fifteen rows are cheaper and safer than the rule that produces them.
 */

/** The bare cases a sentence can ask for. */
export type PlCase = "gen" | "dat" | "acc" | "ins" | "loc";

/** Everything `{{var:form}}` accepts: a bare case, or a prepositional phrase. */
export type PlForm = PlCase | "in" | "to" | "from";

const FORMS: readonly string[] = ["gen", "dat", "acc", "ins", "loc", "in", "to", "from"];

/** Is this a form `{{var:form}}` knows how to build? */
export function isPlForm(form: string): form is PlForm {
  return FORMS.includes(form);
}

type Declension = {
  /**
   * An island takes `na` where a town on the main takes `w`, and `na` + the
   * accusative where a town takes `do` + the genitive. This one flag decides
   * every preposition in the table below.
   */
  island?: boolean;
  gen?: string;
  dat?: string;
  acc?: string;
  ins?: string;
  loc?: string;
  /** Whole-phrase overrides, for a preposition the flag cannot predict. */
  in?: string;
  to?: string;
  from?: string;
};

/**
 * The fifteen that decline, and the thirty that only need to say `w` or `na`.
 *
 * Keyed by the port key, not by the Polish name, so a retranslation of a name
 * cannot silently leave its forms behind pointing at nothing.
 */
const PORTS: Record<string, Declension> = {
  // ── Spanish Main and the Greater Antilles: towns, so `w` and `do` ──
  havana: { dat: "Hawanie", gen: "Hawany", acc: "Hawanę", ins: "Hawaną", loc: "Hawanie" },
  cartagena: { dat: "Kartagenie", gen: "Kartageny", acc: "Kartagenę", ins: "Kartageną", loc: "Kartagenie" },
  panama: { dat: "Panamie", gen: "Panamy", acc: "Panamę", ins: "Panamą", loc: "Panamie" },
  gibraltar: { dat: "Gibraltarowi", gen: "Gibraltaru", acc: "Gibraltar", ins: "Gibraltarem", loc: "Gibraltarze" },
  gran_granada: {
    dat: "Gran Granadzie", gen: "Gran Granady", acc: "Gran Granadę", ins: "Gran Granadą", loc: "Gran Granadzie",
  },
  santa_marta: {
    dat: "Santa Marcie", gen: "Santa Marty", acc: "Santa Martę", ins: "Santa Martą", loc: "Santa Marcie",
  },
  santiago: {},
  santo_domingo: {},
  san_juan: {},
  porto_bello: {},
  vera_cruz: {},
  campeche: {},
  maracaibo: {},
  cumana: {},
  caracas: {},
  nombre_de_dios: {},
  puerto_cabello: {},
  puerto_principe: {},
  rio_de_la_hacha: {},
  st_augustine: {},
  villa_hermosa: {},
  port_royal: {},
  nassau: {},
  belize: {},
  petit_goave: {},
  port_de_paix: {},
  leogane: {},

  // ── Islands: `na` in all three phrases ──
  trinidad: {
    island: true,
    dat: "Trynidadowi", gen: "Trynidadu", acc: "Trynidad", ins: "Trynidadem", loc: "Trynidadzie",
  },
  margarita: {
    island: true,
    dat: "Margaricie", gen: "Margarity", acc: "Margaritę", ins: "Margaritą", loc: "Margaricie",
  },
  santa_catalina: {
    island: true,
    dat: "Santa Catalinie", gen: "Santa Cataliny", acc: "Santa Catalinę", ins: "Santa Cataliną",
    loc: "Santa Catalinie",
  },
  barbados: {
    island: true,
    dat: "Barbadosowi", gen: "Barbadosu", acc: "Barbados", ins: "Barbadosem", loc: "Barbadosie",
  },
  antigua: { island: true, dat: "Antigui", gen: "Antigui", acc: "Antiguę", ins: "Antiguą", loc: "Antigui" },
  // Plural, like the Polish name for the islands themselves.
  bermuda: {
    island: true,
    dat: "Bermudom", gen: "Bermudów", acc: "Bermudy", ins: "Bermudami", loc: "Bermudach",
  },
  eleuthera: {
    island: true,
    dat: "Eleutherze", gen: "Eleuthery", acc: "Eleutherę", ins: "Eleutherą", loc: "Eleutherze",
  },
  gran_bahama: {
    island: true,
    dat: "Gran Bahamie", gen: "Gran Bahamy", acc: "Gran Bahamę", ins: "Gran Bahamą", loc: "Gran Bahamie",
  },
  tortuga: { island: true, dat: "Tortudze", gen: "Tortugi", acc: "Tortugę", ins: "Tortugą", loc: "Tortudze" },
  martinique: {
    island: true,
    dat: "Martynice", gen: "Martyniki", acc: "Martynikę", ins: "Martyniką", loc: "Martynice",
  },
  guadeloupe: {
    island: true,
    dat: "Gwadelupie", gen: "Gwadelupy", acc: "Gwadelupę", ins: "Gwadelupą", loc: "Gwadelupie",
  },
  montserrat: {
    island: true,
    dat: "Montserratowi", gen: "Montserratu", acc: "Montserrat", ins: "Montserratem", loc: "Montserracie",
  },
  st_kitts: { island: true },
  nevis: { island: true },
  florida_keys: { island: true },
  curacao: { island: true },
  st_eustatius: { island: true },
  st_martin: { island: true },
};

/**
 * The nine ship classes (v0.79.0).
 *
 * Six Polish sentences put a class name after *na*, *Zakupiono*, *Sprzedano*
 * or *Porzucono* — every one of them an accusative — and printed the
 * nominative: *"Bandera przechodzi na Fregata"*, *"Sprzedano Brygantyna"*.
 * Three of the nine names are feminine and are the three that show it; the
 * other six are masculine inanimate, where the accusative and the nominative
 * are the same word, which is why this went unnoticed for the life of the
 * project. A class is not a place, so no preposition is baked in here.
 *
 * It became reachable in this release: until `DefeatSystem` and
 * `SeaBattleScene` stopped resolving the name at the call site, the sentence
 * was handed a finished word and there was nothing left to decline.
 */
const SHIPS: Record<string, Declension> = {
  pinnace: { dat: "Pinasowi", gen: "Pinasu", acc: "Pinas", ins: "Pinasem", loc: "Pinasie" },
  sloop: { dat: "Slupowi", gen: "Slupa", acc: "Slup", ins: "Slupem", loc: "Slupie" },
  barque: { dat: "Barce", gen: "Barki", acc: "Barkę", ins: "Barką", loc: "Barce" },
  brigantine: {
    dat: "Brygantynie", gen: "Brygantyny", acc: "Brygantynę", ins: "Brygantyną",
    loc: "Brygantynie",
  },
  fluyt: { dat: "Fluitowi", gen: "Fluitu", acc: "Fluit", ins: "Fluitem", loc: "Fluicie" },
  frigate: { dat: "Fregacie", gen: "Fregaty", acc: "Fregatę", ins: "Fregatą", loc: "Fregacie" },
  fast_galleon: {
    dat: "Szybkiemu Galeonowi", gen: "Szybkiego Galeonu", acc: "Szybki Galeon",
    ins: "Szybkim Galeonem", loc: "Szybkim Galeonie",
  },
  galleon: { dat: "Galeonowi", gen: "Galeonu", acc: "Galeon", ins: "Galeonem", loc: "Galeonie" },
  merchantman: {
    dat: "Statkowi handlowemu", gen: "Statku handlowego", acc: "Statek handlowy",
    ins: "Statkiem handlowym", loc: "Statku handlowym",
  },
};

/**
 * The eight villages (v0.79.0).
 *
 * The same table as the ports, for the same reason and with the same rule: a
 * row with no forms is a name Polish leaves alone, and all the row says is
 * whether the place takes `w` or `na`. Five of the eight do not move - *Cabo
 * de la Vela* and *Guayo* are Spanish, *Waitukubuli* and *Calos* are neither
 * Spanish nor Polish, and none of them has an ending Polish knows what to do
 * with. Three do: two masculine towns on the main and one feminine name in
 * `-a`.
 *
 * Two are islands: Waitukubuli is Dominica, and the Calusa sat on the Florida
 * keys' own shore - `village.calusa`'s neighbour is `florida_keys`, which this
 * file already calls an island. The other six are on the main.
 */
const VILLAGES: Record<string, Declension> = {
  cimatan: {
    dat: "Cimatanowi", gen: "Cimatanu", acc: "Cimatan", ins: "Cimatanem", loc: "Cimatanie",
  },
  champoton: {
    dat: "Champotonowi", gen: "Champotonu", acc: "Champoton", ins: "Champotonem",
    loc: "Champotonie",
  },
  // Kaurkira, feminine in `-a`, so it declines like Hawana does.
  miskito: {
    dat: "Kaurkirze", gen: "Kaurkiry", acc: "Kaurkirę", ins: "Kaurkirą", loc: "Kaurkirze",
  },
  darien: { dat: "Darienowi", gen: "Darienu", acc: "Darien", ins: "Darienem", loc: "Darienie" },
  guajira: {},
  warao: {},
  waitukubuli: { island: true },
  calusa: { island: true },
};

/**
 * The four crowns and the black flag.
 *
 * Only the bare cases: a crown is never a place, so nothing here needs a
 * preposition baked in — the sentence keeps its own `od`, `z`, `przeciw`.
 */
const FACTIONS: Record<string, Declension> = {
  spain: { gen: "Hiszpanii", dat: "Hiszpanii", acc: "Hiszpanię", ins: "Hiszpanią" },
  england: { gen: "Anglii", dat: "Anglii", acc: "Anglię", ins: "Anglią" },
  france: { gen: "Francji", dat: "Francji", acc: "Francję", ins: "Francją" },
  netherlands: { gen: "Holandii", dat: "Holandii", acc: "Holandię", ins: "Holandią" },
  pirates: { gen: "Piratów", dat: "Piratom", acc: "Piratów", ins: "Piratami" },
};

type Declined = Declension;

function bare(d: Declined, form: PlCase, nominative: string): string {
  return d[form] ?? nominative;
}

/**
 * One name in one form, or `undefined` when nothing here can answer.
 *
 * `undefined` rather than the nominative on purpose: the caller falls back, and
 * a test can tell "this name does not move" from "nobody has written the form
 * down yet" — which is the difference between a correct sentence and a silent
 * `w Hawana`.
 */
export function plNameForm(
  kind: string,
  id: string,
  nominative: string,
  form: string,
): string | undefined {
  if (!isPlForm(form)) return undefined;
  const table = kind === "port" ? PORTS
    : kind === "faction" ? FACTIONS
    : kind === "village" ? VILLAGES
    : kind === "ship" ? SHIPS
    : undefined;
  if (!table) return undefined;
  const d: Declined | undefined = table[id];
  if (!d) return undefined;

  switch (form) {
    case "gen": case "dat": case "acc": case "ins": case "loc":
      return bare(d, form, nominative);
    case "in":
      return d.in ?? (d.island ? "na " : "w ") + bare(d, "loc", nominative);
    case "to":
      return d.to ?? (d.island
        ? "na " + bare(d, "acc", nominative)
        : "do " + bare(d, "gen", nominative));
    case "from":
      return d.from ?? "z " + bare(d, "gen", nominative);
  }
}

/**
 * The preposition a phrase form falls back to when the name cannot be declined.
 *
 * The one place this file is allowed to guess. `{{port:in}}` replaced a written
 * `w {{port}}`, so a variable that turns out not to carry a name key - a plain
 * string baked into an old save, a caller that resolved the name too early -
 * must still come out as a Polish phrase rather than a bare noun with the
 * preposition silently gone. What it produces is exactly what the sentence said
 * before v0.69.0, which is the right thing to degrade to.
 */
export function plPhraseFallback(form: string, text: string): string | undefined {
  switch (form) {
    case "in": return "w " + text;
    case "to": return "do " + text;
    case "from": return "z " + text;
    default: return undefined;
  }
}

/**
 * The twelve months in the genitive, lower case (v0.97.0).
 *
 * `time.month_names` holds the nominative, and the nominative is the one form
 * the game never prints: the month name has **one** reader, `getMonthName`,
 * and every sentence built on it is `<day number> <month> <year>` — the HUD
 * every frame, the calendar tab, the list of saves on the title screen. With a
 * day number in front of it Polish wants the genitive, so the chart read
 * *1 Styczeń 1680* where it should read *1 stycznia 1680*, and had since the
 * clock was written.
 *
 * Kept here rather than in `pl.ts` for the same reason the port forms are:
 * `keys.test.ts` holds the two locale tables to the same key set, and English
 * has no second form to put opposite this one.
 */
const MONTHS_GEN: readonly string[] = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
];

/** The month in the genitive, or `undefined` for a number that is not one. */
export function plMonthGen(month: number): string | undefined {
  return MONTHS_GEN[month - 1];
}

/** The genitive months, for the test that reads them against the nominative. */
export function plMonthsGen(): readonly string[] {
  return MONTHS_GEN;
}

/** Every name this table claims to know, by family. Read by the tests. */
export function plDeclinedKeys(kind: "port" | "faction" | "village" | "ship"): string[] {
  const table = kind === "port" ? PORTS
    : kind === "faction" ? FACTIONS
    : kind === "village" ? VILLAGES
    : SHIPS;
  return Object.keys(table);
}
