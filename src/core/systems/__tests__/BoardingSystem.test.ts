import { describe, it, expect } from "vitest";
import {
  canBoard,
  resolveBoarding,
  BOARDING_RANGE,
  BOARDING_MAX_ENEMY_HULL,
  BOARDING_MAX_ENEMY_CREW,
} from "../BoardingSystem.ts";
import type { CombatShipData } from "../../model/CombatState.ts";
import { shipClassId, factionId } from "../../model/ids.ts";

// ===========================================================================
// BoardingSystem — grapple preconditions and melee resolution
// ===========================================================================

function ship(over: Partial<CombatShipData> & {
  crewCurrent?: number; crewMax?: number; morale?: number;
} = {}): CombatShipData {
  const { crewCurrent = 30, crewMax = 30, morale = 1.0, ...rest } = over;
  return {
    classId: shipClassId("sloop"),
    factionId: factionId("england"),
    hullHp: 60,
    hullMax: 60,
    sailsHp: 50,
    sailsMax: 50,
    cannons: 8,
    crew: { current: crewCurrent, max: crewMax, morale },
    cooldown: { left: 0, right: 0 },
    ...rest,
  };
}

/** An enemy weak enough to board: hull under the threshold. */
const crippled = () => ship({ hullHp: 10, hullMax: 60 });

describe("canBoard", () => {
  it("refuses when the ships are not yet grappled", () => {
    expect(canBoard(ship(), crippled(), BOARDING_RANGE + 1)).toEqual({ ok: false, reason: "too_far" });
  });

  it("accepts exactly at the grapple range", () => {
    expect(canBoard(ship(), crippled(), BOARDING_RANGE)).toEqual({ ok: true });
  });

  it("refuses a fresh enemy — hull and crew both intact", () => {
    expect(canBoard(ship(), ship(), 10)).toEqual({ ok: false, reason: "enemy_too_strong" });
  });

  it("a battered hull alone is enough of an opening", () => {
    const enemy = ship({ hullHp: 60 * BOARDING_MAX_ENEMY_HULL - 1, crewCurrent: 30, crewMax: 30 });
    expect(canBoard(ship(), enemy, 10)).toEqual({ ok: true });
  });

  it("a decimated crew alone is enough of an opening", () => {
    const enemy = ship({ crewCurrent: 30 * BOARDING_MAX_ENEMY_CREW - 1, crewMax: 30 });
    expect(canBoard(ship(), enemy, 10)).toEqual({ ok: true });
  });

  it("refuses when the player has fewer than five hands left", () => {
    expect(canBoard(ship({ crewCurrent: 4 }), crippled(), 10))
      .toEqual({ ok: false, reason: "enemy_too_strong" });
    expect(canBoard(ship({ crewCurrent: 5 }), crippled(), 10)).toEqual({ ok: true });
  });

  it("treats a hulk with no max hull as boardable rather than dividing by zero", () => {
    const wreck = ship({ hullHp: 0, hullMax: 0, crewCurrent: 0, crewMax: 0 });
    expect(canBoard(ship(), wreck, 10)).toEqual({ ok: true });
  });
});

describe("resolveBoarding", () => {
  it("the stronger side takes the deck", () => {
    const result = resolveBoarding(ship({ crewCurrent: 40, crewMax: 40 }), ship({ crewCurrent: 10 }), 5);
    expect(result.captured).toBe(true);
  });

  it("the weaker side is thrown back", () => {
    const result = resolveBoarding(ship({ crewCurrent: 5, crewMax: 40 }), ship({ crewCurrent: 40, crewMax: 40 }), 0);
    expect(result.captured).toBe(false);
  });

  it("fencing skill can win an otherwise even fight", () => {
    const even = () => [ship({ crewCurrent: 20 }), ship({ crewCurrent: 22 })] as const;
    const [aP, aE] = even();
    const [bP, bE] = even();
    expect(resolveBoarding(aP, aE, 0).captured).toBe(false);
    expect(resolveBoarding(bP, bE, 10).captured).toBe(true);
  });

  it("morale counts as much as numbers", () => {
    const timid = ship({ crewCurrent: 30, morale: 0.2 });
    const eager = ship({ crewCurrent: 25, morale: 1.0 });
    expect(resolveBoarding(eager, timid, 0).captured).toBe(true);
  });

  it("zero morale does not zero out a side entirely", () => {
    // Both sides floor at 0.1 morale, so a 30-man crew still beats a 5-man one.
    const result = resolveBoarding(ship({ crewCurrent: 30, morale: 0 }), ship({ crewCurrent: 5, morale: 0 }), 0);
    expect(result.captured).toBe(true);
  });

  it("the loser bleeds harder than the winner", () => {
    const r = resolveBoarding(ship({ crewCurrent: 40, crewMax: 40 }), ship({ crewCurrent: 10 }), 5);
    const playerLost = 40 - r.playerCrewAfter;
    const enemyLost = 10 - r.enemyCrewAfter;
    expect(enemyLost / 10).toBeGreaterThan(playerLost / 40);
  });

  it("nobody comes out of a boarding unscathed", () => {
    const r = resolveBoarding(ship({ crewCurrent: 40, crewMax: 40 }), ship({ crewCurrent: 10 }), 10);
    expect(r.playerCrewAfter).toBeLessThan(40);
  });

  it("crew counts stay whole and non-negative", () => {
    for (const [p, e] of [[1, 1], [3, 40], [40, 3], [0, 12]] as const) {
      const r = resolveBoarding(ship({ crewCurrent: p }), ship({ crewCurrent: e }), 5);
      expect(Number.isInteger(r.playerCrewAfter)).toBe(true);
      expect(Number.isInteger(r.enemyCrewAfter)).toBe(true);
      expect(r.playerCrewAfter).toBeGreaterThanOrEqual(0);
      expect(r.enemyCrewAfter).toBeGreaterThanOrEqual(0);
    }
  });

  it("loot only follows a capture", () => {
    const won = resolveBoarding(ship({ crewCurrent: 40, crewMax: 40 }), ship({ crewCurrent: 5 }), 5);
    const lost = resolveBoarding(ship({ crewCurrent: 5 }), ship({ crewCurrent: 40, crewMax: 40 }), 0);
    expect(won.lootFraction).toBeGreaterThan(0);
    expect(lost.lootFraction).toBe(0);
  });

  it("is deterministic — the same two crews always resolve the same way", () => {
    const a = resolveBoarding(ship({ crewCurrent: 21 }), ship({ crewCurrent: 19 }), 4);
    const b = resolveBoarding(ship({ crewCurrent: 21 }), ship({ crewCurrent: 19 }), 4);
    expect(a).toEqual(b);
  });

  it("does not mutate the ships it was handed", () => {
    const player = ship({ crewCurrent: 40, crewMax: 40 });
    const enemy = ship({ crewCurrent: 10 });
    resolveBoarding(player, enemy, 5);
    expect(player.crew.current).toBe(40);
    expect(enemy.crew.current).toBe(10);
  });
});
