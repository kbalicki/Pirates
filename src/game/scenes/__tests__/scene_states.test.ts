import { describe, it, expect } from "vitest";

// ===========================================================================
// A recipe per scene is fewer than the scene's states (v0.94.0)
// ===========================================================================

/**
 * Two tools walk this game's screens: `scripts/audit-layout.mjs` measures
 * where the ink lands, `scripts/probe-keys.mjs` measures what the keyboard
 * does. Both carried their own copy of the list of ways in, and both lists
 * named **a scene**.
 *
 * A screen is not a scene. It is a scene **in a state**: `PortScene` is ten
 * counters behind one key, `OptionsMenuScene` seven tabs, `HelpScene` five
 * pages of the manual. Sixteen recipes covered thirty-two states, and the
 * audit's `RAZEM: 0` was an answer about half of them. Opened out, the first
 * run found the quartermaster's tab drawing the whole release history at once
 * — 3 871 text objects, 55 289 px of column, **4.2 s to open and 4.0 s per
 * press of Down** — seven pairs of overlapping town names on the world chart,
 * a hint line written over the close button, and a row of glyphs 215 px wider
 * than the window that no scrolling could ever reach.
 *
 * This is the guard that keeps the list from falling behind again. It reads
 * the scene sources and `scripts/scene-recipes.mjs`, and asks three things:
 *
 *   1. the census in `STATES` is what the scene's own union says it is;
 *   2. every state has a recipe, or a written reason why it cannot have one;
 *   3. the two tools read one list, not two copies of one.
 *
 * The third is the shape v0.90.0 named: `probe-keys.mjs` carried the sentence
 * *"the same screens `audit-layout.mjs` reaches, and reached the same way"*
 * over a list that had already drifted from it in both directions.
 */

const SRC = import.meta.glob("../**/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const TOOLS = import.meta.glob("../../../../scripts/*.mjs", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const tool = (name: string): string => {
  const hit = Object.entries(TOOLS).find(([p]) => p.endsWith(name));
  if (!hit) throw new Error(`no ${name} among ${Object.keys(TOOLS).join(", ")}`);
  return hit[1];
};

const scene = (name: string): string => {
  const hit = Object.entries(SRC).find(([p]) => p.endsWith(`/${name}.ts`));
  if (!hit) throw new Error(`no ${name}.ts among ${Object.keys(SRC).length} files`);
  return hit[1];
};

const RECIPES_SRC = tool("scene-recipes.mjs");

/**
 * The census, read out of the recipes file rather than imported.
 *
 * `scene-recipes.mjs` is a tool script: it is not part of the built game, and
 * importing it into the suite would put puppeteer's world inside vitest's. The
 * declaration is plain data and reads back cleanly.
 */
function censusFromSource(): Record<string, { union: string; members: string[] }> {
  const block = RECIPES_SRC.slice(
    RECIPES_SRC.indexOf("export const STATES = {"),
    RECIPES_SRC.indexOf("export const UNMEASURABLE"),
  );
  const out: Record<string, { union: string; members: string[] }> = {};
  const re = /(\w+):\s*\{\s*union:\s*'([^']+)',\s*members:\s*\[([^\]]*)\]/g;
  for (const m of block.matchAll(re)) {
    out[m[1]] = {
      union: m[2],
      members: [...m[3].matchAll(/'([^']*)'/g)].map(x => x[1]),
    };
  }
  return out;
}

/**
 * Every `Scene[state]` (and bare `Scene`) label the recipe list defines.
 *
 * Three of them are written by helpers — `port('tavern')`, `tab('save', 5)`,
 * `help('ships', 1)` — because ten counters spelled out in full is ten places
 * for a typo. A helper's label is a template literal, which is not a string a
 * regex can read, so the helper is read instead: the template says which scene
 * it builds for, and the call sites say which states were asked for. A state
 * nobody called is still missing, which is the whole point of the guard.
 */
function labelsFromSource(): Set<string> {
  const labels = new Set<string>();
  for (const m of RECIPES_SRC.matchAll(/label:\s*(?:'([^']+)'|`([^`]+)`)/g)) {
    labels.add(m[1] ?? m[2]);
  }
  for (const m of RECIPES_SRC.matchAll(/key:\s*'(\w+)'/g)) labels.add(m[1]);

  const builders = new Map<string, string>();
  for (const m of RECIPES_SRC.matchAll(/const (\w+) = \([\s\S]*?label:[^\n]*`(\w+)\[\$\{/g)) {
    builders.set(m[1], m[2]);
  }
  for (const [fn, sceneName] of builders) {
    for (const call of RECIPES_SRC.matchAll(new RegExp(`\\b${fn}\\('([^']+)'`, "g"))) {
      labels.add(`${sceneName}[${call[1]}]`);
      labels.add(sceneName);
    }
  }
  return labels;
}

function unmeasurableFromSource(): Set<string> {
  const block = RECIPES_SRC.slice(RECIPES_SRC.indexOf("export const UNMEASURABLE"));
  return new Set([...block.matchAll(/'([A-Za-z]+\[[a-z_0-9]+\])':/g)].map(m => m[1]));
}

const CENSUS = censusFromSource();
const UNMEASURABLE = unmeasurableFromSource();

describe("the recipe list is not shorter than the screens", () => {
  it("reads a census and a recipe list at all", () => {
    expect(Object.keys(CENSUS).length).toBeGreaterThanOrEqual(6);
    expect(RECIPES_SRC).toContain("export const RECIPES");
    expect(labelsFromSource().size).toBeGreaterThanOrEqual(10);
  });

  /**
   * The census is a claim about the source, so it is checked against it.
   *
   * A list of states written beside the scenes and never compared with them is
   * a second copy of a belief, which is the v0.92.0 lesson: four comments
   * agreeing with each other said nothing about the table they named.
   */
  it.each(Object.entries(CENSUS).filter(([, c]) => c.union !== "step"))(
    "%s's census is the union in its source",
    (name, census) => {
      const src = scene(name);
      // `type X = "a" | "b"` for a named union, `private phase: "a" | "b"` for
      // one declared inline on the field.
      const decl = new RegExp(
        census.union[0] === census.union[0].toUpperCase()
          ? `type ${census.union}\\s*=\\s*([^;]+);`
          : `private ${census.union}\\s*:\\s*([^=;]+)[=;]`,
      );
      const hit = src.match(decl);
      expect(hit, `${name} declares ${census.union}`).toBeTruthy();
      const members = [...hit![1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
      expect(members.sort()).toEqual([...census.members].sort());
    },
  );

  it("CharacterCreationScene has the two steps the census claims", () => {
    const src = scene("CharacterCreationScene");
    expect(src).toContain("private step: 1 | 2 = 1;");
    expect(CENSUS.CharacterCreationScene.members).toEqual(["1", "2"]);
  });

  /**
   * Every state is either measured or excused **in writing**.
   *
   * An excuse with no reason beside it is how a screen stops being audited
   * without anybody deciding that it should: the reason has to say why the
   * state is not a screen, and the suite only checks that one is there.
   */
  it("every state has a recipe or a written reason", () => {
    const labels = labelsFromSource();
    const missing: string[] = [];
    for (const [name, census] of Object.entries(CENSUS)) {
      census.members.forEach((member, i) => {
        const label = i === 0 ? name : `${name}[${member}]`;
        if (labels.has(label)) return;
        if (UNMEASURABLE.has(label)) return;
        missing.push(label);
      });
    }
    expect(missing).toEqual([]);
  });

  it("a reason is a sentence, not a shrug", () => {
    expect(UNMEASURABLE.size).toBeGreaterThan(0);
    const block = RECIPES_SRC.slice(RECIPES_SRC.indexOf("export const UNMEASURABLE"));
    for (const label of UNMEASURABLE) {
      const hit = block.match(new RegExp(`'${label.replace(/[[\]]/g, "\\$&")}':\\s*\\n?\\s*'([^']+)'`));
      expect(hit, `${label} says why`).toBeTruthy();
      expect(hit![1].length, `${label}'s reason is a sentence`).toBeGreaterThan(30);
    }
  });

  /**
   * One list, read twice.
   *
   * Two copies is what this release found: the audit reached `RetirementScene`
   * and the probe did not, the probe reached the division of spoils and the
   * audit did not, under a sentence in the probe saying the two agreed.
   */
  it.each(["audit-layout.mjs", "probe-keys.mjs"])("%s reads the shared list", (name) => {
    const src = tool(name);
    expect(src).toMatch(/import \{[^}]*RECIPES[^}]*\} from '\.\/scene-recipes\.mjs'/);
    expect(src, `${name} keeps no list of its own`).not.toMatch(/^const RECIPES = \[/m);
  });

  /** A tool that cannot say which state it is reporting reports a scene. */
  it.each(["audit-layout.mjs", "probe-keys.mjs"])("%s reports by label", (name) => {
    const src = tool(name);
    expect(src).toContain("labelOf(recipe)");
    expect(src, `${name} matches --only against the label too`)
      .toContain("r.key === only || labelOf(r) === only");
  });

  // =========================================================================
  // One walk, not two (v0.95.0)
  // =========================================================================

  /**
   * v0.94.0 gave the tools one list of screens and left them two copies of the
   * **walk** — the page load, the frame pump, the phase keys, the `require`
   * check. They diverged inside the hour: `probe-keys.mjs` checked `require`
   * against a text truncated at sixty characters, which is right for a diff
   * channel and wrong for a precondition, so the assault's settled screen was
   * reachable by one tool and *"unreachable in five tries"* by the other. The
   * walk is `scene-driver.mjs` now, and this is what keeps it the only one.
   */
  it.each(["audit-layout.mjs", "probe-keys.mjs"])("%s walks through the driver", (name) => {
    const src = tool(name);
    expect(src).toMatch(/import \{[^}]*openDriver[^}]*\} from '\.\/scene-driver\.mjs'/);
    expect(src, `${name} does not open a browser of its own`).not.toContain("puppeteer.launch");
    expect(src, `${name} does not import puppeteer`).not.toMatch(/^import puppeteer/m);
    expect(src, `${name} does not navigate on its own`).not.toContain("page.goto");
    expect(src, `${name} does not define its own pump`).not.toMatch(/^const pump = \(/m);
  });

  it("the driver is the only thing that opens a browser", () => {
    const drivers = Object.entries(TOOLS)
      .filter(([, src]) => src.includes("puppeteer.launch"))
      .map(([p]) => p.split("/").pop());
    // `measure-battle.mjs`, `drive.mjs` and the screenshot tools drive the
    // game without recipes at all, so they are not in this family.
    expect(drivers).toContain("scene-driver.mjs");
    expect(drivers).not.toContain("audit-layout.mjs");
    expect(drivers).not.toContain("probe-keys.mjs");
  });

  /**
   * A run nobody can afford is a run nobody does.
   *
   * The probe rebuilt the screen with a **page load** before every key: 13.4 s
   * of goto, a 3 800 ms boot wait and a pump whose frames cost about 99 ms
   * each while the first render warms. Over 39 screens and some 25 rebuilds
   * apiece that is four hours, against a checklist that says to run it before
   * every release. These are the three things that made it minutes instead,
   * and none of them is visible from the outside.
   */
  it("the driver rebuilds in the page rather than reloading", () => {
    const src = tool("scene-driver.mjs");
    expect(src, "the world is snapshotted and put back").toContain("g.registry.set('worldState'");
    expect(src, "the toggles are put back too").toContain("pc_");
    // A restart reuses the same Scene object and keeps every field.
    expect(src, "the scene is a new instance, not a restarted one")
      .toContain("g.scene.remove(wanted)");
    expect(src).toContain("g.scene.add(wanted, Ctor, false)");
    // A settle walks the same game time in fewer renders.
    expect(src).toContain("SETTLE_STEP_MS");
  });

  it("a run says where it has got to, on stderr", () => {
    expect(tool("scene-driver.mjs")).toContain("process.stderr.write");
    for (const name of ["audit-layout.mjs", "probe-keys.mjs"]) {
      expect(tool(name), `${name} prints progress`).toContain("bar.tick(labelOf(recipe))");
    }
  });
});
