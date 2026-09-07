import { describe, it, expect } from "vitest";
import {
  MANNING_TIERS,
  PRESS_SHARE,
  PRESSED_MORALE,
  workingMinimum,
  manningFraction,
  manningCondition,
  manningSpeedMultiplier,
  manningTurnMultiplier,
  manningHandlingMultiplier,
  isShortHanded,
  spareHands,
  manPrize,
} from "../CrewSystem.ts";
import { SHIP_CLASSES } from "../../data/ships.ts";

describe("the working minimum", () => {
  it("is the class's own crewMin", () => {
    expect(workingMinimum("galleon")).toBe(SHIP_CLASSES.galleon.crewMin);
    expect(workingMinimum("pinnace")).toBe(SHIP_CLASSES.pinnace.crewMin);
  });

  it("is nothing for a class nobody knows, so an odd hull sails as it always did", () => {
    expect(workingMinimum("dutch_east_indiaman")).toBe(0);
    expect(manningFraction(0, "dutch_east_indiaman")).toBe(1);
    expect(manningSpeedMultiplier(0, "dutch_east_indiaman")).toBe(1);
  });
});

describe("the neutral is 'fully manned', and everything already afloat is above it", () => {
  it("leaves every NPC untouched — they spawn at 0.7 x crewMax", () => {
    for (const [id, cls] of Object.entries(SHIP_CLASSES)) {
      const npcCrew = Math.round(cls.crewMax * 0.7);
      expect(manningCondition(npcCrew, id), id).toBe("full");
      expect(manningSpeedMultiplier(npcCrew, id), id).toBe(1);
      expect(manningTurnMultiplier(npcCrew, id), id).toBe(1);
      expect(manningHandlingMultiplier(npcCrew, id), id).toBe(1);
    }
  });

  it("leaves every consort from a save written before this release untouched (0.8 x crewMax)", () => {
    for (const [id, cls] of Object.entries(SHIP_CLASSES)) {
      expect(manningCondition(Math.round(cls.crewMax * 0.8), id), id).toBe("full");
    }
  });

  it("leaves the player's starting sloop untouched", () => {
    expect(manningCondition(SHIP_CLASSES.sloop.crewMax, "sloop")).toBe("full");
    expect(isShortHanded(SHIP_CLASSES.sloop.crewMax, "sloop")).toBe(false);
  });

  it("is exactly full at crewMin — the surplus is what she can spare, not what she needs", () => {
    expect(manningCondition(SHIP_CLASSES.galleon.crewMin, "galleon")).toBe("full");
    expect(manningSpeedMultiplier(SHIP_CLASSES.galleon.crewMin, "galleon")).toBe(1);
    expect(manningCondition(SHIP_CLASSES.galleon.crewMin - 1, "galleon")).not.toBe("full");
  });
});

describe("the tiers", () => {
  it("are ordered best-first and never rise as the crew thins", () => {
    for (let i = 1; i < MANNING_TIERS.length; i++) {
      expect(MANNING_TIERS[i].minFrac).toBeLessThan(MANNING_TIERS[i - 1].minFrac);
      expect(MANNING_TIERS[i].speedMul).toBeLessThan(MANNING_TIERS[i - 1].speedMul);
      expect(MANNING_TIERS[i].turnMul).toBeLessThan(MANNING_TIERS[i - 1].turnMul);
      expect(MANNING_TIERS[i].handlingMul).toBeGreaterThan(MANNING_TIERS[i - 1].handlingMul);
    }
  });

  it("cost her handling before they cost her speed", () => {
    // The claim the whole design rests on: a skeleton crew can keep the courses
    // drawing, but cannot brace round. Turn falls at least twice as far as speed.
    for (const tier of MANNING_TIERS.slice(1)) {
      const speedLoss = 1 - tier.speedMul;
      const turnLoss = 1 - tier.turnMul;
      expect(turnLoss, tier.id).toBeGreaterThanOrEqual(speedLoss * 2);
    }
  });

  it("never stop a ship dead — the same rule as a dismasted hull on the map", () => {
    for (const tier of MANNING_TIERS) {
      expect(tier.speedMul).toBeGreaterThan(0);
      expect(tier.turnMul).toBeGreaterThan(0);
    }
    expect(manningSpeedMultiplier(1, "galleon")).toBeGreaterThan(0);
  });

  it("puts a galleon worked by a sloop's spare hands in the skeleton tier", () => {
    // 16 men against a galleon's 40 = 0.40, which is the measured headline case.
    expect(manningCondition(16, "galleon")).toBe("skeleton");
  });

  it("makes a skeleton-crewed galleon slower than the slowest hull in the game", () => {
    const galleon = SHIP_CLASSES.galleon.speedBase * manningSpeedMultiplier(16, "galleon");
    expect(galleon).toBeLessThan(SHIP_CLASSES.barque.speedBase);
    expect(galleon).toBeGreaterThan(SHIP_CLASSES.merchantman.speedBase);
  });
});

describe("spareHands", () => {
  it("is the surplus above her own working minimum, nothing more", () => {
    expect(spareHands(24, "sloop")).toBe(24 - SHIP_CLASSES.sloop.crewMin);
    expect(spareHands(SHIP_CLASSES.sloop.crewMin, "sloop")).toBe(0);
    expect(spareHands(2, "sloop")).toBe(0);
  });

  it("never counts a fraction of a man", () => {
    expect(Number.isInteger(spareHands(24.7, "sloop"))).toBe(true);
  });
});

describe("manning a prize", () => {
  it("takes the crew off the flagship — it does not conjure one", () => {
    const r = manPrize(24, "sloop", "brigantine", 0);
    expect(r.manned).toBe(true);
    expect(r.prizeCrew).toBe(SHIP_CLASSES.brigantine.crewMin);
    expect(r.fromOwn).toBe(SHIP_CLASSES.brigantine.crewMin);
    expect(r.pressed).toBe(0);
    // Every man aboard her left the flagship.
    expect(r.flagshipCrew).toBe(24 - r.fromOwn);
    expect(r.flagshipCrew + r.prizeCrew).toBe(24);
  });

  it("never leaves the flagship short of her own working minimum", () => {
    const r = manPrize(24, "sloop", "galleon", 0);
    expect(r.flagshipCrew).toBe(SHIP_CLASSES.sloop.crewMin);
    expect(manningCondition(r.flagshipCrew, "sloop")).toBe("full");
  });

  it("hands a sloop's captain a galleon he cannot work — the point of the release", () => {
    const r = manPrize(24, "sloop", "galleon", 0);
    expect(r.prizeCrew).toBeLessThan(SHIP_CLASSES.galleon.crewMin);
    expect(manningCondition(r.prizeCrew, "galleon")).toBe("skeleton");
  });

  it("lets a frigate's captain man anything she takes", () => {
    for (const id of Object.keys(SHIP_CLASSES)) {
      if (id === "frigate") continue;
      const r = manPrize(Math.round(SHIP_CLASSES.frigate.crewMax * 0.8), "frigate", id, 0);
      expect(manningCondition(r.prizeCrew, id), id).not.toBe("unworkable");
    }
  });

  it("makes up the shortfall from prisoners, but only half of them will serve", () => {
    const prisoners = 40;
    const r = manPrize(24, "sloop", "galleon", prisoners);
    const shortfall = SHIP_CLASSES.galleon.crewMin - r.fromOwn;
    expect(r.pressed).toBe(Math.min(shortfall, Math.floor(prisoners * PRESS_SHARE)));
    expect(r.prizeCrew).toBe(r.fromOwn + r.pressed);
  });

  it("never presses more men than she has berths' worth of work for", () => {
    const r = manPrize(96, "galleon", "sloop", 200);
    expect(r.prizeCrew).toBe(SHIP_CLASSES.sloop.crewMin);
    expect(r.pressed).toBe(0);
  });

  it("gives a prize crew of pressed men a mood between yours and theirs", () => {
    const r = manPrize(24, "sloop", "galleon", 60, 0.9);
    expect(r.pressed).toBeGreaterThan(0);
    expect(r.prizeMorale).toBeLessThan(0.9);
    expect(r.prizeMorale).toBeGreaterThan(PRESSED_MORALE);
    // Weighted by heads, not averaged between two sides.
    const expected = (r.fromOwn * 0.9 + r.pressed * PRESSED_MORALE) / r.prizeCrew;
    expect(r.prizeMorale).toBeCloseTo(expected, 6);
  });

  it("gives a prize crewed entirely from your own people your own mood", () => {
    const r = manPrize(96, "galleon", "sloop", 50, 0.75);
    expect(r.pressed).toBe(0);
    expect(r.prizeMorale).toBeCloseTo(0.75, 6);
  });

  it("refuses a hull nobody at all can be put aboard", () => {
    const r = manPrize(SHIP_CLASSES.sloop.crewMin, "sloop", "galleon", 0);
    expect(r.manned).toBe(false);
    expect(r.prizeCrew).toBe(0);
    // And the flagship keeps every man she had.
    expect(r.flagshipCrew).toBe(SHIP_CLASSES.sloop.crewMin);
  });

  it("takes her anyway when the crew is thin but not absent", () => {
    const r = manPrize(SHIP_CLASSES.sloop.crewMin + 1, "sloop", "galleon", 0);
    expect(r.manned).toBe(true);
    expect(r.prizeCrew).toBe(1);
    expect(manningCondition(1, "galleon")).toBe("unworkable");
  });

  it("is conservative about the men — none appear and none vanish", () => {
    for (const prizeId of Object.keys(SHIP_CLASSES)) {
      const r = manPrize(50, "brigantine", prizeId, 0);
      expect(r.flagshipCrew + r.fromOwn, prizeId).toBe(50);
    }
  });
});
