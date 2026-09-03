import { describe, it, expect } from "vitest";
import { advanceTime, tickBoundaryCrossed } from "../TimeSystem.ts";
import { hourBoundaryCrossed } from "../CrewConsumptionSystem.ts";
import type { GameTime } from "../../model/WorldState.ts";

// ===========================================================================
// TimeSystem — the clock, and the periodic gates hung off it
// ===========================================================================
//
// `tickBoundaryCrossed` exists because of a bug worth spelling out. Every
// periodic system used `world.time.tick % INTERVAL === 0`, which is correct for
// a clock that ticks in whole numbers. `MainMapScene` has fed the engine a
// fractional `dtTicks` (frame delta ÷ 50, times game speed — about 0.4 at
// 60 fps) for a long time, so `tick` is a float and that remainder is never
// exactly zero. NPC spawning, NPC AI and the news exchange were all silently
// dead in the running game while their own unit tests, which used integer
// ticks, went on passing.

const t0 = (over: Partial<GameTime> = {}): GameTime =>
  ({ day: 1, hour: 0, minute: 0, tick: 0, ...over });

describe("advanceTime", () => {
  it("carries minutes into hours and hours into days", () => {
    const out = advanceTime(t0({ hour: 23, minute: 59 }), 1);
    expect(out.day).toBe(2);
    expect(out.hour).toBe(0);
    expect(out.minute).toBe(0);
  });

  it("keeps a fractional tick count, which is the whole problem", () => {
    const out = advanceTime(t0(), 0.4);
    expect(out.tick).toBeCloseTo(0.4, 10);
    expect(Number.isInteger(out.tick)).toBe(false);
  });
});

describe("hourBoundaryCrossed", () => {
  it("is true across an hour and across a day", () => {
    expect(hourBoundaryCrossed(t0({ hour: 3 }), t0({ hour: 4 }))).toBe(true);
    expect(hourBoundaryCrossed(t0({ day: 1, hour: 23 }), t0({ day: 2, hour: 23 }))).toBe(true);
  });

  it("is false inside the same hour", () => {
    expect(hourBoundaryCrossed(t0({ hour: 3, minute: 1 }), t0({ hour: 3, minute: 59 }))).toBe(false);
  });
});

describe("tickBoundaryCrossed", () => {
  it("fires on the frame that steps over the interval", () => {
    expect(tickBoundaryCrossed(59.8, 60.2, 60)).toBe(true);
  });

  it("does not fire on a frame inside the interval", () => {
    expect(tickBoundaryCrossed(60.2, 60.6, 60)).toBe(false);
  });

  it("fires exactly once per interval across a run of fractional frames", () => {
    let tick = 0;
    let fired = 0;
    // 400 frames of 0.4 ticks = 160 ticks = two whole 60-tick intervals plus
    // change, so the gate must fire twice: at 60 and at 120.
    for (let i = 0; i < 400; i++) {
      const next = tick + 0.4;
      if (tickBoundaryCrossed(tick, next, 60)) fired++;
      tick = next;
    }
    expect(fired).toBe(2);
  });

  it("fires the same number of times whatever the frame rate", () => {
    const run = (dt: number) => {
      let tick = 0;
      let fired = 0;
      while (tick < 300) {
        const next = tick + dt;
        if (tickBoundaryCrossed(tick, next, 60)) fired++;
        tick = next;
      }
      return fired;
    };
    expect(run(0.4)).toBe(run(1));
    expect(run(0.4)).toBe(run(2.5));
  });

  it("still fires on a frame long enough to skip a whole interval", () => {
    // A stall, or a fast-forward: the gate must not be missed just because the
    // clock jumped clean over the multiple. `% N === 0` misses these too.
    expect(tickBoundaryCrossed(10, 200, 60)).toBe(true);
  });

  it("behaves the old way for an integer clock", () => {
    expect(tickBoundaryCrossed(59, 60, 60)).toBe(true);
    expect(tickBoundaryCrossed(60, 61, 60)).toBe(false);
  });

  it("staggers by offset without changing the period", () => {
    const run = (offset: number) => {
      let tick = 0;
      const at: number[] = [];
      while (tick < 200) {
        const next = tick + 0.4;
        if (tickBoundaryCrossed(tick, next, 20, offset)) at.push(Math.round(next));
        tick = next;
      }
      return at;
    };
    const a = run(0);
    const b = run(7);
    expect(a.length).toBe(b.length);
    expect(a[0]).not.toBe(b[0]);
  });

  it("does not fire on a frame that advanced nothing", () => {
    expect(tickBoundaryCrossed(60, 60, 60)).toBe(false);
  });

  it("treats a zero interval as every frame rather than dividing by it", () => {
    expect(tickBoundaryCrossed(1, 1.4, 0)).toBe(true);
  });
});
