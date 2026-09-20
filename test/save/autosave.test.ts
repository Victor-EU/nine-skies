/**
 * When a profile is written (F39): every fifteen seconds, and on every beat.
 */
import { describe, expect, it } from "vitest";
import { Autosave, AUTOSAVE_INTERVAL_S } from "../../engine/src/save/autosave.js";
import { MODE_GROUND_KM_PER_MIN } from "../../engine/src/sim/scale.js";

describe("autosave", () => {
  it("writes once and then not again until the interval is up", () => {
    const save = new Autosave();
    expect(save.due(0)).toBe(true);
    expect(save.due(5)).toBe(false);
    expect(save.due(14.9)).toBe(false);
    expect(save.due(15)).toBe(true);
    expect(save.due(29.9)).toBe(false);
  });

  it("always writes a beat, and always writes on the way out", () => {
    const save = new Autosave();
    save.due(0);
    expect(save.due(1, "beat")).toBe(true);
    // The beat reset the clock, so the next tick is fifteen from there.
    expect(save.due(15, "tick")).toBe(false);
    expect(save.due(16, "tick")).toBe(true);
    expect(save.due(16.1, "leaving")).toBe(true);
  });

  it("is a clock rather than a distance, which is what makes it fair", () => {
    // Fifteen seconds is 10.8 km at `low` and 65.0 at boost, and costs the
    // player the same quarter of a minute in both.
    expect(AUTOSAVE_INTERVAL_S).toBe(15);
    const perSave = (mode: "low" | "cruise" | "boost") =>
      (MODE_GROUND_KM_PER_MIN[mode] * AUTOSAVE_INTERVAL_S) / 60;
    expect(perSave("low")).toBeCloseTo(10.8, 1);
    expect(perSave("cruise")).toBeCloseTo(32.5, 1);
    expect(perSave("boost")).toBeCloseTo(65.0, 1);
  });

  it("reports how stale the save is, for a HUD that has to say so", () => {
    const save = new Autosave();
    expect(save.sinceS(0)).toBe(Infinity);
    save.due(100);
    expect(save.sinceS(107)).toBe(7);
  });
});
