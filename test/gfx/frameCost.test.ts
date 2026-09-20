import { describe, expect, it } from "vitest";
import {
  MIN_FRAME_RATE_HZ,
  resolutionMs,
  tooSlowToMeasure,
  type FrameCostReport,
  type StationCost,
} from "../../app/src/frameCost.js";

/**
 * The two rules in the capture that can be checked without a GPU.
 *
 * Both exist because of something that actually happened. The frame-rate
 * guard was written after a capture in a throttled window spent twenty
 * minutes looking exactly like a hang; the resolution figure was written
 * after a table of pass costs came back with negative entries and no way for
 * a reader to tell "faster than nothing" from "below the noise".
 */

const station = (id: string, clear: number): StationCost => ({
  station: { id, km: 0, eastM: 0, northM: 0, altitudeM: 1000, headingRad: 0, groundM: 0, why: "" },
  drawCalls: 3,
  instances: 137,
  triangles: 261_000,
  resident: 256,
  missing: 0,
  ms: { clear, terrain: clear + 0.3, all: clear + 0.4 },
  perLod: [9, 60, 68, 0],
});

const report = (clears: number[]): FrameCostReport => ({
  renderer: "test",
  vendor: "test",
  width: 1920,
  height: 1080,
  devicePixelRatio: 1,
  frameRateHz: 60,
  samples: 20,
  expedition: "sea-to-sky",
  only: null,
  takenAt: "2026-01-01T00:00:00.000Z",
  instrument: null,
  stations: clears.map((c, i) => station(`s${i}`, c)),
});

describe("refusing to measure in a throttled window", () => {
  it("allows a window that is drawing at a normal rate", () => {
    expect(tooSlowToMeasure(60)).toBeNull();
    expect(tooSlowToMeasure(MIN_FRAME_RATE_HZ)).toBeNull();
  });

  it("refuses a hidden tab, and says how long it would have taken", () => {
    // The rate a browser throttles a background tab to.
    const refusal = tooSlowToMeasure(1.4);
    expect(refusal).not.toBeNull();
    expect(refusal).toContain("1.4 Hz");
    expect(refusal).toMatch(/\d+ seconds per station/);
  });

  it("does not divide by a frame rate of zero", () => {
    expect(tooSlowToMeasure(0)).toContain("0.0 Hz");
  });
});

describe("what a capture can resolve", () => {
  it("is the spread of the one pass that is identical at every station", () => {
    // `clear` is an empty scene at a fixed size: any spread in it is the
    // instrument, so a 0.3 ms difference elsewhere has not been measured.
    expect(resolutionMs(report([0.52, 0.58, 0.84, 0.53]))).toBeCloseTo(0.32, 6);
  });

  it("says nothing rather than zero when there is only one station", () => {
    expect(resolutionMs(report([0.52]))).toBeNaN();
  });
});
