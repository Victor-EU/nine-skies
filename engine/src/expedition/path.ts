/**
 * Where along an authored route the aircraft has got to. (Workstream D, the
 * expedition runner.)
 *
 * The route is a polyline in the plane the aircraft flies in, and progress is
 * the distance along it. Three things about that are not obvious, and all
 * three are measured in F38.
 *
 * **Progress is a position along the route, not a position.** One kilometre
 * off the line the ground underneath already differs from the route's own
 * profile by more than the 300 m margin the route keeps, at 4 % of stations;
 * five kilometres off, at 23 %. So anything that needs to know what is under
 * the aircraft asks the terrain. What a route-indexed number - the altitude
 * floor, the arrival ceiling, the remaining minutes - describes is the line,
 * and `crossTrackM` is how far the player is from the thing being described.
 *
 * **A corner credits kilometres nobody flew.** Nearest-point projection is
 * ambiguous inside a corner: at Expedition 1's sharpest, the 39.1 degree turn
 * at Chongqing, a point 25 km off the line reads 17.7 km further along than
 * the station it came from, and a straight cut across that corner is credited
 * 6.9 km more than it covers. So an update may credit at most a little more
 * than it flew, and progress never runs backwards: the aircraft catches up
 * with the corner instead of the corner jumping to meet it.
 *
 * **A corridor narrower than the aeroplane's own turn is not a corridor.** A
 * full-bank reversal is 5.3 km wide at `low` and 16.2 to 23.3 at cruise, so a
 * player who banks over to look at something leaves any tighter band whatever
 * they intend. `DEFAULT_CORRIDOR_M` is wider than every cruise reversal, and
 * outside it progress simply stops rather than being credited to someone who
 * is no longer flying the route.
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

export interface ProgressFix extends Fix {
  /**
   * Whether the route was rejoined ahead of where progress had stopped -
   * which is to say the aircraft got here without flying the route to get
   * here, and the kilometres in between were covered somewhere else.
   */
  readonly rejoined: boolean;
}

/**
 * The nearest point on the route, searched only between two kilometre marks.
 *
 * The window is what keeps a projection honest. Unwindowed it answers "which
 * part of this polyline is nearest", which on a route that comes back near
 * itself is a different question from "how far have I got" - Expedition 1's
 * closest non-adjacent legs pass 266 km apart, which is two minutes of cruise
 * and well inside a free-flight detour.
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
 * The point a given distance along the route, and the heading the route is on
 * there - the simulation's own convention, `eastM += sin h, northM += cos h`.
 *
 * Wanted by anything that puts the aircraft somewhere by kilometre rather
 * than by coordinate: an operator starting a session partway along (F28's
 * km 900), a resumed expedition, a map pin.
 */
export function pointAtKm(path: RoutePath, atKm: number): PathPoint & { headingRad: number } {
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
    };
  }
  const only = path.points[0] ?? { eastM: 0, northM: 0 };
  return { ...only, headingRad: 0 };
}

export interface ProgressOptions {
  /**
   * How far off the line the player is still flying this route, real metres.
   *
   * Wider than a full-bank reversal at cruise (16.2 km at the coast, 23.3 on
   * the plateau, F38), because a corridor the aeroplane cannot turn inside
   * would report every sightseeing turn as leaving the route.
   */
  readonly corridorM: number;
  /**
   * How much further than it flew one update may credit, as a multiple.
   *
   * Above 1 so that a corner, where the projection legitimately runs ahead of
   * the distance covered, is caught up with rather than snapped to.
   */
  readonly slack: number;
}

export const DEFAULT_PROGRESS: ProgressOptions = { corridorM: 25_000, slack: 1.5 };

/**
 * How far along the route the aircraft has got, and how far off the line.
 *
 * Monotonic: `km` never decreases. Narration is ordered by it, and a player
 * who turns round to look at a river should not have the last three beats
 * become unfired.
 */
export class RouteProgress {
  private readonly path: RoutePath;
  private readonly options: ProgressOptions;
  private progressKm = 0;
  private crossM = 0;
  private eastM = 0;
  private northM = 0;
  private placed = false;

  constructor(path: RoutePath, options: Partial<ProgressOptions> = {}) {
    this.path = path;
    this.options = { ...DEFAULT_PROGRESS, ...options };
  }

  get km(): number {
    return this.progressKm;
  }

  get crossTrackM(): number {
    return this.crossM;
  }

  /** Whether the route's own numbers are still about this aircraft. */
  get onRoute(): boolean {
    return this.crossM <= this.options.corridorM;
  }

  get remainingKm(): number {
    return Math.max(0, this.path.lengthKm - this.progressKm);
  }

  /**
   * The aircraft has *flown* to here. Returns the kilometre it is credited
   * with, which is what it was before if it is off the route or behind.
   */
  advance(eastM: number, northM: number): ProgressFix {
    if (!this.placed) return { ...this.moveTo(eastM, northM), rejoined: false };

    const flownM = Math.hypot(eastM - this.eastM, northM - this.northM);
    this.eastM = eastM;
    this.northM = northM;

    // How far from the line the aircraft actually is, which is a different
    // question from how far along it has got and is answered over the whole
    // route: a player who has turned back is not off the route, and should
    // not be told they are.
    const line = nearestOn(this.path, eastM, northM);
    this.crossM = line.crossTrackM;

    const ahead = (flownM * this.options.slack) / 1000;
    const flown = nearestOn(
      this.path,
      eastM,
      northM,
      this.progressKm,
      this.progressKm + ahead,
    );
    if (flown.crossTrackM <= this.options.corridorM) {
      this.progressKm = Math.max(this.progressKm, flown.km);
      return { km: this.progressKm, crossTrackM: this.crossM, rejoined: false };
    }

    // Off the line - or back on it further along than flying could have
    // carried progress, which is a player who left the route and came back.
    // Without this the window is a trap: progress freezes at the kilometre
    // the detour began, and no amount of flying the route afterwards moves
    // it, because everything ahead is outside a window that never grows.
    const rejoined =
      line.crossTrackM <= this.options.corridorM && line.km > this.progressKm;
    if (rejoined) this.progressKm = line.km;
    return { km: this.progressKm, crossTrackM: this.crossM, rejoined };
  }

  /**
   * The aircraft is *now* here without having flown the distance - a map
   * jump, a reset, a resumed expedition, the first frame.
   *
   * The same seam the discovery field needs, for the same reason (F37): a
   * swept test asked about a teleport reports a flight that never happened.
   * Here it is the other way round - the window would refuse a jump forward
   * that really did happen - so this one searches the whole route and may
   * move progress backwards.
   */
  moveTo(eastM: number, northM: number): Fix {
    this.eastM = eastM;
    this.northM = northM;
    this.placed = true;
    const fix = nearestOn(this.path, eastM, northM);
    this.crossM = fix.crossTrackM;
    if (this.onRoute) this.progressKm = fix.km;
    return { km: this.progressKm, crossTrackM: this.crossM };
  }

  /** Resume where a saved profile left off, without a position. */
  restore(km: number): void {
    this.progressKm = Math.max(0, Math.min(km, this.path.lengthKm));
  }
}
