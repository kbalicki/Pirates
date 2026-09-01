import { describe, it, expect } from "vitest";
import {
  createDuel,
  duelStep,
  resolveExchange,
  chooseEnemyAction,
  isAttack,
  lineOf,
  enemyFencingFor,
  DUEL_ACTIONS,
  DUEL_LINES,
  DUEL_WIN_ADVANTAGE,
  DUEL_MAX_STAMINA,
  DUEL_ATTACK_COST,
  DUEL_TIRED_THRESHOLD,
  type DuelAction,
  type DuelState,
} from "../DuelSystem.ts";
import { createRng } from "../../services/RNG.ts";

// ===========================================================================
// DuelSystem — sword fighting, one exchange at a time (v0.10.0)
// ===========================================================================

/**
 * The duel is a single number — `advantage`, the ground between the two men —
 * pushed back and forth by exchanges. These tests pin the three things the
 * whole fight rests on: a parry on the right line turns the exchange around,
 * skill decides how much ground a blow is worth, and swinging every round
 * tires you into losing exchanges you would otherwise win.
 */

const duel = (playerFencing = 5, enemyFencing = 5, seed = 42) =>
  createDuel(playerFencing, enemyFencing, createRng(seed));

/** Force an exchange with a chosen enemy action, bypassing the AI. */
const exchange = (state: DuelState, p: DuelAction, e: DuelAction) => resolveExchange(state, p, e);

describe("action helpers", () => {
  it("tells attacks from guards", () => {
    expect(isAttack("attack_high")).toBe(true);
    expect(isAttack("parry_low")).toBe(false);
  });

  it("reads the line off any action", () => {
    expect(lineOf("attack_high")).toBe("high");
    expect(lineOf("parry_mid")).toBe("mid");
    expect(lineOf("attack_low")).toBe("low");
  });

  it("covers every line with both an attack and a guard", () => {
    expect(DUEL_ACTIONS).toHaveLength(DUEL_LINES.length * 2);
    for (const line of DUEL_LINES) {
      expect(DUEL_ACTIONS).toContain(("attack_" + line) as DuelAction);
      expect(DUEL_ACTIONS).toContain(("parry_" + line) as DuelAction);
    }
  });
});

describe("createDuel", () => {
  it("starts level, rested and undecided", () => {
    const d = duel();
    expect(d.advantage).toBe(0);
    expect(d.outcome).toBe("ongoing");
    expect(d.round).toBe(0);
    expect(d.player.stamina).toBe(DUEL_MAX_STAMINA);
    expect(d.enemy.stamina).toBe(DUEL_MAX_STAMINA);
  });

  it("clamps a nonsense fencing score into the 0-10 range", () => {
    expect(createDuel(99, -5, createRng(1)).player.fencing).toBe(10);
    expect(createDuel(99, -5, createRng(1)).enemy.fencing).toBe(0);
  });
});

describe("one exchange", () => {
  it("an unguarded blow gains the attacker ground", () => {
    const r = exchange(duel(), "attack_high", "parry_low");
    expect(r.gainedBy).toBe("player");
    expect(r.ground).toBeGreaterThan(0);
    expect(r.state.advantage).toBeGreaterThan(0);
    expect(r.resultKey).toBe("duel.hit_lands");
  });

  it("a parry on the right line turns the exchange around", () => {
    const r = exchange(duel(), "attack_high", "parry_high");
    expect(r.gainedBy).toBe("enemy");
    expect(r.state.advantage).toBeLessThan(0);
    expect(r.resultKey).toBe("duel.parried_riposte");
  });

  it("guarding the line the enemy attacks wins the ground instead", () => {
    const r = exchange(duel(), "parry_mid", "attack_mid");
    expect(r.gainedBy).toBe("player");
    expect(r.state.advantage).toBeGreaterThan(0);
    expect(r.resultKey).toBe("duel.parry_riposte");
  });

  it("guarding the wrong line lets the blow through", () => {
    const r = exchange(duel(), "parry_mid", "attack_low");
    expect(r.gainedBy).toBe("enemy");
    expect(r.resultKey).toBe("duel.hit_taken");
  });

  it("two guards are a breather, not a fight", () => {
    const r = exchange(duel(), "parry_high", "parry_low");
    expect(r.gainedBy).toBe("none");
    expect(r.ground).toBe(0);
    expect(r.state.advantage).toBe(0);
    expect(r.resultKey).toBe("duel.circling");
  });

  it("equally matched blades lock instead of deciding anything", () => {
    const r = exchange(duel(5, 5), "attack_high", "attack_low");
    expect(r.gainedBy).toBe("none");
    expect(r.resultKey).toBe("duel.blades_lock");
  });

  it("when both commit, the better swordsman comes off ahead", () => {
    const r = exchange(duel(9, 2), "attack_high", "attack_low");
    expect(r.gainedBy).toBe("player");
    expect(r.resultKey).toBe("duel.trade_blows");
  });

  it("counts the rounds", () => {
    const r = exchange(duel(), "attack_high", "parry_low");
    expect(r.state.round).toBe(1);
    expect(exchange(r.state, "attack_high", "parry_low").state.round).toBe(2);
  });
});

describe("skill", () => {
  it("a better blade wins more ground with the same blow", () => {
    const novice = exchange(duel(1, 5), "attack_high", "parry_low").ground;
    const master = exchange(duel(10, 5), "attack_high", "parry_low").ground;
    expect(master).toBeGreaterThan(novice);
  });

  it("even a novice's hit moves his man", () => {
    expect(exchange(duel(0, 5), "attack_high", "parry_low").ground).toBeGreaterThan(0);
  });

  it("a better defender ripostes harder", () => {
    const weak = exchange(duel(5, 1), "attack_high", "parry_high").ground;
    const strong = exchange(duel(5, 10), "attack_high", "parry_high").ground;
    expect(strong).toBeGreaterThan(weak);
  });
});

describe("stamina", () => {
  it("attacking costs wind, guarding gets it back", () => {
    const after = exchange(duel(), "attack_high", "parry_low").state;
    expect(after.player.stamina).toBe(DUEL_MAX_STAMINA - DUEL_ATTACK_COST);
    expect(after.enemy.stamina).toBe(DUEL_MAX_STAMINA); // already full, cannot exceed
  });

  it("stamina never goes below nothing or above full", () => {
    let s = duel();
    for (let i = 0; i < 20; i++) s = exchange(s, "attack_high", "attack_low").state;
    expect(s.player.stamina).toBeGreaterThanOrEqual(0);
    let g = duel();
    for (let i = 0; i < 20; i++) g = exchange(g, "parry_high", "parry_low").state;
    expect(g.player.stamina).toBe(DUEL_MAX_STAMINA);
  });

  it("a winded fighter's blows are worth less", () => {
    let s = duel(8, 8);
    const fresh = exchange(s, "attack_high", "parry_low").ground;
    // Swing until winded, guarding never.
    while (s.player.stamina >= DUEL_TIRED_THRESHOLD) {
      s = { ...exchange(s, "attack_high", "parry_low").state, advantage: 0, outcome: "ongoing" };
    }
    const tired = exchange(s, "attack_high", "parry_low").ground;
    expect(tired).toBeLessThan(fresh);
  });

  it("guarding a few rounds restores a tired fighter", () => {
    let s = duel();
    while (s.player.stamina >= DUEL_TIRED_THRESHOLD) {
      s = { ...exchange(s, "attack_high", "parry_low").state, advantage: 0, outcome: "ongoing" };
    }
    const winded = s.player.stamina;
    s = exchange(s, "parry_high", "parry_high").state;
    expect(s.player.stamina).toBeGreaterThan(winded);
  });
});

describe("ending the duel", () => {
  it("driving a man the full length of the deck wins it", () => {
    let s = duel(10, 0);
    for (let i = 0; i < 30 && s.outcome === "ongoing"; i++) {
      s = exchange(s, "attack_high", "parry_low").state;
    }
    expect(s.outcome).toBe("player_win");
    expect(s.advantage).toBe(DUEL_WIN_ADVANTAGE);
  });

  it("being driven back the full length loses it", () => {
    let s = duel(0, 10);
    for (let i = 0; i < 30 && s.outcome === "ongoing"; i++) {
      s = exchange(s, "attack_high", "parry_high").state; // walking onto his blade
    }
    expect(s.outcome).toBe("enemy_win");
    expect(s.advantage).toBe(-DUEL_WIN_ADVANTAGE);
  });

  it("advantage never runs past the ends of the deck", () => {
    let s = duel(10, 0);
    for (let i = 0; i < 50; i++) s = exchange(s, "attack_high", "parry_low").state;
    expect(Math.abs(s.advantage)).toBeLessThanOrEqual(DUEL_WIN_ADVANTAGE);
  });

  it("a decided duel ignores further exchanges", () => {
    let s = duel(10, 0);
    while (s.outcome === "ongoing") s = exchange(s, "attack_high", "parry_low").state;
    const after = exchange(s, "attack_low", "attack_high");
    expect(after.state).toBe(s);
    expect(after.resultKey).toBe("duel.over");
  });
});

describe("enemy AI", () => {
  it("a winded enemy guards rather than swinging", () => {
    const base = duel();
    const winded: DuelState = { ...base, enemy: { ...base.enemy, stamina: DUEL_ATTACK_COST - 1 } };
    for (let i = 0; i < 20; i++) {
      const { action } = chooseEnemyAction({ ...winded, rng: createRng(i) }, null);
      expect(isAttack(action)).toBe(false);
    }
  });

  it("a skilled enemy sometimes reads the line you just used", () => {
    const base = duel(5, 10);
    let reads = 0;
    for (let seed = 0; seed < 200; seed++) {
      const { action } = chooseEnemyAction({ ...base, rng: createRng(seed) }, "attack_high");
      if (action === "parry_high") reads++;
    }
    expect(reads).toBeGreaterThan(20); // clearly more than blind chance at one action in six
  });

  it("an unskilled enemy reads you far less often", () => {
    const count = (fencing: number) => {
      let n = 0;
      const base = duel(5, fencing);
      for (let seed = 0; seed < 200; seed++) {
        if (chooseEnemyAction({ ...base, rng: createRng(seed) }, "attack_high").action === "parry_high") n++;
      }
      return n;
    };
    expect(count(10)).toBeGreaterThan(count(0));
  });

  it("presses the attack more when he is winning", () => {
    const attacks = (advantage: number) => {
      let n = 0;
      const base = duel();
      for (let seed = 0; seed < 200; seed++) {
        const s = { ...base, advantage, rng: createRng(seed) };
        if (isAttack(chooseEnemyAction(s, null).action)) n++;
      }
      return n;
    };
    expect(attacks(-4)).toBeGreaterThan(attacks(4));
  });

  it("always produces a legal action", () => {
    const base = duel();
    for (let seed = 0; seed < 100; seed++) {
      const { action } = chooseEnemyAction({ ...base, rng: createRng(seed) }, "attack_mid");
      expect(DUEL_ACTIONS).toContain(action);
    }
  });
});

describe("duelStep — determinism", () => {
  it("the same seed and the same choices replay the same duel", () => {
    const play = () => {
      let s = duel(6, 6, 12345);
      let last: DuelAction | null = null;
      const trace: string[] = [];
      for (let i = 0; i < 15 && s.outcome === "ongoing"; i++) {
        const action: DuelAction = i % 2 === 0 ? "attack_mid" : "parry_high";
        const ex = duelStep(s, action, last);
        trace.push(ex.enemyAction + ":" + ex.resultKey + ":" + ex.state.advantage.toFixed(3));
        s = ex.state;
        last = action;
      }
      return trace;
    };
    expect(play()).toEqual(play());
  });

  it("the rng advances, so the enemy does not repeat himself forever", () => {
    let s = duel(5, 5, 7);
    const seen = new Set<string>();
    for (let i = 0; i < 20 && s.outcome === "ongoing"; i++) {
      const ex = duelStep(s, "parry_mid", "parry_mid");
      seen.add(ex.enemyAction);
      s = { ...ex.state, advantage: 0, outcome: "ongoing" };
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("a duel always ends within a reasonable number of exchanges", () => {
    for (let seed = 0; seed < 40; seed++) {
      let s = duel(7, 4, seed);
      let last: DuelAction | null = null;
      let rounds = 0;
      while (s.outcome === "ongoing" && rounds < 300) {
        const action: DuelAction = s.player.stamina < DUEL_TIRED_THRESHOLD ? "parry_mid" : "attack_low";
        const ex = duelStep(s, action, last);
        s = ex.state;
        last = action;
        rounds++;
      }
      expect(s.outcome, "seed " + seed + " never resolved").not.toBe("ongoing");
    }
  });
});

describe("enemyFencingFor", () => {
  it("a fuller crew means a more dangerous captain", () => {
    expect(enemyFencingFor(30, 30, 0)).toBeGreaterThan(enemyFencingFor(5, 30, 0));
  });

  it("notoriety draws out better opponents", () => {
    expect(enemyFencingFor(30, 30, 100)).toBeGreaterThan(enemyFencingFor(30, 30, 0));
  });

  it("stays inside the 0-10 skill range whatever it is fed", () => {
    for (const [c, m, n] of [[0, 0, 0], [30, 30, 9999], [-5, 30, -5], [999, 30, 999]] as const) {
      const v = enemyFencingFor(c, m, n);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(10);
    }
  });
});
