import { describe, it, expect } from "vitest";
import {
  settleAmbush, ambushFencing, AMBUSH_LOSS_SHARE, AMBUSH_BAND_MEN, AMBUSH_BAND_OF,
} from "../TreasureSystem.ts";
import { enemyFencingFor } from "../DuelSystem.ts";
import type { WorldState } from "../../model/WorldState.ts";

/**
 * The fight at a baited dig (v0.99.6). Its price - a quarter of the purse -
 * lived in the map screen's duel callback, where no test and no page of the
 * manual could see it. It is a rule of the game, so it lives here now.
 */
const world = (gold: number) => ({ player: { gold } }) as unknown as WorldState;

describe("the fight at a baited dig", () => {
  it("pays the chest to the winner", () => {
    const r = settleAmbush(world(300), true, 450);
    expect(r.gold).toBe(450);
    expect(r.world.player.gold).toBe(750);
  });

  it("takes a quarter of the purse from the loser, rounded down", () => {
    expect(AMBUSH_LOSS_SHARE).toBe(0.25);
    const r = settleAmbush(world(1001), false, 450);
    expect(r.gold).toBe(250);
    expect(r.world.player.gold).toBe(751);
  });

  it("takes nothing from an empty purse", () => {
    const r = settleAmbush(world(0), false, 450);
    expect(r.gold).toBe(0);
    expect(r.world.player.gold).toBe(0);
  });

  it("sets the ambushers' blade by the captain's fame, as a crew of twenty in thirty", () => {
    expect(ambushFencing(0)).toBe(enemyFencingFor(AMBUSH_BAND_MEN, AMBUSH_BAND_OF, 0));
    expect(ambushFencing(50)).toBeGreaterThan(ambushFencing(0));
  });

  it("is what the map screen settles with", () => {
    const SRC = import.meta.glob("../../../game/scenes/MainMapScene.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const src = Object.values(SRC)[0] ?? "";
    expect(src).toContain("settleAmbush(this.worldState, playerWon, reward)");
    expect(src).not.toMatch(/gold \* 0\.25/);
  });
});
