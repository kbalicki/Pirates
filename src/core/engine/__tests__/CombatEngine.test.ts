/**
 * The sea fight, measured (v0.85.0).
 *
 * `CombatEngine` runs every battle in the game and had no test file at all
 * before this one. What that cost, in the order it was found:
 *
 *   - the enemy's helm never changed the range. `desiredDist` is worked out
 *     five ways — three archetypes and two crew-ratio overrides — and the only
 *     reader was the sail throttle, because the heading was hard-wired to
 *     `angleToPlayer + 90°`, which has no component along the line between the
 *     ships. Over 120 s, at six starting distances against all three
 *     archetypes, the range moved at most 16 px, and outward;
 *   - `?battle=` spawns the enemy at 425 px against a cannon range of 320, so
 *     the flag every release uses to look at the battle screen opened a fight
 *     in which neither ship could fire and neither ship would close: 0 shots
 *     in 120 seconds;
 *   - `ESC` was bound, was named on the screen, pushed `AttemptDisengage`, and
 *     the engine had no case for it. The state that came back was identical to
 *     a tick with no command at all;
 *   - the broadside arc was written twice. The captain's guns obeyed a ±60°
 *     dead zone and a side check; the enemy's guns obeyed a copy in the AI that
 *     had neither, and always fired the left battery.
 */
import { describe, it, expect } from "vitest";
import { CombatEngine, DISENGAGE_RANGE_MUL, HULL_CLEARANCE, type AiArchetype } from "../CombatEngine.ts";
import { bearingSide, BROADSIDE_ARC_COS } from "../../systems/CombatSystem.ts";
import type { CombatState, CombatEntityState } from "../../model/CombatState.ts";
import type { EntityId, ShipClassId, FactionId } from "../../model/ids.ts";

const SCREEN_W = 1280, SCREEN_H = 720;
/** What `SeaBattleScene` hands the engine: a quarter of the screen. */
const RANGE = SCREEN_W * 0.25;

const sources = import.meta.glob("../../../game/scenes/SeaBattleScene.ts", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const sceneSrc = Object.values(sources)[0] ?? "";

function ship(id: string, x: number, y: number, heading: number): CombatEntityState {
  return {
    id: id as EntityId, kind: "ship",
    pos: { x, y }, vel: { x: 0, y: 0 }, heading, sailLevel: 0.5,
    ship: {
      classId: "brigantine" as ShipClassId, factionId: "spain" as FactionId,
      hullHp: 80, hullMax: 80, sailsHp: 60, sailsMax: 60, cannons: 16,
      crew: { current: 30, max: 40, morale: 0.7 },
      cooldown: { left: 0, right: 0 },
    },
  };
}

/** Two hulls in the arena `SeaBattleScene` builds: three screens across. */
function arena(dist: number, crew: [number, number] = [30, 30]): CombatState {
  const w = SCREEN_W * 3, h = SCREEN_H * 3;
  const p = ship("p", w / 2, h / 2, 0);
  const e = ship("e", w / 2 + dist, h / 2, Math.PI);
  p.ship!.crew.current = crew[0];
  e.ship!.crew.current = crew[1];
  return {
    version: 1, time: { tick: 0 },
    arena: { width: w, height: h }, cannonRange: RANGE,
    wind: { dirRad: 0, strength: 0.5 },
    playerShipId: "p" as EntityId, enemyShipId: "e" as EntityId,
    entities: { p, e }, events: [],
  };
}

/**
 * Run the fight for `secs` seconds at the scene's 20 ticks a second, with the
 * captain lying to and his crew held at strength so the enemy's crew-ratio
 * override does not turn every archetype into a boarder.
 */
function sail(arch: AiArchetype, startDist: number, secs = 90, crew: [number, number] = [30, 30]) {
  const eng = new CombatEngine();
  eng.setArchetype(arch);
  let st = arena(startDist, crew);
  const dists: number[] = [];
  const sides: string[] = [];
  for (let i = 0; i < secs * 20; i++) {
    const r = eng.apply(st, [], 1);
    st = r.state;
    for (const ev of r.events) {
      if (ev.type === "CannonFired" && (ev.shipId as string) === "e") sides.push(ev.side);
    }
    // Hold the captain hove to and his crew whole: he is the fixed ruler the
    // enemy's helm is measured against.
    const p = st.entities.p!;
    st = {
      ...st,
      entities: {
        ...st.entities,
        p: { ...p, sailLevel: 0, ship: { ...p.ship!, crew: { ...p.ship!.crew, current: crew[0] } } },
      },
    };
    const E = st.entities.e!;
    dists.push(Math.hypot(E.pos.x - st.entities.p!.pos.x, E.pos.y - st.entities.p!.pos.y));
  }
  return { dists, sides, end: dists[dists.length - 1]!, state: st };
}

describe("the broadside arc, read in one place", () => {
  it("names the battery a target bears on", () => {
    const from = { x: 0, y: 0 };
    // Heading 0 is north in this game: `headingToVec` is (sin h, -cos h).
    expect(bearingSide(0, from, { x: 100, y: 0 })).toBe("right");
    expect(bearingSide(0, from, { x: -100, y: 0 })).toBe("left");
  });

  it("refuses the bow and the stern", () => {
    const from = { x: 0, y: 0 };
    expect(bearingSide(0, from, { x: 0, y: -100 })).toBeNull();   // dead ahead
    expect(bearingSide(0, from, { x: 0, y: 100 })).toBeNull();    // dead astern
  });

  it("opens exactly at the dead zone's edge", () => {
    const from = { x: 0, y: 0 };
    const edge = Math.acos(BROADSIDE_ARC_COS);                     // 60° off the bow
    const inside = { x: Math.sin(edge - 0.01) * 100, y: -Math.cos(edge - 0.01) * 100 };
    const outside = { x: Math.sin(edge + 0.01) * 100, y: -Math.cos(edge + 0.01) * 100 };
    expect(bearingSide(0, from, inside)).toBeNull();
    expect(bearingSide(0, from, outside)).toBe("right");
  });

  it("has nothing to say about a target in the same water", () => {
    expect(bearingSide(0, { x: 5, y: 5 }, { x: 5, y: 5 })).toBeNull();
  });

  it("refuses the captain's guns when the wrong battery is called", () => {
    const eng = new CombatEngine();
    const st = arena(150);                                          // enemy due east
    const wrong = eng.apply(st, [{ type: "FireCannons", side: "left" }], 1);
    expect(wrong.events.some(e => e.type === "CannonFired" && (e.shipId as string) === "p")).toBe(false);
    expect(wrong.state.entities.p!.ship!.cooldown.left).toBe(0);    // no shot, no reload
    const right = eng.apply(st, [{ type: "FireCannons", side: "right" }], 1);
    expect(right.events.some(e => e.type === "CannonFired" && (e.shipId as string) === "p")).toBe(true);
  });

  it("gives the enemy's guns the same arc, and both her batteries", () => {
    // She used to fire from any angle and always from her left, which was only
    // ever the right answer because her helm could not point her anywhere but
    // beam-on.
    const run = sail("defensive", 400, 90);
    expect(run.sides.length).toBeGreaterThan(0);
    for (const side of run.sides) expect(["left", "right"]).toContain(side);
  });
});

describe("the enemy's helm changes the range", () => {
  const CASES: [AiArchetype, number][] = [
    ["aggressive", RANGE * 0.45],
    ["defensive", RANGE * 0.7],
    ["tactical", RANGE * 0.4],
  ];

  for (const [arch, desired] of CASES) {
    const station = Math.max(HULL_CLEARANCE, desired);

    it(`${arch}: closes from 900 px to the station she wants`, () => {
      const run = sail(arch, 900);
      // Before v0.85.0 all three ended at 907.
      expect(run.end).toBeLessThan(900);
      expect(Math.abs(run.end - station)).toBeLessThan(12);
    });

    it(`${arch}: opens out again when she is inside it`, () => {
      const run = sail(arch, 60);
      expect(run.end).toBeGreaterThan(60);
      expect(Math.abs(run.end - station)).toBeLessThan(12);
    });
  }

  it("holds her station instead of circling in and out of it", () => {
    const tail = sail("defensive", 900).dists.slice(-400);
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    const sd = Math.sqrt(tail.reduce((a, b) => a + (b - mean) ** 2, 0) / tail.length);
    expect(sd).toBeLessThan(5);
  });

  it("stands off beyond gunshot when her crew is half his", () => {
    // The longest run here: she opens the range against a wind that is not
    // serving, and the helm eases as she nears her station rather than
    // overshooting it. 90 s leaves her still 14 px short of 352.
    const run = sail("aggressive", 425, 180, [60, 20]);
    expect(run.end).toBeGreaterThan(RANGE);          // fleeing: cannonRange * 1.1
    expect(Math.abs(run.end - RANGE * 1.1)).toBeLessThan(12);
  });

  it("presses to grapple when her crew is half again his — but not into his water", () => {
    // The boarder's station is 40 px. A drawn hull is 256 px of sprite at 0.3,
    // so two ships at 40 px are drawn one through the other. Nothing enforced
    // a clearance before, because nothing could reach the station to break it.
    const run = sail("aggressive", 425, 90, [20, 45]);
    expect(run.end).toBeGreaterThanOrEqual(HULL_CLEARANCE - 2);
    expect(run.end).toBeLessThan(HULL_CLEARANCE + 12);
  });

  it("never steers inside a hull's width of him, whatever she wants", () => {
    for (const arch of ["aggressive", "defensive", "tactical"] as AiArchetype[]) {
      const run = sail(arch, 425, 90, [20, 45]);
      expect(Math.min(...run.dists.slice(-600))).toBeGreaterThan(HULL_CLEARANCE - 3);
    }
  });
});

describe("ESC breaks off the action", () => {
  it("ends the battle beyond gunshot", () => {
    const eng = new CombatEngine();
    const st = arena(RANGE * DISENGAGE_RANGE_MUL + 10);
    const r = eng.apply(st, [{ type: "AttemptDisengage" }], 1);
    expect(r.events.some(e => e.type === "BattleEnded" && e.outcome === "disengaged")).toBe(true);
  });

  it("refuses inside it, and says why", () => {
    const eng = new CombatEngine();
    const st = arena(RANGE * DISENGAGE_RANGE_MUL - 10);
    const r = eng.apply(st, [{ type: "AttemptDisengage" }], 1);
    expect(r.events.some(e => e.type === "BattleEnded")).toBe(false);
    expect(r.events.some(e => e.type === "DisengageRejected" && e.reason === "too_close")).toBe(true);
  });

  it("is not the silence it used to be", () => {
    // The whole of the old behaviour: a tick carrying the command and a tick
    // carrying nothing came back byte for byte the same.
    const eng = new CombatEngine();
    const st = arena(RANGE);
    const withCmd = eng.apply(st, [{ type: "AttemptDisengage" }], 1);
    const without = eng.apply(st, [], 1);
    expect(JSON.stringify(withCmd.events)).not.toBe(JSON.stringify(without.events));
  });

  it("and the clock that used to be the only way out reads the same number", () => {
    // One table of positions instead of two (v0.82.0), applied to a distance:
    // the scene's far-distance timer and the engine's break-off are one
    // constant now. A literal 0.9 back in the scene would mean two again.
    expect(sceneSrc).toContain("DISENGAGE_RANGE_MUL");
    expect(sceneSrc).not.toMatch(/cannonRange \* 0\.9/);
  });
});

describe("what the fight says, it says on the screen", () => {
  it("draws every banner in screen space", () => {
    // The arena is three screens across and the camera opens centred on the
    // player at (1920, 1080). A line placed at `cameras.main.width / 2` with
    // the default scroll factor is drawn at world (640, …) — 1280 px off the
    // left edge of the view. v0.59.0 fixed the result banner and none of its
    // neighbours, so the refusal to board, the boarding's outcome and the
    // enemy's surrender had never been on the screen in any battle.
    const named = new Set(
      [...sceneSrc.matchAll(/(\w+)\.setScrollFactor\(0\)/g)].map(m => m[1] as string),
    );
    const loose: string[] = [];
    for (const chunk of sceneSrc.split(";")) {
      if (!/add\.(text|rectangle)\(/.test(chunk)) continue;
      if (!/cameras\.main\.(width|height)|cam\.(width|height)|startX/.test(chunk)) continue;
      if (/setScrollFactor\(0\)/.test(chunk)) continue;
      const assigned = /const (\w+) = this\.add\./.exec(chunk);
      if (assigned && named.has(assigned[1] as string)) continue;
      loose.push(chunk.trim().replace(/\s+/g, " ").slice(0, 90));
    }
    expect(loose).toEqual([]);
  });

  it("takes a passing line back off it", () => {
    // The refusal to board carried a two-second timer with an empty callback
    // where the fade was meant to be, so the lines piled up.
    expect(sceneSrc).not.toMatch(/delayedCall\(\s*\d+\s*,\s*\(\)\s*=>\s*\{\s*\}\s*\)/);
    expect(sceneSrc).toMatch(/delayedCall\(BANNER_MS, \(\) => banner\.destroy\(\)\)/);
  });
});
