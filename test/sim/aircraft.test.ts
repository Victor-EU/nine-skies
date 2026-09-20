import { describe, expect, it } from "vitest";
import {
  LIGHT_PISTON,
  bestClimbTasMs,
  ceilingM,
  maxClimbRateMs,
  maxLoadFactor,
  trueAirspeedMs,
  turnRadiusM,
} from "../../engine/src/sim/aircraft.js";
import { MODE_IAS_MS, groundGain } from "../../engine/src/sim/scale.js";

const AC = LIGHT_PISTON;

describe("climb performance", () => {
  const EXPECTED = [
    [0, 7.11],
    [1000, 5.89],
    [2000, 4.74],
    [3000, 3.65],
    [4000, 2.61],
    [4500, 2.11],
    [5000, 1.62],
    [5500, 1.15],
    [6000, 0.68],
  ] as const;

  it.each(EXPECTED)("best rate of climb at %i m", (alt, roc) => {
    expect(maxClimbRateMs(AC, alt)).toBeCloseTo(roc, 2);
  });

  it("falls by 70 % between the coast and the plateau", () => {
    const coast = maxClimbRateMs(AC, 0);
    const plateau = maxClimbRateMs(AC, 4500);
    expect(plateau / coast).toBeLessThan(0.32);
    expect(plateau / coast).toBeGreaterThan(0.28);
  });

  it("needs a faster true airspeed to climb best as it gets higher", () => {
    expect(bestClimbTasMs(AC, 0)).toBeCloseTo(32.0, 1);
    expect(bestClimbTasMs(AC, 5000)).toBeGreaterThan(bestClimbTasMs(AC, 0));
  });
});

/**
 * These four assertions are the reason the aircraft is tuned the way it is.
 * They are geography tests wearing a performance costume: if the ceiling
 * drifts, Expedition 7 stops working and Everest stops being a wall.
 */
describe("the ceiling is a teaching tool", () => {
  it("sits just above Everest base camp", () => {
    const ceiling = ceilingM(AC);
    expect(ceiling).toBeGreaterThan(5150); // north base camp
    expect(ceiling).toBeLessThan(7000);
    expect(ceiling).toBeCloseTo(6197, -2);
  });

  it("lets the player reach Namtso and base camp, the two places the route goes", () => {
    expect(maxClimbRateMs(AC, 4718)).toBeGreaterThan(0.5); // Namtso
    expect(maxClimbRateMs(AC, 5150)).toBeGreaterThan(0.5); // Everest base camp
  });

  it("cannot get anywhere near the summit of Everest", () => {
    // A light piston single cannot fly over Everest. Neither can this one,
    // so the player looks up at it, which is the correct experience.
    expect(maxClimbRateMs(AC, 8849)).toBeLessThanOrEqual(0);
  });

  it("makes the plateau flyable but a struggle", () => {
    const roc = maxClimbRateMs(AC, 4500);
    expect(roc).toBeGreaterThan(1.5); // you can still climb
    expect(roc).toBeLessThan(3.0); // but you will notice it
  });
});

describe("turns widen with altitude", () => {
  const cruise = MODE_IAS_MS.cruise;

  it("cruise radius grows by half again over the plateau", () => {
    const coast = turnRadiusM(AC, 0, trueAirspeedMs(cruise, 0));
    const plateau = turnRadiusM(AC, 4500, trueAirspeedMs(cruise, 4500));
    expect(coast).toBeCloseTo(141, -1);
    expect(plateau).toBeCloseTo(222, -1);
    expect(plateau / coast).toBeGreaterThan(1.5);
  });

  it("low mode turns tightest, which is what gorges need", () => {
    const low = turnRadiusM(AC, 0, trueAirspeedMs(MODE_IAS_MS.low, 0));
    const cr = turnRadiusM(AC, 0, trueAirspeedMs(cruise, 0));
    expect(low).toBeLessThan(cr);
    expect(low).toBeCloseTo(99, -1);
  });

  it("is lift-limited slow and comfort-limited fast", () => {
    const slow = maxLoadFactor(AC, 0, trueAirspeedMs(MODE_IAS_MS.low, 0));
    const fast = maxLoadFactor(AC, 0, trueAirspeedMs(cruise, 0));
    expect(slow).toBeLessThan(AC.loadFactorCap);
    expect(fast).toBeCloseTo(AC.loadFactorCap, 6);
  });
});

describe("ground speed matches the GDD's table", () => {
  it("cruises at 130 real km per minute at sea level", () => {
    const kmPerMin = (trueAirspeedMs(MODE_IAS_MS.cruise, 0) * groundGain("cruise") * 60) / 1000;
    expect(kmPerMin).toBeCloseTo(130, 6);
  });

  it("boost doubles cruise and low is a third of it", () => {
    const at = (m: "low" | "cruise" | "boost") =>
      (trueAirspeedMs(MODE_IAS_MS[m], 0) * groundGain(m) * 60) / 1000;
    expect(at("boost") / at("cruise")).toBeCloseTo(2, 6);
    expect(at("low") / at("cruise")).toBeCloseTo(1 / 3, 6);
  });

  it("crosses the plateau faster over the ground than the coast", () => {
    // True airspeed rises as 1/sqrt(sigma), so the same indicated airspeed
    // covers more ground up high. Fast across, slow upwards.
    const coast = trueAirspeedMs(MODE_IAS_MS.cruise, 0) * groundGain("cruise");
    const plateau = trueAirspeedMs(MODE_IAS_MS.cruise, 4500) * groundGain("cruise");
    expect((plateau * 60) / 1000).toBeCloseTo(163, 0);
    expect(plateau).toBeGreaterThan(coast);
  });
});
