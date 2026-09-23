/**
 * Altitude is automatic (design v2, controls). The camera holds the height
 * the rail asks for above the ground, looks ahead so a ridge is climbed
 * before it arrives rather than at it, and moves smoothly, with a rate cap so
 * a step in the data is a rise on screen rather than a jump.
 *
 * How far ahead it looks is the scene's to say (F79, F81): eight kilometres
 * keeps the camera over everything on the plateau, while over a massif of
 * spires it must be short, or the camera sits above every peak in reach and
 * the scene is a map. A short look-ahead trusts the rate cap and the band's
 * floor for the spire that arrives between samples.
 *
 * It reads along the heading line only. A swath out to the frame's edges
 * was tried and refused (F81): in a gorge the walls beside the line are the
 * picture, and a controller that climbs for them puts the camera at the
 * band's ceiling for a third of the first bend.
 *
 * Nobody can hit a mountain, dive into the sea, or drift into the sky: the
 * result is clamped to the scene's band above the ground directly below.
 */
import type { Band } from "./scene.js";

export interface AltitudeOptions {
  /** How far ahead along the heading the ground is read, real km, unless the scene says. */
  readonly lookAheadKm: number;
  /** Time constant of the approach to the target, seconds. */
  readonly tauS: number;
  /** The most the altitude may change in a second, real metres. */
  readonly maxRateMs: number;
}

/** The film's look-ahead unless a scene says otherwise, real km. */
export const DEFAULT_LOOK_AHEAD_KM = 8;

export const DEFAULT_ALTITUDE: AltitudeOptions = {
  lookAheadKm: DEFAULT_LOOK_AHEAD_KM,
  tauS: 2.5,
  maxRateMs: 400,
};

/** Ground reads per update beyond the one under the camera. */
export const LOOK_AHEAD_SAMPLES = 8;

/**
 * Where the ground is read ahead of the camera: under it, and at even steps
 * out to the look-ahead, so a short look-ahead over a 30 m grid reads every
 * spire on the way rather than the ones its few samples happen to hit.
 */
export function lookAheadSamplesKm(farKm: number): readonly number[] {
  return Array.from({ length: LOOK_AHEAD_SAMPLES + 1 }, (_, i) => (farKm * i) / LOOK_AHEAD_SAMPLES);
}

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
    lookAheadKm: number = this.options.lookAheadKm,
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
    for (const km of lookAheadSamplesKm(lookAheadKm)) {
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
