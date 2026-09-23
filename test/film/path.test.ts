/**
 * A rail as a measured line: its length, the nearest point on it, and the
 * point at a distance along it.
 */
import { describe, expect, it } from "vitest";
import { nearestOn, pathFrom, pointAtKm, type PathPoint } from "../../engine/src/film/path.js";

const km = (n: number) => n * 1000;

/** A right angle: 100 km east, then 100 km north. */
const ell = pathFrom([
  { eastM: 0, northM: 0 },
  { eastM: km(100), northM: 0 },
  { eastM: km(100), northM: km(100) },
]);

/** Nearest point by dense sampling: a second opinion with no algebra in it. */
function bruteForce(points: readonly PathPoint[], eastM: number, northM: number) {
  let best = { km: 0, crossTrackM: Infinity };
  let travelled = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const segM = Math.hypot(b.eastM - a.eastM, b.northM - a.northM);
    for (let s = 0; s <= 20_000; s++) {
      const t = s / 20_000;
      const d = Math.hypot(
        eastM - (a.eastM + t * (b.eastM - a.eastM)),
        northM - (a.northM + t * (b.northM - a.northM)),
      );
      if (d < best.crossTrackM) best = { km: (travelled + t * segM) / 1000, crossTrackM: d };
    }
    travelled += segM;
  }
  return best;
}

describe("a rail as a measured line", () => {
  it("measures its own length", () => {
    expect(ell.lengthKm).toBeCloseTo(200, 6);
    expect(pathFrom([]).lengthKm).toBe(0);
  });

  it("finds the nearest point the way a dense search does", () => {
    for (const [e, n] of [
      [km(30), km(10)],
      [km(110), km(50)],
      [km(100), km(-10)],
      [km(130), km(130)],
    ]) {
      const fix = nearestOn(ell, e!, n!);
      const ref = bruteForce(ell.points, e!, n!);
      expect(fix.km).toBeCloseTo(ref.km, 2);
      expect(fix.crossTrackM).toBeCloseTo(ref.crossTrackM, 0);
    }
  });

  it("searches only inside the window it is given", () => {
    const fix = nearestOn(ell, km(100), km(50), 0, 100);
    expect(fix.km).toBe(100);
    expect(fix.crossTrackM).toBeCloseTo(km(50), 6);
  });

  it("gives the point, heading and segment at a distance along it", () => {
    expect(pointAtKm(ell, 50)).toMatchObject({ eastM: km(50), northM: 0, headingRad: Math.PI / 2, segment: 0 });
    const up = pointAtKm(ell, 150);
    expect(up).toMatchObject({ eastM: km(100), northM: km(50), segment: 1 });
    expect(up.headingRad).toBeCloseTo(0, 9);
    expect(up.t).toBeCloseTo(0.5, 9);
    expect(pointAtKm(ell, 500)).toMatchObject({ eastM: km(100), northM: km(100) });
    expect(pointAtKm(ell, -5)).toMatchObject({ eastM: 0, northM: 0 });
  });
});
