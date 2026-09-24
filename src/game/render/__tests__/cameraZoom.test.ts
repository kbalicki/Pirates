import { describe, it, expect, beforeEach } from "vitest";
import {
  ZOOM_VALUES, ZOOM_LEVELS, ZOOM_MIN_VALUE, ZOOM_MAX_VALUE,
  setZoomLevel, getZoomLevel, getZoomValue, stepZoomLevel,
} from "../../settings/ZoomSetting.ts";
import { CameraController } from "../CameraController.ts";

// ===========================================================================
// A setting the camera took back (v0.97.0)
// ===========================================================================

/**
 * The spyglass has fourteen steps on the quartermaster's screen and a line
 * under them saying *"∗ Działa natychmiast"*. Choosing one wrote the setting,
 * then reached into `MainMapScene` and called `cameras.main.setZoom` — and
 * `CameraController.update()`, which runs every frame the chart is not paused,
 * pulled the camera straight back to a `zoomTarget` field that had been set
 * once in the constructor and was moved by nothing but the mouse wheel.
 *
 * Measured in the running game: set the level, poke the camera the way the
 * screen did, then step the loop for one second.
 *
 * | chosen | after the poke | one second later |
 * |---|---|---|
 * | z1 (1.5×)  | 1.5 | **6** |
 * | z3 (2.5×)  | 2.5 | **6** |
 * | z8 (6×)    | 6   | 6 |
 * | z14 (12×)  | 12  | **6** |
 *
 * Thirteen of the fourteen settings did nothing; the fourteenth is the
 * default. It held only while the menu was up, because the chart is paused
 * behind it — which is exactly why it looked as if it worked.
 *
 * The second ladder was the mouse wheel: `Math.round(zoomTarget) ± 1`, floor
 * `1`. It could not reach the six half-steps below 4× at all, it could reach
 * 1× which is not a setting and is wider than the manual's stated 1,5×, and
 * it never wrote the level down, so the screen kept showing the old row.
 *
 * There is one ladder now: `getZoomValue()`, read by the camera every frame.
 */

/** Only what `CameraController` touches. */
function fakeCamera(zoom = 1) {
  return {
    zoom,
    scrollX: 0, scrollY: 0, width: 800, height: 600,
    setZoom(v: number) { this.zoom = v; return this; },
    setBounds() { return this; },
    shake() { return this; },
  };
}

/** Run the controller for `n` frames, the way the chart's update loop does. */
function play(ctrl: CameraController, n: number) {
  for (let i = 0; i < n; i++) ctrl.update();
}

beforeEach(() => setZoomLevel("z8"));

// ---------------------------------------------------------------------------

describe("the chart goes where the setting says", () => {
  it("reaches every one of the fourteen steps and stays there", () => {
    const stuck: string[] = [];
    for (const level of ZOOM_LEVELS) {
      const cam = fakeCamera();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctrl = new CameraController(cam as any);
      setZoomLevel(level);
      play(ctrl, 60);                       // one second of the chart running
      if (Math.abs(cam.zoom - ZOOM_VALUES[level]) > 0.001) {
        stuck.push(`${level}: wanted ${ZOOM_VALUES[level]}, got ${cam.zoom}`);
      }
    }
    expect(stuck, "these settings the camera took back").toEqual([]);
  });

  it("opens at the stored setting rather than at a default", () => {
    setZoomLevel("z1");
    const cam = fakeCamera(99);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new CameraController(cam as any);
    expect(cam.zoom).toBe(ZOOM_VALUES.z1);
  });

  it("needs no poke at the camera from outside", () => {
    // What the quartermaster's screen used to do, and what undid it.
    const cam = fakeCamera(ZOOM_VALUES.z8);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctrl = new CameraController(cam as any);
    setZoomLevel("z14");
    play(ctrl, 1);
    expect(cam.zoom).toBeGreaterThan(ZOOM_VALUES.z8);
    play(ctrl, 59);
    expect(cam.zoom).toBe(ZOOM_VALUES.z14);
  });
});

// ---------------------------------------------------------------------------

describe("the wheel walks the same ladder", () => {
  it("steps one setting at a time, in both directions", () => {
    setZoomLevel("z8");
    expect(stepZoomLevel(1)).toBe("z9");
    expect(stepZoomLevel(-1)).toBe("z8");
    expect(stepZoomLevel(-1)).toBe("z7");
  });

  it("reaches the half steps the rounded wheel could not", () => {
    // z1 1.5, z3 2.5, z5 3.5 — `Math.round` skipped all three.
    setZoomLevel("z6");
    const seen: number[] = [];
    for (let i = 0; i < 10; i++) seen.push(ZOOM_VALUES[stepZoomLevel(-1)]);
    expect(seen).toContain(3.5);
    expect(seen).toContain(2.5);
    expect(seen).toContain(1.5);
  });

  it("stops at the ends instead of leaving the ladder", () => {
    setZoomLevel("z1");
    for (let i = 0; i < 5; i++) stepZoomLevel(-1);
    expect(getZoomValue()).toBe(ZOOM_MIN_VALUE);
    expect(getZoomValue()).toBe(1.5);           // never 1, which is not a step
    setZoomLevel("z14");
    for (let i = 0; i < 5; i++) stepZoomLevel(1);
    expect(getZoomValue()).toBe(ZOOM_MAX_VALUE);
  });

  it("writes the level down, so the screen shows the row the player is on", () => {
    setZoomLevel("z8");
    stepZoomLevel(1);
    expect(getZoomLevel()).toBe("z9");
  });
});

// ---------------------------------------------------------------------------

const GAME_SOURCES = import.meta.glob("../../**/*.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

describe("one thing moves the chart's zoom", () => {
  it("has no second caller of setZoom on the chart's camera", () => {
    const pokes = Object.entries(GAME_SOURCES)
      .filter(([path]) => !path.includes("__tests__") && !path.includes("CameraController.ts"))
      .filter(([, src]) => /cameras\.main\.setZoom\s*\(/.test(src))
      .map(([path]) => path);
    expect(pokes, "these set the camera's zoom behind the controller's back").toEqual([]);
  });

  it("states the range once", () => {
    // `ZOOM_MIN`/`ZOOM_MAX` used to be typed into CameraController as 1 and 12
    // beside a table that says 1.5 and 12.
    const src = Object.entries(GAME_SOURCES)
      .find(([path]) => path.includes("CameraController.ts"))?.[1] ?? "";
    expect(src).not.toMatch(/ZOOM_MIN\s*=|ZOOM_MAX\s*=/);
    expect(ZOOM_MIN_VALUE).toBe(1.5);
    expect(ZOOM_MAX_VALUE).toBe(12);
  });
});
