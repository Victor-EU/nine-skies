/**
 * The walls' rock (F92): a world's index of photographed faces, one face
 * loaded at a time, sized to the grid it lies on, named by every palette
 * the film uses, and laid on a terrain's walls when its scene's palette
 * names it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Texture, Vector3, Vector4 } from "three";
import { ColourSource, type ColourImage, type ColourIndex } from "../../engine/src/terrain/colour.js";
import {
  ROCK_INDEX_VERSION,
  RockFaces,
  loadRockIndex,
  rockAcrossM,
  rockProblem,
  type RockIndex,
} from "../../engine/src/terrain/rock.js";
import { DEFAULT_PALETTE } from "../../engine/src/terrain/palette.js";
import { PALETTE_PRESETS, scenePalette } from "../../engine/src/look/presets.js";
import { Terrain } from "../../engine/src/terrain/terrain.js";
import { SyntheticTileSource } from "../../engine/src/terrain/tileSource.js";
import { DEFAULT_SCALE } from "../../engine/src/sim/scale.js";

const face = (name: string) => ({
  name,
  scan: `${name}_scan`,
  title: name,
  url: `https://polyhaven.com/a/${name}_scan`,
  authors: ["someone"],
  acrossM: 5,
  samples: 1024,
  albedo: `${name}-aaaa.webp`,
  normal: `${name}-normal-bbbb.webp`,
  meanLinear: [0.4, 0.3, 0.2] as [number, number, number],
});

const index: RockIndex = {
  version: ROCK_INDEX_VERSION,
  source: "Poly Haven",
  licence: "CC0 1.0",
  licenceUrl: "https://polyhaven.com/license",
  rocks: [face("granite"), face("limestone")],
};

/** A network that answers when told to, and a decoder that makes an image of anything. */
function wire() {
  const fetched: string[] = [];
  const pending: Array<() => void> = [];
  const fetch = (url: string) =>
    new Promise<Uint8Array>((resolve) => {
      fetched.push(url);
      pending.push(() => resolve(new TextEncoder().encode(url)));
    });
  const decode = async (): Promise<ColourImage> => ({ width: 4, height: 4, source: new Uint8Array(64), close: () => {} });
  const settle = async () => {
    for (const release of pending.splice(0)) release();
    for (let k = 0; k < 6; k++) await Promise.resolve();
  };
  return { fetch, decode, fetched, settle };
}

describe("the rock index", () => {
  it("is taken as it comes when it is whole", () => {
    expect(rockProblem(index)).toBeNull();
  });

  it("is passed over when it is another version, or a face lacks its files or its mean", () => {
    expect(rockProblem({ ...index, version: 2 })).toMatch(/version/);
    expect(rockProblem({ ...index, rocks: [{ ...face("granite"), normal: "" }] })).toMatch(/no files/);
    expect(rockProblem({ ...index, rocks: [{ ...face("granite"), meanLinear: [0.4, 0, 0.2] }] })).toMatch(/mean/);
  });

  it("loads, or is null when absent or unreadable", async () => {
    const bytes = (value: unknown) => async () => new TextEncoder().encode(JSON.stringify(value));
    expect(await loadRockIndex("/rock/index.json", bytes(index))).toEqual(index);
    expect(await loadRockIndex("/rock/index.json", bytes({ ...index, version: 9 }))).toBeNull();
    expect(
      await loadRockIndex("/rock/index.json", async () => {
        throw new Error("404");
      }),
    ).toBeNull();
  });
});

describe("the rock faces", () => {
  it("loads a face's colour and normals once, and counts as pending while it does", async () => {
    const w = wire();
    const faces = new RockFaces(index, "/world/china/rock", w.fetch, w.decode);
    const first = faces.face("granite");
    expect(faces.pending).toBe(true);
    expect(faces.face("granite")).toBe(first); // asked twice, fetched once
    await w.settle();
    const granite = await first;
    expect(faces.pending).toBe(false);
    expect(w.fetched).toEqual(["/world/china/rock/granite-aaaa.webp", "/world/china/rock/granite-normal-bbbb.webp"]);
    expect(granite?.entry.name).toBe("granite");
    expect(granite?.albedo.colorSpace).toBe("srgb");
    expect(granite?.normal.colorSpace).toBe("");
    expect(await faces.face("granite")).toBe(granite);
    expect(w.fetched).toHaveLength(2);
  });

  it("holds one face at a time, letting the last go once the next has loaded", async () => {
    const w = wire();
    const faces = new RockFaces(index, "/r", w.fetch, w.decode);
    const granite = faces.face("granite");
    await w.settle();
    const held = (await granite)!;
    const disposed: string[] = [];
    held.albedo.addEventListener("dispose", () => disposed.push("albedo"));
    held.normal.addEventListener("dispose", () => disposed.push("normal"));
    const limestone = faces.face("limestone");
    expect(disposed).toEqual([]); // still drawn while the next is on its way
    await w.settle();
    expect((await limestone)?.entry.name).toBe("limestone");
    expect(disposed).toEqual(["albedo", "normal"]);
  });

  it("answers null for a name the world has no face for", async () => {
    const w = wire();
    const faces = new RockFaces(index, "/r", w.fetch, w.decode);
    expect(await faces.face("basalt")).toBeNull();
    expect(faces.pending).toBe(false);
    expect(w.fetched).toEqual([]);
  });

  it("is sized to the relief its grid can draw: 17 samples, and never over 1.5 km", () => {
    expect(rockAcrossM(30)).toBe(510);
    expect(rockAcrossM(90)).toBe(1_530);
    expect(rockAcrossM(1_000)).toBe(1_536);
  });
});

describe("the palettes' faces", () => {
  it("are named for every scene, and only faces the pipeline cuts", () => {
    const cut = [...readFileSync("pipeline/nineskies/rock.py", "utf8").matchAll(/Rock\("([a-z]+)", "[a-z_0-9]+"\)/g)].map(
      (m) => m[1],
    );
    expect(cut).toEqual(["limestone", "granite", "dark", "sediment"]);
    const used = readdirSync("content/scenes")
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => /^\s*palette:\s*(\S+)/m.exec(readFileSync(`content/scenes/${f}`, "utf8"))![1]!);
    expect(used).toHaveLength(9);
    for (const name of used) expect(cut, name).toContain(scenePalette(PALETTE_PRESETS[name]!, 30).rockFace);
    for (const preset of Object.values(PALETTE_PRESETS)) if (preset.face) expect(cut).toContain(preset.face);
  });
});

describe("a terrain's walls", () => {
  const colourIndex: ColourIndex = {
    version: 1,
    codec: "webp",
    cells: 256,
    samples: 257,
    rows: "north to south",
    source: { layer: "s2cloudless_3857", year: 2016, attribution: "EOX", licence: "CC BY 4.0", licenceUrl: "" },
    country: {},
    hero: {},
  };

  it("are laid with the face the scene's palette names, once it has loaded, and cleared by one naming none", async () => {
    const w = wire();
    const terrain = new Terrain({
      scale: { ...DEFAULT_SCALE },
      viewRadiusTiles: 1,
      layers: 16,
      source: new SyntheticTileSource(),
      colour: new ColourSource(colourIndex, "/c", w.fetch, w.decode, () => 0),
      rock: new RockFaces(index, "/r", w.fetch, w.decode),
    });
    terrain.setScale({ ...DEFAULT_SCALE });
    const material = terrain.materials[0]!;
    const u = material.uniforms;
    const wall = () => (u.uWall!.value as Vector4).w;
    expect(wall()).toBe(0);
    // A country tile is 64 km: 1,536 m faces, 42 to a tile.
    expect(u.uRockAcross!.value).toBeCloseTo(1_536 / DEFAULT_SCALE.horizontalCompression, 6);

    terrain.setPalette({ ...DEFAULT_PALETTE, rockFace: "granite" });
    terrain.update(0, 0, 2000);
    expect(terrain.stats.colourPending).toBeGreaterThan(0); // a still waits for the face
    expect(wall()).toBe(0);
    await w.settle();
    terrain.update(0, 0, 2000);
    expect(wall()).toBe(1);
    expect((u.uRockAlbedo!.value as Texture).colorSpace).toBe("srgb");
    expect((u.uRockMean!.value as Vector3).toArray()).toEqual([0.4, 0.3, 0.2]);
    expect(material.fragmentShader).toContain("uRockAlbedo");

    terrain.setPalette({ ...DEFAULT_PALETTE, rockFace: null });
    expect(wall()).toBe(0);
  });

  it("keep the palette's veil in a world with no faces", () => {
    const terrain = new Terrain({
      scale: { ...DEFAULT_SCALE },
      viewRadiusTiles: 1,
      layers: 16,
      source: new SyntheticTileSource(),
      colour: new ColourSource(colourIndex, "/c", wire().fetch, wire().decode, () => 0),
    });
    terrain.setPalette({ ...DEFAULT_PALETTE, rockFace: "granite" });
    expect((terrain.materials[0]!.uniforms.uWall!.value as Vector4).w).toBe(0);
  });
});
