/**
 * Progress along an authored route (F38).
 *
 * The geometry half runs everywhere: it reads the authored waypoints and the
 * projection, neither of which needs a built world. What needs ground - what
 * the route's own numbers are worth off the line - is in
 * `test/route/pacingGuarantee.test.ts` beside the rest of the route checks.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROGRESS,
  nearestOn,
  pathFrom,
  RouteProgress,
  type PathPoint,
} from "../../engine/src/expedition/path.js";
import { loadExpedition, projectedWaypoints } from "../../tools/expedition.ts";

const km = (n: number) => n * 1000;

/** A right angle: 100 km east, then 100 km north. */
const ell = pathFrom([
  { eastM: 0, northM: 0 },
  { eastM: km(100), northM: 0 },
  { eastM: km(100), northM: km(100) },
]);

/** Expedition 1's own polyline, which is the shape the runner will meet. */
const seaToSky = pathFrom(
  projectedWaypoints(loadExpedition("content/expeditions/sea-to-sky.yaml")),
);

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
      if (d < best.crossTrackM)
        best = { km: (travelled + t * segM) / 1000, crossTrackM: d };
    }
    travelled += segM;
  }
  return best;
}

describe("a route as a measured line", () => {
  it("measures its own length", () => {
    expect(ell.lengthKm).toBeCloseTo(200, 6);
    expect(seaToSky.lengthKm).toBeCloseTo(2931, 0);
  });

  it("agrees with a brute-force projection, on a corner and on the real route", () => {
    const beside = nearestOn(ell, km(50), km(5));
    expect(beside.km).toBeCloseTo(50, 6);
    expect(beside.crossTrackM).toBeCloseTo(km(5), 6);

    const pastTheCorner = nearestOn(ell, km(105), km(5));
    expect(pastTheCorner.km).toBeCloseTo(105, 6);
    expect(pastTheCorner.crossTrackM).toBeCloseTo(km(5), 6);

    // Four points around Expedition 1's sharpest corner, against a projection
    // that shares no code with the one under test.
    const near = seaToSky.points[2]!; // Chongqing
    const offsets: readonly (readonly [number, number])[] = [
      [30_000, 20_000],
      [-40_000, 10_000],
      [5_000, -60_000],
      [-80_000, -80_000],
    ];
    for (const [dx, dy] of offsets) {
      const mine = nearestOn(seaToSky, near.eastM + dx, near.northM + dy);
      const theirs = bruteForce(seaToSky.points, near.eastM + dx, near.northM + dy);
      expect(mine.km).toBeCloseTo(theirs.km, 1);
      expect(mine.crossTrackM).toBeCloseTo(theirs.crossTrackM, 1);
    }
  });

  it("is searched only inside the window it is given", () => {
    // The whole route says km 105. A window that ends at 100 has to end there.
    expect(nearestOn(ell, km(105), km(5), 0, 100).km).toBeCloseTo(100, 6);
    // And a window that starts after the point cannot walk backwards to it.
    expect(nearestOn(ell, km(50), km(5), 150, 200).km).toBeCloseTo(150, 6);
  });
});

describe("a corner credits kilometres nobody flew", () => {
  /**
   * The measurement behind the window (F38). A projection with no memory
   * reads a point off the line as further along than the station it left,
   * because inside a corner the line bends towards it.
   */
  it("reads 0.71 km further along per kilometre off the line, at its worst", () => {
    // Swept over every kilometre of the route and both sides of it, because
    // the worst place is not the corner itself: it is the ten kilometres
    // before Chongqing, where the line ahead has already begun to bend
    // towards the aircraft.
    const worstAt = (offM: number): { km: number; errorKm: number } => {
      let worst = { km: 0, errorKm: 0 };
      for (let km = 0; km <= seaToSky.lengthKm; km += 1) {
        const here = pointAtKm(seaToSky, km);
        const ahead = pointAtKm(seaToSky, Math.min(seaToSky.lengthKm, km + 1));
        const len = Math.hypot(ahead.eastM - here.eastM, ahead.northM - here.northM) || 1;
        const nx = -(ahead.northM - here.northM) / len;
        const ny = (ahead.eastM - here.eastM) / len;
        for (const side of [1, -1]) {
          const fix = nearestOn(
            seaToSky,
            here.eastM + side * nx * offM,
            here.northM + side * ny * offM,
          );
          const errorKm = Math.abs(fix.km - km);
          if (errorKm > worst.errorKm) worst = { km, errorKm };
        }
      }
      return worst;
    };

    const at25 = worstAt(km(25));
    expect(at25.errorKm).toBeCloseTo(17.7, 0);
    expect(at25.km).toBeCloseTo(1420, -2); // the run-up to Chongqing, km 1427
    expect(worstAt(km(50)).errorKm).toBeCloseTo(35.5, 0);
  });

  it("never comes within 266 km of a leg it is not next to", () => {
    // Which is two minutes of cruise, so an unwindowed projection on this
    // route is one detour away from crediting six hundred kilometres.
    let closest = Infinity;
    const p = seaToSky.points;
    for (let i = 0; i + 1 < p.length; i++)
      for (let j = i + 2; j + 1 < p.length; j++)
        for (let s = 0; s <= 400; s++) {
          const t = s / 400;
          const x = p[i]!.eastM + t * (p[i + 1]!.eastM - p[i]!.eastM);
          const y = p[i]!.northM + t * (p[i + 1]!.northM - p[i]!.northM);
          const leg = pathFrom([p[j]!, p[j + 1]!]);
          closest = Math.min(closest, nearestOn(leg, x, y).crossTrackM);
        }
    expect(closest / 1000).toBeCloseTo(266, -1);
  });
});

describe("progress along a route", () => {
  it("credits no more than it flew, plus the corner slack", () => {
    const run = new RouteProgress(seaToSky);
    let flownM = 0;
    let east = seaToSky.points[0]!.eastM;
    let north = seaToSky.points[0]!.northM;
    run.moveTo(east, north);

    // A wandering flight down the route: forward, with a wobble across it.
    for (let i = 1; i <= 2000; i++) {
      const fix = nearestOn(seaToSky, 0, 0, i * 1.4, i * 1.4); // the point at that km
      const target = pointAtKm(seaToSky, i * 1.4);
      const wobble = Math.sin(i / 7) * 8_000;
      const next = { eastM: target.eastM + wobble, northM: target.northM - wobble };
      flownM += Math.hypot(next.eastM - east, next.northM - north);
      east = next.eastM;
      north = next.northM;
      run.advance(east, north);
      expect(fix.km).toBeGreaterThanOrEqual(0);
    }
    expect(run.km).toBeLessThanOrEqual((flownM * DEFAULT_PROGRESS.slack) / 1000);
    expect(run.km).toBeGreaterThan(2500);
  });

  it("never runs backwards, and stops crediting off the route", () => {
    const run = new RouteProgress(ell);
    run.moveTo(0, 0);
    run.advance(km(50), 0);
    expect(run.km).toBeCloseTo(50, 6);
    expect(run.onRoute).toBe(true);

    // Turn round and fly back: the kilometre stands.
    run.advance(km(40), 0);
    expect(run.km).toBeCloseTo(50, 6);

    // Leave the corridor: progress freezes where it was.
    run.advance(km(60), km(30));
    expect(run.onRoute).toBe(false);
    expect(run.km).toBeCloseTo(50, 6);
    expect(run.crossTrackM).toBeCloseTo(km(30), -2);

    // Come back to the line further along, and it picks up again.
    run.advance(km(70), km(2));
    expect(run.onRoute).toBe(true);
    expect(run.km).toBeCloseTo(70, 0);
  });

  it("lets a jump move it, including backwards", () => {
    const run = new RouteProgress(ell);
    run.moveTo(0, 0);
    run.advance(km(50), 0);
    run.moveTo(km(100), km(80));
    expect(run.km).toBeCloseTo(180, 0);
    run.moveTo(km(10), 0);
    expect(run.km).toBeCloseTo(10, 6);
  });

  it("restores a saved kilometre without a position", () => {
    const run = new RouteProgress(ell);
    run.restore(123);
    expect(run.km).toBeCloseTo(123, 6);
    expect(run.remainingKm).toBeCloseTo(77, 6);
    run.restore(9_999);
    expect(run.km).toBeCloseTo(200, 6);
  });
});

/** The point a given distance along a path. Test-local, deliberately naive. */
function pointAtKm(path: ReturnType<typeof pathFrom>, atKm: number): PathPoint {
  const m = Math.max(0, Math.min(atKm * 1000, path.cumM[path.cumM.length - 1]!));
  for (let i = 0; i + 1 < path.points.length; i++) {
    const a = path.cumM[i]!;
    const b = path.cumM[i + 1]!;
    if (m <= b || i + 2 === path.points.length) {
      const t = (m - a) / (b - a);
      return {
        eastM: path.points[i]!.eastM + t * (path.points[i + 1]!.eastM - path.points[i]!.eastM),
        northM: path.points[i]!.northM + t * (path.points[i + 1]!.northM - path.points[i]!.northM),
      };
    }
  }
  return path.points[0]!;
}
