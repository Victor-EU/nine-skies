import { describe, expect, it } from "vitest";
import { GOOD_FIT_R2, linearity, lowest, type GpuTimer } from "../../engine/src/gfx/gpuTimer.js";

/**
 * The instrument's own tests.
 *
 * These have no GPU and need none: what is being checked is whether the fit
 * and the estimator behave when handed timings of a known shape. That is the
 * half that can be wrong silently. A timer that reports nonsense is caught by
 * `linearity` at capture time; `linearity` reporting a good fit for nonsense
 * would not be caught by anything, which is what these are for.
 */

/**
 * A timer whose readings are a stated function of the work handed to it:
 * `overheadMs` once, plus `msPerDraw` for every call the work makes, plus
 * whatever the noise sequence says next.
 */
function syntheticTimer(
  msPerDraw: number,
  overheadMs: number,
  noise: readonly number[] = [0],
): { timer: GpuTimer; draw: (load: number) => void } {
  let calls = 0;
  let sample = 0;
  return {
    draw: (load: number) => {
      calls += load;
    },
    timer: {
      async time(work: () => void) {
        calls = 0;
        work();
        const added = noise[sample++ % noise.length]!;
        return overheadMs + calls * msPerDraw + added;
      },
    },
  };
}

/** The load axis the fit is taken over; any increasing series will do. */
const LOADS = [1, 2, 4, 8, 16];

describe("the GPU timer's instrument check", () => {
  it("recovers the cost per draw and the cost per pass", async () => {
    const { timer, draw } = syntheticTimer(0.7, 0.5);
    const fit = await linearity(timer, draw, LOADS, 3);
    expect(fit).not.toBeNull();
    expect(fit!.msPerUnit).toBeCloseTo(0.7, 6);
    expect(fit!.overheadMs).toBeCloseTo(0.5, 6);
    expect(fit!.r2).toBeCloseTo(1, 6);
  });

  it("refuses a timer that reports the same number whatever it is given", async () => {
    // The failure the check exists for: a reading that looks like a plausible
    // millisecond count and is not a measurement of anything.
    const { timer, draw } = syntheticTimer(0, 3);
    const fit = await linearity(timer, draw, LOADS, 3);
    expect(fit!.msPerUnit).toBeCloseTo(0, 6);
    expect(fit!.r2).toBeLessThan(GOOD_FIT_R2);
  });

  it("reports a poor fit when the readings are unrelated to the work", async () => {
    const { timer, draw } = syntheticTimer(0, 1, [0, 9, 1, 7, 2]);
    const fit = await linearity(timer, draw, LOADS, 1);
    expect(fit!.r2).toBeLessThan(GOOD_FIT_R2);
  });

  it("survives a one-sided noise tail, because it fits the floor", async () => {
    // Contention only ever adds. With enough samples the minimum sees through
    // it, and the fit through the minima is the clean one.
    const { timer, draw } = syntheticTimer(0.7, 0.5, [0, 4, 2, 9, 3, 6]);
    const fit = await linearity(timer, draw, LOADS, 6);
    expect(fit!.msPerUnit).toBeCloseTo(0.7, 6);
    expect(fit!.r2).toBeCloseTo(1, 6);
  });

  it("gives up rather than inventing a number when nothing resolves", async () => {
    const dead: GpuTimer = { time: async () => null };
    expect(await lowest(dead, () => {}, 5)).toBeNull();
    expect(await linearity(dead, () => {}, LOADS, 5)).toBeNull();
  });
});

describe("lowest", () => {
  it("takes the floor of the samples, not their middle", async () => {
    const readings = [5, 5, 5, 0.5, 5, 5];
    let i = 0;
    const timer: GpuTimer = { time: async () => readings[i++]! };
    // The median of these is 5, which is ten times the truth.
    expect(await lowest(timer, () => {}, readings.length)).toBe(0.5);
  });

  it("ignores samples that did not resolve", async () => {
    const readings: (number | null)[] = [null, 2, null, 1.5];
    let i = 0;
    const timer: GpuTimer = { time: async () => readings[i++]! };
    expect(await lowest(timer, () => {}, readings.length)).toBe(1.5);
  });
});
