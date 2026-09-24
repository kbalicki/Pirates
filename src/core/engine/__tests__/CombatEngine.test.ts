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
import { CombatEngine, DISENGAGE_RANGE_MUL, BOARDING_COOLDOWN_TICKS, BOARDER_CREW_RATIO, type AiArchetype } from "../CombatEngine.ts";
import { bearingSide, BROADSIDE_ARC_COS, BROADSIDE_HALF_ARC, HULL_WIDTH } from "../../systems/CombatSystem.ts";
import { BOARDING_RANGE, canBoard, resolveBoarding } from "../../systems/BoardingSystem.ts";
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
    let over = false;
    for (const ev of r.events) {
      if (ev.type === "CannonFired" && (ev.shipId as string) === "e") sides.push(ev.side);
      if (ev.type === "BattleEnded") over = true;
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
    if (over) break;
  }
  return {
    dists, sides, end: dists[dists.length - 1]!, state: st,
    min: Math.min(...dists),
  };
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

  it("tells the captain why, instead of saying nothing (v0.98.3)", () => {
    const eng = new CombatEngine();
    const wrong = eng.apply(arena(150), [{ type: "FireCannons", side: "left" }], 1);
    expect(wrong.events).toContainEqual({ type: "FireRejected", side: "left", reason: "out_of_arc" });
    const right = eng.apply(arena(150), [{ type: "FireCannons", side: "right" }], 1);
    expect(right.events.some(e => e.type === "FireRejected")).toBe(false);
  });

  it("does not answer the AI, which asks every tick", () => {
    const eng = new CombatEngine();
    let st = arena(RANGE * 0.6);
    let refused = 0;
    for (let i = 0; i < 1200; i++) {
      const r = eng.apply(st, [], 1);
      refused += r.events.filter(e => e.type === "FireRejected").length;
      st = r.state;
    }
    expect(refused).toBe(0);
  });

  it("is ±30° off the beam, and the arena draws that and nothing wider", () => {
    // The dashed arcs were a typed `Math.PI / 3` — ±60° off the beam — for as
    // long as they existed, so half of each one was water where Q and E were
    // refused in silence.
    expect(BROADSIDE_HALF_ARC * 180 / Math.PI).toBeCloseTo(30, 9);
    const from = { x: 0, y: 0 };
    // Heading 0 is north; the starboard beam is east, and `φ` swings aft.
    const at = (phi: number) => ({ x: Math.cos(phi) * 100, y: Math.sin(phi) * 100 });
    expect(bearingSide(0, from, at(BROADSIDE_HALF_ARC - 0.01))).toBe("right");
    expect(bearingSide(0, from, at(BROADSIDE_HALF_ARC + 0.01))).toBeNull();
    expect(bearingSide(0, from, at(-BROADSIDE_HALF_ARC + 0.01))).toBe("right");
    expect(bearingSide(0, from, at(-BROADSIDE_HALF_ARC - 0.01))).toBeNull();

    expect(sceneSrc).toContain("const HALF_ARC = BROADSIDE_HALF_ARC;");
    expect(sceneSrc).not.toMatch(/HALF_ARC\s*=\s*Math\.PI/);
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
    const station = Math.max(HULL_WIDTH, desired);

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

  it("comes hull to hull when she means to board, and only then", () => {
    // Grappled ships touch: her boarding station is the 40 px the AI has
    // always written down, and since v0.86.0 that is inside `BOARDING_RANGE`
    // rather than outside it. Every other mode keeps a hull's width off,
    // because two hulls nearer than that are drawn one through the other.
    const boarding = sail("aggressive", 425, 90, [20, 45]);
    expect(boarding.min).toBeLessThan(HULL_WIDTH);
    expect(boarding.min).toBeGreaterThan(20);

    for (const arch of ["aggressive", "defensive", "tactical"] as AiArchetype[]) {
      const even = sail(arch, 425, 90, [30, 30]);
      expect(Math.min(...even.dists.slice(-600))).toBeGreaterThan(HULL_WIDTH - 3);
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

describe("she comes across too", () => {
  /** Her alongside, him weakened: the state a boarding needs. */
  function grappled(pCrew = 10, eCrew = 40) {
    const st = arena(50, [pCrew, eCrew]);
    // A deck worth carrying: hull well down as well as the crew.
    st.entities.p!.ship!.hullHp = 20;
    return st;
  }

  it("a grapnel carries as far as a hull is wide", () => {
    // It was a flat 30 px. The closest any helm the engine steers will come
    // when it is not boarding is a hull's width, and her boarding station is
    // the 40 px the AI always wrote down — which was OUTSIDE the old range,
    // under a comment reading "get close enough to grapple".
    expect(BOARDING_RANGE).toBe(HULL_WIDTH);
    expect(BOARDING_RANGE).toBeGreaterThan(40);
    expect(canBoard(grappled().entities.e!.ship!, grappled().entities.p!.ship!, 50).ok).toBe(true);
    expect(canBoard(grappled().entities.e!.ship!, grappled().entities.p!.ship!, 50 * 3).ok).toBe(false);
  });

  it("throws them when she outnumbers him and his deck is weak", () => {
    const eng = new CombatEngine();
    eng.setArchetype("aggressive");
    const r = eng.apply(grappled(), [], 1);
    const inc = r.events.find(e => e.type === "BoardingIncoming");
    expect(inc).toBeTruthy();
    expect((inc as { boarderId: string }).boarderId).toBe("e");
    // Announced, not settled: the captains have not met yet.
    expect(r.events.some(e => e.type === "BoardingResolved")).toBe(false);
  });

  it("does not throw them at a deck she cannot carry", () => {
    const eng = new CombatEngine();
    // Even crews: not a boarder at all.
    const even = arena(50, [40, 40]);
    even.entities.p!.ship!.hullHp = 20;
    expect(eng.apply(even, [], 1).events.some(e => e.type === "BoardingIncoming")).toBe(false);

    // Outnumbered but sound — full hull, more than half his people still on
    // their feet: `canBoard` refuses a whole ship.
    const eng2 = new CombatEngine();
    const sound = arena(50, [25, 40]);
    expect(eng2.apply(sound, [], 1).events.some(e => e.type === "BoardingIncoming")).toBe(false);

    // Alongside and weak, but she is not strong enough to want it.
    const eng3 = new CombatEngine();
    const weakEnemy = arena(50, [10, Math.floor(10 * BOARDER_CREW_RATIO) - 1]);
    weakEnemy.entities.p!.ship!.hullHp = 20;
    expect(eng3.apply(weakEnemy, [], 1).events.some(e => e.type === "BoardingIncoming")).toBe(false);
  });

  it("boards HIM, not herself", () => {
    // `applyBoarding` took one id before v0.86.0 and read its target straight
    // off `state.enemyShipId`, so the only pair it could describe was the
    // captain going the other way.
    const eng = new CombatEngine();
    let st = grappled();
    st = eng.apply(st, [], 1).state;                       // grapnels away
    const r = eng.apply(st, [], 1);                        // nobody duels: settled by strength
    const res = r.events.find(e => e.type === "BoardingResolved");
    expect(res).toBeTruthy();
    expect((res as { boarderId: string }).boarderId).toBe("e");
    // His crew fell and hers did too — two ships changed, not one twice.
    expect(r.state.entities.p!.ship!.crew.current).toBeLessThan(st.entities.p!.ship!.crew.current);
    expect(r.state.entities.e!.ship!.crew.current).toBeLessThan(st.entities.e!.ship!.crew.current);
  });

  it("says what the deck cost each side, in the event the screen reads (v0.97.1)", () => {
    const eng = new CombatEngine();
    let st = grappled();
    st = eng.apply(st, [], 1).state;
    const r = eng.apply(st, [], 1);
    const res = r.events.find(e => e.type === "BoardingResolved") as
      { boarderLost: number; targetLost: number } | undefined;
    expect(res).toBeTruthy();
    // She boarded him: her losses are the boarder's, his are the target's.
    expect(res!.boarderLost).toBe(st.entities.e!.ship!.crew.current - r.state.entities.e!.ship!.crew.current);
    expect(res!.targetLost).toBe(st.entities.p!.ship!.crew.current - r.state.entities.p!.ship!.crew.current);
    expect(res!.boarderLost + res!.targetLost).toBeGreaterThan(0);
  });

  it("ends a battle once when his boarding carries her deck (v0.97.1)", () => {
    // Her crew thinned below ten by the melee is also the surrender rule, and
    // the same tick used to end the battle a second time: "captured" and then
    // "surrender", both drawn and both paid.
    const eng = new CombatEngine();
    const st = arena(50, [40, 14]);
    st.entities.e!.ship!.hullHp = 20;
    eng.setDuelResult(true);
    const r = eng.apply(st, [{ type: "AttemptBoarding" }], 1);
    const ends = r.events.filter(e => e.type === "BattleEnded") as { outcome: string }[];
    expect(ends.map(e => e.outcome)).toEqual(["captured"]);
    expect(r.events.some(e => e.type === "Surrender")).toBe(false);
  });

  it("settles on the next tick when no screen is running the duel", () => {
    const eng = new CombatEngine();
    let st = grappled();
    st = eng.apply(st, [], 1).state;
    const r = eng.apply(st, [], 1);
    expect(r.events.some(e => e.type === "BoardingResolved")).toBe(true);
    // And it is not left hanging to fire again a tick later.
    const r2 = eng.apply(r.state, [], 1);
    expect(r2.events.some(e => e.type === "BoardingResolved")).toBe(false);
  });

  it("gives the deck to whoever won the duel", () => {
    for (const playerWon of [true, false]) {
      const eng = new CombatEngine();
      let st = grappled();
      st = eng.apply(st, [], 1).state;                     // BoardingIncoming
      eng.setDuelResult(playerWon);
      const r = eng.apply(st, [{ type: "RepelBoarders" }], 1);
      const res = r.events.find(e => e.type === "BoardingResolved") as { captured: boolean };
      expect(res.captured).toBe(!playerWon);
      expect(r.events.some(e => e.type === "BattleEnded" && e.outcome === "lose")).toBe(!playerWon);
    }
  });

  it("waits after a repulse instead of grinding him down a tick at a time", () => {
    const eng = new CombatEngine();
    let st = grappled();
    st = eng.apply(st, [], 1).state;
    eng.setDuelResult(true);                               // he holds the deck
    st = eng.apply(st, [{ type: "RepelBoarders" }], 1).state;
    // Still alongside, still weak — and she does not come again at once.
    let throwsWithin = 0;
    for (let i = 0; i < BOARDING_COOLDOWN_TICKS - 2; i++) {
      const r = eng.apply(st, [], 1);
      st = r.state;
      if (r.events.some(e => e.type === "BoardingIncoming")) throwsWithin++;
    }
    expect(throwsWithin).toBe(0);
  });

  it("counts the captain's blade on his own deck", () => {
    const deck = { classId: "brigantine", factionId: "spain", hullHp: 20, hullMax: 80,
      sailsHp: 60, sailsMax: 60, cannons: 16, cooldown: { left: 0, right: 0 },
      crew: { current: 18, max: 40, morale: 0.7 } } as never;
    const party = { classId: "brigantine", factionId: "spain", hullHp: 80, hullMax: 80,
      sailsHp: 60, sailsMax: 60, cannons: 16, cooldown: { left: 0, right: 0 },
      crew: { current: 20, max: 40, morale: 0.7 } } as never;
    // Her party is the larger one, so with nobody of note defending she wins.
    expect(resolveBoarding(party, deck, 0).captured).toBe(true);
    // A captain who can use a sword turns it.
    expect(resolveBoarding(party, deck, 0, undefined, 10).captured).toBe(false);
    // And the captain's own boardings are unchanged: the defence bonus is 0.
    expect(resolveBoarding(party, deck, 0, undefined, 0)).toEqual(resolveBoarding(party, deck, 0));
  });

  it("tells him why he cannot board, and tells her nothing", () => {
    const eng = new CombatEngine();
    const far = arena(RANGE, [30, 30]);
    const his = eng.apply(far, [{ type: "AttemptBoarding" }], 1);
    expect(his.events.some(e => e.type === "BoardingRejected" && e.reason === "too_far")).toBe(true);

    // Hers is refused in silence: she simply does not come.
    const eng2 = new CombatEngine();
    let st = grappled();
    st = eng2.apply(st, [], 1).state;                      // pending
    st = { ...st, entities: { ...st.entities,
      e: { ...st.entities.e!, pos: { x: st.entities.e!.pos.x + 900, y: st.entities.e!.pos.y } } } };
    const hers = eng2.apply(st, [{ type: "RepelBoarders" }], 1);
    expect(hers.events.some(e => e.type === "BoardingRejected")).toBe(false);
    expect(hers.events.some(e => e.type === "BoardingResolved")).toBe(false);
  });
});
