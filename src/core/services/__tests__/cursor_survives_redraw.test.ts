import { describe, it, expect } from "vitest";

// ===========================================================================
// A redraw is not a reason to move the cursor (v0.80.0)
// ===========================================================================

/**
 * Three lists in this game are navigated by pressing an arrow key, and none of
 * them could be navigated at all.
 *
 * `PortScene.switchView` and `OptionsMenuScene.switchTab` both rebuild the
 * screen and both set the cursor back to the first row — and that is also how
 * a list moves its cursor: increment the index, redraw. So every press put it
 * straight back where it started. The merchant's counter, the shipyard's list
 * of hulls and the quartermaster's settings all print *"up/down — Select"* in
 * their hint line, and `selectedIndex = 0` has been inside `switchView` since
 * the initial commit.
 *
 * It was found on the running game, not by reading: three presses of Down on
 * Havana's counter leave the cursor on sugar cane, while the port menu one
 * screen back — which redraws through `updateActionSelection` and never
 * through `switchView` — moves two rows on two presses. That is why the port
 * menu felt right and every list screen ended up driven by mouse buttons.
 *
 * A scene cannot be built without Phaser, so this reads the source instead, in
 * the same spirit as the three text guards: the reset must be **conditional**
 * on actually changing view. What the condition is does not matter; that there
 * is one does.
 */

const SOURCES = import.meta.glob("../../../game/scenes/*.ts", {
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

function find(name: string): string {
  for (const src of Object.values(SOURCES)) {
    if (src.includes(name)) return src;
  }
  return "";
}

describe("the cursor survives a redraw of the screen it is on", () => {
  it("does not let PortScene.switchView reset the row unconditionally", () => {
    const body = bodyOf(find("private switchView("), "private switchView(");
    expect(body, "switchView not found").not.toBe("");
    // The shape of the defect: an assignment to zero with nothing guarding it.
    expect(body).not.toMatch(/\n\s*this\.selectedIndex = 0;/);
    expect(body).toMatch(/selectedIndex/);
  });

  it("does not let OptionsMenuScene.switchTab reset the row unconditionally", () => {
    const body = bodyOf(find("private switchTab("), "private switchTab(");
    expect(body, "switchTab not found").not.toBe("");
    expect(body).not.toMatch(/\n\s*this\.selectedItemIndex = 0;/);
    expect(body).toMatch(/selectedItemIndex/);
  });

  it("keeps every list that moves by redrawing in the two methods above", () => {
    // If a third screen starts moving a cursor by redrawing itself, it has to
    // go through one of these two — or carry its own guard, and then this test
    // is the place to say so.
    const movers: string[] = [];
    for (const [path, src] of Object.entries(SOURCES)) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      for (const m of code.matchAll(/this\.(selected\w*Index)(\+\+|--|\s*[-+]=)/g)) {
        const after = code.slice(m.index!, m.index! + 220);
        if (!/switchView\(|switchTab\(|update\w*Selection\(/.test(after)) {
          movers.push(`${path.replace(/^.*\/scenes\//, "")}: ${m[1]}`);
        }
      }
    }
    expect(movers, "a cursor moved without a redraw anybody knows about").toEqual([]);
  });
});
