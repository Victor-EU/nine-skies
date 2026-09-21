/**
 * The map's transform: world metres to the pixels of a widget. (GDD,
 * "Map overlay".)
 *
 * Short, and one rule in it matters. **The scale is uniform on both axes.**
 * The projection is equal-area by decision D1 — *"honest scale" is an
 * equal-area claim; Xinjiang has to be bigger* — and a map that fitted the
 * widget by stretching each axis independently would throw that away on the
 * one surface where a player can see two provinces at once and compare them.
 * So the map letterboxes rather than stretches, always.
 *
 * Everything drawn on it is already in world metres: the route's projected
 * waypoints, the card catchments (D30), the flown track. Nothing on the map
 * re-projects anything, which is what keeps the map and the world agreeing.
 */

export interface MapBounds {
  readonly eastM0: number;
  readonly northM0: number;
  readonly eastM1: number;
  readonly northM1: number;
}

export interface MapPixel {
  readonly x: number;
  readonly y: number;
}

export class MapView {
  /** Pixels per world metre, the same on both axes. */
  readonly scale: number;
  /** Where the bounds land inside the widget, after letterboxing. */
  readonly offsetX: number;
  readonly offsetY: number;

  constructor(
    readonly bounds: MapBounds,
    readonly widthPx: number,
    readonly heightPx: number,
    readonly padPx = 0,
  ) {
    const spanE = Math.max(1, bounds.eastM1 - bounds.eastM0);
    const spanN = Math.max(1, bounds.northM1 - bounds.northM0);
    const usableW = Math.max(1, widthPx - padPx * 2);
    const usableH = Math.max(1, heightPx - padPx * 2);
    this.scale = Math.min(usableW / spanE, usableH / spanN);
    this.offsetX = padPx + (usableW - spanE * this.scale) / 2;
    this.offsetY = padPx + (usableH - spanN * this.scale) / 2;
  }

  /** North is up, so the northing axis is flipped. */
  project(eastM: number, northM: number): MapPixel {
    return {
      x: this.offsetX + (eastM - this.bounds.eastM0) * this.scale,
      y: this.heightPx - this.offsetY - (northM - this.bounds.northM0) * this.scale,
    };
  }

  /** Kilometres per pixel, for a scale bar that is not a guess. */
  get kmPerPx(): number {
    return 1 / (this.scale * 1000);
  }
}

/**
 * The Heihe-Tengchong line, as latitude and longitude.
 *
 * GDD: *an invisible but felt diagonal. East of it the ground glows with
 * cities at night; west of it, almost nothing. The map overlay can toggle it
 * on.* Drawn from the same two endpoints the pipeline's equal-area probe
 * measures the 57/43 land split against, so the line on the map and the line
 * the projection is checked against cannot drift apart.
 *
 * `test/map/view.test.ts` reads those endpoints out of the probe file and
 * fails if they stop matching.
 */
export const HEIHE_TENGCHONG = {
  north: { latDeg: 50.25, lonDeg: 127.48 },
  south: { latDeg: 25.02, lonDeg: 98.49 },
  /** Percent of China's land area west of it (Hu Huanyong, 1935). */
  westPct: 57,
} as const;
