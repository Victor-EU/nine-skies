/**
 * The water the terrain draws (F72): the layer off the wire, the arithmetic the
 * shader does with it, and the path from a package to an instance that draws it.
 *
 * The shader cannot run here, so its arithmetic has a CPU copy in `water.ts`,
 * generated beside it from the same tables. These check the copy against the
 * geometry it claims: an offset read between four samples is the offset from
 * the point itself along a straight reach, and the line halfway between two
 * rivers is not drawn as a third.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HeightTileArray, TILE_SAMPLES, WATER_BYTES } from "../../engine/src/terrain/tileArray.js";
import { WATER_CHANNELS, deltaPlanes, decodeWater } from "../../engine/src/terrain/tileCodec.js";
import {
  NO_WATER,
  StreamingTileSource,
  waterProblem,
  type PackedWater,
  type TileIndex,
} from "../../engine/src/terrain/tileStream.js";
import type { WorldManifest } from "../../engine/src/terrain/tileSource.js";
import {
  NO_RIVER,
  OFFSET_STEP_M,
  OFFSET_ZERO,
  REACH_M,
  WATER_LAKE,
  WATER_SEA,
  riverAt,
  riverHalfWidthM,
  riverMinPx,
  stillAt,
  waterGlsl,
  type WaterSample,
} from "../../engine/src/terrain/water.js";
import { Terrain } from "../../engine/src/terrain/terrain.js";
import { DEFAULT_SCALE } from "../../engine/src/sim/scale.js";

const SAMPLE_M = 1000;
const WATER_STRIDE = TILE_SAMPLES * TILE_SAMPLES * WATER_CHANNELS;

/** The tile `waterCodec.fixture.bin` holds; `test_package.py` builds the same one. */
function knownWater(): Uint8Array {
  const out = new Uint8Array(WATER_STRIDE);
  for (let k = 0; k < out.length; k++) out[k] = (k * 37 + 11) % 256;
  return out;
}

/** A sample whose offset is (east, north) metres, quantised as `water.py` does. */
function sample(eastM: number, northM: number, river = 3, still = 0): WaterSample {
  const q = (m: number) => Math.min(255, Math.max(1, Math.round(m / OFFSET_STEP_M) + OFFSET_ZERO));
  return { east: q(eastM), north: q(northM), river, still };
}

/** The four samples around a cell, each offset from a straight line through it. */
function cellBeside(line: { x0: number; y0: number; angle: number }, i: number, j: number) {
  const ux = Math.cos(line.angle);
  const uy = Math.sin(line.angle);
  const at = (x: number, y: number) => {
    // The offset from the line to (x, y), in metres: the perpendicular part.
    const dx = x - line.x0;
    const dy = y - line.y0;
    const along = dx * ux + dy * uy;
    return sample((dx - along * ux) * SAMPLE_M, (dy - along * uy) * SAMPLE_M);
  };
  return [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)] as const;
}

describe("the water layer off the wire", () => {
  it("decodes the file the pipeline wrote", async () => {
    const bytes = new Uint8Array(readFileSync(new URL("./waterCodec.fixture.bin", import.meta.url)));
    expect(Array.from(await decodeWater(bytes, TILE_SAMPLES))).toEqual(Array.from(knownWater()));
  });

  it("takes a tile a host already un-gzipped, and refuses one of any other size", async () => {
    const raw = knownWater();
    expect(await decodeWater(raw, TILE_SAMPLES)).toBe(raw);
    await expect(decodeWater(raw.subarray(4), TILE_SAMPLES)).rejects.toThrow(/not a 65-sample tile of water/);
  });
});

describe("what the shader reads a river as", () => {
  it("is the distance from the point itself, along a straight reach", () => {
    // A line at 23 degrees through (3.3, 2.1), in samples; points either side of it.
    const line = { x0: 3.3, y0: 2.1, angle: (23 * Math.PI) / 180 };
    let worst = 0;
    for (const [px, py] of [
      [5.2, 3.1],
      [5.9, 3.8],
      [7.4, 3.6],
      [8.05, 4.9],
      [6.5, 4.4],
    ] as const) {
      const i = Math.floor(px);
      const j = Math.floor(py);
      const got = riverAt(cellBeside(line, i, j), px - i, py - j, SAMPLE_M, OFFSET_STEP_M);
      const dx = px - line.x0;
      const dy = py - line.y0;
      const truth = Math.abs(-dx * Math.sin(line.angle) + dy * Math.cos(line.angle)) * SAMPLE_M;
      worst = Math.max(worst, Math.abs(got.distanceM - truth));
    }
    // Only the bytes' own rounding: 16 m each way at most.
    expect(worst).toBeLessThan(23);
  });

  it("does not draw the line halfway between two rivers", () => {
    // Rivers along rows 0 and 4 of a cell grid: at row 2 the offsets flip.
    const corners = [sample(0, -2000), sample(0, -2000), sample(0, 2000), sample(0, 2000)] as const;
    const got = riverAt(corners, 0.5, 0.5, SAMPLE_M, OFFSET_STEP_M);
    // Read bilinearly the offset is zero here; the nearest sample says a river
    // is at least its own distance less a half-diagonal away. Its own distance
    // is 2 km as the bytes round it: 62 units of 32 m.
    expect(got.distanceM).toBeCloseTo(62 * OFFSET_STEP_M - SAMPLE_M * Math.SQRT1_2, 6);
    expect(got.distanceM).toBeGreaterThan(riverHalfWidthM(2) * 2);
  });

  it("says no river where a sample is past the reach", () => {
    const corners = [sample(0, 900), sample(0, 900), sample(0, 100), { ...sample(0, 0), river: NO_RIVER }] as const;
    expect(riverAt(corners, 0.5, 0.5, SAMPLE_M, OFFSET_STEP_M).river).toBe(NO_RIVER);
  });

  it("takes the river of the nearest sample", () => {
    const corners = [sample(0, 900, 9), sample(0, 900, 9), sample(0, 100, 2), sample(0, 100, 2)] as const;
    expect(riverAt(corners, 0.5, 0.5, SAMPLE_M, OFFSET_STEP_M).river).toBe(2);
  });

  it("draws standing water half a sample out from the last wet one", () => {
    const corners = [sample(0, 0, 0, WATER_SEA), sample(0, 0, 0, 0), sample(0, 0, 0, WATER_SEA), sample(0, 0, 0, 0)] as const;
    expect(stillAt(corners, 0.49, 0.3)).toBeGreaterThan(0.5);
    expect(stillAt(corners, 0.51, 0.3)).toBeLessThan(0.5);
  });

  it("holds the GDD's two rivers to a width in pixels and lets the rest thin away", () => {
    // The Yangtze is scalerank 1 and the Yellow River 3 in the fetched file.
    expect(riverMinPx(2)).toBeGreaterThan(0);
    expect(riverMinPx(4)).toBeGreaterThan(0);
    expect(riverMinPx(8)).toBe(0);
    expect(riverHalfWidthM(2)).toBeGreaterThan(riverHalfWidthM(8));
    // No drawn half-width may need an offset the layer does not carry.
    for (let r = 1; r < 16; r++) expect(riverHalfWidthM(r)).toBeLessThan(REACH_M - 708);
  });

  it("is generated from the same tables", () => {
    const glsl = waterGlsl(TILE_SAMPLES);
    expect(glsl).toContain(`RIVER_HALF_WIDTH_M[16] = float[](0.0, 600.0, 600.0, 420.0, 420.0,`);
    expect(glsl).toContain("ivec2(63)");
  });
});

const W = { tx0: 10, ty0: 10, tx1: 12, ty1: 11 };
const SHA = "a".repeat(64);

function manifest(): WorldManifest {
  return {
    version: 1,
    corridor: "test",
    tileKm: 64,
    tileSamples: TILE_SAMPLES,
    country: { tilesX: 105, tilesY: 69, originXM: -3_456_000, originYM: 1_792_000 },
    window: { ...W },
    heights: { file: "heights.bin", tiles: 2, tilesWithLand: 2, bytes: 0, sha256: SHA },
    horizon: { file: "horizon.bin", width: 3, height: 2, sampleKm: 8, silhouetteBias: 0.6 },
    anchors: {},
    start: { eastM: 0, northM: 0, altitudeM: 1200, headingRad: 0 },
    elevationM: { min: 0, max: 0 },
  };
}

function waterEntry(names: string[], over: Partial<PackedWater> = {}): PackedWater {
  return {
    codec: "rgba8-gzip",
    channels: 4,
    layout: "",
    offsetStepM: OFFSET_STEP_M,
    offsetZero: OFFSET_ZERO,
    reachM: REACH_M,
    classes: { land: 0, sea: WATER_SEA, lake: WATER_LAKE },
    sha256: "c".repeat(64),
    heightsSha256: SHA,
    files: 1,
    bytes: 0,
    names,
    ...over,
  };
}

/** Two tiles of ground at 500 m; the west one wet, the east one dry. */
function wetWorld(water?: PackedWater) {
  const ground = new Int16Array(TILE_SAMPLES * TILE_SAMPLES).fill(500);
  const lake = new Uint8Array(WATER_STRIDE);
  for (let k = 0; k < lake.length; k += 4) {
    lake[k] = OFFSET_ZERO;
    lake[k + 1] = OFFSET_ZERO;
    lake[k + 3] = WATER_LAKE;
  }
  const files = new Map<string, Uint8Array>([
    ["g", deltaPlanes(ground, TILE_SAMPLES)],
    ["w", lake],
  ]);
  const index: TileIndex = {
    version: 1,
    codec: "delta-planes-gzip",
    tileSamples: TILE_SAMPLES,
    heightsSha256: SHA,
    window: { ...W },
    order: "tile-row-major, ty ascending, then tx ascending",
    tiles: 2,
    files: 1,
    bytes: 0,
    names: ["g", "g"],
    ...(water !== undefined ? { water } : {}),
  };
  const asked: string[] = [];
  const waiting: (() => void)[] = [];
  const fetch = (url: string): Promise<Uint8Array> => {
    asked.push(url);
    const name = url.slice(url.lastIndexOf("/") + 1).replace(/\.bin$/, "");
    return new Promise((resolve, reject) =>
      waiting.push(() => (files.has(name) ? resolve(files.get(name)!) : reject(new Error(name)))),
    );
  };
  const release = async () => {
    for (const go of waiting.splice(0)) go();
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  };
  return { index, fetch, asked, release, lake };
}

describe("a streamed world's water", () => {
  it("answers null until a wet tile's water lands, and none for a dry tile", async () => {
    const net = wetWorld(waterEntry(["w", ""]));
    const source = new StreamingTileSource(manifest(), net.index, "/w/tiles", net.fetch);
    expect(source.water(11, 10)).toBe(NO_WATER);
    expect(source.water(10, 10)).toBeNull();
    expect(source.waterPending).toBe(1);
    await net.release();
    expect(Array.from(source.water(10, 10)!)).toEqual(Array.from(net.lake));
    expect(source.waterStats.files).toBe(1);
    expect(net.asked).toEqual(["/w/tiles/w.bin"]);
  });

  it("is none anywhere in a package without a layer", () => {
    const net = wetWorld();
    const source = new StreamingTileSource(manifest(), net.index, "/w/tiles", net.fetch);
    expect(source.water(10, 10)).toBe(NO_WATER);
    expect(source.waterRefused).toBeNull();
  });

  it("passes over a layer it cannot read, and flies dry", () => {
    const names = ["w", ""];
    const base = wetWorld().index;
    expect(waterProblem({ ...base, water: waterEntry(names) })).toBeNull();
    expect(waterProblem({ ...base, water: waterEntry(names, { codec: "rgba8-br" }) })).toMatch(/coded rgba8-br/);
    expect(waterProblem({ ...base, water: waterEntry(names, { offsetStepM: 16 }) })).toMatch(/offsets are 16 m/);
    expect(waterProblem({ ...base, water: waterEntry(names, { heightsSha256: "b".repeat(64) }) })).toMatch(
      /other heights/,
    );
    expect(waterProblem({ ...base, water: waterEntry(["w"]) })).toMatch(/1 water names for 2 tiles/);
  });
});

describe("the water array beside the heights", () => {
  it("asks for a tile's water once, and draws it only once it is written", () => {
    const arr = new HeightTileArray(4, TILE_SAMPLES, true);
    const layer = arr.insert(0, 0, new Int16Array(TILE_SAMPLES * TILE_SAMPLES));
    expect(arr.waterWanted(layer)).toBe(true);
    expect(arr.hasWater(layer)).toBe(false);
    arr.insertWater(layer, new Uint8Array(WATER_STRIDE).fill(1));
    expect(arr.waterWanted(layer)).toBe(false);
    expect(arr.hasWater(layer)).toBe(true);
    arr.flush();
    expect(arr.lastWaterUpload).toEqual({ layers: 1, whole: false });
  });

  it("writes nothing for a dry tile", () => {
    const arr = new HeightTileArray(4, TILE_SAMPLES, true);
    const layer = arr.insert(0, 0, new Int16Array(TILE_SAMPLES * TILE_SAMPLES));
    arr.insertWater(layer, NO_WATER);
    expect(arr.waterWanted(layer)).toBe(false);
    expect(arr.hasWater(layer)).toBe(false);
    arr.flush();
    expect(arr.lastWaterUpload.layers).toBe(0);
  });

  it("forgets a layer's water when another tile takes the layer", () => {
    const arr = new HeightTileArray(1, TILE_SAMPLES, true);
    const tile = new Int16Array(TILE_SAMPLES * TILE_SAMPLES);
    const layer = arr.insert(0, 0, tile);
    arr.insertWater(layer, new Uint8Array(WATER_STRIDE).fill(1));
    expect(arr.insert(5, 5, tile)).toBe(layer);
    expect(arr.hasWater(layer)).toBe(false);
    expect(arr.waterWanted(layer)).toBe(true);
  });

  it("refuses water that is not a layer's size, and an array without water wants none", () => {
    const arr = new HeightTileArray(2, TILE_SAMPLES, true);
    const layer = arr.insert(0, 0, new Int16Array(TILE_SAMPLES * TILE_SAMPLES));
    expect(() => arr.insertWater(layer, new Uint8Array(WATER_BYTES))).toThrow(/bytes of water/);
    const dry = new HeightTileArray(2, TILE_SAMPLES);
    expect(dry.water).toBeNull();
    expect(dry.waterWanted(dry.insert(0, 0, new Int16Array(TILE_SAMPLES * TILE_SAMPLES)))).toBe(false);
  });
});

describe("terrain over a world with water", () => {
  it("draws a tile's water the frame after it lands, and never a dry tile's", async () => {
    const net = wetWorld(waterEntry(["w", ""]));
    const source = new StreamingTileSource(manifest(), net.index, "/w/tiles", net.fetch);
    const terrain = new Terrain({ scale: { ...DEFAULT_SCALE }, viewRadiusTiles: 1, layers: 16, source });
    const flags = () => {
      const out = new Map<number, number>();
      for (const mesh of terrain.meshes) {
        const geometry = mesh.geometry as import("three").InstancedBufferGeometry;
        const layers = geometry.getAttribute("iLayer").array as Float32Array;
        const water = geometry.getAttribute("iWater").array as Float32Array;
        for (let k = 0; k < geometry.instanceCount; k++) out.set(layers[k]!, water[k]!);
      }
      return out;
    };
    const east = 10.5 * 64_000;
    const north = 10.5 * 64_000;
    terrain.update(east, north, 2000);
    await net.release(); // the ground
    terrain.update(east, north, 2000);
    const wet = terrain.heights.layerFor(10, 10);
    const dry = terrain.heights.layerFor(11, 10);
    expect(flags().get(wet)).toBe(0); // its water is on its way
    expect(flags().get(dry)).toBe(0);
    await net.release(); // the water
    terrain.update(east, north, 2000);
    expect(flags().get(wet)).toBe(1);
    expect(flags().get(dry)).toBe(0);
    expect(terrain.heights.hasWater(dry)).toBe(false);
  });
});
