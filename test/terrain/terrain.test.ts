import { describe, expect, it } from "vitest";
import { LOD_SEGMENTS, buildGrid, lodForDistance } from "../../engine/src/terrain/grid.js";
import { HeightTileArray, TILE_SAMPLES } from "../../engine/src/terrain/tileArray.js";
import {
  TILE_KM,
  generateTile,
  sampleElevationM,
  stepProfileM,
} from "../../engine/src/terrain/syntheticTiles.js";
import { Terrain } from "../../engine/src/terrain/terrain.js";
import { SyntheticTileSource } from "../../engine/src/terrain/tileSource.js";
import { DEFAULT_SCALE } from "../../engine/src/sim/scale.js";
import type { InstancedBufferGeometry } from "three";

describe("shared grid geometry", () => {
  it("wraps the surface in a skirt ring", () => {
    const g = buildGrid(4, 5);
    expect(g.side).toBe(5);
    expect(g.vertexCount).toBe(7 * 7);
    const skirtCount = g.skirt.reduce((a, b) => a + b, 0);
    expect(skirtCount).toBe(7 * 7 - 5 * 5);
  });

  it("strides across one 65x65 heightmap at every LOD", () => {
    for (const segments of LOD_SEGMENTS) {
      const g = buildGrid(segments, TILE_SAMPLES);
      const max = Math.max(...g.texel);
      // Every level reaches the far edge texel, so tiles meet exactly.
      expect(max).toBe(TILE_SAMPLES - 1);
      // And samples land on integers, so texelFetch needs no rounding.
      for (const t of g.texel) expect(Number.isInteger(t)).toBe(true);
    }
  });

  it("covers the unit tile with both corners on the boundary", () => {
    const g = buildGrid(8, TILE_SAMPLES);
    expect(Math.min(...g.uv)).toBe(0);
    expect(Math.max(...g.uv)).toBe(1);
  });

  it("drops a LOD level as tiles get further away", () => {
    const size = 8000;
    expect(lodForDistance(0, size)).toBe(0);
    expect(lodForDistance(size * 3, size)).toBe(1);
    expect(lodForDistance(size * 8, size)).toBe(2);
    expect(lodForDistance(size * 40, size)).toBe(3);
  });
});

describe("heightmap texture array", () => {
  it("stores and reads a tile back", () => {
    const arr = new HeightTileArray(4);
    const heights = new Int16Array(TILE_SAMPLES * TILE_SAMPLES).fill(1234);
    arr.insert(3, 7, heights);
    expect(arr.has(3, 7)).toBe(true);
    expect(arr.layerFor(3, 7)).toBe(0);
    expect(arr.sample(3, 7, 0.5, 0.5)).toBeCloseTo(1234, 6);
  });

  it("interpolates between samples on the CPU", () => {
    const arr = new HeightTileArray(2);
    const heights = new Int16Array(TILE_SAMPLES * TILE_SAMPLES);
    // Ramp 0 -> 64 along x.
    for (let j = 0; j < TILE_SAMPLES; j++)
      for (let i = 0; i < TILE_SAMPLES; i++) heights[j * TILE_SAMPLES + i] = i;
    arr.insert(0, 0, heights);
    expect(arr.sample(0, 0, 0, 0)).toBeCloseTo(0, 6);
    expect(arr.sample(0, 0, 1, 0)).toBeCloseTo(64, 6);
    // Halfway between texel 32 and 33.
    expect(arr.sample(0, 0, 32.5 / 64, 0)).toBeCloseTo(32.5, 6);
  });

  it("evicts the least recently used layer when full", () => {
    const arr = new HeightTileArray(2);
    const h = new Int16Array(TILE_SAMPLES * TILE_SAMPLES);
    arr.insert(0, 0, h);
    arr.insert(1, 0, h);
    arr.layerFor(0, 0); // touch 0,0 so 1,0 becomes the oldest
    arr.insert(2, 0, h);
    expect(arr.has(0, 0)).toBe(true);
    expect(arr.has(1, 0)).toBe(false);
    expect(arr.has(2, 0)).toBe(true);
    expect(arr.residentCount).toBe(2);
  });

  it("reports nothing for a tile that is not resident", () => {
    const arr = new HeightTileArray(2);
    expect(arr.sample(9, 9, 0.5, 0.5)).toBeNull();
    expect(arr.layerFor(9, 9)).toBe(-1);
  });
});

/**
 * What reaches the GPU when a tile lands (F70). The whole 2.16 MB array was
 * sent every time any tile did; now a frame sends the layers it wrote, each a
 * `texSubImage3D`, unless it wrote more than half of them.
 */
describe("each tile knows its neighbours, for the smooth normals along its edge", () => {
  it("peeks at a layer without keeping it from eviction", () => {
    const arr = new HeightTileArray(2);
    const tile = new Int16Array(TILE_SAMPLES * TILE_SAMPLES);
    arr.insert(0, 0, tile);
    arr.insert(1, 0, tile);
    expect(arr.peekLayer(0, 0)).toBe(0);
    expect(arr.peekLayer(5, 5)).toBe(-1);
    arr.insert(2, 0, tile); // evicts the least recently used: (0, 0), peeked or not
    expect(arr.has(0, 0)).toBe(false);
    expect(arr.has(1, 0)).toBe(true);
  });

  it("gives every drawn tile the layers west, east, south and north of it, -1 where none is resident", () => {
    const terrain = new Terrain({ scale: { ...DEFAULT_SCALE }, viewRadiusTiles: 2, layers: 64, source: new SyntheticTileSource() });
    const tileM = TILE_KM * 1000;
    terrain.update(20.5 * tileM, 20.5 * tileM, 2000);
    const tileOfLayer = new Map<number, string>();
    for (let j = 15; j <= 26; j++) {
      for (let i = 15; i <= 26; i++) {
        const layer = terrain.heights.peekLayer(i, j);
        if (layer >= 0) tileOfLayer.set(layer, `${i},${j}`);
      }
    }
    let drawn = 0;
    let edges = 0;
    for (const mesh of terrain.meshes) {
      const geometry = mesh.geometry as InstancedBufferGeometry;
      if (!geometry.getAttribute("iNeighbours")) continue; // the rim curtain
      const layers = geometry.getAttribute("iLayer").array as Float32Array;
      const neighbours = geometry.getAttribute("iNeighbours").array as Float32Array;
      for (let k = 0; k < geometry.instanceCount; k++) {
        const [i, j] = tileOfLayer.get(layers[k]!)!.split(",").map(Number) as [number, number];
        const around = [
          [i - 1, j],
          [i + 1, j],
          [i, j - 1],
          [i, j + 1],
        ] as const;
        around.forEach(([x, y], side) => {
          const got = neighbours[k * 4 + side]!;
          expect(got).toBe(terrain.heights.peekLayer(x, y));
          if (got < 0) edges++;
        });
        drawn++;
      }
    }
    expect(drawn).toBeGreaterThan(9);
    // The disc's own rim has nothing beyond it.
    expect(edges).toBeGreaterThan(0);
    expect(tileOfLayer.get(terrain.heights.peekLayer(20, 20))).toBe("20,20");
    for (const [x, y] of [[19, 20], [21, 20], [20, 19], [20, 21]]) {
      expect(terrain.heights.peekLayer(x!, y!)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("uploading the heightmap array", () => {
  const tile = (v: number) => new Int16Array(TILE_SAMPLES * TILE_SAMPLES).fill(v);
  /** What the renderer does once it has made the upload. */
  const uploaded = (arr: HeightTileArray) => {
    arr.texture.onUpdate?.(arr.texture);
    arr.texture.clearLayerUpdates();
  };

  it("sends only the layers a frame wrote", () => {
    const arr = new HeightTileArray(8);
    uploaded(arr);
    const version = arr.texture.version;
    arr.insert(0, 0, tile(1));
    arr.insert(5, 5, tile(2));
    arr.flush();
    expect([...arr.texture.layerUpdates].sort()).toEqual([0, 1]);
    expect(arr.texture.version).toBe(version + 1);
    expect(arr.lastUpload).toEqual({ layers: 2, whole: false });
  });

  it("sends nothing when nothing was written", () => {
    const arr = new HeightTileArray(8);
    uploaded(arr);
    const version = arr.texture.version;
    arr.flush();
    expect(arr.texture.version).toBe(version);
    expect(arr.lastUpload).toEqual({ layers: 0, whole: false });
  });

  it("sends the whole array when more than half of it changed at once", () => {
    const arr = new HeightTileArray(4);
    uploaded(arr);
    for (let i = 0; i < 3; i++) arr.insert(i, 0, tile(i));
    arr.flush();
    expect(arr.texture.layerUpdates.size).toBe(0);
    expect(arr.lastUpload).toEqual({ layers: 3, whole: true });
  });

  it("does not narrow a whole upload that has not been made yet", () => {
    const arr = new HeightTileArray(4);
    uploaded(arr);
    for (let i = 0; i < 3; i++) arr.insert(i, 0, tile(i));
    arr.flush();
    arr.insert(3, 0, tile(3));
    arr.flush(); // a second update before any render
    expect(arr.texture.layerUpdates.size).toBe(0);
    expect(arr.lastUpload.whole).toBe(true);
    uploaded(arr);
    arr.insert(3, 0, tile(4));
    arr.flush();
    expect([...arr.texture.layerUpdates]).toEqual([3]);
  });

  it("sends a layer again when an evicted tile's heights replace it", () => {
    const arr = new HeightTileArray(8);
    for (let i = 0; i < 8; i++) arr.insert(i, 0, tile(i));
    arr.flush();
    uploaded(arr);
    arr.layerFor(0, 0); // so layer 1 is the oldest
    arr.insert(9, 9, tile(99));
    arr.flush();
    expect([...arr.texture.layerUpdates]).toEqual([1]);
    expect(arr.sample(9, 9, 0.5, 0.5)).toBe(99);
  });
});

/**
 * The stand-in terrain has one job: be shaped like the thing gate G1 asks
 * about. If the three steps are not in it, the prototype cannot answer the
 * question it exists to answer.
 */
describe("stand-in terrain has China's shape", () => {
  it("rises in three steps from the coast", () => {
    const coast = stepProfileM(100);
    const plain = stepProfileM(900);
    const middle = stepProfileM(2300);
    const plateau = stepProfileM(3800);
    expect(coast).toBeLessThan(120);
    expect(plain).toBeGreaterThan(350);
    expect(middle).toBeGreaterThan(1400);
    expect(middle).toBeLessThan(2100);
    expect(plateau).toBeGreaterThan(4000);
    expect(plateau).toBeLessThan(5200);
  });

  it("puts a basin in front of the plateau wall", () => {
    // Sichuan sits lower than the uplands on either side of it, which is why
    // climbing out of the fog and seeing the wall works as a moment.
    const beforeBasin = stepProfileM(2350);
    const inBasin = stepProfileM(2750);
    const wall = stepProfileM(3500);
    expect(inBasin).toBeLessThan(beforeBasin - 700);
    expect(wall - inBasin).toBeGreaterThan(3000);
  });

  it("has ground below sea level somewhere", () => {
    expect(sampleElevationM(3900, 2450)).toBeLessThan(0);
  });

  it("stays inside Int16 metres everywhere it is sampled", () => {
    let min = Infinity;
    let max = -Infinity;
    for (let x = 0; x < 5200; x += 37) {
      for (let y = 0; y < 3400; y += 41) {
        const m = sampleElevationM(x, y);
        min = Math.min(min, m);
        max = Math.max(max, m);
      }
    }
    expect(min).toBeGreaterThan(-32768);
    expect(max).toBeLessThan(32767);
    // And in the plausible range for real terrain: Ayding Lake at the bottom,
    // nothing taller than Everest at the top.
    expect(min).toBeGreaterThan(-500);
    expect(max).toBeLessThan(8849);
  });

  it("generates tiles that agree with the sampler at their corners", () => {
    const tile = generateTile(10, 5);
    expect(tile.length).toBe(TILE_SAMPLES * TILE_SAMPLES);
    const expected = Math.round(sampleElevationM(10 * TILE_KM, 5 * TILE_KM));
    expect(tile[0]).toBe(expected);
  });

  it("makes neighbouring tiles share their edge exactly", () => {
    // Tile (4,0)'s last column must equal tile (5,0)'s first column, or the
    // world has seams the skirts cannot hide.
    const a = generateTile(4, 0);
    const b = generateTile(5, 0);
    for (let j = 0; j < TILE_SAMPLES; j++) {
      expect(a[j * TILE_SAMPLES + (TILE_SAMPLES - 1)]).toBe(b[j * TILE_SAMPLES]);
    }
  });
});
