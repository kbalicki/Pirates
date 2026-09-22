#!/usr/bin/env node
/**
 * Every sentence in `core/` that makes a claim about a number.
 *
 * Three releases running, the defect was in prose rather than in code.
 * v0.87.0: a comment describing sight, in the layer that draws it, because
 * `core/` had no number to point at. v0.88.0: a number typed into a sentence
 * the player reads. v0.89.0: a comment that *enumerated its readers* and left
 * out the two that mattered. Each was found by reading, one comment at a time.
 * This is the sweep that lists them all.
 *
 * A comment is a claim when it does one of three things:
 *
 *   QUOTED    names a constant and puts a number beside it — `BLOCKADE_RADIUS`
 *             (320). That is a copy, and a copy can go stale, so this grade is
 *             **checked mechanically**: the quoted number is compared with what
 *             the constant is worth today and a mismatch is an error.
 *   COMPARED  names a constant and a comparative word — bigger, smaller,
 *             further, between, than, never, always. Both sides exist, so the
 *             sentence can be turned into an assertion by hand.
 *   COUNTED   enumerates readers or cases ("read four times", "three ways in").
 *             v0.89.0's defect was exactly this shape: four named, two missing.
 *   SPELLED   carries a number **written as a word** next to a unit or a
 *             possessive — "a town's six", "about four hundred units in a day".
 *             This grade exists because v0.90.0 found two of these and QUOTED
 *             could see neither: a spelled number is not a number, and what it
 *             describes is as often a field as a constant.
 *
 * Usage:
 *   node scripts/sweep-claims.mjs              # every grade
 *   node scripts/sweep-claims.mjs quoted       # one grade
 *   node scripts/sweep-claims.mjs --all        # include src/game/ too
 *
 * What to do with the output: QUOTED is machine-checked, so a clean run means
 * every quoted number is current. COMPARED and COUNTED are a reading list —
 * take one sentence, write the assertion it implies, and run it. The ones that
 * go red are the release.
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BS = String.fromCharCode(92);
const args = process.argv.slice(2);
const wantAll = args.includes("--all");
const grades = args.filter(a => !a.startsWith("--")).map(s => s.toUpperCase());

const COMPARATIVE = /\b(bigger|smaller|larger|wider|narrower|further|farther|closer|longer|shorter|higher|lower|more than|less than|fewer than|greater than|than|between|at least|at most|never|always|exactly|the same as|twice|half of)\b/i;
const COUNTING = /\b(two|three|four|five|six|seven|eight|nine|ten|both|each of|all (?:of )?(?:the )?(?:its|their)?\s*\w+s)\b/i;
const WORDS = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand";
const UNITS = "units?|px|pixels?|days?|tons?|men|times|points?|knots?|degrees?";
/** "four hundred units", "a town's six", "eight times" — a number as a word. */
const SPELLED_RE = new RegExp(
  `'s\\s+(?:${WORDS})\\b|\\b(?:${WORDS})(?:[- ](?:${WORDS}))*\\s+(?:${UNITS})\\b`,
  "i",
);
const CONST_MENTION = /`?\b([A-Z][A-Z0-9_]{3,})\b`?/g;
/** `NAME` (123) or NAME (123) or NAME = 123 — a value copied into prose. */
const QUOTED_RE = /`?\b([A-Z][A-Z0-9_]{3,})\b`?\s*(?:\(\s*(-?\d+(?:\.\d+)?)\s*\)|=\s*(-?\d+(?:\.\d+)?))/g;
const CONST_DECL = /^\s*(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)(?:\s*:\s*[\w<>\[\]|" ]+)?\s*=\s*(-?\d+(?:\.\d+)?)\s*(?:;|$)/;

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e !== "__tests__" && e !== "node_modules") walk(p, out);
    } else if (e.endsWith(".ts")) out.push(p);
  }
  return out;
}

const roots = wantAll ? ["src"] : ["src/core"];
const files = roots.flatMap(r => walk(r));

// ── Pass one: what every numeric constant in src/ is worth today ──────────
const values = new Map();
for (const f of walk("src")) {
  const lines = readFileSync(f, "utf8").split("\n");
  for (const raw of lines) {
    const m = raw.split("//")[0].match(CONST_DECL);
    if (m) values.set(m[1], Number(m[2]));
  }
}

// ── Pass two: the comments ────────────────────────────────────────────────
const claims = [];

for (const f of files) {
  const rel = f.split(BS).join("/");
  const lines = readFileSync(f, "utf8").split("\n");
  let block = null;   // { text, start }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    if (t.startsWith("/*")) { block = { text: [], start: i + 1 }; }
    if (block) {
      const body = t.replace(/^\/\*+/, "").replace(/\*\/$/, "").replace(/^\*\s?/, "");
      if (body) block.text.push(body);
      if (t.endsWith("*/")) { flush(block, rel, lines, i); block = null; }
      continue;
    }
    if (t.startsWith("//")) {
      // A run of consecutive line comments is one claim.
      const run = { text: [t.replace(/^\/\/\s?/, "")], start: i + 1 };
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith("//")) {
        i++; run.text.push(lines[i].trim().replace(/^\/\/\s?/, ""));
      }
      flush(run, rel, lines, i);
    }
  }
}

/** Decide whether this comment claims anything, and about what. */
function flush(block, rel, lines, endIndex) {
  const text = block.text.join(" ").replace(/\s+/g, " ").trim();
  if (text.length < 25) return;

  // What the comment sits on: the next line that declares something.
  let subject = "";
  for (let j = endIndex + 1; j < Math.min(endIndex + 4, lines.length); j++) {
    const s = lines[j].trim();
    if (!s || s.startsWith("//") || s.startsWith("*")) continue;
    subject = s.replace(/\s+/g, " ").slice(0, 72);
    break;
  }

  // QUOTED: a constant with a number written beside it.
  const quoted = [];
  for (const m of text.matchAll(QUOTED_RE)) {
    const name = m[1];
    const said = Number(m[2] ?? m[3]);
    if (!values.has(name)) continue;
    quoted.push({ name, said, is: values.get(name) });
  }

  const mentions = [...text.matchAll(CONST_MENTION)].map(m => m[1]).filter(n => values.has(n));
  const spelled = SPELLED_RE.exec(text);
  const grade = quoted.length > 0 ? "QUOTED"
    : (mentions.length > 0 && COMPARATIVE.test(text)) ? "COMPARED"
    : spelled ? "SPELLED"
    : COUNTING.test(text) && COMPARATIVE.test(text) ? "COUNTED"
    : null;
  if (!grade) return;

  claims.push({
    grade, file: rel, line: block.start, subject, text, quoted,
    mentions: [...new Set(mentions)],
    spelled: spelled ? spelled[0].trim() : "",
  });
}

// ── Report ────────────────────────────────────────────────────────────────
const ORDER = ["QUOTED", "COMPARED", "SPELLED", "COUNTED"];
let stale = 0;

for (const g of ORDER) {
  if (grades.length > 0 && !grades.includes(g)) continue;
  const list = claims.filter(c => c.grade === g);
  if (list.length === 0) continue;
  console.log(`\n=== ${g} (${list.length}) ===`);
  for (const c of list) {
    const where = c.file.replace("src/core/", "core/").replace("src/game/", "GAME/");
    const bad = c.quoted.filter(q => q.said !== q.is);
    stale += bad.length;
    console.log(`\n${where}:${c.line}  ${c.subject}`);
    console.log(`  "${c.text.slice(0, 300)}${c.text.length > 300 ? "…" : ""}"`);
    if (c.quoted.length > 0) {
      console.log("  " + c.quoted.map(q =>
        q.said === q.is ? `${q.name} ${q.said} ok` : `${q.name} SAYS ${q.said}, IS ${q.is}  <-- STALE`,
      ).join(" · "));
    } else if (c.mentions.length > 0) {
      console.log("  " + c.mentions.map(n => `${n}=${values.get(n)}`).join(" · "));
    } else if (c.spelled) {
      console.log(`  spelled: "${c.spelled}"`);
    }
  }
}

console.log(`\n${claims.length} claims in ${files.length} files. ${stale} quoted number(s) out of date.`);
process.exit(stale > 0 ? 1 : 0);
