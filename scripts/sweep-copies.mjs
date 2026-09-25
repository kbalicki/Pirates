#!/usr/bin/env node
/**
 * Numbers a screen typed that the engine already owns (v0.99.6).
 *
 * Four releases running found one shape: a rule of `core/` restated on a
 * screen in `src/game/`, as a bare literal, and restated wrong. The battle's
 * firing arc drawn at a typed `Math.PI / 3` against the engine's ±30°
 * (v0.98.3); the reload bar measured against a typed `180`, the best cadence
 * in the game (v0.98.4); the town panel's reputation ladder at 50 / -50
 * against the engine's 60 / -60 (v0.99.5); the price of losing the fight at a
 * baited dig, a quarter of the purse, written only in the map's duel callback
 * (v0.99.6).
 *
 * `sweep-constants.mjs` cannot see any of them: it reads NAMES that declare a
 * unit (`_DAYS`, `_RANGE`), and these were `maxCd`, `HALF_ARC`, `rep > 50`.
 * This sweep reads VALUES instead: every literal in a declaration or a
 * comparison in `src/game` that equals an exported numeric constant of
 * `core/`, with the constants it could be a copy of.
 *
 * It is a reading aid, not a gate. A value like 20 or 0.3 names a dozen
 * constants and most hits are coincidence - layout, colours, easing. What it
 * does is put every candidate in one list, so a person asks of each line: is
 * this the engine's number, restated? The v0.99.5 run: about eighty lines,
 * one real finding (the reputation ladder) and three small ones.
 *
 * Usage:
 *   node scripts/sweep-copies.mjs              # src/game/scenes
 *   node scripts/sweep-copies.mjs --all        # all of src/game
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ALL = process.argv.includes("--all");
const BS = String.fromCharCode(92);
const norm = p => p.split(BS).join("/");

function walk(dir) {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "__tests__" ? [] : walk(p);
    return p.endsWith(".ts") ? [p] : [];
  });
}

/** Values too common to mean anything on their own. */
const TRIVIAL = new Set([0, 1, 2, -1, 3, 4, 5, 10, 100, 0.5, 1000]);

const core = new Map();
for (const f of walk("src/core")) {
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*export\s+const\s+([A-Z][A-Z0-9_]+)(?:\s*:\s*number)?\s*=\s*(-?\d+(?:\.\d+)?)\s*;/);
    if (!m) continue;
    const v = Number(m[2]);
    if (TRIVIAL.has(v)) continue;
    const name = `${m[1]} (${norm(f).split("/").pop()})`;
    core.set(v, [...(core.get(v) ?? []), name]);
  }
}

/** A line that decides something: a declaration, a comparison, a clamp. */
const DECIDES = /(const\s+[A-Za-z_]\w*\s*=|[<>]=?|===|!==|\bMath\.(min|max)\()/;
/** A line that draws or lays out, which is where most coincidences live. */
const DRAWS = /setDepth|0x[0-9a-f]|fillStyle|lineStyle|fill(Rect|Circle|Triangle|RoundedRect)|stroke|txt\(|fontSize|setPosition|setOrigin|setScale|setAlpha|\balpha\b|duration|delayedCall|\.add\.|padStart|toFixed|rgba|#[0-9a-f]{3}|\b(cw|ch|pw|ph|panelW|panelH|W|H|w|h|x|y|dx|dy|left|right|top|bottom|pad|PAD|gap|GAP|col\w*|row\w*|vol|page|scroll\w*|merlons|horizon|waterline)\s*=|Math\.PI\s*\/\s*180|\* 180 \/ Math\.PI|mercY|\b\w*(X|Y|W|H|_OFFSET|OFFSET|MARGIN|_SIZE|SIZE|_EASE|Spacing)\s*=|for \(let \w+ = [^;]+;/;

const root = ALL ? "src/game" : "src/game/scenes";
const hits = [];
for (const f of walk(root)) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    if (!DECIDES.test(line) || DRAWS.test(line)) return;
    for (const m of line.matchAll(/(?<![\w.#])(-?\d+(?:\.\d+)?)(?![\w.])/g)) {
      const names = core.get(Number(m[1]));
      if (!names) continue;
      hits.push({ where: `${norm(f)}:${i + 1}`, value: m[1], names, line: line.trim() });
    }
  });
}

let file = "";
for (const h of hits) {
  const f = h.where.split(":")[0];
  if (f !== file) { console.log(`\n${f}`); file = f; }
  const shown = h.names.length > 3 ? `${h.names.slice(0, 3).join(", ")} +${h.names.length - 3}` : h.names.join(", ");
  console.log(`  :${h.where.split(":")[1].padEnd(5)} ${h.value.padStart(6)}  ${h.line.slice(0, 90)}`);
  console.log(`         could be: ${shown}`);
}
console.log(`\nRAZEM: ${hits.length} (${root})`);
