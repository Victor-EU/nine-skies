/**
 * The ground's colour (F87): which file a tile is, an image handed over once
 * and decoded again if its tile comes back, a layer drawn in colour only once
 * its image is on the GPU, and a tile without colour left in the palette.
 */
import { describe, expect, it } from "vitest";
import type { InstancedBufferGeometry, WebGLRenderer } from "three";
import {
  COLOUR_SAMPLES,
  ColourSource,
  NO_COLOUR,
  colourProblem,
  type ColourImage,
  type ColourIndex,
} from "../../engine/src/terrain/colour.js";
import {
  COLOUR_BYTES_PER_FRAME,
  COLOUR_UPLOADS_PER_FRAME,
  ColourLayers,
  rendererUploader,
  type ColourUploader,
} from "../../engine/src/terrain/colourLayers.js";
import { HeightTileArray, TILE_SAMPLES } from "../../engine/src/terrain/tileArray.js";
import { Terrain } from "../../engine/src/terrain/terrain.js";
import { SyntheticTileSource } from "../../engine/src/terrain/tileSource.js";
import { TILE_KM } from "../../engine/src/terrain/syntheticTiles.js";
import { DEFAULT_SCALE } from "../../engine/src/sim/scale.js";

const index: ColourIndex = {
  version: 1,
  codec: "webp",
  cells: 256,
  samples: 257,
  rows: "north to south",
  source: { layer: "s2cloudless_3857", year: 2016, attribution: "EOX", licence: "CC BY 4.0", licenceUrl: "" },
  country: { "20_20": "c2020", "21_20": "c2120" },
  hero: { gorge: { lattice: "hero", window: { hx0: 5, hy0: 7, hx1: 7, hy1: 8 }, tiles: ["h57", "h67"] } },
};

function image(closed: string[], name = "img"): ColourImage {
  return { width: COLOUR_SAMPLES, height: COLOUR_SAMPLES, source: new Uint8Array(4), close: () => closed.push(name) };
}

/** A network and a decoder that answer when told to. */
function wire() {
  const fetched: string[] = [];
  const decoded: string[] = [];
  const pending: Array<() => void> = [];
  const fetch = (url: string) =>
    new Promise<Uint8Array>((resolve) => {
      fetched.push(url);
      pending.push(() => resolve(new TextEncoder().encode(url)));
    });
  const decode = async (bytes: Uint8Array) => {
    const url = new TextDecoder().decode(bytes);
    decoded.push(url);
    if (url.includes("bad")) throw new Error("not a WebP");
    return image([], url);
  };
  const settle = async () => {
    for (const release of pending.splice(0)) release();
    for (let k = 0; k < 5; k++) await Promise.resolve();
  };
  return { fetch, decode, fetched, decoded, settle };
}

describe("the colour index", () => {
  it("is refused when it is not what the engine draws", () => {
    expect(colourProblem(index)).toBeNull();
    expect(colourProblem({ ...index, samples: 129 })).toMatch(/129 samples/);
    expect(colourProblem({ ...index, rows: "south to north" })).toMatch(/rows/);
    expect(colourProblem({ ...index, codec: "jpeg" })).toMatch(/jpeg/);
  });
});

describe("the colour source", () => {
  it("names a country tile's file and a hero tile's, by the lattice's own coordinates", () => {
    const source = new ColourSource(index, "/c", undefined, undefined, () => 0);
    expect(source.nameOf("country", 21, 20)).toBe("c2120");
    expect(source.nameOf("hero", 6, 7)).toBe("h67");
    expect(source.nameOf("hero", 5, 8)).toBeNull();
    expect(source.provider("hero-30m")).toBeNull();
  });

  it("hands an image over once it is fetched and decoded, and once only", async () => {
    const w = wire();
    const source = new ColourSource(index, "/c", w.fetch, w.decode, () => 0);
    const country = source.provider("country")!;
    expect(country(20, 20)).toBeNull();
    expect(w.fetched).toEqual(["/c/c2020.webp"]);
    await w.settle();
    expect(country(20, 20)).toBeNull(); // the bytes are in; decoding
    await w.settle();
    const got = country(20, 20);
    expect(got).not.toBeNull();
    expect(got).not.toBe(NO_COLOUR);
    // Taken: asked again (the tile evicted and back), it is decoded again, not fetched again.
    expect(country(20, 20)).toBeNull();
    await w.settle();
    expect(country(20, 20)).not.toBeNull();
    expect(w.fetched).toHaveLength(1);
    expect(w.decoded).toHaveLength(2);
  });

  it("answers NO_COLOUR for a tile it has no file for, and for a file that will not decode", async () => {
    const w = wire();
    const source = new ColourSource({ ...index, country: { "1_1": "bad" } }, "/c", w.fetch, w.decode, () => 0);
    const country = source.provider("country")!;
    expect(country(9, 9)).toBe(NO_COLOUR);
    expect(country(1, 1)).toBeNull();
    await w.settle();
    expect(country(1, 1)).toBeNull();
    await w.settle();
    expect(country(1, 1)).toBe(NO_COLOUR);
    expect(source.stats.failures).toBe(1);
  });
});

function recorder() {
  const uploads: number[] = [];
  let mips = 0;
  const uploader: ColourUploader = {
    upload: (layer) => uploads.push(layer),
    mipmap: () => mips++,
  };
  return { uploader, uploads, mips: () => mips };
}

describe("the colour layers", () => {
  it("hold a layer's colour only once it is uploaded, a frame's budget at a time", () => {
    const layers = new ColourLayers(40);
    const closed: string[] = [];
    for (let l = 0; l < 20; l++) layers.queue(l, image(closed, `i${l}`));
    expect(layers.held(0)).toBe(false);
    const r = recorder();
    layers.flush(r.uploader);
    expect(r.uploads).toHaveLength(COLOUR_UPLOADS_PER_FRAME);
    expect(r.mips()).toBe(1);
    expect(layers.held(0)).toBe(true);
    expect(layers.held(19)).toBe(false);
    expect(closed).toHaveLength(COLOUR_UPLOADS_PER_FRAME);
    layers.flush(r.uploader);
    expect(layers.held(19)).toBe(true);
    expect(layers.pending).toBe(0);
    layers.flush(r.uploader);
    expect(r.mips()).toBe(2); // nothing uploaded, no mips rebuilt
  });

  it("forget a layer's colour, queued or held, when the layer takes another tile", () => {
    const layers = new ColourLayers(4);
    const closed: string[] = [];
    layers.queue(1, image(closed, "stale"));
    layers.reset(1);
    expect(closed).toEqual(["stale"]);
    expect(layers.wanted(1)).toBe(true);
    const r = recorder();
    layers.flush(r.uploader);
    expect(r.uploads).toEqual([]);
    layers.none(2);
    expect(layers.wanted(2)).toBe(false);
    expect(layers.held(2)).toBe(false);
  });

  it("refuse an image that is not a layer's size", () => {
    const layers = new ColourLayers(2);
    const closed: string[] = [];
    expect(() => layers.queue(0, { ...image(closed), width: 129 })).toThrow(/129 x 257/);
    expect(closed).toHaveLength(1);
  });

  it("are reset with the heights when a layer changes tile", () => {
    const arr = new HeightTileArray(1, TILE_SAMPLES, false, COLOUR_SAMPLES);
    const tile = new Int16Array(TILE_SAMPLES * TILE_SAMPLES);
    const layer = arr.insert(0, 0, tile);
    arr.colour!.queue(layer, image([]));
    arr.colour!.flush(recorder().uploader);
    expect(arr.colour!.held(layer)).toBe(true);
    arr.insert(0, 0, tile); // the same tile again: its colour stands
    expect(arr.colour!.held(layer)).toBe(true);
    arr.insert(5, 5, tile); // evicts it
    expect(arr.colour!.wanted(layer)).toBe(true);
    expect(new HeightTileArray(1).colour).toBeNull();
  });
});

/**
 * A large image a band of rows at a time: a near image (F95) is 10 MB, and
 * sent in one call it held the frame 15 to 300 ms.
 */
describe("the colour layers, a band at a time", () => {
  const NEAR = 1601;
  const big = (closed: string[], name: string): ColourImage => ({
    width: NEAR,
    height: NEAR,
    source: new Uint8Array(NEAR * NEAR * 4),
    close: () => closed.push(name),
  });
  function bands() {
    const sent: { layer: number; y: number; rows: number }[] = [];
    let mips = 0;
    const uploader: ColourUploader = {
      upload: (layer, _image, y, rows) => sent.push({ layer, y, rows }),
      mipmap: () => mips++,
    };
    return { uploader, sent, mips: () => mips };
  }
  const rowBytes = NEAR * 4;

  it("sends every row once, over the frames the bytes take, and holds the layer only at its last", () => {
    const layers = new ColourLayers(4, NEAR);
    const closed: string[] = [];
    layers.queue(2, big(closed, "near"));
    const r = bands();
    let frames = 0;
    while (!layers.held(2)) {
      const spent = layers.flush(r.uploader, 1, COLOUR_BYTES_PER_FRAME);
      expect(spent).toBeLessThanOrEqual(COLOUR_BYTES_PER_FRAME);
      frames++;
      if (!layers.held(2)) {
        // Half sent: never drawn, its mips not rebuilt, the image kept.
        expect(r.mips()).toBe(0);
        expect(closed).toEqual([]);
        expect(layers.pending).toBe(1);
      }
    }
    expect(frames).toBe(Math.ceil((NEAR * rowBytes) / (Math.floor(COLOUR_BYTES_PER_FRAME / rowBytes) * rowBytes)));
    expect(frames).toBeGreaterThan(1);
    let next = 0;
    for (const b of r.sent) {
      expect(b.layer).toBe(2);
      expect(b.y).toBe(next);
      next += b.rows;
    }
    expect(next).toBe(NEAR);
    expect(r.mips()).toBe(1);
    expect(closed).toEqual(["near"]);
    expect(layers.pending).toBe(0);
  });

  it("starts again from the first row when the layer takes another tile or another image part way", () => {
    const layers = new ColourLayers(4, NEAR);
    const closed: string[] = [];
    layers.queue(0, big(closed, "first"));
    const r = bands();
    layers.flush(r.uploader, 1, COLOUR_BYTES_PER_FRAME);
    layers.reset(0);
    expect(closed).toEqual(["first"]);
    expect(layers.held(0)).toBe(false);
    layers.queue(0, big(closed, "second"));
    r.sent.length = 0;
    layers.flush(r.uploader, 1, COLOUR_BYTES_PER_FRAME);
    expect(r.sent[0]!.y).toBe(0);
    layers.queue(0, big(closed, "third")); // a new image for it, half way through the second
    expect(closed).toEqual(["first", "second"]);
    r.sent.length = 0;
    layers.flush(r.uploader, 1, COLOUR_BYTES_PER_FRAME);
    expect(r.sent[0]!.y).toBe(0);
  });

  it("shares the frame's bytes: what one array sends, the next does not have", () => {
    const small = new ColourLayers(40);
    const closed: string[] = [];
    for (let l = 0; l < 3; l++) small.queue(l, image(closed, `s${l}`));
    const near = new ColourLayers(4, NEAR);
    near.queue(0, big(closed, "near"));
    const r = bands();
    let bytes = COLOUR_BYTES_PER_FRAME;
    bytes -= small.flush(r.uploader, COLOUR_UPLOADS_PER_FRAME, bytes);
    expect(bytes).toBe(COLOUR_BYTES_PER_FRAME - 3 * COLOUR_SAMPLES * COLOUR_SAMPLES * 4);
    bytes -= near.flush(r.uploader, 1, bytes);
    expect(bytes).toBeLessThan(rowBytes);
    expect(near.flush(r.uploader, 1, bytes)).toBe(0); // not a row's worth left
  });

  it("picks a picture's band out by the unpack rows, and puts them back for three", () => {
    const set = new Map<number, number>();
    const log: string[] = [];
    const gl = {
      TEXTURE_2D_ARRAY: 1,
      RGBA: 2,
      UNSIGNED_BYTE: 3,
      NONE: 4,
      UNPACK_FLIP_Y_WEBGL: 10,
      UNPACK_PREMULTIPLY_ALPHA_WEBGL: 11,
      UNPACK_COLORSPACE_CONVERSION_WEBGL: 12,
      UNPACK_ALIGNMENT: 13,
      UNPACK_ROW_LENGTH: 14,
      UNPACK_SKIP_ROWS: 15,
      texSubImage3D: (...a: unknown[]) =>
        log.push(`sub y=${String(a[3])} rows=${String(a[6])} rowLength=${set.get(14) ?? 0} skip=${set.get(15) ?? 0}`),
      generateMipmap: () => log.push("mips"),
    };
    const renderer = {
      getContext: () => gl,
      properties: { get: () => ({ __webglTexture: {} }) },
      initTexture: () => {},
      state: {
        bindTexture: () => {},
        unbindTexture: () => {},
        pixelStorei: (name: number, value: number) => set.set(name, value),
      },
    } as unknown as WebGLRenderer;
    const layers = new ColourLayers(2, NEAR);
    const picture: ColourImage = { width: NEAR, height: NEAR, source: {} as ImageBitmap, close: () => {} };
    layers.queue(1, picture);
    const uploader = rendererUploader(renderer, layers.texture);
    const rows = Math.floor(COLOUR_BYTES_PER_FRAME / rowBytes);
    layers.flush(uploader, 1, COLOUR_BYTES_PER_FRAME);
    layers.flush(uploader, 1, COLOUR_BYTES_PER_FRAME);
    expect(log).toEqual([
      `sub y=0 rows=${rows} rowLength=${NEAR} skip=0`,
      `sub y=${rows} rows=${rows} rowLength=${NEAR} skip=${rows}`,
    ]);
    expect(set.get(gl.UNPACK_ROW_LENGTH)).toBe(0);
    expect(set.get(gl.UNPACK_SKIP_ROWS)).toBe(0);
  });
});

describe("terrain in colour", () => {
  it("draws a tile in its colour from the frame after its image is uploaded, and the rest in the palette", async () => {
    const w = wire();
    const source = new ColourSource(index, "/c", w.fetch, w.decode, () => 0);
    const terrain = new Terrain({
      scale: { ...DEFAULT_SCALE },
      viewRadiusTiles: 1,
      layers: 16,
      source: new SyntheticTileSource(),
      colour: source,
    });
    const tileM = TILE_KM * 1000;
    const flags = () => {
      const out = new Map<number, number>();
      for (const mesh of terrain.meshes) {
        const geometry = mesh.geometry as InstancedBufferGeometry;
        if (!geometry.getAttribute("iColour")) continue;
        const layers = geometry.getAttribute("iLayer").array as Float32Array;
        const colour = geometry.getAttribute("iColour").array as Float32Array;
        for (let k = 0; k < geometry.instanceCount; k++) out.set(layers[k]!, colour[k]!);
      }
      return out;
    };
    const fly = () => terrain.update(20.5 * tileM, 20.5 * tileM, 2000);
    fly();
    expect(terrain.stats.colourPending).toBeGreaterThan(0);
    await w.settle(); // fetched
    fly();
    await w.settle(); // decoded
    fly(); // taken and queued
    expect(terrain.heights.colour!.pending).toBe(2);
    const coloured = terrain.heights.peekLayer(20, 20);
    const plain = terrain.heights.peekLayer(19, 20);
    expect(flags().get(coloured)).toBe(0);
    terrain.heights.colour!.flush(recorder().uploader);
    fly();
    expect(flags().get(coloured)).toBe(1);
    expect(flags().get(terrain.heights.peekLayer(21, 20))).toBe(1);
    expect(flags().get(plain)).toBe(0);
    expect(terrain.stats.colourPending).toBe(0);
    const fragment = terrain.material.fragmentShader;
    expect(fragment).toContain("uColour");
    expect(new Terrain({ scale: { ...DEFAULT_SCALE }, viewRadiusTiles: 1, layers: 16 }).material.fragmentShader).not.toContain("uColour");
  });
});
