/**
 * What the pipeline actually had under each published tile (F54).
 *
 * The heightfield writes zero for the East China Sea, zero for a cell this
 * build never fetched, and zero for everything outside the window, and until
 * now nothing separated them: the map tested `m === 0` and painted 39 % of
 * the frame one colour, five cells in six of which were not water (F45).
 *
 * The mirror settles most of it. Copernicus publishes a one-degree cell only
 * where there is something to publish, so a cell absent from the bucket is
 * open ocean — the publisher's own statement about where the water is, which
 * stage 1 has always had on disk and never read. `coverage.py` reads it and
 * the manifest carries one character per tile.
 *
 * What it does not settle is the ocean *inside* a fetched raster, which is
 * `coast` here and is phase 2's water mask. This module's whole job is to
 * keep that honest: four states that mean four things, and no fifth state
 * that means "probably water".
 */
import { TILE_KM } from "./syntheticTiles.js";
import type { WorldManifest } from "./tileSource.js";

export type TileCoverage =
  /** Every source cell under this tile was fetched; its zeros are elevations. */
  | "data"
  /** No source cell here exists in the mirror. The only state that is water. */
  | "ocean"
  /** Fetched on one side, open ocean on the other: a shoreline at 1°. */
  | "coast"
  /** A source cell exists here that this build did not fetch. */
  | "unreached"
  /** Outside the built window — no tile was published at all. */
  | "unbuilt"
  /** This world predates the record, so nothing is claimed either way. */
  | "unrecorded";

/** The manifest's own spelling, which is one character to keep it small. */
const FROM_CHAR: Record<string, TileCoverage> = {
  d: "data",
  o: "ocean",
  c: "coast",
  e: "unreached",
};

export interface CoverageRecord {
  order?: string;
  legend?: Record<string, string>;
  counts?: Record<string, number>;
  tiles?: string;
  unrecorded?: boolean;
}

/**
 * What this needs off a manifest, which is two fields.
 *
 * Narrower than `WorldManifest` on purpose: the corridor reader in `tools/`
 * has its own manifest type for the same file, and a parameter that asked for
 * the whole thing would make one of the two cast to the other.
 */
export interface CoveredWindow {
  window: WorldManifest["window"];
  coverage?: CoverageRecord;
}

export class WorldCoverage {
  private constructor(
    private readonly window: WorldManifest["window"],
    private readonly tiles: string,
  ) {}

  /**
   * Null for a world with no record, which is every world built before this
   * and is not the same as a world that recorded no coverage. A caller that
   * cannot tell those apart will eventually draw the second as the first.
   */
  static from(manifest: CoveredWindow): WorldCoverage | null {
    const record = manifest.coverage;
    if (!record?.tiles) return null;
    const w = manifest.window;
    const expected = (w.tx1 - w.tx0) * (w.ty1 - w.ty0);
    if (record.tiles.length !== expected) {
      throw new Error(
        `coverage records ${record.tiles.length} tiles, the window holds ${expected}`,
      );
    }
    return new WorldCoverage(w, record.tiles);
  }

  atTile(tx: number, ty: number): TileCoverage {
    const w = this.window;
    if (tx < w.tx0 || tx >= w.tx1 || ty < w.ty0 || ty >= w.ty1) return "unbuilt";
    const index = (ty - w.ty0) * (w.tx1 - w.tx0) + (tx - w.tx0);
    return FROM_CHAR[this.tiles[index]!] ?? "unrecorded";
  }

  at(eastM: number, northM: number): TileCoverage {
    const tileM = TILE_KM * 1000;
    return this.atTile(Math.floor(eastM / tileM), Math.floor(northM / tileM));
  }

  /** How many tiles of each state, for a report rather than for a frame. */
  counts(): Record<TileCoverage, number> {
    const out = {
      data: 0,
      ocean: 0,
      coast: 0,
      unreached: 0,
      unbuilt: 0,
      unrecorded: 0,
    };
    for (const ch of this.tiles) out[FROM_CHAR[ch] ?? "unrecorded"]++;
    return out;
  }
}
