import { describe, it, expect } from "vitest";
import { contrastRatio, relativeLuminance, READABLE } from "../contrast.ts";

// ===========================================================================
// A hint nobody can read is a hint that is not there (v0.83.0)
// ===========================================================================

/**
 * The last four releases have been about hint lines: whether they are true
 * (v0.81.0), whether the key they name is bound (v0.81.0), whether the row
 * they describe is on the screen (v0.82.0). This one is simpler and was under
 * all of them — whether the line can be **read**.
 *
 * Measured across the game:
 *
 * | line | panel | ratio |
 * |---|---|---|
 * | `#aaaaaa` — the captain's sheet, three lines | parchment | **1.82 : 1** |
 * | `#555555` — the town panel, the battle manual | `#0a0a1a` | **2.63 : 1** |
 *
 * 1.82 is very nearly invisible. And twenty lines above the worst of the three
 * stands a comment saying exactly that — *"#aaaaaa on parchment is barely
 * there"* — written in v0.47.0 about the line it introduced, while the other
 * branch of its own ternary and the key legend forty lines below kept the
 * colour. **A comment that states a finding is not a fix**: the third time
 * that shape has been found in five releases, after `VillageSystem` (v0.79.0)
 * and `sound.hint` (v0.81.0).
 *
 * Two colours now, one per kind of panel, measured here rather than trusted.
 */

const PANEL_DARK = "#0a0a1a";
const PANEL_PARCHMENT = "#efe3c4";
const PANEL_WHITE = "#ffffff";
const HINT_ON_DARK = "#9a8a6a";
const HINT_ON_LIGHT = "#6a5a42";

describe("the contrast arithmetic", () => {
  it("puts black and white 21 apart and a colour on itself at 1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#9a8a6a", "#9a8a6a")).toBeCloseTo(1, 6);
  });

  it("does not care which colour is named first", () => {
    expect(contrastRatio("#123456", "#fedcba")).toBeCloseTo(
      contrastRatio("#fedcba", "#123456"), 9);
  });

  it("reads a luminance between nothing and everything", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 6);
    expect(relativeLuminance("#808080")).toBeGreaterThan(0);
    expect(relativeLuminance("#808080")).toBeLessThan(0.5);
  });

  it("refuses a colour that is not a colour", () => {
    expect(() => relativeLuminance("#abc")).toThrow();
    expect(() => relativeLuminance("red")).toThrow();
  });
});

describe("every hint colour the game uses clears the floor", () => {
  it("reads on the near-black panels", () => {
    expect(contrastRatio(HINT_ON_DARK, PANEL_DARK)).toBeGreaterThanOrEqual(READABLE);
  });

  it("reads on parchment and on white", () => {
    expect(contrastRatio(HINT_ON_LIGHT, PANEL_PARCHMENT)).toBeGreaterThanOrEqual(READABLE);
    expect(contrastRatio(HINT_ON_LIGHT, PANEL_WHITE)).toBeGreaterThanOrEqual(READABLE);
  });

  it("pins what was wrong, so nobody puts it back", () => {
    // The two colours this release removed. Kept as numbers because "it looked
    // faint" is not a finding and "1.82 : 1" is.
    expect(contrastRatio("#aaaaaa", PANEL_PARCHMENT)).toBeLessThan(2);
    expect(contrastRatio("#555555", PANEL_DARK)).toBeLessThan(3);
  });
});

// ---------------------------------------------------------------------------
// The scenes, read as source.
// ---------------------------------------------------------------------------

const SCENES = import.meta.glob("../../../game/scenes/*.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

const STYLE = import.meta.glob("../../../game/ui/textStyle.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

describe("no screen picks its own grey for a hint", () => {
  it("keeps the two colours in one place", () => {
    const src = Object.values(STYLE)[0] ?? "";
    expect(src, "textStyle not found").not.toBe("");
    expect(src).toMatch(new RegExp(`HINT_ON_DARK = "${HINT_ON_DARK}"`));
    expect(src).toMatch(new RegExp(`HINT_ON_LIGHT = "${HINT_ON_LIGHT}"`));
  });

  it("draws every hint line through one of them", () => {
    // A **grey** is the shape of this defect: somebody reaching for "quieter
    // than the text above it" and landing wherever. The duel's control lines
    // are `#ffcc88` and `#88ddcc` because the strike and the parry are colour
    // coded, which is a decision, not a guess — so this looks only at greys.
    const isGrey = (hex: string): boolean => {
      const n = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      return Math.max(...n) - Math.min(...n) <= 24;
    };
    const offenders: string[] = [];
    for (const [path, src] of Object.entries(SCENES)) {
      for (const m of src.matchAll(/t\("[\w.]*(?:hint|controls)[\w.]*"/g)) {
        // The rest of the same `add.text(` call, and no further: a window that
        // runs on into the next one reads its colour as this one's, which is
        // how the first draft of this scan accused the manual's gold title.
        const nextCall = src.indexOf("this.add.text(", m.index!);
        const end = nextCall === -1 ? src.length : nextCall;
        const tail = src.slice(m.index!, Math.min(end, m.index! + 200));
        const literal = tail.match(/color: "(#[0-9a-fA-F]{6})"/);
        if (literal && isGrey(literal[1])) {
          offenders.push(`${path.replace(/^.*\/scenes\//, "")}: ${literal[1]}`);
        }
      }
    }
    expect(offenders, "a hint line with a grey chosen by eye").toEqual([]);
  });
});
