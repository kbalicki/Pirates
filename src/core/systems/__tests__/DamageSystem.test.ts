import { describe, it, expect } from "vitest";
import {
  HULL_TIERS,
  RIG_TIERS,
  FOUNDERING_THRESHOLD,
  FOUNDERING_HULL_LOSS_PER_TICK,
  hullCondition,
  rigCondition,
  hullTier,
  rigTier,
  damageSpeedMultiplier,
  mapDamageSpeedMultiplier,
  MAP_DISMASTED_CRAWL,
  damageTurnMultiplier,
  isFoundering,
  isDismasted,
  applyFlooding,
  cargoSurvivingSinking,
  damageVisualSeverity,
} from "../DamageSystem.ts";

// ===========================================================================
// DamageSystem — hull and rigging condition tiers (v0.9.9)
// ===========================================================================

/**
 * Thresholds are fractions of max, so a 30-hull pinnace and a 180-hull galleon
 * cross the same stages at the same relative damage. The tests below pin the
 * boundaries exactly, because "one point of hull flips the ship into a worse
 * stage" is the whole mechanic — an off-by-one here is a gameplay bug, not a
 * rounding detail.
 */

const HULL_MAX = 60;   // sloop
const SAILS_MAX = 50;

/** Hull hp at a given fraction of a 60-hull sloop. */
const hp = (frac: number) => HULL_MAX * frac;
const sails = (frac: number) => SAILS_MAX * frac;

describe("tier tables", () => {
  it("hull tiers descend and end at zero", () => {
    for (let i = 1; i < HULL_TIERS.length; i++) {
      expect(HULL_TIERS[i].minFrac).toBeLessThan(HULL_TIERS[i - 1].minFrac);
    }
    expect(HULL_TIERS[HULL_TIERS.length - 1].minFrac).toBe(0);
  });

  it("rig tiers descend and end at zero", () => {
    for (let i = 1; i < RIG_TIERS.length; i++) {
      expect(RIG_TIERS[i].minFrac).toBeLessThan(RIG_TIERS[i - 1].minFrac);
    }
    expect(RIG_TIERS[RIG_TIERS.length - 1].minFrac).toBe(0);
  });

  it("every stage is slower and clumsier than the one above it", () => {
    for (let i = 1; i < HULL_TIERS.length; i++) {
      expect(HULL_TIERS[i].speedMul).toBeLessThan(HULL_TIERS[i - 1].speedMul);
      expect(HULL_TIERS[i].turnMul).toBeLessThan(HULL_TIERS[i - 1].turnMul);
    }
    for (let i = 1; i < RIG_TIERS.length; i++) {
      expect(RIG_TIERS[i].speedMul).toBeLessThan(RIG_TIERS[i - 1].speedMul);
    }
  });

  it("an undamaged ship pays nothing", () => {
    expect(HULL_TIERS[0].speedMul).toBe(1);
    expect(HULL_TIERS[0].turnMul).toBe(1);
    expect(RIG_TIERS[0].speedMul).toBe(1);
  });

  it("every tier carries a translation key", () => {
    for (const tier of [...HULL_TIERS, ...RIG_TIERS]) {
      expect(tier.nameKey).toMatch(/^damage\.(hull|rig)\./);
    }
  });
});

describe("hullCondition", () => {
  it("names each stage at its own boundary", () => {
    expect(hullCondition(HULL_MAX, HULL_MAX)).toBe("sound");
    expect(hullCondition(hp(0.75), HULL_MAX)).toBe("sound");
    expect(hullCondition(hp(0.50), HULL_MAX)).toBe("leaking");
    expect(hullCondition(hp(0.25), HULL_MAX)).toBe("crippled");
    expect(hullCondition(1, HULL_MAX)).toBe("foundering");
  });

  it("a single point of hull below a boundary drops a stage", () => {
    expect(hullCondition(hp(0.75) - 0.001, HULL_MAX)).toBe("leaking");
    expect(hullCondition(hp(0.50) - 0.001, HULL_MAX)).toBe("crippled");
    expect(hullCondition(hp(0.25) - 0.001, HULL_MAX)).toBe("foundering");
  });

  it("zero hull is sunk, not merely foundering", () => {
    expect(hullCondition(0, HULL_MAX)).toBe("sunk");
    expect(hullCondition(-5, HULL_MAX)).toBe("sunk");
  });

  it("scales with the ship, not with absolute hit points", () => {
    // A galleon at 50 hull is crippled; a pinnace at 50 hull is untouched.
    expect(hullCondition(50, 180)).toBe("crippled");
    expect(hullCondition(50, 50)).toBe("sound");
  });

  it("treats a hull with no maximum as sunk rather than dividing by zero", () => {
    expect(hullCondition(0, 0)).toBe("sunk");
    expect(hullCondition(10, 0)).toBe("foundering");
  });
});

describe("rigCondition", () => {
  it("names each stage at its own boundary", () => {
    expect(rigCondition(SAILS_MAX, SAILS_MAX)).toBe("full");
    expect(rigCondition(sails(0.75), SAILS_MAX)).toBe("full");
    expect(rigCondition(sails(0.40), SAILS_MAX)).toBe("torn");
    expect(rigCondition(sails(0.10), SAILS_MAX)).toBe("tattered");
    expect(rigCondition(sails(0.05), SAILS_MAX)).toBe("dismasted");
    expect(rigCondition(0, SAILS_MAX)).toBe("dismasted");
  });

  it("chain shot walks the rig down stage by stage", () => {
    const seen: string[] = [];
    for (let hpLeft = SAILS_MAX; hpLeft >= 0; hpLeft -= 1) {
      const c = rigCondition(hpLeft, SAILS_MAX);
      if (seen[seen.length - 1] !== c) seen.push(c);
    }
    expect(seen).toEqual(["full", "torn", "tattered", "dismasted"]);
  });
});

describe("speed and turn multipliers", () => {
  it("an untouched ship sails at full speed", () => {
    expect(damageSpeedMultiplier(HULL_MAX, HULL_MAX, SAILS_MAX, SAILS_MAX)).toBe(1);
    expect(damageTurnMultiplier(HULL_MAX, HULL_MAX)).toBe(1);
  });

  it("hull and rig damage stack", () => {
    const hullOnly = damageSpeedMultiplier(hp(0.3), HULL_MAX, SAILS_MAX, SAILS_MAX);
    const rigOnly = damageSpeedMultiplier(HULL_MAX, HULL_MAX, sails(0.5), SAILS_MAX);
    const both = damageSpeedMultiplier(hp(0.3), HULL_MAX, sails(0.5), SAILS_MAX);
    expect(both).toBeLessThan(hullOnly);
    expect(both).toBeLessThan(rigOnly);
    expect(both).toBeCloseTo(hullOnly * rigOnly, 10);
  });

  it("a dismasted ship makes no way at all, however sound the hull", () => {
    expect(damageSpeedMultiplier(HULL_MAX, HULL_MAX, 0, SAILS_MAX)).toBe(0);
    expect(isDismasted(0, SAILS_MAX)).toBe(true);
  });

  it("but a dismasted ship still answers the helm as it drifts", () => {
    expect(damageTurnMultiplier(HULL_MAX, HULL_MAX)).toBeGreaterThan(0);
  });

  it("speed never rises as damage accumulates", () => {
    let prev = Infinity;
    for (let hpLeft = HULL_MAX; hpLeft >= 1; hpLeft -= 1) {
      const mul = damageSpeedMultiplier(hpLeft, HULL_MAX, SAILS_MAX, SAILS_MAX);
      expect(mul).toBeLessThanOrEqual(prev);
      prev = mul;
    }
  });

  it("a sunk hull produces no drive and no steering", () => {
    expect(hullTier(0, HULL_MAX).speedMul).toBe(0);
    expect(hullTier(0, HULL_MAX).turnMul).toBe(0);
  });

  it("multipliers stay inside 0..1 for every combination", () => {
    for (let h = 0; h <= HULL_MAX; h += 3) {
      for (let s = 0; s <= SAILS_MAX; s += 5) {
        const mul = damageSpeedMultiplier(h, HULL_MAX, s, SAILS_MAX);
        expect(mul).toBeGreaterThanOrEqual(0);
        expect(mul).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("mapDamageSpeedMultiplier — the map never strands you", () => {
  it("matches the battle multiplier while the rig still draws", () => {
    for (const sailFrac of [1, 0.8, 0.5, 0.2]) {
      const s = sails(sailFrac);
      expect(mapDamageSpeedMultiplier(hp(0.6), HULL_MAX, s, SAILS_MAX))
        .toBeCloseTo(damageSpeedMultiplier(hp(0.6), HULL_MAX, s, SAILS_MAX), 10);
    }
  });

  it("a dismasted ship crawls on the map instead of stopping dead", () => {
    expect(damageSpeedMultiplier(HULL_MAX, HULL_MAX, 0, SAILS_MAX)).toBe(0);
    expect(mapDamageSpeedMultiplier(HULL_MAX, HULL_MAX, 0, SAILS_MAX)).toBe(MAP_DISMASTED_CRAWL);
  });

  it("the crawl is slow enough to hurt", () => {
    expect(MAP_DISMASTED_CRAWL).toBeGreaterThan(0);
    expect(MAP_DISMASTED_CRAWL).toBeLessThan(0.3);
  });

  it("no combination of damage can strand a ship that is still afloat", () => {
    for (let h = 1; h <= HULL_MAX; h += 1) {
      for (let s = 0; s <= SAILS_MAX; s += 5) {
        expect(mapDamageSpeedMultiplier(h, HULL_MAX, s, SAILS_MAX)).toBeGreaterThan(0);
      }
    }
  });

  it("but a sunk hull makes no way at all", () => {
    expect(mapDamageSpeedMultiplier(0, HULL_MAX, SAILS_MAX, SAILS_MAX)).toBe(0);
  });
});

describe("foundering and flooding", () => {
  it("only a hull below the threshold takes water", () => {
    expect(isFoundering(hp(FOUNDERING_THRESHOLD), HULL_MAX)).toBe(false);
    expect(isFoundering(hp(FOUNDERING_THRESHOLD) - 0.001, HULL_MAX)).toBe(true);
    expect(isFoundering(0, HULL_MAX)).toBe(false); // already sunk
  });

  it("a sound hull is untouched by the flooding pass", () => {
    expect(applyFlooding(HULL_MAX, HULL_MAX, 20)).toBe(HULL_MAX);
    expect(applyFlooding(hp(0.5), HULL_MAX, 20)).toBe(hp(0.5));
  });

  it("a foundering hull loses ground every tick", () => {
    const start = hp(0.2);
    const after = applyFlooding(start, HULL_MAX, 1);
    expect(after).toBeLessThan(start);
    expect(after).toBeCloseTo(start - HULL_MAX * FOUNDERING_HULL_LOSS_PER_TICK, 10);
  });

  it("flooding scales with the tick delta", () => {
    const one = hp(0.2) - applyFlooding(hp(0.2), HULL_MAX, 1);
    const ten = hp(0.2) - applyFlooding(hp(0.2), HULL_MAX, 10);
    expect(ten).toBeCloseTo(one * 10, 10);
  });

  it("a ship left alone at the threshold goes down in well under two minutes", () => {
    let hull = hp(FOUNDERING_THRESHOLD) - 0.001;
    let ticks = 0;
    while (hull > 0 && ticks < 20 * 120) {
      hull = applyFlooding(hull, HULL_MAX, 1);
      ticks++;
    }
    expect(hull).toBe(0);
    expect(ticks / 20).toBeLessThan(60); // seconds at 20 ticks/s
    expect(ticks / 20).toBeGreaterThan(5); // long enough to try to break off
  });

  it("flooding stops at zero rather than going negative", () => {
    expect(applyFlooding(0.0001, HULL_MAX, 10_000)).toBe(0);
  });

  it("a negative delta cannot repair a ship", () => {
    const start = hp(0.2);
    expect(applyFlooding(start, HULL_MAX, -50)).toBe(start);
  });
});

describe("sinking aftermath and FX hints", () => {
  it("a full crew saves more of the hold than a decimated one", () => {
    expect(cargoSurvivingSinking(1)).toBeGreaterThan(cargoSurvivingSinking(0));
  });

  it("most of the cargo is always lost", () => {
    for (const crew of [0, 0.5, 1]) {
      expect(cargoSurvivingSinking(crew)).toBeLessThan(0.5);
      expect(cargoSurvivingSinking(crew)).toBeGreaterThan(0);
    }
  });

  it("clamps a nonsense crew fraction", () => {
    expect(cargoSurvivingSinking(-3)).toBe(cargoSurvivingSinking(0));
    expect(cargoSurvivingSinking(9)).toBe(cargoSurvivingSinking(1));
  });

  it("visual severity runs from nothing to everything", () => {
    expect(damageVisualSeverity(HULL_MAX, HULL_MAX)).toBe(0);
    expect(damageVisualSeverity(0, HULL_MAX)).toBe(1);
    expect(damageVisualSeverity(hp(0.5), HULL_MAX)).toBeCloseTo(0.5, 10);
  });

  it("severity rises monotonically as the hull is beaten in", () => {
    let prev = -1;
    for (let hpLeft = HULL_MAX; hpLeft >= 0; hpLeft -= 1) {
      const sev = damageVisualSeverity(hpLeft, HULL_MAX);
      expect(sev).toBeGreaterThanOrEqual(prev);
      prev = sev;
    }
  });
});

describe("tier lookup helpers", () => {
  it("hullTier and hullCondition never disagree", () => {
    for (let hpLeft = 0; hpLeft <= HULL_MAX; hpLeft += 1) {
      const cond = hullCondition(hpLeft, HULL_MAX);
      if (cond === "sunk") continue;
      expect(hullTier(hpLeft, HULL_MAX).id).toBe(cond);
    }
  });

  it("rigTier and rigCondition never disagree", () => {
    for (let hpLeft = 0; hpLeft <= SAILS_MAX; hpLeft += 1) {
      expect(rigTier(hpLeft, SAILS_MAX).id).toBe(rigCondition(hpLeft, SAILS_MAX));
    }
  });
});
