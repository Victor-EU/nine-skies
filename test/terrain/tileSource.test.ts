import { describe, expect, it } from "vitest";
import {
  PackedTileSource,
  SyntheticTileSource,
  type TileSource,
  type WorldManifest,
} from "../../engine/src/terrain/tileSource.js";
import { TILE_SAMPLES } from "../../engine/src/terrain/tileArray.js";
import { HorizonField } from "../../engine/src/terrain/horizonField.js";
import { Terrain } from "../../engine/src/terrain/terrain.js";
import { DEFAULT_SCALE } from "../../engine/src/sim/scale.js";

const STRIDE = TILE_SAMPLES * TILE_SAMPLES;

function manifest(tx0: number, ty0: number, tx1: number, ty1: number): WorldManifest {
  const tiles = (tx1 - tx0) * (ty1 - ty0);
  return {
    version: 1,
    corridor: "test",
    tileKm: 64,
    tileSamples: TILE_SAMPLES,
    country: { tilesX: 105, tilesY: 69, originXM: -3_456_000, originYM: 1_792_000 },
    window: { tx0, ty0, tx1, ty1 },
    heights: { file: "heights.bin", tiles, tilesWithLand: tiles, bytes: tiles * STRIDE * 2, sha256: "" },
    horizon: { file: "horizon.bin", width: 9, height: 5, sampleKm: 8, silhouetteBias: 0.6 },
    anchors: {},
    start: { eastM: 0, northM: 0, altitudeM: 1200, headingRad: 0 },
    elevationM: { min: 0, max: 0 },
  };
}

/** One tile per cell, every sample stamped with the tile's own index. */
function stamped(tx0: number, ty0: number, tx1: number, ty1: number): Int16Array {
  const tiles = (tx1 - tx0) * (ty1 - ty0);
  const data = new Int16Array(tiles * STRIDE);
  let t = 0;
  for (let ty = ty0; ty < ty1; ty++) {
    for (let tx = tx0; tx < tx1; tx++) {
      data.fill(ty * 100 + tx, t * STRIDE, (t + 1) * STRIDE);
      t++;
    }
  }
  return data;
}

describe("packed tile source", () => {
  const w = { tx0: 28, ty0: 12, tx1: 33, ty1: 15 };
  const source = new PackedTileSource(
    manifest(w.tx0, w.ty0, w.tx1, w.ty1),
    stamped(w.tx0, w.ty0, w.tx1, w.ty1),
  );

  it("hands back the tile that was asked for, not its neighbour", () => {
    // The index arithmetic is the whole class. Off by one row and the country
    // is shifted 64 km north with nothing to show it.
    for (let ty = w.ty0; ty < w.ty1; ty++) {
      for (let tx = w.tx0; tx < w.tx1; tx++) {
        const tile = source.request(tx, ty)!;
        expect(tile).not.toBeNull();
        expect(tile.length).toBe(STRIDE);
        expect(tile[0]).toBe(ty * 100 + tx);
        expect(tile[STRIDE - 1]).toBe(ty * 100 + tx);
      }
    }
  });

  it("answers null past the corridor edge rather than inventing ground", () => {
    expect(source.request(w.tx0 - 1, w.ty0)).toBeNull();
    expect(source.request(w.tx1, w.ty0)).toBeNull();
    expect(source.request(w.tx0, w.ty0 - 1)).toBeNull();
    expect(source.request(w.tx0, w.ty1)).toBeNull();
    expect(source.request(0, 0)).toBeNull();
  });

  it("delegates past the edge when a fallback is supplied", () => {
    const withFallback = new PackedTileSource(
      manifest(w.tx0, w.ty0, w.tx1, w.ty1),
      stamped(w.tx0, w.ty0, w.tx1, w.ty1),
      new SyntheticTileSource(),
    );
    const outside = withFallback.request(0, 0);
    expect(outside).not.toBeNull();
    expect(outside!.length).toBe(STRIDE);
  });

  it("refuses a heights buffer that does not match its manifest", () => {
    expect(
      () => new PackedTileSource(manifest(0, 0, 2, 2), new Int16Array(3 * STRIDE)),
    ).toThrow(/manifest wants/);
  });

  it("refuses a manifest cut for a different tile size", () => {
    const bad = { ...manifest(0, 0, 1, 1), tileSamples: 33 };
    expect(() => new PackedTileSource(bad, new Int16Array(STRIDE))).toThrow(
      /tileSamples/,
    );
  });
});

describe("horizon field from a published raster", () => {
  it("adopts the pipeline's raster and reads it back", () => {
    const width = 9;
    const height = 5;
    const data = new Int16Array(width * height);
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) data[j * width + i] = j * 1000 + i * 10;
    }
    const field = HorizonField.fromData(data, width, height, 8);
    expect(field.width).toBe(width);
    expect(field.height).toBe(height);
    // Sample (i, j) sits at (i * 8 km, j * 8 km) from the south-west corner.
    expect(field.sampleM(0, 0)).toBeCloseTo(0, 6);
    expect(field.sampleM(8_000, 0)).toBeCloseTo(10, 6);
    expect(field.sampleM(0, 8_000)).toBeCloseTo(1000, 6);
    expect(field.sampleM(4_000, 4_000)).toBeCloseTo(505, 6);
  });

  it("refuses a raster whose length is not width x height", () => {
    expect(() => HorizonField.fromData(new Int16Array(10), 9, 5, 8)).toThrow(
      /9 x 5/,
    );
  });
});

describe("terrain over a partly published world", () => {
  /** A source that only has one tile, so most of the view is missing. */
  class OneTile implements TileSource {
    readonly pending = 0;
    readonly label = "one tile";
    request(tx: number, ty: number): Int16Array | null {
      if (tx !== 10 || ty !== 10) return null;
      return new Int16Array(STRIDE).fill(500);
    }
  }

  it("draws what exists and counts what does not", () => {
    const terrain = new Terrain({
      scale: { ...DEFAULT_SCALE },
      viewRadiusTiles: 3,
      layers: 64,
      source: new OneTile(),
    });
    terrain.update(10.5 * 64_000, 10.5 * 64_000, 2000);
    expect(terrain.stats.resident).toBe(1);
    expect(terrain.stats.instances).toBe(1);
    expect(terrain.stats.missing).toBeGreaterThan(20);
    // A missing tile must not become a hole at sea level.
    expect(terrain.groundElevationM(10.5 * 64_000, 10.5 * 64_000)).toBeCloseTo(500, 3);
    expect(terrain.groundElevationM(0, 0)).toBeNull();
  });

  it("keeps asking for missing tiles instead of giving up", () => {
    const terrain = new Terrain({
      scale: { ...DEFAULT_SCALE },
      viewRadiusTiles: 2,
      layers: 64,
      source: new OneTile(),
    });
    terrain.update(10.5 * 64_000, 10.5 * 64_000, 2000);
    const first = terrain.stats.missing;
    terrain.update(10.5 * 64_000, 10.5 * 64_000, 2000);
    expect(terrain.stats.missing).toBe(first);
  });
});
