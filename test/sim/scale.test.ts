import { describe, expect, it } from "vitest";
import {
  CRUISE_CANDIDATES,
  DEFAULT_PACING,
  MODE_GROUND_KM_PER_MIN,
  MODE_IAS_MS,
  MODE_SPEED_RATIO,
  groundGain,
  groundKmPerMin,
  minutesForKm,
  CAMERA_AIM_UP_REAL_M,
  CAMERA_BACK_REAL_M,
  CAMERA_UP_REAL_M,
  CAMERA_FAR_REAL_M,
  CAMERA_NEAR_REAL_M,
  COMPRESSION_CANDIDATES,
  DEFAULT_SCALE,
  DRAMA_CANDIDATES,
  apparentExaggeration,
  hazeDensityPerWorldUnit,
  hazeFalloffPerWorldUnit,
  scaleFor,
  toWorldH,
  toWorldV,
  type WorldScale,
} from "../../engine/src/sim/scale.js";

/**
 * The G1 A/B is two questions (F14), and these are the tests that keep them
 * apart. The failure they exist to prevent is not a crash: it is a playtest
 * that runs, produces a clean ranking, and answers the wrong question.
 */

/**
 * The angle of a rendered mesh facet, in degrees, computed through the two
 * render functions rather than through the algebra - `toWorldH` and `toWorldV`
 * are what the vertex shader does, so this is the picture and not a model of
 * it.
 */
function facetDeg(riseM: number, runM: number, scale: WorldScale): number {
  return (Math.atan(toWorldV(riseM, scale) / toWorldH(runM, scale)) * 180) / Math.PI;
}

/** The median gradient of the flown Shanghai-Lhasa route band, F14. */
const ROUTE_MEDIAN_M_PER_KM = 80;

describe("apparent exaggeration", () => {
  it("is the product, which is all the picture depends on", () => {
    expect(apparentExaggeration({ horizontalCompression: 8, verticalExaggeration: 0.75 })).toBe(6);
    expect(apparentExaggeration({ horizontalCompression: 12, verticalExaggeration: 0.5 })).toBe(6);
    expect(apparentExaggeration({ horizontalCompression: 5, verticalExaggeration: 1.2 })).toBe(6);
  });

  it.each([
    // A, facet angle over a 1 km step at the route median gradient.
    // Computed from atan(A * gradient), not captured from this code.
    [4, 17.7447],
    [6, 25.641],
    [9, 35.7539],
    [12, 43.8309],
  ])("at A = %d a route-median slope renders as %f degrees", (a, deg) => {
    for (const c of COMPRESSION_CANDIDATES) {
      expect(facetDeg(ROUTE_MEDIAN_M_PER_KM, 1000, scaleFor(c, a))).toBeCloseTo(deg, 3);
    }
  });
});

describe("the compression axis", () => {
  /**
   * The whole point of the second axis. If this fails, the cohort is being
   * shown three different worlds and asked which size it prefers.
   */
  it("does not change terrain shape, at any drama or any gradient", () => {
    for (const a of DRAMA_CANDIDATES) {
      for (const gradient of [10, 80, 324, 995]) {
        const angles = COMPRESSION_CANDIDATES.map((c) =>
          facetDeg(gradient, 1000, scaleFor(c, a)),
        );
        for (const angle of angles) expect(angle).toBeCloseTo(angles[0]!, 10);
      }
    }
  });

  it("moves exaggeration inversely, reproducing F14's table", () => {
    expect(scaleFor(5, 6).verticalExaggeration).toBeCloseTo(1.2, 10);
    expect(scaleFor(8, 6).verticalExaggeration).toBeCloseTo(0.75, 10);
    expect(scaleFor(12, 6).verticalExaggeration).toBeCloseTo(0.5, 10);
  });

  it("changes how much world is on screen, which is the question it asks", () => {
    const tileOnScreen = (c: number) => toWorldH(64_000, scaleFor(c, 6));
    expect(tileOnScreen(5)).toBeCloseTo(12_800, 6);
    expect(tileOnScreen(8)).toBeCloseTo(8_000, 6);
    expect(tileOnScreen(12)).toBeCloseTo(5_333.33, 2);
  });

  /**
   * The bug F14 found, held still so it cannot come back. Pinning the
   * exaggeration and sweeping compression - the A/B as originally specified -
   * changes the picture by twenty-five degrees at the route median while
   * claiming to change only the scale.
   */
  it("was not shape-invariant when exaggeration was pinned", () => {
    const pinned = COMPRESSION_CANDIDATES.map((c) =>
      facetDeg(ROUTE_MEDIAN_M_PER_KM, 1000, { horizontalCompression: c, verticalExaggeration: 1.5 }),
    );
    expect(pinned[2]! - pinned[0]!).toBeGreaterThan(24);
  });
});

describe("the drama axis", () => {
  it("changes terrain shape, monotonically", () => {
    const angles = DRAMA_CANDIDATES.map((a) =>
      facetDeg(ROUTE_MEDIAN_M_PER_KM, 1000, scaleFor(8, a)),
    );
    expect(angles[0]).toBeLessThan(angles[1]!);
    expect(angles[1]).toBeLessThan(angles[2]!);
  });

  it("leaves the framing alone - horizontal distance is untouched", () => {
    for (const a of DRAMA_CANDIDATES) {
      expect(toWorldH(64_000, scaleFor(8, a))).toBeCloseTo(8_000, 10);
    }
  });

  it("spans the readable range measured over the corridor", () => {
    // Below 4 the route reads as moorland, above 9 the 1 km reduction's own
    // noise is what is being magnified rather than relief that exists.
    expect(Math.min(...DRAMA_CANDIDATES)).toBeGreaterThanOrEqual(4);
    expect(Math.max(...DRAMA_CANDIDATES)).toBeLessThanOrEqual(9);
  });
});

describe("the default", () => {
  /**
   * A default off the A/B grid would be a fourth condition nobody chose and
   * no toggle position could return to - so a playtester who wandered off it
   * could never get back, and the "shipped" setting would be one the cohort
   * was never actually asked about.
   */
  it("sits on a point both toggles can reach", () => {
    expect(COMPRESSION_CANDIDATES).toContain(DEFAULT_SCALE.horizontalCompression);
    expect(DRAMA_CANDIDATES).toContain(apparentExaggeration(DEFAULT_SCALE));
  });

  it("is 1:8 at A = 6, the value F14 measured", () => {
    expect(DEFAULT_SCALE).toEqual({ horizontalCompression: 8, verticalExaggeration: 0.75 });
  });
});

describe("camera framing", () => {
  /**
   * Held in world units these would differ per candidate, and the compression
   * A/B would silently become a field-of-view A/B as well.
   */
  it("sits the same real distance behind the aircraft at every compression", () => {
    for (const c of COMPRESSION_CANDIDATES) {
      const scale = scaleFor(c, 6);
      expect(toWorldH(CAMERA_BACK_REAL_M, scale) * c).toBeCloseTo(CAMERA_BACK_REAL_M, 6);
    }
    expect(toWorldH(CAMERA_BACK_REAL_M, scaleFor(8, 6))).toBeCloseTo(260, 6);
    expect(toWorldH(CAMERA_BACK_REAL_M, scaleFor(5, 6))).toBeCloseTo(416, 6);
  });

  /** Equal depth precision, so no candidate wins or loses on z-fighting. */
  it("gives every candidate the same near:far ratio", () => {
    for (const c of COMPRESSION_CANDIDATES) {
      const scale = scaleFor(c, 6);
      const ratio = toWorldH(CAMERA_FAR_REAL_M, scale) / toWorldH(CAMERA_NEAR_REAL_M, scale);
      expect(ratio).toBeCloseTo(CAMERA_FAR_REAL_M / CAMERA_NEAR_REAL_M, 6);
    }
  });

  it("reaches past the impostor ring at every compression", () => {
    // F1: the ring marches to 1,200 km of real ground.
    expect(CAMERA_FAR_REAL_M).toBeGreaterThan(1_200_000);
  });

  /**
   * The strongest form of the claim. The render transform is the fixed
   * distortion diag(1, A, 1) with a uniform 1/c on top, so if every camera
   * distance also carries that 1/c, the three compression candidates produce
   * the identical image and the A/B has exactly one variable in it.
   */
  it("is one rig at three scales, not three rigs", () => {
    const rig = (c: number) => {
      const scale = scaleFor(c, 6);
      return [CAMERA_BACK_REAL_M, CAMERA_UP_REAL_M, CAMERA_AIM_UP_REAL_M, CAMERA_NEAR_REAL_M].map(
        (realM) => toWorldH(realM, scale) * c,
      );
    };
    for (const c of COMPRESSION_CANDIDATES) {
      rig(c).forEach((v, i) => expect(v).toBeCloseTo(rig(8)[i]!, 6));
    }
  });

  /**
   * What the rig used to be, kept as a reminder of why it moved. A camera
   * offset in raw world units is a different real height at every candidate,
   * because the vertical axis carries the exaggeration - so the cohort would
   * have ranked camera heights alongside compressions without being told.
   */
  it("would have ridden 2.4x higher at 1:12 with the offset in world units", () => {
    const realHeightAbove = (c: number) => 95 / scaleFor(c, 6).verticalExaggeration;
    expect(realHeightAbove(5)).toBeCloseTo(79.17, 2);
    expect(realHeightAbove(12)).toBeCloseTo(190, 2);
    expect(realHeightAbove(12) / realHeightAbove(5)).toBeCloseTo(2.4, 6);
  });
});

describe("haze is a property of the air, not of the drawing", () => {
  /** Optical depth the shader accumulates over a real sight line. */
  const depth = (perRealM: number, realDistM: number, scale: WorldScale) =>
    hazeDensityPerWorldUnit(perRealM, scale) * toWorldH(realDistM, scale);

  it("thickens the same amount over 100 km at every compression", () => {
    const at = COMPRESSION_CANDIDATES.map((c) => depth(3.5e-6, 100_000, scaleFor(c, 6)));
    for (const d of at) expect(d).toBeCloseTo(0.35, 10);
  });

  /**
   * The bug this conversion exists to prevent: with the density in world
   * units the world's compression silently sets how far the player can see,
   * so the G1 ranking would partly be a ranking of visibility.
   */
  it("would have made 1:12 look 2.4x clearer with the density in world units", () => {
    const worldUnitDepth = (c: number) => 2.8e-5 * toWorldH(100_000, scaleFor(c, 6));
    expect(worldUnitDepth(5) / worldUnitDepth(12)).toBeCloseTo(2.4, 10);
  });

  it("keeps its real scale height whatever the drama toggle does", () => {
    for (const a of DRAMA_CANDIDATES) {
      const scale = scaleFor(8, a);
      // One scale height of real altitude must be one e-folding, always.
      expect(hazeFalloffPerWorldUnit(6000, scale) * toWorldV(6000, scale)).toBeCloseTo(1, 10);
    }
  });

  it("had already drifted once, unnoticed, when the exaggeration moved", () => {
    // A falloff pinned at 1/9000 world units, read back as real metres.
    const realScaleHeight = (vex: number) => 9000 / vex;
    expect(realScaleHeight(1.5)).toBe(6000);
    expect(realScaleHeight(0.75)).toBe(12_000);
  });
});

describe("pacing", () => {
  /** The corridor's flown length, Shanghai to Lhasa via its waypoints. */
  const SEA_TO_SKY_KM = 3219.7;

  it("is the only thing that sets how long a route takes", () => {
    // The counterpart to the compression tests above: there, the picture did
    // not move; here, the clock does, and nothing else in the frame does.
    const at = CRUISE_CANDIDATES.map((c) =>
      +minutesForKm(SEA_TO_SKY_KM, "cruise", { cruiseKmPerMin: c }).toFixed(1),
    );
    expect(at).toEqual([40.2, 24.8, 16.9]);
  });

  it("reproduces the spread the GDD asked to compare", () => {
    // "at 1:5 Sea to Sky is about 40 minutes, at 1:12 about 17" - a speed
    // question in the vocabulary of scale (F15).
    expect(minutesForKm(SEA_TO_SKY_KM, "cruise", { cruiseKmPerMin: 80 })).toBeCloseTo(40, 0);
    expect(minutesForKm(SEA_TO_SKY_KM, "cruise", { cruiseKmPerMin: 190 })).toBeCloseTo(17, 0);
  });

  it("keeps the GDD's relationship between the three modes", () => {
    for (const c of CRUISE_CANDIDATES) {
      const pacing = { cruiseKmPerMin: c };
      expect(groundKmPerMin("cruise", pacing)).toBe(c);
      expect(groundKmPerMin("low", pacing)).toBeCloseTo(c / 3, 10);
      expect(groundKmPerMin("boost", pacing)).toBe(c * 2);
    }
    expect(MODE_SPEED_RATIO.cruise).toBe(1);
  });

  it("leaves the default table derived from the default pacing", () => {
    // One source of truth: the table cannot drift from the pacing it names.
    expect(MODE_GROUND_KM_PER_MIN.cruise).toBe(DEFAULT_PACING.cruiseKmPerMin);
    expect(MODE_GROUND_KM_PER_MIN.low).toBeCloseTo(130 / 3, 10);
    expect(MODE_GROUND_KM_PER_MIN.boost).toBe(260);
  });

  /**
   * The exchange rate between distance and altitude, which is the GDD's
   * thesis as a number. Pacing moves it, which is why this axis is a design
   * question where the compression axis was not.
   */
  it.each([
    // cruise km/min, real metres of altitude gained per km of ground
    [80, 5.33],
    [130, 3.28],
    [190, 2.24],
  ])("at %d km/min a full climb buys %f m of altitude per km", (cruise, mPerKm) => {
    const climbRateMs = 7.1; // sea level, LIGHT_PISTON
    const groundMs = MODE_IAS_MS.cruise * groundGain("cruise", { cruiseKmPerMin: cruise });
    expect((climbRateMs / groundMs) * 1000).toBeCloseTo(mPerKm, 2);
  });
});
