/**
 * The ground's colour at 10 m near the camera (F91): which file a hero
 * tile's fine image is, a small pool of layers handed to the nearest tiles
 * and taken back from the ones flown away from, an array held only while a
 * tile near wants it, and a hero lattice that draws a tile's fine layer once
 * its image is on the GPU.
 */
import { describe, expect, it } from "vitest";
import type { InstancedBufferGeometry, ShaderMaterial } from "three";
import {
  COLOUR_SAMPLES,
  ColourSource,
  NO_COLOUR,
  colourProblem,
  type ColourAnswer,
  type ColourImage,
  type ColourIndex,
  type FineColourSource,
} from "../../engine/src/terrain/colour.js";
import type { ColourUploader } from "../../engine/src/terrain/colourLayers.js";
import { FINE_REACH, FineColour, IDLE_FRAMES, type FineReach } from "../../engine/src/terrain/fineColour.js";
import { HeroCover, type HeroAreaData } from "../../engine/src/terrain/heroSource.js";
import { HERO_TILE_SAMPLES } from "../../engine/src/terrain/tileArray.js";
import { SKIRT_DEPTH_M, Terrain } from "../../engine/src/terrain/terrain.js";
import { SyntheticTileSource } from "../../engine/src/terrain/tileSource.js";
import { DEFAULT_SCALE } from "../../engine/src/sim/scale.js";

const FINE = 1153;
const TILE_M = 11_520;

const index: ColourIndex = {
  version: 1,
  codec: "webp",
  cells: 256,
  samples: 257,
  rows: "north to south",
  source: { layer: "s2cloudless_3857", year: 2016, attribution: "EOX", licence: "CC BY 4.0", licenceUrl: "" },
  country: {},
  hero: {
    gorge: {
      lattice: "hero",
      window: { hx0: 10, hy0: 20, hx1: 12, hy1: 23 },
      tiles: ["h1020", "h1120", "h1021", "h1121", "h1022", "h1122"],
      fine: ["f1020", "f1120", "f1021", "f1121", "f1022", "f1122"],
    },
  },
  fine: { hero: { cells: 1152, samples: FINE } },
};

/** The index as it was before F91: no fine grid. */
function coarseOnly(i: ColourIndex): ColourIndex {
  const { fine: _fine, ...rest } = i;
  return rest;
}

function image(size: number, closed: string[] = [], name = "img"): ColourImage {
  return { width: size, height: size, source: new Uint8Array(4), close: () => closed.push(name) };
}

/** A network and a decoder that answer when told to; fine files decode fine-sized. */
function wire() {
  const fetched: string[] = [];
  const closed: string[] = [];
  const pending: Array<() => void> = [];
  const fetch = (url: string) =>
    new Promise<Uint8Array>((resolve) => {
      fetched.push(url);
      pending.push(() => resolve(new TextEncoder().encode(url)));
    });
  const decode = async (bytes: Uint8Array) => {
    const url = new TextDecoder().decode(bytes);
    return image(url.includes("/f") ? FINE : COLOUR_SAMPLES, closed, url);
  };
  const settle = async () => {
    for (const release of pending.splice(0)) release();
    for (let k = 0; k < 5; k++) await Promise.resolve();
  };
  return { fetch, decode, fetched, closed, settle };
}

function recorder(): ColourUploader & { uploads: number[] } {
  const uploads: number[] = [];
  return { uploads, upload: (layer) => uploads.push(layer), mipmap: () => {} };
}

describe("the fine colour's index", () => {
  it("is refused when a fine grid's samples are not its cells and one", () => {
    expect(colourProblem(index)).toBeNull();
    expect(colourProblem({ ...index, fine: { hero: { cells: 1152, samples: 1152 } } })).toMatch(/hero's fine colour/);
  });

  it("names a hero tile's fine file by the lattice's own coordinates, and only where the index has a grid for it", () => {
    const w = wire();
    const source = new ColourSource(index, "/c", w.fetch, w.decode, () => 0);
    const fine = source.fine("hero")!;
    expect(fine.samples).toBe(FINE);
    expect(fine.take(11, 21)).toBeNull();
    expect(w.fetched).toEqual(["/c/f1121.webp"]);
    expect(fine.take(9, 20)).toBe(NO_COLOUR);
    expect(source.fine("hero-30m")).toBeNull();
    expect(new ColourSource(coarseOnly(index), "/c", w.fetch, w.decode, () => 0).fine("hero")).toBeNull();
  });

  it("lets go of a fine image decoded for a tile that no longer wants it", async () => {
    const w = wire();
    const fine = new ColourSource(index, "/c", w.fetch, w.decode, () => 0).fine("hero")!;
    fine.take(10, 20);
    await w.settle(); // fetched
    expect(fine.take(10, 20)).toBeNull(); // decoding
    await w.settle();
    fine.drop(10, 20);
    expect(w.closed).toEqual(["/c/f1020.webp"]);
    // Asked again, it is decoded again from the bytes it kept.
    expect(fine.take(10, 20)).toBeNull();
    await w.settle();
    expect(fine.take(10, 20)).not.toBeNull();
    expect(w.fetched).toHaveLength(1);
  });
});

/** A fine source that answers at once, and records what it was asked and told to drop. */
function instant(samples = 7): FineColourSource & { asked: string[]; dropped: string[]; none: Set<string> } {
  const asked: string[] = [];
  const dropped: string[] = [];
  const none = new Set<string>();
  return {
    samples,
    asked,
    dropped,
    none,
    take: (i, j): ColourAnswer => {
      asked.push(`${i},${j}`);
      return none.has(`${i},${j}`) ? NO_COLOUR : image(samples);
    },
    drop: (i, j) => dropped.push(`${i},${j}`),
  };
}

const REACH: FineReach = { fullM: 1000, goneM: 2000, reachM: 3000, layers: 3, uploadsPerFrame: 8 };

describe("the fine colour's pool", () => {
  it("asks nothing for a tile past its reach, and holds no array until one within it is drawn", () => {
    const source = instant();
    const pool = new FineColour(REACH, source);
    expect(pool.place(0, 0, 3001)).toBe(0);
    pool.endFrame();
    expect(pool.layers).toBeNull();
    expect(pool.texture).toBe(pool.placeholder);
    expect(source.asked).toEqual([]);
  });

  it("draws a tile's fine layer only from the frame after its image is uploaded", () => {
    const source = instant();
    const textures: unknown[] = [];
    const pool = new FineColour(REACH, source, (t) => textures.push(t));
    expect(pool.place(4, 4, 0)).toBe(0);
    pool.endFrame();
    expect(textures).toEqual([pool.layers!.texture]);
    expect(pool.pending).toBe(1);
    expect(pool.place(4, 4, 0)).toBe(0); // queued, not yet on the GPU
    pool.endFrame();
    pool.layers!.flush(recorder());
    const layer = pool.place(4, 4, 0);
    expect(layer).toBeGreaterThan(0);
    pool.endFrame();
    expect(pool.held).toBe(1);
    expect(pool.pending).toBe(0);
    expect(source.asked).toEqual(["4,4"]);
  });

  it("gives its layers to the nearest tiles when more want one than it holds", () => {
    const source = instant();
    const pool = new FineColour(REACH, source);
    // Placed far to near, as a lattice places them: row by row.
    for (const [i, d] of [[1, 2500], [2, 1800], [3, 200], [4, 900], [5, 1200]] as const) pool.place(i, 0, d);
    pool.endFrame();
    expect(source.asked.sort()).toEqual(["3,0", "4,0", "5,0"]);
  });

  it("takes a layer back from the tile flown away from longest ago, and lets its image go", () => {
    const source = instant();
    const pool = new FineColour(REACH, source);
    const frame = (tiles: number[]) => {
      for (const i of tiles) pool.place(i, 0, 0);
      pool.endFrame();
      pool.layers!.flush(recorder());
    };
    frame([1, 2, 3]);
    frame([2, 3]); // 1 left behind first
    frame([3]);
    frame([3, 4]); // takes 1's layer, not 2's
    expect(source.dropped).toEqual(["1,0"]);
    frame([3, 4, 5]); // and then 2's
    expect(source.dropped).toEqual(["1,0", "2,0"]);
    expect(pool.place(1, 0, 0)).toBe(0);
  });

  it("keeps a tile with no fine image in its colour layer alone", () => {
    const source = instant();
    source.none.add("7,7");
    const pool = new FineColour(REACH, source);
    pool.place(7, 7, 0);
    pool.endFrame();
    pool.layers!.flush(recorder());
    expect(pool.place(7, 7, 0)).toBe(0);
    pool.endFrame();
    expect(pool.pending).toBe(0);
    expect(source.asked).toEqual(["7,7"]);
  });

  it("gives its array back when nothing near has wanted it for a while, and takes one again when something does", () => {
    const source = instant();
    const textures: unknown[] = [];
    const pool = new FineColour(REACH, source, (t) => textures.push(t));
    pool.place(1, 1, 0);
    pool.endFrame();
    const first = pool.layers!.texture;
    let disposed = false;
    first.addEventListener("dispose", () => (disposed = true));
    for (let k = 0; k < IDLE_FRAMES - 1; k++) pool.endFrame();
    expect(pool.layers).not.toBeNull();
    pool.endFrame();
    expect(pool.layers).toBeNull();
    expect(disposed).toBe(true);
    expect(source.dropped).toEqual(["1,1"]);
    expect(textures).toEqual([first, pool.placeholder]);
    pool.place(1, 1, 0);
    pool.endFrame();
    expect(pool.layers!.texture).not.toBe(first);
    expect(source.asked).toEqual(["1,1", "1,1"]);
  });

  it("holds, for each hero lattice, every tile within its reach of any point", () => {
    for (const [lattice, reach] of Object.entries(FINE_REACH)) {
      const tileM = lattice === "hero" ? TILE_M : 3_840;
      expect(reach.fullM).toBeLessThan(reach.goneM);
      expect(reach.goneM).toBeLessThan(reach.reachM);
      // The worst point is a tile's corner: count the tiles whose nearest point is in reach.
      let most = 0;
      for (const [x, y] of [[0, 0], [0.5, 0.5], [0, 0.5]] as const) {
        let n = 0;
        const r = Math.ceil(reach.reachM / tileM) + 1;
        for (let i = -r; i <= r; i++) {
          for (let j = -r; j <= r; j++) {
            const dx = Math.max(i - x, 0, x - (i + 1)) * tileM;
            const dy = Math.max(j - y, 0, y - (j + 1)) * tileM;
            if (Math.hypot(dx, dy) <= reach.reachM) n++;
          }
        }
        most = Math.max(most, n);
      }
      expect(reach.layers, lattice).toBeGreaterThanOrEqual(most);
    }
  });
});

function heroCover(): HeroCover {
  const stride = HERO_TILE_SAMPLES * HERO_TILE_SAMPLES;
  const window = { hx0: 10, hy0: 20, hx1: 12, hy1: 23 };
  const area: HeroAreaData = {
    manifest: {
      version: 1,
      area: "gorge",
      name: "gorge",
      resolutionM: 90,
      tileM: TILE_M,
      tileSamples: HERO_TILE_SAMPLES,
      silhouetteBias: 0.4,
      window,
      origin: { originXM: -3_456_000, originYM: 1_792_000 },
      countryTiles: [],
      holds: [],
      heights: { file: "gorge.bin", tiles: 6, bytes: 6 * stride * 2, sha256: "" },
      boundary: { meanM: 0, worstM: 0, skirtDepthM: SKIRT_DEPTH_M },
      elevationM: { min: 0, max: 0 },
    },
    heights: new Int16Array(6 * stride),
  };
  return new HeroCover(
    {
      version: 1,
      resolutionM: 90,
      tileM: TILE_M,
      tileSamples: HERO_TILE_SAMPLES,
      origin: { originXM: -3_456_000, originYM: 1_792_000 },
      areas: [{ id: "gorge", name: "gorge", file: "gorge.json", window, bytes: area.manifest.heights.bytes }],
    },
    [area],
  );
}

/** The hero lattice's fine flags, by tile origin. */
function fineFlags(terrain: Terrain): number[] {
  const out: number[] = [];
  for (const mesh of terrain.meshes) {
    const geometry = mesh.geometry as InstancedBufferGeometry;
    const fine = geometry.getAttribute("iFine");
    if (!fine) continue;
    for (let k = 0; k < geometry.instanceCount; k++) out.push((fine.array as Float32Array)[k]!);
  }
  return out;
}

describe("a hero lattice in fine colour", () => {
  it("draws the tiles near the camera in their fine layer once it is uploaded, and the rest in their colour layer", async () => {
    const w = wire();
    const terrain = new Terrain({
      scale: { ...DEFAULT_SCALE },
      viewRadiusTiles: 1,
      layers: 16,
      source: new SyntheticTileSource(),
      hero: heroCover(),
      colour: new ColourSource(index, "/c", w.fetch, w.decode, () => 0),
    });
    // Near tile (10, 20)'s south-west corner: the row at 22 is 22 km off, past the 16 km reach.
    const fly = () => terrain.update(10.05 * TILE_M, 20.05 * TILE_M, 2000);
    for (let k = 0; k < 4; k++) {
      fly();
      await w.settle();
    }
    fly();
    expect(terrain.stats.colourPending).toBeGreaterThan(0);
    // The lattice's own pool, which the renderer would flush: the test has no GPU.
    const hero = (terrain as unknown as { heroLattices: { lattice: { fine: FineColour; material: ShaderMaterial } }[] })
      .heroLattices[0]!.lattice;
    hero.fine.layers!.flush(recorder());
    fly();
    const flags = fineFlags(terrain);
    expect(flags).toHaveLength(6);
    expect(flags.filter((f) => f > 0)).toHaveLength(4);
    expect(terrain.stats.colourFine).toBe(4);
    expect(w.fetched.filter((u) => u.includes("/f")).sort()).toEqual(
      ["/c/f1020.webp", "/c/f1120.webp", "/c/f1021.webp", "/c/f1121.webp"].sort(),
    );
    expect(hero.material.uniforms.uColourFine!.value).toBe(hero.fine.layers!.texture);
    expect(hero.material.fragmentShader).toContain("uColourFine");
    // The fade is in world units: real metres over the horizontal compression.
    expect(hero.material.uniforms.uFineFade!.value.y).toBeCloseTo(FINE_REACH.hero!.goneM / DEFAULT_SCALE.horizontalCompression);
  });

  it("is not compiled in where the index has no fine grid", () => {
    const w = wire();
    const terrain = new Terrain({
      scale: { ...DEFAULT_SCALE },
      viewRadiusTiles: 1,
      layers: 16,
      source: new SyntheticTileSource(),
      hero: heroCover(),
      colour: new ColourSource(coarseOnly(index), "/c", w.fetch, w.decode, () => 0),
    });
    terrain.update(10.05 * TILE_M, 20.05 * TILE_M, 2000);
    expect(fineFlags(terrain)).toEqual([]);
    for (const m of terrain.materials) expect(m.fragmentShader).not.toContain("uColourFine");
  });
});
