#!/usr/bin/env node
/**
 * One table per dimension, for every number in the game that names its own unit.
 *
 * Three releases running found the same shape: two numbers describing one
 * thing, standing apart, drifting, with a comment claiming they were the same.
 * v0.84.0 in the tab digits, v0.85.0 in the disengage threshold, v0.86.0 in
 * the grapnel's reach (30 against a boarding station of 40, under a comment
 * that said "close enough to grapple"). Each was found by hand, one release at
 * a time. This is the sweep that finds them all at once.
 *
 * A dimension is whatever the NAME says it is — `_DAYS`, `_TICKS`, `_TONS`,
 * `_RANGE`/`_RADIUS`/`_DIST`, `_GOLD`/`_PRICE`, `_CREW`, `_YEARS`,
 * `_SHARE`/`_RATIO`. Nothing else in this repo records a unit, which is the
 * whole problem. Bare literals written into a variable whose name declares a
 * dimension are listed too, marked `*`: that is where v0.86.0's forty was, and
 * v0.87.0's `ENCOUNTER_RANGE = 18`.
 *
 * Usage:
 *   node scripts/sweep-constants.mjs            # every dimension
 *   node scripts/sweep-constants.mjs px days    # only these
 *
 * What to do with the output: read one table at a time and ask of each pair of
 * neighbouring rows whether they are two names for one thing. Then read the
 * comments above them — that is where the claim lives, and the claim is what
 * goes wrong. A row in `game/` inside a dimension that `core/` reasons about
 * is a finding on its own: `core/` cannot import it, so it can only guess.
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";
const BS = String.fromCharCode(92);

const DIMS = [
  ["days", /(^|_)DAYS?($|_)/i],
  ["ticks", /(^|_)TICKS?($|_)/i],
  ["tons", /(^|_)TONS?($|_)/i],
  ["px", /(^|_)(RANGE|RADIUS|DIST|DISTANCE|CELL)($|_)/i],
  ["gold", /(^|_)(GOLD|PRICE|COST|REWARD|FEE|WAGE)($|_)/i],
  ["crew", /(^|_)(CREW|MEN|SOLDIERS|HANDS)($|_)/i],
  ["years", /(^|_)YEARS?($|_)/i],
  ["share", /(^|_)(SHARE|RATIO|FRACTION|MUL|PCT|PERCENT)($|_)/i],
];

const CONST_RE = /^\s*(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*number)?\s*=\s*(-?\d+(?:\.\d+)?)\s*;/;
const LIT_RE = /(?:^|[^.\w])([A-Za-z][A-Za-z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?)\s*[;,)]/;

function dimOfName(name) {
  for (const [d, re] of DIMS) if (re.test(name)) return d;
  return null;
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e !== "__tests__" && e !== "node_modules") walk(p, out);
    } else if (e.endsWith(".ts")) out.push(p);
  }
  return out;
}

const wanted = process.argv.slice(2);
const entries = [];

for (const f of walk(ROOT)) {
  const rel = f.split(BS).join("/");
  const lines = readFileSync(f, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const code = raw.split("//")[0];
    const trailing = raw.includes("//") ? raw.slice(raw.indexOf("//") + 2).trim() : "";
    const m = code.match(CONST_RE);
    if (m) {
      const dim = dimOfName(m[1]);
      if (dim) {
        entries.push({ dim, lit: false, name: m[1], value: Number(m[2]), file: rel, line: i + 1, note: trailing });
      }
      continue;
    }
    const l = code.match(LIT_RE);
    if (!l) continue;
    const dim = dimOfName(l[1]);
    const v = Number(l[2]);
    if (dim && Math.abs(v) >= 3) {
      entries.push({ dim, lit: true, name: l[1], value: v, file: rel, line: i + 1, note: trailing });
    }
  }
}

const byDim = {};
for (const e of entries) (byDim[e.dim] ??= []).push(e);

let shown = 0;
for (const [dim] of DIMS) {
  const list = byDim[dim];
  if (!list) continue;
  if (wanted.length > 0 && !wanted.includes(dim)) continue;
  shown++;
  list.sort((a, b) => a.value - b.value);
  const layers = new Set(list.map(e => (e.file.startsWith("src/core/") ? "core" : "game")));
  console.log(`\n=== ${dim} (${list.length})${layers.size > 1 ? "  — written in BOTH layers" : ""} ===`);
  for (const e of list) {
    const where = e.file.replace("src/core/", "core/").replace("src/game/", "GAME/");
    console.log(
      `${String(e.value).padStart(9)}  ${e.lit ? "*" : " "} ${e.name.padEnd(28)} ${where}:${e.line}` +
      (e.note ? `  // ${e.note.slice(0, 64)}` : ""),
    );
  }
}

console.log(`\n${entries.length} numbers in ${shown} dimensions. ` +
  `A row marked * is a bare literal; a table marked "BOTH layers" is one core/ cannot reason about.`);
