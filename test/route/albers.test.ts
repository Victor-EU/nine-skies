/**
 * The TypeScript projection against PROJ's own answer.
 *
 * `pipeline/nineskies/grid.py` owns the projection and computes every anchor
 * with PROJ before writing the manifest. `projectAlbers` is a second
 * implementation of the same thing, which exists because content is authored
 * in degrees and something in the engine has to put it in the world. Two
 * implementations of one projection is exactly the kind of duplication that
 * drifts, so this compares them on real points rather than trusting either.
 *
 * Skips without a built corridor: with no manifest there is no independent
 * answer to check against, and a self-consistent projection test would
 * confirm nothing.
 */
import { describe, expect, it } from "vitest";
import { loadCorridor } from "./corridorProfile.js";
import { ORIGIN_X_M, ORIGIN_Y_M, projectAlbers } from "../../engine/src/terrain/worldGrid.js";

const corridor = loadCorridor("dist-world/sea-to-sky");

describe.skipIf(corridor === null)("projectAlbers", () => {
  it("lands on PROJ's answer at every anchor", () => {
    const anchors = Object.entries(corridor!.manifest.anchors);
    expect(anchors.length).toBeGreaterThan(4);
    for (const [name, a] of anchors) {
      const p = projectAlbers(a.lat, a.lon);
      // The manifest rounds to a decimetre, so a decimetre is the tolerance.
      expect(Math.abs(p.eastM - a.eastM), `${name} east`).toBeLessThan(0.1);
      expect(Math.abs(p.northM - a.northM), `${name} north`).toBeLessThan(0.1);
    }
  });

  it("puts the central meridian where the projection says it is", () => {
    // On 105 E the cone's axis is due north, so easting depends on nothing
    // but the origin offset. A spherical-earth slip would not show here,
    // which is why the anchor check above is the one that matters.
    const onMeridian = projectAlbers(35, 105);
    expect(onMeridian.eastM).toBeCloseTo(-ORIGIN_X_M, 6);
    expect(ORIGIN_Y_M).toBe(1_792_000);
  });

  it("is ellipsoidal, not spherical", () => {
    // If someone simplifies the authalic function away for a sphere of
    // radius 6,371 km, this catches it. PROJ puts 40 N on the central
    // meridian at 4,299,860 m north of the equator; the spherical form puts
    // it at 4,316,732, which is 16.9 km - seventeen tiles - of quiet wrong.
    const p = projectAlbers(40, 105);
    expect(p.northM + ORIGIN_Y_M).toBeCloseTo(4_299_860, 0);
  });
});
