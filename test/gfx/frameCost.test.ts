import { describe, expect, it } from "vitest";
import {
  MIN_FRAME_RATE_HZ,
  SETTLE_QUIET_FRAMES,
  frameCostTable,
  quietFrame,
  resolutionMs,
  settle,
  tooSlowToMeasure,
  type FrameCostReport,
  type SettleStats,
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
  whole: true,
  settleMs: 400,
  ms: { clear, terrain: clear + 0.3, all: clear + 0.4 },
  perLod: [9, 60, 68, 0],
  bucketLabels: ["L0", "L1", "L2", "L3"],
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

  it("prints why, rather than NaN, in the table for one station", () => {
    // A hand capture at one station printed `±NaN ms` (F34).
    const table = frameCostTable(report([1.7]));
    expect(table).not.toContain("NaN");
    expect(table).toContain("NOT MEASURED");
    expect(frameCostTable(report([0.52, 0.84]))).toContain("±0.32 ms");
  });
});

/**
 * A streamed world as the settle sees it: tiles are asked for when the
 * station is placed, land a few frames later, and are only inserted - and
 * counted - by the next placing. Without placing, nothing changes.
 */
function streamedWorld(tiles: number, perFrame: number, water = true) {
  let asked = false;
  let landed = 0;
  let inserted = 0;
  let waterLanded = 0;
  const stats: { -readonly [K in keyof SettleStats]: number } = {
    generatedThisFrame: 0,
    pending: 0,
    waterPending: 0,
    missing: tiles,
  };
  return {
    stats: () => stats,
    place: () => {
      asked = true;
      stats.generatedThisFrame = landed - inserted;
      inserted = landed;
      stats.missing = tiles - inserted;
      stats.pending = tiles - landed;
      stats.waterPending = water ? inserted - waterLanded : 0;
    },
    frame: async () => {
      if (!asked) return;
      landed = Math.min(tiles, landed + perFrame);
      waterLanded = inserted;
    },
  };
}

describe("the settle before a station is timed", () => {
  const clock = () => {
    let t = 0;
    return { now: () => t, tick: (ms: number) => (t += ms) };
  };

  it("is quiet only when nothing is missing, landing or in flight, water included", () => {
    const done = { generatedThisFrame: 0, pending: 0, waterPending: 0, missing: 0 };
    expect(quietFrame(done)).toBe(true);
    // F80: nothing in flight is not the same as nothing missing.
    expect(quietFrame({ ...done, missing: 52 })).toBe(false);
    expect(quietFrame({ ...done, waterPending: 3 })).toBe(false);
    expect(quietFrame({ ...done, generatedThisFrame: 1 })).toBe(false);
  });

  it("places the station every frame, and waits for the last tile and its water", async () => {
    const world = streamedWorld(137, 10);
    const c = clock();
    const r = await settle(world.stats, world.place, () => {}, async () => { c.tick(16); await world.frame(); }, c.now);
    expect(r.whole).toBe(true);
    expect(r.missing).toBe(0);
    // Fourteen frames for the tiles to land, one to insert the last, one for its water, then the quiet ones.
    expect(r.frames).toBeGreaterThanOrEqual(Math.ceil(137 / 10) + SETTLE_QUIET_FRAMES);
  });

  it("says a station is not whole when the world never arrives, and stops at the limit", async () => {
    const world = streamedWorld(137, 0);
    const c = clock();
    const r = await settle(world.stats, world.place, () => {}, async () => { c.tick(1000); await world.frame(); }, c.now, 5_000);
    expect(r.whole).toBe(false);
    expect(r.missing).toBe(137);
    expect(r.ms).toBeGreaterThanOrEqual(5_000);
  });

  it("marks a station that is not whole in the table", () => {
    const r = report([1.0, 1.1]);
    const half = { ...r, stations: [r.stations[0]!, { ...r.stations[1]!, whole: false, missing: 52, settleMs: 30_000 }] };
    expect(frameCostTable(half)).toContain("NOT WHOLE — 52 tiles missing after 30 s");
    expect(frameCostTable(r)).not.toContain("NOT WHOLE");
  });
});

