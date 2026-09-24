import { describe, it, expect } from "vitest";
import { saveTitleDay } from "../SaveSchema.ts";

describe("saveTitleDay", () => {
  it("reads the day out of the title every save has carried", () => {
    // `Day N` is what the save tab writes, in English, in both languages;
    // printed as it stood it made `Slot 1: Dzień Day 1` (v0.96.0).
    expect(saveTitleDay("Day 1")).toBe(1);
    expect(saveTitleDay("Day 347")).toBe(347);
  });

  it("falls back to the first day on a title with no number", () => {
    expect(saveTitleDay("")).toBe(1);
    expect(saveTitleDay("Day")).toBe(1);
    expect(saveTitleDay("Day 0")).toBe(1);
  });
});
