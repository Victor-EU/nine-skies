/**
 * Altitude is automatic (design v2, controls). The camera holds the height
 * the rail asks for above the ground, looks ahead so a ridge is climbed
 * before it arrives rather than at it, and moves smoothly, with a rate cap so
 * a step in the data is a rise on screen rather than a jump.
 *
 * Nobody can hit a mountain, dive into the sea, or drift into the sky: the
 * result is clamped to the scene's band above the ground directly below.
 */
import type { Band } from "./scene.js";

export interface AltitudeOptions {
  /** Distances ahead along the heading the ground is read at, real km. */
  readonly lookAheadKm: readonly number[];
  /** Time constant of the approach to the target, seconds. */
  readonly tauS: number;
  /** The most the altitude may change in a second, real metres. */
  readonly maxRateMs: number;
}

export const DEFAULT_ALTITUDE: AltitudeOptions = {
  lookAheadKm: [0, 1.5, 4, 8],
  tauS: 2.5,
  maxRateMs: 400,
};

/** The ground at a point, or null where no tile is resident yet. */
export type GroundReader = (eastM: number, northM: number) => number | null;

export class AltitudeController {
  private altitudeM: number | null = null;
  private lastGroundM = 0;
  private readonly options: AltitudeOptions;

  constructor(options: Partial<AltitudeOptions> = {}) {
    this.options = { ...DEFAULT_ALTITUDE, ...options };
  }

  /** Forget the height, so the next update places rather than eases. */
  reset(): void {
    this.altitudeM = null;
  }

  get current(): number | null {
    return this.altitudeM;
  }

  update(
    dt: number,
    eastM: number,
    northM: number,
    headingRad: number,
    aboveGroundM: number,
    band: Band,
    ground: GroundReader,
  ): number {
    const o = this.options;
    const here = ground(eastM, northM);
    if (here !== null) this.lastGroundM = here;
    const under = here ?? this.lastGroundM;

    // The highest ground ahead sets the target; a tile that has not landed
    // reads as the ground under the camera rather than as sea level.
    let highest = under;
    const fe = Math.sin(headingRad);
    const fn = Math.cos(headingRad);
    for (const km of o.lookAheadKm) {
      if (km === 0) continue;
      const g = ground(eastM + fe * km * 1000, northM + fn * km * 1000);
      if (g !== null && g > highest) highest = g;
    }
    const wanted = highest + aboveGroundM;
    const target = Math.max(under + band.minM, Math.min(under + band.maxM, wanted));

    if (this.altitudeM === null) {
      this.altitudeM = target;
      return target;
    }
    const step = (target - this.altitudeM) * (1 - Math.exp(-dt / o.tauS));
    const cap = o.maxRateMs * dt;
    this.altitudeM += Math.max(-cap, Math.min(cap, step));
    // The band is a hard floor and ceiling whatever the smoothing is doing.
    this.altitudeM = Math.max(under + band.minM, Math.min(under + band.maxM, this.altitudeM));
    return this.altitudeM;
  }
}
