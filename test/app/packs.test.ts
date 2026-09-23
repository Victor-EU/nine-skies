/**
 * The scene packs at run time: a tile comes from the pack that holds it,
 * a pack comes once and one at a time, and a tile no pack holds is fetched
 * on its own and counted - unless it is the horizon, which is meant to be.
 */
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { ScenePacks, type PackIndex } from "../../app/src/packs.js";
import { colourFile, writePack } from "../../engine/src/film/pack.js";
import type { ColourIndex } from "../../engine/src/terrain/colour.js";
import { HeroCover, type HeroManifest } from "../../engine/src/terrain/heroSource.js";
import { HERO_TILE_SAMPLES } from "../../engine/src/terrain/tileArray.js";
import { deltaPlanes } from "../../engine/src/terrain/tileCodec.js";
import type { TileIndex } from "../../engine/src/terrain/tileStream.js";

const SHA = "heights";
/** A 4 x 1 window: tiles (0,0) to (3,0), each its own file, one of them the horizon's neighbour. */
const tileIndex = {
  version: 1,
  codec: "delta-planes-gzip",
  tileSamples: 65,
  heightsSha256: SHA,
  window: { tx0: 0, ty0: 0, tx1: 4, ty1: 1 },
  order: "row-major",
  tiles: 4,
  files: 4,
  bytes: 0,
  names: ["t0", "t1", "t2", "t3"],
  horizon: { name: "hz", width: 1, height: 1, sha256: "", bytes: 0 },
} as unknown as TileIndex;

const SAMPLES = HERO_TILE_SAMPLES;
const heroManifest: HeroManifest = {
  version: 1,
  area: "gorge",
  name: "gorge",
  resolutionM: 90,
  tileM: 90 * (SAMPLES - 1),
  tileSamples: SAMPLES,
  silhouetteBias: 0.4,
  window: { hx0: 0, hy0: 0, hx1: 1, hy1: 1 },
  origin: { originXM: 0, originYM: 0 },
  countryTiles: [],
  holds: [],
  heights: { file: "gorge.bin", tiles: 1, bytes: SAMPLES * SAMPLES * 2, sha256: "" },
  boundary: {},
  elevationM: { min: 7, max: 7 },
};

function world(heroInPack: boolean) {
  const heights = new Int16Array(SAMPLES * SAMPLES).fill(7);
  const packs: Record<string, Uint8Array> = {
    "/packs/a.bin": writePack("a", SHA, [{ name: "t0", bytes: new Uint8Array([10]) }, { name: "t1", bytes: new Uint8Array([11]) }], heroInPack ? { dir: "hero", area: "gorge", heights: new Uint8Array(gzipSync(deltaPlanes(heights, SAMPLES, SAMPLES))), water: null } : null),
    "/packs/b.bin": writePack(
      "b",
      SHA,
      [
        { name: "t2", bytes: new Uint8Array([12]) },
        { name: colourFile("c2"), bytes: new Uint8Array([22]) },
      ],
      null,
    ),
  };
  const index: PackIndex = {
    version: 1,
    world: "test",
    heightsSha256: SHA,
    totalBytes: 0,
    scenes: [
      { id: "a", file: "packs/a.bin", bytes: 0, tiles: [0, 0, 1, 0], hero: heroInPack ? { dir: "hero", area: "gorge", bytes: 0 } : null },
      { id: "b", file: "packs/b.bin", bytes: 0, tiles: [2, 0], hero: null },
    ],
  };
  const calls: string[] = [];
  const fetch = async (url: string): Promise<Uint8Array> => {
    calls.push(url);
    const body = packs[url] ?? (url.startsWith("/world/tiles/") ? new Uint8Array([99]) : undefined);
    if (!body) throw new Error(`${url}: 404`);
    return body;
  };
  const cover = new HeroCover(
    { version: 1, resolutionM: 90, tileM: heroManifest.tileM, tileSamples: SAMPLES, origin: heroManifest.origin, areas: [{ id: "gorge", name: "gorge", file: "gorge.json", window: heroManifest.window, bytes: 0 }] },
    [],
    [heroManifest],
  );
  const colour = {
    country: { "2_0": "c2", "3_0": "c3" },
    hero: {},
  } as unknown as ColourIndex;
  const store = new ScenePacks(index, "", "/world", fetch);
  store.attach(tileIndex, [cover], colour);
  return { store, calls, cover, packs };
}

describe("the scene packs at run time", () => {
  it("answers a tile from its pack, fetching the pack once and the tile never", async () => {
    const { store, calls } = world(false);
    const [a, b] = await Promise.all([store.fetchTile("/world/tiles/t0.bin"), store.fetchTile("/world/tiles/t1.bin")]);
    expect([a[0], b[0]]).toEqual([10, 11]);
    expect(calls).toEqual(["/packs/a.bin"]);
    expect(store.stats.misses).toBe(0);
  });

  it("fetches the playing scene's pack first and the next one after it, one at a time", async () => {
    const { store, calls } = world(false);
    store.play(0);
    expect(calls).toEqual(["/packs/a.bin"]);
    await store.fetchTile("/world/tiles/t2.bin");
    expect(calls).toEqual(["/packs/a.bin", "/packs/b.bin"]);
    expect(store.isSettled(0) && store.isSettled(1)).toBe(true);
  });

  it("fetches a tile no pack holds on its own, and counts it unless it is the horizon", async () => {
    const { store, calls } = world(false);
    await store.fetchTile("/world/tiles/hz.bin");
    expect(store.stats.misses).toBe(0);
    await store.fetchTile("/world/tiles/t3.bin");
    expect(store.stats.misses).toBe(1);
    expect(store.stats.missNames).toEqual(["t3"]);
    expect(calls).toEqual(["/world/tiles/hz.bin", "/world/tiles/t3.bin"]);
  });

  it("falls back to the tile when its pack will not come, and says so", async () => {
    const { store, packs } = world(false);
    delete packs["/packs/a.bin"];
    const got = await store.fetchTile("/world/tiles/t0.bin");
    expect(got[0]).toBe(99);
    expect(store.stats.failed).toBe(1);
    expect(store.stats.misses).toBe(1);
  });

  it("answers a tile's colour from the pack that holds the tile (F87)", async () => {
    const { store, calls } = world(false);
    const got = await store.fetchTile("/world/colour/files/c2.webp");
    expect(got[0]).toBe(22);
    expect(calls).toEqual(["/packs/b.bin"]);
    expect(store.stats.misses).toBe(0);
  });

  it("hands its scene's hero area to the cover, which draws it from then on", async () => {
    const { store, cover } = world(true);
    expect(cover.request(0, 0)).toBeNull();
    await store.fetchTile("/world/tiles/t0.bin");
    expect(cover.awaitingAreas).toEqual([]);
    expect(cover.request(0, 0)![0]).toBe(7);
  });
});
