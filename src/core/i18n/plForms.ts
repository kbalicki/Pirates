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
  const table = kind === "port" ? PORTS : kind === "faction" ? FACTIONS : undefined;
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

/** Every port and crown this table claims to know. Read by the tests. */
export function plDeclinedKeys(kind: "port" | "faction"): string[] {
  return Object.keys(kind === "port" ? PORTS : FACTIONS);
}
