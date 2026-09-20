import { WORLD_TILES_X, WORLD_TILES_Y, TILE_KM, sampleElevationM } from "./syntheticTiles.js";

/**
 * The coarse global heightfield (build plan D15).
 *
 * One low-resolution raster of the whole country, held in memory in its
 * entirety. It exists because two systems need to see ground that the streamed
 * tiles will never make resident:
 *
 *   - the horizon impostor, which has to find the plateau wall 560 km ahead
 *     while the tile cache holds 384 km;
 *   - the map overlay, which draws the same hypsometric ramp at country scale.
 *
 * At 8 km it is 656 x 424 Int16 samples - 557 kB raw, well under 200 kB
 * compressed - so it loads once at boot and never streams. Having the map and
 * the horizon read the same array is the point: the wall you fly towards and
 * the wall drawn on the map cannot disagree.
 */

export const HORIZON_SAMPLE_KM = 8;

/**
 * Downsampling bias, 0 = mean, 1 = maximum.
 *
 * A distant range is a silhouette, and a silhouette is the maximum along the
 * sight line - so averaging an 8 km cell shaves the ridge crests off and the
 * Himalaya arrive as a low hump. Taking the plain maximum instead inflates
 * every flat surface to the height of its tallest bump, which lifts the
 * plateau and fills in the Sichuan Basin. Biasing toward the peak keeps the
 * crests and leaves flat ground flat.
 *
 * Workstream A inherits this constant: the pipeline's pyramid reduction must
 * use it, or the horizon and the terrain will disagree about where mountains
 * are. `horizon.test.ts` holds it to keeping the ridge within 10 %.
 */
export const SILHOUETTE_BIAS = 0.6;

/** Sub-samples per side taken inside each cell when reducing. */
const SUBSAMPLES = 2;

export const WORLD_EAST_KM = WORLD_TILES_X * TILE_KM;
export const WORLD_NORTH_KM = WORLD_TILES_Y * TILE_KM;

export class HorizonField {
  readonly data: Int16Array;
  readonly width: number;
  readonly height: number;

  constructor(
    readonly sampleKm: number = HORIZON_SAMPLE_KM,
    readonly eastKm: number = WORLD_EAST_KM,
    readonly northKm: number = WORLD_NORTH_KM,
  ) {
    this.width = Math.ceil(eastKm / sampleKm) + 1;
    this.height = Math.ceil(northKm / sampleKm) + 1;
    this.data = new Int16Array(this.width * this.height);
  }

  /**
   * Fill from an elevation function, reducing each cell with the silhouette
   * bias. In production the pipeline ships this array pre-reduced and this
   * method is only used by tests and the stand-in world.
   */
  fill(elevationM: (inlandKm: number, northKm: number) => number): this {
    const sub = this.sampleKm / SUBSAMPLES;
    for (let j = 0; j < this.height; j++) {
      for (let i = 0; i < this.width; i++) {
        let sum = 0;
        let max = -Infinity;
        for (let sj = 0; sj < SUBSAMPLES; sj++) {
          for (let si = 0; si < SUBSAMPLES; si++) {
            const m = elevationM(
              i * this.sampleKm + (si + 0.5) * sub,
              j * this.sampleKm + (sj + 0.5) * sub,
            );
            sum += m;
            if (m > max) max = m;
          }
        }
        const mean = sum / (SUBSAMPLES * SUBSAMPLES);
        const reduced = mean + SILHOUETTE_BIAS * (max - mean);
        this.data[j * this.width + i] = Math.max(
          -32768,
          Math.min(32767, Math.round(reduced)),
        );
      }
    }
    return this;
  }

  /**
   * Elevation in metres at a real position, bilinear. Off the raster is open
   * sea, which is what gives the east coast a clean horizon rather than an
   * extrapolated one.
   */
  sampleM(eastM: number, northM: number): number {
    const fx = eastM / 1000 / this.sampleKm;
    const fy = northM / 1000 / this.sampleKm;
    if (fx < 0 || fy < 0 || fx > this.width - 1 || fy > this.height - 1) return 0;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(this.width - 1, x0 + 1);
    const y1 = Math.min(this.height - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const h00 = this.data[y0 * this.width + x0]!;
    const h10 = this.data[y0 * this.width + x1]!;
    const h01 = this.data[y1 * this.width + x0]!;
    const h11 = this.data[y1 * this.width + x1]!;
    const top = h00 + (h10 - h00) * tx;
    const bottom = h01 + (h11 - h01) * tx;
    return top + (bottom - top) * ty;
  }

  /** Bytes on the wire, uncompressed. Watched by the budget test. */
  get byteLength(): number {
    return this.data.byteLength;
  }

  /**
   * Adopt a raster the pipeline already reduced (workstream A stage 5).
   *
   * The pipeline sees all 64 one-kilometre samples inside each 8 km cell, so
   * its reduction is the real thing rather than this class's four sub-samples.
   * The layout and the bias constant are shared, which is the point: the wall
   * you fly at and the wall on the map are one artefact.
   */
  static fromData(
    data: Int16Array,
    width: number,
    height: number,
    sampleKm: number = HORIZON_SAMPLE_KM,
  ): HorizonField {
    if (data.length !== width * height) {
      throw new Error(
        `horizon raster is ${data.length} samples, not ${width} x ${height}`,
      );
    }
    const field = new HorizonField(
      sampleKm,
      (width - 1) * sampleKm,
      (height - 1) * sampleKm,
    );
    if (field.width !== width || field.height !== height) {
      throw new Error(
        `derived ${field.width} x ${field.height} from ${width} x ${height}`,
      );
    }
    field.data.set(data);
    return field;
  }
}

/** The stand-in world's horizon field. Replaced by the pipeline's raster. */
export function buildSyntheticHorizonField(sampleKm = HORIZON_SAMPLE_KM): HorizonField {
  return new HorizonField(sampleKm).fill(sampleElevationM);
}
