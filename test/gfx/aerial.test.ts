/**
 * What the air is worth, in the units the question is asked in. (Finding F36.)
 *
 * The atmosphere sits on the critical path into G1 because the GDD calls the
 * deepening sky the first visual cue for altitude, and G1 is scored partly on
 * whether the cohort remarks on the climb unprompted. Nothing measured the
 * cue. These are the numbers, pinned so that a change to `SPIKE_REGIONS`, to
 * the thinness curve, or to the region weights cannot quietly remove the thing
 * the gate is scored on.
 *
 * Distances are perceptual - CIE dE76, where ~2.3 is a just-noticeable
 * difference and ~10 reads as a different colour at a glance. RGB distance
 * would answer none of these questions.
 */
import { describe, expect, it } from "vitest";
import { Color } from "three";
import { Aerial, THIN_AIR_SKY, thinness } from "../../engine/src/gfx/aerial.js";
import { JND, deltaE } from "../../engine/src/gfx/perceptual.js";
import { aerialFogReal, halfVisibleKm } from "../../engine/src/terrain/palette.js";
import { SPIKE_REGIONS } from "../../engine/src/terrain/terrainMaterial.js";

const air = new Aerial();
const skyAt = (inlandKm: number, groundM: number, altitudeM: number): Color =>
  air.update(inlandKm, groundM, altitudeM).sky.clone();

/** The three places the stand-in region table has an opinion about. */
const PLAIN = { inlandKm: 300, groundM: 69 };
const BASIN = { inlandKm: 2600, groundM: 450 };
const PLATEAU = { inlandKm: 2700, groundM: 4200 };
const climbCue = (p: { inlandKm: number; groundM: number }): number =>
  deltaE(skyAt(p.inlandKm, p.groundM, 0), skyAt(p.inlandKm, p.groundM, 4500));

describe("perceptual distance", () => {
  it("is zero for a colour against itself and about a hundred across the range", () => {
    expect(deltaE(new Color(0.3, 0.5, 0.7), new Color(0.3, 0.5, 0.7))).toBe(0);
    expect(deltaE(new Color(0, 0, 0), new Color(1, 1, 1))).toBeCloseTo(100, 0);
  });
});

describe("the sky as an altimeter", () => {
  it("lands exactly on the region's haze at sea level, which is the no-seam rule", () => {
    // The clear colour and the colour terrain fades into are one value. If
    // this ever drifts, distant ground stops meeting the sky and the horizon
    // grows the one seam this game cannot afford.
    expect(thinness(0)).toBe(0);
    expect(deltaE(skyAt(PLAIN.inlandKm, PLAIN.groundM, 0), SPIKE_REGIONS[0]!.hazeColor)).toBe(0);
    expect(deltaE(skyAt(PLATEAU.inlandKm, PLATEAU.groundM, 0), SPIKE_REGIONS[2]!.hazeColor)).toBe(0);
  });

  it("moves about thirty dE across a climb to 4,500 m, wherever that climb happens", () => {
    expect(climbCue(PLAIN)).toBeCloseTo(32.1, 1);
    expect(climbCue(BASIN)).toBeCloseTo(34.7, 1);
    // Least on the plateau, and for a reason: its own haze is already a blue
    // close to the thin-air colour, so there is less of the curve left to run.
    expect(climbCue(PLATEAU)).toBeCloseTo(22.6, 1);
    for (const place of [PLAIN, BASIN, PLATEAU]) expect(climbCue(place)).toBeGreaterThan(20);
  });

  it("is far more an altimeter than a map", () => {
    // Where you are is worth a fifth of how high you are. The regions differ
    // in the *haze*, not in the sky, which is the next test.
    const place = deltaE(
      skyAt(PLAIN.inlandKm, PLAIN.groundM, 4000),
      skyAt(PLATEAU.inlandKm, PLATEAU.groundM, 4000),
    );
    expect(place).toBeCloseTo(5.05, 1);
    expect(place).toBeLessThan(climbCue(PLAIN) / 4);
  });

  it("arrives over G1's twelve minutes too slowly to be seen arriving", () => {
    // The session the gate actually runs: 1,200 m to 3,863 m over the eastern
    // plain, so the region weights never move and the whole of this is the
    // climb. Twenty dE is plainly visible as a *difference*; spread over
    // twelve minutes it is 1.6 dE a minute, under the threshold at which a
    // change can be noticed happening. The cue is real and it is not an event
    // - which is worth knowing before a cohort is asked to remark on it.
    const cue = deltaE(skyAt(0, 10, 1200), skyAt(593, 72, 3863));
    expect(cue).toBeCloseTo(19.1, 1);
    expect(cue / 12).toBeLessThan(JND);
  });

  it("keeps moving right up to the aircraft's ceiling", () => {
    // A curve that saturated at 4,000 m would stop paying exactly where the
    // interesting flying starts.
    expect(thinness(4500)).toBeLessThan(0.95);
    expect(thinness(6000)).toBeGreaterThan(0.95);
    expect(deltaE(skyAt(PLATEAU.inlandKm, PLATEAU.groundM, 6000), THIN_AIR_SKY)).toBeLessThan(3);
  });
});

describe("milk and glass", () => {
  const [coast, basin, plateau] = SPIKE_REGIONS.map((r) => r.hazeDensity) as [number, number, number];

  it("separates the regions by how far you can see, not by what colour the sky is", () => {
    expect(halfVisibleKm(1000, coast)).toBeCloseTo(234, 0);
    expect(halfVisibleKm(1000, basin)).toBeCloseTo(117, 0);
    expect(halfVisibleKm(1000, plateau)).toBeCloseTo(963, 0);
    expect(basin / plateau).toBeGreaterThan(8);
  });

  it("is a long-range effect, and says nothing at all about the ground you are over", () => {
    // The distinction D12 exists for needs a hundred kilometres to appear. At
    // forty - eighteen seconds of cruise, which is near field in this game -
    // the basin and the plateau are both essentially clear, so the basin does
    // not read as milk while you are in it, only when you look across it.
    const keeps = (km: number, density: number): number =>
      1 - aerialFogReal(km * 1000, 4000, 4000, density);
    expect(keeps(40, plateau) / keeps(40, basin)).toBeCloseTo(1.13, 2);
    expect(keeps(200, plateau) / keeps(200, basin)).toBeCloseTo(1.88, 2);
    expect(keeps(400, plateau) / keeps(400, basin)).toBeGreaterThan(3);
  });

  it("leaves the impostor's outer edge two thirds visible over the plateau", () => {
    // The world stops at 1,200 km (D15). On the coast the air has eaten 81 %
    // of that last ridge line and its ending is nothing to see. In the
    // plateau's glass it has eaten 34 %, so the outermost skyline is a real
    // line with nothing behind it - which is the same air that makes F1's
    // 1,312 km reveal worth having, seen from the other end.
    const edge = (density: number): number => aerialFogReal(1.2e6, 5000, 6000, density);
    expect(edge(plateau)).toBeCloseTo(0.34, 2);
    expect(edge(coast)).toBeCloseTo(0.81, 2);
  });
});
