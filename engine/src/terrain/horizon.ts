import type { HorizonField } from "./horizonField.js";

/**
 * The horizon impostor's ray march (build plan D15).
 *
 * The terrain cache holds 384 km. From the Sichuan Basin the plateau wall is
 * 564 km away, so Expedition 1's signature moment - the wall rising ahead as
 * you leave the fog - is outside the drawn world. Something has to draw it.
 *
 * What is drawn is a silhouette, and a silhouette is exactly the maximum
 * elevation angle along each sight line. So rather than extending the terrain
 * with ever-coarser tiles - which needs hole-punching, fights the depth buffer
 * and pays for ground the haze hides anyway - we march the coarse field once
 * per azimuth and keep the highest angle. The result is a ridge line: a few
 * thousand triangles that carry the country's skyline exactly.
 *
 * Shells split the march by distance so near ranges draw in front of far ones
 * with their own haze. That layering is most of what reads as distance.
 */

export interface HorizonShell {
  /** Inclusive start distance, km. */
  fromKm: number;
  /** Exclusive end distance, km. */
  toKm: number;
}

/**
 * Three shells from the edge of the streamed terrain to 1,200 km.
 *
 * The inner edge is the tile cache's radius, not a little beyond it: the
 * bands are drawn first and the terrain draws over them, so overlapping is
 * free and abutting would leave a seam of sky at the join.
 */
export const DEFAULT_SHELLS: HorizonShell[] = [
  { fromKm: 384, toKm: 624 },
  { fromKm: 624, toKm: 880 },
  { fromKm: 880, toKm: 1200 },
];

export interface HorizonOptions {
  azimuths: number;
  shells: HorizonShell[];
  /** March step in km. Matches the field resolution; finer buys nothing. */
  stepKm: number;
}

export const DEFAULT_HORIZON: HorizonOptions = {
  azimuths: 1024,
  shells: DEFAULT_SHELLS,
  stepKm: 8,
};

export interface HorizonProfile {
  azimuths: number;
  shells: HorizonShell[];
  /** Eye position the profile was marched from. */
  eastM: number;
  northM: number;
  altitudeM: number;
  /** Ridge elevation, metres. Indexed [shell * azimuths + i]. */
  ridgeM: Float32Array;
  /** Distance to the ridge, metres. Same indexing. */
  ridgeDistM: Float32Array;
  /** Samples taken. Reported so the cost stays visible. */
  samples: number;
}

export function createProfile(options: HorizonOptions): HorizonProfile {
  const n = options.azimuths * options.shells.length;
  return {
    azimuths: options.azimuths,
    shells: options.shells,
    eastM: NaN,
    northM: NaN,
    altitudeM: NaN,
    ridgeM: new Float32Array(n),
    ridgeDistM: new Float32Array(n),
    samples: 0,
  };
}

/**
 * March the field and fill `out` in place.
 *
 * The comparison is a tangent, not an angle: `(height - eyeHeight) / distance`
 * is monotonic in elevation angle over the range that can be drawn, so the
 * inner loop needs no `atan`. Vertical exaggeration cancels out of the
 * comparison entirely, which is why it is absent here - the profile is a
 * property of the ground and the eye, and the scale is applied when the ridge
 * is turned into vertices.
 */
export function marchHorizon(
  field: HorizonField,
  eastM: number,
  northM: number,
  altitudeM: number,
  out: HorizonProfile,
  options: HorizonOptions = DEFAULT_HORIZON,
): HorizonProfile {
  out.eastM = eastM;
  out.northM = northM;
  out.altitudeM = altitudeM;
  out.samples = 0;
  return marchRange(field, out, 0, options.azimuths, options);
}

/**
 * March a slice of azimuths into a profile whose eye is already set.
 *
 * A full sweep is 2.6 ms on the development machine, which is a third of the
 * frame budget on the reference floor device for something that happens every
 * 25 km. Splitting it across frames costs nothing and removes it from the
 * frame-time risk entirely.
 */
export function marchRange(
  field: HorizonField,
  out: HorizonProfile,
  fromAzimuth: number,
  count: number,
  options: HorizonOptions = DEFAULT_HORIZON,
): HorizonProfile {
  const { azimuths, shells, stepKm } = options;
  const { eastM, northM, altitudeM } = out;
  let samples = out.samples;
  const end = Math.min(azimuths, fromAzimuth + count);

  for (let i = fromAzimuth; i < end; i++) {
    const theta = (i / azimuths) * Math.PI * 2;
    for (let s = 0; s < shells.length; s++) {
      const shell = shells[s]!;
      let bestTan = -Infinity;
      let bestM = 0;
      let bestDistM = shell.fromKm * 1000;

      // Both ends of the shell are sampled, so consecutive shells share a
      // sample rather than leaving a step-wide gap where a crest could hide.
      const span = shell.toKm - shell.fromKm;
      const steps = Math.floor(span / stepKm);
      const ue = Math.sin(theta) * 1000;
      const un = Math.cos(theta) * 1000;

      for (let k = 0; k <= steps + 1; k++) {
        const km = k <= steps ? shell.fromKm + k * stepKm : shell.toKm;
        // The extra pass only runs when the span is not a whole number of
        // steps; otherwise the endpoint is already covered.
        if (k > steps && shell.fromKm + steps * stepKm >= shell.toKm) break;
        const distM = km * 1000;
        const h = field.sampleM(eastM + ue * km, northM + un * km);
        samples++;
        const tan = (h - altitudeM) / distM;
        if (tan > bestTan) {
          bestTan = tan;
          bestM = h;
          bestDistM = distM;
        }
      }

      const idx = s * azimuths + i;
      out.ridgeM[idx] = bestM;
      out.ridgeDistM[idx] = bestDistM;
    }
  }

  out.samples = samples;
  return out;
}

/**
 * Whether the eye has moved far enough to be worth marching again.
 *
 * Horizontal movement shifts the ridge by parallax; altitude changes which
 * ridge wins the sight line, and does so faster, because a kilometre of climb
 * is worth far more angle at 600 km than a kilometre of travel is.
 */
export const REFRESH_HORIZONTAL_M = 25_000;
export const REFRESH_VERTICAL_M = 300;

export function needsRefresh(
  profile: HorizonProfile,
  eastM: number,
  northM: number,
  altitudeM: number,
): boolean {
  if (!Number.isFinite(profile.eastM)) return true;
  if (Math.abs(altitudeM - profile.altitudeM) > REFRESH_VERTICAL_M) return true;
  return (
    Math.hypot(eastM - profile.eastM, northM - profile.northM) > REFRESH_HORIZONTAL_M
  );
}

/**
 * Keeps the drawn profile whole while the next one is being marched.
 *
 * Two profiles: the one the ring is drawing, and the one being filled a slice
 * at a time. They swap only when the new sweep is complete, so the skyline is
 * never half of one position and half of another - which would read as a tear
 * running through the mountains rather than as the mountains moving.
 */
export class HorizonScheduler {
  readonly front: HorizonProfile;
  private readonly back: HorizonProfile;
  private cursor = -1;
  /** Milliseconds spent marching in the frame just past. For the HUD. */
  lastSliceMs = 0;

  constructor(
    private readonly field: HorizonField,
    private readonly options: HorizonOptions = DEFAULT_HORIZON,
    /** Azimuths per frame. 1,024 over eight frames is a third of a millisecond. */
    private readonly perFrame = 128,
  ) {
    this.front = createProfile(options);
    this.back = createProfile(options);
  }

  get marching(): boolean {
    return this.cursor >= 0;
  }

  /** Returns true when the drawn profile changed and the ring needs rebuilding. */
  update(eastM: number, northM: number, altitudeM: number): boolean {
    const t0 = performance.now();
    let swapped = false;

    if (!Number.isFinite(this.front.eastM)) {
      // Nothing to draw yet: take the whole sweep now rather than show a
      // world with no horizon for the first eight frames.
      marchHorizon(this.field, eastM, northM, altitudeM, this.front, this.options);
      swapped = true;
    } else if (this.cursor < 0) {
      if (needsRefresh(this.front, eastM, northM, altitudeM)) {
        this.back.eastM = eastM;
        this.back.northM = northM;
        this.back.altitudeM = altitudeM;
        this.back.samples = 0;
        this.cursor = 0;
      }
    } else {
      marchRange(this.field, this.back, this.cursor, this.perFrame, this.options);
      this.cursor += this.perFrame;
      if (this.cursor >= this.options.azimuths) {
        this.commit();
        this.cursor = -1;
        swapped = true;
      }
    }

    this.lastSliceMs = performance.now() - t0;
    return swapped;
  }

  /** 24 kB of copying, once every 25 km. Cheaper than reasoning about aliases. */
  private commit(): void {
    this.front.eastM = this.back.eastM;
    this.front.northM = this.back.northM;
    this.front.altitudeM = this.back.altitudeM;
    this.front.samples = this.back.samples;
    this.front.ridgeM.set(this.back.ridgeM);
    this.front.ridgeDistM.set(this.back.ridgeDistM);
  }
}
