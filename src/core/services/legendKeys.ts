/**
 * legendKeys — which keys a line of text on the screen promises.
 *
 * Every control legend in this game is written the same way: the key, an em
 * dash, what it does, repeated across the line.
 *
 *     T — ognia do szalup    G — ognia do eskorty    ESC — ciąć liny
 *     W/S — Wybór   Enter — Zatwierdź   Esc — Odpłyń
 *     A/←  D/→  lub 1-5 — karta       H / ESC — zamknij
 *
 * That shape is what makes the promise **readable by a machine**, and v0.84.0
 * is the release that started reading it: a scene's legend is checked against
 * the keys the scene actually binds, so a control that exists and is never
 * named cannot survive a release (`scene_legend.test.ts`).
 *
 * The reading is deliberately narrow. Only the **token immediately before a
 * dash** counts, and only when that token is made of key names — `W/S`,
 * `Enter`, `↑↓`, `1-5`, `H / ESC`. Anything wider turns every Polish
 * one-letter preposition into a promised key and every sentence with a dash in
 * it into a control legend; the first draft of this did exactly that and
 * reported 66 legends where the game has 20.
 *
 * It also means `WSAD: Żagle/Ster | Q/E: Ogień L/P` — the notation the battle
 * screen carried alone until v0.84.0 — reads as **no legend at all**, which is
 * the correct answer: nothing can check a promise written in a private form.
 */

/** Keys written as words rather than as themselves, in both languages. */
const NAMED: Record<string, string> = {
  ESC: "ESC", ESCAPE: "ESC", ENTER: "ENTER",
  SPACE: "SPACE", SPACJA: "SPACE",
  TAB: "TAB", SHIFT: "SHIFT", CTRL: "CTRL", BACKSPACE: "BACKSPACE",
  DELETE: "DELETE", DEL: "DELETE",
  PGUP: "PAGE_UP", PGDN: "PAGE_DOWN", PAGEUP: "PAGE_UP", PAGEDOWN: "PAGE_DOWN",
};

/** Phaser's word for a number-row key, reduced to the key itself. */
const WORD_DIGIT: Record<string, string> = {
  ZERO: "0", ONE: "1", TWO: "2", THREE: "3", FOUR: "4",
  FIVE: "5", SIX: "6", SEVEN: "7", EIGHT: "8", NINE: "9",
};

const ARROW: Record<string, string> = {
  "←": "LEFT", "→": "RIGHT", "↑": "UP", "↓": "DOWN",
};

/**
 * A key as Phaser names it, reduced to the spelling this module speaks.
 *
 * `keydown-ONE` and a `1` on the screen are the same key on the same keyboard,
 * and a report that says "1 promised, ONE bound" is measuring its own spelling.
 */
export function normaliseKey(name: string): string {
  const upper = name.toUpperCase();
  return WORD_DIGIT[upper] ?? NAMED[upper] ?? upper;
}

/** The placeholder a legend writes where the number of rows decides the range. */
export const DIGITS_PLACEHOLDER = "{{digits}}";

/** Phaser's names for the number row, in order: `DIGIT_KEYS[0]` is `1`. */
export const DIGIT_KEYS = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"] as const;

/**
 * The digits a list of `n` rows answers to, written the way a legend writes
 * them: `1` for one row, `1-4` for four, never past `9`.
 *
 * A fixed `1-9 — answer` over a governor offering four options promised five
 * keys that did nothing, and a fixed `1-4` over a spoils list that grows to
 * five rows with three letters of marque named a row it could not reach
 * (v0.96.0). The range is a fact about the list, so it is counted from it.
 */
export function digitRange(n: number): string {
  const top = Math.min(DIGIT_KEYS.length, Math.max(1, Math.floor(n)));
  return top === 1 ? "1" : `1-${top}`;
}

/** Em dash, en dash, or a spaced hyphen — the three a legend is written with. */
const DASH = /[—–]|\s-\s/;

/**
 * The keys one `X/Y — meaning` token names, or null if it is not such a token.
 *
 * `null` and `[]` are different answers: `lukę` is not a key token at all,
 * while a token of arrows alone is one that happens to name no letter.
 */
function keysInToken(token: string): string[] | null {
  const trimmed = token.trim();
  // Long enough for `H / ESC / SPACJA / kliknij`, short enough that a clause
  // of prose never reaches this far.
  if (trimmed.length === 0 || trimmed.length > 40) return null;

  // `{{digits}}` is a range counted at draw time from the rows on the screen
  // (`digitRange`). Read unfilled, as the locale table holds it, it promises
  // every digit a list could ever be given — the widest it can be drawn.
  if (trimmed === DIGITS_PLACEHOLDER) return ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  // `1-5` names every number in the range and nothing else.
  const range = /^([0-9])\s*-\s*([0-9])$/.exec(trimmed);
  if (range) {
    const out: string[] = [];
    for (let n = Number(range[1]); n <= Number(range[2]); n++) out.push(String(n));
    return out;
  }

  const keys: string[] = [];
  for (const part of trimmed.split("/")) {
    const piece = part.trim();
    if (piece.length === 0) continue;
    // A run of arrows is one token: `↑↓` means both.
    if ([...piece].every(ch => ARROW[ch])) {
      for (const ch of piece) keys.push(ARROW[ch]);
      continue;
    }
    const named = NAMED[piece.toUpperCase()];
    if (named) { keys.push(named); continue; }
    if (piece.length === 1 && /[a-zA-Z0-9]/.test(piece)) { keys.push(piece.toUpperCase()); continue; }
    // Something that is not a key rides along: `H / ESC / SPACJA / kliknij`
    // ends in a verb, because clicking is one of the ways to close the manual.
  }
  // One key in the group is enough to make it a legend entry. None at all is
  // prose that happens to stand before a dash.
  return keys.length > 0 ? keys : null;
}

/** The token standing immediately before a dash: the last word of the chunk. */
function tokenBeforeDash(chunk: string): string {
  const parts = chunk.split(/\s{2,}/);           // legends separate entries by a gap
  const tail = parts[parts.length - 1] ?? "";
  const words = tail.trim().split(/\s+/);
  const last = words[words.length - 1] ?? "";
  // `H / ESC` and `Q / W / E` are written with spaces around the slashes, so a
  // trailing `/` on the word before means the group runs on.
  let i = words.length - 1;
  let token = last;
  while (i >= 2 && words[i - 1] === "/") { token = `${words[i - 2]}/${token}`; i -= 2; }
  return token;
}

export type LegendEntry = { token: string; keys: string[] };

/**
 * A token that is one digit and nothing else: `8` in `8 — Detale`.
 *
 * On its own it is a **number**, not a key — a row of a numbered list, or a
 * quantity in a sentence. It is a key only on a line that is already naming
 * keys, which is what `legendEntries` uses this for.
 */
const BARE_DIGIT = /^[0-9]$/;

/**
 * Every `key — meaning` entry on the line, in order.
 *
 * A **lone digit before a dash counts only where something else on the line is
 * a key.** Until v0.96.0 it always counted, and the fourteen rows of the zoom
 * setting — `8 — Detale`, `9 — Bardzo blisko` — were read as a promise that
 * those keys do something on the quartermaster's screen; so was `za 2–4× cenę`
 * in the middle of a paragraph of the manual. The rows 1–7 hid inside the
 * `1-7 — karta` above them, which is why only two of the nine were ever
 * reported. A range (`1-5`) and a digit standing among other keys are
 * untouched: a screen that answers to a number still has to say so.
 */
export function legendEntries(line: string): LegendEntry[] {
  const chunks = line.split(DASH);
  const out: LegendEntry[] = [];
  for (let i = 0; i < chunks.length - 1; i++) {
    const token = tokenBeforeDash(chunks[i]);
    const keys = keysInToken(token);
    if (keys) out.push({ token, keys });
  }
  if (out.every(e => BARE_DIGIT.test(e.token.trim()))) return [];
  return out;
}

/** Every key the line names. */
export function promisedKeys(line: string): string[] {
  const found = new Set<string>();
  for (const entry of legendEntries(line)) for (const key of entry.keys) found.add(key);
  return [...found].sort();
}

/**
 * Is this line a control legend?
 *
 * Two entries, because one `X — meaning` is a label — `[ ENTER — zacznij
 * kolejną karierę ]` is a button with its key on it, not a legend — and every
 * legend in this game names at least two keys.
 */
export function isLegend(line: string): boolean {
  return legendEntries(line).length >= 2;
}

/** Every key named across a screenful of lines. */
export function promisedAcross(lines: string[]): string[] {
  const all = new Set<string>();
  for (const line of lines) for (const key of promisedKeys(line)) all.add(key);
  return [...all].sort();
}
