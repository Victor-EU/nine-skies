/**
 * The ground's relief below its grid (F93): an index of a normal map a
 * tile, which file a country or hero tile's relief is, pools reaching far
 * enough for every tile near any point, lattices lit by it once its image
 * is on the GPU, and scene packs that list every country tile the camera
 * comes near.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { InstancedBufferGeometry, ShaderMaterial } from "three";
import { COLOUR_SAMPLES, ColourSource, type ColourImage, type ColourIndex } from "../../engine/src/terrain/colour.js";
import type { ColourUploader } from "../../engine/src/terrain/colourLayers.js";
import type { FineColour } from "../../engine/src/terrain/fineColour.js";
import {
  RELIEF_ENCODING,
  RELIEF_INDEX_VERSION,
  RELIEF_REACH,
  ReliefSource,
  loadReliefIndex,
  reliefProblem,
  type ReliefIndex,
} from "../../engine/src/terrain/relief.js";
import { Terrain, reliefGain } from "../../engine/src/terrain/terrain.js";
import { SyntheticTileSource } from "../../engine/src/terrain/tileSource.js";
import { TILE_KM } from "../../engine/src/terrain/syntheticTiles.js";
import { DEFAULT_SCALE } from "../../engine/src/sim/scale.js";
import { nearTiles, tileKey } from "../../engine/src/film/reach.js";
import { buildRail } from "../../engine/src/film/scene.js";
import { loadFilm } from "../../tools/film.ts";

const COUNTRY = 513;
const TILE_M = TILE_KM * 1000;

const reliefIndex: ReliefIndex = {
  version: RELIEF_INDEX_VERSION,
  codec: "webp",
  encoding: RELIEF_ENCODING,
  rows: "north to south",
  source: "Copernicus DEM GLO-30",
  grids: { country: { cells: 512, samples: COUNTRY }, hero: { cells: 384, samples: 385 } },
  country: { "0_0": "relief-a", "1_0": "relief-b", "0_1": "relief-c" },
  hero: { gorge: { lattice: "hero", window: { hx0: 10, hy0: 20, hx1: 12, hy1: 21 }, tiles: ["relief-h1", "relief-h2"] } },
};

const colourIndex: ColourIndex = {
  version: 1,
  codec: "webp",
  cells: 256,
  samples: 257,
  rows: "north to south",
  source: { layer: "s2cloudless_3857", year: 2016, attribution: "EOX", licence: "CC BY 4.0", licenceUrl: "" },
  country: { "0_0": "c00", "1_0": "c10", "0_1": "c01", "1_1": "c11" },
  hero: {},
};

/** A network and a decoder that answer when told to; relief files decode relief-sized. */
function wire() {
  const fetched: string[] = [];
  const pending: Array<() => void> = [];
  const fetch = (url: string) =>
    new Promise<Uint8Array>((resolve) => {
      fetched.push(url);
      pending.push(() => resolve(new TextEncoder().encode(url)));
    });
  const decode = async (bytes: Uint8Array): Promise<ColourImage> => {
    const url = new TextDecoder().decode(bytes);
    const size = url.includes("relief-") ? COUNTRY : COLOUR_SAMPLES;
    return { width: size, height: size, source: new Uint8Array(4), close: () => {} };
  };
  const settle = async () => {
    for (const release of pending.splice(0)) release();
    for (let k = 0; k < 5; k++) await Promise.resolve();
  };
  return { fetch, decode, fetched, settle };
}

function recorder(): ColourUploader {
  return { upload: () => {}, mipmap: () => {} };
}

/** The country lattice's relief flags, by instance. */
function reliefFlags(terrain: Terrain): number[] {
  const out: number[] = [];
  for (const mesh of terrain.meshes) {
    const geometry = mesh.geometry as InstancedBufferGeometry;
    const relief = geometry.getAttribute("iRelief");
    if (!relief) continue;
    for (let k = 0; k < geometry.instanceCount; k++) out.push((relief.array as Float32Array)[k]!);
  }
  return out;
}

describe("the relief's index", () => {
  it("is taken whole, and refused for another version, encoding or row order, or a grid that is not its cells and one", () => {
    expect(reliefProblem(reliefIndex)).toBeNull();
    expect(reliefProblem({ ...reliefIndex, version: 2 })).toMatch(/version/);
    expect(reliefProblem({ ...reliefIndex, encoding: "normal-xy" })).toMatch(/encoded/);
    expect(reliefProblem({ ...reliefIndex, rows: "south to north" })).toMatch(/rows/);
    expect(reliefProblem({ ...reliefIndex, grids: { country: { cells: 512, samples: 512 } } })).toMatch(/cells/);
  });

  it("loads, or is null when absent or unreadable", async () => {
    const bytes = (value: unknown) => async () => new TextEncoder().encode(JSON.stringify(value));
    expect(await loadReliefIndex("/relief/index.json", bytes(reliefIndex))).toEqual(reliefIndex);
    expect(await loadReliefIndex("/relief/index.json", bytes({ ...reliefIndex, version: 9 }))).toBeNull();
    expect(
      await loadReliefIndex("/relief/index.json", async () => {
        throw new Error("404");
      }),
    ).toBeNull();
  });

  it("names a country tile's file by its tile, a hero tile's by the lattice's own coordinates, and none for a lattice without a grid", async () => {
    const w = wire();
    const source = new ReliefSource(reliefIndex, "/r", w.fetch, w.decode, () => 0);
    const country = source.layer("country")!;
    expect(country.samples).toBe(COUNTRY);
    expect(country.take(1, 0)).toBeNull();
    expect(country.take(5, 5)).not.toBeNull(); // NO_COLOUR: no file for it
    const hero = source.layer("hero")!;
    expect(hero.samples).toBe(385);
    expect(hero.take(11, 20)).toBeNull();
    expect(w.fetched).toEqual(["/r/relief-b.webp", "/r/relief-h2.webp"]);
    expect(source.layer("hero-30m")).toBeNull();
    expect(source.pending).toBe(2);
  });
});

describe("the relief's reach", () => {
  it("fades before it lets go, and holds every tile within its reach of any point", () => {
    for (const [lattice, reach] of Object.entries(RELIEF_REACH)) {
      const tileM = lattice === "hero" ? 11_520 : TILE_M;
      expect(reach.fullM).toBeLessThan(reach.goneM);
      expect(reach.goneM).toBeLessThan(reach.reachM);
      let most = 0;
      for (const [x, y] of [[0, 0], [0.5, 0.5], [0, 0.5], [0.25, 0.1]] as const) {
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

describe("a lattice lit by its relief", () => {
  it("lights the tiles near the camera by their relief once it is uploaded, as steep as the world draws the ground", async () => {
    const w = wire();
    const terrain = new Terrain({
      scale: { ...DEFAULT_SCALE },
      viewRadiusTiles: 1,
      layers: 16,
      source: new SyntheticTileSource(),
      colour: new ColourSource(colourIndex, "/c", w.fetch, w.decode, () => 0),
      relief: new ReliefSource(reliefIndex, "/r", w.fetch, w.decode, () => 0),
    });
    const fly = () => terrain.update(0.5 * TILE_M, 0.5 * TILE_M, 2000);
    for (let k = 0; k < 4; k++) {
      fly();
      await w.settle();
    }
    fly();
    expect(terrain.stats.colourPending).toBeGreaterThan(0); // a still waits for the relief
    const country = (terrain as unknown as { country: { relief: FineColour; material: ShaderMaterial } }).country;
    country.relief.layers!.flush(recorder());
    fly();
    // Three of the tiles in view have a relief file; the rest keep the grid's normal.
    expect(reliefFlags(terrain).filter((f) => f > 0)).toHaveLength(3);
    expect(terrain.stats.relief).toBe(3);
    expect(w.fetched.filter((u) => u.startsWith("/r/")).sort()).toEqual(["/r/relief-a.webp", "/r/relief-b.webp", "/r/relief-c.webp"]);
    const u = country.material.uniforms;
    expect(u.uRelief!.value).toBe(country.relief.layers!.texture);
    expect(country.relief.layers!.texture.internalFormat).toBe("RGBA8"); // data, not sRGB
    expect(u.uReliefGain!.value).toBeCloseTo(DEFAULT_SCALE.verticalExaggeration * DEFAULT_SCALE.horizontalCompression);
    expect(u.uReliefFade!.value.y).toBeCloseTo(RELIEF_REACH.country!.goneM / DEFAULT_SCALE.horizontalCompression);
    expect(country.material.fragmentShader).toContain("reliefNormal");
    // A new scale re-derives the gain and the fade.
    const scale = { ...DEFAULT_SCALE, horizontalCompression: 4 };
    terrain.setScale(scale);
    expect(u.uReliefGain!.value).toBeCloseTo(reliefGain(scale));
    expect(u.uReliefFade!.value.y).toBeCloseTo(RELIEF_REACH.country!.goneM / 4);
  });

  it("is not compiled in without a relief", () => {
    const w = wire();
    const terrain = new Terrain({
      scale: { ...DEFAULT_SCALE },
      viewRadiusTiles: 1,
      layers: 16,
      source: new SyntheticTileSource(),
      colour: new ColourSource(colourIndex, "/c", w.fetch, w.decode, () => 0),
    });
    terrain.update(0.5 * TILE_M, 0.5 * TILE_M, 2000);
    expect(reliefFlags(terrain)).toEqual([]);
    for (const m of terrain.materials) expect(m.fragmentShader).not.toContain("reliefNormal");
  });
});

describe("the scene packs' relief", () => {
  const packs = JSON.parse(readFileSync("app/public/packs/index.json", "utf8")) as { scenes: { id: string; relief: number[] }[] };
  const { film } = loadFilm();

  it("lists, for every scene, each country tile within the relief's reach of where the camera can stand", () => {
    for (const [i, scene] of film.scenes.entries()) {
      const listed = new Set<number>();
      const flat = packs.scenes[i]!.relief;
      for (let k = 0; k < flat.length; k += 2) listed.add(tileKey(flat[k]!, flat[k + 1]!));
      const near = nearTiles(buildRail(scene.rail), TILE_M, RELIEF_REACH.country!.reachM);
      expect(listed.size, scene.id).toBeGreaterThan(0);
      for (const key of near) expect(listed.has(key), `${scene.id} ${key}`).toBe(true);
    }
  });
});
