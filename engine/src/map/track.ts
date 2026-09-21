/**
 * Where the aircraft has actually been. (GDD, "Map overlay": *a live
 * elevation profile sampled from the resident tile cache over the last
 * 200 km*.)
 *
 * Nothing in the build recorded this. The runner knows how far along a route
 * the aircraft is (F38), the profile knows where it stopped (F39) and the
 * atlas knows what it found (F40); none of them knows the path it took, and
 * for free flight - which is where most of the atlas is met - there was no
 * record of it at all.
 *
 * **The cache can answer, but only about a line nobody flew.** The terrain
 * keeps a disc of radius six tiles resident, which is 384 km, so the last
 * 200 km of ground is always in memory and is re-touched every frame. What is
 * not in memory is *which* 200 km: sample the cache along a straight line
 * back from the aircraft and the first turn makes it fiction. So the path is
 * recorded as it is flown and the ground is recorded with it, which costs one
 * sample a kilometre.
 *
 * **One sample a kilometre, because that is what the ground has.** The world
 * is 1 km data (D21), so a finer track would interpolate its own source. At
 * 60 fps and cruise the aircraft moves 36 m a frame; recording every frame
 * would be 5,500 points for the same 200 km and the same information.
 *
 * **A teleport breaks the track.** The same seam as the route and the card
 * catchments (D30, D32, F40): a map jump is not a flight, and a track that
 * joined the two ends would draw a line across China that nobody flew - on
 * the one surface whose whole job is to say where the player has been.
 */

export interface TrackPoint {
  readonly eastM: number;
  readonly northM: number;
  readonly altitudeM: number;
  readonly groundM: number;
  /** Cumulative distance flown to here, km. Not distance along any route. */
  readonly km: number;
  /**
   * False when the aircraft arrived here without flying - the first point
   * after a teleport, and the first point of all. A renderer lifts the pen.
   */
  readonly joined: boolean;
}

/** GDD: the profile covers the last 200 km. */
export const TRACK_WINDOW_KM = 200;
/** The resolution the ground itself has (D21). */
export const TRACK_STRIDE_KM = 1;

export class FlownTrack {
  private readonly points: (TrackPoint | undefined)[];
  private head = 0;
  private count = 0;
  private lastEastM = 0;
  private lastNorthM = 0;
  private started = false;
  private flownKm = 0;
  /** Distance since the last recorded sample, m. */
  private sinceM = 0;
  private breakNext = true;

  constructor(
    readonly windowKm: number = TRACK_WINDOW_KM,
    readonly strideKm: number = TRACK_STRIDE_KM,
  ) {
    this.points = new Array<TrackPoint | undefined>(Math.max(2, Math.ceil(windowKm / strideKm) + 1));
  }

  /** Total distance flown, km. Survives the window rolling over. */
  get km(): number {
    return this.flownKm;
  }

  get length(): number {
    return this.count;
  }

  /**
   * The aircraft flew here. Records a point when a stride has passed.
   *
   * The distance is accumulated from the actual displacement rather than from
   * nominal ground speed, for the same reason `flyRoute` does it: true
   * airspeed rises as the air thins and the nominal number is 13 % short over
   * a climbing route.
   */
  advance(eastM: number, northM: number, altitudeM: number, groundM: number | null): void {
    const stepM = this.started ? Math.hypot(eastM - this.lastEastM, northM - this.lastNorthM) : 0;
    this.lastEastM = eastM;
    this.lastNorthM = northM;
    this.flownKm += stepM / 1000;
    this.sinceM += stepM;
    const first = !this.started || this.breakNext;
    this.started = true;
    if (!first && this.sinceM < this.strideKm * 1000) return;
    // The tile under the aircraft can be a frame or two from resident - after
    // a jump, and at the edge of the built corridor. A point with no ground
    // is worse than no point: it draws sea level through the Hengduan. So the
    // distance is kept, the sample is not taken, and the pen stays up.
    if (groundM === null) return;
    this.sinceM = 0;
    this.push({ eastM, northM, altitudeM, groundM, km: this.flownKm, joined: !first });
    this.breakNext = false;
  }

  /**
   * The aircraft is here and did not fly here: a map jump, a reset, a resume.
   *
   * Records nothing, and that is the point. The ground under a teleport is
   * not known on the frame it happens - the tile is made resident by the
   * *next* terrain update, so asking now returns null and a point written
   * here carries a sea-level elevation in the middle of Tibet. It was written
   * that way first and the profile read `ground 0-0 m` over the Hengduan.
   *
   * So this lifts the pen and moves the distance reference; the next
   * `advance` writes the first point of the new leg, with ground the terrain
   * has actually loaded.
   */
  moveTo(eastM: number, northM: number): void {
    this.lastEastM = eastM;
    this.lastNorthM = northM;
    this.sinceM = 0;
    this.started = true;
    this.breakNext = true;
  }

  private push(point: TrackPoint): void {
    this.points[this.head] = point;
    this.head = (this.head + 1) % this.points.length;
    if (this.count < this.points.length) this.count++;
  }

  /** The window, oldest first. At most `windowKm / strideKm + 1` points. */
  recent(): readonly TrackPoint[] {
    const out: TrackPoint[] = [];
    for (let i = 0; i < this.count; i++) {
      const p = this.points[(this.head - this.count + i + this.points.length * 2) % this.points.length];
      if (p) out.push(p);
    }
    return out;
  }

  /**
   * Nothing has been flown here. Used on a fresh profile and by an operator
   * between participants - the same verb the trigger field has.
   */
  forget(): void {
    this.points.fill(undefined);
    this.head = 0;
    this.count = 0;
    this.started = false;
    this.flownKm = 0;
    this.sinceM = 0;
    this.breakNext = true;
  }
}

export interface ProfileBand {
  readonly minGroundM: number;
  readonly maxGroundM: number;
  readonly minAltitudeM: number;
  readonly maxAltitudeM: number;
  readonly spanKm: number;
}

/**
 * What the profile has to fit on screen.
 *
 * Measured along Expedition 1, the relief inside a 200 km window runs from
 * 57 m over the eastern plain to 4,464 m through the Hengduan - **78 times**.
 * An axis fitted to whatever is in the window would draw the plain's 57 m of
 * noise at the full height of the widget and make farmland look like
 * mountains, which is F14's mistake with a different instrument. So a
 * renderer gets the band and decides; it does not get an autoscale (F42).
 */
export function bandOf(points: readonly TrackPoint[]): ProfileBand | null {
  if (points.length === 0) return null;
  let minG = Infinity;
  let maxG = -Infinity;
  let minA = Infinity;
  let maxA = -Infinity;
  for (const p of points) {
    minG = Math.min(minG, p.groundM);
    maxG = Math.max(maxG, p.groundM);
    minA = Math.min(minA, p.altitudeM);
    maxA = Math.max(maxA, p.altitudeM);
  }
  return {
    minGroundM: minG,
    maxGroundM: maxG,
    minAltitudeM: minA,
    maxAltitudeM: maxA,
    spanKm: points[points.length - 1]!.km - points[0]!.km,
  };
}
