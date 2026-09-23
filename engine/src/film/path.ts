/**
 * A rail as a measured line: a polyline in the plane the camera flies in,
 * with the distance along it.
 *
 * Kept from version 1's expedition runner, where it was the half that needed
 * no aircraft. Everything here is real metres in the Albers grid.
 */

export interface PathPoint {
  /** Real metres east and north of the projection origin. */
  readonly eastM: number;
  readonly northM: number;
}

export interface RoutePath {
  readonly points: readonly PathPoint[];
  /** Distance from the start to each point, real metres. */
  readonly cumM: readonly number[];
  readonly lengthKm: number;
}

export function pathFrom(points: readonly PathPoint[]): RoutePath {
  const cumM: number[] = [0];
  for (let i = 1; i < points.length; i++)
    cumM.push(
      cumM[i - 1]! +
        Math.hypot(
          points[i]!.eastM - points[i - 1]!.eastM,
          points[i]!.northM - points[i - 1]!.northM,
        ),
    );
  return {
    points,
    cumM,
    lengthKm: (cumM[cumM.length - 1] ?? 0) / 1000,
  };
}

export interface Fix {
  /** Distance along the route, km. */
  readonly km: number;
  /** Distance from the line at that point, real metres. */
  readonly crossTrackM: number;
}

/**
 * The nearest point on the route, searched only between two kilometre marks.
 *
 * The window is what keeps a projection honest: unwindowed it answers "which
 * part of this polyline is nearest", which on a rail that comes back near
 * itself is a different question from "how far along am I".
 */
export function nearestOn(
  path: RoutePath,
  eastM: number,
  northM: number,
  fromKm = 0,
  toKm = path.lengthKm,
): Fix {
  const fromM = Math.max(0, Math.min(fromKm, path.lengthKm) * 1000);
  const toM = Math.max(fromM, Math.min(toKm, path.lengthKm) * 1000);
  let best: Fix = { km: fromM / 1000, crossTrackM: Infinity };

  for (let i = 0; i + 1 < path.points.length; i++) {
    const startM = path.cumM[i]!;
    const endM = path.cumM[i + 1]!;
    if (endM < fromM || startM > toM) continue;

    const ax = path.points[i]!.eastM;
    const ay = path.points[i]!.northM;
    const dx = path.points[i + 1]!.eastM - ax;
    const dy = path.points[i + 1]!.northM - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;

    // Clamp to the part of this segment the window allows, not to the whole
    // of it: a window that ends mid-segment has to end mid-segment.
    const lo = Math.max(0, (fromM - startM) / (endM - startM));
    const hi = Math.min(1, (toM - startM) / (endM - startM));
    const raw = ((eastM - ax) * dx + (northM - ay) * dy) / len2;
    const t = Math.max(lo, Math.min(hi, raw));
    const crossTrackM = Math.hypot(eastM - (ax + t * dx), northM - (ay + t * dy));
    if (crossTrackM < best.crossTrackM)
      best = { km: (startM + t * (endM - startM)) / 1000, crossTrackM };
  }
  return best;
}

/**
 * The point a given distance along the route, the heading the route is on
 * there (`eastM += sin h, northM += cos h`), and which segment it is on with
 * how far through it, for anything keyed to the points.
 */
export function pointAtKm(
  path: RoutePath,
  atKm: number,
): PathPoint & { headingRad: number; segment: number; t: number } {
  const totalM = path.cumM[path.cumM.length - 1] ?? 0;
  const m = Math.max(0, Math.min(atKm * 1000, totalM));
  for (let i = 0; i + 1 < path.points.length; i++) {
    const startM = path.cumM[i]!;
    const endM = path.cumM[i + 1]!;
    if (m > endM && i + 2 !== path.points.length) continue;
    const a = path.points[i]!;
    const b = path.points[i + 1]!;
    const t = endM === startM ? 0 : (m - startM) / (endM - startM);
    return {
      eastM: a.eastM + t * (b.eastM - a.eastM),
      northM: a.northM + t * (b.northM - a.northM),
      headingRad: Math.atan2(b.eastM - a.eastM, b.northM - a.northM),
      segment: i,
      t,
    };
  }
  const only = path.points[0] ?? { eastM: 0, northM: 0 };
  return { ...only, headingRad: 0, segment: 0, t: 0 };
}
