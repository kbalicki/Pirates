import { describe, it, expect } from "vitest";
import { restoreCursor, offsetRevealing } from "../menuCursor.ts";

// ===========================================================================
// A window that does not follow the cursor is a list navigated blind (v0.82.0)
// ===========================================================================

/**
 * v0.80.0 fixed a cursor that a redraw kept putting back on row zero. This is
 * the other half of the same screen: the cursor moves, and nothing else does.
 *
 * The quartermaster's settings tab is twenty-five rows long and its window
 * holds about seventeen. Ten presses of Down and the marker is somewhere below
 * the mask, with nothing on the screen to say which row Enter would take.
 * Worse, every press redrew the tab and `switchTab` put the scroll back to the
 * top, so scrolling by hand could not rescue it either. Found on a screenshot,
 * which is where all three of the last releases' cursor defects were found.
 *
 * The second rule here came off the same sweep in the village. A successful
 * barter puts its own row on a cooldown, and the screen answered *the first
 * row he can use* — which is **send a war party against the neighbouring
 * town**. The captain who had pressed Enter to trade was left with the cursor
 * on a raid.
 */

type Row = "trade" | "war" | "leave";

describe("a rebuilt menu gives the captain back the row he was on", () => {
  it("opens on the first row he can actually use", () => {
    const rows = [
      { action: "trade" as Row, disabled: true },
      { action: "war" as Row },
      { action: "leave" as Row },
    ];
    expect(restoreCursor(rows, null)).toBe(1);
  });

  it("keeps his row when the transaction did not close it", () => {
    const rows = [
      { action: "trade" as Row },
      { action: "war" as Row },
      { action: "leave" as Row },
    ];
    expect(restoreCursor(rows, "war")).toBe(1);
  });

  it("never answers a closed row with another transaction", () => {
    // The village, exactly as it stands after a barter: the trade row has gone
    // onto its cooldown and the war party is the first thing still open. The
    // old rule put the cursor there, one press of Enter from a raid the
    // captain never asked for.
    const afterBarter = [
      { action: "trade" as Row, disabled: true },
      { action: "war" as Row },
      { action: "leave" as Row },
    ];
    const landed = restoreCursor(afterBarter, "trade");
    expect(afterBarter[landed].action).toBe("leave");
    expect(afterBarter[landed].disabled).toBeFalsy();
  });

  it("falls to the way out when nothing at all is open", () => {
    const rows = [
      { action: "trade" as Row, disabled: true },
      { action: "war" as Row, disabled: true },
      { action: "leave" as Row },
    ];
    expect(restoreCursor(rows, null)).toBe(2);
    expect(restoreCursor(rows, "trade")).toBe(2);
  });

  it("starts over when the row he was on is no longer in the menu", () => {
    const rows = [{ action: "trade" as Row }, { action: "leave" as Row }];
    expect(restoreCursor(rows, "war")).toBe(0);
  });

  it("answers an empty menu without reaching past the end of it", () => {
    expect(restoreCursor<Row>([], "trade")).toBe(0);
  });
});

describe("the window follows the cursor out of it", () => {
  // A window from 100 to 400, rows 24 tall, 8px of air top and bottom.
  const TOP = 100;
  const H = 300;

  it("leaves a row that is already in view exactly where it is", () => {
    expect(offsetRevealing(TOP, 50, 24, TOP, H)).toBe(TOP);
  });

  it("scrolls down by just enough to show the row and its margin", () => {
    // A row 600 down the list, drawn at 700 with the container unscrolled.
    const offset = offsetRevealing(TOP, 600, 24, TOP, H);
    expect(offset + 600 + 24).toBe(TOP + H - 8);
    expect(offset).toBeLessThan(TOP);
  });

  it("scrolls back up when the cursor climbs above the window", () => {
    // Scrolled 500 down, cursor walks back to the second row.
    const offset = offsetRevealing(TOP - 500, 22, 24, TOP, H);
    expect(offset + 22).toBe(TOP + 8);
  });

  it("is idempotent — revealing a revealed row moves nothing", () => {
    const once = offsetRevealing(TOP, 600, 24, TOP, H);
    expect(offsetRevealing(once, 600, 24, TOP, H)).toBe(once);
  });
});

// ---------------------------------------------------------------------------
// The scenes, read as source: the rule has to be the one actually in the file.
// ---------------------------------------------------------------------------

const SCENES = import.meta.glob("../../../game/scenes/*.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

function bodyOf(src: string, signature: string): string {
  const at = src.indexOf(signature);
  if (at < 0) return "";
  let depth = 0;
  for (let i = src.indexOf("{", at); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(at, i + 1);
  }
  return "";
}

function scene(name: string): string {
  for (const [path, src] of Object.entries(SCENES)) {
    if (path.includes(name)) return src;
  }
  return "";
}

describe("the screens that scroll keep the rule in the file", () => {
  it("does not let switchTab put the scroll back to the top", () => {
    const body = bodyOf(scene("OptionsMenuScene"), "private switchTab(");
    expect(body, "switchTab not found").not.toBe("");
    // The defect's shape: the container snapped home on every redraw, and a
    // cursor move *is* a redraw.
    expect(body).not.toMatch(/contentContainer\.y = this\.contentBaseY;/);
    expect(body).toMatch(/contentContainer\.y = keptScroll;/);
  });

  it("measures the drawn content against the container, not its home", () => {
    const body = bodyOf(scene("OptionsMenuScene"), "private getContentHeight(");
    expect(body, "getContentHeight not found").not.toBe("");
    // `getBounds()` answers in world space and so already carries the scroll.
    // Subtracting the container's *unscrolled* y made the content measure
    // shorter by however far the captain had scrolled, and the floor rose to
    // meet him: the changelog at the foot of the settings tab could not be
    // reached.
    expect(body).not.toMatch(/- this\.contentBaseY/);
    expect(body).toMatch(/- this\.contentContainer\.y/);
  });

  it("brings the focused settings row into the window", () => {
    const body = bodyOf(scene("OptionsMenuScene"), "private renderSettings(");
    expect(body).toMatch(/this\.revealRow\(/);
  });

  it("keeps the per-tab hint out of the thing that scrolls", () => {
    const src = scene("OptionsMenuScene");
    // It used to be drawn into `contentContainer` at the window's bottom
    // edge, which put it on top of the last rows of the zoom list — and once
    // the tab scrolled it would have ridden up and down with them.
    expect(src).not.toMatch(/contentContainer\.add\(settingsHint\)/);
    expect(src).toMatch(/this\.tabHint = this\.add\.text/);
  });

  it("does not let the village pick its row off the first open one", () => {
    const src = scene("VillageScene");
    expect(src).not.toMatch(/selectedIndex = this\.actions\.findIndex\(a => !a\.disabled\)/);
    expect(src).toMatch(/restoreCursor\(/);
  });
});
