/**
 * A world that arrives a tile at a time (F67).
 *
 * The engine was written against "samples if you have them, null if you do
 * not", and until now every source it flew answered at once. These are the
 * questions a source that does not answer at once raises: whether it asks
 * once, whether it asks again after a failure but not before, whether a
 * package that is not the world's own is refused, and whether the terrain and
 * the frame-cost capture can tell a tile on its way from one that is not
 * coming.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { TILE_SAMPLES } from "../../engine/src/terrain/tileArray.js";
import { deltaPlanes } from "../../engine/src/terrain/tileCodec.js";
import {
  StreamingTileSource,
  indexProblem,
  type TileIndex,
} from "../../engine/src/terrain/tileStream.js";
import {
  PackedTileSource,
  SyntheticTileSource,
  loadWorld,
  type WorldManifest,
} from "../../engine/src/terrain/tileSource.js";
import { Terrain } from "../../engine/src/terrain/terrain.js";
import { DEFAULT_SCALE } from "../../engine/src/sim/scale.js";

const STRIDE = TILE_SAMPLES * TILE_SAMPLES;
const W = { tx0: 10, ty0: 10, tx1: 13, ty1: 12 };
const SHA = "a".repeat(64);

function manifest(): WorldManifest {
  const tiles = (W.tx1 - W.tx0) * (W.ty1 - W.ty0);
  return {
    version: 1,
    corridor: "test",
    tileKm: 64,
    tileSamples: TILE_SAMPLES,
    country: { tilesX: 105, tilesY: 69, originXM: -3_456_000, originYM: 1_792_000 },
    window: { ...W },
    heights: { file: "heights.bin", tiles, tilesWithLand: tiles, bytes: tiles * STRIDE * 2, sha256: SHA },
    horizon: { file: "horizon.bin", width: 3, height: 2, sampleKm: 8, silhouetteBias: 0.6 },
    anchors: {},
    start: { eastM: 0, northM: 0, altitudeM: 1200, headingRad: 0 },
    elevationM: { min: 0, max: 0 },
  };
}

/** Six tiles: two share a file, one is zeros, the rest stamped with their place. */
function world(): { index: TileIndex; files: Map<string, Uint8Array>; tiles: Int16Array[] } {
  const tiles: Int16Array[] = [];
  const names: string[] = [];
  const files = new Map<string, Uint8Array>();
  for (let ty = W.ty0; ty < W.ty1; ty++) {
    for (let tx = W.tx0; tx < W.tx1; tx++) {
      const k = tiles.length;
      const tile = new Int16Array(STRIDE);
      if (k === 1) {
        names.push("");
      } else {
        // Tiles 4 and 5 are the same flat 1,044 m, as thirty of the country's are.
        const value = k >= 4 ? 1044 : ty * 100 + tx;
        tile.fill(value);
        tile[STRIDE - 1] = value + 7;
        const name = k >= 4 ? "flat" : `t${k}`;
        names.push(name);
        files.set(name, deltaPlanes(tile, TILE_SAMPLES));
      }
      tiles.push(tile);
    }
  }
  return {
    index: {
      version: 1,
      codec: "delta-planes-gzip",
      tileSamples: TILE_SAMPLES,
      heightsSha256: SHA,
      window: { ...W },
      order: "tile-row-major, ty ascending, then tx ascending",
      tiles: names.length,
      files: files.size,
      bytes: 0,
      names,
    },
    files,
    tiles,
  };
}

/** A fetch the test releases by hand, so "not yet" is a state it can look at. */
function gatedFetch(files: Map<string, Uint8Array>) {
  const asked: string[] = [];
  const waiting: (() => void)[] = [];
  let failNext = 0;
  const fetch = (url: string): Promise<Uint8Array> => {
    asked.push(url);
    const name = url.slice(url.lastIndexOf("/") + 1).replace(/\.bin$/, "");
    const fail = failNext > 0;
    if (fail) failNext--;
    return new Promise((resolve, reject) => {
      waiting.push(() => {
        const bytes = files.get(name);
        if (fail || !bytes) reject(new Error(`404 ${name}`));
        else resolve(bytes);
      });
    });
  };
  return {
    fetch,
    asked,
    failNext: (n: number) => (failNext = n),
    async release(): Promise<void> {
      for (const go of waiting.splice(0)) go();
      // Two turns of the queue: the fetch resolving, then the decode.
      for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    },
  };
}

describe("a streamed world", () => {
  it("answers null until a tile lands, then the tile it was asked for", async () => {
    const { index, files, tiles } = world();
    const net = gatedFetch(files);
    const source = new StreamingTileSource(manifest(), index, "/w/tiles", net.fetch);
    expect(source.request(10, 10)).toBeNull();
    expect(source.pending).toBe(1);
    expect(net.asked).toEqual(["/w/tiles/t0.bin"]);
    await net.release();
    expect(source.pending).toBe(0);
    expect(source.request(10, 10)).toEqual(tiles[0]);
    expect(source.request(12, 10)).toBeNull(); // its neighbour is its own file
  });

  it("asks once for a tile however many frames want it", async () => {
    const { index, files } = world();
    const net = gatedFetch(files);
    const source = new StreamingTileSource(manifest(), index, "/w/tiles", net.fetch);
    for (let frame = 0; frame < 5; frame++) source.request(10, 10);
    expect(net.asked.length).toBe(1);
  });

  it("fetches a file two tiles share once", async () => {
    const { index, files, tiles } = world();
    const net = gatedFetch(files);
    const source = new StreamingTileSource(manifest(), index, "/w/tiles", net.fetch);
    source.request(11, 11);
    source.request(12, 11);
    expect(net.asked).toEqual(["/w/tiles/flat.bin"]);
    await net.release();
    expect(source.request(11, 11)).toEqual(tiles[4]);
    expect(source.request(12, 11)).toEqual(tiles[5]);
    expect(source.held).toBe(1);
  });

  it("makes a tile of zeros itself rather than fetching it", () => {
    const { index, files } = world();
    const net = gatedFetch(files);
    const source = new StreamingTileSource(manifest(), index, "/w/tiles", net.fetch);
    expect(source.request(11, 10)).toEqual(new Int16Array(STRIDE));
    expect(net.asked).toEqual([]);
  });

  it("answers past its edge the way a packed world does", () => {
    const { index, files } = world();
    const net = gatedFetch(files);
    const bare = new StreamingTileSource(manifest(), index, "/w/tiles", net.fetch);
    expect(bare.request(9, 10)).toBeNull();
    expect(bare.has(9, 10)).toBe(false);
    const withFallback = new StreamingTileSource(
      manifest(),
      index,
      "/w/tiles",
      net.fetch,
      undefined,
      new SyntheticTileSource(),
    );
    expect(withFallback.request(0, 0)?.length).toBe(STRIDE);
    expect(net.asked).toEqual([]);
  });

  it("asks again after a failure, but only once the wait is over", async () => {
    const { index, files, tiles } = world();
    const net = gatedFetch(files);
    let now = 0;
    const source = new StreamingTileSource(manifest(), index, "/w/tiles", net.fetch, () => now);
    net.failNext(1);
    source.request(10, 10);
    await net.release();
    expect(source.stats.failures).toBe(1);
    expect(source.stats.lastError).toMatch(/404/);
    now = 1_999;
    expect(source.request(10, 10)).toBeNull();
    expect(net.asked.length).toBe(1);
    now = 2_000;
    source.request(10, 10);
    expect(net.asked.length).toBe(2);
    await net.release();
    expect(source.request(10, 10)).toEqual(tiles[0]);
  });

  it("refuses a package that is not this world's", () => {
    const { index } = world();
    const m = manifest();
    expect(indexProblem(m, index)).toBeNull();
    expect(indexProblem(m, { ...index, heightsSha256: "b".repeat(64) })).toMatch(/make package/);
    expect(indexProblem(m, { ...index, codec: "brotli" })).toMatch(/coded brotli/);
    expect(indexProblem(m, { ...index, window: { ...W, tx1: 14 } })).toMatch(/different window/);
    expect(indexProblem(m, { ...index, names: index.names.slice(1) })).toMatch(/5 names/);
    expect(
      () => new StreamingTileSource(m, { ...index, heightsSha256: "b".repeat(64) }, "/w/tiles"),
    ).toThrow(/make package/);
  });
});

describe("terrain over a streamed world", () => {
  it("says the view is on its way, then draws it", async () => {
    const { index, files } = world();
    const net = gatedFetch(files);
    const source = new StreamingTileSource(manifest(), index, "/w/tiles", net.fetch);
    const terrain = new Terrain({ scale: { ...DEFAULT_SCALE }, viewRadiusTiles: 1, layers: 64, source });
    const east = 11.5 * 64_000;
    const north = 10.5 * 64_000;
    terrain.update(east, north, 2000);
    // Nothing generated and nothing resident - which is what "settled" used
    // to mean to the frame-cost capture. `pending` is what says it is not.
    expect(terrain.stats.generatedThisFrame).toBe(1); // the tile of zeros
    expect(terrain.stats.pending).toBeGreaterThan(0);
    expect(terrain.groundElevationM(10.5 * 64_000, north)).toBeNull();
    await net.release();
    terrain.update(east, north, 2000);
    expect(terrain.stats.pending).toBe(0);
    expect(terrain.groundElevationM(10.5 * 64_000, north)).toBeCloseTo(1010, 0);
  });

  it("reports nothing pending for a world that arrived whole", () => {
    const m = manifest();
    const heights = new Int16Array(6 * STRIDE).fill(300);
    const terrain = new Terrain({
      scale: { ...DEFAULT_SCALE },
      viewRadiusTiles: 1,
      layers: 64,
      source: new PackedTileSource(m, heights),
    });
    terrain.update(11.5 * 64_000, 10.5 * 64_000, 2000);
    expect(terrain.stats.pending).toBe(0);
    expect(terrain.groundElevationM(11.5 * 64_000, 10.5 * 64_000)).toBeCloseTo(300, 3);
  });
});

describe("loading a world", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function serve(routes: Record<string, unknown>) {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      const body = routes[url];
      if (body === undefined) return new Response("<!doctype html>", { status: 404 });
      if (body instanceof Uint8Array) return new Response(body.slice());
      return new Response(JSON.stringify(body));
    });
    return asked;
  }

  const horizon = new Uint8Array(3 * 2 * 2);

  it("streams when the world has a package, and never fetches heights.bin", async () => {
    const { index } = world();
    const asked = serve({
      "/w/manifest.json": manifest(),
      "/w/horizon.bin": horizon,
      "/w/tiles/index.json": index,
    });
    const loaded = (await loadWorld("/w"))!;
    expect(loaded.delivery.kind).toBe("streamed");
    expect(loaded.source).toBeInstanceOf(StreamingTileSource);
    expect(asked).not.toContain("/w/heights.bin");
  });

  it("fetches heights.bin when there is no package, as it always did", async () => {
    const heights = new Uint8Array(6 * STRIDE * 2);
    serve({ "/w/manifest.json": manifest(), "/w/horizon.bin": horizon, "/w/heights.bin": heights });
    const loaded = (await loadWorld("/w"))!;
    expect(loaded.delivery).toEqual({
      kind: "packed",
      bytes: heights.length,
      refused: null,
      horizonBytes: horizon.length,
    });
    expect(loaded.source).toBeInstanceOf(PackedTileSource);
  });

  /** A package whose index names a coded horizon field, and the manifest that agrees. */
  function withHorizon() {
    const field = Int16Array.from([100, 200, 300, 4_000, 5_000, 6_000]);
    const coded = deltaPlanes(field, 3, 2);
    const HSHA = "c".repeat(64);
    const m = manifest();
    m.horizon.sha256 = HSHA;
    const { index } = world();
    const packed = { ...index, horizon: { name: "hz", width: 3, height: 2, sha256: HSHA, bytes: coded.length } };
    return { field, coded, m, packed };
  }

  it("fetches the horizon field the package names, coded, and not horizon.bin", async () => {
    const { field, coded, m, packed } = withHorizon();
    const asked = serve({
      "/w/manifest.json": m,
      "/w/tiles/index.json": packed,
      "/w/tiles/hz.bin": coded,
    });
    const loaded = (await loadWorld("/w"))!;
    expect(loaded.horizon).toEqual(field);
    expect(loaded.delivery.horizonBytes).toBe(coded.length);
    expect(asked).not.toContain("/w/horizon.bin");
  });

  it("fetches horizon.bin when the package's field is not the manifest's", async () => {
    const { m, packed } = withHorizon();
    const asked = serve({
      "/w/manifest.json": m,
      "/w/tiles/index.json": { ...packed, horizon: { ...packed.horizon, sha256: "d".repeat(64) } },
      "/w/horizon.bin": horizon,
    });
    const loaded = (await loadWorld("/w"))!;
    expect(loaded.delivery.kind).toBe("streamed");
    expect(loaded.delivery.horizonBytes).toBe(horizon.length);
    expect(asked).not.toContain("/w/tiles/hz.bin");
  });

  it("falls back to horizon.bin when the coded field will not come", async () => {
    const { m, packed } = withHorizon();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const asked = serve({
      "/w/manifest.json": m,
      "/w/tiles/index.json": packed,
      "/w/horizon.bin": horizon,
    });
    const loaded = (await loadWorld("/w"))!;
    expect(asked).toContain("/w/tiles/hz.bin");
    expect(loaded.horizon).toEqual(new Int16Array(6));
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("refuses a stale package and flies the file it was cut from", async () => {
    const { index } = world();
    const heights = new Uint8Array(6 * STRIDE * 2);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    serve({
      "/w/manifest.json": manifest(),
      "/w/horizon.bin": horizon,
      "/w/tiles/index.json": { ...index, heightsSha256: "b".repeat(64) },
      "/w/heights.bin": heights,
    });
    const loaded = (await loadWorld("/w"))!;
    expect(loaded.delivery.kind).toBe("packed");
    expect(loaded.delivery.refused).toMatch(/make package/);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
